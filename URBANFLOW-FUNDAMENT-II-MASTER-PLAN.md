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
| 2.5 — Atlas City / Network / Midnight | Zaimplementowane jako kandydat na osobnej gałęzi zależnej od kandydata 2.0.0; nie scalone z `main`. | `public/js/theme.js`, `public/js/ui.js`, `public/styles.css`; `test/atlas-theme.test.js`, `e2e/atlas-themes.spec.js`. Przełączanie preferencji nie zmienia stanu kampanii; testy obejmują kontrast, zapis preferencji, mobile i reduced-motion. | Połączyć kandydatów 2.0.0 i 2.5.0 dopiero po osobnej zgodzie na integrację; następnie przeprowadzić bramkę końcową. | Wysoki | Wszystkie trzy style działają na desktop/mobile, zachowują kontrast i nie mutują kampanii; spełnione lokalnie dla kandydata. |
| 2.9 — zakończenie Fundamentu II | Nieosiągnięte. Części bazowej ekonomii i pięciu workspace nie należy mylić z pełnym Studio ani kompletnym systemem stylów. | Zależne od wyników kryteriów 1.12, 2.0 i 2.5; brak raportu bramki `FUNDAMENT II COMPLETE`. | Zintegrować i zweryfikować wcześniejsze kamienie; długą kampanię, wydajność, zapisy, desktop/mobile, rozdzielenie symulacji i prezentacji. | Bramka końcowa | Wszystkie kryteria 13. sekcji master spec mają jawne dowody PASS i nie ma krytycznych defektów. |

## Kolejność realizacji

1. **1.12.0 Economy & Experience Completion — audyt istniejącej funkcjonalności.** Większość wymagań jest już w `main` dzięki wdrożonym modułom finansów i operacji. Nie tworzyć pustego wydania ani zmieniać stawek bez dowodu. Ewentualny wykryty defekt otrzymuje osobną poprawkę i regresję.
2. **2.0.0 Atlas Studio — kandydat PASS.** Kontekstowe narzędzia planowania linii zaimplementowano i zweryfikowano w osobnej gałęzi; nie scalono z `main`.
3. **2.5.0 Atlas Visual System — kandydat lokalnie PASS, CI oczekuje.** City, Network i Midnight są przełączalne, a wybór jest niezależną preferencją UI. Gałąź zależy od kandydata 2.0.0, który również pozostaje niescalony.
4. **2.9.0 Fundament II Completion.** Przejść bramkę całościową dopiero po zintegrowaniu wymaganych kamieni i końcowej walidacji.

Każdy etap ma oddzielną gałąź/worktree, testy, lokalny odbiór, benchmarki zależne od zakresu, CI i raport. Integracja do `main`, tag i wdrożenie wymagają osobnego zatwierdzenia. Nie deklarować kontynuacji w tle.

## Bieżący status

- Bazowy `main` był czysty w zakresie śledzonych plików i zgodny z `origin/main` podczas audytu. Nieśledzone raporty użytkownika pozostają nietknięte.
- `v1.11.1-alpha` oraz sukces CI 6/6 są udokumentowane w `URBANFLOW-1.11.1-FINAL-INTEGRATION.md` w worktree integracyjnym.
- 1.12.0: istniejące wymagania ekonomiczne mają mocne pokrycie kodem i testami; pełne ponowne uruchomienie suite będzie częścią walidacji kandydata.
- 2.0.0: Atlas Studio zaimplementowano w `feature/alpha-2.0.0-atlas-studio`; workflow 6/6 SUCCESS dla implementacyjnego SHA `5dcdf9393062ce38318b733f650080a7b61b4fba`. Nie scalono.
- 2.5.0: trzy motywy zaimplementowano w `feature/alpha-2.5.0-atlas-visual-system`; pełna walidacja lokalna przeszła. Workflow `45657363522` zakończył się 6/6 SUCCESS dla SHA `0e54d62f374c187b5ea251d55bd78f07325cec0d`. Nie scalono.
- 2.9.0: **FUNDAMENT II INCOMPLETE** do momentu przejścia wszystkich wymaganych bramek.

## Historia kamieni milowych

