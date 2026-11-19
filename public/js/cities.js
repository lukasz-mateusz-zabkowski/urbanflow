const point = (id, name, lat, lng, type, demand, unlock = 0, profile = null) => ({ id, name, lat, lng, type, demand, unlock, profile });

export const KRAKOW_STARTS = [
  { id: 'michalowice', name: 'Michałowice', point: point('michalowice', 'Michałowice', 50.1587, 19.9796, 'satellite', 8, 0, 'residential'), localHubId: 'gorka-narodowa', centerId: 'dworzec', demand: 8 },
  { id: 'zielonki', name: 'Zielonki', point: point('zielonki', 'Zielonki', 50.1202, 19.9212, 'satellite', 8, 0, 'residential'), localHubId: 'krowodrza', centerId: 'dworzec', demand: 8 },
  { id: 'skawina', name: 'Skawina', point: point('skawina', 'Skawina', 49.9750, 19.8287, 'satellite', 9, 0, 'industrial'), localHubId: 'lagiewniki', centerId: 'dworzec', demand: 9 },
  { id: 'zabierzow', name: 'Zabierzów', point: point('zabierzow', 'Zabierzów', 50.1181, 19.7970, 'satellite', 8, 0, 'residential'), localHubId: 'bronowice', centerId: 'dworzec', demand: 8 },
  { id: 'niepolomice', name: 'Niepołomice', point: point('niepolomice', 'Niepołomice', 50.0345, 20.2170, 'satellite', 8, 0, 'industrial'), localHubId: 'nowa-huta', centerId: 'dworzec', demand: 8 },
  { id: 'wieliczka', name: 'Wieliczka', point: point('wieliczka', 'Wieliczka', 49.9871, 20.0648, 'satellite', 8, 0, 'tourist'), localHubId: 'biezanow', centerId: 'dworzec', demand: 8 },
  { id: 'liszki', name: 'Liszki', point: point('liszki', 'Liszki', 50.0384, 19.7682, 'satellite', 7, 0, 'residential'), localHubId: 'bronowice', centerId: 'dworzec', demand: 7 },
  { id: 'kocmyrzow', name: 'Kocmyrzów', point: point('kocmyrzow', 'Kocmyrzów', 50.1298, 20.1133, 'satellite', 7, 0, 'residential'), localHubId: 'nowa-huta', centerId: 'dworzec', demand: 7 },
  { id: 'igolomia', name: 'Igołomia', point: point('igolomia', 'Igołomia', 50.0912, 20.2611, 'satellite', 7, 0, 'industrial'), localHubId: 'nowa-huta', centerId: 'dworzec', demand: 7,
    availableForNewGame: false, availabilityReason: 'Najbliższa droga dopuszczona dla autobusu jest ok. 143 m od punktu scenariusza; limit dojścia do grafu wynosi 120 m.' },
  { id: 'swiatniki', name: 'Świątniki Górne', point: point('swiatniki', 'Świątniki Górne', 49.9342, 19.9536, 'satellite', 7, 0, 'residential'), localHubId: 'kurdwanow', centerId: 'dworzec', demand: 7 },
  { id: 'libertow', name: 'Libertów', point: point('libertow', 'Libertów', 49.9720, 19.8946, 'satellite', 7, 0, 'residential'), localHubId: 'lagiewniki', centerId: 'dworzec', demand: 7 }
];

export function chooseStartScenario(random = Math.random, id = null) {
  if (id) return KRAKOW_STARTS.find(item => item.id === id) || KRAKOW_STARTS.find(item => item.id === 'wieliczka');
  const available = KRAKOW_STARTS.filter(item => item.availableForNewGame !== false);
  return available[Math.min(available.length - 1, Math.floor(random() * available.length))];
}

export function starterRoutesFor(scenario) {
  return [{ id: 'starter-local', label: `${scenario.name} → lokalny węzeł`, stops: [scenario.id, scenario.localHubId] }];
}

