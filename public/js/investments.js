import { capacitiesForLandUse, LAND_USE_INTENSITIES, validateLandUseProfile } from './land-use.js?v=1';

export const INVESTMENT_VERSION = 1;
export const INVESTMENT_LIMITS = Object.freeze({ activeProjects: 6, history: 40, assets: 44, durationWeekMinutes: 7 * 24 * 60, refundRate: 0.5 });
export const INVESTMENT_CATALOG = Object.freeze({
  housing: Object.freeze({ label: 'Rozwój mieszkaniowy', cost: 85000, weeks: 3, reserve: 6, effect: 'capacity-residents' }),
  economic: Object.freeze({ label: 'Rozwój gospodarczy', cost: 110000, weeks: 4, reserve: 6, effect: 'capacity-jobs' }),
  hub: Object.freeze({ label: 'Modernizacja węzła', cost: 72000, weeks: 2, weeklyMaintenance: 400, effect: 'queue-capacity' })
});

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => Number.isFinite(value);
const round = value => Math.round(value);
const active = project => project.status === 'planned' || project.status === 'in-progress';

export function createInvestmentState() {
  return { version: INVESTMENT_VERSION, nextId: 1, projects: [], history: [], assets: [], totalSpent: 0, totalRefunded: 0, totalMaintenance: 0, weekly: [] };
}

function districtCanInvest(state, districtId, type, excludeProjectId = null) {
  const zone = state.cityEvolution?.districts?.[districtId];
  if (!zone || !validateLandUseProfile(zone.landUse)) return { ok: false, message: 'Brak prawidłowego profilu zagospodarowania.' };
  const definition = INVESTMENT_CATALOG[type];
  if (!definition) return { ok: false, message: 'Nieznany rodzaj inwestycji.' };
  if (type === 'hub') {
    const served = (state.lines || []).some(line => line.stops?.includes(districtId));
    if (!served) return { ok: false, message: 'Węzeł musi być obsługiwany przez istniejącą linię.' };
    const queued = (state.investments?.projects || []).filter(project => project.id !== excludeProjectId && active(project)
      && project.districtId === districtId && project.type === 'hub').length;
    if ((state.hubCapacityByPoint?.[districtId] || 1) + queued * 0.5 >= 2) return { ok: false, message: 'Węzeł osiągnął maksymalny poziom modernizacji.' };
  } else {
    const committedReserve = (state.investments?.projects || []).filter(project => project.id !== excludeProjectId && active(project) && project.districtId === districtId
      && project.type !== 'hub').reduce((sum, project) => sum + INVESTMENT_CATALOG[project.type].reserve, 0);
    if (zone.landUse.shares.reserve - committedReserve < definition.reserve) return { ok: false, message: `Potrzeba co najmniej ${definition.reserve}% wolnej rezerwy terenu.` };
    if (zone.landUse.intensity === 'high') return { ok: false, message: 'Obszar osiągnął maksymalną intensywność zabudowy.' };
  }
  return { ok: true, zone, definition };
}

export function planInvestment(state, districtId, type) {
  if (state.status !== 'playing') return { ok: false, message: 'Inwestycji nie można planować po zakończeniu kampanii.' };
  const check = districtCanInvest(state, districtId, type);
  if (!check.ok) return check;
  const open = (state.investments?.projects || []).filter(active).length;
  if (open >= INVESTMENT_LIMITS.activeProjects) return { ok: false, message: 'Osiągnięto limit aktywnych projektów.' };
  const id = `investment-${state.investments.nextId}`;
  const project = { id, type, districtId, status: 'planned', cost: check.definition.cost,
    durationWeeks: check.definition.weeks, createdAt: state.elapsedMinutes || 0, approvedAt: null,
    completesAt: null, completedAt: null, effectApplied: false, refund: 0, charged: false,
    expected: { residentsCapacity: check.zone.capacity.residents, jobsCapacity: check.zone.capacity.jobs,
      transportHandling: state.hubCapacityByPoint?.[districtId] || 1 }, result: null };
  state.investments.nextId += 1;
  state.investments.projects.push(project);
  return { ok: true, project };
}

