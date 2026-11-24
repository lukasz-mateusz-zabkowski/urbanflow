import { TRANSPORT_TYPES, haversineKm, lineMetrics } from './transport.js?v=10';
import { SIMULATION, gameClock } from './simulation.js?v=10';
import { DISTRICT_PROFILES, inferProfile, latentDemand } from './demand.js?v=10';
import { activeCityEvents, upcomingCityEvents } from './city-events.js?v=10';
import { routeLine, routeLineDetails } from './routing.js?v=14';
import { describePlace } from './place-profiles.js?v=10';
import { landUseDominantUse, landUseLabel } from './land-use.js?v=1';
import { buildManualTramGeometry, routeOnPlayerTramTracks } from './tramway.js?v=1';

const FRAME_MS = 50;
const MAX_VEHICLES_PER_LINE = 12;
const MAX_VEHICLE_MARKERS = 120;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const safeColor = (color, fallback) => /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : fallback;
export const MAP_LAYER_ORDER = Object.freeze({ base: 200, routes: 410, effects: 440, vehicles: 470, stops: 500, prospects: 520, ui: 650 });
export const stopHitStyle = (order = 0, overloaded = false) => ({
  ...(order ? { fillColor: '#efb84c', radius: 8 } : overloaded ? { fillColor: '#c65347', radius: 7 } : { fillColor: '#4a7d63', radius: 5 }),
  weight: 18, opacity: 0.001
});
export function stopVisibleAtZoom(point, zoom, priority = false) {
  if (priority || zoom >= 10.5) return true;
  return zoom >= 10 ? (point.demand || 0) >= 2 : (point.demand || 0) >= 3;
}

// Distance-weighted movement, independent of Leaflet and safe for zero-length segments.
export function routeGeometry(points) {
  const coordinates = points.map(point => [point.lat, point.lng]);
  const cumulativeKm = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulativeKm.push(cumulativeKm.at(-1) + haversineKm(points[index - 1], points[index]));
  }
  return { coordinates, cumulativeKm, totalKm: cumulativeKm.at(-1) || 0 };
}

export function coordinateGeometry(coordinates) {
  return routeGeometry((coordinates || []).map(([lat, lng]) => ({ lat, lng })));
}

