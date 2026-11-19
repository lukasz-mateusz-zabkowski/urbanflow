import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { saveGame } from '../public/js/storage.js';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';
const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.3.1-tramway-qa');

async function openUnlockedTram(page, viewport, mobile = false) {
  await page.setViewportSize(viewport);
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  game.chooseStarterRoute('loop-center');
  game.createSelectedLine();
  game.state.unlocked.push('tram');
  game.state.selectedType = 'tram';
  game.state.selectedNodes = game.state.lines[0].stops.slice(0, 2);
  game.state.paused = true;
  const memory = { value: null, setItem(_key, value) { this.value = value; } };
  saveGame(memory, game.state, CITIES.krakow.id);
  const rawSave = memory.value;
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('urbanflow-tram-test-fresh')) {
      localStorage.clear();
      sessionStorage.setItem('urbanflow-tram-test-fresh', '1');
    }
    const seededSave = sessionStorage.getItem('urbanflow-tram-test-save');
    if (seededSave) {
      localStorage.setItem('urbanflow.krakow.v2', seededSave);
      sessionStorage.removeItem('urbanflow-tram-test-save');
    }
    Math.random = () => 0.1;
  });
  await page.addInitScript(save => localStorage.setItem('urbanflow.krakow.v2', save), rawSave);
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map')).toBeVisible();
  if (mobile) await page.locator('#mobilePanelButton').tap();
  await expect(page.locator('[data-type="tram"]')).toBeEnabled();
  return errors;
}

test('tramway editor exposes street, manual and existing-track modes and keeps manual points as a draft', async ({ page }) => {
  const errors = await openUnlockedTram(page, { width: 1366, height: 768 });
  await expect(page.locator('#tramBuildTools')).toBeVisible();
  await expect(page.locator('[data-tram-mode="street"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-tram-mode="manual"]').click();
  await expect(page.locator('[data-tram-mode="manual"]')).toHaveAttribute('aria-pressed', 'true');
  const map = await page.locator('#map').boundingBox();
  await page.mouse.click(map.x + map.width * 0.72, map.y + map.height * 0.48);
  await expect(page.locator('#tramDraftHint')).toContainText('1 punktów pośrednich');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramInfrastructure.segments.length);
  expect(before).toBe(0);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'tramway-manual-desktop-1366x768.png'), fullPage: false, animations: 'disabled' });
  await page.locator('[data-action="clear-tram-controls"]').click();
  await expect(page.locator('#tramDraftHint')).toContainText('0 punktów pośrednich');
  expect(errors).toEqual([]);
});

test('tramway mode controls remain usable on touch mobile', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = await openUnlockedTram(page, { width: 390, height: 844 }, true);
    await page.locator('[data-tram-mode="manual"]').tap();
    await expect(page.locator('[data-tram-mode="manual"]')).toHaveAttribute('aria-pressed', 'true');
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: join(artifactDir, 'tramway-manual-mobile-390x844.png'), fullPage: false, animations: 'disabled' });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
