# Variant 3 — Activity Timeline

**Story:** `Session View · 3 · Activity Timeline` (`packages/web/src/components/SessionContentTimeline.stories.tsx`, export `ActivityTimeline`).
**Rendering axis:** timeline-gutter grammar + side reveal. The structure of the work is carried spatially; detail docks beside the stream.
**Screenshot:** `screenshot.png` (rendered with the failed tool selected → its stderr in the reveal panel).

## The grammar
- **A left gutter rail threads each turn.** A continuous vertical line runs down the gutter; every tool call is a **NODE** on it — the per-kind icon sits inside an 18px ringed dot whose border tone encodes status (tertiary / accent-secondary running / `--status-error` failed). Prose sits to the right of the gutter as one flowing turn, aligned by a gutter spacer. The eye reads a turn as a threaded unit, not a stack of disconnected rows.
- **Aggregate = one node** showing the run count in the dot ("6") + the summary verb; selecting it reveals all steps in the side panel.
- **Side reveal panel (400px, docked right).** Selecting a node opens a panel showing that node's **output** (`<pre>`) or **diff** (a `ReviewCodeDiff`-style two-gutter hunk with old/new line numbers + "Open full diff"). I/O does NOT expand inline (which would break the rail) — it lives beside the rail. Closeable; the stream reflows to full width when closed.
- **Reasoning / plan / permission / artifact** render to the right of the gutter (plan/permission/artifact indented past the rail so their own chrome reads).

## Aspect placement
Same full taxonomy. The screenshot shows the failed `Run command` node selected with its stderr in the reveal panel — the "see structure + drill the detail beside it" loop. A "Ready for review" CTA sits in the status bar (this variant leans into the session-status roll-up).

## Why this grammar
Best for code-heavy sessions where *order and structure* matter and the founder wants to watch edits land while keeping a diff open beside the stream — the reference "studio" feel. The rail makes a 20-step turn legible as one thread.

## Trade
The reveal panel competes for width (stream → 680px). The rail reads faint on prose-only turns (a turn with no tool nodes is just a gutter line) — acceptable, but the rail earns its keep only on tool-dense turns. Two-pane is the highest-chrome variant.

## Build notes
Variant-local `GutterNode` / `GutterProse` / `AggregateNode` / `RevealPanel` over the shared content model. The reveal panel reuses `ReviewCodeDiff`'s hunk/gutter/tint vocabulary (the docked panel is a thin frame around it in build — never a second diff renderer). Selection is local `useState`. No new DS primitive.
