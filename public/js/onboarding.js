export const ONBOARDING_STEPS = Object.freeze([
  { id: 'map', title: 'Poznaj mapę i panel', text: 'Wybierz punkt na mapie albo otwórz profil miejsca, aby zobaczyć, jak planować pierwsze połączenie.', tip: 'Czas możesz zatrzymać przed rozpoczęciem budowy.' },
  { id: 'first-goal', title: 'Wybierz pierwszy cel', text: 'Wskaż węzeł początkowy lub lokalny przystanek, który ma zostać połączony z Twoją miejscowością.', tip: 'Podświetlony przerywany korytarz jest propozycją przebiegu.' },
  { id: 'plan-bus', title: 'Zaplanuj linię autobusową', text: 'Wybierz przynajmniej dwa przystanki w kolejności przejazdu.', tip: 'Punkty możesz przestawiać strzałkami w panelu.' },
  { id: 'review-cost', title: 'Sprawdź przebieg i koszt', text: 'Przejrzyj geometrię, długość, czas oraz koszt. Niepoprawna lub nieosiągalna trasa nie powinna być zatwierdzana.', tip: 'Podgląd nie pobiera pieniędzy.' },
  { id: 'build-line', title: 'Zbuduj linię', text: 'Zatwierdź poprawną, dostępną trasę, gdy budżet i flota na nią pozwalają.', tip: 'Koszt jest pobierany dopiero przy zatwierdzeniu.' },
  { id: 'start-service', title: 'Uruchom symulację', text: 'Pozwól czasowi gry upłynąć, gdy linia jest gotowa do obsługi.', tip: 'Pauza zatrzymuje symulację.' },
  { id: 'passengers', title: 'Zaobserwuj pierwsze przewozy', text: 'Poczekaj, aż symulacja zarejestruje rzeczywiście przewiezionych pasażerów.', tip: 'Samo narysowanie linii nie tworzy przewozów.' },
  { id: 'fleet', title: 'Sprawdź wykorzystanie pojazdów', text: 'Otwórz szczegóły działającej linii i porównaj flotę, obciążenie, oczekiwanie oraz bilans.', tip: 'Dodatkowy pojazd kosztuje; sprawdź go przed zakupem.' },
  { id: 'diagnose-network', title: 'Zdiagnozuj sieć', text: 'Otwórz warstwę diagnostyczną po zebraniu danych z działającej symulacji.', tip: 'Wskaźniki diagnostyczne pochodzą z obserwowanych przewozów i kolejek.' },
  { id: 'improve-network', title: 'Wprowadź pierwszą poprawę', text: 'Zmień sieć po diagnozie — na przykład częstotliwość, flotę albo przebieg linii — i sprawdź nowy podgląd.', tip: 'Zmiana musi rzeczywiście zaktualizować sieć.' },
  { id: 'opportunities', title: 'Odkryj dalsze możliwości', text: 'Sprawdź odblokowane środki transportu, cele kampanii i potencjał obszarów.', tip: 'Odblokowanie zależy od osiągnięć kampanii.' },
  { id: 'investment', title: 'Poznaj inwestycje miejskie', text: 'Otwórz profil obszaru i porównaj ograniczenia oraz skutki inwestycji przed jej zatwierdzeniem.', tip: 'Inwestycja nie zwiększa liczby mieszkańców natychmiast.' }
]);

function firstLine(game) { return game.state.lines[0] || null; }

