import { scrypt, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir, open, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PlanError } from './openai.mjs';

const derive = promisify(scrypt);
const MAX_BYTES = 16 * 1024 * 1024;
export const LOCK_AFTER_MS = 15 * 60 * 1000;
const fail = (code, message) => { throw new PlanError(code, message); };
export const emptyJournal = () => ({ format: 'lacuna.journal.v1', revision: 0, version: 0, analyzed: -1, entries: [], memoirs: [], weights: {}, graph: { nodes: [], processed_count: 0 }, summaries: [], extracted: 0, memoirCount: 0, aiAllowed: false, automaticAI: false, migrated: false });
export function validEnvelope(value, owner) {
  if (value && Object.keys(value).sort().join(',') !== 'ciphertext,format,iv,kdf,owner,salt,tag') return false;
  if (!value || value.format !== 'lacuna.vault.v1' || value.owner !== owner || value.kdf !== 'scrypt-131072-8-1' || typeof value.salt !== 'string' || !/^[a-f0-9]{32}$/.test(value.salt) || typeof value.iv !== 'string' || !/^[a-f0-9]{24}$/.test(value.iv) || typeof value.tag !== 'string' || !/^[a-f0-9]{32}$/.test(value.tag) || typeof value.ciphertext !== 'string' || value.ciphertext.length > Math.ceil(MAX_BYTES * 4 / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)) return false;
  return true;
}
function aad(owner) { return Buffer.from(`lacuna.vault.v1:${owner}:scrypt-131072-8-1`); }
function encrypt(data, owner, key, salt) {
  const bytes = Buffer.from(JSON.stringify(data));
  if (bytes.length > MAX_BYTES) fail('VAULT_FULL', 'The local vault is full. Export an archive before removing entries.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(owner));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { format: 'lacuna.vault.v1', owner, kdf: 'scrypt-131072-8-1', salt, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') };
}
function decrypt(envelope, owner, key) {
  if (!validEnvelope(envelope, owner)) fail('INVALID_VAULT', 'This encrypted vault has an unsupported or damaged format.');
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  cipher.setAAD(aad(owner)); cipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const bytes = Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]);
  const value = JSON.parse(bytes.toString('utf8'));
  if (value.format !== 'lacuna.journal.v1' || !Number.isSafeInteger(value.revision) || !Array.isArray(value.entries) || !Array.isArray(value.memoirs) || !Array.isArray(value.summaries) || !value.graph) fail('INVALID_VAULT', 'The decrypted journal is damaged.');
  return value;
}
async function keyFor(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) fail('PASSPHRASE_REQUIRED', 'Use a vault passphrase of at least 12 characters. Keep it somewhere safe; it cannot be recovered.');
  return derive(passphrase, Buffer.from(salt, 'hex'), 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
}
async function atomicWrite(path, value) {
  const temp = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close(); handle = null;
    await rename(temp, path);
  } finally { await handle?.close(); await rm(temp, { force: true }); }
}
export class Vault {
  constructor(directory, owner, options = {}) {
    if (!/^[a-f0-9]{32}$/.test(owner)) throw new Error('Invalid vault owner');
    this.directory = directory; this.owner = owner; this.path = join(directory, `${owner}.vault`);
    this.now = options.now ?? Date.now; this.lastActive = 0; this.generation = 0; this.failures = [];
  }
  async exists() { try { return (await stat(this.path)).isFile(); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
  serial(action) { const next = (this.pending ?? Promise.resolve()).catch(() => {}).then(action); this.pending = next; return next; }
  get unlocked() { if (this.key && this.now() - this.lastActive >= LOCK_AFTER_MS) this.lock(); return !!this.key; }
  activity() { if (this.unlocked) this.lastActive = this.now(); }
  lock() { this.key?.fill(0); this.key = null; this.data = null; this.generation++; this.onLock?.(); }
  read() { if (!this.unlocked) fail('VAULT_LOCKED', 'Unlock your private vault first.'); return structuredClone(this.data); }
  async unlock(passphrase, create = false) {
    const generation = this.generation;
    return this.serial(async () => {
      this.failures = this.failures.filter(t => this.now() - t < 60000);
      if (this.failures.length >= 5) fail('SLOW_DOWN', 'Wait a minute before trying another passphrase.');
      const exists = await this.exists();
      if (create && exists) fail('VAULT_EXISTS', 'This vault already exists. Unlock it with its original passphrase.');
      if (!create && !exists) fail('NO_VAULT', 'Create a vault on this computer first.');
      let key;
      try {
        const envelope = exists ? JSON.parse(await readFile(this.path, 'utf8')) : null;
        if (envelope && !validEnvelope(envelope, this.owner)) fail('INVALID_VAULT', 'The encrypted vault is damaged.');
        const salt = envelope?.salt ?? randomBytes(16).toString('hex');
        key = await keyFor(passphrase, salt);
        const data = envelope ? decrypt(envelope, this.owner, key) : emptyJournal();
        if (generation !== this.generation) fail('VAULT_LOCKED', 'Opening was cancelled because the vault was locked.');
        if (!envelope) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await atomicWrite(this.path, encrypt(data, this.owner, key, salt)); }
        if (generation !== this.generation) fail('VAULT_LOCKED', 'Opening was cancelled because the vault was locked.');
        this.lock(); this.key = key; key = null; this.salt = salt; this.data = data; this.lastActive = this.now();
      } catch (err) {
        key?.fill(0); this.failures.push(this.now());
        if (err instanceof PlanError) throw err;
        fail('UNLOCK_FAILED', 'Could not unlock the vault. Check your passphrase; a damaged file can also cause this error.');
      }
    });
  }
  async update(action) {
    return this.serial(async () => {
      const data = this.read(), generation = this.generation, key = Buffer.from(this.key), salt = this.salt;
      try {
        const result = await action(data); data.revision++;
        if (!this.unlocked || generation !== this.generation) fail('VAULT_LOCKED', 'The vault locked before the change could be saved.');
        const envelope = encrypt(data, this.owner, key, salt);
        await atomicWrite(this.path, envelope);
        if (this.unlocked && generation === this.generation) this.data = data;
        return result;
      } finally { key.fill(0); }
    });
  }
  async envelope() { await this.pending?.catch(() => {}); return JSON.parse(await readFile(this.path, 'utf8')); }
  async verifySaved() {
    const expected = Buffer.from(JSON.stringify(this.read()));
    const actual = Buffer.from(JSON.stringify(decrypt(await this.envelope(), this.owner, this.key)));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('VERIFY_FAILED', 'The encrypted local copy could not be verified. Cloud data has been kept.');
  }
  async restore(envelope, passphrase) {
    const generation = this.generation;
    return this.serial(async () => {
      if (!validEnvelope(envelope, this.owner)) fail('INVALID_VAULT', 'Invalid encrypted cloud copy.');
      const key = await keyFor(passphrase, envelope.salt);
      try {
        const data = decrypt(envelope, this.owner, key);
        // A backup carries content, never permission to share from this device.
        data.aiAllowed = false; data.automaticAI = false; data.revision++;
        if (generation !== this.generation) fail('VAULT_LOCKED', 'Restore was cancelled because the vault was locked.');
        // Keep an encrypted conflict backup before replacing anything on disk.
        if (await this.exists()) await atomicWrite(`${this.path}.${this.now()}.${randomBytes(4).toString('hex')}.backup`, JSON.parse(await readFile(this.path, 'utf8')));
        await atomicWrite(this.path, encrypt(data, this.owner, key, envelope.salt));
        if (generation !== this.generation) fail('VAULT_LOCKED', 'The encrypted copy was saved but the vault stayed locked.');
        this.lock(); this.key = Buffer.from(key); this.salt = envelope.salt; this.data = data; this.lastActive = this.now();
      } catch (err) { if (err instanceof PlanError) throw err; fail('UNLOCK_FAILED', 'The cloud copy could not be unlocked. Your local copy has been kept.'); }
      finally { key.fill(0); }
    });
  }
  async remove() {
    await this.pending?.catch(() => {}); this.lock();
    const files = await readdir(this.directory).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const file of files) if (file === `${this.owner}.vault` || file.startsWith(`${this.owner}.vault.`) && file.endsWith('.backup')) await rm(join(this.directory, file), { force: true });
  }
}
