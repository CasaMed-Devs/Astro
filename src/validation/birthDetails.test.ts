import {
  formatDate,
  formatTime,
  validateBirthDetails,
  type BirthDetailsFormState,
} from './birthDetails';

const baseState: BirthDetailsFormState = {
  dateOfBirth: new Date(2000, 0, 1),
  timeOfBirth: new Date(2000, 0, 1, 14, 30),
  placeOfBirth: 'Jaipur, Rajasthan',
  gender: 'female',
};

describe('validateBirthDetails', () => {
  it('passes for a fully filled-in form', () => {
    expect(validateBirthDetails(baseState)).toBeNull();
  });

  it('requires a date of birth', () => {
    expect(validateBirthDetails({ ...baseState, dateOfBirth: null })).toMatch(/date of birth/i);
  });

  it('requires a time of birth', () => {
    expect(validateBirthDetails({ ...baseState, timeOfBirth: null })).toMatch(/time of birth/i);
  });

  it('requires a non-empty place of birth', () => {
    expect(validateBirthDetails({ ...baseState, placeOfBirth: '   ' })).toMatch(/place of birth/i);
  });

  it('requires a gender selection', () => {
    expect(validateBirthDetails({ ...baseState, gender: null })).toMatch(/gender/i);
  });
});

describe('formatDate', () => {
  it('formats as dd/mm/yyyy with zero-padding', () => {
    expect(formatDate(new Date(2000, 0, 5))).toBe('05/01/2000');
  });
});

describe('formatTime', () => {
  it('formats afternoon times in 12-hour clock with AM/PM', () => {
    expect(formatTime(new Date(2000, 0, 1, 14, 5))).toBe('02:05 PM');
  });

  it('formats midnight as 12 AM', () => {
    expect(formatTime(new Date(2000, 0, 1, 0, 0))).toBe('12:00 AM');
  });

  it('formats noon as 12 PM', () => {
    expect(formatTime(new Date(2000, 0, 1, 12, 0))).toBe('12:00 PM');
  });
});
