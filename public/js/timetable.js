export const TIMETABLE_VERSION = 1;
export const WEEKLY_TIMETABLE_VERSION = 2;
export const DAY_MINUTES = 24 * 60;
export const SERVICE_DAY_TYPES = Object.freeze(['weekday', 'saturday', 'sunday', 'special']);
export const SERVICE_DAY_LABELS = Object.freeze({
  weekday: 'Dni robocze', saturday: 'Sobota', sunday: 'Niedziela', special: 'Dzień specjalny'
});

export const DEFAULT_SERVICE_PERIODS = Object.freeze([
  Object.freeze({ id: 'morning-peak', label: 'Szczyt poranny', startMinute: 360, endMinute: 540 }),
  Object.freeze({ id: 'midday', label: 'Międzyszczyt', startMinute: 540, endMinute: 900 }),
  Object.freeze({ id: 'afternoon-peak', label: 'Szczyt popołudniowy', startMinute: 900, endMinute: 1140 }),
  Object.freeze({ id: 'evening', label: 'Wieczór', startMinute: 1140, endMinute: 1380 }),
  Object.freeze({ id: 'night', label: 'Noc', startMinute: 1380, endMinute: 360 })
]);

// Alpha presets use the existing 3 departures/hour as the balanced baseline.
// Cost, capacity, and required fleet still come from the existing transport model.
export const TIMETABLE_PROFILES = Object.freeze({
  economic: Object.freeze({ label: 'Ekonomiczny', frequencies: Object.freeze([2, 1, 2, 1, 0]) }),
  balanced: Object.freeze({ label: 'Zrównoważony', frequencies: Object.freeze([4, 3, 4, 3, 2]) }),
  intensive: Object.freeze({ label: 'Intensywny', frequencies: Object.freeze([6, 4, 6, 3, 1]) }),
  'all-day': Object.freeze({ label: 'Całodobowy', frequencies: Object.freeze([3, 2, 3, 2, 1]) })
});

const clampFrequency = (value, maxFrequency = 16) => Math.max(0, Math.min(maxFrequency, Number(value) || 0));
const wrapsMidnight = period => period.startMinute > period.endMinute;
const containsMinute = (period, minute) => wrapsMidnight(period)
  ? minute >= period.startMinute || minute < period.endMinute
  : minute >= period.startMinute && minute < period.endMinute;

export function createTimetable(profileId = 'balanced', maxFrequency = 16) {
  const profile = TIMETABLE_PROFILES[profileId] ? profileId : 'balanced';
  return {
    version: TIMETABLE_VERSION,
    profileId: profile,
    calendar: 'all-days',
    periods: DEFAULT_SERVICE_PERIODS.map((period, index) => ({
      ...period, frequency: clampFrequency(TIMETABLE_PROFILES[profile].frequencies[index], maxFrequency)
    }))
  };
}

export function createUniformTimetable(frequency, maxFrequency = 16) {
  return {
    version: TIMETABLE_VERSION,
    profileId: 'legacy-uniform',
    calendar: 'all-days',
    periods: DEFAULT_SERVICE_PERIODS.map(period => ({ ...period, frequency: clampFrequency(frequency, maxFrequency) }))
  };
}

export function createWeeklyTimetable(profileId = 'balanced', maxFrequency = 16) {
  const base = createTimetable(profileId, maxFrequency);
  return {
    version: WEEKLY_TIMETABLE_VERSION,
    sameEveryDay: true,
    profiles: Object.fromEntries(SERVICE_DAY_TYPES.map(dayType => [dayType, structuredClone(base)]))
  };
}

export function createWeeklyUniformTimetable(frequency, maxFrequency = 16) {
  const base = createUniformTimetable(frequency, maxFrequency);
  return {
    version: WEEKLY_TIMETABLE_VERSION,
    sameEveryDay: true,
    profiles: Object.fromEntries(SERVICE_DAY_TYPES.map(dayType => [dayType, structuredClone(base)]))
  };
}

export function timetableForDay(timetable, dayType = 'weekday') {
  if (timetable?.version === TIMETABLE_VERSION) return timetable;
  if (timetable?.version !== WEEKLY_TIMETABLE_VERSION) return null;
  return timetable.profiles?.[dayType] || timetable.profiles?.weekday || null;
}

export function migrateDailyTimetable(timetable, maxFrequency = 16) {
  if (!validateTimetable(timetable, maxFrequency)) return null;
  return {
    version: WEEKLY_TIMETABLE_VERSION,
    sameEveryDay: true,
    profiles: Object.fromEntries(SERVICE_DAY_TYPES.map(dayType => [dayType, structuredClone(timetable)]))
  };
}

export function validateWeeklyTimetable(timetable, maxFrequency = 16) {
  if (!timetable || typeof timetable !== 'object' || Array.isArray(timetable)
    || timetable.version !== WEEKLY_TIMETABLE_VERSION || typeof timetable.sameEveryDay !== 'boolean'
    || !timetable.profiles || typeof timetable.profiles !== 'object' || Array.isArray(timetable.profiles)
    || Object.keys(timetable.profiles).length !== SERVICE_DAY_TYPES.length
    || SERVICE_DAY_TYPES.some(dayType => !validateTimetable(timetable.profiles[dayType], maxFrequency))) return false;
  return true;
}

