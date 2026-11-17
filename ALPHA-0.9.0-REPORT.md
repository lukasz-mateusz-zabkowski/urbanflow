# URBANFLOW ALPHA 0.9.0: RAPORT WDROĹ»ENIOWY

## Status: GO

Kandydat jest gotowy do akceptacji. Testy lokalne i GitHub Actions sÄ… zielone. Nie wykonano merge ani wdroĹĽenia.

## GaĹ‚Ä…Ĺş i commity

- GaĹ‚Ä…Ĺş: `feature/alpha-0.9.0`
- Bazowy kandydat 0.8.0: `74e69424b35e5dcb43cf32c4085b222665e3318d` (`feature/alpha-0.8.0`)
- Commit implementacji: `f53136edcd423df9bc75124cb096560ebaaf725b`
- KoĹ„cowy HEAD: commit raportu na tej gaĹ‚Ä™zi, bezpoĹ›rednio nad commitem implementacji; jego identyfikator jest widoczny jako bieĹĽÄ…cy `HEAD` w repozytorium.

## Zmiany

- Dodano Atlas Network: warstwy zaobserwowanego obciÄ…ĹĽenia segmentĂłw, przeciÄ…ĹĽeĹ„, kolejek, niezrealizowanych podrĂłĹĽy i rentownoĹ›ci linii.
- Dodano legendÄ™ i wybĂłr warstwy. IstniejÄ…cy widok potencjalnego popytu zachowano i oznaczono jako estymacjÄ™.
- Panel â€žProblemy sieciâ€ť wykrywa niedobĂłr pojazdĂłw, przeciÄ…ĹĽone linie i odcinki, kolejki, nieudane poĹ‚Ä…czenia i nieefektywne przesiadki oraz niskÄ… rentownoĹ›Ä‡ przy maĹ‚ym wykorzystaniu (dopiero po 30 minutach zaobserwowanego kursowania). Zawiera obserwowanÄ… wartoĹ›Ä‡, wpĹ‚yw na pasaĹĽerĂłw i moĹĽliwe dziaĹ‚ania; nie zmienia rozkĹ‚adĂłw automatycznie.
- Historia zapisuje do 96 agregatĂłw (okoĹ‚o 9,6 godziny symulacji): przewiezionych pasaĹĽerĂłw, Ĺ›redni bieĹĽÄ…cy czas oczekiwania, pokrycie punktĂłw, wykorzystanie pojemnoĹ›ci, przychody, koszty i bilans. PorĂłwnanie rozpoznaje zmianÄ™ konfiguracji sieci i opisuje obserwacje, bez przypisywania przyczyn ani prognozowania poprawy.
- Save schema 6. Zapisy schematĂłw 2, 3, 4 i 5 migrujÄ… z zachowaniem kampanii, budĹĽetu, floty, linii, rozkĹ‚adĂłw i danych mobilnoĹ›ci; historia analityczna w starszym zapisie rozpoczyna siÄ™ pusta.
- Dodano testy niezmiennikĂłw pasaĹĽerĂłw, historii, diagnostyki, migracji oraz powtarzalne pomiary wydajnoĹ›ci. Zaktualizowano wersjÄ™ gry i changelog.

Definicja danych i ograniczenia warstw znajdujÄ… siÄ™ w [URBANFLOW-NETWORK-INTELLIGENCE.md](docs/URBANFLOW-NETWORK-INTELLIGENCE.md).

## Testy

- `npm test`: **128/128 passed**.
- `npm run test:browser`: **7/7 passed**. Zrzuty zostaĹ‚y wykonane na 1920Ă—1080, 1366Ă—768, 1280Ă—720, 390Ă—844 i 360Ă—800. Przetestowano warstwy, panel problemĂłw, profil mobilny, dotyk, formularz, zapis JSON i edytor rozkĹ‚adu.
- Kontrola przeglÄ…darki nie wykazaĹ‚a bĹ‚Ä™dĂłw JavaScript ani poziomego przepeĹ‚nienia widoku w testowanych wymiarach.

## GitHub Actions

Wszystkie zadania dla końcowego commita kodu `f53136edcd423df9bc75124cb096560ebaaf725b` zakończyły się sukcesem:

- Node 18 â€” success
- Node 20 â€” success
- Node 22 â€” success
- Playwright â€” success

