# Privacy architecture

The public privacy policy is available at `/privacy`. The browser journal starts in IndexedDB, encrypted with AES-256-GCM and a passphrase-derived key (PBKDF2-HMAC-SHA256, 600,000 iterations and a random salt). An unlocked browser holds the decryption key in memory. Ordinary journaling and the city’s entry-based visual details run locally.

## Browser sync and recovery

Enabling sync creates a random 256-bit pairing secret. HKDF derives separate storage-access and encryption keys. Each transfer wraps an encrypted browser vault with AES-GCM using a fresh IV and authenticated version. The Worker receives the access credential, version and ciphertext. D1 uses a hash of the credential as the storage address. Passphrases, pairing codes, AI consent and decryption keys are excluded from the transferred journal. Sync needs no account. Rate limits use daily keyed IP pseudonyms.

Cloud version checks protect offline edits. Compatible additions can merge. Other conflicts require an explicit choice that saves a local recovery copy. Forgotten addresses persist through resolution. Pausing affects one device. Deleting the online copy clears the ciphertext and retains a version marker. Deleting a browser journal clears its local vault and recovery copies. Independent devices, downloads and provider history have their own lifetimes.

A portable browser backup requires its original passphrase. Restoring a file starts with sync and AI sharing off. Markdown and JSON exports are readable. Music imported into the browser is stored outside the vault and excluded from journal backups and sync.

## AI reflections

The deployment switch defaults to off. When enabled, a paid account and separate journal consent allow the unlocked browser to send bounded, dated excerpts and source notes through the Worker to OpenAI. The Worker uses the Responses API with `store: false`. The browser validates and encrypts returned passages in the journal. Sync and restored backups exclude device consent.

## What the server holds

The Worker serves `/journal-sync` and `/reflections`. For sync it stores the hashed bearer credential, version, IV and ciphertext chunks. Reflections use separate D1 tables for email challenges, accounts, sessions, consent, Stripe customer references, paid access and metered usage. Resend delivers sign-in codes. Stripe receives the billing email and collects payment and address information at checkout. Errors log only the error name.

Migration 0009 dropped the tables from pre-release prototypes. D1 holds sync records, rate-limit counters and reflection account and usage records.

## Limits

Malware, browser extensions, an unlocked device, a weak passphrase and a malicious app update remain threats. Locking drops the key and journal references; this is not guaranteed forensic memory erasure. Vaults are limited to 16 MiB of plaintext and sync transfers to 8 MiB of encoded ciphertext. There is no passphrase rotation, independently audited cryptographic implementation, or independent security audit.

## Verification

Regression tests exercise the browser vault's encryption, wrong-key and tamper rejection, competing-tab and quota failures, lock and unlock races, encrypted backup and restore with recovery copies, forgetting across reopen and export, pairing, offline convergence, conflict preservation, tombstones and stale uploads against the Worker's real SQL in disposable SQLite, release headers, IP pseudonyms, and no-network ambient color. Browser QA uses the disposable fixture from `pnpm preview:web`; real passphrases and journal text must never enter test output or screenshots.