export function onboardingProgress(game, previewResult = null) {
  const state = game.state;
  const line = firstLine(game);
  const preview = previewResult || game.previewLine('bus', state.selectedNodes, state.editingLineId);
  const baseline = state.preferences?.tutorialDiagnosisVersion;
  const actions = state.preferences?.tutorialActions || {};
  const tracked = state.preferences?.tutorialActionsVersion === 1;
  const historyReady = (state.networkHistory || []).length > 0;
  const legacy = !tracked;
  const investments = state.investments || {};
  const invested = (investments.projects || []).some(project => ['in-progress', 'completed'].includes(project.status))
    || (investments.history || []).some(item => ['approved', 'completed'].includes(item.status));
  const complete = [
    Boolean(state.preferences?.tutorialMapExplored || legacy && line),
    Boolean(actions.firstGoal || legacy && line),
    Boolean(actions.busPlanned || legacy && line),
    Boolean(actions.costPreview || legacy && line),
    Boolean(line),
    Boolean(line && state.elapsedMinutes > 0),
    state.carried > 0,
    Boolean(tracked ? actions.fleetDetails : line && line.vehicles > 0 && line.ageMinutes > 0
      && (line.stats?.expenses > 0 || line.stats?.carried > 0)),
    Boolean(historyReady && (tracked ? Number.isSafeInteger(baseline) : state.analyticsMode !== 'off' || legacy)),
    Boolean(Number.isSafeInteger(baseline) && state.networkVersion > baseline || legacy && state.networkVersion > 1),
    Boolean(actions.opportunities || legacy && (state.unlocked?.length > 1 || state.unlockedPointLevel > 0 || state.airportUnlocked)),
    Boolean(actions.investment || invested || legacy && state.analyticsMode === 'investments' && state.cityEvolution?.districts)
  ];
  return ONBOARDING_STEPS.map((step, index) => ({ ...step, completed: complete[index] }));
}

export function onboardingStatus(game, previewResult = null) {
  const savedStatus = game.state.preferences?.tutorialStatus;
  if (savedStatus === 'skipped') return { status: 'skipped', step: null, completed: 0, total: ONBOARDING_STEPS.length };
  const steps = onboardingProgress(game, previewResult);
  const current = steps.find(step => !step.completed) || null;
  if (game.state.status !== 'playing' && current) return { status: 'unavailable', step: current, completed: steps.filter(step => step.completed).length, total: steps.length };
  return { status: current ? 'active' : 'completed', step: current, completed: steps.filter(step => step.completed).length, total: steps.length };
}

export function getOnboardingStep(game, previewResult = null) {
  const status = onboardingStatus(game, previewResult);
  return status.status === 'active' ? status.step : null;
}

export function contextualHints(game) {
  const state = game.state;
  const hints = [];
  const unavailable = state.lines.find(line => line.routingUnavailable);
  if (unavailable) hints.push({ id: `route:${unavailable.id}`, kind: 'warning', text: `${unavailable.name || 'Linia'} nie ma dostępnej geometrii na lokalnym grafie: ${unavailable.routingUnavailable}. Nie wykonuje kursów; popraw jej przebieg przed wznowieniem obsługi.` });
  const queue = Object.entries(state.passengers || {}).find(([, passenger]) => (passenger.waiting || 0) >= 48);
  if (queue) {
    const stop = game.city.points.find(point => point.id === queue[0]);
    hints.push({ id: `queue:${queue[0]}`, kind: 'warning', text: `Na przystanku ${stop?.name || queue[0]} czeka ${Math.round(queue[1].waiting)} osób. Sprawdź częstotliwość i wolne miejsca na obsługujących go liniach.` });
  }
  const loss = state.lines.find(line => (line.stats?.balancePerHour || 0) < -100 && (line.stats?.ageMinutes || line.ageMinutes || 0) >= 30);
  if (loss) hints.push({ id: `profit:${loss.id}`, kind: 'notice', text: `${loss.name || 'Linia'} ma ujemny bilans ${Math.round(loss.stats.balancePerHour).toLocaleString('pl-PL')} zł/h. Porównaj koszty kursowania z obciążeniem i przewozami.` });
  if (state.budget < 0) hints.push({ id: 'budget:negative', kind: 'warning', text: `Budżet wynosi ${Math.round(state.budget).toLocaleString('pl-PL')} zł. Przed kolejną decyzją sprawdź koszty floty i częstotliwość.` });
  const residential = Object.values(state.cityEvolution?.districts || {}).find(zone => (zone.growthPotential || 0) >= 65 && (zone.accessibility?.score || 0) >= 0.4);
  if (residential) hints.push({ id: `growth:${residential.id}`, kind: 'notice', text: `${residential.name} ma wysoki modelowany potencjał rozwoju i zapewnioną dostępność transportu. Profil pokazuje ograniczenia oraz aktualne wartości.` });
  const approvedHousing = (state.investments?.projects || []).find(project => project.type === 'housing' && project.status === 'in-progress');
  if (approvedHousing) hints.push({ id: `investment:${approvedHousing.id}`, kind: 'notice', text: 'Inwestycja mieszkaniowa zwiększa pojemność, a zasiedlenie zachodzi stopniowo w City Evolution — nie od razu po zakupie.' });
  return hints;
}
