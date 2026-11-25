import { test, expect } from '@playwright/test';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/></svg>';

test('optional gameplay report uses local allowlisted campaign data and never uploads it', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
  const uploads = [];
  const errors = [];
  page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3140/');
  await page.locator('[data-start-campaign="recovery"]').click();
  await expect(page.locator('#game')).not.toHaveClass(/is-hidden/);
  await page.locator('#routeOptions [data-route]').first().click();
  await page.locator('#createLineButton').click();
  await expect(page.locator('#lineList .line-item')).toHaveCount(1);
  await page.locator('[data-action="atlas-view"][data-view="operations"]').click();
  await expect(page.locator('#gameplayDecisionJournal')).toContainText('Budowa linii');
  await page.locator('#feedbackButton').click();
  await page.locator('[name="testerId"]').fill('private-tester-42');
  await page.locator('[name="category"]').selectOption({ label: 'Ocena pierwszej rozgrywki' });
  await page.locator('[name="rating"]').selectOption('4');
  await page.locator('#feedbackForm [name="description"]').fill('Zrozumiałem planowanie po podglądzie kosztów.');
  await page.locator('#feedbackSessionReport').click();
  const report = JSON.parse(await page.locator('#feedbackJson').inputValue());
  expect(report.reportType).toBe('urbanflow-gameplay-session');
  expect(report.scenarioId).toBe('recovery');
  expect(report.gameVersion).toMatch(/1\.11\.0-alpha/);
  expect(report.metrics.activeLines).toBe(1);
  expect(report.decisions.some(item => item.type === 'lineConstruction' && item.actualCost > 0)).toBe(true);
  expect(report.feedback.rating).toBe(4);
  const json = JSON.stringify(report);
  for (const forbidden of ['private-tester-42', 'userAgent', 'deviceId', 'rngState', 'localStorage', 'errorMessage']) {
    expect(json).not.toContain(forbidden);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#feedbackDownload').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^urbanflow-session-\d{4}-\d{2}-\d{2}\.json$/);
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});
