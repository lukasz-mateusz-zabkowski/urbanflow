import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.8.0-finance');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';

for (const viewport of [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 }
]) {
  test(`${viewport.name}: finance management shows observed data and planning reserve is non-cash`, async ({ page }) => {
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
    await page.locator('#pauseButton').click();
    if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
    await page.locator('[data-action="atlas-view"][data-view="operations"]').click();

    await expect(page.locator('#financeManagementTitle')).toBeVisible();
    await expect(page.locator('#financeKpis')).toContainText('Gotówka teraz');
    await expect(page.locator('#financeKpis')).toContainText('Nagrody kampanii');
    await expect(page.locator('#financeForecast')).toContainText('Brak wystarczających danych');
    const before = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
      return { version: saved.version, budget: saved.state.budget, carried: saved.state.carried,
        grants: saved.state.campaign.grants, finance: structuredClone(saved.state.finance) };
    });
    expect(before.version).toBe(13);
    const reserve = page.locator('#financeReserveTarget');
    await reserve.fill('250000');
    await reserve.press('Tab');
    const after = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
      return { version: saved.version, budget: saved.state.budget, carried: saved.state.carried,
        grants: saved.state.campaign.grants, reserveTarget: saved.state.finance.reserveTarget,
        transactionCount: saved.state.finance.transactions.length };
    });
    expect(after.budget).toBe(before.budget);
    expect(after.carried).toBe(before.carried);
    expect(after.grants).toBe(before.grants);
    expect(after.reserveTarget).toBe(250000);
    expect(after.transactionCount).toBe(before.finance.transactions.length);
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await mkdir(artifacts, { recursive: true });
    await page.locator('#financeManagementTitle').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(artifacts, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
