# UrbanFlow ALPHA 1.3.0 — raport

## Status

**Status techniczny: GO dla przeglądu na gałęzi; bez integracji z `main`.** Push zakończony, GitHub Actions SUCCESS. Produkcja nie była modyfikowana.

- Baza: `17cd2b35d858690a986fe7bebbe167c480082dca` (`main`, `v1.2.1-alpha` pozostaje bez zmian).
- Gałąź robocza: `feature/alpha-1.3.0`.
- Commit implementacji: `0c9040a5b1b94bea846832e8a7d309ef7380a814`.
- Końcowy SHA kodu: `0c9040a5b1b94bea846832e8a7d309ef7380a814`; późniejszy commit raportu nie zmienia kodu gry.
- GitHub Actions: SUCCESS, 6/6 jobs; [run 44391079902](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44391079902) dla gałęzi z końcowym kodem.

## Zmiany

- Dodano trzy jawnie wycenione inwestycje: rozwój mieszkaniowy (85 000, 3 tygodnie), gospodarczy (110 000, 4 tygodnie) oraz modernizację obsługi istniejącego, obsługiwanego węzła (72 000, 2 tygodnie).
- Gra ma jeden istniejący budżet kasowy, więc inwestycje i transport konkurują o te same środki. Plan nie pobiera środków. Zatwierdzenie pobiera koszt jednorazowo; anulowanie projektu w realizacji zwraca 50% kosztu. Niedostępne środki, brak rezerwy albo nieobsługiwany węzeł blokują zatwierdzenie. Nakłady i utrzymanie są osobno raportowane i nie są dopisywane do przychodów, dopłat ani kosztów operacyjnych sieci. Nie dodano nowego źródła finansowania.
- Rozwój mieszkaniowy i gospodarczy rezerwuje teren oraz zwiększa pojemność, a nie liczbę mieszkańców/miejsc pracy w chwili zakupu. Efekty atrakcyjności i zmian pojemności wchodzą przez istniejące, ograniczone cykle Land Use/City Evolution, co pozwala użyć istniejących profili popytu bez tworzenia drugiego generatora.
- Ulepszenie węzła zwiększa limit kolejki tego przystanku o 50% na poziom, z limitem 2×, i kosztuje 400 tygodniowo za poziom. Nie dodaje przychodu przewoźnika ani nie zmienia taryf.
- Projekty mają stany planowania, realizacji, ukończenia i anulowania; naliczenie kosztu, ukończenie i tygodniowy rozrachunek są idempotentne. Dodano panel Atlas Investments, statusy na mapie oraz tygodniowy raport inwestycji.
- Schemat zapisu 10 zachowuje wcześniejsze pola kampanii i inicjuje brakujące inwestycje pustym, deterministycznym stanem. Zapisane zapisy starsze niż 10 nadal są odrzucane jako niewspierane.

## Walidacja

Pełna walidacja lokalna i zdalna:

- `npm ci`: zaliczone (bez nowych zależności; 0 podatności podczas instalacji).
- `npm test`: 198/198 zaliczone po końcowym audycie inwestycji.
- `npm run test:browser`: 15/15 zaliczone, w tym ponowne wczytanie zapisanej kampanii i prezentacja rezultatu ukończonej inwestycji.
- `npm run audit:all`: 0 podatności.
- `npm run audit:production`: 0 podatności.
- 52-tygodniowe testy deterministyczności, wzrostu, kosztów utrzymania, ograniczeń pojemności i zapisu/wznowienia znajdują się w `test/investments.test.js`.
- Regresje końcowe: zatwierdzanie po przegranej kampanii jest blokowane bez obciążenia budżetu; równoległe projekty respektują rezerwę i limit intensywności; modernizacja węzła kończy się i utrzymuje po usunięciu linii; ukończenie na granicy tygodnia pozostaje idempotentne po zapisie i wznowieniu.
- Wizualne artefakty Playwright: `%TEMP%\urbanflow-alpha-1.3.0-visual-qa\investments-1366x768.png` oraz `investments-390x844.png` (nie są dodawane do repozytorium).

### Benchmark względem 1.2.1

Mierzono 5 rund po 240 ticków. Pomiary są orientacyjne; są wrażliwe na JIT/GC i nie stanowią progu sprzętowego.

| Wariant | Mediana ticku | p95 | Różnica zapisu |
|---|---:|---:|---:|
| 1.2.1, bez projektów | 0.421 ms | 0.951 ms | baza 103 280 B |
| 1.3.0, bez projektów | 0.437 ms | 0.995 ms | 103 448 B |
| 1.3.0, sześć aktywnych projektów | 0.441 ms | 1.086 ms | 105 439 B |

Różnica mediany między porównywalnymi przebiegami bez projektów wyniosła około +3.8%; sześć aktywnych projektów dało +4.8% wobec 1.2.1. p95 zmieniło się z 0.951 ms do 0.995 ms bez aktywnego portfela i do 1.086 ms z sześcioma projektami. Zapis zwiększył się o 168 B bez projektów oraz 2 159 B z sześcioma. Benchmark przeplata warianty, wykonuje rozgrzewkę i wymusza GC przed pomiarem pamięci; wciąż są to krótkie pomiary lokalne, podatne na JIT/GC, więc nie stanowią twardej gwarancji wydajności. Raportowany heap delta jest wskazówką, nie miarą pamięci całego procesu.

## Zrzuty i ograniczenia

Zrzuty są odkładane w katalogu tymczasowym systemu, nie w repozytorium. UI używa symbolicznych markerów obszaru, bo gra nie ma geometrii działek. Inwestycje są parametrami alpha; korzyści miasta nie zasilają budżetu przewoźnika. Rozbudowa wymaga tygodniowej ewolucji, dostępności i terenu, więc nie gwarantuje zasiedlenia ani zwrotu finansowego.

## GitHub

- Push gałęzi: potwierdzony; kod i raport są na `feature/alpha-1.3.0`, a zdalny HEAD został sprawdzony po pushu.
- Actions dla SHA `2c2f3b9dcc0e4d8469ed066bad45f3e821a8a78f`: SUCCESS, 6/6 jobs.
- Merge, tag i release: nie wykonano.
