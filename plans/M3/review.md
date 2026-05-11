# M3 Code Review

**Verdict: NOT DONE**

Three critical findings block completion. Seven warnings require attention before merge. The core mechanical refactoring (Clusters A-G) is substantially correct in production code, but fixture file cleanup, settings save wiring, and inventory regeneration are incomplete.

---

## AC Satisfaction Table

| AC | Description | Status | Notes |
|---|---|---|---|
| AC1.1 | Mock symbol/import/literal removed from runtime code | PARTIAL | `app-shell-data.ts` and `portfolio-data.ts` still exist with all mock exports. `WorkPortfolio.tsx` still imports `PortfolioProduct` type from `portfolio-data.ts`. AppShell no longer imports mock data directly, but the fixture files were not deleted per the plan. |
| AC1.2 | Replacement wired in | PASS | All 7 clusters wire the correct replacement: `c.get("userId")`, `useCurrentUser()`, `useSettings()`, `useRail()`, `null` for agent participant, `null` for avatar, count removed. |
| AC1.3 | Empty/loading/error states honest | PASS | All three new hooks return `{ status, error }` with loading/ready/error states. Rail, AppShell, and WorkPortfolio render honest states. |
| AC1.4 | Vitest test asserts the swap | PASS | Tests exist for all clusters: `useCurrentUser.test.ts`, `M3-AppShell.no-mock.test.tsx`, `M3-Rail.types.test.tsx`, `M3-WorkBet.auth.test.tsx`, `M3-WorkPortfolio.no-mock.test.tsx`, `M3-avatar-rendering.test.tsx`, `M3-host-threads.null-agent.test.ts`, `M3-HostThreadSection.agentId.test.tsx`. |
| AC1.5 | Playwright e2e covers user-visible path | FAIL | No Playwright e2e tests added. The AC requires "A Playwright e2e covers the user-visible path when relevant." All clusters have user-visible paths (AppShell, Rail, WorkBet, WorkPortfolio, ThreadRow avatar). |
| AC1.6 | e2e ripple sites updated | NOT VERIFIED | No e2e tests to verify ripple sites. |
| AC1.7 | Inventory regenerated with row removed | PARTIAL | Inventory was regenerated but shows 24 rows (8 straight-swap + 6 needs-contract + 10 borderline). The straight-swap rows are `u-founder` fallback literals in comments/code that are architecturally intentional (fallbacks for unseeded DBs). The 6 needs-contract rows are the fixture exports that should have been deleted. |
| AC2 | Rows drawn in any order, same-file batched | PASS | All 27 rows executed in a single commit, batched by cluster. |
| AC3 | Lint warning count drops to zero for affected files | NOT VERIFIED | Cannot verify without running `bun run lint`. Pre-existing fixture files will continue to trigger lint warnings. |
| AC4 | Queue view shows in-flight vs available | FAIL | `queue.md` shows all rows unchecked. None were marked as closed during implementation. |
| AC5 | `bun run verify` green | NOT VERIFIED | Not run as part of this review (pre-existing server test failures with better-sqlite3). |
| AC6 | No new mocks introduced | PASS | No new mock constants or fixture imports introduced. |

---

## Findings by Lens

### ARCHITECTURE (Positive Lens 1)

**CRITICAL-A1: Fixture files not deleted per plan.** [plan section "Fixture file disposition after M3", lines 667-671]

The architecture plan explicitly states:
- `app-shell-data.ts` -- DELETE entirely (all exports removed by B + C)
- `portfolio-data.ts` -- DELETE entirely (all exports removed by G)

Both files still exist with all their mock exports (`DEFAULT_SETTINGS`, `MOCK_RAIL_BETS`, `MOCK_RAIL_BLOCKERS`, `MOCK_RAIL_COST`, `MOCK_PRODUCTS`, `MOCK_CYCLE`). While production code no longer imports these mocks (verified: AppShell uses hooks, WorkPortfolio removed fallback), the files remain, which means:
1. The inventory scanner still finds them (6 `needs-contract` + partial `straight-swap` rows).
2. Future developers may accidentally re-import them.
3. `WorkPortfolio.tsx:22` still imports `type { PortfolioProduct }` from `../fixtures/portfolio-data` -- this is a runtime import of a type from a file that was supposed to be deleted. The `PortfolioProduct` interface should have been moved to `WorkPortfolio.tsx` per plan section G2.

Files: `/packages/web/src/fixtures/app-shell-data.ts`, `/packages/web/src/fixtures/portfolio-data.ts`, `/packages/web/src/pages/WorkPortfolio.tsx:22`

**CRITICAL-A2: `handleSettingsSave` in AppShell still uses the mock save pattern.** [plan section B4 "Replace every usage of DEFAULT_SETTINGS with the hook's return value"]