[Run Actions #44033913388](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44033913388)

## Pomiary wydajnoĹ›ci

Pomiary wykonano po rozgrzaniu obu Ĺ›cieĹĽek, w dziewiÄ™ciu powtĂłrzeniach po 20 tickĂłw, na tym samym stanie poczÄ…tkowym dla kaĹĽdej prĂłbki. p95 w dziewiÄ™ciu prĂłbkach odpowiada najwyĹĽszej prĂłbce.

| Linie | PasaĹĽerowie | Kohorty | Analityka | Mediana / 20 tickĂłw | p95 / 20 tickĂłw |
|---:|---:|---:|:---:|---:|---:|
| 5 | 100 | 100 | wyĹ‚Ä…czona | 126,3 ms | 150,8 ms |
| 5 | 100 | 100 | wĹ‚Ä…czona | 116,7 ms | 149,9 ms |
| 20 | 1 000 | 500 | wyĹ‚Ä…czona | 86,0 ms | 95,2 ms |
| 20 | 1 000 | 500 | wĹ‚Ä…czona | 82,4 ms | 95,7 ms |
| 50 | 5 000 | 500 | wyĹ‚Ä…czona | 313,7 ms | 347,6 ms |
| 50 | 5 000 | 500 | wĹ‚Ä…czona | 294,7 ms | 323,8 ms |

SÄ… to pomiary komputera developerskiego i syntetycznego scenariusza; nie sÄ… gwarancjÄ… czasu ticku na Raspberry Pi. NajwiÄ™kszy scenariusz z analitykÄ… osiÄ…gnÄ…Ĺ‚ okoĹ‚o 16 ms na tick w p95, co wymaga osobnej kontroli na docelowym sprzÄ™cie przed wydaniem.

## Zrzuty ekranu

Artefakty pozostajÄ… poza repozytorium w `%TEMP%\urbanflow-alpha-0.9.0-visual-qa`:

- `desktop-1920x1080-atlas-network.png`
- `desktop-1366x768-atlas-network.png`
- `desktop-1280x720-atlas-network.png`
- `mobile-390x844-atlas-network.png`
- `mobile-360x800-atlas-network.png`
- Widok rzeczywistej linii: `desktop-1280x720-atlas-network-line.png` i `mobile-390x844-atlas-network-line.png`
- Dodatkowe obrazy mobilnego profilu miejsca, panelu mobilnoĹ›ci i eksportu JSON majÄ… ten sam katalog.

## Ograniczenia i ryzyka

- Symulacja nie rejestruje liczby pasaĹĽerĂłw przekraczajÄ…cych kaĹĽdy segment. Warstwa â€žPrzewozyâ€ť uĹĽywa wiÄ™c obserwowanego wykorzystania pojemnoĹ›ci jako wskaĹşnika natÄ™ĹĽenia i wyjaĹ›nia to w legendzie.
- Drobne rĂłĹĽnice miÄ™dzy oknami mogÄ… wynikaÄ‡ z pory dnia i popytu; zestawienie nie dowodzi, ĹĽe zmiana floty lub rozkĹ‚adu spowodowaĹ‚a konkretny wynik.
- Test wydajnoĹ›ci nie zastÄ™puje pomiaru na Raspberry Pi.
- Automatyczne utworzenie Draft PR zakoĹ„czyĹ‚o siÄ™ odpowiedziÄ… GitHub API **403 Resource not accessible by integration**. GaĹ‚Ä…Ĺş jest juĹĽ wypchniÄ™ta. RÄ™czny link: [utwĂłrz Pull Request](https://github.com/lukasz-mateusz-zabkowski/urbanflow/pull/new/feature/alpha-0.9.0); ustaw bazÄ™ `feature/alpha-0.8.0`, nie `main`, poniewaĹĽ 0.8.0 nadal jest gaĹ‚Ä™ziÄ… bazowÄ….

## Rekomendowany nastÄ™pny krok

RÄ™cznie utworzyÄ‡ Draft PR do `feature/alpha-0.8.0`, przejrzeÄ‡ zmianÄ™ 0.8.0 â†’ 0.9.0, a przed pĂłĹşniejszym wydaniem sprawdziÄ‡ p95 symulacji na Raspberry Pi. Merge i wdroĹĽenie pozostajÄ… nieprzeprowadzone.
