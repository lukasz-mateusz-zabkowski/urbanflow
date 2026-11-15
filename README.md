# UrbanFlow 0.4 — Kraków

UrbanFlow to lekka przeglądarkowa gra strategiczna o projektowaniu transportu w aglomeracji krakowskiej. Wersja 0.4 rozwija istniejące MVP bez zmiany stosu: JavaScript, Leaflet, Express i statyczna konfiguracja miasta. Nie wymaga konta, bazy danych ani działającego Overpass API.

Sesja przy prędkości ×1 trwa zwykle **12–20 minut**. Cztery automatyczne kampanie kończą się w 13–14,3 minuty; gracz podejmujący decyzje spokojniej zwykle potrzebuje więcej czasu.

## Uruchomienie

Wymagany jest Node.js 18 lub nowszy.

```bash
npm ci
npm test
npm start
```

- Gra: `http://localhost:3000`
- Kontrola serwera: `http://localhost:3000/health`
- Serwer w LAN domyślnie nasłuchuje na `0.0.0.0:3000`.
- `HOST` i `PORT` pozwalają zmienić adres i port.

Leaflet jest dostarczany lokalnie. Internet jest potrzebny tylko do kafelków OpenStreetMap. Brak kafelków nie zatrzymuje symulacji, konfiguracji Krakowa ani zapisu.

### Docker

```bash
docker build -t urbanflow .
docker run --name urbanflow --restart unless-stopped -p 3000:3000 -d urbanflow
```

## Początek kampanii

Nowa gra losuje jedną z 11 miejscowości: Michałowice, Zielonki, Skawina, Zabierzów, Niepołomice, Wieliczka, Liszki, Kocmyrzów, Igołomia, Świątniki Górne lub Libertów. Wybór jest zapisywany, więc odświeżenie strony nie zmienia scenariusza.

Każdy start ma trzy logiczne poziomy:

1. miejscowość aglomeracyjna,
2. lokalny węzeł Krakowa,
3. centralny węzeł Centrum lub Dworzec Główny.

Pierwsza linia łączy miejscowość z lokalnym węzłem. Następnie gracz buduje połączenie do centrum, najlepiej z wygodną przesiadką. Po tym etapie sieć można rozwijać swobodnie.

## Trasy i mapa

Autobusy i tramwaje korzystają z lekkiego lokalnego grafu drogowego. Kolej aglomeracyjna i międzymiastowa preferują zapisane korytarze kolejowe. Metro biegnie bezpośrednio. Każda linia zapisuje listę punktów geograficznych trasy, więc animacja, długość i edycja używają tego samego przebiegu. Moduł `routing.js` ma punkt rozszerzenia pod późniejszy OSRM, Valhallę lub GraphHopper.

Warstwy mapy mają stałą kolejność: podkład, trasy, efekty diagnostyczne, pojazdy, główne przystanki, możliwe nowe przystanki i UI. Linie nie przechwytują kliknięć przystanków. Małe punkty mają większy, prawie niewidoczny obszar trafienia; renderer SVG nie blokuje elementów znajdujących się poza samym punktem.

## Popyt i pasażerowie

Warstwa **Popyt** pokazuje potencjalne zapotrzebowanie całego Krakowa jeszcze przed budową linii. Punkty nieobsługiwane są oznaczone innym kolorem i obrysem. Ten model nie tworzy pasażerów i nie obciąża symulacji.

Realne grupy pasażerów powstają dopiero w punktach obsługiwanych przez linie. Graf transportowy wybiera konkretną linię i przesiadki na podstawie czasu jazdy, oczekiwania i kosztu przesiadki. Przepustowość jest liczona oddzielnie dla linii, kierunku i odcinka.

## Globalna flota

Pojazdy są własnością operatora, a linie tylko je wykorzystują. Panel pokazuje na przykład `Autobusy 14 z 18 używanych · rezerwa 4`.

- Pojazd można kupić do rezerwy.
- W szczegółach linii można przenieść pojazd do rezerwy albo przypisać pojazd z rezerwy.
- Transfer między dwiema liniami tego samego typu jest obsługiwany przez model gry.
- Budowa linii najpierw wykorzystuje rezerwę. Brakujące dwa pojazdy są kupowane i widoczne w podglądzie kosztu.
- Rezerwa generuje niewielki koszt godzinowy.
- Liczba pojazdów i czas pełnego obiegu ograniczają rzeczywistą częstotliwość, przepustowość i oczekiwanie.

