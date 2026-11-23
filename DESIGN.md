# Lacuna design system

How the interface is put together, so new work lands consistently. The
philosophy (low UI, gestural, full-screen layers, always easing) is in
`CLAUDE.md` and `SPEC.md`; this file is the concrete vocabulary.

## Where styles live

| File | Holds | Rule |
|---|---|---|
| `src/lib/styles/tokens.css` | Every color, size, radius, shadow, duration | The only file with raw hex values for UI |
| `src/lib/styles/base.css` | Reset, document defaults, global focus, reduced motion | No component styling |
| `src/lib/styles/components.css` | Primitives used by two or more components | Promote a pattern here on its second use |
| Component `<style>` | Layout and one-off styling for that component | Reference tokens; no new hex values |
| `static/city/arrival.css` | Pre-hydration loading screen | Mirrors token values by hand; it paints before `app.css` loads |

`src/app.css` only imports the three files above, in that order.

**Exempt from the no-hex rule:** scene art that is not interface (the sky
placeholder gradient in `JournalCity`, weather glows in `Void`), SVG mask
luminance in `Icon`, and the `/studio` development pages.

## Two surfaces

Every element sits on one of two surfaces. Pick tokens from that surface's
group; never mix (for example, no `--scene-ink` text on paper).

| | Paper | Scene |
|---|---|---|
| Where | Sheets, forms, journal, reading views, music player | Over the city canvas, films and imagery |
| Background | `--paper`, `--field`, `--valley` | The scene itself; `--scene-scrim` behind the top bar |
| Text | `--ink` › `--ink-muted` › `--ink-subtle` | `--scene-ink` › `--scene-ink-muted`, with `--scene-type-shadow` |
| Interactive | `--accent` for links, hover, active | `--scene-control` fill, `--scene-control-hover`, `--scene-raised` for primary/open |
| Focus | `--focus` (accent) | `--scene-focus` (gold) |
| Lines | `--line` decorative, `--line-strong` inputs, `--rule` dividers | — |

Text contrast on `--paper`: `--ink` 11:1, `--ink-muted` 6.3:1, `--ink-subtle`
5.4:1. `--ink-subtle` is the floor; there is no lighter text color, including
placeholders.

`--lavender`, `--moss` and `--rose` are story tones for data (soul map points,
kept marks). They are not general accents.

## Controls

All icon controls are **44px round** (`--control`) with **20px icons**
(`--icon`, `--icon-sm` 18px in the dense music player). Controls in a row or
column are separated by `--control-gap` (8px).

| Primitive | Use | Markup |
|---|---|---|
| `.scene-control` | Items inside the menu | `<IconAction>` (default `tone="wash"`) |
| `.scene-control.solid` | Controls always on screen over the scene: menu button, sound, film play/pause | `<IconAction tone="solid">` |
| `.scene-control.raised` | The one primary action (write a page), and the open menu button | `<IconAction tone="raised">` |
| `.paper-control` | Icon buttons on paper: close, sound, page turns | `<button class="paper-control"><Icon …/></button>` |
| `.atlas-primary` | The main text button on a paper form | Pill, ink fill; icons inside are spaced by its `gap`; add `.danger` for a destructive confirm |
| `.atlas-link` | Secondary actions on paper | Underlined accent text, 44px tall; `.subtle` (small, quiet) and `.danger` variants. Wrap a run of them in `.atlas-links` so they stack without extra gaps |
| `.quiet-toggle` | Lowercase text switches on reading pages: filters, map modes, the story-view tabs | Inside `.quiet-toggles`; the chosen one (`aria-pressed`/`aria-current`) darkens and gains a short rule. Counts go in `<span class="count">` |

### Sheets

Settings and notes are full-screen paper layers built from one pattern —
don't give a sheet its own heading size, column width or button style:

```html
<div class="sheet-screen" role="dialog" …>   <!-- the dismiss target -->
  <div class="journal-sheet">                <!-- one left-aligned column -->
    <h2>…</h2> <p>…</p> <p class="note">…</p>
    <section><h3>…</h3> …</section>          <!-- ruled off from the intro -->
    <div class="sheet-foot">…atlas-links…</div>
  </div>
</div>
```

Stack order between sheets is set inline (`style:z-index`) when one sheet can
open over another.

