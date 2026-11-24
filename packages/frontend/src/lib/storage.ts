const memory = new Map<string, string>();
export function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
export function writeLocal(key: string, value: string): void {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Session remains usable in memory. */ }
}
export function removeLocal(key: string): void {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

let durableRequested = false;
/** Ask the browser not to evict the journal under storage pressure. Some browsers ask the user. */
export async function requestDurableStorage(): Promise<void> {
  if (durableRequested) return;
  durableRequested = true;
  try {
    if (!navigator.storage?.persist || await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch { /* The journal still works without durable storage. */ }
}
