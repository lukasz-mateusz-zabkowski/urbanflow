import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { attachStops, CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { registerRoutingGraph } from '../public/js/routing.js?v=14';
import { SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.2.1-routing-qa');
const routeIds = ['s-stradom', 's-kazimierz', 's-plac-wolnica', 's-dietla', 's-podgorze', 's-plac-bohaterow-getta', 's-rynek-podgorski'];
const stopData = JSON.parse(await readFile(new URL('../public/data/krakow-stops.json', import.meta.url), 'utf8')).stops;
const graphManifest = JSON.parse(await readFile(new URL('../public/data/routing/krakow.json', import.meta.url), 'utf8'));
registerRoutingGraph('krakow', graphManifest, gunzipSync(await readFile(new URL('../public/data/routing/krakow-road-graph.bin.gz', import.meta.url))));

function preparedTouchCampaign() {
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopData);
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka' });
  game.state.budget = 50_000_000; game.state.unlockedPointLevel = 2;
  game.state.revealedStops = city.points.filter(point => point.type === 'stop').map(point => point.id);
  const starter = game.chooseStarterRoute('starter-local');
  if (!starter.ok) throw new Error(`Could not prepare deterministic touch campaign: ${starter.message}`);
  game.state.budget = 50_000_000;
  const built = game.editLine(starter.line.id, routeIds);
  if (!built.ok) throw new Error(`Could not prepare deterministic touch route: ${built.message}`);
  game.state.budget = 50_000_000; game.state.paused = true;
  return { version: SAVE_VERSION, cityId: 'krakow', savedAt: 0, state: game.state };
}
const save = preparedTouchCampaign();

test('mobile finger drag inserts a stop into the selected route segment and leaves the line uncommitted', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); Math.random = () => 0.1; },
    { key: SAVE_KEY, value: JSON.stringify(save) });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible({ timeout: 30000 });
  if (await page.locator('#mobilePanelButton').getAttribute('aria-expanded') !== 'true') await page.locator('#mobilePanelButton').tap();
  const selector = page.locator('#lineList [data-action="select-line"]').first();
  await expect(selector).toBeVisible();
  if (await selector.getAttribute('aria-expanded') !== 'true') {
    await selector.scrollIntoViewIfNeeded();
    await selector.tap();
  }
  await expect(page.locator('#lineDetail [data-action="insert-stop-line"]')).toBeVisible();
  // Keep the line selected while the mobile panel opens/closes. Re-dispatching
  // clicks to a stale list element can toggle selection off after the list is
  // re-rendered and remove the route's drag hit paths.
  if (await selector.getAttribute('aria-expanded') !== 'true') await selector.tap();
  await expect(selector).toHaveAttribute('aria-expanded', 'true');
  const beforeStops = await page.locator('#lineDetail [data-detail="route"]').innerText();
  const beforeBudget = await page.locator('#budgetStat').innerText();
  const targetId = await page.evaluate(async () => {
    const save = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    const route = save.state.lines.find(line => line.id === document.querySelector('#lineDetail [data-action="insert-stop-line"]').dataset.line);
    const geometry = route.routeGeometry;
    const stops = (await (await fetch('/data/krakow-stops.json')).json()).stops;
    const options = [...document.querySelectorAll('#lineDetail [data-edit-stop] option')].map(option => option.value);
    const project = (point, latitude) => [point[1] * Math.cos(latitude * Math.PI / 180), point[0]];
    const distance = (point, a, b) => {
      const latitude = (a[0] + b[0]) / 2, p = project([point.lat, point.lng], latitude);
      const pa = project(a, latitude), pb = project(b, latitude), dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      const ratio = Math.max(0, Math.min(1, ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - pa[0] - ratio * dx, p[1] - pa[1] - ratio * dy) * 111.2;
    };
    const candidates = options.map(id => stops.find(stop => stop.id === id)).filter(Boolean).map(stop => ({
      id: stop.id,
      gap: Math.min(...geometry.slice(1).map((point, index) => distance(stop, geometry[index], point)))
    })).sort((a, b) => a.gap - b.gap);
    if (!candidates.length || candidates[0].gap > 0.25) throw new Error(`No discovered stop lies within the 250 m insertion radius: ${JSON.stringify(candidates.slice(0, 3))}`);
    return candidates[0].id;
  });
  await page.locator('#lineDetail [data-edit-stop]').selectOption(targetId);
  const panelClose = page.locator('#panelClose');
  if (await panelClose.isVisible()) await panelClose.tap();
  await expect.poll(() => page.locator('#panelScrim').evaluate(element => element.classList.contains('open'))).toBe(false);
  await page.evaluate(() => {
    const originalSetView = L.Map.prototype.setView;
    L.Map.prototype.setView = function (...args) {
      window.__urbanflowTestMap = this;
      return originalSetView.apply(this, args);
    };
  });
  await page.locator('#mobileCenterButton').tap();
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => {
    if (!window.__urbanflowTestMap) throw new Error('The visible map did not expose its Leaflet view during recentering.');
    window.__urbanflowTestMap.setView([50.05, 19.95], 14, { animate: false });
  });
  const touch = (x, y) => ({ x, y, radiusX: 10, radiusY: 10, force: 1, id: 1 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (let zoom = 0; zoom < 2; zoom += 1) {
    await page.locator('.leaflet-control-zoom-in').tap();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await expect(page.locator('#map .leaflet-map-pane')).not.toHaveClass(/leaflet-zoom-anim/);
  await page.evaluate(() => {
    window.__urbanflowTestMap.invalidateSize({ pan: false, animate: false });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.route-segment-hit').first()).toBeVisible();
  const routePoint = await page.locator('.route-segment-hit').evaluateAll(elements => {
    for (const element of elements) {
      const total = element.getTotalLength(), matrix = element.getScreenCTM();
      for (let sample = 1; sample < 20; sample += 1) {
        const point = element.getPointAtLength(total * sample / 20);
        const svgPoint = element.ownerSVGElement.createSVGPoint(); svgPoint.x = point.x; svgPoint.y = point.y;
        const screen = svgPoint.matrixTransform(matrix);
        if (document.elementFromPoint(screen.x, screen.y)?.closest('.route-segment-hit') === element) {
          return { x: screen.x, y: screen.y, segmentIndex: Number(element.dataset.segmentIndex) };
        }
      }
    }
    throw new Error('No exposed route-segment touch target exists after closing the mobile panel and zooming in.');
  });

  await page.evaluate(() => {
    window.__routeTouchEvents = [];
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) document.addEventListener(type, event => window.__routeTouchEvents.push({ type, pointerType: event.pointerType, target: event.target.className?.baseVal || event.target.className }), true);
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(routePoint.x, routePoint.y)] });
  await expect.poll(() => page.evaluate(() => window.__routeTouchEvents.some(event =>
    ['pointerdown', 'touchstart'].includes(event.type) && String(event.target).includes('route-segment-hit')))).toBe(true);
  await expect(page.locator('#map')).toHaveClass(/is-route-editing/);
  const target = page.locator(`.route-drag-target[data-stop-id="${targetId}"]`);
  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  const stop = stopData.find(item => item.id === targetId);
  const targetPoint = await page.evaluate(({ lat, lng }) => {
    const map = window.__urbanflowTestMap, container = map.getContainer(), bounds = container.getBoundingClientRect();
    const point = map.latLngToContainerPoint([lat, lng]);
    return { x: bounds.left + point.x, y: bounds.top + point.y, left: bounds.left, right: bounds.right,
      top: bounds.top, bottom: bounds.bottom };
  }, { lat: stop.lat, lng: stop.lng });
  expect(targetPoint.x).toBeGreaterThanOrEqual(targetPoint.left);
  expect(targetPoint.x).toBeLessThanOrEqual(targetPoint.right);
  expect(targetPoint.y).toBeGreaterThanOrEqual(targetPoint.top);
  expect(targetPoint.y).toBeLessThanOrEqual(targetPoint.bottom);
  const renderedTargetGapMeters = await page.evaluate(({ x, y, lat, lng }) => {
    const map = window.__urbanflowTestMap, bounds = map.getContainer().getBoundingClientRect();
    const rendered = map.containerPointToLatLng([x - bounds.left, y - bounds.top]);
    return map.distance(rendered, [lat, lng]);
  }, { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2, lat: stop.lat, lng: stop.lng });
  expect(renderedTargetGapMeters).toBeLessThan(250);
  for (let step = 1; step <= 10; step += 1) {
    const ratio = step / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(
      routePoint.x + (targetPoint.x - routePoint.x) * ratio,
      routePoint.y + (targetPoint.y - routePoint.y) * ratio)] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#map')).not.toHaveClass(/is-route-editing/);
  await expect(page.locator('#draftStopList li')).toHaveCount(beforeStops.split(' → ').length + 1);
  await expect(page.locator('#lineDetail [data-detail="route"]')).toHaveText(beforeStops);
  await expect(page.locator('#budgetStat')).toHaveText(beforeBudget);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'mobile-390x844-touch-route-insertion.png'), fullPage: false, animations: 'disabled' });
  expect(errors, `browser errors: ${errors.join('; ')}`).toEqual([]);
  await context.close();
});
