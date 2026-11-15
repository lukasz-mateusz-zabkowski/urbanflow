import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { airportUnlocked, unlockedTypes, TRANSPORT_TYPES, PROGRESSION } from '../public/js/transport.js';
import { campaignObjectives, updateCampaign, STRESS_PHASES } from '../public/js/campaign.js';
import { demandMultiplier, gameClock, SIMULATION } from '../public/js/simulation.js';

const city = CITIES.krakow;
const startedGame = events => {
  const game = new UrbanFlowGame(city, events);
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  return game;
};
const mature = line => { line.ageMinutes = PROGRESSION.minAgeMinutes; line.stats.carried = 100; line.stats.revenue = 700; line.stats.expenses = 300; return line; };
const sevenGoals = ['gateway', 'center', 'passengers', 'buses', 'tram', 'huta', 'airport'];

test('starter preview changes no infrastructure or money and its displayed cost is charged on confirmation', () => {
  const game = new UrbanFlowGame(city);
  const preview = game.selectStarterRoute('loop-center');
  assert.equal(preview.ok, true);
  assert.equal(game.state.lines.length, 0);
  assert.equal(game.state.budget, city.startingBudget);
  game.tick(() => 0.5);
  assert.equal(game.state.elapsedMinutes, 0, 'the opening waits for the first confirmed service');
  const result = game.createSelectedLine();
  assert.equal(result.ok, true);
  assert.deepEqual(result.line.stops, ['wieliczka', 'biezanow', 'centrum']);
  assert.equal(result.line.cost, preview.cost);
  assert.equal(game.state.budget, city.startingBudget - preview.cost + 130000);
  assert.deepEqual(game.state.campaign.completed, ['gateway', 'center']);
});

test('invalid, hidden and unaffordable routes cannot mutate the network or bypass cost', () => {
  const game = startedGame();
  const previous = JSON.stringify(game.state);
  for (const [type, stops] of [['bus', ['centrum']], ['metro', ['centrum', 'dworzec']],
    ['bus', ['centrum', 'balice']], ['bus', ['centrum', 'ruczaj', 'centrum']], ['bus', ['centrum', 'missing']]]) {
    assert.equal(game.addLine(type, stops, 0).ok, false);
    assert.equal(JSON.stringify(game.state), previous);
  }
  game.state.budget = 1;
  const result = game.addLine('bus', ['centrum', 'ruczaj'], 0);
  assert.equal(result.ok, false);
  assert.match(result.message, /Brakuje/);
  assert.equal(game.state.lines.length, 1);
  assert.equal(game.state.budget, 1);
});

test('identical and reversed services are rejected without granting progression', () => {
  const game = startedGame();
  const original = [...game.state.lines[0].stops];
  assert.equal(game.addLine('bus', original).ok, false);
  assert.equal(game.addLine('bus', original.reverse()).ok, false);
  assert.deepEqual(game.availableTypes(), ['bus']);
  assert.equal(game.state.lines.length, 1);
});

test('multi-stop editing supports extend, reorder and remove with preview-matched rebuilding charges', () => {
  const game = startedGame();
  const line = game.state.lines[0];
  mature(line);
  assert.equal(game.beginEditLine(line.id).ok, true);
  game.selectNode('ruczaj');
  game.moveSelectedStop(3, -1);
  assert.deepEqual(game.state.selectedNodes, ['wieliczka', 'biezanow', 'ruczaj', 'centrum']);
  const extension = game.previewLine();
  const before = game.state.budget;
  assert.equal(game.createSelectedLine().ok, true);
  assert.equal(game.state.budget, before - extension.cost);
  assert.deepEqual(line.stops, ['wieliczka', 'biezanow', 'ruczaj', 'centrum']);
  assert.equal(line.ageMinutes, 0, 'a materially changed service must earn its progression credit again');
  assert.equal(line.stats.carried, 0);
  game.beginEditLine(line.id);
  game.removeSelectedStop(2);
  const shortening = game.previewLine();
  assert.ok(shortening.cost > 0, 'removing infrastructure does not farm refunds');
  const afterExtension = game.state.budget;
  assert.equal(game.createSelectedLine().ok, true);
  assert.equal(game.state.budget, afterExtension - shortening.cost);
  assert.deepEqual(line.stops, ['wieliczka', 'biezanow', 'centrum']);
  game.beginEditLine(line.id);
  assert.equal(game.previewLine().cost, 0);
  game.cancelEdit();
  assert.equal(game.state.editingLineId, null);
  assert.deepEqual(game.state.selectedNodes, []);
});

