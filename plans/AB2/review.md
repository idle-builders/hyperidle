# AB2 Code Review — Agent Overview in Team Work Page

REVIEW: verdict=DONE findings=0 blocking (4 prior findings resolved) tests=46/46 pass

---

## AC Completeness

| AC | Description | Covered | Evidence |
|---|---|---|---|
| AC-1 | Team page shows "Agents" section alongside Bets and Routines | YES | `WorkTeam.tsx` line 369: `<section aria-label="Team agents" data-testid="team-agents">`. Tests: `WorkTeam.AB2.test.tsx` AC-1 describe block (5 tests). |
| AC-2 | Each agent: name, role, status, task, health indicator | YES | `AgentRow` component (WorkTeam.tsx lines 495-633) renders all fields. Tests: `WorkTeam.AB2.test.tsx` AC-2 describe block (5 tests) + `AB2-team-agents.test.ts` AC-2 describe block (5 tests). |
| AC-3 | Agent cards link to agent profile on click | YES | `AgentRow` `onClick={onNavigate}` (line 547) navigates to `/agents/${agentId}`. Tests: `WorkTeam.AB2.test.tsx` AC-3 describe block (2 tests). |
| AC-4 | Health computed from same signals as AB1 | YES | `teams-routes.ts` imports and calls `computeHealthSignals` + `deriveHealthLevel` from `agent-profile.ts`. Tests: `AB2-team-agents.test.ts` AC-4 describe block (3 tests) + `deriveHealthLevel`/`deriveHealthDetail` unit tests (8 tests). |
| AC-5 | Portfolio shows per-team agent summary | YES | Summary line in `WorkPortfolio.tsx` with aggregate counts. Server returns per-team `agentCount`, `activeAgentCount`, `agentHealthWarning`. Team pills now show per-team agent count (mono span) and health dot (6x6 red dot when `agentHealthWarning`). Fixed in `e1eb13fc`. |
| AC-6 | Error state triggers notification via existing adapter | YES | `maybeNotifyAgentError` in `teams-routes.ts` lines 110-140 with dedup/throttle. Tests: `AB2-team-agents.test.ts` AC-6 describe block (2 tests). |

---

## Phase 2 Mandate Compliance

| Phase 2 Finding | Status | Notes |
|---|---|---|
| S4/W4: Use `<div role="button">` for AgentRow, NOT `<button>` | FIXED | `WorkTeam.tsx` line 543: `<div role="button" tabIndex={0}>` with `onKeyDown` for Enter/Space. Lore comment at line 487-493 documents the rationale. Biome lint suppression `useSemanticElements` at line 542. |
| W1: Batch session queries with IN clause | FIXED | `teams-routes.ts` lines 460-493: single `inArray(sessions.agentId, agentIds)` query, then client-side grouping via `sessionsByAgent` Map. Portfolio list handler also batches (lines 232-244). |
| W3: Export `resolveHarnessAvailable` | FIXED | `agent-profile.ts` line 344: `export function resolveHarnessAvailable(...)`. Lore comment at line 340 documents the reason for exporting. |
| S2: Health dot uses `role="img"` with `aria-label` | FIXED | `WorkTeam.tsx` line 570: `role="img" aria-label={healthDetail}`. Portfolio health dot (line 155) also uses `role="img"` with `aria-label`. |
| S4: Portfolio should reuse `computeHealthSignals` | FIXED | `teams-routes.ts` lines 269-284: portfolio list handler calls `computeHealthSignals` instead of duplicating threshold checks. Comment at line 219 cites "reviewer S4". |

---

## Findings

### CRITICAL

#### C-1. `app.ts` does NOT pass `adapterPool` to `createTeamRoutes` (Architecture plan S5a violation)

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/server/src/app.ts:379`

The architecture plan section 5a explicitly requires:
```
api.route("/teams", createTeamRoutes(options.db, eventBus, options.adapterPool));
```

But `app.ts` line 379 still reads:
```
api.route("/teams", createTeamRoutes(options.db, eventBus));
```

The `adapterPool` parameter is never passed. This means `resolveHarnessAvailable` always returns `true` (because `!adapterPool` is true when adapterPool is undefined). The harness availability health signal is silently disabled for all agents on the team page. An agent with an unavailable harness will appear "healthy" when it should show "warning".

This is a functional regression: AC-4 says "Health is computed from the same signals as AB1." AB1's profile page receives `adapterPool` via `createAgentRoutes` (app.ts line 377), so AB1 correctly computes harness availability. AB2 does not, violating the "same signals" contract.

**Fix:** Change app.ts line 379 to `api.route("/teams", createTeamRoutes(options.db, eventBus, options.adapterPool));`

---

### WARNING

#### W-1. Portfolio team pills missing per-team agent count and health dot (AC-5 partially unmet)

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/web/src/pages/WorkPortfolio.tsx:186-206`

