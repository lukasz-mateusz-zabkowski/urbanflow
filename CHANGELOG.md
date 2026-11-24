# Changelog

## 1.6.0 — Atlas Operations

- Added an Operations fleet summary for owned, assigned, and reserve vehicles by type, observed line operating costs, modelled reserve maintenance, capacity warnings, and potentially idle assignments.
- Added a deterministic “Open line” action from fleet signals so it always opens the selected line details, even if that line was already selected.
- Added a read-only decision simulator for assigning or removing a reserve vehicle, buying one vehicle, setting a uniform frequency, or applying an existing timetable profile for the current service-day type.
- The preview compares the current transport model at the same game time and day type, labels modelled rates separately from current observed passenger data, and never predicts future passenger totals or revenue.
- Applying a proposal requires confirmation and delegates to the existing campaign methods; no campaign schema fields or save migration were added.
- Added Node invariants and browser coverage for preview immutability, cancellation, confirmed application, fleet reporting, schema 11, and four desktop/mobile viewports.
- See `docs/URBANFLOW-OPERATIONS-DECISIONS.md` and `ALPHA-1.6.0-TRANSPORT-OPERATIONS-REPORT.md` for assumptions and validation.

## 1.3.0 — Alpha 10

- Added Atlas Investments with housing, economic, and served-hub projects, including planning, approval, timed completion, cancellation/refunds, single-application effects, and bounded project history.
- Connected housing and economic investment effects to the existing Land Use shares, capacity and City Evolution; project completion changes future demand profiles without creating residents or passenger cohorts immediately.
- Added a local hub queue-handling upgrade that affects existing passenger retention/overcrowding, caps the upgrade at 2×, and charges a separate 400 per-level weekly maintenance cost.
- Kept one existing spendable game budget while separating urban investment capex/maintenance from network operating revenue and expense metrics; no money is minted.
- Added the Atlas Investments map layer and responsive project catalog, area profile, cost/progress controls, weekly investment summary, keyboard support, and mobile interaction.
- Migrated save schema 9 to 10 with deterministic empty investment state while preserving existing campaigns and passenger cohorts.
- Added lifecycle, cancellation, affordability, 52-week determinism, reserve contention, schema migration, save/resume, and desktop/touch Playwright coverage.
- See `docs/URBANFLOW-INVESTMENTS.md` and `ALPHA-1.3.0-REPORT.md` for model definitions and verification.

## 1.2.0 — Alpha 8

- Added deterministic residential, retail, office, industrial, public, green, and reserve land-use mixes for modeled city areas, with constrained low/medium/high development intensity and capacity growth.
- Integrated time-of-day and service-day land-use demand factors into existing OD demand and mobility cohorts without creating a second passenger generator.
- Added Atlas Land Use symbolic markers, an accessible legend, district profile details, and weekly development signals.
- Migrated schema 8 saves to schema 9 while retaining existing occupancy, capacities, network state, mobility, campaign, and weekly network history; schemas 2–7 remain supported.
- Added deterministic 52-week development, demand/cohort integration, migration, and desktop/mobile browser coverage.
- See `docs/URBANFLOW-LAND-USE.md` and `ALPHA-1.2.0-REPORT.md` for model definitions and validation results.

## 1.0.0 — Alpha 6

- Audited fare, subsidy, fleet, frequency, distance and time-weighted operating-cost rules; retained the existing rates because deterministic scenarios show both profitable and loss-making outcomes.
- Corrected Atlas Network history so point coverage is not mislabeled as real trip availability; recorded completed passengers, denied trip opportunities and later passenger abandonments separately.
- Added bounded daily and weekly analytics with weighted averages, correct midnight attribution, and four-week-plus retention.
- Migrated save schemas 2–6 to schema 7 while preserving gameplay state and normalizing schema 6 point coverage.
- Added eight deterministic economic scenarios and accelerated 1-day, 1-week, 4-week and 12-week stability/save-resume checks.
- Expanded repeatable performance diagnostics with per-tick median/p95, heap delta, cohort counts and analytics overhead.
- See `docs/URBANFLOW-NETWORK-INTELLIGENCE.md` and `ALPHA-1.0.0-REPORT.md` for metric definitions and verification.

## 0.9.0 — Alpha 5

- Added Atlas Network map layers for measured segment occupancy, overload, queues, unmet trips, and line profitability.
- Added actionable network problem diagnostics and bounded 96-window aggregate history with descriptive adjacent-tick comparisons.
- Migrated saves from schemas 2–5 to schema 6 while preserving existing game progress.
- Added repeated warmed performance measurements and browser coverage at desktop and mobile viewports.
- See `docs/URBANFLOW-NETWORK-INTELLIGENCE.md` and `ALPHA-0.9.0-REPORT.md` for data definitions and verification.

## 0.8.0 — Alpha 4

- Added deterministic aggregate commute, school, shopping, recreation, and occasional travel patterns derived from place profiles and demand.
- Added local time-, wait-, transfer-, and crowding-aware route planning with up to two transfers and passenger demand diagnostics.
- Added separate completed-trip quality and reachable-network accessibility metrics, plus a passenger mobility panel and relation checker.
- Fixed passenger demand averaging across calendar day boundaries to match minute-based service.
- Migrated save schema 4 to 5 while retaining line, fleet, budget, timetable, and campaign data; schemas 2 and 3 remain supported.
- Added mobility, migration, boundary, and scaling performance tests; browser coverage includes the mobility panel on desktop and touch layouts.
- See `docs/URBANFLOW-PASSENGER-MOBILITY.md` and `ALPHA-0.8.0-REPORT.md` for model parameters and verification.

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
