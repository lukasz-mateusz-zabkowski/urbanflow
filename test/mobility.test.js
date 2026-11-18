import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegularTravelPatterns, departuresForTick, createMobilityState, recordCompletedJourney, recordAccessibilityOpportunity, mobilitySnapshot, journeySatisfaction } from '../public/js/mobility.js';
import { planTransitJourney, diagnoseTransitRelation, createLineStats, passengerTick, createPassengerState, intervalDemandScore, stopQueueLimit } from '../public/js/passengers.js';
import { calendarAt, calendarTickContext, createSimulationCalendar, setSpecialDay } from '../public/js/simulation.js';
import { CITIES } from '../public/js/cities.js';
import { createCityEvolutionState } from '../public/js/city-evolution.js';
import { landUseDemandFactor } from '../public/js/land-use.js';

const places = [
  { id: 'home', name: 'Osiedle', lat: 50, lng: 19, type: 'district', profile: 'residential', demand: 12 },
  { id: 'work', name: 'Zakłady', lat: 50.02, lng: 19.02, type: 'district', profile: 'industrial', demand: 10 },
  { id: 'school', name: 'Uczelnia', lat: 50.01, lng: 19.03, type: 'district', profile: 'education', demand: 8 },
  { id: 'center', name: 'Centrum', lat: 50.03, lng: 19.01, type: 'hub', profile: 'center', demand: 12 },
  { id: 'park', name: 'Park', lat: 50.04, lng: 19.04, type: 'district', profile: 'tourist', demand: 9 }
];
const line = (id, type, stops, extra = {}) => ({ id, type, stops, distanceKm: 6, vehicles: 8, frequency: 4,
  timetable: null, stats: createLineStats(), ...extra });

test('regular trip patterns are stable OD aggregates for work, school, shopping, recreation, and returns', () => {
  const first = buildRegularTravelPatterns(places);
  assert.deepEqual(first, buildRegularTravelPatterns(places));
  const purposes = new Set(first.map(pattern => pattern.purpose));
  for (const purpose of ['work', 'school', 'shopping', 'recreation', 'occasional']) assert.ok(purposes.has(purpose), purpose);
  assert.ok(first.some(pattern => pattern.purpose === 'work' && pattern.origin === 'home' && pattern.destination === 'work' && pattern.direction === 'outbound'));
  assert.ok(first.some(pattern => pattern.purpose === 'work' && pattern.origin === 'work' && pattern.destination === 'home' && pattern.direction === 'return'));
  assert.ok(first.every(pattern => pattern.id && pattern.passengers > 0 && Array.isArray(pattern.dayTypes)));
});

test('recurring departures occur once when their modeled day and minute cross a simulation tick', () => {
  const patterns = buildRegularTravelPatterns(places);
  const weekdayWork = patterns.find(pattern => pattern.purpose === 'work' && pattern.direction === 'outbound');
  const sunday = departuresForTick([weekdayWork], weekdayWork.departureMinute + 6, 6, ['sunday', 'sunday', 'sunday', 'sunday', 'sunday', 'sunday']);
  assert.equal(sunday.length, 0, 'a weekday commute does not leave on Sunday before midnight');
  const monday = departuresForTick([weekdayWork], 96, 6, ['weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday']);
  assert.equal(monday.length, 0, '07:30 differs from this template’s configured morning slot');
  const matching = departuresForTick([weekdayWork], weekdayWork.departureMinute + 6, 6,
    Array(6).fill('weekday'));
  assert.equal(matching.length, 1);
  assert.equal(matching[0].pattern.id, weekdayWork.id);
});

test('route planning accounts for ride, expected waits, transfers, service and crowding', () => {
  const lines = [
    line('slow-direct', 'bus', ['home', 'center'], { frequency: 1, distanceKm: 12 }),
    line('feeder', 'bus', ['home', 'school'], { frequency: 4 }),
    line('trunk', 'tram', ['school', 'center'], { frequency: 6, stats: { ...createLineStats(), load: 0.1 } })
  ];
  const result = planTransitJourney(lines, places, 'home', 'center', 8 * 60);
  assert.equal(result.ok, true);
  assert.ok(result.route.length >= 1);
  assert.ok(result.diagnostics.travelMinutes > 0);
  assert.ok(result.diagnostics.expectedWaitMinutes >= 0);
  assert.ok(result.diagnostics.transfers >= 0);
  assert.ok(result.diagnostics.totalMinutes >= result.diagnostics.travelMinutes);
  const crowded = lines.map(item => item.id === 'slow-direct' ? { ...item, stats: { ...item.stats, load: 1.4 } } : item);
  const alternative = planTransitJourney(crowded, places, 'home', 'center', 8 * 60);
  assert.equal(alternative.ok, true);
  assert.ok(alternative.route.every(leg => leg.lineId !== 'slow-direct'), 'the planner avoids a saturated direct line when a viable alternative exists');
  assert.ok(alternative.diagnostics.capacityPerHour > 0);
});

