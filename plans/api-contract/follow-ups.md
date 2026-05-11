# api-contract — Follow-ups

## Phase 3: Remaining route conversions (deferred)

The api-contract workpackage scoped Phase 3 as a sweep of all remaining server
routes to chained form + `export type <Domain>Routes`. Phase 2 covered
`products.ts` and `bets.ts` (the piloted routes). The remaining routes were
intentionally left for Phase 3.

### Routes to convert

Each file follows the same pattern:
1. Change `const router = new Hono(); router.get(...); return router;` to
   `return new Hono().get(...).post(...)`.
2. Remove the explicit `: Hono` return type annotation from the factory.
3. Add `export type <Domain>Routes = ReturnType<typeof create<Domain>Routes>;`
   at the bottom.
4. Replace any `validateBody(schema)` middleware with
   `zValidator("json", schema, validationHook)` (same pattern as bets.ts).
5. Verify: run the route's existing contract tests + `bun run check`.

Files to convert (verify list against `packages/server/src/routes/`):
- `agents.ts` — if it uses imperative form
- `bets.ts` — already done (Phase 2)
- `knowledge.ts` — if it uses imperative form
- `notifications.ts` — if it uses imperative form
- `products.ts` — already done (Phase 2)
- `sessions.ts` — if it uses imperative form
- `tasks.ts` — if it uses imperative form
- `teams.ts` — if it uses imperative form

### Web hook migration

After Phase 3, any remaining web hooks that still use `fetch() + manual cast`
should be migrated to `hc<DomainRoutes>`. Same pattern as `useProducts` and
`useProduct`.

### Acceptance test for Phase 3 completion

Phase 3 is done when `bun run check` passes with zero errors across all
packages, confirming TypeScript infers all route types from server to web with
no manual casts.

## F-3: Changed failure mode in seed.test.ts and seed-parity.test.ts (review finding)

**Status:** Documented, not fixed (out of scope for api-contract Phase 2).

**Background:** The `packages/db/src/test-utils.ts` was modified in this workpackage to switch
from `better-sqlite3` to `bun:sqlite` so that `createTestDb()` would work for the server
contract tests (products.contract.test.ts and bets.contract.test.ts). This was a necessary
infrastructure change — the old `createTestDb()` threw "better-sqlite3 is not yet supported
in Bun" immediately, making any test that imported it fail at import time.

**Side effect:** `seed.test.ts` and `seed-parity.test.ts` previously failed with the clear
"better-sqlite3 not supported in Bun" ABI error. After the change, they now fail with a
subtler bun:sqlite adapter API difference: `db.get()` returns `undefined` for raw SQL
queries that previously worked via the better-sqlite3 interface. The root cause is that the
bun:sqlite Drizzle adapter's `db.get()` method may behave differently for certain raw query
patterns compared to better-sqlite3.

**What would fix it:** Either:
a) Update `seed.test.ts` and `seed-parity.test.ts` to use bun:sqlite-compatible patterns
   (e.g., replace `db.get(sql.raw(...))` calls with Drizzle query builder calls), OR
b) Skip these tests with a `@lore` comment explaining the bun:sqlite adapter incompatibility
   and link to this follow-up.

**Files affected:**
- `packages/db/src/__tests__/seed.test.ts` — 3 failures (was 3 before this workpackage too,
  but the failure messages changed)
- `packages/db/src/__tests__/seed-parity.test.ts` — failures changed from ABI error to
  bun:sqlite `db.get()` returning undefined for raw SQL

**Do NOT fix in this workpackage.** Fixing the seed tests requires changes to
`packages/db/src/__tests__/` which is outside the api-contract scope.

---

## Pre-existing test failures (not regression, not in scope)

These tests were failing before this workpackage and remain failing. They
directly instantiate `better-sqlite3` which is not supported by Bun:

- `packages/db/src/__tests__/migration-l1.test.ts` — uses `new Database()`
  from `better-sqlite3` directly
- `packages/db/src/__tests__/seed-then-migrate.test.ts` — same
- `packages/db/src/__tests__/seed.test.ts` — 3 failures (uses sql.raw with
  bun-sqlite adapter; 8 failures before this workpackage, 3 after)
- `packages/server/src/__tests__/setup-cli.test.ts` — uses better-sqlite3
- `packages/server/src/__tests__/server-factory.integration.test.ts` — uses
  better-sqlite3

These need a separate sweep to either:
a) Replace `new Database()` (better-sqlite3) with `new Database(":memory:")`
   from `bun:sqlite` + `createTestDb()` pattern, OR
b) Mark them as `@skip` with a lore comment explaining the Bun ABI mismatch
   and a link to the tracking issue.
