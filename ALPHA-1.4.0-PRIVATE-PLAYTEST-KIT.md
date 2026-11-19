# UrbanFlow ALPHA 1.4.0 — pakiet prywatnego playtestu

## Zasady dostępu

- Testuj wyłącznie na osobnym, zatwierdzonym hoście. Nie używaj Raspberry Pi, hosta produkcyjnego ani produkcyjnego originu.
- Wersja aplikacji i commit muszą pochodzić z jednego, jawnego SHA. Host musi mieć checkout dokładnie tego commita przed budowaniem obrazu.
- Compose publikuje port wyłącznie na `127.0.0.1:3101`; nie otwieraj go w firewallu, nie dodawaj DNS ani publicznego reverse proxy.
- Compose publishes the app only on `127.0.0.1:3101` so the host owner can serve an approved SSH tunnel. The container uses Docker's standard bridge network; outbound connections from the container are possible. The app does not transmit saves or feedback; the tester's browser fetches OSM tiles directly.
- Zaproszonych testerów wpuszczaj tylko istniejącą, zatwierdzoną prywatną ścieżką dostępu. Przykładem jest indywidualnie autoryzowany tunel SSH do hosta testowego:

  ```powershell
  ssh -N -L 13101:127.0.0.1:3101 <konto-testowe>@<zatwierdzony-host>
  ```

  Tester otwiera wtedy `http://127.0.0.1:13101/`. Sam tunel nie tworzy publicznego adresu gry; konto hosta musi być ograniczone do zatwierdzonych osób. Nie konfiguruj nowego zewnętrznego VPN, SSH, DNS, proxy ani publicznego adresu bez osobnego zatwierdzenia.
- Używaj osobnego profilu przeglądarki. Zapis gry jest w `localStorage` originu testowego i nie trafia do kontenera. Nie importuj produkcyjnych zapisów.
- Kandydat 1.4.0 używa schematu zapisu 11 (schema 11); migracja odbywa się w przeglądarce testera. Nie otwieraj późniejszego zapisu w starszym buildzie.
- Obecna mapa pobiera kafelki bezpośrednio z `tile.openstreetmap.org` w przeglądarce testera. To standardowe żądania mapowe, niezależne od zapisu gry; jeżeli test ma nie wykonywać żadnych połączeń zewnętrznych, wstrzymaj go do czasu przygotowania zatwierdzonych kafelków offline.
- Odpowiedź `/health` musi pokazywać `version: 1.4.0-alpha`, oczekiwany 40-znakowy `commit` i `environment: alpha-test`. Aplikacja dodaje nagłówek `X-Robots-Tag: noindex, nofollow, noarchive`.

## Start, kontrola i zatrzymanie na niezależnym hoście

Tag `v1.4.0-alpha` wskazuje bazowy build gry (SHA `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`). Nie zawiera profilu prywatnego testu. Profil i guard pojawiły się później na gałęzi `feature/alpha-1.4.0-private-playtest`. **Nie checkoutuj tagu jako źródła hardened playtestu.** Użyj wyłącznie pełnego, zatwierdzonego SHA końcowego commita tej gałęzi. Wpisz ten sam SHA do `.env.alpha-test`; skrypt przed budowaniem porównuje go z rzeczywistym `git rev-parse HEAD`, odrzuca różnicę, zmodyfikowane pliki śledzone i obce pliki nieśledzone. Dozwolony jest wyłącznie lokalny `.env.alpha-test`.

### Windows + Docker Desktop

> Aktualny Docker Desktop z Linux containers; nie uruchamiaj portu przez publiczny firewall ani proxy. Kontener ma standardowy bridge, wi?c ruch wychodzacy jest mozliwy.

Na niezależnym komputerze Windows z uruchomionym Docker Desktop (Linux containers), Git, Node 18+ i dostępem tylko dla właściciela hosta:

```powershell
git clone https://github.com/lukasz-mateusz-zabkowski/urbanflow.git
Set-Location urbanflow
$playtestSha = '<PEŁNY_ZATWIERDZONY_SHA_GAŁĘZI_PLAYTEST>'
git fetch origin feature/alpha-1.4.0-private-playtest
git checkout --detach $playtestSha
$actualSha = (git rev-parse HEAD).Trim()
if ($actualSha -ne $playtestSha) { throw "Checkout SHA mismatch: $actualSha" }
Copy-Item .env.alpha-test.example .env.alpha-test
Set-Content -Path .env.alpha-test -Value "URBANFLOW_COMMIT_SHA=$actualSha" -Encoding ascii -NoNewline
npm.cmd run alpha-test -- verify
npm.cmd run alpha-test -- start
npm.cmd run alpha-test -- restart
npm.cmd run alpha-test -- status
npm.cmd run alpha-test -- stop
```

