# "Session View" (explored as Variant 1 — Calm Transcript)  ✅ APPROVED (founder review 2026-06-22, 12 rounds)

> Chosen + founder-approved direction. **The authoritative locked spec is `../approved.md`** — read it first; this is the explored-variant note kept as history. Final deltas from the original exploration: the message row is the **unified self/other pattern** — my own (`isMe`) message RIGHT-aligned in a grey box, everyone else (incl. agents) left-plain — **fixed at the source in the shared `PartList`** (also fixing the AM1 conversation); no inline permission Allow/Deny card (review is the allow point); no status-metrics roll-up bar; cost = session-total in the header; avatars + composer reuse the shared conversation components; a sub-agent row opens its own nested session view.

**Story:** `Session View` (`packages/web/src/components/SessionView.stories.tsx`, export `SessionView`).
**Rendering axis:** disclosure-minimal + aggregation-forward. The calmest reading of a session — content first, activity a fold away.
**Screenshot:** `screenshot.png`.

## The grammar
- **Tool row = a bare one-liner.** `[per-kind icon] · verb · muted truncated target · (diff chip) · (▾ if output) · status glyph`. NO inline I/O at rest. Output reveals as an indented mono `<pre>` (capped `max-h-64`) on click; a failure's `<pre>` carries a destructive left rule.
- **Hard aggregation.** A consecutive run of foldable tool calls (not file-change, not failed, not running, not sub-agent) collapses to ONE row: a summary verb ("Ran a command, read 2 files, ran 2 searches, queried Linear") + step count, expanding to the bare rows beneath a left rule. `aggregateAt = 2` (aggregates early — the calm bias).
- **Reasoning** folds to "Thought for 14s" (italic, tertiary), re-expands to muted prose under a left rule.
- **File diff** stays as its own row (never folded into an aggregate) with an inline `name +N/−M` chip; a per-turn/session **Changed files (N)** panel sits below the stream with "View diff" → `ReviewCodeDiff`.

## Aspect placement (final)
- a streaming caret on the last prose · b reasoning fold · c MCP + sub-agent in/after the aggregate (sub-agent → nested session) · d failed `Run command` (✗; folds into the aggregate, header signals "· 1 failed"; stderr on expand) · e hard aggregate (all completed fold; only the running tool standalone) · f diff chips + changed-files panel → `ReviewCodeDiff` · g **session-total cost in the HEADER** (`$0.71 · 48.2k tokens`) · ~~h permission card~~ REMOVED · i artifact chip · k plan list · l queued muted right-aligned box at the tail (unified self pattern) · m turn header (shared `PartList`) · n "Working for Ns" + Stop in composer · o descriptor pills · ~~p status roll-up~~ REMOVED · q scroll-to-bottom pill (centered above the composer).

## Why this is calm
Every calm-rendering principle at maximum: collapse-by-default everywhere, aggregation over enumeration (a 6-call run = one line), monochrome restraint (status = a tiny glyph; only failure colored), no per-line chrome. Best for long-prose validation sessions where the founder reads the agent's reasoning, not its keystrokes.

## Trade
Substance is one click away — to see *what* a command printed you expand it. Acceptable when the agent's prose already narrates the work (it does, in the reference sessions).

## Build notes
Variant-local `BareToolRow` / `HardAggregate` over the shared `SESSION_PARTS` + `blockStream`. In build these become the `tool`-Part dispatch arm's "calm" rendering; the aggregate is the renderer grouping beside `groupParts`. Diff chip → `diff` Embed → `ReviewCodeDiff`. No new DS primitive.
