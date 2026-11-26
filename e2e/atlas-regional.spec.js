import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const artifacts = join(process.cwd(), 'artifacts', 'alpha-2.9.0');

for (const viewport of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 }
]) test(`${viewport.name}: Atlas Regional is a perspective within five workspaces and preserves campaign state`, async ({ page }) => {
  const pageErrors = [];
  const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  await page.goto('http://127.0.0.1:3140/');
  await page.locator('#startKrakow').click();
  await expect(page.locator('#game')).toBeVisible();
  if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
  await page.locator('#pauseButton').click();
  await expect(page.locator('#atlasViewNav button')).toHaveCount(5);

  const before = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    return { budget: saved?.state?.budget, lines: saved?.state?.lines?.length, elapsed: saved?.state?.elapsedMinutes };
  });
  await page.locator('#atlasPerspectiveSelect').selectOption('regional');
  await expect(page.locator('#atlasRegionalPanel')).toBeVisible();
  await expect(page.locator('#regionalSettlementCount')).toHaveText('11');
  await expect(page.locator('#atlasRegionalList .atlas-regional-place')).toHaveCount(11);
  await expect(page.locator('#atlasRegionalList')).toContainText('Brak bezpośredniej obsługi aktywną linią');
  await expect(page.locator('.map-wrap')).toHaveAttribute('data-perspective', 'regional');
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, `atlas-regional-${viewport.name}.png`), animations: 'disabled' });

  await page.locator('[data-action="regional-select"][data-point="skawina"]').click();
  await expect(page.locator('#placeProfile')).toBeVisible();
  await expect(page.locator('#placeProfileName')).toContainText('Skawina');
  await page.locator('[data-action="regional-plan"][data-point="skawina"]').click();
  await expect(page.locator('[data-action="atlas-view"][data-view="planning"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#atlasViewNav button')).toHaveCount(5);
  const after = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    return { budget: saved?.state?.budget, lines: saved?.state?.lines?.length, elapsed: saved?.state?.elapsedMinutes };
  });
  expect(after).toEqual(before);
  expect(pageErrors).toEqual([]);
});
