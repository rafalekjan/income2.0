"""Uproszczone wyliczenia opłat B2B (ZUS, PIT, VAT).

Wartości są tylko punktem wyjścia — mają charakter orientacyjny i pomijają
część niuansów polskiego prawa podatkowego (np. koszty uzyskania przychodu,
roczne limity odliczeń, zaliczki uproszczone). Użytkownik może i powinien
nadpisać każdą wyliczoną kwotę ręcznie.

Opłaty ZUS/PIT/VAT są liczone SUMARYCZNIE dla wszystkich prac B2B w danym
miesiącu (tak jak rozlicza je księgowa), a nie osobno dla każdej umowy.
"""

from .models import PitMode, YearSettings


def suggest_b2b_fees(
    total_net_revenue: float,
    settings: YearSettings,
    has_active_uop: bool,
    any_vat_payer: bool,
) -> dict:
    total_net_revenue = max(total_net_revenue, 0.0)

    if total_net_revenue <= 0:
        return {"zus_amount": 0.0, "pit_amount": 0.0, "vat_amount": 0.0}

    # Przy zbiegu tytułów do ubezpieczeń (aktywna praca UoP w tym samym
    # miesiącu) ZUS społeczny od działalności B2B zwykle nie jest należny -
    # płaci się go tylko raz, przez etat. Zdrowotna obowiązuje zawsze.
    zus_spoleczny = settings.zus_spoleczny_with_uop_monthly if has_active_uop else settings.zus_spoleczny_monthly
    zus_zdrowotna = max(total_net_revenue * settings.zus_zdrowotna_rate, settings.zus_zdrowotna_min)
    zus_amount = round(zus_spoleczny + zus_zdrowotna, 2)

    if settings.pit_mode == PitMode.FIXED:
        pit_amount = round(settings.pit_fixed_amount, 2)
    else:
        pit_base = max(total_net_revenue - zus_spoleczny, 0.0)
        pit_amount = round(pit_base * settings.pit_rate, 2)

    vat_amount = round(total_net_revenue * settings.vat_rate, 2) if any_vat_payer else 0.0

    return {"zus_amount": zus_amount, "pit_amount": pit_amount, "vat_amount": vat_amount}


DEFAULT_YEAR_SETTINGS = dict(
    # Pełny ZUS społeczny 2026 (emerytalna+rentowa+wypadkowa+FP, z dobrowolnym
    # chorobowym, bez zdrowotnej) - ok. 1926,77 zł/mies. wg zus.pl.
    zus_spoleczny_monthly=1926.77,
    zus_spoleczny_with_uop_monthly=0.0,
    zus_zdrowotna_rate=0.049,
    # Minimalna składka zdrowotna dla liniowców 2026 = 9% minimalnego
    # wynagrodzenia (4806 zł) = 432,54 zł/mies.
    zus_zdrowotna_min=432.54,
    pit_mode=PitMode.PERCENT,
    pit_rate=0.19,
    pit_fixed_amount=0.0,
    vat_rate=0.23,
)
