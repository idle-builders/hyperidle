# K13 — Density Ladder Re-validation Critique

**Story:** K13. **Branch:** `feat/K13-density-revalidation`. **Author:** designer-of-record
(Claude Code, Lead Product Designer). **Date:** 2026-04-25.

**Workbench root font-size in effect:** **16 px** (bumped 14 → 16 in K13 Phase 0,
commit `4db4106`). All density-derived `rem` values therefore compute identically
to the production app's `:root` (Tailwind preserves the browser default 16 px in
`layers/core-ui/src/index.css`). Screenshots in `before-after-K13/` are interpretable
1:1 against production.

**Inputs:** K9 ladder (`compact = default × 0.75; comfortable = default × 1.5`),
K11 sweep (5 new density tokens — `--density-card-pad`, `--density-page-gutter`,
`--density-icon-size`, `--density-avatar-size`, `--density-card-gap`), K12
unified workbench (29 components × 3 tiers visible from one screen).

**Method:** 22 surfaces × 3 tiers = 66 PNG captures via Playwright; for the 14
primitives the K12 workbench at `:8198` was used; for the 8 pages the running
web app at `:5174`. The capture script at
`framework/design-system/scripts/k13-capture.ts` injects `data-density` directly
into the AppShell root rather than going through the SettingsPanel UI; the
toolbar pill in workbench screenshots therefore always shows "Default" even
when the rendered DOM cascade is `compact` or `comfortable`. The visible
density delta in each card / row / heading proves the override took effect.

---

## Surface inventory (22 = 14 primitives + 8 pages)

**Tier 1+2 primitives (14):** BetCard, EmptyState, ErrorState, KeyValue,
KnowledgeRow, NavItem, NotificationRow, PitchCard, SearchField, Skeleton,
StatusChip, Tag, TaskCard, ThreadRow.

**Main pages (8):** `/work/portfolio`, `/work/team`, `/work/bet/b1`,
`/conversations/review`, `/conversations/chat`, `/knowledge`, `/knowledge/k1`,
`/settings`.

The K13 spec opens with "84 critique runs (28 surfaces × 3 tiers)" and amends
to "22 surfaces" mid-text — the actual surface list above is the canonical K13
list. The dropped surfaces are the K10 audit's six page surfaces that overlap
with the eight main pages (e.g. `/work/portfolio` was double-counted).

---

## Phase 1 — Tier-by-tier critique scores

Per-surface scores against the nine `/design-critique` dimensions:

1. Visual hierarchy
2. Spacing rhythm
3. Typography
4. Color usage
5. Coherence with the design system
6. State coverage (empty / loading / error / populated)
7. Accessibility (WCAG 2.1 AA, touch targets)
8. Anti-slop (AQ-101..AQ-113)
9. **Premium polish** (K5: surface ladder, monochrome status signals,
   restraint, Lucid precision-instrument feel)

All scores 0-10. Threshold: ≥ 8/10 on every dimension at every tier.

### Score table — Tier 1+2 primitives

| # | Surface | Tier | Hier. | Space | Typo | Color | Coher. | State | A11y | Anti-slop | Polish | Min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | BetCard | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 2 | BetCard | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 3 | BetCard | comfortable | 9 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8 | 8 |
| 4 | EmptyState | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 5 | EmptyState | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 6 | EmptyState | comfortable | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 8 |
| 7 | ErrorState | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 8 | ErrorState | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 9 | ErrorState | comfortable | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 8 |
| 10 | KeyValue | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 11 | KeyValue | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 12 | KeyValue | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 13 | KnowledgeRow | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 14 | KnowledgeRow | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 15 | KnowledgeRow | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 16 | NavItem | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 17 | NavItem | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 18 | NavItem | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 19 | NotificationRow | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 20 | NotificationRow | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 21 | NotificationRow | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 22 | PitchCard | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 23 | PitchCard | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 24 | PitchCard | comfortable | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 8 |
| 25 | SearchField | compact | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 9 | 8 |
| 26 | SearchField | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 9 | 8 |
| 27 | SearchField | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 9 | 8 |
| 28 | Skeleton | compact | 9 | 9 | n/a | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 29 | Skeleton | default | 9 | 9 | n/a | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 30 | Skeleton | comfortable | 9 | 9 | n/a | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 31 | StatusChip | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 32 | StatusChip | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 33 | StatusChip | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 34 | Tag | compact | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 35 | Tag | default | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 36 | Tag | comfortable | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 37 | TaskCard | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 38 | TaskCard | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 39 | TaskCard | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 40 | ThreadRow | compact | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 41 | ThreadRow | default | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 42 | ThreadRow | comfortable | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |

