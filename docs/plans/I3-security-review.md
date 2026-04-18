# I3 Security Review — Data Layer & Schema Fixes

Branch `feat/I3-data-layer-fixes` vs `main`. Read-only review by the Security Researcher.
Files in scope: dependency-watcher, fts, knowledge-repository, cost-cap, session-lifecycle, schema (sqlite + pg), 0005 sqlite migration, 0003 pg migration.

---

## CRITICAL — Boolean migration silently flips NULL rows to TRUE

File: `/workspace/.worktrees/I3/packages/db/drizzle-pg/0003_nice_metal_master.sql:48-67`

Issue: Every `ALTER ... USING CASE WHEN <col> = 0 THEN false ELSE true END` is a two-branch expression. PostgreSQL evaluates `NULL = 0` as `NULL`, falling through to the `ELSE` branch → the row becomes `true`. The columns being migrated allow NULL today (the SQLite schema declares them `integer(...).default(0)` with no `notNull()`). After the migration:
  - Any pre-existing `items.blocking IS NULL` row becomes `blocking = true` → escalated to "blocking" in the human interface (review queue) without ever having been authored that way.
  - Any pre-existing `routines.delegationAllowed/humanReview/silent IS NULL` row becomes `true` → grants delegation, suppresses review, or silences a routine the operator never enabled.
  - `tasks.crossTeam IS NULL` becomes `true` → marks tasks as cross-team unintentionally.
  - `threads.pinned IS NULL` becomes `true` → spurious pins.

Exploit / impact: Anyone with prior write access who left these columns NULL gets a privilege/visibility upgrade after migration. Even without an attacker, this is silent data corruption on first PG deploy.

Fix (developer): Make the CASE three-branch — `CASE WHEN <col> IS NULL THEN NULL WHEN <col> = 0 THEN false ELSE true END` — and write a one-shot data-quality check (count of NULL rows per column pre/post) into the migration's verification harness. For `routines.active` (default 1/true), behavior under NULL is benign but the same pattern should be used for consistency.

Tier: ALWAYS (data integrity at a trust boundary — the migration is the boundary).

---

## HIGH — `knowledge_items` cascade destroys audit trail

File: `/workspace/.worktrees/I3/packages/db/src/schema.ts:302` (and `schema.pg.ts:297`)
File: `/workspace/.worktrees/I3/packages/db/drizzle/0005_empty_sunspot.sql:108, 123`

Issue: `knowledge_edit_log.item_id REFERENCES knowledge_items(id) ON DELETE CASCADE`. The edit log is the only record of who modified a knowledge item and when. Cascading the delete means deleting a knowledge item permanently erases its provenance. Same applies to `knowledge_conflicts` (resolution evidence) and `responses` (cascade from `items`, which removes human approval evidence when a review item is deleted).

