import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = join(tmpdir(), 'urbanflow-alpha-1.3.0-visual-qa');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

async function openGame(page, viewport, mobile) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  if (mobile) await page.locator('#startKrakow').tap(); else await page.locator('#startKrakow').click();
  await expect(page.locator('#map')).toBeVisible();
  if (mobile) { await page.locator('#mobilePanelButton').tap(); await expect(page.locator('#buildPanel')).toHaveClass(/open/); }
  await expect(page.locator('[data-mode="investments"]')).toBeVisible();
  if (mobile) await page.locator('[data-mode="investments"]').tap(); else await page.locator('[data-mode="investments"]').click();
  await expect(page.locator('#investmentsPanel')).toBeVisible();
  const firstArea = await page.locator('#investmentDistrict option').first().getAttribute('value');
  await page.locator('#investmentDistrict').selectOption(firstArea);
  return errors;
}

async function lifecycle(page, viewport, mobile) {
    const errors = await openGame(page, viewport, mobile);
    const plan = page.locator('[data-action="plan-investment"][data-investment-type="housing"]');
    if (mobile) await plan.tap(); else { await plan.focus(); await page.keyboard.press('Enter'); }
    await expect(page.locator('#investmentProjectList')).toContainText('plan');
    if (mobile) await page.locator('[data-action="approve-investment"]').tap();
    else { await page.locator('[data-action="approve-investment"]').focus(); await page.keyboard.press('Enter'); }
    await expect(page.locator('#investmentProjectList')).toContainText('realizacja');
    await expect(page.locator('#investmentProjectList')).toContainText('Anuluj');
    await mkdir(artifacts, { recursive: true });
    await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 8000 });
    await page.locator('#investmentsPanel').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: join(artifacts, `investments-${viewport.width}x${viewport.height}.png`), fullPage: false, animations: 'disabled' });
    if (mobile) await page.locator('[data-action="cancel-investment"]').tap();
    else { await page.locator('[data-action="cancel-investment"]').focus(); await page.keyboard.press('Enter'); }
    await expect(page.locator('#investmentProjectList')).toContainText('anulowano');
    const bounds = await page.evaluate(() => ({ body: document.body.scrollWidth, doc: document.documentElement.scrollWidth }));
    expect(bounds.body).toBeLessThanOrEqual(viewport.width);
    expect(bounds.doc).toBeLessThanOrEqual(viewport.width);
    expect(errors).toEqual([]);
}

test('investment project lifecycle desktop 1366x768', async ({ page }) => {
  await lifecycle(page, { width: 1366, height: 768 }, false);
});

test('investment project lifecycle touch mobile 390x844', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try { await lifecycle(await context.newPage(), { width: 390, height: 844 }, true); }
  finally { await context.close(); }
});

test('completed project panel shows saved modeled results after campaign reload', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('urbanflow-test-fresh')) {
      localStorage.clear();
      sessionStorage.setItem('urbanflow-test-fresh', '1');
    }
    Math.random = () => 0.1;
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  await page.locator('#startKrakow').click();
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('[data-mode="investments"]').click();
  await expect(page.locator('#investmentsPanel')).toBeVisible();
  const firstArea = await page.locator('#investmentDistrict option').first().getAttribute('value');
  await page.locator('#investmentDistrict').selectOption(firstArea);
  await page.locator('[data-action="plan-investment"][data-investment-type="housing"]').click();
  await page.locator('[data-action="approve-investment"]').click();
  await page.locator('#pauseButton').click();

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('urbanflow.krakow.v2'));
    const state = save.state;
    state.investments.nextId = 101;
    state.investments.history.push({ id: 'investment-100', type: 'housing', districtId: state.investments.projects[0].districtId,
      status: 'completed', cost: 0, refund: 0, at: state.elapsedMinutes, week: 1,
      expected: { residentsCapacity: 12000, jobsCapacity: 5000, transportHandling: 1 },
      result: { residents: 11800, jobs: 5100, residentsCapacity: 14500, jobsCapacity: 5300, transportHandling: 1 } });
    localStorage.setItem('urbanflow.krakow.v2', JSON.stringify(save));
  });
  const resumedPage = await page.context().newPage();
  await resumedPage.setViewportSize({ width: 1366, height: 768 });
  await resumedPage.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const resumedErrors = [];
  resumedPage.on('pageerror', error => resumedErrors.push(error.message));
  await resumedPage.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  const restoredHistory = await resumedPage.evaluate(() => JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state.investments.history);
  expect(restoredHistory.some(item => item.id === 'investment-100')).toBe(true);
  const storageError = await resumedPage.evaluate(async () => {
    const [{ loadGame }, { CITIES }] = await Promise.all([import('/js/storage.js?v=13'), import('/js/cities.js?v=11')]);
    return loadGame(localStorage, CITIES.krakow).error;
  });
  expect(storageError).toBe(null);
  await expect(resumedPage.locator('#map')).toBeVisible({ timeout: 60_000 });
  await resumedPage.locator('[data-mode="investments"]').click();
  await expect(resumedPage.locator('#investmentProjectList')).toContainText(/pojemność mieszkaniowa\s+14.?500/);
  await expect(resumedPage.locator('#investmentProjectList')).toContainText(/Δ\s+2500/);
  expect(errors).toEqual([]);
  expect(resumedErrors).toEqual([]);
});
