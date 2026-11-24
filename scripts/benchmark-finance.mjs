import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const candidateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineRoot = resolve(process.env.UF_BENCHMARK_BASE_ROOT || candidateRoot);
const versionAt = root => JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const samples = 31;
const ticksPerSample = 300;

async function loadGame(root, suffix) {
  const moduleUrl = relative => `${pathToFileURL(resolve(root, relative)).href}?benchmark=${suffix}`;
  const [{ CITIES }, { UrbanFlowGame }] = await Promise.all([
    import(moduleUrl('public/js/cities.js')),
    import(moduleUrl('public/js/game.js'))
  ]);
  return { city: CITIES.krakow, UrbanFlowGame };
}

function quantile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)];
}

function summarize(values) {
  return { median: quantile(values, .5), p95: quantile(values, .95) };
}

async function measureSample({ city, UrbanFlowGame }) {
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka', random: () => .1 });
  game.chooseStarterRoute('loop-center');
  const start = performance.now();
  for (let tick = 0; tick < ticksPerSample; tick += 1) game.tick(() => .5);
  return { game, tickMs: (performance.now() - start) / ticksPerSample };
}

const baselineType = await loadGame(baselineRoot, 'baseline-17');
const candidateType = await loadGame(candidateRoot, 'candidate-18');
const tickResults = { baseline: [], candidate: [] };
let baselineGame;
let candidateGame;
for (let sample = 0; sample < samples + 3; sample += 1) {
  const order = sample % 2 ? [['candidate', candidateType], ['baseline', baselineType]]
    : [['baseline', baselineType], ['candidate', candidateType]];
  for (const [name, type] of order) {
    const result = await measureSample(type);
    if (sample >= 3) tickResults[name].push(result.tickMs);
    if (sample === samples + 2) {
      if (name === 'baseline') baselineGame = result.game;
      else candidateGame = result.game;
    }
  }
}
const baseline = { game: baselineGame, tickMs: summarize(tickResults.baseline), saveBytes: Buffer.byteLength(JSON.stringify(baselineGame.state)) };
const candidate = { game: candidateGame, tickMs: summarize(tickResults.candidate), saveBytes: Buffer.byteLength(JSON.stringify(candidateGame.state)) };
const financeModule = await import(pathToFileURL(resolve(candidateRoot, 'public/js/finance.js')).href + '?benchmark=finance');
const { financeForecast, financeGoals, financeHistory, financeSnapshot } = financeModule;
const summaryOps = [
  ['snapshot', () => financeSnapshot(candidate.game.state)],
  ['history', () => financeHistory(candidate.game.state)],
  ['forecast', () => financeForecast(candidate.game.state, 1, { weeklyCommitments: 0 })],
  ['goals', () => financeGoals(candidate.game.state)]
];
const financeMs = {};
for (const [name, operation] of summaryOps) {
  const values = [];
  for (let sample = 0; sample < samples + 3; sample += 1) {
    const start = performance.now();
    for (let index = 0; index < 1000; index += 1) operation();
    const elapsed = (performance.now() - start) / 1000;
    if (sample >= 3) values.push(elapsed);
  }
  financeMs[name] = summarize(values);
}

if (globalThis.gc) globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
for (let index = 0; index < 10000; index += 1) {
  financeSnapshot(candidate.game.state);
  financeForecast(candidate.game.state, 1, { weeklyCommitments: 0 });
  financeHistory(candidate.game.state);
}
if (globalThis.gc) globalThis.gc();
const heapAfter = process.memoryUsage().heapUsed;

console.log(JSON.stringify({
  baseline: { root: baselineRoot, version: versionAt(baselineRoot), tickMsPerTick: baseline.tickMs, saveBytes: baseline.saveBytes },
  candidate: { root: candidateRoot, version: versionAt(candidateRoot), tickMsPerTick: candidate.tickMs, saveBytes: candidate.saveBytes },
  financeDashboardCalculationMsPerCall: financeMs,
  financeDashboardHeapDeltaBytesAfter10000ReadCycles: heapAfter - heapBefore,
  method: { samples, warmupSamples: 3, ticksPerSample, sameNodeProcess: process.version, gcExposed: Boolean(globalThis.gc) }
}, null, 2));
