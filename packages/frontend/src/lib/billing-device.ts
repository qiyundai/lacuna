const deviceCookie = '__Host-lacuna-device';
const attributes = '; Path=/; Secure; SameSite=Strict';

export function prepareBillingSignIn() {
  if (!document.cookie.split('; ').some(pair => /^__Host-lacuna-device=[a-f0-9]{64}$/.test(pair))) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    document.cookie = deviceCookie + '=' + value + attributes + '; Max-Age=2592000';
  }
}

export function disconnectBillingDevice() {
  if (typeof document === 'undefined') return;
  document.cookie = deviceCookie + '=' + attributes + '; Max-Age=0';
}
