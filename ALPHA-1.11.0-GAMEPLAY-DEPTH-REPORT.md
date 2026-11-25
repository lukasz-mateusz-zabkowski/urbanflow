# UrbanFlow Atlas 1.11.0 — raport gameplay depth

## Zakres i decyzje

Wersja bazowa: `1.10.0-alpha`, commit `33caf82bae0f97e3bae7276631080f5dfb6c358f`.

Implementacja dodaje ograniczony dziennik decyzji w Operations, bardziej konkretną informację po zmianie rozkładu i zatwierdzeniu propozycji operacyjnej oraz świadomie uruchamiany lokalny eksport raportu sesji. Wykorzystuje istniejącą księgę finansową jako źródło rzeczywistych kosztów, istniejące statystyki linii jako bieżące obserwacje oraz pamięć bieżącej karty dla działań nieksięgowych. Historia decyzji nie jest dublowana w zapisie kampanii. Schemat zapisu pozostaje **13**.

Raport sesji obejmuje wersję, scenariusz, czas symulacji i karty, wynik, ograniczone agregaty kampanii, maksymalnie 12 pozycji dziennika oraz liczniki błędów. Opinia trafia do raportu tylko, gdy gracz wpisał ją w formularzu. Eksport wymaga kliknięcia, jest kopiowany lub pobierany lokalnie i nie wykonuje żądania wysyłającego dane. Nie eksportuje identyfikatora testera, urządzenia, stanu RNG, localStorage ani treści błędów. Gracz powinien unikać wpisywania danych osobowych w dobrowolnym opisie.

### Ustalenia z audytu

- Cele kampanii i samouczek wskazują dalsze działania, a Operations udostępnia istniejące porównanie wariantów. Nie ma uzasadnienia, by dodać niezależny model ekonomiczny.
- W księdze są trwałe wydatki i wpływy. Nowy dziennik pokazuje je z księgi, a nie rekonstruuje z komunikatów UI; koszt budowy linii wraz z zakupionym do niej pojazdem jest grupowany, a granty i zwroty pozostają wpływami.
- Zmiana częstotliwości, floty i plan inwestycji rejestruje się wyłącznie w bieżącej karcie. Bieżące obciążenie, kolejka oraz przychód i koszt na godzinę są podpisane jako obserwacja, bez przypisywania ich przyczynowości ostatniej decyzji.
- Podglądów nie przyspiesza czas symulacji. Nie wdrożono „skip to next event”, ponieważ pominięcie ticków mogłoby naruszyć ekonomię, zdarzenia, pasażerów, Living City i terminy kampanii.
- Zidentyfikowano ryzyko podwójnego pokazania zakupu jako wpisu sesji i zapisu finansowego. UI nie kopiuje już kwoty do wpisu sesji, a dziennik zabezpiecza dopasowaną transakcję i ma test regresyjny.

## Decyzje strategiczne i rytm kampanii

Nowe wskazówki i istniejące narzędzia eksponują kompromisy powiązane z symulacją:

1. **Rentowność kontra dostępność:** częstotliwość i rozkład zmieniają koszty oraz pojemność; gracz obserwuje późniejsze kolejki, obciążenie i księgę.
2. **Zakup floty kontra wykorzystanie rezerwy:** zakup obciąża budżet według istniejącej ceny, a przydział z rezerwy zmienia dostępność bez ponownego zakupu.
3. **Rozbudowa miasta kontra rezerwa środków:** zaplanowana inwestycja pokazuje koszt, lecz nie zmniejsza budżetu przed zatwierdzeniem; dalsze koszty i popyt wynikają z istniejących mechanik.
4. **Nowa linia kontra poprawa istniejącej:** używane są dotychczasowe narzędzia planowania i symulator operacyjny.

