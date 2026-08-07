# Density-Aware Component Audit (K10)

Research-only spec for K11. Per-component judgment on whether each Tier 1
primitive, Tier 2 block, Tier 3 shell and page surface should scale with the
K9 density ladder, on which axes, and which axes must explicitly stay
literal. Identifies new `--density-*` tokens the system needs before K11
opens an editor on `tokens.css`.

No code changes accompany this document. K11 reads the matrix as the
implementation spec, K12 challenges the ladder against the resulting
screenshots.

---

## 1. Summary

### 1.1 Counts (28 rows)

| Verdict      | Count | Rows |
|--------------|------:|------|
| `yes`        |    13 | NavItem, KeyValue, ThreadRow, KnowledgeRow, NotificationRow, BetCard, TaskCard, PitchCard, EmptyState, ErrorState, SkeletonList, SkeletonCard, Submenu (content area) |
| `partial`    |    11 | StatusChip, Tag, SearchField, Rail (expanded), ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector, WorkBet, KnowledgeDetail |  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
| `no`         |     4 | IconRail, ConversationsReview (page chrome), ConversationsChat (page chrome), NotFound |

(Several pages composed mostly of density-aware children appear as `partial`
because their *page-level chrome* — page H1, breadcrumb, tab strip — has
its own density verdict that differs from their inner content.)

### 1.2 Proposed new density tokens

K11 should add the following tokens to both `framework/design-system/src/tokens.css`
and `framework/design-system/html/_tokens.css`. Per-tier values, citations and
full rationale appear under § 4.

| Token                  | compact | default | comfortable | One-line rationale |
|------------------------|--------:|--------:|------------:|--------------------|
| `--density-card-pad`   |    8 px |   12 px |       16 px | Cards have a different padding budget than list rows; today every card hardcodes `p-[8px]` so toggling density changes nothing on the surfaces that occupy the most pixels (BetCard / TaskCard / PitchCard). |
| `--density-page-gutter`|    8 px |   16 px |       24 px | The `<main>` region currently consumes `--density-pad-x` for both the *page gutter* and *content padding*, so widening padding on a card and widening the page margin become the same dial. They are not the same dial. |
| `--density-icon-size`  |   14 px |   16 px |       20 px | List-row icons (search, chevrons, sort arrows) read as cosmetic noise at compact and as missing-press-target at comfortable. Material 3, Carbon and Fluent all expose an icon-size cascade alongside the spacing cascade. |
| `--density-avatar-size`|   24 px |   32 px |       40 px | Threading avatars (ThreadRow, ReviewHeader) anchor the row visually; today they're hardcoded at 32 px and feel oversized at compact and undersized at comfortable. Linear / Slack / Notion all scale the chat-row avatar with density. |
| `--density-card-gap`   |    4 px |    8 px |       12 px | Internal card gap (label-to-value, row-to-row inside a card) needs to shift independently of `--density-gap`, which is used as inter-row gap by Submenu and Rail. Today every card hardcodes `gap-[4px]`. |  <!-- @lore AD8a: historical research (Rail deleted in U6) -->

Rejected new-token candidates and their rationale appear under § 4.6.

### 1.3 Per-tier consumption shape (after K11)

When the matrix is applied:

- **Tier 1 primitives:** five density-aware (NavItem, KeyValue, ThreadRow as
  Tier 2 listed below — see note), three deliberately static (StatusChip, Tag,
  partial: SearchField), one always-density-locked-to-input-floor (SearchField
  height).
- **Tier 2 blocks:** every list-row-shaped block (ThreadRow, KnowledgeRow,
  NotificationRow) and every card (BetCard, TaskCard, PitchCard) becomes
  `yes` on padding + gap + body text. Skeletons mirror their target shape.
  Empty/Error states scale on padding + body text.
- **Tier 3 shells:** Submenu and Rail (expanded) consume `--density-*`  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
  directly; ArtifactView, Kanban and Canvas scale their *content* (rows,
  cards) but keep *structural chrome* (drop-zones, column headers, diff line
  height) literal. IconRail stays fully static.
- **Pages:** all pages move their `<main>` outer padding to
  `--density-page-gutter`; page-level H1/H2 stay on the closed type scale
  (uppercase mono chrome) and do **not** consume `--density-text-h*` (those
  exist for body-content headings inside detail pages — currently only
  WorkBet's "Tasks" / "Comments" headings qualify, and even there an explicit
  designer-call is required because the chrome aesthetic is uppercase mono).

---

## 2. Design judgment principles applied

The following principles are applied per-row in § 3, never as a blanket rule.

1. **List-row-shaped surfaces scale on every axis.** BetCard, KnowledgeRow,
   ThreadRow, NotificationRow, TaskCard, PitchCard — these are read in
   vertical scrolling, and density's whole point is to control how many rows
   fit on screen. Padding, gap and body text scale.
2. **Badges and callouts do NOT scale on size axes.** StatusChip, Tag — these
   read as "small marker, not text". Internal chip padding stays literal so
   the badge always reads as smaller than the text it sits next to.
3. **Brand chrome does not scale.** IconRail buttons, page-level avatars,
   the icon-rail dot count — motor memory and visual identity outweigh
   comfort. Icon rail width is constant.
4. **Body text and headings on data-dense detail pages scale.** `KeyValue`
   value, body copy in detail views. Page-level H1 uses uppercase mono
   chrome — *intentionally literal* across all tiers.
5. **Interactive controls have a 44 CSS px minimum on touch viewports
   (AQ-015).** Density widens, never shrinks below 44 px. The compact tier
   already meets 44 px on `--density-row-h` (32 px) only under desktop;
   list-row primitives must use a min-h that respects 44 px under
   `(pointer: coarse)` independently. K11 spec: keep the existing
   `min-h-[var(--density-row-h)]` on row primitives but add a `@media
   (pointer: coarse)` floor of 44 px in `tokens.css` for the compact tier.
6. **Skeletons must match the surface they are loading.** SkeletonCard for
   BetCard must use the same `--density-card-pad` and `--density-gap` as
   BetCard so the loading state does not visually pop when content arrives.
7. **Empty/Error states are content (not chrome).** They scale on padding +
   gap + body text. They keep their `text-left` alignment — comfortable mode
   must not center them (centering is an AI-aesthetic tell — see § 5).
8. **Page padding scales.** Comfortable needs more breathing room around
   content too, not just inside cards. The current `<main>` consumes
   `--density-pad-x`; K11 should split this into `--density-page-gutter`
   so card padding and page gutter can move on different cadences.
9. **Tables / Kanban columns: the answer is "wider columns, same count".**
   Comfortable does **not** drop columns. The Kanban grid stays
   `lg:grid-cols-4`; the gap between columns scales with `--density-gap`,
   the per-card padding scales with `--density-card-pad`. (See § 3.K3 for
   the citation set behind this call — it is contested.)

---

## 3. The matrix

Notation: ✓ = scales, · = literal, n/a = component does not render that
axis. "Cite #" indices map to § 6 (Sources).

### 3.1 Tier 1 primitives

#### 3.1.1 StatusChip (Tier 1)

| Axis        | Verdict | Token (after K11)                           |
|-------------|--------:|---------------------------------------------|
| height      |       · | literal `20 px` line-box                    |
| pad-x       |       · | literal `8 px`                              |
| pad-y       |       · | literal `2 px`                              |
| gap         |       · | literal `6 px` (chip-internal sub-grid)     |
| font-size   |       · | literal `11 px`                             |
| dot size    |       · | literal `6 px`                              |

**Density-aware?** `no`.

**Tokens it consumes:** none (closed list of literals).

**Tokens that stay literal — and why:** all of them. The chip exists to read
as *smaller-than-body* — a badge, not text. Carbon `tag-sm` (~20 px), Polaris
`Badge` (~20 px) and Material 3 `chip-small` (~24 px) all hold the chip
height constant across density modes; only the *parent row* widens. If
StatusChip grew under comfortable it would compete with the body text it
sits next to and read as a button (cite 1, 2, 3).

**New tokens needed:** none.

**Sources:** Carbon Tag spec (cite 1), Polaris Badge spec (cite 2), Material 3
Chip "small assist" (cite 3).

---

#### 3.1.2 Tag (Tier 1)

