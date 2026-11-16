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

// Alpha mobility factors describe how each place profile changes by service day.
// They are applied per origin/destination role, not as a single city-wide scalar.
export const DAY_DEMAND_FACTORS = Object.freeze({
  weekday: Object.freeze({
    residential: Object.freeze({ origin: 1, destination: 1 }), office: Object.freeze({ origin: 1, destination: 1 }), industrial: Object.freeze({ origin: 1, destination: 1 }),
    education: Object.freeze({ origin: 1, destination: 1 }), tourist: Object.freeze({ origin: 0.8, destination: 0.8 }),
    center: Object.freeze({ origin: 1, destination: 1 }), station: Object.freeze({ origin: 1, destination: 1 }),
    interchange: Object.freeze({ origin: 1, destination: 1 }), airport: Object.freeze({ origin: 1, destination: 1 }),
    local: Object.freeze({ origin: 1, destination: 1 })
  }),
  saturday: Object.freeze({
    residential: Object.freeze({ origin: 0.82, destination: 0.9 }), office: Object.freeze({ origin: 0.42, destination: 0.35 }), industrial: Object.freeze({ origin: 0.76, destination: 0.48 }),
    education: Object.freeze({ origin: 0.3, destination: 0.25 }), tourist: Object.freeze({ origin: 1.35, destination: 1.4 }),
    center: Object.freeze({ origin: 1.18, destination: 1.25 }), station: Object.freeze({ origin: 0.9, destination: 0.92 }),
    interchange: Object.freeze({ origin: 1.02, destination: 1.08 }), airport: Object.freeze({ origin: 1.08, destination: 1.12 }),
    local: Object.freeze({ origin: 0.92, destination: 0.95 })
  }),
  sunday: Object.freeze({
    residential: Object.freeze({ origin: 0.7, destination: 0.82 }), office: Object.freeze({ origin: 0.2, destination: 0.16 }), industrial: Object.freeze({ origin: 0.65, destination: 0.36 }),
    education: Object.freeze({ origin: 0.12, destination: 0.1 }), tourist: Object.freeze({ origin: 1.55, destination: 1.62 }),
    center: Object.freeze({ origin: 1.2, destination: 1.32 }), station: Object.freeze({ origin: 0.76, destination: 0.8 }),
    interchange: Object.freeze({ origin: 0.9, destination: 0.96 }), airport: Object.freeze({ origin: 1.02, destination: 1.08 }),
    local: Object.freeze({ origin: 0.78, destination: 0.85 })
  }),
  special: Object.freeze({
    residential: Object.freeze({ origin: 0.62, destination: 0.75 }), office: Object.freeze({ origin: 0.12, destination: 0.1 }), industrial: Object.freeze({ origin: 0.55, destination: 0.28 }),
    education: Object.freeze({ origin: 0.06, destination: 0.05 }), tourist: Object.freeze({ origin: 1.65, destination: 1.72 }),
    center: Object.freeze({ origin: 1.3, destination: 1.42 }), station: Object.freeze({ origin: 0.72, destination: 0.76 }),
    interchange: Object.freeze({ origin: 0.92, destination: 0.98 }), airport: Object.freeze({ origin: 1.05, destination: 1.12 }),
    local: Object.freeze({ origin: 0.76, destination: 0.82 })
  })
});

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

export function pointDemandScore(point, minuteOfDay, role = 'origin', dayType = 'weekday') {
  const profile = inferProfile(point);
  const dayFactor = DAY_DEMAND_FACTORS[dayType]?.[profile]?.[role] ?? DAY_DEMAND_FACTORS.weekday[profile]?.[role] ?? 1;
  return Math.max(0.1, (Number(point?.demand) || 1) * profileMultiplier(point, minuteOfDay, role) * dayFactor);
}

export function relationMultiplier(origin, destination, minuteOfDay, dayType = 'weekday') {
  const hour = minuteOfDay / 60;
  if (dayType === 'weekday' && origin?.id === 'ruczaj' && ['centrum', 'dworzec'].includes(destination?.id) && hour >= 6 && hour < 10) return 2.1;
  if (dayType === 'weekday' && origin?.id === 'nowa-huta' && destination?.id === 'centrum' && hour >= 6 && hour < 10) return 1.8;
  if (dayType === 'weekday' && origin?.id === 'centrum' && ['ruczaj', 'nowa-huta', 'bronowice'].includes(destination?.id) && hour >= 15 && hour < 19.5) return 1.75;
  if (destination?.id === 'balice') return 1.25;
  return 1;
}

export function destinationWeight(origin, destination, minuteOfDay, dayType = 'weekday') {
  const distanceBias = inferProfile(destination) === 'airport' ? 1.25 : 1;
  return pointDemandScore(destination, minuteOfDay, 'destination', dayType)
    * relationMultiplier(origin, destination, minuteOfDay, dayType) * distanceBias;
}

export function chooseDestination(origin, candidates, minuteOfDay, random = Math.random, dayType = 'weekday') {
  const weights = candidates.map(point => destinationWeight(origin, point, minuteOfDay, dayType));
  let choice = random() * weights.reduce((sum, value) => sum + value, 0);
  return candidates.find((_point, index) => (choice -= weights[index]) < 0) || candidates.at(-1) || null;
}

// This forecast is derived without creating passenger cohorts. It lets the
// player inspect opportunity before deciding which points to serve.
export function latentDemand(points, lines, minuteOfDay, events = [], elapsedMinutes = 0, dayType = 'weekday') {
  const served = new Set((lines || []).flatMap(line => line.stops || []));
  return (points || []).map(point => {
    const base = pointDemandScore(point, minuteOfDay, 'origin', dayType)
      + pointDemandScore(point, minuteOfDay, 'destination', dayType) * 0.72;
    const event = events.reduce((value, item) => item.startMinute <= elapsedMinutes && item.endMinute > elapsedMinutes && (!item.locationId || item.locationId === point.id)
      ? value * (item.demandMultiplier || item.globalDemandMultiplier || 1) : value, 1);
    return { pointId: point.id, potential: base * event, served: served.has(point.id) };
  });
}

