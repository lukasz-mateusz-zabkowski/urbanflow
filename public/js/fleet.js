import { TRANSPORT_TYPES } from './transport.js?v=10';

export const INITIAL_FLEET = { bus: 6, tram: 0, metro: 0, suburban: 0, intercity: 0 };

export function ensureFleet(state) {
  state.fleet ||= {};
  for (const type of Object.keys(TRANSPORT_TYPES)) {
    const assigned = (state.lines || []).filter(line => line.type === type).reduce((sum, line) => sum + Math.max(0, Math.floor(line.vehicles || 0)), 0);
    const saved = state.fleet[type];
    const owned = typeof saved === 'number' ? saved : saved?.owned;
    state.fleet[type] = { owned: Math.max(assigned, Math.floor(Number.isFinite(owned) ? owned : (type === 'bus' ? INITIAL_FLEET.bus : assigned))) };
  }
  return state.fleet;
}

export function fleetStatus(state, type) {
  const fleet = ensureFleet(state);
  const assigned = (state.lines || []).filter(line => line.type === type).reduce((sum, line) => sum + Math.max(0, Math.floor(line.vehicles || 0)), 0);
  return { owned: fleet[type]?.owned || 0, assigned, reserve: Math.max(0, (fleet[type]?.owned || 0) - assigned) };
}

export function fleetSnapshot(state) {
  return Object.fromEntries(Object.keys(TRANSPORT_TYPES).map(type => [type, fleetStatus(state, type)]));
}

export function missingFleetCost(state, type, requested) {
  const missing = Math.max(0, Math.floor(requested) - fleetStatus(state, type).reserve);
  return { missing, cost: missing * TRANSPORT_TYPES[type].vehicleCost };
}
