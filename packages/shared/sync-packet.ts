export const defaultApiOrigin = 'https://lacuna-api.pianoquin4126.workers.dev';
export const syncLimit = 8 * 1024 * 1024;
export type SyncPacket = {version:number; iv:string; ciphertext:string};

export function validPacket(value:unknown):value is SyncPacket {
  if (!value || typeof value !== 'object') return false;
  const packet = value as Partial<SyncPacket>;
  return Object.keys(packet).sort().join(',') === 'ciphertext,iv,version' &&
    Number.isSafeInteger(packet.version) && packet.version! > 0 &&
    typeof packet.iv === 'string' && /^[A-Za-z0-9+/]{16}$/.test(packet.iv) &&
    typeof packet.ciphertext === 'string' && packet.ciphertext.length >= 24 &&
    packet.ciphertext.length <= syncLimit && packet.ciphertext.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+=*$/u.test(packet.ciphertext) && !packet.ciphertext.endsWith('===');
}
