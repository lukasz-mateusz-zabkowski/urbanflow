# URBANFLOW ALPHA 0.6.0: RAPORT WDROŻENIOWY

## Status: GO do akceptacji

Testy lokalne i GitHub Actions przechodzą. 0.6.0 jest gałęzią zależną od kandydata 0.5.0; akceptacja nie oznacza merge ani wdrożenia. Nie scalono ani nie wdrożono żadnej zmiany.

## Gałąź i historia

- Gałąź: `feature/alpha-0.6.0`.
- Bazowy kandydat 0.5.0: `3c90459a15701539cb85459487b3a8739fe7f80b` (`feature/alpha-0.5.0`).
- Commit implementacji 0.6.0: `4752772dca26a823859df0d129a5421a83faf9c3`.
- `origin/main` na początku audytu: `76654dc076b45bd795407629d1a7ce2ff2d934a4`.
- Porównanie `origin/main` z kandydatem 0.5.0 nie wykazało konfliktów.
- Aktualny commit 0.6.0 ma zakończone powodzeniem joby Node 18/20/22 i Playwright.

## Testy i dowody

- Node: `npm test` — 104/104 zaliczone; obejmuje kampanię, regresje mechanik, routing, pasażerów, ekonomię, magazynowanie oraz nowy model rozkładów.
- Playwright: `npm run test:browser` — 7/7 zaliczone. Sprawdzono 1920×1080, 1366×768, 1280×720, 390×844 i 360×800, regulację panelu, zwijanie, `invalidateSize` Leaflet, klawiaturę, profile miejsc, eksport JSON, rozkład na desktopie i dotykiem na telefonie oraz błędy JS.
- Testy przeglądarkowe są osobnym zadaniem GitHub Actions `browser-test` i zakończyły się powodzeniem.
- GitHub Actions 0.5.0: [run 43928001412 — success](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/43928001412).
- GitHub Actions 0.6.0: [run 43936196634 — success](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/43936196634), w tym `test (18)`, `test (20)`, `test (22)` oraz `browser-test`.
- Migracja schematu 2→3 zachowuje linie i postęp kampanii; stara częstotliwość staje się jednolitym profilem pięciu przedziałów. Zapis/odczyt schematu 3 zachowuje profil i poprzednią konfigurację.
- Zrzuty Playwright są poza repozytorium: `%TEMP%\urbanflow-alpha-0.6.0-visual-qa\` (Windows). Zawierają widoki pięciu rozdzielczości, kartę miejsca, eksport opinii oraz edytor rozkładu desktop/mobile.
- Pierwsze próby wykryły błędne oczekiwanie wersji w teście eksportu i sposób obsługi otwartego panelu w teście mobilnym. Poprawiono testy; pełny przebieg zakończył się 7/7.

## Implementacja

- Dodano pięć przedziałów z granicami w danych rozkładu, także noc przechodzącą przez północ, oraz częstotliwość 0 do wyłączenia kursowania.
- Linie mają własne profile: Ekonomiczny, Zrównoważony, Intensywny i Całodobowy. Można edytować każdy przedział i przywrócić poprzednią konfigurację.
- Częstotliwość wpływa na odstępy, oczekiwanie pasażerów, przepustowość i wymaganą flotę. Koszt wykorzystuje dotychczasowe parametry pojazdu i jest ważony czasem na granicach okresów.
- Panel linii pokazuje bieżący okres, edytor częstotliwości, koszt i możliwy niedobór przepustowości.
- Wersję aplikacji i raportowania opinii zmieniono na 0.6.0. Zaktualizowano `CHANGELOG.md`, opis modelu znajduje się w `docs/URBANFLOW-TIMETABLES.md`.
- CI ma osobny job Chromium/Playwright; nie dodano nowych zależności.

## Ograniczenia i ryzyka

- Gotowe profile są wstępnymi parametrami Alpha. Zrównoważony daje średnio 3 kursy/h w dobie, zgodnie z dawnym jednolitym modelem; pozostałe wartości przeliczają skutki według obecnych kosztów i pojemności transportu.
- Model korzysta z kalendarza `all-days`. Dni robocze i weekendy są poza zakresem.
- Lokalne zrzuty korzystają z kafli OSM; CI używa deterministycznego kafla testowego.
- Draft PR 0.5.0 nadal nie istnieje, choć Actions dla jego kandydata przechodzą. Nie można scalić 0.6.0 do `main` przed zaakceptowaniem 0.5.0.
- Nie wdrażać bez akceptacji konkretnego SHA.

## Uruchomienie lokalne

```bash
npm ci
npm test
npm run test:browser
npm start
```

Gra działa pod `http://localhost:3000`. Kafelki OSM wymagają internetu; symulacja i routing są lokalne.

## PR i następny krok

Draft PR 0.5.0 nie istniał podczas audytu. Próba jego utworzenia oraz Draft PR 0.6.0 przez integrację GitHub zwróciła HTTP 403 (`Resource not accessible by integration`). Ręczny Draft PR 0.5.0:

`https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/main...feature/alpha-0.5.0?expand=1`

Gałąź 0.6.0 jest wypchnięta. Ręczny Draft PR 0.6.0 powinien kierować do `feature/alpha-0.5.0`, a nie bezpośrednio do `main`:

`https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/feature/alpha-0.5.0...feature/alpha-0.6.0?expand=1`

Następny krok: utworzyć Draft PR 0.5.0 z linku poniżej i zaakceptować/scalać go osobno. Po scaleniu 0.5.0 utworzyć lub przestawić PR 0.6.0 na `main`. Nie wykonano merge.
