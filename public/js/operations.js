import { lineMetrics, TRANSPORT_TYPES } from './transport.js?v=10';
import { gameClock } from './simulation.js?v=10';
import { createWeeklyUniformTimetable, setDailyProfile, TIMETABLE_PROFILES } from './timetable.js?v=10';

const nonNegative = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);

function assignedVehicles(state, type) {
  return (state.lines || []).filter(line => line.type === type)
    .reduce((sum, line) => sum + Math.max(0, Math.floor(Number(line.vehicles) || 0)), 0);
}

function metricsAt(state, line) {
  const clock = gameClock(state.elapsedMinutes || 0, state.calendar);
  return lineMetrics(line, state.city, clock.minuteOfDay, {
    events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes || 0, serviceDayType: clock.dayType
  });
}

function lineWithProposal(state, line, proposal) {
  const type = TRANSPORT_TYPES[line.type];
  if (!type) return { error: 'Nieznany typ transportu.' };
  const result = { ...line, timetable: line.timetable ? structuredClone(line.timetable) : line.timetable };
  const fleet = state.fleet?.[line.type];
  const owned = Math.max(assignedVehicles(state, line.type), Math.floor(Number(typeof fleet === 'number' ? fleet : fleet?.owned) || 0));
  const reserve = Math.max(0, owned - assignedVehicles(state, line.type));
  let oneTimeCost = 0;
  let description = '';

  switch (proposal?.kind) {
    case 'assign':
      if (reserve < 1) return { error: 'Brak pojazdu w rezerwie. Wariant wymaga zakupu lub zwolnienia pojazdu z innej linii.' };
      if (result.vehicles >= 16) return { error: 'Linia osiągnęła limit 16 pojazdów.' };
      result.vehicles = Math.floor(Number(result.vehicles) || 0) + 1;
      description = 'Przydziel 1 pojazd z rezerwy';
      break;
    case 'remove':
      if (Math.floor(Number(result.vehicles) || 0) <= 1) return { error: 'Linia musi zachować co najmniej 1 pojazd.' };
      result.vehicles = Math.floor(Number(result.vehicles) || 0) - 1;
      description = 'Przenieś 1 pojazd do rezerwy';
      break;
    case 'buy':
      if (result.vehicles >= 16) return { error: 'Linia osiągnęła limit 16 pojazdów.' };
      if (nonNegative(state.budget) < type.vehicleCost) return { error: `Brak środków na zakup pojazdu (${type.vehicleCost.toLocaleString('pl-PL')} zł).` };
      result.vehicles = Math.floor(Number(result.vehicles) || 0) + 1;
      oneTimeCost = type.vehicleCost;
      description = 'Kup i przydziel 1 pojazd';
      break;
    case 'frequency': {
      const frequency = Number(proposal.value);
      if (!Number.isFinite(frequency) || frequency < 1 || frequency > type.maxFrequency) return { error: `Częstotliwość musi wynosić od 1 do ${type.maxFrequency} kursów/h.` };
      result.frequency = frequency;
      result.timetable = createWeeklyUniformTimetable(frequency, type.maxFrequency);
      description = `Ustaw jednolitą częstotliwość ${frequency} kursów/h`;
      break;
    }
    case 'profile': {
      if (!Object.hasOwn(TIMETABLE_PROFILES, proposal.profileId)) return { error: 'Wybierz istniejący profil rozkładu.' };
      const clock = gameClock(state.elapsedMinutes || 0, state.calendar);
      const updated = setDailyProfile(result.timetable, clock.dayType, proposal.profileId, type.maxFrequency);
      if (!updated) return { error: 'Nie można zastosować tego profilu dla bieżącego typu dnia.' };
      result.timetable = updated;
      description = `Zastosuj profil „${TIMETABLE_PROFILES[proposal.profileId].label}”`;
      break;
    }
    default:
      return { error: 'Wybierz wariant operacyjny.' };
  }

  return { line: result, oneTimeCost, description };
}

