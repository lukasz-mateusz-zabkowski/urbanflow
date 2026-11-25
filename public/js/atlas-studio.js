import { TRANSPORT_TYPES, lineMetrics } from './transport.js?v=10';
import { gameClock } from './simulation.js?v=10';

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function stopNames(game, ids = []) {
  return ids.map(id => game.city.points.find(point => point.id === id)?.name || id);
}

function describeLine(game, line) {
  const state = game.state;
  const clock = gameClock(state.elapsedMinutes, state.calendar);
  const metrics = lineMetrics(line, game.city, clock.minuteOfDay, {
    events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes, serviceDayType: clock.dayType
  });
  const observedCost = finite(line.stats?.costPerHour);
  return {
    kind: state.editingLineId === line.id ? 'editing' : 'line',
    status: state.editingLineId === line.id ? 'editing' : 'selected',
    title: line.name || TRANSPORT_TYPES[line.type]?.name || line.type,
    lineId: line.id,
    transport: TRANSPORT_TYPES[line.type]?.name || line.type,
    stopCount: Array.isArray(line.stops) ? line.stops.length : 0,
    route: stopNames(game, line.stops),
    distanceKm: finite(line.distanceKm),
    constructionCost: null,
    travelMinutes: finite(metrics.travelMinutes),
    requiredVehicles: finite(metrics.requiredVehicles),
    costPerHour: observedCost ?? finite(metrics.averageCostPerHour),
    costSource: observedCost === null ? 'modeled' : 'observed',
    routeAvailable: !line.routingUnavailable,
    note: line.routingUnavailable ? `Trasa niedostępna: ${line.routingUnavailable}` : ''
  };
}

/** Build a read-only planning summary from the live game model. */
export function planningStudioSnapshot(game, selectedLineId = null, currentPreview = null) {
  const state = game?.state;
  if (!state || !game.city) return { kind: 'empty', status: 'empty', title: 'Zacznij od trasy', stopCount: 0, route: [] };

  const line = state.lines.find(item => item.id === (state.editingLineId || selectedLineId));
  if (line) {
    const base = describeLine(game, line);
    if (state.editingLineId !== line.id) return base;
    const preview = currentPreview || game.previewLine();
    return {
      ...base,
      status: preview.ok ? 'ready' : 'unavailable',
      stopCount: state.selectedNodes?.length || 0,
      route: stopNames(game, state.selectedNodes || []),
      distanceKm: finite(preview.distanceKm),
      constructionCost: preview.ok ? finite(preview.cost) : null,
      travelMinutes: finite(preview.metrics?.travelMinutes),
      requiredVehicles: finite(preview.metrics?.requiredVehicles),
      routeAvailable: Boolean(preview.ok),
      note: preview.ok ? 'Koszt przebudowy jest podglądem; zostanie pobrany dopiero po zatwierdzeniu.' : preview.message
    };
  }

  const stops = state.selectedNodes || [];
  if (stops.length < 2) {
    return {
      kind: 'empty', status: stops.length ? 'incomplete' : 'empty', title: 'Zaplanuj połączenie',
      transport: TRANSPORT_TYPES[state.selectedType]?.name || state.selectedType,
      stopCount: stops.length, route: stopNames(game, stops), distanceKm: null, constructionCost: null,
      travelMinutes: null, requiredVehicles: null, costPerHour: null, costSource: null,
      routeAvailable: false, note: stops.length ? 'Dodaj jeszcze co najmniej jeden przystanek.' : 'Wybierz trasę startową lub punkty na mapie.'
    };
  }

  const preview = currentPreview || game.previewLine();
  return {
    kind: 'draft', status: preview.ok ? 'ready' : 'unavailable', title: 'Nowy projekt połączenia',
    transport: TRANSPORT_TYPES[state.selectedType]?.name || state.selectedType,
    stopCount: stops.length, route: stopNames(game, stops), distanceKm: finite(preview.distanceKm),
    constructionCost: preview.ok ? finite(preview.cost) : null,
    travelMinutes: finite(preview.metrics?.travelMinutes),
    requiredVehicles: finite(preview.metrics?.requiredVehicles), costPerHour: null, costSource: null,
    routeAvailable: Boolean(preview.ok), note: preview.ok
      ? 'Podgląd wykorzystuje aktualny routing i stan kampanii; zatwierdzenie pozostaje osobną decyzją.'
      : preview.message
  };
}
