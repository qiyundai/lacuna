# Lacuna

A low-UI, self-memoir reflection space.

Not a journal app. Not a chat app. A room you type into when you're staring at the ceiling. Words float into the void. Hold to solidify a thought. Swipe down to see the shape of your story over time.

---

## What it does

- **The Void** — type into empty space. Words hover where you leave them. Hold to commit a thought permanently.
- **The Down Space** — three views of what you've written:
  - *Timeline* — chronological, sparse, readable
  - *Soul Map* — a radial gauge of six psychological models (McAdams, IFS, Johari, Jungian Shadow, Narrative Therapy, Erikson) weighted by what your entries actually reveal
  - *Living Memoir* — AI-synthesized prose, rewritten as you accumulate entries

Navigation is gestural. No routes, no nav bar, no visible chrome. You're always somewhere, and you move.

Phase 1 is the private loop only. No social layer yet.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Svelte 5 + SvelteKit (SPA, `adapter-static`) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 |
| AI | Hosted Anthropic, or a user's ChatGPT plan through the local companion |
| Auth | Magic link (Resend + JWT via `jose`) |

Monorepo managed with pnpm workspaces.

---

## Quickstart

```bash
pnpm install

# Node.js 22.16+ and pnpm 9+ are required.
# In packages/worker:
pnpm exec wrangler d1 create lacuna-db   # paste the ID into wrangler.toml
pnpm db:migrate:local
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# From the repo root:
pnpm dev:worker     # → http://localhost:8787
pnpm dev:frontend   # → http://localhost:5173
```

For local development, set `FRONTEND_ORIGIN=http://localhost:5173` in the worker's ignored `.dev.vars`. Email delivery requires a Resend key. To print development sign-in links to the worker console instead, explicitly set `ALLOW_DEV_AUTH=true` in that local file. Production fails closed when email delivery is not configured. Consent is required before requesting a sign-in link.

Build and deploy:

```bash
pnpm build:frontend     # outputs to packages/frontend/build/
pnpm build:worker       # type-check (wrangler bundles at deploy)
pnpm deploy:worker      # wrangler deploy
```

The frontend deploys via Cloudflare Pages CI on push to `main`.
CI applies versioned D1 migrations before deploying the worker. Do not apply remote migrations manually. This change requires migration `0003_analysis_consistency.sql` and both the worker and frontend deployment before companion use.

## ChatGPT plan companion

Keep using the hosted app for writing and reading. To generate reflections with an eligible ChatGPT plan, run the companion on your own computer:

```bash
pnpm install --frozen-lockfile
pnpm companion
```

1. Open `http://127.0.0.1:1455` (use this exact host, not `localhost`).
2. Sign in to your existing Lacuna account by email. The email link returns to the companion.
3. Open your story with the down arrow, then **Menu → AI & ChatGPT plan → Continue with ChatGPT**.
4. Authorize ChatGPT plan usage in OpenAI's browser flow. Successful authorization selects ChatGPT as your reflection provider. A first-use confirmation explains plan usage.
5. Choose an account-available model in the same settings. New saved thoughts trigger local inference; **refresh reflections** retries failed work or processes existing entries. Large extraction backlogs are processed in batches of ten; refresh again while work remains.

The companion uses [OpenAI's documented open-source registration flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), not a pasted API key or another application's credentials. Account eligibility, limits, and model availability are determined by OpenAI. **Manage usage** opens [ChatGPT settings](https://chatgpt.com/settings/usage).

Entries, generated reflections, and account management remain on the hosted Lacuna backend. The companion downloads the signed-in account's reflection context, sends it directly to OpenAI's Responses API, and uploads validated results. OAuth access, refresh, and retained ID tokens never go to Lacuna's Worker or browser storage. Credentials live in `~/.lacuna/chatgpt.credentials`: DPAPI encryption for the current Windows user, or a mode-0600 file inside a mode-0700 directory on Unix. A process lock prevents concurrent refresh-token rotation. Disconnect removes local credentials and attempts remote session revocation; the interface reports when revocation was not confirmed.

The companion binds only to loopback and serves the same built interface locally. It checks the Host, browser Origin, and a local HttpOnly cookie. It deliberately does not expose a cross-origin token or inference endpoint to the hosted website. Keep it running for subscription inference. Writing in the hosted app still saves entries when it is stopped; open the companion and refresh to process them. No provider is silently substituted when ChatGPT is disconnected or limited. **Use hosted reflections instead** explicitly restores the Anthropic integration.

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `LACUNA_API_URL` | Existing production worker URL | Hosted backend; HTTPS required except loopback development |
| `LACUNA_PORT` | `1455` | Loopback UI and `/auth/callback` port |
| `LACUNA_DATA_DIR` | `~/.lacuna` | Protected credential directory; use a private local directory |

After an unclean process exit, verify no companion is running before removing its `companion.lock`. Each computer needs its own sign-in and stable host ID. The current companion maintains one selected ChatGPT account/workspace per Lacuna account; disconnect before choosing a different one. Keep local credential files out of synced/shared folders.

## Validation

```bash
pnpm check             # Svelte diagnostics and worker TypeScript
pnpm test              # SQLite migration/routes, auth, AI, OAuth, SSE, gestures, state and companion integration
pnpm build:frontend
pnpm build:companion
pnpm audit             # Full dependency tree
```

Tests simulate OpenAI responses and run against disposable local data. They do not spend plan usage or send emails. Live OAuth, real model inference, and production Cloudflare deployment require separate validation. See [AUDIT.md](./AUDIT.md) for findings and limits.

---

## Repo layout

```
lacuna/
├── SPEC.md                 ← authoritative product spec
├── CLAUDE.md               ← contributor / agent guide
└── packages/
    ├── frontend/           ← SvelteKit SPA
    ├── worker/             ← Cloudflare Worker (Hono + D1 + hosted analysis)
    └── companion/          ← Local ChatGPT OAuth and inference runtime
```

For implementation detail and architectural conventions, see [`CLAUDE.md`](./CLAUDE.md). For the product vision, see [`SPEC.md`](./SPEC.md).

---

## License

[MIT](./LICENSE)