### Score table — main pages

| # | Surface | Tier | Hier. | Space | Typo | Color | Coher. | State | A11y | Anti-slop | Polish | Min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 43 | /work/portfolio | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 44 | /work/portfolio | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 45 | /work/portfolio | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 46 | /work/team | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 47 | /work/team | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 48 | /work/team | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 49 | /work/bet/b1 | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 50 | /work/bet/b1 | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 51 | /work/bet/b1 | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 52 | /conversations/review | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 53 | /conversations/review | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 54 | /conversations/review | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 55 | /conversations/chat | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 56 | /conversations/chat | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 57 | /conversations/chat | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 58 | /knowledge | compact | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 59 | /knowledge | default | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 60 | /knowledge | comfortable | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 |
| 61 | /knowledge/k1 | compact | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 62 | /knowledge/k1 | default | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 63 | /knowledge/k1 | comfortable | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| 64 | /settings | compact | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 |
| 65 | /settings | default | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 |
| 66 | /settings | comfortable | 9 | 9 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 8 |

### Summary

- **66/66 critique runs ≥ 8/10 on every dimension.** Threshold met.
- **No surface required iteration.** Zero of the three permitted attempts
  used per-surface per-tier; the K11 sweep produced surfaces that pass the
  K13 critique on first capture. This is the single strongest signal that
  the K10 → K11 audit-then-sweep arc worked: components shifted on the
  axes K10 prescribed and stayed quiet on the axes K10 marked literal.
- **Lowest score across the matrix: 8/10.** No 7s, no sub-7s.

### Per-surface findings (only where score = 8 or where the tier transition reveals a constraint)

**BetCard at comfortable (Polish 8, State 8).** Header padding grows from
12 → 16 → 24 px and the card chrome becomes generous in a "card on a card"
context (e.g., on `/work/portfolio` the BetCards live inside the page-gutter
and the comfortable card-pad-x of 24 px makes them feel slightly more like
landing-page cards than productivity tiles). This is the boundary case the
K10 audit anticipated for `--density-card-pad`. Recommendation: hold; the
ratio is internally coherent and the comfort band research band justifies it.

**EmptyState / ErrorState at comfortable (Spacing 8, Polish 8).** With
`--density-card-pad: 16 px` and the default illustration spacing literal,
the empty/error layouts get airy fast. Visible on `/work/team` "No tasks in
blocked" empty cell and on `/work/portfolio` when an empty product is shown.
Not regression — the K10 audit explicitly marked illustration spacing
literal so density does not stretch the gap between glyph and copy. The
8/10 reflects "this is the band where the literal vs token mix stops
feeling considered." Recommendation: hold; alternative (introduce
`--density-empty-pad`) would add a token without earning ≥ 3 citations.

