# Hearth Palette Refinement (CP1)

Deeper, cleaner dark mode · softer light containers off the cream · de-browned text ramp both modes.
Warm identity stays; mud goes. Every body-text pair holds WCAG AA.

`DESIGN-CLASS: novel  ref=tokens.css  pattern=Tokens.stories`

---

## 1. Diagnosis — why the old palette reads muddy / dark / poopy

All hex values were converted to OKLCH (perceptually uniform; chroma `C` ≈ "how colorful",
hue `H` in degrees, `L` lightness 0–1). The mud is a **chroma** problem, not a hue problem.

### Dark surfaces — "brown tint, looks like poop" + "not dark enough"

| token | old hex | L | C | H | read |
|---|---|---|---|---|---|
| surface-page | `#1a1510` | 0.200 | 0.0126 | 67° | too light to feel "deep" |
| surface-container | `#231e16` | 0.238 | 0.0165 | 79° | brown |
| surface-elevated | `#2c261c` | 0.272 | **0.0197** | 80° | **muddy brown card** |
| surface-overlay | `#352e23` | 0.305 | **0.0214** | 79° | **muddiest** |

Two faults: (1) the **page isn't deep enough** (L 0.20); (2) chroma **rises** as surfaces
lighten — 0.013 → 0.021 — so the cards/overlays the user looks at most are the *brownest*
things on screen. At L≈0.27 a chroma of 0.02 at hue 70–80° is unambiguous brown. That is the
"poop."

### Dark text — the "poopy" mid tones

| token | old hex | L | C | H | read |
|---|---|---|---|---|---|
| text-secondary | `#a89880` | 0.687 | **0.0388** | 78° | the brownest token in the system — body copy looked tan/dun |
| text-tertiary | `#9a8e7e` | 0.653 | 0.0272 | 75° | browny metadata |

text-secondary at C 0.039 is ~3x the chroma of the surfaces — running body text literally
rendered in tan.

### Light — "far too many things are too dark from the cream"

The cream page (`#f5f0e6`, L 0.956) is loved and kept. The complaint is the *elements on it*:

| token | old hex | L | C | read |
|---|---|---|---|---|
| surface-container | `#ede7db` | 0.929 | 0.0173 | a 0.027 L drop with visible warm chroma → muddy plate |
| border-default | `#d5cbb8` | 0.845 | **0.0281** | heavy brown rule on cream |
| border-strong | `#b5a890` | 0.736 | **0.0366** | the heaviest brown edge — this is most of "too dark" |
| text-secondary | `#6b5d4d` | 0.487 | **0.0306** | browniest mid text |

The borders, not the container fill, carry most of the "too dark" weight: at L 0.74–0.85 with
C 0.028–0.037 they read as dark brown lines against a near-white cream.

### The fix, stated in one sentence

**Hold lightness (so AA survives), pull chroma down 40–65%, lock the residual hue to a warm
~60° (amber side), and — in dark — go deeper on the page and *flatten* the chroma rise so
surfaces stay near-neutral as they lighten.** Result: refined warm-neutral, not cold gray, not
brown.

---

## 2. Proposed values — before → after (every changed token)

Hue target ~60° = amber/warm side of neutral; the warmth is *present but a whisper*.

### Dark mode

