import { api } from './api.js';
import { readLocal, writeLocal, removeLocal } from './storage.js';

const TOKEN_KEY = 'lacuna_token';
const USER_KEY = 'lacuna_user';

export function getStoredToken(): string | null {
  return readLocal(TOKEN_KEY);
}

export function getStoredUser(): { id: string; email: string } | null {
  try {
    const raw = readLocal(USER_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value.id === 'string' && typeof value.email === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function storeSession(jwt: string, user: { id: string; email: string }): void {
  writeLocal(TOKEN_KEY, jwt);
  writeLocal(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  removeLocal(TOKEN_KEY);
  removeLocal(USER_KEY);
}

export async function requestMagicLink(email: string): Promise<void> {
  await api.auth.request(email);
}

export async function verifyMagicToken(token: string): Promise<{ id: string; email: string }> {
  const { jwt, user } = await api.auth.verify(token);
  storeSession(jwt, user);
  return user;
}
