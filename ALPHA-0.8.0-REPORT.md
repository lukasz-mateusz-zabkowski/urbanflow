# URBANFLOW ALPHA 0.8.0: RAPORT WDROŻENIOWY

## Status: GO

Wersja jest gotowa do akceptacji na gałęzi zależnej od kandydata 0.7.0. Nie wykonano merge ani wdrożenia. Pull Request nie został utworzony: integracja GitHub zwróciła 403, a GitHub CLI nie jest dostępny. Link do ręcznego utworzenia Draft PR podano poniżej.

## Commity i podstawa

- Bazowy kandydat 0.7.0: `a61de003b4cbc00613b65cac97e8717bc519e516`.
- Główna implementacja mobilności: `2f44910ca212831ac9aed6bc438f41bc2435e3c7`.
- Końcowy SHA kodu i walidacji zapisów: `348f4c36d00b614139ec165eff8ac8274cfde949`.
- Gałąź: `feature/alpha-0.8.0`, wypchnięta do `origin`.
- `feature/alpha-0.7.0` nadal wskazuje bazowy SHA; `git merge-base` obu gałęzi zgadza się z nim. PR powinien celować w `feature/alpha-0.7.0`, nie w stary `main`.

## Wyniki testów

- Node lokalnie: **125/125** zaliczonych, w tym kampania, routing, transfery, wpływy, granice kalendarza, zapis i migracje schematów 2/3/4 do 5, walidacja uszkodzonych danych i skalowanie.
- Playwright lokalnie: **7/7** zaliczonych. Zakres desktop: 1920×1080, 1366×768, 1280×720. Zakres mobilny z dotykiem: 390×844, 360×800. Testy obejmują zmianę i zwinięcie panelu, `invalidateSize` Leaflet, kartę miejsca, analizę relacji, formularz opinii/JSON, edytor tygodniowy i zapisy schematu 5.
- Konsola i `pageerror`: bez błędów w zakończonej serii Playwright.
- GitHub Actions dla SHA `348f4c36d00b614139ec165eff8ac8274cfde949`: **success**. Zadania Node 18, 20 i 22 oraz `browser-test` zakończyły się sukcesem: [workflow 43954231848](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/43954231848).
- Pierwszy workflow implementacyjny wykrył testowy przypadek kopiowania rozkładu do niedzieli. Obsługa została poprawiona tak, by kopiowanie odczytywało aktualnie wybrany dzień z interfejsu; następny pełny workflow i workflow końcowego SHA przeszły.
- Workflow HEAD z raportem ujawnił wyścig asercji szerokości mapy z przejściem CSS. Asercja czeka teraz na stabilny wymiar; pełna seria Playwright w trybie `CI=1` ponownie przeszła 7/7.

## Mechanika pasażerów

- Kohortowe, deterministyczne wzorce podróży do pracy i szkoły, powrotów, zakupów, rekreacji i podróży okazjonalnych. Wzorce wynikają z profili miejsc, istniejącego popytu i kalendarza; nie tworzą obiektu na mieszkańca.
- Podział dobowy uwzględnia dzień roboczy, sobotę, niedzielę i dzień specjalny. Popyt z ticku przechodzącego przez granicę dnia jest uśredniany minutowo zgodnie z istniejącym naliczaniem oferty.
- Lokalny, deterministyczny Dijkstra z kopcem binarnym, maksymalnie dwiema przesiadkami, czasem jazdy, oczekiwaniem, dostępnością rozkładu, obciążeniem i pojemnością. Bez zewnętrznych zapytań routingowych.
- Niezrealizowane relacje pokazują brak połączenia, brak kursów, niedostateczną pojemność lub zbyt długi czas podróży. Zmieniona albo usunięta linia powoduje powrót kohorty do ostatniego znanego punktu i ponowne wyznaczenie trasy.
- Jakość ukończonej podróży i dostępność sieci są osobnymi wskaźnikami. Pojedyncza taryfa jest dzielona między linie według dystansu; przesiadka nie nalicza drugiego biletu.

## Wydajność

Dedykowany powtarzalny test 20 ticków zmierzył lokalnie:

| Linie | Pasażerowie w kohortach | Czas 20 ticków |
| ---: | ---: | ---: |
| 5 | 100 | 38,1 ms |
| 20 | 1 000 | 22,9 ms |
| 50 | 5 000 | 65,5 ms |

To pomiar pojedynczej serii na komputerze developerskim, nie gwarantowany czas dla wszystkich urządzeń. Test scenariuszowy kampanii zachował jej dotychczasowy czas ukończenia, bilans pasażerów i rozmiar zapisów; maksymalnie zanotowany tick wyniósł 16,51 ms.

## Zgodność zapisów

- Zmieniono schemat zapisu z 4 na 5, dodając wyłącznie wzorce kohortowe i zagregowane metryki mobilności.
- Schematy 2 i 3 nadal migrują rozkłady i kampanię; schemat 4 inicjalizuje pustą historię mobilności. Testy potwierdzają zachowanie linii, floty, budżetu i postępu kampanii.
- Nieprawidłowe identyfikatory, typy dni, minuty, liczniki i czasy przejazdu są odrzucane. Uszkodzony oryginalny zapis zachowuje istniejący mechanizm odzyskiwania.

## Zrzuty ekranów

Artefakty Playwright znajdują się poza repozytorium, w `%TEMP%\urbanflow-alpha-0.8.0-visual-qa`:

- Pełne widoki: `desktop-1920x1080.png`, `desktop-1366x768.png`, `desktop-1280x720.png`, `mobile-390x844.png`, `mobile-360x800.png`.
- Kadry panelu mobilności: odpowiednie pliki `*-mobility-panel.png` dla każdego z pięciu widoków.
- Dodatkowe kadry profilu miejsca, formularza opinii i edytora tygodniowego: `*-place-profile.png`, `*-feedback-json.png`, `*-timetable.png`.

## Znane ograniczenia i ryzyka

- Udziały Alpha dla wzorców podróży są jawne i opisane w `docs/URBANFLOW-PASSENGER-MOBILITY.md`; nie są danymi ankietowymi ani prognozą dla prawdziwego Krakowa i wymagają dalszego balansu.
- Wzorce opierają się na widocznych profilach miejsc, a wyszukiwanie trasy ogranicza się do dwóch przesiadek i 100 minut przewidywanej podróży.
- Satysfakcja nowych podróży to osobny wskaźnik informacyjny; nie zastępuje istniejącej satysfakcji kampanii ani stawek ekonomicznych.
- Draft PR jest ręczny z powodu odpowiedzi 403 integracji GitHub. Nie blokuje to lokalnej gałęzi ani zielonego CI, ale przed przeglądem należy go utworzyć z linku.

## Pull Request

[Utwórz Draft PR: `feature/alpha-0.8.0` → `feature/alpha-0.7.0`](https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/feature/alpha-0.7.0...feature/alpha-0.8.0?expand=1)

Po otwarciu strony wybierz utworzenie **Draft pull request**. Nie scalaj go przed akceptacją kandydata 0.7.0.

## Uruchomienie lokalne

```powershell
npm ci
npm run dev
```

Otwórz `http://localhost:3000`. Testy: `npm test`, `npm run test:browser`. Playwright jest już zależnością developerską; nie dodano zależności runtime.

## Rekomendacja

**GO do akceptacji jako kandydat Alpha 0.8.0.** Następny krok: utworzyć ręcznie Draft PR do `feature/alpha-0.7.0`, przejrzeć udokumentowane parametry popytu i dopiero po akceptacji obu wydań zaplanować kolejny sprint.
