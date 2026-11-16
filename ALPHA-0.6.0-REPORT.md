# URBANFLOW ALPHA 0.6.0: RAPORT WDROŻENIOWY

## Status: NO GO do zatwierdzenia wydania

Kod i lokalne testy są gotowe do przeglądu. Zależność od 0.5.0 pozostaje otwarta: zatwierdzony kandydat 0.5.0 nie ma potwierdzonego wyniku GitHub Actions ani istniejącego PR, a dostępna integracja GitHub zwróciła 403 przy próbie utworzenia Draft PR. 0.6.0 jest gałęzią zależną od tego kandydata. Nie scalono ani nie wdrożono żadnej zmiany.

## Gałąź i historia

- Gałąź: `feature/alpha-0.6.0`.
- Bazowy kandydat 0.5.0: `3c90459a15701539cb85459487b3a8739fe7f80b` (`feature/alpha-0.5.0`).
- `origin/main` na początku audytu: `76654dc076b45bd795407629d1a7ce2ff2d934a4`.
- Porównanie `origin/main` z kandydatem 0.5.0 nie wykazało konfliktów.
- Finalny SHA 0.6.0 zostanie wpisany po commicie.

## Testy i dowody

- Node: `npm test` — 104/104 zaliczone; obejmuje kampanię, regresje mechanik, routing, pasażerów, ekonomię, magazynowanie oraz nowy model rozkładów.
- Playwright: `npm run test:browser` — 7/7 zaliczone. Sprawdzono 1920×1080, 1366×768, 1280×720, 390×844 i 360×800, regulację panelu, zwijanie, `invalidateSize` Leaflet, klawiaturę, profile miejsc, eksport JSON, rozkład na desktopie i dotykiem na telefonie oraz błędy JS.
- Testy przeglądarkowe mają osobne zadanie GitHub Actions `browser-test`; wykonanie workflow dla nowego SHA należy potwierdzić po publikacji gałęzi.
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
- Status GitHub Actions dla 0.5.0 i nowego SHA 0.6.0 nie został jeszcze potwierdzony.
- Bezpieczna kolejność: najpierw zatwierdzić i scalić 0.5.0, następnie bazować PR 0.6.0 na `main`. Nie wdrażać bez akceptacji konkretnego SHA.

## Uruchomienie lokalne

```bash
npm ci
npm test
npm run test:browser
npm start
```

Gra działa pod `http://localhost:3000`. Kafelki OSM wymagają internetu; symulacja i routing są lokalne.

## PR i następny krok

Draft PR 0.5.0 nie istniał podczas audytu. Próba utworzenia przez integrację GitHub zwróciła HTTP 403. Po wypchnięciu tej gałęzi Draft PR 0.6.0 powinien kierować do `feature/alpha-0.5.0`, a nie bezpośrednio do `main`:

`https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/feature/alpha-0.5.0...feature/alpha-0.6.0?expand=1`

Następny krok: wypchnąć gałęzie, przygotować Draft PR 0.5.0 i potwierdzić jego Node Actions; po scaleniu 0.5.0 uruchomić Actions 0.6.0 oraz przestawić jego PR na `main`.
