# I3 Architecture Review — Data Layer & Schema Fixes

**Branch:** `feat/I3-data-layer-fixes`
**Diff scope:** 4 commits, 29 files (+6,647 / -375)
**Reviewer:** Staff Architect (read-only)

---

## Verdict

`APPROVE WITH FINDINGS`. Six clusters are correct and well-scoped. Two clusters have load-bearing issues that should be addressed before merge: the SQLite FK migration's `PRAGMA foreign_keys` ordering (C-1) and incomplete `releaseSessionDedup` plumbing (H-1).

---

## C-1 (Critical) — SQLite migration disables FKs only for the first table rebuild

**File:** `packages/db/drizzle/0005_empty_sunspot.sql`

The migration emits `PRAGMA foreign_keys=OFF` at line 1 and `PRAGMA foreign_keys=ON` at line 17 — immediately after the `agent_skills` rebuild. Every subsequent table rebuild (agents, bets, file_leases, items, knowledge_conflicts, knowledge_edit_log, messages, responses, routines, sessions, tasks, teams) executes with FKs ON.

On a fresh DB the migration test (`migration.test.ts:10` creates the DB and migrates without `foreign_keys=ON`) passes because the connection has FKs off by default and child tables are empty. In production / on any seeded DB:
- `DROP TABLE agents` (line 34) while `bets`, `tasks`, `sessions`, `messages`, `routines`, `agent_skills`, `file_leases` still hold FK references will be rejected by SQLite.
- The recommended SQLite "12-step rebuild" pattern keeps `foreign_keys=OFF` for the entire rebuild block, then re-enables once.

The migration test only exercises a fresh-DB path, not a seeded-then-migrate path. The plan §6 explicitly called out adding a "seed-then-migrate" test for this exact failure mode — that test is not present.

**Recommendation:** Move the `PRAGMA foreign_keys=ON` statement to the end of the file (after the final `RENAME TO teams`) so all rebuilds run with FK enforcement disabled, matching the Drizzle/SQLite recommended sequence. Add the seed-then-migrate test before merge.

Sources: SQLite docs https://www.sqlite.org/lang_altertable.html (12-step rebuild pattern), Drizzle migrator wraps each .sql in BEGIN/COMMIT but does not auto-add PRAGMAs.

---

## H-1 (High) — `releaseSessionDedup` is wired into only 2 of 4 session-end code paths

**Files:** `packages/server/src/services/session-lifecycle.ts` (covered), `packages/server/src/services/handoff-protocol.ts` (NOT covered), `packages/server/src/routes/sessions-routes.ts` (NOT covered).

`releaseSessionDedup` is correctly called from `endSession` (line 192) and `crashSession` (line 247). Two other code paths transition a session out of `active` without invoking it:

1. `handoff-protocol.ts:94-97` — `tx.update(sessions).set({ state: "done", endedAt: now }).where(eq(sessions.id, sessionContext.sessionId)).run()`. Handoff explicitly does NOT emit `session_ended` (see comment lines 85-87) and does not call `releaseSessionDedup`. Every handoff leaks a dedup-map entry.
2. `sessions-routes.ts:78-95` — `PATCH /:id` with `state: "done" | "crashed"` updates the session row directly, emits `session_ended`, but does not call `releaseSessionDedup`. Any client-driven session termination leaks an entry.

The leak per session is small (≤100 keys per Map entry), but the entire AC point of this cluster is "entries cleaned up when sessions end" — and 2/4 paths violate it. The bounded `MAX_KEYS_PER_SESSION = 100` is a defence-in-depth, not a substitute for the lifecycle hook.

**Recommendation:** Centralise on a domain event subscriber. Have `cost-cap.ts` subscribe to `session_ended` on the EventBus and call `releaseSessionDedup(event.sessionId)` from the handler. This decouples cost-cap from every site that ends a session and naturally extends to handoff if it ever starts emitting `session_ended`. For handoff specifically (which deliberately suppresses `session_ended`), add an explicit `releaseSessionDedup` call inside the `tx.update(sessions).set({state:"done"})` block — or convert handoff to emit a distinct `session_handed_off` event that cost-cap also subscribes to.

---

## H-2 (High) — Cost-cap module-level `Map<sessionId, …>` survives test boundaries

**File:** `packages/server/src/services/cost-cap.ts:55`

`const dedupBySession = new Map(...)` lives at module scope. Vitest workers reuse module instances across tests in the same file. Both `cost-cap.test.ts` (existing AC9) and `cost-cap.dedup.test.ts` (new) call `clearDeduplicationCache()` in `beforeEach`, so within-file isolation holds. But:

