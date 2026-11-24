type Access = 'checking' | 'available' | 'offline' | 'limited';
export const availability = $state<{ access: Access; confirmedOnline: boolean }>({
  access: 'checking',
  confirmedOnline: false
});

const offlineKey = 'lacuna-offline-eligibility-v2';

export function watchAvailability() {
  let pending: AbortController | undefined;
  let eligible = false;
  try { eligible = localStorage.getItem(offlineKey) === '1'; } catch {}

  async function check() {
    pending?.abort();
    availability.confirmedOnline = false;
    if (!navigator.onLine) {
      availability.access = eligible ? 'offline' : 'limited';
      return;
    }
    const request = pending = new AbortController();
    try {
      const response = await fetch('/availability', {
        cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)])
      });
      if (!response.ok) throw new Error('Region check failed');
      const result = await response.json();
      if (request.signal.aborted) return;
      eligible = result.available === true;
      availability.access = eligible ? 'available' : 'limited';
      availability.confirmedOnline = eligible;
      try {
        if (eligible) localStorage.setItem(offlineKey, '1');
        else localStorage.removeItem(offlineKey);
      } catch {}
    } catch {
      if (!request.signal.aborted) availability.access = 'limited';
    }
  }

  function onVisible() {
    if (!document.hidden) void check();
  }

  void check();
  window.addEventListener('online', check);
  window.addEventListener('offline', check);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    pending?.abort();
    window.removeEventListener('online', check);
    window.removeEventListener('offline', check);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
