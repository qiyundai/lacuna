# Privacy release 0.3

Release 0.4 adds a separate browser-native local journal for phone onboarding. It uses Web Crypto AES-256-GCM, PBKDF2-HMAC-SHA256 with 600,000 iterations and a random 256-bit salt, and IndexedDB atomic compare-and-replace transactions. The derived CryptoKey is non-extractable and is never persisted; reload/idle/manual lock drop it. Browser passphrases and journal content do not reach any server. Browser sync and inference are unavailable pending a registered hosted integration; existing desktop features remain. Browser encrypted backups have their own versioned format. Before overwriting on restore, the browser saves an encrypted recovery copy that can be downloaded in privacy & storage. Explicit deletion clears active/recovery records. Site-data clearing, private browsing, quota/eviction, device compromise, and malicious same-origin code remain boundaries. See MOBILE-ONBOARDING.md and the declaration for user-facing behavior.

The public declaration is the app's `/privacy` page. It describes implemented behavior, including legacy plaintext and provider retention limits. Do not replace those qualifications with claims of absolute privacy, zero retention, or universal instant deletion.

## Trust boundaries

- Browser → companion: loopback only, exact Host/Origin checks, browser-specific HttpOnly cookie. The companion keeps a hash of the cookie ID and an expiring server token in its protected credential store. Cached server identity is revalidated at most once per minute. A revoked remote session is rejected on the next validation; local expiry is 12 hours. Browser state/drafts are cleared on lock/sign-out, and late responses are generation guarded.
- Journal → disk: AES-256-GCM, random salt/IV, scrypt key derivation, format/owner-bound AAD. A minimum 12-character user-held passphrase is never persisted. Serialized writes use a same-directory private temporary file, fsync, then atomic rename. No readable journal is written to disk by the companion. Lock drops references and zeroes the key buffer; this is not guaranteed forensic memory erasure.
- Companion → Lacuna: identity verification/session operations, explicit legacy migration, and optional opaque ciphertext sync. New plaintext journal/derived uploads are refused. Sync uses guarded atomic transactions across metadata and <1 MB ciphertext chunks, accounts are isolated, and delete leaves a counter tombstone. Restore is explicit and makes an encrypted local conflict backup first. Server metadata/size/timing remain visible.
- Companion → OpenAI: only explicit connection tests or consent-enabled inference. Both journal sharing and automatic inference default off. The pipeline uses individual entries for concepts, bounded recent windows for reflections/memoir, and accumulated summaries/concepts/previous memoir as needed. `store: false` is not a zero-retention guarantee.

## Recovery and migration

Local encrypted backups and cloud copies require the original passphrase and same account identity. There is no escrow/recovery key or account-linking-by-email. An issued OpenAI registration should be retained across sign-out. Different registrations can produce different account IDs; do not promise seamless device transfer.

Legacy migration reads one D1 transaction, merges without silently replacing a differing entry, durably encrypts, and reads back to compare before requesting active server deletion. A version-guarded migration marker protects every deletion in one transaction, including entry-delete triggers that change the version. Older inaccessible accounts are preserved. Provider history may retain plaintext after active deletion; D1 currently documents 7/30-day Time Travel. Account deletion removes active remote records and this device's vault/conflict backups, not exports/other devices/provider history.

## Remaining boundaries

The passphrase is sent only over loopback HTTP to the local companion. Local malware, browser extensions, OS/process access, weak passphrases, snapshots/crash dumps, and malicious software updates remain threats. Credential storage on non-Windows systems relies on file permissions rather than a platform keychain. Identity validation needs the online service; this is not fully offline authentication. Vaults are limited to 16 MiB of plaintext and cloud copies to 6 MiB of base64 ciphertext. No automatic merge, passphrase rotation UI, independently audited cryptographic implementation, or independent security audit is claimed.

## Verification

Regression tests exercise actual migrations/SQL, authenticated companion HTTP, encryption/tamper/wrong-key behavior, durable-write failure, idle/pending-unlock races, deletion/opt-out/stale analysis, cloud CAS/tombstones/chunks, migration version guards/owner isolation, session revocation, OAuth replay/nonce/audience, refresh serialization, SSE failure handling, and no-network ambient color. Browser QA uses the disposable synthetic preview; real user passphrases and journal text must never enter test output or screenshots.
