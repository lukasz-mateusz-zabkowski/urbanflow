import { lineMetrics } from './transport.js?v=10';
import { SIMULATION, calendarTickContext, gameClock } from './simulation.js?v=10';
import { createLineStats } from './passengers.js?v=10';
import { fleetSnapshot } from './fleet.js?v=10';
import { TRANSPORT_TYPES } from './transport.js?v=10';

export const formatMoney = value => new Intl.NumberFormat('pl-PL', {
  style: 'currency', currency: 'PLN', maximumFractionDigits: 0
}).format(value);

export function applyEconomyTick(state, transported, deltaMinutes = SIMULATION.minutesPerTick) {
  state.economyMinutes = (state.economyMinutes || 0) + deltaMinutes;
  const now = state.economyMinutes;
  const simulationMinute = state.elapsedMinutes ?? state.transportMinutes ?? now;
  const clock = gameClock(simulationMinute, state.calendar);
  const intervalContext = calendarTickContext(simulationMinute, deltaMinutes, state.calendar);
  const minuteOfDay = clock.minuteOfDay;
  const pending = state._pendingLineRevenue || {};
  const pendingPassengerKm = state._pendingLinePassengerKm || {};
  const fareRevenue = Math.max(0, transported) * SIMULATION.farePerPassenger;
  const passengerKm = Object.values(pendingPassengerKm).reduce((sum, value) => sum + Math.max(0, value || 0), 0);
  const subsidyRevenue = passengerKm * SIMULATION.subsidyPerPassengerKm;
  let maintenance = 0;
  let maintenancePerHour = 0;
  for (const line of state.lines) {
    line.stats = { ...createLineStats(), ...line.stats };
    const metrics = lineMetrics(line, state.city, minuteOfDay, { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes ?? now,
      intervalMinutes: deltaMinutes, intervalStartMinuteOfDay: minuteOfDay - deltaMinutes,
      serviceDayType: clock.dayType, intervalServiceDayTypes: intervalContext.intervalServiceDayTypes });
    const cost = metrics.averageCostPerHour * deltaMinutes / 60;
    const linePassengerKm = pendingPassengerKm[line.id] || 0;
    const subsidy = linePassengerKm * SIMULATION.subsidyPerPassengerKm;
    const revenue = (pending[line.id] || 0) + subsidy;
    maintenance += cost;
    maintenancePerHour += metrics.averageCostPerHour;
    line.stats.revenue += revenue;
    line.stats.passengerKm = (line.stats.passengerKm || 0) + linePassengerKm;
    line.stats.subsidy = (line.stats.subsidy || 0) + subsidy;
    line.stats.idleCostPerHour = metrics.idleCostPerHour;
    line.stats.expenses += cost;
    const history = [...(line.stats.history || []), { at: now, revenue, cost, minutes: deltaMinutes }]
      .filter(entry => entry.at > now - 60);
    line.stats.history = history;
    const duration = Math.max(deltaMinutes, history.reduce((sum, entry) => sum + entry.minutes, 0));
    line.stats.revenuePerHour = history.reduce((sum, entry) => sum + entry.revenue, 0) * 60 / duration;
    line.stats.costPerHour = history.reduce((sum, entry) => sum + entry.cost, 0) * 60 / duration;
    line.stats.balancePerHour = line.stats.revenuePerHour - line.stats.costPerHour;
  }
  const reserveCostPerHour = Object.entries(fleetSnapshot(state)).reduce((sum, [type, fleet]) =>
    sum + fleet.reserve * TRANSPORT_TYPES[type].maintenance * 0.1, 0);
  const reserveCost = reserveCostPerHour * deltaMinutes / 60;
  maintenance += reserveCost; maintenancePerHour += reserveCostPerHour;
  state.fleetReserveCostPerHour = reserveCostPerHour;
  state._pendingLineRevenue = {};
  state._pendingLinePassengerKm = {};
  state.budget += fareRevenue + subsidyRevenue - maintenance;
  state.revenue = (state.revenue || 0) + fareRevenue + subsidyRevenue;
  state.subsidies = (state.subsidies || 0) + subsidyRevenue;
  state.passengerKm = (state.passengerKm || 0) + passengerKm;
  state.expenses = (state.expenses || 0) + maintenance;
  return { fareRevenue, subsidyRevenue, passengerKm, maintenance, maintenancePerHour, operatingBalance: fareRevenue + subsidyRevenue - maintenance };
}