/**
 * Compares model-derived service/cost rates for the same current simulation moment.
 * It intentionally does not forecast passenger counts, fares, or campaign outcomes.
 */
export function compareOperationalDecision(state, lineId, proposal) {
  const original = (state.lines || []).find(line => line.id === lineId);
  if (!original) return { ok: false, reason: 'Nie znaleziono linii.' };
  if (state.status !== 'playing') return { ok: false, reason: 'Kampania jest zakończona; nie można zatwierdzić decyzji.' };
  const staged = lineWithProposal(state, original, proposal);
  if (staged.error) return { ok: false, reason: staged.error };

  const before = metricsAt(state, original);
  const after = metricsAt(state, staged.line);
  return {
    ok: true,
    lineId,
    description: staged.description,
    dayType: gameClock(state.elapsedMinutes || 0, state.calendar).dayType,
    before: { frequency: before.effectiveFrequency, requestedFrequency: before.requestedFrequency, capacityPerHour: before.capacityPerHour, costPerHour: before.costPerHour,
      requiredVehicles: before.requiredVehicles, vehicles: before.vehicles },
    after: { frequency: after.effectiveFrequency, requestedFrequency: after.requestedFrequency, capacityPerHour: after.capacityPerHour, costPerHour: after.costPerHour,
      requiredVehicles: after.requiredVehicles, vehicles: after.vehicles },
    delta: { frequency: after.effectiveFrequency - before.effectiveFrequency,
      capacityPerHour: after.capacityPerHour - before.capacityPerHour,
      costPerHour: after.costPerHour - before.costPerHour,
      requiredVehicles: after.requiredVehicles - before.requiredVehicles },
    oneTimeCost: staged.oneTimeCost,
    observed: { load: Number.isFinite(original.stats?.load) ? original.stats.load : null,
      waiting: Number.isFinite(original.stats?.waiting) ? original.stats.waiting : null,
      revenuePerHour: Number.isFinite(original.stats?.revenuePerHour) ? original.stats.revenuePerHour : null,
      operatingCostPerHour: Number.isFinite(original.stats?.costPerHour) ? original.stats.costPerHour : null },
    assumptions: [
      `Porównanie używa tej samej trasy, pory (${Math.floor(gameClock(state.elapsedMinutes || 0, state.calendar).minuteOfDay / 60)}:00) i typu dnia.`,
      'Przepustowość, częstotliwość, wymagania floty i koszt/h pochodzą z obecnego modelu transportu.',
      'Liczba pasażerów, przychody i kolejki po decyzji nie są prognozowane; pokazane obserwacje dotyczą bieżącej kampanii.'
    ]
  };
}

/** Captures only campaign state that can change the displayed proposal or its safety checks. */
export function operationalDecisionFingerprint(state, lineId, proposal) {
  const line = (state?.lines || []).find(item => item.id === lineId) || null;
  const type = line?.type;
  const city = state?.city;
  return JSON.stringify({
    proposal,
    status: state?.status,
    budget: state?.budget,
    elapsedMinutes: state?.elapsedMinutes,
    calendar: state?.calendar,
    rngState: state?.rngState,
    networkVersion: state?.networkVersion,
    line,
    sameTypeAssignments: type ? (state?.lines || []).filter(item => item.type === type).map(item => [item.id, item.vehicles]) : [],
    fleet: type ? state?.fleet?.[type] ?? null : null,
    city: city ? {
      points: (city.points || []).filter(point => (line?.stops || []).includes(point.id)).map(point => [point.id, point.lat, point.lng]),
      railCorridors: city.railCorridors || []
    } : null,
    cityEvents: state?.cityEvents || []
  });
}

/**
 * Confirms and applies a proposal only if the exact campaign inputs used for its
 * preview remain unchanged for the entire async confirmation interval.
 */
