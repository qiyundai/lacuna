# Privacy architecture

The public privacy policy is available at `/privacy`. The browser journal starts in IndexedDB, encrypted with AES-256-GCM and a passphrase-derived key (PBKDF2-HMAC-SHA256, 600,000 iterations and a random salt). An unlocked browser holds the decryption key in memory. Ordinary journaling and the city’s entry-based visual details run locally.

## Browser sync and recovery

Enabling sync creates a random 256-bit pairing secret. HKDF derives separate storage-access and encryption keys. Each transfer wraps an encrypted browser vault with AES-GCM using a fresh IV and authenticated version. The Worker receives the access credential, version and ciphertext. D1 uses a hash of the credential as the storage address. Passphrases, pairing codes, AI consent and decryption keys are excluded from the transferred journal. Sync needs no account. Rate limits use daily keyed IP pseudonyms.

An optional recovery passkey stores the pairing secret as the user handle of a discoverable WebAuthn credential (user verification required, RP ID left at the exact host). After a browser wipe, `navigator.credentials.get()` returns the handle and the browser links the journal as with a typed code; the passphrase is still required. Lacuna never verifies or receives the assertion, so the Worker and D1 are unchanged. The chosen passkey provider holds the secret, as a password manager would hold a saved code. The vault records only a `passkey` flag on its device pairing, which is not transferred by sync.

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

## Operating the paid service

The release switch pauses new purchases and generation. Subscribers can still open /billing, verify their email and manage billing or withdraw permission. A reconciliation job revisits Stripe subscriptions every 15 minutes in batches of 20, prioritizing accounts that have gone a day without an update. Access requires the matching active subscription and a paid latest invoice. A full refund or a disputed charge on that invoice pauses new readings when reconciled. Saved journal material stays readable.

The same job expires challenges, sessions and rate-limit buckets and removes detailed usage older than 90 days. Sync admits at most 256 new slots per UTC day and 128 MiB of encoded ciphertext across the service by default. Existing slots can shrink and their owners can delete them at capacity. The sign-in service allows up to 200 email sends per UTC day. Review aggregate volumes before raising a limit.

### Handling private erasure requests

The operator receives requests at qiyund@quietatlas.io. Confirm the requested scope and verify control by sending a new confirmation to the billing address already on file. Never ask for a journal passphrase, pairing code or sign-in code. For complete billing-account closure, obtain confirmation of cancellation, cancel any ongoing subscription in Stripe, and verify its final state before removing the link to the customer. Handle Stripe and Resend records in their respective dashboards according to the applicable retention obligations.

Using a bound account ID, delete the verified row from reflection_accounts. The database trigger clears the associated challenges, sessions and usage in the same transaction. It adds current-month spend to an anonymous service-wide total so erasure preserves the shared budget. For a sign-in-only request with no account, delete the challenge for the verified email separately. Verify the deletion by ID and close the request privately. Anonymous encrypted sync has no billing account link. Writers remove an online copy on a paired device and remove local recovery copies in Vault settings.

### Restores and incident response

Before a D1 recovery, disable generation and production writes and preserve the current database. Restore in isolation first. Reapply deletion markers, verified erasures, and consent or session revocations recorded after the restore point. If they cannot be reconstructed, invalidate restored sessions, clear consent, and omit uncertain records or sync slots. Reconcile billing against Stripe and confirm retained ciphertext belongs to a current slot before reconnecting writers. Roll frontend and Worker code forward against the migrated schema.

Inspect aggregate rate-limit rejections, email failures, webhook signature failures, reconciliation failures, sync capacity and model-budget exhaustion. Keep request bodies, billing URLs, email addresses, cookies, codes and sync credentials out of alerts or exports. Check Stripe delivery status after payment-method or signing-secret changes. Use Stripe test mode to exercise checkout, payment failure and cancellation. Verify DMARC aggregate reports from legitimate senders before changing the domain from monitoring to enforcement.

The hourly Production health workflow checks signed-out billing, the served privacy page and the maintenance heartbeat without credentials. The heartbeat turns unhealthy after an hour without maintenance, after a billing reconciliation failure or excessive backlog, on three mail delivery failures in the current hour, or at 80% of the shared storage, daily email or daily sync-write budget. The sync-write ceiling is 20,000 uploads per UTC day. GitHub sends workflow failure notifications according to the maintainer's notification settings.
