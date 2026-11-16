# URBANFLOW ALPHA 0.7.0: RAPORT WDROŻENIOWY

## Status

**GO — gotowe do akceptacji technicznej.** Nie wykonano merge ani wdrożenia. Gałąź jest zależna od kandydata 0.6.0 i powinna pozostać ułożona nad nim do czasu akceptacji poprzedniej wersji.

## Gałąź i commit

- Gałąź: `feature/alpha-0.7.0`
- Zweryfikowany commit implementacji: `08f9c7e57e519f268bcf8a7fade219372f990a61`
- Baza: `b16e462c9ccd14a7441b9b028e7078e83e24a431` (`feature/alpha-0.6.0`)
- `main` pozostał nietknięty. Produkcja/Raspberry Pi i dane produkcyjne nie były używane.

## Testy i CI

- `npm test`: **114/114** testów Node zaliczonych.
- `npm run test:browser`: **7/7** testów Playwright zaliczonych.
- GitHub Actions dla commita implementacji: [run 43944212282 — success](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/43944212282). Joby `test (18)`, `test (20)`, `test (22)` i `browser-test` zakończyły się powodzeniem.
- Playwright uruchomił grę lokalnie, sprawdził brak istotnych błędów JavaScript, zmianę panelu, poprawne przeliczenie mapy, panel linii, profile miejsc, eksport opinii, suwaki klawiaturą i dotykiem oraz zapis profili.
- Rozdzielczości: desktop `1920×1080`, `1366×768`, `1280×720`; mobile `390×844`, `360×800`.
- Testy obejmują zmianę tygodnia i północy, typy dni, wyjątki specjalne, kursy wyłączone, kopiowanie profilu, koszty ważone przez granicę tygodnia, przepustowość, flotę, popyt, migrację oraz zapis/odczyt.

## Zmiany

- Deterministyczny kalendarz zaczyna się w poniedziałek `2026-01-05` o 06:00 czasu symulacji. Data wynika z minut symulacji UTC, nie z zegara komputera.
- Każda linia przechowuje rozkład roboczy, sobotni, niedzielny i specjalny; pięć dotychczasowych przedziałów pozostaje danymi modelu.
- Edytor umożliwia wybór dnia, ustawienie wspólnego rozkładu, kopiowanie, przywrócenie poprzedniej konfiguracji, gotowy profil, oznaczenie dzisiaj/jutra jako dnia specjalnego i podgląd następnego dnia.
- Popyt stosuje jawne współczynniki ALPHA do istniejących profili miejsc i ról podróży. Rozkład zmienia faktyczne kursy, ograniczenie floty, czas oczekiwania, pojemność i koszty operacyjne. Bazowe ceny biletów, koszty pojazdów i dopłaty pozostają bez zmian.
- Kalendarz tygodnia pojawia się w pasku statusu. Styl Atlas City i układ Leaflet zostały zachowane.
- Naprawiono błąd, w którym suwak zachowywał poprzednią wartość po zmianie wybranego dnia, gdy nadal miał fokus.

## Zapisy

Schemat zapisu zmienił się z 3 na 4. Schemat 2 migruje dotychczasową częstotliwość do wszystkich profili i przedziałów; schemat 3 kopiuje dzienny profil do czterech typów dni. Linie, flota, budżet i postęp kampanii pozostają zachowane. Kalendarz oraz poprzedni profil linii są zapisywane. Uszkodzone dane przechodzą przez istniejącą ścieżkę odzyskiwania bez nadpisania oryginału.

Szczegóły: [model tygodniowego kalendarza](docs/URBANFLOW-WEEKLY-CALENDAR.md) i [model rozkładów](docs/URBANFLOW-TIMETABLES.md).

## Zrzuty ekranów

Zapisano **11** zrzutów lokalnie, poza repozytorium, w:

`%TEMP%\urbanflow-alpha-0.7.0-visual-qa\`

Obejmują trzy widoki desktopowe, profile miejsc i formularz opinii na dwóch telefonach, a także edytor rozkładu na desktopie i telefonie. Pliki PNG nie zostały dodane do Git.

## Znane ograniczenia i ryzyka

- Punkt startowy `2026-01-05` jest jawnym parametrem ALPHA. Nie ma importu świąt państwowych, sezonów ani lokalnych kalendarzy.
- Dzień specjalny oznacza się jawnie w interfejsie; kalendarz ogranicza listę do 366 dat. Współczynniki popytu są początkowym balansem ALPHA i wymagają obserwacji w dalszych testach gry.
- Popyt pasażerski w ticku korzysta z typu dnia na końcu tego ticku; rozliczenie kosztów i usługi uwzględnia typ każdego z sześciu minut ticku.
- Integracja GitHub odmówiła utworzenia Draft PR: HTTP 403, `Resource not accessible by integration`. Gałąź jest wypchnięta. [Utwórz Draft PR ręcznie do `feature/alpha-0.6.0`](https://github.com/lukasz-mateusz-zabkowski/urbanflow/compare/feature/alpha-0.6.0...feature/alpha-0.7.0?expand=1). Nie scalaj przed zatwierdzeniem 0.6.0.

## Rekomendowany następny krok

Utworzyć Draft PR z podanego porównania do gałęzi `feature/alpha-0.6.0`, zaakceptować i scalić zależne wersje we właściwej kolejności, a następnie uruchomić CI dla finalnej gałęzi `main`. Nie wdrażać na produkcję bez osobnej akceptacji.
