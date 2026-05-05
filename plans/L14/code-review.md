# L14 Code Review

**Reviewer:** Phase 4 (same reviewer as Phase 2)
**Date:** 2026-05-05
**Branch:** feature/L14-bet-actions (worktree at `.worktrees/L14`)
**Verdict:** NOT DONE

---

## Lens 1: Architecture

### Findings

**OBSERVATION — Layer boundary is clean.**
Server enrichment (title derivation, product join, progress computation) lives in `packages/server/src/routes/bets.ts` as planned in architecture.md Option A. Client stays thin. Three-layer boundary intact.

**OBSERVATION — State machine actor field correctly threaded.**
`RevisionLogEntry.actor?: string` added to the interface in `bet-state-machine.ts:25`. `addRevisionEntry` accepts optional actor (line 64). `transitionBet` and `updateBetField` both receive and forward the actor. Backward-compatible (optional field).

**OBSERVATION — New routes follow established pattern.**
`POST /bets/:id/pause` and `POST /bets/:id/resume` match the architecture plan's route checklist exactly: `pauseBetSchema` requires reason (min 1), `resumeBetSchema` makes reason optional. Both routes call `assertBetReadable` before state machine.

**OBSERVATION — `MUTABLE_IN_STATUSES` correctly expanded.**
The architecture critique finding "allow paused/behind/blocked to update fields" is implemented in `bet-state-machine.ts:245`.

**OBSERVATION — `blocked` → `paused` transition absent from VALID_TRANSITIONS.**
`VALID_TRANSITIONS.blocked = new Set(["in_progress", "killed"])` (line 37). Pause is correctly omitted for blocked bets in `BetActionsBar`. This matches the architecture critique direction and is correctly flagged in a `@lore` comment (line 177-179 of WorkBet.tsx). The design table in approved.md says blocked gets Pause, but the architecture critique overrides it — the implementation follows the critique correctly.

**WARNING — `shaped` status missing "Adjust appetite" button.**
The approved design table (approved.md line 38) specifies that a `shaped` bet shows "Adjust appetite — Kill bet". The `showAdjust` logic in `BetActionsBar` (WorkBet.tsx line 192-193) only includes `in_progress || paused || behind || blocked`. A shaped bet shows only Kill bet. This is a spec violation.

**OBSERVATION — useBet refresh mechanism.**
`useBet` adds `refresh: () => void` via counter-increment (useBet.ts line 63-65). The counter approach correctly avoids race conditions from rapid double-calls. Clean.

**WARNING — `fetched.refresh()` called when `overrideBet` is set.**
In `handleResume` (WorkBet.tsx line 664), `handleConsequenceConfirm` (line 706), and `handleAppetiteConfirm` (line 724), `fetched.refresh()` is called unconditionally. When `overrideBet` is provided, `useBet` receives `undefined` and its `refresh()` is a no-op (incrementing a counter that never triggers a fetch because `betId` is undefined). This means actions taken in story/test scenarios with `overrideBet` silently succeed without updating the displayed bet. Not a production bug (production always uses `routeBetId`), but the no-op refresh in the `overrideBet` path is a leaking abstraction.

---

## Lens 2: Design

### Findings

**CRITICAL — Pause consequence dialog is missing STOPS / CONTINUES / SAVED sections.**
The approved design (approved.md lines 67-71) specifies that the Pause dialog has:
- STOPS: "All agent sessions will be suspended. No new tasks will start."
- CONTINUES: "The bet, its tasks, and revision log are preserved in full."
- SAVED: "All completed tasks and artifacts are unaffected."

The implementation wraps these sections in `{isKill && (...)}` (WorkBet.tsx line 344), meaning the Pause dialog has NO consequence preview content — only the reason textarea. The Pause dialog is supposed to be a *consequence preview*; without the sections, the user has no information about what pausing actually does. This defeats the core purpose of AC-2 ("consequence preview that tells the user what stops, what continues, and what's saved").