AC-5 states: "The Work portfolio page shows per-team agent summary: agent count, active count, and **a health indicator per team**." The architecture plan section 6c specifies adding agent count and health dot to each team pill.

The implementation only adds an **aggregate** summary line (total agents across all teams). The team pills (lines 186-206) are completely unchanged -- they show only the team name, with no agent count or health dot. A user scanning the portfolio cannot tell which specific team has an unhealthy agent.

The test file header (`WorkPortfolio.AB2.test.tsx` line 8) says "team pills show agent count and health dot when applicable" but no test actually asserts this -- the tests only cover the aggregate summary line.

**Fix:** Add agent count and health dot to each team pill button, or explicitly document this as deferred scope and update AC-5 to match.

#### W-2. Unsafe `as AgentHealthLevel` cast on line 541

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/server/src/routes/teams-routes.ts:541`

```typescript
member.healthLevel = deriveHealthLevel(healthSignals) as AgentHealthLevel;
```

`deriveHealthLevel` already returns `AgentHealthLevel`. The `as` cast is redundant and violates the TypeScript rules ("No unsafe `as` casts"). While this particular cast is safe because the return type matches, it signals the builder was uncertain about the return type. If `deriveHealthLevel`'s return type ever changes, this cast would silently mask a type error.

**Fix:** Remove `as AgentHealthLevel`. The assignment already type-checks without it.

#### W-3. Portfolio health dot is 8x8px, inconsistent with 6x6px everywhere else

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/web/src/pages/WorkPortfolio.tsx:158`

The portfolio summary health dot is `w-[8px] h-[8px]`. The architecture plan section 6c specifies 6px dots. The team page AgentRow uses 6px dots (WorkTeam.tsx line 568). 8px is on the Hearth grid (`{3, 6, 9, 12, ...}`), so it is not an AQ-001 violation, but it creates an inconsistency: the "same" health dot has two different sizes depending on context.

**Fix:** Change to `w-[6px] h-[6px]` for visual consistency with the AgentRow dots, or document the size difference as intentional (larger dot in the portfolio header for scannability at smaller surrounding type size).

---

### SUGGESTION