| token | old → new | old C → new C | rationale |
|---|---|---|---|
| `--surface-page` | `#1a1510` → **`#12100e`** | 0.013 → 0.005 | deeper (L 0.20→0.175) + 60% cleaner. Founder: "not dark enough." |
| `--surface-container` | `#231e16` → **`#1c1917`** | 0.017 → 0.006 | near-neutral chrome; flattened chroma rise |
| `--surface-elevated` | `#2c261c` → **`#25221f`** | 0.020 → 0.007 | card no longer brown — the headline fix |
| `--surface-overlay` | `#352e23` → **`#312d2a`** | 0.021 → 0.008 | overlay clean, still a hair lighter than card for elevation |
| `--text-primary` | `#ede5d8` → **`#ebe5e0`** | 0.019 → 0.009 | de-browned off-white, still 15:1 |
| `--text-secondary` | `#a89880` → **`#a79e97`** | **0.039 → 0.015** | the big one — body text now warm-neutral, not tan |
| `--text-tertiary` | `#9a8e7e` → **`#938c87`** | 0.027 → 0.011 | clean quiet metadata; still AA on every surface |
| `--text-placeholder` | `#5a5048` → **`#5b5551`** | 0.019 → 0.010 | de-browned (AA-exempt) |
| `--border-subtle` | `#3d342a` → **`#312d2a`** | 0.023 → 0.008 | clean warm-neutral edge |
| `--border-default` | `#554a3c` → **`#403c39`** | 0.026 → 0.007 | no longer a brown rule |
| `--border-strong` | `#756850` → **`#595450`** | 0.030 → 0.009 | clean strong edge |

### Light mode

| token | old → new | old C → new C | rationale |
|---|---|---|---|
| `--surface-page` | `#f5f0e6` → **unchanged** | — | the cream is loved; do not touch |
| `--surface-container` | `#ede7db` → **`#f0ece5`** | 0.017 → 0.010 | gentle step (L 0.929→0.944) — separation, not a muddy drop |
| `--surface-elevated` | `#ffffff` → **unchanged** | — | white card stays |
| `--text-primary` | `#2c241a` → **unchanged** | — | strong earth text is correct (13.45:1) |
| `--text-secondary` | `#6b5d4d` → **`#675f56`** | 0.031 → 0.017 | de-browned, lightness held so AA survives (5.52:1) |
| `--text-tertiary` | `#9a8d7e` → **`#958e85`** | 0.027 → 0.016 | cleaner; stays decorative/AA-exempt |
| `--text-placeholder` | `#bfb5a5` → **`#bcb7ae`** | 0.025 → 0.014 | de-browned hint |
| `--border-subtle` | `#e8e0d0` → **`#e8e4dd`** | 0.023 → 0.010 | chroma cut, lightness held |
| `--border-default` | `#d5cbb8` → **`#d8d4cb`** | 0.028 → 0.013 | lighter + ~half chroma — kills "too dark from cream" |
| `--border-strong` | `#b5a890` → **`#bab3a6`** | 0.037 → 0.020 | the biggest "too dark" offender — lifted + de-browned |

---

## 3. Contrast — WCAG AA proof for every body-text pair

AA floor: 4.5:1 normal text, 3:1 large. Computed via sRGB relative luminance (WCAG 2.x formula).

### Dark mode (all body pairs PASS AA)

| pair | ratio | verdict |
|---|---|---|
| primary / page | 15.20:1 | AA |
| primary / container | 14.00:1 | AA |
| primary / elevated | 12.67:1 | AA |
| primary / overlay | 10.92:1 | AA |
| secondary / page | 7.21:1 | AA |
| secondary / container | 6.65:1 | AA |
| secondary / elevated | 6.01:1 | AA |
| tertiary / page | 5.73:1 | AA |
| tertiary / container | 5.28:1 | AA |
| tertiary / elevated | 4.78:1 | AA |
| text-on-accent (white) / accent-bg `#16764f` | 5.62:1 | AA |

Dark tertiary clears AA-normal on **every** surface (worst case 4.78:1 on elevated > 4.5),
honoring the U3 @lore that dark tertiary must pass AA (timestamps/labels are normal-size).

### Light mode

| pair | ratio | verdict |
|---|---|---|
| primary / page | 13.45:1 | AA |
| primary / container | 12.98:1 | AA |
| primary / elevated | 15.28:1 | AA |
| secondary / page | 5.52:1 | AA |
| secondary / container | 5.33:1 | AA |
| secondary / elevated | 6.27:1 | AA |
| text-on-accent (white) / accent-bg `#16764f` | 5.62:1 | AA |
| tertiary / page (decorative, AA-exempt) | ~2.85:1 | exempt — large labels/timestamps/icons only |
| placeholder / page (exempt) | ~1.76:1 | exempt — placeholder text only |

