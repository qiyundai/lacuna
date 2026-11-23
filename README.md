# Lacuna

A private journal that grows a city, one page at a time.

Open [Lacuna](https://lacuna-app.pages.dev) on a phone or computer, choose a passphrase, and start writing. Each page you keep lights a building in a valley city along a river. There is no account, email, or installation: the journal is encrypted and stored in your browser.

## Using Lacuna

### Start

- **Create journal** asks for a passphrase of at least 12 characters. Save it in a password manager. **It cannot be reset**, and nobody else holds a copy.
- **Visit the example city** opens a sample journal to look around. Changes there last only for the visit.
- Returning visitors see **Unlock journal**. The journal locks on reload and after 15 idle minutes.

### Write and read

- **Write a page** (the pen, bottom right) opens a blank page of up to 500 characters. **Save page**, or press Control/Command+Enter.
- Saved pages appear as markers above their buildings. Select a marker or a building to read its page; buildings holding several pages let you turn between them. **Forget this page** removes a page from the active journal.
- **Pages** in the menu lists every page, with a link to visit each one in the city.

### Move around the city

Drag or use the arrow keys to orbit, right-drag to pan, and scroll or pinch to zoom. Home returns to the city. The menu offers **City view** and **Overlook**, and can pause ambient motion; Lacuna starts paused when the system asks for reduced motion. The light, sky, and windows follow your local time of day.

### Sound

Entering the valley starts a soundtrack and positional ambience: river, wind, leaves, birds, the ferry. The entry buttons show a speaker when sound will play.

- The **Sound** switch beside the menu button turns everything off or on. It is also on the loading screen and on open journal pages.
- **Soundtrack** and **Ambience** in the menu turn each channel off separately.
- **Music library** opens the player: browse the included album, queue tracks, shuffle and repeat, or **Add music** from your own files. Imported audio stays in this browser.

### Other views

The menu also leads to:

- **Journal**: your pages as a timeline. Filter to **kept close**, search with **find a word**, and keep a thought close from its reading view. Soul map and memoir are marked Coming soon.
- **Quiet writing**: a blank space for a single thought. Type, then hold for a moment (or press Control/Command+Enter) to save it.
- **Journal settings**: About Lacuna; Data and privacy; **Privacy & storage** (backups, restore, sync); **Export journal** as a Markdown book or JSON; Lock journal; and delete this browser journal. AI reflections are marked Coming soon.

### Install on a phone

Lacuna is an installable web app. Use the browser's **Add to Home Screen** or **Install** option to open it full-screen with its own icon. The journal remains tied to that browser's storage.

## Privacy and storage

The browser encrypts the journal with Web Crypto AES-256-GCM and a key derived by PBKDF2-HMAC-SHA256 (600,000 iterations, random salt). Only ciphertext is stored, in IndexedDB. The passphrase and the non-extractable key exist only in memory while the journal is unlocked. Atomic compare-and-replace transactions reject writes from competing tabs, and quota failures keep the last saved copy. No advertising or analytics SDK, geolocation, or weather requests are included. See [PRIVACY-ARCHITECTURE.md](./PRIVACY-ARCHITECTURE.md) and the in-app policy at `/privacy`.

**Keep a backup.** Clearing site storage, private browsing, or losing the device can erase the only copy. In **Journal settings → Privacy & storage**, download an encrypted `.lacuna-web-vault` backup. To restore it in any browser, choose **Restore from backup** on the passphrase screen and enter the original passphrase. A restored journal starts with sync off. A journal that is replaced is first kept as an encrypted copy, which you can download under Privacy & storage. Deleting the browser journal removes its active copy and those restore copies, but not downloaded backups or other devices.

Exports are **plaintext**, unlike backups.

### Optional browser sync

In **Privacy & storage**, enable encrypted sync and save the private pairing code. On another device, choose **Link a synced journal** on the passphrase screen and enter the code and the original passphrase. Sync runs while the journal is unlocked, and saves continue offline. Compatible additions from both devices are combined. When changes conflict, sync keeps both versions and offers to back up the local journal before using the online copy.

The browser generates a 256-bit random pairing secret. HKDF-SHA-256 derives independent storage-access and AES-GCM keys. The already passphrase-encrypted vault is encrypted again with a fresh 96-bit IV, and its version is authenticated. Device pairing settings and AI consent are not transferred. The service receives only a bearer credential and opaque ciphertext, and stores a hash of the credential as the storage address. Deleting the online copy leaves a version tombstone so that stale devices cannot upload it again. Transfers are limited to 8 MiB of encoded ciphertext; a larger journal still works locally.

## AI reflections · Coming soon

Background analysis and subscriptions are disabled in the public release (`aiAvailable` in `packages/shared/ai-release.ts`). The implementation reserved for launch works like this:

- In **Journal settings → AI reflections**, writers sign in with an email code, subscribe, and separately allow analysis of past and future pages. Work resumes whenever the browser is unlocked. Published chapters and the Soul Map stay in the encrypted vault after cancelling.
- A Pages function proxies `/reflections/*` to the Worker on the session's origin. Set `REFLECTION_WORKER_ORIGIN` on Pages if the Worker runs on another host. Both must use HTTPS in production.
- Worker secrets: `JWT_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`. Variables: `EMAIL_FROM` (a verified sender), `STRIPE_PRICE_ID` (a recurring price), `OPENAI_MODEL` (the evaluated Responses model). Enable the Stripe billing portal, apply migration 0007, and register `/reflections/webhook` for checkout completion, subscription created/updated/deleted, and invoice paid/payment-failed events. Use test credentials and a test price first.
- Spending limits: `REFLECTION_ACCOUNT_MICROS` and `REFLECTION_GLOBAL_MICROS` are monthly caps in millionths of a US dollar. `MODEL_INPUT_MICROS_PER_TOKEN` and `MODEL_OUTPUT_MICROS_PER_TOKEN` are the model's uncached rates in the same units. The Worker reserves a conservative budget before sending excerpts and reconciles it against reported usage. Generation is disabled when any limit or credential is missing.
- `node scripts/evaluate-memoir.mjs` lists the synthetic review journals. With a model key, token rates, and an explicit `EVAL_BUDGET_USD`, `--live` generates blinded comparisons and cost measurements under `.test-output`. Score the outputs before opening the answer key.

## Desktop companion (legacy)

A separate loopback companion predates the browser journal. It signs in with ChatGPT and runs reflections against a local vault using your ChatGPT plan. Existing desktop vaults stay in place. The hosted app cannot open a companion vault, and it never redirects phones to localhost.

```bash
pnpm install --frozen-lockfile
pnpm companion          # builds the app and serves it on http://127.0.0.1:1455
```

1. Open `http://127.0.0.1:1455`, using exactly that host.
2. Acknowledge data and privacy, then **Continue with ChatGPT**. Complete OpenAI sign-in and authorize eligible plan use.
3. Create or unlock the vault passphrase. **There is no recovery.**
4. **Privacy & storage** migrates an older cloud journal, downloads an encrypted backup, and toggles the optional encrypted cloud copy. Signing in does not enable sync.

In development builds with reflections enabled, **Test ChatGPT connection** sends a small request without journal content. With journal sharing allowed, **refresh reflections** sends context directly to OpenAI, up to ten thoughts per run; automatic reflections need a second opt-in. Requests use plan allowance or credits. OpenAI determines eligibility, models, and limits; **Manage usage** opens [ChatGPT settings](https://chatgpt.com/settings/usage). Sign-in follows [OpenAI's open-source registration flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). There is no fallback provider or API key.

| Variable | Default | Purpose |
|---|---|---|
| `LACUNA_API_URL` | Production Worker | Backend; HTTPS required except on loopback |
| `LACUNA_PORT` | `1455` | UI and `/auth/callback` port |
| `LACUNA_DATA_DIR` | `~/.lacuna` | Private credential directory |

### Companion storage

Vaults live in `~/.lacuna/vaults/<account-id>.vault`. AES-256-GCM uses a fresh 96-bit IV per write, a 128-bit tag, and additional authenticated data bound to the format and account. The 256-bit key comes from scrypt (`N=131072, r=8, p=1`) with a random 128-bit salt, and exists only in companion memory while unlocked. Writes are serialized, synced, and atomically replaced; plaintext never reaches a journal file. Plaintext is limited to 16 MiB. Locking cancels inference and clears UI state; idle polling does not extend the 15-minute lock.

**Download an encrypted backup** creates a `.lacuna-vault` file. Restore it from the lock screen with its original passphrase and the same ChatGPT identity. A current vault is preserved as an encrypted conflict backup first. Restores turn off AI sharing and cloud sync.

The optional cloud copy sends only a supported encrypted envelope. Version comparisons reject conflicts, and D1 stores bounded ciphertext chunks in the same transaction as the guarded version update. Cloud copies hold up to 6 MiB of base64 ciphertext (about 4.5 MiB of plaintext); larger vaults still save locally. Turning sync off keeps the remote copy; explicit deletion removes it and leaves a version tombstone. There is no automatic merge across devices.

**Older journals:** migration downloads an account-scoped snapshot, encrypts and saves it, reads it back to verify, then removes the plaintext server records in a version-guarded transaction. A conflict or failed save keeps the server records. Until then, the backend can read that data, and backups may retain it for a while: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) keeps 7 days on Free or 30 days on Paid. Retired email accounts and different ChatGPT registrations are never merged automatically.

### Companion identity and credentials

The companion uses PKCE, state, and a nonce. The Worker independently verifies the ID token's signature, issuer, issued client ID, expiry, and a single-use server challenge, then issues a revocable 12-hour session kept only in the companion's protected credential store. A port-specific HttpOnly, SameSite cookie binds the browser; no bearer token or identity is stored in browser storage. Accounts are keyed by issuer, client, and subject, never by email, and the backend keeps a pseudonymous mapping instead of the display email. Email sign-in and old links are retired.

Access and refresh tokens stay in `~/.lacuna/chatgpt.credentials`, protected with Windows DPAPI or Unix mode 0600 in a mode-0700 directory. The ID token reaches the Worker only for verification and is never stored or returned to the browser. Process locking and serialized refresh prevent token-rotation races. Disconnecting clears local tokens and attempts remote revocation, but keeps the public client registration so that signing in again returns to the same account. Keep the credential directory: a new registration on another computer can create a separate identity, and account linking is not implemented.

The companion binds to loopback and validates Host and Origin. Context and generated text never pass through Lacuna's hosted AI endpoints; OpenAI necessarily receives readable context, and `store: false` does not promise zero retention. Sign-in requires the identity service and expires after 12 hours. After a crash, confirm no companion is running before removing `companion.lock`.

## Development

Requires Node.js 22.16+ and pnpm 9+.

```bash
pnpm install
pnpm dev:frontend       # http://localhost:5173, the browser journal works on its own
pnpm dev:worker         # http://localhost:8787, needed for sync and reflections
```

For the Worker, set the D1 database ID in `packages/worker/wrangler.toml`, run `pnpm -F worker db:migrate:local`, and put `JWT_SECRET` in the ignored `packages/worker/.dev.vars`. `FRONTEND_ORIGIN` must match the frontend's exact origin.

```bash
pnpm check              # Svelte diagnostics and Worker type check
pnpm test               # regression suite: disposable SQLite, simulated OpenAI, no real AI requests
pnpm build:frontend
pnpm build:companion
pnpm preview:story      # disposable sample story on http://127.0.0.1:1456
```

`preview:story` builds into `.test-output/preview-app`, migrates synthetic entries from an in-memory D1 fixture into a temporary encrypted vault, and never touches production data or OAuth credentials. Its sample-only passphrase is `sample story vault passphrase`. It uses ports 1456 and 8788, so the companion on 1455 can stay open.

### Layout

| Path | Contents |
|---|---|
| `packages/frontend` | SvelteKit single-page app: the city (`src/lib/town`), journal views, browser vault, sync, music player |
| `packages/frontend/src/lib/styles` | Design tokens, base styles, and shared primitives; see [DESIGN.md](./DESIGN.md) |
| `packages/worker` | Cloudflare Worker (Hono) on D1: sync, privacy, reflections, legacy companion APIs |
| `packages/companion` | Legacy loopback companion |
| `packages/shared` | Code shared by the app, Worker, and companion |
| `tests`, `scripts` | Regression suite, previews, build and evaluation scripts |

The `/studio` routes are development views for individual buildings.

### Design

[DESIGN.md](./DESIGN.md) defines the interface: tokens for the paper and scene surfaces, serif type scales, 44px controls, the icon set, and the sound-control pattern. Read it before changing any styles.

### Albums and sound

To ship an album, put its audio and a UTF-8 M3U playlist under `packages/frontend/static/music/` and add the playlist path to `library.json`. The player reads the album name from `#PLAYLIST:`, titles and durations from `#EXTINF:`, and audio paths relative to the playlist. See [A River Remembers](packages/frontend/static/music/a-river-remembers.m3u8).

Valley ambience lives in `packages/frontend/static/valley-sounds/`, with its source and licence in [credits.txt](packages/frontend/static/valley-sounds/credits.txt).

### Deployment

Pushing to `main` runs checks and tests, applies D1 migrations, deploys the Worker, then deploys Cloudflare Pages. Never apply remote migrations by hand. Production needs the Worker's `JWT_SECRET` and `FRONTEND_ORIGIN` and Cloudflare credentials in CI. Browser sync needs migration `0008_browser_sync.sql` before the matching Worker and frontend are released.

## Further reading

- [SPEC.md](./SPEC.md): product specification
- [DESIGN.md](./DESIGN.md): design system
- [PRIVACY-ARCHITECTURE.md](./PRIVACY-ARCHITECTURE.md): privacy model and data flows
- [MOBILE-ONBOARDING.md](./MOBILE-ONBOARDING.md): phone onboarding direction
- [AUDIT.md](./AUDIT.md): security audit and verification scope
- [CLAUDE.md](./CLAUDE.md): contributor guidance

## License

Copyright (C) 2026 Qiyun Dai

Lacuna is free software: you can redistribute it and modify it under the terms of version 3 of the [GNU Affero General Public License](./LICENSE) as published by the Free Software Foundation (`AGPL-3.0-only`). It is distributed in the hope that it will be useful, but without any warranty; without even the implied warranty of merchantability or fitness for a particular purpose. See the licence for details.

In short: you may read, run, modify, and share the code. If you run a modified version as a service that others use over a network, you must offer those users the corresponding source code under the same licence.

Versions published before this change remain available under the MIT licence they were released with.
