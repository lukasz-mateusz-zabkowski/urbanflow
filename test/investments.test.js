import assert from 'node:assert/strict';
import test from 'node:test';
import { CITIES } from '../public/js/cities.js';
import { createCityEvolutionState } from '../public/js/city-evolution.js';
import { evolveCityWeek } from '../public/js/city-evolution.js';
import { landUseDemandFactor } from '../public/js/land-use.js';
import { approveInvestment, advanceInvestmentProjects, cancelInvestment, createInvestmentState,
  planInvestment, recordInvestmentWeek, validateInvestmentState, INVESTMENT_LIMITS } from '../public/js/investments.js';

const city = CITIES.krakow;
function gameState() {
  const state = { status: 'playing', budget: 500000, elapsedMinutes: 0, lines: [],
    cityEvolution: createCityEvolutionState(city), investments: createInvestmentState() };
  return state;
}

test('housing plan has no immediate budget or population effect and approved project charges once', () => {
  const state = gameState();
  const zone = state.cityEvolution.districts.bronowice;
  const residents = zone.residents; const budget = state.budget;
  const morningOriginDemand = landUseDemandFactor(zone.landUse, 'origin', 450, 'weekday');
  const planned = planInvestment(state, 'bronowice', 'housing');
  assert.equal(planned.ok, true);
  assert.equal(state.budget, budget);
  assert.equal(zone.residents, residents);
  assert.equal(approveInvestment(state, planned.project.id).ok, true);
  assert.equal(state.budget, budget - planned.project.cost);
  assert.equal(approveInvestment(state, planned.project.id).ok, false);
  state.elapsedMinutes = planned.project.completesAt;
  assert.equal(advanceInvestmentProjects(state).length, 1);
  assert.equal(advanceInvestmentProjects(state).length, 0);
  assert.ok(zone.capacity.residents > zone.base.residents);
  assert.equal(zone.residents, residents, 'completion increases available capacity but does not instantly populate it');
  assert.ok(landUseDemandFactor(zone.landUse, 'origin', 450, 'weekday') > morningOriginDemand,
    'residential share raises the existing morning departure profile');
  assert.equal(zone.landUse.shares.reserve + zone.landUse.shares.residential + zone.landUse.shares.retail
    + zone.landUse.shares.office + zone.landUse.shares.industrial + zone.landUse.shares.public + zone.landUse.shares.green, 100);
});

test('economic project increases modeled job capacity and failed affordability is atomic', () => {
  const state = gameState();
  const jobs = state.cityEvolution.districts['nowa-huta'].capacity.jobs;
  const plan = planInvestment(state, 'nowa-huta', 'economic');
  state.budget = 1;
  assert.equal(approveInvestment(state, plan.project.id).ok, false);
  assert.equal(plan.project.status, 'planned');
  assert.equal(state.investments.totalSpent, 0);
  state.budget = 500000;
  approveInvestment(state, plan.project.id);
  state.elapsedMinutes = plan.project.completesAt;
  advanceInvestmentProjects(state);
  assert.ok(state.cityEvolution.districts['nowa-huta'].capacity.jobs > jobs);
});

test('in-progress cancellation refunds exactly half and cannot be applied twice', () => {
  const state = gameState();
  const budget = state.budget;
  const plan = planInvestment(state, 'bronowice', 'housing');
  approveInvestment(state, plan.project.id);
  const paid = state.budget;
  const cancelled = cancelInvestment(state, plan.project.id);
  assert.equal(cancelled.refund, Math.round(plan.project.cost * 0.5));
  assert.equal(state.budget, paid + cancelled.refund);
  assert.equal(cancelInvestment(state, plan.project.id).ok, false);
  assert.equal(state.investments.totalSpent, budget - paid);
});

test('canceling an unapproved plan costs nothing; a terminal campaign rejects new work', () => {
  const state = gameState();
  const before = state.budget;
  const plan = planInvestment(state, 'bronowice', 'housing').project;
  assert.equal(cancelInvestment(state, plan.id).refund, 0);
  assert.equal(state.budget, before);
  state.status = 'lost';
  assert.equal(planInvestment(state, 'bronowice', 'housing').ok, false);
});

test('approving a planned project after campaign loss is rejected without charging or starting it', () => {
  const state = gameState();
  const planned = planInvestment(state, 'bronowice', 'housing').project;
  const budget = state.budget;
  state.status = 'lost';
  const result = approveInvestment(state, planned.id);
  assert.equal(result.ok, false);
  assert.equal(planned.status, 'planned');
  assert.equal(planned.charged, false);
  assert.equal(state.budget, budget);
  assert.equal(state.investments.totalSpent, 0);
});

test('two projects cannot reserve the same remaining land reserve', () => {
  const state = gameState();
  assert.equal(planInvestment(state, 'nowa-huta', 'economic').ok, true);
  assert.equal(planInvestment(state, 'nowa-huta', 'economic').ok, false,
    'the eight point industrial reserve cannot fund two six point projects');
});

