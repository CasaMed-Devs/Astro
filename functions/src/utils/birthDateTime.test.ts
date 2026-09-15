import { parseBirthDateTime } from './birthDateTime';
import { ValidationError } from './errors';

describe('parseBirthDateTime', () => {
  it('parses a morning time correctly', () => {
    expect(parseBirthDateTime('05/01/2000', '09:30 AM')).toEqual({
      year: 2000,
      month: 1,
      date: 5,
      hours: 9,
      minutes: 30,
      seconds: 0,
    });
  });

  it('parses an afternoon (PM) time into 24-hour format', () => {
    expect(parseBirthDateTime('05/01/2000', '02:05 PM')).toEqual({
      year: 2000,
      month: 1,
      date: 5,
      hours: 14,
      minutes: 5,
      seconds: 0,
    });
  });

  it('parses 12:00 AM as midnight (hour 0)', () => {
    expect(parseBirthDateTime('01/01/2000', '12:00 AM').hours).toBe(0);
  });

  it('parses 12:00 PM as noon (hour 12)', () => {
    expect(parseBirthDateTime('01/01/2000', '12:00 PM').hours).toBe(12);
  });

  it('throws ValidationError for a malformed date', () => {
    expect(() => parseBirthDateTime('2000-01-05', '09:30 AM')).toThrow(ValidationError);
  });

  it('throws ValidationError for a malformed time', () => {
    expect(() => parseBirthDateTime('05/01/2000', '9:30am')).toThrow(ValidationError);
  });
});
