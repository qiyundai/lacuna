import { removeLocal } from './storage.js';

const TOKEN_KEY = 'lacuna_token';
const USER_KEY = 'lacuna_user';

// Purge keys left by earlier builds; the journal keeps no session in browser storage.
export function clearSession(): void {
  removeLocal(TOKEN_KEY);
  removeLocal(USER_KEY);
  removeLocal('lacuna_weather');
}