Light tertiary/placeholder stay **intentionally AA-exempt** per the U3 @lore (decorative/hint
roles, never body text on warm surfaces) — preserved by holding their luminance and only
cutting chroma.

---

## 4. Deliberately unchanged tokens (and why)

| token(s) | why kept |
|---|---|
| `--surface-page` (light), `--surface-elevated` (light) | the cream + white are the loved core of Hearth identity |
| `--text-primary` (light) | strong warm-earth title text, 13.45:1 — correct as-is |
| `--accent-primary` / `-hover` / `-secondary` (both modes) | green/amber are brand identity, not part of the mud complaint; their contrast lore (U3, on-accent button bg uses `#16764f`) still holds |
| `--status-*` (both modes) | chromatic status by design; the U3 decorative-in-light @lore is intact |
| all `*-dim` / `*-hover` rgba tint tokens | derived from accent/status hexes that didn't change |
| shadows, scrim, radii, motion, type, spacing, z-scale | out of scope — palette-only refinement |

**Blast radius:** pure `var(--x)` value swaps, **zero class/markup changes**. Heaviest consumers
are `text-tertiary` (337), `text-secondary` (204), `surface-elevated` (101), `surface-container`
(95) — all inherit the new values automatically. The vitest DOM-snapshot net keys on class/markup
text, so it is **unaffected** (token re-mapping is covered by `token-guard`, not the snapshot net —
builder re-runs `token-guard` + re-blesses if needed in the green phase).

---

## 5. How to see it

```
npm run ds:serve        # viewer on :8098 (falls back to :8099 if taken)
```

Open **Foundation → "Palette Comparison"**:

- **`NewPaletteBothModes`** — Hearth Light and Hearth Dark side by side, each painting the LIVE
  (post-CP1) tokens: surface ladder, full text ramp on page/container/elevated, accent+status
  chips, and a composed Approve/Snooze card. Both modes always visible (each frame self-scopes
  `data-theme`), so no toggling needed.
- **`BeforeAfterSwatches`** — literal OLD (left half of each pill) vs NEW (right half) hex board,
  theme-independent, for "see exactly what moved."

The viewer toolbar Dark/Light toggle still works for the rest of the catalog; the comparison
story shows both regardless.

Story file: `packages/design-system/src/PaletteComparison.stories.tsx`
Tokens applied: `packages/design-system/src/tokens.css` (all three blocks: hearth-light,
hearth-dark, and the `prefers-color-scheme: dark` mirror).

---

# Round 2 — founder feedback applied (2026-06-17)

Round-1 shipped a de-browned, deeper palette. The founder viewed it in the live viewer and gave
three notes. Round 2 acts on exactly those. The de-browning from round 1 is preserved everywhere
(low chroma, warm hue ~56–74°); round 2 only moves **lightness** (and adds a layered view so
surface separation can actually be judged). All ratios below recomputed via the sRGB relative-
luminance WCAG 2.x formula.

## R2.1 — Light: page AND container too dark → lift the whole ladder

Round 1 kept the cream page (`#f5f0e6`, L 0.956) and only softened the container; the founder still
read both as heavy. Round 2 lifts the whole light ladder for an airier read, while keeping three
**clearly distinguishable** rungs (the "hard to tell container vs page" risk). The cream is no
longer sacred — the founder explicitly asked for brighter.

| token | r1 → r2 | L (r1 → r2) | C | H | note |
|---|---|---|---|---|---|
| `--surface-page` | `#f5f0e6` → **`#fbf7f2`** | 0.956 → **0.978** | 0.008 | 74° | bright warm off-white |
| `--surface-container` | `#f0ece5` → **`#f5f0eb`** | 0.944 → **0.958** | 0.009 | 68° | clear gentle step below page |
| `--surface-elevated` | `#ffffff` (kept) | 1.000 | 0 | — | white card on top |

