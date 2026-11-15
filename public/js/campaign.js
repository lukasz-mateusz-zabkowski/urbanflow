import { eligibleCounts, PROGRESSION } from './transport.js?v=8';
import { buildNetwork, isConnected, totalWaiting } from './passengers.js?v=8';

export const STRESS_PHASES = [
  { id: 'morning', title: 'Poranny szczyt', duration: 420, demand: 1.55, locationId: 'centrum', localDemand: 1.25, description: 'Dojazdy do centrum gwałtownie rosną.' },
  { id: 'event', title: 'Wydarzenie masowe', duration: 360, demand: 1.2, locationId: 'nowa-huta', localDemand: 2.35, description: 'Tauron Arena wymaga dodatkowej przepustowości.' },
  { id: 'disruption', title: 'Awaria i remont', duration: 360, demand: 1.15, locationId: 'centrum', affectedTypes: ['bus', 'tram'], speedMultiplier: 0.5, description: 'Transport naziemny przez centrum jest mocno spowolniony.' },
  { id: 'finale', title: 'Finałowe obciążenie', duration: 480, demand: 1.85, locationId: 'dworzec', localDemand: 1.7, description: 'Dworzec i całe miasto pracują pod największym obciążeniem.' }
];

export const createCampaign = () => ({
  completed: [], qualityMinutes: 0, profitableDays: 0, profitMinutes: 0, profitStart: 0, profitDay: null, grants: 0,
  stress: { status: 'locked', phaseIndex: 0, phaseMinutes: 0, criticalMinutes: 0, startBudget: null, startGenerated: 0, startAbandoned: 0, minSatisfaction: 100 }
});

const definitions = game => {
  const scenario = game.startScenario;
  return [
    ['gateway', `Połącz ${scenario.name}`, `Uruchom połączenie do węzła ${game.pointName(scenario.localHubId)}.`, 50000],
    ['center', 'Wejdź do Krakowa', `Połącz ${game.pointName(scenario.localHubId)} z węzłem ${game.pointName(scenario.centerId)}. Możesz użyć dowolnych dostępnych linii i przesiadek.`, 80000],
    ['passengers', 'Pierwszych 500 podróży', 'Dowieź 500 pasażerów do celu; przesiadka nie liczy się podwójnie.', 120000],
    ['buses', 'Dwie użyteczne linie', `2 linie autobusowe: min. 80 przewozów i ${PROGRESSION.minAgeMinutes / 60} godzin pracy każdej.`, 170000],
    ['tram', 'Miejski kręgosłup', `Uruchom pierwszy użyteczny tramwaj (80 przewozów, ${PROGRESSION.minAgeMinutes / 60} godzin pracy).`, 880000],
    ['huta', 'Nowa Huta w sieci', 'Połącz Nową Hutę z Centrum; linia do Huty musi przewieźć min. 80 pasażerów.', 440000],
    ['airport', 'Brama do Krakowa', 'Uruchom do Balic kolej lub metro; min. 80 przewozów tej linii.', 130000],
    ['stress', 'Egzamin metropolii', 'Przejdź krótki egzamin: szczyt, wydarzenie, zakłócenie i finał.', 0]
  ];
};

function ensureStress(campaign) {
  campaign.stress ||= createCampaign().stress;
  return campaign.stress;
}

function completed(campaign, id) {
  return campaign.completed.includes(id) || (id === 'gateway' && campaign.completed.includes('wieliczka')) || (id === 'stress' && campaign.completed.includes('profit'));
}

export function campaignObjectives(game) {
  const s = game.state; const c = s.campaign; const stress = ensureStress(c);
  const list = definitions(game); const scenario = game.startScenario;
  const counts = eligibleCounts(s.lines, s.satisfaction); const network = buildNetwork(s.lines);
  const gateway = isConnected(network, scenario.id, scenario.localHubId);
  const center = gateway && isConnected(network, scenario.localHubId, scenario.centerId);
  const huta = isConnected(network, 'nowa-huta', 'centrum') && s.lines.some(line => line.stops.includes('nowa-huta') && line.stats.carried >= 80);
  const airport = s.airportUnlocked && isConnected(network, 'balice', 'centrum') && s.lines.some(line => ['metro', 'suburban', 'intercity'].includes(line.type) && line.stops.includes('balice') && line.stats.carried >= 80);
  const stressProgress = stress.status === 'passed' ? 1 : stress.status === 'active'
    ? (stress.phaseIndex + stress.phaseMinutes / STRESS_PHASES[stress.phaseIndex].duration) / STRESS_PHASES.length : 0;
  const values = [gateway ? 1 : 0, center ? 1 : 0, s.carried / 500,
    counts.bus / 2, counts.tram, huta ? 1 : 0, airport ? 1 : 0, stressProgress];
  return list.map(([id, title, baseDescription, reward], index) => {
    let description = baseDescription;
    if (id === 'stress' && stress.status === 'active') {
      const phase = STRESS_PHASES[stress.phaseIndex];
      description = `${phase.title}: ${phase.description} Postęp ${Math.round(stress.phaseMinutes / phase.duration * 100)}%.`;
    }
    if (reward) description += ` Nagroda: ${reward.toLocaleString('pl-PL')} zł.`;
    return { id, title, description, reward, progress: completed(c, id) ? 1 : Math.min(1, values[index]), completed: completed(c, id) };
  });
}

