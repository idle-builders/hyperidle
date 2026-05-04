# L3 — Artifact Primitive — Phase 0 Interrogation

**Step.** /design Phase 0 — propose-and-commit interrogation. No further input requested; decisions made and recorded here for the variant briefs.

**Concept lock.** `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5; `docs/work-packages/the canonical-shapes contracts under docs/` "Artifact primitive (L3)".

---

## 1. What is one Artifact, in design terms?

A persistent record that a Task produced something. The visual job: let a human recognise *what was made*, *who made it (which Task)*, *what it cost*, *when*, and (when discussion exists) *that it has discussion* — without opening it. The Artifact view family is the closed set of four layouts that wrap the same canonical shape for four different consumer surfaces.

Locked shape (from the canonical-shapes contracts under docs/):
```
Artifact { id, producing_task_id, kind, preview, cost_from_session, created_at }
```
Threads (L1) attach via the universal cross-area attachment — the attachment is L1's, not Artifact's. Discussion volume surfaced upward is a designer call, not a data rule.

---

## 2. The four layouts

| Layout | Surface | Density | Chrome owner |
|---|---|---|---|
| `gallery_card` | Bet detail aggregation, Product page, Portfolio gallery — 2- or 3-up grids of mixed-kind artifacts | Card-level (`--density-card-pad`, `--surface-4`) | Artifact owns its frame |
| `stack_item` | Bet detail vertical stacks, Task detail "siblings produced this session", any list where Artifacts live among other items | Row-level (`--density-row-h`, `--surface-3` zebra or list) | Artifact owns its row |
| `single_full_preview` | The Artifact's own detail surface (a permalink) | Page-level breathing room (`--density-page-gutter`) | Artifact is the page subject; chrome is the page |
| `review_message_embed` | Inline inside a review message in Conversations | Message-level (lives inside a review-message container) | The review message owns the chrome; Artifact contributes only its identity strip + delegates preview rendering to the existing `ArtifactView` (5 shapes) |

**Key constraint that drives the design.** The `review_message_embed` is *not* a fifth standalone card. It is a contribution inside a chrome owned by the review message. Any variant that gives the embed its own border/background/shadow is wrong. The embed is a *reduced identity strip + the existing ArtifactView render* — nothing else.

---

## 3. Information slots — what appears where, in each layout

The canonical shape has six fields. Plus one derived signal (thread count). Mapping:

| Slot | gallery_card | stack_item | single_full_preview | review_message_embed |
|---|---|---|---|---|
| `kind` | Top-left, mono uppercase tag (`Tag`) | Top-left, same | Page header secondary, mono | Identity strip leftmost, mono |
| `producing_task_id` (rendered as task title) | Below kind, body weight, 1 line truncated | Same row as kind, after dot separator | Page header primary | Identity strip after kind, dot-separated |
| `preview` | Center fill, 80–120px tall, kind-aware preview surface (text excerpt / structured summary / placeholder) | Right-aligned 64×40 mini-preview tile, OR a single-line excerpt to the right of title (variant-dependent) | The preview *is* the page body — full-width, full-fidelity (delegates to `ArtifactView` for review-shape kinds; renders kind-specific preview otherwise) | Delegated entirely to `ArtifactView` (5 shapes) — the embed itself contributes no preview surface |
| `cost_from_session` | Bottom-left footer, mono `$0.42 · 3.2k` | Right-side mono, before timestamp | Header secondary row | Identity strip rightmost |
| `created_at` | Bottom-right footer, mono relative time | Rightmost mono | Header secondary row | Identity strip rightmost (after cost) |
| Thread count (derived from L1) | Footer, after timestamp, only when > 0 | Right side, only when > 0 | Whole panel/sidebar — full Thread surfaces from L1 | Not surfaced (the review thread itself is the discussion surface; doubling would confuse) |
| `id` | Implicit (not displayed) | Implicit | Header tertiary, mono `art_a1b2…` (truncated) | Implicit |

---

## 4. The "kind" enum — proposed canonical 12 + 1 catch-all

The concept commits only to function-agnosticism; the architect closes the enum in /architecture. For the design's purposes, I propose 12 canonical kinds (matching the spec's illustrative list 1:1) plus one open catch-all so unknown kinds render gracefully:

| # | kind id | Display label | Preview surface |
|---|---|---|---|
| 1 | `code_diff` | CODE DIFF | mono diff sample (3–5 lines, +/– colored via warn/danger sparingly) |
| 2 | `deck` | DECK | first-slide title strip + slide count |
| 3 | `contract` | CONTRACT | document title + party metadata |
| 4 | `dashboard` | DASHBOARD | structured KPI list (label + value, mono) |
| 5 | `screenshot` | SCREENSHOT | image thumbnail (when populated) |
| 6 | `drafted_email` | DRAFTED EMAIL | recipient line + subject + first body line |
| 7 | `design` | DESIGN | image thumbnail or "Figma frame" placeholder |
| 8 | `data_analysis` | DATA ANALYSIS | structured findings list |
| 9 | `decision` | DECISION | claim + one-line rationale (no chart) |
| 10 | `running_service` | RUNNING SERVICE | URL + status indicator |
| 11 | `comm_draft` | COMM DRAFT | channel + first message line |
| 12 | `verification` | VERIFICATION | pass/fail count + suite name |
| — | (catch-all) | uppercased kind id | Generic structured-text preview |

**Not in v1, with rationale:** none. All 12 ship; the spec lists them illustratively but a v1 with a smaller set would force consumer surfaces to fall into "Other" too often. The architect may close the enum tighter in /architecture.

**No emoji on any kind** — kinds are mono uppercase text labels via `Tag`. Lucide vector icons may appear *inside* preview surfaces only when they carry information (e.g. running_service's status dot), never as a kind decorator.

---

## 5. States, per layout

Every layout must handle:

- **Empty (no artifacts at this aggregate)** — only relevant for the surfaces that *contain* artifacts (gallery, stack). The Artifact primitive itself doesn't render here; the consumer surface does. The variants demonstrate this only as a parent-surface placeholder.
- **Loading (skeleton)** — `gallery_card`: pulsed full-card silhouette matching the populated geometry. `stack_item`: pulsed row matching `--density-row-h`. `single_full_preview`: header skeleton + body skeleton matching final layout shape. `review_message_embed`: identity-strip skeleton + delegated to `ArtifactView` skeleton for the preview area.
- **Error (artifact metadata loaded, preview render failed)** — render the identity strip normally; replace the preview area with a `--text-mid` "Preview unavailable — retry" inline action. Never collapse the card.
- **Populated** — the default state.
- **No-preview placeholder (`preview === null`)** — explicit, mandated by hard rule #4 (no fake thumbnails). Render a `--surface-3` filled box at the same dimensions as the populated preview, with mono uppercase `--text-lo` `PREVIEW PENDING` (or `PREVIEW NOT YET RENDERED` in `single_full_preview`). No icon, no shimmer, no gradient. Just an honest empty surface.
- **Cost-pending (`cost_from_session === null`)** — display `—` (em-dash) in the cost slot. Per L3 hard rule discipline (mirroring L4's "render — not a fake number"). Do not display `$0.00`.

---

## 6. Behavior, motion, keyboard, focus

- **Click-to-open.** All four layouts are interactive: gallery card and stack item open `single_full_preview` (the artifact's permalink). The embed's preview area opens the same permalink in a new pane (left thread, right artifact — this is L11's territory, but the embed exposes it as a click affordance on its identity strip).
- **Hover.** Card and row use the standard `--surface-4 → --surface-5` hover ramp via `--motion-fast`. The embed has no hover state on the identity strip itself (it lives inside an already-hovered review message); the preview area uses `ArtifactView`'s native hover.
- **Focus ring.** `outline: 1px solid var(--primary); outline-offset: -1px` per `BetCard.html` precedent.
- **Keyboard.** `Enter` / `Space` opens the artifact. `J/K` row navigation when the artifact lives in a list (delegated to the list — Kanban / Stack — not to the Artifact primitive).
- **Motion.** All transitions on `transform`/`opacity`/`background` per AQ-014. Skeleton uses the existing `skeleton-pulse` keyframe.
- **Reduced motion.** Inherits the `prefers-reduced-motion` block in `tokens.css`.

---

## 7. Mobile adaptation

- `gallery_card` collapses to a single column at < 640px; padding shifts to `--density-card-pad` comfortable tier; preview area stays the same proportional height.
- `stack_item` keeps the row geometry; the right-aligned mini-preview tile may drop in favour of the inline excerpt when viewport < 480px.
- `single_full_preview` is full-bleed on phone; the page header stacks its secondary row.
- `review_message_embed` already lives inside a chat-message container that handles its own mobile layout — the embed inherits.

Auto-density flips per AQ-016 at ≤ 1024px.

---

## 8. Identity decision (the variant axis)

The biggest open question is the *component identity*. Three options, one per variant:

- **Variant A — One component, layout prop.** `<Artifact layout="..." data={...} />`. Smallest surface, internal switching. Risk: prop-explosion as state matrices grow.
- **Variant B — Four sibling components.** `<ArtifactGalleryCard>`, `<ArtifactStackItem>`, `<ArtifactPreview>`, `<ArtifactEmbed>`, sharing four sub-primitives (`ArtifactKindBadge`, `ArtifactCostChip`, `ArtifactTimestamp`, `ArtifactPreviewSurface`). Largest surface, clearest per-layout contract.
- **Variant C — Layered with slots.** `<ArtifactSurface>` base renders canonical chrome (kind + producing-task + cost + timestamp + footer); consumers compose with `preview`, `actions`, `discussion` slots per layout via React composition. Medium surface, max flexibility.

Each variant must demonstrate ALL FOUR layouts in its mockup with at least three artifact-`kind` examples and the no-preview placeholder explicitly visible.

---

## 9. Anti-patterns to police

From AESTHETICS.md AQ-101..AQ-113, especially:
- AQ-101 closed radius (no `rounded-2xl` on artifact cards).
- AQ-103 no oversized padding (cards use `--density-card-pad`).
- AQ-105 no emoji on kind labels or anywhere.
- AQ-107 no glass morphism / backdrop-blur on preview surfaces.
- AQ-108 no decorative 3-up identical card grid in mockups for the gallery — show *mixed-kind* artifacts so the kinds vary.
- AQ-109 no lorem ipsum — every mockup uses HyperIdle-realistic content (Ambrovia / Nimmly / HyperIdle products from §6 of HUMAN_INTERFACE_LAYER.md).
- AQ-110 no marketing superlatives.
- AQ-115 (de facto) no fake thumbnails — placeholder when null per hard rule #4.

---

## 10. Component-budget cost (per variant, before reuse)

The current baseline (the canonical-shapes contracts under docs/ "UI Stack & Component Budget") lists `ArtifactView` already. The L3 primitive adds new components on top. Counting:

- **Variant A:** +1 (`Artifact`).
- **Variant B:** +4 (`ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`, `ArtifactEmbed`) + 4 internal sub-primitives (counted as private to L3, not budget items if sealed) = +4 to budget.
- **Variant C:** +1 (`ArtifactSurface`) + N consumer compositions (zero net budget if compositions are inline at call sites).

The budget is no longer strictly capped (per the canonical-shapes contracts under docs/ "No strict count enforced"), so cost is a tiebreaker, not a gate. But Variant A's +1 is preferred by the principle "create new components only when necessary".

---

## 11. Concept-tension list (surfaced for /architecture)

- The concept says "preview … may be null at creation; populated when a render is ready." This implies preview is sometimes a string (excerpt), sometimes a structured payload (KPI list), sometimes a thumbnail-reference (image). The design treats `preview` as a discriminated union keyed by `kind`. The architect must close the type.
- The concept says the `review_message_embed` "internally consumes the five `ArtifactView` shapes". This means the embed needs a way to get a `proposed_action`-shaped payload from an Artifact. Either Artifact carries a `review_payload` field (extending the canonical shape — out of scope for L3), or the renderer derives it from `kind + preview`. The design assumes the latter; the architect decides the contract.
- The fetching contract says "filtered by Task, Bet, Product, or Portfolio" returns "the canonical Artifact shape". The aggregating endpoints must expose enough metadata for the gallery/stack to render WITHOUT needing N extra API calls (e.g. producing-task title needs to be denormalised onto the Artifact-list response, OR the response includes embedded task records). Architect call.
- Thread-count surfacing — the concept says "what gets surfaced at higher levels … is a designer call about volume". The design surfaces the count on `gallery_card` and `stack_item` (when > 0) but not on the embed (the surrounding review thread is itself a thread). The architect must expose `thread_count` in the fetch response.

---

## 12. Decisions locked for variants

1. Kind enum: 12 canonical + catch-all (per §4).
2. Slot mapping: per §3 table.
3. States: 6 per layout (per §5).
4. Embed contributes only an identity strip + delegates preview to `ArtifactView`.
5. No-preview placeholder: explicit `PREVIEW PENDING` mono surface, no shimmer.
6. Cost-pending: em-dash, never `$0.00`.
7. Identity strip layout for the embed: `kind · task title · cost · time` (single mono row).
8. Thread count surfaced on gallery + stack only; never on embed; full thread on single_full_preview.
9. Mockups demonstrate populated + no-preview + at least three kinds in EVERY layout.
10. Mockups use realistic Ambrovia/Nimmly/HyperIdle content from §6 of HUMAN_INTERFACE_LAYER.md.

These constraints are non-negotiable for variant authors. The variant axis is identity (single / sibling / slot) and chrome / density / motion / copy register expression.
