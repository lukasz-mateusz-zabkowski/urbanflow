import { applyEconomyTick } from './economy.js?v=10';
import { recordNetworkHistory } from './analytics.js?v=12';
import { airportUnlocked, haversineKm, lineCost, lineMetrics, unlockedTypes, TRANSPORT_TYPES } from './transport.js?v=10';
import { createLineStats, createPassengerState, passengerTick, totalWaiting } from './passengers.js?v=11';
import { SIMULATION, calendarTickContext, createSimulationCalendar, gameClock, setSpecialDay } from './simulation.js?v=10';
import { createCampaign, updateCampaign } from './campaign.js?v=11';
import { pickStopsToReveal } from './stops.js?v=11';
import { CITY_EVENT_DEFINITIONS, createCityEvent } from './city-events.js?v=10';
import { ensureDiagnostics } from './analytics.js?v=11';
import { ensureMobilityState } from './mobility.js?v=11';
import { chooseStartScenario, starterRoutesFor } from './cities.js?v=11';
import { getRoutingGraphStatus, routeLine, routeLineDetails, routingMode } from './routing.js?v=14';
import { ensureFleet, fleetStatus, missingFleetCost } from './fleet.js?v=10';
import { createTramInfrastructure, planTrackSegments, commitTrackPlan, buildManualTramGeometry, routeOnPlayerTramTracks } from './tramway.js?v=1';
import { createFinanceState, recordFinanceEvent } from './finance.js?v=1';
import { ensureCityEvolution, evolveCityWeek } from './city-evolution.js?v=2';
import { advanceInvestmentProjects, approveInvestment, cancelInvestment, createInvestmentState, planInvestment, recordInvestmentWeek } from './investments.js?v=1';
import {
  createWeeklyTimetable, createWeeklyUniformTimetable, setDailyFrequency, setDailyProfile,
  copyTimetableDay as copyScheduleDay, setSameScheduleEveryDay as updateSameSchedule, TIMETABLE_PROFILES
} from './timetable.js?v=10';

const fail = message => ({ ok: false, message });
const blankStats = () => createLineStats();
const signature = stops => [stops.join('|'), [...stops].reverse().join('|')].sort()[0];
const geometrySignature = geometry => Array.isArray(geometry) ? geometry.map(point =>
  Array.isArray(point) ? point.map(value => Math.round(Number(value) * 1e6)).join(',') : '').join(';') : '';

