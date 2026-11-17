import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarAt, calendarTickContext, DEFAULT_SIMULATION_CALENDAR, setSpecialDay } from '../public/js/simulation.js';
import { chooseDestination, pointDemandScore } from '../public/js/demand.js';
import {
  copyTimetableDay, createWeeklyTimetable, frequencyAt, setDailyFrequency, setSameScheduleEveryDay
} from '../public/js/timetable.js';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { loadGame, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';
import { lineMetrics } from '../public/js/transport.js';
import { applyEconomyTick } from '../public/js/economy.js';

test('the deterministic calendar starts Monday 2026-01-05 and changes day and week at midnight', () => {
  assert.deepEqual(
    (({ date, day, week, weekday, dayType, minuteOfDay }) => ({ date, day, week, weekday, dayType, minuteOfDay }))(calendarAt(0)),
    { date: '2026-01-05', day: 1, week: 1, weekday: 'Poniedziałek', dayType: 'weekday', minuteOfDay: 360 }
  );
  const sunday = calendarAt(6 * 1440 + 18 * 60 - 1);
  const monday = calendarAt(6 * 1440 + 18 * 60);
  assert.deepEqual([sunday.date, sunday.week, sunday.weekday, sunday.dayType], ['2026-01-11', 1, 'Niedziela', 'sunday']);
  assert.deepEqual([monday.date, monday.week, monday.weekday, monday.dayType], ['2026-01-12', 2, 'Poniedziałek', 'weekday']);
  assert.deepEqual([calendarAt(18 * 60).date, calendarAt(18 * 60).minuteOfDay], ['2026-01-06', 0]);
});

test('special dates override the normal weekday type and can be toggled deterministically', () => {
  const calendar = structuredClone(DEFAULT_SIMULATION_CALENDAR);
  const marked = setSpecialDay(calendar, '2026-01-06', true);
  assert.equal(calendarAt(18 * 60, marked).dayType, 'special');
  assert.equal(calendarAt(18 * 60, setSpecialDay(marked, '2026-01-06', false)).dayType, 'weekday');
  assert.equal(calendarAt(5 * 1440 + 360).dayType, 'saturday');
  assert.equal(calendarAt(6 * 1440 + 360).dayType, 'sunday');
  assert.throws(() => setSpecialDay(calendar, '2026-02-30', true), /date/i);
  const fullCalendar = { ...calendar, specialDays: Array.from({ length: 366 }, (_value, index) => {
    const date = new Date('2027-01-01T00:00:00.000Z'); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10);
  }) };
  assert.throws(() => setSpecialDay(fullCalendar, '2028-01-02', true), /too many/i);
});

test('calendar tick context includes both day profiles when a six-minute tick crosses Sunday midnight', () => {
  const context = calendarTickContext(6 * 1440 + 18 * 60 + 3, 6);
  assert.equal(context.serviceDayType, 'weekday');
  assert.deepEqual(context.intervalServiceDayTypes, ['sunday', 'sunday', 'sunday', 'weekday', 'weekday', 'weekday']);
});

test('weekly line schedules support independent profiles, copy, same-every-day and zero service', () => {
  const weekly = createWeeklyTimetable('balanced', 8);
  const independent = setSameScheduleEveryDay(weekly, false, 'weekday');
  const weekend = setDailyFrequency(independent, 'saturday', 'morning-peak', 0, 8);
  assert.equal(frequencyAt(weekend, 7 * 60, 3, 'saturday'), 0);
  assert.equal(frequencyAt(weekend, 7 * 60, 3, 'weekday'), 4);
  const copied = copyTimetableDay(weekend, 'weekday', 'saturday');
  assert.equal(frequencyAt(copied, 7 * 60, 3, 'saturday'), 4);
  const same = setSameScheduleEveryDay(copied, true, 'sunday');
  assert.equal(same.sameEveryDay, true);
  assert.deepEqual(same.profiles.sunday.periods, same.profiles.weekday.periods);
  assert.deepEqual(same.profiles.special.periods, same.profiles.weekday.periods);
});

test('day profiles change actual line capacity, fleet need and operating cost', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const line = game.chooseStarterRoute('loop-center').line;
  line.timetable = setSameScheduleEveryDay(line.timetable, false, 'weekday');
  line.timetable = setDailyFrequency(line.timetable, 'saturday', 'morning-peak', 0, 8);
  const workday = lineMetrics(line, game.city, 8 * 60, { serviceDayType: 'weekday' });
  const weekend = lineMetrics(line, game.city, 8 * 60, { serviceDayType: 'saturday' });
  assert.equal(workday.requestedFrequency, 4);
  assert.equal(weekend.requestedFrequency, 0);
  assert.ok(workday.capacityPerHour > weekend.capacityPerHour);
  assert.ok(workday.requiredVehicles > weekend.requiredVehicles);
  assert.ok(workday.costPerHour > weekend.costPerHour);
});

