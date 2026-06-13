# AI4 Proof Set — Status Language Consolidation

## AC1a — Task state chip: three-surface parity

Validation scenario: `in_progress` task renders identical green "IN PROGRESS" chip with LiveDot on all three surfaces.

| Surface | Proof image | Notes |
|---|---|---|
| WorkBet task list | `ac1a-workbet-task-row-in-progress.png` | Green StatusChip + LiveDot |
| WorkTask header | `ac1a-worktask-header-in-progress.png` | Green StatusChip + LiveDot |
| TaskSheet | see note below | LiveDot only — by plan scope (Task 8) |

### TaskSheet scope note (AC1a third surface)

Per architecture plan Task 8 and Standing Risk #2:

> "TaskSheet.tsx: delete local LiveDot; import promoted. (Status label in SessionRow stays as-is — it's session `status` string with its AC4-load-bearing raw fallback; **do not** change behavior — only the dot is consolidated."

TaskSheet does **not** render a task state `StatusChip`. Its session-row status surface is:
- `<LiveDot />` (promoted, AI4 Task 8) — shown when `isActive`
- Raw text string (`"Active"` / `"Done"` / raw status) — this is the session worker status, not entity TaskState

The architecture explicitly scoped TaskSheet to dot-consolidation only. Pushing the session-status text through StatusChip requires `sessionOutcomeToStatus`-style handling for the live `active` string — which is flagged as AI5 adoption, out of AI4's safe scope.

The TaskSheet proof for AC3 (LiveDot present) is captured in `livedot-worktask-session-row-active.png` which shows the promoted LiveDot on an active session row in WorkTask. TaskSheet uses the same promoted `LiveDot` component from `@hyperidle/design-system`.

**AC1a three-surface verification**: The spec requires "same chip (color/shape/label)" — TaskSheet has no TaskState chip by design, confirmed by code review of `TaskSheet.tsx:150-153`. The AC is satisfied for the two surfaces that render a TaskState chip (WorkBet task row, WorkTask header), and TaskSheet's live-state surface is the LiveDot per plan scope.

## AC1b — Bet status chip: three-surface parity

Validation scenario: `active` bet renders identical "ACTIVE" chip on all three surfaces.

| Surface | Proof image |
|---|---|
| Portfolio (BetCard) | `ac1b-portfolio-betcard-active-chip.png` |
| Bet detail (WorkBet header) | `ac1b-betdetail-header-active-chip.png` |
| Team (WorkTeam bet row) | `ac1b-team-betrow-active-chip.png` (recaptured post-C1 fix) |

**C1 fix**: WorkTeam.tsx:765 previously omitted `label`, rendering "HEALTHY" via the StatusChip default path. Fixed in Phase 4 by adding `label={BET_STATUS_LABEL[bet.status]}`. All three surfaces now read "Active" (CSS-uppercased to "ACTIVE").

## AC3 — LiveDot present on live state surfaces

Proof images: `livedot-worktask-session-row-active.png`, `parity-worktask-header-chip.png`

## AC5 — Outcome verdicts: semantic coloring

| Verdict | Portfolio | Bet detail |
|---|---|---|
| validated | `ac3-portfolio-betcard-verdict-validated.png` | `ac3-betdetail-outcome-verdict-validated.png` |
