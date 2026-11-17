import assert from 'node:assert/strict';
import test from 'node:test';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { latentDemand } from '../public/js/demand.js';
import { createWeeklyTimetable, DEFAULT_SERVICE_PERIODS, SERVICE_DAY_TYPES, setDailyFrequency } from '../public/js/timetable.js';
import {
  createCityEvolutionState, evolveCityWeek, cityDemandFactor, cityEvolutionSnapshot
} from '../public/js/city-evolution.js';

const city = CITIES.krakow;
const makeState = lines => ({
  elapsedMinutes: 7 * 1440,
  satisfaction: 80,
  lines,
  passengers: {},
  networkWeeklyHistory: [{ week: 1, revenue: 1000, cost: 900, transported: 50, averageWaitMinutes: 8 }]
});

test('evolution initializes deterministic modeled areas and labels their values as simulation parameters', () => {
  const first = createCityEvolutionState(city);
  const second = createCityEvolutionState(city);
  assert.deepEqual(first, second);
  assert.ok(Object.keys(first.districts).includes('centrum'));
  assert.equal(first.source, 'simulation-parameters');
  assert.ok(first.weeklyReports.length === 0);
  assert.ok(Object.values(first.districts).every(zone => zone.residents > 0 && zone.jobs > 0));
});

test('weekly evolution rewards connected residential areas, grows gradually and stays capacity bounded', () => {
  const state = makeState([{ id: 'line-1', stops: ['ruczaj', 'centrum', 'dworzec'], stats: { load: 0.4, avgWaitMinutes: 6, segmentLoad: {} } }]);
  state.cityEvolution = createCityEvolutionState(city);
  const before = state.cityEvolution.districts.ruczaj.residents;
  const report = evolveCityWeek(state, city);
  const after = state.cityEvolution.districts.ruczaj;
  assert.ok(after.transportAccess > 0);
  assert.ok(after.residents >= before);
  assert.ok(after.residents <= after.capacity.residents);
  assert.equal(report.week, 2);
  assert.equal(state.cityEvolution.weeklyReports.length, 1);
  assert.equal(state.cityEvolution.weeklyReports[0].networkBalance, 100);
});

test('an isolated district receives no invented access and its demand effect remains bounded', () => {
  const state = makeState([]);
  state.cityEvolution = createCityEvolutionState(city);
  evolveCityWeek(state, city);
  const zone = state.cityEvolution.districts.bronowice;
  assert.equal(zone.transportAccess, 0);
  assert.ok(zone.residents < zone.capacity.residents);
  assert.ok(cityDemandFactor(state.cityEvolution, { id: 'bronowice' }) >= 0.8);
  assert.ok(cityDemandFactor(state.cityEvolution, { id: 'bronowice' }) <= 1.25);
});

test('overloaded transport limits the attractiveness gain and weekly reports are capped', () => {
  const state = makeState([{ id: 'line-1', stops: ['ruczaj', 'centrum', 'dworzec'], stats: { load: 1, avgWaitMinutes: 50, segmentLoad: { 0: 1, 1: 1 } } }]);
  state.cityEvolution = createCityEvolutionState(city);
  const initial = state.cityEvolution.districts.ruczaj.residentialAttractiveness;
  for (let index = 0; index < 15; index += 1) {
    state.elapsedMinutes += 7 * 1440;
    evolveCityWeek(state, city);
  }
  const zone = state.cityEvolution.districts.ruczaj;
  assert.ok(zone.transportSatisfaction < 100);
  assert.ok(zone.residentialAttractiveness < 100);
  assert.ok(Math.abs(zone.residentialAttractiveness - initial) <= 100);
  assert.equal(state.cityEvolution.weeklyReports.length, 12);
  assert.deepEqual(cityEvolutionSnapshot(state.cityEvolution).weeklyReports, state.cityEvolution.weeklyReports);
});

