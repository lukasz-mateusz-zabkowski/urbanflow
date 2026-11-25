import { buildNetwork, isConnected } from './passengers.js?v=10';
import { SIMULATION } from './simulation.js?v=10';

const WEEK_MINUTES = 7 * 24 * 60;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

export const CAMPAIGN_CHALLENGES = Object.freeze([
  Object.freeze({
    id: 'recovery', name: 'Odbudowa transportu', difficulty: 'Umiarkowane',
    description: 'Ograniczony budżet i flota. Przywróć użyteczne połączenia, obsłuż rosnący popyt i popraw dostępność okolicy.',
    startingBudget: 420000, startingBusFleet: 4, startScenarioId: 'wieliczka', targetDistrictId: 'wieliczka', deadlineWeeks: 12,
    objectives: Object.freeze([
      Object.freeze({ id: 'recovery-service', title: 'Przywróć połączenie z lokalnym węzłem', description: 'Uruchom usługę łączącą miejscowość startową z jej lokalnym węzłem.', type: 'connection', deadlineWeeks: 12, workspace: 'planning' }),
      Object.freeze({ id: 'recovery-ridership', title: 'Obsłuż 2 500 podróży', description: 'Przewieź pasażerów, korzystając z istniejącej symulacji kohort.', type: 'carried', target: 2500, deadlineWeeks: 12, workspace: 'passengers' }),
      Object.freeze({ id: 'recovery-access', title: 'Popraw dostępność okolicy', description: 'Osiągnij co najmniej 30% modelowanej dostępności transportowej w Wieliczce.', type: 'transport-access', target: 30, deadlineWeeks: 12, workspace: 'development' })
    ])
  }),
  Object.freeze({
    id: 'finance-crisis', name: 'Kryzys finansowy', difficulty: 'Trudne',
    description: 'Startujesz bez linii i z małą rezerwą. Zbuduj ofertę przynoszącą dodatni wynik przez dwa pełne tygodnie i odbuduj budżet do 250 000 zł w ciągu ośmiu tygodni.',
    startingBudget: 220000, startingBusFleet: 6, startScenarioId: 'zielonki', targetDistrictId: 'zielonki', deadlineWeeks: 8,
    objectives: Object.freeze([
      Object.freeze({ id: 'crisis-profit', title: 'Uzyskaj dwa dodatnie tygodnie operacyjne', description: 'Dwa kolejne zamknięte tygodnie muszą mieć dodatni obserwowany bilans sieci.', type: 'positive-weeks', target: 2, deadlineWeeks: 8, workspace: 'operations' }),
      Object.freeze({ id: 'crisis-reserve', title: 'Odbuduj rezerwę do 250 000 zł', description: 'Zachowaj co najmniej 250 000 zł w budżecie przed upływem terminu.', type: 'cash', target: 250000, deadlineWeeks: 8, workspace: 'operations' })
    ])
  }),
  Object.freeze({
    id: 'growing-city', name: 'Rozwijające się miasto', difficulty: 'Długofalowe',
    description: 'Wykorzystaj transport i istniejące inwestycje, by wesprzeć stopniowy rozwój dzielnicy i odpowiedzieć na popyt.',
    startingBudget: 650000, startingBusFleet: 6, startScenarioId: 'kocmyrzow', targetDistrictId: 'nowa-huta', deadlineWeeks: 52,
    objectives: Object.freeze([
      Object.freeze({ id: 'growth-residents', title: 'Wesprzyj wzrost liczby mieszkańców', description: 'Zwiększ modelowaną populację Nowej Huty o 0,3% względem początku kampanii.', type: 'district-growth', field: 'residents', target: 0.003, deadlineWeeks: 52, workspace: 'development' }),
      Object.freeze({ id: 'growth-jobs', title: 'Wesprzyj wzrost liczby miejsc pracy', description: 'Zwiększ modelowaną liczbę miejsc pracy Nowej Huty o 0,1% względem początku kampanii. Próg uwzględnia tempo wzrostu obecnego modelu miasta.', type: 'district-growth', field: 'jobs', target: 0.001, deadlineWeeks: 52, workspace: 'development' }),
      Object.freeze({ id: 'growth-investment', title: 'Zrealizuj projekt w Nowej Hucie', description: 'Ukończ co najmniej jedną inwestycję mieszkaniową lub gospodarczą w wybranym obszarze.', type: 'completed-investment', target: 1, deadlineWeeks: 52, workspace: 'planning' }),
      Object.freeze({ id: 'growth-ridership', title: 'Obsłuż 8 000 podróży', description: 'Dowieź pasażerów bezpośrednio w symulacji transportu.', type: 'carried', target: 8000, deadlineWeeks: 52, workspace: 'passengers' })
    ])
  })
]);

