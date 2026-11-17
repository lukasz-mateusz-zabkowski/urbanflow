import { getCity, loadStops } from './cities.js?v=10';
import { UrbanFlowGame } from './game.js?v=12';
import { GameMap } from './map.js?v=11';
import { UI, confirmAction } from './ui.js?v=12';
import { TRANSPORT_TYPES } from './transport.js?v=10';
import { SIMULATION } from './simulation.js?v=10';
import { applyAtlasView } from './theme.js?v=10';
import { loadGame, saveGame, clearSave } from './storage.js?v=12';

let game, gameMap, ui, timer, removeStarterRoutes;
let storage, storageWarningShown = false;
try { storage = window.localStorage; } catch { /* Private mode can refuse storage entirely. */ }
const city = getCity('krakow');
applyAtlasView();
await loadStops(city);
const cityScreen = document.getElementById('cityScreen');
const gameElement = document.getElementById('game');
const initial = loadGame(storage, city);

function persist() {
  if (!game) return;
  const result = saveGame(storage, game.state, city.id);
  const status = document.getElementById('saveStatus');
  status.textContent = result.ok ? '✓ Zapisano na tym urządzeniu' : '⚠ Zapis niedostępny';
  status.classList.toggle('negative', !result.ok);
  if (!result.ok && !storageWarningShown && ui) { ui.toast(result.message, 'warn'); storageWarningShown = true; }
}

function renderCityScreen(error = null) {
  const grid = document.getElementById('cityGrid');
  grid.innerHTML = `<button class="city-card" id="startKrakow" type="button"><span class="city-number">01</span><span><strong>Kraków</strong><small>losowy start aglomeracyjny → węzły → lotnisko</small></span><i>${game ? 'Wróć do gry →' : 'Rozpocznij →'}</i></button>`;
  document.getElementById('startKrakow').addEventListener('click', async () => {
    if (game) {
      cityScreen.classList.add('is-hidden'); gameElement.classList.remove('is-hidden');
      gameMap.setVisible(true); gameMap.invalidate(); ui.render(); return;
    }
    if (error && !await confirmAction('Nie można odczytać poprzedniego zapisu. Rozpocząć nową grę? Kopia uszkodzonego zapisu pozostanie do odzyskania.', 'Rozpocznij')) return;
    startCity();
  });
  if (error) { const warning = document.createElement('p'); warning.className = 'city-description'; warning.textContent = error; grid.append(warning); }
}

function startCity(savedState = null) {
  if (!window.L) { window.alert('Nie udało się uruchomić lokalnej biblioteki mapy. Odśwież stronę.'); return; }
  clearInterval(timer); ui?.destroy(); removeStarterRoutes?.(); gameMap?.destroy();
  ui = null; storageWarningShown = false;
  cityScreen.classList.add('is-hidden'); gameElement.classList.remove('is-hidden');
  game = new UrbanFlowGame(city, {
    onSave: persist,
    onChange: () => ui?.render(),
    onLineCreated: line => {
      removeStarterRoutes?.();
      ui?.event(`Uruchomiono ${line.name}. Wpływy pojawią się po dotarciu pasażerów do celu.`);
      ui?.toast(`Linia ${line.name} działa.`, 'celebrate');
    },
    onUnlock: type => { ui?.event(`Odblokowano: ${TRANSPORT_TYPES[type].name}.`); ui?.toast(`Nowy transport: ${TRANSPORT_TYPES[type].name}`, 'celebrate'); },
    onAirportUnlocked: () => { ui?.event('Balice są dostępne. Doprowadź kolej lub metro do lotniska.'); ui?.toast('Lotnisko czeka na połączenie.', 'celebrate'); },
    onStopsRevealed: stops => {
      const names = stops.slice(0, 3).map(s => s.name).join(', ');
      ui?.event(`Nowe przystanki na mapie: ${stops.length} (${names}${stops.length > 3 ? '…' : ''}).`);
      ui?.toast(`Odkryto ${stops.length} nowych przystanków`, 'celebrate');
    },
    onCityEvent: event => ui?.event(`${event.title}: ${event.message}`),
    onCityEventPlanned: event => ui?.event(`Zapowiedź: ${event.title}. ${event.message}`),
    onStressPhase: (phase, index, count) => ui?.toast(`Test ${index}/${count}: ${phase.title}`, 'celebrate'),
    onTick: result => {
      if (game.state.budget < 0) ui?.event('Ujemny budżet! Zmniejsz koszty. Zadłużenie 50 000 zł oznacza bankructwo.');
      else if (game.state.satisfaction < 25) ui?.event(`Kryzys zadowolenia: ${game.state.lowQualityMinutes}/360 min. Połącz oczekujących pasażerów.`);
      else if (result.overcrowded.length && game.state.elapsedMinutes % 60 === 0) ui?.event(`Przeciążone przystanki: ${result.overcrowded.length}. Sprawdź kolejki i częstotliwości linii.`);
    }
  }, savedState);
  gameMap = new GameMap('map', id => { game.selectNode(id); ui?.selectPlace(id); }, id => {
    ui.selectedLineId = id; ui.renderNetwork(); gameMap.highlightLine(id); ui.openPanel();
    document.getElementById('lineDetail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  gameMap.loadCity(city);
  ui = new UI(game, gameMap, { onNewGame: async () => {
    if (!await confirmAction('Rozpocząć nową grę? Obecny zapis kampanii Krakowa zostanie zastąpiony.', 'Rozpocznij nową grę')) return;
    const result = clearSave(storage);
    if (!result.ok && storage) { ui.toast(result.message, 'warn'); return; }
    startCity();
  } });
  document.getElementById('objectiveTitle').textContent = `${game.startScenario.name} → ${game.pointName(game.startScenario.localHubId)}`;
  document.getElementById('objectiveCopy').textContent = 'Zbuduj pierwszą linię dowozową. Trasa na mapie prowadzi po lokalnym korytarzu drogowym.';
  const selectStarter = id => { const result = game.selectStarterRoute(id); if (!result.ok) ui.toast(result.message, 'warn'); return result; };
  ui.renderStarterRoutes(selectStarter);
  if (!game.state.lines.length && game.state.elapsedMinutes === 0) removeStarterRoutes = gameMap.showStarterRoutes({ ...city, starterRoutes: game.starterRoutes }, id => { selectStarter(id); ui.openPanel(); ui.scrollToBuild(); });
  else removeStarterRoutes = null;
  document.getElementById('mapLegend').innerHTML = Object.values(TRANSPORT_TYPES).map(type => `<span><i style="background:${type.color}"></i>${type.name}</span>`).join('');
  ui.render(); gameMap.invalidate(); persist();
  if (savedState) ui.event('Wczytano zapis kampanii. Czas nie upływa, gdy karta jest ukryta.');
  timer = setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]') && !gameElement.classList.contains('is-hidden')) game.tick(); }, SIMULATION.realTickMs);
}

document.getElementById('backToCities').addEventListener('click', () => {
  game.setPaused(true); gameMap.setVisible(false); ui.closePanel();
  gameElement.classList.add('is-hidden'); cityScreen.classList.remove('is-hidden'); renderCityScreen();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('pagehide', persist);
renderCityScreen(initial.error);
if (initial.state) startCity(initial.state);