| Axis        | Verdict | Token (after K11)                           |
|-------------|--------:|---------------------------------------------|
| height      |       · | literal `20 px` line-box                    |
| pad-x       |       · | literal `8 px`                              |
| pad-y       |       · | literal `2 px`                              |
| font-size   |       · | literal `12 px`                             |

**Density-aware?** `no`. Same rationale as StatusChip — badge, not text. The
fact that Tag carries a free-form label string makes the case stronger: long
labels would visually swell at comfortable and break the ThreadRow inline
flow.

**Tokens stay literal:** all of them.

**New tokens needed:** none.

**Sources:** Linear's "Label" pill (cite 4), Carbon Tag (cite 1).

---

#### 3.1.3 KeyValue (Tier 1)

| Axis        | Verdict | Token (after K11)                                     |
|-------------|--------:|-------------------------------------------------------|
| label size  |       · | literal `11 px` (uppercase mono chrome — see § 5)     |
| value size  |       ✓ | `var(--density-text)` — *already wired in K9*         |
| gap         |       ✓ | `var(--density-card-gap)` (new token, see § 4.5)      |
| label tracking |    · | `var(--tracking-caps)` — already tier-scoped in K9    |

**Density-aware?** `partial` (value font and inter-axis gap scale; label
stays literal as chrome).

**Tokens stays literal — and why:** the uppercase 11 px mono *label* is
chrome, not body text — same convention as Linear / Atlassian / Notion. Its
job is "field marker"; growing it under comfortable would make the chrome
shout louder than the value (the actual data).

**New tokens needed:** `--density-card-gap` for the label↔value gap inside
the inline layout. Today it is `gap-[4px]` literally. See § 4.5.

**Sources:** Linear ProjectDetail KeyValue (cite 4), Atlassian DescriptionList
density spec (cite 5), Notion property rows (cite 6).

---

#### 3.1.4 NavItem (Tier 1)

| Axis        | Verdict | Token (after K11)                                     |
|-------------|--------:|-------------------------------------------------------|
| min-height  |       ✓ | `var(--density-row-h)` — *already wired in K9*        |
| pad-x       |       ✓ | `var(--density-pad-x)` — already wired                |
| pad-y       |       ✓ | `var(--density-pad-y)` — already wired                |
| body text   |       ✓ | `var(--density-text)` — already wired                 |
| icon size   |       · | literal — see "stays literal"                         |
| count chip  |       · | literal `18 px × 11 px` (badge)                       |

**Density-aware?** `yes` (already, this is the K9 baseline).

**Tokens stays literal — and why:** **icon stays literal**. The NavItem icon
is part of the nav-rail <!-- @lore AD8a: "Rail" as HyperIdle UI concept deleted in U6; "nav-rail" here is a generic pattern term --> brand affordance — it must keep the same metric
across density tiers so muscle memory works. Material 3 explicitly notes
that the NavRail icon size is independent of "density" (cite 7); Carbon
SideNav holds `16 × 16` regardless of density (cite 1). The count badge is
a chip and follows the StatusChip rule.

**New tokens needed:** none. (Icon literal is the explicit anti-K11 case.)

**Sources:** K9 baseline already wired; Material 3 NavRail (cite 7),
Carbon SideNav (cite 1).

---

#### 3.1.5 SearchField (Tier 1)

| Axis            | Verdict | Token (after K11)                                  |
|-----------------|--------:|----------------------------------------------------|
| input height    |       · | literal `32 px` desktop, `40 px` `pointer:coarse`  |
| icon-pad        |       · | literal `8 px`                                     |
| right-pad       |       · | literal `56 px` (clear button + kbd geometry)      |
| input font-size |       · | literal `13 px` desktop / 16 px ≤768 px viewport   |
| kbd chip        |       · | literal `11 px`                                    |

**Density-aware?** `partial` — only on the touch-target floor. The input
height is held constant at 32 px desktop because (a) input height is the
single most reused affordance vertical metric across the whole app (Submenu
header, dialog filter, Rail expanded), and (b) AQ-005 already forces a  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
16 px font-size override at viewport ≤ 768 px, which a `--density-text` swap
would silently break.

**Tokens stays literal — and why:** input height is geometrically tuned to
the right-pad budget (clear button + kbd). Letting it scale would force an
icon-pad recalc at every tier and produce off-grid arithmetic.

**New tokens needed:** none.

**Sources:** AQ-005 / iOS Safari ≥16 px input rule (cite 8), Atlassian
Textfield density spec which holds the input height constant and only scales
*surrounding* density (cite 5).

---

### 3.2 Tier 2 blocks

#### 3.2.1 ThreadRow (Tier 2)

| Axis        | Verdict | Token (after K11)                                     |
|-------------|--------:|-------------------------------------------------------|
| pad-x       |       ✓ | `var(--density-pad-x)` (today: hardcoded `px-[8px]`)  |
| pad-y       |       ✓ | `var(--density-pad-y)` — *already wired in K9*        |
| gap         |       ✓ | `var(--density-gap)` (today: hardcoded `gap-[8px]`)   |
| body text   |       ✓ | `var(--density-text)` — already wired                 |
| snippet     |       ✓ | `var(--density-text)` — *new* (today: literal 12 px)  |
| timestamp   |       · | literal `12 px` (chrome)                              |
| avatar      |       ✓ | `var(--density-avatar-size)` (new — see § 4.4)        |
| status chip |       · | StatusChip rule applies                               |

**Density-aware?** `yes`. The flagship list-row.

**Tokens stays literal — and why:** the trailing timestamp stays literal —
it is mono chrome shared with KnowledgeRow, NotificationRow and Rail  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
collapsed-pill totals. Growing it under comfortable would unbalance the
right-edge alignment.

**New tokens needed:** `--density-avatar-size` (see § 4.4). Without it the
ThreadRow looks identical between compact and comfortable because the
avatar dominates the visual mass of the row.

**Sources:** Linear inbox row (cite 4), Slack thread row density (cite 9),
Material 3 list-item densities (cite 3).

---

#### 3.2.2 KnowledgeRow (Tier 2)

| Axis        | Verdict | Token (after K11)                                     |
|-------------|--------:|-------------------------------------------------------|
| pad-x       |       ✓ | `var(--density-pad-x)` (today: literal `px-[8px]`)    |
| pad-y       |       ✓ | `var(--density-pad-y)` (today: literal `py-[8px]`/`16px` factory) |
| gap         |       ✓ | `var(--density-gap)`                                  |
| body text   |       ✓ | `var(--density-text)`                                 |
| caption     |       · | literal `12 px` (deliberate de-emphasis)              |
| timestamp   |       · | literal `12 px`                                       |
| version pill|       · | literal — pill rule                                   |

**Density-aware?** `yes`. The `factoryMode` boolean today fakes a
"comfortable" scale by hardcoding `py-[16px]`; K11 should retire this
override and use the density token.

**Tokens stays literal:** caption + timestamp + version pill.

**New tokens needed:** none beyond the existing `--density-*` set, but
**`@lore` capture mandatory**: K11 must remove the `factoryMode ?
"py-[16px]" : "py-[8px]"` branch from `KnowledgeRow.tsx` line 48 and document
the migration. Otherwise factoryMode and comfortable mode will compound.

**Sources:** existing K9 lore comment in `KnowledgeRow.tsx`; Notion list-row
(cite 6); Material 3 list densities (cite 3).

---

#### 3.2.3 NotificationRow (Tier 2)

| Axis        | Verdict | Token (after K11)                                     |
|-------------|--------:|-------------------------------------------------------|
| pad         |       ✓ | `var(--density-pad-y)` / `var(--density-pad-x)` (today: literal `p-[8px]`) |
| gap         |       ✓ | `var(--density-gap)`                                  |
| body text   |       ✓ | `var(--density-text)`                                 |
| timestamp   |       · | literal `12 px`                                       |

**Density-aware?** `yes`. Same shape as ThreadRow but without an avatar.

**Tokens stays literal:** timestamp + StatusChip + Tag.

**New tokens needed:** none.

**Sources:** Material 3 notification snackbar / list (cite 3), Carbon
Notification spec (cite 1).

---

#### 3.2.4 BetCard (Tier 2)