const byId = new Map(CAMPAIGN_CHALLENGES.map(challenge => [challenge.id, challenge]));
export const getCampaignChallenge = id => byId.get(id) || null;

export function createChallengeProgress(id, state) {
  const definition = getCampaignChallenge(id);
  if (!definition || !state || !Number.isFinite(state.elapsedMinutes)) return null;
  const district = state.cityEvolution?.districts?.[definition.targetDistrictId];
  const objectives = definition.objectives;
  return {
    id, status: 'active', startedAt: state.elapsedMinutes,
    deadlineAt: state.elapsedMinutes + definition.deadlineWeeks * WEEK_MINUTES,
    completed: [], completedAt: {},
    baseline: {
      budget: Number.isFinite(state.budget) ? state.budget : 0,
      carried: Number.isFinite(state.carried) ? state.carried : 0,
      districtId: definition.targetDistrictId,
      residents: Number.isFinite(district?.residents) ? district.residents : 0,
      jobs: Number.isFinite(district?.jobs) ? district.jobs : 0
    },
    objectiveIds: objectives.map(objective => objective.id),
    summary: null
  };
}

function objectiveValue(game, definition, objective) {
  const state = game.state;
  switch (objective.type) {
    case 'connection': {
      const network = buildNetwork(state.lines.filter(line => !line.routingUnavailable && line.stops?.length >= 2));
      return isConnected(network, game.startScenario.id, game.startScenario.localHubId) ? 1 : 0;
    }
    case 'carried': return Number(state.carried) || 0;
    case 'cash': return Number(state.budget) || 0;
    case 'transport-access': return Number(state.cityEvolution?.districts?.[definition.targetDistrictId]?.transportAccess) || 0;
    case 'district-growth': {
      const baseline = state.campaign.challenge?.baseline;
      const zone = state.cityEvolution?.districts?.[definition.targetDistrictId];
      const initial = Number(baseline?.[objective.field]);
      const current = Number(zone?.[objective.field]);
      return initial > 0 && Number.isFinite(current) ? (current - initial) / initial : 0;
    }
    case 'completed-investment': return (state.investments?.history || []).filter(item => item.districtId === definition.targetDistrictId
      && ['housing', 'economic'].includes(item.type) && item.status === 'completed').length;
    case 'positive-weeks': {
      const samplesPerWeek = 7 * 24 * 60 / SIMULATION.minutesPerTick;
      const weeks = (state.networkWeeklyHistory || []).filter(week => week.samples >= samplesPerWeek);
      let consecutive = 0;
      for (let index = weeks.length - 1; index >= 0; index -= 1) {
        if (weeks[index].balance <= 0) break;
        if (index < weeks.length - 1 && weeks[index].week !== weeks[index + 1].week - 1) break;
        consecutive += 1;
      }
      return consecutive;
    }
    default: return 0;
  }
}

export function campaignChallengeObjectives(game) {
  const challenge = game?.state?.campaign?.challenge;
  const definition = getCampaignChallenge(challenge?.id);
  if (!definition) return [];
  return definition.objectives.map(objective => {
    const value = objectiveValue(game, definition, objective);
    const completed = challenge.completed.includes(objective.id);
    const progress = completed ? 1 : clamp(objective.target ? value / objective.target : value);
    const deadlineAt = challenge.startedAt + objective.deadlineWeeks * WEEK_MINUTES;
    return { ...objective, progress, value, completed, deadlineAt,
      deadlineRemainingMinutes: Math.max(0, deadlineAt - game.state.elapsedMinutes) };
  });
}

