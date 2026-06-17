DESIGN-CLASS: novel  ref=ThreadShell/CommentRow/RichMessageCard  pattern=ThreadShell

# AM1 — Conversation Experience: Design Brief

Fixed input: `plans/AM1/concept.md` (locked). Variants explore the *visual / interaction shape* of the Conversation + Part model; they do NOT redefine what the concept IS.

## Why novel (despite ref match)
Spec references existing thread components (`ThreadShell`/`CommentRow`/`RichMessageCard`) **but** introduces a NEW design-system primitive — the **Part model** (a source-agnostic rendering structure: typed Parts + Embed + Fold). Concept Phase 0 classifies it as a new primitive and confirms **Human design review = Yes**. New primitives are always `novel` → **3 radically different variants**. The *rendering shape itself* is what's being decided.

## The decision (one sentence)
The founder, in a deliberate threaded conversation with their agents, wants messages that read calmly and **embed what they refer to** (artifact, referenced block, diff, a link to a session) — establishing the shared **Part model** the session view (AM3) later reuses. NOT a work-log.

## Carried design axes (from TRACK-AM, not pre-resolved here)
1. **Conversation-style reach** — how far the calm, embedding-rich agent-chat style reshapes the deliberate-message conversation (while staying deliberate messages in Threads; transcript-as-conversation is out of bounds).
2. **Embedding model** — what a message embeds and *how it reads* (compact-inline vs side-surface vs full-bleed-inline).

## Interrogation (autonomous reads — founder engages at /human-design-review)
- **Who / decision:** founder scanning + steering a thread; deciding "do I follow this, and do I approve the proposed change?" Primary state = **populated agent+human thread with embeds**.
- **Smallest surface:** the conversation reading column + composer. The thread *list* (left nav) and the session dial-in (AM3) are out of scope — render the column in isolation.
- **Primary state:** populated (a mixed person/agent thread with an artifact diff, a referenced block, a session reference, a review→verdict). Also show empty/loading/error in the spec.
- **New primitive vs extension:** new primitive (Part model) → variants explore the rendering shape.
- **Density / overflow:** long agent reasoning and completed work **Fold** to a one-line summary; embeds never become a wall.
- **No color/token work** — Hearth palette + `AESTHETICS.md` tokens unchanged. Structure + rendering style only.

## Phase 0b — Reuse inventory (hard gate)
Barrel: `packages/design-system/src/index.ts`.

| Visual element | Existing component | Verdict |
|---|---|---|
| Plain message row | `CommentRow` (sender-grouped, mention/redaction/verdict aware) | **REUSE** |
| Rich review/questionnaire card + verdict bar | `RichMessageCard` (idle/saving/error/resolved, foldable reasoning) | **REUSE** |
| Composer (deliberate message input) | `Composer` (textarea + send, Cmd/Enter) | **REUSE** (no model/effort pills — those are AM3 dial-in) |
| Avatar / agent tint | `Avatar`, `AvatarGroup` | **REUSE** |
| Status / tone dot | `StatusChip`, `RowDot`, `LiveDot` | **REUSE** |
| Tag / kind chip | `Tag`, `TAG_KIND_ICONS` | **REUSE** |
| Key/value meta (cost, tokens) | `KeyValue` (tabular-nums) | **REUSE** |
| Artifact embed (inline) | `ArtifactEmbed` + `ArtifactPreview` + `kinds/*` renderers | **REUSE / EXTEND** |
| Referenced-block embed | `BlockRefEmbed` (web) → `Block` + `renderPayload` | **REUSE** |
| Host banner | `ThreadHostBanner` | **REUSE** |
| Empty / loading / error | `EmptyState`, `Skeleton`/`SkeletonList`, `ErrorState` | **REUSE** |
| **Part model wrapper** (the shared renderer) | — | **NEW** — the primitive itself; no existing component is a source-agnostic Part stack. |
| **Fold device** (collapse-to-summary on any Part) | partial: `RichMessageCard` folds its own reasoning | **NEW (small)** — generalize fold beyond review reasoning to any Part. |
| **Session-reference Embed** (points at a Session, not its log) | — | **NEW (small)** — composes `Avatar`+`LiveDot`+`KeyValue`+`Button`; a chip, not a work-log. |
| **Compact diff Embed** (`+N/−M` card) | partial: `kinds/code-renderer`, `ArtifactPreview` | **NEW (small)** — a compact diff-stat card; opens full detail off-column. |

NEW count is deliberately minimal and concept-mandated (the Part model is the WP). Each variant must justify any *additional* new shape.

## Canonical fixture (ALL variants render the SAME conversation, so they compare)
Thread host = a bet/task ("Passkey login"). Participants: **A. Founder** (human), **Atlas** (agent, builder). Ordered messages:
1. **Founder · plain:** "Can you wire passkey login and show me the diff before we deploy?"
2. **Atlas · plain + Fold:** collapsed summary "Worked for 1m 12s · 14 steps"; expands to body "Added WebAuthn registration + the dual-auth window. Existing sessions stay valid through phase 2."
3. **Atlas · plain embedding an Artifact diff:** compact card `auth/passkey.ts · text_diff · +124 −18` (opens fuller off-column).
4. **Atlas · plain embedding a referenced Block:** knowledge-item block card "Auth migration plan — §2 Dual-auth window" (inline rendered block).
5. **Atlas · plain embedding a Session reference:** chip "Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls →" — opens the AM3 dial-in; NEVER expands the work-log inline.
6. **Atlas · review:** title "Approve deploy of passkey login to staging", reasoning (3 lines, foldable), artifactRef `text_diff`; verdict bar Approve / Request changes / Reject.
7. **Founder · verdict:** approve → review resolves.

