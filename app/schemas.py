from datetime import date

from pydantic import BaseModel, ConfigDict

from .models import JobType, PitMode


class JobBase(BaseModel):
    name: str
    type: JobType
    default_hourly_rate: float | None = None
    fixed_monthly_net: float | None = None
    vat_payer: bool = False
    start_date: date
    end_date: date | None = None


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    name: str | None = None
    type: JobType | None = None
    default_hourly_rate: float | None = None
    fixed_monthly_net: float | None = None
    vat_payer: bool | None = None
    start_date: date | None = None
    end_date: date | None = None


class JobOut(JobBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class EntryUpsert(BaseModel):
    job_id: int
    year: int
    month: int
    hours: float | None = None
    hourly_rate: float | None = None
    net_revenue: float = 0.0
    invoiced: bool = False
    notes: str | None = None


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    job_id: int
    year: int
    month: int
    hours: float | None
    hourly_rate: float | None
    net_revenue: float
    invoiced: bool
    notes: str | None


class RatePropagate(BaseModel):
    job_id: int
    year: int
    month: int
    hourly_rate: float


class B2BFeesUpsert(BaseModel):
    year: int
    month: int
    zus_amount: float = 0.0
    zus_paid: bool = False
    pit_amount: float = 0.0
    pit_paid: bool = False
    vat_amount: float = 0.0
    vat_paid: bool = False
    notes: str | None = None


class B2BFeesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    year: int
    month: int
    zus_amount: float
    zus_paid: bool
    pit_amount: float
    pit_paid: bool
    vat_amount: float
    vat_paid: bool
    notes: str | None


class SuggestedFees(BaseModel):
    zus_amount: float
    pit_amount: float
    vat_amount: float


class YearSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    year: int
    zus_spoleczny_monthly: float
    zus_spoleczny_with_uop_monthly: float
    zus_zdrowotna_rate: float
    zus_zdrowotna_min: float
    pit_mode: PitMode
    pit_rate: float
    pit_fixed_amount: float
    vat_rate: float


class YearSettingsUpdate(BaseModel):
    zus_spoleczny_monthly: float
    zus_spoleczny_with_uop_monthly: float
    zus_zdrowotna_rate: float
    zus_zdrowotna_min: float
    pit_mode: PitMode
    pit_rate: float
    pit_fixed_amount: float
    vat_rate: float


class ExpenseCreate(BaseModel):
    year: int
    month: int
    name: str
    amount: float = 0.0
    paid: bool = False
    notes: str | None = None


class ExpenseUpdate(BaseModel):
    name: str | None = None
    amount: float | None = None
    paid: bool | None = None
    notes: str | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    year: int
    month: int
    name: str
    amount: float
    paid: bool
    notes: str | None


class TransferCategoryCreate(BaseModel):
    name: str


class CopyMonthRequest(BaseModel):
    year: int
    month: int


class JobYearBreakdown(BaseModel):
    job_id: int
    job_name: str
    job_type: JobType
    total_real_income: float


class YearSummary(BaseModel):
    year: int
    total_real_income: float
    avg_monthly_income: float
    months_with_data: int
    total_uop: float
    total_b2b_revenue: float
    total_zus: float
    total_pit: float
    total_vat: float
    unpaid_zus: float
    unpaid_pit: float
    unpaid_vat: float
    total_expenses: float
    by_job: list[JobYearBreakdown]


class MonthPoint(BaseModel):
    year: int
    month: int
    total_real_income: float
    total_uop: float
    total_b2b_revenue: float
    zus_amount: float
    pit_amount: float
    vat_amount: float
    expenses_amount: float
