# UrbanFlow Atlas — Fundament II: raport końcowy

Data przeglądu: 2026-11-25  
Audytowany stabilny `main`: `4cfb07d04c27103055e69c3ad92affd836dd205a` (`v1.11.1-alpha`)

## Wynik

# FUNDAMENT II INCOMPLETE

Nie spełniono warunków integracyjnych. Kandydaci Atlas Studio 2.0.0 i Atlas Visual System 2.5.0 mają implementację, testy oraz udokumentowane zielone GitHub Actions, ale pozostają poza `main`. Projekt wymaga osobnej zgody na integrację każdego kamienia. Nie wolno uznać 2.9.0 za ukończony, dopóki zależności nie zostaną zatwierdzone, zintegrowane i ponownie zweryfikowane.

## Macierz bramki

| Obszar Fundamentu II | Stan | Dowód / brakujący warunek |
|---|---|---|
| Ekonomia 1.12 | Istniejący system transportu, floty, kosztów, prognoz i finansów ma pokrycie w kodzie/testach; ponowna walidacja bieżącej bazy przeszła. | `npm test` na bazie 2.5: 316/316; pełny i produkcyjny audit: 0 podatności. Integracja kandydatów do `main` nadal niezatwierdzona. |
| Atlas Studio 2.0 | Kandydat PASS. | Workflow [45651570103](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45651570103), 6/6 dla implementacyjnego SHA `5dcdf9393062ce38318b733f650080a7b61b4fba`; brak integracji. |
| Atlas City / Network / Midnight 2.5 | Kandydat PASS. | Workflow [45657363522](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45657363522), 6/6 dla SHA `0e54d62f374c187b5ea251d55bd78f07325cec0d`; zależy od 2.0 i brak integracji. |
| Długa symulacja Living City | Regresja zapisu/wznowienia naprawiona i przetestowana na bazie kandydata. | 104 tygodnie; save/load po tygodniu 53; zgodność stanów do tygodnia 105; limit historii 12; pojemności i mnożnik popytu ograniczone. |
| Desktop/mobile, wydajność, OSM | Testy i odrębna kontrola OSM zaliczone na dostępnych kandydatach. | Playwright 56/56; live OSM 16/16 kafelków 200; benchmark lokalny bez istotnej regresji wykazanej. Pełna bramka musi być ponowiona na końcowym zintegrowanym `main`. |
| Integracja, końcowe CI i tag 2.9 | Nie wykonano. | Brakuje osobnej zgody na 2.0/2.5; brak końcowego `main` i workflow na zintegrowanym SHA. Nie utworzono tagu ani wydania. |

## Wykonana poprawka bramki 2.9

Test długiej kampanii wykrył różnicę reprezentacji wartości ujemnego zera (`-0`) w `lastChange` Living City: JSON normalizował ją do `0`, przez co wznowiony przebieg nie był identyczny. Zaokrąglone zera są teraz normalizowane w `public/js/city-evolution.js`, a `test/city-evolution.test.js` sprawdza rzeczywisty `UrbanFlowGame`, zapis i wznowienie oraz dokładną deterministyczność przez 104 tygodnie.

## Walidacja aktualnego kandydata bramki

- `npm ci`: PASS, 72 pakiety.
- `npm test`: PASS, 316/316.
- `npm run test:browser`: PASS, 56/56.
- `npm run audit:all`: PASS, 0 podatności.
- `npm run audit:production`: PASS, 0 podatności.
- Live OSM: PASS, 16/16 unikalnych kafelków HTTP 200, bez błędów JS.
- Benchmark porównawczy ticku: mediana z trzech prób 0.3664 ms (`main` 1.11.1) vs 0.3844 ms (kandydat); p95 0.5780 vs 0.6070 ms; różnica niewielka i zależna od szumu lokalnego. Rozmiar zapisu po obu stronach 116,970 B.
- Living City: tygodniowa ewolucja dla 22 obszarów, mediana/p95 0.28/0.38 ms przy jednej linii oraz 0.81/1.55 ms przy 20 liniach. Pomiary wykonano lokalnie na Node v24.19.0; nie są prognozą wydajności Raspberry Pi.
- Zrzut rzeczywistych kafelków: `C:\Users\Łukasz\AppData\Local\Temp\urbanflow-fundament-ii-visual-qa\desktop-live-osm-1366x768.png`.

## Pozostałe wymagania

1. Uzyskać osobną zgodę na integrację kandydata 2.0.0 z `main`.
2. Po tym uzyskać osobną zgodę i zintegrować zależny kandydat 2.5.0.
3. Ponownie uruchomić pełny zestaw Node, Playwright, audytów, OSM, wizualny odbiór i benchmarki na wynikowym `main`.
4. Dopiero po pełnym PASS uruchomić bramkę 2.9.0 na zintegrowanym stanie, potwierdzić CI końcowego SHA i uzyskać wymagane zgody na ewentualne tagowanie.

Nie wykonano zmian na produkcji, Raspberry Pi ani na `main`. Raporty i kod bramki 2.9 są na osobnej gałęzi. GitHub Actions [run 45663846153](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45663846153) zakończył się 6/6 SUCCESS dla SHA `57695c54506fafce096e64211d8edfeb3b23bac9`. Aktualizacja tego raportu tworzy kolejny commit, dla którego workflow należy sprawdzić osobno. Decyzja pozostaje **FUNDAMENT II INCOMPLETE**.
