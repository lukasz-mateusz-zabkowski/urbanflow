# UrbanFlow ALPHA 1.4.0 — gotowość prywatnego playtestu

## Status

**GO dla przygotowanego pakietu prywatnego playtestu.** Kod, scenariusze i izolowany profil przeszły walidację lokalną oraz CI. To nie oznacza uruchomienia instancji ani zaproszenia testerów. Nie skonfigurowano publicznego hosta ani zewnętrznej usługi. Przed pierwszą sesją nadal wymagany jest niezależny host i zatwierdzona prywatna metoda dostępu.

Uruchom pojedynczą sesję dopiero po sprawdzeniu SHA na niezależnym hoście i potwierdzeniu, że dostęp testera jest prywatny oraz autoryzowany. Ten raport nie publikuje adresu ani nie konfiguruje takiego hosta.

## Repozytorium i wersja

- Repozytorium: `lukasz-mateusz-zabkowski/urbanflow`.
- Baza: commit `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`; `origin/main` pozostał na tym SHA w chwili rozpoczęcia prac.
- Tag `v1.4.0-alpha` istnieje jako anotowany tag wskazujący bazowy commit.
- Gałąź robocza: `feature/alpha-1.4.0-private-playtest`.
- Zweryfikowany commit pakietu: `238d027190cb0fc0da39518516a21f715158d89a`.
- CI dla tego commita: [GitHub Actions run #81](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44606407056), wszystkie sześć zadań zakończyło się sukcesem.
- Raport jest dokumentacyjnym uaktualnieniem; końcowy HEAD po jego wypchnięciu zostanie podany w przekazaniu końcowym.
- Produkcja oraz Raspberry Pi nie były używane ani zmieniane.

## Izolacja i warunki bezpiecznego uruchomienia

`compose.alpha-test.yml` buduje obraz z jawnego `URBANFLOW_COMMIT_SHA`, wymaga zgodności healthchecka z wersją pakietu, publikuje usługę tylko na `127.0.0.1:3101`, nie ma wolumenów, wyłącza automatyczny restart i nie otrzymuje sekretów produkcyjnych. Kontener działa jako użytkownik nie-root, z root filesystem tylko do odczytu, bez Linux capabilities i z `no-new-privileges`.

Gra ma osobny origin względem produkcji, a zapisy pozostają w lokalnym profilu przeglądarki testera. Na niezależnym hoście nie wystawiaj portu gry do sieci. Dostęp zaproszonych może odbywać się istniejącą, zatwierdzoną prywatną ścieżką, np. indywidualnym tunelem SSH. Nie dodawaj publicznego DNS, reverse proxy, nowego VPN ani otwartego portu bez odrębnego zatwierdzenia.

Host testowy nie może być Raspberry Pi ani współdzielić sieci, wolumenów, sekretów lub danych z produkcją. Użyj osobnego profilu przeglądarki; nie importuj zapisów produkcyjnych. Wymagaj w `/health` `version: 1.4.0-alpha`, dokładnego 40-znakowego SHA oraz `environment: alpha-test`. Aplikacja ustawia `X-Robots-Tag: noindex, nofollow, noarchive`.

**Zewnętrzne żądanie mapy:** istniejący frontend pobiera kafelki mapy bezpośrednio z `tile.openstreetmap.org` w przeglądarce gracza. Aplikacja nie wysyła tam zgłoszeń, zapisów ani diagnostyki. Jeśli warunki prywatnego testu zakazują wszystkich połączeń zewnętrznych, test trzeba wstrzymać do przygotowania zatwierdzonych kafelków offline.

## Pakiet testerów i zbieranie zgłoszeń

Trzy kompletne scenariusze, kryteria sukcesu, pytania, przewidywane czasy i miejsca na uwagi są w [ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md](ALPHA-1.4.0-PRIVATE-PLAYTEST-KIT.md):

1. Pierwsza kampania i 12-etapowy samouczek (20–30 min).
2. Sieć autobusowa i tramwajowa (30–45 min).
3. Ekonomia, rozwój miasta i inwestycje (25–35 min).

Formularz opinii generuje JSON lokalnie. Kopiowanie/pobieranie jest ręczne; niczego nie wysyła. Kontekst i diagnostyka są opcjonalne i wymagają osobnych zgód. Procedura wymaga przeglądu i anonimizacji przed przekazaniem prywatnym kanałem. Szablon rejestru grupuje P0–P3, częstotliwość i duplikaty bez zbierania zbędnych danych osobowych.

## Wycofanie

Zatrzymaj profil poleceniem `docker compose ... down --remove-orphans`. Nie ma serwerowego wolumenu. W celu rollbacku checkoutuj wcześniej sprawdzony SHA na niezależnym hoście, sprawdź `git rev-parse HEAD`, ustaw ten sam SHA w `.env.alpha-test`, przebuduj i potwierdź `/health`. Nie uruchamiaj starej gry na profilu przeglądarki, w którym nowsza wersja mogła zmigrować zapis; użyj świeżego profilu/originu albo przygotuj kopię zapisu. Szczegółowe komendy są w pakiecie playtestowym.

## Walidacja

- `npm ci`: zaliczony; 0 podatności z audytu instalacji.
- `npm test`: **234/234 zaliczone**.
- `npm run test:browser`: **25/25 zaliczone**; obejmuje desktop/mobile, lokalny feedback JSON, rzeczywisty 12-etapowy samouczek, inwestycje, tramwaje i route editor.
- Pełny samouczek: 12/12 etapów, zapis i wznowienie potwierdzone przez Playwright.
- Powtórzony test 360×800: **3/3 zaliczone**.
- `npm run audit:all` oraz `npm run audit:production`: **0 podatności**.
- `git diff --check`: zaliczony.
- `docker compose ... config` z jawnym bazowym SHA: zaliczony; konfiguracja potwierdza bind `127.0.0.1:3101`, brak wolumenów, read-only, bez capabilities, `no-new-privileges` i restart wyłączony.
- Docker Desktop Linux engine: na tym komputerze obecnie niedostępny (`dockerDesktopLinuxEngine` pipe nie istnieje). Lokalny start/restart/rollback kontenera nie został potwierdzony.
- GitHub Actions run #81: **6/6 success** — Node 18, Node 20, Node 22, browser test, security audit i container health.
- Container health: build i uruchomienie release image przeszły; profil alpha potwierdził health/version/SHA, bind `127.0.0.1:3101`, brak mountów, stronę i Leaflet, restart, ponowny health/version/SHA oraz zatrzymanie.

## Ryzyka i decyzja

Końcowa rekomendacja: **GO** dla pakietu i rozpoczęcia małego prywatnego playtestu po uruchomieniu na niezależnym hoście; **NO GO** dla każdej konfiguracji publicznej lub hosta bez potwierdzonej izolacji i zatwierdzonej kontroli dostępu.

- Nie istnieje przygotowany ani uruchomiony prywatny host. Dostęp testerów musi zostać skonfigurowany przez właściciela na niezależnej infrastrukturze; nie wykonano zaproszeń.
- Nie wykonano lokalnego startu ani rollbacku, ponieważ Docker Desktop Linux engine nie działał. Start/restart/stop profilu jest potwierdzony w izolowanym runnerze GitHub Actions.
- Zapis w przeglądarce nie cofa się razem z kontenerem. Zachowaj wersjonowane, oddzielne profile przeglądarki.
- Mapa korzysta z zewnętrznych kafelków OpenStreetMap.
- Po wypchnięciu aktualizacji raportu workflow uruchomi się ponownie dla aktualnego HEAD. Nie rozpoczynaj sesji, jeżeli końcowe CI nie przejdzie.
