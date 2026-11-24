import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFinanceState, financeForecast, financeHistory, financeSnapshot,
  recordFinanceEvent, FINANCE_LIMITS, plannedFinancialCommitments
} from '../public/js/finance.js';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { TRANSPORT_TYPES } from '../public/js/transport.js';
import { updateCampaign } from '../public/js/campaign.js';
import { SIMULATION } from '../public/js/simulation.js';
import { recordInvestmentWeek } from '../public/js/investments.js';
import { applyEconomyTick } from '../public/js/economy.js';
import { loadGame, saveGame, SAVE_KEY } from '../public/js/storage.js';

const financeState = () => ({
  status: 'playing', budget: 10000, revenue: 600, expenses: 170, carried: 0,
  elapsedMinutes: 5 * 1440, calendar: { startDate: '2026-01-05', specialDays: [] },
  networkDailyHistory: [
    { date: '2026-01-05', samples: 240, revenue: 100, cost: 40, transported: 10, balance: 60 },
    { date: '2026-01-06', samples: 240, revenue: 200, cost: 50, transported: 20, balance: 150 },
    { date: '2026-01-07', samples: 240, revenue: 300, cost: 80, transported: 30, balance: 220 }
  ],
  networkWeeklyHistory: [],
  investments: { assets: [{ districtId: 'a', completedAt: 0, weeklyMaintenance: 70 }], projects: [], history: [], weekly: [] },
  lines: [],
  finance: createFinanceState(10000)
});

test('financial snapshot separates observed operating totals from one-time capital transactions', () => {
  const state = financeState();
  recordFinanceEvent(state, 'lineConstruction', 900, 0, 'line-build-1');
  recordFinanceEvent(state, 'fleetPurchase', 250, 10, 'vehicle-1');
  const before = structuredClone(state);

  const snapshot = financeSnapshot(state);

  assert.deepEqual(snapshot.operating, { revenue: 600, expenses: 170, balance: 430 });
  assert.equal(snapshot.cash.budget, 10000);
  assert.equal(snapshot.capital.lineConstruction, 900);
  assert.equal(snapshot.capital.fleetPurchase, 250);
  assert.deepEqual(state, before, 'reading the finance center cannot mutate the active campaign');
});

test('finance forecasts require complete observed days and report a range plus known commitments', () => {
  const state = financeState();
  const before = structuredClone(state);

  const day = financeForecast(state, 1, { minimumDays: 3, weeklyCommitments: 70 });
  const week = financeForecast(state, 7, { minimumDays: 7 });
  const month = financeForecast(state, 28, { minimumDays: 14 });

  assert.equal(day.available, true);
  assert.equal(day.observedDays, 3);
  assert.equal(day.expectedNet, 200 - (170 / 3) - 10);
  assert.equal(day.lowNet, 100 - 80 - 10);
  assert.equal(day.highNet, 300 - 40 - 10);
  assert.equal(week.available, false);
  assert.equal(month.available, false);
  assert.deepEqual(state, before, 'forecasting cannot advance campaign time or alter money');
});

