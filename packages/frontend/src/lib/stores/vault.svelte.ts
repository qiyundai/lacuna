import { resetData } from './session.svelte.js';
import { sessionVersion } from '../session-version.js';
export interface VaultStatus { exists: boolean; locked: boolean; aiAllowed: boolean; automaticAI: boolean; sync: { enabled: boolean; version: number; error: string; lastSync?: number } }
export const vaultStore = $state<{ status: VaultStatus | null }>({ status: null });
let load = 0;
/** Vault controls (unlock, lock, backup, restore) handled by the browser vault. */
export async function vaultRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const { webControl } = await import('../web-api.js');
  return await webControl(path, method, data) as T;
}
export async function loadVault() {
  const version = sessionVersion.value, current = ++load;
  const status = await vaultRequest<VaultStatus>('vault/status');
  if (current !== load || version !== sessionVersion.value) return;
  if (status.locked && vaultStore.status && !vaultStore.status.locked) resetData();
  vaultStore.status = status;
}
export function didLock() { resetData(); if (vaultStore.status) vaultStore.status.locked = true; }
export async function lockVault() { await vaultRequest('vault/lock', 'POST'); didLock(); }