Captions (`.scene-caption`) sit **left** of controls in vertical stacks and
**below** controls in rows along the top edge (add `.captions-below` to the
row's container). Captions in the menu stay visible on touch
screens (`labelled`); persistent top-bar controls show theirs on hover/focus
only (`labelled={false}`).

When an icon button sits at the edge of a text column, pull it out by half its
padding so the glyph, not the hit area, lines up with the text:
`margin-inline: calc((var(--icon) - var(--control)) / 2)`.

## Icons

`src/lib/components/Icon.svelte` is the single icon set: 24×24 grid, round
caps and joins, stroke at `--icon-stroke`. Add new glyphs there; don't inline
SVG paths in components. Size follows `--icon-size` (defaulting to `--icon`),
so a container can scale every icon inside it.

Toggles show their off state with `off`, which cuts a masked slash through the
glyph. Don't draw a separate "muted"/"disabled" glyph and don't overlay a line.

## Sound

Valley audio plays by default, so the controls follow a fixed pattern:

- **`SoundToggle`** is the master switch. It is present wherever audio can be
  playing: the top bar (`<Masthead audio>`), the loading screen
  (`<ValleyLoading audio>`), and the open journal page (`surface="paper"`).
  Accessible name "Sound", `aria-pressed` true while sound is on.
- **Channel toggles** (Soundtrack, Ambience) live in the menu's sound group via
  `<Masthead sound={…}>`, next to Music. They don't close the menu.
  The sound group, Music included, always sits after a small break at
  the end of the menu, even on pages without toggles.
- **Music** has two places and no others. `NowPlaying` is one line of scene
  type in the city's bottom-left (it gives way to save notices), naming the
  song with a pause control; it settles to a whisper after a few seconds.
  The listening room (`AlbumPlayer`) is a full-screen layer: the valley
  painting with the song and transport on the scene side, the tracklist on
  paper beside it (below it on phones). No floating player cards, volume
  sliders or native dropdowns — device volume and the sound switches cover it.
- **`SoundCue`** marks an action that will start audio (entering the valley).
  It appears only when sound will actually play, and the action's accessible
  name must also say "with sound" — use `willPlaySound()` for both.

## Layout

| Token | Value | Use |
|---|---|---|
| `--gutter` | 18–80px fluid | Left/right edge of everything anchored to the viewport |
| `--mast-height` | 64px (54px ≤760px) | Top bar; anything sharing that row centers within it |
| `--edge-bottom` | ≥1rem, respects safe area | Bottom-anchored scene controls |
| `--sheet-inset` | fluid | Inner padding of paper sheets |
| `--measure-sheet` · `--measure-form` · `--measure-page` | 36 · 30 · 46rem | Column widths for sheets, the passphrase card, reading pages |
| `--space-1…9` | 4px base | All other spacing |

Within a column, align on shared edges: headings, meta and body text start at
the same left edge, and lists with a date column align on the entry's first
baseline (`align-items: baseline`), not with padding nudges.

Right-aligned scene controls share one right edge: the gutter. The menu hangs
from the menu button with the same right edge, one gap below it.

## Type

One family: `--font`, a serif (Iowan Old Style → Palatino → Georgia), for
prose, headings, controls, captions and meta alike. Don't introduce a sans.

Three scales share it, and every size in a component comes from one of them —
never a raw `rem`:

| Scale | Tokens | Use |
|---|---|---|
| Display | `--display-hero` › `--display-1` › `--display-2` › `--display-3` | Welcome title › page titles › sheet and form titles › section heads. Pair with `--lh-display`/`--lh-heading` and `--ls-hero`/`--ls-display`/`--ls-heading` |
| Reading | `--text-sm` 16 › `--text-md` 18 › `--text-lg` ~20 › `--text-xl` ~24 | Supporting prose › sheet body › journal entries and memoir › a single thought held up to read |
| Interface | `--ui-xs` 13 › `--ui-sm` 14 › `--ui-md` 16 › `--ui-lg` 17 | Meta and dates › captions and toggles › buttons and labels › inputs |

The interface scale runs a step larger than a sans would need because the
serif's x-height is smaller; 13px is the floor. Display type tightens as it
grows (negative tracking); small interface type opens up slightly.

The serif has regular and bold only. Use 400 by default and 600 (bold) for
form labels and selected tabs; don't write 500, which silently renders as
regular. Separate hierarchy with size, color (`--ink` › `--ink-muted` ›
`--ink-subtle`) and space before reaching for bold.

## Motion

Use `--ease-soft` or `--ease-out` with `--dur-micro` (hover, press, captions),
`--dur-fast`, `--dur-base` or `--dur-slow`. Wrap decorative motion in
`@media (prefers-reduced-motion: no-preference)`; `base.css` also neutralizes
motion globally for reduced-motion users.

## Stacking

`--z-chrome` 2 (floating top bar) · `--z-loading` 5 · `--z-room` 205 (listening room) ·
full-screen overlays 200–225. The menu and dialogs use the top layer
(`popover`, `<dialog>`), so they need no z-index.
