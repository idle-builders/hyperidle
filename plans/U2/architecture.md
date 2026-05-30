# U2 Architecture — API Layer: Products -> Teams + Bet Endpoints

## 1. Summary

Rename `/api/products/*` routes to `/api/teams/*`, add `at_risk` PATCH support to bet endpoints, enforce bet lifecycle transitions with 400 on invalid transitions, remove the `product` backward-compatibility alias from bet detail responses, update shared types, and update all affected tests.

**Scope boundary:** U2 is pure backend. No UI, no routing, no component changes. The changes touch three packages: `packages/server` (routes, middleware, tests), `packages/shared` (type exports), and indirectly `packages/db` (schema is already correct from U1).

**Depends on:** U1 (merged). Schema already has `teams`, `teamMembers`, `bets.atRisk`, `bets.description`, `bets.completedAt`, simplified status enum.

---

## 2. Required Reading

The builder must read these files before implementing:

- `plans/U0/concept.md` — locked concept: Team (Noun 1) and Bet (Noun 2) definitions, lifecycle, contracts
- `plans/work-packages/TRACK-U.md` lines 57-86 — U2 spec and acceptance criteria
- `packages/server/src/routes/teams-routes.ts` — current `/api/products` handler (becomes `/api/teams`)
- `packages/server/src/routes/bets.ts` — current bet routes (needs `at_risk` PATCH, `product` field removal)
- `packages/server/src/services/bet-state-machine.ts` — transition enforcement
- `packages/server/src/middleware/error-handler.ts` — InvalidTransitionError currently returns 409, must return 400 for bets
- `packages/server/src/schemas/bet.schema.ts` — bet response schemas (drop `product` field)
- `packages/server/src/app.ts` lines 339-345 — route mounting (collision resolution)
- `packages/shared/src/team.ts` — shared Team types (already renamed from U1)
- `packages/shared/src/types.ts` — BET_STATUSES, MUTABLE_BET_FIELDS constants
- `packages/server/src/routes/knowledge.ts` line 885 — `createTeamsRoutes` (team_members listing, mounted at `/api/teams`, must relocate)

---

## 3. Plan Reconciliation (spec vs reality)

### 3.1 Route mounting collision

**Spec assumes:** `/api/teams` is available for the renamed product routes.

**Reality:** `/api/teams` is already mounted in `app.ts:345` — it serves `createTeamsRoutes` from `knowledge.ts`, which lists team_members (agent membership groups). This is a different resource.

**Resolution:** Relocate the team_members listing endpoint from `/api/teams` to `/api/team-members`. Update `app.ts` to mount `createTeamRoutes` (from `teams-routes.ts`) at `/api/teams` and `createTeamsRoutes` (from `knowledge.ts`) at `/api/team-members`. The function name `createTeamsRoutes` in knowledge.ts becomes `createTeamMembersRoutes` for clarity.

### 3.2 Backward-compatibility `product` field in bet detail

**Spec assumes:** Clean cut, no backward-compatible aliases.

**Reality:** `bets.ts:300-301` returns both `product: team` and `team: team` in the bet detail response. `betDetailResponseSchema` has both fields.

**Resolution:** Drop the `product` field from the bet detail response and schema. Only `team` remains. This is a breaking change for any frontend code reading `product` -- but U5 (shared types + frontend type sweep) handles that cleanup. U2 makes the clean cut.

### 3.3 Invalid transition returns 409, spec wants 400

**Spec assumes:** Invalid state transitions return 400.

**Reality:** `InvalidTransitionError` is caught by the global error handler and mapped to 409 (CONFLICT).

**Resolution:** Catch `InvalidTransitionError` in bet route handlers (POST `/commit`, `/ship`, `/kill`) and return 400 with code `VALIDATION_ERROR` before it reaches the global error handler. This keeps the global 409 for task transitions (different semantic — tasks use CONFLICT). The bet lifecycle spec explicitly calls out 400.

### 3.4 `at_risk` boolean PATCH

**Spec assumes:** Bet update accepts `at_risk` boolean field.

**Reality:** `bets.atRisk` column exists (integer 0/1, default 0). No PATCH handler exists for it.

