# URBANFLOW ALPHA 0.5.0: RAPORT WDROŻENIOWY

## Status: GO do akceptacji lokalnej

- **Gałąź:** `feature/alpha-0.5.0`
- **Commit QA:** `25f8aae1d492db993967986a1d2f8c3537877877` (`fix: complete alpha 0.5 visual QA`).
- **Baza:** `main` / `76654dc` (`Release UrbanFlow 0.4.0`).
- **Pull Request:** nieutworzony. GitHub API zwróciło 403 `Resource not accessible by integration`; [otwórz formularz Draft PR do main](https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/main...feature/alpha-0.5.0?expand=1).
- **Produkcja:** bez zmian; nic nie wdrożono, nie restartowano i nie modyfikowano danych.

## Wyniki końcowej kontroli

- `node --test`: **96/96 zaliczonych**, w tym testy pełnych kampanii, routingu, profili, formularza, UI i kompatybilności zapisów.
- `npm run test:browser`: **5/5 zaliczonych** w Chromium: desktop 1920×1080, 1366×768, 1280×720 oraz mobile 390×844 i 360×800. W trakcie testu aplikacja uruchamiała się lokalnie, a mapa pobierała kafelki OpenStreetMap.
- Testy E2E weryfikują zmianę szerokości panelu i zapis preferencji, zwijanie/rozwijanie, wywołanie `invalidateSize` Leaflet, dostęp do nazw punktów klawiaturą, dotykowe profile, arkusz mobilny, szczegóły routingu, eksport pobieranego JSON, poziome przepełnienie oraz błędy JavaScript.
- Testy schematu zapisu 2 przechodzą: starszy zapis bez pól 0.3 jest ładowany i uzupełniany w pamięci, a zagnieżdżone uszkodzone dane są odrzucane bez przyjęcia ich do stanu gry.
- W testowanych przebiegach nie wykryto poziomego przepełnienia widoku ani błędów konsoli/JavaScript.
- GitHub Actions: workflow `.github/workflows/test.yml` uruchamia `npm test` na Node 18, 20 i 22. Integracja nie zwróciła żadnych runów dla QA SHA `25f8aae`; nie ma zatem potwierdzonego wyniku CI GitHub.

## Dowody wizualne

Zrzuty z rzeczywistymi kafelkami OSM zapisano poza repozytorium, aby nie dodawać binarnych artefaktów do Git:

`%TEMP%\urbanflow-alpha-0.5.0-visual-qa\`

- `desktop-1920x1080.png`
- `desktop-1366x768.png`
- `desktop-1280x720.png`
- `mobile-390x844.png`, `mobile-390x844-place-profile.png`, `mobile-390x844-feedback-json.png`
- `mobile-360x800.png`, `mobile-360x800-place-profile.png`, `mobile-360x800-feedback-json.png`

Oceniono układ mapy i panelu, profil miejsca na obu szerokościach telefonu oraz formularz eksportu. Etykiety nieaktywnych punktów są schowane, aby nie zlewały się w skupiskach; nazwa pokazuje się po najechaniu, fokusie lub zaznaczeniu punktu. Zrzuty i raporty błędów Playwright pozostają w katalogu tymczasowym.

## Wykryte i naprawione podczas QA

- Przycisk „Pokaż panel” był potomkiem paska mobilnego ukrywanego na desktopie. Przeniesiono go na warstwę mapy; test potwierdza zwijanie i ponowne rozwijanie panelu.
- Stałe nazwy pobliskich punktów nakładały się na siebie. Etykiety są teraz ujawniane kontekstowo po hoverze, fokusie klawiatury lub zaznaczeniu.
- Test mobilny miał niejednoznaczny selektor `name="description"` (konkurował z metadanymi strony); ograniczono go do formularza opinii.

## Funkcje ALPHA 0.5.0

- Panel desktopowy ma domyślnie 462 px (około 25% więcej niż wcześniejsze 370 px), ograniczenia zostawiają przestrzeń mapie, szerokość można zmieniać myszą i klawiaturą oraz zapamiętać. Na telefonie panel jest wysuwanym arkuszem.
- Karta miejsca pokazuje nazwę, typ, opis, rolę w grze, indeks popytu pochodzący z istniejącego modelu (oznaczony jako szacunkowy) i dostępne połączenia.
- Diagnostyka podglądu przedstawia długość, szacowany czas, źródło danych, algorytm, wariant i odległość przyciągania do grafu. Brak ścieżki jest jawnie oznaczany jako bezpośredni fallback.
- Formularz opinii lokalnie tworzy, kopiuje lub pobiera JSON. Dane diagnostyczne są opcjonalne i domyślnie wyłączone; aplikacja ich nie wysyła.
- Fundament Atlas udostępnia tokeny City i granicę motywów bez zmiany mechaniki gry; pozostałe widoki są opisane, ale niezaimplementowane.

## Diagnostyka routingu

- Routing gry jest lokalny i deterministyczny. Autobusy i tramwaje korzystają z ręcznie przygotowanego `roadGeometry`, kolej z `railGeometry`, metro łączy punkty bezpośrednio. Krawędzie lokalnego grafu są ważone odległością haversine i trasowane algorytmem Dijkstry.
- OSRM, Valhalla, GraphHopper i Overpass nie są wymagane ani wywoływane. Kafelki mapy korzystają z OpenStreetMap i wymagają internetu; brak kafelków nie wyłącza lokalnej symulacji.
- Test regresyjny Bronowice–Krowodrza Górka potwierdza bezpośrednią krawędź zapisanego korytarza drogowego (2,16 km). Dla 08:00 model szacuje około 7,8 min autobusem i 4,7 min tramwajem. Dokładnego zgłoszonego wariantu nie można było odtworzyć bez wskazania środka transportu i konkretnych punktów.
- Graf jest uproszczonym zbiorem korytarzy, a nie pełną siecią ulic. Nie modeluje ograniczeń kierunkowych ani odrębnej infrastruktury tramwajowej. Najbliższy wierzchołek nie ma limitu odległości przyciągania; diagnostyka pokazuje odległość snapowania.

## Instrukcja lokalnego uruchomienia i testów

```bash
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm start
```

Gra jest dostępna pod `http://localhost:3000`, a kontrola serwera pod `http://localhost:3000/health`. Playwright jest zależnością wyłącznie developerską; przeglądarka jest instalowana osobnym poleceniem.

## Znane ograniczenia i ryzyka

- Kafelki mapy i wykonanie pełnej kontroli wizualnej wymagają dostępu do OpenStreetMap; routing symulacji działa offline na lokalnych danych.
- Uproszczony graf drogowy i nielimitowany snap wprowadzają niepewność dla tras daleko od przygotowanych korytarzy.
- Workflow GitHub Actions nie został potwierdzony. Konektor blokuje utworzenie Draft PR (403); po ręcznym otwarciu PR sprawdzić macierz Node 18/20/22 przed merge.
- Pozostałe motywy Atlas nie są częścią 0.5.0.

## Rekomendowany następny krok

Przejrzeć Draft PR i ukończone kontrole GitHub Actions. Po akceptacji można wybrać konkretny zatwierdzony SHA do osobnego procesu wydania; ten raport nie autoryzuje wdrożenia.
