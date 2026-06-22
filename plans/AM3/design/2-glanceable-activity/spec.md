# Variant 2 — Glanceable Activity

**Story:** `Session View · 2 · Glanceable Activity` (`packages/web/src/components/SessionContentGlance.stories.tsx`, export `GlanceableActivity`).
**Rendering axis:** inline I/O previews + low-click. Read the substance of the session without expanding anything.
**Screenshot:** `screenshot.png`.

## The grammar
- **Tool row carries a one-line I/O preview AT REST.** Below the verb/target line, a muted mono `→ <preview>` shows the result: a command's stdout head (`→ @ai-sdk/react 6.0.3 · 4 matches`), a search's match count (`→ 3 matches in 2 files`), an MCP result (`→ 1 issue ENG-411 "chat blank after send"`), an edit's intent (`emit parts[] instead of content`). Click expands to the full body — but you rarely need to.
- **A FAILURE reads loudest.** The failed row gets a destructive left rule (`border-s-2 --status-error`) and its preview line is the error in `--status-error` (`✗ 1 failing · appendMessage() still spreads { content }`). Glanceable failure is the whole point.
- **Soft aggregation.** A run shows a verb header ("Ran a command, read 2 files…") with a hairline + count, but the rows STAY VISIBLE beneath — nothing is hidden, the header just narrates. `aggregateAt = 3`.
- **Inline diff.** A file-change row reveals a compact `ReviewCodeDiff`-tinted hunk INLINE under the row (add/del/ctx tints) — the diff is never a click-away-and-navigate.
- **Sub-agent** renders as a bordered card with its nested mini-stream inline + a "Background" running chip.

## Aspect placement
Same full taxonomy as V1; the difference is every tool row's I/O is read inline. Permission / plan / reasoning / artifact / cost / queued / composer / status atoms are shared and identical.

## Why this is glanceable
Optimizes for "watch it work and understand without clicking." The founder reads the session's actual I/O — the substance, not just the verbs. Best when the founder wants to verify *what the agent saw/ran*, not just trust the prose.

## Trade
The busiest variant — a preview line per row roughly doubles vertical rhythm; a long preview truncates (single line, `truncate`). Inline diffs add height. Mitigated by soft-aggregating reads/searches and capping previews to one line.

## Build notes
Variant-local `GlanceToolRow` (inline preview) / `SoftAggregate` / `SubAgentRow` / `InlineDiff` over the shared content model. The preview field is on the `tool` Part (`preview?: string`). Inline diff reuses `ReviewCodeDiff`'s add/del/ctx tint tokens (no new renderer). No new DS primitive.
