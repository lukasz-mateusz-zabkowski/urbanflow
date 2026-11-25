import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { loadGame, saveGame, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';
import { totalWaiting } from '../public/js/passengers.js';
import {
  appendSessionDecision, buildGameplayDecisionJournal, buildGameplaySessionReport
} from '../public/js/gameplay-insights.js';

const city = CITIES.krakow;
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
};

function sampleState() {
  return {
    status: 'playing', elapsedMinutes: 1440, budget: 120000, carried: 345,
    satisfaction: 78, passengers: { residential: { waiting: 9, destinations: {} }, commercial: { waiting: 3, destinations: {} } },
    lines: [{ id: 'line-1', name: 'Linia 1', type: 'bus', stats: { load: 0.7, waiting: 12, revenuePerHour: 400, costPerHour: 250 } }],
    fleet: { bus: { owned: 4 } },
    campaign: { challenge: { id: 'recovery', status: 'active', completed: ['recovery-service'] }, completed: [] },
    finance: { transactions: [
      { id: 'finance-1', type: 'lineConstruction', amount: 12500, at: 60, eventKey: 'line-build:line-1' },
      { id: 'finance-2', type: 'fleetPurchase', amount: 9000, at: 60, eventKey: 'line-build-fleet:line-1' },
      { id: 'finance-3', type: 'investment', amount: 18000, at: 120, eventKey: 'investment-approval:project-2' }
    ] },
    investments: { projects: [{ id: 'project-2', type: 'economic', districtId: 'nowa-huta', status: 'approved', cost: 18000 }], history: [] },
    cityEvolution: { districts: { 'nowa-huta': { name: 'Nowa Huta', residents: 5000, jobs: 2000 } } },
    networkWeeklyHistory: [{ week: 1, revenue: 5000, cost: 4000, balance: 1000, samples: 1680 }]
  };
}

test('session decisions are whitelisted, finite, and bounded without mutating the prior list', () => {
  let decisions = [];
  for (let index = 0; index < 35; index += 1) {
    decisions = appendSessionDecision(decisions, {
      type: 'frequency', atMinute: index * 6, summary: `Zmieniono częstotliwość ${index}`,
      subjectId: 'line-1', estimatedCostPerHourDelta: index, testerId: 'private-value'
    });
  }
  assert.equal(decisions.length, 32);
  assert.equal(decisions[0].atMinute, 18);
  assert.equal(decisions.at(-1).estimatedCostPerHourDelta, 34);
  assert.equal(Object.hasOwn(decisions[0], 'testerId'), false);
  assert.deepEqual(appendSessionDecision(decisions, { type: 'invalid', summary: 'x' }), decisions);
  assert.deepEqual(appendSessionDecision(decisions, { type: 'frequency', atMinute: -1, summary: 'x' }), decisions);
});

test('decision journal combines actual finance entries with current-session choices and labels observations as current', () => {
  const state = sampleState();
  const decisions = [{ type: 'frequency', atMinute: 180, summary: 'Zwiększono częstotliwość do 4 kursów/h', subjectId: 'line-1', estimatedCostPerHourDelta: 80 }];
  const journal = buildGameplayDecisionJournal(state, decisions);
  assert.equal(journal.length, 3);
  assert.equal(journal[0].type, 'frequency');
  assert.equal(journal[0].subject, 'Linia 1');
  assert.equal(journal[0].modelledCostPerHourDelta, 80);
  assert.deepEqual(journal[0].currentObservation, { load: 0.7, waiting: 12, revenuePerHour: 400, costPerHour: 250 });
  assert.equal(journal[1].title, 'Modernizacja lub inwestycja');
  assert.equal(journal[1].subject, 'Nowa Huta');
  assert.equal(journal[1].actualCost, 18000);
  assert.equal(journal[2].subject, 'Linia 1');
  assert.equal(journal[2].actualCost, 21500);
  assert.deepEqual(state.finance.transactions.map(item => item.amount), [12500, 9000, 18000]);
});

