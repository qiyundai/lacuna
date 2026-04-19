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
| AI | Anthropic API (claude models, via Worker) |
| Auth | Magic link (Resend for email, `jose` for JWT) |

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
│   │   │   │   ├── +layout.svelte       ← auth gate overlay
│   │   │   │   ├── +page.svelte         ← spatial container (Void + DownSpace)
│   │   │   │   └── auth/verify/+page.svelte
│   │   │   └── lib/
│   │   │       ├── api.ts               ← typed fetch wrapper
│   │   │       ├── auth.ts              ← magic link, localStorage helpers
│   │   │       ├── gesture.ts           ← holdDetector, swipeDetector, shakeDetector
│   │   │       ├── stores/              ← Svelte 5 $state stores (session, draft, entries, patterns, memoir)
│   │   │       ├── utils/wordcloud.ts   ← grid-jitter word placement
│   │   │       └── components/          ← Void, DownSpace, Timeline, SoulMap, LivingMemoir
│   │   └── static/_redirects ← "/* /index.html 200" for Pages SPA routing
│   └── worker/               ← Cloudflare Worker
│       ├── wrangler.toml     ← D1 binding, FRONTEND_ORIGIN var
│       └── src/
│           ├── index.ts      ← Hono app entry, CORS, route registration
│           ├── types.ts      ← Env, row interfaces, JwtPayload
│           ├── db.ts         ← D1 query helpers
│           ├── schema.sql    ← canonical D1 schema (run with wrangler d1 execute)
│           ├── middleware/auth.ts   ← JWT verification (jose)
│           ├── routes/       ← auth, entries, patterns, memoir
│           └── ai/           ← models, prompts, analyzer
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

# 3. Apply schema locally and remotely
wrangler d1 execute lacuna-db --local  --file=src/schema.sql
wrangler d1 execute lacuna-db --remote --file=src/schema.sql

# 4. Set secrets (required for auth and AI)
wrangler secret put JWT_SECRET         # any strong random string
wrangler secret put RESEND_API_KEY     # from resend.com
wrangler secret put ANTHROPIC_API_KEY  # from console.anthropic.com

# 5. Set FRONTEND_ORIGIN in wrangler.toml [vars] for production
#    (already set to http://localhost:5173 for local dev)
```

---

## Architecture

### Data Flow

```
User types in Void
  → hold 600ms to solidify → POST /entries → D1 (entries)
  → async: AI analysis (Anthropic) → D1 (patterns)
  → async: memoir regeneration every 5 entries → D1 (memoir_snapshots)
```

### Auth Flow

1. User enters email → `POST /auth/request` → upsert user, generate UUID token, store with 15-min expiry, send Resend email
2. User clicks link → `/auth/verify?token=…` → `GET /auth/verify` → validate + clear token, issue 7-day HS256 JWT
3. Frontend stores JWT in `localStorage` as `lacuna_token`; `+layout.svelte` hydrates session on every load

### D1 Schema

```sql
users         (id, email, magic_token, magic_token_expires_at, created_at)
entries       (id, user_id, body, created_at, solidified_at)
patterns      (id, user_id, model_weights JSON, entry_count_at_last_memoir, last_updated)
memoir_snapshots (id, user_id, prose, generated_at)
```

### AI System

Runs asynchronously via `ctx.waitUntil()` after every solidified entry. Entry-count tiers:

| Entries | Model | Output |
|---|---|---|
| 1 | claude-haiku-4-5 | `acknowledgment` string only |
| 2–9 | claude-haiku-4-5 | `narrative_tone`, `emerging_theme`, `acknowledgment` |
| 10+ | claude-sonnet-4-6 | Full `weights` (0–1 per model) + `summaries` |
| 20+, every 5 | claude-sonnet-4-6 | Living Memoir prose (via `waitUntil`) |

Six models with plain-language labels and activation checks in `packages/worker/src/ai/models.ts`:

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
- `patterns.svelte.ts` — model weights from worker
- `memoir.svelte.ts` — latest prose snapshot

### Soul Map

SVG radial gauge. 6 arc segments (one per model). Arc fill = weight (0–1). Empty arcs render at 8% opacity — present but unfilled, never hidden. Active segments pulse with a `breathe` animation.

---

## Key UX Constraints

- The void always loads on open — no onboarding, no prompt
- Typing is automatically registered — no submit button, no chrome
- Hold = solidify (touch: soft hold; desktop: click and hold for 600ms)
- Shake = clear draft only (unsaved text, never permanent entries). Desktop = Escape key.
- iOS DeviceMotion requires permission; prompt fires after first solidify, Escape is permanent fallback if denied
- Soul Map dimensions that lack sufficient data show as unfilled (not hidden)
- `touch-action: none` on the Void prevents native scroll interfering with gesture detection
