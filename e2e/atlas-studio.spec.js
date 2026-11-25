import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-fundament-ii-atlas-studio');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

for (const viewport of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 360, height: 800 }
]) {
  test(`${viewport.name}: Atlas Studio previews a route and opens existing tools without changing campaign state`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
    await page.locator('#startKrakow').click();
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    await page.locator('#routeOptions [data-route]').first().click();
    await page.locator('#createLineButton').click();
    await expect(page.locator('#lineList [data-action="select-line"]')).toHaveCount(1);
    await expect(page.locator('#lineList [data-action="select-line"]')).toHaveAttribute('aria-expanded', 'true');
    if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
    await page.locator('#pauseButton').click();
    await page.locator('[data-action="atlas-view"][data-view="planning"]').click();

    const stateSnapshot = () => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, carried: state.carried, generated: state.generated, waiting: state.passengers,
        fleet: state.fleet, lines: state.lines, elapsedMinutes: state.elapsedMinutes, rngState: state.rngState,
        campaign: state.campaign };
    });
    const before = await stateSnapshot();
    await expect(page.locator('#atlasStudioPanel')).toBeVisible();
    await expect(page.locator('#studioContext')).toContainText('2 przyst.');
    await expect(page.locator('[data-studio-tool="timetable"]')).toBeEnabled();
    await expect(page.locator('[data-studio-tool="fleet"]')).toBeEnabled();
    await expect(page.locator('[data-studio-tool="compare"]')).toBeEnabled();

    await mkdir(artifacts, { recursive: true });
    await page.locator('#atlasStudioPanel').screenshot({ path: join(artifacts, `${viewport.name}-planning-studio.png`), animations: 'disabled' });
    await page.locator('[data-studio-tool="timetable"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lineDetail .timetable-control')).toBeVisible();
    await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
    await page.locator('[data-studio-tool="fleet"]').click();
    await expect(page.locator('#operationsDashboard')).toBeVisible();
    await expect(page.locator('#operationsFleetTypes')).toBeVisible();
    await expect(page.locator('#opsDecisionLine')).toHaveValue(before.lines[0].id);
    await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
    await page.locator('[data-studio-tool="compare"]').click();
    await expect(page.locator('.decision-simulator')).toBeVisible();
    await expect(page.locator('#opsDecisionLine')).toHaveValue(before.lines[0].id);
    await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
    await page.locator('[data-studio-tool="investments"]').click();
    await expect(page.locator('#investmentsPanel')).toBeVisible();
    await expect(page.locator('#atlasStudioPanel')).toBeHidden();
    await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
    await expect(page.locator('#atlasStudioPanel')).toBeVisible();
    expect(await stateSnapshot()).toEqual(before);

    const width = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
    expect(width.body).toBeLessThanOrEqual(viewport.width);
    expect(width.page).toBeLessThanOrEqual(viewport.width);
    expect(errors).toEqual([]);
  });
}
