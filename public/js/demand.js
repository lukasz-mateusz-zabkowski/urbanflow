export const DISTRICT_PROFILES = {
  center: { label: 'centrum', origin: [0.55, 0.8, 1.0, 1.15, 1.0, 0.75], destination: [0.45, 1.65, 1.25, 1.45, 1.2, 0.55] },
  residential: { label: 'mieszkalny', origin: [0.35, 1.55, 0.8, 1.25, 0.8, 0.35], destination: [0.45, 0.7, 0.8, 1.45, 1.0, 0.5] },
  office: { label: 'biurowy', origin: [0.2, 0.45, 0.8, 1.65, 0.6, 0.2], destination: [0.15, 1.75, 1.0, 0.75, 0.35, 0.15] },
  education: { label: 'edukacyjny', origin: [0.15, 0.7, 1.05, 1.35, 0.65, 0.2], destination: [0.1, 1.6, 1.15, 0.75, 0.25, 0.1] },
  industrial: { label: 'przemysłowy', origin: [0.25, 0.75, 0.85, 1.5, 0.45, 0.2], destination: [0.2, 1.45, 0.85, 0.7, 0.3, 0.15] },
  tourist: { label: 'turystyczny', origin: [0.2, 0.45, 1.25, 1.15, 1.35, 0.45], destination: [0.15, 0.6, 1.4, 1.25, 1.55, 0.35] },
  airport: { label: 'lotnisko', origin: [0.35, 0.75, 0.9, 1.15, 0.8, 0.55], destination: [0.3, 0.8, 0.95, 1.2, 0.85, 0.5] },
  station: { label: 'dworzec', origin: [0.4, 1.2, 1.0, 1.35, 0.95, 0.4], destination: [0.35, 1.35, 1.1, 1.25, 1.0, 0.35] },
  interchange: { label: 'węzeł', origin: [0.3, 1.05, 1.0, 1.25, 0.8, 0.3], destination: [0.3, 1.2, 1.0, 1.2, 0.85, 0.3] },
  local: { label: 'lokalny', origin: [0.2, 1.0, 0.75, 1.0, 0.55, 0.2], destination: [0.2, 0.9, 0.85, 1.0, 0.65, 0.2] }
};

const PERIODS = [5 * 60, 10 * 60, 15 * 60, 19 * 60, 23 * 60];
const periodIndex = minuteOfDay => PERIODS.findIndex(end => minuteOfDay < end) < 0 ? 5 : PERIODS.findIndex(end => minuteOfDay < end);

export function inferProfile(point) {
  if (point?.profile && DISTRICT_PROFILES[point.profile]) return point.profile;
  if (point?.type === 'airport') return 'airport';
  if (point?.type === 'station') return 'station';
  if (point?.type === 'hub') return 'center';
  if (point?.type === 'stop') return 'local';
  const name = String(point?.name || '').toLowerCase();
  if (name.includes('huta')) return 'industrial';
  if (name.includes('ruczaj')) return 'education';
  if (name.includes('bronowice') || name.includes('bieżan')) return 'residential';
  if (name.includes('wielicz')) return 'tourist';
  return 'residential';
}

export function profileMultiplier(point, minuteOfDay, role = 'origin') {
  const profile = DISTRICT_PROFILES[inferProfile(point)] || DISTRICT_PROFILES.local;
  return profile[role]?.[periodIndex(minuteOfDay)] ?? 1;
}

export function pointDemandScore(point, minuteOfDay, role = 'origin') {
  return Math.max(0.1, Number(point?.demand) || 1) * profileMultiplier(point, minuteOfDay, role);
}

export function relationMultiplier(origin, destination, minuteOfDay) {
  const hour = minuteOfDay / 60;
  if (origin?.id === 'ruczaj' && ['centrum', 'dworzec'].includes(destination?.id) && hour >= 6 && hour < 10) return 2.1;
  if (origin?.id === 'nowa-huta' && destination?.id === 'centrum' && hour >= 6 && hour < 10) return 1.8;
  if (origin?.id === 'centrum' && ['ruczaj', 'nowa-huta', 'bronowice'].includes(destination?.id) && hour >= 15 && hour < 19.5) return 1.75;
  if (destination?.id === 'balice') return 1.25;
  return 1;
}

export function destinationWeight(origin, destination, minuteOfDay) {
  const distanceBias = inferProfile(destination) === 'airport' ? 1.25 : 1;
  return pointDemandScore(destination, minuteOfDay, 'destination') * relationMultiplier(origin, destination, minuteOfDay) * distanceBias;
}

export function chooseDestination(origin, candidates, minuteOfDay, random = Math.random) {
  const weights = candidates.map(point => destinationWeight(origin, point, minuteOfDay));
  let choice = random() * weights.reduce((sum, value) => sum + value, 0);
  return candidates.find((_point, index) => (choice -= weights[index]) < 0) || candidates.at(-1) || null;
}

// This forecast is derived without creating passenger cohorts. It lets the
// player inspect opportunity before deciding which points to serve.
export function latentDemand(points, lines, minuteOfDay, events = [], elapsedMinutes = 0) {
  const served = new Set((lines || []).flatMap(line => line.stops || []));
  return (points || []).map(point => {
    const base = pointDemandScore(point, minuteOfDay, 'origin') + pointDemandScore(point, minuteOfDay, 'destination') * 0.72;
    const event = events.reduce((value, item) => item.startMinute <= elapsedMinutes && item.endMinute > elapsedMinutes && (!item.locationId || item.locationId === point.id)
      ? value * (item.demandMultiplier || item.globalDemandMultiplier || 1) : value, 1);
    return { pointId: point.id, potential: base * event, served: served.has(point.id) };
  });
}

