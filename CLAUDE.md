# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What Lacuna Is

A low-UI, self-memoir reflection space — not a journal app, not a chat app. The full product spec lives in `SPEC.md` and is the authoritative reference.

Core experience: the user types into **the void**, holds to solidify a thought, and swipes down to see the shape of their story over time. No nav bars, no routes, no visible chrome. Navigation is gestural and spatial.

**Phase 1 scope:** private loop only — the void + the down space. No social layer.

---

## Intended Stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 + SvelteKit (SPA mode) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| AI | Anthropic API (claude models) |
| Auth | Magic link |

**Note:** As of initial commit, this is a spec-only repo. No source code exists yet.

---

## Architecture (Planned)

### Data Flow

```
User types in Void
  → hold to solidify → Worker API → D1 (entries table)
  → AI analysis (Anthropic API via Worker) → D1 (patterns table)
  → periodic memoir regeneration → D1 (memoir_snapshots table)
```

### D1 Schema

```sql
users (id, email, magic_token, created_at)
entries (id, user_id, body, created_at, solidified_at)
patterns (id, user_id, model_weights JSON, last_updated)
memoir_snapshots (id, user_id, prose, generated_at)
```

### AI System

The AI dynamically weights 6 psychological models based on the nature of entries. Users never see model names — only plain-language reflections. Models:

- **McAdams' Narrative Identity** — always active (primary backbone)
- **IFS** — activates on fragmented/conflicted writing
- **Johari Window** — activates on patterns of avoidance
- **Jungian Shadow** — activates on persistent absences/suppressed themes
- **Narrative Therapy** — activates on dominant self-narrative detection
- **Erikson's Psychosocial Stages** — activates on life-stage themes

Single entry: AI holds and acknowledges, no forced pattern. Patterns begin to emerge at 5–10 entries.

### Three Down-Space Views

1. **Timeline** — chronological, sparse
2. **Soul Map** — model weights/pattern dimensions visualized; dimensions only render when data is sufficient to be honest
3. **Living Memoir** — AI-synthesized narrative prose, regenerated as entries accumulate

---

## Key UX Constraints

- The void always loads on open — no onboarding, no prompt
- Typing is automatically registered — no submit button, no chrome
- Hold = solidify (touch: soft hold; desktop: click and hold)
- Shake = undo/clear current draft only (unsaved text, never permanent entries)
- Shake on desktop is unresolved — see Open Questions in `SPEC.md`
- Model weights are user-adjustable but only in the profile space, never visible in the void
- Soul Map dimensions that lack sufficient data show as unfilled (not hidden)

---

## Build Commands

*(To be documented once scaffolding is created. Expected: `pnpm` as package manager, SvelteKit CLI for dev/build, Wrangler CLI for Workers/D1.)*
