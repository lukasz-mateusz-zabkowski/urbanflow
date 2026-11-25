import { totalWaiting } from './passengers.js?v=11';

const MAX_SESSION_DECISIONS = 32;
const MAX_JOURNAL_ITEMS = 24;
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const safeText = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';

const SESSION_DECISION_TYPES = new Set(['frequency', 'fleet', 'investment', 'planning', 'route']);

export function appendSessionDecision(previous = [], input = {}) {
  if (!SESSION_DECISION_TYPES.has(input.type) || !Number.isFinite(input.atMinute) || input.atMinute < 0) return previous;
  const summary = safeText(input.summary);
  if (!summary) return previous;
  const decision = {
    type: input.type,
    atMinute: Math.floor(input.atMinute),
    summary,
    ...(safeText(input.subjectId, 80) ? { subjectId: safeText(input.subjectId, 80) } : {})
  };
  for (const key of ['estimatedCostPerHourDelta', 'modelledCapacityDelta', 'actualCost', 'actualCashInflow', 'plannedCost']) {
    if (Number.isFinite(input[key])) decision[key] = input[key];
  }
  return [...(Array.isArray(previous) ? previous : []).slice(-(MAX_SESSION_DECISIONS - 1)), decision];
}

function lineName(state, id) {
  return state.lines?.find(line => line.id === id)?.name || state.lines?.find(line => line.id === id)?.id || id || 'Sieć';
}

function observedLine(line) {
  if (!line) return null;
  const stats = line.stats || {};
  return {
    load: Number.isFinite(stats.load) ? stats.load : null,
    waiting: Number.isFinite(stats.waiting) ? stats.waiting : null,
    revenuePerHour: Number.isFinite(stats.revenuePerHour) ? stats.revenuePerHour : null,
    costPerHour: Number.isFinite(stats.costPerHour) ? stats.costPerHour : null
  };
}

function consumeMatchingLedgerCost(decision, transactions, consumedIndexes) {
  if (!Number.isFinite(decision.actualCost)) return false;
  const ledgerTypes = decision.type === 'fleet' ? new Set(['fleetPurchase'])
    : decision.type === 'investment' ? new Set(['investment'])
      : decision.type === 'route' ? new Set(['lineConstruction', 'lineRebuild']) : new Set();
  const index = transactions.findIndex((transaction, transactionIndex) => !consumedIndexes.has(transactionIndex)
    && ledgerTypes.has(transaction.type) && transaction.at === decision.atMinute && transaction.amount === decision.actualCost);
  if (index < 0) return false;
  consumedIndexes.add(index);
  return true;
}

function observedWaitingPassengers(passengerState) {
  if (!passengerState || typeof passengerState !== 'object' || Array.isArray(passengerState)) return null;
  const queues = Object.values(passengerState);
  if (queues.some(queue => !queue || typeof queue !== 'object' || Array.isArray(queue)
    || !Number.isFinite(queue.waiting) || queue.waiting < 0)) return null;
  const total = totalWaiting(passengerState);
  return Number.isFinite(total) && total >= 0 ? Math.floor(total) : null;
}

