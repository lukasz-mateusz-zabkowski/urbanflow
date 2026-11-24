import { test, expect } from '@playwright/test';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';

test('timetable and investment drafts survive workspace changes; cancelling confirmation leaves finances untouched', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded' });
  await page.locator('#startKrakow').click();
  await expect(page.locator('#map.leaflet-container')).toBeVisible();

  await page.locator('#routeOptions [data-route]').first().click();
  await page.locator('#createLineButton').click();
  await expect(page.locator('#lineList .line-item')).toHaveCount(1);
  await page.locator('#pauseButton').click();
  await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
  const frequency = page.locator('[data-timetable-row="morning-peak"] input[type="range"]');
  await frequency.focus();
  await frequency.press('Home');
  const plannedFrequency = await frequency.inputValue();
  expect(plannedFrequency).toBe('0');

  await page.locator('[data-action="atlas-view"][data-view="operations"]').click();
  await page.locator('[data-action="atlas-view"][data-view="planning"]').click();
  await expect(page.locator('[data-timetable-row="morning-peak"] input[type="range"]')).toHaveValue(plannedFrequency);

  await page.locator('[data-action="atlas-view"][data-view="development"]').click();
  await page.locator('[data-mode="investments"]').click();
  const district = await page.locator('#investmentDistrict option').first().getAttribute('value');
  await page.locator('#investmentDistrict').selectOption(district);
  await page.locator('[data-action="plan-investment"][data-investment-type="housing"]').click();
  await expect(page.locator('#investmentProjectList')).toContainText('plan');
  await page.locator('[data-action="atlas-view"][data-view="passengers"]').click();
  await page.locator('[data-action="atlas-view"][data-view="development"]').click();
  await page.locator('[data-mode="investments"]').click();
  await expect(page.locator('#investmentProjectList')).toContainText('plan');

  const budgetBefore = await page.locator('#budgetStat').textContent();
  await page.locator('[data-action="approve-investment"]').click();
  await expect(page.locator('dialog.confirm-dialog')).toBeVisible();
  await expect(page.locator('#budgetStat')).toHaveText(budgetBefore);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.confirm-dialog')).toHaveCount(0);
  await expect(page.locator('#budgetStat')).toHaveText(budgetBefore);
  await expect(page.locator('#investmentProjectList')).toContainText('plan');

  await page.locator('[data-action="approve-investment"]').click();
  await page.locator('dialog.confirm-dialog .primary-button').click();
  await expect(page.locator('#investmentProjectList')).toContainText('realizacja');
  expect(await page.locator('#budgetStat').textContent()).not.toBe(budgetBefore);
  expect(errors).toEqual([]);
});
