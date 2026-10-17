import { removeLocal } from './storage.js';

const TOKEN_KEY = 'lacuna_token';
const USER_KEY = 'lacuna_user';

// Sessions now use an HttpOnly companion cookie. Purge old browser tokens.
export function clearSession(): void {
  removeLocal(TOKEN_KEY);
  removeLocal(USER_KEY);
  removeLocal('lacuna_weather');
}