test('two simultaneous projects in a medium district complete once without exceeding the intensity cap', () => {
  const state = gameState();
  const zone = state.cityEvolution.districts.kurdwanow;
  const startingJobsCapacity = zone.capacity.jobs;
  assert.equal(zone.landUse.intensity, 'medium');
  const startingOffice = zone.landUse.shares.office;
  const first = planInvestment(state, 'kurdwanow', 'economic').project;
  const second = planInvestment(state, 'kurdwanow', 'economic').project;
  assert.equal(approveInvestment(state, first.id).ok, true);
  assert.equal(approveInvestment(state, second.id).ok, true);
  state.elapsedMinutes = first.completesAt;
  assert.equal(advanceInvestmentProjects(state).length, 2);
  assert.equal(advanceInvestmentProjects(state).length, 0);
  assert.equal(zone.landUse.intensity, 'high');
  assert.ok(zone.capacity.jobs > startingJobsCapacity);
  assert.equal(zone.landUse.shares.reserve, 5);
  assert.equal(zone.landUse.shares.office, startingOffice + 12);
  assert.equal(state.investments.history.filter(item => item.status === 'completed').length, 2);
  assert.equal(Object.values(zone.landUse.shares).reduce((sum, share) => sum + share, 0), 100);
});

test('district reserve edits and cancellation release only the canceled project reservation', () => {
  const state = gameState();
  const zone = state.cityEvolution.districts.kurdwanow;
  const first = planInvestment(state, 'kurdwanow', 'economic').project;
  const second = planInvestment(state, 'kurdwanow', 'housing').project;
  zone.landUse.shares.reserve -= 6;
  zone.landUse.shares.office += 6;
  assert.equal(cancelInvestment(state, second.id).refund, 0);
  const before = state.budget;
  assert.equal(approveInvestment(state, first.id).ok, true);
  assert.equal(state.budget, before - first.cost);
  assert.equal(zone.landUse.shares.reserve + zone.landUse.shares.residential + zone.landUse.shares.retail
    + zone.landUse.shares.office + zone.landUse.shares.industrial + zone.landUse.shares.public + zone.landUse.shares.green, 100);
  assert.equal(approveInvestment(state, first.id).ok, false);
  assert.equal(state.budget, before - first.cost);
});

test('hub modernization requires active service and increases queue handling only once', () => {
  const state = gameState();
  assert.equal(planInvestment(state, 'lagiewniki', 'hub').ok, false);
  state.lines.push({ id: 'line-1', stops: ['lagiewniki', 'centrum'] });
  const project = planInvestment(state, 'lagiewniki', 'hub').project;
  approveInvestment(state, project.id);
  state.elapsedMinutes = project.completesAt;
  advanceInvestmentProjects(state);
  assert.equal(state.hubCapacityByPoint.lagiewniki, 1.5);
  advanceInvestmentProjects(state);
  assert.equal(state.hubCapacityByPoint.lagiewniki, 1.5);
  const budgetAtCompletion = state.budget;
  recordInvestmentWeek(state, 2);
  assert.equal(state.budget, budgetAtCompletion, 'a hub completed at the end of week 2 is not charged retroactively');
  const weekThree = recordInvestmentWeek(state, 3);
  assert.equal(weekThree.maintenance, 400);
  assert.equal(state.budget, budgetAtCompletion - 400);
  assert.equal(validateInvestmentState(state.investments, city, state), true);
});

test('an approved hub project finishes after service removal and retains upkeep as a city asset', () => {
  const state = gameState();
  state.lines.push({ id: 'line-1', stops: ['lagiewniki', 'centrum'] });
  const project = planInvestment(state, 'lagiewniki', 'hub').project;
  approveInvestment(state, project.id);
  state.lines = [];
  state.elapsedMinutes = project.completesAt;
  assert.equal(advanceInvestmentProjects(state).length, 1);
  assert.equal(state.hubCapacityByPoint.lagiewniki, 1.5);
  assert.equal(advanceInvestmentProjects(state).length, 0);
  assert.equal(recordInvestmentWeek(state, 2).maintenance, 0, 'completion at the week boundary is not charged retroactively');
  assert.equal(recordInvestmentWeek(state, 3).maintenance, 400,
    'completed city infrastructure remains maintained even when no current line serves it');
  assert.equal(state.investments.assets.length, 1);
});

test('project and weekly ledgers are bounded, deterministic and validated', () => {
  const state = gameState();
  const project = planInvestment(state, 'bronowice', 'housing').project;
  assert.equal(approveInvestment(state, project.id).ok, true);
  const week = recordInvestmentWeek(state, 1);
  assert.equal(week.active, 1);
  assert.equal(week.costs, project.cost, 'capital expenditure is attributed to the week it was paid');
  assert.equal(recordInvestmentWeek(state, 1), null);
  assert.equal(validateInvestmentState(state.investments, city, state), true);
  state.investments.projects[0].cost = Infinity;
  assert.equal(validateInvestmentState(state.investments, city, state), false);
  assert.ok(project.id);
});

