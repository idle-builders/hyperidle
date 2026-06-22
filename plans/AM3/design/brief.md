DESIGN-CLASS: novel  ref=PartList(extended:tool+reasoning)  pattern=ConversationSurface

> **HISTORICAL (design exploration).** Kept as the record of the content-rendering exploration. The chosen + founder-approved direction is **"Session View"** (the variant explored below as "1 · Calm Transcript", renamed) — final state in `approved.md`. Two things in this brief were superseded by review and are NOT the final state: (1) the human-message row is the **unified self/other pattern** (my own = right grey box, everyone else incl. agents = left-plain), fixed at the source in the shared `PartList` — not a right-aligned bubble nor a left-aligned row; (2) the **permission Allow/Deny prompt was REMOVED** (the review is the allow point) — it is NOT a rendered aspect. Read `approved.md` for the truth.

# AM3 — Session View: design brief (content-rendering axis)

The session view IS a streaming human+agent conversation, read inside the established **`ConversationSurface`** (concept `plans/AM3/concept.md`). **Entry/placement is SETTLED** — reached via the existing `session` `OpenTarget` (`packages/web/src/services/open-handler.ts`, the `case "session"` no-op AM3 fills); the surface shape is `ConversationSurface` (header · PartList column · composer). Attempt 2's three placement variants (route/panel/split) were the **wrong axis** (founder, 2026-06-22).

**The real design exploration:** *how do we DISPLAY the tool calls and every other aspect of a live session?* The variants explore the **rendering vocabulary of the session content** — never where the surface sits.

## Why novel
Two new Part **render kinds** (`tool`, `reasoning`) are essential-component-shaped; the surface renders a re-modeled content stream. L-style new render units → always novel. → 3 variants on the content-rendering axis; founder picks in `/human-design-review`.

## The user task
A founder is **following one agent's live work** to validate it (approve / redirect / queue a follow-up). The decision: *is the agent on the right track, and what changed?* What wastes their time: a wall of undifferentiated prose; a noisy enumeration of 30 tool calls; a failure buried in collapsed output; a diff three clicks away; a composer that locks while the agent streams. The variants differ in **how much each tool call shows at rest** and **how its I/O & diffs reveal** — the central calm-vs-glanceable tension.

## The axis being explored (NOT placement)
**The rendering vocabulary of the session content** — the display of tool calls and the aspects in concept Part 7. Three coherent rendering languages, each a complete answer to "what does a session look like":

- **1 — Calm Transcript (→ the approved "Session View").** Disclosure-minimal + aggregation-forward. Every tool call is a bare one-liner; a run folds HARD to one summary verb; output/diffs reveal on click. Content first, activity a fold away. The calmest reading. **This is the chosen + founder-approved direction (renamed "Session View").**
- **2 — Glanceable Activity.** Inline I/O previews + low-click. Every tool row carries a one-line I/O preview AT REST (stdout head / match count / MCP result / error); a failure reads loudest (destructive rule + inline error); a diff reveals inline under the edit row. Read the substance without expanding.
- **3 — Activity Timeline.** Timeline-gutter grammar + side reveal. An agent turn is threaded by a left gutter rail; tool calls are NODES on the rail; selecting a node opens a docked reveal panel (output / `ReviewCodeDiff` diff) beside the stream. Structure carried spatially.

## What is held CONSTANT across all three (so the founder compares vocabulary, not data)
Same `ConversationSurface` shape, same session fixture (`sessionContentFixtures.tsx`), same descriptor-driven composer, same queued row, same plan / reasoning / artifact / cost atoms. **Only the tool-row grammar + I/O-reveal mechanism differ.** *(Historical: a permission atom + status roll-up were held constant during exploration; both were REMOVED at review — see banner.)*

## Aspect coverage (concept Part 7) — all three demonstrate the FULL taxonomy
a streaming answer text (caret) · b reasoning fold ("Thought for 14s") · c tool calls by family — command / read / edit / search / web-search / **MCP** / **sub-agent** / create · d tool states incl. a **REAL failed tool** (✗ + stderr) · e aggregation · f file diffs (inline chip + changed-files panel/reveal → `ReviewCodeDiff`) · g cost/token (final: session-total in the header) · ~~h permission prompt~~ (REMOVED — review is the allow point) · i artifact chip · j sub-agent → **nested session view** (recursion) · k plan/todo · l human + **queued** message (unified self/other pattern) · m identity/turn header · n working state + Stop · o descriptor composer pills · ~~p status roll-ups~~ (REMOVED) · q scroll-to-bottom.

## Reuse inventory (Phase 0b — hard gate)
| Element | Renders via | Note |
|---|---|---|
| Streaming agent prose (markdown) | `ProsePart` look (build reuses `ChatMarkdown`) | story uses a light inline renderer (bold/`code`) |
| Human / queued message | unified self/other pattern (my own = right grey box; everyone else incl. agents = left-plain) + muted/clock queued variant | fixed at the source in the shared `PartList`; queue is pre-Part state |
| Author/turn header (name · time) | `PartList` group-header pattern (`clockTime`) | reused shape |
| **Tool row** (icon+verb+target+status+I/O) | **NEW** `tool` Part renderer | extends closed `PartKind` (concept Phase 4) — needs status glyph + per-kind icon + collapse; can't reuse `ProsePart` |
| **Tool aggregate** | **NEW** renderer grouping over a `tool` run | beside `groupParts`; NOT a Part kind |
| **Reasoning** ("Thought for Ns") | **NEW** `reasoning` Part renderer | uses `Fold` device; carries `durationMs` the dispatch needs |
| File diff (chip / inline / side panel) | **`ReviewCodeDiff`** + `diff` Embed | reused, never re-invented (concept rejection 5); add/del/ctx tints mirrored |
| `+N/−M` diff stat | `ChangeBadge` look from `ReviewCodeDiff` | mirrored atom |
| ~~Permission prompt~~ | **REMOVED** (review is the allow point — no per-tool gate) | not a rendered aspect |
| Plan / todo | compact step list + `Fold` | composition, not a new primitive |
| Artifact chip | `ReferenceChip` / `ArtifactEmbed` look | opens owned surface (no inline viewing) |
| Composer pill strip | descriptor-driven (`HarnessCapabilityDescriptor`) | select→pill; model declaring no option → no pill |
| Send / Stop / Queue · scroll-to-bottom · status bar | bare buttons (Hearth pill/circle) | composition |

**NEW shapes: exactly 2 Part renderers (`tool`, `reasoning`) + 1 renderer grouping (aggregate)** — the concept's locked extension cost. Everything else composes from existing primitives or reuses `ReviewCodeDiff`. The tool/reasoning renderers live in `packages/web/src/components/parts/` (web layer), like the existing per-kind Part renderers. The variant stories carry variant-local grammars (bare row / glance row / gutter node) over the SAME content model in `sessionContentFixtures.tsx`.

## States rendered
Populated real state only (MEMORY `feedback_no_skeleton_error_in_initial_designs`). The required populated edge case is a **failed tool** (✗ + stderr). *(Historical: a permission Allow/Deny prompt was rendered during exploration; it was REMOVED at review.)* No skeleton/empty/error-state variants — `derivePartsFromSession` loading/empty/error states are deferred to build.

## Hard rules (unchanged)
Reuse PartList/Fold/ReferenceChip/ReviewCodeDiff. NO color/token changes (Hearth/AESTHETICS — only failure uses the existing `--status-error`, permission uses `--status-warning`). Designer scope = stories that render cleanly at `:8098`; no tests/lint/bless (builder's job). No `approved.md` — founder picks next.
