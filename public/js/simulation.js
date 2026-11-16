export const SIMULATION = {
  realTickMs: 1000,
  minutesPerTick: 6,
  startMinute: 6 * 60,
  farePerPassenger: 7,
  subsidyPerPassengerKm: 0.28,
  eventIntervalMinutes: 6 * 60
};

export const CALENDAR_START_DATE = '2026-01-05';
export const DEFAULT_SIMULATION_CALENDAR = Object.freeze({
  version: 1,
  startDate: CALENDAR_START_DATE,
  specialDays: Object.freeze([])
});

const WEEKDAY_NAMES = Object.freeze(['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']);
const SERVICE_DAY_LABELS = Object.freeze({
  weekday: 'Dzień roboczy', saturday: 'Sobota', sunday: 'Niedziela', special: 'Dzień specjalny'
});

function validDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createSimulationCalendar(startDate = CALENDAR_START_DATE) {
  if (!validDateString(startDate)) throw new RangeError('Invalid calendar start date.');
  return { version: 1, startDate, specialDays: [] };
}

export function validateSimulationCalendar(calendar) {
  return calendar !== null && typeof calendar === 'object' && !Array.isArray(calendar)
    && calendar.version === 1 && validDateString(calendar.startDate)
    && Array.isArray(calendar.specialDays) && calendar.specialDays.length <= 366
    && calendar.specialDays.every(validDateString)
    && new Set(calendar.specialDays).size === calendar.specialDays.length;
}

export function setSpecialDay(calendar, date, special = true) {
  if (!validateSimulationCalendar(calendar) || !validDateString(date)) throw new RangeError('Invalid calendar date.');
  const dates = new Set(calendar.specialDays);
  if (special && !dates.has(date) && dates.size >= 366) throw new RangeError('Too many special calendar dates.');
  if (special) dates.add(date);
  else dates.delete(date);
  return { ...calendar, specialDays: [...dates].sort() };
}

export function calendarAt(elapsedMinutes, calendar = DEFAULT_SIMULATION_CALENDAR) {
  const source = validateSimulationCalendar(calendar) ? calendar : DEFAULT_SIMULATION_CALENDAR;
  const absolute = SIMULATION.startMinute + elapsedMinutes;
  const dayIndex = Math.floor(absolute / 1440);
  const minuteOfDay = ((Math.floor(absolute) % 1440) + 1440) % 1440;
  const date = new Date(`${source.startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  const dateText = date.toISOString().slice(0, 10);
  const weekdayIndex = (date.getUTCDay() + 6) % 7;
  const dayType = source.specialDays.includes(dateText)
    ? 'special' : weekdayIndex === 5 ? 'saturday' : weekdayIndex === 6 ? 'sunday' : 'weekday';
  return {
    day: dayIndex + 1,
    dayIndex,
    week: Math.floor(dayIndex / 7) + 1,
    weekdayIndex,
    weekday: WEEKDAY_NAMES[date.getUTCDay()],
    date: dateText,
    dayType,
    dayTypeLabel: SERVICE_DAY_LABELS[dayType],
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    minuteOfDay
  };
}

export function calendarTickContext(elapsedMinutes, durationMinutes = SIMULATION.minutesPerTick, calendar = DEFAULT_SIMULATION_CALENDAR) {
  const duration = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const current = calendarAt(elapsedMinutes, calendar);
  const serviceDayTypes = Array.from({ length: duration }, (_value, minute) =>
    calendarAt(elapsedMinutes - duration + minute, calendar).dayType);
  return {
    ...current,
    serviceDayType: current.dayType,
    intervalServiceDayTypes: serviceDayTypes
  };
}

export function gameClock(elapsedMinutes, calendar = DEFAULT_SIMULATION_CALENDAR) {
  const clock = calendarAt(elapsedMinutes, calendar);
  return {
    ...clock,
    label: `Dzień ${clock.day} · ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
  };
}

export function demandMultiplier(minuteOfDay) {
  const hour = minuteOfDay / 60;
  if ((hour >= 7 && hour < 9.5) || (hour >= 15.5 && hour < 18.5)) return 1.75;
  if (hour >= 22 || hour < 5) return 0.28;
  if (hour >= 11 && hour < 14) return 1.15;
  return 0.82;
}

export function trafficMultiplier(type, minuteOfDay) {
  const peak = demandMultiplier(minuteOfDay) > 1.5;
  if (type === 'bus' && peak) return 0.68;
  if (type === 'tram' && peak) return 0.9;
  return 1;
}