test('completed results validate, remain readable from older schema-10 ledgers, and reject invalid values', () => {
  const state = gameState();
  const project = planInvestment(state, 'bronowice', 'housing').project;
  approveInvestment(state, project.id);
  state.elapsedMinutes = project.completesAt;
  advanceInvestmentProjects(state);
  const completed = state.investments.history.find(item => item.status === 'completed');
  assert.equal(validateInvestmentState(state.investments, city, state), true);
  delete completed.expected;
  assert.equal(validateInvestmentState(state.investments, city, state), true, 'old schema-10 histories do not contain the comparison baseline');
  completed.result.residentsCapacity = Number.NaN;
  assert.equal(validateInvestmentState(state.investments, city, state), false);
});

test('save validation rejects a next-id counter that could reuse an investment id', () => {
  const state = gameState();
  const project = planInvestment(state, 'bronowice', 'housing').project;
  assert.equal(validateInvestmentState(state.investments, city, state), true);
  state.investments.nextId = Number(project.id.slice('investment-'.length));
  assert.equal(validateInvestmentState(state.investments, city, state), false);
});

test('52-week project and city-growth campaign is deterministic and bounded', () => {
  const simulate = () => {
    const state = gameState();
    const housing = planInvestment(state, 'bronowice', 'housing').project;
    const economic = planInvestment(state, 'nowa-huta', 'economic').project;
    assert.equal(approveInvestment(state, housing.id).ok, true);
    assert.equal(approveInvestment(state, economic.id).ok, true);
    for (let week = 1; week <= 52; week += 1) {
      state.elapsedMinutes = week * 7 * 1440;
      advanceInvestmentProjects(state);
      recordInvestmentWeek(state, week);
      evolveCityWeek(state, city);
    }
    assert.equal(state.investments.projects.length, 0);
    assert.equal(state.investments.history.filter(item => item.status === 'completed').length, 2);
    assert.equal(state.investments.weekly.length, 52);
    assert.ok(state.investments.history.length <= 40);
    assert.ok(state.budget < 500000, 'capital costs are never minted back into the transit wallet');
    for (const zone of Object.values(state.cityEvolution.districts)) {
      assert.ok(Number.isFinite(zone.residents) && zone.residents <= zone.capacity.residents);
      assert.ok(Number.isFinite(zone.jobs) && zone.jobs <= zone.capacity.jobs);
      assert.equal(Object.values(zone.landUse.shares).reduce((sum, share) => sum + share, 0), 100);
    }
    return state;
  };
  assert.deepEqual(simulate(), simulate());
});

test('4- and 12-week project horizons preserve bounded city growth and separate ledgers', () => {
  for (const horizon of [4, 12]) {
    const state = gameState();
    const housing = planInvestment(state, 'bronowice', 'housing').project;
    const economic = planInvestment(state, 'nowa-huta', 'economic').project;
    assert.equal(approveInvestment(state, housing.id).ok, true);
    assert.equal(approveInvestment(state, economic.id).ok, true);
    for (let week = 1; week <= horizon; week += 1) {
      state.elapsedMinutes = week * INVESTMENT_LIMITS.durationWeekMinutes;
      advanceInvestmentProjects(state);
      recordInvestmentWeek(state, week);
      evolveCityWeek(state, city);
    }
    assert.equal(state.investments.weekly.length, horizon);
    assert.equal(state.investments.history.filter(item => item.status === 'completed').length, 2);
    assert.equal(state.investments.totalSpent, housing.cost + economic.cost);
    assert.equal(state.revenue, undefined, 'city projects do not fabricate carrier revenue');
    for (const zone of Object.values(state.cityEvolution.districts)) {
      assert.ok(zone.residents >= 0 && zone.residents <= zone.capacity.residents);
      assert.ok(zone.jobs >= 0 && zone.jobs <= zone.capacity.jobs);
      assert.equal(Object.values(zone.landUse.shares).reduce((sum, share) => sum + share, 0), 100);
    }
  }
});

test('52-week hub upkeep is deterministic, prorated, and stops at the two-level cap', () => {
  const simulate = () => {
    const state = gameState();
    state.lines.push({ id: 'line-1', stops: ['lagiewniki', 'centrum'] });
    const first = planInvestment(state, 'lagiewniki', 'hub').project;
    const second = planInvestment(state, 'lagiewniki', 'hub').project;
    assert.equal(planInvestment(state, 'lagiewniki', 'hub').ok, false);
    approveInvestment(state, first.id); approveInvestment(state, second.id);
    for (let week = 1; week <= 52; week += 1) {
      state.elapsedMinutes = week * 7 * 1440;
      advanceInvestmentProjects(state);
      recordInvestmentWeek(state, week);
    }
    assert.equal(state.hubCapacityByPoint.lagiewniki, 2);
    assert.equal(state.investments.assets.length, 2);
    assert.equal(state.investments.totalMaintenance, 40000);
    assert.equal(state.investments.weekly.length, 52);
    assert.equal(validateInvestmentState(state.investments, city, state), true);
    return { budget: state.budget, investments: state.investments, hubCapacity: state.hubCapacityByPoint };
  };
  assert.deepEqual(simulate(), simulate());
});