Po `start` użyj `Invoke-RestMethod http://127.0.0.1:3101/health` i sprawdź `version`, `commit` i `environment`. Skrypt wykonuje też te kontrole automatycznie, sprawdza revision label obrazu, użytkownika `node`, loopback binding, brak mountów, read-only root, capabilities, `no-new-privileges`, politykę restartu, stronę i zasób Leaflet.

### Linux + Docker Engine

> Wymagaj Docker Engine 28.0.0+ dla izolacji publikowanego portu loopback. Kontener ma standardowy bridge, wiec ruch wychodzacy jest mozliwy; firewall hosta nadal nie moze dopuszczac publicznego portu.

Na odrębnym, nieprodukcyjnym hoście Linux z Docker Engine i pluginem Compose:

```bash
git clone https://github.com/lukasz-mateusz-zabkowski/urbanflow.git
cd urbanflow
PLAYTEST_SHA='<FULL_APPROVED_PLAYTEST_BRANCH_SHA>'
git fetch origin feature/alpha-1.4.0-private-playtest
git checkout --detach "$PLAYTEST_SHA"
ACTUAL_SHA="$(git rev-parse HEAD)"
test "$ACTUAL_SHA" = "$PLAYTEST_SHA"
cp .env.alpha-test.example .env.alpha-test
printf 'URBANFLOW_COMMIT_SHA=%s\n' "$ACTUAL_SHA" > .env.alpha-test
npm run alpha-test -- verify
npm run alpha-test -- start
npm run alpha-test -- restart
npm run alpha-test -- status
npm run alpha-test -- stop
```

Na obu systemach `verify` kończy się błędem, jeśli SHA z env różni się od checkoutu. `start` buduje i uruchamia obraz oznaczony tym SHA, a `/health` musi zwrócić tę samą wartość. `restart` ponawia health check, `status` tylko sprawdza działającą instancję, `stop` usuwa kontener/sieć Compose bez usuwania hostowych zapisów (wolumenów brak). Nie uruchamiaj surowego `docker compose up` poza wrapperem; omija on kontrolę checkoutu.

## Prywatny dostęp dla kilku testerów

Nie wystawiaj portu 3101 w firewallu i nie dodawaj publicznego proxy/DNS. Host jest osiągalny tylko wewnętrzną, zatwierdzoną drogą. Dla kilku osób utwórz osobne, nieadministracyjne konto tunelowe bez uprawnień Docker i osobny klucz dla każdej osoby. Ogranicz SSH do lokalnego przekierowania `127.0.0.1:3101`, bez terminala, powłoki, agent/X11 forwarding i dostępu do repozytorium. Przykładowe ograniczenia serwera SSH to `AllowTcpForwarding local`, `PermitOpen 127.0.0.1:3101`, `AllowAgentForwarding no`, `X11Forwarding no`, `PermitTTY no` oraz wymuszone `nologin` dla żądań sesji; indywidualne wpisy `authorized_keys` mogą używać `restrict,port-forwarding,permitopen="127.0.0.1:3101",command="/usr/sbin/nologin"`. Właściciel hosta wdraża je wyłącznie w ramach zatwierdzonego dostępu administracyjnego i sprawdza `ssh -N` przed zaproszeniem. Użytkownik tunelowy nie może mieć uprawnień do Docker, repozytorium, produkcji ani kont administracyjnych.

Tester uruchamia tunel na swoim komputerze (nie otrzymuje konta GitHub ani dostępu do repo):

```bash
ssh -N -L 13101:127.0.0.1:3101 <osobne-konto-tunelowe>@<zatwierdzony-host-prywatny>
```

Każdy tester otwiera `http://127.0.0.1:13101/` u siebie. Aplikacja nie jest publicznie osiągalna; zapis jest oddzielony przez origin lokalnego tunelu. Nie konfiguruj nowej usługi VPN/SSH ani sieci zewnętrznej bez osobnego zatwierdzenia. Po sesji usuń klucz/konto testowe zgodnie z polityką hosta.

## Scenariusze

Tester może użyć pseudonimu lub pustego identyfikatora. Nie zbieramy nazwisk, adresów e-mail, danych lokalizacyjnych ani zapisów kampanii.

### Scenariusz A — pierwsza kampania i samouczek

