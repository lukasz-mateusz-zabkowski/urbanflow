import { inferProfile } from './demand.js?v=10';
import { gameClock } from './simulation.js?v=10';
import { lineMetrics } from './transport.js?v=10';
import { capacitiesForLandUse, createLandUseProfile, evolveLandUseProfile, validateLandUseProfile } from './land-use.js?v=1';
import { INVESTMENT_CATALOG } from './investments.js?v=1';

export const CITY_EVOLUTION_VERSION = 1;
export const CITY_EVOLUTION_LIMITS = Object.freeze({ weeklyReports: 12, demandFactorMin: 0.8, demandFactorMax: 1.25, maxWeeklyChange: 0.0045 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value);
const employmentProfiles = new Set(['office', 'industrial', 'education', 'center', 'station', 'airport']);
const residentialProfiles = new Set(['residential', 'tourist', 'education', 'industrial', 'center', 'local']);

// These are compact gameplay indices, not measured demographic estimates.
// Each base is derived deterministically from the existing point demand score.
export function createCityEvolutionState(city) {
  const districts = {};
  for (const point of city.points || []) {
    if (point.type === 'stop') continue;
    const profile = inferProfile(point);
    const demand = clamp(Number(point.demand) || 1, 1, 20);
    const residents = round((4500 + demand * 620) * (profile === 'residential' ? 1.2 : 1));
    const jobs = round((employmentProfiles.has(profile) ? 5000 + demand * 780 : 1200 + demand * 180));
    const landUse = createLandUseProfile(profile);
    const capacity = capacitiesForLandUse({ residents, jobs }, landUse);
    districts[point.id] = {
      id: point.id, name: point.name, profile,
      base: { residents, jobs }, residents, jobs,
      residentialAttractiveness: 50, economicAttractiveness: 50,
      transportAccess: 0, transportSatisfaction: 50, jobAccess: 0, residentialAccess: 0,
      growthPotential: 50,
      capacity,
      constraints: { minimumResidents: round(residents * 0.75), minimumJobs: round(jobs * 0.75) },
      lastChange: { residents: 0, jobs: 0, residentialAttractiveness: 0, economicAttractiveness: 0 },
      landUse
    };
  }
  return { version: CITY_EVOLUTION_VERSION, source: 'simulation-parameters', lastEvolvedWeek: 1, districts, weeklyReports: [] };
}

export function ensureCityEvolution(state, city) {
  if (!state.cityEvolution || state.cityEvolution.version !== CITY_EVOLUTION_VERSION) state.cityEvolution = createCityEvolutionState(city);
  return state.cityEvolution;
}

export function cityDemandFactor(evolution, point) {
  const zone = evolution?.districts?.[typeof point === 'string' ? point : point?.id];
  if (!zone?.base?.residents || !Number.isFinite(zone.residents)) return 1;
  return clamp(zone.residents / zone.base.residents, CITY_EVOLUTION_LIMITS.demandFactorMin, CITY_EVOLUTION_LIMITS.demandFactorMax);
}

function networkAccess(state, city, zones) {
  const graph = new Map();
  const serviceShares = new Map();
  const samples = [
    ...['weekday', 'weekday', 'weekday', 'saturday', 'sunday'].flatMap(dayType => [60, 450, 720, 990, 1200, 1410].map(minuteOfDay => ({ dayType, minuteOfDay })))
  ];
  for (const line of state.lines || []) {
    const modelLine = { ...line, type: line.type || 'bus', frequency: line.frequency || 3, vehicles: line.vehicles || 1 };
    const activeSamples = samples.reduce((sum, sample) => sum + Number(lineMetrics(modelLine, city, sample.minuteOfDay,
      { events: [], elapsedMinutes: 0, serviceDayType: sample.dayType }).effectiveFrequency > 0), 0);
    serviceShares.set(line.id, activeSamples / samples.length);
  }
  const operatingLines = (state.lines || []).filter(line => (serviceShares.get(line.id) || 0) > 0);
  for (const line of operatingLines) {
    if (!Array.isArray(line.stops) || line.stops.length < 2) continue;
    for (let index = 1; index < line.stops.length; index += 1) {
      const from = line.stops[index - 1], to = line.stops[index];
      if (!graph.has(from)) graph.set(from, new Set());
      if (!graph.has(to)) graph.set(to, new Set());
      graph.get(from).add(to); graph.get(to).add(from);
    }
  }
  const components = new Map(); let componentId = 0;
  for (const start of graph.keys()) {
    if (components.has(start)) continue;
    const queue = [start]; components.set(start, componentId);
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of graph.get(queue[cursor]) || []) {
      if (!components.has(next)) { components.set(next, componentId); queue.push(next); }
    }
    componentId += 1;
  }
  const jobs = Object.values(zones).filter(zone => employmentProfiles.has(zone.profile));
  const homes = Object.values(zones).filter(zone => residentialProfiles.has(zone.profile));
  const totalJobs = jobs.reduce((sum, zone) => sum + Math.max(0, Number(zone.jobs) || 0), 0);
  const totalResidents = homes.reduce((sum, zone) => sum + Math.max(0, Number(zone.residents) || 0), 0);
  const result = new Map();
  for (const zone of Object.values(zones)) {
    const component = components.get(zone.id);
    const served = component !== undefined;
    const reachableJobs = jobs.filter(other => component !== undefined && components.get(other.id) === component)
      .reduce((sum, other) => sum + Math.max(0, Number(other.jobs) || 0), 0);
    const reachableResidents = homes.filter(other => component !== undefined && components.get(other.id) === component)
      .reduce((sum, other) => sum + Math.max(0, Number(other.residents) || 0), 0);
    const jobAccess = totalJobs ? reachableJobs / totalJobs : 0;
    const residentialAccess = totalResidents ? reachableResidents / totalResidents : 0;
    const localLines = operatingLines.filter(line => line.stops.includes(zone.id));
    const componentLines = operatingLines.filter(line => line.stops.some(stop => components.get(stop) === component));
    const serviceShare = componentLines.length ? Math.max(...componentLines.map(line => serviceShares.get(line.id) || 0)) : 0;
    const wait = localLines.length ? localLines.reduce((sum, line) => sum + Math.max(0, Number(line.stats?.avgWaitMinutes) || 0), 0) / localLines.length : 60;
    const load = localLines.length ? Math.max(...localLines.map(line => clamp(Number(line.stats?.load) || 0, 0, 1.5))) : 1;
    const complementaryAccess = employmentProfiles.has(zone.profile) ? residentialAccess : jobAccess;
    // A route that only connects like-use areas has no modelled useful destination.
    // Do not grant the old 30% baseline access until a complementary destination is reachable.
    const access = served && complementaryAccess > 0
      ? clamp((0.7 * complementaryAccess + 0.3) * serviceShare, 0, 1) : 0;
    const satisfaction = served ? clamp(70 * access + 20 * Math.max(0, 1 - wait / 60) + 10 * Math.max(0, 1 - load), 0, 100) : 0;
    result.set(zone.id, { access, jobAccess, residentialAccess, satisfaction, waitMinutes: wait, load, connected: served });
  }
  return result;
}

