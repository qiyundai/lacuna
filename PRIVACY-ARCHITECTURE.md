# Privacy architecture

The public privacy policy is available at `/privacy`. The browser journal starts in IndexedDB, encrypted with AES-256-GCM and a passphrase-derived key (PBKDF2-HMAC-SHA256, 600,000 iterations and a random salt). An unlocked browser holds the decryption key in memory. Ordinary journaling and the city’s entry-based visual details run locally.

## Browser sync and recovery

Enabling sync creates a random 256-bit pairing secret. HKDF derives separate storage-access and encryption keys. Each transfer wraps an encrypted browser vault with AES-GCM using a fresh IV and authenticated version. The Worker receives the access credential, version and ciphertext. D1 uses a hash of the credential as the storage address. Passphrases, pairing codes, AI consent and decryption keys are excluded from the transferred journal. Sync needs no account. Rate limits use daily keyed IP pseudonyms.

Cloud version checks protect offline edits. Compatible additions can merge. Other conflicts require an explicit choice that saves a local recovery copy. Forgotten addresses persist through resolution. Pausing affects one device. Deleting the online copy clears the ciphertext and retains a version marker. Deleting a browser journal clears its local vault and recovery copies. Independent devices, downloads and provider history have their own lifetimes.

A portable browser backup requires its original passphrase. Restoring a file starts with sync and AI sharing off. Markdown and JSON exports are readable. Music imported into the browser is stored outside the vault and excluded from journal backups and sync.

## AI reflections

The public release disables background analysis, hosted reflection endpoints and subscriptions. The reserved browser flow would require separate consent to send selected source material for AI processing. Browser sync grants no such consent.

## Desktop companion trust boundaries

- Browser → companion: loopback only, exact Host/Origin checks, browser-specific HttpOnly cookie. The companion keeps a hash of the cookie ID and an expiring server token in its protected credential store. Cached server identity is revalidated at most once per minute. A revoked remote session is rejected on the next validation; local expiry is 12 hours. Browser state/drafts are cleared on lock/sign-out, and late responses are generation guarded.
- Journal → disk: AES-256-GCM, random salt/IV, scrypt key derivation, format/owner-bound AAD. A minimum 12-character user-held passphrase is never persisted. Serialized writes use a same-directory private temporary file, fsync, then atomic rename. No readable journal is written to disk by the companion. Lock drops references and zeroes the key buffer; this is not guaranteed forensic memory erasure.
- Companion → Lacuna: identity verification/session operations, explicit legacy migration, and optional opaque ciphertext sync. New plaintext journal/derived uploads are refused. Sync uses guarded atomic transactions across metadata and <1 MB ciphertext chunks, accounts are isolated, and delete leaves a counter tombstone. Restore is explicit and makes an encrypted local conflict backup first. Server metadata/size/timing remain visible.
- Companion → OpenAI: AI requests are disabled in the public release. When enabled in a development build, requests require an explicit connection test or consent-enabled inference. Both journal sharing and automatic inference default off. The pipeline uses individual entries for concepts, bounded recent windows for reflections/memoir, and accumulated summaries/concepts/previous memoir as needed. `store: false` is not a zero-retention guarantee.

## Desktop recovery and migration

Local encrypted backups and cloud copies require the original passphrase and same account identity. There is no escrow/recovery key or account-linking-by-email. An issued OpenAI registration should be retained across sign-out. Different registrations can produce different account IDs; do not promise seamless device transfer.

Legacy migration reads one D1 transaction, merges without silently replacing a differing entry, durably encrypts, and reads back to compare before requesting active server deletion. A version-guarded migration marker protects every deletion in one transaction, including entry-delete triggers that change the version. Older inaccessible accounts are preserved. Provider history may retain plaintext after active deletion; D1 currently documents 7/30-day Time Travel. Account deletion removes active remote records and this device's vault/conflict backups, not exports/other devices/provider history.

## Desktop limits

The passphrase is sent only over loopback HTTP to the local companion. Local malware, browser extensions, OS/process access, weak passphrases, snapshots/crash dumps, and malicious software updates remain threats. Credential storage on non-Windows systems relies on file permissions rather than a platform keychain. Identity validation needs the online service; this is not fully offline authentication. Vaults are limited to 16 MiB of plaintext and cloud copies to 6 MiB of base64 ciphertext. No automatic merge, passphrase rotation UI, independently audited cryptographic implementation, or independent security audit is claimed.

## Verification

Regression tests exercise actual migrations/SQL, authenticated companion HTTP, encryption/tamper/wrong-key behavior, durable-write failure, idle/pending-unlock races, deletion/opt-out/stale analysis, cloud CAS/tombstones/chunks, migration version guards/owner isolation, session revocation, OAuth replay/nonce/audience, refresh serialization, SSE failure handling, and no-network ambient color. Browser QA uses the disposable synthetic preview; real user passphrases and journal text must never enter test output or screenshots.