**Resolution:** Add `at_risk` as a new variant in the `updateBetSchema` discriminated union. Value is `z.boolean()`. Mutable in `draft` and `active` statuses. The handler writes `atRisk: value ? 1 : 0` to the DB and logs a revision entry.

### 3.5 `MUTABLE_BET_FIELDS` constant in shared

**Spec assumes:** Updated shared types.

**Reality:** `MUTABLE_BET_FIELDS` in `packages/shared/src/types.ts:32` is `["done_condition", "hypothesis", "cost_appetite"]`. Missing `description` and `at_risk`.

**Resolution:** Add `"description"` and `"at_risk"` to `MUTABLE_BET_FIELDS`. The `description` field is already patchable in the route handler but not in the shared constant. Aligning them.

### 3.6 Old bet statuses still accepted?

**Spec assumes:** Bet endpoints reject old status values (shaped, committed, in_progress, shipped).

**Reality:** The bet creation endpoint hardcodes status `"draft"`. The state machine's `VALID_TRANSITIONS` only has `draft | active | completed | killed` keys. Old status values cannot be created or transitioned to. However, there is no explicit request-level validation that rejects a body containing `status: "shaped"` — because status is not a request field (it's set server-side).

**Resolution:** No change needed. Status is never accepted as input — it's always computed server-side. The state machine already enforces the new enum. The existing bet list/detail endpoints filter by the new status values. Tests will verify old values are absent from responses.

### 3.7 `createTeamRoutes` ID prefix still uses "product-"

**Reality:** `teams-routes.ts:170` generates team IDs as `product-${crypto.randomUUID()}`.

**Resolution:** Change the ID prefix from `product-` to `team-` for consistency with the domain rename.

---

## 4. Acceptance Criteria + Verification

### AC-1: `/api/products/*` routes renamed to `/api/teams/*`

| # | Criterion | Verification |
|---|---|---|
| 1a | `GET /api/teams` returns `{ teams: [...] }` with same shape as current `GET /api/products` | Integration test: seed a team + teamMembers + bets, GET /api/teams, assert 200 + TeamListItem shape |
| 1b | `GET /api/teams/:id` returns TeamDetail with team, teamMembers, roster, burn, activeBets | Integration test: seed full fixture, GET /api/teams/:teamId, assert 200 + TeamDetail shape |
| 1c | `POST /api/teams` creates a team + teamMembers + default agents, returns 201 | Integration test: POST with `{ name: "Growth" }`, assert 201 + response has team.id, teamMembers.id |
| 1d | `PATCH /api/teams/:teamId` updates team phase | Integration test: PATCH with `{ phase: "archived" }`, assert 200 + phase changed |
| 1e | `GET /api/products` returns 404 (no backward compat) | Integration test: GET /api/products, assert 404 |
| 1f | `GET /api/products/:id` returns 404 | Integration test: GET /api/products/:id, assert 404 |

### AC-2: Bet endpoints accept new status values, reject old ones

| # | Criterion | Verification |
|---|---|---|
| 2a | POST /api/bets creates with status `draft` | Integration test: POST, assert response.status === "draft" |
| 2b | GET /api/bets returns groups: draft, active, completed, killed | Integration test: create bets in each status, GET, assert all 4 groups present |
| 2c | No response contains old status values (shaped, committed, in_progress, shipped) | Integration test: assert no response field equals any old status value |

### AC-3: Bet creation accepts `description` (not `pitch`), defaults to `draft`

| # | Criterion | Verification |
|---|---|---|
| 3a | POST /api/bets with `description` field succeeds | Integration test: POST with `{ teamId, description: "Build X" }`, assert 201 |
| 3b | POST /api/bets with `pitch` field is rejected (strict schema) | Integration test: POST with `{ teamId, pitch: "Build X" }`, assert 400 |
| 3c | Created bet has status `draft` | Integration test: POST, assert response.status === "draft" |

### AC-4: Bet update accepts `at_risk` boolean

| # | Criterion | Verification |
|---|---|---|
| 4a | PATCH /api/bets/:id with `{ field: "at_risk", value: true, reason: "..." }` sets at_risk | Integration test: create draft bet, activate, PATCH at_risk=true, GET, assert at_risk === true (or 1) |
| 4b | at_risk is mutable in `draft` and `active` statuses | Integration test: set at_risk on draft bet (200), on active bet (200) |
| 4c | at_risk is NOT mutable in `completed` or `killed` statuses | Integration test: complete a bet, PATCH at_risk, assert 400 |

