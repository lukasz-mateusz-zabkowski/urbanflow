import test from 'node:test';
import assert from 'node:assert/strict';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { SIMULATION } from '../public/js/simulation.js';
import { PROGRESSION, lineMetrics } from '../public/js/transport.js';

const seededRandom = initial => {
  let value = initial >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
};

const tramPlans = [
  ['ruczaj', 'dworzec', 'nowa-huta'],
  ['bronowice', 'dworzec', 'nowa-huta'],
  ['biezanow', 'nowa-huta', 'dworzec']
];
const railPlans = [
  ['wieliczka', 'biezanow', 'dworzec'],
  ['dworzec', 'bronowice']
];

// All actions go through the same commands as the UI. No budgets, progression,
// satisfaction or passenger state are overridden to make these scenarios win.
const scenarios = [
  ...[273, 724, 20260927].map(seed => ({ seed, starter: 'loop-center', paced: false })),
  { seed: 8675309, starter: 'loop-station', paced: true }
];
for (const { seed, starter, paced } of scenarios) {
  test(`Kraków campaign remains completable with new tram construction (seed ${seed}, ${paced ? 'paced fleet management' : 'direct build'})`, t => {
    const random = seededRandom(seed);
    const game = new UrbanFlowGame(CITIES.krakow, { random });
    assert.equal(game.chooseStarterRoute(starter).ok, true);
    assert.equal(game.addLine('bus', [game.startScenario.localHubId, 'dworzec', 'bronowice', 'ruczaj']).ok, true);
    let tramsBuilt = 0;
    let railsBuilt = 0;
    let airportConnected = false;
    let nextConstructionTick = paced ? 90 : 0;
    let fleetManaged = false;
    let maxCohorts = 0;
    let maxSaveBytes = 0;
    let maxStepMs = 0;
    const milestones = {};
    const started = performance.now();
    const limitTicks = Math.ceil(35 * 60 * 1000 / SIMULATION.realTickMs);
    for (let tick = 0; tick <= limitTicks && game.state.status === 'playing'; tick += 1) {
      const before = performance.now();
      game.tick(random);
      maxStepMs = Math.max(maxStepMs, performance.now() - before);
      const state = game.state;
      if (state.status === 'playing') {
        // The second route and the station start offer another valid opening.
        // A player can spend time managing service and build one line per minute.
        if (paced && tick === 30) {
          const line = state.lines[0];
          const beforeUpgrade = lineMetrics(line, CITIES.krakow);
          assert.equal(game.buyVehicle(line.id).ok, true);
          assert.equal(game.setFrequency(line.id, 5).ok, true);
          const afterUpgrade = lineMetrics(line, CITIES.krakow);
          assert.ok(afterUpgrade.capacityPerHour > beforeUpgrade.capacityPerHour);
          assert.ok(afterUpgrade.costPerHour > beforeUpgrade.costPerHour);
          fleetManaged = true;
        }
        if (game.availableTypes().includes('tram')) while (tramsBuilt < tramPlans.length) {
          if (tick < nextConstructionTick) break;
          if (!game.addLine('tram', tramPlans[tramsBuilt]).ok) break;
          tramsBuilt += 1;
          milestones.trams ??= tick;
          nextConstructionTick = tick + (paced ? 60 : 0);
        }
        if (game.availableTypes().includes('suburban')) while (railsBuilt < railPlans.length) {
          if (tick < nextConstructionTick) break;
          if (!game.addLine('suburban', railPlans[railsBuilt]).ok) break;
          railsBuilt += 1;
          milestones.rail ??= tick;
          nextConstructionTick = tick + (paced ? 60 : 0);
        }
        if (state.airportUnlocked && !airportConnected) {
          const line = state.lines.find(item => item.type === 'suburban' && item.stops.includes('bronowice'));
          if (line) {
            airportConnected = game.editLine(line.id, ['dworzec', 'bronowice', 'balice']).ok;
            if (airportConnected) milestones.airport = tick;
          }
        }
      }
      const peopleInSystem = state.cohorts.reduce((sum, group) => sum + group.count, 0);
      assert.equal(state.generated, peopleInSystem + state.carried + state.abandoned, `passenger conservation at tick ${tick}`);
      assert.ok(state.cohorts.every(group => Number.isInteger(group.count) && group.count > 0));
      assert.ok(state.lines.every(line => line.stats.load >= 0 && line.stats.load <= 1));
      const construction = state.lines.reduce((sum, line) => sum + line.cost, 0);
      const expectedBudget = CITIES.krakow.startingBudget + state.campaign.grants + state.revenue - state.expenses - construction;
      assert.ok(Math.abs(expectedBudget - state.budget) < 0.01, `budget conservation at tick ${tick}`);
      maxCohorts = Math.max(maxCohorts, state.cohorts.length);
      maxSaveBytes = Math.max(maxSaveBytes, Buffer.byteLength(JSON.stringify(state), 'utf8'));
    }
    const state = game.state;
    const realMinutes = state.elapsedMinutes / SIMULATION.minutesPerTick * SIMULATION.realTickMs / 60000;
    assert.equal(state.status, 'won', `ended at ${realMinutes} minutes, objectives: ${state.campaign.completed.join(', ')}; budget=${state.budget}; lines=${JSON.stringify(state.lines.map(line => ({ type: line.type, stops: line.stops, carried: line.stats.carried, age: line.ageMinutes, cost: line.cost })))}, unlocked=${state.unlocked.join(',')}, airport=${state.airportUnlocked}`);
    // Replacing the synthetic Centrum opener with the real Dworzec hub shortens
    // deterministic campaign completion; retain a lower bound against instant wins.
    assert.ok(realMinutes >= 8.5 && realMinutes <= 35, `session duration ${realMinutes} min`);
    assert.equal(state.campaign.completed.length, 8);
    assert.equal(state.campaign.stress.status, 'passed');
    assert.ok(state.campaign.stress.minSatisfaction >= 45);
    assert.ok(state.budget > 0);
    assert.ok(state.satisfaction > 60);
    assert.ok(airportConnected);
    assert.equal(fleetManaged, paced);
    const minimumServiceTicks = PROGRESSION.minAgeMinutes / SIMULATION.minutesPerTick;
    assert.ok(milestones.trams + 1 >= minimumServiceTicks, 'buses must serve passengers before trams unlock');
    assert.ok(milestones.rail - milestones.trams >= minimumServiceTicks, 'trams must operate before rail unlocks');
    assert.ok(milestones.airport - milestones.rail >= minimumServiceTicks, 'rail must operate before the airport unlocks');
    assert.ok(game.availableTypes().includes('bus') && game.availableTypes().includes('tram') && game.availableTypes().includes('suburban'));
    assert.ok(maxCohorts <= 1600, `max cohorts: ${maxCohorts}`);
    assert.ok(maxSaveBytes < 1024 * 1024, `max save: ${maxSaveBytes} bytes`);
    t.diagnostic(JSON.stringify({ seed, realMinutes, carried: state.carried, abandoned: state.abandoned,
      budget: Math.round(state.budget), satisfaction: Math.round(state.satisfaction), maxCohorts, maxSaveBytes,
      totalTestMs: Math.round(performance.now() - started), maxStepMs: Math.round(maxStepMs * 100) / 100, milestones }));
  });
}