test('gameplay session report exports only anonymous allowlisted aggregates and never mutates the campaign', () => {
  const state = sampleState();
  const before = structuredClone(state);
  const report = buildGameplaySessionReport(state, {
    appVersion: '1.11.0-alpha', scenarioId: 'recovery', sessionDurationSeconds: 95.6,
    sessionDecisions: [{ type: 'frequency', atMinute: 180, summary: 'Zwiększono częstotliwość', subjectId: 'line-1', testerId: 'must-not-export' }],
    technicalErrors: { scriptErrors: 2, unhandledRejections: 1, errorMessage: 'secret text' },
    feedback: { category: 'Ocena pierwszej rozgrywki', rating: 4, description: 'Rozkład był trudny do znalezienia.', testerId: 'must-not-export' },
    now: () => new Date('2026-11-25T10:00:00.000Z')
  });

  assert.equal(report.reportType, 'urbanflow-gameplay-session');
  assert.equal(report.gameVersion, '1.11.0-alpha');
  assert.equal(report.scenarioId, 'recovery');
  assert.equal(report.sessionDurationSeconds, 96);
  assert.equal(report.result, 'playing');
  assert.equal(report.metrics.activeLines, 1);
  assert.equal(report.metrics.carriedPassengers, 345);
  assert.equal(report.metrics.waitingPassengers, 12);
  assert.equal(report.latestObservedWeek.balance, 1000);
  assert.equal(report.technicalErrors.scriptErrors, 2);
  assert.equal(report.feedback.rating, 4);
  assert.equal(report.decisions[0].summary, 'Zwiększono częstotliwość');
  const serialized = JSON.stringify(report);
  for (const forbidden of ['testerId', 'must-not-export', 'userAgent', 'deviceId', 'errorMessage', 'rngState', 'localStorage', 'secret text']) {
    assert.equal(serialized.includes(forbidden), false, `report must not include ${forbidden}`);
  }
  assert.deepEqual(state, before);
});

test('session report safely represents missing history, invalid feedback and terminal outcome', () => {
  const state = { status: 'lost', lossReason: 'Bankructwo', elapsedMinutes: 900, budget: -50001, lines: [], fleet: {}, campaign: { completed: [] } };
  const report = buildGameplaySessionReport(state, { appVersion: '1.11.0-alpha', scenarioId: '../../private', feedback: { rating: 9, description: 'bad' } });
  assert.equal(report.scenarioId, 'classic');
  assert.equal(report.outcome, 'bankruptcy');
  assert.equal(report.latestObservedWeek, null);
  assert.equal(report.feedback, null);
  assert.equal(report.metrics.activeLines, 0);
});

test('refunds and campaign grants remain cash inflows rather than being mislabeled as costs', () => {
  const state = { lines: [], finance: { transactions: [
    { type: 'investmentRefund', amount: 9000, at: 400 },
    { type: 'campaignGrant', amount: 20000, at: 401 }
  ] } };
  const report = buildGameplaySessionReport(state, { appVersion: '1.11.0-alpha' });
  assert.equal(report.decisions[0].actualCashInflow, 20000);
  assert.equal(report.decisions[0].actualCost, undefined);
  assert.equal(report.decisions[1].actualCashInflow, 9000);
  assert.equal(report.decisions[1].actualCost, undefined);
});

test('investment plans are identified as unspent plans and resolve to the modeled district', () => {
  const state = sampleState();
  const decision = appendSessionDecision([], { type: 'investment', atMinute: 500, subjectId: 'nowa-huta', plannedCost: 32000,
    summary: 'Zaplanowano projekt; środki nie zostały pobrane.' });
  const [item] = buildGameplayDecisionJournal(state, decision);
  assert.equal(item.title, 'Plan inwestycji');
  assert.equal(item.subject, 'Nowa Huta');
  assert.equal(item.plannedCost, 32000);
  assert.equal(item.actualCost, undefined);
});

test('a session purchase matching an actual finance transaction does not duplicate its cost', () => {
  const state = { lines: [{ id: 'line-1', name: 'Linia 1' }], finance: { transactions: [
    { type: 'fleetPurchase', amount: 9000, at: 600, subject: 'line-1' }
  ] } };
  const decisions = [{ type: 'fleet', atMinute: 600, subjectId: 'line-1', actualCost: 9000, summary: 'Kupiono pojazd.' }];
  const journal = buildGameplayDecisionJournal(state, decisions);
  assert.equal(journal.filter(item => Number.isFinite(item.actualCost)).length, 1);
  assert.equal(journal.reduce((sum, item) => sum + (item.actualCost || 0), 0), 9000);
});

test('a retained line-build fleet charge stays visible if the bounded finance ledger rotated out its paired construction entry', () => {
  const state = { lines: [{ id: 'line-1', name: 'Linia 1' }], finance: { transactions: [
    { id: 'finance-2', type: 'fleetPurchase', amount: 9000, at: 60, eventKey: 'line-build-fleet:line-1' }
  ] } };
  const journal = buildGameplayDecisionJournal(state);
  assert.equal(journal.length, 1);
  assert.equal(journal[0].type, 'fleetPurchase');
  assert.equal(journal[0].actualCost, 9000);
});