export function positionOnRoute(geometry, progress, direction = 1) {
  const { coordinates, cumulativeKm, totalKm } = geometry;
  if (!coordinates.length) return null;
  if (coordinates.length === 1 || totalKm <= 0) return { latlng: coordinates[0], heading: 0 };
  const distance = Math.max(0, Math.min(1, progress)) * totalKm;
  let segment = 1;
  while (segment < coordinates.length - 1 && cumulativeKm[segment] <= distance) segment += 1;
  const a = coordinates[segment - 1]; const b = coordinates[segment];
  const length = cumulativeKm[segment] - cumulativeKm[segment - 1];
  const ratio = length > 0 ? Math.max(0, Math.min(1, (distance - cumulativeKm[segment - 1]) / length)) : 0;
  const latlng = [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
  // Heading is clockwise from north; compensate longitude for Kraków's latitude.
  const heading = Math.atan2((b[1] - a[1]) * Math.cos(latlng[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + (direction < 0 ? 180 : 0);
  return { latlng, heading };
}

export function vehiclePhase(ageMinutes, index, fleet, frequency, travelMinutes, roundTripMinutes = travelMinutes * 2) {
  if (!(fleet > 0) || !(frequency > 0) || !(travelMinutes > 0)) return { progress: 0, direction: 1, stopped: true };
  const headway = 60 / frequency;
  const trip = Math.max(travelMinutes * 2, roundTripMinutes);
  const cycle = Math.max(trip, fleet * headway);
  const age = ageMinutes - index * headway;
  if (age < 0) return { progress: 0, direction: 1, stopped: true };
  const phase = ((age % cycle) + cycle) % cycle;
  const turn = Math.max(0, (trip - travelMinutes * 2) / 2);
  if (phase < travelMinutes) return { progress: phase / travelMinutes, direction: 1, stopped: false };
  if (phase < travelMinutes + turn) return { progress: 1, direction: -1, stopped: true };
  if (phase < travelMinutes * 2 + turn) return { progress: 1 - (phase - travelMinutes - turn) / travelMinutes, direction: -1, stopped: false };
  return { progress: 0, direction: 1, stopped: true };
}

export class GameMap {
  constructor(elementId, onPointClick, onLineClick = null, onSegmentDrop = null, onMapClick = null) {
    this.onPointClick = onPointClick; this.onLineClick = onLineClick; this.onSegmentDrop = onSegmentDrop; this.onMapClick = onMapClick;
    this.onTramControlMove = null; this.onTramControlSelect = null; this.onTramControlDelete = null; this.onTramControlCancel = null;
    this.markers = new Map(); this.lines = new Map(); this.vehicles = new Map(); this.orderMarkers = new Map(); this.tramControlMarkers = new Map();
    this.pointViews = new Map(); this.starterLayers = new Set(); this.effectTimers = new Set();
    this.visible = true; this.intersecting = true; this.frameId = null; this.lastFrame = 0;
    this.map = L.map(elementId, { zoomControl: false, attributionControl: true, preferCanvas: true });
    this.map.on('click', event => this.onMapClick?.(event.latlng));
    this.map.on('zoomend', () => { if (this.currentPoints && this.currentGameState) this.renderPoints(this.currentPoints, this.currentGameState); });
    this.dragMove = event => this.moveSegmentDrag(event.latlng);
    this.documentDragMove = event => {
      if (this.dragState && this.element.contains(event.target)) this.moveSegmentDrag(this.map.mouseEventToLatLng(event));
    };
    this.dragEnd = event => this.finishSegmentDrag(event.latlng || (event.originalEvent?.changedTouches?.[0]
      ? this.map.mouseEventToLatLng(event.originalEvent.changedTouches[0]) : null));
    this.documentDragEnd = event => {
      if (!this.dragState) return;
      const touch = event.changedTouches?.[0];
      const x = touch?.clientX ?? event.clientX, y = touch?.clientY ?? event.clientY;
      const bounds = this.element.getBoundingClientRect();
      const inside = Number.isFinite(x) && Number.isFinite(y) && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      this.finishSegmentDrag(inside ? this.map.mouseEventToLatLng({ clientX: x, clientY: y }) : null);
    };
    this.cancelDragOnEscape = event => {
      if (event.key === 'Escape' && this.dragState) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelSegmentDrag();
      }
    };
    this.map.on('mousemove', this.dragMove).on('mouseup', this.dragEnd).on('touchmove', this.dragMove).on('touchend', this.dragEnd);
    document.addEventListener('keydown', this.cancelDragOnEscape);
    document.addEventListener('mouseup', this.documentDragEnd);
    document.addEventListener('touchend', this.documentDragEnd);
    document.addEventListener('pointermove', this.documentDragMove);
    document.addEventListener('pointerup', this.documentDragEnd);
    this.element = this.map.getContainer(); this.wrapper = this.element.closest('.map-wrap');
    for (const [name, zIndex] of Object.entries(MAP_LAYER_ORDER)) if (name !== 'base') {
      this.map.createPane(name); this.map.getPane(name).style.zIndex = String(zIndex);
    }
    this.map.getPane('routes').style.pointerEvents = 'auto';
    this.map.getPane('effects').style.pointerEvents = 'none';
    this.map.getPane('vehicles').style.pointerEvents = 'none';
    // A few small SVG paths allow feedback without per-frame route redraws.
    this.routeRenderer = L.svg({ padding: 0.3, pane: 'routes' });
    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);
    this.analysisRenderer = L.canvas({ padding: 0.4, pane: 'effects' });
    this.analysisLayer = L.layerGroup().addTo(this.map);
    this.tramTrackLayer = L.layerGroup().addTo(this.map);
    this.tramControlLayer = L.layerGroup().addTo(this.map);
    this.eventLayer = L.layerGroup().addTo(this.map);
    this.onVisibilityChange = () => this.syncAnimation();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(entries => {
        this.intersecting = entries[0]?.isIntersecting ?? true; this.syncAnimation();
      });
      this.observer.observe(this.element);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.invalidate());
      this.resizeObserver.observe(this.element);
    }
  }

  loadCity(city) {
    this.stopAnimation(); this.state = null; this.clockSnapshot = null; this.pointsRendered = false;
    this.city = city; this.pointById = new Map(city.points.map(point => [point.id, point]));
    this.centerCity();
    this.markers.forEach(marker => marker.remove());
    this.orderMarkers.forEach(marker => marker.remove());
    this.lines.forEach(line => { line.segmentHandles?.forEach(handle => handle.remove()); line.group.remove(); });
    this.vehicles.forEach(vehicle => vehicle.marker.remove());
    this.starterLayers.forEach(layer => layer.remove());
    this.effectTimers.forEach(timer => clearTimeout(timer)); this.effectTimers.clear();
    this.markers.clear(); this.pointViews.clear(); this.lines.clear(); this.vehicles.clear(); this.orderMarkers.clear(); this.starterLayers.clear();
    this.tramControlMarkers.clear(); this.tramControlLayer.clearLayers();
    this.analysisLayer.clearLayers(); this.eventLayer.clearLayers(); this.tramTrackLayer.clearLayers(); this.tramTrackSignature = ''; this.eventSignature = '';
    this.preview?.remove(); this.previewAccess?.remove(); this.preview = null; this.previewAccess = null;
    this.previewSignature = ''; this.selectedLineId = null;
  }

  setLineClickHandler(callback) { this.onLineClick = callback; }
  setMapClickHandler(callback) { this.onMapClick = callback; }
  setTramControlHandlers({ move, select, remove, cancel } = {}) {
    this.onTramControlMove = move; this.onTramControlSelect = select; this.onTramControlDelete = remove; this.onTramControlCancel = cancel;
  }
  centerCity() {
    if (!this.city) return;
    const padding = this.element.clientWidth < 500 ? [30, 80] : [70, 70];
    this.map.fitBounds(this.city.points.filter(p => p.type !== 'stop').map(p => [p.lat, p.lng]), { padding, maxZoom: this.city.zoom });
  }
  setVisible(visible) { this.visible = Boolean(visible); this.syncAnimation(); }

  highlightLine(id) {
    if (this.selectedLineId === id) return;
    this.selectedLineId = id;
    this.lines.forEach((record, lineId) => {
      const selected = lineId === id;
      record.route.setStyle({ weight: selected ? 8 : 6 }); record.casing.setStyle({ weight: selected ? 13 : 10 });
      record.route.getElement()?.classList.toggle('selected', selected);
      this.syncSegmentHandles(record, selected);
      if (selected) {
        record.casing.bringToFront(); record.route.bringToFront();
        record.access?.bringToFront();
        record.segmentHandles?.forEach(handle => handle.bringToFront());
      }
    });
  }

  render(points, gameState) {
    if (this.destroyed || !this.city) return;
    const snapshot = [gameState.elapsedMinutes, gameState.paused, gameState.speed, gameState.status].join('|');
    if (snapshot !== this.clockSnapshot) { this.clockSnapshot = snapshot; this.clockAnchor = performance.now(); }
    this.state = gameState;
    this.currentPoints = points; this.currentGameState = gameState;
    const clock = gameClock(gameState.elapsedMinutes, gameState.calendar);
    const night = clock.hour >= 21 || clock.hour < 6;
    const rush = (clock.hour >= 7 && clock.hour < 10) || (clock.hour >= 16 && clock.hour < 19);
    this.wrapper?.classList.toggle('is-night', night); this.wrapper?.classList.toggle('is-rush-hour', rush);
    if (this.wrapper) { this.wrapper.dataset.timePeriod = night ? 'night' : rush ? 'rush' : 'day'; this.wrapper.dataset.analytics = gameState.analyticsMode || 'off'; }
    this.renderPoints(points, gameState); this.renderLines(gameState, clock.minuteOfDay); this.renderTramInfrastructure(gameState.tramInfrastructure);
    this.renderAnalytics(points, gameState, clock.minuteOfDay);
    this.renderEvents(gameState); this.renderPreview(gameState);
    this.drawVehicles(performance.now()); this.syncAnimation();
  }

  renderPoints(points, gameState) {
    const selection = gameState.selectedNodes || [];
    const served = new Set(gameState.lines.flatMap(line => line.stops));
    const editing = new Set(gameState.lines.find(line => line.id === gameState.editingLineId)?.stops || []);
    const renderedPoints = points.filter(point => point.type !== 'stop' || stopVisibleAtZoom(point, this.map.getZoom(),
      served.has(point.id) || editing.has(point.id) || selection.includes(point.id)));
    const visible = new Set(renderedPoints.map(point => point.id));
    this.markers.forEach((marker, id) => { if (!visible.has(id)) { marker.remove(); this.markers.delete(id); this.pointViews.delete(id); } });
    this.orderMarkers.forEach((marker, id) => { if (!selection.includes(id)) { marker.remove(); this.orderMarkers.delete(id); } });
    for (const point of renderedPoints) {
      const waiting = Math.round(gameState.passengers?.[point.id]?.waiting || 0);
      const order = selection.indexOf(point.id) + 1;
      const overloaded = waiting > (gameState.stopCapacity || 48);
      const profile = DISTRICT_PROFILES[inferProfile(point)]?.label || 'lokalny';
      const label = `${point.name}, profil ${profile}, oczekuje ${waiting}${order ? `, przystanek ${order} planowanej linii` : ''}`;
      if (point.type === 'stop') {
        this.renderStop(point, label, order, overloaded);
        if (order) this.renderStopOrder(point, order);
        continue;
      }
      if (!this.markers.has(point.id)) {
        const offset = point.markerOffsetY || 0;
        const leader = offset ? `<i class="node-leader" style="top:${22 - Math.max(0, offset)}px;height:${Math.abs(offset)}px"></i>` : '';
        const html = `<div class="node-hit" style="width:44px;height:44px;display:grid;place-items:center">${leader}<div class="map-node ${escapeHtml(point.type)}"><span class="node-label">${escapeHtml(point.name)}</span><b class="node-count"></b><i class="node-order" aria-hidden="true" hidden></i></div></div>`;
        const marker = L.marker([point.lat, point.lng], {
          keyboard: true, title: label, riseOnHover: true, pane: 'stops',
          icon: L.divIcon({ className: 'node-icon', html, iconSize: [44, 44], iconAnchor: [22, 22 - offset] })
        }).addTo(this.map).on('click', () => this.onPointClick?.(point.id));
        const details = describePlace(point, this.city, this.state?.lines || [], 720);
        marker.bindTooltip(`<strong>${escapeHtml(details.name)}</strong><br>${escapeHtml(details.type)}<br>${escapeHtml(details.description)}`, { direction: 'top', offset: [0, -12], sticky: true, className: 'place-tooltip' });
        this.markers.set(point.id, marker);
        const element = marker.getElement();
        this.pointViews.set(point.id, { element, dot: element.querySelector('.map-node'), count: element.querySelector('.node-count'), order: element.querySelector('.node-order'), label: '' });
      }
      const view = this.pointViews.get(point.id);
      if (view.label !== label) {
        view.element.setAttribute('aria-label', label); view.element.title = label; view.label = label;
        view.count.textContent = waiting || ''; view.order.textContent = order || ''; view.order.hidden = !order;
      }
      view.dot.classList.toggle('selected', Boolean(order)); view.dot.classList.toggle('overloaded', overloaded);
    }
    this.pointsRendered = true;
  }

  renderStopOrder(point, order) {
    let marker = this.orderMarkers.get(point.id);
    const html = `<span class="route-order-badge" aria-hidden="true">${order}</span>`;
    if (!marker) {
      marker = L.marker([point.lat, point.lng], { pane: 'ui', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'route-order-icon', html, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(this.map);
      this.orderMarkers.set(point.id, marker);
    } else marker.setIcon(L.divIcon({ className: 'route-order-icon', html, iconSize: [26, 26], iconAnchor: [13, 13] }));
  }

  // Setki przystanków rysujemy lekko na canvasie, bez elementów DOM.
  renderStop(point, label, order, overloaded) {
    const base = stopHitStyle(order, overloaded);
    let marker = this.markers.get(point.id);
    if (!marker) {
      // SVG keeps empty areas of the prospect pane transparent to pointer
      // input. A full-size canvas above DOM markers would swallow their clicks.
      this.stopRenderer ||= L.svg({ padding: 0.4, pane: 'prospects' });
      // A transparent stroke enlarges the canvas hit area while the filled
      // circle keeps its compact visual radius.
      marker = L.circleMarker([point.lat, point.lng], { renderer: this.stopRenderer, pane: 'prospects', color: '#fffefa',
        fillOpacity: 1, bubblingMouseEvents: false, ...base })
        .addTo(this.map).on('click', () => this.onPointClick?.(point.id));
      marker.bindTooltip(escapeHtml(label), { direction: 'top', offset: [0, -6] });
      this.markers.set(point.id, marker); marker._label = label; marker._key = `${order}|${overloaded}`;
      if (this.pointsRendered) { // nowo odkryty przystanek: krótki błysk
        marker.setStyle({ radius: 12, fillColor: '#efb84c' });
        const timer = setTimeout(() => { this.effectTimers.delete(timer); if (!this.destroyed) marker.setStyle(marker._base || base); }, 1600);
        this.effectTimers.add(timer);
      }
    }
    const element = marker.getElement();
    if (element) {
      element.dataset.stopId = point.id;
      element.setAttribute('aria-label', label);
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      if (!marker._keyboardBound) {
        element.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault(); this.onPointClick?.(point.id);
        });
        marker._keyboardBound = true;
      }
    }
    marker._base = base;
    if (marker._label !== label) { marker._label = label; marker.setTooltipContent(escapeHtml(label)); }
    const key = `${order}|${overloaded}`;
    if (marker._key !== key) { marker._key = key; marker.setStyle(base); }
  }

  renderLines(gameState, minuteOfDay) {
    const ids = new Set(gameState.lines.map(line => line.id));
    this.lines.forEach((record, id) => { if (!ids.has(id)) { record.segmentHandles?.forEach(handle => handle.remove()); record.group.remove(); this.lines.delete(id); } });
    let markerBudget = MAX_VEHICLE_MARKERS; const vehicleIds = new Set();
    for (const line of gameState.lines) {
      const transport = TRANSPORT_TYPES[line.type]; if (!transport) continue;
      const signature = `${line.stops.join('|')}|${(line.routeGeometry || []).map(point => point.join(',')).join(';')}|${line.tramBuildMode || ''}`;
      const color = safeColor(line.color, transport.color);
      const geometry = this.lines.get(line.id)?.signature === signature ? this.lines.get(line.id).geometry
        : coordinateGeometry(line.routeGeometry?.length ? line.routeGeometry : routeLine(line.stops, line.type, this.city));
      const display = this.lines.get(line.id)?.signature === signature ? this.lines.get(line.id).display : (() => {
        if (line.type === 'tram' || line.routingUnavailable) return { roads: [geometry.coordinates], access: [] };
        const details = routeLineDetails(line.stops, line.type, this.city);
        const roads = [];
        const connectors = new Map((details.stopConnectors || []).map(item => [item.stopId, item.roadCoordinates]));
        if (details.valid) details.segments.forEach((segment, index) => {
          const path = segment.roadCoordinates?.length >= 2 ? segment.roadCoordinates : segment.coordinates;
          if (path?.length >= 2) roads.push(path);
          const connector = connectors.get(line.stops[index + 1]);
          if (connector?.length >= 2) roads.push(connector);
        });
        const fallback = roads.length ? roads : [geometry.coordinates];
        const access = details.segments.flatMap(segment => segment.accessSegments || [])
          .filter(path => path.length >= 2 && (path[0][0] !== path.at(-1)[0] || path[0][1] !== path.at(-1)[1]));
        return { roads: fallback, access };
      })();
      let record = this.lines.get(line.id);
      if (!record) {
        const casing = L.polyline(display.roads, { renderer: this.routeRenderer, color: '#10201d', weight: 10, opacity: 0.78, lineCap: 'round', interactive: false });
        const route = L.polyline(display.roads, { renderer: this.routeRenderer, color, weight: 6, opacity: 0.96, lineCap: 'round', className: 'transport-line route-road-geometry route-born' });
        const access = L.polyline(display.access, { renderer: this.routeRenderer, pane: 'routes', color: '#f0a744', weight: 5,
          opacity: 0.98, dashArray: '4 5', interactive: false, className: 'route-access-link', lineCap: 'round' });
        const group = L.layerGroup([casing, route, access]).addTo(this.map);
        route.getElement()?.setAttribute('data-line-id', line.id);
        access.getElement()?.setAttribute('data-line-id', line.id);
        route.on('click', event => { L.DomEvent.stopPropagation(event); this.onLineClick?.(line.id); });
        record = { group, casing, route, access, signature, geometry, display, color }; this.lines.set(line.id, record);
        const effect = setTimeout(() => { route.getElement()?.classList.remove('route-born'); this.effectTimers.delete(effect); }, 900);
        this.effectTimers.add(effect);
      } else if (record.signature !== signature) {
        record.casing.setLatLngs(display.roads); record.route.setLatLngs(display.roads); record.access.setLatLngs(display.access);
        record.geometry = geometry; record.display = display; record.signature = signature;
      }
      const selected = this.selectedLineId === line.id;
      record.line = line;
      this.syncSegmentHandles(record, selected);
      const overloaded = (line.stats?.load || 0) >= 0.95 || (line.stats?.waiting || 0) > Math.max(48, transport.capacity);
      const profitColor = finiteColor(line.stats?.balancePerHour || 0);
      const displayColor = gameState.analyticsMode === 'profit' ? profitColor : color;
      record.route.setStyle({ color: displayColor, weight: selected ? 8 : 6, opacity: gameState.analyticsMode === 'load' ? 0.3 : 0.96, dashArray: overloaded ? '8 5' : null });
      record.casing.setStyle({ color: overloaded ? '#d94d42' : '#10201d', weight: selected ? 13 : 10, opacity: overloaded ? 0.95 : 0.78 });
      record.route.getElement()?.classList.toggle('overloaded', overloaded); record.route.getElement()?.classList.toggle('selected', selected);
      record.route.getElement()?.classList.toggle('routing-unavailable', Boolean(line.routingUnavailable));
      const title = line.routingUnavailable ? `${line.name || transport.name} · TRASA NIEDOSTĘPNA · ${line.routingUnavailable}`
        : `${line.name || transport.name} · ${Math.round((line.stats?.load || 0) * 100)}% obciążenia · ${Math.round(line.stats?.waiting || 0)} oczekuje`;
      if (record.title !== title) {
        if (record.route.getTooltip()) record.route.setTooltipContent(escapeHtml(title));
        else record.route.bindTooltip(escapeHtml(title), { sticky: true, direction: 'top' });
        record.title = title;
      }
      record.color = color; record.metrics = lineMetrics(line, this.city, minuteOfDay,
        { events: gameState.cityEvents || [], elapsedMinutes: gameState.elapsedMinutes, serviceDayType: gameClock(gameState.elapsedMinutes, gameState.calendar).dayType });
      const frequency = record.metrics.effectiveFrequency || 0; const fleet = record.metrics.vehicles;
      record.activeFleet = frequency > 0 ? Math.min(fleet, Math.max(1, Math.ceil(record.metrics.roundTripMinutes * frequency / 60 - 0.000001))) : 0;
      const count = line.routingUnavailable ? 0 : Math.min(record.activeFleet, MAX_VEHICLES_PER_LINE, markerBudget); markerBudget -= count;
      for (let index = 0; index < count; index += 1) {
        const key = `${line.id}:${index}`; vehicleIds.add(key);
        let vehicle = this.vehicles.get(key); const iconSignature = `${line.type}|${color}`;
        if (!vehicle) {
          const marker = L.marker(geometry.coordinates[0] || this.city.center, { pane: 'vehicles', interactive: false, keyboard: false, icon: this.vehicleIcon(transport, color) }).addTo(this.map);
          vehicle = { marker, iconSignature }; this.vehicles.set(key, vehicle);
        } else if (vehicle.iconSignature !== iconSignature) {
          vehicle.marker.setIcon(this.vehicleIcon(transport, color)); vehicle.iconSignature = iconSignature;
        }
        vehicle.heading = vehicle.marker.getElement()?.querySelector('.vehicle-heading');
        vehicle.record = record; vehicle.index = Math.floor(index * record.activeFleet / count);
      }
    }
    this.vehicles.forEach((vehicle, id) => { if (!vehicleIds.has(id)) { vehicle.marker.remove(); this.vehicles.delete(id); } });
  }

  syncSegmentHandles(record, selected) {
    const signature = `${selected ? record.signature : ''}`;
    if (record.handleSignature === signature) return;
    record.segmentHandles?.forEach(handle => handle.remove());
    record.segmentHandles = [];
    record.handleSignature = signature;
    if (!selected) return;
    const details = routeLineDetails(record.line.stops, record.line.type, this.city);
    details.segments.forEach((segment, index) => {
      if (segment.coordinates.length < 2) return;
      this.handleRenderer ||= L.svg({ padding: 0.3, pane: 'ui' });
      const handle = L.polyline(segment.coordinates, { renderer: this.handleRenderer, pane: 'ui', color: '#ffd166', weight: 22,
        opacity: 0.14, interactive: true, bubblingMouseEvents: false, className: 'route-segment-hit', lineCap: 'round' }).addTo(this.map);
      const element = handle.getElement();
      if (element) {
        element.dataset.segmentIndex = String(index); element.dataset.lineId = record.line.id;
        element.style.pointerEvents = 'stroke'; element.style.cursor = 'grab';
        element.addEventListener('pointerdown', event => {
          event.preventDefault(); event.stopPropagation();
          this.beginSegmentDrag(record.line.id, index, this.map.mouseEventToLatLng(event));
        });
      }
      handle.on('mousedown touchstart', event => {
        L.DomEvent.stopPropagation(event);
        event.originalEvent?.preventDefault?.();
        this.beginSegmentDrag(record.line.id, index, event.latlng);
      });
      record.segmentHandles.push(handle);
    });
  }

  beginSegmentDrag(lineId, segmentIndex, latlng) {
    if (this.dragState) return;
    const line = this.currentGameState?.lines.find(item => item.id === lineId);
    if (!line || this.selectedLineId !== lineId || segmentIndex >= line.stops.length - 1) return;
    const points = line.stops.map(id => this.pointById.get(id));
    if (!points[segmentIndex] || !points[segmentIndex + 1]) return;
    this.dragState = { lineId, segmentIndex, points, wasDragging: this.map.dragging.enabled() };
    this.map.dragging.disable();
    this.element.classList.add('is-route-editing');
    this.dragPreview = L.polyline([[points[segmentIndex].lat, points[segmentIndex].lng], [latlng.lat, latlng.lng],
      [points[segmentIndex + 1].lat, points[segmentIndex + 1].lng]], { renderer: this.routeRenderer, pane: 'routes', color: '#efb84c', weight: 8,
      dashArray: '7 6', interactive: false, lineCap: 'round' }).addTo(this.map);
    this.dragTargets ||= L.layerGroup().addTo(this.map);
    this.dragTargets.clearLayers();
    for (const point of this.currentPoints || []) if (point.type === 'stop' && !line.stops.includes(point.id)) {
      const target = L.circleMarker([point.lat, point.lng], { renderer: this.stopRenderer || this.routeRenderer, pane: 'prospects', radius: 11, color: '#fff', weight: 3,
        fillColor: '#efb84c', fillOpacity: 0.85, interactive: false, className: 'route-drag-target' }).addTo(this.dragTargets);
      const element = target.getElement();
      if (element) { element.dataset.stopId = point.id; element.setAttribute('role', 'img'); element.setAttribute('aria-label', `Możliwy przystanek: ${point.name}`); }
    }
  }

  moveSegmentDrag(latlng) {
    if (!this.dragState || !latlng || !this.dragPreview) return;
    const { segmentIndex, points } = this.dragState;
    this.dragPreview.setLatLngs([[points[segmentIndex].lat, points[segmentIndex].lng], [latlng.lat, latlng.lng],
      [points[segmentIndex + 1].lat, points[segmentIndex + 1].lng]]);
  }

  finishSegmentDrag(latlng) {
    if (!this.dragState) return;
    const { lineId, segmentIndex } = this.dragState;
    const line = this.currentGameState?.lines.find(item => item.id === lineId);
    let target = null, nearest = 0.25;
    if (latlng) for (const point of this.currentPoints || []) if (point.type === 'stop' && !line?.stops.includes(point.id)) {
      const distance = haversineKm(latlng, point);
      if (distance < nearest) { target = point; nearest = distance; }
    }
    this.clearSegmentDrag();
    if (target) this.onSegmentDrop?.(lineId, segmentIndex, target.id);
  }

  cancelSegmentDrag() { if (this.dragState) this.clearSegmentDrag(); }
  clearSegmentDrag() {
    const state = this.dragState;
    this.dragState = null;
    this.dragPreview?.remove(); this.dragPreview = null;
    this.dragTargets?.clearLayers();
    this.element.classList.remove('is-route-editing');
    if (state?.wasDragging) this.map.dragging.enable();
  }

  renderAnalytics(points, gameState, minuteOfDay) {
    this.analysisLayer.clearLayers();
    const mode = gameState.analyticsMode || 'off';
    if (mode === 'off' || mode === 'profit') return;
    if (mode === 'investments') {
      const zones = gameState.cityEvolution?.districts || {};
      const byArea = new Map();
      for (const project of gameState.investments?.projects || []) byArea.set(project.districtId, project);
      for (const project of [...(gameState.investments?.history || [])].reverse()) if (project.status === 'completed' && !byArea.has(project.districtId)) byArea.set(project.districtId, project);
      for (const [districtId, project] of byArea) {
        const point = points.find(item => item.id === districtId); const zone = zones[districtId];
        if (!point || !zone) continue;
        const done = project.status === 'completed';
        const progress = project.status === 'in-progress'
          ? Math.min(100, Math.max(0, Math.round((gameState.elapsedMinutes - project.approvedAt) / (project.completesAt - project.approvedAt) * 100)))
          : done ? 100 : 0;
        const color = done ? '#31845a' : '#d49434';
        const marker = L.circleMarker([point.lat, point.lng], { renderer: this.analysisRenderer, radius: 12,
          color: '#fffefa', weight: 3, fillColor: color, fillOpacity: 0.45 + progress / 200, interactive: true, keyboard: true }).addTo(this.analysisLayer);
        const title = ({ housing: 'Rozwój mieszkaniowy', economic: 'Rozwój gospodarczy', hub: 'Modernizacja węzła' })[project.type] || 'Inwestycja';
        const content = `<strong>${escapeHtml(zone.name)}</strong><br>${title}<br>${done ? 'Ukończono' : project.status === 'planned' ? 'Zaplanowano' : `Realizacja ${progress}%`}`;
        marker.bindTooltip(content, { direction: 'top', sticky: true, className: 'place-tooltip' });
        marker.bindPopup(content);
        marker.on('click', () => window.dispatchEvent(new CustomEvent('urbanflow:select-investment-area', { detail: { id: districtId } })));
      }
      return;
    }
    if (mode === 'cityEvolution') {
      const zones = gameState.cityEvolution?.districts || {};
      // This layer is intentionally small (the modeled areas only) and must remain individually clickable/accessibile.
      if (!this.map.getPane('living-city')) {
        const pane = this.map.createPane('living-city');
        pane.style.zIndex = String(MAP_LAYER_ORDER.prospects + 1);
        pane.style.pointerEvents = 'auto';
      }
      this.livingCityRenderer ||= L.svg({ padding: 0.4, pane: 'living-city' });
      for (const point of points) {
        const zone = zones[point.id];
        if (!zone || point.type === 'stop') continue;
        const score = Math.max(zone.residentialAttractiveness, zone.economicAttractiveness);
        const fillColor = score < 40 ? '#bc5144' : score < 68 ? '#d2a43e' : '#378760';
        const trendColor = zone.lastChange?.residents > 0 ? '#378760' : zone.lastChange?.residents < 0 ? '#bc5144' : '#718077';
        const radius = 8 + Math.min(7, (zone.growthPotential || 0) * 0.07);
        const marker = L.circleMarker([point.lat, point.lng], { renderer: this.livingCityRenderer, radius, color: trendColor, fillColor,
          fillOpacity: 0.25 + Math.min(0.35, (zone.growthPotential || 0) * 0.0035), weight: 3, interactive: true, keyboard: true,
          bubblingMouseEvents: false, className: 'living-city-marker' })
          .addTo(this.analysisLayer);
        marker.bindTooltip(`<strong>${escapeHtml(zone.name)}</strong><br>Atrakcyjność ${Math.round(score)}/100 · potencjał ${zone.growthPotential}/100<br>Dostępność ${zone.transportAccess}% · jakość ${zone.transportSatisfaction}/100<br>Mieszkańcy ${Math.round(zone.residents)} (${zone.lastChange?.residents > 0 ? '+' : ''}${Math.round(zone.lastChange?.residents || 0)})<br>Miejsca pracy ${Math.round(zone.jobs)} (${zone.lastChange?.jobs > 0 ? '+' : ''}${Math.round(zone.lastChange?.jobs || 0)})`, { direction: 'top', sticky: true, className: 'place-tooltip' });
        marker.bindPopup(`<strong>${escapeHtml(zone.name)}</strong><br>Atrakcyjność: ${Math.round(score)}/100<br>Populacja modelu: ${Math.round(zone.residents)}<br>Miejsca pracy modelu: ${Math.round(zone.jobs)}<br>Dostępność: ${zone.transportAccess}% · jakość ${zone.transportSatisfaction}/100`);
        const element = marker.getElement();
        if (element) {
          element.setAttribute('aria-label', `${zone.name}, rozwój modelowany`);
          element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0');
          element.dataset.cityAreaId = point.id;
          const selectArea = () => window.dispatchEvent(new CustomEvent('urbanflow:select-city-evolution', { detail: { id: point.id } }));
          marker.on('click', selectArea);
          element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); selectArea();
          });
        }
      }
      return;
    }
    if (mode === 'landUse') {
      const zones = gameState.cityEvolution?.districts || {};
      const colors = { residential: '#4b8b62', retail: '#d18a36', office: '#7161a8', industrial: '#68737c', public: '#318f9d', green: '#75a64b', reserve: '#a7a99b' };
      const radii = { low: 9, medium: 13, high: 17 };
      for (const point of points) {
        const zone = zones[point.id]; const landUse = zone?.landUse;
        if (!landUse || point.type === 'stop') continue;
        const dominant = landUseDominantUse(landUse); const color = colors[dominant] || '#777';
        const marker = L.circleMarker([point.lat, point.lng], { renderer: this.analysisRenderer,
          radius: radii[landUse.intensity] || 9, color, fillColor: color, fillOpacity: 0.42,
          weight: 2, interactive: true, keyboard: true }).addTo(this.analysisLayer);
        const content = `<strong>${escapeHtml(zone.name)}</strong><br>${escapeHtml(landUseLabel(dominant))} · intensywność ${escapeHtml(landUse.intensity)}<br>Rezerwa ${landUse.shares.reserve}% · rozwój ${Math.round(landUse.developmentProgress)}%<br>Dostęp transportu ${zone.transportAccess}% · zadowolenie ${zone.transportSatisfaction}/100`;
        marker.bindTooltip(content, { direction: 'top', sticky: true, className: 'place-tooltip' });
        marker.bindPopup(content);
        marker.on('click', () => window.dispatchEvent(new CustomEvent('urbanflow:select-land-use', { detail: { id: point.id } })));
      }
      return;
    }
    if (mode === 'demand' || mode === 'queues' || mode === 'access' || mode === 'travel') {
      const analysisPoints = mode === 'demand' ? this.city.points : points;
      const dayType = gameClock(gameState.elapsedMinutes, gameState.calendar).dayType;
      const forecast = new Map(latentDemand(analysisPoints, gameState.lines, minuteOfDay, gameState.cityEvents, gameState.elapsedMinutes, dayType, gameState.cityEvolution).map(item => [item.pointId, item]));
      const served = new Set(gameState.lines.flatMap(line => line.stops));
      const values = analysisPoints.map(point => mode === 'demand'
        ? Math.max(gameState.diagnostics?.generatedByPoint?.[point.id] || 0, forecast.get(point.id)?.potential * 10 || 0)
        : mode === 'access' ? (served.has(point.id) ? 1 : 0.18)
          : mode === 'travel' ? (served.has(point.id) ? Math.max(5, gameState.passengers?.[point.id]?.waiting || 5) : 70)
        : gameState.passengers?.[point.id]?.waiting || 0);
      const maximum = Math.max(1, ...values);
      analysisPoints.forEach((point, index) => {
        const value = values[index]; if (value <= 0) return;
        const ratio = Math.min(1, value / maximum);
        const isServed = served.has(point.id);
        const color = mode === 'demand' ? (isServed ? '#8f3fb0' : '#d36e33') : mode === 'access' ? (isServed ? '#2c9664' : '#c84b42')
          : ratio > 0.65 ? '#c84b42' : ratio > 0.3 ? '#e48b35' : '#efc95d';
        L.circleMarker([point.lat, point.lng], { renderer: this.analysisRenderer, interactive: false,
          radius: 5 + Math.sqrt(ratio) * 20, color, fillColor: color, fillOpacity: 0.18 + ratio * 0.34, opacity: 0.65, weight: isServed ? 1 : 2,
          dashArray: isServed ? null : '3 4' })
          .addTo(this.analysisLayer);
      });
      return;
    }
    if (['load', 'flow', 'overload'].includes(mode)) for (const line of gameState.lines) {
      const pointsOnLine = line.stops.map(id => this.pointById.get(id)).filter(Boolean);
      pointsOnLine.slice(1).forEach((point, index) => {
        const load = Math.max(0, Math.min(1.5, line.stats?.segmentLoad?.[index] || 0));
        const color = mode === 'overload' ? (load >= 0.95 ? '#c43f38' : '#aeb9ad')
          : load >= 0.95 ? '#c43f38' : load >= 0.65 ? '#e48632' : '#43a36f';
        L.polyline([[pointsOnLine[index].lat, pointsOnLine[index].lng], [point.lat, point.lng]], {
          renderer: this.routeRenderer, interactive: false, color, opacity: mode === 'overload' && load < 0.95 ? 0.24 : 0.88,
          weight: mode === 'flow' ? 4 + Math.min(10, load * 8) : 10, lineCap: 'round'
        }).addTo(this.analysisLayer);
      });
    }
    if (mode === 'unmet') {
      const failures = gameState.diagnostics?.failureByPoint || {};
      const values = this.city.points.map(point => ({ point, value: Object.values(failures[point.id] || {}).reduce((sum, count) => sum + count, 0) }));
      const maximum = Math.max(1, ...values.map(item => item.value));
      for (const { point, value } of values) if (value > 0) {
        const ratio = value / maximum;
        L.circleMarker([point.lat, point.lng], { renderer: this.analysisRenderer, interactive: false, radius: 7 + ratio * 13,
          color: '#a83232', fillColor: '#e25245', fillOpacity: 0.24 + ratio * 0.45, weight: 2 }).addTo(this.analysisLayer);
      }
    }
  }

  renderEvents(gameState) {
    const active = activeCityEvents(gameState.cityEvents, gameState.elapsedMinutes);
    const upcoming = upcomingCityEvents(gameState.cityEvents, gameState.elapsedMinutes);
    const events = [...active, ...upcoming];
    const signature = events.map(event => `${event.id}:${event.startMinute}:${event.endMinute}`).join('|');
    if (signature === this.eventSignature) return;
    this.eventSignature = signature; this.eventLayer.clearLayers();
    for (const event of events) {
      const point = event.locationId ? this.pointById.get(event.locationId) : { lat: this.city.center[0], lng: this.city.center[1], name: 'całe miasto' };
      if (!point) continue;
      const planned = event.startMinute > gameState.elapsedMinutes;
      const circle = L.circleMarker([point.lat, point.lng], { renderer: this.analysisRenderer, radius: planned ? 14 : 18, color: planned ? '#9a6c23' : '#b63d36',
        fillColor: planned ? '#efc95d' : '#ed6a55', fillOpacity: 0.22, opacity: 0.9, weight: 3, dashArray: planned ? '5 4' : null, className: 'event-marker' }).addTo(this.eventLayer);
      circle.bindTooltip(`<strong>${planned ? 'Zapowiedź: ' : ''}${escapeHtml(event.title)}</strong><br>${escapeHtml(event.message)}<br>${planned ? `Start ${escapeHtml(gameClock(event.startMinute, this.state?.calendar).label)}` : `Do ${escapeHtml(gameClock(event.endMinute, this.state?.calendar).label)}`}`);
    }
  }

  vehicleIcon(transport, color) {
    return L.divIcon({ className: 'vehicle-icon', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="map-vehicle ${transport.id}" style="--vehicle-color:${color}"><i class="vehicle-heading" aria-hidden="true"></i><b>${escapeHtml(transport.short)}</b></div>` });
  }

  renderPreview(gameState) {
    const stops = gameState.selectedNodes || []; const color = TRANSPORT_TYPES[gameState.selectedType]?.color || '#ffffff';
    const manual = gameState.selectedType === 'tram' && gameState.tramBuildMode === 'manual';
    const controlSignature = JSON.stringify(gameState.tramControlPoints || []);
    const signature = `${stops.join('|')}:${color}:${gameState.tramBuildMode}:${gameState.editingLineId || ''}:${controlSignature}`;
    if (signature === this.previewSignature) { this.renderTramControlPoints(gameState); return; }
    this.previewSignature = signature;
    const routeType = manual ? 'metro' : gameState.selectedType === 'tram' && gameState.tramBuildMode === 'street' ? 'bus' : gameState.selectedType;
    let details = routeLineDetails(stops, routeType, this.city);
    if (gameState.selectedType === 'tram' && gameState.tramBuildMode === 'existing') {
      const owned = routeOnPlayerTramTracks(gameState.tramInfrastructure, stops, this.city);
      if (owned.valid) details = owned;
    }
    const segments = details.segments || [];
    const manualPoints = stops.map(id => this.pointById.get(id)).filter(Boolean).map(point => [point.lat, point.lng]);
    const manualRoute = manual && manualPoints.length >= 2
      ? buildManualTramGeometry(manualPoints, [manualPoints[0], ...(gameState.tramControlPoints || []), manualPoints.at(-1)]) : null;
    const manualCoordinates = manualRoute?.valid ? manualRoute.coordinates : [];
    const roads = manual ? (manualCoordinates.length >= 2 ? [manualCoordinates] : []) : [];
    if (!manual) {
      const connectors = new Map((details.stopConnectors || []).map(item => [item.stopId, item.roadCoordinates]));
      segments.forEach((segment, index) => {
        const path = segment.roadCoordinates?.length >= 2 ? segment.roadCoordinates : segment.coordinates;
        if (path?.length >= 2) roads.push(path);
        const connector = connectors.get(stops[index + 1]);
        if (connector?.length >= 2) roads.push(connector);
      });
    }
    const coordinates = roads.length ? roads : details.coordinates.length >= 2 ? [details.coordinates] : [];
    const access = segments.flatMap(segment => segment.accessSegments || [])
      .filter(path => path.length >= 2 && (path[0][0] !== path.at(-1)[0] || path[0][1] !== path.at(-1)[1]));
    if (!coordinates.length) {
      this.preview?.remove(); this.previewAccess?.remove(); this.preview = null; this.previewAccess = null;
      this.renderTramControlPoints(gameState); return;
    }
    const displayColor = details.valid && (!manual || manualRoute?.valid) ? color : '#c43f38';
    if (!this.preview) this.preview = L.polyline(coordinates, { renderer: this.routeRenderer, color: displayColor, weight: 8,
      opacity: 0.9, dashArray: '5 11', interactive: false, className: 'route-preview route-preview-road', lineCap: 'round' }).addTo(this.map);
    else this.preview.setLatLngs(coordinates).setStyle({ color: displayColor });
    if (access.length) {
      if (!this.previewAccess) this.previewAccess = L.polyline(access, { renderer: this.routeRenderer, pane: 'routes', color: '#f0a744',
        weight: 5, opacity: 0.98, dashArray: '3 5', interactive: false, className: 'route-preview-access', lineCap: 'round' }).addTo(this.map);
      else this.previewAccess.setLatLngs(access);
    } else { this.previewAccess?.remove(); this.previewAccess = null; }
    this.renderTramControlPoints(gameState);
  }

  renderTramControlPoints(gameState) {
    const controls = gameState.selectedType === 'tram' && gameState.tramBuildMode === 'manual' ? gameState.tramControlPoints || [] : [];
    for (const [index, marker] of this.tramControlMarkers) if (index >= controls.length) { marker.remove(); this.tramControlMarkers.delete(index); }
    controls.forEach((point, index) => {
      const selected = gameState.tramSelectedControlIndex === index;
      let marker = this.tramControlMarkers.get(index);
      if (!marker) {
        marker = L.marker(point, { pane: 'ui', draggable: true, keyboard: true, autoPan: false, bubblingMouseEvents: false,
          title: `Punkt kontrolny ${index + 1}. Przeciągnij, aby zmienić przebieg. Enter wybiera, Delete usuwa.`,
          icon: L.divIcon({ className: 'tram-control-marker', iconSize: [34, 34], iconAnchor: [17, 17],
            html: `<span class="tram-control-handle" aria-hidden="true">${index + 1}</span>` }) }).addTo(this.tramControlLayer);
        marker.on('click', event => { L.DomEvent.stopPropagation(event); this.onTramControlSelect?.(index); });
        marker.on('dragstart', () => { this.tramControlDrag = { marker, index, original: marker.getLatLng() }; this.map.dragging.disable(); });
        marker.on('dragend', event => { this.map.dragging.enable(); this.tramControlDrag = null; this.onTramControlMove?.(index, event.target.getLatLng()); });
        marker.getElement()?.addEventListener('keydown', event => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault(); event.stopPropagation(); this.onTramControlDelete?.(index);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); event.stopPropagation(); this.onTramControlSelect?.(index);
          } else if (event.key === 'Escape' && this.tramControlDrag) {
            event.preventDefault(); event.stopPropagation();
            this.tramControlDrag.marker.setLatLng(this.tramControlDrag.original); this.map.dragging.enable(); this.tramControlDrag = null;
            this.onTramControlCancel?.();
          }
        });
        this.tramControlMarkers.set(index, marker);
      } else marker.setLatLng(point);
      marker.getElement()?.querySelector('.tram-control-handle')?.classList.toggle('selected', selected);
      marker.options.title = `Punkt kontrolny ${index + 1}${selected ? ', wybrany' : ''}. Przeciągnij, aby zmienić przebieg.`;
      marker.getElement()?.setAttribute('aria-label', marker.options.title);
      marker.getElement()?.setAttribute('title', marker.options.title);
    });
  }

  renderTramInfrastructure(infrastructure) {
    const segments = infrastructure?.segments || [];
    const signature = segments.map(segment => segment.id).join('|');
    if (signature === this.tramTrackSignature) return;
    this.tramTrackSignature = signature;
    this.tramTrackLayer.clearLayers();
    for (const segment of segments) L.polyline([segment.from, segment.to], { renderer: this.routeRenderer, pane: 'routes', color: '#b44b9c', weight: 5,
      opacity: 0.68, dashArray: segment.mode === 'manual' ? '7 4' : null, interactive: false, className: 'built-tram-track' }).addTo(this.tramTrackLayer);
  }

  shouldAnimate() {
    return !this.destroyed && this.visible && this.intersecting && document.visibilityState !== 'hidden' && this.state && !this.state.paused && (!this.state.status || this.state.status === 'playing') && this.vehicles.size > 0;
  }

  drawVehicles(now) {
    if (!this.state) return;
    const extraMinutes = this.shouldAnimate() ? Math.min(SIMULATION.realTickMs, Math.max(0, now - this.clockAnchor)) / SIMULATION.realTickMs * SIMULATION.minutesPerTick * (this.state.speed || 1) : 0;
    this.vehicles.forEach(vehicle => {
      const { line, metrics, geometry, activeFleet } = vehicle.record;
      const phase = vehiclePhase((line.ageMinutes ?? this.state.elapsedMinutes) + extraMinutes, vehicle.index, activeFleet, metrics.effectiveFrequency, metrics.travelMinutes, metrics.roundTripMinutes);
      const position = positionOnRoute(geometry, phase.progress, phase.direction); if (!position) return;
      vehicle.marker.setLatLng(position.latlng); vehicle.heading?.style.setProperty('--heading', `${position.heading}deg`);
    });
  }

  syncAnimation() {
    if (!this.shouldAnimate()) { this.stopAnimation(); return; }
    if (this.frameId !== null) return;
    const frame = now => {
      this.frameId = null; if (!this.shouldAnimate()) return;
      if (now - this.lastFrame >= FRAME_MS) { this.drawVehicles(now); this.lastFrame = now; }
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  stopAnimation() { if (this.frameId !== null) cancelAnimationFrame(this.frameId); this.frameId = null; }

  showStarterRoutes(city, onSelect) {
    const layers = city.starterRoutes.map((route, index) => {
      const coordinates = routeLine(route.stops, 'bus', city);
      const layer = L.polyline(coordinates, { renderer: this.routeRenderer, color: index ? '#f7d37c' : '#f2b84b', weight: 7, opacity: 0.72, dashArray: '8 10', className: 'starter-route' })
        .addTo(this.map).on('click', () => onSelect(route.id));
      layer.bindTooltip(escapeHtml(route.label)); this.starterLayers.add(layer); return layer;
    });
    return () => layers.forEach(layer => { layer.remove(); this.starterLayers.delete(layer); });
  }

  invalidate() {
    clearTimeout(this.invalidateTimer);
    this.invalidateTimer = setTimeout(() => { if (!this.destroyed) { this.map.invalidateSize(); this.syncAnimation(); } }, 50);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.cancelSegmentDrag(); this.stopAnimation(); this.observer?.disconnect();
    document.removeEventListener('keydown', this.cancelDragOnEscape);
    document.removeEventListener('mouseup', this.documentDragEnd);
    document.removeEventListener('touchend', this.documentDragEnd);
    document.removeEventListener('pointermove', this.documentDragMove);
    document.removeEventListener('pointerup', this.documentDragEnd);
    document.removeEventListener('visibilitychange', this.onVisibilityChange); clearTimeout(this.invalidateTimer); this.resizeObserver?.disconnect();
    this.effectTimers.forEach(timer => clearTimeout(timer)); this.effectTimers.clear();
    this.lines.forEach(record => record.segmentHandles?.forEach(handle => handle.remove())); this.map.remove();
    this.markers.clear(); this.pointViews.clear(); this.orderMarkers.clear();
    this.lines.clear(); this.vehicles.clear(); this.starterLayers.clear(); this.state = null;
  }

  dispose() { this.destroy(); }
}

function finiteColor(balance) {
  if (!Number.isFinite(balance)) return '#7a8580';
  if (balance > 150) return '#23865d';
  if (balance >= 0) return '#79a944';
  if (balance > -150) return '#df9737';
  return '#c34b43';
}
