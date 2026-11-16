# Changelog

## 0.7.0 — Alpha 3

- Added a deterministic weekday calendar starting on Monday, 5 January 2026, with editable special dates and a weekday indicator.
- Added independent weekday, Saturday, Sunday, and special-day schedules per line, with copy, restore, same-every-day, and preset controls.
- Weekly service now changes actual passenger demand, scheduled departures, capacity, fleet need, and time-weighted operating costs.
- Migrated schema 2 and 3 saves to schema 4 without dropping lines or campaign progress.
- Added Node and Playwright coverage for week transitions, special days, mobile editing, migrations, and weekly schedule persistence.
- Fixed a focused timetable slider retaining a stale value after switching day profiles.

## 0.6.0 — Alpha 2

- Dodano indywidualne profile częstotliwości dla pięciu przedziałów doby i cztery gotowe ustawienia.
- Częstotliwość wpływa na kursy, czas oczekiwania, przepustowość, wymaganą flotę i koszty; koszty na granicach okien są naliczane proporcjonalnie do minut.
- Rozbudowano panel linii o edytor rozkładu, bieżący przedział, koszty i wskazówkę o możliwym niedoborze przepustowości.
- Dodano migrację zapisu ze schematu 2 do 3; starsze linie zachowują dawną częstotliwość jako jednolity profil.
- Dodano testy logiki rozkładu i test edytora Playwright desktop/mobile oraz osobne zadanie przeglądarkowe w GitHub Actions.

## 0.5.0 — Alpha 1

- Poszerzono domyślny panel desktopowy i dodano zapis preferowanej szerokości, regulację myszą/klawiaturą oraz szybkie zwijanie.
- Dodano profile miejsc z opisem opartym na typach i profilach popytu już obecnych w silniku.
- Dodano desktopowe podpowiedzi mapy i kartę miejsca dostępną po dotyku.
- Dodano diagnostykę geometrii tras: długość, modelowy czas jazdy, źródło, algorytm i przyczyna wyboru.
- Oznaczono bezpośredni fallback dla rozłącznych grafów.
- Dodano lokalny formularz opinii Alpha Testers z opcjonalnym identyfikatorem i jawną zgodą na diagnostykę.
- Zebrano istniejące kolory i podstawowe wartości UI w tokenach Atlas City; zapis gry nadal używa schematu 2.
- Dodano GitHub Actions dla testów Node.js.