export class UrbanFlowGame {
  constructor(city, events = {}, savedState = null) {
    this.city = city; this.events = events;
    this.tramControlUndo = []; this.tramControlRedo = [];
    const savedStart = savedState?.startScenarioId || (savedState ? 'wieliczka' : null);
    this.startScenario = chooseStartScenario(events.random || Math.random, events.startScenarioId || savedStart);
    this.starterRoutes = starterRoutesFor(this.startScenario);
    this.state = savedState || {
      budget: city.startingBudget, revenue: 0, expenses: 0, subsidies: 0, passengerKm: 0, fleetPurchases: 0, carried: 0, generated: 0, abandoned: 0, satisfaction: 88,
      lines: [], cohorts: [], passengers: createPassengerState(city.points.filter(p => p.type !== 'stop')), revealedStops: [], stopCapacity: 120,
      calendar: createSimulationCalendar(),
      elapsedMinutes: 0, paused: false, speed: 1, selectedType: 'bus', selectedNodes: [], editingLineId: null,
      tutorialStep: 0, unlockedPointLevel: 0, airportUnlocked: false, unlocked: ['bus'],
      demandModifier: 1, stressDemandMultiplier: 1, nextEventAt: SIMULATION.eventIntervalMinutes, activeEventUntil: 0,
      cityEvents: [], nextEventId: 1, analyticsMode: 'off', networkHistory: [], networkDailyHistory: [], networkWeeklyHistory: [], startScenarioId: this.startScenario.id,
      campaign: createCampaign(), status: 'playing', lossReason: '', lowQualityMinutes: 0,
      preferences: { tutorialCollapsed: false, goalsCollapsed: true, tutorialStatus: 'active', tutorialMapExplored: false,
        tutorialDiagnosisVersion: null, tutorialActionsVersion: 1,
        tutorialActions: { firstGoal: false, busPlanned: false, costPreview: false, fleetDetails: false, opportunities: false, investment: false } }, nextLineId: 1, networkVersion: 0,
      investments: createInvestmentState(), hubCapacityByPoint: {}, tramInfrastructure: createTramInfrastructure(),
      tramBuildMode: 'street', tramControlPoints: []
    };
    this.state.revealedStops ||= [];
    this.state.calendar ||= createSimulationCalendar();
    this.state.startScenarioId ||= this.startScenario.id;
    this.startScenario = chooseStartScenario(Math.random, this.state.startScenarioId);
    this.starterRoutes = starterRoutesFor(this.startScenario);
    this.state.subsidies ||= 0; this.state.passengerKm ||= 0; this.state.stressDemandMultiplier ||= 1;
    this.state.fleetPurchases ||= 0;
    this.state.investments ||= createInvestmentState(); this.state.hubCapacityByPoint ||= {};
    this.state.tramInfrastructure ||= createTramInfrastructure(); this.state.tramBuildMode ||= 'street'; this.state.tramControlPoints ||= [];
    this.state.cityEvents ||= []; this.state.nextEventId ||= 1; this.state.analyticsMode ||= 'off';
    this.state.networkHistory ||= []; this.state.networkDailyHistory ||= []; this.state.networkWeeklyHistory ||= [];
    this.state.finance ||= createFinanceState(city.startingBudget, this.state.elapsedMinutes || 0);
    const previousPreferences = this.state.preferences || {};
    this.state.preferences = {
      tutorialCollapsed: false, goalsCollapsed: true, tutorialStatus: 'active', tutorialMapExplored: false,
      tutorialDiagnosisVersion: null, tutorialActionsVersion: savedState ? 0 : 1,
      tutorialActions: { firstGoal: false, busPlanned: false, costPreview: false, fleetDetails: false, opportunities: false, investment: false },
      ...previousPreferences,
      tutorialActionsVersion: Number.isSafeInteger(previousPreferences.tutorialActionsVersion)
        ? previousPreferences.tutorialActionsVersion : savedState ? 0 : 1,
      tutorialActions: { firstGoal: false, busPlanned: false, costPreview: false, fleetDetails: false, opportunities: false, investment: false, ...(previousPreferences.tutorialActions || {}) }
    };
    this.state.campaign = { ...createCampaign(), ...(this.state.campaign || {}), stress: { ...createCampaign().stress, ...(this.state.campaign?.stress || {}) } };
    this.state.lines.forEach(line => {
      line.stats = { ...blankStats(), ...(line.stats || {}), segmentLoad: { ...(line.stats?.segmentLoad || {}) } };
      line.timetable ||= createWeeklyUniformTimetable(line.frequency ?? 3, TRANSPORT_TYPES[line.type]?.maxFrequency);
    });
    this.state.lines.forEach(line => {
      line.routeGeometry ||= routeLine(line.stops, line.type, this.city);
      line.routingMode ||= routingMode(line.type);
      line.infrastructureCost ??= Math.max(0, (line.cost || 0) - Math.max(0, line.vehicles || 0) * (TRANSPORT_TYPES[line.type]?.vehicleCost || 0));
    });
    ensureFleet(this.state);
    ensureDiagnostics(this.state);
    ensureMobilityState(this.state, this.visiblePoints());
    ensureCityEvolution(this.state, this.city);
    Object.defineProperty(this.state, 'city', { value: city, enumerable: false, configurable: true });
  }
  refreshRoutesFromGraph(type = 'bus') {
    const updated = [], unavailable = [];
    for (const line of this.state.lines) {
      if (line.type !== type) continue;
      const details = routeLineDetails(line.stops, line.type, this.city, this.events.routingProvider,
        gameClock(this.state.elapsedMinutes, this.state.calendar).minuteOfDay);
      if (!details.valid) { line.routingUnavailable = String(details.reason || 'Brak wiarygodnej trasy.').slice(0, 500); unavailable.push({ lineId: line.id, reason: line.routingUnavailable }); continue; }
      delete line.routingUnavailable;
      line.routeGeometry = details.vehicleCoordinates?.length >= 2 ? details.vehicleCoordinates : details.coordinates;
      line.distanceKm = details.distanceKm; line.routingMode = routingMode(line.type);
      updated.push(line.id);
    }
    return { updated, unavailable };
  }
  setTramBuildMode(mode) {
    if (!['street', 'manual', 'existing'].includes(mode)) return fail('Nieznany sposób budowy torowiska.');
    if (!this.availableTypes().includes('tram') || this.state.status !== 'playing') return fail('Budowa tramwaju nie jest dostępna.');
    this.state.tramBuildMode = mode; this.state.tramControlPoints = []; this.state.tramSelectedControlIndex = -1;
    this.tramControlUndo = []; this.tramControlRedo = []; this.state.selectedType = 'tram'; this.changed();
    return { ok: true };
  }
  addTramControlPoint(lat, lng) {
    if (this.state.selectedType !== 'tram' || this.state.tramBuildMode !== 'manual' || this.state.status !== 'playing') return fail('Wybierz ręczny przebieg tramwaju przed wskazaniem punktów.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || this.state.tramControlPoints.length >= 300) return fail('Nieprawidłowy punkt przebiegu.');
    const point = [Number(lat), Number(lng)], previous = this.state.tramControlPoints.at(-1);
    if (previous && Math.hypot((point[0] - previous[0]) * 111, (point[1] - previous[1]) * 70) < 0.005) return fail('Punkt jest zbyt blisko poprzedniego.');
    this.rememberTramControlEdit(); this.state.tramControlPoints.push(point); this.state.tramSelectedControlIndex = this.state.tramControlPoints.length - 1;
    this.changed(); return { ok: true };
  }
  rememberTramControlEdit() {
    this.tramControlUndo.push(structuredClone(this.state.tramControlPoints || []));
    if (this.tramControlUndo.length > 50) this.tramControlUndo.shift();
    this.tramControlRedo = [];
  }
  moveTramControlPoint(index, lat, lng) {
    if (this.state.status !== 'playing' || this.state.selectedType !== 'tram' || this.state.tramBuildMode !== 'manual'
      || !Number.isInteger(index) || index < 0 || index >= this.state.tramControlPoints.length
      || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail('Nieprawidłowa edycja punktu torowiska.');
    const point = [Number(lat), Number(lng)], previous = this.state.tramControlPoints[index];
    if (Math.hypot((point[0] - previous[0]) * 111, (point[1] - previous[1]) * 70) < 0.003) return { ok: true, unchanged: true };
    this.rememberTramControlEdit(); this.state.tramControlPoints[index] = point; this.state.tramSelectedControlIndex = index;
    this.changed(); return { ok: true };
  }
  selectTramControlPoint(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.tramControlPoints.length) return fail('Nieznany punkt kontrolny.');
    this.state.tramSelectedControlIndex = index; this.events.onChange?.(); return { ok: true };
  }
  removeTramControlPoint(index = this.state.tramSelectedControlIndex) {
    if (this.state.status !== 'playing' || !Number.isInteger(index) || index < 0 || index >= this.state.tramControlPoints.length) return fail('Wybierz punkt kontrolny do usunięcia.');
    this.rememberTramControlEdit(); this.state.tramControlPoints.splice(index, 1);
    this.state.tramSelectedControlIndex = this.state.tramControlPoints.length ? Math.min(index, this.state.tramControlPoints.length - 1) : -1;
    this.changed(); return { ok: true };
  }
  undoTramControlEdit() {
    if (!this.tramControlUndo.length) return fail('Brak operacji do cofnięcia.');
    this.tramControlRedo.push(structuredClone(this.state.tramControlPoints || []));
    this.state.tramControlPoints = this.tramControlUndo.pop(); this.state.tramSelectedControlIndex = -1; this.changed(); return { ok: true };
  }
  redoTramControlEdit() {
    if (!this.tramControlRedo.length) return fail('Brak operacji do ponowienia.');
    this.tramControlUndo.push(structuredClone(this.state.tramControlPoints || []));
    this.state.tramControlPoints = this.tramControlRedo.pop(); this.state.tramSelectedControlIndex = -1; this.changed(); return { ok: true };
  }
  restoreTramControlPoints() {
    const line = this.state.lines.find(item => item.id === this.state.editingLineId && item.type === 'tram');
    if (!line) return fail('Najpierw wybierz istniejącą linię tramwajową do edycji.');
    this.state.tramControlPoints = structuredClone(line.tramControlPoints || []);
    this.state.tramBuildMode = line.tramBuildMode || 'street';
    this.tramControlUndo = []; this.tramControlRedo = []; this.state.tramSelectedControlIndex = -1; this.changed(); return { ok: true };
  }
  clearTramControlPoints() {
    if (this.state.tramControlPoints.length) this.rememberTramControlEdit();
    this.state.tramControlPoints = []; this.state.tramSelectedControlIndex = -1; this.changed(); return { ok: true };
  }
  changed() { this.events.onSave?.(this.state); this.events.onChange?.(); }
  pointName(id) { return this.city.points.find(point => point.id === id)?.name || id; }
  visiblePoints() {
    const revealed = new Set(this.state.revealedStops);
    const opening = new Set([this.startScenario.id, this.startScenario.localHubId, this.startScenario.centerId]);
    return this.city.points.filter(p => !p.legacyOnly && (p.type === 'stop' ? revealed.has(p.id)
      : p.type === 'airport' ? this.state.airportUnlocked
        : opening.has(p.id) ? true
          : p.startScenario ? p.startScenario === this.state.startScenarioId || this.state.unlockedPointLevel >= 2
          : p.unlock <= this.state.unlockedPointLevel));
  }
  // Każda budowa odsłania nowe przystanki wzdłuż trasy i wokół jej końców.
  revealStops(stopIds, opts) {
    const byId = new Map(this.city.points.map(p => [p.id, p]));
    const route = stopIds.map(id => byId.get(id)).filter(Boolean);
    const ids = pickStopsToReveal(this.city.points, new Set(this.state.revealedStops), route, opts);
    this.state.revealedStops.push(...ids);
    if (ids.length) this.events.onStopsRevealed?.(ids.map(id => byId.get(id)));
    return ids;
  }
  availableTypes() { return this.state.unlocked; }
  selectStarterRoute(id) {
    if (this.state.lines.length) return fail('Pierwsza linia już istnieje.');
    let route;
    if (id === 'loop-center' || id === 'loop-station') {
      this.startScenario = chooseStartScenario(Math.random, 'wieliczka'); this.state.startScenarioId = 'wieliczka';
      this.starterRoutes = starterRoutesFor(this.startScenario);
      route = { id, label: 'Pętla Dworzec', stops: ['wieliczka', 'biezanow', 'dworzec'] };
    } else route = this.starterRoutes.find(r => r.id === id);
    if (!route) return fail('Nieznana trasa.');
    this.state.preferences.tutorialActions.firstGoal = true;
    this.state.preferences.tutorialActions.busPlanned = true;
    this.state.selectedType = 'bus'; this.state.selectedNodes = [...route.stops]; this.changed(); return this.previewLine();
  }
  chooseStarterRoute(id) { const result = this.selectStarterRoute(id); return result.ok ? this.createSelectedLine() : result; }
  previewLine(type = this.state.selectedType, stops = this.state.selectedNodes, editingId = this.state.editingLineId) {
    if (this.state.status !== 'playing') return fail('Rozgrywka jest zakończona.');
    if (!TRANSPORT_TYPES[type] || !this.availableTypes().includes(type)) return fail('Ten transport nie jest jeszcze odblokowany.');
    if (!Array.isArray(stops) || stops.length < 2) return fail('Wybierz co najmniej dwa przystanki na mapie.');
    if (stops.length > this.city.points.length || new Set(stops).size !== stops.length) return fail('Każdy przystanek może wystąpić na trasie tylko raz.');
    const visible = new Set(this.visiblePoints().map(p => p.id));
    const oldLine = this.state.lines.find(line => line.id === editingId);
    const legacyUnchanged = oldLine?.stops.includes('centrum') && signature(oldLine.stops) === signature(stops);
    if (stops.some(id => !visible.has(id) && !(id === 'centrum' && legacyUnchanged))) return fail('Jeden z przystanków nie jest jeszcze dostępny.');
    if (stops.includes('centrum') && !legacyUnchanged) return fail('Centrum jest punktem historycznym i nie można dodawać go do nowych tras.');
    const legacyStarter = this.state.startScenarioId === 'wieliczka' && signature(['wieliczka', 'biezanow', 'dworzec']) === signature(stops);
    if (!this.state.lines.length && !legacyStarter && !this.starterRoutes.some(r => signature(r.stops) === signature(stops))) return fail(`Zacznij od połączenia ${this.startScenario.name} z lokalnym węzłem.`);
    if (this.state.lines.some(l => l.id !== editingId && l.type === type && signature(l.stops) === signature(stops))) return fail('Taka linia już działa, także w przeciwnym kierunku.');
    let routeDetails = routeLineDetails(stops, type, this.city, this.events.routingProvider,
      gameClock(this.state.elapsedMinutes).minuteOfDay);
    let trackPlan = null;
    if (type === 'tram' && this.state.tramBuildMode === 'manual') {
      const stopPoints = stops.map(id => this.city.points.find(point => point.id === id)).filter(Boolean).map(point => [point.lat, point.lng]);
      const manualControls = [stopPoints[0], ...this.state.tramControlPoints, stopPoints.at(-1)];
      const manual = buildManualTramGeometry(stopPoints, manualControls);
      if (!manual.valid) return { ...fail(manual.reason), routeDetails: { ...routeDetails, valid: false, reason: manual.reason } };
      const coordinates = manual.coordinates;
      trackPlan = planTrackSegments(this.state.tramInfrastructure, coordinates.map(point => point), { mode: 'manual' });
      routeDetails = { ...routeDetails, coordinates, vehicleCoordinates: coordinates, distanceKm: manual.lengthKm, valid: trackPlan.valid,
        source: 'Punkty kontrolne wskazane przez gracza', algorithm: 'Tramwajowe torowisko ręczne', reason: manual.reason, segments: [] };
    } else if (type === 'tram' && this.state.tramBuildMode === 'street') {
      const street = routeLineDetails(stops, 'bus', this.city, null, gameClock(this.state.elapsedMinutes).minuteOfDay);
      if (!street.valid) return { ...fail(`Nie można wyznaczyć przebiegu torowiska po drogach: ${street.reason}`), routeDetails: street };
      const coordinates = street.vehicleCoordinates?.length >= 2 ? street.vehicleCoordinates : street.coordinates;
      trackPlan = planTrackSegments(this.state.tramInfrastructure, coordinates, { mode: 'street' });
      routeDetails = { ...street, vehicleCoordinates: coordinates, coordinates, source: `${street.source} + torowisko budowane przez gracza`,
        algorithm: `${street.algorithm} + budowa toru`, reason: 'Torowisko zostanie zbudowane wzdłuż lokalnie wyznaczonego przebiegu autobusowego.',
        valid: trackPlan.valid, trackPlan, mode: 'tramway' };
    } else if (type === 'tram' && this.state.tramBuildMode === 'existing') {
      const playerRoute = routeOnPlayerTramTracks(this.state.tramInfrastructure, stops, this.city);
      if (playerRoute.valid) routeDetails = playerRoute;
      else routeDetails.reason = `${routeDetails.reason || ''} ${playerRoute.reason}`.trim();
    }
    const containsRealStop = stops.some(id => this.city.points.find(point => point.id === id)?.type === 'stop');
    const localSurfaceGraphLoaded = ['bus', 'tram'].includes(type) && getRoutingGraphStatus(this.city.id).loaded;
    if (!routeDetails.valid && (containsRealStop || localSurfaceGraphLoaded || (type === 'bus' && typeof window !== 'undefined'))) return { ...fail(`Nie można zatwierdzić niewiarygodnej geometrii. ${routeDetails.reason}`),
      routeDetails, distanceKm: routeDetails.distanceKm, routeGeometry: routeDetails.coordinates };
    const routeGeometry = routeDetails.vehicleCoordinates?.length >= 2 ? routeDetails.vehicleCoordinates : routeDetails.coordinates;
    const distanceKm = Math.max(0.1, routeDetails.distanceKm);
    let infrastructureCost = lineCost(type, distanceKm, stops, this.city);
    const old = this.state.lines.find(l => l.id === editingId);
    const unchanged = old && signature(old.stops) === signature(stops)
      && geometrySignature(old.routeGeometry) === geometrySignature(routeGeometry)
      && (type !== 'tram' || (old.tramBuildMode || 'street') === this.state.tramBuildMode
        && JSON.stringify(old.tramTrackIds || []) === JSON.stringify(trackPlan?.segmentIds || routeDetails.trackIds || old.tramTrackIds || []));
    const fleetPurchase = old ? { missing: 0, cost: 0 } : missingFleetCost(this.state, type, 2);
    if (type === 'tram' && this.state.tramBuildMode !== 'existing' && !trackPlan) {
      const trackGeometry = routeDetails.vehicleCoordinates || routeDetails.roadCoordinates || routeDetails.coordinates;
      trackPlan = planTrackSegments(this.state.tramInfrastructure, trackGeometry, { mode: this.state.tramBuildMode });
    }
    if (type === 'tram' && trackPlan && !trackPlan.valid) return fail(trackPlan.reason);
    if (type === 'tram') {
      if (this.state.tramBuildMode === 'existing') infrastructureCost = 0;
      else if (trackPlan) {
        const newLengthKm = trackPlan.newSegments.reduce((sum, segment) => sum + segment.lengthKm, 0);
        // Share the existing line-construction rate across newly laid track only.
        // Track already in service is never charged again.
        infrastructureCost = trackPlan.lengthKm > 0 ? Math.round(infrastructureCost * newLengthKm / trackPlan.lengthKm) : 0;
      }
    }
    const trackCost = type === 'tram' ? infrastructureCost : 0;
    // No refunds for removing infrastructure; changes carry the existing rebuilding charge.
    const baseConstructionCost = lineCost(type, distanceKm, stops, this.city);
    const rebuildCost = old ? (unchanged ? 0 : Math.round(Math.max(0, infrastructureCost
      - (old.infrastructureCost ?? lineCost(old.type, old.distanceKm, old.stops, this.city)))
      + (type === 'tram' ? baseConstructionCost : infrastructureCost) * .12)) : infrastructureCost;
    const cost = rebuildCost + fleetPurchase.cost;
    const metrics = lineMetrics({ type, stops, distanceKm, routeGeometry, vehicles: old?.vehicles ?? 2, frequency: old?.frequency ?? 3 }, this.city,
      gameClock(this.state.elapsedMinutes, this.state.calendar).minuteOfDay, {
        events: this.state.cityEvents, elapsedMinutes: this.state.elapsedMinutes,
        serviceDayType: gameClock(this.state.elapsedMinutes, this.state.calendar).dayType
      });
    return { ok: true, cost, infrastructureCost, fleetCost: fleetPurchase.cost, trackCost, trackPlan, vehiclesToBuy: fleetPurchase.missing,
      distanceKm, routeGeometry, routeDetails, routingMode: routingMode(type), tramBuildMode: type === 'tram' ? this.state.tramBuildMode : undefined,
      tramControlPoints: type === 'tram' ? structuredClone(this.state.tramControlPoints || []) : undefined,
      metrics, affordable: this.state.budget >= cost };
  }
  addLine(type, stops, _legacyForcedCost = null, name = null) {
    const preview = this.previewLine(type, stops, null);
    if (!preview.ok) return preview;
    if (!preview.affordable) return fail(`Brakuje ${Math.ceil(preview.cost - this.state.budget).toLocaleString('pl-PL')} zł. Koszt budowy: ${preview.cost.toLocaleString('pl-PL')} zł.`);
    const trackPlan = preview.trackPlan;
    if (trackPlan && !commitTrackPlan(this.state.tramInfrastructure, trackPlan, this.state.elapsedMinutes)) return fail('Nie udało się atomowo zatwierdzić budowy torowiska.');
    const id = this.state.nextLineId++;
    if (preview.vehiclesToBuy) this.state.fleet[type].owned += preview.vehiclesToBuy;
    const line = { id: `line-${id}`, type, stops: [...stops], distanceKm: preview.distanceKm, cost: preview.cost,
      routeGeometry: preview.routeGeometry, routingMode: preview.routingMode, infrastructureCost: preview.infrastructureCost,
      ...(trackPlan ? { tramTrackIds: [...new Set(trackPlan.segmentIds)] }
        : (preview.routeDetails.trackIds || preview.routeDetails.playerTrackIds)?.length ? { tramTrackIds: [...new Set(preview.routeDetails.trackIds || preview.routeDetails.playerTrackIds)] } : {}),
      ...(type === 'tram' ? { tramBuildMode: this.state.tramBuildMode, tramControlPoints: structuredClone(this.state.tramControlPoints || []) } : {}),
      name: name || `${TRANSPORT_TYPES[type].short}${id}`, color: TRANSPORT_TYPES[type].color,
      vehicles: 2, frequency: 3, timetable: createWeeklyTimetable('balanced', TRANSPORT_TYPES[type].maxFrequency),
      ageMinutes: 0, stats: blankStats() };
    this.state.lines.push(line); this.state.budget -= preview.cost; this.state.networkVersion++;
    recordFinanceEvent(this.state, 'lineConstruction', preview.cost - preview.fleetCost, this.state.elapsedMinutes, `line-build:${line.id}`);
    if (preview.fleetCost > 0) recordFinanceEvent(this.state, 'fleetPurchase', preview.fleetCost, this.state.elapsedMinutes, `line-build-fleet:${line.id}`);
    this.state.unlockedPointLevel = Math.min(2, Math.max(this.state.unlockedPointLevel, this.state.lines.length));
    this.state.selectedNodes = []; this.state.editingLineId = null;
    this.revealStops(line.stops);
    updateCampaign(this, 0); this.events.onLineCreated?.(line); this.changed(); return { ok: true, line };
  }
  createSelectedLine() { return this.state.editingLineId ? this.editLine(this.state.editingLineId, this.state.selectedNodes) : this.addLine(this.state.selectedType, this.state.selectedNodes); }
  beginEditLine(id) {
    const line = this.state.lines.find(l => l.id === id);
    if (!line || this.state.status !== 'playing') return fail('Nie można edytować tej linii.');
    this.state.editingLineId = id; this.state.selectedType = line.type; this.state.selectedNodes = [...line.stops];
    if (line.type === 'tram') {
      this.state.tramBuildMode = ['street', 'manual', 'existing'].includes(line.tramBuildMode) ? line.tramBuildMode : 'street';
      this.state.tramControlPoints = Array.isArray(line.tramControlPoints) ? structuredClone(line.tramControlPoints) : [];
      this.state.tramSelectedControlIndex = -1; this.tramControlUndo = []; this.tramControlRedo = [];
    }
    this.changed(); return { ok: true };
  }
  stageStopInsertion(lineId, segmentIndex, stopId) {
    const line = this.state.lines.find(item => item.id === lineId);
    if (!line || !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= line.stops.length - 1) return fail('Wybierz prawidłowy odcinek między sąsiednimi przystankami.');
    if (line.stops.includes(stopId)) return fail('Ten przystanek jest już na tej linii.');
    if (!this.visiblePoints().some(point => point.id === stopId && point.type === 'stop')) return fail('Najpierw odkryj ten przystanek.');
    const started = this.beginEditLine(lineId);
    if (!started.ok) return started;
    this.state.selectedNodes.splice(segmentIndex + 1, 0, stopId);
    this.changed();
    return { ok: true, preview: this.previewLine() };
  }
  cancelEdit() {
    const line = this.state.lines.find(item => item.id === this.state.editingLineId && item.type === 'tram');
    if (line) { this.state.tramBuildMode = line.tramBuildMode || 'street'; this.state.tramControlPoints = structuredClone(line.tramControlPoints || []); }
    else this.state.tramControlPoints = [];
    this.state.tramSelectedControlIndex = -1; this.tramControlUndo = []; this.tramControlRedo = [];
    this.state.selectedNodes = []; this.state.editingLineId = null; this.changed();
  }
  editLine(id, stops) {
    const line = this.state.lines.find(l => l.id === id);
    if (!line) return fail('Nieznana linia.');
    const preview = this.previewLine(line.type, stops, id);
    if (!preview.ok) return preview;
    if (!preview.affordable) return fail(`Brakuje ${Math.ceil(preview.cost - this.state.budget).toLocaleString('pl-PL')} zł na przebudowę.`);
    const routeChanged = signature(line.stops) !== signature(stops)
      || geometrySignature(line.routeGeometry) !== geometrySignature(preview.routeGeometry)
      || line.routingMode !== preview.routingMode
      || (line.type === 'tram' && ((line.tramBuildMode || 'street') !== this.state.tramBuildMode
        || JSON.stringify(line.tramTrackIds || []) !== JSON.stringify(preview.trackPlan?.segmentIds || preview.routeDetails?.trackIds || line.tramTrackIds || [])));
    if (routeChanged) {
      if (preview.trackPlan && !commitTrackPlan(this.state.tramInfrastructure, preview.trackPlan, this.state.elapsedMinutes)) return fail('Nie udało się atomowo zatwierdzić budowy torowiska.');
      line.stops = [...stops]; line.distanceKm = preview.distanceKm; line.cost += preview.cost;
      line.routeGeometry = preview.routeGeometry; line.routingMode = preview.routingMode; line.infrastructureCost = preview.infrastructureCost;
      if (preview.trackPlan) line.tramTrackIds = [...new Set(preview.trackPlan.segmentIds)];
      else if (preview.routeDetails?.trackIds) line.tramTrackIds = [...new Set(preview.routeDetails.trackIds)];
      if (line.type === 'tram') { line.tramBuildMode = this.state.tramBuildMode; line.tramControlPoints = structuredClone(this.state.tramControlPoints || []); }
      // Edited routes must demonstrate useful service again before counting toward unlocks.
      line.ageMinutes = 0; line.stats = blankStats(); line.history = []; line.accounting = [];
      this.state.budget -= preview.cost; this.state.networkVersion++;
      recordFinanceEvent(this.state, 'lineRebuild', Math.max(0, preview.cost - preview.fleetCost), this.state.elapsedMinutes,
        `line-edit:${line.id}:${this.state.finance.nextId}`);
      if (preview.fleetCost > 0) recordFinanceEvent(this.state, 'fleetPurchase', preview.fleetCost, this.state.elapsedMinutes,
        `line-edit-fleet:${line.id}:${this.state.finance.nextId}`);
      this.revealStops(line.stops, { maxCorridor: 10, maxRing: 4 });
    }
    if (line.routingUnavailable) {
      delete line.routingUnavailable;
      if (!routeChanged) this.state.networkVersion++;
    }
    this.state.selectedNodes = []; this.state.editingLineId = null;
    this.events.onLineEdited?.(line); this.changed(); return { ok: true, line };
  }
  deleteLine(id) {
    if (this.state.status !== 'playing') return fail('Rozgrywka jest zakończona.');
    if (!this.state.lines.some(l => l.id === id)) return fail('Nieznana linia.');
    this.state.lines = this.state.lines.filter(l => l.id !== id); this.state.networkVersion++;
    if (this.state.editingLineId === id) { this.state.editingLineId = null; this.state.selectedNodes = []; }
    this.changed(); return { ok: true };
  }
  buyVehicle(id) {
    const line = this.state.lines.find(l => l.id === id);
    if (!line || this.state.status !== 'playing') return fail('Nie można kupić pojazdu.');
    if (line.vehicles >= 16) return fail('Limit 16 pojazdów na linię.');
    const cost = TRANSPORT_TYPES[line.type].vehicleCost;
    if (this.state.budget < cost) return fail(`Potrzebujesz ${cost.toLocaleString('pl-PL')} zł na pojazd.`);
    this.state.budget -= cost; ensureFleet(this.state)[line.type].owned++; line.vehicles++; line.cost += cost; this.state.networkVersion++;
    recordFinanceEvent(this.state, 'fleetPurchase', cost, this.state.elapsedMinutes, `vehicle-line:${line.id}:${this.state.finance.nextId}`);
    this.changed(); return { ok: true };
  }
  purchaseFleetVehicle(type) {
    if (!TRANSPORT_TYPES[type] || this.state.status !== 'playing') return fail('Nie można kupić tego pojazdu.');
    const cost = TRANSPORT_TYPES[type].vehicleCost;
    if (this.state.budget < cost) return fail(`Potrzebujesz ${cost.toLocaleString('pl-PL')} zł na pojazd.`);
    this.state.budget -= cost; this.state.fleetPurchases += cost; ensureFleet(this.state)[type].owned++;
    recordFinanceEvent(this.state, 'fleetPurchase', cost, this.state.elapsedMinutes, `vehicle-reserve:${type}:${this.state.finance.nextId}`);
    this.changed(); return { ok: true };
  }
  assignVehicle(id, count = 1) {
    const line = this.state.lines.find(item => item.id === id); count = Math.floor(Number(count));
    if (!line || this.state.status !== 'playing' || count < 1) return fail('Nie można przypisać pojazdu.');
    if (line.vehicles + count > 16) return fail('Limit 16 pojazdów na linię.');
    if (fleetStatus(this.state, line.type).reserve < count) return fail('Brak pojazdów w rezerwie. Kup pojazd lub zdejmij go z innej linii.');
    line.vehicles += count; this.state.networkVersion++; this.changed(); return { ok: true };
  }
  unassignVehicle(id, count = 1) {
    const line = this.state.lines.find(item => item.id === id); count = Math.floor(Number(count));
    if (!line || this.state.status !== 'playing' || count < 1 || line.vehicles - count < 1) return fail('Linia musi zachować co najmniej jeden pojazd.');
    line.vehicles -= count; this.state.networkVersion++; this.changed(); return { ok: true };
  }
  transferVehicle(fromId, toId, count = 1) {
    const from = this.state.lines.find(item => item.id === fromId); const to = this.state.lines.find(item => item.id === toId);
    if (!from || !to || from.type !== to.type || from.id === to.id) return fail('Pojazdy można przenosić między liniami tego samego typu.');
    const removed = this.unassignVehicle(fromId, count); if (!removed.ok) return removed;
    const assigned = this.assignVehicle(toId, count);
    if (!assigned.ok) { from.vehicles += Math.floor(Number(count)); this.changed(); return assigned; }
    return { ok: true };
  }
  setFrequency(id, value) {
    const line = this.state.lines.find(l => l.id === id), frequency = Number(value);
    if (!line || this.state.status !== 'playing' || !Number.isFinite(frequency) || frequency < 1 || frequency > TRANSPORT_TYPES[line.type].maxFrequency) return fail('Nieprawidłowa częstotliwość.');
    line.previousTimetable = structuredClone(line.timetable);
    line.frequency = frequency; line.timetable = createWeeklyUniformTimetable(frequency, TRANSPORT_TYPES[line.type].maxFrequency);
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  setTimetableFrequency(id, periodId, value, dayType = 'weekday') {
    const line = this.state.lines.find(item => item.id === id), frequency = Number(value);
    if (!line || this.state.status !== 'playing' || !Number.isFinite(frequency) || frequency < 0
      || frequency > TRANSPORT_TYPES[line.type].maxFrequency) return fail('Nieprawidłowa częstotliwość rozkładu.');
    const timetable = setDailyFrequency(line.timetable, dayType, periodId, frequency, TRANSPORT_TYPES[line.type].maxFrequency);
    if (!timetable) return fail('Nieznany przedział rozkładu.');
    line.previousTimetable = structuredClone(line.timetable); line.timetable = timetable;
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  setTimetableProfile(id, profileId, dayType = 'weekday') {
    const line = this.state.lines.find(item => item.id === id);
    if (!line || this.state.status !== 'playing' || !TIMETABLE_PROFILES[profileId]) return fail('Nieznany profil rozkładu.');
    line.previousTimetable = structuredClone(line.timetable);
    line.timetable = setDailyProfile(line.timetable, dayType, profileId, TRANSPORT_TYPES[line.type].maxFrequency);
    if (!line.timetable) return fail('Nieprawidłowy profil dla typu dnia.');
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  copyTimetableDay(id, sourceDayType, targetDayType) {
    const line = this.state.lines.find(item => item.id === id);
    if (!line || this.state.status !== 'playing') return fail('Nie można skopiować tego rozkładu.');
    const timetable = copyScheduleDay(line.timetable, sourceDayType, targetDayType, TRANSPORT_TYPES[line.type].maxFrequency);
    if (!timetable) return fail('Nieznany typ dnia.');
    line.previousTimetable = structuredClone(line.timetable); line.timetable = timetable;
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  setSameTimetableEveryDay(id, sameEveryDay, sourceDayType = 'weekday') {
    const line = this.state.lines.find(item => item.id === id);
    if (!line || this.state.status !== 'playing') return fail('Nie można zmienić wspólnego rozkładu.');
    const timetable = updateSameSchedule(line.timetable, Boolean(sameEveryDay), sourceDayType);
    if (!timetable) return fail('Nieprawidłowy typ dnia.');
    line.previousTimetable = structuredClone(line.timetable); line.timetable = timetable;
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  setSpecialDay(date, special = true) {
    if (this.state.status !== 'playing') return fail('Kalendarz można zmienić podczas rozgrywki.');
    try { this.state.calendar = setSpecialDay(this.state.calendar, date, Boolean(special)); }
    catch { return fail('Nieprawidłowa data kalendarza.'); }
    this.changed(); return { ok: true };
  }
  restoreTimetable(id) {
    const line = this.state.lines.find(item => item.id === id);
    if (!line || this.state.status !== 'playing' || !line.previousTimetable) return fail('Brak poprzedniej konfiguracji rozkładu.');
    const current = structuredClone(line.timetable);
    line.timetable = structuredClone(line.previousTimetable); line.previousTimetable = current;
    this.state.networkVersion++; this.changed(); return { ok: true };
  }
  selectNode(id) {
    if (this.state.status !== 'playing' || !this.visiblePoints().some(p => p.id === id)) return;
    this.state.preferences.tutorialMapExplored = true;
    const selected = this.state.selectedNodes;
    this.state.selectedNodes = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    if (this.state.selectedNodes.includes(this.startScenario.localHubId) || this.state.selectedNodes.includes(this.startScenario.centerId)) {
      this.state.preferences.tutorialActions.firstGoal = true;
    }
    if (this.state.selectedNodes.length >= 2 && this.state.selectedType === 'bus') this.state.preferences.tutorialActions.busPlanned = true;
    this.changed();
  }
  moveSelectedStop(index, delta) {
    const next = index + delta, stops = this.state.selectedNodes;
    if (index < 0 || index >= stops.length || next < 0 || next >= stops.length) return;
    [stops[index], stops[next]] = [stops[next], stops[index]]; this.changed();
  }
  removeSelectedStop(index) { this.state.selectedNodes.splice(index, 1); this.changed(); }
  setTransport(type) {
    if (this.state.status !== 'playing' || !this.availableTypes().includes(type)) return;
    this.state.editingLineId = null; this.state.selectedType = type; this.changed();
  }
  setPaused(value) { this.state.paused = Boolean(value); this.changed(); }
  setSpeed(value) { if ([1, 2, 4].includes(value)) { this.state.speed = value; this.changed(); } }
  setPreference(key, value) { if (['tutorialCollapsed', 'goalsCollapsed'].includes(key)) { this.state.preferences[key] = Boolean(value); this.changed(); } }
  setTutorialStatus(status) {
    if (!['active', 'skipped'].includes(status)) return fail('Nieznany stan samouczka.');
    this.state.preferences.tutorialStatus = status;
    this.changed();
    return { ok: true };
  }
  markTutorialAction(action) {
    const keys = ['firstGoal', 'busPlanned', 'costPreview', 'fleetDetails', 'opportunities', 'investment'];
    if (!keys.includes(action) || this.state.status !== 'playing') return fail('Nieznana czynność samouczka.');
    if (!this.state.preferences.tutorialActions[action]) {
      this.state.preferences.tutorialActions[action] = true;
      this.events.onSave?.(this.state);
    }
    return { ok: true };
  }
  markTutorialDiagnosisViewed() {
    if (this.state.status !== 'playing' || this.state.analyticsMode === 'off' || !this.state.networkHistory.length
      || Number.isSafeInteger(this.state.preferences.tutorialDiagnosisVersion)) return false;
    this.state.preferences.tutorialDiagnosisVersion = this.state.networkVersion;
    this.events.onSave?.(this.state);
    return true;
  }
  setAnalyticsMode(mode) {
    if (!['off', 'demand', 'queues', 'load', 'profit', 'travel', 'access', 'flow', 'overload', 'unmet', 'cityEvolution', 'landUse', 'investments'].includes(mode)) return fail('Nieznany widok diagnostyczny.');
    if (this.state.status === 'playing') {
      if (mode !== 'off' && this.state.networkHistory.length > 0 && this.state.preferences.tutorialDiagnosisVersion === null) {
        this.state.preferences.tutorialDiagnosisVersion = this.state.networkVersion;
      }
      if (['cityEvolution', 'landUse'].includes(mode)) this.state.preferences.tutorialActions.opportunities = true;
      if (mode === 'investments') this.state.preferences.tutorialActions.investment = true;
    }
    this.state.analyticsMode = mode; this.changed(); return { ok: true };
  }
  planInvestment(districtId, type) {
    const result = planInvestment(this.state, districtId, type);
    if (result.ok) this.changed();
    return result;
  }
  approveInvestment(projectId) {
    const result = approveInvestment(this.state, projectId);
    if (result.ok) {
      recordFinanceEvent(this.state, 'investment', result.project.cost, this.state.elapsedMinutes, `investment-approval:${projectId}`);
      this.changed();
    }
    return result;
  }
  cancelInvestment(projectId) {
    const result = cancelInvestment(this.state, projectId);
    if (result.ok) {
      if (result.refund > 0) recordFinanceEvent(this.state, 'investmentRefund', result.refund, this.state.elapsedMinutes, `investment-refund:${projectId}`);
      this.changed();
    }
    return result;
  }
  setFinanceReserveTarget(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return fail('Podaj prawidłową rezerwę planistyczną.');
    this.state.finance.reserveTarget = Math.round(amount);
    this.changed();
    return { ok: true, reserveTarget: this.state.finance.reserveTarget };
  }
  tick(random = Math.random) {
    const s = this.state;
    if (s.paused || s.status !== 'playing' || (!s.lines.length && s.elapsedMinutes === 0)) return;
    const total = { generated: 0, transported: 0, abandoned: 0, overcrowded: [] };
    for (let i = 0; i < s.speed && s.status === 'playing'; i++) {
      const previousWeek = gameClock(s.elapsedMinutes, s.calendar).week;
      s.elapsedMinutes += SIMULATION.minutesPerTick;
      s.cityEvents = (s.cityEvents || []).filter(event => event.endMinute > s.elapsedMinutes);
      const clock = gameClock(s.elapsedMinutes, s.calendar);
      advanceInvestmentProjects(s);
      const accessibilityBefore = { ...s.mobility.accessibility };
      const result = passengerTick(s, this.visiblePoints(), clock.minuteOfDay, random,
        calendarTickContext(s.elapsedMinutes, SIMULATION.minutesPerTick, s.calendar));
      for (const k of ['generated', 'transported', 'abandoned']) total[k] += result[k] || 0;
      total.overcrowded = result.overcrowded;
      s.carried += result.transported; s.generated += result.generated; s.abandoned += result.abandoned || 0;
      const economy = applyEconomyTick(s, result.transported, SIMULATION.minutesPerTick);
      if (clock.week > previousWeek) {
        recordInvestmentWeek(s, clock.week - 1);
        evolveCityWeek(s, this.city);
      }
      recordNetworkHistory(s, { transported: result.transported, generated: result.generated, abandoned: result.abandoned,
        accessibility: { opportunities: s.mobility.accessibility.opportunities - accessibilityBefore.opportunities,
          reachable: s.mobility.accessibility.reachable - accessibilityBefore.reachable,
          denied: s.mobility.accessibility.denied - accessibilityBefore.denied },
        revenue: economy.fareRevenue + economy.subsidyRevenue, cost: economy.maintenance, deltaMinutes: SIMULATION.minutesPerTick });
      const missingNetworkPressure = s.elapsedMinutes > 0 && !s.lines.length ? 100 : 0;
      const pressure = missingNetworkPressure + Math.min(60, totalWaiting(s.passengers) / 24) + Math.min(30, (result.abandoned || 0) * .4);
      s.satisfaction = Math.max(0, Math.min(100, s.satisfaction + (Math.max(5, 95 - pressure) - s.satisfaction) * .09));
      s.lowQualityMinutes = s.satisfaction < 25 ? s.lowQualityMinutes + SIMULATION.minutesPerTick : 0;
      if (s.budget < -50000) this.finish('lost', 'Bankructwo: zadłużenie przekroczyło 50 000 zł.');
      else if (s.lowQualityMinutes >= 360) this.finish('lost', 'Zadowolenie utrzymywało się poniżej 25% przez 6 godzin.');
      if (s.status !== 'playing') break;
      for (const type of unlockedTypes(s.lines, s.satisfaction)) if (!s.unlocked.includes(type)) { s.unlocked.push(type); this.events.onUnlock?.(type); }
      if (!s.airportUnlocked && airportUnlocked(s.lines, s.satisfaction)) { s.airportUnlocked = true; this.events.onAirportUnlocked?.(); }
      updateCampaign(this, SIMULATION.minutesPerTick);
      if (s.elapsedMinutes >= s.nextEventAt) this.triggerCityEvent(random);
    }
    this.events.onTick?.(total); this.changed();
  }
  finish(status, reason = '') {
    if (this.state.status !== 'playing') return;
    this.state.status = status; this.state.lossReason = reason; this.state.paused = true; this.state.finishedAt = this.state.elapsedMinutes;
    this.events.onFinish?.({ status, reason });
  }
  triggerCityEvent(random = Math.random) {
    const definition = CITY_EVENT_DEFINITIONS[Math.min(CITY_EVENT_DEFINITIONS.length - 1, Math.floor(random() * CITY_EVENT_DEFINITIONS.length))];
    const leadMinutes = 360 + Math.floor(random() * 361);
    const event = createCityEvent(definition, this.state.elapsedMinutes + leadMinutes, `event-${this.state.nextEventId++}`, this.state.elapsedMinutes);
    this.state.cityEvents.push(event);
    this.state.nextEventAt = this.state.elapsedMinutes + SIMULATION.eventIntervalMinutes; this.events.onCityEventPlanned?.(event);
    return event;
  }
}
