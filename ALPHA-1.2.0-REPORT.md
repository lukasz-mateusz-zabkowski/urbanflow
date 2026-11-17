# UrbanFlow ALPHA 1.2.0: raport wdrożeniowy

## Status

**GO do przeglądu technicznego.** Implementacja jest na `feature/alpha-1.2.0`; nie scalano jej z `main`, nie utworzono tagu ani wydania. Produkcja i Raspberry Pi pozostały nietknięte.

- Baza: `88e7d5f39c9bc53f3ad3d931783e9923bbb84571` (`main`, `1.1.0-alpha`).
- Commit implementacji: `a500c1cbfeae7752142e9d3c1a61645b2f190f6a`.
- SHA zweryfikowanego kandydata: `a500c1cbfeae7752142e9d3c1a61645b2f190f6a`. Raport jest osobnym commitem dokumentacyjnym; końcowy HEAD po jego dodaniu podano w podsumowaniu wydania.
- Workflow dla implementacji: [GitHub Actions 44158120929](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44158120929) — SUCCESS, 6/6 zadań.

## Zmiany

- Dodano deterministyczne profile siedmiu funkcji terenu dla istniejących 22 obszarów. Udziały są całkowitoliczbowe i zawsze sumują się do 100%.
- Dodano niską, średnią i wysoką intensywność. Rozwój wymaga rezerwy (4 pp. na poziom), atrakcyjności i obsługi transportowej; postęp jest ograniczony tygodniowo, a rozbudowa ma ośmiotygodniowy okres oczekiwania i kończy się na wysokiej intensywności.
- Zwiększenie pojemności nie zasiedla obszaru. Liczba mieszkańców i miejsc pracy pozostaje w istniejącym, stopniowym modelu City Evolution; pojemność może rosnąć, ale nie maleje.
- Udziały funkcji zmieniają istniejący popyt OD zależnie od roli źródła/celu, pory i typu dnia. Wzorce mobilności i kohorty nie są dublowane; modyfikowany jest rozmiar istniejącej kohorty oraz wagi wyboru celu.
- Dodano Atlas Land Use: marker symboliczny (bez poligonów) koduje dominującą funkcję i intensywność. Legenda, wybór obszaru, szczegółowy profil i cotygodniowe sygnały są dostępne na desktopie i przez panel mobilny. Kliknięcie markera wybiera obszar w profilu.
- Raport tygodniowy pokazuje zmiany intensywności, obszary hamowane przez transport i potencjał rozwoju. Wynik finansowy odnosi się do ostatniego zakończonego tygodnia sieci i nie jest ponownie księgowany w budżecie.
- Formularz opinii raportuje `1.2.0-alpha` zgodnie z `package.json`.

Model i ograniczenia opisano w [docs/URBANFLOW-LAND-USE.md](docs/URBANFLOW-LAND-USE.md); wpis dodano również do changeloga.

## Zapisy

Schema 9 dodaje profil zagospodarowania do każdego profilu City Evolution. Migracja schema 8 inicjalizuje go deterministycznie z istniejącego profilu miejsca i synchronizuje tydzień rozwoju z zapisanym tygodniem miasta. Zachowuje istniejące wartości populacji, pracy i pojemności, linie, flotę, rozkłady, kalendarz, kohorty, mobilność, kampanię oraz historię sieci. Starsze migracje schema 2–7 pozostają obsługiwane. Migrację schema 8 pokrywa test z weryfikacją zachowania tych danych; walidator odrzuca sumy udziałów różne od 100%.

## Testy i bezpieczeństwo

- `npm ci` — PASS.
- `npm test` — PASS, 157 testów; obejmuje deterministyczne scenariusze 52 tygodni, migrację schema 8→9, zachowanie kohort i dopasowanie popytu OD.
- `npm run test:browser` — PASS, 7/7; Atlas Land Use na 1920×1080, 1366×768, 1280×720, 390×844 i 360×800, brak błędów JS i poziomego przepełnienia.
- `npm run audit:all` — PASS, 0 podatności.
- `npm run audit:production` — PASS, 0 podatności.
- GitHub Actions dla implementacji — PASS, 6/6 (`test (18)`, `test (20)`, `test (22)`, `browser-test`, `security-audit`, `container-health`).

## Zrzuty ekranów

Playwright zapisał artefakty poza repozytorium: `%TEMP%\urbanflow-alpha-1.2.0-visual-qa`.

- Desktop Land Use: `desktop-1920x1080-atlas-land-use.png`, `desktop-1366x768-atlas-land-use.png`, `desktop-1280x720-atlas-land-use.png`.
- Mobile Land Use: `mobile-390x844-atlas-land-use.png`, `mobile-360x800-atlas-land-use.png`.
- Dodatkowe zrzuty Atlas Network, City Evolution, profili miejsc, rozkładów oraz panelu mobilności są w tym samym folderze.

## Wydajność

Benchmarki uruchomiono na tej samej maszynie i środowisku Node dla bazy 1.1.0 i kandydata; tick benchmark rozgrzewa ścieżki i wykonuje po pięć próbek w scenariuszu 100 linii/5000 pasażerów. Wyniki są pomiarami lokalnymi, nie gwarancją działania na innym sprzęcie.

| Pomiar | 1.1.0 | 1.2.0 | Ocena |
|---|---:|---:|---|
| Ewolucja 22 obszarów, 20 linii, mediana | 0,708 ms | 0,723 ms | około +2% |
| Ewolucja 22 obszarów, 20 linii, p95 | 1,355 ms | 1,350 ms | bez zmiany |
| Rozmiar serializowanego modelu ewolucji | 13 907 B | 25 022 B | +11 115 B dla 22 profili |
| Tick, 100 linii/5000 pasażerów, mediana bez analityki* | 14,43 ms | 15,53 ms | +7,6%, w granicach rozrzutu pomiaru |
| Tick, 100 linii/5000 pasażerów, p95 bez analityki* | 22,31 ms | 21,20 ms | −5,0% |
| Tick, 100 linii/5000 pasażerów, mediana z analityką* | 18,99 ms | 18,75 ms | −1,3% |

\* Mediana dwóch niezależnych uruchomień rozgrzanego testu, każde z pięcioma powtórzeniami dla tego scenariusza. Rozrzut jest zauważalny; nie stwierdzono stabilnej regresji p95. Pełne diagnostyki benchmarków pozostają w wyjściu `test/city-evolution-performance.test.js` i `test/mobility-performance.test.js`.

## Znane ograniczenia i ryzyka

- Mixy funkcji, pojemności i wskaźniki są parametrami symulacji, nie rzeczywistymi danymi planistycznymi Krakowa.
- Obszary są przedstawiane markerami punktowymi. Repozytorium nie dostarcza wiarygodnych granic poligonowych.
- Rozwój następuje automatycznie podczas tygodniowego ticku w odpowiedzi na dostępność i jakość istniejącej sieci; w tej wersji gracz nie edytuje udziałów terenu bezpośrednio.
- City Evolution zatrzymuje historię 12 tygodniowych raportów. Popyt jest ograniczany istniejącym mnożnikiem populacji i dodatkowym współczynnikiem land-use.
- Benchmarki Node i Playwright są wykonywane na Surface Book; nie określają wydajności Raspberry Pi.

## Następny krok

Przeprowadź przegląd techniczny gałęzi `feature/alpha-1.2.0`, a następnie zdecyduj osobno o PR i integracji. Merge, tag i wdrożenie nie były częścią tego zadania.
