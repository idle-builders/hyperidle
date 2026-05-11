# Architecture Critique: M2

**Workpackage:** M2 -- Replacement contracts (architecture pass)
**Reviewer:** Architecture Critique (Phase 2)
**Date:** 2026-05-11
**Artifacts reviewed:** `plans/M2/architecture.md`, `plans/mock-data-purge/contracts.md`, `packages/api-contract/src/{index,auth,settings,rail}.ts`

---

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:9 MD:9 FMC:7 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every M2 AC maps to a deliverable in the plan:

- AC1 ("every needs-contract row addressed"): all 5 needs-contract rows (DEFAULT_SETTINGS, MOCK_RAIL_BETS, MOCK_RAIL_BLOCKERS, MOCK_RAIL_COST, agent-unassigned) are addressed in clusters 2, 3, 4 respectively. Verified against inventory.json (34 rows).
- AC2 ("each contract section includes 6 elements"): all 6 clusters include real source, type signature, empty/loading/error rules, migration recipe, test pattern, and e2e ripple sites.
- AC3 ("API contracts in packages/api-contract/"): package exists with auth.ts, settings.ts, rail.ts, index.ts. Type-only, no runtime code.
- AC4 ("every row annotated"): the complete inventory annotation table covers all 34 rows: 24 contract-pinned, 3 straight-swap, 7 tracked-out. Sums to 34.
- AC5 ("no code changes other than api-contract types and contracts.md"): verified -- only new files are in packages/api-contract/ and plans/.
- AC6 ("bun run check + lint + test green"): typecheck passes (0 errors). Lint passes. Tests have a pre-existing better-sqlite3 failure unrelated to M2.

The plan appropriately extends scope beyond strict needs-contract rows to also cover straight-swap rows (cluster 1 auth identity) and borderline rows, which is justified because the AC says "every inventory row is annotated."

### 2. Layer Integrity (9/10)

The plan respects the three-layer architecture:

- Server-side changes (auth middleware, route handlers) stay in `packages/server`.
- Client-side changes (hooks, component types) stay in `packages/web`.
- The `packages/api-contract` package sits between both as a shared type contract -- this is the correct pattern for a type-only dependency that both layers consume.
- No task has the frontend reaching into server internals or vice versa.
- Cluster 4 (agent-assignment) correctly identifies that the resolution uses existing API endpoints rather than direct DB access from the client.

### 3. API Contracts (8/10)

Contracts are well-specified with HTTP method, path, request/response shapes, and status codes. The rail.ts types were verified against the actual server `packages/server/src/routes/rail.ts` and match field-by-field (RailBet, RailBlocker, CostBurnRate).

**Finding (WARNING):** The contracts.md specifies a `PATCH /api/settings` endpoint (contract 2) but does not specify request validation rules. The body is described as "Partial<SettingsPayload>" but there is no Zod schema or field-level validation described. What happens if `quietHoursStart` is "25:99"? What if `mutedProducts` contains non-existent product IDs? The M3 builder needs validation boundaries.

**Finding (WARNING):** The `GET /api/auth/me` endpoint is described but the existing `packages/server/src/routes/auth.ts` only has `POST /ws-token`. The plan correctly identifies this as a *new* endpoint but does not specify where it should be mounted -- should it be a new route in the existing `createAuthRoutes` function or a separate route factory? The existing `createAuthRoutes(store: UpgradeTokenStore)` takes a `tokenStore` parameter; the new `/me` endpoint needs `db` (for factorySettings). This is an interface mismatch the plan does not address.

### 4. Data Model Alignment (8/10)

The `factorySettings` table structure (key TEXT PK, value TEXT NOT NULL, updatedAt TEXT NOT NULL) was verified against the actual schema. The plan correctly identifies that founder identity data will be stored as key-value pairs.

**Finding (WARNING):** The plan states that settings notification preferences (reviewAlerts, costAlerts, blockerAlerts, quietHoursStart, quietHoursEnd, mutedProducts) will be stored in `factorySettings` with keys prefixed `notif_`. These keys do not exist in the current seed data. The plan mentions updating `seed.ts` and `seed-fixtures.ts` as a prerequisite (architecture.md line ~700) but does not specify the exact key names. The contracts.md data-sources table says `factorySettings keys prefixed notif_` but the mapping from 6 SettingsNotifications fields to N factorySettings rows is ambiguous. Are `mutedProducts` stored as a JSON array string? Is `quietHoursStart` stored as `"22:00"`?

### 5. Naming (9/10)

Names are honest and consistent:
- `AuthMeResponse`, `SettingsResponse`, `RailResponse` -- clear wire-shape names.
- `useCurrentUser`, `useSettings`, `useRail` -- standard hook naming.
- `RailBet`, `RailBlocker`, `RailCostBurnRate` -- prefixed to avoid collision with domain-level Bet/Blocker types.
- `AutonomyLevel` reuses the existing concept without aliasing.
- No generic names (Manager, Helper, etc.).

