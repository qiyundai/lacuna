import { mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function dpapi(text, decrypt) {
  const expression = decrypt
    ? '[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))'
    : '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))';
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.Security; ${expression}`], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Credential protection unavailable')));
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('Credential protection failed')));
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
}
export class CredentialStore {
  constructor(directory) { this.directory = directory; this.data = { hostId: `urn:uuid:${randomUUID()}`, profiles: {}, registrations: {} }; }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    try {
      const raw = await readFile(join(this.directory, 'chatgpt.credentials'), 'utf8');
      this.data = JSON.parse(process.platform === 'win32' ? await dpapi(raw, true) : raw);
      if (!this.data.hostId || !this.data.profiles || !this.data.registrations) throw new Error('Invalid credential store');
    } catch (err) { if (err.code !== 'ENOENT') throw new Error('Could not read protected credentials'); }
    await this.save();
    return this;
  }
  save() {
    const next = (this.saving ?? Promise.resolve()).catch(() => {}).then(() => this.write());
    this.saving = next;
    return next;
  }
  async write() {
    const text = JSON.stringify(this.data);
    const encrypted = process.platform === 'win32' ? await dpapi(text, false) : text;
    const target = join(this.directory, 'chatgpt.credentials');
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, encrypted, { mode: 0o600, flag: 'wx' });
      await rename(temp, target);
    } finally { await rm(temp, { force: true }); }
  }
}
