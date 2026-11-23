import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.env.UF_LIVE_OSM_URL || 'http://127.0.0.1:3104/';
const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.5.0-atlas');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const responses = [];
const errors = [];
page.on('response', response => {
  if (response.url().startsWith('https://tile.openstreetmap.org/')) responses.push({ status: response.status(), url: response.url() });
});
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#startKrakow').click();
  await page.locator('#map.leaflet-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('img.leaflet-tile-loaded')]
    .some(image => image.src.startsWith('https://tile.openstreetmap.org/') && image.complete && image.naturalWidth > 0), null, { timeout: 20000 });
  const rendered = await page.evaluate(() => [...document.querySelectorAll('img.leaflet-tile-loaded')]
    .filter(image => image.src.startsWith('https://tile.openstreetmap.org/') && image.complete && image.naturalWidth > 0)
    .map(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight })));
  await mkdir(artifactDir, { recursive: true });
  const screenshot = join(artifactDir, 'desktop-live-osm-1366x768.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  const result = { version: await (await page.request.get(`${new URL(baseUrl).origin}/health`)).json(), renderedTileCount: rendered.length,
    uniqueTileRequests: new Set(responses.map(item => item.url)).size, successfulTileResponses: responses.filter(item => item.status === 200).length,
    non200TileResponses: responses.filter(item => item.status !== 200), exampleTile: rendered[0]?.src, screenshot, pageErrors: errors };
  if (!rendered.length || result.successfulTileResponses < 1 || errors.length) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
