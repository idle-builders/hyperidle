# Architecture Critique: U2

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:8 MD:8 FMC:7 S:8 V:9

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every acceptance criterion from the workpackage spec maps to a plan task and a concrete verification row. The plan's AC table (Section 4) covers all 7 spec ACs plus an 8th (AC-8: drop `product` field) that is a direct consequence of the spec's "no backward-compatible aliases" constraint. No scope creep -- every task traces to an AC or a forced dependency (route collision, ID prefix). The plan correctly identifies U5 as the downstream consumer and does not attempt frontend URL fixes.

One gap: AC-6b says "No `Product` type exported from `@hyperidle/shared`" and the verification is `grep confirms no Product type export`. I verified the codebase: `Product` is already absent from shared exports (cleaned up in U1). The plan should note this is already satisfied and needs only a verification step, not an implementation step. Minor.

### 2. Layer Integrity (9/10)

Clean layer boundaries. All changes are in `packages/server` (routes, middleware) and `packages/shared` (constants). No frontend code touched. No direct DB schema changes (U1 already did those). The plan correctly treats `packages/db` as read-only from U2's perspective.

### 3. API Contracts (8/10)

All routes are named with HTTP method and path. Request/response shapes are specified via Zod schema definitions (Sections 5.1-5.10). Error shapes specify status codes (400, 404) and response body structure (`{ error, code }`). The `at_risk` PATCH request shape is fully specified (Section 5.3-5.4).

Minor gap: the plan does not specify the response shape of the `at_risk` PATCH. Looking at the existing pattern (description PATCH returns `c.json(updated)` where `updated` is a raw bet row), the `at_risk` handler should do the same. The plan's pseudocode in Section 5.4 says "Return updated bet" but does not specify whether this is the raw DB row or the enriched detail response. This should be explicit -- the existing pattern returns the raw row from `db.select()`, not the enriched detail shape.

### 4. Data Model Alignment (8/10)

The plan correctly identifies that `bets.atRisk` is an `integer(0/1)` column and that the PATCH handler must convert `boolean -> 0/1` for writes and (implicitly) `0/1 -> boolean` for reads. However, the plan does not address the read-side conversion. Currently, `GET /api/bets/:id` spreads `...restBet` which includes `atRisk` as an integer (0 or 1), not a boolean. The bet list endpoint (`GET /api/bets`) returns raw rows which also have integer `atRisk`.

This is a WARNING: the spec says "Bet update accepts `at_risk` boolean field" and "subsequent GET" shows `at_risk === true`. If the API accepts a boolean on write but returns an integer on read, the contract is inconsistent. The plan should either (a) add `atRisk` normalization to the GET responses or (b) explicitly state that the read side returns integers and the frontend must coerce. Option (a) is cleaner.

### 5. Naming (8/10)

Good naming throughout. `createTeamMembersRoutes` correctly describes the relocated function. The `team-` ID prefix is honest. The `updateBetAtRiskSchema` follows the existing discriminated-union naming pattern.

One note: the plan names the error code as `VALIDATION_ERROR` (a string literal) for the 400 response on invalid transitions. The global error handler uses `API_ERROR_CODES.CONFLICT` for 409. The plan should use `API_ERROR_CODES.VALIDATION_ERROR` if it exists, or document the exact string. Checking the codebase: `API_ERROR_CODES` is defined in shared. The plan should reference it by constant name, not by string value.

### 6. Module Depth (8/10)

The plan avoids unnecessary abstractions. `at_risk` is handled inline in the PATCH route handler (same pattern as `description` and `cost_appetite`), not routed through `updateBetField()` in the state machine. This is correct -- `updateBetField()` only handles string-valued fields in the `MUTABLE_FIELDS` set, and `at_risk` is a boolean mapped to an integer column. Adding it to `updateBetField()` would require changing its signature for a different value type.

The InvalidTransitionError catch is per-route rather than global, which is correct (different semantics for bet vs task transitions). Three catch blocks is acceptable repetition for semantic correctness.

### 7. Failure-Mode Coverage (7/10)