export function approveInvestment(state, projectId) {
  if (state.status !== 'playing') return { ok: false, message: 'Projektu nie można zatwierdzić po zakończeniu kampanii.' };
  const project = state.investments?.projects.find(item => item.id === projectId);
  if (!project || project.status !== 'planned') return { ok: false, message: 'Projekt nie jest już dostępny do zatwierdzenia.' };
  const check = districtCanInvest(state, project.districtId, project.type, project.id);
  if (!check.ok) return check;
  if (!finite(state.budget) || state.budget < project.cost) return { ok: false, message: 'Brak środków na zatwierdzenie projektu.' };
  state.budget -= project.cost;
  state.investments.totalSpent += project.cost;
  project.charged = true;
  project.status = 'in-progress';
  project.approvedAt = state.elapsedMinutes || 0;
  project.completesAt = project.approvedAt + project.durationWeeks * INVESTMENT_LIMITS.durationWeekMinutes;
  state.investments.history.push({ id: project.id, type: project.type, districtId: project.districtId,
    status: 'approved', cost: project.cost, refund: 0, at: project.approvedAt,
    week: Math.floor(project.approvedAt / INVESTMENT_LIMITS.durationWeekMinutes) + 1, result: null });
  trimInvestmentHistory(state.investments);
  return { ok: true, project };
}

export function cancelInvestment(state, projectId) {
  const investments = state.investments;
  const index = investments?.projects.findIndex(item => item.id === projectId) ?? -1;
  if (index < 0) return { ok: false, message: 'Nie znaleziono projektu.' };
  const project = investments.projects[index];
  if (!active(project)) return { ok: false, message: 'Projektu nie można już anulować.' };
  const refund = project.status === 'in-progress' ? round(project.cost * INVESTMENT_LIMITS.refundRate) : 0;
  if (refund) { state.budget += refund; investments.totalRefunded += refund; }
  project.status = 'cancelled'; project.refund = refund; project.cancelledAt = state.elapsedMinutes || 0;
  investments.history.push({ id: project.id, type: project.type, districtId: project.districtId,
    status: project.status, cost: 0, refund, at: project.cancelledAt,
    week: Math.floor(project.cancelledAt / INVESTMENT_LIMITS.durationWeekMinutes) + 1, result: null });
  investments.projects.splice(index, 1);
  trimInvestmentHistory(investments);
  return { ok: true, refund };
}

function trimInvestmentHistory(investments) {
  if (investments.history.length > INVESTMENT_LIMITS.history) investments.history.splice(0, investments.history.length - INVESTMENT_LIMITS.history);
  if (investments.weekly.length > 52) investments.weekly.splice(0, investments.weekly.length - 52);
}

function applyProjectEffect(state, project) {
  const zone = state.cityEvolution?.districts?.[project.districtId];
  if (!zone) return false;
  if (project.type === 'housing' || project.type === 'economic') {
    const use = project.type === 'housing' ? 'residential' : 'office';
    const reserve = INVESTMENT_CATALOG[project.type].reserve;
    if (zone.landUse.shares.reserve < reserve) return false;
    const intensityIndex = LAND_USE_INTENSITIES.indexOf(zone.landUse.intensity);
    if (intensityIndex < LAND_USE_INTENSITIES.length - 1) {
      zone.landUse.intensity = LAND_USE_INTENSITIES[intensityIndex + 1];
      zone.landUse.lastIntensityChangeWeek = Math.min(state.cityEvolution.lastEvolvedWeek,
        Math.floor((state.elapsedMinutes || 0) / INVESTMENT_LIMITS.durationWeekMinutes) + 1);
    }
    zone.landUse.shares.reserve -= reserve;
    zone.landUse.shares[use] += reserve;
    const expanded = capacitiesForLandUse(zone.base, zone.landUse);
    zone.capacity.residents = Math.max(zone.capacity.residents, expanded.residents);
    zone.capacity.jobs = Math.max(zone.capacity.jobs, expanded.jobs);
    // The capacity and attractiveness can rise now; occupancy remains gradual in City Evolution.
    if (project.type === 'housing') zone.residentialAttractiveness = Math.min(100, zone.residentialAttractiveness + 4);
    else zone.economicAttractiveness = Math.min(100, zone.economicAttractiveness + 4);
    return true;
  }
  if (project.type === 'hub') {
    state.hubCapacityByPoint ||= {};
    state.hubCapacityByPoint[project.districtId] = Math.min(2, (state.hubCapacityByPoint[project.districtId] || 1) + 0.5);
    state.investments.assets.push({ districtId: project.districtId,
      level: Math.round((state.hubCapacityByPoint[project.districtId] - 1) * 2),
      completedAt: state.elapsedMinutes, weeklyMaintenance: INVESTMENT_CATALOG.hub.weeklyMaintenance });
    return true;
  }
  return false;
}

