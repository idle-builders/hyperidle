# Architecture Critique: M3

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:7 N:9 MD:9 FMC:7 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

The plan maps all 27 in-scope inventory rows to 7 clusters with a complete row-to-cluster mapping table (lines 768-798). Every tracked-out row (7 total) is explicitly listed with justification. The 34-row inventory minus 7 tracked-out equals 27 in-scope, which checks out. The plan does not invent requirements beyond what the M2 contracts specify.

Minor: Cluster F claims "0 new rows" but it does close a modification of the `count: 12` hardcode which is not itself a numbered inventory row. This is honest -- the plan explains it closes a knowledge concern without claiming a row number. No penalty.

### 2. Layer Integrity (9/10)

Server changes stay in `packages/server`, client changes stay in `packages/web`, seed changes in `packages/db`. The `@hyperidle/api-contract` package correctly serves as the cross-boundary type contract. No layer violations detected. The plan correctly has the server middleware read from DB (downward dependency), and the client hooks fetch from API endpoints (through the Human Interface to Meta Layer boundary).

### 3. API Contracts (8/10)

The two new endpoints (`GET /api/auth/me` and `GET /api/settings` + `PATCH /api/settings`) have response schemas specified and aligned with the `@hyperidle/api-contract` types. The `GET /api/rail` endpoint already exists. Status codes are specified for `/me` (200, 401). Settings PATCH status codes are not explicitly enumerated (200 on success, but what about 400 for invalid input?).

### 4. Data Model Alignment (7/10)

The plan specifies three new `factorySettings` keys (`founder_id`, `founder_name`, `founder_email`) and their seed values. It correctly uses the existing key-value schema rather than adding new tables. However, there is an issue with the seed file references (see CRITICAL finding below). The settings contract also references `founder_avatar_url` and `notif_*` prefixed keys that are not seeded in the plan -- this is acceptable as they're nullable/defaulted, but it's worth noting.

### 5. Naming (9/10)

`createAuthMiddleware(db)` follows the established pattern (`createBetRoutes(db, eventBus)`). `useCurrentUser`, `useSettings`, `useRail` follow the existing hook naming convention (`useProducts`, `useBet`). `HyperIdleEnv` for the Hono context type is honest and descriptive. `deriveBlockerSeverity` accurately names a presentation-logic derivation.

### 6. Module Depth (9/10)

The three new hooks (`useCurrentUser`, `useSettings`, `useRail`) each hide a fetch + state machine behind a simple return type. The plan does not create unnecessary abstractions -- each hook is a thin wrapper around a single endpoint, matching the existing codebase pattern. The `renderAvatar` function in Cluster E is correctly scoped as a local render function rather than a new component (respects the 19-component budget).

### 7. Failure-Mode Coverage (7/10)

The plan specifies loading/error/empty states for each hook (Clusters A-C have tables). Rate-limiting is not discussed for the new `/api/settings` endpoint -- the existing auth middleware provides baseline protection, but `PATCH /api/settings` should have explicit rate-limit mention. The `createAuthMiddleware(db)` fallback to `"u-founder"` when `founder_id` is missing is a good failure-mode decision. However, the `readSenderId` functions in `coach.ts` and `threads.ts` (Clusters A6, A7) fall back to `c.get("userId")` which itself falls back to `"u-founder"` -- the double-fallback chain is not analyzed for what happens when the factorySettings table is entirely empty.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately mechanical. It does not introduce abstractions, plugin points, or registries. The cluster grouping is sensible and the dependency ordering (A first, B-G parallel) is correct. The "design-it-twice" decision on the auth middleware (factory function vs context variable) is genuine and the chosen option is well-justified.

### 9. Verifiability (8/10)

Each cluster has a "Test pattern" section with concrete assertions. The final M3 proof includes a grep command that proves absence of mock symbols. The `bun run mock-inventory:check` verification is machine-checkable. Test names are not specified (just patterns), which is acceptable for a mechanical refactor. No protected-tests list is provided, but this is a refactoring workpackage, not a new-feature workpackage.

---

## CRITICAL

### C1. Seed parity gap: plan edits `seed-fixtures.ts` but factorySettings are not in that file

[plan section A2 "packages/db/src/seed-fixtures.ts"]

The plan's task A2 says to edit `packages/db/src/seed-fixtures.ts` to add founder settings for test fixtures. However, `seed-fixtures.ts` contains zero `factorySettings` references. The existing `factorySettings` inserts (for `cost_cap` and `cost_cycle`) live directly in `packages/db/src/seed.ts` (lines 169-176) and `packages/db/src/seed-pg.ts` (lines 163-167). The `seed-fixtures.ts` file exports shared data constants (routine seeds, practice communities, etc.) but not factorySettings values.

