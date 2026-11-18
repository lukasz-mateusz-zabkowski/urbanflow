import { performance } from 'node:perf_hooks';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';

const rounds = Number(process.env.UF_BENCH_ROUNDS) || 5;
const samples = Number(process.env.UF_BENCH_SAMPLES) || 240;
const warmup = 60;
const week = 7 * 24 * 60;

function createScenario(projectCount) {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  if (!game.chooseStarterRoute('loop-center').ok || !game.state.lines.length) throw new Error('Could not create benchmark service');
  game.state.elapsedMinutes = 1;
  if (game.state.investments) {
    game.state.investments.projects = Array.from({ length: projectCount }, (_, index) => ({
      id: `investment-${index + 1}`, type: index % 2 ? 'economic' : 'housing',
      districtId: index % 2 ? 'nowa-huta' : 'bronowice', status: 'in-progress', cost: index % 2 ? 110000 : 85000,
      durationWeeks: index % 2 ? 4 : 3, createdAt: 0, approvedAt: 0, completesAt: week * 60,
      completedAt: null, effectApplied: false, refund: 0, charged: true,
      expected: { residentsCapacity: 10000, jobsCapacity: 10000, transportHandling: 1 }, result: null
    }));
  }
  return game;
}

function measureScenario(projectCount) {
  const game = createScenario(projectCount);
  for (let index = 0; index < warmup; index += 1) game.tick(() => 0.5);
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const times = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now(); game.tick(() => 0.5); times.push(performance.now() - start);
  }
  return { times, heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - before), saveBytes: Buffer.byteLength(JSON.stringify(game.state)),
    activeProjects: game.state.investments?.projects.length || 0 };
}

function percentile(values, p) { return values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]; }
function summarize(name, runs, index) {
  const times = runs.flatMap(run => run[index].times).sort((a, b) => a - b);
  const heap = runs.reduce((sum, run) => sum + run[index].heapDeltaBytes, 0);
  return { scenario: name, activeProjects: runs.at(-1)[index].activeProjects, rounds, samplesPerRound: samples,
    medianTickMs: Number(percentile(times, 0.5).toFixed(3)), p95TickMs: Number(percentile(times, 0.95).toFixed(3)),
    observedHeapDeltaBytesPerRound: Math.round(heap / rounds), saveBytes: runs.at(-1)[index].saveBytes };
}

// Alternate scenario order in each round to reduce systematic warm-up/order bias.
const runs = [];
for (let round = 0; round < rounds; round += 1) {
  const order = round % 2 === 0 ? [0, 6] : [6, 0];
  const measured = order.map(measureScenario);
  runs.push(round % 2 === 0 ? measured : measured.reverse());
}

const result = { baseline: summarize('service without urban investment projects', runs, 0),
  activePortfolio: summarize('service with six long-running urban projects', runs, 1) };
result.medianOverheadPercent = result.baseline.medianTickMs
  ? Number(((result.activePortfolio.medianTickMs / result.baseline.medianTickMs - 1) * 100).toFixed(1)) : null;
result.measurementNotes = 'Paired alternating rounds with per-scenario warm-up; heap delta remains GC/JIT-sensitive and is indicative only.';
console.log(JSON.stringify(result, null, 2));
