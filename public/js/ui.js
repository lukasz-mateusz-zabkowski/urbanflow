import { formatMoney } from './economy.js?v=10';
import { TRANSPORT_TYPES, eligibleCounts, lineCost, unlockedTypes, lineMetrics } from './transport.js?v=10';
import { totalWaiting, diagnoseTransitRelation } from './passengers.js?v=11';
import { calendarAt, gameClock, demandMultiplier } from './simulation.js?v=10';
import { campaignObjectives } from './campaign.js?v=10';
import { diagnosticSnapshot, networkProblems, FAILURE_LABELS } from './analytics.js?v=12';
import { activeCityEvents, upcomingCityEvents, describeEventImpact } from './city-events.js?v=10';
import { fleetSnapshot } from './fleet.js?v=10';
import { latentDemand } from './demand.js?v=10';
import { describePlace } from './place-profiles.js?v=10';
import { clampPanelWidth, DEFAULT_PANEL_WIDTH, loadPanelWidth, savePanelWidth } from './ui-preferences.js?v=10';
import { createFeedbackReport, feedbackJson } from './feedback.js?v=11';
import { TIMETABLE_PROFILES, SERVICE_DAY_TYPES, SERVICE_DAY_LABELS, formatTimetableTime, periodAt, timetableForDay } from './timetable.js?v=10';
import { mobilitySnapshot } from './mobility.js?v=11';
import { cityEvolutionSnapshot } from './city-evolution.js?v=1';

const $ = selector => document.querySelector(selector);
const formatNumber = value => new Intl.NumberFormat('pl-PL').format(Math.round(Number(value) || 0));
const decimal = value => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(Number(value) || 0);
const money = value => formatMoney(Number(value) || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shortNames = { bus: 'Autobus', tram: 'Tramwaj', metro: 'Metro', suburban: 'Kolej agl.', intercity: 'Kolej IC' };
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function confirmAction(message, label = 'Potwierdź') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'summary-dialog confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmTitle');
    dialog.innerHTML = '<h2 id="confirmTitle">Potwierdzenie</h2><p></p><div class="confirm-actions"><button type="button" class="secondary-button">Anuluj</button><button type="button" class="primary-button"></button></div>';
    dialog.querySelector('p').textContent = message;
    const [cancel, confirm] = dialog.querySelectorAll('button');
    confirm.textContent = label;
    let accepted = false;
    cancel.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', () => { accepted = true; dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(accepted); }, { once: true });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}

export class UI {
  constructor(game, map, { onNewGame = () => {}, appVersion = 'unknown' } = {}) {
    this.game = game;
    this.map = map;
    this.onNewGame = onNewGame;
    this.appVersion = appVersion;
    this.selectedLineId = null;
    this.selectedServiceDayType = null;
    this.abortController = new AbortController();
    this.timers = new Set();
    this.previousGoals = null;
    this.summaryShown = false;
    this.detailLineId = null;
    this.selectedPlaceId = null;
    this.selectedEvolutionDistrict = null;
    this.panelStorage = null;
    try { this.panelStorage = window.localStorage; } catch { /* Panel width is an optional preference. */ }
    this.setupPanelWidth();
    this.bind();
  }

