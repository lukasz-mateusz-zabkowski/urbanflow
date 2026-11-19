import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, KRAKOW_STARTS, chooseStartScenario } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { campaignObjectives } from '../public/js/campaign.js';
import { fleetSnapshot } from '../public/js/fleet.js';
import { TRANSPORT_TYPES } from '../public/js/transport.js';
import { latentDemand } from '../public/js/demand.js';
import { passengerTick } from '../public/js/passengers.js';
import { activeCityEvents, upcomingCityEvents, eventDemandMultiplier } from '../public/js/city-events.js';
import { MAP_LAYER_ORDER, stopHitStyle } from '../public/js/map.js';
import { routeLine, routingMode } from '../public/js/routing.js';
import { validateState } from '../public/js/storage.js';

const city = CITIES.krakow;
const gameAt = id => new UrbanFlowGame(city, { startScenarioId: id });

test('start selection covers every configured Kraków satellite deterministically', () => {
  assert.ok(KRAKOW_STARTS.length >= 11);
  const available = KRAKOW_STARTS.filter(item => item.availableForNewGame !== false);
  for (let index = 0; index < available.length; index += 1) {
    const random = () => (index + 0.01) / available.length;
    assert.equal(chooseStartScenario(random).id, available[index].id);
  }
  assert.equal(new Set(KRAKOW_STARTS.map(item => item.id)).size, KRAKOW_STARTS.length);
  assert.equal(chooseStartScenario(() => 0.999).id, available.at(-1).id);
  assert.equal(chooseStartScenario(() => 0, 'igolomia').id, 'igolomia', 'saved campaigns keep resolving the legacy scenario ID');
  assert.equal(KRAKOW_STARTS.find(item => item.id === 'igolomia').availableForNewGame, false);
});

for (const scenario of KRAKOW_STARTS) test(`hierarchical campaign opening works for ${scenario.name}`, () => {
  const game = gameAt(scenario.id);
  assert.equal(game.state.startScenarioId, scenario.id);
  assert.deepEqual(game.starterRoutes[0].stops, [scenario.id, scenario.localHubId]);
  assert.ok(game.visiblePoints().some(point => point.id === scenario.localHubId));
  assert.equal(game.chooseStarterRoute('starter-local').ok, true);
  assert.equal(campaignObjectives(game).find(goal => goal.id === 'gateway').completed, true);
  assert.equal(campaignObjectives(game).find(goal => goal.id === 'center').completed, false);
  assert.equal(game.addLine('bus', [scenario.localHubId, scenario.centerId]).ok, true);
  assert.equal(campaignObjectives(game).find(goal => goal.id === 'center').completed, true);
  assert.ok(game.state.budget > 0);
});

test('map panes and enlarged invisible stop hit area keep stops above routes', () => {
  assert.ok(MAP_LAYER_ORDER.base < MAP_LAYER_ORDER.routes);
  assert.ok(MAP_LAYER_ORDER.routes < MAP_LAYER_ORDER.effects);
  assert.ok(MAP_LAYER_ORDER.effects < MAP_LAYER_ORDER.stops);
  assert.ok(MAP_LAYER_ORDER.stops < MAP_LAYER_ORDER.prospects);
  assert.ok(MAP_LAYER_ORDER.prospects < MAP_LAYER_ORDER.ui);
  const hit = stopHitStyle(0, false);
  assert.equal(hit.radius, 5);
  assert.ok(hit.weight >= 14, 'transparent stroke expands the clickable area');
  assert.ok(hit.opacity <= 0.01, 'expanded stroke remains visually unobtrusive');
});

test('global fleet owns vehicles separately from line assignments and supports transfers', () => {
  const game = gameAt('wieliczka');
  game.chooseStarterRoute('starter-local');
  const second = game.addLine('bus', ['biezanow', 'dworzec']).line;
  let bus = fleetSnapshot(game.state).bus;
  assert.deepEqual(bus, { owned: 6, assigned: 4, reserve: 2 });
  assert.equal(game.assignVehicle(second.id).ok, true);
  bus = fleetSnapshot(game.state).bus;
  assert.deepEqual(bus, { owned: 6, assigned: 5, reserve: 1 });
  const first = game.state.lines[0];
  assert.equal(game.transferVehicle(second.id, first.id).ok, true);
  assert.equal(first.vehicles, 3);
  assert.equal(second.vehicles, 2);
  const before = game.state.budget;
  assert.equal(game.purchaseFleetVehicle('bus').ok, true);
  assert.equal(game.state.budget, before - TRANSPORT_TYPES.bus.vehicleCost);
  assert.equal(game.state.fleetPurchases, TRANSPORT_TYPES.bus.vehicleCost);
  assert.equal(fleetSnapshot(game.state).bus.reserve, 2);
  game.deleteLine(second.id);
  assert.equal(fleetSnapshot(game.state).bus.reserve, 4);
});

