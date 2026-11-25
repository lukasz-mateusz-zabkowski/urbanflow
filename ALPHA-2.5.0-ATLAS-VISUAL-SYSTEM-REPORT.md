# UrbanFlow Atlas 2.5.0 — Atlas Visual System

Data: 2026-11-25  
Branch: `feature/alpha-2.5.0-atlas-visual-system`  
Implementacyjny SHA: `2d7d3a5c34277aa2606dfa5451bdc33a037381fe`  
Baza: kandydat 2.0.0 `17ae88427830196d2cea7386d3a36024b3ee4d62` (zależność pozostaje niescalona z `main`).

## Zakres

- Dodano trzy przełączalne style: Atlas City, Atlas Network i Atlas Midnight.
- Preferencja stylu jest zapisywana osobno od kampanii. Zmiana motywu nie modyfikuje stanu `UrbanFlowGame` ani schematu zapisu.
- Zachowano pięć workspace, kolory typów transportu i istniejącą warstwę Leaflet.
- Style Network i Midnight mają odrębne tokeny kolorów dla interfejsu i mapy; uwzględniono `prefers-reduced-motion`.
- Test przeglądarkowy sprawdza kontrast tekstu w Midnight.

## Walidacja

| Kontrola | Wynik |
|---|---:|
| `npm ci` | PASS, 73 pakiety, bez podatności zgłoszonych podczas instalacji |
| `npm test` | PASS, 315/315 |
| `npm run test:browser` | PASS, 56/56 |
| `npm run audit:all` | PASS, 0 podatności |
| `npm run audit:production` | PASS, 0 podatności |
| `git diff --check` | PASS |
| Rzeczywiste kafelki OSM | PASS, 16/16 odpowiedzi HTTP 200, brak błędów JavaScript |

Testy motywów obejmują desktop 1366×768 i mobile 360×800, przełączanie wszystkich stylów, zachowanie preferencji po przeładowaniu, niezmienność kampanii, brak poziomego overflow i reduced-motion. Zrzuty są lokalnymi artefaktami, poza repozytorium.

## Zrzuty ekranu

- Motywy desktop i mobile: `C:\Users\Łukasz\AppData\Local\Temp\urbanflow-alpha-2.5.0-themes\` (desktop i mobile dla trzech stylów).
- Rzeczywista mapa OSM, 1366×768: `C:\Users\Łukasz\AppData\Local\Temp\urbanflow-fundament-ii-visual-qa\desktop-live-osm-1366x768.png`.

Desktop Midnight został obejrzany po poprawce kontrastu. Zrzuty motywów testowych używają deterministycznych kafelków testowych; osobny zrzut i test OSM używają rzeczywistych kafelków.

## Wydajność

Porównanie 2.0.0 i 2.5.0 na tej samej maszynie, 1366×768, 60 próbek na wersję; mierzono zmianę warstwy Passenger Flow od interakcji do dwóch klatek paint, po rozgrzaniu workspace:

| Wariant | Mediana | p95 |
|---|---:|---:|
| 2.0.0 | 30.4 ms | 46.8 ms |
| 2.5.0 | 30.4 ms | 47.1 ms |

Mediana bez zmiany; p95 wzrósł o 0.3 ms. Ten pomiar nie wskazuje na istotną regresję. Wynik dotyczy lokalnego środowiska i nie gwarantuje wydajności na innym sprzęcie.

## GitHub i status

Implementacyjny SHA `2d7d3a5c34277aa2606dfa5451bdc33a037381fe` przeszedł lokalną walidację. Raport i aktualizacja master planu są częścią końcowego pushu funkcjonalnej gałęzi. Status GitHub Actions dla końcowego SHA po pushu należy zweryfikować; do tego czasu CI końcowego SHA jest **oczekujące**. Nie wykonano merge, tagowania, publikacji wydania ani zmian produkcyjnych.

**Status: NO GO do czasu potwierdzenia GitHub Actions dla końcowego SHA.** Kandydat zależy od niescalonego kandydata 2.0.0. Fundament II pozostaje **INCOMPLETE** do integracji wymaganych kandydatów i przejścia bramki 2.9.0.
