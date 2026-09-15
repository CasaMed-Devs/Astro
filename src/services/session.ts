import * as SecureStore from 'expo-secure-store';

export interface Session {
  token: string;
  uid: string;
  phoneNumber: string;
}

const STORAGE_KEY = 'astro101.session';

type Listener = (session: Session | null) => void;

let currentSession: Session | null = null;
let loaded = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentSession);
}

/** Loads the persisted session (if any) once, at app start. Safe to call multiple times. */
export async function loadSession(): Promise<Session | null> {
  if (loaded) return currentSession;

  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    currentSession = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    currentSession = null;
  }

  loaded = true;
  notify();
  return currentSession;
}

export function getSession(): Session | null {
  return currentSession;
}

export async function setSession(session: Session): Promise<void> {
  currentSession = session;
  loaded = true;
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  notify();
}

export async function clearSession(): Promise<void> {
  currentSession = null;
  loaded = true;
  await SecureStore.deleteItemAsync(STORAGE_KEY);
  notify();
}

/** Fires immediately with the current session (once loaded), then on every change. */
export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  if (loaded) listener(currentSession);
  return () => listeners.delete(listener);
}
