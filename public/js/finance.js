import { gameClock } from './simulation.js?v=10';

export const FINANCE_VERSION = 1;
export const FINANCE_LIMITS = Object.freeze({ transactions: 64, dailyForecastWindow: 28, weeks: 12 });
export const FINANCE_EVENT_TYPES = Object.freeze([
  'lineConstruction', 'lineRebuild', 'fleetPurchase', 'investment', 'investmentRefund', 'investmentMaintenance', 'campaignGrant'
]);

const finite = Number.isFinite;
const nonnegative = value => finite(value) && value >= 0;
const COST_TYPES = new Set(['lineConstruction', 'lineRebuild', 'fleetPurchase', 'investment', 'investmentMaintenance']);
const zeroTotals = () => Object.fromEntries(FINANCE_EVENT_TYPES.map(type => [type, 0]));

export function createFinanceState(startingBudget = 0, ledgerStartAt = 0) {
  return {
    version: FINANCE_VERSION,
    startingBudget: nonnegative(startingBudget) ? startingBudget : 0,
    ledgerStartAt: nonnegative(ledgerStartAt) ? ledgerStartAt : 0,
    historyComplete: ledgerStartAt === 0,
    nextId: 1,
    reserveTarget: 0,
    totals: zeroTotals(),
    transactions: [],
    dailyCashFlow: [],
    weeklyCashFlow: []
  };
}

export function recordFinanceEvent(state, type, amount, at = state?.elapsedMinutes || 0, eventKey = '') {
  if (!state || !FINANCE_EVENT_TYPES.includes(type) || !nonnegative(amount) || !nonnegative(at)) return false;
  state.finance ||= createFinanceState();
  if (eventKey && state.finance.transactions.some(item => item.eventKey === eventKey)) return false;
  // Weekly investment maintenance is a monotonic series. The detailed transaction
  // list is deliberately bounded, so the investment ledger's week watermark is
  // the durable idempotency receipt after an old transaction ages out.
  if (type === 'investmentMaintenance' && eventKey) {
    const match = /^investment-maintenance-week:([1-9]\d*)$/.exec(eventKey);
    if (match) {
      const week = Number(match[1]);
      if (!Number.isSafeInteger(week) || week <= (state.investments?.lastRecordedWeek || 0)) return false;
    }
  }
  const finance = state.finance;
  const transaction = {
    id: `finance-${finance.nextId}`,
    type,
    amount,
    at,
    ...(eventKey ? { eventKey } : {})
  };
  finance.nextId += 1;
  finance.totals[type] += amount;
  const signedAmount = COST_TYPES.has(type) ? -amount : amount;
  const clock = gameClock(at, state.calendar);
  const daily = finance.dailyCashFlow.find(item => item.date === clock.date);
  if (daily) { daily.oneTimeCashFlow += signedAmount; daily.events += 1; }
  else finance.dailyCashFlow.push({ date: clock.date, oneTimeCashFlow: signedAmount, events: 1 });
  if (finance.dailyCashFlow.length > 28) finance.dailyCashFlow.splice(0, finance.dailyCashFlow.length - 28);
  const weekly = finance.weeklyCashFlow.find(item => item.week === clock.week);
  if (weekly) { weekly.oneTimeCashFlow += signedAmount; weekly.events += 1; }
  else finance.weeklyCashFlow.push({ week: clock.week, oneTimeCashFlow: signedAmount, events: 1 });
  if (finance.weeklyCashFlow.length > FINANCE_LIMITS.weeks) finance.weeklyCashFlow.splice(0, finance.weeklyCashFlow.length - FINANCE_LIMITS.weeks);
  finance.transactions.push(transaction);
  if (finance.transactions.length > FINANCE_LIMITS.transactions) {
    finance.transactions.splice(0, finance.transactions.length - FINANCE_LIMITS.transactions);
  }
  return true;
}

