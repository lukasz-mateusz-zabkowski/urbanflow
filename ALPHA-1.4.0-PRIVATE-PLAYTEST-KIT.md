# UrbanFlow ALPHA 1.4.0 — pakiet prywatnego playtestu

## Zasady dostępu

- Testuj wyłącznie na osobnym, zatwierdzonym hoście. Nie używaj Raspberry Pi, hosta produkcyjnego ani produkcyjnego originu.
- Wersja aplikacji i commit muszą pochodzić z jednego, jawnego SHA. Host musi mieć checkout dokładnie tego commita przed budowaniem obrazu.
- Compose publikuje port wyłącznie na `127.0.0.1:3101`; nie otwieraj go w firewallu, nie dodawaj DNS ani publicznego reverse proxy.
- Zaproszonych testerów wpuszczaj tylko istniejącą, zatwierdzoną prywatną ścieżką dostępu. Przykładem jest indywidualnie autoryzowany tunel SSH do hosta testowego:

  ```powershell
  ssh -N -L 13101:127.0.0.1:3101 <konto-testowe>@<zatwierdzony-host>
  ```

  Tester otwiera wtedy `http://127.0.0.1:13101/`. Sam tunel nie tworzy publicznego adresu gry; konto hosta musi być ograniczone do zatwierdzonych osób. Nie konfiguruj nowego zewnętrznego VPN, SSH, DNS, proxy ani publicznego adresu bez osobnego zatwierdzenia.
- Używaj osobnego profilu przeglądarki. Zapis gry jest w `localStorage` originu testowego i nie trafia do kontenera. Nie importuj produkcyjnych zapisów.
- Kandydat 1.4.0 używa schematu zapisu 11 (schema 11); migracja odbywa się w przeglądarce testera. Nie otwieraj późniejszego zapisu w starszym buildzie.
- Obecna mapa pobiera kafelki bezpośrednio z `tile.openstreetmap.org` w przeglądarce testera. To standardowe żądania mapowe, niezależne od zapisu gry; jeżeli test ma nie wykonywać żadnych połączeń zewnętrznych, wstrzymaj go do czasu przygotowania zatwierdzonych kafelków offline.
- Odpowiedź `/health` musi pokazywać `version: 1.4.0-alpha`, oczekiwany 40-znakowy `commit` i `environment: alpha-test`. Aplikacja dodaje nagłówek `X-Robots-Tag: noindex, nofollow, noarchive`.

## Start, sprawdzenie i zatrzymanie

Na dedykowanym hoście, po zatwierdzeniu dostępu:

```powershell
git checkout --detach 346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491
git rev-parse HEAD
Copy-Item .env.alpha-test.example .env.alpha-test
# Edytuj .env.alpha-test i wpisz dokładny SHA w URBANFLOW_COMMIT_SHA.
docker compose --env-file .env.alpha-test -p urbanflow-alpha-test -f compose.alpha-test.yml config
docker compose --env-file .env.alpha-test -p urbanflow-alpha-test -f compose.alpha-test.yml up --build --detach
Invoke-RestMethod http://127.0.0.1:3101/health
docker compose --env-file .env.alpha-test -p urbanflow-alpha-test -f compose.alpha-test.yml ps
```

Przed przekazaniem tunelu porównaj `git rev-parse HEAD`, `docker compose ... ps`, `/health` i zadany SHA. Strona oraz zasób `/vendor/leaflet/leaflet.js` muszą odpowiadać. Kontener działa jako użytkownik `node`, ma system plików tylko do odczytu, zrzuca capabilities, blokuje `no-new-privileges`, nie montuje wolumenów i ma `restart: no`.

Sprawdzenie restartu i zatrzymanie:

```powershell
docker compose --env-file .env.alpha-test -p urbanflow-alpha-test -f compose.alpha-test.yml restart urbanflow-alpha-test
Invoke-RestMethod http://127.0.0.1:3101/health
docker compose --env-file .env.alpha-test -p urbanflow-alpha-test -f compose.alpha-test.yml down --remove-orphans
```

Po restarcie ponownie zweryfikuj wersję i commit. `down` usuwa instancję, nie ma wolumenu zapisów serwerowych do zachowania.

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

1. Zatrzymaj test: `docker compose ... down --remove-orphans`.
2. Wróć do wcześniej sprawdzonego commita przez `git checkout --detach <SHA>` na hoście testowym. Zweryfikuj `git rev-parse HEAD` przed budową; nie przekazuj metadanych innego SHA niż checkout.
3. Ustaw `URBANFLOW_COMMIT_SHA` na ten sam commit, zbuduj i uruchom ponownie profil alpha. Odczytaj `/health`; wersja i commit muszą się zgadzać.
4. Nie używaj w starszej wersji profilu przeglądarki, w którym nowsza wersja mogła już migrować zapis. Użyj nowego profilu/originu lub najpierw wyeksportuj kopię zapisu; migracje są jednokierunkowe, rollback kodu nie cofa `localStorage`.
5. Użytkownicy testowi mogą zatrzymać tunel skrótem `Ctrl+C`. Kontener nie ma automatycznego restartu ani trwałego wolumenu.

## Zakończenie sesji

Przekaż tylko zanonimizowany JSON i wpis rejestru. Po zakończeniu testu zatrzymaj instancję, usuń `.env.alpha-test` z hosta i usuń tymczasowe konta/klucze dostępu zgodnie z zatwierdzoną polityką hosta. Nie uruchamiaj publicznej instancji ani nie przesyłaj danych automatycznie.
