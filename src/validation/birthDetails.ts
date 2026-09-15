import type { Gender } from '@/types/firestore';

export interface BirthDetailsFormState {
  dateOfBirth: Date | null;
  timeOfBirth: Date | null;
  placeOfBirth: string;
  gender: Gender | null;
}

export function validateBirthDetails(state: BirthDetailsFormState): string | null {
  if (!state.dateOfBirth) return 'Please select your date of birth.';
  if (!state.timeOfBirth) return 'Please select your time of birth.';
  if (!state.placeOfBirth.trim()) return 'Please enter your place of birth.';
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
