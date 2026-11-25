# UrbanFlow Atlas — Fundament II: master plan

Data audytu bazowego: 2026-11-25
Repozytorium: `lukasz-mateusz-zabkowski/urbanflow`
Audytowany `main`: `4cfb07d04c27103055e69c3ad92affd836dd205a` (`v1.11.1-alpha`)

## Macierz wymagań

| Wymaganie | Stan na bazowym `main` | Dowód w kodzie lub testach | Brakująca praca | Priorytet | Kryterium ukończenia |
|---|---|---|---|---|---|
| 1.12 — taryfy i przychody | Model istnieje; taryfa jest stałym parametrem gry, a nie decyzją gracza. Przychody z biletów i dopłaty są oddzielnie liczone. | `public/js/simulation.js` (`farePerPassenger`, `subsidyPerPassengerKm`), `public/js/economy.js`, `public/js/passengers.js`; `test/simulation.test.js`, `test/simulation-quality.test.js` sprawdzają pojedynczą taryfę przy przesiadce i stawki. | Audyt obecnego balansu i czytelności. Nie ma uzasadnienia do zmiany stawek bez wykrytego błędu; interaktywna polityka taryfowa wymaga osobnego modelu elastyczności popytu i nie jest niezbędna do domknięcia obecnej księgowości. | Niski / do kalibracji | Zachować jednorazowe rozliczenie biletu i rozdzielenie wpływów, dopóki testy scenariuszy nie uzasadnią zmian. |
| 1.12 — koszty, flota, częstotliwość, rentowność | Zasadniczo zaimplementowane. Koszty zależą od typu pojazdu, floty, długości i rozkładu; istnieje rentowność linii oraz diagnostyka. | `public/js/economy.js`, `public/js/transport.js`, `public/js/fleet.js`, `public/js/operations.js`; `test/campaign-balance.test.js`, `test/simulation-quality.test.js`, `test/operations.test.js`. | Wykonać ponowną walidację i sprawdzić, czy UI jasno odróżnia obserwacje od kosztów modelowanych. | Średni | Scenariusze dodatnie, bliskie równowagi i stratne; bez fikcyjnego zysku oraz z poprawną flotą. |
| 1.12 — historia, prognoza, rezerwa, cele finansowe | Zaawansowana funkcjonalność jest obecna. Księga kapitałowa jest ograniczona, prognoza wymaga pełnych obserwacji, rezerwa jest planistyczna, a koszty nie są dublowane w wyniku operacyjnym. | `public/js/finance.js`, `public/js/ui.js`, `public/js/storage.js`; `test/finance.test.js` obejmuje horyzonty 1/7/28 dni, rezerwę, rotację księgi, 104 tygodnie i wznowienie. | Ponowić walidację jako część pierwszego kandydata; nie tworzyć osobnej waluty ani kredytu. | Średni | Prognoza nie mutuje kampanii; każdy wydatek jest księgowany raz; brak danych pokazuje brak prognozy. |
| 2.0 — Atlas Studio w pięciu workspace | Częściowo obecne, ale narzędzia planowania są rozdzielone między Planowanie, Operacje i Rozwój miasta. W istniejącej dokumentacji Atlas Studio nadal jest funkcją przyszłą. | `public/js/atlas.js`, `public/js/ui.js` (`renderAtlasNavigation`, `renderNetwork`, `renderTimetable`, `renderOperationsDashboard`), `public/index.html`; `test/atlas.test.js`, `e2e/atlas-workspace-continuity.spec.js`. `docs/URBANFLOW-ATLAS.md` wymienia Atlas Studio jako przyszłe. | Zbudować wspólny, kontekstowy punkt pracy dla projektu linii: podgląd bieżącego wyboru, kosztu i zapotrzebowania, z bezpośrednim przejściem do istniejących narzędzi trasy, rozkładu, floty, porównania decyzji i inwestycji. Bez drugiego modelu symulacji i bez szóstego workspace. | Wysoki — rozpoczęty w gałęzi `feature/alpha-2.0.0-atlas-studio` | Gracz z jednego kontekstu planowania dociera do narzędzi powiązanych z linią, zachowując zaznaczenie i draft; podgląd nie zmienia kampanii. |
| 2.5 — Atlas City / Network / Midnight | Brak przełączalnych stylów. Dostępny jest tylko City; pozostałe definicje są wyłączone. | `public/js/theme.js` ustawia `network`, `midnight` i inne widoki jako `available: false`; `test/ui-contracts.test.js` wymaga bezpiecznego fallbacku do City. `docs/URBANFLOW-ATLAS.md` nadal opisuje je jako przyszłe. | Po ustabilizowaniu układu Studio wdrożyć trzy kompletne motywy oparte na tokenach, z niezależnym zapisem preferencji i testami kontrastu, mapy oraz reduced-motion. | Wysoki | Przełączanie nie zmienia stanu symulacji/zapisu; wszystkie trzy style mają zweryfikowany kontrast, mapę i mobile. |
| 2.9 — zakończenie Fundamentu II | Nieosiągnięte. Części bazowej ekonomii i pięciu workspace nie należy mylić z pełnym Studio ani kompletnym systemem stylów. | Zależne od wyników kryteriów 1.12, 2.0 i 2.5; brak raportu bramki `FUNDAMENT II COMPLETE`. | Zintegrować i zweryfikować wcześniejsze kamienie; długą kampanię, wydajność, zapisy, desktop/mobile, rozdzielenie symulacji i prezentacji. | Bramka końcowa | Wszystkie kryteria 13. sekcji master spec mają jawne dowody PASS i nie ma krytycznych defektów. |

## Kolejność realizacji

