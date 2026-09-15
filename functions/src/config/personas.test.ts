import { astrologerPersonas, getPersonaById } from './personas';

describe('astrologerPersonas', () => {
  it('has unique ids', () => {
    const ids = astrologerPersonas.map((persona) => persona.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every persona a non-empty system prompt and at least one specialty/language', () => {
    for (const persona of astrologerPersonas) {
      expect(persona.systemPrompt.length).toBeGreaterThan(20);
      expect(persona.specialties.length).toBeGreaterThan(0);
      expect(persona.languages.length).toBeGreaterThan(0);
      expect(persona.creditCostPerMessage).toBeGreaterThan(0);
    }
  });

  it('resolves a known persona by id', () => {
    expect(getPersonaById('meera-iyer')?.name).toBe('Meera Iyer');
  });

  it('returns undefined for an unknown persona id', () => {
    expect(getPersonaById('does-not-exist')).toBeUndefined();
  });
});