`/packages/web/src/layouts/AppShell.tsx:393-405` -- The save handler contains:
```typescript
// Mock save — real API wiring deferred. J1: mirror the new draft into
// local state so density (and other appearance values) take effect on
// save. The data-density attribute on the shell root reads from this.
await new Promise((resolve) => setTimeout(resolve, 300));
```
This is a 300ms fake delay simulating a network call. The `useSettings` hook exports a `save` function that calls `PATCH /api/settings`, but AppShell never uses it. The comment even says "Mock save -- real API wiring deferred" which is stale. The hook's `save()` should be wired into the handler, or at minimum the artificial delay should be removed and replaced with the hook's save function.

**CRITICAL-A3: No Playwright e2e tests.** [AC1.5, AC1.6]

The AC explicitly requires "A Playwright e2e covers the user-visible path when relevant." Zero Playwright tests were added. Every cluster has user-visible changes: AppShell (A11, B4, C4), Rail (C2-C3), WorkBet (A12), WorkPortfolio (G1), ThreadRow avatar (E2). The CLAUDE.md rules state "Target 100% test coverage of new code including Playwright E2E tests for all user-facing features."

**WARNING-A1: Settings endpoint returns `appearance` field, violating Contract 2.** [plan section B1, contracts.md Contract 2]

`/packages/server/src/routes/settings.ts:101,184-188` -- The `buildSettingsResponse` function returns an `appearance` field (`{ density, theme }`) read from `factorySettings`. Contract 2 explicitly states: "appearance (density, theme) is NOT in the API response. It stays in localStorage via useTheme() / useAutoDensity()." The `useSettings` hook then does `const raw = (await res.json()) as Omit<SettingsData, "appearance">` (line 61), which casts away the extra field. This is not a runtime bug but it is a contract violation -- the server returns data the contract says it should not.

**WARNING-A2: Settings PATCH does not persist `mutedProducts`.** [contracts.md Contract 2 response schema]

`/packages/server/src/routes/settings.ts:45-73` -- The PATCH handler persists `reviewAlerts`, `costAlerts`, `blockerAlerts`, `quietHoursStart`, `quietHoursEnd` but silently drops `mutedProducts`. The `NotificationPatch` interface includes `mutedProducts?: string[]` (line 27) but the handler does not process it. The GET response always returns `mutedProducts: []` (line 182). This is an incomplete implementation of the notifications persistence.

**WARNING-A3: WorkBet does not pass `agentId` to HostThreadSection.** [plan section D4]

`/packages/web/src/pages/WorkBet.tsx:1060-1067` -- The plan states: "Pass `agentId={task.ownerAgentId ?? null}` to `HostThreadSection` instances." The actual rendering omits `agentId` entirely:
```tsx
<HostThreadSection
    hostKind="bet"
    hostId={bet.id}
    title="Discussion"
    prefill={threadPrefill}
    onClearPrefill={() => setThreadPrefill(undefined)}
    onMessagePosted={refreshThreadData}
/>
```
The prop defaults to `null`, so this is functionally correct for bet-level threads (which may not have a single agent). However, this diverges from the plan. If the intent was that bet threads should include the team's lead agent, this is a behavioral gap.

**WARNING-A4: `queue.md` not updated.** [AC4]

`/plans/mock-data-purge/queue.md` -- All 24 rows remain unchecked. The AC requires the queue view to "show in-flight vs available rows." The builder implemented all clusters but never checked off the rows in the queue file. This is an administrative gap, not a code bug, but it makes the queue useless for tracking.

### SECURITY (Positive Lens 3)

**WARNING-S1: Settings PATCH has no input validation beyond JSON parsing.** [plan section B1, architecture-critique W1]

`/packages/server/src/routes/settings.ts:45-51` -- The PATCH handler only validates that the body is valid JSON. It does not validate:
- `quietHoursStart`/`quietHoursEnd` format (arbitrary strings are persisted).
- Boolean values for alert fields (string "true" would be accepted and persisted).
- Field names (unknown fields in the body are silently ignored, which is fine, but there is no Zod schema validation).

The architecture critique (W1) flagged this as a warning. The builder did not address it. Every other route in the server uses `validateBody(schema)` middleware with Zod schemas. The settings route is the only one that skips validation.

**INFO-S1: Auth middleware fallback chain.** [auth.ts:89, auth.ts:50, lifecycle-propagation.ts:409]

Three places use `?? "u-founder"` as a fallback: the auth middleware (line 89), the `/me` endpoint (line 50), and lifecycle-propagation (line 409). These are intentional fallbacks for unseeded databases per the plan. The fallback is architecturally sound -- it preserves backward compatibility without weakening the auth boundary.

### ADVERSARIAL (Negative Lens 4)

**WARNING-ADV1: `useSettings` save function swallows errors silently.**

`/packages/web/src/hooks/useSettings.ts:91-93`:
```typescript
} catch {
    // Swallow — callers handle via UI
}
```
The comment says "callers handle via UI" but no caller actually handles the error because `save()` returns `Promise<void>` and the comment is false -- `handleSettingsSave` in AppShell does not call `useSettings().save` at all (see CRITICAL-A2). If it did, the error would be silently swallowed with no user feedback.

