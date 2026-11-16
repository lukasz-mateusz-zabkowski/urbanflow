# URBANFLOW ALPHA 0.5.0: RAPORT WDROŻENIOWY

## Status: NO GO do zatwierdzenia wizualnego; kod gotowy do lokalnej akceptacji

- **Gałąź:** `feature/alpha-0.5.0`
- **Commit SHA:** `9c5e9ae` (`feat: prepare UrbanFlow alpha 0.5.0`)
- **Gałąź zdalna:** wypchnięta na GitHub.
- **Pull Request:** nieutworzony — GitHub API zwróciło 403 `Resource not accessible by integration`; lokalnie nie ma `gh` CLI. [Otwórz formularz PR](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.5.0).
- **Baza:** `main` / `76654dc` (`Release UrbanFlow 0.4.0`)
- **Produkcja:** bez zmian; nic nie wdrożono ani nie zrestartowano.

## Zaimplementowane funkcje

- Desktopowy panel ma domyślnie 462 px (około 25% więcej niż 370 px w poprzednim desktopowym layoucie), granice szerokości zostawiające miejsce na mapę, regulację myszą i klawiaturą, zapis osobnej preferencji oraz zwijanie. Na telefonach pozostaje wysuwanym arkuszem.
- Kliknięcie miejsca pokazuje typ, opis, znaczenie dla rozgrywki, indeks popytu z istniejącego modelu oznaczony jako szacunkowy oraz znane połączenia. Punkty mają tooltipy Leaflet; karta działa po dotyku.
- Podgląd trasy przedstawia jej długość, szacowany czas z modelu gry, źródło, algorytm i opis wybranego wariantu. Nierozłączny graf jest jawnie oznaczany jako bezpośredni fallback.
- Formularz „Zgłoś uwagę” waliduje pięć kategorii, ocenę 1–5 i opis. Użytkownik kopiuje lub pobiera JSON. Dane diagnostyczne są dołączane tylko po zaznaczeniu zgody; aplikacja niczego nie wysyła.
- Dodano tokeny Atlas City oraz granicę `theme.js` przygotowaną pod pięć nazw widoków. Aktywna jest tylko bieżąca paleta City; logika i zapis gry są od niej niezależne.
- Dodano testy CI GitHub Actions na Node 18, 20 i 22. Schemat zapisu nadal ma wersję 2.

## Testy

- Stan wyjściowy 0.4.0: `node --test` — 82/82.
- Stan po zmianach: `node --test` — 96/96, w tym pełne kampanie, migracja zapisów, nowe testy routingu, profili, preferencji panelu, formularza i kontraktów UI.
- Uruchomienie aplikacji: lokalny serwer startuje na porcie 3000; `GET /health` zwraca `{"status":"ok","app":"UrbanFlow","version":"0.5.0"}`, a strona i moduł startowy odpowiadają HTTP 200.
- Brak Playwright/DOM harnessu w bazowym repo. Dodano testy modułów i kontraktów UI; Playwright jest możliwy do wprowadzenia w następnym kroku, ale wymaga nowej zależności i instalacji przeglądarki.
- Próba otwarcia Edge przez automatyzację GUI została odrzucona przez automatyczną kontrolę uprawnień. Dlatego nie potwierdzono jeszcze layoutu i interakcji na rzeczywistym ekranie. To blokuje rekomendację GO.

## Diagnostyka routingu

- Routing jest lokalny i deterministyczny. Autobusy i tramwaje korzystają z ręcznie przygotowanego `roadGeometry`; kolej z `railGeometry`; metro łączy punkty bezpośrednio. Grafy są nieskierowane, krawędzie mają wagę w kilometrach haversine, a ścieżkę wyznacza algorytm Dijkstry.
- Rzeczywiste dane geograficzne są wbudowane. OSRM, Valhalla, GraphHopper i Overpass nie są wymagane ani wywoływane. Kafelki mapy pochodzą z OpenStreetMap i wymagają internetu; brak kafelków nie wyłącza symulacji.
- W zapisanym grafie Bronowice–Krowodrza Górka to bezpośrednia krawędź między dwoma wierzchołkami korytarza drogowego (2,16 km). O 08:00 model szacuje ok. 7,8 min autobusem i 4,7 min tramwajem. Warianty kolejowe dobierają najbliższe wierzchołki lokalnego grafu kolejowego, a metro idzie bezpośrednio (ok. 2,5 min). Zgłoszenie nie określa wariantu transportu ani dokładnego punktu startowego/końcowego, więc nietypowego wariantu nie można jednoznacznie odtworzyć.
- Potwierdzony problem: brak ścieżki wcześniej powodował cichy rysunek prostej linii. Teraz podgląd jawnie prezentuje fallback. Najbliższy wierzchołek grafu jest dobierany bez limitu odległości przyciągania; podgląd pokazuje łączną odległość snapowania. Gęstość drogowa i osobne ograniczenia autobus/tramwaj pozostają poza zakresem danych 0.4.

## Zmiany wizualne

- Panel zwiększa się do 462 px na szerokich desktopach, można go zwęzić lub zwinąć. Przy 761–1100 px szerokość jest automatycznie ograniczana do 48% viewportu. Poniżej 760 px panel działa jako wysuwany arkusz.
- Istniejąca paleta pozostaje domyślną Atlas City. Pozostałe Atlas Network, Regional, Midnight i Studio są opisane, ale niewłączone.

## Znane problemy i ryzyka

- Brakuje przeglądarkowego testu e2e i wzrokowej akceptacji desktop/mobile z powodu blokady automatyzacji Edge w środowisku.
- Dane drogowe są ręcznymi korytarzami, a nie pełnym grafem ulic Krakowa; routing nie uwzględnia ograniczeń kierunkowych ani odrębnej infrastruktury tramwajowej.
- W przypadku punktów dalekich od wierzchołków obecny dobór najbliższego wierzchołka nie ma maksymalnego limitu snapowania. Wartość jest ujawniana w strukturze segmentu routingu do dalszego rozwoju diagnostyki.
- Nowe tokeny nie zawierają pełnych wariantów pięciu motywów.

## Instrukcja uruchomienia

```bash
npm ci
npm test
npm start
```

Otwórz `http://localhost:3000`; kontrola serwera: `http://localhost:3000/health`. Szczegóły i granice produkcyjne: [URBANFLOW-OPERATIONS.md](URBANFLOW-OPERATIONS.md).

## Rekomendowany następny krok

Otworzyć lokalną wersję 0.5.0 na desktopie i telefonie, zatwierdzić zmianę panelu, kartę miejsca oraz eksport JSON; następnie uruchomić testy CI i dopiero po akceptacji przygotować wdrożenie oparte na zatwierdzonym SHA.
