# UrbanFlow ALPHA 1.1.0 — raport wdrożeniowy

## Status

**NO GO do czasu potwierdzenia GitHub Actions dla końcowego SHA.** Lokalny kod i testy są przygotowane; wynik CI zostanie uzupełniony po wypchnięciu gałęzi.

- Gałąź: `feature/alpha-1.1.0`
- Baza: `main` / `f3345937a14e65546a7c15e5f0887ea19df23541` (`1.0.1-alpha`)
- Commit implementacji: oczekuje na commit
- Końcowy HEAD: oczekuje na commit raportu i wynik CI
- PR: nie utworzono; gałąź zostanie wypchnięta do przeglądu
- Merge, tag, GitHub Release i wdrożenie: niewykonane

## Zaimplementowane mechaniki

- Dodano deterministyczne, tygodniowe profile 22 istotnych obszarów miasta zbudowane na istniejących punktach i profilach miejsca. Przystanki lokalne nie tworzą osobnych dzielnic ani obiektów mieszkańców.
- Wartości mieszkańców i miejsc pracy są jawnie opisane jako parametry symulacyjne, a nie rzeczywiste statystyki Krakowa. Każdy obszar ma bazę, ograniczenia wzrostu i pojemność.
- Dostępność jest wyliczana z grafu istniejących linii. Rozkłady próbkowane są dla kilku pór oraz dni roboczych, sobót i niedziel; brak kursowania usuwa dostępność. Kolejki/oczekiwanie i wykorzystanie pojemności zmniejszają ocenę transportową i atrakcyjność.
- Atrakcyjność jest wygładzana co tydzień. Zmiana ludności i miejsc pracy jest ograniczona do ±0,45% tygodniowo, a poziomy obszarów do 75–120% baz. Mnożnik popytu mieszkańców jest ograniczony do 0,8–1,25.
- Zmiana populacji wpływa na liczbę pasażerów w istniejących regularnych wzorcach i na prognozę popytu. Symulacja nadal wykorzystuje kohorty i istniejący silnik trasowania.
- Dodano warstwę Atlas City Evolution, legendę, wybór obszaru, wartości aktualne i tygodniowe zmiany oraz listę wynikających z danych obserwacji transportowych.
- Tygodniowy raport pokazuje zmianę populacji i miejsc pracy, modelowaną zmianę popytu, obszary ze wzrostem/spadkiem, problemy dostępności i wynik finansowy sieci z zamkniętego tygodnia. Nie dodaje środków do budżetu gracza.
- `package.json`, `package-lock.json` i zgłoszenia testerów wskazują wersję `1.1.0-alpha`.

## Zapis i migracje

- Schemat zapisu zwiększono z 7 do 8.
- Migracje schematów 2–7 zachowują budżet, linie, flotę, rozkłady, kalendarz, kohorty, mobilność i kampanię. Nowe profile otrzymują deterministyczne wartości startowe.
- Walidator schematu 8 sprawdza klucze obszarów, liczniki, zakresy atrakcyjności, pojemności oraz ograniczoną historię tygodniową. Uszkodzony zapis pozostaje chroniony dotychczasowym mechanizmem recovery.
- Nowy model obejmuje 22 obszary; początkowy zapis testowy zwiększył się o około 11,2 KB. Historia zachowuje maksymalnie 12 raportów; w benchmarku profil z raportami zajmował 13,9 KB.

## Wyniki scenariuszy i ekonomia