test('route diagnostics distinguish disconnected, unscheduled, and available relations', () => {
  const noConnection = diagnoseTransitRelation([], places, 'home', 'park', 8 * 60);
  assert.equal(noConnection.reason, 'noConnection');
  const noService = diagnoseTransitRelation([line('night-only', 'bus', ['home', 'park'], { frequency: 0 })], places, 'home', 'park', 8 * 60);
  assert.equal(noService.reason, 'noService');
  const available = diagnoseTransitRelation([line('day', 'bus', ['home', 'park'])], places, 'home', 'park', 8 * 60);
  assert.equal(available.reason, 'available');
  assert.ok(available.plan.diagnostics.totalMinutes > 0);
});

test('completed-trip satisfaction uses observed journey facts and stays separate from network access', () => {
  const mobility = createMobilityState();
  recordCompletedJourney(mobility, { count: 4, totalWaitMinutes: 12, journeyMinutes: 48, transfers: 1, crowdingMinutes: 6 });
  recordCompletedJourney(mobility, { count: 2, totalWaitMinutes: 4, journeyMinutes: 25, transfers: 0, crowdingMinutes: 0 });
  recordAccessibilityOpportunity(mobility, 'noConnection', 5);
  recordAccessibilityOpportunity(mobility, 'available', 6);
  const snapshot = mobilitySnapshot({ mobility, cohorts: [], diagnostics: { relations: {}, failures: {} } }, places);
  assert.equal(snapshot.completedTrips, 6);
  assert.equal(snapshot.activeTrips, 0);
  assert.equal(snapshot.transferShare, 4 / 6);
  assert.equal(snapshot.averageWaitMinutes, 56 / 6);
  assert.equal(snapshot.accessibility.opportunities, 11);
  assert.equal(snapshot.accessibility.reachable, 6);
  const expectedSatisfaction = (journeySatisfaction({ totalWaitMinutes: 12, journeyMinutes: 48, transfers: 1, crowdingMinutes: 6 }) * 4
    + journeySatisfaction({ totalWaitMinutes: 4, journeyMinutes: 25 }) * 2) / 6;
  assert.equal(snapshot.completedSatisfaction, expectedSatisfaction);
});

