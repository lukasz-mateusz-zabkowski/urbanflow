import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-1.2.1-routing-qa');
const routeIds = ['s-stradom', 's-kazimierz', 's-plac-wolnica', 's-dietla', 's-podgorze', 's-plac-bohaterow-getta', 's-rynek-podgorski'];

for (const viewport of [{ width: 1280, height: 720, name: 'desktop-1280x720' }, { width: 390, height: 844, name: 'mobile-390x844' }]) {
  test(`local OSM seven-stop route visual review ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (process.env.CI) await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee4"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200" fill="none" stroke="#fffefa" stroke-width="12"/><path d="M-20 210 90 120 180 80 280 10M-20 40 100 110 270 200" fill="none" stroke="#c8d3c4" stroke-width="2"/></svg>' }));
    await page.goto('http://127.0.0.1:3100/');
    await page.setContent(`<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"><style>html,body,#map{height:100%;margin:0}body{font:14px system-ui;background:#e9eee4}.qa-title{position:absolute;z-index:1000;top:12px;left:52px;background:#10251e;color:white;padding:10px 14px;border-radius:8px}.route-number{display:grid;place-items:center;width:28px;height:28px;border:2px solid white;border-radius:50%;background:#207252;color:white;font-weight:800;box-shadow:0 2px 8px #10251e88}</style><div class="qa-title">UrbanFlow · lokalny graf OSM · 7 przystanków</div><div id="map"></div><script src="/vendor/leaflet/leaflet.js"></script>`);
    await expect.poll(() => page.evaluate(() => Boolean(window.L))).toBe(true);
    const results = await page.evaluate(async ids => {
      const manifest = await (await fetch('/data/routing/krakow.json')).json();
      const response = await fetch(`/data/routing/${manifest.metadata.roadUrl}`);
      const { decodeRoutingGraphBinary, routeOnOsmGraph } = await import('/js/routing-osm.js?v=2');
      const graph = decodeRoutingGraphBinary(await response.arrayBuffer(), manifest.bounds);
      const stops = (await (await fetch('/data/krakow-stops.json')).json()).stops;
      const points = ids.map(id => stops.find(stop => stop.id === id));
      if (points.some(point => !point)) throw new Error('A requested stop id is missing from the local city data.');
      const map = L.map('map', { zoomControl: true }).setView([50.05, 19.95], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      const extent = [];
      const routeLayers = [];
      points.forEach((point, index) => {
        const icon = L.divIcon({ className: '', html: `<span class="route-number">${index + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        L.marker([point.lat, point.lng], { icon, keyboard: true, title: `${index + 1}. ${point.name}` }).addTo(map).bindTooltip(`${index + 1}. ${point.name}`);
        extent.push([point.lat, point.lng]);
      });
      const segments = [];
      for (let i = 1; i < points.length; i += 1) {
        const result = routeOnOsmGraph(points[i - 1], points[i], graph);
        segments.push({ from: points[i - 1].id, to: points[i].id, valid: result.valid, distanceKm: result.distanceKm,
          detourRatio: result.detourRatio, warning: result.detourWarning, coordinateCount: result.coordinates.length, reason: result.reason });
        if (!result.valid || result.roadCoordinates?.length < 2) throw new Error(`${points[i - 1].name} → ${points[i].name}: ${result.reason}`);
        const routeLayer = L.polyline(result.roadCoordinates, { color: '#d84f3f', weight: 6, opacity: 0.92, lineCap: 'round' }).addTo(map)
          .bindTooltip(`${points[i - 1].name} → ${points[i].name}: ${result.distanceKm.toFixed(2)} km`);
        routeLayers.push(routeLayer);
        for (const access of result.accessSegments || []) L.polyline(access, { color: '#23878b', weight: 3, dashArray: '4 5', opacity: 0.9 }).addTo(map);
        extent.push(...result.coordinates);
      }
      map.fitBounds(extent, { padding: [40, 40] });
      // Show the exact local bus graph under the chosen paths. This also makes
      // the visual review useful when a remote raster tile has not loaded yet.
      const visible = map.getBounds(), roadLines = [];
      for (let node = 0; node < graph.nodeCount; node += 1) {
        const a = graph.coordinate(node);
        if (!visible.contains(a)) continue;
        for (let edge = graph.offsets[node]; edge < graph.offsets[node + 1]; edge += 1) {
          const b = graph.coordinate(graph.targets[edge]);
          if (visible.contains(b)) roadLines.push([a, b]);
        }
      }
      const roadLayer = L.polyline(roadLines, { color: '#697b70', weight: 1.2, opacity: 0.52, interactive: false, className: 'osm-road-underlay' }).addTo(map);
      roadLayer.bringToBack(); routeLayers.forEach(layer => layer.bringToFront());
      if (roadLines.length < 100) throw new Error(`Only ${roadLines.length} OSM road graph edges are visible in the route review.`);
      window.__qaVisibleRoadEdges = roadLines.length;
      window.__qaRouteSegments = segments;
      return segments;
    }, routeIds);
    expect(results).toHaveLength(6);
    expect(results.every(segment => segment.valid && segment.coordinateCount > 2)).toBe(true);
    expect(results.some(segment => segment.warning)).toBe(true);
    await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: join(artifactDir, `osm-seven-stop-${viewport.name}.png`), fullPage: false, animations: 'disabled' });
  });
}
