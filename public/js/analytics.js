import { pointDemandScore } from './demand.js?v=10';
import { lineMetrics } from './transport.js?v=10';
import { gameClock, SIMULATION } from './simulation.js?v=10';

export const FAILURE_LABELS = {
  noService: 'Brak kursow w tym czasie',
  lowCapacity: 'Za malo wolnych miejsc',
  longWait: 'Zbyt dlugie oczekiwanie',
  inefficientTransfer: 'Nieoplacalna przesiadka',
  noConnection: 'Brak połączenia',
  excessiveTime: 'Zbyt długi czas podróży',
  noCapacity: 'Brak przepustowości',
  longQueue: 'Zbyt długa kolejka'
};

export const NETWORK_HISTORY_LIMIT = 96;
export const NETWORK_DAILY_HISTORY_LIMIT = 84;
export const NETWORK_WEEKLY_HISTORY_LIMIT = 12;

function createPeriod(clock) {
  return { date: clock.date, week: clock.week, samples: 0, transported: 0, generated: 0, abandoned: 0, denied: 0,
    revenue: 0, cost: 0, balance: 0, waitMinutesWeighted: 0, waitingPassengers: 0,
    coverageSamples: 0, utilizationSamples: 0, accessReachable: 0, accessOpportunities: 0,
    averageWaitMinutes: 0, coverage: 0, utilization: 0, tripAvailability: null };
}

function addPeriodSample(period, sample, waitingPassengers, accessibility) {
  period.samples += 1;
  for (const key of ['transported', 'generated', 'abandoned', 'denied', 'revenue', 'cost', 'balance']) period[key] += sample[key];
  period.waitMinutesWeighted += sample.averageWaitMinutes * waitingPassengers;
  period.waitingPassengers += waitingPassengers;
  period.coverageSamples += sample.coverage;
  period.utilizationSamples += sample.utilization;
  period.accessReachable += accessibility.reachable;
  period.accessOpportunities += accessibility.opportunities;
  period.averageWaitMinutes = period.waitingPassengers ? period.waitMinutesWeighted / period.waitingPassengers : 0;
  period.coverage = period.coverageSamples / period.samples;
  period.utilization = period.utilizationSamples / period.samples;
  period.tripAvailability = period.accessOpportunities ? period.accessReachable / period.accessOpportunities : null;
}

export function recordNetworkHistory(state, economy = {}) {
  const waiting = Object.values(state.passengers || {}).reduce((sum, item) => sum + Math.max(0, item.waiting || 0), 0);
  const waitingCohorts = (state.cohorts || []).filter(group => group.phase === 'waiting');
  const currentWait = waitingCohorts.reduce((sum, group) => sum + Math.max(0, group.waitMinutes || 0) * Math.max(0, group.count || 0), 0);
  const lines = state.lines || [];
  const segmentLoads = lines.flatMap(line => Object.values(line.stats?.segmentLoad || {}));
  const served = new Set(lines.flatMap(line => line.stops || []));
  const points = state.city?.points || [];
  const accessibility = { opportunities: Math.max(0, economy.accessibility?.opportunities || 0),
    reachable: Math.max(0, economy.accessibility?.reachable || 0), denied: Math.max(0, economy.accessibility?.denied || 0) };
  const window = {
    at: Math.max(0, state.elapsedMinutes || 0),
    networkVersion: Math.max(0, state.networkVersion || 0),
    transported: Math.max(0, economy.transported || 0),
    generated: Math.max(0, economy.generated || 0), abandoned: Math.max(0, economy.abandoned || 0), denied: accessibility.denied,
    averageWaitMinutes: waiting ? currentWait / waiting : 0,
    coverage: points.length ? points.filter(point => served.has(point.id)).length / points.length : 0,
    tripAvailability: accessibility.opportunities ? accessibility.reachable / accessibility.opportunities : null,
    utilization: segmentLoads.length ? segmentLoads.reduce((sum, value) => sum + Math.max(0, value || 0), 0) / segmentLoads.length : 0,
    revenue: Math.max(0, economy.revenue || 0), cost: Math.max(0, economy.cost || 0), balance: (economy.revenue || 0) - (economy.cost || 0)
  };
  state.networkHistory = [...(state.networkHistory || []), window].slice(-NETWORK_HISTORY_LIMIT);
  const clock = gameClock(Math.max(0, window.at - Math.max(0, economy.deltaMinutes ?? SIMULATION.minutesPerTick)), state.calendar);
  const daily = state.networkDailyHistory || (state.networkDailyHistory = []);
  let day = daily.at(-1);
  if (!day || day.date !== clock.date) { day = createPeriod(clock); daily.push(day); }
  addPeriodSample(day, window, waiting, accessibility);
  if (daily.length > NETWORK_DAILY_HISTORY_LIMIT) daily.splice(0, daily.length - NETWORK_DAILY_HISTORY_LIMIT);
  const weekly = state.networkWeeklyHistory || (state.networkWeeklyHistory = []);
  let week = weekly.at(-1);
  if (!week || week.week !== clock.week) { week = createPeriod(clock); week.date = undefined; weekly.push(week); }
  addPeriodSample(week, window, waiting, accessibility);
  if (weekly.length > NETWORK_WEEKLY_HISTORY_LIMIT) weekly.splice(0, weekly.length - NETWORK_WEEKLY_HISTORY_LIMIT);
  return window;
}

