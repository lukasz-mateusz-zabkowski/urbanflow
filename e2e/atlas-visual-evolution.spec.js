import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifacts = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.9.0-visual-qa');
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M0 220 110 110 256 35M0 40 256 210" fill="none" stroke="#fffefa" stroke-width="12"/></svg>';

for (const scenario of [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, mobile: false },
  { name: 'mobile-390x844', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'mobile-360x800', viewport: { width: 360, height: 800 }, mobile: true }
]) {
  test(`${scenario.name}: Atlas workspaces have distinct information architecture and preserve the campaign`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.1; });
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tile }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3140/');
    await page.locator('#startKrakow').click();
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    await page.locator('#routeOptions [data-route]').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-atlas-view', 'planning');
    await page.locator('#createLineButton').click();
    await expect(page.locator('#lineList .line-item')).toHaveCount(1);
    const lineItem = page.locator('#lineList .line-item').first();
    if (!(await lineItem.getAttribute('class')).includes('selected')) await lineItem.click();
    if (scenario.mobile) await page.locator('#mobilePanelButton').click();
    await page.locator('#pauseButton').click();

    const before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, elapsedMinutes: state.elapsedMinutes, carried: state.carried,
        lines: state.lines.map(line => ({ id: line.id, stops: line.stops, vehicles: line.vehicles })),
        fleet: state.fleet, campaign: state.campaign, investments: state.investments };
    });
    await expect(page.locator('#atlasWorkspaceSummary')).toBeVisible();
    await mkdir(artifacts, { recursive: true });

    const expectations = {
      transport: ['.network-section', '#networkProblems'],
      planning: ['#buildSection', '.network-section'],
      passengers: ['.mobility-panel', '.analytics-section > .diagnostic-grid'],
      development: ['#cityEvolutionPanel'],
      operations: ['#operationsDashboard', '.fleet-section']
    };
    const workspaceEntry = {
      transport: '.network-section', planning: '#buildSection', passengers: '.analytics-section',
      development: '.analytics-section', operations: '.analytics-section'
    };
    for (const [view, visibleSelectors] of Object.entries(expectations)) {
      const tab = page.locator(`[data-action="atlas-view"][data-view="${view}"]`);
      await page.evaluate(viewId => { window.__atlasWorkspaceButton = document.querySelector(`[data-action="atlas-view"][data-view="${viewId}"]`); }, view);
      if (view === 'development') {
        await tab.focus();
        await tab.press('Enter');
      } else {
        await tab.click();
      }
      expect(await page.evaluate(() => window.__atlasWorkspaceButton === document.querySelector(`[data-action="atlas-view"][data-view="${document.documentElement.dataset.atlasView}"]`)))
        .toBeTruthy();
      await expect(page.locator('html')).toHaveAttribute('data-atlas-view', view);
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#atlasWorkspaceTitle')).toBeVisible();
      await expect(page.locator('#atlasWorkspaceSummary')).not.toBeEmpty();
      for (const selector of visibleSelectors) await expect(page.locator(selector)).toBeVisible();
      const primaryBeforeCampaign = await page.evaluate(selector => {
        const primary = document.querySelector(selector);
        const campaign = document.querySelector('.campaign-card');
        return Boolean(primary && campaign && (primary.compareDocumentPosition(campaign) & Node.DOCUMENT_POSITION_FOLLOWING));
      }, workspaceEntry[view]);
      expect(primaryBeforeCampaign, `${view} tools should precede shared campaign guidance`).toBeTruthy();
      await expect(page.locator('#tutorialCard')).toBeAttached();
      if (view !== 'planning') await expect(page.locator('#buildSection')).toBeHidden();
      if (view !== 'operations') await expect(page.locator('#operationsDashboard')).toBeHidden();
      if (view !== 'passengers') await expect(page.locator('.mobility-panel')).toBeHidden();
      if (view !== 'development') await expect(page.locator('#cityEvolutionPanel')).toBeHidden();
      await expect(page.locator('#lineList .line-item.selected')).toHaveCount(1);
      const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
      expect(widths.body).toBeLessThanOrEqual(scenario.viewport.width);
      expect(widths.page).toBeLessThanOrEqual(scenario.viewport.width);
      await page.screenshot({ path: join(artifacts, `${scenario.name}-${view}.png`), animations: 'disabled' });
    }

    await page.locator('[data-action="atlas-view"][data-view="development"]').click();
    await page.evaluate(() => { window.__atlasAnalyticsButton = document.querySelector('[data-action="analytics-mode"][data-mode="landUse"]'); });
    await page.locator('[data-action="analytics-mode"][data-mode="landUse"]').click();
    expect(await page.evaluate(() => window.__atlasAnalyticsButton === document.querySelector('[data-action="analytics-mode"][data-mode="landUse"]')))
      .toBeTruthy();
    await expect(page.locator('#landUsePanel')).toBeVisible();
    await page.screenshot({ path: join(artifacts, `${scenario.name}-development-landuse.png`), animations: 'disabled' });
    await page.locator('[data-action="analytics-mode"][data-mode="investments"]').click();
    await expect(page.locator('#investmentsPanel')).toBeVisible();
    await page.screenshot({ path: join(artifacts, `${scenario.name}-development-investments.png`), animations: 'disabled' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.locator('.atlas-workspace-summary').evaluate(element => getComputedStyle(element).transitionDuration);
    expect(duration.split(',').every(value => Number.parseFloat(value) <= 0.001)).toBeTruthy();
    const animation = await page.locator('.atlas-workspace-summary').evaluate(element => getComputedStyle(element).animationName);
    expect(animation).toBe('none');

    const after = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('urbanflow.krakow.v2')).state;
      return { budget: state.budget, elapsedMinutes: state.elapsedMinutes, carried: state.carried,
        lines: state.lines.map(line => ({ id: line.id, stops: line.stops, vehicles: line.vehicles })),
        fleet: state.fleet, campaign: state.campaign, investments: state.investments };
    });
    expect(after).toEqual(before);
    expect(errors).toEqual([]);
  });
}
