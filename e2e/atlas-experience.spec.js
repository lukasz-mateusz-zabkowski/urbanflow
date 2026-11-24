import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.5.0-atlas');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

async function openGame(page, viewport, mobile) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/');
  await page.locator('#startKrakow').click();
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  const starter = page.locator('#routeOptions [data-route]').first();
  await starter.click();
  await expect(page.locator('#createLineButton')).toBeEnabled();
  await page.locator('#createLineButton').click();
  await expect(page.locator('#lineList .line-item')).toHaveCount(1);
  if (mobile) await page.locator('#mobilePanelButton').click();
  return errors;
}

for (const scenario of [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, mobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true }
]) {
  test(`${scenario.name}: Atlas views, map layers, line controls and save compatibility`, async ({ page }) => {
    const errors = await openGame(page, scenario.viewport, scenario.mobile);
    await mkdir(artifacts, { recursive: true });
    await page.locator('#pauseButton').click();
    const before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, carried: state.carried, lines: state.lines.map(line => ({ id: line.id, type: line.type, stops: line.stops })), fleet: state.fleet };
    });
    await expect(page.locator('#atlasViewNav button')).toHaveCount(5);
    const tabs = ['transport', 'planning', 'passengers', 'development', 'operations'];
    const viewEvidence = { transport: '.network-section', planning: '#buildSection', passengers: '.mobility-panel', development: '#cityEvolutionPanel', operations: '#operationsDashboard' };
    for (const view of tabs) {
      const tab = page.locator(`[data-action="atlas-view"][data-view="${view}"]`);
      await tab.click();
      await expect(page.locator('html')).toHaveAttribute('data-atlas-view', view);
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await page.locator(viewEvidence[view]).scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifacts, `${scenario.name}-${view}.png`), animations: 'disabled' });
    }

    await page.locator('[data-action="analytics-mode"][data-mode="landUse"]').click();
    await expect(page.locator('#landUsePanel')).toBeVisible();
    await page.locator('[data-action="analytics-mode"][data-mode="investments"]').click();
    await expect(page.locator('#investmentsPanel')).toBeVisible();
    await page.locator('[data-action="analytics-mode"][data-mode="queues"]').click();
    await expect(page.locator('.mobility-panel')).toBeVisible();
    await expect(page.locator('#networkLegend')).not.toBeEmpty();

    await page.locator('#atlasLineFilter').selectOption('bus');
    await expect(page.locator('#lineList .line-item')).toHaveCount(1);
    await page.locator('#atlasLineFilter').selectOption('tram');
    await expect(page.locator('#lineList .line-item')).toHaveCount(0);
    await page.locator('#atlasLineFilter').selectOption('all');
    await page.locator('#lineList .line-item').first().click();
    if (!(await page.locator('#lineDetail').isVisible())) await page.locator('#lineList .line-item').first().click();
    await expect(page.locator('#lineDetail')).toBeVisible();
    await page.locator('#atlasLineSort').selectOption('profitability');
    await expect(page.locator('#atlasLineSort')).toHaveValue('profitability');
    await page.locator('[data-action="atlas-view"][data-view="operations"]').click();
    await expect(page.locator('#operationsDashboard')).toBeVisible();
    await expect(page.locator('#atlasBudget')).toHaveText(/\d/);
    await expect(page.locator('#atlasFleet')).toContainText('/');
    await expect(page.locator('#lineDetail')).toBeVisible();
    const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
    expect(widths.body).toBeLessThanOrEqual(scenario.viewport.width);
    expect(widths.page).toBeLessThanOrEqual(scenario.viewport.width);

    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
    expect(save.version).toBe(12);
    expect({ budget: save.state.budget, carried: save.state.carried,
      lines: save.state.lines.map(line => ({ id: line.id, type: line.type, stops: line.stops })), fleet: save.state.fleet }).toEqual(before);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('urbanflow.atlas.preferences.v1'))).view).toBe('operations');
    expect(errors).toEqual([]);
  });
}