| Kamień | Zakres ukończony | Pozostało | Testy / wydajność | Integracja | Ryzyka / następny krok |
|---|---|---|---|---|---|
| Audyt bazowy 1.11.1 | Macierz i dowody bazowe zapisane. | Weryfikacja ekonomii w suite pierwszego kandydata. | CI 6/6 przy 1.11.1 według raportu wydania. | Brak zmian na `main`. | Nie traktować wersji jako dowodu ukończenia. |
| 2.0.0 Atlas Studio | Implementacja i walidacja lokalna zakończone; CI 6/6 SUCCESS dla implementacyjnego SHA. | Osobna decyzja o integracji; docs-only SHA późniejszy niż SHA workflow. | Node 311/311, Playwright 54/54, audyty 0; live OSM 16/16; benchmark median 31.1→30.8 ms, p95 32.5→32.5 ms. | Osobna feature branch; bez merge. | Kandydat zależny pozostaje niescalony. |
| 2.5.0 Visual System | Trzy motywy City/Network/Midnight wdrożone; preferencja niezależna od kampanii; czytelność i mobile zweryfikowane. | Ponowić CI dla commita dokumentującego zakończony run 6/6. | Node 315/315, Playwright 56/56, audyty 0; live OSM 16/16; benchmark Passenger Flow median 30.4→30.4 ms, p95 46.8→47.1 ms. | Osobna feature branch bazująca na kandydacie 2.0.0; bez merge. | Niewielka zmiana p95; wymagana osobna integracja 2.0 i 2.5. |
| 2.9.0 Completion gate | Audyt przeprowadzony; naprawiono niedeterministyczne `-0` w historii Living City, dodano test 104 tygodni z rzeczywistym zapisem/wznowieniem. | Wymagane osobne zatwierdzenie integracji 2.0/2.5, końcowe CI kandydata 2.9 i całościowa akceptacja po integracji. | Lokalna walidacja zakończona; brakuje push/CI końcowego SHA i zatwierdzonych integracji zależności. | Bramka końcowa | Wszystkie kryteria sekcji 13 mają jawne dowody PASS po integracji; do tego czasu INCOMPLETE. |

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

## Aktualizacja 2.5.0 Atlas Visual System — 2026-11-25

- Kandydat znajduje się na `feature/alpha-2.5.0-atlas-visual-system`, zależy od niescalonego kandydata 2.0.0.
- City, Network i Midnight są przełączalne; preferencja UI jest walidowana i odseparowana od kampanii. Uwzględniono kontrast i reduced-motion.
- Pełna lokalna walidacja: Node 315/315, Playwright 56/56, oba audyty npm 0 podatności, `git diff --check` PASS.
- Live OSM: 16/16 kafelków HTTP 200, zero błędów strony. Zrzuty desktop/mobile i rzeczywiste OSM znajdują się poza repozytorium w katalogach Temp opisanych w raporcie 2.5.0.
- Benchmark Passenger Flow (60 próbek na wersję): 2.0.0 mediana/p95 30.4/46.8 ms; 2.5.0 30.4/47.1 ms.
- GitHub Actions run `45657363522`: 6/6 SUCCESS dla SHA `0e54d62f374c187b5ea251d55bd78f07325cec0d`.
- Nie scalono ani nie otagowano. Fundament II pozostaje **INCOMPLETE** do osobnej integracji i bramki 2.9.0.

## Aktualizacja 2.9.0 Fundament II Completion Gate — 2026-11-25

- Pracę prowadzono w osobnym worktree `urbanflow-alpha-2.9.0-fundament-ii-completion`, gałąź `feature/alpha-2.9.0-fundament-ii-completion`, bazując na zweryfikowanym kandydacie 2.5.0 `0e54d62f374c187b5ea251d55bd78f07325cec0d`. `main` nie był modyfikowany.
- Audyt 104 tygodni ujawnił konkretny błąd deterministyczności: różnice atrakcyjności zaokrąglane do ujemnego zera (`-0`) zmieniały reprezentację w JSON i po odczycie dawały `+0`. Normalizacja zaokrąglonych zer w `public/js/city-evolution.js` oraz test rzeczywistego `UrbanFlowGame` z `saveGame`/`loadGame` naprawiają i zabezpieczają to zachowanie.
- Test regresyjny prowadzi kampanię do tygodnia 53, zapisuje, wznawia ją i porównuje dokładny stan Living City z niezapisanym przebiegiem aż do tygodnia 105. Potwierdza limit 12 raportów, land-use 100%, ograniczenia populacji/zatrudnienia i mnożnika popytu.
- Walidacja po poprawce: Node **316/316**, Playwright **56/56**, `npm audit` pełny i produkcyjny: **0 podatności**, `npm ci` bez podatności. Benchmarki i live OSM są opisane w `URBANFLOW-FUNDAMENT-II-FINAL-REPORT.md`; live OSM: 16/16 kafelków HTTP 200, bez błędów strony.
- Porównanie długiej kampanii na tym samym Node v24.19.0 pokazało niewielki, zmienny szum p95 ticku (mediana trzech prób 0.5780 ms bazowo / 0.6070 ms kandydat; różnica 0.029 ms), bez podstaw do deklarowania poprawy lub istotnej regresji. Rozmiar zapisu w obu wariantach: 116,970 B.
- Fundament II pozostaje **INCOMPLETE**: kandydaci 2.0.0 i 2.5.0 nie zostały zintegrowani z `main`, a polityka wymaga osobnej zgody na każdą integrację. 2.9.0 jest bramką audytową opartą na kandydatach, nie zastępuje ich integracji. Nie utworzono tagu ani wydania.