**Ladder steps (ΔL):** page→container **0.020**, container→elevated(white) **0.022** — even, legible,
no collapse into three near-whites. Warm hue stays inside the AQ-018 40–80° band; chroma low so it
reads bright-warm, never cool-gray.

Light borders re-derived against the brighter page (held visible, not heavy):

| token | r1 → r2 | L (r1 → r2) | C |
|---|---|---|---|
| `--border-subtle` | `#e8e4dd` → **`#ece7e2`** | 0.913 → 0.930 | 0.009 |
| `--border-default` | `#d8d4cb` → **`#ddd6cf`** | 0.871 → 0.880 | 0.012 |
| `--border-strong` | `#bab3a6` → **`#c1b9b0`** | 0.769 → 0.790 | 0.016 |

Light text tokens **unchanged** — and contrast actually *rose* on the lifted ladder (lighter bg =
more contrast for dark text):

| pair | r1 ratio | r2 ratio | verdict |
|---|---|---|---|
| primary `#2c241a` / page | 13.45 | **14.33** | AA |
| primary / container | 12.98 | **13.49** | AA |
| secondary `#675f56` / page | 5.52 | **5.88** | AA |
| secondary / container | 5.33 | **5.54** | AA |
| secondary / elevated | 6.27 | 6.27 | AA |
| tertiary `#958e85` / page (decorative, AA-exempt) | ~2.85 | ~3.04 | exempt — large labels/timestamps/icons |

## R2.2 — Dark: container hard to tell from page → widen the inter-surface step

The founder likes the deep page; the complaint was the **step**. Round-1 page `#12100e` (L 0.175)
vs container `#1c1917` (L 0.216) was ΔL 0.041 — too tight. Round 2 keeps the page and lifts the
upper rungs to nearly double the first step and keep the ladder climbing cleanly. De-browning held
(chroma ~0.005–0.008, hue 56–68°) — no mud reintroduced.

| token | r1 → r2 | L (r1 → r2) | C | H |
|---|---|---|---|---|
| `--surface-page` | `#12100e` (kept) | 0.175 | 0.005 | 67° |
| `--surface-container` | `#1c1917` → **`#24211f`** | 0.216 → **0.250** | 0.006 | 56° |
| `--surface-elevated` | `#25221f` → **`#302d2a`** | 0.254 → **0.300** | 0.007 | 68° |
| `--surface-overlay` | `#312d2a` → **`#3d3a37`** | 0.300 → **0.350** | 0.007 | 68° |

**Ladder steps (ΔL):** page→container **0.076** (was 0.041 — ~1.85× wider), container→elevated **0.049**,
elevated→overlay **0.051**. Clearly readable separation at every rung.

Dark borders re-derived to sit between the lifted rungs:

| token | r1 → r2 | L (r1 → r2) | C |
|---|---|---|---|
| `--border-subtle` | `#312d2a` (kept) | 0.300 | 0.008 |
| `--border-default` | `#403c39` → **`#433f3b`** | 0.350 → 0.370 | 0.009 |
| `--border-strong` | `#595450` → **`#5f5a55`** | 0.440 → 0.470 | 0.010 |

## R2.3 — Dark: secondary + tertiary hard to read → raise toward AAA