export function advanceInvestmentProjects(state) {
  const investments = state.investments;
  if (!investments) return [];
  const completed = [];
  for (const project of investments.projects) {
    if (project.status !== 'in-progress' || project.effectApplied || state.elapsedMinutes < project.completesAt) continue;
    if (!applyProjectEffect(state, project)) {
      // Preconditions can change while the project is being built; fail safely with a full refund.
      state.budget += project.cost;
      investments.totalRefunded += project.cost;
      project.status = 'cancelled'; project.refund = project.cost; project.cancelledAt = state.elapsedMinutes;
      investments.history.push({ id: project.id, type: project.type, districtId: project.districtId,
        status: project.status, cost: 0, refund: project.cost, at: project.cancelledAt,
        week: Math.max(1, Math.ceil(project.cancelledAt / INVESTMENT_LIMITS.durationWeekMinutes)), result: null });
      continue;
    }
    project.status = 'completed'; project.effectApplied = true; project.completedAt = state.elapsedMinutes;
    const zone = state.cityEvolution.districts[project.districtId];
    project.result = { residents: zone.residents, jobs: zone.jobs,
      residentsCapacity: zone.capacity.residents, jobsCapacity: zone.capacity.jobs,
      transportHandling: state.hubCapacityByPoint?.[project.districtId] || 1 };
    investments.history.push({ id: project.id, type: project.type, districtId: project.districtId,
      status: project.status, cost: 0, refund: 0, at: project.completedAt,
      week: Math.max(1, Math.ceil(project.completedAt / INVESTMENT_LIMITS.durationWeekMinutes)), expected: project.expected, result: project.result });
    completed.push(project);
  }
  investments.projects = investments.projects.filter(project => !['cancelled', 'completed'].includes(project.status));
  if (completed.length) trimInvestmentHistory(investments);
  return completed;
}

export function recordInvestmentWeek(state, week) {
  const investments = state.investments;
  if (!investments || !Number.isSafeInteger(week) || week < 1 || investments.weekly.some(item => item.week === week)) return null;
  const recent = investments.history.filter(item => item.week === week);
  const weekStart = (week - 1) * INVESTMENT_LIMITS.durationWeekMinutes;
  const weekEnd = week * INVESTMENT_LIMITS.durationWeekMinutes;
  const maintenance = investments.assets.reduce((sum, asset) => {
    const activeMinutes = Math.max(0, weekEnd - Math.max(weekStart, asset.completedAt));
    return sum + asset.weeklyMaintenance * Math.min(1, activeMinutes / INVESTMENT_LIMITS.durationWeekMinutes);
  }, 0);
  const maintenanceCost = round(maintenance);
  state.budget -= maintenanceCost;
  investments.totalMaintenance += maintenanceCost;
  const item = { week, active: investments.projects.filter(active).length,
    completed: recent.filter(project => project.status === 'completed').length,
    cancelled: recent.filter(project => project.status === 'cancelled').length,
    costs: recent.filter(project => project.status === 'approved').reduce((sum, project) => sum + project.cost, 0),
    refunds: recent.reduce((sum, project) => sum + project.refund, 0), maintenance: maintenanceCost };
  investments.weekly.push(item); trimInvestmentHistory(investments); return item;
}