export function evolveCityWeek(state, city) {
  const evolution = ensureCityEvolution(state, city);
  const week = gameClock(Math.max(0, state.elapsedMinutes || 0), state.calendar).week;
  if (week <= evolution.lastEvolvedWeek) return evolution.weeklyReports.at(-1) || null;
  const before = Object.values(evolution.districts).reduce((total, zone) => ({ residents: total.residents + zone.residents, jobs: total.jobs + zone.jobs }), { residents: 0, jobs: 0 });
  const access = networkAccess(state, city, evolution.districts);
  for (const zone of Object.values(evolution.districts)) {
    const observed = access.get(zone.id) || { access: 0, jobAccess: 0, residentialAccess: 0, satisfaction: 0, waitMinutes: 60, load: 1 };
    const oldResidential = zone.residentialAttractiveness;
    const oldEconomic = zone.economicAttractiveness;
    const residentTarget = observed.connected
      ? clamp(30 + observed.jobAccess * 34 + observed.satisfaction * 0.36, 0, 100) : 28;
    const economicTarget = observed.connected
      ? clamp(28 + observed.residentialAccess * 36 + observed.satisfaction * 0.36, 0, 100) : 28;
    // Overload and long waits directly reduce the accessible benefit of a route.
    const overloadPenalty = Math.max(0, observed.load - 0.65) * 18 + Math.max(0, observed.waitMinutes - 15) * 0.16;
    zone.residentialAttractiveness = clamp(oldResidential + (residentTarget - oldResidential) * 0.16 - overloadPenalty * 0.05, 0, 100);
    zone.economicAttractiveness = clamp(oldEconomic + (economicTarget - oldEconomic) * 0.16 - overloadPenalty * 0.05, 0, 100);
    zone.transportAccess = round(observed.access * 100);
    zone.transportSatisfaction = round(observed.satisfaction);
    zone.jobAccess = round(observed.jobAccess * 100);
    zone.residentialAccess = round(observed.residentialAccess * 100);
    zone.growthPotential = round(clamp((100 - Math.max(zone.residentialAttractiveness, zone.economicAttractiveness)) * 0.5 + Math.min(50, Math.max(0, zone.capacity.residents - zone.residents) / Math.max(1, zone.capacity.residents) * 50), 0, 100));
    const residentRate = clamp((zone.residentialAttractiveness - 50) * 0.00009, -CITY_EVOLUTION_LIMITS.maxWeeklyChange, CITY_EVOLUTION_LIMITS.maxWeeklyChange);
    const jobRate = clamp((zone.economicAttractiveness - 50) * 0.00009, -CITY_EVOLUTION_LIMITS.maxWeeklyChange, CITY_EVOLUTION_LIMITS.maxWeeklyChange);
    const oldResidents = zone.residents, oldJobs = zone.jobs;
    zone.residents = round(clamp(oldResidents * (1 + residentRate), zone.constraints.minimumResidents, zone.capacity.residents));
    zone.jobs = round(clamp(oldJobs * (1 + jobRate), zone.constraints.minimumJobs, zone.capacity.jobs));
    zone.lastChange = { residents: zone.residents - oldResidents, jobs: zone.jobs - oldJobs,
      residentialAttractiveness: round((zone.residentialAttractiveness - oldResidential) * 10) / 10,
      economicAttractiveness: round((zone.economicAttractiveness - oldEconomic) * 10) / 10 };
  }
  const after = Object.values(evolution.districts).reduce((total, zone) => ({ residents: total.residents + zone.residents, jobs: total.jobs + zone.jobs }), { residents: 0, jobs: 0 });
  const ranked = Object.values(evolution.districts);
  const byChange = key => [...ranked].sort((a, b) => b.lastChange[key] - a.lastChange[key]);
  const network = (state.networkWeeklyHistory || []).at(-1);
  const investmentSummary = state.investments?.weekly?.find(item => item.week === week - 1) || null;
  const landUseChanges = [];
  const blockedByTransport = [];
  const developmentPotential = [];
  for (const zone of ranked) {
    const reservedReserve = (state.investments?.projects || []).filter(project => project.districtId === zone.id
      && ['planned', 'in-progress'].includes(project.status) && project.type !== 'hub')
      .reduce((sum, project) => sum + (INVESTMENT_CATALOG[project.type]?.reserve || 0), 0);
    const advancement = evolveLandUseProfile(zone.landUse, {
      week, profile: zone.profile, transportAccess: zone.transportAccess,
      transportSatisfaction: zone.transportSatisfaction,
      residentialAttractiveness: zone.residentialAttractiveness,
      economicAttractiveness: zone.economicAttractiveness,
      growthPotential: zone.growthPotential, reservedReserve
    });
    zone.landUse = advancement.profile;
    const expanded = capacitiesForLandUse(zone.base, zone.landUse);
    zone.capacity.residents = Math.max(zone.capacity.residents, expanded.residents);
    zone.capacity.jobs = Math.max(zone.capacity.jobs, expanded.jobs);
    if (advancement.change) landUseChanges.push({ id: zone.id, name: zone.name, ...advancement.change,
      residentsCapacity: zone.capacity.residents, jobsCapacity: zone.capacity.jobs });
    if (advancement.blockedByTransport) blockedByTransport.push({ id: zone.id, name: zone.name,
      access: zone.transportAccess, satisfaction: zone.transportSatisfaction,
      developmentProgress: zone.landUse.developmentProgress, reserve: zone.landUse.shares.reserve });
    if (zone.landUse.shares.reserve >= 4 && zone.landUse.intensity !== 'high') developmentPotential.push({
      id: zone.id, name: zone.name, potential: zone.growthPotential,
      progress: zone.landUse.developmentProgress, direction: zone.transportAccess < 25 || zone.transportSatisfaction < 35
        ? 'transport' : zone.residentialAttractiveness >= zone.economicAttractiveness ? 'residential' : 'economic'
    });
  }
  landUseChanges.sort((a, b) => a.id.localeCompare(b.id));
  blockedByTransport.sort((a, b) => b.developmentProgress - a.developmentProgress || a.id.localeCompare(b.id));
  developmentPotential.sort((a, b) => b.potential - a.potential || b.progress - a.progress || a.id.localeCompare(b.id));
  const report = {
    week, residentsDelta: after.residents - before.residents, jobsDelta: after.jobs - before.jobs,
    demandChangePercent: before.residents ? (round(((after.residents / before.residents) - 1) * 1000) / 10 || 0) : 0,
    fastestGrowing: byChange('residents').slice(0, 3).filter(zone => zone.lastChange.residents > 0).map(zone => ({ id: zone.id, name: zone.name, change: zone.lastChange.residents })),
    declining: byChange('residents').reverse().slice(0, 3).filter(zone => zone.lastChange.residents < 0).map(zone => ({ id: zone.id, name: zone.name, change: zone.lastChange.residents })),
    transportIssues: ranked.filter(zone => zone.transportAccess < 30 || zone.transportSatisfaction < 35)
      .sort((a, b) => a.transportSatisfaction - b.transportSatisfaction).slice(0, 5)
      .map(zone => ({ id: zone.id, name: zone.name, access: zone.transportAccess, satisfaction: zone.transportSatisfaction })),
    landUseChanges,
    blockedByTransport: blockedByTransport.slice(0, 5),
    developmentPotential: developmentPotential.slice(0, 3),
    investments: investmentSummary,
    districtSnapshots: ranked.map(zone => ({
      id: zone.id, residents: zone.residents, jobs: zone.jobs,
      residentialAttractiveness: zone.residentialAttractiveness, economicAttractiveness: zone.economicAttractiveness,
      transportAccess: zone.transportAccess, transportSatisfaction: zone.transportSatisfaction,
      jobAccess: zone.jobAccess, residentialAccess: zone.residentialAccess, growthPotential: zone.growthPotential,
      intensity: zone.landUse.intensity, reserve: zone.landUse.shares.reserve,
      residentsCapacity: zone.capacity.residents, jobsCapacity: zone.capacity.jobs,
      demandFactor: cityDemandFactor(evolution, zone),
      investmentCount: (state.investments?.projects || []).filter(project => project.districtId === zone.id && ['planned', 'in-progress'].includes(project.status)).length
        + (state.investments?.assets || []).filter(asset => asset.districtId === zone.id).length
        + (state.investments?.history || []).filter(item => item.districtId === zone.id && item.status === 'completed').length
    })),
    networkBalance: network ? network.revenue - network.cost : null,
    networkWeek: network?.week ?? null
  };
  evolution.lastEvolvedWeek = week;
  evolution.weeklyReports.push(report);
  if (evolution.weeklyReports.length > CITY_EVOLUTION_LIMITS.weeklyReports) evolution.weeklyReports.splice(0, evolution.weeklyReports.length - CITY_EVOLUTION_LIMITS.weeklyReports);
  return report;
}