  bind() {
    const signal = this.abortController.signal;
    document.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      const { action, line, index, type, route } = button.dataset;
      if (route) {
        const result = this.onStarterSelect ? this.onStarterSelect(route) : this.game.selectStarterRoute(route);
        if (result?.ok === false) this.toast(result.message, 'warn');
        else { this.openPanel(); this.scrollToBuild(); }
        return;
      }
      if (type) { this.checkResult(this.game.setTransport(type)); return; }
      if (action === 'analytics-mode') { this.checkResult(this.game.setAnalyticsMode(button.dataset.mode)); return; }
      if (action === 'diagnose-mobility') { this.renderMobilityRelation(); return; }
      if (action === 'select-line') {
        this.selectedLineId = this.selectedLineId === line ? null : line;
        this.renderNetwork();
        this.map.highlightLine?.(this.selectedLineId);
        return;
      }
      if (action === 'stop-up' || action === 'stop-down') {
        this.checkResult(this.game.moveSelectedStop(Number(index), action === 'stop-up' ? -1 : 1));
        return;
      }
      if (action === 'stop-remove') { this.checkResult(this.game.removeSelectedStop(Number(index))); return; }
      if (action === 'open-panel') { this.openPanel(); this.scrollToBuild(); return; }
      if (action === 'pick-on-map') {
        this.closePanel();
        this.toast('Klikaj przystanki w kolejności przejazdu. Podgląd pokaże koszt.');
        return;
      }
      if (action === 'edit-line') {
        this.checkResult(this.game.beginEditLine(line));
        this.openPanel(); this.scrollToBuild(); return;
      }
      if (action === 'delete-line') {
        const item = this.game.state.lines.find(item => item.id === line);
        if (item && await confirmAction(`Usunąć linię ${item.name || line}? Pasażerowie poszukają innych połączeń. Koszt infrastruktury nie podlega zwrotowi.`, 'Usuń linię')) {
          this.checkResult(this.game.deleteLine(line));
          this.selectedLineId = null;
          this.renderNetwork();
        }
        return;
      }
      if (action === 'buy-vehicle') {
        const result = this.game.buyVehicle(line);
        if (this.checkResult(result)) this.toast('Nowy pojazd dołączył do linii.');
        return;
      }
      if (action === 'purchase-fleet') {
        const result = this.game.purchaseFleetVehicle(button.dataset.vehicleType);
        if (this.checkResult(result)) this.toast('Pojazd trafił do rezerwy.');
        return;
      }
      if (action === 'assign-vehicle' || action === 'unassign-vehicle') {
        const result = action === 'assign-vehicle' ? this.game.assignVehicle(line) : this.game.unassignVehicle(line);
        if (this.checkResult(result)) this.renderNetwork();
        return;
      }
      if (action === 'restore-timetable') { this.checkResult(this.game.restoreTimetable(line)); return; }
      if (action === 'copy-timetable-day') {
        const sourceDay = $('#lineDetail [data-timetable-copy-source]').value;
        const targetDay = $('#lineDetail [data-service-day]').value;
        this.selectedServiceDayType = targetDay;
        this.checkResult(this.game.copyTimetableDay(line, sourceDay, targetDay));
        this.renderDetails();
        return;
      }
      if (action === 'toggle-special-today' || action === 'toggle-special-next') {
        const current = gameClock(this.game.state.elapsedMinutes, this.game.state.calendar);
        const target = action === 'toggle-special-next'
          ? calendarAt(this.game.state.elapsedMinutes + 1440, this.game.state.calendar) : current;
        this.checkResult(this.game.setSpecialDay(target.date, target.dayType !== 'special'));
        if (target.dayType !== 'special') this.selectedServiceDayType = 'special';
        return;
      }
      switch (button.id) {
        case 'createLineButton': {
          const editing = this.game.state.editingLineId;
          const oldIds = new Set(this.game.state.lines.map(line => line.id));
          const result = this.game.createSelectedLine();
          if (this.checkResult(result)) {
            this.selectedLineId = editing || this.game.state.lines.find(line => !oldIds.has(line.id))?.id || this.selectedLineId;
            if (editing) this.toast('Przebieg linii zaktualizowany.');
            this.closePanel(); this.renderNetwork();
          }
          break;
        }
        case 'clearSelectionButton': this.game.cancelEdit(); break;
        case 'pauseButton':
          this.game.setPaused(!this.game.state.paused);
          this.event(this.game.state.paused ? 'Pauza. Możesz spokojnie planować sieć.' : 'Miasto znów jest w ruchu.');
          break;
        case 'speedButton': this.game.setSpeed(this.game.state.speed === 1 ? 2 : this.game.state.speed === 2 ? 4 : 1); break;
        case 'toggleGoalsButton': this.game.setPreference('goalsCollapsed', !this.game.state.preferences?.goalsCollapsed); break;
        case 'toggleTutorialButton': this.game.setPreference('tutorialCollapsed', !this.game.state.preferences?.tutorialCollapsed); break;
        case 'mobilePanelButton': this.openPanel(); break;
        case 'panelClose': case 'panelScrim': this.closePanel(); break;
        case 'panelCollapseButton': this.collapsePanel(); break;
        case 'panelExpandButton': this.expandPanel(); break;
        case 'placeProfileClose': this.selectedPlaceId = null; this.renderPlaceProfile(); break;
        case 'feedbackButton': this.openFeedback(); break;
        case 'feedbackClose': $('#feedbackDialog').close(); break;
        case 'feedbackCopy': this.copyFeedback(); break;
        case 'feedbackDownload': this.downloadFeedback(); break;
        case 'mobileCenterButton': this.map.centerCity(); break;
        case 'newGameButton': case 'summaryNewGameButton': this.onNewGame(); break;
        case 'summaryCloseButton': $('#summaryDialog').close(); break;
      }
    }, { signal });
    document.addEventListener('change', event => {
      if (event.target.matches('[data-frequency]')) {
        this.checkResult(this.game.setFrequency(event.target.dataset.frequency, Number(event.target.value)));
      } else if (event.target.matches('[data-timetable-frequency]')) {
        this.checkResult(this.game.setTimetableFrequency(event.target.dataset.line, event.target.dataset.timetableFrequency, Number(event.target.value), event.target.dataset.dayType));
      } else if (event.target.matches('[data-timetable-profile]')) {
        this.checkResult(this.game.setTimetableProfile(event.target.dataset.line, event.target.value, event.target.dataset.dayType));
      } else if (event.target.matches('[data-service-day]')) {
        this.selectedServiceDayType = event.target.value;
        this.renderDetails();
      } else if (event.target.matches('[data-same-every-day]')) {
        this.checkResult(this.game.setSameTimetableEveryDay(event.target.dataset.line, event.target.checked, this.selectedServiceDayType));
      } else if (event.target.matches('[data-timetable-copy-source]')) {
        const button = $('#lineDetail [data-action="copy-timetable-day"]');
        button.disabled = event.target.value === this.selectedServiceDayType || this.game.state.status !== 'playing';
      } else if (event.target.matches('#cityEvolutionDistrict')) {
        this.selectedEvolutionDistrict = event.target.value;
        this.renderCityEvolutionPanel(this.game.visiblePoints());
      }
    }, { signal });
    document.addEventListener('input', event => {
      if (event.target.matches('[data-frequency]')) $('#frequencyValue').textContent = `${decimal(event.target.value)} kursów/h`;
      if (event.target.matches('[data-timetable-frequency]')) {
        const output = event.target.closest('.timetable-row')?.querySelector('[data-frequency-value]');
        if (output) output.textContent = Number(event.target.value) ? `${decimal(event.target.value)} kursów/h` : 'Kursy wyłączone';
      }
    }, { signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closePanel();
    }, { signal });
    const panel = $('#buildPanel');
    let gesture = null;
    panel.addEventListener('touchstart', event => {
      const point = event.touches[0];
      gesture = panel.scrollTop <= 1 && (event.target.closest('.panel-head') || event.target.closest('.sheet-handle'))
        ? { x: point.clientX, y: point.clientY } : null;
    }, { passive: true, signal });
    panel.addEventListener('touchend', event => {
      const point = event.changedTouches[0];
      if (gesture && point.clientY - gesture.y > 70 && Math.abs(point.clientX - gesture.x) < 100) this.closePanel();
      gesture = null;
    }, { passive: true, signal });
    const resizer = $('#panelResizer');
    let resizing = false;
    resizer.addEventListener('pointerdown', event => {
      if (window.matchMedia('(max-width: 760px)').matches || $('#playfield').classList.contains('panel-collapsed')) return;
      resizing = true; resizer.setPointerCapture(event.pointerId); event.preventDefault();
    }, { signal });
    resizer.addEventListener('pointermove', event => {
      if (resizing) this.setPanelWidth(window.innerWidth - event.clientX, false);
    }, { signal });
    const endResize = () => { if (!resizing) return; resizing = false; this.setPanelWidth($('#playfield').style.getPropertyValue('--panel-width'), true); this.map.invalidate?.(); };
    resizer.addEventListener('pointerup', endResize, { signal });
    resizer.addEventListener('pointercancel', endResize, { signal });
    resizer.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const current = parseFloat($('#playfield').style.getPropertyValue('--panel-width')) || DEFAULT_PANEL_WIDTH;
      this.setPanelWidth(current + (event.key === 'ArrowLeft' ? 20 : -20), true);
    }, { signal });
    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width: 760px)').matches) this.setPanelWidth($('#playfield').style.getPropertyValue('--panel-width') || DEFAULT_PANEL_WIDTH, false);
      this.map.invalidate?.();
    }, { signal });
    $('#feedbackForm').addEventListener('submit', event => this.prepareFeedback(event), { signal });
    $('#feedbackDialog').addEventListener('click', event => { if (event.target === $('#feedbackDialog')) $('#feedbackDialog').close(); }, { signal });
  }

  checkResult(result) {
    if (result?.ok === false) { this.toast(result.message || 'Nie można wykonać tej operacji.', 'warn'); return false; }
    return true;
  }

  setText(id, value) { const element = document.getElementById(id); if (element && element.textContent !== String(value)) element.textContent = value; }
  setHtml(id, value) { const element = document.getElementById(id); if (element && element.innerHTML !== value) element.innerHTML = value; }
  later(callback, delay) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, delay);
    this.timers.add(timer); return timer;
  }
  openPanel() {
    $('#playfield').classList.remove('panel-collapsed');
    $('#buildPanel').classList.add('open'); $('#panelScrim').classList.add('open');
    $('#mobilePanelButton').setAttribute('aria-expanded', 'true');
    $('#panelCollapseButton').setAttribute('aria-expanded', 'true'); $('#panelExpandButton').setAttribute('aria-expanded', 'true');
    this.map.invalidate?.();
  }
  closePanel() {
    $('#buildPanel').classList.remove('open'); $('#panelScrim').classList.remove('open');
    $('#mobilePanelButton').setAttribute('aria-expanded', 'false');
    this.map.invalidate?.();
  }
  setupPanelWidth() {
    const width = loadPanelWidth(this.panelStorage, window.innerWidth);
    $('#playfield').style.setProperty('--panel-width', `${width}px`);
    $('#panelResizer').setAttribute('aria-valuenow', String(width));
  }
  setPanelWidth(value, persist = true) {
    const width = persist ? savePanelWidth(this.panelStorage, value, window.innerWidth) : clampPanelWidth(value, window.innerWidth);
    $('#playfield').style.setProperty('--panel-width', `${width}px`);
    $('#panelResizer').setAttribute('aria-valuenow', String(width));
    this.map.invalidate?.();
    return width;
  }
  collapsePanel() {
    if (window.matchMedia('(max-width: 760px)').matches) { this.closePanel(); return; }
    $('#playfield').classList.add('panel-collapsed');
    $('#panelCollapseButton').setAttribute('aria-expanded', 'false'); $('#panelExpandButton').setAttribute('aria-expanded', 'false');
    this.map.invalidate?.();
  }
  expandPanel() { $('#playfield').classList.remove('panel-collapsed'); $('#panelCollapseButton').setAttribute('aria-expanded', 'true'); $('#panelExpandButton').setAttribute('aria-expanded', 'true'); this.map.invalidate?.(); }
  selectPlace(id) {
    this.selectedPlaceId = id;
    this.renderPlaceProfile();
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.openPanel(); this.later(() => $('#placeProfile').scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    }
  }
  renderPlaceProfile() {
    const section = $('#placeProfile');
    const point = this.game.city.points.find(item => item.id === this.selectedPlaceId);
    const profile = describePlace(point, this.game.city, this.game.state.lines,
      gameClock(this.game.state.elapsedMinutes, this.game.state.calendar).minuteOfDay);
    section.hidden = !profile;
    if (!profile) return;
    this.setText('placeProfileName', profile.name); this.setText('placeProfileType', `${profile.type} · profil ${profile.profile}`);
    this.setText('placeProfileDescription', profile.description); this.setText('placeProfileSignificance', profile.significance);
    this.setText('placeProfileDemand', `${profile.demand.label}: ${decimal(profile.demand.score)}`);
    this.setHtml('placeProfileConnections', profile.connections.length
      ? `<strong>Powiązania</strong><ul>${profile.connections.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<span>Brak zapisanych połączeń z innymi miejscami.</span>');
  }
  openFeedback() {
    $('#feedbackForm').reset(); $('#feedbackError').textContent = ''; $('#feedbackExport').hidden = true;
    this.setText('feedbackExportLabel', `Gotowe zgłoszenie JSON · wersja gry ${this.appVersion}`);
    $('#feedbackDialog').showModal();
  }
  prepareFeedback(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form.entries()); input.includeDiagnostics = form.has('includeDiagnostics');
    const result = createFeedbackReport(input, { city: this.game.city.id, lines: this.game.state.lines.length, elapsedMinutes: this.game.state.elapsedMinutes }, { version: this.appVersion });
    $('#feedbackError').textContent = result.ok ? '' : result.errors.join(' ');
    if (!result.ok) return;
    $('#feedbackJson').value = feedbackJson(result.report); $('#feedbackExport').hidden = false;
    $('#feedbackStatus').textContent = 'Zgłoszenie jest przygotowane lokalnie. Nic nie zostało wysłane.';
  }
  async copyFeedback() {
    const value = $('#feedbackJson').value;
    try { await navigator.clipboard.writeText(value); }
    catch { $('#feedbackJson').select(); document.execCommand('copy'); }
    $('#feedbackStatus').textContent = 'Skopiowano JSON.';
  }
  downloadFeedback() {
    const blob = new Blob([$('#feedbackJson').value], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `urbanflow-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click(); URL.revokeObjectURL(url); $('#feedbackStatus').textContent = 'Pobrano plik JSON.';
  }
  scrollToBuild() { this.later(() => $('#buildSection').scrollIntoView({ block: 'start', behavior: 'smooth' }), 40); }

  renderStarterRoutes(onSelect) {
    this.onStarterSelect = onSelect;
    this.setHtml('routeOptions', this.game.starterRoutes.map(route => {
      const preview = this.game.previewLine('bus', route.stops, null);
      return `<button type="button" data-route="${escapeHtml(route.id)}"><i></i><span><strong>${escapeHtml(route.label)}</strong><small>${decimal(preview.distanceKm || route.distanceKm)} km · ${money(preview.cost || lineCost('bus', route.distanceKm))}</small></span><b aria-hidden="true">→</b></button>`;
    }).join(''));
  }

  render() {
    const { state, city } = this.game;
    const clock = gameClock(state.elapsedMinutes, state.calendar);
    const unlocked = this.game.availableTypes();
    const counts = eligibleCounts(state.lines, state.satisfaction);
    const balance = state.lines.reduce((sum, line) => sum + finite(line.stats?.balancePerHour), 0);
    this.setText('budgetStat', money(state.budget));
    $('#budgetStat').classList.toggle('negative', state.budget < 0);
    this.setText('networkBalanceStat', `${balance > 0 ? '+' : ''}${money(balance)}`);
    $('#networkBalanceStat').className = balance < 0 ? 'negative' : balance > 0 ? 'positive' : '';
    this.setText('populationStat', formatNumber(city.population));
    this.setText('waitingStat', formatNumber(totalWaiting(state.passengers)));
    this.setText('carriedStat', formatNumber(state.carried));
    this.setText('linesStat', state.lines.length);
    this.setText('happinessStat', `${formatNumber(state.satisfaction)}%`);
    $('#happinessStat').classList.toggle('negative', state.satisfaction < 40);
    this.setText('timeStat', clock.label); this.setText('mobileTimeStat', clock.label);
    this.setText('weekdayStat', `${clock.weekday} · ${clock.dayTypeLabel} · T${clock.week}`);
    this.setText('weekdayMobileStat', `${clock.weekday} · ${clock.dayType === 'special' ? 'Specjalny' : clock.dayTypeLabel}`);
    this.setText('cityName', city.name);
    this.setText('pauseButton', state.paused || state.status !== 'playing' ? '▶' : 'Ⅱ');
    $('#pauseButton').disabled = state.status !== 'playing';
    $('#pauseButton').setAttribute('aria-label', state.paused ? 'Wznów grę' : 'Wstrzymaj grę');
    $('#pauseButton').title = state.paused ? 'Wznów grę' : 'Wstrzymaj grę';
    this.setText('speedButton', `×${state.speed}`);
    $('#speedButton').disabled = state.status !== 'playing';
    this.setText('trafficStatus', state.status !== 'playing' ? 'Koniec kampanii' : state.paused ? 'Pauza' : demandMultiplier(clock.minuteOfDay) > 1.5 ? 'Godziny szczytu' : clock.hour >= 22 || clock.hour < 5 ? 'Nocne kursy' : 'Ruch zwykły');
    $('.map-context').classList.toggle('rush', demandMultiplier(clock.minuteOfDay) > 1.5);
    this.renderCampaign();
    this.renderTutorial(unlocked);
    this.renderAnalytics(clock.minuteOfDay);
    this.renderCityEvolutionPanel(this.game.visiblePoints());
    this.renderDraft(unlocked, counts);
    this.renderNetwork();
    this.renderFleet();
    this.renderProgress(unlocked, counts);
    this.renderPlaceProfile();
    $('#objective').classList.toggle('completed', state.lines.length > 0 || state.selectedNodes.length > 0 || state.status !== 'playing');
    this.map.render(this.game.visiblePoints(), state);
    this.map.highlightLine?.(this.selectedLineId);
    if (state.status === 'won' || state.status === 'lost') this.renderSummary();
  }

  renderDraft(unlocked, counts) {
    const { state, city } = this.game;
    const type = TRANSPORT_TYPES[state.selectedType];
    const editing = Boolean(state.editingLineId);
    this.setHtml('transportList', Object.values(TRANSPORT_TYPES).map(item => {
      const enabled = unlocked.includes(item.id);
      const title = enabled ? item.description : this.unlockCopy(item.id, counts);
      return `<button class="transport-button ${state.selectedType === item.id ? 'active' : ''}" data-type="${item.id}" ${!enabled || editing || state.status !== 'playing' ? 'disabled' : ''} style="--transport:${item.color}" title="${escapeHtml(title)}" aria-label="${escapeHtml(item.name)}. ${escapeHtml(title)}" aria-pressed="${state.selectedType === item.id}"><b>${item.short}</b><span>${shortNames[item.id]}</span>${enabled ? '' : '<i aria-hidden="true">⌑</i>'}</button>`;
    }).join(''));
    this.setText('selectionLabel', type.name);
    this.setText('transportDescription', type.description);
    this.setText('buildTitle', editing ? 'Edytuj przebieg linii' : 'Zaplanuj linię');
    const selected = state.selectedNodes.map(id => city.points.find(point => point.id === id)).filter(Boolean);
    this.setText('draftStopCount', `${selected.length} przystanków`);
    this.setHtml('draftStopList', selected.map((point, index) => `<li><span class="stop-index">${index + 1}</span><strong>${escapeHtml(point.name)}</strong><div class="stop-actions"><button type="button" data-action="stop-up" data-index="${index}" aria-label="Przenieś ${escapeHtml(point.name)} wyżej" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="stop-down" data-index="${index}" aria-label="Przenieś ${escapeHtml(point.name)} niżej" ${index === selected.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-action="stop-remove" data-index="${index}" aria-label="Usuń ${escapeHtml(point.name)} z trasy">×</button></div></li>`).join(''));
    this.setText('draftHint', selected.length ? 'Dodaj kolejny punkt z mapy lub zmień kolejność strzałkami.' : 'Kliknij pierwszy punkt na mapie lub wybierz trasę startową.');
    const preview = this.game.previewLine();
    const hasRoute = selected.length >= 2;
    this.setText('previewDistance', hasRoute ? `${decimal(preview.distanceKm)} km` : '—');
    this.setText('previewTime', hasRoute && preview.metrics ? `${decimal(preview.metrics.travelMinutes)} min` : '—');
    this.setText('previewCost', hasRoute ? money(preview.cost) : '—');
    this.setText('previewRoutingSource', hasRoute ? preview.routeDetails?.source || '—' : '—');
    this.setText('previewRoutingAlgorithm', hasRoute ? preview.routeDetails?.algorithm || '—' : '—');
    this.setText('previewRoutingReason', hasRoute ? preview.routeDetails?.reason || '' : '');
    this.setText('previewRoutingSnap', hasRoute && preview.routeDetails?.mode !== 'direct'
      ? `${decimal(preview.routeDetails?.snappedDistanceKm || 0)} km (do najbliższych wierzchołków, bez limitu)` : 'nie dotyczy');
    const fleetCopy = preview.vehiclesToBuy ? ` W cenie: zakup ${preview.vehiclesToBuy} pojazdów (${money(preview.fleetCost)}).` : ' Pojazdy zostaną przydzielone z rezerwy.';
    const message = hasRoute ? preview.message || (!preview.affordable ? `Brakuje ${money(preview.cost - state.budget)} na budowę.` : editing ? 'Przebudowa resetuje statystyki tej trasy i wymaga ponownego wykorzystania do odblokowań.' : `Trasa korzysta z routingu: ${preview.routingMode === 'road' ? 'drogi' : preview.routingMode === 'rail-corridor' ? 'korytarz kolejowy' : 'tunel bezpośredni'}.${fleetCopy}`) : 'Co najmniej dwa przystanki tworzą połączenie.';
    this.setText('previewMessage', state.status === 'playing' ? message : 'Kampania zakończona. Możesz obejrzeć swoją sieć.');
    $('#previewMessage').classList.toggle('negative', hasRoute && (!preview.ok || !preview.affordable));
    $('#createLineButton').disabled = !preview.ok || !preview.affordable || state.status !== 'playing';
    this.setText('createLineButton', !hasRoute ? 'Zaznacz przystanki' : `${editing ? 'Zapisz zmiany' : 'Zbuduj linię'} · ${money(preview.cost)}`);
    this.setText('clearSelectionButton', editing ? 'Anuluj edycję' : 'Wyczyść wybór');
    $('#clearSelectionButton').disabled = !selected.length && !editing;
    $('#mapBuildHint').classList.toggle('is-hidden', !selected.length || state.status !== 'playing');
    this.setText('mapBuildHintText', `${editing ? 'Edycja' : 'Plan'}: ${selected.length} przyst. ${hasRoute ? `· ${money(preview.cost)}` : '· dodaj kolejny punkt'}`);
    this.setText('mobilePanelLabel', selected.length ? `Podgląd (${selected.length})` : 'Sieć i budowa');
  }

  renderCampaign() {
    const goals = campaignObjectives(this.game);
    const completed = goals.filter(goal => goal.completed);
    this.setText('goalCount', `${completed.length}/${goals.length}`);
    this.setText('activeGoal', goals.find(goal => !goal.completed)?.title || 'Wszystkie cele Krakowa zrealizowane.');
    this.setHtml('campaignTrack', goals.map(goal => `<i class="${goal.completed ? 'done' : ''}" style="--progress:${Math.max(0, Math.min(1, goal.progress)) * 100}%"></i>`).join(''));
    this.setHtml('goalList', goals.map((goal, index) => `<li class="${goal.completed ? 'done' : ''}"><span class="goal-number">${goal.completed ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(goal.title)}</strong><small>${escapeHtml(goal.description)}</small>${goal.completed ? '' : `<div class="goal-progress"><i style="width:${Math.max(0, Math.min(1, goal.progress)) * 100}%"></i></div>`}</div></li>`).join(''));
    const collapsed = Boolean(this.game.state.preferences?.goalsCollapsed);
    $('#goalsBody').hidden = collapsed;
    $('#toggleGoalsButton').setAttribute('aria-expanded', String(!collapsed));
    if (this.previousGoals) completed.filter(goal => !this.previousGoals.has(goal.id)).forEach(goal => {
      this.toast(`Cel ukończony: ${goal.title}`, 'celebrate');
      $('.campaign-card').classList.add('goal-complete');
      this.later(() => $('.campaign-card')?.classList.remove('goal-complete'), 1000);
    });
    this.previousGoals = new Set(completed.map(goal => goal.id));
  }

  renderTutorial(unlocked) {
    const { state } = this.game;
    let step;
    if (!state.lines.length) step = ['01', `Połącz ${this.game.startScenario.name}`, `Zbuduj dowozową linię do węzła ${this.game.pointName(this.game.startScenario.localHubId)}. Przerywana linia pokazuje przebieg po drogach.`, 'Możesz zatrzymać czas przyciskiem Ⅱ i spokojnie projektować trasę.'];
    else if (!campaignObjectives(this.game).find(goal => goal.id === 'center')?.completed) step = ['02', 'Połącz węzeł z centrum', `Doprowadź sieć z ${this.game.pointName(this.game.startScenario.localHubId)} do ${this.game.pointName(this.game.startScenario.centerId)}. Wspólny przystanek umożliwia przesiadkę.`, 'Nie musisz przedłużać pierwszej linii — możesz utworzyć drugą z dogodną przesiadką.'];
    else if (!unlocked.includes('tram')) step = ['03', 'Niech autobusy pracują', 'Dwie użyteczne linie autobusowe po 6 godzinach pracy odblokują tramwaj. Otwórz szczegóły linii i sprawdź jej bilans oraz kolejkę.', 'Brakuje miejsc? Dokup pojazd. Puste kursy? Zmniejsz częstotliwość.'];
    else if (!state.lines.some(line => line.type === 'tram')) step = ['04', 'Miejski kręgosłup', 'Tramwaj pomieści więcej pasażerów. Uruchom go między ruchliwymi dzielnicami i zapewnij przesiadki z autobusów.', 'Nakładające się trasy konkurują o pasażerów. Identyczne linie nie przyspieszą rozwoju.'];
    else if (!unlocked.includes('suburban')) step = ['05', 'Rozwijaj użyteczne korytarze', 'Połącz Nową Hutę i rozwijaj trzy użyteczne trasy tramwajowe. Odblokujesz metro i kolej aglomeracyjną.', 'Rozbudowę finansują bilety i nagrody za cele. Pilnuj kosztów nowych pojazdów.'];
    else if (!state.airportUnlocked) step = ['06', 'Ostatnia mila do lotniska', 'Dwie działające koleje aglomeracyjne lub trzy linie metra otworzą lotnisko. Rozwijaj użyteczne korytarze.', 'Cel lotniska wymaga przewiezienia pasażerów. Samo narysowanie połączenia nie wystarczy.'];
    else step = ['07', 'Egzamin metropolii', 'Połącz Balice i przygotuj sieć na normalny dzień, wydarzenie, szczyt oraz zakłócenie.', 'Korzystaj z diagnostyki. Zmieniaj częstotliwość, flotę lub przebieg zanim problem stanie się krytyczny.'];
    this.setText('stepNumber', step[0]); this.setText('tutorialTitle', step[1]);
    this.setText('tutorialText', step[2]); this.setText('tutorialTip', step[3]);
    const collapsed = Boolean(state.preferences?.tutorialCollapsed);
    $('#tutorialBody').hidden = collapsed;
    $('#toggleTutorialButton').setAttribute('aria-expanded', String(!collapsed));
  }

  renderAnalytics(minuteOfDay) {
    const { state } = this.game;
    const clock = gameClock(state.elapsedMinutes, state.calendar);
    const points = this.game.visiblePoints();
    const snapshot = diagnosticSnapshot(state, points, minuteOfDay);
    const mobility = mobilitySnapshot(state, points);
    const originSelect = $('#mobilityOrigin'); const destinationSelect = $('#mobilityDestination');
    const originValue = originSelect?.value; const destinationValue = destinationSelect?.value;
    const options = points.filter(point => point.type !== 'stop').map(point => `<option value="${escapeHtml(point.id)}">${escapeHtml(point.name)}</option>`).join('');
    this.setHtml('mobilityOrigin', options);
    this.setHtml('mobilityDestination', options);
    if (originValue && points.some(point => point.id === originValue)) $('#mobilityOrigin').value = originValue;
    if (destinationValue && points.some(point => point.id === destinationValue)) $('#mobilityDestination').value = destinationValue;
    this.setText('mobilityActive', formatNumber(mobility.activeTrips));
    this.setText('mobilityCompleted', formatNumber(mobility.completedTrips));
    this.setText('mobilityWait', `${decimal(mobility.averageWaitMinutes)} min`);
    this.setText('mobilityJourney', `${decimal(mobility.averageJourneyMinutes)} min`);
    this.setText('mobilityTransfers', `${Math.round(mobility.transferShare * 100)}%`);
    this.setText('mobilitySatisfaction', mobility.completedSatisfaction === null ? '—' : `${decimal(mobility.completedSatisfaction)}/100`);
    this.setText('mobilityAccess', mobility.accessibility.score === null ? '—' : `${Math.round(mobility.accessibility.score * 100)}%`);
    this.setHtml('mobilityRelations', mobility.busiestRelations.length ? mobility.busiestRelations.map(item => `<li><span>${escapeHtml(item.label)}</span><b>${formatNumber(item.passengers || item.generated)}</b></li>`).join('') : '<li class="empty-mini">Relacje pojawią się po rozpoczęciu podróży.</li>');
    const mobilityFailures = mobility.failures.filter(item => item.passengers > 0);
    this.setHtml('mobilityFailures', mobilityFailures.length ? mobilityFailures.map(item => `<li><span>${escapeHtml(FAILURE_LABELS[item.reason] || item.reason)}</span><b>${formatNumber(item.passengers)}</b></li>`).join('') : '<li class="empty-mini">Brak zarejestrowanych niepowodzeń.</li>');
    const modes = [['off', 'Zwykła'], ['demand', 'Popyt'], ['flow', 'Przewozy'], ['overload', 'Przeciążenia'], ['queues', 'Kolejki'], ['unmet', 'Braki popytu'], ['profit', 'Rentowność'], ['load', 'Odcinki'], ['travel', 'Czas'], ['access', 'Dostępność'], ['cityEvolution', 'Rozwój miasta']];
    const modeTitles = { off: 'Wyłącz warstwę analityczną', demand: 'Potencjał szacunkowy i wygenerowane podróże', flow: 'Zaobserwowane obciążenie segmentów', overload: 'Podświetl odcinki o wysokim obciążeniu', queues: 'Liczba oczekujących na punktach', unmet: 'Zgromadzone niezrealizowane próby', profit: 'Obserwowany bilans linii', load: 'Wykorzystanie pojemności odcinków', travel: 'Czas oczekiwania', access: 'Dostępność punktów', cityEvolution: 'Modelowane zmiany obszarów miasta i ich dostępności' };
    this.setHtml('analyticsModes', modes.map(([id, label]) => `<button type="button" data-action="analytics-mode" data-mode="${id}" class="${state.analyticsMode === id ? 'active' : ''}" aria-pressed="${state.analyticsMode === id}" title="${modeTitles[id]}">${label}</button>`).join(''));
    const legends = { demand: 'Popyt potencjalny jest estymacją modelu; obserwowane wygenerowane podróże pochodzą z symulacji.', flow: 'Grubość pokazuje zaobserwowane obciążenie pojazdów; zielony <65%, pomarańczowy 65–94%, czerwony ≥95%. To wykorzystanie miejsc, nie licznik przejazdów na segmencie.', overload: 'Czerwony odcinek osiągnął co najmniej 95% zaobserwowanego obciążenia.', queues: 'Rozmiar punktu pokazuje liczbę pasażerów aktualnie oczekujących.', unmet: 'Punkty pokazują zgromadzone, zaobserwowane niezrealizowane próby podróży.', profit: 'Kolor linii pokazuje obserwowany bilans operacyjny na godzinę.', load: 'Kolor odcinka pokazuje zaobserwowane wykorzystanie pojemności.', cityEvolution: 'Kolor oznacza atrakcyjność obszaru: czerwony niższą, żółty pośrednią, zielony wyższą. Rozmiar oznacza potencjał rozwoju. Wartości to parametry gry, nie dane demograficzne.' };
    this.setText('networkLegend', legends[state.analyticsMode] || 'Warstwa mapy korzysta z danych bieżącej symulacji. Potencjalny popyt w podsumowaniu jest estymacją.');
    const problems = networkProblems(state, points);
    this.setText('networkProblemCount', `${problems.length} obserwacji`);
    this.setHtml('networkProblems', problems.length ? problems.map(item => `<li class="network-problem"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.cause)} · ${escapeHtml(item.observed)}</span><small>${escapeHtml(item.impact)} ${escapeHtml(item.actions)}</small></li>`).join('') : '<li class="empty-mini">Brak wykrytych problemów na podstawie bieżących obserwacji.</li>');
    const history = state.networkHistory || []; const latest = history.at(-1); const previous = history.at(-2);
    const beforeChange = latest && [...history].reverse().find(item => item.networkVersion !== latest.networkVersion);
    const comparison = beforeChange || previous;
    const comparisonLabel = beforeChange ? 'przed zmianą sieci' : 'poprzedni tick';
    this.setText('networkHistorySummary', latest ? `Tick: ${formatNumber(latest.transported)} przewiezionych, ${formatNumber(latest.abandoned)} porzuconych, ${formatNumber(latest.denied)} bez dostepnej podr\u00f3\u017cy | pokrycie punkt\u00f3w ${Math.round(latest.coverage * 100)}% | dost\u0119pno\u015b\u0107 podr\u00f3\u017cy ${latest.tripAvailability === null ? 'brak obserwacji' : `${Math.round(latest.tripAvailability * 100)}%`} | wykorzystanie pojemno\u015bci ${Math.round(latest.utilization * 100)}% | przychody ${money(latest.revenue)} | koszty ${money(latest.cost)} | bilans ${money(latest.balance)}${comparison ? ` | ${comparisonLabel} (tick ${comparison.at}): ${formatNumber(comparison.transported)} przewiezionych, ${money(comparison.balance)} bilansu` : ''}` : 'Historia pojawi si\u0119 po wykonaniu ticku symulacji.');
    const daily = state.networkDailyHistory?.at(-1); const weekly = state.networkWeeklyHistory?.at(-1);
    const periodText = item => item ? `${formatNumber(item.transported)} przewiezionych | ${formatNumber(item.abandoned)} porzuconych | ${formatNumber(item.denied)} bez dostepnej podr\u00f3\u017cy | \u015brednie oczekiwanie ${decimal(item.averageWaitMinutes)} min | dost\u0119pno\u015b\u0107 podr\u00f3\u017cy ${item.tripAvailability === null ? 'brak obserwacji' : `${Math.round(item.tripAvailability * 100)}%`} | pokrycie ${Math.round(item.coverage * 100)}% | wykorzystanie miejsc ${Math.round(item.utilization * 100)}% | przychody ${money(item.revenue)} | koszty ${money(item.cost)} | bilans ${money(item.balance)}` : 'Dane pojawia sie po zako\u0144czeniu okresu.';
    this.setText('networkDailySummary', daily ? `Dzie\u0144 ${daily.date}: ${periodText(daily)}` : 'Agregat dobowy pojawi si\u0119 po pierwszym ticku.');
    this.setText('networkWeeklySummary', weekly ? `Tydzie\u0144 ${weekly.week}: ${periodText(weekly)}` : 'Agregat tygodniowy pojawi si\u0119 po pierwszym ticku.');
    this.setText('networkComparisonNote', comparison ? `tick ${comparison.at} → ${latest.at}; porównanie obserwacji, nie prognoza` : 'brak wcześniejszego okna do porównania');
    this.setHtml('topRelations', snapshot.relations.length ? snapshot.relations.map(relation => `<li><span>${escapeHtml(relation.label)}</span><b>${formatNumber(relation.count)}</b></li>`).join('') : '<li class="empty-mini">Relacje pojawią się po uruchomieniu miasta.</li>');
    const totalFailures = snapshot.failures.reduce((sum, item) => sum + item.count, 0);
    const failures = snapshot.failures.filter(item => item.count > 0);
    this.setHtml('failureReasons', failures.length ? failures.map(item => `<li title="${escapeHtml(FAILURE_LABELS[item.id])}"><span>${escapeHtml(item.label)}</span><b>${formatNumber(item.count)}</b></li>`).join('') : '<li class="empty-mini">Brak niezrealizowanych podróży.</li>');
    this.setText('failureTotal', totalFailures ? `${formatNumber(totalFailures)} rezygnacji` : 'brak rezygnacji');
    const capacity = state.lines.reduce((sum, line) => sum + lineMetrics(line, this.game.city, minuteOfDay,
      { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes, serviceDayType: clock.dayType }).capacityPerHour, 0);
    this.setText('capacityComparison', `${formatNumber(totalWaiting(state.passengers))} oczekuje · ${formatNumber(capacity)} miejsc/h`);
    const events = [...activeCityEvents(state.cityEvents, state.elapsedMinutes), ...upcomingCityEvents(state.cityEvents, state.elapsedMinutes)];
    this.setHtml('activeEvents', events.length ? events.map(event => {
      const location = event.locationId ? this.game.city.points.find(point => point.id === event.locationId)?.name : 'Całe miasto';
      const planned = event.startMinute > state.elapsedMinutes;
      const hours = Math.max(1, Math.ceil(((planned ? event.startMinute : event.endMinute) - state.elapsedMinutes) / 60));
      return `<li class="${planned ? 'planned' : 'active'}"><b>${planned ? '◷ ' : '● '}${escapeHtml(event.title)}</b><span>${escapeHtml(location || 'Miasto')} · ${planned ? `za ${hours} h` : `jeszcze ${hours} h`}</span><small>${escapeHtml(describeEventImpact(event))}. ${escapeHtml(event.message)}</small></li>`;
    }).join('') : '<li class="empty-mini">Brak aktywnych i zapowiedzianych wydarzeń.</li>');
    const potential = latentDemand(this.game.city.points, state.lines, minuteOfDay, state.cityEvents, state.elapsedMinutes, clock.dayType, state.cityEvolution);
    const servedPotential = potential.filter(item => item.served).reduce((sum, item) => sum + item.potential, 0);
    const allPotential = potential.reduce((sum, item) => sum + item.potential, 0) || 1;
    this.setText('latentDemandSummary', `${Math.round(servedPotential / allPotential * 100)}% potencjalnego popytu w zasięgu`);
  }

  renderCityEvolutionPanel(points = this.game.visiblePoints()) {
    const panel = $('#cityEvolutionPanel');
    if (!panel) return;
    const { state } = this.game;
    const show = state.analyticsMode === 'cityEvolution';
    panel.hidden = !show;
    if (!show) return;
    const model = cityEvolutionSnapshot(state.cityEvolution);
    const visibleIds = new Set(points.filter(point => point.type !== 'stop').map(point => point.id));
    const zones = model.districts.filter(zone => visibleIds.has(zone.id));
    const select = $('#cityEvolutionDistrict');
    if (!zones.some(zone => zone.id === this.selectedEvolutionDistrict)) this.selectedEvolutionDistrict = zones[0]?.id || null;
    this.setHtml('cityEvolutionDistrict', zones.map(zone => `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`).join(''));
    if (this.selectedEvolutionDistrict) select.value = this.selectedEvolutionDistrict;
    const zone = model.districts.find(item => item.id === this.selectedEvolutionDistrict);
    if (!zone) { this.setHtml('cityEvolutionProfile', '<p class="empty-mini">Brak dostępnych obszarów do pokazania.</p>'); return; }
    const change = value => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
    this.setHtml('cityEvolutionProfile', `<dl class="detail-stats city-evolution-stats"><div><dt>Mieszkańcy · model</dt><dd>${formatNumber(zone.residents)} <small>(${change(zone.lastChange.residents)} w tym tygodniu)</small></dd></div><div><dt>Miejsca pracy · model</dt><dd>${formatNumber(zone.jobs)} <small>(${change(zone.lastChange.jobs)} w tym tygodniu)</small></dd></div><div><dt>Atrakcyjność mieszkaniowa</dt><dd>${Math.round(zone.residentialAttractiveness)}/100</dd></div><div><dt>Atrakcyjność gospodarcza</dt><dd>${Math.round(zone.economicAttractiveness)}/100</dd></div><div><dt>Dostępność pracy / mieszkań</dt><dd>${zone.jobAccess}% / ${zone.residentialAccess}%</dd></div><div><dt>Zadowolenie transportowe</dt><dd>${zone.transportSatisfaction}/100</dd></div><div><dt>Potencjał rozwoju</dt><dd>${zone.growthPotential}/100</dd></div><div><dt>Limit modelu · mieszkańcy / praca</dt><dd>${formatNumber(zone.capacity.residents)} / ${formatNumber(zone.capacity.jobs)}</dd></div></dl><p class="city-evolution-factor">Profil miejsca: ${escapeHtml(zone.profile)}. Zmiany są wygładzane tygodniowo, ograniczane pojemnością i zależą od dostępnych połączeń oraz obserwowanego oczekiwania i obciążenia.</p>`);
    const latest = model.weeklyReports.at(-1);
    this.setText('cityEvolutionWeeklySummary', latest
      ? `Tydzień ${latest.week}: mieszkańcy ${change(latest.residentsDelta)}, miejsca pracy ${change(latest.jobsDelta)}, popyt modelowany ${latest.demandChangePercent > 0 ? '+' : ''}${decimal(latest.demandChangePercent)}%${latest.networkBalance === null ? '' : `, wynik sieci w tygodniu ${latest.networkWeek}: ${money(latest.networkBalance)}`}.`
      : 'Zmiany pojawią się po upływie pierwszego tygodnia symulacji.');
    const details = latest ? [
      ...latest.fastestGrowing.map(item => `Szybki wzrost: ${item.name} (${change(item.change)} mieszkańców).`),
      ...latest.declining.map(item => `Spadek: ${item.name} (${change(item.change)} mieszkańców).`),
      ...latest.transportIssues.map(item => `Problem transportowy: ${item.name} · dostępność ${item.access}% · zadowolenie ${item.satisfaction}/100.`)
    ] : [];
    this.setHtml('cityEvolutionWeeklyDetails', details.length ? details.map(item => `<li><span>${escapeHtml(item)}</span></li>`).join('') : '<li class="empty-mini">Brak tygodniowych obserwacji.</li>');
  }

  renderMobilityRelation() {
    const origin = $('#mobilityOrigin')?.value; const destination = $('#mobilityDestination')?.value;
    const clock = gameClock(this.game.state.elapsedMinutes, this.game.state.calendar);
    const context = { events: this.game.state.cityEvents || [], elapsedMinutes: this.game.state.elapsedMinutes,
      serviceDayType: clock.dayType, intervalMinutes: 0 };
    const result = diagnoseTransitRelation(this.game.state.lines, this.game.visiblePoints(), origin, destination, clock.minuteOfDay, context);
    const labels = { available: 'Dostępne połączenie', noConnection: 'Brak połączenia między tymi punktami', noService: 'Linie łączą punkty, ale teraz nie kursują',
      excessiveTime: 'Szacowany czas przekracza 100 minut', lowCapacity: 'Trasa działa, ale ma ograniczoną przepustowość', unknownPlace: 'Wybierz dwa dostępne miejsca' };
    const plan = result.plan;
    this.setText('mobilityRouteResult', `${labels[result.reason] || result.reason}${plan?.diagnostics?.totalMinutes ? ` · ${decimal(plan.diagnostics.totalMinutes)} min łącznie (oczekiwanie ${decimal(plan.diagnostics.expectedWaitMinutes)} min), ${plan.diagnostics.transfers} przesiadek, ${formatNumber(plan.diagnostics.capacityPerHour)} miejsc/h · ${plan.diagnostics.source} · ${plan.diagnostics.algorithm}` : ''}`);
  }

  renderFleet() {
    const snapshot = fleetSnapshot(this.game.state);
    this.setHtml('fleetList', Object.entries(snapshot).map(([id, fleet]) => {
      const type = TRANSPORT_TYPES[id];
      return `<div class="fleet-row"><span class="fleet-symbol" style="--transport:${type.color}">${type.short}</span><span><strong>${escapeHtml(type.name)}</strong><small>${fleet.assigned} z ${fleet.owned} używanych · rezerwa ${fleet.reserve}</small></span><button type="button" data-action="purchase-fleet" data-vehicle-type="${id}" ${this.game.state.status !== 'playing' || this.game.state.budget < type.vehicleCost ? 'disabled' : ''}>＋ ${money(type.vehicleCost)}</button></div>`;
    }).join(''));
  }

  renderNetwork() {
    const { state, city } = this.game;
    if (!state.lines.some(line => line.id === this.selectedLineId)) this.selectedLineId = null;
    const revenue = state.lines.reduce((sum, line) => sum + finite(line.stats?.revenuePerHour), 0);
    const costs = state.lines.reduce((sum, line) => sum + finite(line.stats?.costPerHour), 0);
    this.setText('networkCount', `${state.lines.length} linii`);
    this.setHtml('networkSummary', state.lines.length ? `<span>Wpływy / h <b class="positive">${money(revenue)}</b></span><span>Koszty linii / h <b>${money(costs)}</b></span><span>Rezerwa / h <b>${money(state.fleetReserveCostPerHour || 0)}</b></span>` : '');
    this.setHtml('lineList', state.lines.length ? state.lines.map((line, index) => {
      const type = TRANSPORT_TYPES[line.type];
      const stats = line.stats || {};
      const from = city.points.find(point => point.id === line.stops[0]);
      const to = city.points.find(point => point.id === line.stops.at(-1));
      return `<button type="button" class="line-item ${line.id === this.selectedLineId ? 'selected' : ''} ${finite(stats.load) > .9 ? 'busy' : ''}" data-action="select-line" data-line="${escapeHtml(line.id)}" style="--transport:${line.color || type.color}" aria-expanded="${line.id === this.selectedLineId}"><b class="line-badge">${escapeHtml(line.name || `${type.short}${index + 1}`)}</b><span class="line-item-copy"><strong>${escapeHtml(from?.name)} → ${escapeHtml(to?.name)}</strong><small>${line.stops.length} przyst. · ${line.vehicles} poj. · ${decimal(finite(stats.load) * 100)}% zajętości</small></span><span class="line-profit ${finite(stats.balancePerHour) < 0 ? 'negative' : 'positive'}">${money(stats.balancePerHour)}<small>/ h</small></span></button>`;
    }).join('') : '<p class="empty-state">Pierwsza linia nada miastu rytm.<br>Wybierz połączenie dowozowe i zaplanuj trasę.</p>');
    this.renderDetails();
  }

  renderDetails() {
    const { state, city } = this.game;
    const line = state.lines.find(line => line.id === this.selectedLineId);
    const container = $('#lineDetail');
    container.classList.toggle('is-hidden', !line);
    if (!line) { this.detailLineId = null; return; }
    const type = TRANSPORT_TYPES[line.type];
    const stats = line.stats || {};
    const clock = gameClock(state.elapsedMinutes, state.calendar);
    this.selectedServiceDayType ||= clock.dayType;
    const metrics = lineMetrics(line, city, clock.minuteOfDay,
      { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes, serviceDayType: clock.dayType });
    if (this.detailLineId !== line.id) {
      container.innerHTML = `<div class="detail-heading"><span class="section-kicker">Szczegóły linii</span><strong data-detail="name"></strong></div><p class="detail-route" data-detail="route"></p><dl class="detail-stats"><div><dt>Długość</dt><dd data-detail="distance"></dd></div><div><dt>Przejazd w jedną stronę</dt><dd data-detail="travel"></dd></div><div><dt>Wpływy / h</dt><dd class="positive" data-detail="revenue"></dd></div><div><dt>Koszt / h</dt><dd data-detail="cost"></dd></div><div><dt>Bilans / h</dt><dd data-detail="balance"></dd></div><div><dt>Dotacja pasażerokm</dt><dd data-detail="subsidy"></dd></div><div><dt>Przewozy od przebudowy</dt><dd data-detail="carried"></dd></div><div><dt>Średni czas oczekiwania</dt><dd data-detail="wait"></dd></div><div><dt>Kolejka tej linii</dt><dd data-detail="waiting"></dd></div><div><dt>Wykorzystanie floty</dt><dd data-detail="vehicles"></dd></div></dl><div class="load-heading"><span>Wykorzystanie przepustowości</span><b data-detail="load"></b></div><div class="load-track"><i id="detailLoadBar"></i></div><p class="line-diagnosis" data-detail="diagnosis"></p><section class="timetable-control" aria-labelledby="timetableTitle"><div class="timetable-heading"><div><span class="section-kicker">Rozkład jazdy</span><strong id="timetableTitle">Częstotliwość w ciągu doby</strong></div><select data-timetable-profile data-line="${escapeHtml(line.id)}" aria-label="Gotowy profil rozkładu"></select></div><p class="timetable-current" data-current-period></p><p class="timetable-overview" data-detail="frequency"></p><div class="timetable-periods" data-timetable-periods></div><p class="timetable-capacity" data-timetable-capacity></p><button type="button" class="text-button timetable-restore" data-action="restore-timetable" data-line="${escapeHtml(line.id)}">Przywróć poprzednią konfigurację</button></section><div class="fleet-line-actions"><button type="button" data-action="unassign-vehicle" data-line="${escapeHtml(line.id)}">− Do rezerwy</button><button type="button" data-action="assign-vehicle" data-line="${escapeHtml(line.id)}">＋ Z rezerwy</button></div><button class="secondary-button" type="button" data-action="buy-vehicle" data-line="${escapeHtml(line.id)}" id="buyVehicleButton"></button><div class="line-actions"><button type="button" data-action="edit-line" data-line="${escapeHtml(line.id)}">Edytuj przystanki</button><button type="button" class="danger-button" data-action="delete-line" data-line="${escapeHtml(line.id)}">Usuń linię</button></div>`;
      this.detailLineId = line.id;
    }
    const timetableControl = container.querySelector('.timetable-control');
    if (!timetableControl.dataset.calendarReady) {
      timetableControl.innerHTML = `<div class="timetable-heading"><div><span class="section-kicker">Kalendarz kursowania</span><strong id="timetableTitle">Częstotliwość według typu dnia</strong></div></div><label class="calendar-field">Typ dnia<select data-service-day></select></label><label class="same-day-toggle"><input type="checkbox" data-same-every-day data-line="${escapeHtml(line.id)}">Taki sam rozkład każdego dnia</label><div class="calendar-copy"><label>Kopiuj rozkład z<select id="timetableCopySource" data-timetable-copy-source></select></label><button type="button" class="secondary-button" data-action="copy-timetable-day" data-line="${escapeHtml(line.id)}">Kopiuj do wybranego dnia</button></div><div class="calendar-special-actions"><button type="button" class="text-button" data-action="toggle-special-today" data-line="${escapeHtml(line.id)}"></button><button type="button" class="text-button" data-action="toggle-special-next" data-line="${escapeHtml(line.id)}"></button></div><p class="timetable-next-day" data-next-day></p><div class="timetable-heading"><strong>Gotowy profil</strong><select data-timetable-profile data-line="${escapeHtml(line.id)}" aria-label="Gotowy profil rozkładu"></select></div><p class="timetable-current" data-current-period></p><p class="timetable-overview" data-detail="frequency"></p><div class="timetable-periods" data-timetable-periods></div><p class="timetable-capacity" data-timetable-capacity></p><button type="button" class="text-button timetable-restore" data-action="restore-timetable" data-line="${escapeHtml(line.id)}">Przywróć poprzednią konfigurację</button>`;
      timetableControl.dataset.calendarReady = 'true';
    }
    const values = {
      name: `${line.name || type.name} · ${type.name}`,
      route: line.stops.map(id => city.points.find(point => point.id === id)?.name || id).join(' → '),
      distance: `${decimal(line.distanceKm)} km`, travel: `${decimal(metrics.travelMinutes)} min`,
      revenue: money(stats.revenuePerHour), cost: money(stats.costPerHour), balance: money(stats.balancePerHour),
      carried: formatNumber(stats.carried), wait: `${decimal(stats.avgWaitMinutes)} min`, waiting: `${formatNumber(stats.waiting)} os.`,
      subsidy: money(stats.subsidy), vehicles: `${metrics.activeVehicles}/${line.vehicles} aktywne · ${metrics.idleVehicles} rezerwa`, load: `${decimal(finite(stats.load) * 100)}%`,
      frequency: metrics.effectiveFrequency
        ? `Teraz: co ${decimal(metrics.intervalMinutes)} min · ${decimal(metrics.effectiveFrequency)} kursów/h.`
        : 'Teraz kursy są wyłączone. Następny aktywny przedział uruchomi linię ponownie.',
      diagnosis: this.lineDiagnosis(line, metrics)
    };
    Object.entries(values).forEach(([key, value]) => { const element = container.querySelector(`[data-detail="${key}"]`); if (element.textContent !== value) element.textContent = value; });
    container.querySelector('[data-detail="balance"]').className = finite(stats.balancePerHour) < 0 ? 'negative' : 'positive';
    $('#detailLoadBar').style.width = `${Math.min(100, finite(stats.load) * 100)}%`;
    $('#detailLoadBar').classList.toggle('busy', finite(stats.load) > .9);
    this.renderTimetable(line, metrics, clock.minuteOfDay, state.status !== 'playing', clock);
    const vehicleCost = finite(type.vehicleCost);
    this.setText('buyVehicleButton', `＋ Kup pojazd${vehicleCost ? ` · ${money(vehicleCost)}` : ''}`);
    $('#buyVehicleButton').disabled = state.status !== 'playing';
    $('#buyVehicleButton').classList.toggle('unaffordable', vehicleCost > state.budget);
    const fleet = fleetSnapshot(state)[line.type];
    container.querySelector('[data-action="assign-vehicle"]').disabled = state.status !== 'playing' || fleet.reserve < 1 || line.vehicles >= 16;
    container.querySelector('[data-action="unassign-vehicle"]').disabled = state.status !== 'playing' || line.vehicles <= 1;
    container.querySelectorAll('.line-actions button').forEach(button => { button.disabled = state.status !== 'playing'; });
  }

  renderTimetable(line, metrics, minuteOfDay, disabled, clock) {
    const timetable = this.game.state.lines.find(item => item.id === line.id)?.timetable;
    if (!timetable) return;
    const root = $('#lineDetail');
    const dayType = this.selectedServiceDayType || clock.dayType;
    const section = timetableForDay(timetable, dayType);
    const daySelect = root.querySelector('[data-service-day]');
    if (!daySelect.dataset.ready) {
      daySelect.innerHTML = SERVICE_DAY_TYPES.map(type => `<option value="${type}">${SERVICE_DAY_LABELS[type]}</option>`).join('');
      daySelect.dataset.ready = 'true';
    }
    daySelect.value = dayType;
    daySelect.disabled = disabled;
    const sameEveryDay = root.querySelector('[data-same-every-day]');
    sameEveryDay.checked = timetable.sameEveryDay;
    sameEveryDay.disabled = disabled;
    const copySource = root.querySelector('[data-timetable-copy-source]');
    if (!copySource.dataset.ready) {
      copySource.innerHTML = SERVICE_DAY_TYPES.map(type => `<option value="${type}">${SERVICE_DAY_LABELS[type]}</option>`).join('');
      copySource.dataset.ready = 'true';
    }
    if (copySource.value === dayType) copySource.value = SERVICE_DAY_TYPES.find(type => type !== dayType);
    copySource.disabled = disabled || timetable.sameEveryDay;
    const copyButton = root.querySelector('[data-action="copy-timetable-day"]');
    copyButton.disabled = disabled || timetable.sameEveryDay || copySource.value === dayType;
    const todayIsSpecial = clock.dayType === 'special';
    const nextDay = calendarAt(this.game.state.elapsedMinutes + 1440, this.game.state.calendar);
    root.querySelector('[data-action="toggle-special-today"]').textContent = todayIsSpecial ? 'Usuń oznaczenie dnia specjalnego' : 'Oznacz dziś jako dzień specjalny';
    root.querySelector('[data-action="toggle-special-today"]').disabled = disabled;
    root.querySelector('[data-action="toggle-special-next"]').textContent = nextDay.dayType === 'special' ? 'Usuń oznaczenie jutra jako specjalnego' : 'Oznacz jutro jako dzień specjalny';
    root.querySelector('[data-action="toggle-special-next"]').disabled = disabled;
    root.querySelector('[data-next-day]').textContent = `Dziś: ${clock.weekday}, ${clock.date} · jutro: ${nextDay.weekday}, ${nextDay.date} (${nextDay.dayTypeLabel}).`;
    const profile = root.querySelector('[data-timetable-profile]');
    const profileOptions = [
      ...Object.entries(TIMETABLE_PROFILES).map(([id, value]) => `<option value="${id}">${value.label}</option>`),
      '<option value="custom">Własny</option>', '<option value="legacy-uniform">Jednolity ze starszego zapisu</option>'
    ];
    if (!profile.dataset.ready) { profile.innerHTML = profileOptions.join(''); profile.dataset.ready = 'true'; }
    profile.dataset.dayType = dayType;
    profile.value = section.profileId;
    profile.disabled = disabled;
    const rows = root.querySelector('[data-timetable-periods]');
    if (!rows.dataset.ready) {
      rows.innerHTML = section.periods.map(period => `<div class="timetable-row" data-timetable-row="${escapeHtml(period.id)}"><div class="timetable-row-heading"><strong>${escapeHtml(period.label)}</strong><span>${formatTimetableTime(period.startMinute)}–${formatTimetableTime(period.endMinute)}</span></div><output data-frequency-value></output><input type="range" min="0" max="${TRANSPORT_TYPES[line.type].maxFrequency}" step="0.5" data-line="${escapeHtml(line.id)}" data-day-type="${dayType}" data-timetable-frequency="${escapeHtml(period.id)}" aria-label="${escapeHtml(period.label)} — kursy na godzinę"><small data-period-metrics></small></div>`).join('');
      rows.dataset.ready = 'true';
    }
    rows.querySelectorAll('[data-timetable-frequency]').forEach(input => { input.dataset.dayType = dayType; });
    const active = periodAt(section, minuteOfDay);
    root.querySelector('[data-current-period]').textContent = active
      ? `${dayType === clock.dayType ? 'Teraz' : SERVICE_DAY_LABELS[dayType]}: ${active.label} · ${active.frequency ? `co ${decimal(60 / active.frequency)} min` : 'kursy wyłączone'}` : 'Brak aktywnego przedziału.';
    for (const period of section.periods) {
      const row = rows.querySelector(`[data-timetable-row="${CSS.escape(period.id)}"]`);
      const input = row.querySelector('input');
      input.disabled = disabled;
      input.value = period.frequency;
      row.querySelector('[data-frequency-value]').textContent = period.frequency ? `${decimal(period.frequency)} kursów/h` : 'Kursy wyłączone';
      row.classList.toggle('is-current', active?.id === period.id);
      const periodLine = { ...line, timetable: { ...timetable, profiles: { ...timetable.profiles, [dayType]: section } } };
      const periodMetrics = lineMetrics(periodLine, this.game.city, period.startMinute,
        { events: this.game.state.cityEvents || [], elapsedMinutes: this.game.state.elapsedMinutes, serviceDayType: dayType });
      const deficit = Math.max(0, periodMetrics.requiredVehicles - line.vehicles);
      const capacityState = line.stats?.waiting > 0 || line.stats?.load >= 0.9 ? ' · możliwy niedobór przepustowości' : '';
      row.querySelector('[data-period-metrics]').textContent = `${money(periodMetrics.costPerHour)}/h · ${periodMetrics.requiredVehicles} poj. wymagane${deficit ? ` · brakuje ${deficit}` : ''}${capacityState}`;
    }
    const currentCapacity = metrics.capacityPerHour;
    const capacityNote = line.stats?.waiting > 0 || line.stats?.load >= 0.9
      ? `Kolejka ${formatNumber(line.stats.waiting)} os. · obciążenie ${decimal(finite(line.stats.load) * 100)}% wskazują na możliwy niedobór. `
      : 'Brak bieżącego sygnału przeciążenia. ';
    root.querySelector('[data-timetable-capacity]').textContent = `${capacityNote}Przepustowość w tym przedziale: ${formatNumber(currentCapacity)} miejsc/h. Koszt uwzględnia aktywną flotę, utrzymanie i kilometry według obecnego modelu.`;
    root.querySelector('[data-action="restore-timetable"]').disabled = disabled || !line.previousTimetable;
  }

  lineDiagnosis(line, metrics) {
    const stats = line.stats || {};
    if (metrics.eventCapacityMultiplier === 0) return 'Aktywne wydarzenie wstrzymało tę linię na wskazanym odcinku. Uruchom objazd albo wzmocnij alternatywne połączenia.';
    if (metrics.eventSpeedMultiplier < .8) return 'Lokalne zakłócenie mocno spowalnia trasę. Sprawdź wydarzenia i rozważ objazd lub dodatkową linię.';
    if (line.ageMinutes < 60) return 'Nowa linia zbiera pierwszych pasażerów. Daj jej godzinę czasu miejskiego i obserwuj wyniki.';
    if (finite(stats.load) > .88 && finite(stats.waiting) > 0) return 'Duży popyt i kolejka. Dodatkowy pojazd lub częstsze kursy mogą zwiększyć przepustowość.';
    if (finite(stats.balancePerHour) < 0 && finite(stats.carried) === 0) return 'Brak pasażerów. Sprawdź połączenie z pozostałą siecią i kierunki podróży.';
    if (finite(stats.balancePerHour) < 0) return 'Bilety nie pokrywają utrzymania. Ogranicz puste kursy lub połącz trasę z większą liczbą dzielnic.';
    if (metrics.effectiveFrequency + .05 < metrics.requestedFrequency) return 'Przydzielona flota ogranicza wybraną częstotliwość. Więcej pojazdów skróci odstępy między kursami.';
    return 'Wpływy pokrywają utrzymanie. Obserwuj kolejkę i zapełnienie w godzinach szczytu.';
  }

  renderProgress(unlocked, counts) {
    const rows = [['Tramwaj', counts.bus, 2, 'tram'], ['Metro', counts.tram, 3, 'metro'], ['Kolej aglomeracyjna', counts.tram, 3, 'suburban'], ['Kolej międzymiastowa', counts.tram, 4, 'intercity']];
    this.setHtml('progressList', rows.map(([name, value, target, type]) => `<div class="progress-row"><span>${name}</span><div><i style="width:${unlocked.includes(type) ? 100 : Math.min(100, finite(value) / target * 100)}%"></i></div><b>${unlocked.includes(type) ? '✓' : `${Math.min(finite(value), target)}/${target}`}</b></div>`).join(''));
    this.setText('nextUnlock', unlocked.length === 5 ? 'Pełny wybór transportu' : Object.values(TRANSPORT_TYPES).find(type => !unlocked.includes(type.id))?.name || '');
    this.setText('airportRule', this.game.visiblePoints().some(point => point.type === 'airport') ? 'Lotnisko dostępne. Dodaj Balice do swojej sieci.' : 'Lotnisko: 3 działające metro lub 2 koleje aglomeracyjne albo 1 kolej IC + 2 metro.');
  }

  unlockCopy(type, counts) {
    if (type === 'tram') return `${finite(counts.bus)}/2 użyteczne linie autobusowe`;
    if (type === 'metro' || type === 'suburban') return `${finite(counts.tram)}/3 użyteczne linie tramwajowe`;
    return `${finite(counts.tram)}/4 użyteczne linie tramwajowe`;
  }

  renderSummary() {
    if (this.summaryShown) return;
    this.summaryShown = true;
    const { state } = this.game;
    const won = state.status === 'won';
    const goals = campaignObjectives(this.game);
    this.setText('summaryEmblem', won ? '✦' : '↘');
    this.setText('summaryEyebrow', won ? 'Kampania ukończona' : 'Koniec kampanii');
    this.setText('summaryTitle', won ? 'Kraków w dobrych rękach.' : 'Miasto potrzebuje nowego planu.');
    const reasons = { bankruptcy: 'Budżet spadł poniżej dopuszczalnego zadłużenia.', satisfaction: 'Mieszkańcy zbyt długo czekali na sprawny transport.', unhappiness: 'Zadowolenie mieszkańców zbyt długo pozostawało na krytycznym poziomie.' };
    this.setText('summaryDescription', won ? 'Połączyłeś dzielnice i lotnisko, przewiozłeś mieszkańców i zbudowałeś rentowną sieć. Kraków rusza dalej dzięki Tobie.' : `${reasons[state.lossReason] || state.lossReason || 'Nie udało się utrzymać sprawnej i wypłacalnej sieci.'} Spróbuj krótszych tras, wspólnych przystanków i ostrożniejszej rozbudowy.`);
    const sessionMinutes = finite(state.realElapsedSeconds || state.playSeconds) / 60;
    this.setHtml('summaryStats', [
      ['Przewiezieni pasażerowie', formatNumber(state.carried)], ['Zrealizowane cele', `${goals.filter(goal => goal.completed).length}/${goals.length}`],
      ['Zadowolenie', `${formatNumber(state.satisfaction)}%`], ['Budżet końcowy', money(state.budget)],
      ['Aktywne linie', `${state.lines.length}`], ['Czas kampanii', sessionMinutes ? `${decimal(sessionMinutes)} min` : gameClock(state.elapsedMinutes, state.calendar).label]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join(''));
    const dialog = $('#summaryDialog');
    dialog.classList.toggle('won', won);
    if (!dialog.open) dialog.showModal();
  }

  event(message) {
    this.setText('eventMessage', message);
    this.setText('eventTime', gameClock(this.game.state.elapsedMinutes, this.game.state.calendar).label.split('·')[1]?.trim() || '06:00');
  }

  toast(message, kind = '') {
    if (!message) return;
    const stack = $('#toastStack');
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = message;
    stack.append(toast);
    this.later(() => toast.remove(), kind === 'warn' ? 5000 : 3800);
  }

  destroy() {
    this.abortController.abort();
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.closePanel();
    $('#summaryDialog').close();
    $('#toastStack').replaceChildren();
  }
}

