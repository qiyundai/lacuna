// Disposable browser QA only. This file is never included in the deployed app.
import { WebVault, indexedVaultStorage } from '../packages/frontend/src/lib/web-vault.js';
import { webRequest } from '../packages/frontend/src/lib/web-api.js';
// Exercise real IndexedDB transactions, including competing-tab semantics.
const storage = indexedVaultStorage(`lacuna-disposable-check-${crypto.randomUUID()}`);
const left = new WebVault(storage), right = new WebVault(storage);
await left.unlock('sample phone journal passphrase', true);
await right.unlock('sample phone journal passphrase');
const concurrent = await Promise.allSettled([
  webRequest('/entries', 'POST', { entry_id: 'b'.repeat(32), body: 'Synthetic competing save one', solidified_at: 123 }, left),
  webRequest('/entries', 'POST', { entry_id: 'c'.repeat(32), body: 'Synthetic competing save two', solidified_at: 123 }, right),
]);
if (concurrent.filter(result => result.status === 'fulfilled').length !== 1) throw new Error('IndexedDB conflict guard failed');
const reopened = new WebVault(storage); await reopened.unlock('sample phone journal passphrase');
if (reopened.read().entries.length !== 1) throw new Error('A competing save was lost');
const copy = await reopened.backup(); await reopened.restore(copy, 'sample phone journal passphrase');
const kept = await reopened.recoveryCopies(); if (kept.length !== 1) throw new Error('Restore copy was not retained');
await reopened.recoveryCopy(kept[0]); reopened.lock(); left.lock(); right.lock();
const vault = new WebVault(indexedVaultStorage());
const status = await vault.status();
await vault.unlock('sample phone journal passphrase', !status.exists);
await webRequest('/entries', 'POST', { entry_id: 'a'.repeat(32), body: 'Synthetic phone check: a thought saved without a desktop.', solidified_at: 123 }, vault);
vault.lock();
document.body.textContent = 'Real IndexedDB conflict and recovery checks passed. Disposable encrypted sample ready.';
const link = document.createElement('a'); link.href = '/'; link.textContent = 'Open sample app'; document.body.appendChild(link);
