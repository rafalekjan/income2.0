from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..calculations import DEFAULT_YEAR_SETTINGS
from ..database import get_db
from ..models import JobType

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _monthly_totals(db: Session):
    """dict[(year, month)] -> {uop, b2b, vat_collected, by_job}.

    Wszystko - przychód (UoP i B2B), VAT należny oraz opłaty ZUS/PIT/VAT -
    liczy się do jednego, tego samego miesiąca pracy/faktury. Żadnego
    przesunięcia między miesiącami.
    """
    entries = crud.get_entries(db)
    jobs = {j.id: j for j in crud.get_jobs(db)}
    settings_by_year = {s.year: s for s in crud.list_year_settings(db)}
    default_vat_rate = DEFAULT_YEAR_SETTINGS["vat_rate"]

    totals: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"uop": 0.0, "b2b": 0.0, "vat_collected": 0.0, "by_job": defaultdict(float)}
    )

    for e in entries:
        job = jobs.get(e.job_id)
        if job is None:
            continue
        key = (e.year, e.month)
        if job.type == JobType.UOP:
            totals[key]["uop"] += e.net_revenue
            totals[key]["by_job"][job.id] += e.net_revenue
        elif e.invoiced:
            totals[key]["b2b"] += e.net_revenue
            totals[key]["by_job"][job.id] += e.net_revenue
            if job.vat_payer:
                vat_rate = settings_by_year[e.year].vat_rate if e.year in settings_by_year else default_vat_rate
                totals[key]["vat_collected"] += e.net_revenue * vat_rate

    return totals, jobs


def _yearly_expenses(db: Session) -> dict[int, float]:
    transfer_names = set(crud.get_transfer_category_names(db))
    totals: dict[int, float] = defaultdict(float)
    for e in crud.get_all_expenses(db):
        if e.name in transfer_names:
            continue
        totals[e.year] += e.amount
    return totals


def _monthly_expenses(db: Session) -> dict[tuple[int, int], float]:
    transfer_names = set(crud.get_transfer_category_names(db))
    totals: dict[tuple[int, int], float] = defaultdict(float)
    for e in crud.get_all_expenses(db):
        if e.name in transfer_names:
            continue
        totals[(e.year, e.month)] += e.amount
    return totals


@router.get("/summary", response_model=list[schemas.YearSummary])
def summary(db: Session = Depends(get_db)):
    totals, jobs = _monthly_totals(db)
    fees = {(f.year, f.month): f for f in crud.get_all_b2b_fees(db)}
    expenses_by_year = _yearly_expenses(db)

    years = sorted({y for (y, _m) in totals} | {y for (y, _m) in fees} | set(expenses_by_year))
    result = []
    for year in years:
        months_with_data = {m for (y, m) in totals if y == year}
        total_uop = total_b2b = total_vat_collected = total_zus = total_pit = total_vat = 0.0
        unpaid_zus = unpaid_pit = unpaid_vat = 0.0
        by_job_totals: dict[int, float] = defaultdict(float)

        for month in months_with_data:
            month_totals = totals[(year, month)]
            total_uop += month_totals["uop"]
            total_b2b += month_totals["b2b"]
            total_vat_collected += month_totals["vat_collected"]
            for job_id, amount in month_totals["by_job"].items():
                by_job_totals[job_id] += amount

        for month in range(1, 13):
            fee = fees.get((year, month))
            if fee is None:
                continue
            # Opłata w danym miesiącu dotyczy pracy/faktury z TEGO SAMEGO
            # miesiąca - liczy się dopiero gdy jest jakaś zafakturowana
            # sprzedaż B2B w tym miesiącu.
            if totals.get((year, month), {}).get("b2b", 0.0) <= 0:
                continue
            total_zus += fee.zus_amount
            total_pit += fee.pit_amount
            total_vat += fee.vat_amount
            if not fee.zus_paid:
                unpaid_zus += fee.zus_amount
            if not fee.pit_paid:
                unpaid_pit += fee.pit_amount
            if not fee.vat_paid:
                unpaid_vat += fee.vat_amount

        # VAT należny (pobrany od klienta razem z fakturą) wpływa na konto,
        # a VAT faktycznie zapłacony do US może być niższy (np. dzięki
        # odliczeniom z kosztów) - różnica zostaje jako realny dochód.
        total_real_income = total_uop + total_b2b + total_vat_collected - total_zus - total_pit - total_vat

        by_job = [
            schemas.JobYearBreakdown(
                job_id=job_id,
                job_name=jobs[job_id].name,
                job_type=jobs[job_id].type,
                total_real_income=total,
            )
            for job_id, total in by_job_totals.items()
        ]

        result.append(
            schemas.YearSummary(
                year=year,
                total_real_income=round(total_real_income, 2),
                avg_monthly_income=round(total_real_income / len(months_with_data), 2) if months_with_data else 0.0,
                months_with_data=len(months_with_data),
                total_uop=round(total_uop, 2),
                total_b2b_revenue=round(total_b2b, 2),
                total_zus=round(total_zus, 2),
                total_pit=round(total_pit, 2),
                total_vat=round(total_vat, 2),
                unpaid_zus=round(unpaid_zus, 2),
                unpaid_pit=round(unpaid_pit, 2),
                unpaid_vat=round(unpaid_vat, 2),
                total_expenses=round(expenses_by_year.get(year, 0.0), 2),
                by_job=by_job,
            )
        )

    return result


@router.get("/monthly-series", response_model=list[schemas.MonthPoint])
def monthly_series(db: Session = Depends(get_db)):
    totals, _jobs = _monthly_totals(db)
    fees = {(f.year, f.month): f for f in crud.get_all_b2b_fees(db)}
    expenses_by_month = _monthly_expenses(db)

    keys = sorted(set(totals) | set(expenses_by_month))
    points = []
    for year, month in keys:
        t = totals.get((year, month), {"uop": 0.0, "b2b": 0.0, "vat_collected": 0.0})
        fee = fees.get((year, month))
        has_invoice = t["b2b"] > 0
        zus = fee.zus_amount if (fee and has_invoice) else 0.0
        pit = fee.pit_amount if (fee and has_invoice) else 0.0
        vat = fee.vat_amount if (fee and has_invoice) else 0.0
        total_real_income = t["uop"] + t["b2b"] + t["vat_collected"] - zus - pit - vat
        points.append(
            schemas.MonthPoint(
                year=year,
                month=month,
                total_real_income=round(total_real_income, 2),
                total_uop=round(t["uop"], 2),
                total_b2b_revenue=round(t["b2b"], 2),
                zus_amount=round(zus, 2),
                pit_amount=round(pit, 2),
                vat_amount=round(vat, 2),
                expenses_amount=round(expenses_by_month.get((year, month), 0.0), 2),
            )
        )
    return points
