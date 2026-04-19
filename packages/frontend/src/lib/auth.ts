import { api } from './api.js';

const TOKEN_KEY = 'lacuna_token';
const USER_KEY = 'lacuna_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession(jwt: string, user: { id: string; email: string }): void {
  localStorage.setItem(TOKEN_KEY, jwt);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function requestMagicLink(email: string): Promise<void> {
  await api.auth.request(email);
}

export async function verifyMagicToken(token: string): Promise<{ id: string; email: string }> {
  const { jwt, user } = await api.auth.verify(token);
  storeSession(jwt, user);
  return user;
}
