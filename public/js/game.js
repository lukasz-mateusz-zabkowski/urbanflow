import { applyEconomyTick } from './economy.js?v=10';
import { recordNetworkHistory } from './analytics.js?v=12';
import { airportUnlocked, haversineKm, lineCost, lineMetrics, unlockedTypes, TRANSPORT_TYPES } from './transport.js?v=10';
import { createLineStats, createPassengerState, passengerTick, totalWaiting } from './passengers.js?v=11';
import { SIMULATION, calendarTickContext, createSimulationCalendar, gameClock, setSpecialDay } from './simulation.js?v=10';
import { createCampaign, updateCampaign } from './campaign.js?v=10';
import { pickStopsToReveal } from './stops.js?v=10';
import { CITY_EVENT_DEFINITIONS, createCityEvent } from './city-events.js?v=10';
import { ensureDiagnostics } from './analytics.js?v=11';
import { ensureMobilityState } from './mobility.js?v=11';
import { chooseStartScenario, starterRoutesFor } from './cities.js?v=10';
import { routeLine, routeLineDetails, routingMode } from './routing.js?v=10';
import { ensureFleet, fleetStatus, missingFleetCost } from './fleet.js?v=10';
import {
  createWeeklyTimetable, createWeeklyUniformTimetable, setDailyFrequency, setDailyProfile,
  copyTimetableDay as copyScheduleDay, setSameScheduleEveryDay as updateSameSchedule, TIMETABLE_PROFILES
} from './timetable.js?v=10';

const fail = message => ({ ok: false, message });
const blankStats = () => createLineStats();
const signature = stops => [stops.join('|'), [...stops].reverse().join('|')].sort()[0];

