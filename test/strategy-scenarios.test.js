import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { createCityEvolutionState, evolveCityWeek, cityDemandFactor } from '../public/js/city-evolution.js';
import { latentDemand } from '../public/js/demand.js';
import { createInvestmentState, planInvestment, approveInvestment, advanceInvestmentProjects } from '../public/js/investments.js';

const city = CITIES.krakow;
const strategies = [
  { name: 'cautious investor', lines: [], investment: false, load: 0, wait: 0, balance: 0 },
  { name: 'aggressive network expansion', lines: [
    ['wieliczka', 'biezanow', 'dworzec'], ['bronowice', 'dworzec', 'nowa-huta'], ['skawina', 'lagiewniki', 'centrum']
  ], investment: false, load: 0.48, wait: 12, balance: -1100 },
  { name: 'profit focus', lines: [['wieliczka', 'biezanow', 'dworzec']], investment: false, load: 0.72, wait: 7, balance: 950 },
  { name: 'accessibility focus', lines: [
    ['wieliczka', 'biezanow', 'dworzec'], ['zabierzow', 'bronowice', 'dworzec'], ['skawina', 'lagiewniki', 'centrum']
  ], investment: true, load: 0.57, wait: 9, balance: -800 },
  { name: 'poor management', lines: [['biezanow', 'bronowice']], investment: false, load: 1, wait: 48, balance: -2400 }
];

function simulate(strategy, weeks = 52) {
  const state = {
    elapsedMinutes: 0, status: 'playing', satisfaction: 80, budget: 500000,
    lines: strategy.lines.map((stops, index) => ({ id: `line-${index + 1}`, type: 'bus', frequency: 4,
      vehicles: 2, stops: [...stops], stats: { load: strategy.load, avgWaitMinutes: strategy.wait,
        segmentLoad: Object.fromEntries(stops.slice(1).map((_stop, segment) => [segment, strategy.load])) } })),
    passengers: {}, networkWeeklyHistory: [], investments: createInvestmentState(), hubCapacityByPoint: {}
  };
  state.cityEvolution = createCityEvolutionState(city);
  if (strategy.investment) {
    const planned = planInvestment(state, 'biezanow', 'housing');
    assert.equal(planned.ok, true);
    assert.equal(approveInvestment(state, planned.project.id).ok, true);
  }
  for (let week = 1; week <= weeks; week += 1) {
    state.elapsedMinutes = week * 7 * 1440;
    advanceInvestmentProjects(state);
    state.networkWeeklyHistory.push({ week, revenue: Math.max(0, 1500 + strategy.balance),
      cost: 1500, transported: Math.round(30 + strategy.load * 40), averageWaitMinutes: strategy.wait });
    evolveCityWeek(state, city);
  }
  const district = state.cityEvolution.districts.biezanow;
  const point = city.points.find(item => item.id === 'biezanow');
  return {
    strategy: strategy.name,
    access: district.transportAccess,
    residents: district.residents,
    jobs: district.jobs,
    attractiveness: district.residentialAttractiveness,
    demandFactor: cityDemandFactor(state.cityEvolution, district),
    demandPotential: latentDemand([point], state.lines, 480, [], state.elapsedMinutes, 'weekday', state.cityEvolution)[0]?.potential || 0,
    budget: state.budget,
    reports: state.cityEvolution.weeklyReports.length
  };
}

test('five simulated player strategies produce deterministic, bounded and meaningfully different 52-week results', t => {
  const first = strategies.map(strategy => simulate(strategy));
  const second = strategies.map(strategy => simulate(strategy));
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  assert.equal(first.every(result => result.reports === 12), true);
  assert.ok(first.every(result => Number.isFinite(result.demandPotential) && result.budget >= 0));
  assert.ok(first.every(result => result.demandFactor >= 0.8 && result.demandFactor <= 1.25));

  const cautious = first.find(result => result.strategy === 'cautious investor');
  const accessibility = first.find(result => result.strategy === 'accessibility focus');
  const mismanaged = first.find(result => result.strategy === 'poor management');
  assert.equal(cautious.access, 0);
  assert.ok(accessibility.access > cautious.access);
  assert.ok(accessibility.residents > cautious.residents);
  assert.ok(accessibility.demandPotential > cautious.demandPotential);
  assert.ok(mismanaged.attractiveness < accessibility.attractiveness);
  assert.ok(new Set(first.map(result => `${result.access}:${result.residents}:${result.demandPotential}`)).size >= 4,
    'strategies should not collapse to the same city outcome');
  for (const result of first) t.diagnostic(JSON.stringify(result));
});
