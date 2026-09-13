from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=list[schemas.YearSettingsOut])
def list_settings(db: Session = Depends(get_db)):
    return crud.list_year_settings(db)


@router.get("/{year}", response_model=schemas.YearSettingsOut)
def get_settings(year: int, db: Session = Depends(get_db)):
    return crud.get_year_settings(db, year)


@router.put("/{year}", response_model=schemas.YearSettingsOut)
def update_settings(year: int, data: schemas.YearSettingsUpdate, db: Session = Depends(get_db)):
    return crud.update_year_settings(db, year, data.model_dump())
