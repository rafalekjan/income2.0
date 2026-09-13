import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = os.environ.get("INCOME2_DATA_DIR", "./data")
os.makedirs(DATA_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATA_DIR}/income.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Lekka, idempotentna migracja schematu (bez Alembica - projekt jednoosobowy,
    SQLite). Wywoływana po Base.metadata.create_all()."""
    with engine.begin() as conn:
        cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(monthly_entries)").fetchall()]

        if "invoiced" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE monthly_entries ADD COLUMN invoiced BOOLEAN NOT NULL DEFAULT 1"
            )

        # Stare opłaty ZUS/PIT/VAT trzymane były per-praca; jednorazowo
        # zsumuj je do nowej, wspólnej tabeli monthly_b2b_fees (per miesiąc),
        # jeśli jeszcze tego nie zrobiono i stare kolumny wciąż istnieją.
        if "zus_amount" in cols:
            rows = conn.exec_driver_sql(
                """
                SELECT me.year, me.month,
                       SUM(me.zus_amount), SUM(me.pit_amount), SUM(me.vat_amount),
                       MIN(me.zus_paid), MIN(me.pit_paid), MIN(me.vat_paid)
                FROM monthly_entries me
                JOIN jobs j ON j.id = me.job_id
                WHERE j.type = 'B2B'
                GROUP BY me.year, me.month
                """
            ).fetchall()
            for year, month, zus, pit, vat, zus_paid, pit_paid, vat_paid in rows:
                exists = conn.exec_driver_sql(
                    "SELECT 1 FROM monthly_b2b_fees WHERE year=? AND month=?", (year, month)
                ).fetchone()
                if exists:
                    continue
                conn.exec_driver_sql(
                    """
                    INSERT INTO monthly_b2b_fees
                        (year, month, zus_amount, zus_paid, pit_amount, pit_paid, vat_amount, vat_paid)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (year, month, zus or 0.0, bool(zus_paid), pit or 0.0, bool(pit_paid), vat or 0.0, bool(vat_paid)),
                )

            # Kolumny zostały już zsumowane do monthly_b2b_fees powyżej - jako
            # NOT NULL bez wartości domyślnej na poziomie SQL blokowały INSERT
            # nowych wierszy (np. nowy rok), więc trzeba je faktycznie usunąć.
            for legacy_col in ("zus_amount", "zus_paid", "pit_amount", "pit_paid", "vat_amount", "vat_paid"):
                conn.exec_driver_sql(f"ALTER TABLE monthly_entries DROP COLUMN {legacy_col}")

        jobs_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(jobs)").fetchall()]
        if "fixed_monthly_net" not in jobs_cols:
            conn.exec_driver_sql(
                "ALTER TABLE jobs ADD COLUMN fixed_monthly_net REAL"
            )
        # Przychód liczy się teraz zawsze do miesiąca pracy/faktury, nie do
        # miesiąca wpływu przelewu - termin płatności klienta przestał być
        # potrzebny do czegokolwiek.
        if "payment_term_months" in jobs_cols:
            conn.exec_driver_sql("ALTER TABLE jobs DROP COLUMN payment_term_months")

        settings_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(year_settings)").fetchall()]
        if "zus_spoleczny_with_uop_monthly" not in settings_cols:
            conn.exec_driver_sql(
                "ALTER TABLE year_settings ADD COLUMN zus_spoleczny_with_uop_monthly REAL NOT NULL DEFAULT 0.0"
            )
        if "pit_mode" not in settings_cols:
            conn.exec_driver_sql(
                "ALTER TABLE year_settings ADD COLUMN pit_mode TEXT NOT NULL DEFAULT 'percent'"
            )
        if "pit_fixed_amount" not in settings_cols:
            conn.exec_driver_sql(
                "ALTER TABLE year_settings ADD COLUMN pit_fixed_amount REAL NOT NULL DEFAULT 0.0"
            )

        # Wykluczanie z sum przeniesione z pojedynczych wpisow (checkbox per
        # miesiac) na globalna liste nazw-przelewow w Ustawieniach (patrz
        # ExpenseTransferCategory) - stara kolumna nie jest juz potrzebna.
        expenses_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(expenses)").fetchall()]
        if "excluded_from_total" in expenses_cols:
            conn.exec_driver_sql("ALTER TABLE expenses DROP COLUMN excluded_from_total")