test('unaffordable and duplicate edits leave paid infrastructure and service history intact', () => {
  const game = startedGame();
  const first = game.state.lines[0];
  const second = game.addLine('bus', ['ruczaj', 'centrum']).line;
  mature(second);
  assert.equal(game.editLine(second.id, [...first.stops].reverse()).ok, false);
  game.state.budget = 0;
  const oldLine = JSON.stringify(second);
  assert.equal(game.editLine(second.id, ['ruczaj', 'centrum', 'dworzec']).ok, false);
  assert.equal(JSON.stringify(second), oldLine);
  assert.equal(game.state.budget, 0);
});

test('vehicle purchase and timetable controls respect prices, fleet limits and invalid input', () => {
  const game = startedGame();
  const line = game.state.lines[0];
  const before = game.state.budget;
  assert.equal(game.buyVehicle(line.id).ok, true);
  assert.equal(line.vehicles, 3);
  assert.equal(game.state.budget, before - TRANSPORT_TYPES.bus.vehicleCost);
  assert.equal(game.setFrequency(line.id, 6).ok, true);
  assert.equal(line.frequency, 6);
  for (const invalid of [0, 9, 'bad', Infinity, -1]) assert.equal(game.setFrequency(line.id, invalid).ok, false);
  assert.equal(line.frequency, 6);
  line.vehicles = 16;
  assert.equal(game.buyVehicle(line.id).ok, false);
  line.vehicles = 3; game.state.budget = 0;
  assert.equal(game.buyVehicle(line.id).ok, false);
});

test('two useful bus services unlock trams only after service and satisfaction requirements', () => {
  const game = startedGame();
  game.addLine('bus', ['ruczaj', 'centrum']);
  assert.deepEqual(unlockedTypes(game.state.lines), ['bus']);
  game.state.lines.forEach(mature);
  game.state.satisfaction = 40;
  assert.deepEqual(unlockedTypes(game.state.lines, game.state.satisfaction), ['bus']);
  game.state.satisfaction = 88;
  game.tick(() => 0.99);
  assert.deepEqual(game.availableTypes(), ['bus', 'tram']);
  assert.ok(game.state.campaign.completed.includes('buses'));
});

test('deleted lines cannot satisfy an unearned transport unlock or campaign grant', () => {
  const game = startedGame();
  const second = game.addLine('bus', ['ruczaj', 'centrum']).line;
  game.state.lines.forEach(mature);
  game.beginEditLine(second.id);
  assert.equal(game.deleteLine(second.id).ok, true);
  assert.equal(game.state.editingLineId, null);
  const grantBefore = game.state.campaign.grants;
  game.tick(() => 0.99);
  assert.deepEqual(game.availableTypes(), ['bus']);
  assert.equal(game.state.campaign.completed.includes('buses'), false);
  assert.equal(game.state.campaign.grants, grantBefore);
  assert.equal(game.deleteLine(second.id).ok, false);
});

test('airport branches require distinct, useful lines and retain the original transport types', () => {
  const lines = (type, count) => Array.from({ length: count }, (_, index) => mature({
    id: `${type}-${index}`, type, stops: [`a${index}`, `b${index}`], stats: { carried: 0, revenue: 0, expenses: 0 }
  }));
  assert.equal(airportUnlocked(lines('metro', 3)), true);
  assert.equal(airportUnlocked(lines('suburban', 2)), true);
  assert.equal(airportUnlocked([...lines('intercity', 1), ...lines('metro', 2)]), true);
  assert.equal(airportUnlocked(lines('metro', 2)), false);
  assert.equal(airportUnlocked(lines('suburban', 2), 40), false);
  assert.equal(airportUnlocked(lines('suburban', 2).map(line => ({ ...line, ageMinutes: 0 }))), false);
  assert.deepEqual(unlockedTypes(lines('tram', 4)), ['bus', 'metro', 'suburban', 'intercity']);
});

test('campaign quality accumulator still requires strictly more than 75% continuously', () => {
  const game = startedGame();
  game.state.satisfaction = 80;
  updateCampaign(game, 354);
  assert.equal(game.state.campaign.qualityMinutes, 354);
  game.state.satisfaction = 75;
  updateCampaign(game, 6);
  assert.equal(game.state.campaign.qualityMinutes, 0);
  game.state.satisfaction = 76;
  updateCampaign(game, 360);
  assert.equal(game.state.campaign.qualityMinutes, 360);
});

