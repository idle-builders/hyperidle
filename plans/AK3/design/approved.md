# AK3 — Approved design (input contract to /architecture)

**Surface:** the "Tasks" section of the bet detail page (`packages/web/src/pages/WorkBet.tsx`). **Class:** routine. **New components:** none. **Aggregate critique:** 8.4/10.

`/architecture` and `/write-code` do NOT re-decide the visual hierarchy, component vocabulary, copy, or interaction grammar below. They decide data shape, route, and wiring.

## The contract: four honest states, one slot

Replace the unconditional `EmptyState` ("Tasks will appear here once agents start work") with a switch on a derived **task-section state**. The same `<section aria-label="Tasks">` shell stays; only its body branches.

Precedence (evaluate top-down; first match wins):
1. `bet.tasks.length > 0` → **Populated** (existing list, unchanged). *Tasks always beat a late blocker.*
2. `bet.status === "draft"` → **Draft**
3. decomposition blocker present (`decompositionStatus === "blocked"`) → **Blocked** (reason-specific copy)
4. otherwise (`active`, 0 tasks, not blocked) → **Decomposing**

## Component mapping

| State | Component | Props (final copy) | testid |
|---|---|---|---|
| Populated | existing task-row `<button>` list + `StatusChip` + `LiveDot` | unchanged | `task-row` (each) |
| Draft | `EmptyState` | title `"Not committed yet"`, description `"Commit this bet and your team will break it into tasks."` | `bet-tasks-draft` |
| Decomposing | `EmptyState` | icon `<LiveDot />`, iconBg `var(--accent-primary-dim)`, title `"Planning the work"`, description `"Your team is breaking this bet into tasks. This usually takes a moment."` | `bet-tasks-decomposing` |
| Blocked — no eligible agent (`reason = no_eligible_agent`) | `EmptyState` | icon amber alert glyph (24px, `--accent-secondary`), iconBg `var(--accent-secondary-dim)`, title `"No one can take this work"`, description `"This team has no agent eligible to own tasks for this bet, so work hasn't started. Add an agent to the team to get going."`, action `<Button variant="secondary">Add an agent</Button>` → team agents settings | `bet-tasks-blocked` |
| Blocked — empty/failed (`reason = empty` \| `failed`) | `EmptyState` | icon amber alert glyph, iconBg `var(--accent-secondary-dim)`, title `"Couldn't plan the work"`, description `"Your team couldn't break this bet into tasks. Try committing again, or refine the bet's goal and done condition."`, no action | `bet-tasks-blocked` |

All copy above is final. Amber (`--accent-secondary`), not red — a blocker is a state to act on, not a crash.

## Behavior / motion / keyboard
- No new motion. `LiveDot` keeps its existing pulse. Decomposing→Populated is a plain remount when the first task arrives via the WS task event the page already consumes. No layout-property transitions (AQ-014).
- Blocked "Add an agent" `Button`: standard hover/focus/pressed; in tab order after the section heading; ≥44px touch target (Button-owned).

## Mobile
No change. Bet detail is the Work tab; the section stacks full-width; copy wraps; the action button is touch-sized.

## A11y
`EmptyState` renders `role="status"`. Blocked stays `role="status"` (not `alert`) — it is persistent honest state discovered on view, not an interrupt.

## Rejected (do not re-litigate)
New `BlockerBanner` component; `ErrorState` for the blocker; progress bar / "N of M" during decomposition; commit toast as the primary surface; retry-decomposition button on blocked-empty. Reasons in `synthesis.md`.

## Open questions for /architecture (data shape only — not visual)
1. **`decompositionStatus` field.** The bet surface needs to read a per-bet decomposition outcome to pick states 3 vs 4. Architecture decides where it lives: a column on `bets` (e.g. `decompositionStatus: 'pending'|'running'|'blocked'|'done'` + `decompositionBlockerReason: 'no_eligible_agent'|'empty'|'failed'|null`) vs derived (0 tasks + a logged blocker row). The UI needs: (a) a boolean "is there a blocker", (b) the reason enum (`no_eligible_agent` vs `empty`/`failed`), (c) a way to tell "still decomposing" from "blocked". The GET `/bets/:id` response (`BetDetail`) must carry these so the page renders without a second fetch.
2. **Decomposing must be bounded.** A hung/failed PM turn must resolve to `blocked` (reason `failed`), or "Planning the work" sticks forever — a C1 violation. Architecture owns the timeout/failure→blocked transition; the UI just renders whatever terminal state lands.
3. **"Add an agent" target route.** Confirm the team-agents settings route to link to (recovery path for `no_eligible_agent`).
