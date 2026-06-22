# Variant A — Focused full-page route

**Story:** `Session View · A · Focused Route` (`packages/web/src/components/SessionViewFocused.stories.tsx`, export `FocusedRoute`)

**User task.** A founder following an agent's live work, full-screen, to validate it and queue a follow-up — the calmest, most-room placement.

## Constraint & thesis
Constraint: give the streaming conversation the whole canvas; one centered `max-w-[760px]` reading column, nothing competing for height. Thesis: the references are calmest at full width — full-width agent text, capped tool output, and a per-turn diff panel all want room the 460px slide-over didn't have.

## Component composition
- **Top bar** — `SESSION` pill (live amber dot) · agent name · task · status roll-up (`SessionStatusBar`: Changes +X/−Y · PR · Background · Artifacts) · close ✕. Roll-up hides < md.
- **Reading column** — `SessionStream` (the heterogeneous Part stream): agent prose (full-width, `AgentProse`), human bubbles (`HumanBubble`, right-aligned), `ToolRow` / `ToolAggregate`, `ReasoningRow`, ending on a streaming prose with `StreamCursor`.
- **Per-turn changed-files panel** — `CHANGED FILES (N) +X/−Y · View diff` + file list with `DiffStat`; `View diff` opens `ReviewCodeDiff` (Q5 = panel).
- **Queued bubble** — `QueuedBubble` at the column tail.
- **Scroll-to-bottom pill** — floats above the composer (`ScrollToBottomPill`).
- **Composer** — `SessionComposer running` pinned bottom: model · effort · mode · permission pills + "Working for Ns" + Queue + red Stop.

## Information hierarchy
1. The agent's streaming prose (where the eye lands — full-width, 15px).
2. Tool rows / aggregate (compact, indented-feel, muted) — the *what it did*.
3. The changed-files panel + status roll-up (the *what changed*).
4. Composer controls (tertiary; descriptor pills are muted until hovered).

## Open-question resolutions
- Q1 entry → **full-page route**.
- Q2 aggregate → inline verb "Ran a command, read 2 files, searched the web · 4 steps ▸".
- Q3 reasoning → quiet italic "Thought for 14s ›", left-rule on expand.
- Q4 queue → muted dashed bubble + clock + "Queued · sends when the agent finishes" + ✕.
- Q5 diff → **per-turn CHANGED FILES panel** (+ inline diff chip on standalone edit rows).
- Q6 composer → Stop (red) + Queue; "Working for Ns" in the composer strip.
- Q7 status → **in scope**, top-bar roll-up.

## States
- Populated + streaming (shown). Empty/loading/error deferred to build.
- Overflow: long tool output caps at `max-h-64` with scroll; long target truncates.

## Behavior / motion
- Auto-pin to newest; the scroll-to-bottom pill appears when scrolled up (suppress pin during fold toggles — build).
- Tool/reasoning expand: chevron rotate `--motion-fast`. Running dot + streaming caret: `skeleton-pulse`, motion-safe only.
- Keyboard: tool rows are role=button, Enter/Space toggles. Composer: Enter sends/queues, Esc closes the route.

## Mobile
Three-tab layout: the route is the active tab content; top bar collapses the status roll-up; column goes edge-to-edge at `px-[12px]`; composer pills wrap. Diff panel "View diff" opens full-screen.

## Signature
**The studio.** One calm centered column with the whole screen around it — the session as the only thing you're doing.

## Trade-offs
Bad at: glancing at the diff (one click behind "View diff"); switching back to the conversation (it's a route, you navigated away). Heaviest commitment of the three.
