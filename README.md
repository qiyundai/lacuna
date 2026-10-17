# Lacuna

A quiet reflection space. Open [Lacuna](https://lacuna-app.pages.dev) on a phone or computer, choose a private passphrase, and start writing. No account, email link, or desktop installation is needed for browser journaling. Hold to save a thought; move down to search your archive, keep thoughts close, and export your words.

## On your phone

1. Open the public URL in a normal browser tab.
2. Create a long, unique passphrase and save it in your password manager. It cannot be reset.
3. Write, then hold to save. On a keyboard, Control/Command+Enter also saves.
4. From your story's menu, open **privacy & storage** and download an encrypted browser backup.

The browser encrypts the journal using Web Crypto AES-256-GCM and PBKDF2-HMAC-SHA256 (600,000 iterations, random salt). Only ciphertext is persisted in IndexedDB. The passphrase and non-extractable key are held only in memory while unlocked. Atomic compare-and-replace transactions reject competing-tab writes; quota failures retain the last saved copy. The journal locks after 15 idle minutes and on reload. Clearing site storage, private browsing, or device loss can erase the only copy. Keep backups outside the browser.

Restore `.lacuna-web-vault` backups in another browser with their original passphrase. An existing encrypted copy is kept before replacement and can be downloaded under privacy & storage. Deleting this browser journal removes its active copy and those restore copies, not downloaded backups or other devices.

**Browser ChatGPT/cloud connections are not configured yet.** Phone writing works independently. OpenAI's [hosted application registration path](https://developers.openai.com/siwc/website) and [hosted plan-access requirement](https://developers.openai.com/siwc/token-sharing-open-source) must be completed before offering a hosted ChatGPT-plan connection. Do not adapt the local OAuth flow into a public website or put OAuth refresh tokens in browser storage. No hosted connection, account sync, or inference is claimed in release 0.4.0.

The optional Node companion retains the ChatGPT sign-in/inference and encrypted cloud-copy features described below. Its journal and backup format are separate from the browser journal. Existing companion data is not automatically moved, replaced, or merged.

Find a word across your story, keep thoughts close, explore recurring concepts, and revisit memoir editions. Release **0.3.0** makes encrypted local storage the default. AI sharing, automatic reflections, and encrypted cloud sync start off. Read the public [privacy declaration](https://lacuna-app.pages.dev/privacy), also available at `/privacy` in the companion. Deploy migration `0006_private_vault.sql` with the matching app and companion.

## ChatGPT plan companion

Use Node.js 22.16+ and pnpm 9+:

```bash
pnpm install --frozen-lockfile
pnpm companion
```

1. Open `http://127.0.0.1:1455` using this exact host.
2. Acknowledge data and privacy, then **Continue with ChatGPT**. No Lacuna email link is needed.
3. Complete OpenAI sign-in and authorize eligible ChatGPT plan use. Create a long, unique vault passphrase and save it in your password manager. **There is no passphrase recovery.** Returning users unlock their existing vault.
4. Open **Menu → privacy & storage** to migrate an older cloud journal, download an encrypted backup, and choose whether to enable AI sharing or cloud sync. These choices are separate from signing in. **AI & ChatGPT plan** selects an available model.
5. **Test ChatGPT connection** makes a small inference request without journal content. It uses plan allowance or credits and does not save an entry.
6. If you allow journal sharing, **refresh reflections** sends context directly to OpenAI. Automatic reflections require a second opt-in. Extraction processes up to ten thoughts per run; refresh again while a backlog remains. Requests use plan allowance or credits.

The companion follows [OpenAI's open-source registration flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). OpenAI determines eligibility, models, and limits. **Manage usage** opens [ChatGPT settings](https://chatgpt.com/settings/usage). Sign-in can succeed without plan-use permission; reconnect to grant it. There is no fallback provider or API key requirement.

The hosted app now opens its own encrypted browser journal; it does not redirect phones to localhost. It cannot open the companion's vault. New plaintext journal uploads and hosted AI result uploads still return 410. Older browser JWTs remain invalidated by the session requirement. A hosted OAuth callback requires separate OpenAI registration and is not configured here.

## Private storage and recovery

Vaults live in `~/.lacuna/vaults/<account-id>.vault`. AES-256-GCM uses a fresh 96-bit IV on each write, a 128-bit authentication tag, and format/account-bound additional authenticated data. The 256-bit key is derived with scrypt (`N=131072, r=8, p=1`) and a random 128-bit salt. Keys exist only in companion memory while unlocked. File writes are serialized, synced, and atomically replaced; plaintext is never written to a journal file. Local plaintext size is limited to 16 MiB. Locking cancels inference and clears UI state; idle polling does not extend the 15-minute lock timer.

**Download an encrypted backup** creates a `.lacuna-vault` file. From the lock screen, choose restore, select that file, and enter its original passphrase using the same ChatGPT identity. A current local vault is preserved as an encrypted conflict backup before replacement. Restores disable AI sharing and cloud sync. Markdown and JSON archive exports are **plaintext**, unlike vault backups.

Optional cloud sync sends only a supported encrypted envelope, never the passphrase/key or readable journal. Version comparisons reject conflicts. D1 stores bounded ciphertext chunks in the same transaction as the guarded version update, below its per-row size limit. Cloud copies support up to 6 MiB of base64 ciphertext (about 4.5 MiB of plaintext). Larger local vaults still save; sync reports an error. Turning sync off retains any remote copy. Explicit cloud deletion removes it and retains a version tombstone so stale devices cannot silently resurrect it. No automatic cross-device merge is implemented.

**Older journals:** the explicit migration first downloads an account-scoped consistent snapshot, encrypts and durably saves it, reads it back to verify it, then removes active plaintext source/derived records in a version-guarded transaction. A conflict or failed local save keeps server records. Until migration/deletion, older data remains readable by the backend. Backups may retain that older plaintext temporarily: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) retains 7 days on Free or 30 days on Paid. Migration never automatically merges retired email accounts or different ChatGPT registrations.

## Identity and credentials

The companion uses PKCE, state, nonce, and signed identity validation. Lacuna independently verifies the ID token against OpenAI's public keys, issuer, issued client ID, expiry, and a single-use server challenge. It issues a revocable 12-hour session kept only in the companion's protected credential store. A port-specific HttpOnly, SameSite cookie binds the browser; no bearer token or user identity is persisted in browser storage. Accounts use issuer/client/subject, never email matching. The backend retains a pseudonymous mapping rather than display email for ChatGPT identities. Old email accounts remain separate; email sign-in and old links are retired.

Access and refresh tokens stay in `~/.lacuna/chatgpt.credentials`, protected with Windows DPAPI or Unix mode-0600 permissions in a mode-0700 directory. The ID token reaches the Worker only for verification and is not stored there or returned to the browser. No OAuth tokens belong in source control, logs, or browser storage. Process locking and serialized refresh prevent token-rotation races. Disconnect clears local OAuth tokens and attempts remote revocation; it retains the public client registration so signing in again returns to the same account.

Keep the protected credential directory and its stable host/client registration. A fresh dynamic registration on another computer can produce a separate account identity; account transfer/linking is not implemented. Never copy another application's credentials.

The companion binds to loopback, validates Host and Origin, serves the built interface, and runs the shared analysis pipeline against the unlocked local vault. Context and generated text never travel through Lacuna's hosted AI endpoints. AI sharing requires explicit permission; disabling it or locking cancels running inference. OpenAI necessarily receives readable context. `store: false` does not promise zero retention; review OpenAI's policies/account controls. Local sign-in currently needs the identity service and expires after 12 hours; this release does not promise fully offline authentication.

No advertising/analytics SDK or geolocation/weather requests are included. Ambient color uses the local clock. Pages and the companion apply CSP (hashed static bootstrap / per-response nonce), framing restrictions, a device Permissions-Policy, and no-referrer. Sessions leave browser localStorage; login-rate buckets use daily keyed IP pseudonyms. Cloudflare/OpenAI still process their necessary service metadata. Keep the companion running for journaling/inference. After a crash, verify that no companion is running before removing its `companion.lock` file.

| Variable | Default | Purpose |
|---|---|---|
| `LACUNA_API_URL` | Production Worker | Backend; HTTPS required except loopback development |
| `LACUNA_PORT` | `1455` | UI and `/auth/callback` port |
| `LACUNA_DATA_DIR` | `~/.lacuna` | Private credential directory |

## Development and deployment

```bash
pnpm install
# Configure the D1 database ID in packages/worker/wrangler.toml.
pnpm -F worker db:migrate:local
# Set JWT_SECRET in the Worker's ignored .dev.vars for development.
pnpm dev:worker
# Set LACUNA_API_URL=http://127.0.0.1:8787 for the local companion.
pnpm companion
```

Production requires the Worker's `JWT_SECRET` and configured `FRONTEND_ORIGIN`, plus Cloudflare deployment credentials in CI. No email service or Anthropic secret is required. Pushes to `main` run checks, apply D1 migrations, deploy the Worker, then deploy Cloudflare Pages. Do not run remote migrations manually. ChatGPT-only sign-in requires `0004_chatgpt_identity.sql` before the updated Worker and companion.

```bash
pnpm check
pnpm test
pnpm build:frontend
pnpm build:companion
pnpm audit
pnpm preview:story     # Disposable sample story at http://127.0.0.1:1456
```

Tests use disposable SQLite data and simulated OpenAI responses. Real OAuth consent and model inference require acceptance testing with an eligible account. See [AUDIT.md](./AUDIT.md), [CLAUDE.md](./CLAUDE.md), and [SPEC.md](./SPEC.md) for verification scope, contributor guidance, and product conventions.

The sample-story preview builds into `.test-output/preview-app`, migrates synthetic entries from a disposable in-memory D1 fixture into a temporary encrypted vault, and never loads production data or OAuth credentials. The **sample-only** unlock passphrase is `sample story vault passphrase`. It uses ports 1456 and 8788 so the real companion on 1455 can remain open. Stop the preview before starting another instance.

## License

[MIT](./LICENSE)
