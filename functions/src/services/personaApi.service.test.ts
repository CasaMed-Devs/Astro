import { resolvePhotoUrl } from './personaApi.service';

describe('resolvePhotoUrl', () => {
  it('keeps a full URL as is', () => {
    expect(resolvePhotoUrl('https://personaapi.web.app/experts/astro-aditya.jpg')).toBe(
      'https://personaapi.web.app/experts/astro-aditya.jpg',
    );
  });

  it('prefixes a relative path with the Persona API origin', () => {
    expect(resolvePhotoUrl('/experts/astro-aditya.jpg')).toBe(
      'https://personaapi.web.app/experts/astro-aditya.jpg',
    );
  });
});