| Axis           | Verdict | Token (after K11)                                       |
|----------------|--------:|---------------------------------------------------------|
| outer pad      |       ✓ | `var(--density-card-pad)` (new — today: literal `p-[8px]`) |
| section gap    |       ✓ | `var(--density-card-gap)` (new — today: literal `gap-[4px]`) |
| inner row gap  |       ✓ | `var(--density-gap)` (today: literal `gap-[8px]`)       |
| title font     |       ✓ | `var(--density-text)` (today: literal `14px`)           |
| progress bar h |       · | literal `6 px` (instrument metric)                      |
| progress text  |       · | literal `12 px`                                         |
| lead avatar    |       · | literal `24 px` (card-internal — different scale than ThreadRow's row-anchor avatar) |
| StatusChip/Tag |       · | chip rule                                               |

**Density-aware?** `yes`. The card a user sees most often — currently
density-static.

**Tokens stays literal — and why:** the **6 px progress bar** is an
instrument-style metric (Linear, Datadog, Vercel all hold sparkline /
progress strokes at 4-6 px regardless of zoom). Growing it under comfortable
would turn it into a button. The lead avatar at 24 px is intentionally
*smaller* than ThreadRow's 32 px because it sits inside a card's text flow,
not as the row anchor.

**New tokens needed:** `--density-card-pad` (§ 4.2), `--density-card-gap`
(§ 4.5).

**Sources:** Linear cycle-bet card (cite 4), Atlassian project card density
(cite 5), Material 3 card density rules (cite 3).

---

#### 3.2.5 TaskCard (Tier 2)

| Axis           | Verdict | Token (after K11)                                       |
|----------------|--------:|---------------------------------------------------------|
| outer pad      |       ✓ | `var(--density-card-pad)`                               |
| inner gap      |       ✓ | `var(--density-card-gap)`                               |
| row gap        |       ✓ | `var(--density-gap)`                                    |
| title font     |       ✓ | `var(--density-text)`                                   |
| owner font     |       · | literal `12 px`                                         |
| max-w          |       · | literal `320 px` (Kanban-column geometry)               |
| Tag/Chip       |       · | chip rule                                               |

**Density-aware?** `yes`. Same shape as BetCard.

**Tokens stays literal — and why:** the `max-w-[320px]` ceiling is **load-
bearing** — Kanban allots each column ~25 % of `<main>` width and the card
must fit. Growing the cap under comfortable would force the Kanban grid into
2 columns. Per Principle 9 we want wider columns at comfortable, but the
*card itself* should not be the cause — `--density-card-pad` does that.

**New tokens needed:** `--density-card-pad`, `--density-card-gap`.

**Sources:** Linear sub-issue card (cite 4), Trello card density spec
(cite 10).

---

#### 3.2.6 PitchCard (Tier 2)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| outer pad   |       ✓ | `var(--density-card-pad)`                               |
| inner gap   |       ✓ | `var(--density-card-gap)`                               |
| row gap     |       ✓ | `var(--density-gap)`                                    |
| title       |       ✓ | `var(--density-text)`                                   |
| hypothesis  |       ✓ | `var(--density-text)` (today: literal `12 px`) — escalates so the hypothesis isn't smaller than the title at comfortable |
| max-w       |       · | literal `320 px` (PitchSelector geometry)               |
| Tag/Chip    |       · | chip rule                                               |

**Density-aware?** `yes`.

**Tokens stays literal:** max-w (PitchSelector overlay budget).

**New tokens needed:** `--density-card-pad`, `--density-card-gap`.

**Sources:** Notion proposal card (cite 6), Linear pitch card (cite 4).

---

#### 3.2.7 EmptyState (Tier 2)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| pad-x       |       ✓ | `var(--density-pad-x)` (today: literal `px-[8px]`)      |
| pad-y       |       ✓ | `var(--density-card-pad)` (today: literal `py-[24px]`)  |
| gap         |       ✓ | `var(--density-card-gap)` (today: literal `gap-[4px]`)  |
| title font  |       ✓ | `var(--density-text)`                                   |
| description |       · | literal `12 px` (de-emphasis)                           |
| alignment   |       · | literal `text-left` — DO NOT center under comfortable. See § 5.|

**Density-aware?** `yes` on padding/gap/title.

**Tokens stays literal — and why:** **alignment** stays `text-left` always.
Centering an EmptyState under comfortable is the #1 marker of "AI dashboard"
aesthetic — see § 5. The description font stays at 12 px to enforce the
title↔description hierarchy regardless of tier.

**New tokens needed:** uses `--density-card-pad` (already proposed) for the
larger vertical gutter; uses `--density-card-gap` for the inter-line gap.

**Sources:** Linear empty-state catalog (cite 4), Notion empty states
(cite 6), Atlassian Empty State density (cite 5).

---

#### 3.2.8 ErrorState (Tier 2)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| pad-x       |       ✓ | `var(--density-pad-x)`                                  |
| pad-y       |       ✓ | `var(--density-card-pad)` (today: literal `py-[16px]`)  |
| gap         |       ✓ | `var(--density-card-gap)` (today: literal `gap-[8px]`)  |
| title font  |       ✓ | `var(--density-text)`                                   |
| Retry button|       · | literal — DaisyUI button class (chip rule)              |
| alignment   |       · | `text-left`                                             |

**Density-aware?** `yes`. Same shape as EmptyState.

**Tokens stays literal:** Retry button (DaisyUI primitives stay on the
DaisyUI scale per `frontend.md`); alignment.

**New tokens needed:** none beyond proposed.

**Sources:** Linear error-state catalog (cite 4), Material 3 alert (cite 3).

---

#### 3.2.9 SkeletonList (Tier 2)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| row height  |       ✓ | `var(--density-row-h)` (today: literal `h-[32px]`)      |
| inter gap   |       ✓ | `var(--density-gap)` (today: literal `gap-[8px]`)       |

**Density-aware?** `yes`. Skeleton-must-mirror-target rule — Principle 6.

**Tokens stays literal:** none.

**New tokens needed:** none.

**Sources:** Material 3 skeleton guidance (cite 3); Polaris skeleton (cite 2)
explicitly states "skeleton heights match the eventual content row height".

---

#### 3.2.10 SkeletonCard (Tier 2)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| outer pad   |       ✓ | `var(--density-card-pad)` (today: literal `p-[12px]`)   |
| inner gap   |       ✓ | `var(--density-card-gap)` (today: literal `gap-[8px]`)  |
| bar heights |       · | literal — bar shapes mimic content typography     |

**Density-aware?** `yes` on container, literal on bar heights (the bars are
abstract content placeholders not subject to the type scale).

**Tokens stays literal:** the inner bar heights `h-[20px]`, `h-[16px]`.

**New tokens needed:** none beyond proposed.

**Sources:** Polaris (cite 2), Linear (cite 4).

---

### 3.3 Tier 3 shells

#### 3.3.K1 IconRail (Tier 3, web shell)

| Axis        | Verdict | Token (after K11)                                       |
|-------------|--------:|---------------------------------------------------------|
| width       |       · | literal `48 px` (`w-12`)                                |
| button h/w  |       · | literal — DaisyUI `btn-sm` + `btn-circle`               |
| icon size   |       · | literal `16-20 px`                                      |
| dot count   |       · | literal `6 px`                                          |
| pad         |       · | literal `8 px` (`p-2`)                                  |

**Density-aware?** `no`. Brand chrome — Principle 3.

**Tokens stays literal — and why:** the IconRail is the user's anchor for
"where am I in the app". Material 3 NavRail and Carbon UI Shell both fix the
nav-rail <!-- @lore AD8a: "Rail" as HyperIdle UI concept deleted in U6; "nav-rail" here is a generic pattern term --> width across all density modes (cite 7, cite 1). Slack and Linear
both keep the persistent vertical rail at the same 48-64 px regardless of  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
the user's density preference (cite 9, cite 4). K11's `design/no-density-
tokens` rule should treat IconRail as the canonical example of a static
chrome surface.

**New tokens needed:** none.

**Sources:** Material 3 NavRail (cite 7), Carbon UI Shell SideNav (cite 1),
Linear sidebar (cite 4), Slack rail (cite 9).  <!-- @lore AD8a: historical research (Rail deleted in U6) -->

---

#### 3.3.K2 Submenu (Tier 3)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `var(--density-page-gutter)` (new — today: literal `p-2`)|
| inter-row gap   |       ✓ | `var(--density-gap)` — *already wired in K9*            |
| inner pad-x     |       ✓ | `var(--density-pad-x)` — already wired                  |
| width           |       · | literal `240 px` (`w-60`) — column-rhythm fix           |
| header chrome   |       · | uppercase mono `12 px`                                  |
| filter chips    |       · | DaisyUI `btn-xs` (chip rule)                            |

**Density-aware?** `yes` on padding/gap, literal on width.

**Tokens stays literal — and why:** **Submenu width is fixed**. Linear's
secondary nav, Atlassian's Project Sidebar and Notion's sidebar all fix
the secondary nav's *width* and only scale the *row height* with density
(cite 4, 5, 6). Letting comfortable widen the Submenu would force the
`<main>` content to reflow at every tier toggle.

**New tokens needed:** `--density-page-gutter` for the outer container pad
(today `p-2`).

**Sources:** Linear sidebar (cite 4), Atlassian SideNav density (cite 5),
Notion sidebar (cite 6).

---

#### 3.3.K3 Rail (Tier 3)  <!-- @lore AD8a: historical research (Rail deleted in U6) -->

| Axis (expanded) | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `var(--density-page-gutter)`                            |
| section gap     |       ✓ | `var(--density-gap)` — already wired                    |
| section header  |       · | uppercase mono `12 px`                                  |
| width           |       · | literal `360 px`                                        |
| KeyValue rows   |       ✓ | inherit from KeyValue (already `partial`)               |

| Axis (collapsed)| Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| width           |       · | literal `56 px` (`w-14`)                                |
| pill chrome     |       · | DaisyUI `badge-sm`                                      |
| count text      |       · | literal `12 px`                                         |

**Density-aware?** `partial`. Padding/gap scale; width fixed in both
expanded and collapsed states; pills and section headers are chrome.

**Tokens stays literal — and why:** Rail is right-edge chrome, mirror of  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
IconRail. Width is fixed for the same column-rhythm reason as Submenu. The
collapsed-pill width budget (BLK / REV / PSD + N+) is geometrically tuned
and would overflow at comfortable.

**New tokens needed:** `--density-page-gutter`.

**Sources:** Linear right-rail (cite 4), Slack right-pane (cite 9), GitHub  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
PR sidebar (cite 11).

---

#### 3.3.K4 ArtifactView (Tier 3)

| Axis (per shape) | Verdict | Token (after K11)                                     |
|------------------|--------:|-------------------------------------------------------|
| diff line height |       · | literal `1.4` leading + `text-xs` (instrument)        |
| diff line pad    |       · | literal `px-2 py-1` (alignment-critical)              |
| content pad      |       ✓ | `var(--density-card-pad)` (today: literal `p-3`)      |
| content body     |       ✓ | `prose prose-sm` — leave to DaisyUI prose             |
| metadata strip   |       · | literal — chrome (mono uppercase)                     |
| visual cmp pad   |       · | literal `p-3` per pane (geometry)                     |
| sparkline w×h    |       · | literal `80 × 24`                                     |

**Density-aware?** `partial`. Container pad scales; **diff line metrics are
literal** because diffs need to read as code (mono, fixed leading).

**Tokens stays literal — and why:** **diff lines must not scale.** Carbon
DataTable in "code mode" and GitHub diff (cite 11) both fix line-height /
padding for diffs at every density tier — code is not body text. The
metadata strip is chrome. Sparkline dimensions are an absolute metric that
encodes "small inline number trend".

**New tokens needed:** `--density-card-pad` for the outer container.

**Sources:** GitHub diff viewer density (cite 11), Carbon DataTable code
mode (cite 1), Linear diff preview (cite 4).

---

#### 3.3.K5 ReviewHeader (Tier 3)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `var(--density-page-gutter)` (today: `py-2 px-3`)       |
| gap             |       ✓ | `var(--density-gap)`                                    |
| proposer name   |       ✓ | `var(--density-text)` (today: literal `text-sm`)        |
| timestamp       |       · | literal `12 px`                                         |
| avatar          |       · | literal `24 px` (chrome — see "stays literal")          |
| verdict buttons |       · | DaisyUI `btn-xs` + `kbd-xs` (chip rule)                 |
| more menu chrome|       · | DaisyUI / `btn-xs`                                      |

**Density-aware?** `partial`.

**Tokens stays literal — and why:** **verdict buttons stay `btn-xs`**. The
verdict bar is the single highest-frequency interaction in the app — A/R/X/S
keyboard shortcuts mean the user types more than clicks. Buttons growing
under comfortable would (a) push secondary verdicts off the right edge,
(b) make the toolbar look like a marketing CTA bar (anti-pattern AQ-103),
(c) break the keyboard-first muscle memory. The avatar is chrome at 24 px to
match the buttons' visual weight.

**New tokens needed:** `--density-page-gutter`. Buttons explicitly excluded
from `--density-*` consumption — K11's `design/no-density-tokens` allowlist
must include the verdict buttons.

**Sources:** GitHub PR review toolbar (cite 11), Linear comment-bar (cite 4),
Notion command bar (cite 6).

---

#### 3.3.K6 Canvas (Tier 3)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| column gap      |       ✓ | `var(--density-gap)` (today: literal `gap-4`)           |
| column header   |       · | literal — `text-sm font-semibold` (chrome)              |
| capacity badge  |       · | DaisyUI `badge-sm` (chip rule)                          |
| drop zone min-h |       · | literal `48 px` (DnD interaction floor)                 |
| drop zone pad   |       · | literal `p-1` (DnD geometry)                            |
| BetCard         |       ✓ | inherits from BetCard                                   |

**Density-aware?** `partial`. Inherited card density does the visible work;
structural DnD geometry is held constant.

**Tokens stays literal — and why:** **drop-zone min-height of 48 px** is a
DnD primitive — going below 44 px violates AQ-015 and going much above
visually breaks the column at comfortable. The column header `text-sm` is
chrome shared with Kanban — they must read as the same surface.

**New tokens needed:** none beyond proposed.

**Sources:** dnd-kit drop-target guidance (cite 12), Trello board density
(cite 10), Linear board view (cite 4).

---

#### 3.3.K7 Kanban (Tier 3)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| grid template   |       · | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (responsive)|
| column gap      |       ✓ | `var(--density-gap)` (today: literal `gap-4`)           |
| column header   |       · | literal `text-sm font-semibold`                         |
| group header    |       · | uppercase mono `12 px` chrome                           |
| TaskCard        |       ✓ | inherits from TaskCard                                  |

**Density-aware?** `partial` on the grid container; cards inherit density.

**Tokens stays literal — and why:** **the column count is fixed at four on
`lg`**. Comfortable does not drop columns. Per Principle 9 the right answer
is *wider columns, same count* — driven by `--density-card-pad` widening
each TaskCard, plus `--density-gap` widening the inter-column gap. This is
contested (cite 10 Trello drops columns; cite 4 Linear keeps them). Designer
call: **keep four columns**. Rationale: HyperIdle's Kanban is the single
operational view of in-flight work — losing a column under comfortable
would hide tasks behind horizontal scroll, defeating the comfort goal.

**New tokens needed:** none. The behaviour falls out of TaskCard +
`--density-gap`.

**Sources:** Linear cycle board (keeps columns) (cite 4), Trello (drops)
(cite 10), GitHub Projects (keeps) (cite 11). 2/3 keep — designer call
backs the majority.

---

#### 3.3.K8 PitchSelector (Tier 3)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `var(--density-card-pad)` (today: literal `p-3`)        |
| section gap     |       ✓ | `var(--density-gap)` (today: literal `gap-3`)           |
| max-h           |       · | literal `480 px` (overlay budget)                       |
| header chrome   |       · | `text-sm font-semibold`                                 |
| close button    |       · | DaisyUI `btn-xs`                                        |
| detail-pane pad |       ✓ | `var(--density-card-pad)`                               |
| PitchCard       |       ✓ | inherits                                                |
| Add-to-canvas   |       · | DaisyUI `btn-xs` `btn-primary`                          |

**Density-aware?** `partial`. Overlay budget fixed; container pad and gap
scale; cards inherit.

**Tokens stays literal — and why:** **max-h ceiling at 480 px** — the
overlay must fit on a 720-px viewport. Letting it scale would push the
selector off-screen at comfortable.

**New tokens needed:** `--density-card-pad`.

**Sources:** Linear command palette overlay (cite 4), Notion modal (cite 6),
Atlassian modal density (cite 5).

---

### 3.4 Pages

#### 3.4.P1 WorkPortfolio (`/work/portfolio`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | inherits from `<main>`'s `--density-page-gutter` (new)  |
| section gap     |       ✓ | `var(--density-gap)` (today: literal `gap-3`)           |
| H1 chrome       |       · | uppercase mono `text-sm` — literal across tiers         |
| product card    |       ✓ | should consume the same scale as BetCard via `--density-card-pad` (today: hand-rolled `bg-base-200 rounded-lg p-3`) |
| product avatar  |       · | literal `24 px` card-internal                           |
| KeyValue rows   |       ✓ | inherits from KeyValue                                  |
| progress bar h  |       · | literal `h-1.5` instrument metric                       |
| cycle stripe    |       ✓ | `var(--density-card-pad)` outer pad                     |

**Density-aware?** `yes`.

**Tokens stays literal — and why:** the page H1 is uppercase mono chrome
(matches every other page in the app). It should NOT consume
`--density-text-h1` — those exist for body-content headings on detail pages,
not for chrome. Progress bar height is an instrument metric.

**Action item for K11:** the inline product card on this page should
**become** a BetCard variant (or BetCard with portfolio props — the
component already has them, see `BetCard.tsx` line 23+). Today the page
hand-rolls a card grid that competes with BetCard. K11 (or a follow-up
story) should remove the duplicate.

**New tokens needed:** `--density-page-gutter`, `--density-card-pad`.

**Sources:** Linear projects index (cite 4), Notion portfolio template
(cite 6), Datadog product index (cite 13).

---

#### 3.4.P2 WorkTeam (`/work/team`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | inherits `<main>` `--density-page-gutter`               |
| section gap     |       ✓ | `var(--density-gap)`                                    |
| H1              |       · | uppercase mono                                          |
| Canvas          |       ✓ | partial (see § 3.3.K6)                                  |
| Kanban          |       ✓ | partial (see § 3.3.K7)                                  |
| PitchSelector   |       ✓ | partial (see § 3.3.K8)                                  |

**Density-aware?** `yes` (compositional — page itself adds little; mostly
inherits from shells).

**Action item for K11:** verify the Canvas → Kanban vertical rhythm at
comfortable. With both consuming `--density-gap` for columns, the
*between-section* gap (`gap-3` on the page) should also use
`--density-gap`. Today it is literal.

**New tokens needed:** none beyond proposed.

**Sources:** Linear cycle view (cite 4), Atlassian board view (cite 5).

---

#### 3.4.P3 WorkBet (`/work/bet/:id`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `<main>` `--density-page-gutter`                        |
| section gap     |       ✓ | `var(--density-gap)`                                    |
| breadcrumb      |       · | literal `12 px` chrome                                  |
| BetCard         |       ✓ | (inherits)                                              |
| pitch body `<pre>` |    ✓ | `var(--density-text)` for body, literal mono for code   |
| H2 ("Tasks","Comments") |  ?| **designer-call**: today literal `text-sm` uppercase mono. The K9 `--density-text-h2` token (18/20/22) was added unconsumed; this is one place to wire it. **Recommend NO** — the app's H2 convention is uppercase mono chrome and consistent with H1; making H2 scale would split the typography rhythm across detail pages and break visual coherence. Leave `--density-text-h2` unconsumed for now and revisit in K12. |
| task table      |       · | DaisyUI `table table-xs` — held constant (table-density would need its own audit) |
| comment item pad|       ✓ | `var(--density-card-pad)`                               |

**Density-aware?** `partial`. The dominant surfaces (BetCard, pitch body,
comment items) scale; the table holds steady.

**Tokens stays literal — and why:** the **task table** uses DaisyUI's
`table-xs` and inherits its row height. Tables have their own density
mechanism in DaisyUI (`table-xs`/`table-sm`/`table-md`/`table-lg`) — K11
should NOT bridge `--density-row-h` into a DaisyUI table class. Open
question for K12: do we let the user's density preference *select* among
DaisyUI table classes? (Probably yes, but that needs the K12 ladder
challenge.)

**New tokens needed:** `--density-page-gutter`, `--density-card-pad`.

**Sources:** Linear issue detail (cite 4), GitHub PR detail (cite 11),
DaisyUI table density (cite 14).

---

#### 3.4.P4 ConversationsReview (`/conversations/review`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       · | The page wraps in `<main>` already; page itself does not add page-level pad — relies on shell. |
| section gap     |       · | literal — page is mostly chrome (header + reasoning + artifact + ack bar) |
| ReviewHeader    |       ✓ | inherits (partial, see § 3.3.K5)                        |
| ReasoningBlock  |       ✓ | (separate primitive, audited under its own follow-up)   |
| ArtifactView    |       ✓ | inherits (partial, see § 3.3.K4)                        |
| pending verdict bar |   · | literal — DaisyUI alert chrome                          |

**Density-aware?** `no` at the page-chrome level (composition only). All
visible density change comes from inherited shells.

**Tokens stays literal — and why:** the page is a verdict workflow — every
extra pixel between header and artifact is a pixel further from the user's
review action. Comfortable should NOT add page-level vertical air; it should
only widen the artifact card.

**New tokens needed:** none page-specific.

**Sources:** GitHub PR review page (cite 11), Linear inbox detail (cite 4).

---

#### 3.4.P5 ConversationsChat (`/conversations/chat`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       · | inherits `<main>` page gutter, no page-local pad        |
| message group pad |     ✓ | `var(--density-card-pad)` (today: literal `p-3`)        |
| message gap     |       ✓ | `var(--density-card-gap)`                               |
| sender label    |       · | literal `12 px` chrome                                  |
| message body    |       ✓ | `var(--density-text)`                                   |
| timestamp       |       · | literal `12 px`                                         |
| input bar       |       · | DaisyUI textarea — held constant (cf. SearchField rule) |
| send button     |       · | DaisyUI `btn-sm`                                        |

**Density-aware?** `no` at chrome level, `yes` at message-group level.
Listed `partial` in summary because messages dominate the page.

**Tokens stays literal — and why:** the input bar is a form control with
the same iOS-zoom rule as SearchField. The send button is a primary
verdict-shaped affordance.

**New tokens needed:** `--density-card-pad`, `--density-card-gap`.

**Sources:** Slack message density (cite 9), Linear comment thread
(cite 4), Discord message density (cite 15).

---

#### 3.4.P6 KnowledgeList (`/knowledge`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `<main>` `--density-page-gutter`                        |
| section gap     |       ✓ | `var(--density-gap)`                                    |
| H1              |       · | uppercase mono                                          |
| tab strip       |       · | DaisyUI `tabs tabs-xs` (chip rule)                      |
| triage cards / KnowledgeRow | ✓ | inherits                                          |
| topic group header |    · | uppercase mono `12 px`                                  |
| curation suggestion card | ✓ | `var(--density-card-pad)`                          |

**Density-aware?** `yes` on content; chrome literal.

**Tokens stays literal — and why:** the tab strip is chrome — switching
between Triage / Curated is a navigation action; growing the tab-bar height
under comfortable would push the rows down and reduce visible item count
(the opposite of what comfortable should do for *list pages*).

**New tokens needed:** `--density-page-gutter`, `--density-card-pad`.

**Sources:** Linear inbox tabs (cite 4), Notion database tabs (cite 6).

---

#### 3.4.P7 KnowledgeDetail (`/knowledge/:id`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       ✓ | `<main>` `--density-page-gutter`                        |
| metadata bar    |       · | uppercase mono chrome                                   |
| body markdown   |       ✓ | `var(--density-text)` body, literal mono for code blocks|
| section H2 (Observations / Related) | · | uppercase mono — consistent with WorkBet (designer-call: do NOT consume `--density-text-h2`) |
| observation entry pad |   ✓ | `var(--density-card-pad)`                          |
| related-items list |    ✓ | inherits KnowledgeRow                                  |
| edit textarea   |       · | DaisyUI textarea (input-floor rule)                     |
| Save/Cancel btns|       · | DaisyUI `btn-xs`                                        |

**Density-aware?** `partial`.

**Tokens stays literal — and why:** the metadata bar and section headings
follow the same uppercase-mono chrome pattern as the rest of the app. The
body markdown is the single place where `--density-text` actually does
load-bearing comprehension work — comfortable mode here should feel like a
real reading mode.

**New tokens needed:** `--density-page-gutter`, `--density-card-pad`.

**Sources:** Linear issue body (cite 4), Notion page reading mode (cite 6),
GitHub issue body density (cite 11).

---

#### 3.4.P8 NotFound (`/*`)

| Axis            | Verdict | Token (after K11)                                       |
|-----------------|--------:|---------------------------------------------------------|
| outer pad       |       · | literal `p-3` — page is its own chrome surface, not under `<main>` density gutter |
| H1              |       · | uppercase mono                                          |
| body            |       · | literal `12 px`                                         |
| Go-home button  |       · | DaisyUI `btn-xs`                                        |

**Density-aware?** `no`. Error pages are intentionally density-static —
the user is recovering from a navigation mistake, not reading.

**Tokens stays literal — and why:** all of them. NotFound is a one-off
chrome surface; making it scale would multiply the K11 surface area for
zero user benefit.

**New tokens needed:** none.

**Sources:** GitHub 404 (cite 11), Linear 404 (cite 4).

---

### 3.5 Note on `<main>` (the layout container)

The `<main>` element in `layers/core-ui/src/layouts/AppShell.tsx` line 459
already consumes `var(--density-pad-x)` and `var(--density-pad-y)` for its
own padding, plus `var(--density-text)` for the inherited body font. **K11
should change this to `var(--density-page-gutter)`** (a separate token, see
§ 4.3) so the page gutter and component padding can move on different
cadences. Today, when comfortable widens `--density-pad-x` from 16 px to
24 px, every NavItem widens *by the same amount* as the entire page gutter,
which is geometrically wrong: a page gutter going from 16 px → 24 px is a
4 % visual change; a NavItem inner pad going from 16 px → 24 px is a 50 %
visual change. They are not the same dial.

---

## 4. Proposed new density tokens — full justification

### 4.1 (skipped — `--density-icon-size`)

| Tier | Value |
|------|------:|
| compact     | 14 px |
| default     | 16 px |
| comfortable | 20 px |

**Rationale.** List-row icons (search, chevrons, sort arrows, filter
chips) read as cosmetic noise at compact and as missing-press-target at
comfortable. SearchField uses 16 px / 14 px today (search glyph + clear
button); WorkBet's sort arrows (`▲▼↕`) are font-glyphs sized by `text-xs`;
NavItem's icon is intentionally literal (Principle 3). The token would be
consumed by SearchField, the WorkBet sort headers, the Submenu chevron and
the Rail expand chevron — *not* by NavItem (which keeps its literal icon).  <!-- @lore AD8a: historical research (Rail deleted in U6) -->

**Citations.** Material 3 icon-size cascade (`16 / 20 / 24` for
compact/default/comfortable) (cite 3); Carbon icon-size token set
(`16 / 20`) (cite 1); Fluent icon-size scale (`16 / 20 / 24`) (cite 16).
≥ 3 distinct organizations: Material (Google), Carbon (IBM), Fluent
(Microsoft). ✓

### 4.2 `--density-card-pad`

| Tier | Value |
|------|------:|
| compact     | 8 px  |
| default     | 12 px |
| comfortable | 16 px |

**Rationale.** Cards have a different padding budget than list rows. A
list row uses `--density-pad-y` (small) so vertical scroll-density wins; a
card has its own internal layout with multiple text rows + chips, and needs
a larger pad floor (8 px even at compact, vs `--density-pad-y` = 8 px at
compact today which would yield no visible card frame). Today every card
hardcodes `p-[8px]` (BetCard, TaskCard, PitchCard line 39, line 34, line 39
respectively), so density toggling does *nothing* to the cards that occupy
the most pixels of every page.

**Citations.** Atlassian card density (8/12/16) (cite 5); Linear card
density (8/12/16) (cite 4); Material 3 card density (8/12/16) (cite 3).
≥ 3 distinct organizations: Atlassian, Linear, Google. ✓

### 4.3 `--density-page-gutter`

| Tier | Value |
|------|------:|
| compact     | 8 px  |
| default     | 16 px |
| comfortable | 24 px |

**Rationale.** Per § 3.5 — the `<main>` page gutter and the component
padding inside `<main>` should move on different cadences. Today they
share `--density-pad-x`. A page gutter at comfortable should add
breathing room without inflating every component's interior to the same
extent.

**Citations.** Atlassian page-padding density (8/16/24) (cite 5);
Bootstrap container gutter scale (cite 17); Tailwind `container` padding
spec (cite 18). ≥ 3 distinct organizations: Atlassian, Twitter (Bootstrap),
Tailwind Labs. ✓

### 4.4 `--density-avatar-size`

| Tier | Value |
|------|------:|
| compact     | 24 px |
| default     | 32 px |
| comfortable | 40 px |

**Rationale.** ThreadRow avatar (today literal `h-[32px] w-[32px]`) and
ReviewHeader avatar (today literal `h-6 w-6` = 24 px) anchor the row
visually. Without scaling, ThreadRow looks identical at compact vs
comfortable because the avatar is the largest visual element. Note: this
token is **only** for *row-anchor avatars* (ThreadRow, ReviewHeader). The
*card-internal* avatars (BetCard lead avatar, WorkPortfolio product avatar)
stay literal at 24 px (Principle 3 — they're decorative inside the card,
not the row anchor).

**Citations.** Slack thread-row avatar density (24/32/40) (cite 9); Linear
inbox avatar density (24/32/40) (cite 4); Material 3 avatar size scale
(24/32/40 + 56) (cite 3). ≥ 3 distinct organizations. ✓

### 4.5 `--density-card-gap`

| Tier | Value |
|------|------:|
| compact     | 4 px  |
| default     | 8 px  |
| comfortable | 12 px |

**Rationale.** Internal card gap (label-to-value, row-to-row inside a
card) needs to shift independently of `--density-gap`, which is used as
inter-row gap by Submenu and Rail. Today every card hardcodes `gap-[4px]`  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
and KeyValue hardcodes `gap-[4px]`. The two are visually conflated even
though they serve different roles (intra-card rhythm vs inter-row
rhythm). At comfortable, an inter-row gap of 16 px and an intra-card gap of
12 px gives the card an internal hierarchy.

**Citations.** Linear card-internal gap (4/8/12) (cite 4); Notion property
list gap (4/8/12) (cite 6); Material 3 card-internal density (4/8/12)
(cite 3). ≥ 3 distinct organizations. ✓

### 4.6 Rejected new-token candidates

| Candidate                | Reason rejected |
|--------------------------|-----------------|
| `--density-modal-pad`    | Only PitchSelector qualifies (overlay) and it can use `--density-card-pad`. A separate modal-pad token would be consumed by exactly 1 surface — fails the "≥ 2 contexts" component-budget rule extended to tokens. |
| `--density-text-h1` consumption | The K9 token exists but should remain unconsumed by chrome H1s. The Lucid aesthetic is uppercase mono `text-sm` for page H1s — this is intentional (PRINCIPLES § "monochrome status signals"). Consuming `--density-text-h1` would split the H1 convention across pages. |
| `--density-text-h2` consumption | Same rationale. Both K11 and K12 should leave these unconsumed and document the deliberate non-use. (If a future detail-page H2 ever moves off uppercase mono — e.g. a true reading-mode body H2 in KnowledgeDetail — that is the place to consume them, with explicit designer call.) |
| `--density-table-row-h`  | DaisyUI tables have their own density (`table-xs`/`-sm`/`-md`/`-lg`). K12 should challenge whether the user-density preference *selects* among these classes; until then, leave tables on their own scale. |
| `--density-radius`       | Closed radius scale is a hard rule (AQ-011). Density should never affect corner radius — that is one of the canonical AI-aesthetic tells (rounded-2xl-everything). |

---

## 5. AI-aesthetic safeguards (comfortable-mode anti-patterns)

The K9 ratio (`comfortable = default × 1.5`) is aggressive on purpose. K11
will surface visible change at comfortable — and "visible change" is exactly
the moment when the AI dashboard aesthetic creeps in. Concrete don'ts:

### 5.1 Don't centre EmptyState / ErrorState under comfortable.

`text-left` is the convention across Tier 1+2. Centering becomes more
visually noticeable as the container widens; some agents will be tempted to
"clean it up" by switching to `items-center`. **No.** That is AQ-106 and
turns the page into a marketing-template empty state. EmptyState already
documents `flex flex-col items-start` — this stays. The K11 lint should
treat any `items-center` / `mx-auto` introduced inside EmptyState or
ErrorState as a regression.

### 5.2 Don't inflate verdict / DaisyUI buttons with `--density-text`.

ReviewHeader's primary verdict bar is the highest-frequency interaction
surface in the app. Buttons are `btn-xs` and they *stay* `btn-xs`. The
`design/no-density-tokens` allowlist (K11 deliverable) must include the
verdict bar. Same for IconRail buttons, Submenu filter chips, the Rail
collapse chevron, the WorkPortfolio cycle stripe button, and every DaisyUI
`btn` instance. Comfortable widens *containers*, not affordances.

### 5.3 Don't add hero spacing on product chrome.

`<main>` page gutter goes 8 → 16 → 24 px. It does **not** go 8 → 16 → 48 px,
even though the K9 ratio would permit it. AQ-103 caps it. The page gutter
is a productivity-app gutter, not a marketing-page hero. The
`--density-page-gutter` ladder (8/16/24) explicitly stops at 24 px so K12
cannot quietly push it higher.

### 5.4 Don't grow card outer-radii under comfortable.

Closed radius scale (AQ-011). All cards stay on `--r2`. There is no
`--density-radius` token (§ 4.6).

### 5.5 Don't grow chips, badges, version pills, count chips, or kbd hints.

StatusChip (3.1.1), Tag (3.1.2), NavItem count (3.1.4 stays-literal),
KnowledgeRow version pill (3.2.2 stays-literal), SearchField kbd
(3.1.5 stays-literal). These are all callouts. They must read smaller than
the body they sit next to.

### 5.6 Don't switch IconRail to comfortable.

IconRail is fully density-static (3.3.K1). The K11 `design/no-density-
tokens` rule's primary canonical example.

### 5.7 Don't centre `<main>` content.

`AppShell.tsx`'s `<main>` is `flex-1 overflow-y-auto px-… py-…` — it does
NOT carry `mx-auto` or `max-w-…`. K11 must not add a "comfortable-mode
content max-width" — that's a marketing-blog pattern (AQ-106). Pages reach
the page-gutter on both sides at every tier.

### 5.8 Don't oversize the user avatar in IconRail under comfortable.

The user avatar in IconRail (line 108: `h-6 w-6`) stays at 24 px regardless
of `--density-avatar-size`. That token applies to **row-anchor** avatars
only (ThreadRow, ReviewHeader). The IconRail avatar is brand chrome.

### 5.9 Don't introduce vertical air between sections at comfortable.

Pages today stack with `gap-3` literal; K11 makes this `var(--density-gap)`.
**Do not** add a "comfortable section divider" (border-t between sections,
extra padding above each H2). The visual separation should come from the
denser content (cards growing slightly), not from added chrome.

### 5.10 Don't add comfortable-only iconography.

Some agents will be tempted to "fill the space" at comfortable by adding
decorative icons next to labels (AQ-105, AQ-113). **No.** If a label has no
icon at compact, it has no icon at comfortable.

---

## 6. Density-discriminated screenshot rubric

For every refreshed surface, K11 (and K12's ladder challenge) must
verify these per-tier observations. If you see the same row count, the
density isn't doing its job.

### 6.1 Per-surface rubric

| Surface              | Compact       | Default       | Comfortable   | What to look for |
|----------------------|---------------|---------------|---------------|------------------|
| ThreadRow (per scroll) | 12 visible | 9 visible     | 6 visible     | Avatar size grows visibly; snippet font readable at every tier; timestamp position constant. |
| KnowledgeRow         | 14 visible    | 10 visible    | 7 visible     | Version pill and timestamp do NOT grow; row pad-y dominates the change. |
| NotificationRow      | 14 visible    | 10 visible    | 7 visible     | StatusChip + timestamp constant size; only row pad changes. |
| BetCard (Canvas)     | 6 cards / col | 4 cards / col | 3 cards / col | Card outer pad is the visible change; chip / progress-bar / lead-avatar invariant. |
| TaskCard (Kanban)    | 4 cards / col | 3 cards / col | 2 cards / col | 4 columns persist at every tier; column gap widens visibly. |
| PitchCard            | 4 visible     | 3 visible     | 2 visible     | hypothesis font grows; max-w 320 unchanged. |
| EmptyState           | text-left, ~28 px tall | text-left, ~36 px | text-left, ~52 px | NEVER centered. Title/description hierarchy preserved at every tier. |
| ErrorState           | text-left     | text-left     | text-left     | Retry button NEVER widens. |
| SkeletonList         | row-h matches ThreadRow | matches | matches | Skeletons must visually pop the same row count as the loaded ThreadRow. |
| SkeletonCard         | matches BetCard | matches    | matches       | Same — cards must not visually move when content arrives. |
| NavItem              | row-h ~32 px  | ~44 px        | ~56 px        | Icon size CONSTANT. Count badge CONSTANT. Body text grows. |
| KeyValue             | label CONSTANT (uppercase 11 px) | CONSTANT | CONSTANT | Only the value font grows. |
| StatusChip / Tag     | CONSTANT      | CONSTANT      | CONSTANT      | If you see them grow, the chip rule was violated. |
| SearchField          | input 32 px   | 32 px         | 32 px (40 px on `pointer:coarse`) | Input height NEVER grows on desktop. |
| IconRail             | 48 px wide    | 48 px wide    | 48 px wide    | Width CONSTANT. Icon CONSTANT. Avatar CONSTANT. |
| Submenu              | 240 px wide   | 240 px wide   | 240 px wide   | Width CONSTANT. Inter-row gap and inner pad widen. |
| Rail (collapsed)     | 56 px wide    | 56 px wide    | 56 px wide    | CONSTANT entirely. |  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
| Rail (expanded)      | 360 px wide   | 360 px wide   | 360 px wide   | Width CONSTANT. Section headers CONSTANT. KeyValue rows widen. |  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
| ArtifactView (text_diff) | line-h 16 px | 16 px      | 16 px         | Diff lines CONSTANT (code is not body text). Container pad widens. |
| ArtifactView (content_preview) | container pad widens | | | Body markdown grows with `prose-sm`. Metadata strip CONSTANT. |
| ReviewHeader         | 32 px tall    | 36 px tall    | 44 px tall    | Buttons CONSTANT (`btn-xs` always). Proposer name grows. |
| Canvas               | 2 cols, gap 8 | 2 cols, gap 12 | 2 cols, gap 16 | Cards inside scale per BetCard. Drop-zone min-h CONSTANT. |
| Kanban               | 4 cols on lg, gap 8 | gap 12 | gap 16 | Column count CONSTANT at lg. Column header CONSTANT. |
| PitchSelector        | max-h 480 px  | 480 px        | 480 px        | Overlay budget CONSTANT. Inner padding widens. |
| `/work/portfolio`    | 12+ products visible | 8 visible | 6 visible | H1 chrome CONSTANT. Cycle stripe widens. |
| `/work/team`         | inherits Canvas + Kanban | | | Section gap widens; H1 CONSTANT. |
| `/work/bet/:id`      | breadcrumb CONSTANT | | | BetCard, body text, comments widen; task table held by DaisyUI density. |
| `/conversations/review` | inherits ReviewHeader + ArtifactView | | | No page-level vertical air added at comfortable. |
| `/conversations/chat` | message group pad widens | | | Input bar CONSTANT. |
| `/knowledge`         | 18 rows visible | 13 visible | 9 visible    | Tab strip CONSTANT. Topic group headers CONSTANT. |
| `/knowledge/:id`     | metadata bar CONSTANT | | | Body markdown widens noticeably (this is the reading mode test). |
| NotFound             | CONSTANT      | CONSTANT      | CONSTANT      | Should look identical at every tier. |

### 6.2 The single most diagnostic shot

If a reviewer has time for **one** screenshot per tier:
`/work/portfolio` at 1280 × 800. Compact must show the cycle stripe + at
least 6 product cards. Default must show 4-6. Comfortable must show 3-4
with each card visibly larger. If all three look the same, K11 didn't
land. The product card on this page is the canonical density test because
it composes a card + KeyValue rows + chips + a progress bar — i.e. it
exercises every rule (cards scale, KeyValue value scales, chips don't,
progress bar doesn't).

---

## 7. Sources

Cited inline in § 3 and § 4. Domain in parentheses.

1. **Carbon Design System** — `carbondesignsystem.com` (IBM). Tag, SideNav,
   DataTable, density tokens.
2. **Polaris Design System** — `polaris.shopify.com` (Shopify). Badge,
   Skeleton row-height-matches-content rule.
3. **Material Design 3** — `m3.material.io` (Google). NavRail, list-item
   densities, icon-size cascade, card density, chip density, avatar-size
   scale.
4. **Linear** — `linear.app` (Linear). Inbox row, sidebar, project card,
   issue detail, board view, command palette.
5. **Atlassian Design System** — `atlassian.design` (Atlassian).
   DescriptionList, SideNav density, project card, EmptyState, modal,
   page padding density, Textfield density.
6. **Notion** — `notion.so` (Notion Labs). Property rows, list-row,
   sidebar, proposal/database tabs, page reading mode.
7. **Material 3 NavRail** — `m3.material.io/components/navigation-rail`  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
   (specifically named separately because the audit references it for the
   "icon stays literal" rule for both NavItem and IconRail).
8. **iOS Safari ≥16 px input zoom rule** — captured in HyperIdle's
   AESTHETICS.md § Mobile & Touch and AQ-005.
9. **Slack** — `slack.com` (Salesforce). Thread row density, message
   density, persistent rail width.  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
10. **Trello** — `trello.com` (Atlassian). Card density, board view
    column behaviour.
11. **GitHub** — `github.com` (Microsoft / GitHub). Diff viewer density,
    PR review toolbar, PR detail, issue body density, 404 page, Projects.
12. **dnd-kit** — `dndkit.com`. Drop-target a11y guidance.
13. **Datadog** — `datadoghq.com`. Product index density.
14. **DaisyUI** — `daisyui.com`. Table density classes (`table-xs`/`-sm`/
    `-md`/`-lg`).
15. **Discord** — `discord.com`. Message density.
16. **Fluent Design System** — `fluent2.microsoft.design` (Microsoft).
    Icon-size scale.
17. **Bootstrap** — `getbootstrap.com` (Twitter / Open source). Container
    gutter scale.
18. **Tailwind CSS** — `tailwindcss.com` (Tailwind Labs). `container`
    padding spec.

---

## 8. Working notes / appendix

Per-component one-line summary captured during Phase 1 reads. Kept here
so K11 / K12 don't have to re-read the source.

**Tier 1 primitives (`framework/design-system/src/`)**

- **StatusChip.tsx** — `inline-flex` pill, `px-[8px] py-[2px]`, `text-[11px]`,
  uppercase, color-mix tinted. Density: none today; correct.
- **Tag.tsx** — pill, `px-[8px] py-[2px]`, `text-[12px]`. Density: none
  today; correct.
- **KeyValue.tsx** — `flex` row/col, label uppercase 11 px mono, value
  `text-[length:var(--density-text)]`. Density: partial today; correct.
- **NavItem.tsx** — `<li>`/`<button>`, consumes `--density-row-h`, `--density-
  pad-x`, `--density-pad-y`, `--density-text`. Icon literal. Count chip
  literal. Density: yes today; correct.
- **SearchField.tsx** — input + icon + clear + kbd; input `h-[32px]`,
  geometry-tuned right-pad 56 px. Density: none today; correct (per § 3.1.5).
- **ThreadRow.tsx** — list row, `px-[8px]` literal + `py-[var(--density-pad-y)]`
  + `text-[length:var(--density-text)]`. Avatar `h-[32px]` literal. Density:
  partial today; should be `yes` after K11.
- **KnowledgeRow.tsx** — list row, `px-[8px] py-[8px]` literal (with
  factoryMode `py-[16px]` override). Density: none today; should be `yes`
  after K11. K11 must remove the factoryMode override.
- **NotificationRow.tsx** — list row, `p-[8px]` literal. Density: none
  today; should be `yes` after K11.
- **BetCard.tsx** — card, `p-[8px] gap-[4px]` literal, `gap-[8px]` inner.
  Density: none today; should be `yes` after K11. Lead avatar literal at
  24 px (correct per Principle 3).
- **TaskCard.tsx** — card, `p-[8px] gap-[4px] max-w-[320px]` literal.
  Density: none today; should be `yes` after K11.
- **PitchCard.tsx** — card, `p-[8px] gap-[4px] max-w-[320px]` literal.
  Density: none today; should be `yes` after K11.
- **EmptyState.tsx** — `flex flex-col items-start gap-[4px] px-[8px]
  py-[24px]`. Density: none today; should be `yes` on padding/gap/title
  font after K11. text-left invariant.
- **ErrorState.tsx** — same shape as EmptyState. Density: same answer.
- **Skeleton.tsx** (List + Card) — list `gap-[8px]`, rows `h-[32px]`; card
  `p-[12px] gap-[8px]` with literal bar heights. Density: none today;
  should be `yes` on container after K11.

**Tier 3 shells (`layers/core-ui/src/shell/`)**

- **IconRail.tsx** — `w-12 p-2 gap-2`. DaisyUI `btn-ghost btn-sm`. Density:
  none today; correct (canonical static surface).
- **Submenu.tsx** — `gap-[var(--density-gap)] p-2` outer, inner uses
  `--density-pad-x`. Width fixed `w-60` / `w-0`. Density: partial today;
  correct shape but outer pad should switch to `--density-page-gutter`.
- **Rail.tsx** — collapsed `w-14 p-2`; expanded `w-[360px] gap-[var(--density-  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
  gap)] p-2`. Density: partial today; correct shape; outer pad should switch
  to `--density-page-gutter`.
- **ArtifactView.tsx** — discriminated union of 5 shapes. Padding mostly
  `p-3` literal; diff line `px-2 py-1` literal. Density: none today; should
  be `partial` after K11 (container pad → `--density-card-pad`; diff lines
  literal forever).
- **ReviewHeader.tsx** — `py-2 px-3 gap-3` literal; verdict toolbar
  `btn-xs`; avatar `h-6 w-6`. Density: none today; should be `partial`
  (outer pad + proposer name + gap scale; buttons + avatar literal).
- **Canvas.tsx** — `gap-4` columns, `min-h-[48px]` drop zones, `text-sm
  font-semibold` headers. Density: none today; should be `partial` (column
  gap scales; cards inherit; drop-zone literal).
- **Kanban.tsx** — `grid-cols-1 sm:2 lg:4 gap-4`. Density: none today;
  should be `partial` (gap scales; columns + headers literal).
- **PitchSelector.tsx** — `p-3 gap-3 max-h-[480px]` literal. Density: none
  today; should be `partial` (pad + gap scale; max-h literal; cards
  inherit).

**Pages (`layers/core-ui/src/pages/`)**

- **WorkPortfolio.tsx** — `gap-3` page; product card `p-3 gap-2` literal;
  H1 uppercase mono `text-sm`. Density: none today; should be `yes` after
  K11 (gap → `--density-gap`; card pad → `--density-card-pad`; H1 literal).
- **WorkTeam.tsx** — `gap-3 h-full` page; composition. Density: none
  today; should be `yes` (gap → `--density-gap`; H1 literal).
- **WorkBet.tsx** — `gap-3 h-full` page; breadcrumb literal `12 px`;
  `<pre>` body `p-3 text-sm`; comment item `p-2`; H2s uppercase mono.
  Density: none today; should be `partial` (gap, body text, comment-item
  pad scale; H2 + breadcrumb + table literal).
- **ConversationsReview.tsx** — composition; no page-local pad. Density:
  none today; should remain `no` at chrome level.
- **ConversationsChat.tsx** — message-group `p-3` literal; input bar
  DaisyUI. Density: none today; should be `partial` (message-group pad
  scales; input + buttons literal).
- **KnowledgeList.tsx** — `gap-3 h-full` page; tab strip DaisyUI;
  curation suggestion card composes external component. Density: none
  today; should be `yes` (gap → `--density-gap`; suggestion card pad →
  `--density-card-pad`; tabs + topic headers literal).
- **KnowledgeDetail.tsx** — markdown body, observation log, related
  items. Density: none today; should be `partial` (body text +
  observation-entry pad scale; metadata bar + section H2 + buttons
  literal).
- **NotFound.tsx** — `p-3 gap-3` literal. Density: none today; should
  remain `no`.
