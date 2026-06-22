# Variant B — Wide companion panel

**Story:** `Session View · B · Companion Panel` (`packages/web/src/components/SessionViewCompanion.stories.tsx`, export `CompanionPanel`)

**User task.** Dial into the agent's live work **without leaving the conversation** — the kept attempt-1 entry mechanism (dismissible, conversation stays mounted, Escape-close), finally wide enough.

## Constraint & thesis
Constraint: keep the conversation behind (dimmed) and present the session as a wide **620px** right dock (up from the rejected 460px). Density-first; status condensed into the header, diffs as **inline chips** (the dock is narrower than a route so it favours the inline affordance over a panel). Thesis: the calmest entry is the one that never makes you leave — context stays one glance away.

## Component composition
- **Conversation behind** — dimmed (`opacity-40`) host conversation with a "Worked for 1m 47s · Show session" `Fold`. This is the surface the dock opens over.
- **Dock** — `w-[620px]` `border-l` + `--shadow-elevated`.
  - **Panel header** — `SESSION` pill (live) · agent · task · ✕, then a **condensed status row** (Changes +X/−Y · PR #N · N background). No separate status bar.
  - **Stream** — `SessionStream aggregateAt={3}`: same Part stream; file-change edits render as **standalone `ToolRow`s with an inline diff chip** (`stream.ts +9/−2`), the failed command as its own expandable row, read/search noise aggregated.
  - **Queued bubble**.
  - **Composer** — `SessionComposer running`.

## Information hierarchy
1. Agent prose stream (primary, in the dock).
2. Inline edit rows with diff chips — the *what changed*, in line.
3. Condensed status header.
4. Dimmed conversation (ambient context, deliberately recessive).

## Open-question resolutions
- Q1 entry → **wide companion dock** (conversation stays mounted).
- Q2 aggregate → inline verb (tighter).
- Q3 reasoning → "Thought for Ns ›".
- Q4 queue → muted dashed bubble + clock + ✕.
- Q5 diff → **inline diff chip on each file-change tool row** (no panel) ← the B fork.
- Q6 composer → Stop + Queue; "Working for Ns" condensed.
- Q7 status → **condensed into the panel header**.

## States
Populated + streaming (shown). Empty/loading/error deferred. Overflow: dock scrolls internally; conversation behind does not.

## Behavior / motion
- Open: slide-in from right (`--motion-default`). Escape / ✕ closes, conversation re-brightens.
- Same expand/stream motion as A. Dock is `position:fixed`-style over the page in build.
- Keyboard: focus traps inside the dock while open; Escape returns to the conversation.

## Mobile
The dock becomes a full-screen sheet (the conversation is fully replaced, not dimmed-beside). Header status row wraps; diff chips stay inline.

## Signature
**Dial in, don't leave.** The conversation is still right there, dimmed; the session is a wide pane you can dismiss back into it.

## Trade-offs
Bad at: very wide diffs (inline chips open a sub-view, no persistent diff real-estate); the dimmed conversation eats horizontal space that a route would give the column. 620px is narrower than A's 760px column.
