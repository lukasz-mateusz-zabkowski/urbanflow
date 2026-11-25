import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.10.0-campaigns');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`campaign selection fits ${viewport.width}x${viewport.height} and lists distinct challenges`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/');
    await expect(page.locator('[data-start-campaign]')).toHaveCount(4);
    await expect(page.locator('.campaign-choice').filter({ hasText: 'Odbudowa transportu' })).toBeVisible();
    await expect(page.locator('.campaign-choice').filter({ hasText: 'Kryzys finansowy' })).toBeVisible();
    await expect(page.locator('.campaign-choice').filter({ hasText: 'Rozwijające się miasto' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, `selection-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('starting a challenge uses its real start budget and routes a goal into the matching Atlas workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/');
  await page.locator('[data-start-campaign="finance-crisis"]').click();
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#budgetStat')).toContainText('220');
  await expect(page.locator('#goalList')).toContainText('Uzyskaj dwa dodatnie tygodnie operacyjne');
  await page.locator('#toggleGoalsButton').click();
  const financeLink = page.locator('#goalList [data-action="atlas-view"][data-view="operations"]').first();
  await financeLink.click();
  await expect(page.locator('html')).toHaveAttribute('data-atlas-view', 'operations');
  expect(errors).toEqual([]);
});

test('an existing or damaged save cannot be replaced until a local export is triggered', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('urbanflow.krakow.v2', '{"version":13,"cityId":"krakow","state":{}}');
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/');
  await expect(page.locator('#exportCampaignSave')).toBeVisible();
  await expect(page.locator('[data-start-campaign="recovery"]')).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.locator('#exportCampaignSave').click();
  await download;
  await expect(page.locator('[data-start-campaign="recovery"]')).toBeEnabled();
  await page.locator('[data-start-campaign="recovery"]').click();
  await expect(page.locator('#summaryDialog[open]')).toBeHidden();
  await expect(page.getByRole('dialog')).toContainText('zastąpi jedyny lokalny slot');
  expect(errors).toEqual([]);
});