export class UrbanFlowGame {
  constructor(city, events = {}, savedState = null) {
    this.city = city; this.events = events;
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
      cityEvents: [], nextEventId: 1, analyticsMode: 'off', networkHistory: [], startScenarioId: this.startScenario.id,
      campaign: createCampaign(), status: 'playing', lossReason: '', lowQualityMinutes: 0,
      preferences: { tutorialCollapsed: false, goalsCollapsed: true }, nextLineId: 1, networkVersion: 0
    };
    this.state.revealedStops ||= [];
    this.state.calendar ||= createSimulationCalendar();
    this.state.startScenarioId ||= this.startScenario.id;
    this.startScenario = chooseStartScenario(Math.random, this.state.startScenarioId);
    this.starterRoutes = starterRoutesFor(this.startScenario);
    this.state.subsidies ||= 0; this.state.passengerKm ||= 0; this.state.stressDemandMultiplier ||= 1;
    this.state.fleetPurchases ||= 0;
    this.state.cityEvents ||= []; this.state.nextEventId ||= 1; this.state.analyticsMode ||= 'off';
    this.state.preferences = { tutorialCollapsed: false, goalsCollapsed: true, ...(this.state.preferences || {}) };
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
    Object.defineProperty(this.state, 'city', { value: city, enumerable: false, configurable: true });
  }
  changed() { this.events.onSave?.(this.state); this.events.onChange?.(); }
  pointName(id) { return this.city.points.find(point => point.id === id)?.name || id; }
  visiblePoints() {
    const revealed = new Set(this.state.revealedStops);
    const opening = new Set([this.startScenario.id, this.startScenario.localHubId, this.startScenario.centerId]);
    return this.city.points.filter(p => p.type === 'stop' ? revealed.has(p.id)
      : p.type === 'airport' ? this.state.airportUnlocked
        : opening.has(p.id) ? true
          : p.startScenario ? p.startScenario === this.state.startScenarioId || this.state.unlockedPointLevel >= 2
          : p.unlock <= this.state.unlockedPointLevel);
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
      route = { id, label: id === 'loop-center' ? 'Pętla Centrum' : 'Pętla Dworzec',
        stops: ['wieliczka', 'biezanow', id === 'loop-center' ? 'centrum' : 'dworzec'] };
    } else route = this.starterRoutes.find(r => r.id === id);
    if (!route) return fail('Nieznana trasa.');
    this.state.selectedType = 'bus'; this.state.selectedNodes = [...route.stops]; this.changed(); return this.previewLine();
  }
  chooseStarterRoute(id) { const result = this.selectStarterRoute(id); return result.ok ? this.createSelectedLine() : result; }
  previewLine(type = this.state.selectedType, stops = this.state.selectedNodes, editingId = this.state.editingLineId) {
    if (this.state.status !== 'playing') return fail('Rozgrywka jest zakończona.');
    if (!TRANSPORT_TYPES[type] || !this.availableTypes().includes(type)) return fail('Ten transport nie jest jeszcze odblokowany.');
    if (!Array.isArray(stops) || stops.length < 2) return fail('Wybierz co najmniej dwa przystanki na mapie.');
    if (stops.length > this.city.points.length || new Set(stops).size !== stops.length) return fail('Każdy przystanek może wystąpić na trasie tylko raz.');
    const visible = new Set(this.visiblePoints().map(p => p.id));
    if (stops.some(id => !visible.has(id))) return fail('Jeden z przystanków nie jest jeszcze dostępny.');
    const legacyStarter = this.state.startScenarioId === 'wieliczka' && [['wieliczka', 'biezanow', 'centrum'], ['wieliczka', 'biezanow', 'dworzec']]
      .some(route => signature(route) === signature(stops));
    if (!this.state.lines.length && !legacyStarter && !this.starterRoutes.some(r => signature(r.stops) === signature(stops))) return fail(`Zacznij od połączenia ${this.startScenario.name} z lokalnym węzłem.`);
    if (this.state.lines.some(l => l.id !== editingId && l.type === type && signature(l.stops) === signature(stops))) return fail('Taka linia już działa, także w przeciwnym kierunku.');
    const routeDetails = routeLineDetails(stops, type, this.city, this.events.routingProvider,
      gameClock(this.state.elapsedMinutes).minuteOfDay);
    const routeGeometry = routeDetails.coordinates;
    const distanceKm = Math.max(0.1, routeDetails.distanceKm);
    const infrastructureCost = lineCost(type, distanceKm, stops, this.city);
    const old = this.state.lines.find(l => l.id === editingId);
    const unchanged = old && signature(old.stops) === signature(stops);
    // No refunds for removing infrastructure; changes carry a rebuilding charge.
    const rebuildCost = old ? (unchanged ? 0 : Math.round(Math.max(0, infrastructureCost - (old.infrastructureCost ?? lineCost(old.type, old.distanceKm, old.stops, this.city))) + infrastructureCost * .12)) : infrastructureCost;
    const fleetPurchase = old ? { missing: 0, cost: 0 } : missingFleetCost(this.state, type, 2);
    const cost = rebuildCost + fleetPurchase.cost;
    const metrics = lineMetrics({ type, stops, distanceKm, vehicles: old?.vehicles ?? 2, frequency: old?.frequency ?? 3 }, this.city,
      gameClock(this.state.elapsedMinutes, this.state.calendar).minuteOfDay, {
        events: this.state.cityEvents, elapsedMinutes: this.state.elapsedMinutes,
        serviceDayType: gameClock(this.state.elapsedMinutes, this.state.calendar).dayType
      });
    return { ok: true, cost, infrastructureCost, fleetCost: fleetPurchase.cost, vehiclesToBuy: fleetPurchase.missing,
      distanceKm, routeGeometry, routeDetails, routingMode: routingMode(type), metrics, affordable: this.state.budget >= cost };
  }
  addLine(type, stops, _legacyForcedCost = null, name = null) {
    const preview = this.previewLine(type, stops, null);
    if (!preview.ok) return preview;
    if (!preview.affordable) return fail(`Brakuje ${Math.ceil(preview.cost - this.state.budget).toLocaleString('pl-PL')} zł. Koszt budowy: ${preview.cost.toLocaleString('pl-PL')} zł.`);
    const id = this.state.nextLineId++;
    if (preview.vehiclesToBuy) this.state.fleet[type].owned += preview.vehiclesToBuy;
    const line = { id: `line-${id}`, type, stops: [...stops], distanceKm: preview.distanceKm, cost: preview.cost,
      routeGeometry: preview.routeGeometry, routingMode: preview.routingMode, infrastructureCost: preview.infrastructureCost,
      name: name || `${TRANSPORT_TYPES[type].short}${id}`, color: TRANSPORT_TYPES[type].color,
      vehicles: 2, frequency: 3, timetable: createWeeklyTimetable('balanced', TRANSPORT_TYPES[type].maxFrequency),
      ageMinutes: 0, stats: blankStats() };
    this.state.lines.push(line); this.state.budget -= preview.cost; this.state.networkVersion++;
    this.state.unlockedPointLevel = Math.min(2, Math.max(this.state.unlockedPointLevel, this.state.lines.length));
    this.state.selectedNodes = []; this.state.editingLineId = null;
    this.revealStops(line.stops);
    updateCampaign(this, 0); this.events.onLineCreated?.(line); this.changed(); return { ok: true, line };
  }
  createSelectedLine() { return this.state.editingLineId ? this.editLine(this.state.editingLineId, this.state.selectedNodes) : this.addLine(this.state.selectedType, this.state.selectedNodes); }
  beginEditLine(id) {
    const line = this.state.lines.find(l => l.id === id);
    if (!line || this.state.status !== 'playing') return fail('Nie można edytować tej linii.');
    this.state.editingLineId = id; this.state.selectedType = line.type; this.state.selectedNodes = [...line.stops]; this.changed(); return { ok: true };
  }
  cancelEdit() { this.state.selectedNodes = []; this.state.editingLineId = null; this.changed(); }
  editLine(id, stops) {
    const line = this.state.lines.find(l => l.id === id);
    if (!line) return fail('Nieznana linia.');
    const preview = this.previewLine(line.type, stops, id);
    if (!preview.ok) return preview;
    if (!preview.affordable) return fail(`Brakuje ${Math.ceil(preview.cost - this.state.budget).toLocaleString('pl-PL')} zł na przebudowę.`);
    if (signature(line.stops) !== signature(stops)) {
      line.stops = [...stops]; line.distanceKm = preview.distanceKm; line.cost += preview.cost;
      line.routeGeometry = preview.routeGeometry; line.routingMode = preview.routingMode; line.infrastructureCost = preview.infrastructureCost;
      // Edited routes must demonstrate useful service again before counting toward unlocks.
      line.ageMinutes = 0; line.stats = blankStats(); line.history = []; line.accounting = [];
      this.state.budget -= preview.cost; this.state.networkVersion++;
      this.revealStops(line.stops, { maxCorridor: 10, maxRing: 4 });
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
    this.state.budget -= cost; ensureFleet(this.state)[line.type].owned++; line.vehicles++; line.cost += cost; this.state.networkVersion++; this.changed(); return { ok: true };
  }
  purchaseFleetVehicle(type) {
    if (!TRANSPORT_TYPES[type] || this.state.status !== 'playing') return fail('Nie można kupić tego pojazdu.');
    const cost = TRANSPORT_TYPES[type].vehicleCost;
    if (this.state.budget < cost) return fail(`Potrzebujesz ${cost.toLocaleString('pl-PL')} zł na pojazd.`);
    this.state.budget -= cost; this.state.fleetPurchases += cost; ensureFleet(this.state)[type].owned++; this.changed(); return { ok: true };
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
    const selected = this.state.selectedNodes;
    this.state.selectedNodes = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]; this.changed();
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
  setAnalyticsMode(mode) {
    if (!['off', 'demand', 'queues', 'load', 'profit', 'travel', 'access', 'flow', 'overload', 'unmet'].includes(mode)) return fail('Nieznany widok diagnostyczny.');
    this.state.analyticsMode = mode; this.changed(); return { ok: true };
  }
  tick(random = Math.random) {
    const s = this.state;
    if (s.paused || s.status !== 'playing' || (!s.lines.length && s.elapsedMinutes === 0)) return;
    const total = { generated: 0, transported: 0, abandoned: 0, overcrowded: [] };
    for (let i = 0; i < s.speed && s.status === 'playing'; i++) {
      s.elapsedMinutes += SIMULATION.minutesPerTick;
      s.cityEvents = (s.cityEvents || []).filter(event => event.endMinute > s.elapsedMinutes);
      const clock = gameClock(s.elapsedMinutes, s.calendar);
      const result = passengerTick(s, this.visiblePoints(), clock.minuteOfDay, random,
        calendarTickContext(s.elapsedMinutes, SIMULATION.minutesPerTick, s.calendar));
      for (const k of ['generated', 'transported', 'abandoned']) total[k] += result[k] || 0;
      total.overcrowded = result.overcrowded;
      s.carried += result.transported; s.generated += result.generated; s.abandoned += result.abandoned || 0;
      const economy = applyEconomyTick(s, result.transported, SIMULATION.minutesPerTick);
      recordNetworkHistory(s, { transported: result.transported, revenue: economy.fareRevenue + economy.subsidyRevenue, cost: economy.maintenance });
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
