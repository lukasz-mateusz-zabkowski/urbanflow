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
    averageWaitMinutes: 5, availability: 0.5, utilization: 0.5, revenue: 12, cost: 5, balance: 7 });
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