export function validateInvestmentState(value, city, state) {
  if (!isObject(value) || value.version !== INVESTMENT_VERSION || !Number.isSafeInteger(value.nextId) || value.nextId < 1
    || !Array.isArray(value.projects) || value.projects.length > INVESTMENT_LIMITS.activeProjects
    || !Array.isArray(value.history) || value.history.length > INVESTMENT_LIMITS.history
    || !Array.isArray(value.assets) || value.assets.length > INVESTMENT_LIMITS.assets
    || !Array.isArray(value.weekly) || value.weekly.length > 52
    || !finite(value.totalSpent) || value.totalSpent < 0 || !finite(value.totalRefunded) || value.totalRefunded < 0
    || !finite(value.totalMaintenance) || value.totalMaintenance < 0
    || value.totalRefunded > value.totalSpent) return false;
  const districtIds = new Set(Object.keys(state.cityEvolution?.districts || {}));
  const ids = new Set();
  let highestUsedId = 0;
  for (const project of value.projects) {
    if (!isObject(project) || typeof project.id !== 'string' || ids.has(project.id) || !/^investment-[1-9]\d*$/.test(project.id)
      || !INVESTMENT_CATALOG[project.type] || !districtIds.has(project.districtId)
      || !['planned', 'in-progress', 'completed'].includes(project.status)
      || !Number.isSafeInteger(project.cost) || project.cost !== INVESTMENT_CATALOG[project.type].cost
      || !Number.isSafeInteger(project.durationWeeks) || project.durationWeeks !== INVESTMENT_CATALOG[project.type].weeks
      || !Number.isSafeInteger(project.createdAt) || project.createdAt < 0 || typeof project.effectApplied !== 'boolean'
      || typeof project.charged !== 'boolean' || !Number.isSafeInteger(project.refund) || project.refund < 0 || project.refund > project.cost
      || !isObject(project.expected) || !['residentsCapacity', 'jobsCapacity', 'transportHandling'].every(key => finite(project.expected[key]) && project.expected[key] >= 0)
      || (project.status === 'planned' && project.charged) || (project.status !== 'planned' && !project.charged)
      || (project.status === 'planned' && (project.approvedAt !== null || project.completesAt !== null || project.effectApplied))
      || (project.status !== 'planned' && (!Number.isSafeInteger(project.approvedAt) || !Number.isSafeInteger(project.completesAt)
        || project.completesAt !== project.approvedAt + project.durationWeeks * INVESTMENT_LIMITS.durationWeekMinutes))
      || (project.status === 'completed' && (!project.effectApplied || !Number.isSafeInteger(project.completedAt) || !isObject(project.result)))) return false;
    ids.add(project.id);
    highestUsedId = Math.max(highestUsedId, Number(project.id.slice('investment-'.length)));
  }
  for (const item of value.history) {
    if (!isObject(item) || typeof item.id !== 'string' || !INVESTMENT_CATALOG[item.type]
      || !/^investment-[1-9]\d*$/.test(item.id)
      || !districtIds.has(item.districtId) || !['approved', 'completed', 'cancelled'].includes(item.status)
      || !Number.isSafeInteger(item.cost) || item.cost < 0 || item.cost > INVESTMENT_CATALOG[item.type].cost
      || !Number.isSafeInteger(item.refund) || item.refund < 0 || item.refund > INVESTMENT_CATALOG[item.type].cost
      || !Number.isSafeInteger(item.at) || item.at < 0 || !Number.isSafeInteger(item.week) || item.week < 1
      || (item.status === 'approved' && (item.cost !== INVESTMENT_CATALOG[item.type].cost || item.refund !== 0))
      || (item.status === 'completed' && (item.cost !== 0 || item.refund !== 0))
      || (item.status === 'cancelled' && item.cost !== 0)) return false;
    if (item.expected !== undefined && (!isObject(item.expected)
      || !['residentsCapacity', 'jobsCapacity', 'transportHandling'].every(key => finite(item.expected[key]) && item.expected[key] >= 0))) return false;
    if (item.status === 'completed' && (!isObject(item.result)
      || !['residents', 'jobs', 'residentsCapacity', 'jobsCapacity', 'transportHandling']
        .every(key => finite(item.result[key]) && item.result[key] >= 0)
      || item.result.transportHandling < 1 || item.result.transportHandling > 2)) return false;
    highestUsedId = Math.max(highestUsedId, Number(item.id.slice('investment-'.length)));
  }
  if (value.nextId <= highestUsedId) return false;
  const weeks = new Set();
  for (const item of value.weekly) if (!isObject(item) || !Number.isSafeInteger(item.week) || item.week < 1 || weeks.has(item.week)
    || !['active', 'completed', 'cancelled', 'costs', 'refunds', 'maintenance'].every(key => Number.isSafeInteger(item[key]) && item[key] >= 0)) return false;
  else weeks.add(item.week);
  const assets = new Set();
  for (const asset of value.assets) {
    const key = `${asset?.districtId}:${asset?.level}`;
    if (!isObject(asset) || !districtIds.has(asset.districtId) || ![1, 2].includes(asset.level) || assets.has(key)
      || !Number.isSafeInteger(asset.completedAt) || asset.completedAt < 0
      || asset.weeklyMaintenance !== INVESTMENT_CATALOG.hub.weeklyMaintenance) return false;
    assets.add(key);
  }
  for (const districtId of districtIds) {
    const levels = value.assets.filter(asset => asset.districtId === districtId).map(asset => asset.level).sort((a, b) => a - b);
    if (levels.some((level, index) => level !== index + 1)) return false;
    const expectedCapacity = levels.length ? 1 + levels.length * 0.5 : undefined;
    const actualCapacity = state.hubCapacityByPoint?.[districtId];
    if (actualCapacity !== expectedCapacity) return false;
  }
  if (state.hubCapacityByPoint !== undefined && (!isObject(state.hubCapacityByPoint)
    || Object.entries(state.hubCapacityByPoint).some(([id, capacity]) => !districtIds.has(id) || !finite(capacity) || capacity < 1 || capacity > 2))) return false;
  return true;
}