export function networkProblems(state, points = []) {
  const names = new Map(points.map(point => [point.id, point.name]));
  const problems = [];
  const clock = gameClock(state.elapsedMinutes || 0, state.calendar);
  for (const line of state.lines || []) {
    const stats = line.stats || {};
    const observedMinutes = (stats.history || []).reduce((sum, item) => sum + Math.max(0, item.minutes || 0), 0);
    const metrics = lineMetrics(line, state.city, clock.minuteOfDay, { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes || 0, serviceDayType: clock.dayType });
    if (metrics.requiredVehicles > metrics.vehicles) problems.push({ kind: 'fleet', label: line.name || `Linia ${line.id}`,
      cause: 'Flota nie wystarcza do realizacji zaplanowanej częstotliwości', observed: `${metrics.vehicles} pojazdów; potrzeba ${metrics.requiredVehicles}`,
      impact: 'Rzeczywista częstotliwość i przepustowość są niższe od zaplanowanych.', actions: 'Zwiększ przypisaną flotę albo zmniejsz częstotliwość w rozkładzie.' });
    if ((stats.load || 0) >= 0.95 || (stats.waiting || 0) > 48) problems.push({ kind: 'overload', label: line.name || `Linia ${line.id}`,
      cause: 'Wysokie obciążenie lub oczekująca kolejka', observed: `${Math.round((stats.load || 0) * 100)}% zajętości; ${Math.round(stats.waiting || 0)} oczekuje`,
      impact: 'Pasażerowie mogą czekać dłużej lub nie zmieścić się w pojeździe.', actions: 'Rozważ częstsze kursy lub większą liczbę pojazdów.' });
    if (observedMinutes >= 30 && (stats.balancePerHour || 0) < -100 && (stats.load || 0) < 0.25) problems.push({ kind: 'lowUse', label: line.name || `Linia ${line.id}`,
      cause: 'Wysokie koszty przy niskim wykorzystaniu', observed: `${Math.round(stats.load * 100)}% zajętości; ${Math.round(stats.balancePerHour)} zł/h`,
      impact: 'Linia obciąża budżet przy małej liczbie przewożonych pasażerów.', actions: 'Sprawdź trasę, rozkład i zapotrzebowanie na obsługiwanych przystankach.' });
    Object.entries(stats.segmentLoad || {}).forEach(([index, load]) => { if (load >= 0.95) problems.push({ kind: 'segment', label: `${line.name || `Linia ${line.id}`} · odcinek ${Number(index) + 1}`,
      cause: 'Przeciążony odcinek', observed: `${Math.round(load * 100)}% wykorzystania pojemności`,
      impact: 'Na tym fragmencie może brakować miejsc.', actions: 'Zwiększ podaż na tej linii lub sprawdź przebieg połączenia.' }); });
  }
  for (const [pointId, passenger] of Object.entries(state.passengers || {})) if ((passenger.waiting || 0) >= 48) problems.push({ kind: 'queue', label: names.get(pointId) || pointId,
    cause: 'Długa kolejka na przystanku', observed: `${Math.round(passenger.waiting)} oczekujących`,
    impact: 'Pasażerowie mogą długo czekać lub rezygnować z podróży.', actions: 'Sprawdź częstotliwość i pojemność linii obsługujących ten punkt.' });
  const failures = state.diagnostics?.failures || {};
  const noConnection = (failures.noConnection || 0) + (failures.noService || 0);
  if (noConnection > 0) problems.push({ kind: 'connection', label: 'Relacje pasażerskie', cause: 'Brak połączenia albo kursu w chwili popytu', observed: `${noConnection} niezrealizowanych przypadków`,
    impact: 'Część podróży nie może się rozpocząć.', actions: 'Sprawdź listę nieudanych relacji i dostępność kursów.' });
  const transfers = failures.inefficientTransfer || 0;
  if (transfers > 0) problems.push({ kind: 'transfer', label: 'Relacje przesiadkowe', cause: 'Przesiadki były zbyt długie lub nieopłacalne czasowo', observed: `${transfers} niezrealizowanych przypadków`,
    impact: 'Pasażerowie rezygnują z relacji z przesiadką.', actions: 'Sprawdź synchronizację rozkładów i czas oczekiwania między liniami.' });
  return problems.slice(0, 30);
}

