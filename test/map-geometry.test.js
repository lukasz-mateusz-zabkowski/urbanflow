import test from 'node:test';
import assert from 'node:assert/strict';
import { positionOnRoute, routeGeometry, vehiclePhase, stopVisibleAtZoom } from '../public/js/map.js';
import { CITIES } from '../public/js/cities.js';
import { lineMetrics } from '../public/js/transport.js';

test('vehicles follow geographic distance across intermediate stops, not equally sized segments', () => {
  const geometry = routeGeometry([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 4 }]);
  const halfway = positionOnRoute(geometry, 0.5);
  assert.ok(Math.abs(halfway.latlng[1] - 2) < 0.00001);
  assert.equal(halfway.heading, 90);
  assert.equal(positionOnRoute(geometry, 0.5, -1).heading, 270);
  assert.deepEqual(positionOnRoute(geometry, -1).latlng, [0, 0]);
  assert.deepEqual(positionOnRoute(geometry, 2).latlng, [0, 4]);
});

test('empty and repeated geographic stops do not produce invalid coordinates', () => {
  assert.equal(positionOnRoute(routeGeometry([]), 0.5), null);
  const point = { lat: 50, lng: 20 };
  assert.deepEqual(positionOnRoute(routeGeometry([point, point]), 0.5).latlng, [50, 20]);
  const route = routeGeometry([point, point, { lat: 50, lng: 21 }]);
  assert.deepEqual(positionOnRoute(route, 0).latlng, [50, 20]);
  assert.ok(Number.isFinite(positionOnRoute(route, 0.3).heading));
});

test('stop density prioritizes served and selected stops while revealing detail as zoom increases', () => {
  const local = { demand: 1 }, major = { demand: 3 };
  assert.equal(stopVisibleAtZoom(local, 9, false), false);
  assert.equal(stopVisibleAtZoom(major, 9, false), true);
  assert.equal(stopVisibleAtZoom(local, 9, true), true);
  assert.equal(stopVisibleAtZoom(local, 11, false), true);
});

test('vehicle timetable includes both directions and two minute terminus pauses', () => {
  assert.deepEqual(vehiclePhase(5, 0, 2, 5, 10, 24), { progress: 0.5, direction: 1, stopped: false });
  assert.deepEqual(vehiclePhase(11, 0, 2, 5, 10, 24), { progress: 1, direction: -1, stopped: true });
  assert.deepEqual(vehiclePhase(17, 0, 2, 5, 10, 24), { progress: 0.5, direction: -1, stopped: false });
  assert.deepEqual(vehiclePhase(23, 0, 2, 5, 10, 24), { progress: 0, direction: 1, stopped: true });
  assert.equal(vehiclePhase(29, 0, 2, 5, 10, 24).progress, 0.5);
});

test('frequency spaces vehicle departures and leaves excess cycle time at the terminus', () => {
  assert.equal(vehiclePhase(5, 1, 2, 4, 10, 24).stopped, true);
  assert.equal(vehiclePhase(20, 1, 2, 4, 10, 24).progress, 0.5);
  assert.equal(vehiclePhase(26, 0, 2, 4, 10, 24).stopped, true);
  assert.equal(vehiclePhase(20, 0, 0, 0, 10, 24).stopped, true);
});

test('bus animation uses the same slower rush hour travel time as simulation', () => {
  const line = { type: 'bus', stops: ['wieliczka', 'biezanow', 'centrum'], vehicles: 2, frequency: 4 };
  const normal = lineMetrics(line, CITIES.krakow, 720);
  const peak = lineMetrics(line, CITIES.krakow, 480);
  assert.ok(peak.travelMinutes > normal.travelMinutes);
  const atMinute = normal.travelMinutes / 2;
  const normalPhase = vehiclePhase(atMinute, 0, 2, normal.effectiveFrequency, normal.travelMinutes, normal.roundTripMinutes);
  const peakPhase = vehiclePhase(atMinute, 0, 2, peak.effectiveFrequency, peak.travelMinutes, peak.roundTripMinutes);
  assert.ok(peakPhase.progress < normalPhase.progress);
});