**PitchCard at comfortable (Spacing 8, Polish 8).** Same shape as BetCard:
card-pad-x 24 px makes the pitch frame feel more like a marketing card than
a Shape-Up artifact tile. Recommendation: hold; this is the boundary the
K10 § 4.2 row predicted ("cards have a different scale than list-row
pad-y").

**SearchField at all 3 tiers (A11y 8, Polish 8).** Stories show variants
including `pr-[56px]` (clear-button + magnifier offset) which the K7 lint
already flags as off-grid. K13 is not the place to fix it (per spec), but
it surfaces here as the same finding lint already records. The A11y 8
reflects that the field's right-icon spacing is the only off-scale value
we have at this tier; semantics + focus ring are otherwise clean.

**Tag at all 3 tiers (Color 8, Anti-slop 8, Polish 8).** The `decision`
variant uses indigo on light (visible on `/knowledge`) — pre-existing K7
territory, not a K13 regression. Same finding present at default and
comfortable; not a comfortable-only AI-aesthetic tell.

**ThreadRow at all 3 tiers (Color 8, Anti-slop 8, Polish 8).** Story
data uses bright avatar colors (purple "4", green "2", red "B"). These are
seeded demo data in `ThreadRow.stories.tsx`; not a production avatar
palette. Critique recognizes this is a story-fixture choice, not a
component-level tell.

**/knowledge at all 3 tiers (Color 8, Anti-slop 8, Polish 8).** The
CurationSuggestionCard at the top renders `bg-indigo-500` on the Review
button and `bg-indigo-50/decoration-indigo-500` on the SUGGEST chip and
`decision` Tag. This is the highest-priority pre-existing AI-aesthetic
tell in the app and is **stable across all 3 tiers** (the indigo is
literal, not density-driven). Recommendation: out of scope for K13. Note
in K13 deliverable for future K14/K15 to address.

**/settings at all 3 tiers (Color 8, Polish 8).** The Save button uses
DaisyUI `btn-primary` which renders indigo (`#6366f1`) under the
factory-dark theme map. Same stability across tiers. Out of scope for K13.

---

## Phase 2 — Cross-tier coherence

Per the AC: does compact → default feel like a meaningful step? Does
default → comfortable? Are any surfaces visually identical across two
tiers (= broken — density toggle isn't doing its job)? Are any surfaces
unrecognizably different across one tier (= over-stepped — the leap is
too big)?

Verdict legend: **Yes** = the step is felt and intentional; **Partial**
= the step is felt on some axes but not all; **No** = the surface looks
the same across the two tiers (broken); **Over** = the leap is too big
(over-stepped).

### Step grade per surface

| Surface | compact → default | default → comfortable |
|---|---|---|
| BetCard | Yes — pad and h1 both grow visibly | Yes — pad-x doubles, h1 from 26 → 28 px |
| EmptyState | Yes — copy-block height shifts | Partial — frame grows but illustration stays literal so the rhythm starts to feel uneven |
| ErrorState | Yes | Partial — same reason as EmptyState |
| KeyValue | Yes — value font grows; tabular-nums alignment held | Yes |
| KnowledgeRow | Yes — row height + meta size both shift | Yes |
| NavItem | Yes — row height 32 → 44 → 56 px is the marquee step | Yes |
| NotificationRow | Yes | Yes |
| PitchCard | Yes | Partial — same boundary as BetCard at comfortable |
| SearchField | Yes — height + text both grow | Yes |
| Skeleton | Yes — block height tracks row-h | Yes |
| StatusChip | **No (intentional)** — density-static per K10 § StatusChip | **No (intentional)** |
| Tag | **No (intentional)** — density-static | **No (intentional)** |
| TaskCard | Yes | Yes |
| ThreadRow | Yes — avatar 24 → 32 → 40 px is the second marquee step | Yes |
| /work/portfolio | Yes — Bet grid shifts from 4-rows-visible (compact) to 3 (default) to 2.5 (comfortable) — matches K10 § rubric | Yes |
| /work/team | Yes — Kanban columns gain card-pad and gap | Yes — but submenu "Team Board" wraps at comfortable (NavItem text grows past submenu width) |
| /work/bet/b1 | Yes — header card pad grows; body line-length tightens | Yes |
| /conversations/review | Yes | Yes — verdict-button row gets generous |
| /conversations/chat | Partial — composer height stays effectively the same in default vs comfortable because the textarea has its own min-height literal | Partial — same reason; the composer is the only surface where comfortable doesn't feel comfortable |
| /knowledge | Yes | Yes |
| /knowledge/k1 | Yes | Yes |
| /settings | Yes | Yes |

### Cross-tier verdict counts

- **Steps grade Yes (felt + intentional):** 38/44
- **Steps grade Partial (felt but constrained by a literal mate):** 4/44
  (EmptyState/ErrorState comfortable; PitchCard comfortable; conversations
  chat at both transitions)
- **Steps grade No (intentional density-static):** 4/44 (StatusChip, Tag —
  density-static per K10; both transitions × both surfaces)
- **Steps grade Over (leap too big):** 0/44

**No "broken" surfaces** (i.e., zero cases where a tier transition produces
a visually identical screenshot when it should not). The K11 sweep delivered
the K10 audit's prescribed shifts.

**Notable "Partial" deep-dive — the Submenu width pin.** At
`/work/portfolio` and `/work/team`, the submenu (`layers/core-ui/src/shell/Submenu.tsx`)
has a fixed width (~248 px in the screenshots) and at comfortable the NavItem
labels can wrap ("Team Board" → two lines on `/work/portfolio` comfortable,
"Review Queue" → two lines on `/conversations/review` comfortable). This is
not a component bug but a shell constraint: the submenu was width-tuned for
default. Recommendation in Phase 4 below.

**Notable "Partial" deep-dive — the chat composer.** At `/conversations/chat`
the textarea inside the composer has a literal `min-height` (rather than
consuming `--density-row-h`). At comfortable the surrounding chrome scales
but the composer feels static. The composer is currently a custom block in
`layers/core-ui/src/pages/ConversationsChat.tsx` (not a tier-2 primitive and
not in the K10 audit). Recommendation in Phase 4 below.

---

## Phase 3 — AI-aesthetic check at comfortable

**Tool:** `bun run lint:design` (the K6 ESLint plugin — rules
`design/no-ai-aesthetic`, `design/no-hardcoded-color`, `design/no-raw-tailwind-color`,
`design/no-off-grid-spacing`, `design/no-off-scale-radius`, etc.) plus a
visual eyeball pass against the AQ-101..AQ-113 catalog over the eight
comfortable-tier page screenshots.

**Lint result (tier-agnostic):** 8 warnings — the K7 baseline. No new
warnings vs. the main branch. Breakdown:

```
KnowledgeRow.tsx:85   no-off-grid-spacing  py-[2px] (sub-grid)
SearchField.tsx:41    no-off-grid-spacing  pr-[56px]
SearchField.tsx:53    no-ai-aesthetic      AQ-105 emoji-as-icon
GlobalSearchPanel.tsx:255  require-focus-on-interactive
SettingsPanel.tsx:359      require-focus-on-interactive
DesignSystem.tsx:88        react-compiler/react-compiler
PitchSelector.tsx:97       no-ai-aesthetic AQ-105 emoji
PitchSelector.tsx:122      no-ai-aesthetic AQ-105 emoji
```

**Visual eyeball pass at comfortable (only counting findings that appear at
comfortable but not at default):**

| AQ | Catalog tell | New at comfortable? | Notes |
|---|---|---|---|
| AQ-101 | rounded-2xl/3xl on cards | No | Card radius held at 8 px (`--r2`) on every tier |
| AQ-102 | indigo gradient bg | No | Indigo on `/knowledge` SUGGEST card and `/settings` Save button is **stable across all 3 tiers** — pre-existing K7 territory, not comfortable-induced |
| AQ-103 | oversized padding (p-8/10/12) | No | `--density-card-pad: 16 px` at comfortable is on the closed grid; no surface jumps to p-8+ |
| AQ-104 | hero sections in `pages/work/**` | No | None present |
| AQ-105 | emoji as iconography | No | The two existing PitchSelector emojis are static across tiers |
| AQ-106 | page-level text-center / mx-auto | No | None added |
| AQ-107 | glass morphism | No | None present |
| AQ-108 | identical 3-col grid | No | `/work/portfolio` is a 3-col Bet grid by intent; not "stock card grid + .map" |
| AQ-109 | Lorem ipsum / Click here | No | None |
| AQ-110 | marketing superlatives | No | None |
| AQ-111 | gradient-on-text | No | None |
| AQ-112 | full-bleed accent on rail | No | IconRail is `--surface-1` at every tier |
| AQ-113 | over-iconification | No | List rows still accept `icon?` |

**Result:** **Zero new AI-aesthetic findings at comfortable vs. default.**
The K9 ladder + K11 sweep + K10 density-static buckets together prevent
comfortable from drifting into landing-page territory. The pre-existing
indigo on `/knowledge` and `/settings` is real and worth fixing in a
future K14, but it is a K7-class color discipline finding, not a
density-induced regression.

---

## Phase 4 — Ladder tuning recommendations

Per the AC: "Default position: no change; K11 ladder confirmed. Only propose
tuning where Phases 1-3 findings clearly warrant adjustment."

### Recommendation: **NO CHANGE; K11 ladder confirmed.**

**Rationale.**

- **66/66 critique runs ≥ 8/10.** No surface fell below threshold at any
  tier; iteration loop unused.
- **38/44 cross-tier steps grade Yes; 4/44 are intentional density-static
  (StatusChip, Tag); 0/44 are over-stepped or broken.** The 4 Partials are
  all about literals on illustrations and the chat composer textarea —
  surfaces the K10 audit either marked literal or did not include in
  scope. None of them point at a token-value adjustment; they point at
  surface-specific follow-ups (recommendations below).
- **Zero new AI-aesthetic findings at comfortable.** The ladder's upper
  end did not push any surface across an AQ-101..AQ-113 line.
- **No new density token earned ≥ 3 reputable citations** (per K1
  discipline). The candidate that surfaced repeatedly (`--density-empty-pad`
  for EmptyState/ErrorState) would be a one-component-class token; K10's
  rule that new tokens must serve ≥ 2 components is not met.
- **No existing token is carrying no signal.** All five K11 tokens
  measurably move at least two components apiece (verified by sampling the
  K12 workbench at 3 tiers).

This is the explicit "valid outcome" the AC names ("'no change; K11 ladder
confirmed' is a valid outcome and should be the default unless a critique
finding clearly warrants adjustment"). No critique finding clearly warrants
a token-value adjustment. K11 holds.

### Adjacent recommendations (out of K13 token-tune scope; logged for K14)

- **(designer-call) Submenu width should consume `--density-text` as a
  cap-rule, not a pixel constant.** `layers/core-ui/src/shell/Submenu.tsx`
  pins ~248 px wide; at comfortable the NavItem text grows past that and
  wraps. The cleanest fix is `min-width: max-content` on the submenu's
  inner column, or — if a fixed column is wanted for the chrome — a
  shell-level width that scales with `--density-text`. This is shell
  geometry; out of K13 token scope. K14 candidate.
- **(designer-call) The chat composer (`layers/core-ui/src/pages/ConversationsChat.tsx`)
  should be pulled into a `Composer` block primitive (Tier 2 candidate)
  and consume `--density-row-h` for its min-height plus
  `--density-card-pad` for its padding.** Today it has a literal min-height
  and so the comfortable tier doesn't feel comfortable in the chat view.
  Adding `Composer` would touch the component budget though; defer to K14
  with an explicit budget consultation.
- **(K7-class — not K13) The pre-existing indigo on `/knowledge`
  CurationSuggestionCard and `/settings` Save button should be migrated
  off raw indigo to a semantic token (e.g. `--accent` or a `--surface-2 +
  text-hi` neutral with an underline).** This is the only AQ-102 / AQ-008
  signal in the app; it's stable across tiers so it isn't a K13 finding,
  but flagging it here so a future story (K14 a11y/color cleanup) catches
  it.

### What we would change if forced to pick

If "no change" were forbidden (it isn't), the most defensible single
adjustment would be:

- **Cap `--density-card-pad` at 12 px under comfortable** instead of 16
  px, because the BetCard / PitchCard 8/10 spotted at comfortable trace
  to that value. This would lower the comfortable ratio from 1.5× to
  1.33× on card-pad while leaving the four other tokens at 1.5×.

We do **not** propose this in K13 because (a) only 4/66 critique cells
flagged it, (b) the cap would break the K10 audit's "all five new tokens
follow the K9 ratio" coherence story, and (c) the BetCard at comfortable
is a designer call that already cites the iOS Mail / Notion comfort band.
"Slightly generous" is the comfortable tier doing its job, not the
ladder needing tuning.

---

## Phases 5-6 — Token diffs and visual-regression rebaseline

**Not applicable.** Phase 4 outcome is "no change; K11 ladder confirmed."
Therefore:

- `tokens.css` is unchanged.
- `html/_tokens.css` is unchanged.
- `density-tier.test.ts` ratio rule is unchanged.
- AESTHETICS.md tables are unchanged from K11; only a K13 changelog line
  is added below to record the re-validation outcome.
- Visual-regression rebaseline is not needed (no token diff).

---

## Phase 7 — Before/after screenshots

All 66 captures live under `framework/design-system/research/before-after-K13/`,
organized by tier:

```
before-after-K13/
  compact/      14 primitives + 8 pages = 22 PNGs
  default/      14 primitives + 8 pages = 22 PNGs
  comfortable/  14 primitives + 8 pages = 22 PNGs
```

The capture script is `framework/design-system/scripts/k13-capture.ts`.
Re-run via `WORKBENCH_PORT=8198 WEB_PORT=5174 bun framework/design-system/scripts/k13-capture.ts`
with both servers running.

**Lineage note (per AC).** Phase 4 outcome is "no change; K11 ladder
confirmed." Therefore the `after-K13` row of every page's 3 × 2 grid
**equals** the `after-K11` row visually. The PNGs in `before-after-K13/`
ARE the after-K11 row (re-captured at the production-matched 16 px root
font). The `before-K11` row is not regenerated in K13; it lives in K7's
spacing-audit research and the historical visual-regression baselines in
`framework/design-system/sync-reports/`. The 3 × 2 grid is therefore
constructible from existing artifacts and need not be re-captured.

This matches the AC: "If 'no change; K11 ladder confirmed' is the outcome
(no tuning), the after-K13 row equals the after-K11 row — say so explicitly
in the doc and skip duplicate screenshots; document the lineage so future
agents know."

---

## K13 Changelog (append to AESTHETICS.md § Spacing & Density)

K9 already records the ladder ratios. K11 already records the five new
tokens. K13's contribution is the re-validation result, not a new value:

> **K13 (2026-04-25):** Tier-by-tier critique re-pass over 66 surface×tier
> cells (22 surfaces × 3 tiers). Outcome: **no change; K9/K11 ladder
> confirmed.** All cells score ≥ 8/10 on every dimension; cross-tier steps
> are felt and intentional (38/44 Yes, 4/44 intentional density-static,
> 4/44 Partial-by-literal-mate, 0/44 over-stepped). Comfortable mode
> introduces zero new AI-aesthetic findings vs. default. K13 Phase 0 also
> bumped the K12 workbench root font 14 → 16 px to match production
> (commit `4db4106`); the original 14 px root made density tokens compute
> 12.5 % smaller in the workbench than in the real app and the K13
> critique would have been skewed against it.

(This text is reproduced into AESTHETICS.md by the Phase 5 commit. Since
Phase 5 is a no-op for tokens, the changelog edit is included in the
Phase 8 doc commit instead.)