test('distinct financial entries with identical time and amount are not collapsed', () => {
  const state = { lines: [], finance: { transactions: [
    { id: 'finance-1', type: 'fleetPurchase', amount: 9000, at: 60 },
    { id: 'finance-2', type: 'fleetPurchase', amount: 9000, at: 60 }
  ] } };
  const journal = buildGameplayDecisionJournal(state);
  assert.equal(journal.length, 2);
  assert.equal(journal.reduce((sum, item) => sum + (item.actualCost || 0), 0), 18000);
});

test('identical session costs consume separate matching ledger entries one-to-one', () => {
  const state = { lines: [], finance: { transactions: [
    { id: 'finance-1', type: 'fleetPurchase', amount: 9000, at: 60 },
    { id: 'finance-2', type: 'fleetPurchase', amount: 9000, at: 60 }
  ] } };
  const decisions = [1, 2].map(() => ({ type: 'fleet', atMinute: 60, actualCost: 9000, summary: 'Zakup pojazdu.' }));
  const journal = buildGameplayDecisionJournal(state, decisions);
  assert.equal(journal.filter(item => Number.isFinite(item.actualCost)).length, 2);
  assert.equal(journal.reduce((sum, item) => sum + (item.actualCost || 0), 0), 18000);
});

test('a single identical ledger event does not hide a second distinct session charge', () => {
  const state = { lines: [], finance: { transactions: [
    { id: 'finance-1', type: 'fleetPurchase', amount: 9000, at: 60 }
  ] } };
  const decisions = [1, 2].map(() => ({ type: 'fleet', atMinute: 60, actualCost: 9000, summary: 'Zakup pojazdu.' }));
  const journal = buildGameplayDecisionJournal(state, decisions);
  assert.equal(journal.reduce((sum, item) => sum + (item.actualCost || 0), 0), 18000);
});

test('session report reads real UrbanFlowGame passenger queues before and after service', () => {
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka', random: () => 0.5 });
  const initialWaiting = totalWaiting(game.state.passengers);
  assert.equal(initialWaiting, 0);
  assert.equal(buildGameplaySessionReport(game.state).metrics.waitingPassengers, initialWaiting);

  game.chooseStarterRoute('loop-center');
  const created = game.addLine('bus', ['ruczaj', 'dworzec', 'bronowice']);
  assert.equal(created.ok, true);
  for (let tick = 0; tick < 25; tick += 1) game.tick(() => 0.5);

  const actualWaiting = totalWaiting(game.state.passengers);
  assert.ok(game.state.generated > 0, 'the real simulation generated passenger demand');
  assert.ok(game.state.carried > 0, 'the real simulation transported passengers');
  assert.ok(actualWaiting > 0, 'the real simulation has waiting passengers');
  const report = buildGameplaySessionReport(game.state);
  assert.equal(report.metrics.waitingPassengers, Math.floor(actualWaiting));
  assert.equal(report.metrics.carriedPassengers, game.state.carried);
});

test('session report remains accurate after campaign completion and save/resume', () => {
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka', random: () => 0.5 });
  game.chooseStarterRoute('loop-center');
  assert.equal(game.addLine('bus', ['ruczaj', 'dworzec', 'bronowice']).ok, true);
  for (let tick = 0; tick < 25; tick += 1) game.tick(() => 0.5);

  const storage = memoryStorage();
  assert.deepEqual(saveGame(storage, game.state), { ok: true });
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  const resumed = new UrbanFlowGame(city, {}, loaded.state);
  assert.equal(buildGameplaySessionReport(resumed.state).metrics.waitingPassengers,
    Math.floor(totalWaiting(resumed.state.passengers)));

  resumed.finish('won', 'Scenariusz testowy ukończony.');
  const completedReport = buildGameplaySessionReport(resumed.state);
  assert.equal(completedReport.result, 'won');
  assert.equal(completedReport.metrics.waitingPassengers, Math.floor(totalWaiting(resumed.state.passengers)));
});

test('missing or malformed optional passenger queues are reported as unavailable, never fabricated as zero', () => {
  for (const passengers of [undefined, null, [], { stopA: null }, { stopA: { waiting: Number.NaN } }, { stopA: { waiting: -1 } }]) {
    const report = buildGameplaySessionReport({ status: 'playing', lines: [], ...(passengers === undefined ? {} : { passengers }) });
    assert.equal(report.metrics.waitingPassengers, null);
  }
  assert.equal(buildGameplaySessionReport({ status: 'playing', lines: [], passengers: {} }).metrics.waitingPassengers, 0);
});
