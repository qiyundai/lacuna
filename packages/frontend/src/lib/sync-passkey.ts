import { pairingCode, pairingSecret } from './browser-sync.js';

// A recovery passkey stores the 32-byte pairing secret as its user handle.
// The passkey provider returns the handle only to this site, after the user
// verifies, so a cleared browser can find its online copy again. The passkey
// is never used to sign in and the server never sees it. The journal
// passphrase is still needed to read the copy.

type Credentials = Pick<CredentialsContainer, 'create' | 'get'>;
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export function passkeysSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && typeof PublicKeyCredential === 'function' && !!navigator.credentials?.create;
}

function explain(error: unknown, action: string): never {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) throw new Error(`The passkey request was cancelled. ${action}`);
  if (error instanceof DOMException && error.name === 'InvalidStateError') throw new Error('This passkey provider already holds this recovery passkey.');
  throw new Error('Passkeys are not available here. Keep your pairing code in your password manager instead.');
}

export async function saveRecoveryPasskey(code: string, credentials: Credentials = navigator.credentials, created = new Date()) {
  const label = 'Lacuna journal · ' + created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  try {
    const credential = await credentials.create({ publicKey: {
      challenge: challenge(),
      rp: { name: 'Lacuna' },
      user: { id: pairingSecret(code), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -8 }, { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      timeout: 120000,
    } });
    if (!credential) throw new DOMException('No passkey was created.', 'NotAllowedError');
  } catch (error) { explain(error, 'Your pairing code still works.'); }
}

export async function readRecoveryPasskey(credentials: Credentials = navigator.credentials) {
  let credential: Credential | null;
  try {
    credential = await credentials.get({ publicKey: { challenge: challenge(), userVerification: 'required', timeout: 120000 } });
  } catch (error) { explain(error, 'You can enter the pairing code instead.'); }
  const handle = (credential as PublicKeyCredential | null)?.response && ((credential as PublicKeyCredential).response as AuthenticatorAssertionResponse).userHandle;
  if (!handle || handle.byteLength !== 32) throw new Error('That passkey does not hold a Lacuna recovery key.');
  return pairingCode(new Uint8Array(handle));
}
