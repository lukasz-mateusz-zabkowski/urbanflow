import test from 'node:test';
import assert from 'node:assert/strict';
import { networkProblems, recordNetworkHistory, NETWORK_HISTORY_LIMIT } from '../public/js/analytics.js';

test('network history keeps bounded, observed aggregate windows and compares no inferred samples', () => {
  const state = { elapsedMinutes: 6, city: { points: [{ id: 'a', type: 'work' }, { id: 'stop', type: 'stop' }] },
    lines: [{ stops: ['a'], stats: { segmentLoad: [0.5] } }], passengers: { a: { waiting: 2 } },
    cohorts: [{ phase: 'waiting', count: 2, waitMinutes: 5 }],
    mobility: { completed: { passengers: 2, waitMinutesTotal: 10 } } };
  for (let index = 0; index < NETWORK_HISTORY_LIMIT + 4; index += 1) {
    state.elapsedMinutes = index * 6;
    recordNetworkHistory(state, { transported: 3, revenue: 12, cost: 5 });
  }
  assert.equal(state.networkHistory.length, NETWORK_HISTORY_LIMIT);
  assert.deepEqual(state.networkHistory.at(-1), { at: (NETWORK_HISTORY_LIMIT + 3) * 6, networkVersion: 0, transported: 3,
    generated: 0, abandoned: 0, denied: 0, averageWaitMinutes: 5, coverage: 0.5, tripAvailability: null, utilization: 0.5,
    revenue: 12, cost: 5, balance: 7 });
});

test('daily and weekly network history keep sums and weighted means within fixed bounds', async () => {
  const { NETWORK_DAILY_HISTORY_LIMIT, NETWORK_WEEKLY_HISTORY_LIMIT } = await import('../public/js/analytics.js');
  const state = { elapsedMinutes: 6, calendar: { version: 1, startDate: '2026-01-05', specialDays: [] },
    city: { points: [{ id: 'a' }, { id: 'b' }] }, lines: [{ stops: ['a'], stats: { segmentLoad: [0.25] } }],
    passengers: {}, cohorts: [], mobility: { accessibility: { opportunities: 0, reachable: 0 } } };
  recordNetworkHistory(state, { transported: 1, generated: 2, abandoned: 1, denied: 1, revenue: 7, cost: 3,
    accessibility: { opportunities: 1, reachable: 1, denied: 1 } });
  state.elapsedMinutes = 12;
  state.lines[0].stats.segmentLoad = [0.75];
  recordNetworkHistory(state, { transported: 3, generated: 4, abandoned: 1, denied: 3, revenue: 21, cost: 5,
    accessibility: { opportunities: 3, reachable: 1, denied: 3 } });
  const daily = state.networkDailyHistory.at(-1);
  const weekly = state.networkWeeklyHistory.at(-1);
  assert.equal(daily.transported, 4);
  assert.equal(daily.denied, 4);
  assert.equal(daily.revenue, 28);
  assert.equal(daily.cost, 8);
  assert.equal(daily.coverage, 0.5);
  assert.equal(daily.utilization, 0.5);
  assert.equal(daily.tripAvailability, 0.5);
  assert.equal(weekly.transported, 4);
  assert.equal(weekly.tripAvailability, 0.5);
  assert.ok(state.networkDailyHistory.length <= NETWORK_DAILY_HISTORY_LIMIT);
  assert.ok(state.networkWeeklyHistory.length <= NETWORK_WEEKLY_HISTORY_LIMIT);
});

test('period totals assign a tick ending at midnight to the day and week it actually elapsed in', () => {
  const state = { elapsedMinutes: 1074, calendar: { version: 1, startDate: '2026-01-05', specialDays: [] },
    city: { points: [] }, lines: [], passengers: {}, cohorts: [], mobility: { accessibility: { opportunities: 0, reachable: 0 } } };
  recordNetworkHistory(state, { transported: 1, revenue: 7, cost: 2, deltaMinutes: 6 });
  state.elapsedMinutes = 1080;
  recordNetworkHistory(state, { transported: 2, revenue: 14, cost: 3, deltaMinutes: 6 });
  assert.equal(state.networkDailyHistory.length, 1);
  assert.equal(state.networkDailyHistory[0].transported, 3);
  state.elapsedMinutes = 1086;
  recordNetworkHistory(state, { transported: 4, revenue: 28, cost: 5, deltaMinutes: 6 });
  assert.equal(state.networkDailyHistory.length, 2);
  assert.equal(state.networkDailyHistory[1].transported, 4);
});

test('network diagnostics expose observed overload, queues, low use and unmet demand with player actions', () => {
  const state = { lines: [{ id: 'L1', name: 'Linia 1', stats: { load: 1, waiting: 60, segmentLoad: [0.4, 1.1], balancePerHour: -200 }, stops: ['a', 'b'] }],
    passengers: { a: { waiting: 60 } }, diagnostics: { failures: { noConnection: 3 } } };
  const problems = networkProblems(state, [{ id: 'a', name: 'Rynek' }]);
  assert.ok(problems.some(item => item.kind === 'overload'));
  assert.ok(problems.some(item => item.kind === 'segment' && item.observed.includes('110%')));
  assert.ok(problems.some(item => item.kind === 'queue' && item.label === 'Rynek'));
  assert.ok(problems.some(item => item.kind === 'connection' && item.observed.includes('3')));
  assert.ok(problems.every(item => item.cause && item.impact && item.actions && item.observed));
  const underused = networkProblems({ lines: [{ id: 'L2', stats: { load: 0.1, waiting: 0, balancePerHour: -200,
    history: Array(5).fill({ minutes: 6 }) }, stops: [] }] });
  assert.equal(underused[0].kind, 'lowUse');
  const fleetAndTransfer = networkProblems({ lines: [{ id: 'L3', type: 'bus', frequency: 8, vehicles: 1, distanceKm: 6, stops: ['a', 'b'], stats: {} }],
    diagnostics: { failures: { inefficientTransfer: 2 } } });
  assert.ok(fleetAndTransfer.some(item => item.kind === 'fleet' && item.observed.includes('potrzeba')));
  assert.ok(fleetAndTransfer.some(item => item.kind === 'transfer' && item.observed.includes('2')));
});
