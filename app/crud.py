from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .calculations import DEFAULT_YEAR_SETTINGS


def get_jobs(db: Session, include_ended: bool = True) -> list[models.Job]:
    stmt = select(models.Job).order_by(models.Job.start_date)
    jobs = list(db.scalars(stmt))
    if not include_ended:
        jobs = [j for j in jobs if j.end_date is None]
    return jobs


def get_job(db: Session, job_id: int) -> models.Job | None:
    return db.get(models.Job, job_id)


def create_job(db: Session, data: dict) -> models.Job:
    job = models.Job(**data)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def update_job(db: Session, job: models.Job, data: dict) -> models.Job:
    # data pochodzi z JobUpdate.model_dump(exclude_unset=True) - zawiera
    # tylko pola faktycznie przesłane przez klienta, więc jawny null (np.
    # wyczyszczenie daty zakończenia albo stawki) trzeba też zapisać.
    for key, value in data.items():
        setattr(job, key, value)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job: models.Job) -> None:
    db.delete(job)
    db.commit()


def get_entries(db: Session, year: int | None = None, job_id: int | None = None) -> list[models.MonthlyEntry]:
    stmt = select(models.MonthlyEntry)
    if year is not None:
        stmt = stmt.where(models.MonthlyEntry.year == year)
    if job_id is not None:
        stmt = stmt.where(models.MonthlyEntry.job_id == job_id)
    stmt = stmt.order_by(models.MonthlyEntry.year, models.MonthlyEntry.month)
    return list(db.scalars(stmt))


def get_entry(db: Session, entry_id: int) -> models.MonthlyEntry | None:
    return db.get(models.MonthlyEntry, entry_id)


def get_distinct_years(db: Session) -> list[int]:
    entry_years = set(db.scalars(select(models.MonthlyEntry.year)))
    fee_years = set(db.scalars(select(models.MonthlyB2BFees.year)))
    return sorted(entry_years | fee_years)


def upsert_entry(db: Session, data: dict) -> models.MonthlyEntry:
    stmt = select(models.MonthlyEntry).where(
        models.MonthlyEntry.job_id == data["job_id"],
        models.MonthlyEntry.year == data["year"],
        models.MonthlyEntry.month == data["month"],
    )
    entry = db.scalars(stmt).first()
    if entry is None:
        entry = models.MonthlyEntry(**data)
        db.add(entry)
    else:
        for key, value in data.items():
            setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, entry: models.MonthlyEntry) -> None:
    db.delete(entry)
    db.commit()


def propagate_hourly_rate(db: Session, job_id: int, year: int, month: int, hourly_rate: float) -> int:
    """Nadpisuje stawkę/h (i przelicza przychód netto) we wszystkich ISTNIEJĄCYCH
    wpisach danej pracy PO podanym miesiącu (wcześniejsze zostają bez zmian),
    oraz ustawia nową stawkę domyślną dla przyszłych, jeszcze nieutworzonych wpisów."""
    job = db.get(models.Job, job_id)
    if job is not None:
        job.default_hourly_rate = hourly_rate

    stmt = select(models.MonthlyEntry).where(
        models.MonthlyEntry.job_id == job_id,
        (models.MonthlyEntry.year > year)
        | ((models.MonthlyEntry.year == year) & (models.MonthlyEntry.month > month)),
    )
    future_entries = list(db.scalars(stmt))
    for entry in future_entries:
        entry.hourly_rate = hourly_rate
        if entry.hours is not None:
            entry.net_revenue = round(entry.hours * hourly_rate, 2)

    db.commit()
    return len(future_entries)


def get_b2b_fees_for_year(db: Session, year: int) -> list[models.MonthlyB2BFees]:
    stmt = select(models.MonthlyB2BFees).where(models.MonthlyB2BFees.year == year).order_by(models.MonthlyB2BFees.month)
    return list(db.scalars(stmt))


def get_all_b2b_fees(db: Session) -> list[models.MonthlyB2BFees]:
    stmt = select(models.MonthlyB2BFees)
    return list(db.scalars(stmt))


def get_b2b_fees(db: Session, year: int, month: int) -> models.MonthlyB2BFees | None:
    return db.get(models.MonthlyB2BFees, {"year": year, "month": month})


def upsert_b2b_fees(db: Session, data: dict) -> models.MonthlyB2BFees:
    existing = db.get(models.MonthlyB2BFees, {"year": data["year"], "month": data["month"]})
    if existing is None:
        existing = models.MonthlyB2BFees(**data)
        db.add(existing)
    else:
        for key, value in data.items():
            setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


def total_invoiced_b2b_revenue(db: Session, year: int, month: int) -> float:
    stmt = (
        select(models.MonthlyEntry)
        .join(models.Job)
        .where(
            models.Job.type == models.JobType.B2B,
            models.MonthlyEntry.year == year,
            models.MonthlyEntry.month == month,
            models.MonthlyEntry.invoiced.is_(True),
        )
    )
    return sum(e.net_revenue for e in db.scalars(stmt))


def has_active_uop(db: Session, year: int, month: int) -> bool:
    from datetime import date

    month_start = date(year, month, 1)
    month_end = date(year + (month // 12), (month % 12) + 1, 1)
    stmt = select(models.Job).where(
        models.Job.type == models.JobType.UOP,
        models.Job.start_date < month_end,
        (models.Job.end_date.is_(None)) | (models.Job.end_date >= month_start),
    )
    return db.scalars(stmt).first() is not None


def any_active_vat_payer(db: Session, year: int, month: int) -> bool:
    from datetime import date

    month_start = date(year, month, 1)
    month_end = date(year + (month // 12), (month % 12) + 1, 1)
    stmt = select(models.Job).where(
        models.Job.type == models.JobType.B2B,
        models.Job.vat_payer.is_(True),
        models.Job.start_date < month_end,
        (models.Job.end_date.is_(None)) | (models.Job.end_date >= month_start),
    )
    return db.scalars(stmt).first() is not None


def get_year_settings(db: Session, year: int) -> models.YearSettings:
    settings = db.get(models.YearSettings, year)
    if settings is not None:
        return settings

    stmt = (
        select(models.YearSettings)
        .where(models.YearSettings.year < year)
        .order_by(models.YearSettings.year.desc())
    )
    previous = db.scalars(stmt).first()
    if previous is not None:
        values = dict(
            zus_spoleczny_monthly=previous.zus_spoleczny_monthly,
            zus_spoleczny_with_uop_monthly=previous.zus_spoleczny_with_uop_monthly,
            zus_zdrowotna_rate=previous.zus_zdrowotna_rate,
            zus_zdrowotna_min=previous.zus_zdrowotna_min,
            pit_mode=previous.pit_mode,
            pit_rate=previous.pit_rate,
            pit_fixed_amount=previous.pit_fixed_amount,
            vat_rate=previous.vat_rate,
        )
    else:
        values = dict(DEFAULT_YEAR_SETTINGS)

    settings = models.YearSettings(year=year, **values)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_year_settings(db: Session, year: int, data: dict) -> models.YearSettings:
    settings = get_year_settings(db, year)
    for key, value in data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


def list_year_settings(db: Session) -> list[models.YearSettings]:
    stmt = select(models.YearSettings).order_by(models.YearSettings.year)
    return list(db.scalars(stmt))
