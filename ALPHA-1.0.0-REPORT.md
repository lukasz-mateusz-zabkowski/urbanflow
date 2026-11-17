# URBANFLOW ALPHA 1.0.0: RAPORT WDROŻENIOWY

## Status

**GO do akceptacji jako kandydat ALPHA 1.0.0.** Zmiany są na gałęzi `feature/alpha-1.0.0`, utworzonej na bazie zatwierdzonego kandydata 0.9.0 `e15f0bcdbdad2b09cec2aca3ffb34e6ea26f4dd0`. Implementacja: `199895beefdfc53a20f73c2c1f7b2c2df3bce466`. Produkcja nie była modyfikowana; nie wykonano merge ani wdrożenia.

Ten status dotyczy gotowości do przeglądu. Nie jest zgodą na wydanie produkcyjne. GitHub nie pozwolił utworzyć Draft PR (403), więc recenzja przez PR pozostaje do wykonania ręcznie.

## Testy i CI

- Node: **135 zaliczonych, 0 niezaliczonych** (`npm test`). Obejmują scenariusze ekonomiczne, długie kampanie, deterministyczność, historię, migracje, niezmienniki pasażerów i benchmark.
- Playwright: **7 zaliczonych, 0 niezaliczonych** (`npm run test:browser`). Widoki desktopowe 1920×1080, 1366×768, 1280×720 i mobilne 390×844, 360×800; sprawdzone Atlas Network, panel, rozmiar mapy, brak przepełnienia, błędy JS i podstawowe interakcje.
- GitHub Actions dla implementacji: **success**, run [#44046314953](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44046314953), SHA `199895beefdfc53a20f73c2c1f7b2c2df3bce466`. Zadania Node (18, 20, 22) i browser zakończyły się sukcesem.
- `git diff --check`: czysto.

## Zmiany

- Historia analityczna jest wielopoziomowa i ograniczona: 96 szczegółowych próbek, 84 agregaty dobowe, 12 tygodniowych.
- Dodano oddzielne metryki pokrycia punktów, dostępności podróży, niezaspokojonego popytu, wykorzystania pojemności i faktycznie przewiezionych pasażerów. Pokrycie siecią nie jest prezentowane jako dowód na dostępność połączenia ani jako liczba pasażerów na segmencie.
- Agregaty poprawnie sumują przepływy finansowe i pasażerów oraz ważą średnie. Wartości procentowe są agregowane, a nie sumowane. Czas ticku przypisuje się do okresu, w którym tick faktycznie przebiegał.
- Interfejs Atlas Network pokazuje bieżące, dobowe i tygodniowe podsumowania oraz definicje wskaźników.
- **Nie zmieniono stawek ekonomicznych.** Dokumentacja opisuje istniejące źródła przychodów i zależności kosztów.

## Scenariusze ekonomiczne

Powtarzalne scenariusze obejmują krótką i długą linię autobusową, tramwaj o dużym popycie, trzy linie z przesiadkami, niedobór floty, nadmierną częstotliwość, ograniczony budżet oraz rozbudowaną sieć. Poniżej wynik 24 godzin pracy; bilans to przychody operacyjne minus koszty operacyjne. Jednorazowe zakupy infrastruktury i pojazdów są wyłączone, co jest istotne dla interpretacji scenariusza ograniczonego budżetu.

| Scenariusz | Przychody | Koszty | Bilans | Przewiezieni | Śr. oczekiwanie | Dostępność podróży | Flota przypisana/wymagana | Niezrealizowany popyt* |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Krótki autobus | 14 303 | 1 962 | +12 341 | 1 768 | 12,94 min | 95,1% | 2/2 | 92 |
| Długi autobus | 41 755 | 3 778 | +37 977 | 4 711 | 37,12 min | 98,1% | 3/4 | 92 |
| Tramwaj, duży popyt | 37 666 | 13 202 | +24 464 | 4 598 | 6,00 min | 98,1% | 8/7 | 92 |
| Trzy linie z przesiadkami | 52 420 | 10 011 | +42 409 | 5 888 | 30,58 min | 93,9% | 9/12 | 408 |
| Niedobór floty | 14 028 | 1 766 | +12 262 | 1 734 | 18,51 min | 95,1% | 1/4 | 92 |
| Nadmierna częstotliwość | 13 163 | 4 314 | +8 849 | 1 627 | 6,00 min | 94,7% | 8/4 | 92 |
| Ograniczony budżet początkowy | 13 292 | 1 962 | +11 330 | 1 643 | 12,20 min | 94,8% | 2/2 | 92 |
| Rozbudowana sieć, 20 linii metra | 119 143 | 781 784 | **−662 641** | 11 243 | 9,55 min | 99,5% | 160/151 | 59 |


où* Wartość testowego scenariusza obejmuje niezrealizowany popyt z generatora i przypadki odmowy; nie należy jej interpretować jako wyłącznej liczby osób stojących obecnie w kolejce. Wyniki pokazują, że większa oferta poprawia oczekiwanie lub dostępność kosztem floty i eksploatacji, a rozbudowana, kosztowna sieć może przynosić stratę. Nie narzucono zyskowności każdemu układowi.

## Kampanie długoterminowe i stabilność

Przyspieszone, deterministyczne przebiegi bazowego silnika pasażerów i ekonomii sprawdzono dla 1 dnia, tygodnia, 4 i 12 tygodni. Stan 12 tygodni: 120 960 minut, 149 468 przewiezionych, 149 491 wygenerowanych, 0 porzuconych w tym scenariuszu, 5 kohort na końcu; finanse pozostają skończone. Kontrole sprawdzają bilans liczników i brak wartości NaN/Infinity oraz ujemnych liczników.

Dwanaście tygodni zserializowano i odczytano: zapis miał 106 987 bajtów, historia zachowała limity, a następne 60 ticków odtworzyło identyczny stan. Powtórzony tygodniowy przebieg dał identyczne wyniki. Cztery kampanie z ustalonymi ziarnami zakończyły się; maksymalnie 91–106 kohort, zapis 141–166 KB.

## Historia, kompatybilność i analityka

Schemat zapisu podniesiono z 6 do 7. Migracje 2–6 zachowują kampanię, budżet, flotę, linie, rozkłady, kalendarz, kohorty i mobilność. Historia schematu 6 jest normalizowana do pola pokrycia; brakujące pomiary dostępności podróży nie są dopowiadane. Testy migracji oraz długiego zapisu i odczytu przechodzą.

## Wydajność

Benchmark po rozgrzaniu raportuje medianę i p95 (dla małej liczby powtórzeń p95 jest bliskie maksimum), pamięć procesu, kohorty i koszt analityki. Wyniki bieżące, mediana/p95 w ms na tick:

| Linie / pasażerowie / kohorty | Bez historii | Z historią |
|---|---:|---:|
| 5 / 100 / 100 | 1,19 / 1,31 | 1,30 / 1,41 |
| 20 / 1 000 / 500 | 1,01 / 1,32 | 1,01 / 1,33 |
| 50 / 5 000 / 500 | 3,58 / 4,35 | 3,39 / 4,96 |
| Obciążenie: 100 / 5 000 / 1 000 | 12,52 / 16,13 | 12,39 / 13,26 |

W scenariuszu obciążeniowym szczyt heap wyniósł około 42,6–42,9 MB, RSS 122–124 MB. Pomiar różnicy kosztu historii mieścił się w zmienności środowiska dla większych scenariuszy; nie wskazuje na stabilny koszt ponad szum. Porównanie z bazowym 0.9.0 na tej samej maszynie nie wykazało spójnej regresji. To benchmark deweloperski, nie prognoza dla Raspberry Pi.

## Zrzuty i dokumentacja

Zrzuty desktop i mobile oraz widok trendów są artefaktami lokalnymi poza repozytorium: `%TEMP%\urbanflow-alpha-1.0.0-visual-qa`. Weryfikacja nie dodawała dużych obrazów do repozytorium. Definicje analityki i ograniczenia opisano w `docs/URBANFLOW-NETWORK-INTELLIGENCE.md`; szczegóły zmian są w `CHANGELOG.md`.

## Pull Requesty i zależności wydań

Nie znaleziono istniejących PR-ów. Utworzenie Draft PR dla każdego kandydata 0.5–1.0 zwróciło 403 `Resource not accessible by integration`; prób nie ponawiano. Wersja 1.0.0 zależy od 0.9.0 i musi być recenzowana/scalana po niej. Ręczne linki:

| Wersja | Head | Base | Utwórz PR |
|---|---|---|---|
| 0.5.0 | `feature/alpha-0.5.0` | `main` | [Draft PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.5.0?base=main) |
| 0.6.0 | `feature/alpha-0.6.0` | `feature/alpha-0.5.0` | [Draft PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.6.0?base=feature/alpha-0.5.0) |
| 0.7.0 | `feature/alpha-0.7.0` | `feature/alpha-0.6.0` | [Draft PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.7.0?base=feature/alpha-0.6.0) |
| 0.8.0 | `feature/alpha-0.8.0` | `feature/alpha-0.7.0` | [Draft PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.8.0?base=feature/alpha-0.7.0) |
| 0.9.0 | `feature/alpha-0.9.0` | `feature/alpha-0.8.0` | [Draft PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.9.0?base=feature/alpha-0.8.0) |
| 1.0.0 | `feature/alpha-1.0.0` | `feature/alpha-0.9.0` | [Draft PR 1.0.0](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-1.0.0?base=feature/alpha-0.9.0) |

## Ograniczenia i następny krok

Scenariusze ekonomiczne mierzą koszty operacyjne, a nie koszt jednorazowej budowy i zakupu floty. Wykorzystanie pojemności pozostaje wskaźnikiem zagregowanym, nie śledzeniem pasażerów na każdym segmencie. Wyniki benchmarku zależą od sprzętu i obciążenia procesu. Dostęp integracji GitHub blokuje utworzenie PR.

**Rekomendacja:** utworzyć ręcznie Draft PR 1.0.0 do gałęzi 0.9.0, przejrzeć raport i zmiany, a następnie scalać wersje sekwencyjnie po zatwierdzeniu; bez wdrożenia produkcyjnego.