**WARNING — Kill action bar button uses conflicting class combination `btn-error btn-ghost`.**
WorkBet.tsx line 231: `className="btn btn-xs btn-error btn-ghost"`. In DaisyUI, `btn-ghost` overrides background to transparent with a hover effect. Combined with `btn-error`, the styling is indeterminate — browsers apply the last conflicting rule. The approved design says "Kill bet button: DaisyUI `btn btn-xs btn-error`" (approved.md line 20) — `btn-ghost` is not specified. Remove `btn-ghost` from the Kill action bar button.

**WARNING — Pause dialog confirm button uses `btn-primary` instead of surface-5.**
WorkBet.tsx line 392: `${isKill ? "btn-error" : "btn-primary"}`. The approved design specifies "Pause bet" button uses `surface-5 background` (approved.md line 72). `btn-primary` maps to the primary accent color, not `var(--surface-5)`. This is a token compliance deviation.

**WARNING — Dialog missing `aria-labelledby`.**
The approved design specifies `aria-labelledby` linking to the title's ID (approved.md line 65). The dialogs use `aria-label={title}` (WorkBet.tsx lines 340, 487) instead of `aria-labelledby` pointing to the rendered `<h2>` element. While `aria-label` is valid, the spec contract requires `aria-labelledby`.

**OBSERVATION — Unblock deviates from approved design spec (two points).**
Approved design (lines 111-112): `scrollIntoView({ block: 'start', behavior: 'smooth' })` on the HostThreadSection root element, then 100ms delay before `focus()`. Implementation (WorkBet.tsx lines 683-685): uses `block: 'nearest'` and focuses immediately without delay. These are minor deviations unlikely to cause user-visible differences.

**OBSERVATION — Dialog motion not implemented.**
Approved design specifies 250ms open / 150ms close animations via CSS `@starting-style` (approved.md lines 105-108). No motion CSS is applied in the implementation. Since this is a new feature and the approved design was accepted with these values, this is a gap — though not functionally blocking.

**OBSERVATION — Stories added for L14 action bar states.**
WorkBet.stories.tsx adds `InProgressActions`, `PausedActions`, `BlockedActions`, `BehindActions`. Stories are present. No stories for `shaped`, `committed`, or `review` status bars.

**OBSERVATION — `data-testid="composer-textarea"` is present.**
HostThreadSection.tsx line 219: `data-testid="composer-textarea"` is present. This was the Phase 2 critique fix — correctly implemented.

---

## Lens 3: Security

### Findings

**OBSERVATION — Auth applies to all new routes.**
`app.ts:247` mounts `authMiddleware` via `api.use("*", ...)` before bet routes are registered at line 267. Both new routes (`/pause`, `/resume`) are covered by the same X-API-Key auth that covers all existing bet routes.

**OBSERVATION — `assertBetReadable` called on all action routes.**
kill (line 261), pause (line 274), resume (line 287) — all three call `assertBetReadable` before the state machine. Prevents 500s from nonexistent betIds.

**OBSERVATION — Appetite enum guard at route level.**
PATCH route validates `body.value` against `BET_APPETITES` when `body.field === "appetite"` (bets.ts lines 229-234). Returns 400 for invalid values. The lore comment explains why this is at the route level (protected test in state machine uses "4 weeks" directly and must remain green).

**OBSERVATION — `reason` field trust boundary.**
`reason` is stored as JSON in `revisionLog`. Zod validates it is a string. No HTML injection risk since `revisionLog` is never rendered as HTML. `maxLength={500}` is enforced client-side only — no server-side length cap. Not a critical risk for a single-founder system but is asymmetric with client intent.

**OBSERVATION — No rate limiting beyond X-API-Key auth.**
Architecture.md "Security & abuse cases" explicitly notes this is acceptable for v1. New routes inherit the same rate-limiting infrastructure as existing routes (app-level limiter in app.ts). No finding.

