# UrbanFlow ALPHA 1.3.0 — finalna bramka jakości

## Status

**W trakcie — walidacja lokalna zakończona pozytywnie; integracja i CI na `main` oczekują.** Nie wykonano jeszcze integracji, tagowania ani wdrożenia.

- Początkowy `main`: `17cd2b35d858690a986fe7bebbe167c480082dca`.
- Początkowy kandydat `feature/alpha-1.3.0`: `b645c61505e7cac3776e7a9059a7122ac8aafbbf`.
- Kandydat obejmuje `main` jako przodka; zdalne porównanie wykazało 4 commity do przodu i 0 do tyłu.
- Reguły: API zwróciło pustą listę rulesetów i `protected: false` dla gałęzi `main`; odczyt szczegółowego endpointu ochrony gałęzi zwrócił 403 integracji. Samo 403 nie jest dowodem obowiązkowego PR.

## Końcowy audyt inwestycji

- **Kampania zakończona:** potwierdzony błąd pozwalał zatwierdzić wcześniej zaplanowany projekt po przegranej. `approveInvestment` odrzuca teraz zatwierdzenie, gdy status nie jest `playing`; test potwierdza brak pobrania kosztu i brak przejścia projektu do realizacji.
- **Równoległe projekty:** dwa projekty ekonomiczne w obszarze o średniej intensywności kończą się pojedynczo, nie przekraczają wysokiego limitu intensywności, zachowują sumę udziałów 100% i nie powtarzają efektu w kolejnych tickach.
- **Usunięte linie przy modernizacji węzła:** zatwierdzona modernizacja kończy się po usunięciu obsługującej linii. Węzeł pozostaje trwałym zasobem miejskim, a utrzymanie jest naliczane od kolejnego pełnego tygodnia również bez linii. Zasada jest opisana w dokumentacji i UI.
- **Granica tygodnia i wznowienie:** koszt i efekt ukończonego projektu są zachowane po zapisie/odczycie; ponowne wywołanie aktualizacji nie dopisuje historii ani nie pobiera środków ponownie.
- **Zmiana rezerwy i anulowanie:** anulowanie niezatwierdzonego projektu zwalnia wyłącznie jego rezerwację; drugi projekt zachowuje swoją rezerwę, a zatwierdzenie pobiera koszt raz.
- Historia zakończonych projektów zapisuje oczekiwany i rzeczywisty wynik. Walidacja sprawdza wyniki, pozostając zgodna ze starszymi zapisami schematu 10, w których `expected` nie występowało.

Nie zmieniono stawek ani ogólnego balansu. CAPEX, zwroty i utrzymanie nadal są odrębne od przychodów i kosztów operacyjnych przewoźnika.

## Wyniki lokalne

- `npm ci`: PASS, bez nowych zależności; 0 podatności wykrytych podczas instalacji.
- `npm test`: **198/198 PASS**.
- `npm run test:browser`: **15/15 PASS**, w tym desktop 1366×768, mobile 390×844, wznowienie zapisu z ukończoną inwestycją oraz testy interfejsu istniejących widoków.
- `npm run audit:all`: **0 podatności**.
- `npm run audit:production`: **0 podatności**.
- `git diff --check`: PASS.
- Zrzuty UI: `%TEMP%\urbanflow-alpha-1.3.0-visual-qa\investments-1366x768.png` i `%TEMP%\urbanflow-alpha-1.3.0-visual-qa\investments-390x844.png` (poza repozytorium).

## Zapisy i ograniczenia

Nie zmieniono schematu 10. Stare ukończone rekordy bez pola `expected` pozostają poprawne; nieprawidłowe wyniki są odrzucane. Testy obejmują zachowanie budżetu, linii, floty, rozkładów, kohort, rozwoju miasta i kampanii oraz 4-, 12- i 52-tygodniowe scenariusze. Zrzuty są artefaktami tymczasowymi i nie trafiają do Git.

## Integracja i CI

Do uzupełnienia po commicie poprawek: SHA kandydata, push, wszystkie 6 zadań Actions na końcowym `main`, SHA końcowego `main`, status tagu `v1.3.0-alpha` oraz ostateczne GO/NO GO. Merge fast-forward i tag są warunkowe na zielonym CI dla wynikowego `main`.
