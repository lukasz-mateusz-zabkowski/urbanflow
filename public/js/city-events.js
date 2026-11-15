export const CITY_EVENT_DEFINITIONS = [
  { kind: 'match', title: 'Mecz', locationId: 'nowa-huta', duration: 180, demandMultiplier: 1.8, message: 'Nowa Huta: gwałtowny popyt przez 3 godziny.' },
  { kind: 'concert', title: 'Koncert', locationId: 'centrum', duration: 240, demandMultiplier: 1.65, message: 'Centrum: zwiększony ruch wieczorny.' },
  { kind: 'arena', title: 'Wydarzenie w Tauron Arenie', locationId: 'nowa-huta', duration: 240, demandMultiplier: 2.0, message: 'Okolice Areny wymagają dodatkowej przepustowości.' },
  { kind: 'roadworks', title: 'Remont ulicy', locationId: 'centrum', duration: 360, affectedTypes: ['bus'], speedMultiplier: 0.55, message: 'Autobusy przez Centrum jadą wolniej.' },
  { kind: 'tram-failure', title: 'Awaria tramwaju', locationId: 'centrum', duration: 150, affectedTypes: ['tram'], capacityMultiplier: 0, message: 'Tramwaje przez Centrum są czasowo wyłączone.' },
  { kind: 'rain', title: 'Silny deszcz', locationId: null, duration: 240, affectedTypes: ['bus', 'tram'], speedMultiplier: 0.78, globalDemandMultiplier: 1.15, message: 'Transport naziemny zwalnia, a popyt rośnie.' },
  { kind: 'snow', title: 'Śnieg', locationId: null, duration: 360, affectedTypes: ['bus', 'tram'], speedMultiplier: 0.62, globalDemandMultiplier: 1.1, message: 'Wolniejszy transport naziemny w całym mieście.' },
  { kind: 'accident', title: 'Wypadek', locationId: 'biezanow', duration: 120, affectedTypes: ['bus'], speedMultiplier: 0.4, message: 'Autobusy przez Bieżanów mają duże opóźnienia.' }
];

export function createCityEvent(definition, startMinute, id = `event-${startMinute}`, announcedMinute = startMinute) {
  return { id, source: 'city', ...definition, announcedMinute, startMinute, endMinute: startMinute + definition.duration };
}

export function activeCityEvents(events, elapsedMinutes) {
  return (events || []).filter(event => event.startMinute <= elapsedMinutes && event.endMinute > elapsedMinutes);
}

export function upcomingCityEvents(events, elapsedMinutes, horizonMinutes = 720) {
  return (events || []).filter(event => event.startMinute > elapsedMinutes && event.startMinute <= elapsedMinutes + horizonMinutes)
    .sort((a, b) => a.startMinute - b.startMinute);
}

export function eventStatus(event, elapsedMinutes) {
  if (event.startMinute > elapsedMinutes) return { phase: 'upcoming', minutes: event.startMinute - elapsedMinutes };
  if (event.endMinute > elapsedMinutes) return { phase: 'active', minutes: event.endMinute - elapsedMinutes };
  return { phase: 'ended', minutes: 0 };
}

export function describeEventImpact(event) {
  const effects = [];
  if ((event.demandMultiplier || 1) > 1) effects.push(`popyt ×${event.demandMultiplier}`);
  if ((event.globalDemandMultiplier || 1) > 1) effects.push(`popyt w mieście ×${event.globalDemandMultiplier}`);
  if ((event.speedMultiplier || 1) < 1) effects.push(`prędkość ${Math.round(event.speedMultiplier * 100)}%`);
  if ((event.capacityMultiplier ?? 1) < 1) effects.push(event.capacityMultiplier === 0 ? 'brak obsługi' : `przepustowość ${Math.round(event.capacityMultiplier * 100)}%`);
  return effects.join(' · ') || 'zmiana ruchu lokalnego';
}

const affectsLine = (event, line) => !event.locationId || line.stops?.includes(event.locationId);

export function eventImpactForLine(events, line, elapsedMinutes = Infinity) {
  let speedMultiplier = 1;
  let capacityMultiplier = 1;
  for (const event of activeCityEvents(events, elapsedMinutes)) {
    if (!affectsLine(event, line) || (event.affectedTypes?.length && !event.affectedTypes.includes(line.type))) continue;
    speedMultiplier *= event.speedMultiplier ?? 1;
    capacityMultiplier *= event.capacityMultiplier ?? 1;
  }
  return { speedMultiplier: Math.max(0.1, speedMultiplier), capacityMultiplier: Math.max(0, capacityMultiplier) };
}

export function eventDemandMultiplier(events, pointId, elapsedMinutes = Infinity) {
  let multiplier = 1;
  for (const event of activeCityEvents(events, elapsedMinutes)) {
    if (event.globalDemandMultiplier) multiplier *= event.globalDemandMultiplier;
    if (event.locationId === pointId) multiplier *= event.demandMultiplier ?? 1;
  }
  return multiplier;
}

