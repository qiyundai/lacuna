import { companionRequest } from './ai.svelte.js';
import { resetData } from './session.svelte.js';
import { sessionVersion } from '../session-version.js';
export interface VaultStatus { exists: boolean; locked: boolean; aiAllowed: boolean; automaticAI: boolean; migrated: boolean; sync: { enabled: boolean; version: number; error: string; lastSync?: number } }
export const vaultStore = $state<{ status: VaultStatus | null }>({ status: null });
let load = 0;
export async function loadVault() {
  const version = sessionVersion.value, current = ++load;
  const status = await companionRequest<VaultStatus>('vault/status');
  if (current !== load || version !== sessionVersion.value) return;
  if (status.locked && vaultStore.status && !vaultStore.status.locked) resetData();
  vaultStore.status = status;
}
export function didLock() { resetData(); if (vaultStore.status) vaultStore.status.locked = true; }
export async function lockVault() { await companionRequest('vault/lock', 'POST'); didLock(); }
