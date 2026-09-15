import { env } from '../config/env';
import { AstrologyApiNotConfiguredError, ValidationError } from '../utils/errors';
import type { BirthDateTime } from '../utils/birthDateTime';

const BASE_URL = 'https://json.freeastrologyapi.com';
const CHART_CONFIG = { observation_point: 'topocentric', ayanamsha: 'lahiri' } as const;

export interface GeoDetails {
  latitude: number;
  longitude: number;
  timezoneOffset: number;
  completeName: string;
}

export interface PlanetPosition {
  name: string;
  fullDegree: number;
  normDegree: number;
  isRetrograde: boolean;
  currentSign: number;
  /** Absent for the Ascendant itself; present for actual planets. */
  houseNumber?: number;
}

export interface DashaPeriod {
  lord: string;
  startTime: string;
  endTime: string;
}

export interface KundaliData {
  geo: GeoDetails;
  planets: PlanetPosition[];
  mahaDasas: DashaPeriod[];
}

function requireApiKey(): string {
  if (!env.astrology.freeAstrologyApiKey) {
    throw new AstrologyApiNotConfiguredError();
  }
  return env.astrology.freeAstrologyApiKey;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const apiKey = requireApiKey();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`FreeAstrologyAPI ${path} failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

interface GeoDetailsRawEntry {
  latitude: number;
  longitude: number;
  timezone_offset: number;
  complete_name: string;
}

/**
 * The API returns HTTP 200 with `{ error: [...] }` (not an array, and not
 * a non-OK status) when it can't resolve a location string — notably for
 * "City, State" style strings, which is exactly what our birth-details
 * screen's own placeholder ("Jaipur, Rajasthan") encourages users to type.
 * Fall back to just the part before the first comma before giving up.
 */
async function requestGeoDetails(location: string): Promise<GeoDetailsRawEntry | null> {
  const response = await postJson<GeoDetailsRawEntry[] | { error: string[] }>('/geo-details', {
    location,
  });
  return Array.isArray(response) ? (response[0] ?? null) : null;
}

export async function getGeoDetails(location: string): Promise<GeoDetails> {
  let result = await requestGeoDetails(location);

  if (!result) {
    const simplified = location.split(',')[0]?.trim();
    if (simplified && simplified !== location.trim()) {
      result = await requestGeoDetails(simplified);
    }
  }

  if (!result) {
    throw new ValidationError(
      `Could not find "${location}". Try a simpler place name, like just the city.`,
    );
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    timezoneOffset: result.timezone_offset,
    completeName: result.complete_name,
  };
}

interface ChartRequestBody {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
  latitude: number;
  longitude: number;
  timezone: number;
  settings: typeof CHART_CONFIG;
}

function buildChartRequestBody(birth: BirthDateTime, geo: GeoDetails): ChartRequestBody {
  return {
    year: birth.year,
    month: birth.month,
    date: birth.date,
    hours: birth.hours,
    minutes: birth.minutes,
    seconds: birth.seconds,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: geo.timezoneOffset,
    settings: CHART_CONFIG,
  };
}

interface PlanetsByNameEntry {
  current_sign: number;
  fullDegree: number;
  normDegree: number;
  isRetro: string;
  house_number?: number;
}

export async function getPlanetaryPositions(
  birth: BirthDateTime,
  geo: GeoDetails,
): Promise<PlanetPosition[]> {
  // `output` is a 2-element array: output[0] is keyed by numeric index and
  // also mixes in non-planet entries ("ayanamsa", "debug"); output[1] is
  // the same data keyed by planet name, which is what we actually want.
  const response = await postJson<{ output: [unknown, Record<string, PlanetsByNameEntry>] }>(
    '/planets',
    buildChartRequestBody(birth, geo),
  );

  const [, planetsByName] = response.output;

  return Object.entries(planetsByName).map(([name, planet]) => ({
    name,
    fullDegree: planet.fullDegree,
    normDegree: planet.normDegree,
    isRetrograde: planet.isRetro === 'true',
    currentSign: planet.current_sign,
    houseNumber: planet.house_number,
  }));
}

export async function getMahaDasas(birth: BirthDateTime, geo: GeoDetails): Promise<DashaPeriod[]> {
  // Unlike /planets and /geo-details, this endpoint wraps its real payload
  // as a JSON-encoded *string* under `output` (`{"statusCode":200,"output":"{...}"}`),
  // not a parsed object — it needs a second JSON.parse.
  const response = await postJson<{ output: string }>(
    '/vimsottari/maha-dasas',
    buildChartRequestBody(birth, geo),
  );

  const periods = JSON.parse(response.output) as Record<
    string,
    { Lord: string; start_time: string; end_time: string }
  >;

  return Object.values(periods).map((period) => ({
    lord: period.Lord,
    startTime: period.start_time,
    endTime: period.end_time,
  }));
}

export async function calculateKundali(
  birth: BirthDateTime,
  placeOfBirth: string,
): Promise<KundaliData> {
  const geo = await getGeoDetails(placeOfBirth);
  const [planets, mahaDasas] = await Promise.all([
    getPlanetaryPositions(birth, geo),
    getMahaDasas(birth, geo),
  ]);

  return { geo, planets, mahaDasas };
}