function createSummary(game, status, completed, missed) {
  const state = game.state;
  const challenge = state.campaign.challenge;
  const definition = getCampaignChallenge(challenge.id);
  const initialDistrict = state.cityEvolution?.districts?.[challenge.baseline.districtId];
  const completedProjects = (state.investments?.history || []).filter(project => project.status === 'completed').length;
  const opportunities = Number(state.mobility?.accessibility?.opportunities) || 0;
  const reachable = Number(state.mobility?.accessibility?.reachable) || 0;
  const zone = state.cityEvolution?.districts?.[definition.targetDistrictId];
  return {
    status, finishedAt: state.elapsedMinutes, elapsedMinutes: Math.max(0, state.elapsedMinutes - challenge.startedAt),
    completedGoalIds: [...completed], missedGoalIds: [...missed],
    finalBudget: Number(state.budget) || 0,
    operatingBalance: Number(state.networkWeeklyHistory?.at(-1)?.balance) || 0,
    carried: Number(state.carried) || 0, satisfaction: Number(state.satisfaction) || 0,
    accessibility: opportunities ? reachable / opportunities : null,
    targetDistrict: definition.targetDistrictId,
    residentsDelta: (Number(zone?.residents) || 0) - challenge.baseline.residents,
    jobsDelta: (Number(zone?.jobs) || 0) - challenge.baseline.jobs,
    completedInvestments: completedProjects,
    initialBudget: challenge.baseline.budget,
    initialDistrictAvailable: Boolean(initialDistrict)
  };
}

export function updateCampaignChallenge(game) {
  const state = game?.state;
  const challenge = state?.campaign?.challenge;
  const definition = getCampaignChallenge(challenge?.id);
  if (!definition) return false;
  if (challenge.status !== 'active' || state.status !== 'playing') return true;

  const objectives = campaignChallengeObjectives(game);
  for (const objective of objectives) {
    if (!challenge.completed.includes(objective.id) && objective.progress >= 1) {
      challenge.completed.push(objective.id);
      challenge.completedAt[objective.id] = state.elapsedMinutes;
      game.events.onChallengeObjective?.(objective);
    }
  }
  const allCompleted = definition.objectives.every(objective => challenge.completed.includes(objective.id));
  if (allCompleted) {
    challenge.status = 'won';
    challenge.summary = createSummary(game, 'won', challenge.completed, []);
    game.finish('won', 'Ukończono wszystkie cele wyzwania.');
    return true;
  }

  const overdue = definition.objectives.filter(objective => !challenge.completed.includes(objective.id)
    && state.elapsedMinutes >= challenge.startedAt + objective.deadlineWeeks * WEEK_MINUTES);
  if (overdue.length) {
    challenge.status = 'lost';
    const missed = definition.objectives.filter(objective => !challenge.completed.includes(objective.id)).map(objective => objective.id);
    challenge.summary = createSummary(game, 'lost', challenge.completed, missed);
    const title = overdue[0].title;
    game.finish('lost', `Termin minął: ${title}.`);
  }
  return true;
}

export function finalizeCampaignChallenge(game, status) {
  const challenge = game?.state?.campaign?.challenge;
  const definition = getCampaignChallenge(challenge?.id);
  if (!definition || challenge.status !== 'active') return false;
  const result = status === 'won' ? 'won' : 'lost';
  challenge.status = result;
  const missed = result === 'won' ? [] : definition.objectives.filter(objective => !challenge.completed.includes(objective.id)).map(objective => objective.id);
  challenge.summary = createSummary(game, result, challenge.completed, missed);
  return true;
}

