import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { attachStops, CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { registerRoutingGraph } from '../public/js/routing.js?v=14';
import { SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';

const routeIds = ['s-stradom', 's-kazimierz', 's-plac-wolnica', 's-dietla', 's-podgorze', 's-plac-bohaterow-getta', 's-rynek-podgorski'];
const stops = JSON.parse(await readFile(new URL('../public/data/krakow-stops.json', import.meta.url), 'utf8')).stops;
const manifest = JSON.parse(await readFile(new URL('../public/data/routing/krakow.json', import.meta.url), 'utf8'));
const roadBytes = gunzipSync(await readFile(new URL('../public/data/routing/krakow-road-graph.bin.gz', import.meta.url)));
registerRoutingGraph('krakow', manifest, roadBytes);

function preparedCampaign() {
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stops);
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka' });
  game.state.budget = 50_000_000;
  const starter = game.chooseStarterRoute('starter-local');
  if (!starter.ok) throw new Error(`Could not prepare synthetic campaign: ${starter.message}`);
  game.state.budget = 50_000_000;
  game.state.unlockedPointLevel = 2;
  game.state.revealedStops = city.points.filter(point => point.type === 'stop').map(point => point.id);
  return { version: SAVE_VERSION, cityId: 'krakow', savedAt: 0, state: game.state };
}

const save = preparedCampaign();
const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.2.1-routing-qa');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M-20 220 80 140 180 110 280 20M-20 40 120 130 270 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

async function startPreparedGame(page, viewport, mobile = false) {
  await page.setViewportSize(viewport);
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); Math.random = () => 0.1; },
    { key: SAVE_KEY, value: JSON.stringify(save) });
  if (mobile) await page.addInitScript(() => {
    const attachMapHook = () => {
      if (window.L?.Map) window.L.Map.addInitHook(function exposeMapToVisualTest() { window.__urbanflowVisualTestMap = this; });
      else setTimeout(attachMapHook, 0);
    };
    attachMapHook();
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect.poll(() => page.locator('#map .leaflet-tile-loaded').count()).toBeGreaterThan(0);
  const pauseButton = page.locator('#pauseButton');
  if (await pauseButton.getAttribute('aria-label') !== 'Wznów grę') await pauseButton.click({ force: true });
  await expect(pauseButton).toHaveAttribute('aria-label', 'Wznów grę');
  if (mobile) {
    const panelToggle = page.locator('#mobilePanelButton');
    if (await panelToggle.getAttribute('aria-expanded') !== 'true') await panelToggle.tap();
    await page.locator('[data-action="pick-on-map"]').scrollIntoViewIfNeeded();
  }
  await page.locator('[data-action="pick-on-map"]').click({ force: true });
  // On mobile the expanded build sheet covers the map controls. Close it first,
  // then zoom until local stop markers are individually targetable.
  if (mobile) {
    await expect.poll(() => page.evaluate(() => Boolean(window.__urbanflowVisualTestMap))).toBe(true);
    await page.evaluate(() => {
      const map = window.__urbanflowVisualTestMap;
      map.invalidateSize({ pan: false, animate: false });
      map.setView([50.05, 19.95], 14, { animate: false });
    });
  } else {
    for (let index = 0; index < 5; index += 1) await page.locator('.leaflet-control-zoom-in').click({ force: true });
  }
  return errors;
}

async function screenshot(page, name) {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, name), fullPage: false });
}

