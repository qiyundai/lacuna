// Browser-native vault. No network calls, persisted keys, or readable journal records.
import type { EntryData, MemoirEdition, ModelWeights, StoryData } from './api.js';

export interface WebJournal {
  format: 'lacuna.web-journal.v1'; revision: number; entries: EntryData[];
  memoirs: MemoirEdition[]; weights: ModelWeights; graph: StoryData['graph'];
}
export interface WebEnvelope {
  format: 'lacuna.web-vault.v1'; owner: string; kdf: 'pbkdf2-sha256-600000';
  salt: string; iv: string; ciphertext: string;
}
export interface EncryptedStorage {
  read(): Promise<WebEnvelope | null>;
  replace(expected: string | null, envelope: WebEnvelope | null, backup?: boolean): Promise<void>;
  listBackups?(): Promise<string[]>;
  readBackup?(id: string): Promise<WebEnvelope | null>;
}
export class WebVaultError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const MAX_BYTES = 16 * 1024 * 1024;
const LOCK_AFTER = 15 * 60 * 1000;
const encoder = new TextEncoder();
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function bytes(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function random(length: number): string { return base64(crypto.getRandomValues(new Uint8Array(length))); }
export const envelopeToken = (value: WebEnvelope | null) => value ? `${value.iv}:${value.ciphertext.slice(-24)}` : null;
function aad(owner: string) { return encoder.encode(`lacuna.web-vault.v1:${owner}:pbkdf2-sha256-600000`); }
function validateEnvelope(value: unknown): asserts value is WebEnvelope {
  const v = value as WebEnvelope;
  if (!v || Object.keys(v).sort().join(',') !== 'ciphertext,format,iv,kdf,owner,salt' || v.format !== 'lacuna.web-vault.v1' || v.kdf !== 'pbkdf2-sha256-600000' || !/^[a-f0-9]{32}$/.test(v.owner) || typeof v.salt !== 'string' || typeof v.iv !== 'string' || typeof v.ciphertext !== 'string' || v.ciphertext.length > Math.ceil((MAX_BYTES + 16) * 4 / 3)) throw new WebVaultError('INVALID_BACKUP', 'Choose an encrypted browser backup created by Lacuna. Desktop companion backups use a different format.');
  try { if (bytes(v.salt).length !== 32 || bytes(v.iv).length !== 12 || bytes(v.ciphertext).length < 16) throw new Error(); }
  catch { throw new WebVaultError('INVALID_BACKUP', 'The encrypted backup is damaged.'); }
}
async function keyFor(passphrase: string, salt: string): Promise<CryptoKey> {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw new WebVaultError('PASSPHRASE_REQUIRED', 'Use at least 12 characters. A long, unique phrase is easier to remember.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(data: WebJournal, key: CryptoKey, owner: string, salt: string): Promise<WebEnvelope> {
  const plaintext = encoder.encode(JSON.stringify(data));
  if (plaintext.length > MAX_BYTES) throw new WebVaultError('VAULT_FULL', 'This journal is full. Download a backup before removing thoughts.');
  const iv = random(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv), additionalData: aad(owner), tagLength: 128 }, key, plaintext);
  return { format: 'lacuna.web-vault.v1', owner, kdf: 'pbkdf2-sha256-600000', salt, iv, ciphertext: base64(new Uint8Array(encrypted)) };
}
async function open(envelope: WebEnvelope, key: CryptoKey): Promise<WebJournal> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: aad(envelope.owner), tagLength: 128 }, key, bytes(envelope.ciphertext));
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  if (data?.format !== 'lacuna.web-journal.v1' || !Number.isSafeInteger(data.revision) || !Array.isArray(data.entries) || !Array.isArray(data.memoirs) || !data.graph || !Array.isArray(data.graph.nodes) || !data.weights || typeof data.weights !== 'object' || Array.isArray(data.weights)) throw new Error('Invalid journal');
  if (!data.entries.every((e: EntryData) => e && typeof e.id === 'string' && /^[a-f0-9]{32}$/.test(e.id) && typeof e.user_id === 'string' && typeof e.body === 'string' && e.body.length <= 500 && Number.isSafeInteger(e.created_at) && e.created_at >= 0 && e.created_at < 1e12 && (e.solidified_at === null || Number.isSafeInteger(e.solidified_at)) && (e.kept_at === null || Number.isSafeInteger(e.kept_at))) || !data.memoirs.every((m: MemoirEdition) => m && typeof m.id === 'string' && typeof m.prose === 'string' && m.prose.length <= 30000 && Number.isSafeInteger(m.generated_at))) throw new Error('Invalid journal records');
  return data;
}
export function indexedVaultStorage(name = 'lacuna-private-journal'): EncryptedStorage {
  let opening: Promise<IDBDatabase> | undefined;
  function database() {
    return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { opening = undefined; reject(new WebVaultError('STORAGE_UNAVAILABLE', 'This browser cannot save your journal. Allow site storage or use a regular browser tab.')); };
      request.onblocked = () => reject(new WebVaultError('STORAGE_BLOCKED', 'Close other Lacuna tabs and try again.'));
    });
  }
  return {
    async read() {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('vault', 'readonly'), request = transaction.objectStore('vault').get('active');
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = transaction.onerror = () => reject(new WebVaultError('STORAGE_UNAVAILABLE', 'Could not read your encrypted journal. Your saved copy has been kept.'));
      });
    },
    async replace(expected, envelope, backup = false) {
      const db = await database();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('vault', 'readwrite'), store = transaction.objectStore('vault'), request = store.get('active');
        let conflict = false;
        request.onsuccess = () => {
          const current = request.result ?? null;
          if (envelopeToken(current) !== expected) { conflict = true; transaction.abort(); return; }
          if (backup && current) store.put(current, `backup:${Date.now()}:${crypto.randomUUID()}`);
          if (envelope) store.put(envelope, 'active'); else store.clear();
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () => reject(new WebVaultError(conflict ? 'STORAGE_CONFLICT' : 'STORAGE_FAILED', conflict ? 'Your journal changed in another tab. Copy any unsaved words, then lock and reopen to load that copy.' : 'Could not save to this browser. Your previous encrypted copy is safe. Free some device storage and try again.'));
      });
    },
    async listBackups() {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('vault', 'readonly'), request = transaction.objectStore('vault').getAllKeys();
        transaction.oncomplete = () => resolve(request.result.filter((key): key is string => typeof key === 'string' && key.startsWith('backup:')).sort().reverse());
        transaction.onabort = transaction.onerror = () => reject(new WebVaultError('STORAGE_UNAVAILABLE', 'Could not list your encrypted restore copies.'));
      });
    },
    async readBackup(id) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('vault', 'readonly'), request = transaction.objectStore('vault').get(id);
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = transaction.onerror = () => reject(new WebVaultError('STORAGE_UNAVAILABLE', 'Could not open this encrypted restore copy.'));
      });
    },
  };
}
export class WebVault {
  private key: CryptoKey | null = null;
  private data: WebJournal | null = null;
  private envelope: WebEnvelope | null = null;
  private generation = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private lastActive = 0;
  private failures: number[] = [];
  constructor(private storage: EncryptedStorage, private now = Date.now) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.catch(() => {}).then(action);
    // The serialization tail must not retain a saved thought as its result.
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }
  get unlocked() { if (this.key && this.now() - this.lastActive >= LOCK_AFTER) this.lock(); return !!this.key; }
  async status() { const envelope = await this.storage.read(); return { exists: !!envelope, locked: !this.unlocked, owner: envelope?.owner ?? null }; }
  activity() { if (this.unlocked) this.lastActive = this.now(); }
  lock() { this.generation++; this.key = null; this.data = null; }
  read(): WebJournal { if (!this.unlocked || !this.data) throw new WebVaultError('VAULT_LOCKED', 'Unlock your private space first.'); return structuredClone(this.data); }
  async unlock(passphrase: string, create = false) {
    const generation = this.generation;
    return this.serial(async () => {
      this.failures = this.failures.filter(t => this.now() - t < 60000);
      if (this.failures.length >= 5) throw new WebVaultError('SLOW_DOWN', 'Wait a minute before trying another passphrase.');
      const existing = await this.storage.read();
      if (create && existing) throw new WebVaultError('VAULT_EXISTS', 'A journal already exists in this browser. Unlock it instead.');
      if (!create && !existing) throw new WebVaultError('NO_VAULT', 'Create a private space or restore an encrypted backup.');
      try {
        if (existing) validateEnvelope(existing);
        const salt = existing?.salt ?? random(32), key = await keyFor(passphrase, salt);
        const owner = existing?.owner ?? crypto.randomUUID().replace(/-/g, '');
        const data: WebJournal = existing ? await open(existing, key) : { format: 'lacuna.web-journal.v1', revision: 0, entries: [], memoirs: [], weights: {}, graph: { nodes: [], processed_count: 0 } };
        if (generation !== this.generation) throw new WebVaultError('VAULT_LOCKED', 'Opening was cancelled. Unlock again when you are ready.');
        const envelope = existing ?? await seal(data, key, owner, salt);
        if (!existing) await this.storage.replace(null, envelope);
        if (generation !== this.generation) throw new WebVaultError('VAULT_LOCKED', 'Your encrypted copy is saved and remains locked.');
        this.key = key; this.data = data; this.envelope = envelope; this.lastActive = this.now();
      } catch (e) { this.failures.push(this.now()); if (e instanceof WebVaultError) throw e; throw new WebVaultError('UNLOCK_FAILED', 'Could not unlock your space. Check the passphrase. A damaged backup can also cause this error.'); }
    });
  }
  async update<T>(action: (data: WebJournal) => T): Promise<T> {
    return this.serial(async () => {
      const data = this.read(), generation = this.generation, previous = this.envelope!, key = this.key!;
      const result = action(data); data.revision++;
      const envelope = await seal(data, key, previous.owner, previous.salt);
      if (generation !== this.generation || !this.unlocked) throw new WebVaultError('VAULT_LOCKED', 'Your space locked before saving.');
      await this.storage.replace(envelopeToken(previous), envelope);
      if (generation === this.generation && this.unlocked) { this.data = data; this.envelope = envelope; }
      return result;
    });
  }
  async backup() { this.read(); await this.pending.catch(() => {}); return this.storage.read(); }
  async recoveryCopies() { this.read(); return await this.storage.listBackups?.() ?? []; }
  async recoveryCopy(id: string) {
    this.read();
    if (!/^backup:[0-9]{13}:[a-f0-9-]{36}$/.test(id)) throw new WebVaultError('INVALID_BACKUP', 'Choose a saved restore copy.');
    const envelope = await this.storage.readBackup?.(id); validateEnvelope(envelope); return envelope;
  }
  async restore(value: unknown, passphrase: string) {
    const generation = this.generation;
    return this.serial(async () => {
      validateEnvelope(value);
      let data: WebJournal, key: CryptoKey;
      try { key = await keyFor(passphrase, value.salt); data = await open(value, key); }
      catch (e) { if (e instanceof WebVaultError) throw e; throw new WebVaultError('UNLOCK_FAILED', 'The backup could not be unlocked. Your current copy has been kept.'); }
      const previous = await this.storage.read();
      if (generation !== this.generation) throw new WebVaultError('VAULT_LOCKED', 'Restore was cancelled. Your current copy has been kept.');
      await this.storage.replace(envelopeToken(previous), value, true);
      if (generation !== this.generation) throw new WebVaultError('VAULT_LOCKED', 'Your encrypted copy is saved and remains locked.');
      this.key = key; this.data = data; this.envelope = value; this.lastActive = this.now();
    });
  }
  async remove() { this.lock(); await this.pending.catch(() => {}); const current = await this.storage.read(); await this.storage.replace(envelopeToken(current), null); this.envelope = null; }
}
let instance: WebVault | undefined;
let channel: BroadcastChannel | undefined;
export function browserVault() {
  if (!instance) {
    instance = new WebVault(indexedVaultStorage());
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('lacuna-private-vault');
      channel.onmessage = event => { if (event.data === 'lock') { instance?.lock(); window.dispatchEvent(new Event('lacuna:locked')); } };
    }
  }
  return instance;
}
export function announceBrowserLock() { channel?.postMessage('lock'); }