### AC-5: State transitions enforce lifecycle with 400 on invalid

| # | Criterion | Verification |
|---|---|---|
| 5a | draft->active (POST /commit) succeeds | Integration test: create draft, POST /commit, assert 200 + status=active |
| 5b | active->completed (POST /ship) succeeds | Integration test: activate, POST /ship, assert 200 + status=completed |
| 5c | active->killed (POST /kill) succeeds | Integration test: activate, POST /kill with reason, assert 200 + status=killed |
| 5d | draft->killed (POST /kill) succeeds | Integration test: create draft, POST /kill with reason, assert 200 + status=killed |
| 5e | draft->completed (POST /ship) returns 400 | Integration test: create draft, POST /ship, assert 400 |
| 5f | completed->active returns 400 | Integration test: complete a bet, POST /commit, assert 400 |
| 5g | killed->active returns 400 | Integration test: kill a bet, POST /commit, assert 400 |
| 5h | All invalid transitions return HTTP 400 (not 409) | Integration test: verify response status is exactly 400 with code VALIDATION_ERROR |

### AC-6: Shared types updated

| # | Criterion | Verification |
|---|---|---|
| 6a | `MUTABLE_BET_FIELDS` includes "description" and "at_risk" | Unit test: assert MUTABLE_BET_FIELDS contains both |
| 6b | No `Product` type exported from `@hyperidle/shared` | `npm run check` passes; grep confirms no `Product` type export |
| 6c | `npm run check` passes with zero type errors | `npm run check` exit code 0 |

### AC-7: All existing API tests updated

| # | Criterion | Verification |
|---|---|---|
| 7a | `products.test.ts` updated to use `/api/teams` URLs | Test file uses `/api/teams` paths; `npm run test` passes |
| 7b | Bet test files pass with new field names and status values | `npm run test` exit code 0 |
| 7c | `npm run verify` passes | Exit code 0 |

### AC-8: Bet detail response drops `product` field

| # | Criterion | Verification |
|---|---|---|
| 8a | GET /api/bets/:id response has `team` field but no `product` field | Integration test: GET bet detail, assert `team` present, assert `product` absent |

---

## 5. Type Signatures / Schemas / Endpoints

### 5.1 Route mounting (app.ts)

```typescript
// BEFORE:
api.route("/products", createTeamRoutes(options.db, eventBus));
api.route("/teams", createTeamsRoutes(options.db));

// AFTER:
api.route("/teams", createTeamRoutes(options.db, eventBus));
api.route("/team-members", createTeamMembersRoutes(options.db));
```

### 5.2 Update `MUTABLE_BET_FIELDS` (packages/shared/src/types.ts)

```typescript
// BEFORE:
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "cost_appetite"] as const;

// AFTER:
export const MUTABLE_BET_FIELDS = [
  "done_condition", "hypothesis", "cost_appetite", "description", "at_risk"
] as const;
```

### 5.3 New discriminated union variant for `at_risk` (bets.ts)

```typescript
const updateBetAtRiskSchema = z.object({
  field: z.literal("at_risk"),
  value: z.boolean(),
  reason: z.string(),
});

// Add to the discriminated union:
const updateBetSchema = z.discriminatedUnion("field", [
  updateBetStringFieldSchema,
  updateBetCostAppetiteSchema,
  updateBetDescriptionSchema,
  updateBetAtRiskSchema,
]);
```

### 5.4 `at_risk` PATCH handler (bets.ts)

```typescript
// In the PATCH /:id handler, add a branch:
if (body.field === "at_risk") {
  const AT_RISK_MUTABLE_IN = new Set(["draft", "active"]);
  // Look up bet, check status, update atRisk column (0/1), add revision log entry
  // Return updated bet
}
```

### 5.5 Invalid transition -> 400 (bets.ts)

In each POST action endpoint (`/commit`, `/ship`, `/kill`), wrap the `transitionBet` call:

```typescript
try {
  await transitionBet(db, eventBus, betId, "active", { ... });
} catch (err) {
  if (err instanceof InvalidTransitionError) {
    return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
  }
  throw err; // re-throw for global handler
}
```

