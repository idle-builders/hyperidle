# I3 Combined Review — Data Layer & Schema Fixes

**Branch:** `feat/I3-data-layer-fixes` vs `main`
**Scope:** 29 files, +6647/-375 across 4 commits.

## CRITICAL (must fix before proceeding)

### C1 — `releaseSessionDedup` is NOT called on every session-end path
**File:** `packages/server/src/routes/sessions-routes.ts:78-113`
The PATCH `/sessions/:id` endpoint sets `state` (including `done`/`crashed` from API), updates `endedAt`, emits `session_ended` directly via SQL — bypasses `endSession()`/`crashSession()`. Never calls `releaseSessionDedup(sessionId)`. AC-CC-1 fails in production despite tests passing.
**Fix:** Route PATCH through `endSession`/`crashSession`, OR invoke `releaseSessionDedup(sessionId)` at line 109. Single chokepoint.

### C2 — `getOrCreateSessionEntry` called unconditionally re-introduces leak
**File:** `packages/server/src/services/cost-cap.ts:201-203`
`recordCostAndCheck` always pre-registers a session entry, even for sessions that never breach. A session under cap that never ends gracefully (crash, kill, ungraceful shutdown) creates a `dedupBySession` entry and leaks.
**Fix:** Only register on actual emit (in `tryRecordDedupKey`), store agent/team there.

### C3 — SQLite migration `0005_empty_sunspot.sql` re-enables `foreign_keys=ON` mid-rebuild
**File:** `packages/db/drizzle/0005_empty_sunspot.sql:1,17`
Line 1 disables FKs; line 17 re-enables them after the first table rebuild but 11 more table rebuilds follow. With FKs ON during DROP/RENAME on tables that reference each other (agents↔teams, tasks→bets, bets→teams), partial-rebuild failures are possible. Empty test DBs hide the bug.
**Fix:** Remove the mid-file `PRAGMA foreign_keys=ON` at line 17. Wrap in `BEGIN`/`COMMIT`. Re-enable only at end. Verify against populated DB.

### C4 — Hand-edited PG migration `0003_nice_metal_master.sql` will be clobbered by `db:generate`
**File:** `packages/db/drizzle-pg/0003_nice_metal_master.sql:45-68`
The `USING CASE WHEN col=0 THEN false ELSE true END` was added by hand. Drizzle Kit doesn't preserve hand edits; next `db:generate` rewrites with naive `SET DATA TYPE boolean`, breaking re-deployments.
**Fix:** Move boolean coercion to a separate never-regenerated migration file (e.g., `0003a_boolean_coerce.sql`), OR add a checksum/content test that fails when someone re-runs `db:generate`.

### C5 — Boolean migration breaks on NULL values
**File:** `packages/db/drizzle-pg/0003_nice_metal_master.sql:48-68`
`USING CASE WHEN col=0 THEN false ELSE true END` — for NULL rows, the CASE has no match; ELSE → row becomes `true`. Privilege/visibility upgrade with no audit trail. (Security review CRITICAL-1 also flagged this.) Affected: `items.blocking`, `routines.delegationAllowed/humanReview/silent`, `tasks.crossTeam`, `threads.pinned`.
**Fix:** Use `USING COALESCE(col, 0) <> 0` — total over the integer domain (NULL→false, 0→false, anything→true).

## WARNINGS

### W1 — Edit log lost on optimistic-locking conflict + delete-vs-conflict ambiguity
**File:** `packages/fabric/src/knowledge-repository.ts:158-205`
`current?.version ?? expectedVersion` silently masks "row deleted" as "version conflict." Misleading error messages.
**Fix:** Distinguish via `ItemDeletedError` if second SELECT returns nothing.

### W2 — `tryRecordDedupKey` clears entire per-session set on overflow
**File:** `packages/server/src/services/cost-cap.ts:91-94`
Comment says "occasional re-emit > unbounded growth." Wrong tradeoff: re-emitted `cost_cap_breached` creates duplicate review item (line 282-285), violating the AC9 invariant. Cap (100) will never be reached in practice (~18 keys max), so the clear branch is dead-on-arrival defensive code.
**Fix:** Remove the cap, or evict LRU, or throw. Don't silently clear all suppression state.

### W3 — `dependency-watcher` LIKE pattern not parameterized — SQLi vector
**File:** `packages/server/src/services/dependency-watcher.ts:31`
```ts
like(tasks.dependencies, sql`${`%"${completedTaskId}"%`}`)
```
Template literal interpolates `completedTaskId` into a JS string before sql tag wraps it. Safe today (UUID assumption) but lore says use `escapeLikePattern` if anything changes — and the code doesn't.
**Fix:** Always call `escapeLikePattern(completedTaskId)` and add `ESCAPE '\\'`.

### W4 — Type-assertion holes (`as any` × 3)
**File:** `packages/fabric/src/__tests__/knowledge-repository.locking.test.ts:137-152`
Stub uses 3× `as any` violating project rules. Stub mock shape doesn't match Drizzle's real chain — refactors break the test silently.
**Fix:** Use a real second DB connection, or typed Mock<typeof db.select>.

### W5 — FTS sanitizer kills prefix-search behavior
**File:** `packages/fabric/src/fts.ts:64-95`
Wraps every token in `"…"` (literal phrase). Kills FTS5's prefix `token*` operator — users typing "auth" expecting "authentication" matches now get nothing. Test pins this regression.
**Fix:** Either allow `token*` literally at end of token, OR document explicitly that prefix search is unsupported.

### W6 — FTS apostrophe handling fragile
**File:** `packages/fabric/src/fts.ts:78,91`
`don't` becomes `"don't"` — works by accident not design (FTS5 tokenizer happens to strip apostrophes within phrases).
**Fix:** Decide: literal phrases OR sanitized AND-tokens. Hybrid is fragile.

### W7 — Map iteration during mutation
**File:** `packages/server/src/services/cost-cap.ts:338-343`
JS-defined behavior but well-known footgun.
**Fix:** Collect-then-delete.

### W8 — `pg-call-site-audit.test.ts` snapshot bumped without justification
**File:** `packages/db/src/__tests__/pg-call-site-audit.test.ts:73`
+62 sync sites for ~2 test files plausible but unverified. Bumping snapshot to make test pass IS the drift it warns against.
**Fix:** Verify diff is exactly the new test sites, OR split snapshot per-file.

## OBSERVATIONS

- **O1** Over-indexed `tasks` table: 4 indexes increase write amplification on busiest table. `state` cardinality ~8, full scan sub-ms on 500 rows. Drop `tasks_state_idx`.
- **O2** `dedupKeyPart` one-line, one-call helper (cost-cap.ts:57) — inline.
- **O3** `SeedablePgDb` exported but used only as one internal param type — drop the export.
- **O4** `asBit01` helper adds zero safety — inline `value ? 1 : 0`.
- **O5** EXPLAIN QUERY PLAN tests SQLite-version fragile. Assert by index name, not phrasing.
- **O6** Wall-clock perf assertion `<50ms` flaky under CI load. Move behind BENCH=1, or use row-read-count.
- **O7** Migrations not idempotent. Drizzle journal protects in normal flow, but rollback / dev-DB-reset is fragile. Audit for `IF EXISTS` / `IF NOT EXISTS`.
- **O8** `try { JSON.parse } catch { continue }` in dependency-watcher silently swallows data corruption. Log via observability adapter.

## VERDICT: STOP — apply C1–C5 before any further review.