test('eight 12-week balance scenarios are repeatable, bounded and do not mint transit budget', () => {
  const scenarios = [
    [],
    [{ id: 'line-1', stops: ['biezanow', 'centrum', 'dworzec'], stats: { load: 0.25, avgWaitMinutes: 7 } }],
    [{ id: 'line-1', stops: ['biezanow', 'centrum', 'dworzec'], stats: { load: 1, avgWaitMinutes: 45, segmentLoad: { 0: 1, 1: 1 } } }],
    [{ id: 'line-1', stops: ['biezanow', 'centrum', 'dworzec'], stats: { load: 0.3, avgWaitMinutes: 8 } }],
    [{ id: 'line-1', stops: ['wieliczka', 'centrum'], stats: { load: 0.08, avgWaitMinutes: 18, balancePerHour: -900 } }],
    [
      { id: 'line-1', stops: ['wieliczka', 'biezanow', 'centrum', 'dworzec'], stats: { load: 0.65, avgWaitMinutes: 12 } },
      { id: 'line-2', stops: ['bronowice', 'centrum', 'ruczaj'], stats: { load: 0.7, avgWaitMinutes: 10 } },
      { id: 'line-3', stops: ['nowa-huta', 'dworzec', 'centrum'], stats: { load: 0.5, avgWaitMinutes: 9 } }
    ],
    [{ id: 'line-1', stops: ['bronowice', 'centrum', 'dworzec', 'ruczaj'], stats: { load: 0.4, avgWaitMinutes: 9 } }],
    []
  ];
  const simulate = (scenario, index) => {
    const state = makeState(scenario);
    state.budget = 123000;
    state.cityEvolution = createCityEvolutionState(city);
    if (index === 7) {
      const zone = state.cityEvolution.districts.bronowice;
      zone.residentialAttractiveness = 8;
      zone.economicAttractiveness = 8;
    }
    for (let week = 0; week < 12; week += 1) {
      state.elapsedMinutes += 7 * 1440;
      state.networkWeeklyHistory.push({ week: week + 1, revenue: 500, cost: 700, transported: 20, averageWaitMinutes: 11 });
      evolveCityWeek(state, city);
    }
    return state;
  };
  scenarios.forEach((scenario, index) => {
    const left = simulate(scenario, index); const right = simulate(scenario, index);
    assert.deepEqual(left.cityEvolution, right.cityEvolution, `scenario ${index + 1} deterministic`);
    assert.equal(left.budget, 123000, `scenario ${index + 1} does not add transit money`);
    assert.equal(left.cityEvolution.weeklyReports.length, 12);
    for (const zone of Object.values(left.cityEvolution.districts)) {
      assert.ok(Number.isFinite(zone.residents) && zone.residents >= zone.constraints.minimumResidents && zone.residents <= zone.capacity.residents);
      assert.ok(Number.isFinite(zone.jobs) && zone.jobs >= zone.constraints.minimumJobs && zone.jobs <= zone.capacity.jobs);
    }
  });
  const served = simulate(scenarios[6], 6);
  const isolated = simulate([], 0);
  assert.ok(served.cityEvolution.districts.bronowice.transportAccess > isolated.cityEvolution.districts.bronowice.transportAccess);
  assert.ok(served.cityEvolution.districts.bronowice.residentialAttractiveness > isolated.cityEvolution.districts.bronowice.residentialAttractiveness);
  assert.ok(served.cityEvolution.districts.bronowice.jobs > isolated.cityEvolution.districts.bronowice.jobs);
});

test('population changes flow into bounded passenger demand factors', () => {
  const evolution = createCityEvolutionState(city);
  const zone = evolution.districts.bronowice;
  assert.equal(cityDemandFactor(evolution, 'bronowice'), 1);
  zone.residents = zone.capacity.residents;
  assert.ok(cityDemandFactor(evolution, { id: 'bronowice' }) > 1);
  zone.residents = zone.constraints.minimumResidents;
  assert.ok(cityDemandFactor(evolution, 'bronowice') < 1);
  const basePotential = latentDemand([city.points.find(point => point.id === 'bronowice')], [], 720)[0].potential;
  const evolvedPotential = latentDemand([city.points.find(point => point.id === 'bronowice')], [], 720, [], 0, 'weekday', evolution)[0].potential;
  assert.ok(evolvedPotential < basePotential, 'lower modeled population also lowers the demand forecast');
});

test('game evolves the city once when simulation crosses a weekly boundary', () => {
  const game = new UrbanFlowGame(city);
  game.state.elapsedMinutes = 7 * 1440 - 360 - 6;
  const before = game.state.cityEvolution.districts.bronowice.residents;
  game.tick(() => 0.5);
  assert.equal(game.state.cityEvolution.lastEvolvedWeek, 2);
  assert.equal(game.state.cityEvolution.weeklyReports.length, 1);
  assert.notEqual(game.state.cityEvolution.districts.bronowice.residents, before);
  assert.equal(game.state.cityEvolution.weeklyReports[0].week, 2);
});

test('district accessibility follows actual weekly service, including a timetable with no operating trips', () => {
  const timetable = createWeeklyTimetable('balanced', 8);
  let noService = timetable;
  for (const dayType of SERVICE_DAY_TYPES) for (const period of DEFAULT_SERVICE_PERIODS) {
    noService = setDailyFrequency(noService, dayType, period.id, 0, 8);
  }
  const line = { id: 'line-1', type: 'bus', frequency: 4, vehicles: 2, timetable,
    stops: ['bronowice', 'centrum', 'dworzec'], stats: { load: 0.3, avgWaitMinutes: 8 } };
  const active = makeState([line]); active.cityEvolution = createCityEvolutionState(city); evolveCityWeek(active, city);
  const stopped = makeState([{ ...line, timetable: noService }]); stopped.cityEvolution = createCityEvolutionState(city); evolveCityWeek(stopped, city);
  assert.ok(active.cityEvolution.districts.bronowice.transportAccess > 0);
  assert.equal(stopped.cityEvolution.districts.bronowice.transportAccess, 0);
});