## Kampania i zakończenie

Osiem celów prowadzi od połączenia aglomeracyjnego do lotniska:

1. połącz wylosowaną miejscowość z lokalnym węzłem,
2. połącz lokalny węzeł z centralnym węzłem Krakowa,
3. dowieź 500 pasażerów,
4. uruchom dwie użyteczne linie autobusowe,
5. uruchom użyteczny tramwaj,
6. połącz Nową Hutę,
7. połącz Balice koleją lub metrem,
8. przejdź egzamin metropolii.

Egzamin jest krótszy i bardziej intensywny: poranny szczyt, wydarzenie masowe, awaria lub remont oraz finałowe obciążenie. Krytyczna jakość przez dwie godziny gry przegrywa egzamin. Poza egzaminem porażkę powoduje dług poniżej −50 000 zł albo zadowolenie poniżej 25% przez sześć godzin.

Progresja nadal wymaga użytecznych, różnych korytarzy: 2 autobusy odblokowują tramwaj, 3 tramwaje metro i kolej aglomeracyjną, a 4 tramwaje kolej międzymiastową. Linia liczy się po 6 godzinach działania, 80 przewozach i przy zadowoleniu co najmniej 60%.

## Wydarzenia i diagnostyka

Mecz, koncert, remont i część innych wydarzeń pojawiają się jako zapowiedzi 6–12 godzin przed startem. Panel pokazuje obszar, czas rozpoczęcia i wpływ na popyt, prędkość lub przepustowość. Po rozpoczęciu wydarzenie korzysta z istniejącego modelu linii i popytu.

Tryby mapy: zwykły, popyt potencjalny i obsłużony, kolejki, przeciążenie odcinków, rentowność, czas podróży oraz dostępność miasta. Przeciążone linie pulsują także w widoku zwykłym, a przeciążone przystanki zmieniają kolor.

## Zapis

Gra zapisuje stan automatycznie w `localStorage` pod kluczem `urbanflow.krakow.v2`. Zachowano wersję schematu 2, aby wczytywać zapisy 0.2 i 0.3. Brakujące pola 0.4 — scenariusz startowy, globalna flota, geometria tras i zapowiedzi — są bezpiecznie uzupełniane w pamięci.

Zapis obejmuje linie, przypisanie floty, pasażerów w podróży, budżet, kampanię, przyszłe wydarzenia, diagnostykę, zegar i ustawienia UI. Jest lokalny dla przeglądarki i domeny; nie synchronizuje się między urządzeniami.

## Moduły

- `public/js/game.js` — komendy i stan gry,
- `public/js/campaign.js` — cele i egzamin,
- `public/js/passengers.js` — graf oraz grupy pasażerów,
- `public/js/transport.js` — parametry, progresja i metryki,
- `public/js/fleet.js` — własność, przypisanie i rezerwa pojazdów,
- `public/js/routing.js` — routing lokalny i punkt rozszerzenia dla zewnętrznego silnika,
- `public/js/demand.js` — profile oraz popyt potencjalny,
- `public/js/city-events.js` — zapowiedzi i aktywne skutki wydarzeń,
- `public/js/map.js` — warstwy, routing wizualny i pojazdy,
- `public/js/storage.js` — walidacja i zgodność zapisów.

## Testy

`npm test` uruchamia testy logiki, zapisu i cztery pełne kampanie. Zestaw obejmuje także wszystkie 11 początków kampanii, globalną flotę, popyt potencjalny, zapowiedzi wydarzeń, routing, edycję i usuwanie linii oraz regresję hierarchii mapy.

## Zakres pozostawiony na 0.5

- opcjonalny routing OSRM/Valhalla z lokalnym cache i kontrolowanym fallbackiem,
- dokładne czasy przejazdu i dostępność oparte na grafie całego miasta,
- osobne korytarze torowe dla tramwajów,
- porównanie wariantów linii przed budową,
- profilowanie FPS/CPU na fizycznym Raspberry Pi 5 i strojenie po sesjach z graczami.
