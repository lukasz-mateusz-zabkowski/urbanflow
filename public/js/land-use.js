export const LAND_USE_VERSION = 1;
export const LAND_USE_TYPES = Object.freeze(['residential', 'retail', 'office', 'industrial', 'public', 'green', 'reserve']);
export const LAND_USE_INTENSITIES = Object.freeze(['low', 'medium', 'high']);
export const LAND_USE_PARAMETERS = Object.freeze({ reservePerUpgrade: 4, cooldownWeeks: 8, maxProgressPerWeek: 11 });

const MIXES = Object.freeze({
  residential: { residential: 48, retail: 8, office: 8, industrial: 4, public: 8, green: 14, reserve: 10 },
  office: { residential: 15, retail: 16, office: 36, industrial: 4, public: 11, green: 10, reserve: 8 },
  industrial: { residential: 12, retail: 6, office: 8, industrial: 48, public: 8, green: 10, reserve: 8 },
  education: { residential: 25, retail: 10, office: 10, industrial: 4, public: 30, green: 12, reserve: 9 },
  tourist: { residential: 15, retail: 18, office: 8, industrial: 3, public: 10, green: 36, reserve: 10 },
  center: { residential: 18, retail: 24, office: 25, industrial: 3, public: 12, green: 10, reserve: 8 },
  station: { residential: 12, retail: 25, office: 16, industrial: 3, public: 18, green: 8, reserve: 18 },
  airport: { residential: 8, retail: 22, office: 14, industrial: 12, public: 18, green: 9, reserve: 17 },
  interchange: { residential: 14, retail: 22, office: 20, industrial: 4, public: 15, green: 8, reserve: 17 },
  local: { residential: 30, retail: 12, office: 7, industrial: 4, public: 12, green: 20, reserve: 15 }
});

const INITIAL_INTENSITY = new Set(['center', 'station', 'airport', 'interchange']);
const INTENSITY_INDEX = Object.freeze({ low: 0, medium: 1, high: 2 });
const PERIOD_ENDS = Object.freeze([360, 540, 900, 1140, 1380]);
const PERIOD_FACTORS = Object.freeze({
  residential: Object.freeze({
    origin: Object.freeze([0.3, 1.42, 0.82, 0.72, 1.12, 0.3]),
    destination: Object.freeze([0.3, 0.5, 0.68, 1.25, 1.42, 0.3])
  }),
  retail: Object.freeze({
    origin: Object.freeze([0.25, 0.48, 0.88, 1.22, 1.36, 0.25]),
    destination: Object.freeze([0.25, 0.7, 1.05, 1.32, 1.3, 0.25])
  }),
  office: Object.freeze({
    origin: Object.freeze([0.2, 0.65, 0.85, 1.28, 1.25, 0.2]),
    destination: Object.freeze([0.2, 1.45, 1.15, 0.65, 0.35, 0.2])
  }),
  industrial: Object.freeze({
    origin: Object.freeze([0.4, 1.2, 0.85, 1.15, 0.75, 0.4]),
    destination: Object.freeze([0.4, 1.2, 0.85, 1.05, 0.65, 0.4])
  }),
  public: Object.freeze({
    origin: Object.freeze([0.25, 0.55, 1.05, 1.1, 0.6, 0.25]),
    destination: Object.freeze([0.25, 1.25, 1.25, 0.95, 0.5, 0.25])
  }),
  green: Object.freeze({
    origin: Object.freeze([0.3, 0.4, 0.75, 1.2, 1.2, 0.3]),
    destination: Object.freeze([0.3, 0.65, 1.15, 1.3, 1.25, 0.3])
  }),
  reserve: Object.freeze({ origin: Object.freeze([0.12, 0.12, 0.12, 0.12, 0.12, 0.12]),
    destination: Object.freeze([0.12, 0.12, 0.12, 0.12, 0.12, 0.12]) })
});

