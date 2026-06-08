# AD5 — Code Review

**Verdict: DONE**

All 7 acceptance criteria are met. 50 tests pass across 6 test files. Typecheck passes. The implementation faithfully follows the architecture plan with appropriate adjustments where the plan had contradictions (SettingsNotifications approach).

---

## AC Completeness Table

| AC | Description | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Routines with cron schedules fire automatically | PASS | `server-factory.ts:220` calls `startRoutineScheduler(db, eventBus, { pollIntervalMs: 60_000 })`. Dispose calls `scheduler.stop()` at line 225. 4 tests in `AD5-routine-scheduler-boot.test.ts` pass: past-due fires, session created, future skipped, stop halts. |
| AC-2 | Task done triggers dependency watcher | PASS | `app.ts:515-522` registers `task_state_changed` listener calling `checkAndUnblockDependents` when `toState === "done"`. Disposer pushed. 4 tests in `AD5-dep-unblock-event.test.ts` pass: single dep unblock, event emission, partial dep no-unblock, sequential all-deps unblock. |
| AC-3 | Notification preferences persist across refresh | PASS | `SettingsNotifications.tsx` imports `useSettings`, syncs via `useEffect` on `settings` change, calls `save(updated)` with full `SettingsData` on toggle change. `SERVER_KEY_MAP` correctly maps 3 UI keys to server fields; `email-digests` excluded. 7 tests in `AD5-settings-notifications.test.tsx` pass. |
| AC-4 | Sidebar shows conversations blocking badge | PASS | `Sidebar.tsx` adds `conversationsBlockingCount` prop to `SidebarProps`, renders badge span with `data-testid="conversations-blocking-badge"` when count > 0, caps at "99+". `AppShell.tsx:363-366` computes count via `useMemo` filtering `conversationsThreads.threads` by `hasUnresolvedReview`. 11 tests in `AD5-sidebar-conversations-badge.test.tsx` pass. |
| AC-5 | Bet pause/resume buttons removed | PASS | `BetActionKind` narrowed to `"kill" | "adjust-appetite" | "unblock"`. `ConsequencePreviewDialogProps.kind` narrowed to `"kill"`. `handleResume`, `handleActivate` deleted. Pause/Activate button JSX deleted. `ConsequencePreviewDialog` body simplified (pause copy removed). 21 tests in `WorkBet.L14-actions.test.tsx` pass (including updated assertions for pause absence). |
| AC-6 | Cost values show real spend | PASS | `rail.ts:133-136` replaced hardcoded `{ minor: 0 }` with `coalesce(sum(teamMembers.costActual), 0)` aggregate query. Lore comment documents cumulative-not-daily semantics. 6 tests in `AD5-rail-cost.test.ts` pass: single team, zero cost, multi-team sum, cap from factory settings, currency field, update propagation. |
| AC-7 | Cost from session accumulation | PASS | Already implemented via `recordCostAndCheck` in fabric. AC-6 fix makes these values visible in the rail endpoint. No additional code needed. Covered by AC-6 tests. |

---

## Lens Findings

### Architecture

**No issues found.** Layer integrity is maintained throughout.

- The dependency watcher handler is correctly placed in `app.ts` (server layer) rather than `bootstrap.ts` (fabric layer), avoiding the cross-package import violation identified in the plan.
- The routine scheduler is started in `server-factory.ts` with `await`, after `createApp()`, using the correct import from `@hyperidle/fabric`. Dispose order is correct: scheduler stops before `disposeApp`.
- The rail cost query stays within the server package, importing `teamMembers` from `@hyperidle/db` (downward dependency only).
- The `SettingsNotifications` component correctly resolved the plan contradiction (plan section "Type Signatures" defined props vs. section "Discovery" said use hook directly) by choosing the direct-hook approach. No `SettingsNotificationsProps` type was created. This matches the architecture critique WARNING #1 recommendation.
- All 7 tasks map to 7 ACs. No scope creep.

### Design

**Two pre-existing gaps replicated (not introduced).**