const SURVEY_CHOICES = new Set(['yes', 'no', 'not-sure']);
function playtestSurvey(input = {}) {
  const rating = Number(input.firstImpression);
  const result = {};
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) result.firstImpression = rating;
  for (const key of ['nextStepClear', 'costsClear', 'playAgain']) {
    if (SURVEY_CHOICES.has(input[key])) result[key] = input[key];
  }
  for (const key of ['frustratingMoment', 'likedMost']) {
    const value = safeText(input[key], 500);
    if (value) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

export function buildGameplayDecisionJournal(state = {}, sessionDecisions = [], limit = 12) {
  const entries = [];
  const transactions = Array.isArray(state.finance?.transactions) ? state.finance.transactions : [];
  const consumedDecisionLedgerIndexes = new Set();
  for (const decision of Array.isArray(sessionDecisions) ? sessionDecisions : []) {
    const line = state.lines?.find(item => item.id === decision.subjectId);
    const district = state.cityEvolution?.districts?.[decision.subjectId];
    entries.push({
      type: decision.type, title: decision.type === 'frequency' ? 'Zmiana częstotliwości'
        : decision.type === 'investment' ? 'Plan inwestycji'
          : decision.type === 'fleet' ? 'Decyzja dotycząca floty' : 'Decyzja bieżącej sesji',
      subject: line?.name || line?.id || district?.name || decision.subjectId || 'Kampania',
      atMinute: decision.atMinute, summary: safeText(decision.summary),
      ...(Number.isFinite(decision.actualCost) && !consumeMatchingLedgerCost(decision, transactions, consumedDecisionLedgerIndexes) ? { actualCost: decision.actualCost } : {}),
      ...(Number.isFinite(decision.actualCashInflow) ? { actualCashInflow: decision.actualCashInflow } : {}),
      ...(Number.isFinite(decision.plannedCost) ? { plannedCost: decision.plannedCost } : {}),
      ...(Number.isFinite(decision.estimatedCostPerHourDelta) ? { modelledCostPerHourDelta: decision.estimatedCostPerHourDelta } : {}),
      ...(Number.isFinite(decision.modelledCapacityDelta) ? { modelledCapacityDelta: decision.modelledCapacityDelta } : {}),
      ...(line ? { currentObservation: observedLine(line), observationNote: 'Bieżąca obserwacja; nie dowodzi, że decyzja ją spowodowała.' } : {})
    });
  }

  const consumed = new Set();
  const groupedFleetTransactions = new Set(transactions.filter(item => item.type === 'fleetPurchase'
    && typeof item.id === 'string' && item.eventKey?.startsWith('line-build-fleet:')
    && transactions.some(construction => construction.type === 'lineConstruction' && construction.at === item.at
      && construction.eventKey === `line-build:${item.eventKey.slice('line-build-fleet:'.length)}`)).map(item => item.id));
  for (const transaction of transactions) {
    if (!Number.isFinite(transaction.at) || !Number.isFinite(transaction.amount)) continue;
    if (transaction.type === 'lineConstruction' && transaction.eventKey?.startsWith('line-build:')) {
      const lineId = transaction.eventKey.slice('line-build:'.length);
      const key = `${transaction.at}:${lineId}`;
      if (consumed.has(key)) continue;
      consumed.add(key);
      const fleet = transactions.find(item => item.at === transaction.at && item.type === 'fleetPurchase'
        && item.eventKey === `line-build-fleet:${lineId}`);
      entries.push({ type: 'lineConstruction', title: 'Budowa linii', subject: lineName(state, lineId), atMinute: transaction.at,
        actualCost: safeNumber(transaction.amount) + safeNumber(fleet?.amount), costSource: 'zaksięgowany wydatek jednorazowy' });
      continue;
    }
    if (transaction.type === 'fleetPurchase' && groupedFleetTransactions.has(transaction.id)) continue;
    if (transaction.type === 'investment') {
      const projectId = transaction.eventKey?.replace('investment-approval:', '');
      const project = state.investments?.projects?.find(item => item.id === projectId);
      const districtId = project?.districtId;
      const district = state.cityEvolution?.districts?.[districtId];
      entries.push({ type: 'investment', title: 'Modernizacja lub inwestycja', subject: district?.name || districtId || 'Miasto', atMinute: transaction.at,
        actualCost: safeNumber(transaction.amount), costSource: 'zaksięgowany wydatek jednorazowy' });
      continue;
    }
    const expense = ['lineRebuild', 'investmentMaintenance', 'fleetPurchase', 'lineConstruction'].includes(transaction.type);
    const income = ['investmentRefund', 'campaignGrant'].includes(transaction.type);
    const title = transaction.type === 'lineRebuild' ? 'Przebudowa linii'
      : transaction.type === 'investmentMaintenance' ? 'Utrzymanie inwestycji'
        : transaction.type === 'investmentRefund' ? 'Zwrot inwestycji'
          : transaction.type === 'campaignGrant' ? 'Grant kampanii'
            : transaction.type === 'fleetPurchase' ? 'Zakup floty' : 'Zdarzenie finansowe';
    entries.push({ type: transaction.type, title, subject: transaction.subject || 'Kampania', atMinute: transaction.at,
      ...(expense ? { actualCost: safeNumber(transaction.amount), costSource: 'zaksięgowany wydatek jednorazowy' } : {}),
      ...(income ? { actualCashInflow: safeNumber(transaction.amount), cashSource: 'zaksięgowany wpływ' } : {}) });
  }
  return entries.sort((a, b) => safeNumber(b.atMinute) - safeNumber(a.atMinute)).slice(0, Math.max(0, Math.min(MAX_JOURNAL_ITEMS, Math.floor(limit))));
}

export function buildGameplaySessionReport(state = {}, options = {}) {
  const outcome = state.status === 'lost' && (state.lossReason === 'Bankructwo' || safeNumber(state.budget) <= -50000)
    ? 'bankruptcy' : safeText(state.status, 32) || 'unknown';
  const scenario = /^[a-z0-9-]{1,48}$/i.test(options.scenarioId || '') ? options.scenarioId : 'classic';
  const feedbackInput = options.feedback || {};
  const rating = Number(feedbackInput.rating);
  const feedback = Number.isInteger(rating) && rating >= 1 && rating <= 5 && safeText(feedbackInput.description, 1000)
    ? { ...(safeText(feedbackInput.category, 80) ? { category: safeText(feedbackInput.category, 80) } : {}), rating, description: safeText(feedbackInput.description, 1000) }
    : null;
  const errors = options.technicalErrors || {};
  const lines = Array.isArray(state.lines) ? state.lines : [];
  const latestWeek = Array.isArray(state.networkWeeklyHistory) ? state.networkWeeklyHistory.at(-1) : null;
  const journal = buildGameplayDecisionJournal(state, options.sessionDecisions || [], 12);
  const decisions = journal.slice(0, 12).map(item => ({
    type: safeText(item.type, 40), atMinute: Math.floor(safeNumber(item.atMinute)),
    summary: safeText(item.summary || item.title), subject: safeText(item.subject, 100),
    ...(Number.isFinite(item.actualCost) ? { actualCost: item.actualCost } : {}),
    ...(Number.isFinite(item.actualCashInflow) ? { actualCashInflow: item.actualCashInflow } : {}),
    ...(Number.isFinite(item.plannedCost) ? { plannedCost: item.plannedCost } : {}),
    ...(Number.isFinite(item.modelledCostPerHourDelta) ? { modelledCostPerHourDelta: item.modelledCostPerHourDelta } : {}),
    ...(Number.isFinite(item.modelledCapacityDelta) ? { modelledCapacityDelta: item.modelledCapacityDelta } : {})
  }));
  const report = {
    reportType: 'urbanflow-gameplay-session',
    gameVersion: safeText(options.appVersion, 40) || 'unknown',
    generatedAt: (typeof options.now === 'function' ? options.now() : new Date()).toISOString(),
    scenarioId: scenario,
    sessionDurationSeconds: Math.max(0, Math.round(safeNumber(options.sessionDurationSeconds))),
    simulationMinutes: Math.max(0, Math.floor(safeNumber(state.elapsedMinutes))),
    result: safeText(state.status, 32) || 'unknown', outcome,
    campaignObjectives: [...new Set([
      ...(Array.isArray(state.campaign?.completed) ? state.campaign.completed : []),
      ...(Array.isArray(state.campaign?.challenge?.completed) ? state.campaign.challenge.completed : [])
    ])].slice(0, 32).map(id => safeText(id, 80)),
    metrics: {
      activeLines: lines.filter(line => !line.routingUnavailable).length,
      carriedPassengers: Math.max(0, Math.floor(safeNumber(state.carried))),
      waitingPassengers: observedWaitingPassengers(state.passengers),
      satisfaction: Number.isFinite(state.satisfaction) ? state.satisfaction : null
    },
    latestObservedWeek: latestWeek ? {
      week: Math.max(0, Math.floor(safeNumber(latestWeek.week))), revenue: safeNumber(latestWeek.revenue),
      cost: safeNumber(latestWeek.cost), balance: safeNumber(latestWeek.balance)
    } : null,
    technicalErrors: {
      scriptErrors: Math.max(0, Math.floor(safeNumber(errors.scriptErrors))),
      unhandledRejections: Math.max(0, Math.floor(safeNumber(errors.unhandledRejections)))
    },
    feedback,
    playtestSurvey: playtestSurvey(options.playtestSurvey),
    decisions
  };
  return report;
}
