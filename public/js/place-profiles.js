import { latentDemand } from './demand.js';
import { KRAKOW_STARTS } from './cities.js';

const TYPES = Object.freeze({
  satellite: 'Miejscowość aglomeracyjna', district: 'Dzielnica', hub: 'Węzeł przesiadkowy',
  station: 'Dworzec kolejowy', airport: 'Lotnisko', stop: 'Przystanek lokalny'
});

const PROFILES = Object.freeze({
  center: ['centrum', 'Łączy kierunki podróży i przyciąga ruch do ważnych celów w mieście.'],
  residential: ['mieszkalny', 'Miejsce zamieszkania; model gry kieruje stąd więcej podróży w porannym szczycie.'],
  office: ['biurowy', 'Cel podróży do pracy; w modelu popyt rośnie w porannym szczycie.'],
  education: ['edukacyjny', 'Obszar uczelni i nauki; model uwzględnia dojazdy w porannych godzinach.'],
  industrial: ['przemysłowy', 'Obszar przemysłowy; model uwzględnia dojazdy pracownicze.'],
  tourist: ['turystyczny', 'Cel odwiedzin; przyciąga podróże w ciągu dnia.'],
  airport: ['lotnisko', 'Duży cel podróży; w modelu ma podwyższony popyt na dojazdy.'],
  station: ['dworzec', 'Ważny cel i początek podróży; ułatwia przesiadki między liniami.'],
  interchange: ['węzeł', 'Punkt przesiadkowy; wspólne linie ułatwiają pasażerom zmianę kierunku.'],
  local: ['lokalny', 'Lokalny punkt podróży; popyt zależy od jego danych i obsługi liniami.']
});

export function describePlace(point, city, lines = [], minuteOfDay = 720) {
  if (!point) return null;
  const inferred = point.profile || (point.type === 'airport' ? 'airport' : point.type === 'station' ? 'station' : point.type === 'hub' ? 'center' : point.type === 'stop' ? 'local' : 'residential');
  const [profile, description] = PROFILES[inferred] || PROFILES.local;
  const modeled = latentDemand([point], [], minuteOfDay)[0]?.potential ?? 0;
  const activeLines = lines.filter(line => line.stops?.includes(point.id)).map(line => line.name || `Linia ${line.id}`);
  const corridorIds = (city?.railCorridors || []).filter(corridor => corridor.includes(point.id)).flatMap(corridor => corridor.filter(id => id !== point.id));
  const corridorNames = [...new Set(corridorIds)].map(id => city?.points?.find(item => item.id === id)?.name || id);
  const pointName = id => city?.points?.find(item => item.id === id)?.name || id;
  const campaignLinks = KRAKOW_STARTS.filter(scenario => scenario.id === point.id || scenario.localHubId === point.id || scenario.centerId === point.id)
    .map(scenario => `${scenario.name} → ${pointName(scenario.localHubId)} → ${pointName(scenario.centerId)}`);
  return {
    id: point.id, name: point.name || point.id, type: TYPES[point.type] || 'Punkt miasta', profile, description,
    significance: 'Obsłużenie punktu pozwala włączyć go do sieci i tworzyć rzeczywiste podróże pasażerów. Sam potencjał popytu jest prognozą, nie liczbą pasażerów.',
    demand: { score: modeled, estimated: true, label: 'Indeks potencjału popytu (szacunkowy)' },
    connections: [...new Set([...activeLines, ...(corridorNames.length ? [`Korytarz kolejowy: ${corridorNames.join(', ')}`] : []), ...campaignLinks])]
  };
}
