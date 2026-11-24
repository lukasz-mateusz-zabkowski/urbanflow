import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = resolve(process.env.UF_REPO_ROOT || process.cwd());
const load = path => import(pathToFileURL(resolve(root, path)).href);
const [{ CITIES }, { createSimulationCalendar }, { createCityEvolutionState, evolveCityWeek, cityDemandFactor }, { latentDemand }, investments] = await Promise.all([
  load('public/js/cities.js'), load('public/js/simulation.js'), load('public/js/city-evolution.js'), load('public/js/demand.js'), load('public/js/investments.js')
]);
const city = CITIES.krakow;
const placeIds = city.points.filter(point => point.type !== 'stop').map(point => point.id);
const round = value => Math.round(value * 100) / 100;
const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
const summarize = values => ({ medianMs: round(percentile(values, 0.5)), p95Ms: round(percentile(values, 0.95)) });

function makeLines(count) {
  return Array.from({ length: count }, (_, index) => {
    const from = index % placeIds.length;
    const to = (from + 1 + (index % Math.max(1, placeIds.length - 1))) % placeIds.length;
    return { id: `line-${index + 1}`, type: 'bus', frequency: 4 + (index % 4), vehicles: 3,
      stops: [placeIds[from], placeIds[to]], stats: { load: 0.2 + (index % 5) * 0.1, avgWaitMinutes: 8 + index % 5 } };
  });
}

function benchmark(lineCount) {
  const state = { elapsedMinutes: 7 * 1440, calendar: createSimulationCalendar(), lines: makeLines(lineCount), cityEvents: [],
    networkWeeklyHistory: [{ week: 1, revenue: 1200, cost: 900, transported: 45, averageWaitMinutes: 9 }],
    investments: { projects: [], assets: [], history: [] } };
  state.cityEvolution = createCityEvolutionState(city);
  const evolution = [];
  const demand = [];
  for (let index = 0; index < 35; index += 1) {
    state.elapsedMinutes = state.cityEvolution.lastEvolvedWeek * 7 * 1440;
    const start = performance.now();
    evolveCityWeek(state, city);
    const end = performance.now();
    if (index >= 5) evolution.push(end - start);
    const demandStart = performance.now();
    latentDemand(city.points, state.lines, (index * 37) % 1440, [], state.elapsedMinutes, 'weekday', state.cityEvolution);
    const demandEnd = performance.now();
    if (index >= 5) demand.push(demandEnd - demandStart);
    state.networkWeeklyHistory.push({ week: index + 2, revenue: 1200, cost: 900, transported: 45, averageWaitMinutes: 9 });
  }
  const beforeSerialize = performance.now();
  const serialized = JSON.stringify(state.cityEvolution);
  const serializeMs = performance.now() - beforeSerialize;
  const heap = process.memoryUsage().heapUsed;
  return { lines: lineCount, modeledAreas: Object.keys(state.cityEvolution.districts).length,
    weeklyEvolutionAccessAndDevelopment: summarize(evolution), demandForecast: summarize(demand),
    serializeMs: round(serializeMs), serializedBytes: Buffer.byteLength(serialized), heapUsedBytes: heap,
    weeklyReportsRetained: state.cityEvolution.weeklyReports.length,
    lastSnapshotAreaCount: state.cityEvolution.weeklyReports.at(-1)?.districtSnapshots?.length || 0 };
}

function scenario(weeks, service, investment) {
  const line = { id: 'line-1', type: 'bus', frequency: 4, vehicles: 2, stops: ['biezanow', 'centrum'],
    stats: { load: 0.3, avgWaitMinutes: 8 } };
  const state = { elapsedMinutes: 0, calendar: createSimulationCalendar(), status: 'playing', budget: 500000,
    lines: service ? [line] : [], cityEvents: [], networkWeeklyHistory: [], investments: investments.createInvestmentState(), hubCapacityByPoint: {} };
  state.cityEvolution = createCityEvolutionState(city);
  if (investment) {
    const planned = investments.planInvestment(state, 'biezanow', 'housing');
    if (!planned.ok || !investments.approveInvestment(state, planned.project.id).ok) throw new Error('Could not initialize deterministic housing investment scenario.');
  }
  for (let week = 2; week <= weeks + 1; week += 1) {
    state.elapsedMinutes = (week - 1) * 7 * 1440;
    investments.advanceInvestmentProjects(state);
    state.networkWeeklyHistory.push({ week: week - 1, revenue: 1000, cost: 800, transported: 40, averageWaitMinutes: 8 });
    evolveCityWeek(state, city);
  }
  const zone = state.cityEvolution.districts.biezanow;
  const point = city.points.find(item => item.id === 'biezanow');
  const demand = latentDemand([point], state.lines, 480, [], state.elapsedMinutes, 'weekday', state.cityEvolution)[0]?.potential || 0;
  return { weeks, service, housingInvestment: investment, transportAccess: zone.transportAccess,
    residents: zone.residents, jobs: zone.jobs, residentialAttractiveness: round(zone.residentialAttractiveness),
    residentialCapacity: zone.capacity.residents, residentialSharePercent: zone.landUse.shares.residential,
    demandFactor: round(cityDemandFactor(state.cityEvolution, zone) * 1000) / 1000, modeledDemandPotential: round(demand * 1000) / 1000,
    budgetAfterCapitalCost: state.budget };
}

const scenarioResults = [12, 52].map(weeks => ({ weeks,
  withoutService: scenario(weeks, false, false),
  serviceOnly: scenario(weeks, true, false),
  serviceAndHousing: scenario(weeks, true, true)
}));

console.log(JSON.stringify({ version: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version,
  note: 'Repeated local Node timings after five warm-up samples; weekly evolution includes network access, development and snapshot creation.',
  results: [benchmark(1), benchmark(20)], matchedScenarios: scenarioResults }, null, 2));
