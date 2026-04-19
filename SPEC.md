# Lacuna — Product Spec
*Consolidated from brainstorm session 1. Reference doc for Claude Code.*

---

## What It Is

A low UI, self-memoir social space. Not a journal app. Not a chat app. A **reflection room.**

- AI-assisted, not AI-driven
- Helps form worldview **extrospectively** and identity **introspectively**
- Accessible to non-writers — AI scaffolds expression without writing *for* you
- The experience should feel like lying in bed staring into the void — your words float into space like unresolved feelings

**Domain:** getlacuna.com (working). lacuna.app / lacuna.io targeted for acquisition at launch.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Svelte 5 + SvelteKit (SPA mode) | Lighter reactivity, native animation primitives |
| Hosting | Cloudflare Pages | |
| API | Cloudflare Workers | AI synthesis, entry persistence |
| Database | Cloudflare D1 | Entries, user state, pattern accumulation |
| AI | Anthropic API via Workers | McAdams-backbone, multi-model dynamic |
| Auth | Magic link | Zero friction |

---

## Phase 1 Scope

**The private loop only.** Void + down. No social layer in Phase 1.

1. The void — type, float, solidify
2. The down space — see the shape of your story over time (three views)

---

## Spaces & Navigation

Navigation is **gestural and spatial** — no routes, no nav bars, no visible UI chrome. The user is always *somewhere* and *moves*.

| Gesture | Action | Notes |
|---|---|---|
| Type | Words appear as typed, floating in the void | Stream of consciousness |
| Hold | Solidify — commits the thought permanently | Soft hold, exhale-like fade animation on release |
| Swipe/move down | Enter the down space | See your story's shape over time |
| Swipe/move up | *(Phase 2)* Social layer | |
| Shake | Undo — clears current unsent draft only | Reactive gesture, different register |
| Desktop hold | Click and hold (equivalent of touch hold) | |

**The void always loads on open.** No prompt, no onboarding nudge. Typing is automatically registered. The canvas is always ready.

---

## The Void (Core Experience)

- Dark, minimal environment — pure negative space
- Text appears **as the user types**, floating in the void
- Words hover like unresolved feelings — no list, no lines, spatial placement
- **Hold to solidify** — the thought condenses, settles, becomes permanent. Animation: slow exhale/fade-in-place, not a dramatic transition
- No submit button, no send icon, no chrome
- Shake clears the current draft (unsaved/unsolidified text only)

---

## The Down Space (Story View)

Three views of the same underlying data — the user can move between them:

1. **Timeline** — chronological entries, sparse, readable
2. **Soul Map** — AI model weights and pattern dimensions visualized. Gauges/dimensions only render when they have sufficient data to be honest. Empty dimensions shown as unfilled — an invitation, not a failure.
3. **Living Memoir** — AI-synthesized narrative prose from entries over time. Rewritten periodically as new entries accumulate.

---

## AI Backbone — Multi-Model Dynamic System

The AI reads the nature of each entry and weights mental models dynamically. The user never sees model names in the reflection space — only plain language reflections of their patterns.

### Mental Models

| Model | Plain Language Label | Activates When |
|---|---|---|
| **McAdams' Narrative Identity** *(primary)* | *Story / Through-line* | Default — always active |
| **IFS (Internal Family Systems)** | *Voices* | Fragmented, conflicted, or self-contradicting writing |
| **Johari Window** | *Blind Spots* | Patterns in what is consistently avoided or unseen |
| **Jungian Shadow Work** | *What's Unsaid* | Persistent absences, suppressed themes across entries |
| **Narrative Therapy** (White & Epston) | *The Story You Keep Telling* | Dominant self-narrative detected; alternative threads present |
| **Erikson's Psychosocial Stages** | *Where You Are* | Life-stage themes: belonging, legacy, purpose, identity |

### How It Works

- Single entry: AI acknowledges and holds. No forced pattern.
- 5–10 entries: first dimensions begin to fill. Light reflections surface.
- 10–20+ entries: meaningful model weights emerge. Soul Map begins to take shape.
- AI surfaces patterns in **plain, felt language** — never clinical, never diagnostic.
- Model weights shift dynamically as writing evolves.

### Transparency Layer

- **Compendium** — optional, separate space. Explains each school of thought in accessible terms. Liner notes, not onboarding. Only accessible from the profile/insight space.
- **Dials** — user can adjust model weights manually. Lives in profile space only. Never visible in the void.
- Labels always use plain language. Academic names live only in the compendium.

---

## Social Layer *(Phase 2 — spec only)*

- **Completely separate space** from the void — you never feel another person while reflecting
- **Not a scrollable feed**
- Entry question each session: **"Do you want to see, or be seen today?"**
  - **See** — shown a story from a very different life (deliberate contrast, not algorithmic mirror)
  - **Be seen** — your anonymous story surfaces to someone like-minded
- All content anonymous by default
- User can explicitly publish a hand-written piece under their identity — opt-in only

---

## D1 Schema (Draft)

```sql
users (id, email, magic_token, created_at)
entries (id, user_id, body, created_at, solidified_at)
patterns (id, user_id, model_weights JSON, last_updated)
memoir_snapshots (id, user_id, prose, generated_at)
```

---

## Open Questions (Unresolved)

- Exact spatial placement logic for floating words — physics-based drift or static placement?
- What does the soul map look like visually — radial gauges, constellation, abstract form?
- Left/right gesture axes — deliberately empty for now, defined through use
- Shake on desktop — keyboard shortcut? Escape key?
- How does the living memoir regenerate — on every solidify, or periodically?
- Social curation philosophy — what makes a life "very different"? Needs a point of view.

---
*Last updated: session 1 — brainstorm complete, ready for Phase 1 build*