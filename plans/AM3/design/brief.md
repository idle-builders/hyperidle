DESIGN-CLASS: novel  ref=PartList(extended:tool+reasoning)  pattern=ConversationSurface

# AM3 — Session view: design brief (redo)

The session view IS a streaming human+agent conversation (concept `plans/AM3/concept.md`). Attempt 1 modeled it as a config band + prose activity log — rejected as the wrong primitive. This redo builds the streaming-conversation surface from the founder's reference screenshots (t3code, Claude desktop). The quality bar: reference-faithful, calm, dense — match `t3code-session-streaming-toolrows.png`.

## Why novel
Two new Part **render kinds** (`tool`, `reasoning`) are essential-component-shaped; the surface is re-modeled. L-style new render units → always novel. → 3 variants, full constraint spread, founder picks in `/human-design-review`.

## The user task
A founder is **following one agent's live work** to validate it (approve / redirect / queue a follow-up). The decision: is the agent on the right track, and what changed? What wastes their time: a wall of undifferentiated prose, a noisy enumeration of 30 tool calls, a diff hidden three clicks away, a composer that locks while the agent streams.

## The fork being decided (open-question 1)
**How the session view is entered & placed.** Attempt 1's 460px slide-over was likely too narrow for full-width agent text + diffs + tool output. The three variants are the three honest placements:
- **A — Focused full-page route.** The session owns the whole canvas; one centered reading column. Most room, calmest, "studio" feel.
- **B — Wide companion panel (620px).** The kept attempt-1 entry mechanism (conversation stays mounted, dismissible, Escape-close) but finally wide enough. Dial in without leaving the conversation.
- **C — Immersive split (stream + persistent diff rail).** Reference-borrowed; the diff sits beside the stream, always visible, for code-heavy sessions.

## Reuse inventory (Phase 0b — hard gate)
Every visual element → the component that renders it. `NEW` only where extension is impossible.

| Element | Renders via | Note |
|---|---|---|
| Streaming agent prose (markdown) | `ProsePart` look (build reuses `ChatMarkdown`) | story uses a light inline renderer (bold/`code`); build wires real markdown |
| Human message bubble | right-aligned bubble (mirrors `UserTimelineRow` / `ThreadShell` grouping) | reuse `groupParts` author grouping in build |
| Author group header (name · time) | `PartList` group header pattern | reused shape (`clockTime`) |
| **Tool row** (icon+verb+target+status+output) | **NEW** `tool` Part renderer | extends closed `PartKind`; concept Phase 4. Cannot reuse `ProsePart` — needs status glyph, per-kind icon, collapse-to-output |
| **Tool aggregate** ("Ran N…") | **NEW** renderer grouping over a `tool` run | beside `groupParts`; NOT a Part kind (concept §Aggregation) |
| **Reasoning block** ("Thought for Ns") | **NEW** `reasoning` Part renderer | uses the `Fold` collapse device; carries a `durationMs` the dispatch needs → can't be a plain `prose`+Fold |
| File diff (inline chip / panel / rail) | **`ReviewCodeDiff`** + `diff` Embed | reused, never re-invented (concept rejection 5). The rail/panel reuses its `add/del/ctx` tint vocabulary |
| `+N/−M` diff stat | `ChangeBadge` look from `ReviewCodeDiff` | small atom, mirrored |
| Queued-message bubble | bubble + clock + ✕ | composition of bubble + glyph; not a new DS primitive |
| Composer pill strip | descriptor-driven (`HarnessCapabilityDescriptor`) | mirrors AM2 `DialInControls`; select→pill |
| Send / Stop / Queue | bare buttons (Hearth pill/circle) | composition |
| Scroll-to-bottom pill | bare button | composition |
| Status roll-ups (Changes/PR/Background/Artifacts) | bare strip | Should-have; in scope here |

**NEW shapes: exactly 2 Part renderers (`tool`, `reasoning`) + 1 renderer grouping (aggregate).** This is the concept's locked extension cost. Everything else composes from existing primitives or reuses `ReviewCodeDiff`. No new DS-catalog primitive is requested — the tool/reasoning renderers live in `packages/web/src/components/parts/` (web layer), like the existing per-kind Part renderers.

## States rendered
Populated + **one in-progress streaming turn** (streaming caret on the latest prose + a failed tool row + a running indicator) + a **queued** human message. No skeleton/loading/error/empty variants (initial-design rule).

## Hard constraints
- Hearth tokens only; no color/token change. Failure status uses the existing `--status-error`; running uses `--accent-secondary`.
- Reuse AM1's Part rendering structure (author grouping + per-kind dispatch). The story embodies the new kinds as real Part renderers through a PartList-shaped stream.
- One diff renderer in the product (`ReviewCodeDiff`).
