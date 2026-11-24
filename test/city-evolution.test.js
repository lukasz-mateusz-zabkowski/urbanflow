import assert from 'node:assert/strict';
import test from 'node:test';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { latentDemand } from '../public/js/demand.js';
import { advanceInvestmentProjects, approveInvestment, createInvestmentState, planInvestment } from '../public/js/investments.js';
import { createWeeklyTimetable, DEFAULT_SERVICE_PERIODS, SERVICE_DAY_TYPES, setDailyFrequency } from '../public/js/timetable.js';
import {
  createCityEvolutionState, evolveCityWeek, cityDemandFactor, cityEvolutionSnapshot, validateCityEvolutionState
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
  assert.equal(Object.is(report.demandChangePercent, -0), false, 'JSON save/resume does not normalize a negative zero');
  assert.equal(state.cityEvolution.weeklyReports.length, 1);
  assert.equal(state.cityEvolution.weeklyReports[0].networkBalance, 100);
  assert.equal(state.cityEvolution.weeklyReports[0].networkWeek, 1, 'week 2 report summarizes the completed week 1 network');
  const snapshot = report.districtSnapshots.find(item => item.id === 'ruczaj');
  assert.equal(snapshot.residents, after.residents);
  assert.equal(snapshot.transportAccess, after.transportAccess);
  assert.equal(snapshot.intensity, after.landUse.intensity);
  assert.ok(Number.isFinite(snapshot.demandFactor));
  assert.ok(snapshot.demandFactor >= 0.8 && snapshot.demandFactor <= 1.25);
  assert.equal(report.districtSnapshots.length, Object.keys(state.cityEvolution.districts).length);
  const malformed = structuredClone(state.cityEvolution);
  malformed.weeklyReports[0].districtSnapshots[0].transportAccess = Infinity;
  assert.equal(validateCityEvolutionState(malformed, city), false);
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

test('52-week district evolution stays deterministic with bounded history, land shares, occupancy and weekly finance attribution', () => {
  const line = { id: 'line-1', type: 'bus', frequency: 4, vehicles: 3,
    stops: ['ruczaj', 'centrum', 'bronowice', 'dworzec'], stats: { load: 0.55, avgWaitMinutes: 8, segmentLoad: {} } };
  const simulate = () => {
    const state = makeState([line]);
    state.cityEvolution = createCityEvolutionState(city);
    for (let week = 2; week <= 53; week += 1) {
      state.elapsedMinutes = (week - 1) * 7 * 1440;
      state.networkWeeklyHistory.push({ week: week - 1, revenue: 1000 + week, cost: 600, transported: 35, averageWaitMinutes: 8 });
      evolveCityWeek(state, city);
    }
    return state.cityEvolution;
  };
  const first = simulate(); const second = simulate();
  assert.deepEqual(first, second);
  assert.equal(first.lastEvolvedWeek, 53);
  assert.equal(first.weeklyReports.length, 12);
  assert.equal(first.weeklyReports.at(-1).week, 53);
  assert.equal(first.weeklyReports.at(-1).networkWeek, 52, 'weekly report uses the completed prior service week');
  assert.equal(first.weeklyReports.at(-1).networkBalance, 453, 'revenue less cost is reported once for that week');
  assert.equal(validateCityEvolutionState(first, city), true);
  for (const zone of Object.values(first.districts)) {
    assert.equal(Object.values(zone.landUse.shares).reduce((sum, share) => sum + share, 0), 100);
    assert.ok(zone.residents <= zone.capacity.residents && zone.jobs <= zone.capacity.jobs);
    assert.ok(zone.landUse.lastDevelopmentWeek <= first.lastEvolvedWeek);
  }
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

test('service between residential areas without reachable jobs does not fabricate useful accessibility or land growth', () => {
  const state = makeState([{ id: 'residential-loop', type: 'bus', frequency: 4, vehicles: 2,
    stops: ['biezanow', 'bronowice'], stats: { load: 0.1, avgWaitMinutes: 5 } }]);
  state.cityEvolution = createCityEvolutionState(city);
  evolveCityWeek(state, city);
  for (const id of ['biezanow', 'bronowice']) {
    assert.equal(state.cityEvolution.districts[id].jobAccess, 0);
    assert.equal(state.cityEvolution.districts[id].transportAccess, 0,
      'a route serving homes but no employment destination cannot unlock development');
    assert.equal(state.cityEvolution.districts[id].landUse.developmentProgress, 0);
  }
});

test('district access weights reachable homes by modeled population instead of counting points equally', () => {
  const simulate = residents => {
    const state = makeState([{ id: 'work-connection', type: 'bus', frequency: 4, vehicles: 2,
      stops: ['ruczaj', 'centrum'], stats: { load: 0.2, avgWaitMinutes: 8 } }]);
    state.cityEvolution = createCityEvolutionState(city);
    state.cityEvolution.districts.ruczaj.residents = residents;
    evolveCityWeek(state, city);
    return state.cityEvolution.districts.centrum.residentialAccess;
  };
  assert.ok(simulate(500000) > simulate(1000), 'a connection to a larger residential area exposes more modeled residents');
});

test('matched 12-week scenarios distinguish no service, useful transit, and transit plus a completed housing investment', () => {
  const line = { id: 'line-1', type: 'bus', frequency: 4, vehicles: 2, stops: ['biezanow', 'centrum'],
    stats: { load: 0.3, avgWaitMinutes: 8 } };
  const simulate = (withService, withInvestment) => {
    const state = makeState(withService ? [line] : []);
    state.elapsedMinutes = 0; state.budget = 500000; state.status = 'playing';
    state.cityEvolution = createCityEvolutionState(city);
    state.investments = createInvestmentState(); state.hubCapacityByPoint = {};
    if (withInvestment) {
      const planned = planInvestment(state, 'biezanow', 'housing');
      assert.equal(planned.ok, true);
      assert.equal(approveInvestment(state, planned.project.id).ok, true);
    }
    for (let week = 2; week <= 13; week += 1) {
      state.elapsedMinutes = (week - 1) * 7 * 1440;
      advanceInvestmentProjects(state);
      state.networkWeeklyHistory.push({ week: week - 1, revenue: 1000, cost: 800, transported: 40, averageWaitMinutes: 8 });
      evolveCityWeek(state, city);
    }
    return state;
  };
  const noServiceState = simulate(false, false);
  const servedState = simulate(true, false);
  const investedState = simulate(true, true);
  assert.deepEqual(servedState.cityEvolution, simulate(true, false).cityEvolution, 'same initial state and transport choices reproduce the same city result');
  const isolatedZone = noServiceState.cityEvolution.districts.biezanow;
  const servedZone = servedState.cityEvolution.districts.biezanow;
  const investedZone = investedState.cityEvolution.districts.biezanow;
  assert.equal(isolatedZone.transportAccess, 0);
  assert.ok(servedZone.transportAccess > isolatedZone.transportAccess);
  assert.ok(investedZone.landUse.shares.residential > servedZone.landUse.shares.residential);
  assert.ok(investedZone.capacity.residents > servedZone.capacity.residents);
  assert.ok(cityDemandFactor(investedState.cityEvolution, 'biezanow') >= cityDemandFactor(servedState.cityEvolution, 'biezanow'));
  assert.equal(investedState.cityEvolution.weeklyReports.length, 12);
});

test('night-only timetables count as real district access', () => {
  let nightOnly = createWeeklyTimetable('balanced', 8);
  for (const dayType of SERVICE_DAY_TYPES) for (const period of DEFAULT_SERVICE_PERIODS) {
    nightOnly = setDailyFrequency(nightOnly, dayType, period.id, period.id === 'night' ? 2 : 0, 8);
  }
  const line = { id: 'line-1', type: 'bus', frequency: 4, vehicles: 2, timetable: nightOnly,
    stops: ['bronowice', 'centrum', 'dworzec'], stats: { load: 0.3, avgWaitMinutes: 8 } };
  const state = makeState([line]);
  state.cityEvolution = createCityEvolutionState(city);
  evolveCityWeek(state, city);
  assert.ok(state.cityEvolution.districts.bronowice.transportAccess > 0);
});
