import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.4.0-visual-qa');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';
async function touchCenter(page, locator) { await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' })); await page.waitForTimeout(60); const box = await locator.boundingBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); }

async function openFreshGame(page, viewport, mobile) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => { Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#buildBadge')).toContainText('ALPHA TEST');
  if (mobile) await page.locator('#startKrakow').tap(); else await page.locator('#startKrakow').click();
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  if (mobile) { await page.locator('#mobilePanelButton').tap(); await expect(page.locator('#buildPanel')).toHaveClass(/open/); await page.waitForTimeout(300); }
  await expect(page.locator('#tutorialProgress')).toHaveAttribute('aria-valuemax', '12');
  await expect(page.locator('#tutorialProgressCopy')).toContainText('0 z 12');
  return errors;
}
async function assertNoOverflow(page, width) {
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.body).toBeLessThanOrEqual(width);
  expect(dimensions.document).toBeLessThanOrEqual(width);
}

async function openLineDetails(page) {
  const row = page.locator('#lineList .line-item').first();
  if (await row.getAttribute('aria-expanded') === 'true') await row.click();
  await row.click();
}

async function exploreMap(page, mobile = false) {
  if (mobile && await page.locator('#buildPanel').evaluate(panel => panel.classList.contains('open'))) {
    await page.locator('#panelClose').tap();
  }
  const marker = page.locator('#map .node-icon').first();
  if (mobile) await marker.tap(); else await marker.click();
}

