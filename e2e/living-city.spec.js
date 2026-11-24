import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.7.0-living-city');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

for (const viewport of [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 }
]) {
  test(`${viewport.name}: Living City selects real model areas and opens transport planning`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/');
    await page.locator('#startKrakow').click();
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
    await page.locator('[data-action="atlas-view"][data-view="development"]').click();
    await page.locator('[data-action="analytics-mode"][data-mode="cityEvolution"]').click();
    await expect(page.locator('#cityEvolutionPanel')).toBeVisible();
    await expect(page.locator('.living-city-legend')).toContainText('wzrost mieszkańców');
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Dostępność pracy');
    await page.locator('#cityEvolutionDistrict').selectOption('biezanow');
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Bieżanów');
    const availableAreas = await page.locator('#cityEvolutionDistrict option').evaluateAll(options => options.map(option => option.value));
    const selectableArea = availableAreas.includes('gorka-narodowa') ? 'gorka-narodowa' : availableAreas.find(id => id !== 'biezanow') || availableAreas[0];
    if (selectableArea !== 'biezanow') {
      await page.locator('#cityEvolutionCompareDistrict').selectOption(selectableArea);
      await expect(page.locator('#cityEvolutionAreaComparison .living-city-compare-card')).toHaveCount(2);
      await expect(page.locator('#cityEvolutionAreaComparison .living-city-compare-card dl div')).toHaveCount(16);
    }
    const candidate = page.locator(`#map .living-city-marker[data-city-area-id="${selectableArea}"]`);
    await expect(candidate).toBeVisible();
    const areaId = await candidate.getAttribute('data-city-area-id');
    if (viewport.width <= 760) await page.locator('#panelClose').click();
    await page.evaluate(() => window.addEventListener('urbanflow:select-city-evolution', event => { window.__livingCitySelection = event.detail.id; }, { once: true }));
    if (viewport.width <= 760) {
      await candidate.focus();
      await candidate.press('Enter');
    } else {
      await candidate.click({ force: true });
    }
    await expect.poll(() => page.evaluate(() => window.__livingCitySelection)).toBe(areaId);
    if (viewport.width <= 760) await page.locator('#mobilePanelButton').click();
    await expect(page.locator('#cityEvolutionDistrict')).toHaveValue(areaId);
    await expect(page.locator('#cityEvolutionComparison')).toContainText('Brak porównywalnego');
    await page.screenshot({ path: join(artifacts, `${viewport.name}-living-city.png`), fullPage: true, animations: 'disabled' });
    await page.locator('[data-action="living-city-plan"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-atlas-view', 'planning');
    await expect(page.locator('#buildPanel')).toHaveClass(/open/);
    const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
    expect(widths.body).toBeLessThanOrEqual(viewport.width);
    expect(widths.page).toBeLessThanOrEqual(viewport.width);
    expect(errors).toEqual([]);
  });
}