### 6. Module Depth (9/10)

The api-contract package is correctly minimal: 3 source files re-exported through one barrel. Each file covers exactly one endpoint family. No over-abstraction -- types are flat interfaces with readonly properties.

The plan avoids creating unnecessary abstractions. Cluster 5 (avatar fallback) correctly specifies a local render function rather than a new component. Cluster 4 correctly reuses existing endpoints rather than creating a new resolution API.

### 7. Failure-Mode Coverage (7/10)

Each cluster specifies loading/error/empty states. The auth cluster correctly identifies the impossible-empty case. The rail cluster correctly handles nullable cost caps.

**Finding (CRITICAL):** The migration recipe for `threads.ts` (cluster 1, contracts.md line 74) cites lines 49 and 56 but misses line 79. The `readInitialSenderId` function at line 79 (`return DEFAULT_FOUNDER_ID;`) is a third usage of the constant. The architecture.md is equally incomplete -- it says "threads.ts:49" and describes only "DEFAULT_FOUNDER_ID + fallback." An M3 builder following the recipe mechanically would delete the constant at line 49, update line 56, and leave line 79 as a compile error. This is the exact failure mode the contracts exist to prevent.

**Finding (WARNING):** The plan does not address rate-limiting on the new `POST`/`PATCH` endpoints. AC6 references `PATCH /api/settings` -- this is a mutation endpoint with no rate-limit specification. The existing auth middleware checks API key but does not rate-limit. The security surface here is thin (single-founder, localhost in v1) but the plan should explicitly mark it as N/A with rationale rather than omit it silently.

**Finding (WARNING):** The auth middleware change (contracts.md line 60-65) shows a fallback: `const founderId = founderRow?.value ?? "u-founder"`. This defeats the purpose of M2. If the factorySettings key is missing, the system silently falls back to the exact hardcoded string the plan is trying to eliminate. The fallback should either throw (fail loudly on misconfigured DB) or use a well-documented constant with a lint-rule exemption, not a silent `?? "u-founder"`.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately scoped. No feature flags, no abstract base classes, no plugin points. The tracked-out decision for knowledge pages is correct -- wiring 3 production importers with scope/topic filtering is genuinely a separate workpackage.

The `deriveBlockerSeverity` function in contracts.md (line 289-294) is client-side presentation logic with hardcoded thresholds (24h/4h). This is fine for v1 but the plan doesn't mark these as configurable or explain why these specific thresholds. Minor concern -- it's presentation, not domain logic.

One area of mild concern: cluster 2 aggregates data from 4 different sources (factorySettings, products, agents, and factorySettings again for notifications). This is a "settings grab bag" endpoint. The plan acknowledges this implicitly by structuring the response into sections. For v1 single-founder scope this is acceptable.

### 9. Verifiability (7/10)

Each cluster has test patterns with concrete scenarios (seed data, expected assertions). The test patterns distinguish unit, integration, and E2E levels appropriately.

**Finding (WARNING):** The plan does not specify test names or a test-file-first ordering. The migration recipes list implementation steps without naming the test files that should be written first. For example, cluster 1's test pattern says "seed factorySettings with founder_id = 'test-founder', make authenticated requests" but does not name the test file (`packages/server/src/routes/__tests__/auth.test.ts`?) or the test case name. M3 builders need more than scenario descriptions.

**Finding (WARNING):** The plan does not enumerate which existing tests will break and need updating. The grep for `agent-unassigned` found references in 5 test files (HostThreadSection.prefill.test.tsx, HostThreadSection.test.tsx, host-threads.test.ts, task-threads.service.test.ts, task-threads-shim.test.ts, useHostThread.test.tsx). The plan's cluster 4 migration recipe says "update all test files that reference agent-unassigned" but does not list them. The contracts exist to make M3 mechanical -- this hand-wave breaks that promise.

---

## CRITICAL

1. **[contracts.md Contract 1, migration recipe]** `threads.ts` line 79 (`return DEFAULT_FOUNDER_ID;` in `readInitialSenderId`) is missing from the migration recipe. The recipe cites lines 49 and 56 only. Fix: add row `threads.ts | 79 | return DEFAULT_FOUNDER_ID | return c.get("userId")` to the migration table. Also update architecture.md cluster 1 migration recipe step 4 to say "Replace DEFAULT_FOUNDER_ID + fallback in threads.ts:49, threads.ts:56, **threads.ts:79** with c.get("userId")."

## WARNING

