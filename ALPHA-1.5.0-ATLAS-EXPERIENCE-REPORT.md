# UrbanFlow Atlas 1.5.0 — raport Atlas Experience

## Status

**GO do przeglądu technicznego.** Implementacja jest na gałęzi `feature/alpha-1.5.0-atlas-experience`. Nie scalano jej z `main`, nie utworzono tagu ani wydania.

## Wersja i pochodzenie

- Baza: `v1.4.1-alpha`, commit `ba9b26bde56a51ac299eb74126e7b910fe1de2ea`.
- Commit implementacji: `10be69e7302e0495d9bea7b1395611896909b9d5` (`feat: add Atlas network management experience`).
- Commit raportu: dokumentacyjny commit na tej samej gałęzi; jego SHA jest końcowym HEAD gałęzi.
- Wersja aplikacji: `1.5.0-alpha`.
- Zdalny branch po wypchnięciu commita implementacji odpowiadał lokalnemu SHA. Po dodaniu raportu należy ponownie sprawdzić zdalny HEAD.

## Architektura i zmiany

Dodano pięć przełączanych trybów Atlas: Transport Network, Network Planning, Passenger Flow, City Development i Operations Dashboard. Tryby przełączają istniejące tryby analityczne oraz kontekstowe panele UI; nie uruchamiają drugiej symulacji ani nie dodają fikcyjnych wskaźników. Dotychczasowe panele i mechaniki pozostają dostępne.

Panel linii może filtrować autobusy/tramwaje oraz sortować po obserwowanym obciążeniu, kosztach i rentowności. Wybranie wiersza wskazuje linię i otwiera jej dotychczasowe szczegóły/akcje. Warstwy transportu, przystanków, pojazdów, obciążenia, dostępności, inwestycji i rozwoju korzystają z obecnych danych i przełączników mapy.

Preferencje widoku, filtra i sortowania są walidowane i zapisywane lokalnie osobno od kampanii. Nie przechowują danych pochodnych w zapisie gry. **Schemat kampanii pozostaje 11.** Nie dodano zależności.

## Weryfikacja

- `npm ci`: zaliczone, bez podatności zgłoszonych podczas instalacji.
- `npm test`: **241/241** zaliczonych.
- `npm run test:browser`: **28/28** zaliczonych; pokrywa widoki desktop/mobile, przełączanie trybów, warstwy, filtr/sort linii, brak poziomego przepełnienia i niezmienność kluczowych danych zapisu schematu 11.
- `npm run audit:all`: **0 podatności**.
- `npm run audit:production`: **0 podatności**.
- `git diff --check`: zaliczone przed commitem.
- `npm run verify:osm:live`: zaliczone na osobnej sesji z prawdziwym źródłem kafelków OSM (nie z atrapami testowymi): 13 unikalnych żądań, 13 odpowiedzi sukcesu, 0 odpowiedzi błędnych, 3 kafelki widoczne w zrzucie, 0 błędów strony.
- Schemat zapisu: pozostaje 11; test przeglądarkowy sprawdził, że zmiana widoków nie zmienia budżetu, pasażerów, linii ani floty.

### GitHub Actions

Workflow `Tests` dla commita implementacji `10be69e7302e0495d9bea7b1395611896909b9d5` zakończył się sukcesem: [run 45260695457](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45260695457). Wszystkie sześć zadań zaliczone: Node 18, Node 20, Node 22, Playwright, security audit oraz container health. Po commicie raportu workflow zostanie sprawdzony ponownie dla końcowego SHA.

## Wydajność

Porównano tę samą sesję Chromium i rozdzielczość 1366×768: pięć interakcji rozgrzewających, następnie 30 pomiarów przełączenia widoku z dwoma klatkami renderowania. Mediana: baza 1.4.1 **31,8 ms**, kandydat **30,8 ms** (−3,1%). p95: baza **51,8 ms**, kandydat **32,0 ms**. To lokalny pomiar porównawczy Surface Book, nie gwarancja dla innych urządzeń.

## Zrzuty ekranu

Wszystkie obrazy zapisano poza repozytorium, w `%TEMP%\urbanflow-alpha-1.5.0-atlas\`:

- Desktop: `desktop-transport.png`, `desktop-planning.png`, `desktop-passengers.png`, `desktop-development.png`, `desktop-operations.png`.
- Mobile: `mobile-transport.png`, `mobile-planning.png`, `mobile-passengers.png`, `mobile-development.png`, `mobile-operations.png`.
- Rzeczywiste OSM: `desktop-live-osm-1366x768.png` (oddzielnie od deterministycznych zrzutów z atrapą kafelków używaną w Playwright).

## Lokalna instancja i ograniczenia

Kandydat działa na `http://127.0.0.1:3104/`; port jest związany wyłącznie z loopback. `/health` potwierdził `1.5.0-alpha`, środowisko `alpha-test`. Instancje 3101, 3102 i 3103 nie były zatrzymywane ani modyfikowane. Po utworzeniu commita końcowego należy ponownie uruchomić 3104 z pełnym SHA w `URBANFLOW_COMMIT_SHA`, aby health pokazywał końcowy commit raportu.

Widoki są kontekstowym układem istniejącego Atlas i korzystają z istniejących paneli. Symulacja dotyku Playwright nie zastępuje testu na fizycznym telefonie. Test OSM potwierdza dostępność kafelków w chwili próby; nie gwarantuje dostępności zewnętrznej usługi w przyszłości.

## Następny krok

Przejrzeć kandydata na GitHubie. Nie ma merge, tagu, GitHub Release ani wdrożenia produkcyjnego.