- Any future test file that imports cost-cap APIs without calling `clearDeduplicationCache()` inherits stale state from prior test runs in the same worker.
- Parallel server tests that `createApp()` and exercise cost-cap (e.g. the planned I5 `api-e2e.integration.test.ts`) will share this Map across `describe` blocks.

The test-only export `clearDeduplicationCache()` exists, but discovery is by convention. Module-level mutable state is a smell for a service that gets one instance per `createApp()` call elsewhere.

**Recommendation (defer, document now):** Capture as `@lore` on `dedupBySession` that this is intentional module-level state and any test importing cost-cap APIs MUST register a `beforeEach` calling `clearDeduplicationCache()`. Long-term, the dedup map belongs on a `CostCapService` instance constructed by `createApp` and injected into request handlers — out of I3 scope.

---

## H-3 (High) — Schema parity: `notificationQueue` indexes diverge silently

Both schemas declare the same indexes on `notification_queue` (`nq_status_created_idx`, `nq_severity_idx`) — confirmed at `schema.ts:357-358` and `schema.pg.ts:352-353`. ✅ parity OK on this table.

However, the I3 AC list (lines 127 of TRACK-I) does NOT include `notificationQueue` indexes; they pre-date I3 (H2). What's missing from I3's index list and present elsewhere is fine. What's important: every index added in this story is mirrored across both dialects. Spot-check confirms:

| Index | SQLite | PG |
|---|---|---|
| `tasks_bet_id_idx` | ✓ schema.ts:106 | ✓ schema.pg.ts:106 |
| `tasks_team_id_idx` | ✓ | ✓ |
| `tasks_product_id_idx` | ✓ | ✓ |
| `tasks_state_idx` | ✓ | ✓ |
| `sessions_task_id_idx` | ✓ | ✓ |
| `sessions_agent_id_idx` | ✓ | ✓ |
| `sessions_state_idx` | ✓ | ✓ |
| `items_thread_id_idx` | ✓ | ✓ |
| `messages_thread_id_idx` | ✓ | ✓ |
| `bets_product_id_idx` | ✓ | ✓ |
| `bets_status_idx` | ✓ | ✓ |

Schema parity holds for indexes and FK actions. The intentional bool/int divergence is documented and tested (`pg-boolean-types.test.ts` pins both sides).

---

## M-1 (Medium) — `seed-fixtures.ts` separation earns its keep

The new `seed-fixtures.ts` (96 LOC) extracts `BUILTIN_ROUTINE_SEEDS`, `FACILITATOR_TOOLS`, `PRACTICE_COMMUNITIES`, `COMMUNITY_DISPLAY_NAMES`, and the `asBit01` coercion. The SQLite `seed.ts` and the new `seed-pg.ts` both import from it.

This is justified, not premature, because:
1. The PG seed parity AC mandates "same agents, team, bet, task, routines, knowledge items" — without shared fixtures, the two seeders drift the moment a fixture is added.
2. The seed-parity test (`seed-parity.test.ts`) compares ID sets row-by-row — drift would surface as failing tests, but only after the divergence ships.
3. The boolean coercion boundary is explicit (`asBit01` for SQLite, raw boolean for PG) — the abstraction does not hide the dialect difference, it names it.

The abstraction has one weakness: only `BUILTIN_ROUTINE_SEEDS` is a list of full row objects; the daily-digest bet/task/routine and the CoS/PM/facilitator agents are still inlined separately into both `seed.ts` and `seed-pg.ts`. The two seeders therefore have ~150 lines of duplicated `.insert(...).values(...)` shape per agent. A future refactor could push these into the same fixture module — but that risks coupling more dialect-specific quirks. Acceptable to defer.

---

## M-2 (Medium) — Drizzle ORM contract: `result.changes` works on bun:sqlite

The optimistic-locking fix (`knowledge-repository.ts:186-200`) relies on `result.changes === 0` from `.run()`. Verified:

- bun:sqlite Drizzle session declares: `run(...): import("bun:sqlite").Changes` (`drizzle-orm/bun-sqlite/session.d.ts:45`).
- bun:sqlite's `Changes` interface (per Bun docs: https://bun.sh/docs/api/sqlite#changes) provides `{ changes: number, lastInsertRowid: number | bigint }`.
- better-sqlite3's `RunResult` has the same shape (https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#properties-1).
- Tests pass (`knowledge-repository.locking.test.ts`).