Nie zmieniono progów, terminów ani balansu kampanii. Istniejące testy deterministyczne potwierdzają ukończenie wyzwań: Odbudowa transportu po 9 720 minutach symulacji, Kryzys finansowy po 29 880 minutach, a Rozwijające się miasto po ok. 34,96 tygodnia (+33 modelowanych mieszkańców, +17 miejsc pracy w scenariuszu testowym). To wyniki automatycznych przebiegów, nie czasy ani oceny prawdziwych graczy.

## Proponowane sesje dla testerów

To instrukcje do późniejszych sesji. **Żadna sesja z prawdziwym testerem nie została tu przeprowadzona.** Po każdej sesji można świadomie wyeksportować lokalny JSON z formularza opinii.

| Ścieżka | Czas | Zadanie i kryterium sukcesu | Pytania po sesji |
|---|---:|---|---|
| Pierwsze 15 minut | 15 min | Rozpocznij nową kampanię, przejdź kolejne dostępne kroki samouczka, obejrzyj podgląd i zbuduj pierwszą linię. Powinno być jasne, co zrobić dalej i jaki koszt zostanie pobrany. | Czy następny krok był czytelny? Czy podgląd wyjaśniał koszt i ryzyko? Czy rozumiesz, jak anulować? |
| Pierwsza godzina | 45–60 min | Wybierz Odbudowę transportu albo Kryzys finansowy. Zbuduj/zmień połączenie, sprawdź flotę i rozkład, zanotuj problem sieci, podejmij kolejną decyzję i obejrzyj jej obserwowane skutki. | Które decyzje były realnym kompromisem? Czy wiedziałeś, dlaczego linia kosztuje lub pasażerowie czekają? Czy porażka byłaby zrozumiała i możliwa do naprawienia? |
| Kampania wielotygodniowa | 2–4 sesje po 30–60 min | Rozegraj Rozwijające się miasto przez co najmniej 12 tygodni symulacji. Zapisz i wznów kampanię, przejrzyj tygodniowe finanse, dostępność, popyt i problemy; nie zakładaj z góry, że każda inwestycja się zwróci. | Czy tempo tygodni było zrozumiałe? Czy rozróżniałeś prognozę od wyniku? Czy decyzje transportowe i miejskie tworzyły nowe zadania? Czy chciałeś rozbudować sieć dalej? |

W każdej ścieżce zanotuj jeden moment niepewności, jedną decyzję trudną do odwrócenia, nazwę ekranu, którego szukałeś, oraz ocenę 1–5. Eksport przekaż ręcznie właścicielowi projektu; gra nie przesyła raportu.

## Walidacja

- `npm ci`: zaliczone przed końcową poprawką prezentacji kosztu; zależności nie uległy zmianie od tego uruchomienia.
- `npm test`: **296 zaliczonych, 0 niezaliczonych** po końcowej poprawce. Zawiera regresję pojedynczego księgowania kosztu.
- `npm run test:browser`: pełny przebieg po końcowej poprawce **51/51**. Obejmuje nowy test raportu, pełny samouczek, challenge, finanse, Living City, inwestycje, routing, edytor tramwajów i widoki mobile.
- `npm run audit:all`: 0 podatności.
- `npm run audit:production`: 0 podatności.
- `git diff --check`: zaliczone.
- Test prawdziwych kafelków OSM (`verify:osm:live`): 16 z 16 odpowiedzi HTTP 200, 0 błędów JS. Zrzut: `%TEMP%\urbanflow-alpha-1.11.0\desktop-live-osm-1366x768.png`. Pozostałe testy przeglądarkowe używają deterministycznych kafelków testowych i nie są dowodem usługi OSM.
- Test przeglądarkowy raportu sesji potwierdza wyeksportowanie JSON z opinią i statystykami oraz brak żądań POST.
- Kandydat działa lokalnie na `http://127.0.0.1:3112/`; `/health` zwrócił `1.11.0-alpha` i SHA `ecd087e28b7ac8c54b4c4cd6fb24b92740f4ef8d`. Nasłuch został ograniczony do `127.0.0.1`.
- GitHub Actions run [45594552600](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45594552600) dla SHA `ecd087e28b7ac8c54b4c4cd6fb24b92740f4ef8d`: **6/6 SUCCESS** — Node 18, 20, 22, Playwright, security audit i container health.