1. **[contracts.md Contract 1, middleware change]** The fallback `?? "u-founder"` in the auth middleware code sample (line 65) reintroduces the exact hardcoded string M2 is eliminating. Fix: change fallback to throw an error: `if (!founderRow) throw new Error("Missing factory setting: founder_id. Run seed script.");` or document why this fallback is acceptable as a lint-exempted bootstrap path.

2. **[contracts.md Contract 2, PATCH validation]** No field-level validation rules specified for `PATCH /api/settings`. Fix: add a validation section specifying: quietHoursStart/End must match `HH:MM` pattern (00-23:00-59), mutedProducts must be valid product IDs (FK check), boolean fields are strictly boolean.

3. **[architecture.md Cluster 1, auth endpoint mounting]** The existing `createAuthRoutes(store: UpgradeTokenStore)` has no `db` parameter. The new `GET /api/auth/me` endpoint needs DB access for factorySettings. Fix: specify that `createAuthRoutes` signature changes to `createAuthRoutes(store: UpgradeTokenStore, db: HyperIdleDb)` or that a separate route factory is created.

4. **[architecture.md Cluster 1 + contracts.md Contract 1]** Missing security annotation. The new `GET /api/auth/me` and `PATCH /api/settings` endpoints should have explicit rate-limiting and CORS annotations, even if marked N/A for v1. Fix: add a "Security" subsection to clusters 1 and 2 stating: "Rate-limiting: N/A for v1 (single-founder, API-key-gated). CORS: inherits existing server CORS config."

5. **[architecture.md Cluster 4]** The 6 test files referencing `agent-unassigned` are not enumerated. Fix: list them: `HostThreadSection.prefill.test.tsx`, `HostThreadSection.test.tsx`, `host-threads.test.ts`, `task-threads.service.test.ts`, `task-threads-shim.test.ts`, `useHostThread.test.tsx`.

6. **[contracts.md Contract 2, data sources]** The key-to-field mapping for notification factorySettings is ambiguous. Fix: add explicit key names: `notif_review_alerts` -> `reviewAlerts: boolean`, `notif_cost_alerts` -> `costAlerts: boolean`, etc. Specify that `mutedProducts` is stored as `notif_muted_products` with a JSON array string value.

7. **[architecture.md, all clusters]** Test patterns describe scenarios but do not name test files or provide a test-before-implementation ordering. Fix: each cluster's test pattern should name the file path (e.g., `packages/server/src/routes/__tests__/auth-me.test.ts`) and specify that the test is written before the implementation.

## SUGGESTION

1. **[contracts.md Contract 3, severity derivation]** The `deriveBlockerSeverity` thresholds (24h/4h) are presentation heuristics but read like domain constants. Consider extracting them as named constants (`BLOCKER_HIGH_THRESHOLD_MS`, `BLOCKER_MEDIUM_THRESHOLD_MS`) so future adjustments don't require reading function internals.

2. **[architecture.md, task ordering]** The plan says cluster 3 (rail) "benefits from auth context" but the existing rail endpoint (`packages/server/src/routes/rail.ts`) does not use any auth identity. The current rail route does not call `c.get("userId")`. The ordering dependency is soft at best -- consider noting this explicitly so M3 can parallelize clusters 2-6 after cluster 1.

3. **[architecture.md, self-critique]** The self-critique correctly flags factorySettings seed risk but understates the test blast radius. The grep shows ~15 test-file references to `u-founder` or `agent-unassigned`. A test-file impact list in the plan would prevent surprise failures during M3.

---

## What's Working Well

1. **Full inventory coverage with verifiable totals.** All 34 rows are accounted for in the annotation table with clear category sums (24 + 3 + 7 = 34). The triage of borderline rows is sound -- knowledge page wiring is genuinely a separate scope, and the rationale for each tracked-out row is specific.

2. **Type contracts match the actual server.** The RailBet, RailBlocker, and CostBurnRate types in `packages/api-contract/src/rail.ts` were verified field-by-field against `packages/server/src/routes/rail.ts` lines 6-42 and match exactly (including nullable WireMoney fields and weekTokens). The type shape mismatch analysis in cluster 3 (server vs. client) is accurate and thorough -- the `product` vs `progress` and `severity` vs `durationBlockedMs` discrepancies are real and correctly documented.

---

## Verdict

**PASS.** Score 8/10 clears the >=7 threshold. The plan is comprehensive, well-structured, and accurately reflects the codebase. The one CRITICAL finding (missing `threads.ts:79` in the migration recipe) is a line-level omission, not a structural flaw -- the constant deletion at line 49 would surface this as a compile error during M3, so the risk is bounded. The WARNINGs are real gaps that should be fixed in the contracts but do not block advancement to the build phase.

The designer should address the CRITICAL finding and the highest-priority WARNINGs (1 and 3) before M3 begins. The remaining WARNINGs improve the plan but are not blocking.
