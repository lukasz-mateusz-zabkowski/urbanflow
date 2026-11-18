import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.2.1-routing-qa');

test('mobile finger drag inserts a stop into the selected route segment and leaves the line uncommitted', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  await page.locator('#startKrakow').tap();
  await expect(page.locator('#map.leaflet-container')).toBeVisible({ timeout: 30000 });
  await page.locator('#routeOptions button').first().tap();
  await expect(page.locator('#createLineButton')).toBeEnabled();
  await page.locator('#createLineButton').tap();
  const selector = page.locator('#lineList [data-action="select-line"]').first();
  if (await selector.getAttribute('aria-expanded') !== 'true') {
    await selector.scrollIntoViewIfNeeded();
    await selector.tap();
  }
  await page.locator('#pauseButton').tap();
  await expect(page.locator('#lineDetail [data-action="insert-stop-line"]')).toBeVisible();
  // Re-select through the same delegated UI action so the map exposes hit paths
  // after the mobile panel has closed/reopened during line construction.
  await selector.evaluate(element => element.click());
  await selector.evaluate(element => element.click());
  const beforeStops = await page.locator('#lineDetail [data-detail="route"]').innerText();
  const beforeBudget = await page.locator('#budgetStat').innerText();
  const handle = page.locator('.route-segment-hit').first();
  await expect(handle).toBeVisible();
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
  if (await panelClose.isVisible()) await panelClose.evaluate(element => element.click());
  for (let zoom = 0; zoom < 4; zoom += 1) await page.locator('.leaflet-control-zoom-in').tap();
  const routePoint = await handle.evaluate(element => {
    const total = element.getTotalLength(), matrix = element.getScreenCTM();
    for (const ratio of [0.28, 0.38, 0.48, 0.58, 0.68, 0.78]) {
      const point = element.getPointAtLength(total * ratio);
      const svgPoint = element.ownerSVGElement.createSVGPoint(); svgPoint.x = point.x; svgPoint.y = point.y;
      const screen = svgPoint.matrixTransform(matrix);
      if (document.elementFromPoint(screen.x, screen.y)?.closest('.route-segment-hit')) return { x: screen.x, y: screen.y };
    }
    throw new Error('Could not find an unobstructed point on the selected route segment.');
  });

  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.__routeTouchEvents = [];
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) document.addEventListener(type, event => window.__routeTouchEvents.push({ type, pointerType: event.pointerType, target: event.target.className?.baseVal || event.target.className }), true);
  });
  const touch = (x, y) => ({ x: Math.round(x), y: Math.round(y), radiusX: 10, radiusY: 10, force: 1, id: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(routePoint.x, routePoint.y)] });
  await expect.poll(() => page.evaluate(() => window.__routeTouchEvents.some(event =>
    ['pointerdown', 'touchstart'].includes(event.type) && String(event.target).includes('route-segment-hit')))).toBe(true);
  await expect(page.locator('#map')).toHaveClass(/is-route-editing/);
  const target = page.locator(`.route-drag-target[data-stop-id="${targetId}"]`);
  await expect(target).toBeAttached();
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  for (let step = 1; step <= 10; step += 1) {
    const ratio = step / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(
      routePoint.x + (targetBox.x + targetBox.width / 2 - routePoint.x) * ratio,
      routePoint.y + (targetBox.y + targetBox.height / 2 - routePoint.y) * ratio)] });
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