### Benchmark 1.10.0 → 1.11.0

Pomiary wykonano na Surface Book 3 w tym samym procesie Node `v24.19.0`, 31 próbek (3 rozgrzewające), naprzemienna kolejność; każdy pomiar ticku obejmuje 300 ticków kampanii. Wynik jest lokalny, nie jest gwarancją dla innego sprzętu.

| Pomiar | 1.10.0 | 1.11.0 | Zmiana |
|---|---:|---:|---:|
| Czas ticku, mediana | 0,540 ms | 0,561 ms | +4,0% |
| Czas ticku, p95 | 0,851 ms | 0,840 ms | −1,2% |
| Zapis stanu scenariusza | 116 970 B | 116 970 B | 0% |
| Zmiana warstwy Passenger Flow → 2 klatki paint, mediana (60 próbek) | 30,4 ms | 30,4 ms | 0% |
| Ta sama zmiana warstwy, p95 | 47,3 ms | 47,0 ms | −0,6% |

Test przełączania Atlas uruchamiał dwie instancje lokalnie na 3120 (baseline) i 3112 (kandydat), wykorzystując lokalne kafelki SVG. Wartości są przejściem interfejsu do dwóch klatek paint, nie pomiarem renderowania kafelków OSM. Nowy dziennik czyta maksymalnie 64 wpisy księgowe oraz 32 działania sesji i renderuje tylko w Operations; osobny pomiar wpływu tej ścieżki na pełny render UI nie jest dostępny. Nie przypisujemy mu więc poprawy ani regresji wydajności.

## Kompatybilność i ograniczenia

- Schemat zapisu pozostaje 13; nowa lista działań sesji nie trafia do zapisu kampanii. Istniejący eksport zapisu, migracje i deterministyczne scenariusze pozostały objęte pełnym zestawem Node.
- Nie przeprowadzono ręcznych sesji UX, oceny na fizycznym telefonie ani sesji wielotygodniowej przez człowieka.
- Lista nieksięgowych decyzji dotyczy bieżącej karty i znika po jej zamknięciu/przeładowaniu. Trwałe działania kosztowe pochodzą z ograniczonej księgi, która może nie zawierać szczegółów starszych niż zachowany limit. Historia nie odtwarza pełnej przyczynowości.
- Czas rzeczywisty sesji jest liczony od utworzenia UI do raportu; nie jest równoważny aktywnemu czasowi skupionej gry.
- Porównanie mikrosekundowych różnic czasu ticku jest wrażliwe na obciążenie hosta. Mediana wzrosła o ok. 4%, podczas gdy p95 pozostał podobny. Należy obserwować ten wynik w CI i na słabszym sprzęcie.
- Raport opisuje pełny wynik Actions powyżej. Commit dokumentacyjny powstał po tym przebiegu i po jego push uruchamia ponowny workflow na nowym SHA.

## Status

**Lokalna implementacja: GO.**

**Ocena jakości gry z prawdziwymi testerami: nieprzeprowadzona.** Kandydat ułatwia ocenę decyzji i przygotowanie dobrowolnego lokalnego raportu, ale nie przesądza o satysfakcji graczy.

Gałąź: `feature/alpha-1.11.0-gameplay-depth`.

Commit implementacji, po którym wykonano pełny zestaw końcowych testów: `734ecea612efb873a5a3ebe365549008a0e6ec38` (`feat: add gameplay decision feedback and session report`). Kandydat przed aktualizacją raportu miał SHA `ecd087e28b7ac8c54b4c4cd6fb24b92740f4ef8d`, a GitHub Actions na tym SHA zakończył się 6/6 sukcesem. Commit tego uzupełnienia raportu jest dokumentacyjny; uruchamia nowy workflow dla nowego HEAD.
