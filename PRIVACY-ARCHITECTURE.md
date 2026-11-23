# Privacy architecture

The public privacy policy is available at `/privacy`. The browser journal starts in IndexedDB, encrypted with AES-256-GCM and a passphrase-derived key (PBKDF2-HMAC-SHA256, 600,000 iterations and a random salt). An unlocked browser holds the decryption key in memory. Ordinary journaling and the city’s entry-based visual details run locally.

## Browser sync and recovery

Enabling sync creates a random 256-bit pairing secret. HKDF derives separate storage-access and encryption keys. Each transfer wraps an encrypted browser vault with AES-GCM using a fresh IV and authenticated version. The Worker receives the access credential, version and ciphertext. D1 uses a hash of the credential as the storage address. Passphrases, pairing codes, AI consent and decryption keys are excluded from the transferred journal. Sync needs no account. Rate limits use daily keyed IP pseudonyms.

Cloud version checks protect offline edits. Compatible additions can merge. Other conflicts require an explicit choice that saves a local recovery copy. Forgotten addresses persist through resolution. Pausing affects one device. Deleting the online copy clears the ciphertext and retains a version marker. Deleting a browser journal clears its local vault and recovery copies. Independent devices, downloads and provider history have their own lifetimes.

A portable browser backup requires its original passphrase. Restoring a file starts with sync and AI sharing off. Markdown and JSON exports are readable. Music imported into the browser is stored outside the vault and excluded from journal backups and sync.

## AI reflections

The public release disables background analysis, hosted reflection endpoints and subscriptions. The reserved browser flow would require separate consent to send selected source material for AI processing. Browser sync grants no such consent.

## What the server holds

The Worker serves `/journal-sync` and the disabled `/reflections` endpoint. It has no accounts and no journal routes. For sync it stores a SHA-256 hash of the bearer credential as the slot, the version, the IV and ciphertext chunks, with no timestamps or identifiers. Rate limits count requests under an HMAC of the IP address keyed with the server secret and the current day, and expire within a day. Errors log only the error name. The app's Content-Security-Policy limits connections to its own origin and the sync endpoint, and fonts and media are self-hosted.

Migration 0009 dropped the tables from pre-release prototypes. D1 holds only sync records, rate-limit counters and the empty, reserved reflections tables.

## Limits

Malware, browser extensions, an unlocked device, a weak passphrase and a malicious app update remain threats. Locking drops the key and journal references; this is not guaranteed forensic memory erasure. Vaults are limited to 16 MiB of plaintext and sync transfers to 8 MiB of encoded ciphertext. There is no passphrase rotation, independently audited cryptographic implementation, or independent security audit.

## Verification

Regression tests exercise the browser vault's encryption, wrong-key and tamper rejection, competing-tab and quota failures, lock and unlock races, encrypted backup and restore with recovery copies, forgetting across reopen and export, pairing, offline convergence, conflict preservation, tombstones and stale uploads against the Worker's real SQL in disposable SQLite, release headers, IP pseudonyms, and no-network ambient color. Browser QA uses the disposable fixture from `pnpm preview:web`; real passphrases and journal text must never enter test output or screenshots.
