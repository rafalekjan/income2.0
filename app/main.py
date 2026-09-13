from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import Base, engine, run_migrations
from .routers import b2b_fees, dashboard, entries, expenses, jobs, settings

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title="Income2")


@app.middleware("http")
async def no_cache_static(request, call_next):
    # Aplikacja to jednoplikowe SPA bez cache-busting w nazwach plikow - bez
    # tego naglowka przegladarka po aktualizacji app.js/style.css potrafi
    # dalej serwowac stara wersje z cache (mimo swiezego index.html).
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


app.include_router(jobs.router)
app.include_router(entries.router)
app.include_router(b2b_fees.router)
app.include_router(expenses.router)
app.include_router(settings.router)
app.include_router(dashboard.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