function replaceDayProfile(timetable, dayType, daily, maxFrequency = 16) {
  if (!SERVICE_DAY_TYPES.includes(dayType) || !validateTimetable(daily, maxFrequency)) return null;
  const profiles = { ...timetable.profiles, [dayType]: structuredClone(daily) };
  if (timetable.sameEveryDay) {
    for (const type of SERVICE_DAY_TYPES) profiles[type] = structuredClone(daily);
  }
  return { ...timetable, profiles };
}

export function setDailyFrequency(timetable, dayType, periodId, frequency, maxFrequency = 16) {
  if (!validateWeeklyTimetable(timetable, maxFrequency)) return null;
  const daily = timetableForDay(timetable, dayType);
  const updated = setPeriodFrequency(daily, periodId, frequency, maxFrequency);
  return updated ? replaceDayProfile(timetable, dayType, updated, maxFrequency) : null;
}

export function setDailyProfile(timetable, dayType, profileId, maxFrequency = 16) {
  if (!validateWeeklyTimetable(timetable, maxFrequency) || !TIMETABLE_PROFILES[profileId]) return null;
  return replaceDayProfile(timetable, dayType, createTimetable(profileId, maxFrequency), maxFrequency);
}

export function copyTimetableDay(timetable, sourceDayType, targetDayType, maxFrequency = 16) {
  if (!validateWeeklyTimetable(timetable, maxFrequency) || !SERVICE_DAY_TYPES.includes(sourceDayType)
    || !SERVICE_DAY_TYPES.includes(targetDayType)) return null;
  if (sourceDayType === targetDayType) return structuredClone(timetable);
  return {
    ...timetable,
    sameEveryDay: false,
    profiles: { ...timetable.profiles, [targetDayType]: structuredClone(timetable.profiles[sourceDayType]) }
  };
}

export function setSameScheduleEveryDay(timetable, sameEveryDay, sourceDayType = 'weekday') {
  if (!validateWeeklyTimetable(timetable) || typeof sameEveryDay !== 'boolean'
    || !SERVICE_DAY_TYPES.includes(sourceDayType)) return null;
  const profiles = { ...timetable.profiles };
  if (sameEveryDay) {
    for (const dayType of SERVICE_DAY_TYPES) profiles[dayType] = structuredClone(profiles[sourceDayType]);
  }
  return { ...timetable, sameEveryDay, profiles };
}

export function setPeriodFrequency(timetable, periodId, frequency, maxFrequency = 16) {
  if (!timetable?.periods?.some(period => period.id === periodId)) return null;
  return {
    ...timetable,
    profileId: 'custom',
    periods: timetable.periods.map(period => period.id === periodId
      ? { ...period, frequency: clampFrequency(frequency, maxFrequency) }
      : { ...period })
  };
}

export function periodAt(timetable, minuteOfDay) {
  const minute = ((Math.floor(minuteOfDay) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return timetable?.periods?.find(period => containsMinute(period, minute)) || null;
}

export function frequencyAt(timetable, minuteOfDay, fallbackFrequency = 0, dayType = 'weekday') {
  return clampFrequency(periodAt(timetableForDay(timetable, dayType), minuteOfDay)?.frequency ?? fallbackFrequency);
}

export function averageFrequency(timetable, startMinuteOfDay, durationMinutes, fallbackFrequency = 0) {
  const duration = Math.max(0, Number(durationMinutes) || 0);
  if (!duration) return frequencyAt(timetable, startMinuteOfDay, fallbackFrequency);
  let sum = 0;
  for (let offset = 0; offset < duration; offset += 1) {
    sum += frequencyAt(timetable, startMinuteOfDay + offset, fallbackFrequency);
  }
  return sum / duration;
}

export function validateTimetable(timetable, maxFrequency = 16) {
  if (!timetable || typeof timetable !== 'object' || Array.isArray(timetable) || timetable.version !== TIMETABLE_VERSION
    || typeof timetable.profileId !== 'string' || timetable.profileId.length > 40
    || (!Object.hasOwn(TIMETABLE_PROFILES, timetable.profileId) && !['custom', 'legacy-uniform'].includes(timetable.profileId))
    || timetable.calendar !== 'all-days' || !Array.isArray(timetable.periods)
    || timetable.periods.length < 1 || timetable.periods.length > 12) return false;
  const ids = new Set();
  for (const period of timetable.periods) {
    if (!period || typeof period.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(period.id) || ids.has(period.id)
      || typeof period.label !== 'string' || !period.label.trim() || period.label.length > 60
      || !Number.isInteger(period.startMinute) || period.startMinute < 0 || period.startMinute >= DAY_MINUTES
      || !Number.isInteger(period.endMinute) || period.endMinute < 0 || period.endMinute >= DAY_MINUTES
      || period.startMinute === period.endMinute || typeof period.frequency !== 'number'
      || !Number.isFinite(period.frequency) || period.frequency < 0 || period.frequency > maxFrequency) return false;
    ids.add(period.id);
  }
  for (let minute = 0; minute < DAY_MINUTES; minute += 1) {
    if (timetable.periods.filter(period => containsMinute(period, minute)).length !== 1) return false;
  }
  return true;
}

export function formatTimetableTime(minute) {
  const normalized = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
