# Income2

Aplikacja do śledzenia dochodu z kilku prac (UoP i B2B) — dynamicznie dodawanych
i kończonych — wraz z wyliczeniami wspólnych opłat B2B (ZUS, PIT, VAT).

## Uruchomienie

```
docker compose up --build -d
```

Aplikacja będzie dostępna pod `http://localhost:8010` (port 8000 jest już zajęty
przez projekt `trader_history` na tej maszynie — w razie potrzeby zmień
mapowanie portu w `docker-compose.yml`). Dane trzymane są w pliku
SQLite w katalogu `./data` (mapowanym jako wolumen), więc przetrwają restart
kontenera.

## Moduły

- **Dochody** — dla każdej pracy i miesiąca:
  - UoP: kwota przelewu netto.
  - B2B: godziny + stawka/h (przychód netto liczony automatycznie, edytowalny)
    oraz checkbox **"Faktura wystawiona"** — dopiero zaznaczenie go liczy dany
    miesiąc do sum i wykresów. Zmiana stawki/h nadpisuje ją automatycznie we
    wszystkich kolejnych miesiącach tej pracy (wcześniejsze zostają bez zmian).
    Praca może też mieć **stałą kwotę netto miesięcznie** zamiast stawki
    godzinowej (np. umowy ryczałtowe) — wtedy godziny/stawka są nieaktywne,
    a przychód netto podpowiada się automatycznie tą kwotą.
  - **Opłaty B2B (ZUS/PIT/VAT)** to osobna, wspólna sekcja per miesiąc — jedna
    kwota dla wszystkich prac B2B naraz (tak jak rozlicza księgowa), z
    checkboxem "zapłacone" i przyciskiem "Przelicz" (podpowiedź na bazie
    ustawień, zawsze można nadpisać ręcznie). Wiersz dotyczy tego samego
    miesiąca co praca/faktura (np. "Wrzesień" = opłaty za wrzesień) — bez
    żadnego przesunięcia; liczą się dopiero gdy w tym miesiącu była
    zafakturowana sprzedaż B2B.
  - Każda praca ma w tabeli Wpisów własny kolor tła i pionową kreskę
    oddzielającą jej kolumny, żeby pola różnych pracodawców się nie zlewały.
  - Pola dla miesięcy, w których dana praca nie była aktywna, są wyszarzone
    (tylko wizualnie — zawsze można je edytować) i **automatycznie czyszczone**
    z ewentualnych "widmowych" wartości (np. z importu albo sprzed zmiany dat
    pracy), gdy tylko strona je wyrenderuje.
- **Wydatki** — niezależny od Dochodów moduł do pamiętania o rachunkach/
  rozliczeniach, wzorowany na sekcji rachunków domowych z arkusza-źródła.
  Każdy miesiąc to osobna, dowolnie długa lista pozycji (nazwa + kwota +
  checkbox "zapłacone") — pozycje dodaje się i usuwa przyciskiem niezależnie
  w każdym miesiącu (bez sztywnej siatki kategorii). Przycisk "Kopiuj z
  poprzedniego miesiąca" przenosi nazwy i kwoty z miesiąca wcześniej (z
  grudnia poprzedniego roku dla stycznia), zawsze jako niezapłacone — to tylko
  wygoda przy powtarzalnych rachunkach, każdą pozycję można potem dowolnie
  zmienić lub usunąć.
- **Ustawienia** — tu też mieszczą się **Prace** (dodawanie/edycja/kończenie
  prac UoP i B2B, dowolna liczba, w dowolnym momencie) oraz stawki/kwoty
  używane do automatycznych wyliczeń ZUS/PIT/VAT, osobno na każdy rok (bo
  zmieniają się co roku), w tym:
  - ZUS społeczny osobno dla przypadku "bez UoP" i "przy zbiegu z UoP" (gdy w
    danym miesiącu masz równolegle aktywną pracę na etacie, ZUS społeczny od
    B2B zwykle nie jest należny — domyślnie 0 zł).
  - Sposób liczenia PIT: procent dochodu, albo stała kwota miesięczna (np.
    preferencyjna stawka z IP Box).
- **Dashboard** — wykresy i podsumowania roczne/miesięczne ze wszystkich lat.

Zapis w zakładkach Dochody i Wydatki jest automatyczny (po opuszczeniu pola /
zaznaczeniu checkboxa) — potwierdzenie "Zapisano ✓" pojawia się jako
powiadomienie na górze ekranu i znika samo po 3 sekundach.

## Ważne założenia dot. wyliczeń

- Wyliczenia ZUS/PIT/VAT to **uproszczone wartości orientacyjne**, bez
  uwzględniania kosztów uzyskania przychodu ani rocznych limitów odliczeń.
  Zweryfikuj je z księgową/księgowym i dostosuj stawki w zakładce Ustawienia —
  każdą wyliczoną kwotę można też nadpisać ręcznie.
- **Wszystko liczy się do jednego, tego samego miesiąca pracy/faktury** —
  przychód (UoP i B2B), VAT należny oraz opłaty ZUS/PIT/VAT. Żadnego
  przesunięcia między miesiącami czy latami — to celowe uproszczenie:
  aplikacja nie próbuje śledzić rzeczywistego terminu zapłaty przez
  klienta/pracodawcę, tylko za jaki miesiąc była praca.
- **Dochód na wykresach = UoP + przychód B2B + VAT należny (pobrany od klienta
  razem z fakturą) − ZUS − PIT − VAT faktycznie zapłacony do US.** Jeśli
  zapłacisz mniej VAT-u niż pobrałeś (np. dzięki odliczeniom z kosztów),
  różnica zostaje jako realny dochód — dlatego kwota VAT w sekcji Opłaty B2B
  to *faktycznie należny do zapłaty* VAT (po odliczeniach), nie automatycznie
  23% przychodu.
- ZUS/PIT/VAT nie są przypisane do konkretnej pracy B2B — jeśli masz kilka
  umów B2B jednocześnie, wpisujesz jedną sumaryczną kwotę miesięcznie (tak jak
  dostajesz ją od księgowej).
