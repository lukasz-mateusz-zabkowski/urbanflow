import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-0.6.0-visual-qa');
const CI_TEST_TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200M40 -20 120 80 140 270" fill="none" stroke="#fffefa" stroke-width="12"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200M40 -20 120 80 140 270" fill="none" stroke="#c8d3c4" stroke-width="2"/><path d="M10 30h30v20H10zM190 210h35v18h-35z" fill="#d5e2cc"/></svg>';
const DESKTOPS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'desktop-1280x720', width: 1280, height: 720 }
];
const MOBILES = [
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 }
];
async function startGame(page, viewport, mobile = false) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.addInitScript(() => localStorage.clear());
  if (process.env.CI) await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: CI_TEST_TILE }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  if (mobile) await page.locator('#startKrakow').tap();
  else await page.locator('#startKrakow').click();
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect.poll(() => page.locator('.node-icon').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count(), { timeout: 20000 }).toBeGreaterThan(0);
  const firstMarker = page.locator('.node-icon:not(:has(.map-node.selected))').first();
  const firstLabel = firstMarker.locator('.map-node>span');
  await expect(firstLabel).toHaveCSS('opacity', '0');
  await firstMarker.focus();
  await expect(firstLabel).toHaveCSS('opacity', '1');
  return errors;
}

async function saveScreenshot(page, name) {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: false, animations: 'disabled' });
}

async function assertNoViewportOverflow(page, width) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    panelWidth: document.querySelector('#buildPanel').scrollWidth,
    panelClientWidth: document.querySelector('#buildPanel').clientWidth
  }));
  expect(metrics.documentWidth, 'document must not overflow horizontally').toBeLessThanOrEqual(width);
  expect(metrics.bodyWidth, 'body must not overflow horizontally').toBeLessThanOrEqual(width);
  expect(metrics.panelWidth - metrics.panelClientWidth, 'panel content must not overflow horizontally').toBeLessThanOrEqual(1);
}

for (const viewport of DESKTOPS) {
  test(`${viewport.name}: resize, collapse, map invalidation, keyboard, route details and screenshot`, async ({ page }) => {
    const errors = await startGame(page, viewport);
    await page.evaluate(() => {
      const original = L.Map.prototype.invalidateSize;
      window.__invalidateSizeCalls = 0;
      L.Map.prototype.invalidateSize = function (...args) {
        window.__invalidateSizeCalls += 1;
        return original.apply(this, args);
      };
    });

    const originalWidth = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#playfield')).getPropertyValue('--panel-width')));
    expect(originalWidth).toBe(462);
    const mapWidthBefore = await page.locator('#map').evaluate(element => element.clientWidth);
    const handle = await page.locator('#panelResizer').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 60, handle.y + handle.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#playfield')).getPropertyValue('--panel-width')))).toBe(522);
    await expect.poll(() => page.evaluate(() => window.__invalidateSizeCalls)).toBeGreaterThan(0);
    expect(await page.locator('#map').evaluate(element => element.clientWidth)).toBe(mapWidthBefore - 60);
    expect(await page.evaluate(() => localStorage.getItem('urbanflow.ui.panel-width.v1'))).toBe('522');

    await page.locator('#panelResizer').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#playfield')).getPropertyValue('--panel-width')))).toBe(542);

    await page.locator('#panelCollapseButton').click();
    await expect(page.locator('#playfield')).toHaveClass(/panel-collapsed/);
    await expect(page.locator('#panelExpandButton')).toBeVisible();
    await page.locator('#panelExpandButton').click();
    await expect(page.locator('#playfield')).not.toHaveClass(/panel-collapsed/);
    await expect(page.locator('#buildPanel')).toBeVisible();

    await page.locator('#routeOptions button').first().click();
    await expect(page.locator('#previewDistance')).not.toHaveText('—');
    await page.locator('.route-diagnostics summary').click();
    await expect(page.locator('#previewRoutingSource')).not.toHaveText('—');
    await expect(page.locator('#previewRoutingAlgorithm')).not.toHaveText('—');
    await expect(page.locator('#previewRoutingReason')).not.toBeEmpty();
    await expect(page.locator('#previewRoutingSnap')).not.toBeEmpty();

    const bounds = await page.evaluate(() => {
      const map = document.querySelector('.map-wrap').getBoundingClientRect();
      const panel = document.querySelector('#buildPanel').getBoundingClientRect();
      const objective = document.querySelector('#objective').getBoundingClientRect();
      return { mapRight: map.right, panelLeft: panel.left, panelRight: panel.right, objectiveRight: objective.right, viewportWidth: innerWidth };
    });
    expect(Math.abs(bounds.mapRight - bounds.panelLeft)).toBeLessThanOrEqual(1);
    expect(bounds.panelRight).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.objectiveRight).toBeLessThanOrEqual(bounds.mapRight);
    await assertNoViewportOverflow(page, viewport.width);
    await saveScreenshot(page, viewport.name);
    expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
  });
}