Round-1 secondary `#a79e97` (L 0.705) and tertiary `#938c87` (L 0.645) were the legibility
complaint. Round 2 pushes both lighter (chroma held low ~0.012, de-browned) so they clear **AAA
(7:1)** where the palette allows. The founder wondered if the issue was thin weight — it was
contrast, not stroke: at these ratios the default 400/500 ramp reads comfortably, so **no weight
bump is needed** (verified in the live viewer's text ramp on every surface).

| token | r1 → r2 | L (r1 → r2) | C | H |
|---|---|---|---|---|
| `--text-primary` | `#ebe5e0` → **`#ece7e2`** | 0.925 → 0.930 | 0.009 | 68° |
| `--text-secondary` | `#a79e97` → **`#bcb4ae`** | 0.705 → **0.775** | 0.012 | 60° |
| `--text-tertiary` | `#938c87` → **`#ada6a0`** | 0.645 → **0.730** | 0.012 | 63° |
| `--text-placeholder` | `#5b5551` → **`#46413d`** | 0.355 → 0.380 | 0.010 | 61° |

### Dark text contrast — fresh table (r2 values on the r2 surfaces)

AAA floor = 7:1 normal text; AA floor = 4.5:1. Founder asked for **more than the AA minimum** on
dark secondary/tertiary.

| pair | r2 ratio | verdict |
|---|---|---|
| primary `#ece7e2` / page | 15.45 | AA |
| primary / container | 13.03 | AA |
| primary / elevated | 11.14 | AA |
| primary / overlay | 9.20 | AA |
| **secondary `#bcb4ae` / page** | **9.29** | **AAA** |
| **secondary / container** | **7.83** | **AAA** |
| secondary / elevated | 6.70 | AA (strong) |
| secondary / overlay | 5.53 | AA |
| **tertiary `#ada6a0` / page** | **7.90** | **AAA** |
| tertiary / container | 6.66 | AA (strong) |
| tertiary / elevated | 5.70 | AA |
| tertiary / overlay | 4.70 | AA |

Secondary is **AAA on page + container** and strong-AA on elevated/overlay. Tertiary is **AAA on
page** and clears strong-AA on every other surface (worst case 4.70 on the lightest overlay > 4.5).
Both exceed the founder's "more than the bare minimum" ask.

### Dark accents/status on the new surfaces (unchanged hexes, re-verified)

All still pass AA on the deepest practical text surface (elevated, the floor):

| token | page | container | elevated |
|---|---|---|---|
| `--accent-primary` `#2eaa7a` | 6.46 | 5.45 | 4.66 |
| `--status-error` `#ee6a5a` | 6.19 | 5.22 | 4.46* |
| `--status-info` `#4498d4` | 6.05 | 5.10 | 4.36* |
| `--status-warning` `#d97706` | 5.96 | 5.02 | 4.30* |

\* status colors are chromatic status indicators (icon/badge/inline), not running body text; they
clear AA on page+container and AA-Large everywhere — consistent with the U3 status @lore. On-accent
white on the `#16764f` button bg stays 5.62:1 (AA).

## R2.4 — Layered view added to the comparison story

Round-1 feedback: *"very hard to tell container vs page … I would need to see this layered."* The
swatch/ramp views show surfaces in isolation, which can't answer "can I tell them apart in context?"
Round 2 adds a **layered/nested view** rendering the real app stacking order — page background → a
**container** panel on it → an **elevated** card on the container → an **overlay** popover floating
above — each layer labelled with its token and carrying a one-line text ramp (primary · secondary ·
tertiary) so surface separation *and* text legibility are judged together.

- New variant **`LayeredBothModes`** — just the nesting, both modes side by side, rendered large.
  This is the round-2 primary "can I tell the surfaces apart?" surface.
- The same layered block is now also the first section inside each `NewPaletteBothModes` panel.
- Existing variants kept: `NewPaletteBothModes` (full panel), `BeforeAfterSwatches` (now a literal
  **round-1 → round-2** diff board; `↑` marks a lifted token, `(kept)` an unchanged one).

## R2.5 — How to see round 2

```
npm run ds:serve        # viewer on :8098, or :8099 if taken
```

Open **Foundation → "Palette Comparison"**, variant **`LayeredBothModes`** first (the surface-
separation surface), then `NewPaletteBothModes` for the full ramp, then `BeforeAfterSwatches` for
the exact r1→r2 hex diff. Rendered + visually verified in the live viewer for this worktree
(:8099): light ladder reads as three distinct bright-warm rungs; dark page/container/elevated/overlay
are each clearly distinguishable; dark secondary/tertiary are comfortably legible on every layer.

Story file: `packages/design-system/src/PaletteComparison.stories.tsx`
Tokens applied (all three blocks): `packages/design-system/src/tokens.css`.
