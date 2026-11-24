import { chromium } from '@playwright/test';

const baselineUrl = process.env.UF_ATLAS_BASELINE_URL || 'http://127.0.0.1:3109/';
const candidateUrl = process.env.UF_ATLAS_CANDIDATE_URL || 'http://127.0.0.1:3108/';
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';
const workspaceModes = {
  passengers: ['off', 'flow', 'queues', 'unmet']
};

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
}

async function measure(browser, url, sampleCount = 15) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  await page.goto(url);
  await page.locator('#startKrakow').click();
  await page.locator('#map.leaflet-container').waitFor({ state: 'visible' });
  const workspaces = {};
  for (const [workspace, modes] of Object.entries(workspaceModes)) {
    await page.locator(`[data-action="atlas-view"][data-view="${workspace}"]`).click();
    for (let index = 0; index < 5; index += 1) await switchMode(page, modes[index % modes.length]);
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) samples.push(await switchMode(page, modes[index % modes.length]));
    workspaces[workspace] = { values: samples };
  }
  await context.close();
  return { url, workspaces };
}

async function switchMode(page, mode) {
  return page.evaluate(async selected => {
    const start = performance.now();
    const button = document.querySelector(`[data-action="analytics-mode"][data-mode="${selected}"]`);
    if (!button) throw new Error(`Atlas mode is unavailable in ${document.documentElement.dataset.atlasView}: ${selected}; available=${[...document.querySelectorAll('[data-action="analytics-mode"]')].map(item => item.dataset.mode).join(',')}`);
    button.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (document.querySelector(`[data-action="analytics-mode"][data-mode="${selected}"]`)?.getAttribute('aria-pressed') !== 'true') throw new Error(`Atlas layer did not activate: ${selected}`);
    return performance.now() - start;
  }, mode);
}

const browser = await chromium.launch({ headless: true });
try {
  const measurements = { baseline: { url: baselineUrl, values: Object.fromEntries(Object.keys(workspaceModes).map(key => [key, []])) },
    candidate: { url: candidateUrl, values: Object.fromEntries(Object.keys(workspaceModes).map(key => [key, []])) } };
  const order = [['baseline', 'candidate'], ['candidate', 'baseline'], ['baseline', 'candidate'], ['candidate', 'baseline']];
  for (const pair of order) {
    for (const target of pair) {
      const result = await measure(browser, measurements[target].url);
      for (const workspace of Object.keys(workspaceModes)) measurements[target].values[workspace].push(...result.workspaces[workspace].values);
    }
  }
  const summarize = target => ({ url: target.url, workspaces: Object.fromEntries(Object.entries(target.values).map(([workspace, values]) => [workspace,
    { samples: values.length, medianMs: percentile(values, 0.5), p95Ms: percentile(values, 0.95) }])) });
  const baseline = summarize(measurements.baseline);
  const candidate = summarize(measurements.candidate);
  const medianDeltaPercent = Object.fromEntries(Object.keys(workspaceModes).map(workspace => [workspace,
    Number(((candidate.workspaces[workspace].medianMs / baseline.workspaces[workspace].medianMs - 1) * 100).toFixed(1))]));
  console.log(JSON.stringify({ viewport: '1366x768', operation: 'analytics layer selection to two paint frames after warming each workspace', baseline, candidate, medianDeltaPercent,
    note: 'Four fresh-session rounds alternate which version is measured first; fifteen warmed samples per workspace in each round (60 samples per version). Local results are not a hardware guarantee.' }, null, 2));
} finally {
  await browser.close();
}
