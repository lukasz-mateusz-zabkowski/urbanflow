import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.6.0-operations');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

for (const viewport of [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 }
]) {
  test(`${viewport.name}: fleet dashboard and safe operations decision preview/apply`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/');
    await page.locator('#startKrakow').click();
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    await page.locator('#routeOptions [data-route]').first().click();
    await page.locator('#createLineButton').click();
    await expect(page.locator('#lineList .line-item')).toHaveCount(1);
    await page.locator('#pauseButton').click();
    if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
    await page.locator('[data-action="atlas-view"][data-view="operations"]').click();
    await expect(page.locator('#operationsDashboard')).toBeVisible();
    await expect(page.locator('#operationsFleetTypes [data-fleet-type="bus"]')).toContainText('Rezerwa');
    await expect(page.locator('#operationsFleetLines')).not.toBeEmpty();
    await expect(page.locator('#opsDecisionLine option')).toHaveCount(1);
    await page.locator('#operationsFleetLines [data-action="open-line"]').first().click();
    await expect(page.locator('#lineDetail')).toBeVisible();

    let before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, carried: state.carried, generated: state.generated,
        networkVersion: state.networkVersion, line: structuredClone(state.lines[0]), rng: state.rngState,
        elapsedMinutes: state.elapsedMinutes };
    });
    await page.locator('#opsDecisionKind').selectOption('frequency');
    await page.locator('#opsDecisionFrequency').evaluate(input => {
      input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#opsDecisionPreviewButton').click();
    await expect(page.locator('#opsDecisionPreview')).toContainText('miejsc/h');
    await expect(page.locator('#opsDecisionPreview')).toContainText('nie są prognozowane');
    const duringPreview = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, carried: state.carried, generated: state.generated,
        networkVersion: state.networkVersion, line: structuredClone(state.lines[0]), rng: state.rngState,
        elapsedMinutes: state.elapsedMinutes };
    });
    expect(duringPreview).toEqual(before);
    await page.locator('#pauseButton').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.elapsedMinutes), { timeout: 10000 })
      .toBeGreaterThan(before.elapsedMinutes);
    await expect(page.locator('#opsDecisionApplyButton')).toBeDisabled();
    await expect(page.locator('#opsDecisionPreview')).toContainText('Stan kampanii zmienił się od podglądu');
    await page.locator('#pauseButton').click();
    await page.locator('#opsDecisionPreviewButton').click();
    await expect(page.locator('#opsDecisionApplyButton')).toBeEnabled();
    await page.locator('#opsDecisionCancelButton').click();
    before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, carried: state.carried, generated: state.generated,
        networkVersion: state.networkVersion, line: structuredClone(state.lines[0]), rng: state.rngState,
        elapsedMinutes: state.elapsedMinutes };
    });

    await page.locator('#opsDecisionKind').selectOption('assign');
    await page.locator('#opsDecisionPreviewButton').click();
    await page.locator('#opsDecisionApplyButton').click();
    await page.getByRole('button', { name: 'Zatwierdź wariant' }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.lines[0].vehicles)).toBe(before.line.vehicles + 1);
    const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
    const after = savedAfter.state;
    expect(after.budget).toBe(before.budget);
    expect(after.carried).toBe(before.carried);
    expect(after.generated).toBe(before.generated);
    expect(after.rngState).toBe(before.rng);
    expect(savedAfter.version).toBe(13);

    const width = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
    expect(width.body).toBeLessThanOrEqual(viewport.width);
    expect(width.page).toBeLessThanOrEqual(viewport.width);
    await mkdir(artifacts, { recursive: true });
    await page.locator('#opsDecisionPreview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(artifacts, `${viewport.name}.png`), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
