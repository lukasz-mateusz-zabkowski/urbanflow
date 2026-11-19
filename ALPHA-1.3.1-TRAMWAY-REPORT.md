# UrbanFlow ALPHA 1.3.1 — raport tramwajów

## Status

**GO do przeglądu technicznego.** Poprawki są na gałęzi `feature/alpha-1.3.1-tramway-construction`. Implementacja: `2f6ebffd5af66afd9eb5d725cad2953d5c9a113c`, oparta na `df1fb5c7d947b5f52a76d0cef615765b22035916`. Nie scalano do `main`, nie tworzono tagu ani wydania i nie wykonywano wdrożenia.

GitHub Actions dla commita implementacji zakończyły się sukcesem: [run 44535725863 — 6/6 zadań](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44535725863). Aktualizacja tego raportu jest osobnym commitem dokumentacyjnym; zdalny HEAD po tej aktualizacji należy sprawdzić w końcowym podsumowaniu gałęzi.

## Naprawione problemy

- `editLine()` uwzględnia zmianę geometrii, trybu trasowania i referencji torów, nawet gdy lista przystanków się nie zmienia. Brak zmian nie pobiera opłaty ani nie resetuje statystyk.
- Zmiana punktu kontrolnego powoduje nowy podgląd odległości, czasu i kosztu. Po zatwierdzeniu geometria jest zapisywana i ponownie używana przez animację pojazdów.
- Torowisko jest zatwierdzane dopiero po walidacji całego planu; nowa infrastruktura jest przygotowywana i sprawdzana przed podmianą stanu. Podgląd i anulowanie są bezkosztowe.
- Koszt przebudowy obejmuje nowe odcinki oraz koszt prac; istniejące tory nie są naliczane ponownie, a porzucone odcinki pozostają własnością kampanii bez zwrotu.
- Planowanie dzieli geometrię w miejscach rzeczywistego styku końca odcinka z istniejącym torem. Częściowo wspólne odcinki są wykrywane przy tolerancji 0,75 m; biegnące równolegle tory pozostają odrębne.
- Dodano ręczną obsługę punktów kontrolnych: wybór, przeciąganie, usuwanie, cofanie/ponawianie, anulowanie oraz przywracanie zatwierdzonego przebiegu. Punkty nie są przystankami.
- „Istniejące tory” uwzględnia infrastrukturę wybudowaną w kampanii i nie pobiera za nią kosztu budowy. Autobusy korzystają wyłącznie z lokalnego grafu drogowego. Niezdatne do odtworzenia linie ze starszego zapisu zachowują oryginalną geometrię, otrzymują status niedostępnych, nie mają aktywnej przepustowości ani nie przewożą pasażerów.

Nie zmieniono schematu zapisu 11. Nowe pola linii są walidowane, a dotychczasowe migracje pozostały aktywne.

## Testy i bezpieczeństwo

- `npm ci`: zaliczone, 72 pakiety, 0 podatności zgłoszonych przy instalacji.
- `npm test`: **216/216** zaliczonych. Obejmują edycję geometrii bez zmiany przystanków, brak opłaty dla niezmienionej trasy, współdzielenie całego i częściowego toru, bliskie równoległe tory, łączenie odgałęzienia z wnętrzem odcinka, dotykowe/klawiaturowe operacje modelu oraz blokadę przewozów na niedostępnej linii.
- `npm run test:browser`: **19/19** zaliczonych. Sprawdzono standardowy ekran gry, preview i zapis geometrii po reloadzie, przeciąganie myszą i dotykiem, inwestycje, routing, kalendarz i responsywność na 1920×1080, 1366×768, 1280×720, 390×844 i 360×800.
- `npm run audit:all`: zaliczone, **0 podatności**.
- `npm run audit:production`: zaliczone, **0 podatności**.
- GitHub Actions: Node 18/20/22, browser test, audyt bezpieczeństwa i health check obrazu — **wszystkie 6 zadań SUCCESS** dla SHA implementacji.

## Zrzuty ekranu

Zrzuty są poza repozytorium, w `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.3.1-tramway-qa`:

- `tramway-edit-before-desktop.png`
- `tramway-edit-preview-desktop.png`
- `tramway-edit-saved-desktop.png`
- `tramway-edit-before-mobile.png`
- `tramway-edit-preview-mobile.png`
- `tramway-manual-desktop-1366x768.png`
- `tramway-manual-mobile-390x844.png`

Zrzuty pokazują podgląd przebiegu i kosztu przed zatwierdzeniem oraz stan po zapisie i ponownym otwarciu kampanii. W przeglądzie wizualnym nie stwierdzono nachodzenia blokującego edytor; dotykowe przesunięcie uchwytu przeszło test bez przesunięcia mapy.

## Ograniczenia

- Ręcznie rysowane tory są geometrią w modelu gry, nie walidacją inżynieryjną torowiska.
- Graf infrastruktury kampanii łączy odcinki przez zgodne końce/projekcję w ustalonej tolerancji; nie modeluje rozjazdów, sygnalizacji ani przepisów budowy.
- Tryb istniejącej infrastruktury wybiera trasę po zapisanych torach gracza, a gdy nie ma takiej trasy — korzysta z dostępnej trasy OSM. Nie składa jeszcze pojedynczej relacji z mieszanych odcinków OSM i torów gracza.
- Nie zmieniono ani nie rozszerzono danych źródłowych OSM. Pozostałe ograniczenia grafu pozostają bez zmian.

## Wydanie

Kod został wypchnięty na istniejącą gałąź feature. Zrzuty nie zostały dodane do repozytorium. Zachowano istniejące nieśledzone dokumenty użytkownika. Brak zmian w `main`, tagach, GitHub Release i środowisku produkcyjnym.

