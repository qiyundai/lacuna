# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What Lacuna Is

A low-UI, self-memoir reflection space — not a journal app, not a chat app. The full product spec lives in `SPEC.md` and is the authoritative reference.

Core experience: the user types into **the void**, holds to solidify a thought, and swipes down to see the shape of their story over time. No nav bars, no routes, no visible chrome. Navigation is gestural and spatial.

**Phase 1 scope:** private loop only — the void + the down space. No social layer.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 + SvelteKit (SPA mode, `adapter-static`) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers (Hono router) |
| Database | Cloudflare D1 (SQLite) |
| Journal storage | Passphrase-encrypted browser vault (Web Crypto + IndexedDB) |
| Sync | Account-free, end-to-end encrypted snapshots in D1 |
| AI | Reserved and disabled in the public release (`aiAvailable`) |

---

## Monorepo Structure

```
lacuna/
├── package.json              ← workspace root (pnpm)
├── pnpm-workspace.yaml
├── packages/
│   ├── frontend/             ← SvelteKit SPA
│   │   ├── svelte.config.js  ← adapter-static, fallback: 'index.html'
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── +layout.ts           ← ssr:false, prerender:false
│   │   │   │   ├── +layout.svelte       ← vault gate (lock screen)
│   │   │   │   ├── +page.svelte         ← spatial container (Void + DownSpace)
│   │   │   └── lib/
│   │   │       ├── api.ts               ← typed journal API (served in-browser by web-api.ts)
│   │   │       ├── web-vault.ts         ← encrypted IndexedDB vault
│   │   │       ├── web-api.ts           ← journal operations against the vault
│   │   │       ├── browser-sync.ts      ← pairing-code encrypted sync
│   │   │       ├── gesture.ts           ← holdDetector, swipeDetector, shakeDetector
│   │   │       ├── stores/              ← Svelte 5 $state stores (session, draft, entries, patterns, memoir)
│   │   │       ├── utils/wordcloud.ts   ← grid-jitter word placement
│   │   │       └── components/          ← Void, DownSpace, Timeline, BookReader, VaultGate
│   │   └── static/_redirects ← "/* /index.html 200" for Pages SPA routing
│   └── worker/               ← Cloudflare Worker
│       ├── wrangler.toml     ← D1 binding, FRONTEND_ORIGIN var
│       ├── migrations/       ← numbered D1 migrations (applied by CI on deploy)
│       └── src/
│           ├── index.ts      ← Hono app entry, CORS, route registration
│           ├── types.ts      ← Env and row interfaces
│           ├── ratelimit.ts  ← rate limits, IP pseudonyms, token hashing
│           ├── routes/       ← browser-sync, reflections (disabled)
│           └── ai/           ← reflection prompts and the evaluation baseline pipeline
```

---

## Build Commands

```bash
# Development
pnpm dev:frontend    # SvelteKit dev server → http://localhost:5173
pnpm dev:worker      # Wrangler dev server  → http://localhost:8787

# Production build (type-check + compile)
pnpm build:frontend  # outputs to packages/frontend/build/
pnpm build:worker    # tsc --noEmit (wrangler bundles at deploy time)
pnpm check          # frontend diagnostics + worker type check
pnpm test           # regression suite (no real AI requests)
pnpm preview:web    # production build + disposable encrypted sample on 127.0.0.1:1457

# Deploy
pnpm deploy:worker   # wrangler deploy
# Frontend deploys via Cloudflare Pages CI on push to main
```

---

## First-Time Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create D1 database and paste the returned database_id into wrangler.toml
cd packages/worker
wrangler d1 create lacuna-db

# 3. Apply migrations locally (remote is applied automatically by CI on deploy)
pnpm -F worker db:migrate:local

# 4. Set the server secret (keys IP pseudonyms for rate limits)
wrangler secret put JWT_SECRET         # any strong random string

# 5. Set FRONTEND_ORIGIN in wrangler.toml [vars] for production
#    (already set to http://localhost:5173 for local dev)
```

### Adding a schema change

```bash
cd packages/worker
wrangler d1 migrations create lacuna-db add_thing   # creates migrations/NNNN_add_thing.sql
# edit the file, then:
pnpm db:migrate:local                                # apply locally
```

Commit the new migration file with the code that depends on it. CI applies it to remote D1 before deploying the worker on push to `main` — never run `db:migrate:remote` by hand.

---

## Architecture

### Data Flow

Lacuna is a browser journal at the public URL. No account, email or installation is required. `frontend/src/lib/web-vault.ts` uses Web Crypto AES-GCM/PBKDF2 and atomic IndexedDB envelope comparison; `web-api.ts` serves journal operations entirely in-browser. No plaintext journal, passphrase, or key is sent to the backend. Optional browser sync transfers a versioned encrypted snapshot using an account-free pairing code. AI reflections are gated separately and remain disabled in the public release. Never redirect hosted users to localhost.

```
User types in Void
  → hold 600ms to solidify → web-api /entries → encrypted IndexedDB vault
  → optional encrypted sync → /journal-sync → versioned ciphertext chunks in D1