### 5.6 Drop `product` from bet detail response (bets.ts)

```typescript
// BEFORE (line 300-301):
product: team,
team,

// AFTER:
team,
```

### 5.7 Drop `product` from betDetailResponseSchema (bet.schema.ts)

```typescript
// Remove: product: z.string(),
// Keep:   team: z.string(),
```

### 5.8 Rename `createTeamsRoutes` in knowledge.ts

```typescript
// BEFORE:
export function createTeamsRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> { ... }

// AFTER:
export function createTeamMembersRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> { ... }
```

### 5.9 Team ID prefix (teams-routes.ts)

```typescript
// BEFORE:
const teamId = `product-${crypto.randomUUID()}`;

// AFTER:
const teamId = `team-${crypto.randomUUID()}`;
```

### 5.10 JSDoc and comment updates (teams-routes.ts)

Update the module-level JSDoc from "L13 -- /api/products routes" to "/api/teams routes". Remove references to "product URL" and update the route descriptions.

---

## 6. Ordered Task List

### Task 1: Relocate team_members route and fix route mounting

**Files:**
- `packages/server/src/routes/knowledge.ts` — rename `createTeamsRoutes` to `createTeamMembersRoutes`
- `packages/server/src/app.ts` — change mounting: `/products` -> `/teams` for `createTeamRoutes`, `/teams` -> `/team-members` for `createTeamMembersRoutes`

**Test:** Existing `team-management.test.ts` still passes. New integration test: GET /api/team-members returns the same data that GET /api/teams formerly returned. GET /api/products returns 404.

**Dependencies:** None.

### Task 2: Update bet routes — drop `product` field, add `at_risk` PATCH, catch InvalidTransitionError as 400

**Files:**
- `packages/server/src/routes/bets.ts` — remove `product` from detail response, add `at_risk` PATCH handler, catch InvalidTransitionError in `/commit`, `/ship`, `/kill` and return 400
- `packages/server/src/schemas/bet.schema.ts` — remove `product` from `betDetailResponseSchema`

**Test:** Integration tests for AC-4 (at_risk), AC-5 (400 on invalid transition), AC-8 (no product field).

**Dependencies:** None (can run in parallel with Task 1).

### Task 3: Update shared types

**Files:**
- `packages/shared/src/types.ts` — add `"description"` and `"at_risk"` to `MUTABLE_BET_FIELDS`

**Test:** `npm run check` passes. Unit test asserting MUTABLE_BET_FIELDS contents.

**Dependencies:** None (can run in parallel with Tasks 1-2).

### Task 4: Update teams-routes.ts — JSDoc, ID prefix

**Files:**
- `packages/server/src/routes/teams-routes.ts` — update JSDoc, change ID prefix from `product-` to `team-`

**Test:** Existing products.test.ts passes (after URL updates in Task 5).

**Dependencies:** Task 1 (route mounting must be updated first).

### Task 5: Update all test files

**Files:**
- `packages/server/src/routes/__tests__/products.test.ts` — change all `/api/products` URLs to `/api/teams`. Rename file to `teams.test.ts` for clarity.
- `packages/server/src/__tests__/bets.test.ts` — verify status groups, description field
- `packages/server/src/__tests__/bets.q3.test.ts` — verify description PATCH
- `packages/server/src/routes/__tests__/bets.validation.test.ts` — verify at_risk PATCH
- `packages/server/src/__tests__/bet-state-machine.test.ts` — no URL changes needed (unit tests)
- `packages/server/src/__tests__/bet-state-machine.L14.test.ts` — no changes expected
- `packages/server/src/routes/__tests__/bets.L14-actions.test.ts` — verify 400 on invalid transitions
- Any other test file referencing `/api/products` — update URLs

**New test file:**
- `packages/server/src/__tests__/U2-api-teams-bets.test.ts` — comprehensive test covering all U2 acceptance criteria:
  - AC-1: teams CRUD at new URL
  - AC-2: status values
  - AC-3: description field, no pitch
  - AC-4: at_risk PATCH
  - AC-5: lifecycle enforcement with 400
  - AC-8: no `product` field in response

**Dependencies:** Tasks 1-4 (all implementation changes must be done before test updates can pass).

### Task 6: Verify