Security & abuse cases table (Section 7) addresses rate-limiting, input-trust, auth, and correctly marks N/A for secrets, path traversal, and SSRF.

Gaps:

- **CRITICAL -- Missing not-found guard on `/ship` endpoint.** The current `POST /:id/ship` handler (bets.ts line 534) calls `transitionBet(db, eventBus, betId, "completed")` directly without checking if the bet exists first. If the bet doesn't exist, `transitionBet` throws `Error("Bet '<id>' not found")`, which the global error handler catches via the `err.message.includes("not found")` heuristic and returns 404. This works but is fragile -- it relies on error message string matching. The `/commit` and `/kill` endpoints both have explicit 404 guards. The plan should note this inconsistency and have the builder add an explicit existence check to `/ship` while adding the try/catch.

- **WARNING -- `updateBetField` vs route-level `MUTABLE_FIELDS` desync.** The state machine's `MUTABLE_FIELDS` set is `["done_condition", "hypothesis", "appetite"]`. The shared constant `MUTABLE_BET_FIELDS` is `["done_condition", "hypothesis", "cost_appetite"]`. The route schema uses a hardcoded `z.enum(["done_condition", "hypothesis"])` for the string variant. These three sources of truth are already out of sync (`appetite` vs `cost_appetite`, and the z.enum does not include `cost_appetite` because it uses a separate discriminated union branch). Adding `description` and `at_risk` to `MUTABLE_BET_FIELDS` in shared widens this gap further -- neither is used in the route's Zod schema (both have their own discriminated union branches), and neither passes through `updateBetField()`. The plan should acknowledge this desync and either (a) update the lore comment on `MUTABLE_BET_FIELDS` to clarify it's a documentation constant only, or (b) refactor the route to actually use the shared constant. Option (a) is in-scope for U2; option (b) is out of scope.

### 8. Simplicity / Over-Engineering Risk (8/10)

The design-it-twice sections (Sections 11-12) are genuine tradeoff analyses, not theatre. Option B in both cases has real arguments that are honestly rejected. The plan does not introduce any feature flags, abstract base classes, or plugin points.

The `AT_RISK_MUTABLE_IN` set in Section 5.4 is defined inline (`new Set(["draft", "active"])`). This matches the existing pattern for `DESCRIPTION_MUTABLE_IN_STATUSES` at bets.ts line 95. Consistent, not over-engineered.

### 9. Verifiability (9/10)

Every AC has a concrete verification method with specific assertions. The protected-tests list (Section 8) is populated and correctly separates tests whose assertions must not change from tests that need URL path updates. The `migrateTests` and `protectedTests` distinction is useful for the builder.

The plan correctly identifies that `git-export.test.ts` references `products/ghost/BRIEF.md` as a filesystem path, not an API URL, and must not be renamed. This kind of attention to false positives is valuable.

The comprehensive test file (`U2-api-teams-bets.test.ts`) in Task 5 risks duplicating assertions already in the migrated test files. The builder should be instructed to verify they're testing NEW behavior (at_risk, 400 transitions, no product field) rather than re-testing what the migrated tests already cover.

---

## CRITICAL

- [plan Section 5.4, Section 4 AC-4] **`at_risk` read-side response shape is unspecified.** The plan specifies the write path (`z.boolean()` in request, `atRisk: value ? 1 : 0` to DB) but does not address the read path. `GET /api/bets/:id` currently returns `atRisk` as an integer (0 or 1) via `...restBet` spread. `GET /api/bets` returns raw rows with integer `atRisk`. AC-4a says "assert at_risk === true (or 1)" -- the "(or 1)" hedge reveals the ambiguity. The plan must decide: does the API return a boolean or an integer? If boolean, the GET handlers need normalization (`atRisk: !!bet.atRisk` or `atRisk: bet.atRisk === 1`). If integer, the AC verification must assert `1` not `true`, and the PATCH response must also return the integer form. **Fix: add a normalization step to the GET detail and GET list responses, or explicitly document the integer contract and update AC-4a to assert `=== 1`.**

## WARNING