test('latent demand exists before service and only served points create real cohorts', () => {
  const game = gameAt('michalowice');
  const forecast = latentDemand(city.points, [], 8 * 60);
  assert.equal(forecast.length, city.points.length);
  assert.ok(forecast.every(item => item.potential > 0 && item.served === false));
  game.chooseStarterRoute('starter-local');
  const served = new Set(game.state.lines.flatMap(line => line.stops));
  passengerTick(game.state, game.visiblePoints(), 8 * 60, () => 0.01);
  assert.ok(game.state.cohorts.length > 0);
  assert.ok(game.state.cohorts.every(group => served.has(group.origin) && served.has(group.destination)));
  assert.ok(latentDemand(city.points, game.state.lines, 8 * 60).some(item => !item.served && item.potential > 0));
});

test('events are announced before activation and affect demand only after their start', () => {
  const game = gameAt('wieliczka');
  const event = game.triggerCityEvent(() => 0);
  assert.ok(event.startMinute >= game.state.elapsedMinutes + 360);
  assert.equal(activeCityEvents(game.state.cityEvents, game.state.elapsedMinutes).length, 0);
  assert.equal(upcomingCityEvents(game.state.cityEvents, game.state.elapsedMinutes).length, 1);
  assert.equal(eventDemandMultiplier(game.state.cityEvents, event.locationId, event.startMinute - 1), 1);
  assert.ok(eventDemandMultiplier(game.state.cityEvents, event.locationId, event.startMinute) > 1);
});

test('offline routing follows multi-point corridors and survives editing, saving and deletion', () => {
  const road = routeLine(['wieliczka', 'biezanow', 'centrum'], 'bus', city);
  assert.ok(road.length > 3);
  assert.deepEqual(road[0], [49.9871, 20.0648]);
  assert.deepEqual(road.at(-1), [50.0617, 19.9373]);
  assert.equal(routingMode('bus'), 'road');
  assert.equal(routeLine(['centrum', 'nowa-huta'], 'metro', city).length, 2);
  const game = gameAt('wieliczka');
  game.chooseStarterRoute('starter-local');
  const line = game.state.lines[0];
  const before = JSON.stringify(line.routeGeometry);
  assert.equal(game.editLine(line.id, ['wieliczka', 'biezanow', 'dworzec']).ok, true);
  assert.notEqual(JSON.stringify(line.routeGeometry), before);
  assert.equal(validateState(JSON.parse(JSON.stringify(game.state)), city), true);
  assert.equal(game.deleteLine(line.id).ok, true);
  assert.equal(game.state.lines.length, 0);
});

test('new 0.4 save data rejects invalid fleet, scenario, event forecast and route geometry', () => {
  const game = gameAt('zielonki');
  game.chooseStarterRoute('starter-local');
  game.triggerCityEvent(() => 0);
  const good = JSON.parse(JSON.stringify(game.state));
  assert.equal(validateState(good, city), true);
  for (const mutate of [
    state => { state.fleet.bus.owned = 0; },
    state => { state.startScenarioId = 'nie-istnieje'; },
    state => { state.cityEvents[0].announcedMinute = state.cityEvents[0].startMinute + 1; },
    state => { state.lines[0].routeGeometry = [[Infinity, 20], [50, 20]]; }
  ]) {
    const copy = JSON.parse(JSON.stringify(good)); mutate(copy);
    assert.equal(validateState(copy, city), false);
  }
});

test('0.3 save without new hubs, fleet, scenario or routed geometry remains loadable', () => {
  const game = gameAt('wieliczka');
  game.chooseStarterRoute('loop-center');
  const legacy = JSON.parse(JSON.stringify(game.state));
  for (const key of ['fleet', 'fleetPurchases', 'fleetReserveCostPerHour', 'startScenarioId']) delete legacy[key];
  for (const line of legacy.lines) for (const key of ['routeGeometry', 'routingMode', 'infrastructureCost']) delete line[key];
  for (const point of city.points.filter(point => (point.startScenario && point.id !== 'wieliczka') || ['kurdwanow', 'lagiewniki', 'gorka-narodowa', 'krowodrza'].includes(point.id))) delete legacy.passengers[point.id];
  assert.equal(validateState(legacy, city), true);
  const restored = new UrbanFlowGame(city, {}, legacy);
  assert.equal(restored.state.startScenarioId, 'wieliczka');
  assert.ok(restored.state.lines[0].routeGeometry.length > 2);
  assert.ok(restored.state.fleet.bus.owned >= restored.state.lines[0].vehicles);
});