export const CITIES = {
  krakow: {
    id: 'krakow', name: 'Kraków', country: 'Małopolska', available: true,
    center: [50.0614, 19.9372], zoom: 11, population: 804237, startingBudget: 920000,
    // Hand-curated geographic corridors; a future provider can supply this same shape.
    railCorridors: [['wieliczka', 'biezanow', 'dworzec'], ['skawina', 'lagiewniki', 'centrum'], ['zabierzow', 'bronowice', 'dworzec', 'balice'], ['dworzec', 'nowa-huta', 'niepolomice']],
    points: [
      point('biezanow', 'Bieżanów', 50.0120, 20.0265, 'district', 8, 0, 'residential'),
      point('kurdwanow', 'Kurdwanów', 50.0128, 19.9490, 'hub', 8, 0, 'interchange'),
      point('lagiewniki', 'Łagiewniki', 50.0205, 19.9325, 'hub', 8, 0, 'interchange'),
      point('gorka-narodowa', 'Górka Narodowa', 50.1082, 19.9569, 'hub', 9, 0, 'interchange'),
      point('krowodrza', 'Krowodrza Górka', 50.0890, 19.9200, 'hub', 9, 0, 'interchange'),
      point('ruczaj', 'Ruczaj', 50.0308, 19.9028, 'district', 8, 1, 'education'),
      point('nowa-huta', 'Nowa Huta', 50.0720, 20.0377, 'district', 10, 2, 'industrial'),
      { ...point('centrum', 'Centrum', 50.0617, 19.9373, 'hub', 13, 0, 'center'), markerOffsetY: 14, legacyOnly: true },
      point('bronowice', 'Bronowice', 50.0800, 19.8932, 'district', 9, 1, 'residential'),
      { ...point('dworzec', 'Dworzec Główny', 50.0671, 19.9450, 'station', 12, 0, 'station'), markerOffsetY: -22 },
      point('balice', 'Lotnisko Kraków Balice', 50.0777, 19.7848, 'airport', 11, 99, 'airport'),
      ...KRAKOW_STARTS.map(item => ({ ...item.point, startScenario: item.id }))
    ],
    starterRoutes: starterRoutesFor(KRAKOW_STARTS.find(item => item.id === 'wieliczka')),
    roadGeometry: [
      [[49.9342,19.9536],[49.9660,19.9510],[50.0128,19.9490],[50.0405,19.9440],[50.0617,19.9373],[50.0671,19.9450],[50.1082,19.9569],[50.1587,19.9796]],
      [[49.9720,19.8946],[50.0205,19.9325],[50.0405,19.9440],[50.0617,19.9373]],
      [[49.9750,19.8287],[49.9935,19.8640],[50.0205,19.9325]],
      [[50.0384,19.7682],[50.0600,19.8250],[50.0800,19.8932],[50.0890,19.9200],[50.0671,19.9450]],
      [[50.1181,19.7970],[50.0950,19.8500],[50.0800,19.8932]],
      [[49.9871,20.0648],[50.0120,20.0265],[50.0380,19.9800],[50.0617,19.9373]],
      [[50.0345,20.2170],[50.0520,20.1300],[50.0720,20.0377],[50.0671,19.9450]],
      [[50.0912,20.2611],[50.0930,20.1750],[50.0720,20.0377]],
      [[50.1298,20.1133],[50.1050,20.0750],[50.0720,20.0377]],
      [[50.0308,19.9028],[50.0430,19.9170],[50.0617,19.9373]],
      [[50.0777,19.7848],[50.0800,19.8932]]
    ],
    railGeometry: [
      [[49.9871,20.0648],[50.0120,20.0265],[50.0470,19.9660],[50.0671,19.9450]],
      [[49.9750,19.8287],[50.0205,19.9325],[50.0617,19.9373]],
      [[50.1181,19.7970],[50.0800,19.8932],[50.0671,19.9450],[50.0777,19.7848]],
      [[50.0671,19.9450],[50.0720,20.0377],[50.0345,20.2170]]
    ]
  },
  warszawa: { id: 'warszawa', name: 'Warszawa', country: 'Mazowsze', center: [52.2297, 21.0122], zoom: 11, population: 1861644 },
  wroclaw: { id: 'wroclaw', name: 'Wrocław', country: 'Dolny Śląsk', center: [51.1079, 17.0385], zoom: 11, population: 674132 },
  gdansk: { id: 'gdansk', name: 'Gdańsk', country: 'Pomorze', center: [54.3520, 18.6466], zoom: 11, population: 486345 },
  poznan: { id: 'poznan', name: 'Poznań', country: 'Wielkopolska', center: [52.4064, 16.9252], zoom: 11, population: 540146 }
};

export const getCity = id => CITIES[id] || null;
export const listCities = () => Object.values(CITIES);

// Przystanki (setki punktów) są ładowane z data/krakow-stops.json i dopinane do city.points jako type:'stop'.
export function attachStops(city, stops) {
  if (city.stopsAttached || !Array.isArray(stops)) return 0;
  const taken = new Set(city.points.map(p => p.id)); const list = [];
  for (const s of stops) {
    if (!s || typeof s.id !== 'string' || taken.has(s.id) || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    taken.add(s.id);
    list.push({ id: s.id, name: String(s.name || s.id).slice(0, 60), lat: s.lat, lng: s.lng, type: 'stop', demand: Math.min(3, Math.max(1, Number(s.w) || 1)), unlock: 0, profile: 'local' });
  }
  city.points.push(...list); city.stopsAttached = true; return list.length;
}
export async function loadStops(city, url = 'data/krakow-stops.json') {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return 0;
    return attachStops(city, (await response.json()).stops);
  } catch { return 0; }
}