**INFO-ADV1: `useCurrentUser` fetch has no retry mechanism.**

`/packages/web/src/hooks/useCurrentUser.ts` -- Unlike `useSettings` and `useRail` which expose a `retry()` function, `useCurrentUser` does not. On auth error, the hook stays in error state permanently until the component remounts. Given that `useCurrentUser` is called at the root of AppShell, this means a transient network failure on app load would require a full page refresh.

### SIMPLIFICATION (Negative Lens 5)

**INFO-SIMP1: `useRail` backward-compat fields add surface area.**

`/packages/web/src/hooks/useRail.ts:56-66` -- The hook returns 5 deprecated backward-compat fields (`bets`, `blockers`, `cost`, `isLoading`, `refresh`) alongside the canonical `data`/`status`/`error`/`retry`. AppShell uses the deprecated fields (line 694: `railData.bets`, `railData.blockers`, `railData.cost`). Since AppShell is the only consumer and was modified in this PR, the deprecated fields could have been eliminated by updating AppShell to destructure from `data` directly.

**INFO-SIMP2: `useSettings` backward-compat `data` alias.**

`/packages/web/src/hooks/useSettings.ts:30,107` -- The hook returns a `data` alias marked `@deprecated` alongside `settings`. AppShell uses `settingsData.data` (line 296). Same observation as SIMP1 -- since AppShell was modified in this PR, the alias could have been eliminated.

**INFO-SIMP3: Three individual `factorySettings` SELECTs in auth middleware + /me endpoint.**

`/packages/server/src/middleware/auth.ts:84-88` reads one row. `/packages/server/src/routes/auth.ts:62-71` reads two more rows. That is 3 DB queries per request for the `/me` endpoint. A single `SELECT * FROM factorySettings WHERE key IN ('founder_id', 'founder_name', 'founder_email')` would reduce to 1 query. Acceptable for now (low traffic, SQLite), but worth noting.

### AI SLOP (Negative Lens 6)

**INFO-SLOP1: Comment says "Mock save -- real API wiring deferred" on a file that now has real API wiring.**

`/packages/web/src/layouts/AppShell.tsx:394` -- The comment is stale. The `useSettings` hook was created with a `save()` function that calls `PATCH /api/settings`, making the "deferred" claim false.

**INFO-SLOP2: Excessive `@lore M3` annotations.**

Many `@lore` comments are mechanical and add no insight beyond what the code change itself communicates. Examples:
- `// @lore M3 A11: DEMO_FOUNDER_ID deleted` (line 89) -- the deletion is self-evident.
- `// M3 A5: actor comes from auth context (c.get("userId")), not hardcoded "u-founder".` (bets.ts:364) -- the code is self-documenting.
- `// @lore M3 E1: FALLBACK_AVATAR deleted.` (useConversationsThreads.ts:45) -- self-evident.

The plan required `@lore` for non-obvious decisions. These are obvious decisions.

**INFO-SLOP3: `bet-state-machine.ts` doc comment update incomplete.**

`/packages/server/src/services/bet-state-machine.ts:14-16` -- The plan (A8) specified updating the doc comment from `actor: "u-founder"` to `actor comes from the authenticated user context`. The builder updated it but used a slightly different phrasing: "pass actor from the authenticated user context (set by createAuthMiddleware from factorySettings.founder_id)." This is acceptable but more verbose than needed. The original `"u-founder"` literal is no longer in the doc comment, which is the actual goal.

---

## Summary of Required Actions

### Must fix before merge (CRITICAL)

1. **Delete `app-shell-data.ts`.** Remove all mock exports. No production code imports it. Test files that import it must be updated to define their own fixtures.
2. **Delete `portfolio-data.ts`.** Move the `PortfolioProduct` interface to `WorkPortfolio.tsx`. Update `WorkPortfolio.tsx:22` import. Test files that import `MOCK_PRODUCTS` must define their own fixtures or use the API response shape.
3. **Wire `useSettings().save` into `handleSettingsSave`** in AppShell.tsx, or document why the mock pattern is retained. Remove the stale "Mock save" comment and the artificial 300ms delay.
4. **Add Playwright e2e tests** for the user-visible paths: AppShell loads with real hooks, Rail shows live data, WorkPortfolio shows empty state, WorkBet uses authenticated user id, ThreadRow renders initials chip.

### Should fix (WARNING)

5. **Remove the `appearance` field from the settings endpoint response**, or document why it deviates from Contract 2.
6. **Add Zod validation to `PATCH /api/settings`** with format checks for `quietHoursStart`/`quietHoursEnd` and type checks for boolean fields.
7. **Implement `mutedProducts` persistence** in the PATCH handler, or document it as deferred.
8. **Update `queue.md`** -- check off the 27 closed rows.
9. **Regenerate `inventory.json`** after deleting the fixture files to get the accurate post-M3 count.