**OBSERVATION — `as never` casts on `c.req.valid()` calls.**
`bets.ts` lines 195, 221, 264, 277, 290 all use `c.req.valid("json" as never) as z.infer<typeof ...>`. This is a known Hono typing quirk — the validated body type from Hono's middleware layer requires the cast. These are pre-existing in the codebase and not introduced by L14. Not a new risk.

---

## Lens 4: Adversarial

### CRITICAL — `handleResume` has no error handling.

WorkBet.tsx lines 657-665:
```typescript
const handleResume = useCallback(async (): Promise<void> => {
  if (!bet) return;
  await fetch(`/api/bets/${encodeURIComponent(bet.id)}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  fetched.refresh();
}, [bet, fetched]);
```

The `fetch` result is never checked for `!res.ok`. A network error, a 409 (invalid transition), or a 404 will be silently swallowed. The user gets no feedback. `handleAction` calls `void handleResume()` meaning the unhandled rejection is discarded entirely. In contrast, `handleConsequenceConfirm` and `handleAppetiteConfirm` both check `!res.ok` and throw with an error message. This inconsistency means Resume is the only action that can fail silently with no user feedback.

**OBSERVATION — `void handleResume()` pattern.**
The `void` cast in `handleAction` (line 677) prevents the Promise rejection from propagating, which is the correct idiom for event handlers in TypeScript. However, combined with the missing error check inside `handleResume`, this creates the silent failure described above.

**OBSERVATION — Test quality: AC-7 only tested for in_progress, paused, behind, blocked.**
The `WorkBet.L14-actions.test.tsx` does not test `shaped`, `committed`, or `review` status action bars. The missing Adjust Appetite for `shaped` bets would have been caught if a test asserted `getByRole("button", { name: /adjust appetite/i })` for `makeBet("shaped")`.

**OBSERVATION — Vitest tests don't verify consequence content.**
The `ConsequencePreviewDialog` tests assert the dialog opens and the confirm button is disabled when reason is empty — but no test asserts the STOPS/CONTINUES/SAVED sections are present for the Pause dialog. A missing-content bug (the one identified above) passes all current tests.

**OBSERVATION — E2E AC-12 test verifies via mocked response, not real DB.**
The AC-12 Playwright test (L14-bet-actions.spec.ts line 283-360) intercepts the GET response to return a pre-canned revision log. It doesn't prove the server actually wrote `actor: "u-founder"` — that's covered by the Vitest integration tests in `bets.L14-actions.test.ts`. The E2E test proves the UI correctly reads the actor from the API response. This is acceptable layering per architecture.md R3.

**OBSERVATION — `bets.validation.test.ts` seeds appetite `"small"` directly into DB.**
Line 47 in `bets.validation.test.ts`: `appetite: "small"` inserted directly. This bypasses the route-level schema and is intentional — the test is proving the protected state-machine behavior predates the route-level guard. No issue.

---

## Lens 5: Simplification

**OBSERVATION — `showKill = true` is a dead variable.**
WorkBet.tsx line 196: `const showKill = true;`. The render always evaluates `{showKill && (...)}` as `{true && (...)}`. Since the early return for shipped/killed already handles the null case, `showKill` adds no value. Inline the boolean or remove the variable.

**OBSERVATION — Dialog cancel event handler pattern duplicated.**
Both `ConsequencePreviewDialog` and `AppetiteDialog` implement identical `useEffect` patterns for the cancel event listener (WorkBet.tsx lines 314-324 and 461-471). This is not surprising for co-located components — extracting a `useDialogCancelPrevention(ref)` hook would reduce duplication. Low priority since both components are in the same file.

**OBSERVATION — `AppetiteDialog` re-initializes `validDefault` on every render.**
Lines 426-428: `validDefault` is computed from `currentAppetite` but not memoized. Since this is a simple lookup on a small array, it's negligible. Not a real simplification gap.

---

## Lens 6: AI Slop

**OBSERVATION — Verbose biome-ignore comments on useEffect dependencies.**
Lines 286-287 and 437-438: `// biome-ignore lint/correctness/useExhaustiveDependencies: reset form state only when open toggles`. The comment restates what the suppression suppresses. The suppression is justified, but the comment adds no information beyond what's already in the biome-ignore tag. The `@lore` pattern would be more appropriate here if the suppression is non-obvious.

