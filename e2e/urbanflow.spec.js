import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.2.0-visual-qa');
const appVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
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
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  // Most browser tests validate game behavior, so keep them deterministic and
  // independent of the availability or rate limits of the public tile server.
  // The live OSM layer is checked separately against real tiles.
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: CI_TEST_TILE }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  if (mobile) await page.locator('#startKrakow').tap();
  else await page.locator('#startKrakow').click();
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#weekdayStat')).not.toBeEmpty();
  await expect.poll(() => page.locator('.node-icon').count()).toBeGreaterThan(0);
  await expect(page.locator('#mobilityTitle')).toBeVisible();
  expect(await page.locator('#mobilityOrigin option').count()).toBeGreaterThan(1);
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
async function saveElementScreenshot(locator, name) {
  await mkdir(artifactDir, { recursive: true });
  await locator.screenshot({ path: join(artifactDir, `${name}.png`), animations: 'disabled' });
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
    await expect.poll(() => page.locator('#map').evaluate(element => element.clientWidth)).toBe(mapWidthBefore - 60);
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

    const places = await page.locator('#mobilityOrigin option').evaluateAll(options => options.map(option => option.value));
    await page.locator('#mobilityOrigin').selectOption(places[0]);
    await page.locator('#mobilityDestination').selectOption(places[1]);
    await page.locator('[data-action="diagnose-mobility"]').click();
    await expect(page.locator('#mobilityRouteResult')).not.toContainText('Wybierz relację');

    await page.locator('[data-mode="flow"]').click();
    await expect(page.locator('[data-mode="flow"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#networkLegend')).toContainText('zaobserwowane obciążenie');
    await page.locator('[data-mode="overload"]').click();
    await expect(page.locator('#networkLegend')).toContainText('95%');
    await page.locator('[data-mode="unmet"]').click();
    await expect(page.locator('#networkLegend')).toContainText('niezrealizowane próby');
    await expect(page.locator('#networkProblems')).toBeVisible();
    await expect(page.locator('#networkHistorySummary')).toBeVisible();
    await expect(page.locator('#networkDailySummary')).toBeVisible();
    await expect(page.locator('#networkWeeklySummary')).toBeVisible();
    await page.locator('[data-mode="cityEvolution"]').click();
    await expect(page.locator('#cityEvolutionPanel')).toBeVisible();
    await expect(page.locator('#cityEvolutionDistrict option').first()).toBeAttached();
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Mieszkańcy');
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Atrakcyjność');
    await expect(page.locator('#networkLegend')).toContainText('potencjał rozwoju');
    await saveElementScreenshot(page.locator('#cityEvolutionPanel'), `${viewport.name}-city-evolution`);
    await page.locator('[data-mode="landUse"]').click();
    await expect(page.locator('#landUsePanel')).toBeVisible();
    await expect(page.locator('#landUseTitle')).toHaveText('Atlas Land Use');
    await expect(page.locator('#landUseDistrict option').first()).toBeAttached();
    await expect(page.locator('#landUseProfile')).toContainText('Rezerwa');
    await expect(page.locator('#landUseProfile')).toContainText('Pojemność');
    await expect(page.locator('.land-use-legend span')).toHaveCount(7);
    await expect(page.locator('#networkLegend')).toContainText('Markery');
    await saveElementScreenshot(page.locator('#landUsePanel'), `${viewport.name}-atlas-land-use`);
    await page.locator('[data-mode="unmet"]').click();
    await saveElementScreenshot(page.locator('.analytics-section'), `${viewport.name}-atlas-network`);
    await expect(page.locator('#createLineButton')).toBeEnabled();
    await page.locator('#createLineButton').click();
    await expect.poll(() => page.locator('#networkHistorySummary').innerText(), { timeout: 10000 }).toContain('Tick:');
    await expect.poll(() => page.locator('#networkDailySummary').innerText()).toContain('Dzień');
    await expect.poll(() => page.locator('#networkWeeklySummary').innerText()).toContain('Tydzień');
    await saveElementScreenshot(page.locator('.network-history'), `${viewport.name}-network-history`);
    const lineSelector = page.locator('#lineList [data-action="select-line"]').first();
    await lineSelector.click();
    if (!(await page.locator('#lineDetail').isVisible())) await lineSelector.click();
    await expect(page.locator('#lineDetail .line-stop-insert')).toBeVisible();
    expect(await page.locator('#lineDetail [data-edit-stop] option').count()).toBeGreaterThan(0);
    await page.locator('#pauseButton').click();
    const originalStops = await page.locator('#lineDetail [data-detail="route"]').innerText();
    const originalBudget = await page.locator('#budgetStat').innerText();
    const originalStopCount = originalStops.split(' → ').length;
    await page.locator('#lineDetail [data-edit-segment]').selectOption('0');
    await page.locator('#lineDetail [data-edit-stop]').selectOption({ index: 0 });
    await page.locator('#lineDetail [data-action="insert-stop-line"]').click();
    await expect(page.locator('#draftStopList li')).toHaveCount(originalStopCount + 1);
    await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(originalStops);
    await expect(page.locator('#budgetStat')).toHaveText(originalBudget);
    await saveElementScreenshot(page.locator('.line-stop-insert'), `${viewport.name}-route-insertion-preview`);
    await page.locator('#clearSelectionButton').click();
    await expect(page.locator('#draftStopList li')).toHaveCount(0);
    await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(originalStops);
    const routeHandle = page.locator('.route-segment-hit').first();
    await expect(routeHandle).toBeVisible();
    if (viewport.name === 'desktop-1920x1080') {
      const routePoint = await routeHandle.evaluate(element => {
        const point = element.getPointAtLength(element.getTotalLength() / 2);
        const svgPoint = element.ownerSVGElement.createSVGPoint(); svgPoint.x = point.x; svgPoint.y = point.y;
        const screen = svgPoint.matrixTransform(element.getScreenCTM()); return { x: screen.x, y: screen.y };
      });
      await page.mouse.move(routePoint.x, routePoint.y);
      await page.mouse.down();
      await expect(page.locator('#map')).toHaveClass(/is-route-editing/);
      await page.mouse.move(routePoint.x + 30, routePoint.y + 30, { steps: 3 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(page.locator('#map')).not.toHaveClass(/is-route-editing/);
      await expect(page.locator('#draftStopList li')).toHaveCount(0);
      await expect(page.locator('#lineDetail')).toBeVisible();
      const targetStop = await page.locator('#lineDetail [data-edit-stop]').inputValue();
      const targetMarker = page.locator(`[data-stop-id="${targetStop}"]`).first();
      await expect(targetMarker).toBeVisible();
      const targetBox = await targetMarker.boundingBox();
      await page.mouse.move(routePoint.x, routePoint.y);
      await page.mouse.down();
      await expect(page.locator('#map')).toHaveClass(/is-route-editing/);
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator('#draftStopList li')).toHaveCount(originalStopCount + 1);
      await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(originalStops);
      await expect(page.locator('#budgetStat')).toHaveText(originalBudget);
      await page.locator('#clearSelectionButton').click();
    }
    await page.locator('[data-mode="off"]').click();

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
    await page.locator('#mobilityTitle').scrollIntoViewIfNeeded();
    await saveElementScreenshot(page.locator('.mobility-panel'), `${viewport.name}-mobility-panel`);
    await page.locator('[data-mode="queues"]').click();
    await expect(page.locator('#networkLegend')).toContainText('oczekujących');
    await page.locator('[data-mode="off"]').click();
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
    const places = await page.locator('#mobilityOrigin option').evaluateAll(options => options.map(option => option.value));
    await page.locator('#mobilityOrigin').selectOption(places[0]);
    await page.locator('#mobilityDestination').selectOption(places[1]);
    await page.locator('[data-action="diagnose-mobility"]').tap();
    await expect(page.locator('#mobilityRouteResult')).not.toContainText('Wybierz relację');
    await saveElementScreenshot(page.locator('.mobility-panel'), `${viewport.name}-mobility-panel`);
    await page.locator('[data-mode="queues"]').tap();
    await expect(page.locator('#networkLegend')).toContainText('Rozmiar punktu');
    await saveElementScreenshot(page.locator('.analytics-section'), `${viewport.name}-atlas-network`);
    await page.locator('[data-mode="cityEvolution"]').tap();
    await expect(page.locator('#cityEvolutionPanel')).toBeVisible();
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Miejsca pracy');
    await page.locator('#cityEvolutionDistrict').selectOption({ index: 1 });
    await expect(page.locator('#cityEvolutionProfile')).toContainText('Atrakcyjność gospodarcza');
    await assertNoViewportOverflow(page, viewport.width);
    await saveElementScreenshot(page.locator('#cityEvolutionPanel'), `${viewport.name}-city-evolution`);
    await page.locator('[data-mode="landUse"]').tap();
    await expect(page.locator('#landUsePanel')).toBeVisible();
    await expect(page.locator('.land-use-legend span')).toHaveCount(7);
    await page.locator('#landUseDistrict').selectOption({ index: 1 });
    await expect(page.locator('#landUseProfile')).toContainText('Dostęp transportu');
    await assertNoViewportOverflow(page, viewport.width);
    await saveElementScreenshot(page.locator('#landUsePanel'), `${viewport.name}-atlas-land-use`);
    await page.locator('[data-mode="off"]').tap();
    await page.locator('#feedbackButton').scrollIntoViewIfNeeded();
    await page.locator('#feedbackButton').click();
    await expect(page.locator('#feedbackDialog')).toBeVisible();
    await expect(page.locator('[name="includeDiagnostics"]')).not.toBeChecked();
    await page.locator('[name="category"]').selectOption('Problem z interfejsem');
    await page.locator('#feedbackForm [name="description"]').fill('Panel mieści się na telefonie.');
    await page.locator('[name="rating"]').selectOption('5');
    await page.locator('#feedbackForm button[type="submit"]').click();
    await expect(page.locator('#feedbackExport')).toBeVisible();
    const report = JSON.parse(await page.locator('#feedbackJson').inputValue());
    expect(report.gameVersion).toBe(appVersion);
    await expect(page.locator('#feedbackExport label[for="feedbackJson"]')).toContainText(appVersion);
    expect(report).not.toHaveProperty('diagnostics');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#feedbackDownload').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const downloadedReport = JSON.parse(await readFile(downloadPath, 'utf8'));
    expect(downloadedReport.category).toBe('Problem z interfejsem');
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
  const flowMode = page.locator('[data-mode="flow"]');
  if (mobile) await flowMode.tap(); else await flowMode.click();
  await expect(page.locator('#networkLegend')).toContainText('zaobserwowane obciążenie');
  await expect(page.locator('.map-wrap')).toHaveAttribute('data-analytics', 'flow');
  await saveScreenshot(page, mobile ? 'mobile-390x844-atlas-network-line' : `desktop-${viewport.width}x${viewport.height}-atlas-network-line`);
  const ordinaryMode = page.locator('[data-mode="off"]');
  if (mobile) await ordinaryMode.tap(); else await ordinaryMode.click();
  await expect(page.locator('#lineDetail')).toBeVisible();
  await expect(page.locator('.timetable-control')).toBeVisible();
  const periodRow = page.locator('[data-timetable-row="morning-peak"]');
  const frequencyOutput = periodRow.locator('[data-frequency-value]');
  await expect(frequencyOutput).toHaveText('4 kursów/h');
  await page.locator('[data-same-every-day]').uncheck();
  await page.locator('[data-service-day]').selectOption('saturday');
  const saturdaySlider = page.locator('[data-timetable-row="morning-peak"] input[type="range"]');
  await expect(saturdaySlider).toHaveAttribute('data-day-type', 'saturday');
  await saturdaySlider.focus();
  await saturdaySlider.press('Home');
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('Kursy wyłączone');
  await page.locator('[data-service-day]').selectOption('weekday');
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('4 kursów/h');
  await page.locator('[data-timetable-profile]').selectOption('economic');
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('2 kursów/h');
  const slider = periodRow.locator('input[type="range"]');
  await expect(slider).toHaveAttribute('data-day-type', 'weekday');
  await expect(slider).toHaveValue('2');
  await slider.focus();
  await slider.press('Home');
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('Kursy wyłączone');
  await expect(page.locator('[data-current-period]')).toContainText('kursy wyłączone');
  await expect(periodRow.locator('[data-period-metrics]')).toContainText('/h');
  await page.locator('[data-action="restore-timetable"]').click();
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('2 kursów/h');
  await page.locator('[data-service-day]').selectOption('sunday');
  await expect(page.locator('[data-service-day]')).toHaveValue('sunday');
  await page.locator('[data-timetable-copy-source]').selectOption('weekday');
  await expect(page.locator('[data-timetable-copy-source]')).toHaveValue('weekday');
  await page.locator('[data-action="copy-timetable-day"]').click();
  await expect(page.locator('[data-timetable-row="morning-peak"] [data-frequency-value]')).toHaveText('2 kursów/h');
  await page.locator('[data-action="toggle-special-next"]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')));
  expect(saved.version).toBe(13);
  expect(saved.state.lines[0].timetable.sameEveryDay).toBe(false);
  expect(saved.state.lines[0].timetable.profiles.saturday.periods[0].frequency).toBe(0);
  expect(saved.state.lines[0].timetable.profiles.weekday.periods[0].frequency).toBe(2);
  expect(saved.state.lines[0].timetable.profiles.sunday.periods[0].frequency).toBe(2);
  expect(saved.state.calendar.specialDays).toHaveLength(1);
  await page.locator('#timetableTitle').scrollIntoViewIfNeeded();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 8000 });
  await assertNoViewportOverflow(page, viewport.width);
  await saveScreenshot(page, mobile ? 'mobile-390x844-timetable' : `desktop-${viewport.width}x${viewport.height}-timetable`);
  expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
}

test('desktop timetable editor changes weekly service and persists schema 13', async ({ page }) => {
  await exerciseTimetable(page, { width: 1280, height: 720 }, false);
});

test('mobile timetable editor supports touch interaction and persists schema 13', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await exerciseTimetable(page, { width: 390, height: 844 }, true);
  await context.close();
});