- [plan Section 3.5, Section 5.2] **`MUTABLE_BET_FIELDS` is a documentation constant, not a runtime contract.** The plan says to add `"description"` and `"at_risk"` to `MUTABLE_BET_FIELDS`, and the lore comment says the route uses `z.enum(MUTABLE_BET_FIELDS)`. In reality, the route uses hardcoded `z.enum(["done_condition", "hypothesis"])` plus separate discriminated union branches for `cost_appetite`, `description`, and (soon) `at_risk`. Adding values to `MUTABLE_BET_FIELDS` does not change any runtime behavior -- it only changes a constant that nothing imports at runtime in the server. The plan should update the lore comment on `MUTABLE_BET_FIELDS` to clarify its documentation-only role, or the builder will be confused about why adding fields to this constant does not make them patchable.

- [plan Section 5.5] **`VALIDATION_ERROR` string literal vs `API_ERROR_CODES` constant.** The plan uses the string `"VALIDATION_ERROR"` in the catch block. The global error handler uses `API_ERROR_CODES.CONFLICT`. The plan should verify that `API_ERROR_CODES.VALIDATION_ERROR` exists in `@hyperidle/shared` and use the constant, or define it if it does not exist. Using a string literal when a constant registry exists creates drift risk.

- [plan Section 6, Task 2] **`/ship` endpoint lacks an explicit not-found guard.** The existing `POST /:id/ship` handler does not check bet existence before calling `transitionBet()`. While `transitionBet()` throws on not-found and the global handler catches it, the `/commit` and `/kill` endpoints both have explicit guards. The plan's Task 2 adds try/catch for `InvalidTransitionError` but does not note the missing existence check. The builder should add an explicit 404 guard to `/ship` for consistency.

## SUGGESTION

- [plan Section 9.3] **Test file rename from `products.test.ts` to `teams.test.ts` is mentioned twice** (in Task 5 and Section 9.3) but the plan does not address the git history implications. A `git mv` preserves rename tracking; the builder should use `git mv` rather than delete+create to maintain blame history.

- [plan Section 6, Task 5] **The comprehensive test file `U2-api-teams-bets.test.ts` should focus on new behavior only.** The migrated `products.test.ts` (renamed to `teams.test.ts`) already covers team CRUD. The comprehensive file should test: at_risk PATCH (AC-4), 400 on invalid transitions (AC-5), no product field in response (AC-8), and description acceptance (AC-3). Avoid duplicating team CRUD tests.

- [plan Section 3.3] **Consider extracting the try/catch pattern into a helper.** The same `InvalidTransitionError -> 400` catch block appears in three endpoints. While the plan correctly rejects the global-handler approach (Option B in Section 12), a small utility function `catchInvalidTransition(err, c)` could reduce the repetition without changing semantics. This is a SUGGESTION, not a requirement -- three instances is at the threshold where extraction is a judgment call.

- [plan Section 10.1] **`betDetailResponseSchema` has `product: z.string()` that will be removed.** The plan notes removing `product` from the response and schema. The builder should also check whether any test file imports and asserts on `betDetailResponseSchema` directly -- if so, removing `product` from the schema will break those tests and they need updating in Task 5.

## What's Working Well

- **Plan reconciliation (Section 3) is exceptional.** Seven specific discrepancies between spec assumptions and codebase reality, each with a verified resolution. The route collision discovery (Section 3.1) and the SCOPE_KINDS "product" preservation (Section 10.2) show the architect read the codebase deeply, not just the spec. This is exactly what the reconciliation section should look like.

- **Protected tests (Section 8) and migration checklist (Section 9) are thorough.** The explicit `DO NOT rename` callout for `git-export.test.ts` prevents a false-positive rename that would break the git export feature. The `protectedTests` vs `migrateTests` split gives the builder clear guidance on what can change and what cannot.

---

**Verdict: PASS (8/10).** The plan is actionable. The one CRITICAL item (at_risk read-side shape) needs a decision before the builder starts, but it is a one-line clarification, not a structural flaw. The warnings are real but do not block implementation -- they are things the builder should be aware of. The plan demonstrates thorough codebase investigation and honest tradeoff analysis.