Exploit: An attacker with write access to `knowledge_items` (any agent that can call the knowledge repository's currently-unauthenticated `delete` path, plus L0-L3 promotion flows) can issue a single DELETE and remove their own edit history — a denial-of-evidence vector. Especially dangerous for L3/L4 layers where blast radius is widest.

Fix (developer): Switch `knowledge_edit_log.item_id` and `knowledge_conflicts.item_id` to `ON DELETE RESTRICT` (or `SET NULL` if orphan rows are acceptable). Edit logs MUST outlive their subject. Same for `responses.item_id` if the responses table represents human approvals (review with the team — see ASK FIRST below). Also consider a soft-delete (`deletedAt`) on `knowledge_items` so the FK target survives forever.

Tier: ALWAYS (cascade on audit table is a NEVER violation — "Logging sensitive data" / repudiation).

---

## HIGH — Optimistic-locking error path is not transactional

File: `/workspace/.worktrees/I3/packages/fabric/src/knowledge-repository.ts:123-219`

Issue: The SELECT-then-conditional-UPDATE pattern correctly catches the TOCTOU race (the `eq(knowledgeItems.version, expectedVersion)` predicate ensures only one writer commits). However, the entire `update()` body runs without `db.transaction(...)`. Two side effects of the missing transaction:

1. The success-path `INSERT INTO knowledge_edit_log` (line 203-205) happens **outside** the UPDATE's atomic boundary. If the process crashes between the UPDATE returning `changes=1` and the edit log inserts, the version bump is persisted with no audit entry — silent provenance loss.
2. The error-path `select` on line 198 reads the row a second time. With the better-sqlite3 driver these are separate statements; under a hypothetical concurrent writer the reported `currentVersion` may already be stale by the time the exception is raised. Low impact (misleading error message) but worth fixing while we're here.

Also: the UPDATE's `set({...changes, version: newVersion})` spreads the caller's `changes` object directly — if a caller passes `version: 999` in `changes`, the spread would override the computed `newVersion`. The `UpdateKnowledgeItemInput` interface does not include `version`, but TypeScript's structural typing does not prevent extra properties at runtime if a JS caller crosses the boundary.

Exploit: A crash window between UPDATE and edit-log INSERT silently corrupts the audit chain. A malicious agent passing a runtime-extra `version` field could pin the version low, enabling a future replay attack against the optimistic-lock check.

Fix (developer): Wrap the read, UPDATE, edit-log inserts, and read-back in `db.transaction(...)`. Inside the transaction, use `BEGIN IMMEDIATE` (better-sqlite3 default for write transactions) so the version-check is serialized. Strip `version` from `changes` before spreading: `const { version: _ignored, ...safeChanges } = changes as any;` and document the lore.

Tier: ALWAYS (tampering at the data layer).

---

## MEDIUM — `dependency-watcher` LIKE pattern is parameterized but not robust to non-UUID IDs

File: `/workspace/.worktrees/I3/packages/server/src/services/dependency-watcher.ts:31`

Verified: The pattern `sql`${`%"${completedTaskId}"%`}` interpolates through Drizzle's `sql` tag, which produces a single bound parameter (Drizzle's `like(col, value)` is `sql`${col} like ${value}``, value is bound). No SQL injection risk today.

Issue: Two assumptions are encoded but not enforced:
1. The lore comment claims IDs are `crypto.randomUUID` — but nothing at the caller boundary validates this. If a future caller (manual SQL, import script, external system) inserts a task with an ID containing `%` or `_`, the LIKE wildcard expands and unblocks unrelated tasks. If the ID contains `"`, the JSON-quote framing breaks entirely.
2. The post-LIKE JS check (`deps.includes(completedTaskId)`) defends against quote-collision but not wildcard-collision: an ID `dep_1` would LIKE-match a stored `"dep-1"` (the `_` in LIKE is single-char wildcard), and then the JS check would fail-safe — but only because the IDs are unequal. If a malicious ID is constructed to match both LIKE and exact-equal (e.g. `dep%abc` with deps containing the literal text `dep%abc`), the watcher fires.

Exploit: Low likelihood today. Becomes high if non-UUID IDs ever enter the system (custom skill, integration test, restored backup). Worst case: spurious unblocks of dependent tasks → premature execution.

Fix (developer): Validate `completedTaskId` against the UUID v4 regex at the function entry, OR use `like-escape.ts` (the lore mentions it exists) on the variable portion. Add a test: `checkAndUnblockDependents(db, bus, "any%id")` must not unblock anything it didn't insert literally.

Tier: ALWAYS (input validation at a system boundary — even if "boundary" is "future code paths").

---

## MEDIUM — FTS sanitiser drops valid Unicode word characters from RTL/CJK identifiers and dot-segmented names

File: `/workspace/.worktrees/I3/packages/fabric/src/fts.ts:64-95`

Verified: The whitelist `[^\p{L}\p{N}_\-']` correctly strips `*`, `"`, `(`, `)`, `{`, `}`, `^`, `:`, `+`, `[`, `]` and any other FTS5 operator. Wrapping each token in `"…"` makes operator words (`AND/OR/NOT/NEAR`) literal regardless of case. No SQL injection (parameterized `?` on line 121-126). No crash on unbalanced quotes (input quote is stripped by the whitelist before tokens are re-quoted).

Subtle issues:
1. **Dot-separated identifiers are split**: `module.export`, `v1.2.3`, `socket.io` become two/three separate phrases joined by space → FTS5 implicit-AND. Search semantics shift from "literal phrase" to "all parts must appear, anywhere". This is semantic, not security, but is reflected in test expectations and could surprise consumers.
2. **Slashes**: `react/router`, `@scope/pkg` likewise split into multiple phrases. Same implicit-AND.
3. **Performance DoS** (low): a 10MB input string is `split(/\s+/u)` then iterated. Sanitisation is O(n) but no upper bound on input length is enforced before the regex pass. Rapid repeated calls with multi-MB queries could exhaust CPU.
4. **No upper bound on token count**: 10000 tokens become a 10000-phrase MATCH. SQLite handles this, but FTS5 query parser cost grows nonlinearly.

Exploit: Cost amplification via expensive search queries. Low severity given current trust model (agents are first-party).

Fix (developer): Cap input length (`if (trimmed.length > 1024) return ""`) and token count (`rawTokens.slice(0, 64)`). Document the dot/slash splitting in the lore so callers know `socket.io` becomes two phrases.

Tier: ASK FIRST (rate-limit / DoS bound is a policy decision).

---

## LOW — `releaseSessionDedup` not called in pre-insert provisioning failures (no leak today, latent)

File: `/workspace/.worktrees/I3/packages/server/src/services/session-lifecycle.ts:18, 192, 247`
File: `/workspace/.worktrees/I3/packages/server/src/services/session-provisioning.ts:255-259, 304-313`

Verified: `releaseSessionDedup(sessionId)` is invoked from both `endSession` and `crashSession`. The dedup map entry is created lazily on the first `recordCostAndCheck` (line 203 of cost-cap.ts), so any failure BEFORE the harness emits its first `cost_update` event leaves no entry to leak. Today this is safe.

Latent issue: The map entry is created in `recordCostAndCheck` but cleanup only happens in the lifecycle hooks. If a caller of `recordCostAndCheck` does not also wire `endSession`/`crashSession` (e.g. a future test harness, a fire-and-forget cost-record path, an unhandled rejection that bypasses Phase 11 in `session-provisioning.ts`), the entry leaks. The 100-key cap (line 53) bounds per-session memory, but `dedupBySession.size` is unbounded across leaked sessions.

Fix (developer): Add a defensive `try { ... } finally { releaseSessionDedup(sessionId) }` around the harness loop in `provisionSession`, OR move the `releaseSessionDedup` call to the `finally` of `provisionSession` itself. Either approach makes leakage impossible regardless of which lifecycle method runs.

Tier: ASK FIRST (defence-in-depth, not currently exploitable).

---

## INFO — Other observations (no action required, flagged for record)

- `setupFts` accesses Drizzle internals via `(db as any).session.client` (fts.ts:13, 114). Cast bypasses type checking; a Drizzle major bump could silently shift the shape. Pin Drizzle's exact version in `package.json` and add a runtime guard (`if (typeof sqlite?.exec !== "function") throw ...`).
- The `0005` SQLite migration (table-rebuild for FK changes) does `PRAGMA foreign_keys=OFF` then `ON` per table (`agent_skills` rebuild only — line 1, 17). All other rebuilds run with FK enforcement at default. If a transient row in any of these tables violates the new constraint, the migration aborts mid-way leaving the DB in a half-migrated state. Recommend wrapping the entire migration in a single transaction (Drizzle does by default for `migrate()`, but verify).
- `cost-cap.ts:91-93` `entry.keys.clear()` on overflow is a soft signal that something is wrong (100 events for one session is pathological). Emit a `console.warn` (or whatever the future observability adapter exposes) so operators see it.
- `dependency-watcher.ts:55-58` performs N+1 selects on `tasks` to check each dependency's state. Not a security issue, but combined with no upper bound on `dependencies.length`, an attacker who can craft a task with 1000 dep IDs forces 1000 queries on each unblock check. Bound `deps.length` or batch via `inArray`.

---

## Summary

| Tier | Count |
|---|---|
| CRITICAL (ALWAYS) | 1 (boolean NULL migration) |
| HIGH (ALWAYS) | 2 (cascade audit, locking transaction) |
| MEDIUM | 2 (LIKE robustness, FTS DoS bounds) |
| LOW | 1 (dedup leak latent) |
| INFO | 4 |

Blocking findings before merge: the boolean-migration NULL handling and the audit-trail cascade. Both are silent-data-loss vectors that survive the test suite.