- **Cel testu:** sprawdzić, czy nowy gracz rozumie cele pierwszej rozgrywki i może przejść przez 12 etapów samouczka.
- **Przewidywany czas:** 20–30 minut.
- **Instrukcja:** uruchom nową kampanię; wykonuj cele samouczka po kolei; sprawdź podgląd i koszt linii przed decyzją; pozwól symulacji przewieźć pasażerów; zamknij i ponownie otwórz grę; sprawdź wznowienie. Osobno wypróbuj pominięcie i ponowne uruchomienie samouczka.
- **Kryteria sukcesu:** cele są zrozumiałe; etap zmienia się po wykonaniu faktycznej czynności; samouczek nie daje pieniędzy ani nie zmienia rozgrywki samym pominięciem; budżet, linia, flota i pasażerowie zachowują się po wznowieniu.
- **Pytania po sesji:** Który cel był niejasny? Czy było oczywiste, kiedy podgląd nie wydaje pieniędzy? Czy było wiadomo, jak wrócić do samouczka? Czy ekran wskazywał sensowny następny krok?
- **Miejsce na uwagi:**

  ```text
  Urządzenie / viewport:
  Krok i działanie:
  Oczekiwany wynik:
  Zaobserwowany wynik:
  Co było niejasne:
  Ważność (P0–P3):
  ```

### Scenariusz B — sieć autobusowa i tramwajowa

- **Cel testu:** sprawdzić zrozumiałość projektowania linii, kosztów, rozkładu i różnic między autobusami a trzema trybami torowisk tramwajowych.
- **Przewidywany czas:** 30–45 minut.
- **Instrukcja:** obejrzyj dostępne przystanki; zaplanuj krótką linię autobusową i sprawdź jej trasę oraz koszt; zbuduj ją tylko po przejrzeniu podglądu. Następnie wybierz tramwaj, sprawdź budowę przyuliczną, ręczną i użycie istniejących torów. Jeśli środki są niewystarczające, anuluj podgląd. Uruchom symulację i otwórz szczegóły linii.
- **Kryteria sukcesu:** kolejność przystanków jest czytelna; podgląd odpowiada zatwierdzonej geometrii; autobus pozostaje na grafie drogowym; ręczne torowisko zachowuje zatwierdzoną geometrię; anulowanie nie pobiera kosztu; po zatwierdzeniu koszt nie nalicza się ponownie.
- **Pytania po sesji:** Czy można było odróżnić trasę od punktów kontrolnych? Który tryb tramwajowy był niejasny? Czy koszt i wymagania floty były widoczne przed zatwierdzeniem? Czy było łatwo anulować?
- **Miejsce na uwagi:**

  ```text
  Urządzenie / viewport:
  Typ linii i wybrane punkty (bez zrzutu zapisów):
  Oczekiwany / zaobserwowany przebieg:
  Oczekiwany / zaobserwowany koszt:
  Ważność (P0–P3):
  ```

### Scenariusz C — ekonomia, miasto i inwestycje

- **Cel testu:** ocenić, czy gracz rozumie rentowność transportu i odróżnia ją od rozwoju miasta oraz czy ryzyko inwestycji jest widoczne.
- **Przewidywany czas:** 25–35 minut.
- **Instrukcja:** sprawdź przychody, koszty, popyt i problemy sieci; zmień częstotliwość jednej linii i porównaj obserwacje. Otwórz Atlas City Evolution/Land Use, potem katalog inwestycji. Porównaj projekt mieszkaniowy, gospodarczy i modernizację węzła; zatwierdź co najwyżej projekt, którego koszt i ograniczenia rozumiesz. Sprawdź postęp, podsumowanie tygodniowe i anulowanie projektu testowego.
- **Kryteria sukcesu:** budżet transportu nie dostaje fikcyjnych przychodów miejskich; wydatek następuje dopiero po zatwierdzeniu; postęp projektu i wynik są widoczne; rekomendacje wynikają z pokazywanych danych; projekt można anulować zgodnie z podanymi zasadami.
- **Pytania po sesji:** Czy było jasne, skąd pochodzą przychody? Czy wiedziałeś, jakie ograniczenia blokują inwestycję? Czy jej skutki były widoczne w czasie? Jakiej informacji brakowało do podjęcia decyzji?
- **Miejsce na uwagi:**

  ```text
  Urządzenie / viewport:
  Projekt / decyzja:
  Oczekiwany / zaobserwowany wpływ:
  Który wskaźnik pomógł lub wprowadził w błąd:
  Ważność (P0–P3):
  ```

## Eksport opinii i rejestr problemów