**OBSERVATION — Lore comments in WorkBet.tsx are well-placed and substantive.**
Unlike typical AI slop, the `@lore` comments in this diff carry genuine engineering rationale (e.g., the showModal JSDOM guard, the cancel event pattern). No AI tell-tale slop detected in the lore comments.

**OBSERVATION — `JSON.parse(raw) as RevisionLogEntry[]` repeated.**
`parseRevisionLog` exists in `bet-state-machine.ts:53-56` and is re-implemented as a standalone helper in `bets.L14-actions.test.ts:31-34`. The test helper is local and correctly scoped. Not a real issue.

---

## AC Completeness Audit

| AC | Description | Status | Evidence / Gap |
|---|---|---|---|
| AC-1 | User can pause bet | PASS | `POST /pause` route added; Vitest integration tests in `bets.L14-actions.test.ts:71-126`; E2E AC-12 test |
| AC-2 | Destructive actions have non-skippable consequence preview (what stops, continues, saved) | FAIL | Pause dialog is missing STOPS/CONTINUES/SAVED sections (WorkBet.tsx line 344 wraps them in `{isKill && ...}`). Kill dialog has them. Pause dialog is a blank form with only a reason textarea — no consequence content. |
| AC-3 | Adjust-appetite uses L4 enum ("1 week"/"2 weeks"/"6 weeks"), no duration | PASS | BET_APPETITES enforced in `pauseBetSchema`/route-level guard; `AppetiteDialog` uses the three values; Vitest AC-4 tests |
| AC-4 | Every action recorded in revision log (action, who, when, why) | PASS | `actor?: string` added to RevisionLogEntry; all human-surfaced routes pass `actor: "u-founder"`; Vitest AC-5 tests confirm round-trip |
| AC-5 | Status vocabulary supports the states | PASS | `paused` was already in BET_STATUSES and VALID_TRANSITIONS. No new statuses needed. |
| AC-6 | All hardcoded BetCard fixtures replaced with real data | PARTIAL | `bet.appetite`, `bet.title`, `bet.product`, `bet.team`, `bet.progress` now come from the enriched API. Fixture objects remain only in `__fixtures__/work-bet-fixtures.ts` (stories/tests — acceptable per track rule). However: `b2.appetite = "3 weeks"` and `FALLBACK_BET.appetite = "—"` are invalid enum values. These are in fixtures (not runtime code) so the rule allows them. Real data confirmed via AC-6 Vitest integration tests. |
| AC-7 | Vitest tests cover each action's handler and server response | PARTIAL | Integration tests cover pause, resume, kill, appetite PATCH, actor field, GET enrichment. Unit tests cover action bar per status. **Gap: `shaped` status not tested for "Adjust appetite" button.** |
| AC-8 | Playwright E2E: open bet → invoke destructive action → preview → confirm → transition → revision log entry | PARTIAL | E2E tests exist for kill dialog (AC-9), pause dialog (AC-12), appetite (AC-10), unblock (AC-11). **Gap: Pause dialog preview content (STOPS/CONTINUES/SAVED) is not in the UI to test.** The E2E `"clicking Kill bet opens the consequence dialog"` test passes because Kill does show consequence sections. |
| AC-9 | `bun run check` + `bun run lint` + `bun run test` all green | PASS | `bun run check` exits 0 (zero type errors). `bun run lint` exits with warnings only, zero errors. `bun run test` reports 3430 passed, 3 skipped, 0 failed. |

