import tzLookup from 'tz-lookup';

import { env } from '../config/env';
import { GooglePlacesNotConfiguredError, ValidationError } from '../utils/errors';

const BASE_URL = 'https://places.googleapis.com/v1';

function requireApiKey(): string {
  if (!env.google.placesApiKey) {
    throw new GooglePlacesNotConfiguredError();
  }
  return env.google.placesApiKey;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

interface AutocompleteResponse {
  suggestions?: { placePrediction?: { placeId: string; text: { text: string } } }[];
}

/** Uses the Places API (New) autocomplete endpoint — a birth place is a city, not an address. */
export async function autocompletePlaces(input: string): Promise<PlaceSuggestion[]> {
  const apiKey = requireApiKey();

  const response = await fetch(`${BASE_URL}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({ input, includedPrimaryTypes: ['locality', 'administrative_area_level_3'] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Places autocomplete failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as AutocompleteResponse;

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ placeId: p.placeId, description: p.text.text }));
}

export interface ResolvedPlace {
  latitude: number;
  longitude: number;
  /** Decimal hours from UTC (e.g. 5.5 for IST), including DST at the given timestamp. */
  timezoneOffset: number;
  completeName: string;
}

interface PlaceDetailsResponse {
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
}

/**
 * Resolves a place_id (from autocompletePlaces) to coordinates via Places
 * API (New), then derives the UTC offset *at the given moment* from the
 * IANA timezone for that location — historical DST rules can differ from
 * today's, which matters for an accurate birth chart. `timestampSeconds`
 * should be the birth date/time (any moment on that same calendar date at
 * that location is enough to resolve the correct rule).
 */
export async function resolvePlace(placeId: string, timestampSeconds: number): Promise<ResolvedPlace> {
  const apiKey = requireApiKey();

  const response = await fetch(`${BASE_URL}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'location,formattedAddress',
    },
  });

  if (!response.ok) {
    throw new ValidationError('Could not resolve that place. Please try a different search result.');
  }

  const details = (await response.json()) as PlaceDetailsResponse;
  if (!details.location) {
    throw new ValidationError('Could not resolve that place. Please try a different search result.');
  }

  const { latitude, longitude } = details.location;
  const timeZone = tzLookup(latitude, longitude);
  const timezoneOffset = getUtcOffsetHours(timeZone, new Date(timestampSeconds * 1000));

  return {
    latitude,
    longitude,
    timezoneOffset,
    completeName: details.formattedAddress ?? '',
  };
}

/**
 * Offset (in decimal hours) between `timeZone`'s wall-clock time and UTC at
 * the given instant, computed via the classic "format in target zone, then
 * reinterpret those fields as UTC" trick — this walks the IANA tz database
 * (including historical DST rules), unlike a fixed offset lookup table.
 */
function getUtcOffsetHours(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUtc - date.getTime()) / 3_600_000;
}
