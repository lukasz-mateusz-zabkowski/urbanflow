# UrbanFlow ALPHA 1.1.0 — Final Integration

## Wynik

**NO GO dla integracji z `main`; kandydat jest gotowy technicznie.** `main` pozostał bez zmian.

- Oczekiwany i aktualny `main`: `f3345937a14e65546a7c15e5f0887ea19df23541`.
- Gałąź: `feature/alpha-1.1.0`.
- Zweryfikowany kod: `8bff4cbe0a3e5de140b1877f2009b40df594910f` (potomek `main`).
- Klasyczna ochrona gałęzi: endpoint GitHub zwrócił 403; lista rulesets była pusta.
- Otwarte PR-y: brak. Utworzenie PR przez GitHub API zwróciło 403. UI przeglądarki nie było dostępne, a `gh` CLI nie jest zainstalowane.
- Nie wykonano bezpośredniego pushu na `main`, merge ani tagowania, aby nie ominąć niezweryfikowanych reguł ochrony.

## Kontrola i poprawka

Audyt wykrył, że próbkowanie dostępności nie obejmowało godzin nocnych. Linia kursująca wyłącznie 23:00–06:00 była błędnie oceniana jako brak połączenia. Próbki rozszerzono o 01:00 i 23:30, a test regresyjny potwierdza dostępność nocnej linii. Dodano też asercję, że raport tygodnia 2 używa finansów zamkniętego tygodnia 1. Pozostałe sprawdzone mechanizmy — granice tygodnia, brak kursów/usunięte linie, limity wzrostu, deterministyczność, schematy zapisów 2–7, kohorty, taryfy i kampania — nie wykazały blokad.

## Walidacja kandydata

- `npm ci`: powodzenie, 0 podatności.
- `npm test`: 148/148.
- `npm run test:browser`: 7/7, desktop i mobile.
- `npm run audit:all`: 0 podatności.
- `npm run audit:production`: 0 podatności.
- GitHub Actions [run #32](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44143807257) dla `8bff4cbe0a3e5de140b1877f2009b40df594910f`: success.

## Tag i następny krok

Tag `v1.1.0-alpha` nie został utworzony — wymagane jest najpierw zatwierdzone scalenie oraz zielone CI na `main`. Następny krok: przywrócić uprawnienie do utworzenia PR lub poprosić właściciela repozytorium o otwarcie `feature/alpha-1.1.0` → `main` zgodnie z regułami gałęzi, a potem ponownie zweryfikować CI przed tagowaniem. Wdrożenia nie wykonano.
