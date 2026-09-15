import { ValidationError } from './errors';

export interface BirthDateTime {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})\s?(AM|PM)$/i;

/**
 * Parses the `dd/mm/yyyy` and `hh:mm AM/PM` strings written by
 * src/validation/birthDetails.ts (formatDate/formatTime) on the mobile
 * app into the numeric, 24-hour fields the astrology API expects.
 */
export function parseBirthDateTime(dateOfBirth: string, timeOfBirth: string): BirthDateTime {
  const dateMatch = DATE_PATTERN.exec(dateOfBirth.trim());
  if (!dateMatch) {
    throw new ValidationError(
      `Invalid date of birth format: "${dateOfBirth}". Expected dd/mm/yyyy.`,
    );
  }

  const timeMatch = TIME_PATTERN.exec(timeOfBirth.trim());
  if (!timeMatch) {
    throw new ValidationError(
      `Invalid time of birth format: "${timeOfBirth}". Expected hh:mm AM/PM.`,
    );
  }

  const [, day, month, year] = dateMatch;
  const [, hourStr, minuteStr, meridiem] = timeMatch;

  let hours = Number(hourStr) % 12;
  if (meridiem.toUpperCase() === 'PM') {
    hours += 12;
  }

  return {
    year: Number(year),
    month: Number(month),
    date: Number(day),
    hours,
    minutes: Number(minuteStr),
    seconds: 0,
  };
}