1. **1.12.0 Economy & Experience Completion — audyt istniejącej funkcjonalności.** Większość wymagań jest już w `main` dzięki wdrożonym modułom finansów i operacji. Nie tworzyć pustego wydania ani zmieniać stawek bez dowodu. Ewentualny wykryty defekt otrzymuje osobną poprawkę i regresję.
2. **2.0.0 Atlas Studio — pierwszy potwierdzony brak; w toku.** Zintegrować istniejące narzędzia linii, rozkładu, floty, kosztów i decyzji w kontekstowym workflow przy zachowaniu pięciu workspace.
3. **2.5.0 Atlas Visual System.** Włączyć i dopracować City, Network, Midnight po ustaleniu interakcji Studio; przełączanie wyłącznie w warstwie prezentacji.
4. **2.9.0 Fundament II Completion.** Przejść bramkę całościową dopiero po zintegrowaniu wymaganych kamieni i końcowej walidacji.

Każdy etap ma oddzielną gałąź/worktree, testy, lokalny odbiór, benchmarki zależne od zakresu, CI i raport. Integracja do `main`, tag i wdrożenie wymagają osobnego zatwierdzenia. Nie deklarować kontynuacji w tle.

## Bieżący status

- Bazowy `main` był czysty w zakresie śledzonych plików i zgodny z `origin/main` podczas audytu. Nieśledzone raporty użytkownika pozostają nietknięte.
- `v1.11.1-alpha` oraz sukces CI 6/6 są udokumentowane w `URBANFLOW-1.11.1-FINAL-INTEGRATION.md` w worktree integracyjnym.
- 1.12.0: istniejące wymagania ekonomiczne mają mocne pokrycie kodem i testami; pełne ponowne uruchomienie suite będzie częścią walidacji kandydata.
- 2.0.0: brak spójnego Atlas Studio potwierdzony dokumentacją i podziałem modułów; implementacja startuje w obecnej gałęzi.
- 2.5.0: brak przełączalnych motywów potwierdzony kodem.
- 2.9.0: **FUNDAMENT II INCOMPLETE** do momentu przejścia wszystkich wymaganych bramek.

## Historia kamieni milowych

| Kamień | Zakres ukończony | Pozostało | Testy / wydajność | Integracja | Ryzyka / następny krok |
|---|---|---|---|---|---|
| Audyt bazowy 1.11.1 | Macierz i dowody bazowe zapisane. | Weryfikacja ekonomii w suite pierwszego kandydata. | CI 6/6 przy 1.11.1 według raportu wydania. | Brak zmian na `main`. | Nie traktować wersji jako dowodu ukończenia. |
| 2.0.0 Atlas Studio | Implementacja oraz lokalne testy funkcjonalne zakończone; CI gałęzi oczekuje. | Zweryfikować push i workflow 6 zadań; pozostawić jako kandydat bez integracji. | Node 311/311, Playwright 54/54, oba npm audyty 0; live OSM 16/16 kafelków. | Osobna feature branch; bez merge. | Zachować kampanię, wybór linii i draft przy nawigacji. |
| 2.5.0 Visual System | Nie rozpoczęto. | Atlas City, Network, Midnight. | Do zaplanowania. | Osobna feature branch po odbiorze 2.0.0. | Kontrast, zgodność OSM i wydajność markerów. |
| 2.9.0 Completion gate | Nie rozpoczęto. | Pełna bramka zgodnie z sekcją 13 specyfikacji. | Do zaplanowania. | Wymaga osobnej zgody na integracje. | Nie deklarować complete przed 100% kryteriów. |

## Aktualizacja 2.0.0 Atlas Studio — 2026-11-25

- Potwierdzony brak: narzędzia planowania były rozdzielone pomiędzy istniejące workspace; dokumentacja Atlas również wskazywała Studio jako przyszłą funkcję.
- Implementacja kandydata w osobnym worktree `urbanflow-alpha-2.0.0-atlas-studio`, gałąź `feature/alpha-2.0.0-atlas-studio` od bazowego `main` `4cfb07d04c27103055e69c3ad92affd836dd205a`.
- Dodany kontekstowy panel Studio w Planowaniu: rzeczywisty podgląd trasy/linii, koszt, długość, czas i wymagana flota; przejście do już istniejących narzędzi rozkładu, floty, porównania decyzji oraz inwestycji. Bez szóstego workspace i bez zmian schematu zapisu 13.
- `planningStudioSnapshot` jest tylko do odczytu. Powtórny routing w panelu został usunięty przez przekazywanie wyniku z istniejącego renderu; dodano test regresyjny.
- Testy Atlas Studio: Node 4/4 i Playwright desktop/mobile 2/2. Końcowe pełne suite po poprawce wizualnej: Node 311/311 i Playwright 54/54.
- Audyty npm: zero podatności; live OSM: 16/16 kafelków 200. Benchmark przełączania Passenger Flow: mediana 31.1 ms bazowo / 30.8 ms kandydat; p95 32.5 ms / 32.5 ms (60 próbek na wersję).
- Status kamienia 2.0.0: **KANDYDAT PASS; GitHub Actions 6/6 SUCCESS dla implementacyjnego SHA**. Fundament II nadal **INCOMPLETE**; 2.5.0 i 2.9.0 nie są ukończone.

### Wynik GitHub Actions

- Implementacyjny SHA `5dcdf9393062ce38318b733f650080a7b61b4fba` wypchnięto na `feature/alpha-2.0.0-atlas-studio`.
- GitHub Actions [run 45651570103](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45651570103): **6/6 SUCCESS** — Node 18, Node 20, Node 22, browser-test, security-audit, container-health.
- Kandydat nie został scalony. Fundament II nadal **INCOMPLETE**; Atlas visual themes i bramka 2.9 pozostają do wykonania.