The builder following this plan would create a file that inserts factorySettings in a module that is not imported by either seed file, resulting in the test fixtures never being seeded.

Fix: Replace A2's target file. The founder settings inserts must go into `seed.ts` (after line 176) and `seed-pg.ts` (after its existing factorySettings block). The `@lore I3` note in `seed-fixtures.ts` warns explicitly about maintaining SQLite/PG seed parity. Both files must receive the same three inserts. Alternatively, if the plan wants shared seed data, the fixtures must be exported from `seed-fixtures.ts` and then imported by both `seed.ts` and `seed-pg.ts`, following the existing pattern for other shared data.

### C2. Cluster F eslint-disable comment will fail the meta-test

[plan section F1 "packages/web/src/layouts/AppShell.tsx"]

The plan specifies:
```
// eslint-disable-next-line design/no-mock-data-import -- tracked in knowledge-wiring follow-up
```

The meta-test at `packages/eslint-plugin-design/src/__tests__/eslint-disable-meta.test.ts` (line 24) requires `TRACKED_RE = /tracked in #\d+/` -- the comment must contain `tracked in #` followed by digits (e.g., `tracked in #42`). The plan's prose-only tracking reference ("tracked in knowledge-wiring follow-up") does not match this regex. The builder would write a comment that passes lint but fails the meta-test, breaking `bun run test`.

Fix: The plan must either (a) assign a tracking number to the knowledge-wiring follow-up workpackage and use `-- tracked in #<number>`, or (b) explicitly note that the meta-test regex must be consulted and a valid tracking ID used. The plan itself acknowledges this risk ("The builder should use whatever tracking reference is available") but the example comment is the one the builder will copy, and it is wrong.

### C3. Missing threads.ts:79 (`readInitialSenderId` fallback)

[plan section A7 "packages/server/src/routes/threads.ts"]

The plan's A7 task says to replace the `DEFAULT_FOUNDER_ID` usage in `readSenderId()` at line 56. It does not address the second `DEFAULT_FOUNDER_ID` usage at line 79, inside `readInitialSenderId()`:

```typescript
function readInitialSenderId(...): string {
  const explicit = c.req.header(SENDER_HEADER);
  if (explicit) return explicit;
  if (messageType === "review" || messageType === "questionnaire") {
    for (const p of participants) {
      const ag = db.select().from(agents).where(eq(agents.id, p)).get();
      if (ag && ag.role !== "founder") return p;
    }
  }
  return DEFAULT_FOUNDER_ID;  // <-- line 79, NOT covered by A7
}
```

This was already flagged by the M2 architecture-critique reviewer (noted in the `@lore M2 REVIEWER FINDING` comment in `packages/api-contract/src/auth.ts` lines 12-19). The M3 plan does not address it despite the M2 reviewer explicitly calling it out as a plan gap that "M3 builder must also replace."

Fix: A7 must explicitly include line 79 and specify that `readInitialSenderId` needs the Hono context's `userId` as fallback. Since `readInitialSenderId` takes a generic `c: { req: { header: ... } }` parameter (not a full Hono Context), the function signature must be widened to accept the userId fallback, or the function must take a `Context<HyperIdleEnv>` parameter.

---

## WARNING

### W1. Settings PATCH validation and error codes unspecified

[plan section B1 "packages/server/src/routes/settings.ts"]

The plan says to implement `PATCH /api/settings` for notification preference updates but does not specify: (a) what the request body shape is (partial `SettingsResponse`? only `notifications`?), (b) validation rules for input (e.g., quietHoursStart/End format), (c) error response codes (400 for invalid input? 422?). The M2 contract (Contract 2) specifies the PATCH exists but is equally vague on the request body.

Fix: Add a request body type to B1, even if minimal: `{ notifications: Partial<SettingsNotifications> }`. Specify that 400 is returned for invalid input with `{ error: string, code: "BAD_REQUEST" }`.

### W2. `HostThreadSection` imports `PLACEHOLDER_AGENT_PARTICIPANT_ID` from wrong module

[plan section D3 "packages/web/src/shell/HostThreadSection.tsx"]