async function selectSevenStops(page, mobile = false) {
  for (const id of routeIds) {
    const marker = page.locator(`[data-stop-id="${id}"]`).first();
    for (let attempt = 0; attempt < 8 && await marker.count() === 0; attempt += 1) {
      await page.locator('.leaflet-control-zoom-in').click({ force: true });
      // Leaflet completes animated zoom asynchronously; wait for this stop to
      // enter the DOM before issuing another zoom against an in-flight map.
      await expect.poll(() => marker.count(), { timeout: 700, intervals: [50, 100] })
        .toBeGreaterThan(0).catch(() => {});
    }
    await expect(marker).toHaveCount(1);
    await expect.poll(() => marker.getAttribute('aria-label')).toContain(', profil');
    // Closely spaced SVG markers can overlap on screen. Each marker also has
    // a keyboard contract; focus + Enter targets the chosen accessible stop
    // without clicking a neighboring path in the same hit area.
    await marker.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#draftStopList li')).toHaveCount(7);
  await expect(page.locator('#draftStopList li strong').allTextContents()).resolves.toEqual([
    'Stradom', 'Kazimierz', 'Plac Wolnica', 'Dietla', 'Podgórze', 'Plac Bohaterów Getta', 'Rynek Podgórski'
  ]);
  await expect(page.locator('#previewDistance')).not.toBeEmpty();
  await expect(page.locator('#previewCost')).not.toBeEmpty();
  await expect(page.locator('#previewTime')).not.toBeEmpty();
  await expect(page.locator('#previewRoutingReason')).not.toBeEmpty();
  await expect(page.locator('#createLineButton')).toBeEnabled();
  await page.locator('#createLineButton').scrollIntoViewIfNeeded();
  await expect(page.locator('#createLineButton')).toBeInViewport();
  await expect(page.locator('#map .route-preview-road')).toHaveCount(1);
  await expect.poll(() => page.locator('#map .route-preview-access').count()).toBeGreaterThan(0);
  expect(await page.locator('#map .route-preview-access').evaluateAll(paths => paths.every(path => Boolean(path.getAttribute('stroke-dasharray'))))).toBe(true);
  await page.locator('#previewRoutingDetails summary, .route-diagnostics summary').first().click({ force: true }).catch(() => {});
  for (let index = 0; index < (mobile ? 5 : 3); index += 1) await page.locator('.leaflet-control-zoom-out').click({ force: true });
}

test('standard desktop game builds the ordered seven-stop OSM route, safely edits, cancels, confirms and reloads', async ({ page }) => {
  const errors = await startPreparedGame(page, { width: 1280, height: 720 });
  await selectSevenStops(page);
  const startBudget = await page.locator('#budgetStat').innerText();
  await screenshot(page, 'standard-seven-stop-desktop-preview.png');
  await page.locator('#createLineButton').click();
  await screenshot(page, 'standard-seven-stop-built-desktop.png');
  const lineId = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.lines.find(line => line.stops.length === 7).id);
  const roadGeometry = page.locator(`#map .route-road-geometry[data-line-id="${lineId}"]`);
  const accessGeometry = page.locator(`#map .route-access-link[data-line-id="${lineId}"]`);
  await expect(roadGeometry).toHaveCount(1);
  await expect.poll(() => accessGeometry.count()).toBeGreaterThan(0);
  expect(await accessGeometry.evaluateAll(paths => paths.every(path => Boolean(path.getAttribute('stroke-dasharray'))))).toBe(true);
  const selectLine = page.locator(`#lineList [data-action="select-line"][data-line="${lineId}"]`);
  await expect(selectLine).toBeVisible();
  if (await selectLine.getAttribute('aria-expanded') !== 'true') await selectLine.click({ force: true });
  await expect(page.locator('#lineDetail')).toBeVisible();
  const savedStopsText = await page.locator('#lineDetail [data-detail="route"]').innerText();
  const savedBudget = await page.locator('#budgetStat').innerText();
  await page.locator(`#lineDetail [data-action="edit-line"][data-line="${lineId}"]`).click({ force: true });
  const targetId = await page.evaluate(async id => {
    const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
    const line = state.lines.find(item => item.id === id);
    const options = [...document.querySelectorAll('#lineDetail [data-edit-stop] option')].map(option => option.value).filter(value => !line.stops.includes(value));
    if (!options.length) throw new Error('The editor did not offer any additional unlocked stop for the edit preview.');
    return options[0];
  }, lineId);
  const editStop = page.locator('#lineDetail [data-edit-stop]');
  await editStop.selectOption(targetId);
  await page.locator('#lineDetail [data-edit-segment]').selectOption('0');
  const insertStop = page.locator('#lineDetail [data-action="insert-stop-line"]');
  await expect(insertStop).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.status)).toBe('playing');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.paused)).toBe(true);
  await insertStop.scrollIntoViewIfNeeded();
  await expect(insertStop).toBeInViewport();
  await page.evaluate(() => {
    window.__routeInsertClickCount = 0;
    document.addEventListener('click', event => {
      if (event.target.closest('#lineDetail [data-action="insert-stop-line"]')) window.__routeInsertClickCount += 1;
    }, { capture: true, once: true });
  });
  await insertStop.click();
  expect(await page.evaluate(() => window.__routeInsertClickCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.selectedNodes.length)).toBe(8);
  await expect(page.locator('#draftStopList li')).toHaveCount(8);
  await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(savedStopsText);
  await expect(page.locator('#budgetStat')).toHaveText(savedBudget);
  await screenshot(page, 'standard-seven-stop-edit-preview.png');
  const cancelEdit = page.locator('#clearSelectionButton');
  await cancelEdit.scrollIntoViewIfNeeded();
  await expect(cancelEdit).toBeVisible();
  await cancelEdit.click();
  await expect(page.locator('#draftStopList li')).toHaveCount(0);
  await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(savedStopsText);
  await expect(page.locator('#budgetStat')).toHaveText(savedBudget);

  await page.locator(`#lineDetail [data-action="edit-line"][data-line="${lineId}"]`).click({ force: true });
  await page.locator('#lineDetail [data-edit-stop]').selectOption(targetId);
  await page.locator('#lineDetail [data-edit-segment]').selectOption('0');
  const confirmInsert = page.locator('#lineDetail [data-action="insert-stop-line"]');
  await confirmInsert.scrollIntoViewIfNeeded();
  await expect(confirmInsert).toBeInViewport();
  await confirmInsert.click();
  const previewText = await page.locator('#createLineButton').innerText();
  await page.locator('#createLineButton').scrollIntoViewIfNeeded();
  await expect(page.locator('#createLineButton')).toBeInViewport();
  await page.locator('#createLineButton').click();
  const finalSave = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
  const finalLine = finalSave.state.lines.find(line => line.id === lineId);
  expect(finalLine.stops).toEqual([routeIds[0], targetId, ...routeIds.slice(1)]);
  expect(finalLine.routeGeometry.length).toBeGreaterThan(2);
  expect(finalSave.state.budget).toBeLessThan(save.state.budget);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
  expect(reloaded.state.lines.find(line => line.id === lineId).stops).toEqual(finalLine.stops);
  expect(await page.locator('#budgetStat').innerText()).not.toBe(startBudget);
  expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
  expect(previewText).toContain('Zapisz zmiany');
});

test('standard mobile game shows the ordered seven-stop route preview in the touch layout', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = await startPreparedGame(page, { width: 390, height: 844 }, true);
  await selectSevenStops(page, true);
  await screenshot(page, 'standard-seven-stop-mobile-preview.png');
  expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
  await context.close();
});
