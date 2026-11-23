# Lacuna

A private journal that grows a city, one page at a time.

Open [Lacuna](https://lacuna.quietatlas.io) on a phone or computer, choose a passphrase, and start writing. Each page you keep lights a building in a valley city along a river. There is no account, email, or installation: the journal is encrypted and stored in your browser.

If you started a journal at [the original address](https://lacuna-app.pages.dev), open it there and download an encrypted backup in **Privacy & storage**. Restore the backup at the new address using your existing passphrase.

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
- **Music** opens the listening room: the song over the live city or arrival flight (the valley painting over journal pages), and the library beside it: albums to open one at a time, every song grouped under its album, and the songs lined up to play next. Shuffle or repeat, or find a song by title or album. While a song plays, its name rests in the bottom-left corner of the city; select it to return to the room.

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

The GitHub Actions repository variable `REFLECTIONS_ENABLED` controls launch. On a deploy, CI uses it for the frontend build and the Worker binding. Only the literal `true` enables subscriptions and background analysis. For local testing set `VITE_REFLECTIONS_ENABLED=true` in the frontend build or dev environment and `REFLECTIONS_ENABLED=true` in the Worker's ignored `.dev.vars`.

- In **Journal settings → AI reflections**, writers sign in with an email code, subscribe, and separately allow analysis of past and future pages. Work resumes whenever the browser is unlocked. Published chapters and the Soul Map stay in the encrypted vault after cancelling.
- A Pages function proxies `/reflections/*` to the Worker on the session's origin. Set `REFLECTION_WORKER_ORIGIN` on Pages if the Worker runs on another host. Both must use HTTPS in production.
- Worker secrets: `JWT_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`. Variables: `EMAIL_FROM` (a verified sender), `STRIPE_PRICE_ID` (a recurring price), `OPENAI_MODEL` (the evaluated Responses model). Enable the Stripe billing portal, apply migration 0007, and register `/reflections/webhook` for checkout completion, subscription created/updated/deleted, and invoice paid/payment-failed events. Use test credentials and a test price first.
- Spending limits: `REFLECTION_ACCOUNT_MICROS` and `REFLECTION_GLOBAL_MICROS` are monthly caps in millionths of a US dollar. `MODEL_INPUT_MICROS_PER_TOKEN` and `MODEL_OUTPUT_MICROS_PER_TOKEN` are the model's uncached rates in the same units. The Worker reserves a conservative budget before sending excerpts and reconciles it against reported usage. Generation is disabled when any limit or credential is missing.
- Checkout uses Stripe Tax and saves the billing address on the Stripe customer. Configure the seller's verified registrations, product tax code and recurring price tax behavior in the matching Stripe environment. Verify a taxable and a non-collecting location, webhook entitlement and portal cancellation in the sandbox before enabling live sales. Keep sandbox keys, webhooks and customers in a separate Worker and D1 database from production.
- `node scripts/evaluate-memoir.mjs` lists the synthetic review journals. With a model key, token rates, and an explicit `EVAL_BUDGET_USD`, `--live` generates blinded comparisons and cost measurements under `.test-output`. Score the outputs before opening the answer key.

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
pnpm test               # regression suite: disposable SQLite, no real AI requests
pnpm build:frontend
pnpm preview:web        # production build with a disposable encrypted sample on http://127.0.0.1:1457
```

`preview:web` serves the production build locally. Open `/fixture-setup` first: it runs real IndexedDB conflict and recovery checks in disposable storage, then creates a sample journal with the passphrase `sample phone journal passphrase`. It never touches production data.

### Layout

| Path | Contents |
|---|---|
| `packages/frontend` | SvelteKit single-page app: the city (`src/lib/town`), journal views, browser vault, sync, music player |
| `packages/frontend/src/lib/styles` | Design tokens, base styles, and shared primitives; see [DESIGN.md](./DESIGN.md) |
| `packages/worker` | Cloudflare Worker (Hono) on D1: encrypted browser sync and the reserved reflections service |
| `packages/shared` | Code shared by the app and the Worker |
| `tests`, `scripts` | Regression suite, previews, build and evaluation scripts |

The `/studio` routes are development views for individual buildings.

### Design

[DESIGN.md](./DESIGN.md) defines the interface: tokens for the paper and scene surfaces, serif type scales, 44px controls, the icon set, and the sound-control pattern. Read it before changing any styles.

### Albums and sound

To ship an album, put its audio and a UTF-8 M3U playlist under `packages/frontend/static/music/` and add the playlist path to `library.json`. The player reads the album name from `#PLAYLIST:`, titles and durations from `#EXTINF:`, and audio paths relative to the playlist. See [A River Remembers](packages/frontend/static/music/a-river-remembers.m3u8).

Valley ambience lives in `packages/frontend/static/valley-sounds/`, with its source in [credits.txt](packages/frontend/static/valley-sounds/credits.txt). [ASSETS.md](./ASSETS.md) lists which artwork and sound are reserved and which third-party assets keep their own licences.

### Deployment

Pushing to `main` runs checks and tests, applies D1 migrations, deploys the Worker, then deploys Cloudflare Pages. Never apply remote migrations by hand. Production needs the Worker's `JWT_SECRET` and `FRONTEND_ORIGIN` and Cloudflare credentials in CI. Browser sync needs migration `0008_browser_sync.sql` before the matching Worker and frontend are released.

## Further reading

- [SPEC.md](./SPEC.md): product specification
- [DESIGN.md](./DESIGN.md): design system
- [PRIVACY-ARCHITECTURE.md](./PRIVACY-ARCHITECTURE.md): privacy model and data flows
- [MOBILE-ONBOARDING.md](./MOBILE-ONBOARDING.md): phone onboarding direction
- [ASSETS.md](./ASSETS.md): artwork, music, and sound rights
- [AUDIT.md](./AUDIT.md): security audit and verification scope
- [CLAUDE.md](./CLAUDE.md): contributor guidance

## License

Copyright (C) 2026 Qiyun Dai

Lacuna is free software: you can redistribute it and modify it under the terms of version 3 of the [GNU Affero General Public License](./LICENSE) as published by the Free Software Foundation (`AGPL-3.0-only`). It is distributed in the hope that it will be useful, but without any warranty; without even the implied warranty of merchantability or fitness for a particular purpose. See the licence for details.

In short: you may read, run, modify, and share the code. If you run a modified version as a service that others use over a network, you must offer those users the corresponding source code under the same licence.

The licence covers the code only. Lacuna's own artwork, music, and sound are all rights reserved, and third-party models and textures keep their original licences; see [ASSETS.md](./ASSETS.md).

Versions published before this change remain available under the MIT licence they were released with.