---

## Findings Summary

### CRITICAL (must fix before merge)

**F1 — Pause consequence dialog is blank (no STOPS/CONTINUES/SAVED).**
File: `/packages/web/src/pages/WorkBet.tsx`, line 344
Spec: approved.md lines 67-71. The ConsequencePreviewDialog renders consequence sections only when `isKill === true`. The Pause dialog shows only the reason textarea with no consequence information. AC-2 specifically requires "what stops, what continues, and what's saved." This is the core feature of the Pause dialog.
Fix: Add a `{!isKill && (...)}` block with Pause-specific consequence text (same structure as the kill block), or refactor to render both with different copy.

**F2 — `handleResume` silently swallows errors.**
File: `/packages/web/src/pages/WorkBet.tsx`, lines 657-665
The Resume action's fetch result is never checked for `!res.ok`. Any failure (network, 409, 404) is silently discarded — the user sees nothing and the bet status does not update. Every other action (`handleConsequenceConfirm`, `handleAppetiteConfirm`) checks `!res.ok` and surfaces an error. Resume must do the same.

### WARNINGS (design contract violations)

**W1 — Kill action bar button uses `btn-error btn-ghost` (conflicting).**
File: `/packages/web/src/pages/WorkBet.tsx`, line 231
Approved design: `btn btn-xs btn-error`. Remove `btn-ghost`.

**W2 — Pause dialog confirm button uses `btn-primary` instead of surface-5.**
File: `/packages/web/src/pages/WorkBet.tsx`, line 392
Approved design (line 72): `[Pause bet]` uses surface-5 background. `btn-primary` is an accent color, not surface-5.

**W3 — Missing Adjust appetite for `shaped` bet status.**
File: `/packages/web/src/pages/WorkBet.tsx`, line 192-193
Approved design (line 38): shaped status shows "Adjust appetite — Kill bet". `showAdjust` does not include `shaped`. No test covers this gap.

**W4 — Dialog uses `aria-label` instead of `aria-labelledby`.**
File: `/packages/web/src/pages/WorkBet.tsx`, lines 340, 487
Approved design (line 65): `aria-labelledby` linking to the title element ID. The implementation uses `aria-label` directly. Functionally similar but violates the spec contract.

### NITPICKS (optional cleanup)

**N1 — Unblock uses `block: 'nearest'` instead of `block: 'start'`, no 100ms delay.**
File: `/packages/web/src/pages/WorkBet.tsx`, line 684
Approved design: `scrollIntoView({ block: 'start', behavior: 'smooth' })` then 100ms delay then focus.

**N2 — `showKill = true` is a dead variable.**
File: `/packages/web/src/pages/WorkBet.tsx`, line 196

**N3 — Dialog motion not implemented (250ms open, 150ms close per spec).**
Approved design (lines 105-108).

---

## Verdict: NOT DONE

AC-2 (consequence preview for destructive actions) is not met for the Pause action — the pause dialog has no consequence content. This is the central feature of the workpackage. AC-8 (E2E proof of preview → confirm flow) is contingent on AC-2 being fixed.

AC-7 has a minor gap (shaped status test missing). F2 (silent resume error) is a correctness bug.

### Required before merge

1. **F1**: Add STOPS/CONTINUES/SAVED sections to Pause dialog in `ConsequencePreviewDialog`.
2. **F2**: Add `!res.ok` check + error throw in `handleResume` (match the pattern from `handleConsequenceConfirm`).
3. **W3**: Add `shaped` to `showAdjust` condition in `BetActionsBar`.
4. Add a test asserting Adjust appetite is visible for shaped status.

### Recommended (design compliance)

5. **W1**: Remove `btn-ghost` from Kill action bar button.
6. **W2**: Change pause confirm button from `btn-primary` to a surface-5 variant.
7. **W4**: Replace `aria-label` with `aria-labelledby` + title element id.
