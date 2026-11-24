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

async function measure(browser, url) {
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
    for (let index = 0; index < 30; index += 1) samples.push(await switchMode(page, modes[index % modes.length]));
    workspaces[workspace] = { samples: samples.length, medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95) };
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
  const baseline = await measure(browser, baselineUrl);
  const candidate = await measure(browser, candidateUrl);
  const medianDeltaPercent = Object.fromEntries(Object.keys(workspaceModes).map(workspace => [workspace,
    Number(((candidate.workspaces[workspace].medianMs / baseline.workspaces[workspace].medianMs - 1) * 100).toFixed(1))]));
  console.log(JSON.stringify({ viewport: '1366x768', operation: 'analytics layer selection to two paint frames after warming each workspace', baseline, candidate, medianDeltaPercent,
    note: 'Each workspace is selected before the timed samples; measurements compare layer changes inside the same workspace. Thirty warmed samples per workspace in Chromium. Local results are not a hardware guarantee.' }, null, 2));
} finally {
  await browser.close();
}
