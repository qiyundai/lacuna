# Lacuna

A low-UI, self-memoir reflection space.

Not a journal app. Not a chat app. A room you type into when you're staring at the ceiling. Words float into the void. Hold to solidify a thought. Swipe down to see the shape of your story over time.

> [getlacuna.com](https://getlacuna.com)

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
| AI | Anthropic API (Claude Haiku 4.5 + Sonnet 4.6) |
| Auth | Magic link (Resend + JWT via `jose`) |

Monorepo managed with pnpm workspaces.

---

## Quickstart

```bash
pnpm install

# In packages/worker:
wrangler d1 create lacuna-db                                        # paste id into wrangler.toml
wrangler d1 execute lacuna-db --local  --file=src/schema.sql
wrangler d1 execute lacuna-db --remote --file=src/schema.sql
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# From the repo root:
pnpm dev:worker     # → http://localhost:8787
pnpm dev:frontend   # → http://localhost:5173
```

Build and deploy:

```bash
pnpm build:frontend     # outputs to packages/frontend/build/
pnpm build:worker       # type-check (wrangler bundles at deploy)
pnpm deploy:worker      # wrangler deploy
```

The frontend deploys via Cloudflare Pages CI on push to `main`.

---

## Repo layout

```
lacuna/
├── SPEC.md                 ← authoritative product spec
├── CLAUDE.md               ← contributor / agent guide
└── packages/
    ├── frontend/           ← SvelteKit SPA
    └── worker/             ← Cloudflare Worker (Hono + D1 + Anthropic)
```

For implementation detail and architectural conventions, see [`CLAUDE.md`](./CLAUDE.md). For the product vision, see [`SPEC.md`](./SPEC.md).

---

## License

[MIT](./LICENSE)