export function validateCampaignChallengeState(challenge, city) {
  if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) return false;
  const definition = getCampaignChallenge(challenge.id);
  if (!definition || !['active', 'won', 'lost'].includes(challenge.status)
    || !Number.isSafeInteger(challenge.startedAt) || challenge.startedAt < 0
    || !Number.isSafeInteger(challenge.deadlineAt) || challenge.deadlineAt <= challenge.startedAt
    || challenge.deadlineAt !== challenge.startedAt + definition.deadlineWeeks * WEEK_MINUTES
    || !Array.isArray(challenge.completed) || new Set(challenge.completed).size !== challenge.completed.length
    || challenge.completed.some(id => !definition.objectives.some(objective => objective.id === id))
    || !challenge.completedAt || typeof challenge.completedAt !== 'object' || Array.isArray(challenge.completedAt)
    || Object.entries(challenge.completedAt).some(([id, at]) => !challenge.completed.includes(id) || !Number.isSafeInteger(at) || at < challenge.startedAt || at > challenge.deadlineAt)
    || !challenge.baseline || typeof challenge.baseline !== 'object' || Array.isArray(challenge.baseline)
    || !Number.isFinite(challenge.baseline.budget) || challenge.baseline.budget < 0
    || !Number.isFinite(challenge.baseline.carried) || challenge.baseline.carried < 0
    || challenge.baseline.districtId !== definition.targetDistrictId
    || !Number.isFinite(challenge.baseline.residents) || challenge.baseline.residents < 0
    || !Number.isFinite(challenge.baseline.jobs) || challenge.baseline.jobs < 0
    || !Array.isArray(challenge.objectiveIds) || challenge.objectiveIds.length !== definition.objectives.length
    || challenge.objectiveIds.some((id, index) => id !== definition.objectives[index].id)) return false;
  if (challenge.status === 'active' && challenge.summary !== null) return false;
  if (challenge.status !== 'active') {
    const summary = challenge.summary;
    const knownGoals = new Set(definition.objectives.map(objective => objective.id));
    if (!summary || !['won', 'lost'].includes(summary.status) || summary.status !== challenge.status
      || !Number.isSafeInteger(summary.finishedAt) || summary.finishedAt < challenge.startedAt
      || !Number.isSafeInteger(summary.elapsedMinutes) || summary.elapsedMinutes !== summary.finishedAt - challenge.startedAt
      || !Array.isArray(summary.completedGoalIds) || !Array.isArray(summary.missedGoalIds)
      || summary.completedGoalIds.length > definition.objectives.length || summary.missedGoalIds.length > definition.objectives.length
      || new Set(summary.completedGoalIds).size !== summary.completedGoalIds.length || new Set(summary.missedGoalIds).size !== summary.missedGoalIds.length
      || summary.completedGoalIds.some(id => !knownGoals.has(id) || !challenge.completed.includes(id))
      || summary.missedGoalIds.some(id => !knownGoals.has(id) || challenge.completed.includes(id))
      || !Number.isFinite(summary.finalBudget) || !Number.isFinite(summary.initialBudget) || summary.initialBudget < 0
      || !Number.isFinite(summary.carried) || summary.carried < 0 || !Number.isFinite(summary.operatingBalance)
      || !Number.isFinite(summary.residentsDelta) || !Number.isFinite(summary.jobsDelta)
      || !Number.isSafeInteger(summary.completedInvestments) || summary.completedInvestments < 0
      || typeof summary.targetDistrict !== 'string' || summary.targetDistrict !== definition.targetDistrictId
      || typeof summary.initialDistrictAvailable !== 'boolean'
      || (challenge.status === 'won' && (summary.completedGoalIds.length !== definition.objectives.length || summary.missedGoalIds.length !== 0))
      || !Number.isFinite(summary.satisfaction) || summary.satisfaction < 0 || summary.satisfaction > 100
      || (summary.accessibility !== null && (!Number.isFinite(summary.accessibility) || summary.accessibility < 0 || summary.accessibility > 1))) return false;
  }
  if (city && !city.points?.some(point => point.id === challenge.baseline.districtId)) return false;
  return true;
}