export function validateFinanceState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== FINANCE_VERSION
    || !Number.isSafeInteger(value.nextId) || value.nextId < 1
    || !nonnegative(value.startingBudget) || !nonnegative(value.ledgerStartAt)
    || typeof value.historyComplete !== 'boolean' || !nonnegative(value.reserveTarget)
    || !value.totals || typeof value.totals !== 'object' || Array.isArray(value.totals)
    || !Array.isArray(value.transactions) || value.transactions.length > FINANCE_LIMITS.transactions
    || !Array.isArray(value.dailyCashFlow) || value.dailyCashFlow.length > 28
    || !value.dailyCashFlow.every(item => item && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      && finite(item.oneTimeCashFlow) && Number.isSafeInteger(item.events) && item.events > 0)
    || !Array.isArray(value.weeklyCashFlow) || value.weeklyCashFlow.length > FINANCE_LIMITS.weeks
    || !value.weeklyCashFlow.every(item => item && Number.isSafeInteger(item.week) && item.week > 0
      && finite(item.oneTimeCashFlow) && Number.isSafeInteger(item.events) && item.events > 0)) return false;
  if (FINANCE_EVENT_TYPES.some(type => !nonnegative(value.totals[type]))) return false;
  const ids = new Set();
  const keys = new Set();
  let highestId = 0;
  for (const transaction of value.transactions) {
    if (!transaction || typeof transaction !== 'object' || !/^finance-[1-9]\d*$/.test(transaction.id)
      || ids.has(transaction.id) || !FINANCE_EVENT_TYPES.includes(transaction.type)
      || !nonnegative(transaction.amount) || !nonnegative(transaction.at)
      || (transaction.eventKey !== undefined && (typeof transaction.eventKey !== 'string' || transaction.eventKey.length > 160
        || keys.has(transaction.eventKey)))) return false;
    ids.add(transaction.id);
    if (transaction.eventKey) keys.add(transaction.eventKey);
    highestId = Math.max(highestId, Number(transaction.id.slice(8)));
  }
  return value.nextId > highestId;
}

export function financeSnapshot(state) {
  const finance = state?.finance || createFinanceState();
  const revenue = Math.max(0, Number(state?.revenue) || 0);
  const expenses = Math.max(0, Number(state?.expenses) || 0);
  const totals = { ...zeroTotals(), ...(finance.totals || {}) };
  return {
    cash: { budget: Number.isFinite(state?.budget) ? state.budget : 0, plannedReserve: finance.reserveTarget || 0 },
    operating: { revenue, expenses, balance: revenue - expenses },
    capital: {
      lineConstruction: totals.lineConstruction,
      lineRebuild: totals.lineRebuild,
      fleetPurchase: totals.fleetPurchase,
      investment: totals.investment,
      refunds: totals.investmentRefund,
      investmentMaintenance: totals.investmentMaintenance,
      campaignGrants: totals.campaignGrant,
      historyComplete: finance.historyComplete,
      fromMinute: finance.ledgerStartAt || 0
    },
    observed: {
      days: (state?.networkDailyHistory || []).length,
      weeks: (state?.networkWeeklyHistory || []).length,
      transported: Math.max(0, Number(state?.carried) || 0)
    }
  };
}

function validDailyRecords(state) {
  return (state?.networkDailyHistory || []).filter(item => item && Number.isSafeInteger(item.samples) && item.samples >= 240
    && nonnegative(item.revenue) && nonnegative(item.cost));
}

