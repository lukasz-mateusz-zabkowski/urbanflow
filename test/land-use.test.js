import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAND_USE_TYPES, createLandUseProfile, landUseDominantUse, landUseDemandFactor,
  evolveLandUseProfile, capacitiesForLandUse, validateLandUseProfile
} from '../public/js/land-use.js';
import { CITIES } from '../public/js/cities.js';

test('profile-derived land-use allocations are deterministic and total exactly 100 percent', () => {
  const profiles = new Set(CITIES.krakow.points.filter(point => point.type !== 'stop').map(point => point.profile || 'local'));
  for (const profile of profiles) {
    const first = createLandUseProfile(profile);
    assert.deepEqual(first, createLandUseProfile(profile));
    assert.deepEqual(Object.keys(first.shares).sort(), [...LAND_USE_TYPES].sort());
    assert.equal(Object.values(first.shares).reduce((sum, share) => sum + share, 0), 100);
    assert.equal(validateLandUseProfile(first), true);
    assert.ok(['low', 'medium', 'high'].includes(first.intensity));
  }
});

test('connected attractive land develops gradually, uses reserve, and increases capacity without changing occupancy', () => {
  let land = createLandUseProfile('residential');
  const initialReserve = land.shares.reserve;
  const conditions = { profile: 'residential', transportAccess: 90, transportSatisfaction: 90,
    residentialAttractiveness: 90, economicAttractiveness: 70, growthPotential: 85 };
  let upgrade;
  for (let week = 2; week <= 52 && !upgrade; week += 1) {
    const result = evolveLandUseProfile(land, { ...conditions, week });
    land = result.profile;
    upgrade = result.change;
  }
  assert.ok(upgrade, 'a well-served attractive area should eventually intensify within 52 weeks');
  assert.equal(upgrade.fromIntensity, 'low');
  assert.equal(upgrade.toIntensity, 'medium');
  assert.ok(land.shares.reserve < initialReserve);
  assert.equal(Object.values(land.shares).reduce((sum, share) => sum + share, 0), 100);
  assert.ok(land.lastIntensityChangeWeek > 0);
  const oldCapacity = capacitiesForLandUse({ residents: 10000, jobs: 5000 }, createLandUseProfile('residential'));
  const newCapacity = capacitiesForLandUse({ residents: 10000, jobs: 5000 }, land);
  assert.ok(newCapacity.residents > oldCapacity.residents);
  assert.ok(newCapacity.jobs >= oldCapacity.jobs);
});

test('poor transport prevents construction and preserves the development reserve', () => {
  let land = createLandUseProfile('office');
  const reserve = land.shares.reserve;
  for (let week = 2; week <= 52; week += 1) {
    land = evolveLandUseProfile(land, { week, profile: 'office', transportAccess: 0, transportSatisfaction: 10,
      residentialAttractiveness: 90, economicAttractiveness: 90, growthPotential: 90 }).profile;
  }
  assert.equal(land.intensity, createLandUseProfile('office').intensity);
  assert.equal(land.shares.reserve, reserve);
  assert.equal(land.developmentProgress, 0);
});

test('land-use demand follows origin, destination, time of day, and service day', () => {
  const office = createLandUseProfile('office');
  const retail = createLandUseProfile('center');
  assert.ok(landUseDemandFactor(office, 'destination', 7 * 60 + 30, 'weekday')
    > landUseDemandFactor(office, 'destination', 20 * 60, 'weekday'));
  assert.ok(landUseDemandFactor(retail, 'destination', 16 * 60, 'saturday')
    > landUseDemandFactor(retail, 'destination', 5 * 60, 'weekday'));
  assert.ok(landUseDemandFactor(office, 'origin', 16 * 60 + 30, 'weekday')
    > landUseDemandFactor(office, 'origin', 7 * 60 + 30, 'weekday'));
});

test('52-week land-use evolution is deterministic, bounded, and respects exhausted reserve', () => {
  const initial = createLandUseProfile('center');
  const simulate = () => {
    let land = initial;
    const changes = [];
    for (let week = 2; week <= 53; week += 1) {
      const result = evolveLandUseProfile(land, { week, profile: 'center', transportAccess: 85,
        transportSatisfaction: 82, residentialAttractiveness: 76, economicAttractiveness: 86, growthPotential: 80 });
      land = result.profile;
      if (result.change) changes.push(result.change);
    }
    return { land, changes };
  };
  const first = simulate(); const second = simulate();
  assert.deepEqual(first, second);
  assert.ok(first.changes.length > 0);
  assert.ok(first.land.shares.reserve >= 0);
  assert.ok(first.land.developmentProgress >= 0 && first.land.developmentProgress <= 100);
  assert.equal(Object.values(first.land.shares).reduce((sum, share) => sum + share, 0), 100);
  assert.equal(validateLandUseProfile(first.land), true);
});
