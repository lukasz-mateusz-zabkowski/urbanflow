import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.4.0-visual-qa');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';
async function touchCenter(page, locator) { await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' })); await page.waitForTimeout(60); const box = await locator.boundingBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); }

async function openFreshGame(page, viewport, mobile) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
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
