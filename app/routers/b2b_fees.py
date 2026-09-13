from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..calculations import suggest_b2b_fees
from ..database import get_db

router = APIRouter(prefix="/api/b2b-fees", tags=["b2b-fees"])


@router.get("", response_model=list[schemas.B2BFeesOut])
def list_fees(year: int, db: Session = Depends(get_db)):
    return crud.get_b2b_fees_for_year(db, year)


@router.get("/suggest", response_model=schemas.SuggestedFees)
def suggest(year: int, month: int, db: Session = Depends(get_db)):
    # Opłaty za miesiąc M dotyczą sprzedaży zafakturowanej w TYM SAMYM
    # miesiącu - bez żadnego przesunięcia.
    total_revenue = crud.total_invoiced_b2b_revenue(db, year, month)
    settings = crud.get_year_settings(db, year)
    uop = crud.has_active_uop(db, year, month)
    vat_payer = crud.any_active_vat_payer(db, year, month)
    suggestion = suggest_b2b_fees(total_revenue, settings, uop, vat_payer)
    return schemas.SuggestedFees(**suggestion)


@router.post("", response_model=schemas.B2BFeesOut)
def upsert_fees(fees: schemas.B2BFeesUpsert, db: Session = Depends(get_db)):
    return crud.upsert_b2b_fees(db, fees.model_dump())
