import type { Gender } from '@/types/firestore';

export interface ResolvedBirthPlace {
  latitude: number;
  longitude: number;
  timezoneOffset: number;
}

export interface BirthDetailsFormState {
  fullName: string;
  dateOfBirth: Date | null;
  timeOfBirth: Date | null;
  placeOfBirth: string;
  place: ResolvedBirthPlace | null;
  gender: Gender | null;
}

export function validateBirthDetails(state: BirthDetailsFormState): string | null {
  if (!state.fullName.trim()) return 'Please enter your full name.';
  if (!state.dateOfBirth) return 'Please select your date of birth.';
  if (!state.timeOfBirth) return 'Please select your time of birth.';
  if (!state.placeOfBirth.trim()) return 'Please enter your place of birth.';
  if (!state.place) return 'Please pick your birth place from the suggestions list.';
  if (!state.gender) return 'Please select a gender.';
  return null;
}

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
}

/** Inverse of formatDate — parses a "dd/mm/yyyy" string back into a Date. */
export function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** Inverse of formatTime — parses a "hh:mm AM/PM" string back into a Date. */
export function parseTime(value: string): Date | null {
  const match = value.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
  if (!match) return null;
  const [, hourStr, minuteStr, suffix] = match;
  let hours = Number(hourStr) % 12;
  if (suffix === 'PM') hours += 12;
  const date = new Date();
  date.setHours(hours, Number(minuteStr), 0, 0);
  return date;
}
