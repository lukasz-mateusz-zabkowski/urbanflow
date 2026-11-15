# UrbanFlow 0.4 — raport wykonania

Data: 28.09.2026

## Wynik

Wersja 0.4 została zbudowana jako rozszerzenie 0.3. Zachowano JavaScript, Leaflet, Express, Docker, model grup pasażerów, graf przesiadek, kampanię Krakowa i klucz zapisu. Nie dodano nowych miast, kont, multiplayera ani ciężkiego backendu.

## Nowe mechaniki

- Naprawiono hierarchię mapy. Przystanki i punkty budowy są nad trasami, linie nie przechwytują kliknięć, a małe punkty mają większy niewidoczny obszar trafienia. Renderer SVG przepuszcza kliknięcia poza narysowanymi punktami.
- Nowa gra losuje 1 z 11 miejscowości aglomeracji. Każda ma lokalny węzeł, centralny węzeł i bazowy popyt. Pierwsze dwa cele uczą sieci dowozowej i przesiadki.
- Dodano lokalny routing po zapisanych korytarzach drogowych i kolejowych. Linie przechowują geometrię, która jest aktualizowana przy edycji i usuwana razem z linią. Interfejs modułu pozwala później podłączyć OSRM, Valhallę lub GraphHopper.
- Dodano popyt potencjalny dla wszystkich punktów. Nieobsługiwane punkty są widoczne w warstwie Popyt, ale nie tworzą grup pasażerów.
- Dodano globalną flotę. Stan rozróżnia pojazdy posiadane, przypisane i rezerwowe. Można kupować pojazdy, odkładać je do rezerwy, przypisywać z rezerwy i przenosić między liniami tego samego typu.
- Budowa wykorzystuje posiadaną rezerwę, a brakujące pojazdy kupuje po jawnej cenie. Rezerwa ma godzinowy koszt, a przypisanie wpływa na częstotliwość, przepustowość i oczekiwanie.
- Wydarzenia są zapowiadane 6–12 godzin przed rozpoczęciem. UI podaje obszar i przewidywany wpływ na popyt, prędkość lub przepustowość.
- Egzamin końcowy skrócono do czterech intensywnych faz: poranny szczyt, wydarzenie masowe, awaria lub remont i finałowe obciążenie.
- Rozszerzono diagnostykę o przygotowane widoki czasu podróży i dostępności. Przeciążone linie pulsują również bez otwierania diagnostyki.
- Zapis 0.4 przechowuje scenariusz, flotę, geometrię tras i przyszłe wydarzenia. Zapisy 0.2/0.3 bez tych pól są nadal akceptowane i uzupełniane.

## Zmodyfikowane pliki

Nowe:

- `public/js/fleet.js`
- `public/js/routing.js`
- `test/urbanflow-v4.test.js`

Zmienione:

- `public/js/cities.js`
- `public/js/game.js`
- `public/js/campaign.js`
- `public/js/map.js`
- `public/js/ui.js`
- `public/js/demand.js`
- `public/js/passengers.js`
- `public/js/transport.js`
- `public/js/economy.js`
- `public/js/city-events.js`
- `public/js/storage.js`
- `public/js/main.js`
- `public/index.html`
- `public/styles.css`
- `test/game.test.js`
- `test/storage.test.js`
- `test/campaign-balance.test.js`
- `package.json`
- `package-lock.json`
- `server.js`
- `README.md`
- `MVP-REPORT.md`

## Testy i kontrola

- Pełny zestaw: **82 testy** po dodaniu testu zgodności zapisu 0.3.
- Nowe testy obejmują 11 scenariuszy startowych, dwa pierwsze etapy każdej kampanii, kolejność warstw i obszar kliknięcia, globalną flotę, popyt potencjalny, zapowiedzi wydarzeń, zapis nowych pól oraz routing po edycji i usunięciu linii.
- Cztery pełne automatyczne kampanie kończą się zwycięstwem w około 13–14,3 minuty przy ×1.
- Test w przeglądarce potwierdził start losowej kampanii, podgląd routingu, budowę, stan globalnej floty, warstwę popytu, kliknięcie punktu leżącego na trasie oraz brak błędów konsoli.
- Widok 390 × 844 nie ma poziomego przewijania; panel floty i siedem trybów diagnostycznych pozostają dostępne.

## Audyt kodu

- Nie znaleziono zależności od live Overpass ani nowego backendu.
- Logika ekonomii i pasażerów nadal używa istniejących kroków symulacji.
- Routing jest deterministyczny i lokalny. Awaria zewnętrznej usługi nie może zatrzymać gry.
- Nowe kolekcje mają ograniczone rozmiary: geometria do 500 punktów na linię, wydarzenia do 20, flota do 1000 pojazdów na typ.
- Walidator odrzuca nieznany scenariusz, flotę mniejszą niż przydział, błędną zapowiedź i nieprawidłowe współrzędne.
- Największym ryzykiem pozostaje strojenie ekonomii i popytu na podstawie prawdziwych sesji graczy oraz pomiar na fizycznym RPi 5.

## Ograniczenia

- Lokalny graf dróg obejmuje główne korytarze potrzebne kampanii, a nie każdą ulicę OSM.
- Widok czasu podróży jest lekkim przybliżeniem; pełna izochrona wymaga grafu drogowego całego miasta.
- Tramwaj używa obecnie korytarzy drogowych. Osobne torowiska są przygotowane jako następny etap.
- Przeniesienie pojazdu w UI odbywa się przez rezerwę; model ma także bezpośrednią komendę transferu.
- Nie wykonano pomiaru FPS, CPU i pamięci na fizycznym Raspberry Pi 5 ani wdrożenia 0.4 na publicznym serwerze.

## Pięć priorytetów 0.5

1. Opcjonalny OSRM lub Valhalla z lokalnym cache i pewnym fallbackiem offline.
2. Pełny graf dostępności i rzeczywisty czas podróży dla wszystkich punktów.
3. Osobne korytarze tramwajowe oraz dokładniejsze tory kolejowe.
4. Porównywanie wariantów trasy i przewidywanie skutku dodatkowego pojazdu przed wydaniem pieniędzy.
5. Testy z graczami i profilowanie na fizycznym RPi 5, a następnie strojenie potwierdzonych problemów.

## Wdrożenie

UrbanFlow 0.4 jest ukończone i zweryfikowane lokalnie. Nie zostało wdrożone na Raspberry Pi ani pod publiczną domeną.
