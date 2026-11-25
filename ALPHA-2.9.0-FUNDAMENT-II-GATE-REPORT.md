# UrbanFlow Atlas — 2.9.0 Fundament II Completion Gate

Data: 2026-11-25  
Gałąź: `feature/alpha-2.9.0-fundament-ii-completion`  
Baza kandydata: `0e54d62f374c187b5ea251d55bd78f07325cec0d` (`feature/alpha-2.5.0-atlas-visual-system`)  
Bazowy `main`: `4cfb07d04c27103055e69c3ad92affd836dd205a` (`v1.11.1-alpha`)

## Decyzja

**FUNDAMENT II INCOMPLETE.**

Przegląd i naprawa regresji Living City przeszły lokalne testy. Nie można jednak zamknąć Fundamentu II: kandydaci 2.0.0 i 2.5.0 nie są zintegrowani z `main`, a reguły projektu wymagają osobnej zgody na każdą integrację. Kandydat 2.9.0 nie zastępuje tej zgody ani integracji. Nie wykonano merge, tagowania, wydania ani wdrożenia.

## Zakres przeglądu i poprawka

Sprawdzono Living City, City Evolution, Land Use, dostępność transportu, popyt, raporty tygodniowe i migrację schematu 11→12. Dodano test z prawdziwą instancją `UrbanFlowGame`, używający `saveGame` i `loadGame`, który symuluje 104 tygodnie i porównuje przebieg po wznowieniu.

Test ujawnił, że zaokrąglona zmiana atrakcyjności mogła być `-0`. JSON zapisuje ją jako `0`, przez co dokładny stan po wznowieniu różnił się od stanu niezapisanego. `roundTenth` normalizuje zaokrąglone zera do dodatniego `0`; regresja jest sprawdzana w obu polach atrakcyjności.

Zmiana nie zmienia stawek ekonomicznych, reguł wzrostu ani numeru schematu. Jest ograniczona do reprezentacji wartości i deterministyczności zapisu.

## Długoterminowy test Living City

- Symulacja trwa od tygodnia 1 do 105, z zapisem i wznowieniem w tygodniu 53.
- Dokładny stan `cityEvolution` oryginału i wznowionej kampanii jest porównywany po każdym kolejnym tygodniu.
- Historia pozostaje ograniczona do 12 raportów, a brak obserwacji sieci pozostaje `null`.
- Test potwierdza pojemności mieszkańców i miejsc pracy, udziały Land Use sumujące się do 100% oraz mnożnik popytu w granicach 0.8–1.25.
- Lokalne benchmarki Living City: przy 1 linii tygodniowa ewolucja mediana/p95 0.28/0.38 ms, zapis 131,605 B; przy 20 liniach 0.81/1.55 ms, zapis 128,914 B. To pomiary tego środowiska, nie gwarancja dla Raspberry Pi.
- Trzy scenariusze modelowe po 12 i 52 tygodniach pokazują różnice dostępności, populacji i popytu między brakiem transportu, transportem oraz transportem z inwestycją. Są to parametry symulacji, nie obserwowane dane demograficzne.

## Testy i bezpieczeństwo

| Kontrola | Wynik |
|---|---:|
| `npm ci` | PASS; 72 pakiety, 0 podatności zgłoszonych podczas instalacji |
| `npm test` | PASS, 316/316 |
| `npm run test:browser` | PASS, 56/56 |
| `npm run audit:all` | PASS, 0 podatności |
| `npm run audit:production` | PASS, 0 podatności |
| Live OSM | PASS, 16/16 unikalnych kafelków HTTP 200, 0 błędów JavaScript |
| `git diff --check` | PASS po końcowych zmianach |

Live OSM został weryfikowany osobno od testowych kafelków przeglądarkowych. Benchmark porównawczy względem bazowego `main`, Node v24.19.0, 3 powtórzenia po rozgrzaniu i 300 ticków: mediana ticku w trzech próbach 0.3664 ms bazowo / 0.3844 ms kandydat; p95 0.5780 / 0.6070 ms. Różnica p95 wyniosła 0.029 ms i mieści się w zmienności pomiarów; nie deklaruje się poprawy ani istotnej regresji. Rozmiar zapisu w obu wariantach: 116,970 B.

Zrzut rzeczywistej mapy: `C:\Users\Łukasz\AppData\Local\Temp\urbanflow-fundament-ii-visual-qa\desktop-live-osm-1366x768.png`. Nie dodano kafelków źródłowych ani zrzutów do repozytorium.

## Status zależności i dalsza praca

| Kamień | Kandydat | CI | Integracja |
|---|---|---|---|
| 2.0.0 Atlas Studio | `feature/alpha-2.0.0-atlas-studio`, implementacyjny SHA `5dcdf9393062ce38318b733f650080a7b61b4fba` | Run [45651570103](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45651570103), 6/6 | Nie scalony; wymaga osobnej zgody |
| 2.5.0 Atlas Visual System | `feature/alpha-2.5.0-atlas-visual-system`, SHA `0e54d62f374c187b5ea251d55bd78f07325cec0d` | Run [45657363522](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45657363522), 6/6 | Nie scalony; zależy od 2.0.0 i wymaga osobnej zgody |
| 2.9.0 gate | `feature/alpha-2.9.0-fundament-ii-completion` | Do uruchomienia dla końcowego SHA po pushu | Kandydat audytowy, bez merge/tagu |

Następny logiczny krok: uzyskać osobną zgodę na integrację 2.0.0, następnie 2.5.0 zgodnie z zależnością, uruchomić CI na wynikowym `main`, a potem powtórzyć bramkę 2.9.0 na zintegrowanej bazie. Dopiero komplet dowodów PASS może zmienić decyzję na `FUNDAMENT II COMPLETE`.