export const createDiagnostics = () => ({
  relations: {}, generatedByPoint: {}, deliveredByPoint: {},
  failures: { noConnection: 0, noService: 0, excessiveTime: 0, noCapacity: 0, lowCapacity: 0, longWait: 0, inefficientTransfer: 0, longQueue: 0 },
  failureByPoint: {}, lastUpdated: 0
});

export function ensureDiagnostics(state) {
  state.diagnostics ||= createDiagnostics();
  state.diagnostics.relations ||= {};
  state.diagnostics.generatedByPoint ||= {};
  state.diagnostics.deliveredByPoint ||= {};
  state.diagnostics.failures = { ...createDiagnostics().failures, ...(state.diagnostics.failures || {}) };
  state.diagnostics.failureByPoint ||= {};
  return state.diagnostics;
}

function trimObject(object, limit) {
  const entries = Object.entries(object);
  if (entries.length <= limit) return;
  entries.sort((a, b) => b[1] - a[1]).slice(limit).forEach(([key]) => delete object[key]);
}

export function recordDemand(state, origin, destination, count) {
  const diagnostics = ensureDiagnostics(state);
  const key = `${origin}>${destination}`;
  diagnostics.relations[key] = (diagnostics.relations[key] || 0) + count;
  diagnostics.generatedByPoint[origin] = (diagnostics.generatedByPoint[origin] || 0) + count;
  trimObject(diagnostics.relations, 120);
  trimObject(diagnostics.generatedByPoint, 300);
}

export function recordDelivery(state, destination, count) {
  const diagnostics = ensureDiagnostics(state);
  diagnostics.deliveredByPoint[destination] = (diagnostics.deliveredByPoint[destination] || 0) + count;
  trimObject(diagnostics.deliveredByPoint, 300);
}

export function recordFailure(state, reason, pointId, count) {
  const diagnostics = ensureDiagnostics(state);
  if (!Object.hasOwn(diagnostics.failures, reason)) return;
  diagnostics.failures[reason] += count;
  const point = diagnostics.failureByPoint[pointId] ||= {};
  point[reason] = (point[reason] || 0) + count;
  trimObject(diagnostics.failureByPoint, 120);
}

export function diagnosticSnapshot(state, points, minuteOfDay) {
  const diagnostics = ensureDiagnostics(state);
  const names = new Map(points.map(point => [point.id, point.name]));
  const relations = Object.entries(diagnostics.relations).map(([key, count]) => {
    const [origin, destination] = key.split('>');
    return { origin, destination, label: `${names.get(origin) || origin} → ${names.get(destination) || destination}`, count };
  }).sort((a, b) => b.count - a.count).slice(0, 5);
  const failures = Object.entries(diagnostics.failures).map(([id, count]) => ({ id, label: FAILURE_LABELS[id], count }))
    .sort((a, b) => b.count - a.count);
  const demand = Object.fromEntries(points.map(point => [point.id,
    Math.max(diagnostics.generatedByPoint[point.id] || 0, pointDemandScore(point, minuteOfDay, 'origin') * 10)]));
  const queues = Object.fromEntries(points.map(point => [point.id, state.passengers?.[point.id]?.waiting || 0]));
  return { relations, failures, demand, queues };
}