const DAY_FACTORS = Object.freeze({
  weekday: Object.freeze({ residential: 1, retail: 1, office: 1, industrial: 1, public: 1, green: 1, reserve: 1 }),
  saturday: Object.freeze({ residential: 0.92, retail: 1.28, office: 0.38, industrial: 0.72, public: 0.68, green: 1.32, reserve: 1 }),
  sunday: Object.freeze({ residential: 0.86, retail: 1.2, office: 0.2, industrial: 0.62, public: 0.52, green: 1.45, reserve: 1 }),
  special: Object.freeze({ residential: 0.88, retail: 1.25, office: 0.15, industrial: 0.55, public: 0.5, green: 1.5, reserve: 1 })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value);
const useLabel = use => ({ residential: 'mieszkalnictwo', retail: 'handel i usługi', office: 'biura',
  industrial: 'przemysł', public: 'instytucje publiczne', green: 'zieleń i rekreacja', reserve: 'rezerwa rozwojowa' }[use] || 'obszar mieszany');

export function createLandUseProfile(profile = 'local') {
  const key = Object.hasOwn(MIXES, profile) ? profile : 'local';
  return {
    version: LAND_USE_VERSION,
    source: 'simulation-parameters',
    profile: key,
    shares: { ...MIXES[key] },
    intensity: INITIAL_INTENSITY.has(key) ? 'medium' : 'low',
    developmentProgress: 0,
    lastDevelopmentWeek: 1,
    lastIntensityChangeWeek: 0,
    lastChange: { week: 0, fromIntensity: null, toIntensity: null, convertedUse: null, reserveConverted: 0 }
  };
}

export function landUseDominantUse(landUse) {
  if (!landUse?.shares) return 'residential';
  return LAND_USE_TYPES.filter(use => use !== 'reserve')
    .sort((a, b) => landUse.shares[b] - landUse.shares[a] || LAND_USE_TYPES.indexOf(a) - LAND_USE_TYPES.indexOf(b))[0];
}

export function landUseLabel(use) { return useLabel(use); }

export function landUseDirection(landUse, zone = {}) {
  if (!landUse) return 'brak profilu zagospodarowania';
  if (landUse.shares.reserve < LAND_USE_PARAMETERS.reservePerUpgrade || landUse.intensity === 'high') return 'ogranicza ją pozostała rezerwa terenu lub maksymalna intensywność';
  if ((zone.transportAccess || 0) < 25 || (zone.transportSatisfaction || 0) < 35) return 'rozwój hamuje niedostateczna obsługa transportowa';
  if (Math.max(zone.residentialAttractiveness || 0, zone.economicAttractiveness || 0) < 48) return 'obszar potrzebuje większej atrakcyjności';
  return 'sprzyjają mu dostępność transportu i atrakcyjność obszaru';
}

export function landUseDemandFactor(landUse, role, minuteOfDay, dayType = 'weekday') {
  if (!landUse?.shares || !['origin', 'destination'].includes(role)) return 1;
  const minute = ((Math.floor(Number(minuteOfDay) || 0) % 1440) + 1440) % 1440;
  const period = PERIOD_ENDS.findIndex(end => minute < end);
  const index = period < 0 ? PERIOD_ENDS.length : period;
  const day = DAY_FACTORS[dayType] || DAY_FACTORS.weekday;
  let weighted = 0;
  for (const use of LAND_USE_TYPES) weighted += landUse.shares[use] / 100
    * PERIOD_FACTORS[use][role][index] * day[use];
  return Math.round(clamp(weighted, 0.35, 1.65) * 1000) / 1000;
}

function developmentUse(profile, residentialAttractiveness, economicAttractiveness) {
  if (profile === 'residential') return 'residential';
  if (profile === 'office') return economicAttractiveness >= residentialAttractiveness * 0.7 ? 'office' : 'retail';
  if (profile === 'industrial') return 'industrial';
  if (profile === 'education') return 'public';
  if (profile === 'tourist') return economicAttractiveness > residentialAttractiveness ? 'retail' : 'green';
  if (profile === 'station' || profile === 'airport' || profile === 'interchange') return 'retail';
  if (profile === 'center') return economicAttractiveness >= residentialAttractiveness ? 'office' : 'residential';
  return economicAttractiveness > residentialAttractiveness + 8 ? 'retail' : 'residential';
}

export function evolveLandUseProfile(landUse, conditions = {}) {
  const week = Number.isSafeInteger(conditions.week) && conditions.week > 0 ? conditions.week : 0;
  const current = landUse && landUse.version === LAND_USE_VERSION ? landUse : createLandUseProfile(conditions.profile);
  if (!week || week <= current.lastDevelopmentWeek) return { profile: current, change: null, blockedByTransport: false };
  const next = { ...current, shares: { ...current.shares },
    lastChange: { week: 0, fromIntensity: null, toIntensity: null, convertedUse: null, reserveConverted: 0 } };
  next.lastDevelopmentWeek = week;
  const attractiveness = Math.max(conditions.residentialAttractiveness || 0, conditions.economicAttractiveness || 0);
  const access = clamp(Number(conditions.transportAccess) || 0, 0, 100);
  const satisfaction = clamp(Number(conditions.transportSatisfaction) || 0, 0, 100);
  const reservedReserve = clamp(Number(conditions.reservedReserve) || 0, 0, next.shares.reserve);
  const reserveReady = next.shares.reserve - reservedReserve >= LAND_USE_PARAMETERS.reservePerUpgrade;
  const belowMax = next.intensity !== 'high';
  const attractive = attractiveness >= 48;
  const transportReady = access >= 25 && satisfaction >= 35;
  const blockedByTransport = reserveReady && belowMax && attractive && !transportReady;

  if (reserveReady && belowMax && attractive && transportReady) {
    const accessFactor = (access - 25) / 75;
    const satisfactionFactor = (satisfaction - 35) / 65;
    const attractionFactor = (attractiveness - 48) / 52;
    const growth = 3 + accessFactor * 3.5 + satisfactionFactor * 2.5 + attractionFactor * 2;
    next.developmentProgress = Math.min(100, round((next.developmentProgress + Math.min(LAND_USE_PARAMETERS.maxProgressPerWeek, growth)) * 10) / 10);
  } else {
    next.developmentProgress = Math.max(0, round((next.developmentProgress - (blockedByTransport ? 2 : 1)) * 10) / 10);
  }

  const cooldownPassed = week - next.lastIntensityChangeWeek >= LAND_USE_PARAMETERS.cooldownWeeks;
  if (next.developmentProgress < 100 || !cooldownPassed || !reserveReady || !belowMax) {
    return { profile: next, change: null, blockedByTransport };
  }

  const from = next.intensity;
  next.intensity = LAND_USE_INTENSITIES[INTENSITY_INDEX[from] + 1];
  const convertedUse = developmentUse(next.profile, conditions.residentialAttractiveness || 0, conditions.economicAttractiveness || 0);
  next.shares.reserve -= LAND_USE_PARAMETERS.reservePerUpgrade;
  next.shares[convertedUse] += LAND_USE_PARAMETERS.reservePerUpgrade;
  next.lastIntensityChangeWeek = week;
  next.developmentProgress = 0;
  next.lastChange = { week, fromIntensity: from, toIntensity: next.intensity, convertedUse,
    reserveConverted: LAND_USE_PARAMETERS.reservePerUpgrade };
  return { profile: next, change: { ...next.lastChange }, blockedByTransport: false };
}

export function capacitiesForLandUse(base, landUse) {
  const level = INTENSITY_INDEX[landUse?.intensity] ?? 0;
  const shares = landUse?.shares || MIXES.local;
  const residentFactor = 1.2 + level * 0.18 * (shares.residential / 35);
  const jobShare = shares.retail + shares.office + shares.industrial + shares.public;
  const jobFactor = 1.2 + level * 0.18 * (jobShare / 60);
  return { residents: round((Number(base?.residents) || 0) * residentFactor),
    jobs: round((Number(base?.jobs) || 0) * jobFactor) };
}

export function validateLandUseProfile(landUse) {
  if (!landUse || typeof landUse !== 'object' || Array.isArray(landUse) || landUse.version !== LAND_USE_VERSION
    || landUse.source !== 'simulation-parameters' || !Object.hasOwn(MIXES, landUse.profile)
    || !LAND_USE_INTENSITIES.includes(landUse.intensity) || !Number.isFinite(landUse.developmentProgress)
    || landUse.developmentProgress < 0 || landUse.developmentProgress > 100
    || !Number.isSafeInteger(landUse.lastDevelopmentWeek) || landUse.lastDevelopmentWeek < 1
    || !Number.isSafeInteger(landUse.lastIntensityChangeWeek) || landUse.lastIntensityChangeWeek < 0
    || !landUse.lastChange || typeof landUse.lastChange !== 'object' || Array.isArray(landUse.lastChange)) return false;
  if (!landUse.shares || typeof landUse.shares !== 'object' || Array.isArray(landUse.shares)
    || Object.keys(landUse.shares).length !== LAND_USE_TYPES.length
    || LAND_USE_TYPES.some(use => !Number.isSafeInteger(landUse.shares[use]) || landUse.shares[use] < 0 || landUse.shares[use] > 100)
    || LAND_USE_TYPES.reduce((sum, use) => sum + landUse.shares[use], 0) !== 100) return false;
  const change = landUse.lastChange;
  return Number.isSafeInteger(change.week) && change.week >= 0 && change.week <= landUse.lastIntensityChangeWeek
    && (change.fromIntensity === null || LAND_USE_INTENSITIES.includes(change.fromIntensity))
    && (change.toIntensity === null || LAND_USE_INTENSITIES.includes(change.toIntensity))
    && (change.convertedUse === null || LAND_USE_TYPES.includes(change.convertedUse))
    && Number.isSafeInteger(change.reserveConverted) && change.reserveConverted >= 0 && change.reserveConverted <= 100
    && (change.week === 0 ? change.fromIntensity === null && change.toIntensity === null && change.convertedUse === null && change.reserveConverted === 0
      : change.fromIntensity !== null && change.toIntensity !== null && change.convertedUse !== null && change.reserveConverted === LAND_USE_PARAMETERS.reservePerUpgrade);
}