The plan says to "Remove `PLACEHOLDER_AGENT_PARTICIPANT_ID` import (line 37)." The actual import at line 37 is:
```typescript
PLACEHOLDER_AGENT_PARTICIPANT_ID,
```
which comes from `host-threads.ts` (the import statement is above line 37). The plan correctly identifies the line but does not note that `HostThreadSection.tsx` also imports `PLACEHOLDER_AGENT_PARTICIPANT_ID` at line 37 from the re-export in another module. The builder should grep to confirm the exact import path. This is minor since the constant is deleted from both `host-threads.ts` (D1) and `task-threads.ts` (D2), but the plan should be precise about import sources.

### W3. WorkPortfolio.tsx props type becomes `readonly PortfolioProduct[]` but the interface shape may not match API response

[plan section G2 "packages/web/src/pages/WorkPortfolio.tsx"]

The plan says to move the `PortfolioProduct` interface to `WorkPortfolio.tsx` and type the `products` prop as `readonly PortfolioProduct[]`. But `PortfolioProduct` has fields (`lead`, `shipped`, `progress`, `shipRate`) that may not come from the `useProducts()` hook's `ProductListResponse`. The plan does not reconcile the `PortfolioProduct` interface (which has 9 fields including `lead: { name, initials }`) with the actual API response shape. The `useProducts()` hook returns `ProductListResponse` from `@hyperidle/shared`, which may be a different shape entirely.

Fix: The plan should specify how to bridge the `ProductListResponse` shape from `useProducts()` to the rendering type `PortfolioProduct`, or explicitly state that the rendering type must be derived from the API response.

### W4. Cluster A row count claims 18 but the mapping table only lists 16 unique rows

[plan section "Cluster A -- Auth identity"]

The header says "Rows closed: 18 (rows 1-12, 14, 24, 25, 30, 34, plus the doc-comment in row 11)." Counting: rows 1-12 = 12 rows, plus 14, 24, 25, 30, 34 = 5 more rows = 17 rows. "Plus the doc-comment in row 11" -- but row 11 is already counted in "rows 1-12." So the unique count is 17, not 18. The "plus the doc-comment" phrasing suggests the designer counted row 11 twice (once for the runtime literal, once for the doc comment edit), but the inventory has only one row 11.

Fix: Correct the count to 17, or clarify that the 18th closure is a non-inventory modification (the doc comment in `bet-state-machine.ts` is itself row 11, which is already a single inventory row).

---

## SUGGESTION

### S1. Consider adding `seed-pg.ts` to the Required reading list

[plan section "Required reading"]

The plan lists 10 required files but omits `packages/db/src/seed-pg.ts`, which must receive identical factorySettings inserts as `seed.ts` per the I3 seed parity lore. Adding it to the required reading ensures the builder does not miss it.

### S2. The `HyperIdleEnv` type location should be pinned

[plan section A3]

The plan says the Hono env type should be "in a shared types location or directly in the middleware file" but does not commit. For a type that every route file needs to reference for `c.get("userId")`, it should live in one canonical location (middleware file or a shared types file in `packages/server/src/types/`). A decision here saves the builder from inventing the location.

### S3. Cluster E avatar fallback should specify where `deriveInitials` / `renderAvatar` lives

[plan section E2]

The plan says "the component that renders thread list items (likely in ThreadSections.tsx or a child component)." The word "likely" introduces ambiguity. The builder must grep to find the actual renderer. The plan should either pin the file or explicitly say "builder must locate the renderer via grep."

### S4. Risk R2 (auth route restructuring) deserves a concrete split pattern

[plan section "Risk register R2"]

The plan says "Split the mount: always mount a base auth router with /me; conditionally mount the WS token route." This is the right direction but could be more concrete: should there be two separate routers (`createAuthMeRoutes(db)` always mounted, `createAuthWsRoutes(store)` conditionally mounted), or one router with conditional route registration inside? The current code has a single `createAuthRoutes(store)` returning one `Hono` instance. The split pattern matters for the builder.

---

## What's Working Well

1. **Complete row-to-cluster mapping table.** The plan accounts for every inventory row with a cluster assignment, task reference, and explicit tracked-out list. This is the single most useful artifact for the builder -- it turns a 27-row refactor into a checkable matrix. The final grep verification command is machine-auditable.

2. **Honest risk register.** Five risks are identified with severity ratings and concrete mitigations. The highest-risk item (auth middleware refactor) is correctly identified and its blast radius is well-understood. The plan does not downplay the difficulty of touching the middleware that gates every authenticated route.

3. **M2 contract fidelity.** The plan follows the M2 contracts closely. The type changes for Rail (Cluster C) correctly identify the 7 field-level mismatches between client types and the `@hyperidle/api-contract` types. The `deriveBlockerSeverity` function matches the contract's threshold specification exactly.
