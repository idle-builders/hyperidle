# Variant 1 — Calm Transcript  ✅ APPROVED (founder review 2026-06-22)

> Chosen direction. Founder annotations applied — see `../approved.md` for the locked spec. Deltas from the original below: human messages are LEFT-ALIGNED (reuse the conversation row, not a right-aligned bubble); no inline permission Allow/Deny card; no status-metrics roll-up bar; avatars + composer reuse the conversation's components; a sub-agent row opens its own nested session view. Story title is now `Session View · Calm Transcript`.

**Story:** `Session View · Calm Transcript` (`packages/web/src/components/SessionContentTranscript.stories.tsx`, export `CalmTranscript`).
**Rendering axis:** disclosure-minimal + aggregation-forward. The calmest reading of a session — content first, activity a fold away.
**Screenshot:** `screenshot.png`.

## The grammar
- **Tool row = a bare one-liner.** `[per-kind icon] · verb · muted truncated target · (diff chip) · (▾ if output) · status glyph`. NO inline I/O at rest. Output reveals as an indented mono `<pre>` (capped `max-h-64`) on click; a failure's `<pre>` carries a destructive left rule.
- **Hard aggregation.** A consecutive run of foldable tool calls (not file-change, not failed, not running, not sub-agent) collapses to ONE row: a summary verb ("Ran a command, read 2 files, ran 2 searches, queried Linear") + step count, expanding to the bare rows beneath a left rule. `aggregateAt = 2` (aggregates early — the calm bias).
- **Reasoning** folds to "Thought for 14s" (italic, tertiary), re-expands to muted prose under a left rule.
- **File diff** stays as its own row (never folded into an aggregate) with an inline `name +N/−M` chip; a per-turn/session **Changed files (N)** panel sits below the stream with "View diff" → `ReviewCodeDiff`.

## Aspect placement
- a streaming caret on the last prose · b reasoning fold · c MCP + sub-agent in/after the aggregate · d failed `Run command` (✗; stderr on expand) · e hard aggregate · f diff chips + changed-files panel · g cost tick after the streaming prose · h permission Allow/Deny card · i artifact chip · k plan list (open) · l queued dashed bubble at the tail · m turn header · n "Working for 1m 47s" + Stop in composer · o descriptor pills · p top-bar status roll-up · q scroll-to-bottom pill.

## Why this is calm
Every calm-rendering principle at maximum: collapse-by-default everywhere, aggregation over enumeration (a 6-call run = one line), monochrome restraint (status = a tiny glyph; only failure colored), no per-line chrome. Best for long-prose validation sessions where the founder reads the agent's reasoning, not its keystrokes.

## Trade
Substance is one click away — to see *what* a command printed you expand it. Acceptable when the agent's prose already narrates the work (it does, in the reference sessions).

## Build notes
Variant-local `BareToolRow` / `HardAggregate` over the shared `SESSION_PARTS` + `blockStream`. In build these become the `tool`-Part dispatch arm's "calm" rendering; the aggregate is the renderer grouping beside `groupParts`. Diff chip → `diff` Embed → `ReviewCodeDiff`. No new DS primitive.
