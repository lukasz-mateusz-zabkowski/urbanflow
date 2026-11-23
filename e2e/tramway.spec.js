import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { SIMULATION } from '../public/js/simulation.js';
import { saveGame } from '../public/js/storage.js';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';
const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.3.1-tramway-qa');

function progressCampaignToTramUnlock() {
  let seed = 273;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka', random });
  if (!game.chooseStarterRoute('loop-center').ok) throw new Error('Could not build the campaign starter bus line.');
  if (!game.addLine('bus', [game.startScenario.localHubId, 'dworzec', 'bronowice', 'ruczaj']).ok) {
    throw new Error('Could not build the second bus line for tram progression.');
  }
  const unlockTick = Math.ceil(360 / SIMULATION.minutesPerTick);
  for (let tick = 0; tick < unlockTick && !game.availableTypes().includes('tram'); tick += 1) game.tick(random);
  if (!game.availableTypes().includes('tram')) throw new Error('The campaign did not unlock tram service through normal progression.');
  return game;
}

async function openUnlockedTram(page, viewport, mobile = false, { includeExistingTram = true } = {}) {
  await page.setViewportSize(viewport);
  const game = progressCampaignToTramUnlock();
  if (includeExistingTram) {
    game.setTramBuildMode('manual');
    const stops = game.state.lines[0].stops.slice(0, 2);
    const from = game.city.points.find(point => point.id === stops[0]);
    const to = game.city.points.find(point => point.id === stops[1]);
    game.state.selectedNodes = stops;
    game.state.tramControlPoints = [[(from.lat + to.lat) / 2, (from.lng + to.lng) / 2]];
    const tram = game.addLine('tram', stops);
    if (!tram.ok) throw new Error(tram.message);
    game.beginEditLine(tram.line.id);
  }
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
  await expect(page.locator('#map')).toBeVisible({ timeout: 60000 });
  if (mobile) await page.locator('#mobilePanelButton').tap();
  // The fixture opens an existing tram in edit mode, so transport switching is intentionally disabled.
  if (includeExistingTram) await expect(page.locator('[data-type="tram"]')).toHaveAttribute('aria-pressed', 'true');
  return errors;
}

test('a campaign unlocks tram service through real bus progression and builds a saved manual route in the standard UI', async ({ page }) => {
  const errors = await openUnlockedTram(page, { width: 1366, height: 768 }, false, { includeExistingTram: false });
  const tramButton = page.locator('[data-type="tram"]');
  await expect(tramButton).toBeEnabled();
  await tramButton.click();
  await page.locator('[data-tram-mode="manual"]').click();
  for (const name of ['Wieliczka', 'Bieżanów']) {
    const marker = page.locator(`.node-icon[aria-label^="${name}"]`).first();
    await expect(marker).toBeVisible();
    await marker.click();
  }
  await expect(page.locator('#draftStopList li')).toHaveCount(2);
  // This point is near the midpoint of the two selected districts, keeping
  // each manual track section within the supported per-segment geometry.
  await page.locator('#map').click({ position: { x: 430, y: 470 } });
  await expect(page.locator('.tram-control-marker')).toHaveCount(1);
  await expect(page.locator('#createLineButton')).toBeEnabled();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.budget);
  expect(await page.locator('#previewCost').innerText()).not.toBe('0 zł');
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'tramway-new-build-preview-desktop-1366x768.png'), animations: 'disabled' });
  await page.locator('#clearSelectionButton').click();
  const cancelled = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state);
  expect(cancelled.budget).toBe(before);
  expect(cancelled.lines.filter(item => item.type === 'tram')).toHaveLength(0);
  expect(cancelled.tramControlPoints).toHaveLength(0);
  for (const name of ['Wieliczka', 'Bieżanów']) await page.locator(`.node-icon[aria-label^="${name}"]`).first().click();
  await page.locator('#map').click({ position: { x: 430, y: 470 } });
  await expect(page.locator('#createLineButton')).toBeEnabled();
  await page.locator('#createLineButton').click();
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
    const line = state.lines.find(item => item.type === 'tram');
    return { budget: state.budget, line, tramUnlocked: state.unlocked.includes('tram') };
  });
  expect(saved.tramUnlocked).toBe(true);
  expect(saved.line.tramBuildMode).toBe('manual');
  expect(saved.line.tramControlPoints).toHaveLength(1);
  expect(saved.line.routeGeometry.length).toBeGreaterThan(2);
  expect(saved.budget).toBeLessThan(before);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
    return state.lines.find(item => item.type === 'tram')?.routeGeometry;
  })).toEqual(saved.line.routeGeometry);
  await page.screenshot({ path: join(artifactDir, 'tramway-new-build-saved-desktop-1366x768.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

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
  await expect(page.locator('#map')).toBeVisible({ timeout: 45000 });
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
