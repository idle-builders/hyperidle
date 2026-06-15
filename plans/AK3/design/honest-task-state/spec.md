# Variant — "Honest task state" (the only variant; routine)

## User task
Founder views a committed bet → understands instantly whether work is starting, already running, or blocked — and if blocked, what to do about it.

## Component composition
- Existing `<section aria-label="Tasks">` in `WorkBet.tsx` (heading + body). Unchanged shell.
- Body switches on a derived **task-section state** (draft | decomposing | blocked | populated):
  - **populated** → existing task-row `<button>` list (`StatusChip`, `LiveDot`, owner/meta). **Unchanged.**
  - **draft / decomposing / blocked** → `EmptyState` (design-system) with state-specific `title` / `description` / `icon` / `action`.
- **blocked** action slot → `Button variant="secondary"` linking to the team's agents settings ("Add an agent"). Recovery, not a dead end.
- **decomposing** icon slot → `LiveDot` (the live, in-flight signal already used for in-progress tasks) so "planning" reads as active, not stuck.

## Information hierarchy (the tasks section)
1. Section heading "Tasks" (existing uppercase tertiary label, unchanged).
2. The single state region (one of four), 18px below the heading.
3. Within blocked/decomposing: title (what's true) → description (why / what next) → action (recovery, blocked only).

## States (copy is final)
- **Draft** (`bet.status === "draft"`):
  - title: `"Not committed yet"`
  - description: `"Commit this bet and your team will break it into tasks."`
  - icon: none. action: none. `dataTestId="bet-tasks-draft"`
- **Decomposing** (`active`, 0 tasks, `decompositionStatus === "running"` or unset-but-recent):
  - title: `"Planning the work"`
  - description: `"Your team is breaking this bet into tasks. This usually takes a moment."`
  - icon: `<LiveDot />`. action: none. `dataTestId="bet-tasks-decomposing"`
- **Blocked — no eligible agent** (`active`, 0 tasks, `decompositionStatus === "blocked"`, reason = `no_eligible_agent`):
  - title: `"No one can take this work"`
  - description: `"This team has no agent eligible to own tasks for this bet, so work hasn't started. Add an agent to the team to get going."`
  - icon: amber alert glyph (24px, `--accent-secondary`, `iconBg` amber-dim). action: `Button secondary` "Add an agent" → team settings. `dataTestId="bet-tasks-blocked"`
- **Blocked — decomposition produced nothing / failed** (`active`, 0 tasks, `decompositionStatus === "blocked"`, reason = `empty`|`failed`):
  - title: `"Couldn't plan the work"`
  - description: `"Your team couldn't break this bet into tasks. Try committing again, or refine the bet's goal and done condition."`
  - icon: amber alert glyph. action: none (re-commit is via existing bet controls; AK3 adds no retry button — out of scope). `dataTestId="bet-tasks-blocked"`
- **Populated** (`bet.tasks.length > 0`): existing list. Unchanged. `task-row` testids preserved.

State precedence (read top-down): `draft` → `populated (tasks>0)` → `blocked` → `decomposing` → fallback decomposing. Tasks existing always beats any blocker (a late blocker never hides real tasks).

## Behavior / motion
- No new motion. `LiveDot` carries its own existing pulse. State transitions are plain remounts (decomposing→populated when the first task lands via the existing WS task event the page already subscribes to). No layout-property transitions (AQ-014).
- The blocked action button: existing `Button` hover/focus/pressed states. Keyboard: it's in the normal tab order after the heading.

## Mobile adaptation
- Bet detail is one of the three mobile tabs (Work). The tasks section already stacks full-width; `EmptyState` is full-width and copy wraps. Blocked action button is full-width-friendly (≥44px touch target via Button). No change.

## Signature
**The section never lies.** The same slot that today says "tasks will appear" now says exactly one of four true things — and the one failure state a founder must act on (no eligible agent) is the only one that carries an action.

## Trade-offs / bad at
- Does not show *partial* decomposition progress (e.g. "2 of N planned") — there is no N until the breakdown lands. Acceptable: v1 decomposition is one PM turn, not a streamed graph.
- "Decomposing" has no hard timeout UI in AK3 — if the PM turn hangs, the founder sees "Planning the work" until the decomposition resolves to blocked. Architecture must ensure a hung/failed PM turn resolves to `blocked` so this never sticks forever (ties to concept C1). Flagged as an architecture obligation, not a UI affordance.