for (const viewport of MOBILES) {
  test(`${viewport.name}: touch profile, sheet, feedback JSON and screenshot`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = await startGame(page, viewport, true);
    await expect(page.locator('#mobilePanelButton')).toBeVisible();

    const marker = page.locator('.node-icon').first();
    const markerBox = await marker.boundingBox();
    await page.touchscreen.tap(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
    await expect(page.locator('#buildPanel')).toHaveClass(/open/);
    await expect(page.locator('#placeProfile')).toBeVisible();
    await expect(page.locator('#placeProfileName')).not.toBeEmpty();
    await expect(page.locator('#placeProfileType')).not.toBeEmpty();
    await expect(page.locator('#placeProfileDemand')).toContainText('szacunkowy');
    await saveScreenshot(page, `${viewport.name}-place-profile`);
    await assertNoViewportOverflow(page, viewport.width);

    await page.locator('#panelClose').click();
    await expect(page.locator('#buildPanel')).not.toHaveClass(/open/);
    await page.locator('#mobilePanelButton').click();
    await expect(page.locator('#buildPanel')).toHaveClass(/open/);
    await page.locator('#feedbackButton').scrollIntoViewIfNeeded();
    await page.locator('#feedbackButton').click();
    await expect(page.locator('#feedbackDialog')).toBeVisible();
    await expect(page.locator('[name="includeDiagnostics"]')).not.toBeChecked();
    await page.locator('[name="category"]').selectOption('Interfejs i grafika');
    await page.locator('#feedbackForm [name="description"]').fill('Panel mieści się na telefonie.');
    await page.locator('[name="rating"]').selectOption('5');
    await page.locator('#feedbackForm button[type="submit"]').click();
    await expect(page.locator('#feedbackExport')).toBeVisible();
    const report = JSON.parse(await page.locator('#feedbackJson').inputValue());
    expect(report.gameVersion).toBe('0.6.0');
    expect(report).not.toHaveProperty('diagnostics');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#feedbackDownload').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const downloadedReport = JSON.parse(await readFile(downloadPath, 'utf8'));
    expect(downloadedReport.category).toBe('Interfejs i grafika');
    await saveScreenshot(page, viewport.name);
    await saveScreenshot(page, `${viewport.name}-feedback-json`);
    expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
    await context.close();
  });
}

async function exerciseTimetable(page, viewport, mobile) {
  const errors = await startGame(page, viewport, mobile);
  if (mobile && await page.locator('#mobilePanelButton').getAttribute('aria-expanded') === 'true') {
    await page.locator('#panelClose').tap();
  }
  const starterRoute = page.locator('#routeOptions button').first();
  await starterRoute.scrollIntoViewIfNeeded();
  if (mobile) await starterRoute.tap();
  else await starterRoute.click();
  if (mobile && await page.locator('#mobilePanelButton').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#mobilePanelButton').tap();
  }
  const createLine = page.locator('#createLineButton');
  await createLine.scrollIntoViewIfNeeded();
  if (mobile) await createLine.tap();
  else await createLine.click();
  await expect(page.locator('.line-item')).toHaveCount(1);
  if (mobile && await page.locator('#mobilePanelButton').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#mobilePanelButton').tap();
  }
  await expect(page.locator('#lineDetail')).toBeVisible();
  await expect(page.locator('.timetable-control')).toBeVisible();
  const periodRow = page.locator('[data-timetable-row="morning-peak"]');
  const frequencyOutput = periodRow.locator('[data-frequency-value]');
  await expect(frequencyOutput).toHaveText('4 kursów/h');
  await page.locator('[data-timetable-profile]').selectOption('economic');
  await expect(frequencyOutput).toHaveText('2 kursów/h');
  const slider = periodRow.locator('input[type="range"]');
  await slider.focus();
  await slider.press('Home');
  await expect(frequencyOutput).toHaveText('Kursy wyłączone');
  await expect(page.locator('[data-current-period]')).toContainText('kursy wyłączone');
  await expect(periodRow.locator('[data-period-metrics]')).toContainText('/h');
  await page.locator('[data-action="restore-timetable"]').click();
  await expect(frequencyOutput).toHaveText('2 kursów/h');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
  expect(saved.version).toBe(3);
  expect(saved.state.lines[0].timetable.profileId).toBe('economic');
  await page.locator('#timetableTitle').scrollIntoViewIfNeeded();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 8000 });
  await assertNoViewportOverflow(page, viewport.width);
  await saveScreenshot(page, mobile ? 'mobile-390x844-timetable' : `desktop-${viewport.width}x${viewport.height}-timetable`);
  expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
}

test('desktop timetable editor changes actual frequency, cost estimate and persists schema 3', async ({ page }) => {
  await exerciseTimetable(page, { width: 1280, height: 720 }, false);
});

test('mobile timetable editor supports touch interaction and persists schema 3', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await exerciseTimetable(page, { width: 390, height: 844 }, true);
  await context.close();
});
