from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.get("/years", response_model=list[int])
def list_years(db: Session = Depends(get_db)):
    return crud.get_distinct_years(db)


@router.get("", response_model=list[schemas.EntryOut])
def list_entries(year: int | None = None, job_id: int | None = None, db: Session = Depends(get_db)):
    return crud.get_entries(db, year=year, job_id=job_id)


@router.post("", response_model=schemas.EntryOut)
def upsert_entry(entry: schemas.EntryUpsert, db: Session = Depends(get_db)):
    job = crud.get_job(db, entry.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Praca nie znaleziona")
    if not (1 <= entry.month <= 12):
        raise HTTPException(status_code=400, detail="Miesiąc musi być z zakresu 1-12")
    return crud.upsert_entry(db, entry.model_dump())


@router.post("/propagate-rate")
def propagate_rate(payload: schemas.RatePropagate, db: Session = Depends(get_db)):
    job = crud.get_job(db, payload.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Praca nie znaleziona")
    updated = crud.propagate_hourly_rate(db, payload.job_id, payload.year, payload.month, payload.hourly_rate)
    return {"updated_months": updated}


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    existing = crud.get_entry(db, entry_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Wpis nie znaleziony")
    crud.delete_entry(db, existing)
    return {"ok": True}
