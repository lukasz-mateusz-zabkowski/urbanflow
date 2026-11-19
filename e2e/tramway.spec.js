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
  const starter = game.chooseStarterRoute('loop-center');
  if (!starter.ok) throw new Error(starter.message);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  const stops = game.state.lines[0].stops.slice(0, 2);
  const from = game.city.points.find(point => point.id === stops[0]);
  const to = game.city.points.find(point => point.id === stops[1]);
  game.state.selectedNodes = stops;
  game.state.tramControlPoints = [[(from.lat + to.lat) / 2, (from.lng + to.lng) / 2]];
  const tram = game.addLine('tram', stops);
  if (!tram.ok) throw new Error(tram.message);
  game.beginEditLine(tram.line.id);
  game.state.paused = true;
  const memory = { value: null, setItem(_key, value) { this.value = value; } };
  saveGame(memory, game.state, CITIES.krakow.id);
  const rawSave = memory.value;
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('urbanflow-tram-test-seeded')) {
      localStorage.clear();
      localStorage.setItem('urbanflow.krakow.v2', save);
      sessionStorage.setItem('urbanflow-tram-test-seeded', '1');
    }
    Math.random = () => 0.1;
  }, rawSave);
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map')).toBeVisible();
  if (mobile) await page.locator('#mobilePanelButton').tap();
  // The fixture opens an existing tram in edit mode, so transport switching is intentionally disabled.
  await expect(page.locator('[data-type="tram"]')).toHaveAttribute('aria-pressed', 'true');
  return errors;
}

test('tramway editor exposes street, manual and existing-track modes and keeps manual points as a draft', async ({ page }) => {
  const errors = await openUnlockedTram(page, { width: 1366, height: 768 });
  await expect(page.locator('#tramBuildTools')).toBeVisible();
  await expect(page.locator('[data-tram-mode="manual"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-tram-mode="street"]').click();
  await expect(page.locator('[data-tram-mode="street"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-tram-mode="manual"]').click();
  await expect(page.locator('[data-tram-mode="manual"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tramDraftHint')).toContainText('0 punktów pośrednich');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramInfrastructure.segments.length);
  expect(before).toBeGreaterThan(0);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'tramway-manual-desktop-1366x768.png'), fullPage: false, animations: 'disabled' });
  await page.locator('[data-action="clear-tram-controls"]').click();
  await expect(page.locator('#tramDraftHint')).toContainText('0 punktów pośrednich');
  const afterClear = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramInfrastructure.segments.length);
  expect(afterClear).toBe(before);
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

test('standard game editor previews, charges and restores a geometry-only tram edit on desktop', async ({ page }) => {
  await openUnlockedTram(page, { width: 1366, height: 768 });
  const handle = page.locator('.tram-control-marker').first();
  await expect(handle).toBeVisible();
  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
    const line = state.lines.find(item => item.type === 'tram');
    return { geometry: line.routeGeometry, budget: state.budget, control: state.tramControlPoints[0] };
  });
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'tramway-edit-before-desktop.png'), animations: 'disabled' });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 38, box.y + box.height / 2 - 24, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramControlPoints[0]))
    .not.toEqual(before.control);
  const previewCost = await page.locator('#previewCost').innerText();
  expect(previewCost).not.toBe('0 zł');
  await page.screenshot({ path: join(artifactDir, 'tramway-edit-preview-desktop.png'), animations: 'disabled' });
  await page.locator('#createLineButton').click();
  const after = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
    const line = state.lines.find(item => item.type === 'tram');
    return { geometry: line.routeGeometry, budget: state.budget };
  });
  expect(after.geometry).not.toEqual(before.geometry);
  expect(after.budget).toBeLessThan(before.budget);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.lines.find(item => item.type === 'tram').routeGeometry))
    .toEqual(after.geometry);
  await page.screenshot({ path: join(artifactDir, 'tramway-edit-saved-desktop.png'), animations: 'disabled' });
});

test('manual tram control handle can be moved by touch without panning the mobile map', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await openUnlockedTram(page, { width: 390, height: 844 }, true);
    await page.locator('#panelClose').tap();
    const handle = page.locator('.tram-control-marker').first();
    await expect(handle).toBeVisible();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramControlPoints[0]);
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: join(artifactDir, 'tramway-edit-before-mobile.png'), animations: 'disabled' });
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 41 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 32, y: y - 22, id: 41 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.tramControlPoints[0]))
      .not.toEqual(before);
    await page.screenshot({ path: join(artifactDir, 'tramway-edit-preview-mobile.png'), animations: 'disabled' });
    await page.locator('#mobilePanelButton').tap();
    await page.locator('#createLineButton').tap();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.editingLineId))
      .toBeNull();
  } finally { await context.close(); }
});