```

### Worker

The Worker serves only `/journal-sync` (bearer pairing credential, hashed into a storage slot; rate limits use daily keyed IP pseudonyms) and `/reflections` (503 while `aiAvailable` is false). Migration 0009 dropped the tables from pre-release prototypes; D1 holds only `browser_sync*`, `rate_limits` and the reserved `reflection_*` tables. Update the in-app policy at `routes/privacy/+page.svelte` whenever data handling changes.

### AI System

Reserved for a later release. The planned flow is the Living Book: `shared/living-book.ts` plans tasks in the browser, and `/reflections` adds email-code sign-in, a Stripe subscription, consent and spending caps before forwarding bounded excerpts to OpenAI (see README). `ai/pipeline.ts`, `prompts.ts`, `graph.ts` and `validation.ts` are kept as the comparison baseline for `scripts/evaluate-memoir.mjs`. Six lenses with plain-language labels and activation checks in `packages/worker/src/ai/models.ts`:

| Model | Plain Label | Activates When |
|---|---|---|
| McAdams' Narrative Identity | Story / Through-line | Always |
| IFS | Voices | "part of me", contradictions |
| Johari Window | Blind Spots | Systematic theme absence (10+ entries) |
| Jungian Shadow | What's Unsaid | Recurring negations |
| Narrative Therapy | The Story You Keep Telling | Same self-descriptor 3+ times |
| Erikson's Psychosocial | Where You Are | Life-stage vocabulary |

### Navigation (gestural, no router)

- **Void ↔ Down Space:** `translateY` on a 200vh container. Swipe down or mouse wheel to enter Down Space; swipe up to return.
- **Timeline / Soul Map / Living Memoir:** `translateX` on a 300% container. Horizontal swipe between views.
- Hold 600ms in the void = solidify. Pointer movement >8px during hold = cancel.
- Shake (DeviceMotion) or Escape key = clear draft only (never deletes saved entries).

### Frontend Stores (Svelte 5 `$state`)

All stores live in `packages/frontend/src/lib/stores/`. They are plain module-level `$state` objects (not legacy `writable` stores):

- `session.svelte.ts` — auth status, user object
- `draft.svelte.ts` — current unsaved text + floating word positions
- `entries.svelte.ts` — solidified entries, keyset pagination
- `patterns.svelte.ts` — model weights from the vault
- `memoir.svelte.ts` — latest prose snapshot
- `vault.svelte.ts` — vault status and controls (`vaultRequest`)

### Soul Map and Living Memoir

Both views render through `BookReader.svelte` from the encrypted vault's `book`, and are marked Coming soon while `aiAvailable` is false. Do not infer relationship edges from aggregate counts.

### Private archive

`web-api.ts` handles `GET /entries` with literal `q` search and `kept=1`, using cursors bound to the query. `PATCH /entries/:id/keep` changes only `kept_at`. `GET /story/export` never includes the passphrase, pairing code or keys. Forgetting a page clears its words and derived text, keeping only its city address.

`pnpm preview:web` builds the production app and serves it on 127.0.0.1:1457. Open `/fixture-setup` first to run IndexedDB checks and create a disposable sample journal. Never use real passphrases or journal text in QA.

---

## Key UX Constraints

- The void always loads on open — no onboarding, no prompt
- Typing is automatically registered — no submit button, no chrome
- Hold = solidify (touch: soft hold; desktop: click and hold for 600ms)
- Shake = clear draft only (unsaved text, never permanent entries). Desktop = Escape key.
- iOS DeviceMotion requires permission; prompt fires after first solidify, Escape is permanent fallback if denied
- Soul Map dimensions that lack sufficient data show as unfilled (not hidden)
- `touch-action: none` on the Void prevents native scroll interfering with gesture detection

---

## Design System

`DESIGN.md` defines the tokens, surfaces (paper vs. scene), control primitives, icon set, sound-control pattern and layout rules. Read it before styling anything. In short: colors and sizes come from `src/lib/styles/tokens.css` only; icons come from `Icon.svelte`; round controls use `IconAction` / `.scene-control` / `.paper-control` at 44px; a pattern used twice moves to `src/lib/styles/components.css`.

---

## UI & Interaction Philosophy (Mandatory)

Lacuna is a **low-UI, gestural space**. Every interface element must dissolve into the experience rather than announce itself. These are not preferences — violating them is a defect:

- **No widget chrome.** No dropdown boxes, bordered panels, modals with headers, toolbars, or conventional UI affordances. These shatter the space.
- **Full-screen layers only.** Any overlay, menu, or informational screen must fill the full viewport — blurred backdrop, content centered and breathable, no containing box or card. The space itself is the container.
- **Always easing.** Every state transition — open, close, reveal, dismiss — must carry a CSS or Svelte transition with an easing curve (`cubic-bezier` or equivalent). Instant cuts are not permitted.
- **Spacious text.** Interactive items and prose need generous `line-height` (1.7+), `letter-spacing`, and vertical rhythm. Density reads as foreign here.
- **Gestural dismissal.** Overlays close by touching or clicking anywhere (the full backdrop is the dismiss target). Explicit close buttons may exist but must be faint and secondary.
- **Escape the transform stack.** Any full-screen overlay must be rendered outside transformed ancestors using a `portal` action (appends to `document.body`). The `space-container` in `+page.svelte` applies `transform: translateY(...)`, which traps `position: fixed` children — always portal overlays to body to avoid this.