function startPhase(game) {
  const state = game.state; const stress = ensureStress(state.campaign); const phase = STRESS_PHASES[stress.phaseIndex];
  state.cityEvents = (state.cityEvents || []).filter(event => event.source !== 'stress');
  state.stressDemandMultiplier = phase.demand;
  stress.phaseMinutes = 0; stress.criticalMinutes = 0; stress.startGenerated = state.generated; stress.startAbandoned = state.abandoned;
  stress.minSatisfaction = Math.min(stress.minSatisfaction, state.satisfaction);
  if (phase.locationId || phase.affectedTypes) state.cityEvents.push({
    id: `stress-${phase.id}`, source: 'stress', kind: `stress-${phase.id}`, title: phase.title, message: phase.description,
    locationId: phase.locationId || null, demandMultiplier: phase.localDemand || 1, affectedTypes: phase.affectedTypes || [],
    speedMultiplier: phase.speedMultiplier || 1, startMinute: state.elapsedMinutes, endMinute: state.elapsedMinutes + phase.duration
  });
  game.events.onStressPhase?.(phase, stress.phaseIndex + 1, STRESS_PHASES.length);
  game.events.onCityEvent?.(state.cityEvents.find(event => event.id === `stress-${phase.id}`) || { title: phase.title, message: phase.description, locationId: null });
}

function updateStressTest(game, delta) {
  const state = game.state; const stress = ensureStress(state.campaign);
  if (stress.status === 'locked') {
    stress.status = 'active'; stress.startBudget = state.budget; stress.phaseIndex = 0; stress.minSatisfaction = state.satisfaction;
    startPhase(game);
  }
  if (stress.status !== 'active' || delta <= 0) return;
  stress.phaseMinutes += delta;
  stress.minSatisfaction = Math.min(stress.minSatisfaction, state.satisfaction);
  const generated = Math.max(0, state.generated - stress.startGenerated);
  const abandoned = Math.max(0, state.abandoned - stress.startAbandoned);
  const failureRate = generated >= 300 ? abandoned / generated : 0;
  const critical = state.satisfaction < 45 || totalWaiting(state.passengers) > state.stopCapacity * 12 || failureRate > 0.55;
  stress.criticalMinutes = critical ? stress.criticalMinutes + delta : Math.max(0, stress.criticalMinutes - delta * 2);
  if (stress.criticalMinutes >= 120) {
    game.finish('lost', `Sieć nie przetrwała etapu „${STRESS_PHASES[stress.phaseIndex].title}”: jakość była krytyczna przez 2 godziny.`);
    return;
  }
  if (stress.phaseMinutes < STRESS_PHASES[stress.phaseIndex].duration) return;
  stress.phaseIndex += 1;
  if (stress.phaseIndex >= STRESS_PHASES.length) {
    stress.status = 'passed'; state.stressDemandMultiplier = 1;
    state.cityEvents = (state.cityEvents || []).filter(event => event.source !== 'stress');
    return;
  }
  startPhase(game);
}

export function updateCampaign(game, delta) {
  const s = game.state; const c = s.campaign; ensureStress(c);
  if (s.status !== 'playing') return;
  c.qualityMinutes = s.satisfaction > 75 && s.lines.length ? c.qualityMinutes + delta : 0;
  const objectives = campaignObjectives(game);
  for (const objective of objectives.slice(0, 7)) if (!objective.completed && objective.progress >= 1) {
    c.completed.push(objective.id); s.budget += objective.reward; c.grants += objective.reward; game.events.onObjective?.(objective);
  }
  const list = definitions(game);
  const firstSeven = list.slice(0, 7).every(([id]) => completed(c, id));
  if (firstSeven) updateStressTest(game, delta);
  if (ensureStress(c).status === 'passed' && !completed(c, 'stress')) {
    c.completed.push('stress'); game.events.onObjective?.(campaignObjectives(game).at(-1));
  }
  if (list.every(([id]) => completed(c, id))) game.finish('won');
}

