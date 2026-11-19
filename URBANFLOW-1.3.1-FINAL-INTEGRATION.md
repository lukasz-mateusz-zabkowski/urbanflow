# UrbanFlow ALPHA 1.3.1 — final integration

## Stan integracji

- Początkowy `main`: `d9632740bb1ebe21fc1210b39da995961ec394fb`.
- Kandydat i fast-forward `main`: `b5f6c67408088a537be9720fe2607df0f49f765c`.
- Branch feature pozostaje zachowany: `feature/alpha-1.3.1-tramway-construction`.
- Repozytorium ma puste rulesets, a API gałęzi zwraca `protected: false`. Endpoint szczegółowej ochrony zwrócił 403, ale dostępne ustawienia nie wymagają PR.
- Push zwykłym fast-forward zakończył się powodzeniem; nie użyto rebase, squash ani force push.

## Kontrola i walidacja

Na dokładnym kandydacie wykonano `npm ci`, `npm test`, `npm run test:browser`, `npm run audit:all` oraz `npm run audit:production`.

- Node: **216/216** testów zaliczonych.
- Playwright: **19/19** testów zaliczonych; sprawdzono desktop i mobile, w tym edycję geometrii tramwaju, przeciąganie myszy/dotykiem oraz zapis i wznowienie kampanii.
- Audyt wszystkich zależności: **0 podatności**.
- Audyt produkcyjnych zależności: **0 podatności**.
- Dotychczasowe testy obejmują nowe kampanie bez syntetycznego `centrum`, odczyt dawnych kampanii, lokalny routing autobusowy, blokadę obsługi i animacji linii niedostępnych, tryby tramwajowe, współdzielenie torów, bezpieczeństwo kosztów, schemat 11, inwestycje i City Evolution.
- Ręczna geometria jest zapisywana i używana przez podgląd oraz animację; tryb torów gracza wykorzystuje lokalne segmenty infrastruktury. Podgląd i `previewLine()` odtwarzają tę samą geometrię przez wspólne funkcje trasujące.

GitHub Actions na `main`, SHA `b5f6c67408088a537be9720fe2607df0f49f765c`: [run 44550314087 — 6/6 SUCCESS](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44550314087). Testy obejmowały Node 18, 20 i 22, Playwright, security audit oraz container health.

## Zapis i ograniczenia

Nie zwiększano schematu ponad 11. Migracje zachowują linie i geometrię; nieosiągalne stare trasy autobusowe pozostają zachowane i są oznaczane jako niedostępne, bez generowania sztucznej geometrii, kursów ani pasażerów.

Ręczne tory nie są walidowane pod kątem pełnych wymagań inżynieryjnych. Tryb istniejącej infrastruktury wybiera trasę po torach gracza albo OSM, ale nie łączy ich jeszcze w jedną mieszaną trasę. OSM i dane routingu nie zostały zmienione w tym wydaniu.

Zrzuty Playwright pozostają poza repozytorium w `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.3.1-tramway-qa`.

## Tag i decyzja

Po zakończeniu CI dla commita zawierającego ten raport zostanie utworzony anotowany tag `v1.3.1-alpha` wskazujący dokładny końcowy `main`. Nie będzie publikowany GitHub Release. Nie wykonano wdrożenia.

**Status: GO**, pod warunkiem zielonego workflow dla raportowego commita i poprawnej weryfikacji tagu na jego SHA.

