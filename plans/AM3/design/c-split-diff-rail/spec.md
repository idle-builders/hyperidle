# Variant C — Immersive split (stream + persistent diff rail)

**Story:** `Session View · C · Split + Diff Rail` (`packages/web/src/components/SessionViewSplit.stories.tsx`, export `SplitDiffRail`)

**User task.** Follow a **code-heavy** agent session and watch the diff land in real time — the diff is co-equal with the stream, not a click away.

## Constraint & thesis
Constraint: full-width route split into two persistent columns — streaming conversation left, a sticky **Changes rail (440px)** right that keeps the file diff visible *while the agent works*. Reference-borrowed (t3code/Claude-desktop coding sessions). Thesis: for code work the diff is the second focus; making it always-on removes the open/close churn entirely.

## Component composition
- **Top bar** — `SESSION` pill (live) · agent · task · **Ready for review** CTA · ✕.
- **Left pane** — `SessionStream aggregateAt={3}` in a `max-w-[680px]` column + queued bubble + scroll-to-bottom pill + `SessionComposer running` pinned bottom.
- **Right rail** — `Changes +X/−Y · PR #N` header; a **file list** (top file highlighted) with `DiffStat`; a **live expanded hunk** of the top file rendered with `ReviewCodeDiff`'s exact `add/del/ctx` tint vocabulary (`content` → `parts[]` fix). Always visible.

## Information hierarchy
1. Agent prose stream (left, primary).
2. The diff rail (right, co-equal second focus — the *what changed*, always on).
3. Tool rows / aggregate inside the stream.
4. Composer + Ready-for-review CTA.

## Open-question resolutions
- Q1 entry → **full-width route, two-pane split** ← the C fork.
- Q2 aggregate → inline verb (tighter; left pane is the narrower column).
- Q3 reasoning → "Thought for Ns ›".
- Q4 queue → muted dashed bubble + clock + ✕.
- Q5 diff → **persistent diff rail** (changed-files + live hunk) ← the C fork.
- Q6 composer → Stop + Queue; "Working for Ns" in the left composer.
- Q7 status → **in scope**, as the rail header + the Ready-for-review CTA.

## States
Populated + streaming (shown). Empty/loading/error deferred. **Non-coding session:** the rail collapses to a thin "No changes yet" strip (deferred state — noted, not rendered in the initial design).

## Behavior / motion
- Rail diff updates live as edits land (append). Clicking a file in the list scrolls the rail to that file's hunks (build).
- Same stream/expand motion as A/B. The split is a CSS grid; rail is independently scrollable.
- Keyboard: Tab moves stream → rail; the rail's file list is arrow-navigable (build).

## Mobile
The rail can't coexist with the stream at phone width → it becomes a **Changes tab** (the stream is the default tab; a `+X/−Y` badge on the Changes tab). The split is desktop-only.

## Signature
**The diff is always on.** You watch the edits land beside the conversation — no open/close, no hunting.

## Trade-offs
Bad at: non-coding sessions (the rail is mostly empty and steals ~440px); narrowest stream column of the three (680px minus the rail); highest density / most opinionated — the most to get wrong if the session isn't code.