- Testy obejmują sieć dobrze skomunikowaną, izolowaną, przeciążoną, nową linię mieszkaniowo-pracowniczą, linię o niskim wykorzystaniu, sieć wieloliniową oraz długoterminowy wzrost i spadek.
- Powtarzane scenariusze 12-tygodniowe dają identyczne wyniki dla tego samego stanu. Połączenie z obszarami pracy zwiększa modelowaną atrakcyjność i stopniowo zmienia populację oraz miejsca pracy; odizolowany obszar stopniowo traci atrakcyjność.
- W porównaniu 12-tygodniowym Bieżanów obsługiwany linią do Centrum, Dworca i Ruczaju osiągnął 11 468 modelowanych mieszkańców i 2 652 miejsca pracy; wariant bez linii osiągnął 11 155 mieszkańców i 2 594 miejsca pracy. To różnica scenariusza symulacyjnego (+313 i +58), nie prognoza demograficzna.
- Testy potwierdzają limity pojemności, brak wartości niefinitywnych, tygodniowy raport ograniczony do 12 rekordów i brak nowego przychodu/budżetu z rozwoju miasta.
- Podsumowanie finansowe jest pobierane z dotychczasowej historii operacyjnej sieci. Stawki biletowe, dopłaty i wzory kosztów pozostają bez zmian.

## Wydajność

Benchmark wykonano na tym samym komputerze dla bazy `1.0.1-alpha` i gałęzi 1.1.0. Pomiary dotyczą testu `test/mobility-performance.test.js`; czasy zależą od obciążenia środowiska.

| Linie / pasażerowie | 1.0.1 mediana / p95 na tick | 1.1.0 mediana / p95 na tick |
|---|---:|---:|
| 5 / 100 | 1,07 / 1,40 ms | 0,80 / 0,91 ms |
| 20 / 1 000 | 0,93 / 1,29 ms | 0,73 / 0,91 ms |
| 50 / 5 000 | 3,32 / 4,18 ms | 2,69 / 2,93 ms |
| 100 / 5 000 | 11,69 / 14,31 ms | 9,96 / 10,61 ms |

Oddzielny benchmark tygodniowego przeliczenia 22 obszarów i 20 linii (60 próbek po rozgrzaniu) raportował medianę 0,45 ms i p95 0,871 ms. Warstwa mapy działa nad istniejącym rendererem Leaflet i rysuje wyłącznie istniejące punkty obszarów. Wyniki nie są gwarancją wydajności na Raspberry Pi.

## QA i bezpieczeństwo

Końcowe lokalne wyniki zostaną uzupełnione po ostatnim przebiegu przed commitem.

- `npm ci`: zakończone powodzeniem; 0 podatności podczas instalacji.
- `npm test`: 147/147.
- `npm run test:browser`: 7/7, w tym desktop 1920×1080, 1366×768, 1280×720 oraz mobile 390×844 i 360×800.
- `npm run audit:all`: 0 podatności.
- `npm run audit:production`: 0 podatności.
- GitHub Actions dla końcowego SHA: oczekuje na push.

Zrzuty z Playwright są zapisane poza repozytorium w:

`C:\Users\Łukasz\AppData\Local\Temp\urbanflow-alpha-1.1.0-visual-qa`

Zawierają widoki całej gry, panel Atlas City Evolution, Atlas Network i dotychczasowe ekrany mobilne/desktopowe.

## Ograniczenia i ryzyka

- Populacja i liczba miejsc pracy są parametrami rozgrywki, nie pomiarem demograficznym.
- Dostępność używa łączności grafu i próbkowania rozkładów; nie jest wyliczeniem rzeczywistego czasu dojazdu ani modelem odległości od zatrudnienia.
- Model obejmuje istniejące obszary Krakowa. Nie tworzy nowej geometrii, nie zmienia kształtu dzielnic ani nie implementuje rozwoju zabudowy.
- Wskaźniki pokazują modelowane zależności gry, nie dowód przyczynowości w realnym mieście.
- Benchmarki uruchomiono na developerskim Surface Book. Docelowe zachowanie na urządzeniach graczy wymaga dalszych pomiarów.

## Rekomendacja

Po potwierdzeniu zielonego GitHub Actions na końcowym SHA rekomendacja to **GO do akceptacji kandydata 1.1.0**. Nie scalać automatycznie z `main`; następny sprint powinien zebrać opinie testerów o tempie zmian i kalibracji parametrów obszarów.
