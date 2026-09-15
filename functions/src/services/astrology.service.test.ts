import { AstrologyApiNotConfiguredError } from '../utils/errors';

import { env } from '../config/env';
import {
  calculateKundali,
  getGeoDetails,
  getMahaDasas,
  getPlanetaryPositions,
} from './astrology.service';

jest.mock('../config/env', () => ({
  env: { astrology: { freeAstrologyApiKey: undefined as string | undefined } },
}));

const birth = { year: 2000, month: 1, date: 5, hours: 9, minutes: 30, seconds: 0 };
const geo = {
  latitude: 28.6,
  longitude: 77.2,
  timezoneOffset: 5.5,
  completeName: 'New Delhi, India',
};

describe('astrology.service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.astrology.freeAstrologyApiKey = 'test-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws AstrologyApiNotConfiguredError when no key is set', async () => {
    env.astrology.freeAstrologyApiKey = undefined;
    await expect(getGeoDetails('New Delhi')).rejects.toBeInstanceOf(AstrologyApiNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('getGeoDetails maps the geo-details response correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          latitude: 28.6,
          longitude: 77.2,
          timezone_offset: 5.5,
          complete_name: 'New Delhi, India',
        },
      ],
    });

    const result = await getGeoDetails('New Delhi');

    expect(result).toEqual(geo);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://json.freeastrologyapi.com/geo-details',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    );
  });

  it('getPlanetaryPositions reads output[1] (keyed by name) and maps house numbers', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          // output[0]: numeric-keyed, mixed with non-planet "ayanamsa"/"debug"
          // entries — intentionally NOT what we read, to prove we ignore it.
          { '0': { should: 'be ignored' }, ayanamsa: { value: 23.85 }, debug: {} },
          // output[1]: keyed by planet name — this is what we actually parse.
          {
            Ascendant: { fullDegree: 260.15, normDegree: 20.15, isRetro: 'false', current_sign: 9 },
            Saturn: {
              fullDegree: 300.0,
              normDegree: 0.0,
              isRetro: 'true',
              current_sign: 10,
              house_number: 4,
            },
          },
        ],
      }),
    });

    const result = await getPlanetaryPositions(birth, geo);

    expect(result).toEqual([
      {
        name: 'Ascendant',
        fullDegree: 260.15,
        normDegree: 20.15,
        isRetrograde: false,
        currentSign: 9,
        houseNumber: undefined,
      },
      {
        name: 'Saturn',
        fullDegree: 300.0,
        normDegree: 0.0,
        isRetrograde: true,
        currentSign: 10,
        houseNumber: 4,
      },
    ]);
  });

  it('getMahaDasas parses the JSON-encoded string inside `output`', async () => {
    // The real API wraps its payload as a JSON *string*, not a parsed
    // object: {"statusCode":200,"output":"{\"1\":{...}}"}.
    const encodedPeriods = JSON.stringify({
      '1': { Lord: 'Venus', start_time: '1988-08-30 11:18:53', end_time: '2008-08-30 14:22:10' },
      '2': { Lord: 'Sun', start_time: '2008-08-30 14:22:10', end_time: '2014-08-31 03:17:09' },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ statusCode: 200, output: encodedPeriods }),
    });

    const result = await getMahaDasas(birth, geo);

    expect(result).toEqual([
      { lord: 'Venus', startTime: '1988-08-30 11:18:53', endTime: '2008-08-30 14:22:10' },
      { lord: 'Sun', startTime: '2008-08-30 14:22:10', endTime: '2014-08-31 03:17:09' },
    ]);
  });

  it('getGeoDetails falls back to the part before the first comma when the full string fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: ['No Location found with the given location name.'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { latitude: 26.9, longitude: 75.8, timezone_offset: 5.5, complete_name: 'Jaipur, India' },
        ],
      });

    const result = await getGeoDetails('Jaipur, Rajasthan');

    expect(result.completeName).toBe('Jaipur, India');
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ location: 'Jaipur, Rajasthan' }) }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({ location: 'Jaipur' }) }),
    );
  });

  it('getGeoDetails throws a clear ValidationError when even the fallback fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ error: ['No Location found with the given location name.'] }),
    });

    await expect(getGeoDetails('Nowhereville, Neverland')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws when the API responds with a non-OK status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    });

    await expect(getGeoDetails('New Delhi')).rejects.toThrow(/failed \(401\)/);
  });

  it('calculateKundali orchestrates geo + planets + dasa calls', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            latitude: 28.6,
            longitude: 77.2,
            timezone_offset: 5.5,
            complete_name: 'New Delhi, India',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [
            { '0': { unused: true } },
            { Sun: { fullDegree: 10, normDegree: 10, isRetro: 'false', current_sign: 1 } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          statusCode: 200,
          output: JSON.stringify({ '1': { Lord: 'Ketu', start_time: 'a', end_time: 'b' } }),
        }),
      });

    const result = await calculateKundali(birth, 'New Delhi');

    expect(result.geo).toEqual(geo);
    expect(result.planets).toHaveLength(1);
    expect(result.mahaDasas).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
