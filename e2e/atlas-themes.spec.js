import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-2.5.0-themes');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

for (const scenario of [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'mobile-360x800', viewport: { width: 360, height: 800 } }
]) {
  test(`${scenario.name}: switching visual themes preserves campaign and workspace`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('urbanflow-atlas-theme-seeded')) {
        localStorage.clear();
        sessionStorage.setItem('urbanflow-atlas-theme-seeded', '1');
      }
      Math.random = () => 0.2;
    });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/');
    await page.locator('#startKrakow').click();
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    await page.locator('#pauseButton').click();
    if (scenario.viewport.width <= 760) await page.locator('#mobilePanelButton').click();

    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state);
    const workspace = await page.locator('html').getAttribute('data-atlas-view');
    await mkdir(artifacts, { recursive: true });
    for (const theme of ['city', 'network', 'midnight']) {
      await page.locator('#atlasThemeSelect').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-atlas-theme', theme);
      await expect(page.locator('#atlasThemeSelect')).toHaveValue(theme);
      expect(await page.locator('html').getAttribute('data-atlas-view')).toBe(workspace);
      expect(await page.evaluate(() => localStorage.getItem('urbanflow.atlas.theme.v1'))).toBe(theme);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state)).toEqual(before);
      if (theme === 'midnight') {
        const ratios = await page.evaluate(() => {
          const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          const luminance = color => { const [r, g, b] = rgb(color); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const contrast = (background, text) => {
            const values = [luminance(background), luminance(text)].sort((a, b) => b - a);
            return (values[0] + 0.05) / (values[1] + 0.05);
          };
          const network = document.querySelector('.network-section');
          return [
            contrast(getComputedStyle(network).backgroundColor, getComputedStyle(network.querySelector('.section-title h3')).color),
            contrast(getComputedStyle(document.querySelector('#buildPanel')).backgroundColor, getComputedStyle(document.querySelector('.panel-head h2')).color)
          ];
        });
        expect(ratios.every(ratio => ratio >= 4.5)).toBeTruthy();
      }
      const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
      expect(widths.body).toBeLessThanOrEqual(scenario.viewport.width);
      expect(widths.page).toBeLessThanOrEqual(scenario.viewport.width);
      await page.screenshot({ path: join(artifacts, `${scenario.name}-${theme}.png`), animations: 'disabled' });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-atlas-theme', 'midnight');
    await expect(page.locator('#atlasThemeSelect')).toHaveValue('midnight');
    expect(errors).toEqual([]);
  });
}