test('objective rewards cannot be farmed by rebuilding the starter or repeating completed checks', () => {
  const game = startedGame();
  game.deleteLine(game.state.lines[0].id);
  const before = game.state.budget;
  const grants = game.state.campaign.grants;
  const rebuilt = game.chooseStarterRoute('loop-center');
  assert.equal(rebuilt.ok, true);
  assert.equal(game.state.budget, before - rebuilt.line.cost);
  game.state.carried = 500;
  updateCampaign(game, 0);
  const rewarded = game.state.budget;
  for (let repeat = 0; repeat < 10; repeat += 1) updateCampaign(game, 0);
  assert.equal(game.state.budget, rewarded);
  assert.equal(game.state.campaign.grants, grants + 120000);
  assert.equal(game.state.campaign.completed.filter(id => id === 'passengers').length, 1);
});

test('victory requires completing every phase of the final network stress test', () => {
  const game = startedGame();
  game.state.campaign.completed = [...sevenGoals];
  for (const phase of STRESS_PHASES) for (let minute = 0; minute < phase.duration; minute += 6) updateCampaign(game, 6);
  assert.equal(game.state.campaign.stress.status, 'passed');
  assert.equal(game.state.campaign.phaseIndex, undefined);
  assert.equal(game.state.status, 'won');
  assert.equal(game.state.paused, true);
  assert.equal(game.state.campaign.completed.length, 8);
  const before = JSON.stringify(game.state);
  game.tick(() => 0.5);
  assert.equal(JSON.stringify(game.state), before);
  assert.equal(game.addLine('bus', ['ruczaj', 'centrum']).ok, false);
});

test('six critical hours during the final test cause a clear campaign defeat', () => {
  const game = startedGame();
  game.state.campaign.completed = [...sevenGoals];
  game.state.satisfaction = 40;
  updateCampaign(game, 360);
  assert.equal(game.state.status, 'lost');
  assert.match(game.state.lossReason, /nie przetrwała/);
});

test('bankruptcy ends the game once debt exceeds its limit, with a persisted final result', () => {
  let finishes = 0;
  let savedStatus = null;
  const game = startedGame({ onFinish: () => { finishes += 1; }, onSave: state => { savedStatus = state.status; } });
  game.state.budget = -49999;
  game.tick(() => 0.99);
  assert.equal(game.state.status, 'lost');
  assert.match(game.state.lossReason, /Bankructwo/);
  assert.equal(savedStatus, 'lost');
  game.tick(() => 0.99);
  assert.equal(finishes, 1);
});

test('abandoning a revealed network can cause sustained low-quality defeat without artificial satisfaction overrides', () => {
  const game = startedGame();
  game.addLine('bus', ['ruczaj', 'centrum']);
  game.tick(() => 0.65);
  for (const line of [...game.state.lines]) game.deleteLine(line.id);
  for (let tick = 0; tick < 1000 && game.state.status === 'playing'; tick += 1) game.tick(() => 0.65);
  assert.equal(game.state.status, 'lost');
  assert.match(game.state.lossReason, /Zadowolenie/);
  assert.ok(game.state.lowQualityMinutes >= 360);
  assert.ok(game.state.budget > 0, 'this defeat is due to failed service, not bankruptcy');
});

test('pause freezes demand and finances; speed advances proportional fixed simulation steps', () => {
  const game = startedGame();
  game.setPaused(true);
  const paused = JSON.stringify(game.state);
  game.tick(() => 0.5);
  assert.equal(JSON.stringify(game.state), paused);
  game.setPaused(false);
  game.setSpeed(4);
  game.tick(() => 0.99);
  assert.equal(game.state.elapsedMinutes, 4 * SIMULATION.minutesPerTick);
  game.setSpeed(3);
  assert.equal(game.state.speed, 4);
});

test('game clock starts at 06:00, crosses midnight, and rush hours exceed night demand', () => {
  assert.equal(gameClock(0).label, 'Dzień 1 · 06:00');
  assert.equal(gameClock(18 * 60).label, 'Dzień 2 · 00:00');
  assert.equal(gameClock(24 * 60).label, 'Dzień 2 · 06:00');
  assert.ok(demandMultiplier(8 * 60) > demandMultiplier(2 * 60));
});