Data shapes: `Message` / `Thread` / `InlineRef` per `packages/shared/src/thread.ts` (read it). Mentions/refs/verdict shapes shown in `CommentRow.stories.tsx` / `RichMessageCard.stories.tsx`.

## The three variants (theses fixed; anti-convergence enforced)
- **A — "Quiet stream" (reuse-first / minimal scaffold).** Thin Part-model layer over existing primitives, single calm ~720px column, embeds compact-inline, session=chip. Prove the style ships at near-zero new shapes. Density: medium. Embed-open: compact inline. Composition: reuse-only.
- **B — "Two-pane / embeds open to the side" (power-density).** Terse scannable column; embeds are compact reference chips that open their full preview in a **right contextual panel** (the t3code 3-pane idea); aggressive folding. Density: high. Embed-open: side panel. Composition: column + panel.
- **C — "Calm document" (reference-borrowed: t3code column + Linear comment threading).** Generous single column reading like a living document; embeds render **full-bleed inline** with their real kind-renderer, the "Worked for Xs" Fold a first-class device. Density: low/generous. Embed-open: full inline. Composition: new document-grade Part renderers.

Each pair differs on ≥3 axes (density, embed-open strategy, composition, hierarchy, motion). No convergence.

## Hard constraints for every variant
- Honor the concept's rejection list: deliberate messages only; **session activity is NEVER first-class conversation content** (session = a reference Embed); within the Thread/Message/verdict model; name nothing "Block"/"blocked".
- No color/token changes; no new tokens. Use existing `--*` tokens + Hearth grid spacing {3,6,9,12,18,24,36,48}px, radius {10,16,9999}, type {12,13,15,17,…}, weights {400,500,600,700}. Warm only.
- Render in isolation (presentational; props/fixtures in, callbacks noop). No backend, no MockProviders needed for a column.

---

## REDO v2 — FOUNDER FEEDBACK (AUTHORITATIVE — supersedes the variant defs above)

Founder rejected all three v1 variants: **"too busy, too misaligned, not structured enough — none worthy to even comment on."** The redo must hit the founder's bar by studying the actual reference images, not our v1 output.

**STUDY THE REFERENCE FIRST (mandatory):** `plans/AM1/Screenshot 2026-06-16 at 22.15.49.png` (the main t3code conversation). What makes it worthy — copy this *restraint*, not its colors:
1. **Almost no per-message chrome.** NO avatar, NO "AGENT/BUILDER" role badge, NO timestamp on every message. The agent's turn flows as **prose**. Identity appears quietly at most once per turn (or via a quiet section label) — never repeated on every line. This was our #1 busyness sin.
2. **Narrow centered reading column with generous margins.** Lots of empty space left/right of the column and generous vertical rhythm *between* turns. It breathes. Do not fill the width; do not cram.
3. **Understated, consistently-aligned embeds.** The reference's file reference is a quiet muted line (small, monospace path + `+/−`), NOT a heavy bordered/shadowed card. ONE calm embed treatment, every embed left-aligned to the same column edge.
4. **Structure from typography + whitespace, not boxes/borders/badges/accent-rails.** Bold inline lead-ins, clean bullet/numbered lists, comfortable line-height. Kill the left accent rails, the per-message tinted cards, the badge soup.
5. **Quiet section separators.** A small uppercase, letter-spaced label like `RESPONSE · WORKED FOR 1M 12S` (use `--text-tertiary`, `--tracking-caps`) marks an agent work-turn — calm, not a heavy fold card. The **Fold** is this quiet label + optional "Show".
6. **One clean alignment grid.** Every element shares one left edge in the column. No ragged insets. This was our #2 sin (misalignment).
7. **Composer:** a single clean rounded elevated input at the bottom (`--r-default`, generous padding). NO model/effort pills (those are AM3 dial-in).

**KILL these (per founder + [[memory]]):** skeleton / loading / error / empty states. Each variant story exports **ONLY `Populated`** (the real conversation). No `order` needed.

**Concept unchanged:** still deliberate messages within Threads; session = a quiet reference Embed (one understated line/label that opens the dial-in, NEVER an inlined work-log); within Thread/Message/verdict; nothing named "Block"; no color/token changes.

**The three redone variants (all must hit the bar above; differ on STRUCTURE LEVEL, not on adding chrome):**
- **A "Quiet prose"** — faithful to the reference: the conversation reads as flowing prose; turns separated only by quiet uppercase section labels + whitespace; embeds = understated muted inline lines (path + `+/−`, a one-line block ref, a one-line session ref). The most minimal — almost no containers. Hierarchy is purely typographic. (Was "Quiet Stream" — strip its chips/cards/rails.)
- **B "Quiet turns"** — slightly more structure: each speaker turn is a calm, generously-padded **borderless** block (soft `--surface-container` tint at most, no border, no shadow, no accent rail), sender named once and quietly; embeds as ONE restrained aligned card style; turn rhythm from spacing + the soft block, not chrome. Scannable + structured, still calm. (Replaces the v1 two-pane — **drop the side panel**: a second region reads as "busy"; the reference is single-column.)
- **C "Editorial"** — long-form reading layout: generous column, slightly larger body type, embeds full-bleed and beautiful (the actual diff / block render in place) but with ONE consistent calm treatment + strong whitespace; agent work marked by a quiet section label; the richest embedding, but disciplined and aligned. (Was "Calm Document" — remove the per-message badges/timestamps, the mid-thread composer is already fixed; push restraint + alignment much further.)

Anti-convergence: A=no containers/typographic-only, B=soft borderless blocks, C=editorial full-bleed embeds. They differ on chrome level, embed treatment, density, type scale — while ALL sharing the reference's calm/aligned/structured restraint.
