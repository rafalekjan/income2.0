from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import Base, engine, run_migrations
from .routers import b2b_fees, dashboard, entries, jobs, settings

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title="Income2")

app.include_router(jobs.router)
app.include_router(entries.router)
app.include_router(b2b_fees.router)
app.include_router(settings.router)
app.include_router(dashboard.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