test('all forecast horizons use complete observations and include known weekly maintenance as modeled cost', () => {
  const state = financeState();
  state.networkDailyHistory = Array.from({ length: 14 }, (_item, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`, samples: 240,
    revenue: 100 + index * 10, cost: 40 + index * 2, transported: 10, balance: 60 + index * 8
  }));
  const before = structuredClone(state);
  for (const horizon of [1, 7, 28]) {
    const forecast = financeForecast(state, horizon, { weeklyCommitments: 70 });
    assert.equal(forecast.available, true);
    assert.equal(forecast.knownCommitments, 70 * horizon / 7);
    assert.ok(forecast.lowNet <= forecast.expectedNet && forecast.expectedNet <= forecast.highNet);
  }
  assert.deepEqual(state, before);
});

test('planned investment costs are commitments, not deductions from cash', () => {
  const state = financeState();
  state.investments.projects = [
    { status: 'planned', cost: 5000 }, { status: 'in-progress', cost: 9000 }, { status: 'planned', cost: 12000 }
  ];
  const beforeBudget = state.budget;
  assert.equal(plannedFinancialCommitments(state), 17000);
  assert.equal(state.budget, beforeBudget);
});

test('capital events are idempotent, bounded in detail and retained in lifetime totals', () => {
  const state = financeState();
  assert.equal(recordFinanceEvent(state, 'investment', 100, 20, 'investment-1'), true);
  assert.equal(recordFinanceEvent(state, 'investment', 100, 20, 'investment-1'), false);
  for (let index = 0; index < FINANCE_LIMITS.transactions + 10; index += 1) {
    recordFinanceEvent(state, 'lineConstruction', 1, index + 21, `build-${index}`);
  }

  assert.equal(state.finance.totals.investment, 100);
  assert.equal(state.finance.totals.lineConstruction, FINANCE_LIMITS.transactions + 10);
  assert.equal(state.finance.transactions.length, FINANCE_LIMITS.transactions);
  assert.equal(financeSnapshot(state).capital.lineConstruction, FINANCE_LIMITS.transactions + 10);
  assert.equal(state.finance.dailyCashFlow[0].oneTimeCashFlow, -174);
  assert.equal(state.finance.dailyCashFlow[0].events, 75);
});

test('finance history distinguishes observed day/week aggregates from unobserved periods', () => {
  const state = financeState();
  state.networkWeeklyHistory = [{ week: 1, samples: 1680, revenue: 900, cost: 500, balance: 400, transported: 90 }];
  recordFinanceEvent(state, 'lineConstruction', 75, 0, 'line-on-day-one');
  const before = structuredClone(state);

  const history = financeHistory(state);

  assert.equal(history.days[0].source, 'observed');
  assert.equal(history.days.length, 3);
  assert.equal(history.days[0].oneTimeCashFlow, -75);
  assert.equal(history.weeks[0].revenue, 900);
  assert.equal(history.weeks[0].balance, 400);
  assert.equal(history.weeks[0].oneTimeCashFlow, -75);
  assert.deepEqual(state, before);
});

test('campaign cash outflows for a new line and a purchased vehicle are recorded once by category', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const preview = game.selectStarterRoute('loop-center');
  assert.equal(preview.ok, true);
  assert.equal(game.createSelectedLine().ok, true);
  assert.equal(game.purchaseFleetVehicle('bus').ok, true);

  assert.equal(game.state.finance.totals.lineConstruction, preview.cost - preview.fleetCost);
  assert.equal(game.state.finance.totals.fleetPurchase, preview.fleetCost + TRANSPORT_TYPES.bus.vehicleCost);
  assert.equal(game.state.finance.transactions.filter(item => item.type === 'lineConstruction').length, 1);
  assert.equal(game.state.finance.transactions.filter(item => item.type === 'fleetPurchase').length, (preview.fleetCost ? 1 : 0) + 1);
});

test('planning reserve does not move campaign cash and rejects invalid targets', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const budget = game.state.budget;
  assert.equal(game.setFinanceReserveTarget(125000).ok, true);
  assert.equal(game.state.finance.reserveTarget, 125000);
  assert.equal(game.state.budget, budget);
  assert.equal(game.setFinanceReserveTarget(-1).ok, false);
  assert.equal(game.setFinanceReserveTarget(Infinity).ok, false);
  assert.equal(game.state.budget, budget);
});

test('investment approval and cancellation record capital cash exactly once', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const planned = game.planInvestment('ruczaj', 'housing');
  assert.equal(planned.ok, true);
  assert.equal(game.state.finance.totals.investment, 0, 'planning is not a cash transaction');
  assert.equal(game.approveInvestment(planned.project.id).ok, true);
  assert.equal(game.state.finance.totals.investment, planned.project.cost);
  const refund = game.cancelInvestment(planned.project.id);
  assert.equal(refund.ok, true);
  assert.equal(game.state.finance.totals.investmentRefund, Math.round(planned.project.cost * .5));
  assert.equal(game.state.finance.transactions.filter(item => item.eventKey === `investment-approval:${planned.project.id}`).length, 1);
  assert.equal(game.state.finance.transactions.filter(item => item.eventKey === `investment-refund:${planned.project.id}`).length, 1);
});

test('campaign objective rewards are separated from operating revenue and awarded once', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  const grants = game.state.finance.totals.campaignGrant;
  assert.equal(grants, game.state.campaign.grants);
  assert.ok(grants > 0);
  updateCampaign(game, 0);
  assert.equal(game.state.finance.totals.campaignGrant, grants);
  assert.equal(game.state.revenue, 0, 'campaign grants are not presented as transport revenue');
});

test('investment maintenance at a week boundary is attributed to the completed week', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  const weekMinutes = 7 * 24 * 60;
  game.state.investments.assets.push({ districtId: 'ruczaj', level: 1, completedAt: 0, weeklyMaintenance: 500 });
  const flowBefore = game.state.finance.weeklyCashFlow[0].oneTimeCashFlow;
  const eventsBefore = game.state.finance.weeklyCashFlow[0].events;
  game.state.elapsedMinutes = weekMinutes - SIMULATION.startMinute - SIMULATION.minutesPerTick;
  game.tick(() => 0.5);

  assert.equal(game.state.investments.weekly.at(-1).week, 1);
  assert.equal(game.state.investments.weekly.at(-1).maintenance, 500);
  assert.equal(game.state.finance.weeklyCashFlow[0].oneTimeCashFlow - flowBefore, -500);
  assert.equal(game.state.finance.weeklyCashFlow[0].events, eventsBefore + 1);
});

test('investment maintenance cannot be rebooked after its detailed transaction ages out', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  game.state.investments.assets.push({ districtId: 'ruczaj', level: 1, completedAt: 0, weeklyMaintenance: 500 });
  const firstWeek = recordInvestmentWeek(game.state, 1);
  assert.equal(firstWeek.maintenance, 500);
  assert.equal(game.state.finance.totals.investmentMaintenance, 500, 'week settlement records the finance event atomically');
  const afterFirstWeek = game.state.budget;

  for (let week = 2; week <= 53; week += 1) recordInvestmentWeek(game.state, week);
  assert.equal(game.state.investments.weekly.some(item => item.week === 1), false, 'old detail must roll off the bounded history');
  assert.equal(recordInvestmentWeek(game.state, 1), null);
  assert.equal(game.state.budget, afterFirstWeek - 52 * 500);

  const beforeDuplicate = structuredClone(game.state.finance);
  assert.equal(recordFinanceEvent(game.state, 'investmentMaintenance', 500, 7 * 1440 - 1, 'investment-maintenance-week:1'), false);
  assert.deepEqual(game.state.finance, beforeDuplicate, 'the compact week watermark protects lifetime totals after transaction eviction');
});

test('investment maintenance watermark survives save/load after 52-week details roll off', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.investments.assets.push({ districtId: 'ruczaj', level: 1, completedAt: 0, weeklyMaintenance: 400 });
  game.state.hubCapacityByPoint.ruczaj = 1.5;
  const weekMinutes = 7 * 1440;
  for (let week = 1; week <= 53; week += 1) {
    game.state.elapsedMinutes = week * weekMinutes - SIMULATION.startMinute - 1;
    assert.ok(recordInvestmentWeek(game.state, week));
  }
  assert.equal(game.state.investments.weekly.length, 52);
  assert.equal(game.state.investments.lastRecordedWeek, 53);

  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)) };
  assert.equal(saveGame(storage, game.state).ok, true);
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  const resumed = new UrbanFlowGame(CITIES.krakow, {}, loaded.state);
  const before = resumed.state.budget;
  assert.equal(recordInvestmentWeek(resumed.state, 1), null);
  assert.equal(resumed.state.budget, before);
  assert.equal(resumed.state.finance.totals.investmentMaintenance, 53 * 400);
});

test('12, 52 and 104-week finance checkpoints resume without replaying settled maintenance', () => {
  let game = new UrbanFlowGame(CITIES.krakow);
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.investments.assets.push({ districtId: 'ruczaj', level: 1, completedAt: 0, weeklyMaintenance: 400 });
  game.state.hubCapacityByPoint.ruczaj = 1.5;
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)) };
  const weekMinutes = 7 * 1440;

  for (let week = 1; week <= 104; week += 1) {
    game.state.elapsedMinutes = week * weekMinutes - SIMULATION.startMinute - 1;
    const settlement = recordInvestmentWeek(game.state, week);
    assert.equal(settlement.maintenance, 400);
    if ([12, 52, 104].includes(week)) {
      assert.equal(saveGame(storage, game.state).ok, true, `${week}-week save`);
      const loaded = loadGame(storage, CITIES.krakow);
      assert.equal(loaded.error, null, `${week}-week load`);
      game = new UrbanFlowGame(CITIES.krakow, {}, loaded.state);
      assert.equal(game.state.investments.lastRecordedWeek, week);
    }
  }

  const settledBudget = game.state.budget;
  assert.equal(game.state.finance.totals.investmentMaintenance, 104 * 400);
  assert.equal(recordInvestmentWeek(game.state, 52), null, 'a prior settled week stays closed beyond both bounded ledgers');
  assert.equal(game.state.budget, settledBudget);
  assert.equal(game.state.investments.weekly.length, 52);
  assert.equal(game.state.finance.weeklyCashFlow.length, 12);
  assert.equal(game.state.finance.dailyCashFlow.length, 28);
  assert.equal(game.state.finance.transactions.length, FINANCE_LIMITS.transactions);
});

test('104-week operating cash and bounded finance history reproduce deterministically', () => {
  const run = () => {
    const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka', random: () => 0.1 });
    assert.equal(game.chooseStarterRoute('loop-center').ok, true);
    game.state.investments.assets.push({ districtId: 'ruczaj', level: 1, completedAt: 0, weeklyMaintenance: 300 });
    const line = game.state.lines[0];
    const weekMinutes = 7 * 24 * 60;
    for (let week = 1; week <= 104; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        game.state.elapsedMinutes = (week - 1) * weekMinutes + day * 1440;
        game.state._pendingLineRevenue = { [line.id]: 20 };
        applyEconomyTick(game.state, 4, 1440);
        game.state.carried += 4;
      }
      const item = recordInvestmentWeek(game.state, week);
      assert.ok(item, `week ${week} settles once in order`);
    }
    return {
      budget: game.state.budget, revenue: game.state.revenue, expenses: game.state.expenses, carried: game.state.carried,
      finance: structuredClone(game.state.finance), investmentWeeks: game.state.investments.weekly
    };
  };
  const first = run();
  assert.deepEqual(run(), first);
  assert.equal(first.investmentWeeks.length, 52);
  assert.equal(first.finance.weeklyCashFlow.length, 12);
  assert.equal(first.finance.dailyCashFlow.length, 28);
  assert.equal(first.finance.transactions.length, FINANCE_LIMITS.transactions);
  assert.ok(Number.isFinite(first.budget) && Number.isFinite(first.revenue) && Number.isFinite(first.expenses));
  assert.ok(first.finance.totals.investmentMaintenance > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(first.finance)) < 12000, 'the finance ledger remains small after 104 weeks');
});
