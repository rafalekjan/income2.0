from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("", response_model=list[schemas.JobOut])
def list_jobs(include_ended: bool = True, db: Session = Depends(get_db)):
    return crud.get_jobs(db, include_ended=include_ended)


@router.post("", response_model=schemas.JobOut)
def create_job(job: schemas.JobCreate, db: Session = Depends(get_db)):
    return crud.create_job(db, job.model_dump())


@router.put("/{job_id}", response_model=schemas.JobOut)
def update_job(job_id: int, job: schemas.JobUpdate, db: Session = Depends(get_db)):
    existing = crud.get_job(db, job_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Praca nie znaleziona")
    return crud.update_job(db, existing, job.model_dump(exclude_unset=True))


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    existing = crud.get_job(db, job_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Praca nie znaleziona")
    crud.delete_job(db, existing)
    return {"ok": True}
