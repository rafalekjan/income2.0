from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("/years", response_model=list[int])
def list_years(db: Session = Depends(get_db)):
    return crud.get_expense_years(db)


@router.get("/names", response_model=list[str])
def list_names(db: Session = Depends(get_db)):
    return crud.get_distinct_expense_names(db)


@router.get("/transfer-categories", response_model=list[str])
def list_transfer_categories(db: Session = Depends(get_db)):
    return crud.get_transfer_category_names(db)


@router.post("/transfer-categories", response_model=list[str])
def add_transfer_category(payload: schemas.TransferCategoryCreate, db: Session = Depends(get_db)):
    crud.add_transfer_category(db, payload.name)
    return crud.get_transfer_category_names(db)


@router.delete("/transfer-categories/{name}", response_model=list[str])
def remove_transfer_category(name: str, db: Session = Depends(get_db)):
    crud.remove_transfer_category(db, name)
    return crud.get_transfer_category_names(db)


@router.get("", response_model=list[schemas.ExpenseOut])
def list_expenses(year: int, month: int | None = None, db: Session = Depends(get_db)):
    return crud.get_expenses(db, year, month)


@router.post("", response_model=schemas.ExpenseOut)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    if not (1 <= expense.month <= 12):
        raise HTTPException(status_code=400, detail="Miesiąc musi być z zakresu 1-12")
    return crud.create_expense(db, expense.model_dump())


@router.put("/{expense_id}", response_model=schemas.ExpenseOut)
def update_expense(expense_id: int, expense: schemas.ExpenseUpdate, db: Session = Depends(get_db)):
    existing = crud.get_expense(db, expense_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Wydatek nie znaleziony")
    return crud.update_expense(db, existing, expense.model_dump(exclude_unset=True))


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    existing = crud.get_expense(db, expense_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Wydatek nie znaleziony")
    crud.delete_expense(db, existing)
    return {"ok": True}


@router.post("/copy-month", response_model=list[schemas.ExpenseOut])
def copy_month(payload: schemas.CopyMonthRequest, db: Session = Depends(get_db)):
    return crud.copy_expenses_from_previous_month(db, payload.year, payload.month)