- `npm run check` — zero type errors
- `npm run lint` — zero lint errors
- `npm run test` — all green

**Dependencies:** Task 5.

---

## 7. Security & Abuse Cases

| Concern | Applicable? | Handling |
|---|---|---|
| Rate-limit on POST/PATCH | Yes — already covered | Existing rate limiter in app.ts applies to all /api routes. No new endpoints added, only renamed. |
| Input-trust boundary for at_risk | Yes | Zod schema validates `value: z.boolean()`, `reason: z.string()`. No agent-authored freeform input beyond what already exists for other PATCH fields. |
| Secret handling | N/A | No new credentials or secrets. |
| Path traversal | N/A | No path inputs. |
| SSRF | N/A | No outbound URLs. |
| Auth on renamed routes | Yes — already covered | Auth middleware applies to all /api/* routes. Renaming from /products to /teams does not change the auth boundary. The middleware mounts before all domain routes. |

---

## 8. Protected Tests

Tests that must NOT change their assertions (only URL paths may change):

```
protectedTests:
  - packages/server/src/__tests__/bet-state-machine.test.ts  # unit test, no URLs
  - packages/server/src/__tests__/bet-state-machine.L14.test.ts  # unit test, no URLs
  - packages/server/src/__tests__/team-management.test.ts  # service layer, no URLs
  - packages/server/src/schemas/__tests__/bet.schema.test.ts  # schema validation
  - packages/server/src/schemas/__tests__/common.schema.test.ts  # common schemas
```

The following tests need URL path changes but assertion logic stays the same:
```
migrateTests:
  - packages/server/src/routes/__tests__/products.test.ts  # /products -> /teams
```

---

## 9. Migration Checklist

### 9.1 Route URL migrations

| Old URL | New URL | File | Action |
|---|---|---|---|
| `/api/products` (GET) | `/api/teams` (GET) | `app.ts` | Reroute mounting |
| `/api/products/:id` (GET) | `/api/teams/:id` (GET) | `app.ts` | Reroute mounting |
| `/api/products` (POST) | `/api/teams` (POST) | `app.ts` | Reroute mounting |
| `/api/products/:teamId` (PATCH) | `/api/teams/:teamId` (PATCH) | `app.ts` | Reroute mounting |
| `/api/teams` (GET, team_members) | `/api/team-members` (GET) | `app.ts` | Reroute mounting |

### 9.2 Symbol renames

| Old symbol | New symbol | File | Action |
|---|---|---|---|
| `createTeamsRoutes` (knowledge.ts) | `createTeamMembersRoutes` | `knowledge.ts`, `app.ts` | Rename function + import |
| `product` field in bet detail | (removed) | `bets.ts`, `bet.schema.ts` | Delete field |
| `product-${uuid}` ID prefix | `team-${uuid}` | `teams-routes.ts` | Rename prefix |

### 9.3 Test file URL updates

| File | Old URL pattern | New URL pattern |
|---|---|---|
| `routes/__tests__/products.test.ts` | `/api/products`, `/api/products/:id` | `/api/teams`, `/api/teams/:id`. Rename file to `teams.test.ts`. |
| `__tests__/api-availability.integration.test.ts` | Check for `/api/products` if present | Update to `/api/teams` |
| `__tests__/api-e2e.integration.test.ts` | Check for `/api/products` if present | Update to `/api/teams` |
| Any other test hitting `/api/products` | Grep and update | `/api/teams` |

**DO NOT rename:** `__tests__/git-export.test.ts` references `products/ghost/BRIEF.md` — these are filesystem paths in the git export feature, NOT API URLs. Leave them unchanged.

### 9.4 Web package references (out of scope for U2, tracked for U5)

The web package has hooks (`useTeam.ts`, `useTeams.ts`) and pages that call `/api/products`. These are U5 scope. U2 only changes the server; the web package will break until U5 runs. This is acceptable per the track dependency graph (U5 depends on U2).

---

## 10. Risks and Ambiguities

### 10.1 Web package breakage (expected, acceptable)

Renaming `/api/products` to `/api/teams` will break any web package code that fetches from `/api/products` **at runtime** but NOT at type-check time. The fetch URLs are string literals in the web package (e.g., `useTeam.ts:35`, `useTeams.ts:31`, `SetupFlow.tsx:72`, `SettingsTeams.tsx:41`). TypeScript does not validate string URL paths.

The `product` field removal from the bet detail response is also runtime-only breakage. The web's `useGlobalSearch.ts:19` has `product: string` as a locally-typed field — not derived from the server schema (web does not import `betDetailResponseSchema`). Removing `product` from the server response makes `product` undefined at runtime but does not cause a TypeScript error.

**Verified:** `npm run check` (monorepo-wide typecheck) will pass. `npm run verify` will pass. The web package will have runtime failures when fetching from the old URLs, which U5 fixes.

**Affected web files (for U5 migration):**
- `packages/web/src/hooks/useTeam.ts` — fetches `/api/products/:id`
- `packages/web/src/hooks/useTeams.ts` — fetches `/api/products`
- `packages/web/src/settings/SettingsTeams.tsx` — PATCHes `/api/products/:id`
- `packages/web/src/pages/SetupFlow.tsx` — POSTs to `/api/products`
- `packages/web/src/hooks/useGlobalSearch.ts` — reads `product` field from bet detail

### 10.2 The `product` scope kind in knowledge

`SCOPE_KINDS` in `packages/shared/src/types.ts:121` includes `"product"`. This is a knowledge taxonomy scope kind, NOT the Product->Team domain rename. Per the U1 architecture doc and the `@lore U1` annotation in events.ts: "product scope kind in knowledge_items is UNCHANGED (different taxonomy)." Do NOT rename this — it's a knowledge scope category, not the domain entity.

### 10.3 The `/api/team-members` relocation

The `createTeamsRoutes` function in knowledge.ts is a simple listing endpoint for team_members. It's currently mounted at `/api/teams`. Any frontend code fetching from `/api/teams` to get team_members data will break. This is also U5 scope. The builder should grep the web package to confirm no critical fetch paths will break, but the fix belongs in U5.

---

## 11. Design-It-Twice: at_risk PATCH Shape

### Option A: Discriminated union variant (recommended)

Add `at_risk` as a new field in the existing `updateBetSchema` discriminated union:

```typescript
const updateBetAtRiskSchema = z.object({
  field: z.literal("at_risk"),
  value: z.boolean(),
  reason: z.string(),
});
```

**Trade-off:** Consistent with the existing PATCH pattern. All field updates go through the same endpoint with the same shape. Reason field provides audit trail.

**Reject because:** Nothing. This is the right shape.

### Option B: Separate PATCH endpoint

Add a dedicated `PATCH /api/bets/:id/at-risk` endpoint:

```typescript
router.patch("/:id/at-risk", validateBody(z.object({ atRisk: z.boolean() })), ...)
```

**Trade-off:** Simpler handler, no discriminated union complexity. But introduces a second PATCH pattern alongside the existing field-based PATCH.

**Reject because:** Inconsistent with the existing API pattern. The codebase already has a field-based PATCH system with revision logging. Adding a second pattern doubles the surface area for no benefit.

**Decision:** Option A.

---

## 12. Design-It-Twice: InvalidTransitionError -> 400

### Option A: Catch in route handlers (recommended)

Each POST action endpoint (`/commit`, `/ship`, `/kill`) wraps `transitionBet` in a try/catch and returns 400 when `InvalidTransitionError` is thrown:

```typescript
try {
  await transitionBet(db, eventBus, betId, "active", { ... });
} catch (err) {
  if (err instanceof InvalidTransitionError) {
    return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
  }
  throw err;
}
```

**Trade-off:** Explicit per-route. Three endpoints need the same pattern (slight repetition). But the 400 semantics are clearly bet-specific, not global.

**Reject because:** Nothing. This is correct.

### Option B: Change global error handler

Change `InvalidTransitionError` mapping from 409 to 400 globally in `error-handler.ts`.

**Trade-off:** One change instead of three. But this changes the behavior for task state transitions too (`task-state-machine.ts` also throws `InvalidTransitionError`). The task spec may want 409 (CONFLICT semantics). Global changes have wider blast radius.

**Reject because:** Violates the principle of least surprise. Task transitions returning 400 instead of 409 is a semantic regression. The bet spec specifically calls out 400; the task spec does not.

**Decision:** Option A.
