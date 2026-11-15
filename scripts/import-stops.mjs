#!/usr/bin/env node
// Import pełnej sieci przystanków Krakowa do public/data/krakow-stops.json.
//
//   node scripts/import-stops.mjs                     # Overpass API (OpenStreetMap), wymaga internetu
//   node scripts/import-stops.mjs --gtfs stops.txt    # plik stops.txt z GTFS ZTP Kraków (oficjalne dane)
//   opcje: --bbox 49.93,19.75,50.14,20.15  --radius 0.12  --out public/data/krakow-stops.json
//
// Słupki o tej samej nazwie w promieniu --radius km (peron A/B, przeciwne kierunki) łączą się w jeden przystanek gry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const km = (a, b) => {
  const dx = (a.lng - b.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180), dy = (a.lat - b.lat) * 110.574;
  return Math.hypot(dx, dy);
};

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map(h => h.replace(/^\uFEFF/, '').trim());
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

export function fromGtfs(text, bbox) {
  return parseCsv(text).map(r => ({ name: (r.stop_name || '').trim(), lat: Number(r.stop_lat), lng: Number(r.stop_lon) }))
    .filter(s => s.name && inBox(s, bbox));
}
export async function fromOverpass(bbox) {
  const [s, w, n, e] = bbox, box = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:120];(node["highway"="bus_stop"]["name"](${box});node["railway"="tram_stop"]["name"](${box});node["railway"~"^(station|halt)$"]["name"](${box}););out body;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'urbanflow-import/1.0' } });
  if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
  return (await response.json()).elements.map(el => ({ name: el.tags.name.trim(), lat: el.lat, lng: el.lon }));
}
const inBox = (p, [s, w, n, e]) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;

export function clusterStops(raw, radiusKm = 0.12) {
  const byName = new Map();
  for (const p of raw) { const key = p.name.replace(/\s+\d{1,2}$/, '').toLowerCase(); (byName.get(key) || byName.set(key, []).get(key)).push({ ...p, name: p.name.replace(/\s+\d{1,2}$/, '') }); }
  const groups = [];
  for (const list of byName.values()) {
    const clusters = [];
    for (const p of list) {
      const c = clusters.find(c => km(c.center, p) <= radiusKm);
      if (c) { c.items.push(p); c.center = { lat: c.items.reduce((a, x) => a + x.lat, 0) / c.items.length, lng: c.items.reduce((a, x) => a + x.lng, 0) / c.items.length }; }
      else clusters.push({ items: [p], center: { lat: p.lat, lng: p.lng } });
    }
    for (const c of clusters) groups.push({ name: c.items[0].name, lat: +c.center.lat.toFixed(5), lng: +c.center.lng.toFixed(5), w: Math.min(3, Math.max(1, Math.ceil(c.items.length / 2))) });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.lat - b.lat);
  const used = new Map();
  return groups.map(g => { const base = 's-' + (slug(g.name) || 'przystanek'); const n = (used.get(base) || 0) + 1; used.set(base, n); return { id: n === 1 ? base : `${base}-${n}`, ...g }; });
}

async function main() {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const bbox = (opt('--bbox') || '49.93,19.75,50.14,20.15').split(',').map(Number);
  const radius = Number(opt('--radius') || 0.12);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.resolve(opt('--out') || path.join(root, 'public/data/krakow-stops.json'));
  const gtfs = opt('--gtfs');
  const raw = gtfs ? fromGtfs(fs.readFileSync(gtfs, 'utf8'), bbox) : await fromOverpass(bbox);
  const stops = clusterStops(raw, radius);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ source: gtfs ? 'gtfs' : 'overpass', generated: new Date().toISOString().slice(0, 10), stops }));
  console.log(`Zapisano ${stops.length} przystanków (z ${raw.length} słupków) → ${out}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