1. W grze otwórz „Zgłoś uwagę”, wybierz kategorię, opisz jeden problem i oceń go 1–5. Identyfikator testera jest dobrowolny; użyj losowego pseudonimu, jeśli potrzebne jest łączenie zgłoszeń.
2. Dane kontekstu i diagnostyki dołączaj tylko po osobnym, świadomym zaznaczeniu odpowiedniej zgody. Nie dołączaj zrzutu zapisu gry.
3. Wygeneruj zgłoszenie. Formularz przygotowuje JSON lokalnie; niczego nie wysyła. Skopiuj JSON albo pobierz `urbanflow-feedback-YYYY-MM-DD.json`.
4. Przed przekazaniem otwórz JSON, usuń zbędne szczegóły identyfikujące osobę i prześlij go organizatorowi wyłącznie uzgodnionym, prywatnym kanałem. Nie umieszczaj raportów w publicznym issue.
5. Organizator nadaje klucz duplikatu, grupuje podobne zgłoszenia i aktualizuje częstotliwość.

Szablon rejestru (bez danych osobowych):

| ID | Data / SHA | Scenariusz | Kategoria | Problem / kroki odtworzenia | Ważność | Częstotliwość | Urządzenia / liczba sesji | Status | Duplikaty |
|---|---|---|---|---|---|---:|---|---|---|
| PF-001 |  | A/B/C |  |  | P0–P3 | 1 |  | Nowe |  |

Ważność: **P0** blokuje uruchomienie lub powoduje utratę danych; **P1** blokuje ważny przepływ; **P2** istotnie utrudnia grę, ale istnieje obejście; **P3** kosmetyczne lub sugestia. Częstotliwość zapisuj jako liczbę zgłoszeń / liczbę sesji, jeśli liczba sesji jest znana. Nie wyciągaj wniosków o częstości populacyjnej z małej próby.

## Wycofanie / rollback

Rollback wymaga wskazania wcześniej zatwierdzonego SHA, dla którego host nadal może pobrać kod. Użyj osobnego Git worktree dla starszego commita, aby zachować aktualny wrapper administracyjny i jego kontrolę zgodności SHA. Nie używaj starego worktree do zapisu użytkowników; każda wersja ma osobny origin/localStorage.

### Windows

```powershell
$rollbackSha = '<WCZEŚNIEJ_ZATWIERDZONY_SHA>'
$rollbackDir = Join-Path $env:TEMP 'urbanflow-alpha-rollback'
if (Test-Path $rollbackDir) { throw "Rollback path already exists: $rollbackDir" }
git fetch origin $rollbackSha
git worktree add --detach $rollbackDir $rollbackSha
Set-Content -Path (Join-Path $rollbackDir '.env.alpha-test') -Value "URBANFLOW_COMMIT_SHA=$rollbackSha" -Encoding ascii
npm.cmd run alpha-test -- rollback --cwd $rollbackDir
npm.cmd run alpha-test -- status --cwd $rollbackDir
npm.cmd run alpha-test -- stop --cwd $rollbackDir
Remove-Item (Join-Path $rollbackDir '.env.alpha-test') -Force
git worktree remove $rollbackDir
```

### Linux

```bash
ROLLBACK_SHA='<PREVIOUSLY_APPROVED_SHA>'
ROLLBACK_DIR="$(mktemp -d)"
rmdir "$ROLLBACK_DIR"
git fetch origin "$ROLLBACK_SHA"
git worktree add --detach "$ROLLBACK_DIR" "$ROLLBACK_SHA"
printf 'URBANFLOW_COMMIT_SHA=%s\n' "$ROLLBACK_SHA" > "$ROLLBACK_DIR/.env.alpha-test"
npm run alpha-test -- rollback --cwd "$ROLLBACK_DIR"
npm run alpha-test -- status --cwd "$ROLLBACK_DIR"
npm run alpha-test -- stop --cwd "$ROLLBACK_DIR"
rm "$ROLLBACK_DIR/.env.alpha-test"
git worktree remove "$ROLLBACK_DIR"
```

Wrapper odrzuci SHA niezgodny z rzeczywistym HEAD worktree. Następnie zatrzyma obecną instancję, przebuduje obraz pod SHA rollbacku i zweryfikuje revision label, port loopback, `/health`, stronę oraz zasób Leaflet. Nie uruchamiaj rollbacku na zapisie `localStorage`, który mógł być zmigrowany przez nowszą wersję; kontener nie cofa migracji przeglądarkowej. Testerzy zatrzymują tunele `Ctrl+C`. Kontener nie ma automatycznego restartu ani trwałego wolumenu.

## Zakończenie sesji

Przekaż tylko zanonimizowany JSON i wpis rejestru. Po zakończeniu testu zatrzymaj instancję, usuń `.env.alpha-test` z hosta i usuń tymczasowe konta/klucze dostępu zgodnie z zatwierdzoną polityką hosta. Nie uruchamiaj publicznej instancji ani nie przesyłaj danych automatycznie.
