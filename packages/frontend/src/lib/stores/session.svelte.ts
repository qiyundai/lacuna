import { getStoredToken, getStoredUser, clearSession } from '../auth.js';

export type AuthStatus = 'loading' | 'authed' | 'unauthed';

export const session = $state<{
  user: { id: string } | null;
  status: AuthStatus;
}>({
  user: null,
  status: 'loading',
});

export function hydrateSession(): void {
  const token = getStoredToken();
  const user = getStoredUser();
  if (token && user) {
    session.user = user;
    session.status = 'authed';
  } else {
    session.user = null;
    session.status = 'unauthed';
  }
}

export function setAuthed(user: { id: string }): void {
  session.user = user;
  session.status = 'authed';
}

export function signOut(): void {
  clearSession();
  session.user = null;
  session.status = 'unauthed';
}