export async function applyOperationalDecisionSafely(game, lineId, proposal, confirm, expectedFingerprint) {
  if (!game?.state || typeof confirm !== 'function') return { ok: false, reason: 'Brak aktywnej kampanii lub potwierdzenia.' };
  const initialFingerprint = operationalDecisionFingerprint(game.state, lineId, proposal);
  const initialPreview = compareOperationalDecision(game.state, lineId, proposal);
  if (!initialPreview.ok) return { ...initialPreview, stale: false };
  if (!expectedFingerprint || expectedFingerprint !== initialFingerprint) {
    return { ok: false, stale: true, reason: 'Stan kampanii zmienił się od ostatniego podglądu.' };
  }

  if (!await confirm(initialPreview)) return { ok: false, cancelled: true };

  const currentFingerprint = operationalDecisionFingerprint(game.state, lineId, proposal);
  const currentPreview = compareOperationalDecision(game.state, lineId, proposal);
  if (currentFingerprint !== initialFingerprint || !currentPreview.ok) {
    return { ok: false, stale: true, reason: 'Stan kampanii zmienił się podczas potwierdzania. Sprawdź i porównaj wariant ponownie.' };
  }

  let result;
  if (proposal.kind === 'assign') result = game.assignVehicle(lineId);
  else if (proposal.kind === 'remove') result = game.unassignVehicle(lineId);
  else if (proposal.kind === 'buy') result = game.buyVehicle(lineId);
  else if (proposal.kind === 'frequency') result = game.setFrequency(lineId, proposal.value);
  else if (proposal.kind === 'profile') result = game.setTimetableProfile(lineId, proposal.profileId, initialPreview.dayType);
  else return { ok: false, reason: 'Nieznany wariant operacyjny.' };

  return result?.ok ? { ...result, preview: initialPreview } : result || { ok: false, reason: 'Nie udało się zatwierdzić wariantu.' };
}

export function fleetManagementSnapshot(state) {
  const clock = gameClock(state.elapsedMinutes || 0, state.calendar);
  const types = Object.entries(TRANSPORT_TYPES).map(([id, type]) => {
    const assigned = assignedVehicles(state, id);
    const saved = state.fleet?.[id];
    const owned = Math.max(assigned, Math.floor(Number(typeof saved === 'number' ? saved : saved?.owned) || 0));
    const reserve = Math.max(0, owned - assigned);
    const lines = (state.lines || []).filter(line => line.type === id).map(line => {
      const metrics = metricsAt(state, line);
      const stats = line.stats || {};
      const needsCapacity = Number(stats.load) >= 0.9 || Number(stats.waiting) > 0 || metrics.requiredVehicles > metrics.vehicles;
      return {
        id: line.id, name: line.name || `Linia ${line.id}`, vehicles: metrics.vehicles,
        requiredVehicles: metrics.requiredVehicles, idleVehicles: metrics.idleVehicles,
        load: Number.isFinite(stats.load) ? stats.load : null, waiting: Number.isFinite(stats.waiting) ? stats.waiting : null,
        observedOperatingCostPerHour: Number.isFinite(stats.costPerHour) ? stats.costPerHour : null,
        observed: Array.isArray(stats.history) && stats.history.length > 0,
        needsCapacity, dayType: clock.dayType
      };
    });
    const lineOperatingCostPerHour = lines.reduce((sum, line) => sum + (line.observedOperatingCostPerHour || 0), 0);
    return {
      id, name: type.name, owned, assigned, reserve, assignmentRatio: owned ? assigned / owned : 0,
      reserveMaintenancePerHour: reserve * type.maintenance * 0.1,
      lineOperatingCostPerHour: lines.length > 0 && lines.every(line => line.observed) ? lineOperatingCostPerHour : null,
      lines
    };
  });
  return { types, totals: {
    owned: types.reduce((sum, item) => sum + item.owned, 0),
    assigned: types.reduce((sum, item) => sum + item.assigned, 0),
    reserve: types.reduce((sum, item) => sum + item.reserve, 0),
    linesNeedingCapacity: types.flatMap(item => item.lines).filter(line => line.needsCapacity).length,
    potentiallyIdleAssignments: types.flatMap(item => item.lines).reduce((sum, line) => sum + line.idleVehicles, 0)
  } };
}
