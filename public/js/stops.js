// Odkrywanie przystanków: każda budowa odsłania nowe przystanki wzdłuż trasy i wokół jej końców.
export const REVEAL = { corridorKm: 0.9, ringKm: 2.2, maxCorridor: 18, maxRing: 8, fallbackKm: 6, fallbackCount: 8 };

const KM_LAT = 110.574;
// Odległość punktu od odcinka (km), rzutowanie równoprostokątne — wystarcza w skali miasta.
export function distanceToSegmentKm(p, a, b) {
  const kx = 111.32 * Math.cos(a.lat * Math.PI / 180);
  const px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * KM_LAT;
  const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * KM_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

export function distanceToRouteKm(p, route) {
  if (route.length === 1) return distanceToSegmentKm(p, route[0], route[0]);
  let best = Infinity;
  for (let i = 1; i < route.length; i++) best = Math.min(best, distanceToSegmentKm(p, route[i - 1], route[i]));
  return best;
}

// Zwraca id nowych przystanków (nieodkrytych) w kolejności odkrywania.
export function pickStopsToReveal(allStops, revealed, route, opts = {}) {
  const cfg = { ...REVEAL, ...opts };
  if (!route.length) return [];
  const fresh = allStops.filter(s => s.type === 'stop' && !revealed.has(s.id));
  const scored = fresh.map(s => ({
    s, route: distanceToRouteKm(s, route),
    end: Math.min(distanceToSegmentKm(s, route[0], route[0]), distanceToSegmentKm(s, route.at(-1), route.at(-1)))
  }));
  const chosen = new Map();
  scored.filter(x => x.route <= cfg.corridorKm).sort((a, b) => a.route - b.route).slice(0, cfg.maxCorridor).forEach(x => chosen.set(x.s.id, x.s));
  scored.filter(x => x.end <= cfg.ringKm && !chosen.has(x.s.id)).sort((a, b) => a.end - b.end).slice(0, cfg.maxRing).forEach(x => chosen.set(x.s.id, x.s));
  if (!chosen.size) scored.filter(x => x.route <= cfg.fallbackKm).sort((a, b) => a.route - b.route).slice(0, cfg.fallbackCount).forEach(x => chosen.set(x.s.id, x.s));
  return [...chosen.keys()];
}