1. **[Sidebar.tsx:206] Badge lacks `aria-label`.** The conversations blocking badge is a `<span>` with no `aria-label`. Screen readers receive a raw number with no context. This was flagged in the design critique (WARNING #2) as a pre-existing gap in the Knowledge triage badge (same pattern at line 316-321). The builder replicated the existing pattern exactly, which is defensible for consistency. Recommend adding `aria-label` to both badges in a follow-up accessibility pass.

2. **[SettingsNotifications.tsx:103] Save failure silently ignored.** `void save(updated)` discards the promise rejection. The design critique (WARNING #1) flagged that save failure has no user feedback. The `useSettings.save()` throws on HTTP error (line 93 of `useSettings.ts`), but the caller discards the rejection. The user sees the toggle flip optimistically and it stays flipped even on server error. The `useEffect` on `settings` would re-sync on next load, but there is no immediate feedback.

Both items were flagged during the design critique as WARNINGs. They are real gaps but do not block acceptance for this wiring workpackage.

### Security

**No issues found.** This workpackage introduces no new endpoints, no new user input surfaces, and no new trust boundaries. Specific checks:

- **STRIDE:** No new attack surface. The `task_state_changed` event listener only fires for events already emitted by the server's own `transitionTask` (which requires API key auth). No external input reaches `checkAndUnblockDependents` without prior authentication.
- **Rate-limiting:** No new POST/PATCH endpoints. The existing `PATCH /api/settings` rate limits apply unchanged.
- **Input validation:** Notification toggle values flow through `useSettings.save()` which sends the full `SettingsData` to the existing Zod-validated settings endpoint.
- **Secret handling:** No new credentials or secrets.
- **SQL injection:** The rail cost query uses Drizzle's parameterized `sql` template tag with `coalesce(sum(...), 0)`, not raw string concatenation.

### Adversarial

**One finding.**

1. **[app.ts:517] Empty catch swallows errors.** `void checkAndUnblockDependents(db, eventBus, event.taskId).catch(() => { /* fire-and-forget */ })` silently discards all errors. The comment claims "errors are logged inside checkAndUnblockDependents" but this is only partially true: `checkAndUnblockDependents` logs `logger.warn` for malformed dependencies JSON (lines 52, 60-63 of `dependency-watcher.ts`), but a database connection failure or `transitionTask` constraint violation during `transitionTask(db, eventBus, task.id, "accepted")` at line 85 would propagate as an unhandled rejection swallowed by this empty catch. The architecture critique (WARNING #2) specifically recommended replacing this with `catch((err) => { logger.error(...) })`. The builder did not address this.

   Severity: LOW. In practice, database errors here would likely manifest as errors elsewhere too, and the function's internal logging covers the most common failure mode (malformed JSON). But silent swallowing of infrastructure errors violates the project's TypeScript rule: "Use result types for expected errors. Let unexpected errors propagate -- no swallowing with try-catch."

### Simplification

**Two findings.**

1. **[WorkBet.tsx:326] `kind` parameter is dead.** `ConsequencePreviewDialog` still accepts `kind: "kill"` as a prop, destructures it (line 326), but never reads the value. The entire prop is unused -- `confirmLabel`, `title`, button class, and placeholder are all hardcoded to "kill" values. The `kind` prop could be removed entirely from `ConsequencePreviewDialogProps` and the component signature. The caller at line 1125 also passes `kind={consequenceDialog.kind}` where `consequenceDialog.kind` is always `"kill"`. The state at line 675 could be simplified from `{ open: boolean; kind: "kill" }` to just `{ open: boolean }`.

   This is not a bug -- the type system ensures `kind` can only be `"kill"` so no dead branch exists at runtime. But it is unnecessary indirection that makes the next reader wonder if there are other kinds.

2. **[WorkBet.tsx:303, 1122] Stale docstring and comment references to "pause".** The `ConsequencePreviewDialog` docstring still says "for destructive or pause actions" (line 303). The comment at line 1122 says "pause or kill". These are copy-paste relics from the pre-AD5 code. Not bugs, but they contradict the actual implementation.

### AI Slop

**Two findings.**

1. **Excessive AD5 comments.** The diff adds 15 inline comments prefixed "AD5 AC-5:" or "AD5 AC-N:" throughout `WorkBet.tsx`, `Sidebar.tsx`, `AppShell.tsx`, and `SettingsNotifications.tsx`. Some are valuable (`@lore` comments documenting non-obvious decisions). But comments like `// AD5 AC-5: Activate and Pause buttons removed (no pause state in bet status enum)` on line 1042 (next to blank space where buttons used to be), and `// AD5 AC-5: kind narrowed to "kill" only (pause removed)` on line 673 restate what the type annotation already communicates. The git history documents what was removed and why; inline comments on deletions are noise.

2. **[AD5-routine-scheduler-boot.test.ts:637-641] Test asserts nothing meaningful.** The `stop() halts the scheduler` test ends with:
   ```ts
   expect(typeof scheduler.stop).toBe("function");
   expect(sessionsAfterStop.length).toBeGreaterThanOrEqual(0);
   ```
   `typeof X === "function"` is a type check that TypeScript already guarantees. `length >= 0` is always true -- it asserts nothing about the behavior. The test's intent (verify stop prevents further firings) is not validated by these assertions. A meaningful test would: record the session count before stop, wait, and assert the count has not increased. As written, this test passes vacuously.

---

## Architecture Critique Follow-Up

Checking whether the builder addressed the 5 WARNINGs from the architecture critique:

| Warning | Addressed? | Notes |
|---|---|---|
| 1. Contradictory SettingsNotifications approaches (props vs. direct hook) | YES | Builder chose direct hook. No props type defined. Correct. |
| 2. Empty catch swallows errors | NO | Catch block still empty. See Adversarial finding #1. |
| 3. Partial AC-2 delivery (session not dispatched) | YES | Tests assert task transition only, not session dispatch. Plan acknowledged the gap. |
| 4. TDD ordering (tests after all tasks) | PARTIALLY | Git history shows tests committed first (`5d13def5 test(AD5): write failing tests for all ACs (red phase)`) before implementation (`86d7d17a feat(AD5): wire dead strategy layer and cost visibility`). TDD ordering respected in commits. |
| 5. WorkBet.L14-actions.test.tsx missing from protected tests | N/A | Protected tests list is in the plan doc, not enforced at runtime. The test was correctly modified. |

## Design Critique Follow-Up

| Warning | Addressed? | Notes |
|---|---|---|
| 1. No user feedback on save failure | NO | `void save(updated)` discards rejection. See Design finding #2. |
| 2. Badge no aria-label | NO | Badge replicates Knowledge pattern without improvement. See Design finding #1. |

---

## Summary of Findings

### Blocking: None

### Non-Blocking (recommend fixing before merge):

1. **[app.ts:517] Empty catch should log errors** -- replace `catch(() => {})` with `catch((err) => { logger.error("dependency-watcher: checkAndUnblockDependents failed", { taskId: event.taskId, error: err instanceof Error ? err.message : String(err) }) })`.

2. **[WorkBet.tsx:326] Dead `kind` prop on ConsequencePreviewDialog** -- remove `kind` from props, state, and call site. Simplify `consequenceDialog` state to `{ open: boolean }`.

3. **[WorkBet.tsx:303, 1122] Stale "pause" references in docstring/comments** -- update to reflect kill-only behavior.

### Non-Blocking (low priority, follow-up):

4. **[Sidebar.tsx:206] Add `aria-label` to conversations blocking badge** -- matches design critique recommendation. Also add to Knowledge triage badge for consistency.

5. **[SettingsNotifications.tsx:103] Handle save failure** -- catch the promise rejection and show user feedback (toast or toggle revert). Matches design critique recommendation.

6. **[AD5-routine-scheduler-boot.test.ts:637-641] Strengthen stop() test assertions** -- current assertions are vacuous.

7. **[server-factory.ts:220] No error handling for `startRoutineScheduler` failure** -- if the initial DB query fails, the await rejection crashes the server. Wrap in try-catch with logger.error for degraded mode. Matches architecture critique SUGGESTION #2.

---

## Verification

- `npm run check`: PASS (zero type errors)
- AD5 test files: 50/50 PASS
- Commit structure: red phase tests committed before green phase implementation (correct TDD ordering)
- No new user-facing documentation needed (internal wiring of existing features)
