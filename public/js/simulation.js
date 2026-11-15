export const SIMULATION = {
  realTickMs: 1000,
  minutesPerTick: 6,
  startMinute: 6 * 60,
  farePerPassenger: 7,
  subsidyPerPassengerKm: 0.28,
  eventIntervalMinutes: 6 * 60
};

export function gameClock(elapsedMinutes) {
  const absolute = SIMULATION.startMinute + elapsedMinutes;
  const day = Math.floor(absolute / 1440) + 1;
  const minuteOfDay = absolute % 1440;
  return {
    day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    minuteOfDay,
    label: `Dzień ${day} · ${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`
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

