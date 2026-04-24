import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api.js';

const TOKEN_KEY = 'lacuna_token';
const USER_KEY  = 'lacuna_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): { id: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession(jwt: string, user: { id: string }): void {
  localStorage.setItem(TOKEN_KEY, jwt);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function registerPasskey(): Promise<{ id: string; recoveryCode: string }> {
  const { options, userId } = await api.auth.passkey.registerChallenge();
  const credential = await startRegistration({ optionsJSON: options });
  const { jwt, user, recoveryCode } = await api.auth.passkey.register(userId, credential);
  storeSession(jwt, user);
  return { ...user, recoveryCode };
}

export async function authenticatePasskey(): Promise<{ id: string }> {
  const { options } = await api.auth.passkey.authChallenge();
  const credential = await startAuthentication({ optionsJSON: options });
  const { jwt, user } = await api.auth.passkey.auth(credential);
  storeSession(jwt, user);
  return user;
}

export async function requestEmailOTP(email: string): Promise<void> {
  await api.auth.recovery.emailRequest(email);
}

export async function verifyEmailOTP(email: string, code: string): Promise<{ id: string }> {
  const { jwt, user } = await api.auth.recovery.emailVerify(email, code);
  storeSession(jwt, user);
  return user;
}

export async function verifyRecoveryCode(code: string): Promise<{ id: string; newRecoveryCode: string }> {
  const { jwt, user, newRecoveryCode } = await api.auth.recovery.codeVerify(code);
  storeSession(jwt, user);
  return { ...user, newRecoveryCode };
}
