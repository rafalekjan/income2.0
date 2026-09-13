import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class JobType(str, enum.Enum):
    UOP = "UOP"
    B2B = "B2B"


class PitMode(str, enum.Enum):
    PERCENT = "percent"
    FIXED = "fixed"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[JobType] = mapped_column(Enum(JobType))
    default_hourly_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    vat_payer: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Część umów B2B ma stałą kwotę miesięczną zamiast rozliczenia godzinowego.
    # Jeśli ustawione, w Wpisach godziny/stawka są nieaktywne, a przychód netto
    # podpowiada się automatycznie tą kwotą.
    fixed_monthly_net: Mapped[float | None] = mapped_column(Float, nullable=True)

    entries: Mapped[list["MonthlyEntry"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class MonthlyEntry(Base):
    """Miesięczny wpis pojedynczej pracy: godziny/stawka/przychód (B2B) albo
    kwota przelewu (UoP). Opłaty ZUS/PIT/VAT NIE są tu trzymane - księgowa
    rozlicza je sumarycznie dla wszystkich prac B2B naraz, patrz MonthlyB2BFees."""

    __tablename__ = "monthly_entries"
    __table_args__ = (UniqueConstraint("job_id", "year", "month", name="uq_job_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)

    hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    hourly_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_revenue: Mapped[float] = mapped_column(Float, default=0.0)
    invoiced: Mapped[bool] = mapped_column(Boolean, default=False)

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    job: Mapped["Job"] = relationship(back_populates="entries")


class MonthlyB2BFees(Base):
    """Opłaty ZUS/PIT/VAT za dany miesiąc, wspólne dla wszystkich prac B2B
    (tak jak księgowa rozlicza je w jednej sumie, niezależnie od liczby umów)."""

    __tablename__ = "monthly_b2b_fees"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[int] = mapped_column(Integer, primary_key=True)

    zus_amount: Mapped[float] = mapped_column(Float, default=0.0)
    zus_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    pit_amount: Mapped[float] = mapped_column(Float, default=0.0)
    pit_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    vat_amount: Mapped[float] = mapped_column(Float, default=0.0)
    vat_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class YearSettings(Base):
    __tablename__ = "year_settings"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)

    # ZUS społeczny: pełna kwota, oraz kwota gdy w danym miesiącu istnieje
    # równoległa aktywna praca UoP (zbieg tytułów do ubezpieczeń - wtedy ZUS
    # społeczny od B2B zwykle nie jest należny, domyślnie 0).
    zus_spoleczny_monthly: Mapped[float] = mapped_column(Float, default=1600.0)
    zus_spoleczny_with_uop_monthly: Mapped[float] = mapped_column(Float, default=0.0)

    zus_zdrowotna_rate: Mapped[float] = mapped_column(Float, default=0.049)
    zus_zdrowotna_min: Mapped[float] = mapped_column(Float, default=314.96)

    pit_mode: Mapped[PitMode] = mapped_column(
        Enum(PitMode, values_callable=lambda obj: [e.value for e in obj]), default=PitMode.PERCENT
    )
    pit_rate: Mapped[float] = mapped_column(Float, default=0.19)
    pit_fixed_amount: Mapped[float] = mapped_column(Float, default=0.0)

    vat_rate: Mapped[float] = mapped_column(Float, default=0.23)