for (const scenario of [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, mobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true }
]) {
  test(`state-driven onboarding, campaign clarity, privacy-first feedback and screenshot (${scenario.name})`, async ({ page, browser }) => {
    const context = scenario.mobile ? await browser.newContext({ viewport: scenario.viewport, screen: scenario.viewport, isMobile: true, hasTouch: true }) : null;
    const activePage = context ? await context.newPage() : page;
    try {
    const errors = await openFreshGame(activePage, scenario.viewport, scenario.mobile);
    await expect(activePage.locator('#tutorialTitle')).toContainText('Poznaj mapę');
    await expect(activePage.locator('#campaignOverview')).toContainText('Przeszkoda');
    await mkdir(artifacts, { recursive: true });
    await activePage.screenshot({ path: join(artifacts, `onboarding-${scenario.name}-start.png`), fullPage: false, animations: 'disabled' });
    await activePage.locator('#tutorialSkip').click();
    await expect(activePage.locator('#tutorialProgressCopy')).toContainText('pominięto');
    await activePage.locator('#tutorialRestart').click();
    await expect(activePage.locator('#tutorialTitle')).toContainText('Poznaj mapę');

    if (scenario.mobile) await activePage.locator('#buildPanel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await activePage.locator('#feedbackButton').scrollIntoViewIfNeeded();
    if (scenario.mobile) await touchCenter(activePage, activePage.locator('#feedbackButton')); else await activePage.locator('#feedbackButton').click();
    await activePage.locator('#feedbackForm [name="category"]').selectOption('Ocena pierwszej rozgrywki');
    await activePage.locator('#feedbackForm [name="rating"]').selectOption('5');
    await activePage.locator('#feedbackForm [name="description"]').fill('Pierwsza sesja jest zrozumiała.');
    await activePage.locator('#feedbackForm button[type="submit"]').click();
    const report = JSON.parse(await activePage.locator('#feedbackJson').inputValue());
    expect(report.gameVersion).toBe('1.4.0-alpha');
    expect(report.context).toBeUndefined();
    expect(report.diagnostics).toBeUndefined();
    await activePage.locator('#feedbackClose').click();
    await assertNoOverflow(activePage, scenario.viewport.width);
    await mkdir(artifacts, { recursive: true });
    await activePage.screenshot({ path: join(artifacts, `onboarding-${scenario.name}-feedback.png`), fullPage: false, animations: 'disabled' });
    expect(errors).toEqual([]);
    } finally { await context?.close(); }
  });
}

test('context and diagnostic data are attached only after separate explicit consent', async ({ page }) => {
  await openFreshGame(page, { width: 1280, height: 720 }, false);
  await page.locator('#feedbackButton').click();
  await page.locator('#feedbackForm [name="category"]').selectOption('Błąd');
  await page.locator('#feedbackForm [name="rating"]').selectOption('3');
  await page.locator('#feedbackForm [name="description"]').fill('Test dobrowolnego kontekstu.');
  await page.locator('#feedbackForm [name="includeContext"]').check();
  await page.locator('#feedbackForm button[type="submit"]').click();
  const report = JSON.parse(await page.locator('#feedbackJson').inputValue());
  expect(report.context.device).toBe('desktop');
  expect(report.context.resolution).toBe('1280x720');
  expect(report.diagnostics).toBeUndefined();
});

test('a first-time player completes all 12 tutorial steps through the game interface and resumes after reload', async ({ page }) => {
  test.setTimeout(180000);
  const startedAt = Date.now();
  await openFreshGame(page, { width: 1366, height: 768 }, false);
  const progress = page.locator('#tutorialProgress');
  const budgetBeforePlan = await page.locator('#budgetStat').innerText();
  await exploreMap(page);
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await page.locator('#clearSelectionButton').click();
  await expect(page.locator('#routeOptions button').first()).toBeVisible();

  // Selecting an offered starter route is a real in-game route choice. It selects
  // the stops and opens the normal route/cost preview; no tutorial state is seeded.
  await page.locator('#routeOptions [data-route]').first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.preferences.tutorialActions.firstGoal)).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.preferences.tutorialActions.busPlanned)).toBe(true);
  await page.locator('#lineDecisionSummary').scrollIntoViewIfNeeded();
  await expect(progress).toHaveAttribute('aria-valuenow', '4');
  expect(await page.locator('#previewCost').innerText()).not.toBe('—');
  expect(await page.locator('#budgetStat').innerText()).toBe(budgetBeforePlan);

  await page.locator('#createLineButton').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '5');
  await page.locator('#speedButton').click();
  await page.locator('#speedButton').click();
  await expect.poll(async () => Number((await page.locator('#timeStat').innerText()).match(/\d+/)?.[0] || 0), { timeout: 15000 }).toBeGreaterThan(0);
  await expect(progress).toHaveAttribute('aria-valuenow', '6');
  await expect.poll(async () => Number((await page.locator('#carriedStat').innerText()).replace(/\D/g, '') || 0), { timeout: 120000, intervals: [200, 500, 1000] }).toBeGreaterThan(0);
  await expect(progress).toHaveAttribute('aria-valuenow', '7');

  await openLineDetails(page);
  await expect(page.locator('#lineDetail')).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '8');
  await page.locator('#analyticsModes [data-mode="queues"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '9');
  await page.locator('#lineDetail [data-action="unassign-vehicle"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '10');
  await page.locator('#analyticsModes [data-mode="cityEvolution"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '11');
  await page.locator('#analyticsModes [data-mode="investments"]').click();
  await expect(progress).toHaveAttribute('aria-valuenow', '12');
  await expect(page.locator('#tutorialTitle')).toContainText('Samouczek ukończony');
  await page.locator('#pauseButton').click();
  await expect(page.locator('#trafficStatus')).toContainText('Pauza');
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'onboarding-desktop-completed.png'), fullPage: false, animations: 'disabled' });

  const savedBeforeReload = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    return { budget: save.state.budget, lines: save.state.lines.length, carried: save.state.carried, version: save.version };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#map.leaflet-container').waitFor({ state: 'visible' });
  await expect(page.locator('#tutorialProgress')).toHaveAttribute('aria-valuenow', '12');
  const savedAfterReload = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    return { budget: save.state.budget, lines: save.state.lines.length, carried: save.state.carried, version: save.version };
  });
  expect(savedAfterReload).toEqual(savedBeforeReload);
  console.log(`Full onboarding session: ${((Date.now() - startedAt) / 1000).toFixed(1)}s; carried ${savedAfterReload.carried}; schema ${savedAfterReload.version}.`);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`mobile onboarding route preview, build, detail navigation and purchase cancellation (${viewport.width}x${viewport.height})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, screen: viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await openFreshGame(page, viewport, true);
      await assertNoOverflow(page, viewport.width);
      const budgetBeforePlan = await page.locator('#budgetStat').innerText();
      await exploreMap(page, true);
      await expect(page.locator('#tutorialProgress')).toHaveAttribute('aria-valuenow', '1');
      await page.locator('#clearSelectionButton').tap();
      await page.locator('#panelClose').tap();
      await page.locator('#routeOptions [data-route]').first().tap();
      await page.locator('#lineDecisionSummary').scrollIntoViewIfNeeded();
      await expect(page.locator('#tutorialProgress')).toHaveAttribute('aria-valuenow', '4');
      expect(await page.locator('#budgetStat').innerText()).toBe(budgetBeforePlan);
      await page.locator('#createLineButton').tap();
      await expect(page.locator('#tutorialProgress')).toHaveAttribute('aria-valuenow', '5');
      await page.locator('#mobilePanelButton').tap();
      await expect(page.locator('#buildPanel')).toHaveClass(/open/);
      await page.locator('#pauseButton').tap();
      const budgetBeforeCancel = await page.locator('#budgetStat').innerText();
      await touchCenter(page, page.locator('#fleetList [data-action="purchase-fleet"]').first());
      await expect(page.locator('dialog.confirm-dialog')).toBeVisible();
      await page.locator('dialog.confirm-dialog .secondary-button').tap();
      await expect(page.locator('dialog.confirm-dialog')).toHaveCount(0);
      expect(await page.locator('#budgetStat').innerText()).toBe(budgetBeforeCancel);
      const lineRow = page.locator('#lineList .line-item').first();
      if (await lineRow.getAttribute('aria-expanded') === 'true') await touchCenter(page, lineRow);
      await touchCenter(page, lineRow);
      await expect(page.locator('#lineDetail')).toBeVisible();
      await assertNoOverflow(page, viewport.width);
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({ path: join(artifacts, `onboarding-mobile-line-details-${viewport.width}.png`), fullPage: false, animations: 'disabled' });
    } finally { await context.close(); }
  });
}