export function financeForecast(state, horizonDays, { minimumDays = horizonDays === 1 ? 3 : horizonDays === 7 ? 7 : 14, weeklyCommitments = 0 } = {}) {
  if (![1, 7, 28].includes(horizonDays) || !nonnegative(weeklyCommitments) || !Number.isSafeInteger(minimumDays) || minimumDays < 1) {
    return { available: false, reason: 'Nieprawidłowy horyzont prognozy.' };
  }
  const observed = validDailyRecords(state).slice(-Math.min(FINANCE_LIMITS.dailyForecastWindow, horizonDays === 1 ? 7 : horizonDays));
  if (observed.length < minimumDays) {
    return { available: false, horizonDays, observedDays: observed.length, requiredDays: minimumDays,
      reason: `Brak wystarczających danych: potrzeba ${minimumDays} pełnych dni, dostępne ${observed.length}.` };
  }
  const revenues = observed.map(item => item.revenue);
  const costs = observed.map(item => item.cost);
  const sum = values => values.reduce((total, value) => total + value, 0);
  const mean = values => sum(values) / values.length;
  const committedMaintenance = weeklyCommitments * horizonDays / 7;
  const expectedNet = mean(revenues) * horizonDays - mean(costs) * horizonDays - committedMaintenance;
  return {
    available: true,
    horizonDays,
    observedDays: observed.length,
    projectedRevenue: mean(revenues) * horizonDays,
    projectedOperatingCost: mean(costs) * horizonDays,
    knownCommitments: committedMaintenance,
    expectedNet,
    lowNet: Math.min(...revenues) * horizonDays - Math.max(...costs) * horizonDays - committedMaintenance,
    highNet: Math.max(...revenues) * horizonDays - Math.min(...costs) * horizonDays - committedMaintenance,
    method: 'Zakres wyprowadzony z pełnych obserwowanych dni; koszty utrzymania zobowiązań dodano osobno.',
    assumptions: ['Przychody i koszty operacyjne używają zakresu pełnych dni z historii sieci.',
      'Znane utrzymanie inwestycji jest liczone jako zobowiązanie; prognoza nie gwarantuje wyniku ani nie symuluje przyszłych pasażerów.']
  };
}

export function financeHistory(state) {
  const finance = state?.finance || {};
  const dailyFlows = new Map((finance.dailyCashFlow || []).map(item => [item.date, item.oneTimeCashFlow]));
  const weeklyFlows = new Map((finance.weeklyCashFlow || []).map(item => [item.week, item.oneTimeCashFlow]));
  const days = (state?.networkDailyHistory || []).map(period => ({
    ...period, source: 'observed', oneTimeCashFlow: dailyFlows.get(period.date) || 0,
    cashFlow: period.revenue - period.cost + (dailyFlows.get(period.date) || 0)
  }));
  const weeks = (state?.networkWeeklyHistory || []).map(period => ({
    ...period, source: 'observed', oneTimeCashFlow: weeklyFlows.get(period.week) || 0,
    cashFlow: period.revenue - period.cost + (weeklyFlows.get(period.week) || 0)
  }));
  return {
    session: { source: 'observed', revenue: Math.max(0, Number(state?.revenue) || 0), cost: Math.max(0, Number(state?.expenses) || 0),
      balance: (Number(state?.revenue) || 0) - (Number(state?.expenses) || 0) },
    days: days.slice(-28),
    weeks: weeks.slice(-FINANCE_LIMITS.weeks)
  };
}

export function plannedFinancialCommitments(state) {
  return (state?.investments?.projects || []).filter(project => project.status === 'planned')
    .reduce((sum, project) => sum + Math.max(0, Number(project.cost) || 0), 0);
}

export function financeGoals(state, reserveTarget = state?.finance?.reserveTarget || 0) {
  const budget = Number(state?.budget) || 0;
  const planned = plannedFinancialCommitments(state);
  const latestWeek = state?.networkWeeklyHistory?.at(-1);
  return [
    { id: 'liquidity', label: 'Zachowaj płynność po rezerwie i planach', value: budget - reserveTarget - planned,
      status: budget >= reserveTarget + planned ? 'met' : 'risk', source: 'budżet, rezerwa planistyczna i zaplanowane projekty' },
    { id: 'operations', label: 'Utrzymaj dodatni wynik operacyjny', value: latestWeek ? latestWeek.balance : null,
      status: latestWeek ? latestWeek.balance > 0 ? 'met' : 'risk' : 'unknown', source: latestWeek ? `obserwowany tydzień ${latestWeek.week}` : 'brak agregatu tygodniowego' },
    { id: 'commitments', label: 'Sfinansuj zaplanowane inwestycje', value: planned,
      status: budget >= planned ? 'met' : 'risk', source: 'koszty planowanych, niezatwierdzonych projektów' }
  ];
}