test('week-boundary operating cost averages Sunday and weekday schedules within the tick', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const line = game.chooseStarterRoute('loop-center').line;
  line.timetable = setSameScheduleEveryDay(line.timetable, false, 'weekday');
  line.timetable = setDailyFrequency(line.timetable, 'sunday', 'night', 0, 8);
  line.timetable = setDailyFrequency(line.timetable, 'weekday', 'night', 4, 8);
  const elapsed = 6 * 1440 + 18 * 60 + 3;
  const context = calendarTickContext(elapsed, 6);
  const metrics = lineMetrics(line, game.city, context.minuteOfDay, {
    intervalMinutes: 6, intervalStartMinuteOfDay: context.minuteOfDay - 6,
    serviceDayType: context.serviceDayType, intervalServiceDayTypes: context.intervalServiceDayTypes
  });
  assert.deepEqual(context.intervalServiceDayTypes, ['sunday', 'sunday', 'sunday', 'weekday', 'weekday', 'weekday']);
  const sundayMetrics = lineMetrics(line, game.city, 1437, { serviceDayType: 'sunday' });
  const weekdayMetrics = lineMetrics(line, game.city, 0, { serviceDayType: 'weekday' });
  assert.equal(metrics.averageEffectiveFrequency, (sundayMetrics.effectiveFrequency + weekdayMetrics.effectiveFrequency) / 2);
  assert.equal(metrics.requestedFrequency, 4);
  assert.equal(metrics.averageCapacityPerHour, sundayMetrics.capacityPerHour / 2 + weekdayMetrics.capacityPerHour / 2);
  game.state.elapsedMinutes = elapsed;
  applyEconomyTick(game.state, 0, 6);
  assert.ok(Math.abs(line.stats.expenses - metrics.averageCostPerHour * 6 / 60) < 1e-9);
});

test('work and leisure place profiles change demand by day type, including destination choice', () => {
  const office = { id: 'office', type: 'commercial', profile: 'office', demand: 10 };
  const park = { id: 'park', type: 'commercial', profile: 'tourist', demand: 10 };
  assert.ok(pointDemandScore(office, 8 * 60, 'destination', 'weekday')
    > pointDemandScore(office, 8 * 60, 'destination', 'sunday'));
  assert.ok(pointDemandScore(park, 13 * 60, 'destination', 'saturday')
    > pointDemandScore(park, 13 * 60, 'destination', 'weekday'));
  assert.equal(chooseDestination(office, [office, park], 13 * 60, () => 0.9, 'saturday').id, 'park');
});

function makeStorage(raw) {
  const values = new Map([[SAVE_KEY, JSON.stringify(raw)]]);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

function savedGameState() {
  const game = new UrbanFlowGame(CITIES.krakow);
  assert.ok(game.chooseStarterRoute('loop-center').line);
  game.state.campaign.completed = ['gateway'];
  game.state.budget -= 321;
  return JSON.parse(JSON.stringify(game.state));
}

test('schema 2 migrates the legacy uniform frequency to all four day profiles without losing progress', () => {
  const state = savedGameState();
  state.lines[0].frequency = 2.5;
  for (const line of state.lines) { delete line.timetable; delete line.previousTimetable; }
  delete state.calendar;
  const storage = makeStorage({ version: 2, cityId: CITIES.krakow.id, state });
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.lines[0].timetable.profiles.sunday.periods[0].frequency, 2.5);
  assert.equal(loaded.state.lines[0].timetable.profiles.special.periods[4].frequency, 2.5);
  assert.deepEqual(loaded.state.campaign.completed, ['gateway']);
  assert.equal(loaded.state.budget, state.budget);
  assert.equal(JSON.parse(storage.values.get(SAVE_KEY)).version, 6);
});

test('schema 3 daily profiles migrate identically to every day and schema 4 round-trips deterministically', () => {
  const state = savedGameState();
  state.lines[0].timetable = {
    version: 1, profileId: 'custom', calendar: 'all-days',
    periods: [
      { id: 'morning-peak', label: 'Szczyt poranny', startMinute: 360, endMinute: 540, frequency: 5 },
      { id: 'midday', label: 'Międzyszczyt', startMinute: 540, endMinute: 900, frequency: 3 },
      { id: 'afternoon-peak', label: 'Szczyt popołudniowy', startMinute: 900, endMinute: 1140, frequency: 4 },
      { id: 'evening', label: 'Wieczór', startMinute: 1140, endMinute: 1380, frequency: 2 },
      { id: 'night', label: 'Noc', startMinute: 1380, endMinute: 360, frequency: 0 }
    ]
  };
  delete state.calendar;
  const loaded = loadGame(makeStorage({ version: 3, cityId: CITIES.krakow.id, state }), CITIES.krakow);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.lines[0].timetable.profiles.saturday.periods[0].frequency, 5);
  assert.equal(loaded.state.lines[0].timetable.profiles.weekday.periods[4].frequency, 0);
  assert.equal(SAVE_VERSION, 6);
});

test('malformed schema 4 special-day data is rejected and preserved for recovery', () => {
  const state = savedGameState();
  state.calendar = { version: 1, startDate: '2026-01-05', specialDays: ['2026-02-30'] };
  const storage = makeStorage({ version: 4, cityId: CITIES.krakow.id, state });
  const raw = storage.values.get(SAVE_KEY);
  assert.equal(loadGame(storage, CITIES.krakow).state, null);
  assert.equal(storage.values.get(`${SAVE_KEY}.recovery`), raw);
});

test('schema 4 migrates to schema 6 without changing lines, fleet, budget, or campaign progress', () => {
  const state = savedGameState();
  state.budget = 12345;
  state.campaign.completed = ['gateway'];
  const storage = makeStorage({ version: 4, cityId: CITIES.krakow.id, state });
  const result = loadGame(storage, CITIES.krakow);
  assert.equal(result.error, null);
  assert.equal(result.state.budget, 12345);
  assert.deepEqual(result.state.lines, state.lines);
  assert.deepEqual(result.state.fleet, state.fleet);
  assert.deepEqual(result.state.campaign.completed, ['gateway']);
  assert.equal(result.state.mobility.version, 1);
  assert.equal(JSON.parse(storage.values.get(SAVE_KEY)).version, 6);
});