Production runtime uses bun:sqlite via `drizzle-orm/bun-sqlite` (`server-factory.ts:28-29`); tests use better-sqlite3 (`test-utils.ts`, `connection.ts`). Both honour the contract. ✅ verified.

---

## M-3 (Medium) — Migration ordering and idempotency on existing data

For Migration applicability:

- **SQLite 0005:** Additive indexes + table rebuilds. Once C-1's PRAGMA placement is fixed, this is idempotent on a fresh DB and safe on a seeded DB — Drizzle's INSERT INTO __new_X(...) SELECT (...) FROM X preserves data, and the PRAGMA wrapping (after fix) suspends FK enforcement while children temporarily reference dropped parents.
- **PG 0003:** DROP/ADD CONSTRAINT pairs are atomic per-statement, but the migration is not wrapped in a single transaction at the file level — Drizzle's PG migrator runs each statement-breakpoint chunk separately. If statements 1-22 (DROP CONSTRAINT) succeed and statement 49 (boolean USING CAST) fails on bad data, the DB ends in a half-state with no FK constraints. The `CASE WHEN col = 0 THEN false ELSE true END` cast (lines 49, 52, 55, 58, 61, 64, 67) safely handles 0/1/NULL — but any other integer value crashes mid-migration. With current empty-DB deployment this is not a concern.
- **Order between PG 0003 and SQLite 0005:** They are independent migration sets per dialect. There is no cross-dialect ordering hazard — a PG DB never runs the SQLite migrations and vice versa.

**Recommendation:** Document the "PG migration is not transactional across statement-breakpoints" hazard as `@lore` in the migration file. ⚠️ UNVERIFIED: I did not find a Drizzle docs reference confirming whether `migrate()` from `drizzle-orm/postgres-js/migrator` wraps the file in BEGIN/COMMIT. Verify before depending on rollback semantics in PG production deploys.

---

## L-1 (Low) — Dependency-watcher LIKE pattern

`dependency-watcher.ts:31` uses `like(tasks.dependencies, sql\`${\`%"${completedTaskId}"%\`}\`)`. The interpolation goes through Drizzle's `sql` template, which parameterises the string — not string concatenation into the query. Safe against injection (UUIDs cannot contain quotes). The double-quoted wrapping prevents prefix collisions (`dep-1` vs `dep-12`).

The `tasks_state_idx` index makes the `state = 'hold'` predicate selective; the LIKE is a scan within the held subset, which the plan correctly flagged as a future scaling concern (>5,000 held tasks). For I3's AC of 500 tasks <10ms this is fine.

---

## Three-Layer Boundary

✅ **Intact.** No new cross-layer dependencies introduced. `cost-cap` (Meta Layer service) remains in `packages/server/src/services/`. `releaseSessionDedup` is called from `session-lifecycle.ts` (also Meta Layer). Knowledge repository (`packages/fabric`) does not reach into the server. Schema (`packages/db`) is consumed by both server and fabric without inversion.

The new `seed-fixtures.ts` correctly lives in `packages/db` (lowest layer), imported by both `seed.ts` and `seed-pg.ts` in the same package. No package-graph change.

---

## Summary

| Area | Status |
|---|---|
| Three-layer boundary | ✅ intact |
| Schema parity SQLite ↔ PG | ✅ all changes mirrored; intentional bool/int divergence pinned by test |
| SQLite migration applicability on existing data | ❌ PRAGMA placement bug (C-1) |
| PG migration applicability on existing data | ✅ data-safe via CASE WHEN cast; ⚠️ partial-failure recovery unverified |
| Drizzle `result.changes` contract on bun:sqlite | ✅ verified |
| `seed-fixtures.ts` abstraction | ✅ earns its keep |
| `releaseSessionDedup` plumbing | ❌ 2/4 session-end paths uncovered (H-1) |
| Cost-cap module-level state | ⚠️ acceptable for I3, document for future refactor |

**Action items before merge:**
1. Move `PRAGMA foreign_keys=ON` to the end of `0005_empty_sunspot.sql` (C-1).
2. Wire `releaseSessionDedup` into `handoff-protocol.ts` and `sessions-routes.ts` PATCH (H-1) — preferably via an EventBus subscription rather than direct calls.
3. Add a seed-then-migrate test asserting row counts and FK behaviour after applying 0005 to a populated DB.
4. Add `@lore` on `dedupBySession` documenting the test-isolation contract.