#### S-1. Active session task query is still N+1 within the batched loop

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/server/src/routes/teams-routes.ts:504-513`

The session queries were correctly batched (Phase 2 W1 fixed). However, the task title resolution for active sessions is still per-agent:

```typescript
if (activeSession) {
    const [taskRow] = await db
        .select({ title: tasks.title, betId: tasks.betId })
        .from(tasks)
        .where(eq(tasks.id, activeSession.taskId))
        .limit(1);
```

For a team where multiple agents are active, this issues one query per active agent. This could be batched: collect all active taskIds, do one `inArray(tasks.id, activeTaskIds)` query, build a lookup map. For typical teams (1-2 active agents), this is negligible, but the batching pattern is already established in the same function.

#### S-2. Three separate `useMemo` calls could be one

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/web/src/pages/WorkPortfolio.tsx:59-70`

Three `useMemo` hooks compute `totalAgentCount`, `totalActiveAgentCount`, and `anyAgentHealthWarning` with identical `[teams]` dependency. A single `useMemo` returning `{ totalAgentCount, totalActiveAgentCount, anyAgentHealthWarning }` would reduce to one memo call, one dependency check, and one allocation per render -- matching the existing `totalActiveRoutines` pattern one line above.

#### S-3. Test description string stale in AB3 tests

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx:193`

The test description still says `"renders agent cards with data-testid='agent-card'"` but the actual query uses `getAllByTestId("agent-row")`. The test logic is correct; only the description string is stale. This could confuse future developers reading test output.

#### S-4. `agent-card-category` testid preserved but undocumented as intentional

**File:** `/Users/tg/hyperidle/.worktrees/AB2/packages/web/src/pages/WorkTeam.tsx:590`

The architecture plan section 10 listed `agent-card-category` as "Removed (category not shown in row)." However, the builder preserved it with a lore comment (line 587-588) explaining it was kept for AB3 test compatibility. This is the correct decision -- the AB3 tests at lines 225, 235, 251 of `WorkTeam.AB3.test.tsx` depend on this testid. The lore comment documents the reasoning. No action needed beyond awareness that this is a deliberate deviation from the architecture plan.

---

## Lens Analysis

### Architecture

The implementation follows the architecture plan with two exceptions: (1) C-1 where `app.ts` was not updated, and (2) W-1 where portfolio team pills are missing per-team data. Type signatures match the plan -- `AgentOperationalStatus`, `AgentHealthLevel`, `RosterMember` extensions, `TeamListItem` extensions, `QueueReason` extension all match section 4. The `createTeamRoutes` signature correctly accepts optional `adapterPool` (section 5a). The helper functions `deriveHealthLevel`, `deriveHealthDetail`, `maybeNotifyAgentError` match their plan specifications.

### Design

AgentRow matches the approved design well. `<div role="button">` per the mandate. Health dot at left, Avatar, name+lead, status, context, Customize -- matches the approved layout spec line by line. RoutineRow pattern is replicated faithfully. All CSS values use semantic tokens. Row height/min-height matches. Hover states, focus rings, keyboard navigation all present. Category tag preserved (deviation from plan but justified). Portfolio health dot size inconsistency (W-3).

### Security

STRIDE analysis:
- **Notification flood:** Throttled via `maybeNotifyAgentError` with `subjectId + eventType + status=pending` dedup check. Tested (AC-6 test). Acceptable.
- **No new POST/PATCH:** All AB2 changes are on GET endpoints. No new input trust boundaries.
- **XSS:** Agent names, task titles, and health detail strings are rendered via React JSX (auto-escaped). No `dangerouslySetInnerHTML`.
- **The notification body uses `member.name` and `member.healthDetail`:** These come from server-computed values (not user input), so injection risk is negligible.

### Adversarial

- **Saboteur:** The `as AgentHealthLevel` cast (W-2) could mask future type changes. No other backdoors or regressions found.
- **New Hire:** The AgentRow lore comments (lines 487-493) explain the `div role="button"` choice clearly. The `maybeNotifyAgentError` function is well-documented. The batch query pattern is understandable.
- **Auditor:** PR claims match the diff. All 46 tests pass. The claimed batch optimization is real (single `inArray` query). No weakened test assertions in protected test files.

### Simplification

- Three `useMemo` hooks could be one (S-2). Not egregious given the existing single-memo pattern in the same file.
- `as AgentHealthLevel` cast is redundant (W-2).
- The AB3 category tag preservation (S-4) adds code that the architecture plan said should be removed, but is justified by test compatibility.

### AI Slop

- No verbose naming. Function and variable names are honest and proportional.
- Lore comments are substantive (explaining "why not the obvious approach"), not filler.
- No `=== true` comparisons except `t.agentHealthWarning === true` in WorkPortfolio.tsx line 69, which is acceptable given the field could be `undefined`.
- No unnecessary async, no single-use helpers, no dead code.
- No "TODO: implement", "simplified version", or "for now" comments.
- The `biome-ignore` suppression at line 542 is explained and appropriate.

---

## Verdict: DONE

All four findings from the initial review have been resolved in commit `e1eb13fc`:

| Finding | Resolution |
|---|---|
| **C-1** `app.ts` missing `adapterPool` | Fixed. `createTeamRoutes(options.db, eventBus, options.adapterPool)` now passes the pool, restoring harness-availability health signals parity with AB1. |
| **W-1** Portfolio team pills missing per-team indicators | Fixed. Each team pill now renders `team.agentCount` as a mono count span and `team.agentHealthWarning` as a 6x6 red dot. AC-5 fully satisfied. |
| **W-2** Redundant `as AgentHealthLevel` cast | Fixed. `AgentHealthLevel` import removed; `deriveHealthLevel(healthSignals)` assigned directly. |
| **W-3** Portfolio health dot 8x8 inconsistency | Fixed. Changed to `w-[6px] h-[6px]`, consistent with AgentRow and team pill dots. |

All six ACs are now fully covered. The implementation is solid: 46 tests passing, Phase 2 mandates met, proper accessibility, notification throttling, batch queries. No remaining blockers.