test('passenger demand averages day types across Sunday-to-weekday and ordinary-to-special ticks', () => {
  const calendar = createSimulationCalendar();
  const work = places.find(point => point.id === 'work');
  const run = (elapsed, sourceCalendar) => {
    const highDemandPlaces = places.map(point => ({ ...point, demand: point.demand * 20 }));
    const state = { elapsedMinutes: elapsed, calendar: sourceCalendar, lines: [line('service', 'bus', ['home', 'work'])],
      city: { points: highDemandPlaces }, passengers: createPassengerState(highDemandPlaces), cohorts: [], stopCapacity: 120,
      diagnostics: undefined, mobility: createMobilityState() };
    const clock = calendarAt(elapsed, sourceCalendar);
    const context = calendarTickContext(elapsed, 6, sourceCalendar);
    const values = [0.1, 0.99, 0.1, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
    let index = 0;
    const result = passengerTick(state, highDemandPlaces, clock.minuteOfDay, () => values[index++] ?? 0.99, context);
    return { result, state, context };
  };
  const mondayMidnight = run(6 * 1440 + 18 * 60 + 3, calendar);
  assert.deepEqual(mondayMidnight.context.intervalServiceDayTypes, ['sunday', 'sunday', 'sunday', 'weekday', 'weekday', 'weekday']);
  const specialCalendar = setSpecialDay(calendar, '2026-01-06', true);
  const specialMidnight = run(18 * 60 + 3, specialCalendar);
  assert.deepEqual(specialMidnight.context.intervalServiceDayTypes, ['weekday', 'weekday', 'weekday', 'special', 'special', 'special']);
  assert.ok(mondayMidnight.result.generated > 0);
  assert.ok(specialMidnight.result.generated > 0);
  const residential = { ...places[0], demand: 1000 };
  assert.notEqual(intervalDemandScore(residential, 3, 6, mondayMidnight.context.intervalServiceDayTypes),
    intervalDemandScore(residential, 3, 6, specialMidnight.context.intervalServiceDayTypes));
  assert.ok(work.profile === 'industrial');
});

test('a recurring trip with no operating path updates accessibility diagnostics without fabricating a journey', () => {
  const commute = buildRegularTravelPatterns(places).find(pattern => pattern.purpose === 'work' && pattern.direction === 'outbound');
  const mobility = createMobilityState([commute]);
  const state = { elapsedMinutes: commute.departureMinute, lines: [], city: { points: places }, passengers: createPassengerState(places),
    cohorts: [], mobility, stopCapacity: 120 };
  const context = { serviceDayType: 'weekday', intervalServiceDayTypes: Array(6).fill('weekday'), intervalStartMinuteOfDay: commute.departureMinute };
  const result = passengerTick(state, places, commute.departureMinute + 6, () => 0.99, context);
  assert.equal(result.generated, 0);
  assert.equal(state.cohorts.length, 0);
  assert.ok(state.mobility.accessibility.opportunities > 0);
  assert.ok(state.mobility.accessibility.byReason.noConnection > 0);
});

test('land use reweights one existing recurring cohort by origin, destination, time and day without adding a second trip', () => {
  const patterns = buildRegularTravelPatterns(places);
  const commute = patterns.find(pattern => pattern.purpose === 'work' && pattern.direction === 'outbound');
  const mobility = createMobilityState([commute]);
  const evolution = createCityEvolutionState({ points: places });
  evolution.districts.home.landUse.shares = { residential: 100, retail: 0, office: 0, industrial: 0, public: 0, green: 0, reserve: 0 };
  evolution.districts.work.landUse.shares = { residential: 0, retail: 0, office: 100, industrial: 0, public: 0, green: 0, reserve: 0 };
  const expectedCount = Math.max(1, Math.round(commute.passengers
    * landUseDemandFactor(evolution.districts.home.landUse, 'origin', commute.departureMinute, 'weekday')
    * landUseDemandFactor(evolution.districts.work.landUse, 'destination', commute.departureMinute, 'weekday')));
  const state = { elapsedMinutes: commute.departureMinute, city: { points: places }, cityEvolution: evolution,
    lines: [line('commute', 'bus', ['home', 'work'], { vehicles: 8, frequency: 8 })],
    passengers: createPassengerState(places), cohorts: [], mobility, stopCapacity: 120 };
  const context = { serviceDayType: 'weekday', intervalServiceDayTypes: Array(6).fill('weekday'),
    intervalStartMinuteOfDay: commute.departureMinute };
  const result = passengerTick(state, places, commute.departureMinute + 6, () => 0.99, context);
  assert.equal(result.generated, expectedCount);
  assert.equal(state.cohorts.length, 1, 'land use changes the size of an existing OD cohort, not the number of cohorts');
  assert.equal(state.cohorts[0].count, expectedCount);
  assert.equal(state.diagnostics.relations['home>work'], expectedCount);
});

test('existing Kraków places provide deterministic bounded pattern candidates', () => {
  const city = CITIES.krakow;
  const patterns = buildRegularTravelPatterns(city.points);
  assert.ok(patterns.length > 0);
  assert.ok(patterns.length <= city.points.filter(point => point.type !== 'stop').length * 8);
  assert.ok(patterns.every(pattern => city.points.some(point => point.id === pattern.origin)
    && city.points.some(point => point.id === pattern.destination)));
});

test('served hub upgrade raises only the selected point queue limit by 50 percent per level', () => {
  const state = { stopCapacity: 120, hubCapacityByPoint: { hub: 1.5 } };
  assert.equal(stopQueueLimit(state, 'home'), 480);
  assert.equal(stopQueueLimit(state, 'hub'), 720);
  state.hubCapacityByPoint.hub = 2;
  assert.equal(stopQueueLimit(state, 'hub'), 960);
  state.stopCapacity = 1000;
  assert.equal(stopQueueLimit(state, 'hub'), 1200, 'per-point queues keep a hard upper bound');
});