export function cityEvolutionSnapshot(evolution) {
  if (!evolution) return { districts: [], weeklyReports: [] };
  return { districts: Object.values(evolution.districts || {}), weeklyReports: evolution.weeklyReports || [] };
}

export function validateCityEvolutionState(evolution, city) {
  if (!evolution || typeof evolution !== 'object' || Array.isArray(evolution) || evolution.version !== CITY_EVOLUTION_VERSION
    || evolution.source !== 'simulation-parameters' || !Number.isSafeInteger(evolution.lastEvolvedWeek) || evolution.lastEvolvedWeek < 1
    || !evolution.districts || typeof evolution.districts !== 'object' || Array.isArray(evolution.districts)
    || !Array.isArray(evolution.weeklyReports) || evolution.weeklyReports.length > CITY_EVOLUTION_LIMITS.weeklyReports) return false;
  const points = (city.points || []).filter(point => point.type !== 'stop');
  const ids = new Set(points.map(point => point.id));
  if (Object.keys(evolution.districts).length !== ids.size || Object.keys(evolution.districts).some(id => !ids.has(id))) return false;
  const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  for (const [id, zone] of Object.entries(evolution.districts)) {
    if (!zone || typeof zone !== 'object' || zone.id !== id || typeof zone.name !== 'string' || zone.name.length > 120
      || typeof zone.profile !== 'string' || !['base', 'capacity', 'constraints', 'lastChange'].every(key => zone[key] && typeof zone[key] === 'object')) return false;
    if (!validateLandUseProfile(zone.landUse) || zone.landUse.profile !== zone.profile) return false;
    if (zone.landUse.lastDevelopmentWeek > evolution.lastEvolvedWeek
      || zone.landUse.lastIntensityChangeWeek > zone.landUse.lastDevelopmentWeek) return false;
    if (!['residents', 'jobs'].every(key => finiteNonnegative(zone[key]) && finiteNonnegative(zone.base[key]) && zone.base[key] > 0
      && finiteNonnegative(zone.capacity[key]) && zone.capacity[key] >= zone[key]
      && finiteNonnegative(zone.constraints[`minimum${key[0].toUpperCase()}${key.slice(1)}`])
      && zone.constraints[`minimum${key[0].toUpperCase()}${key.slice(1)}`] <= zone[key])) return false;
    if (!['residentialAttractiveness', 'economicAttractiveness', 'transportAccess', 'transportSatisfaction', 'jobAccess', 'residentialAccess', 'growthPotential']
      .every(key => finiteNonnegative(zone[key]) && zone[key] <= 100)) return false;
    if (!['residents', 'jobs', 'residentialAttractiveness', 'economicAttractiveness'].every(key => Number.isFinite(zone.lastChange[key]) && Math.abs(zone.lastChange[key]) <= 100000000)) return false;
  }
  for (const report of evolution.weeklyReports) {
    if (!report || typeof report !== 'object' || !Number.isSafeInteger(report.week) || report.week < 1
      || !Number.isFinite(report.residentsDelta) || !Number.isFinite(report.jobsDelta) || !Number.isFinite(report.demandChangePercent)
      || !(report.networkBalance === null || Number.isFinite(report.networkBalance))
      || !(report.networkWeek === null || Number.isSafeInteger(report.networkWeek) && report.networkWeek >= 1)
      || ((report.networkBalance === null) !== (report.networkWeek === null))
      || !Array.isArray(report.fastestGrowing) || !Array.isArray(report.declining) || !Array.isArray(report.transportIssues)
      || !Array.isArray(report.landUseChanges) || report.landUseChanges.length > ids.size
      || !Array.isArray(report.blockedByTransport) || report.blockedByTransport.length > 5
      || !Array.isArray(report.developmentPotential) || report.developmentPotential.length > 3
      || !Array.isArray(report.districtSnapshots) || report.districtSnapshots.length > ids.size
      || (report.districtSnapshots.length !== 0 && report.districtSnapshots.length !== ids.size)) return false;
    for (const item of [...report.fastestGrowing, ...report.declining]) if (!ids.has(item?.id) || typeof item.name !== 'string' || !Number.isFinite(item.change)) return false;
    for (const item of report.transportIssues) if (!ids.has(item?.id) || typeof item.name !== 'string'
      || !finiteNonnegative(item.access) || item.access > 100 || !finiteNonnegative(item.satisfaction) || item.satisfaction > 100) return false;
    for (const item of report.landUseChanges) if (!ids.has(item?.id) || typeof item.name !== 'string'
      || !Number.isSafeInteger(item.week) || item.week < 1 || !['low', 'medium'].includes(item.fromIntensity)
      || !['medium', 'high'].includes(item.toIntensity) || !['residential', 'retail', 'office', 'industrial', 'public', 'green'].includes(item.convertedUse)
      || item.fromIntensity === item.toIntensity || item.reserveConverted !== 4
      || !finiteNonnegative(item.residentsCapacity) || !finiteNonnegative(item.jobsCapacity)) return false;
    for (const item of report.blockedByTransport) if (!ids.has(item?.id) || typeof item.name !== 'string'
      || !finiteNonnegative(item.access) || item.access > 100 || !finiteNonnegative(item.satisfaction) || item.satisfaction > 100
      || !finiteNonnegative(item.developmentProgress) || item.developmentProgress > 100 || !integer(item.reserve) || item.reserve < 4 || item.reserve > 100) return false;
    for (const item of report.developmentPotential) if (!ids.has(item?.id) || typeof item.name !== 'string'
      || !finiteNonnegative(item.potential) || item.potential > 100 || !finiteNonnegative(item.progress) || item.progress > 100
      || !['transport', 'residential', 'economic'].includes(item.direction)) return false;
    const snapshotIds = new Set();
    for (const item of report.districtSnapshots) {
      if (!ids.has(item?.id) || snapshotIds.has(item.id) || !['residents', 'jobs', 'residentialAttractiveness', 'economicAttractiveness',
        'transportAccess', 'transportSatisfaction', 'jobAccess', 'residentialAccess', 'growthPotential', 'reserve',
        'residentsCapacity', 'jobsCapacity', 'demandFactor', 'investmentCount'].every(key => finiteNonnegative(item[key]))
        || ['residentialAttractiveness', 'economicAttractiveness', 'transportAccess', 'transportSatisfaction', 'jobAccess', 'residentialAccess', 'growthPotential', 'reserve'].some(key => item[key] > 100)
        || item.residents > item.residentsCapacity || item.jobs > item.jobsCapacity || item.demandFactor < CITY_EVOLUTION_LIMITS.demandFactorMin
        || item.demandFactor > CITY_EVOLUTION_LIMITS.demandFactorMax || !['low', 'medium', 'high'].includes(item.intensity)
        || !Number.isSafeInteger(item.investmentCount)) return false;
      snapshotIds.add(item.id);
    }
  }
  return true;
}
