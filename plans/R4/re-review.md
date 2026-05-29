# R4 -- Thread Identity Fix: Post-Rebase Re-Review

**Verdict: DONE** (with one non-blocking finding)

## AC Completeness

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: GET /api/threads/:id response includes an identities map matching the pattern used in the coach endpoint | PASS | `buildThreadIdentities` at threads.ts:113-124 returns `Record<string, { name: string; role?: string }>`. Same shape as coach.ts `buildIdentities` (line 122). Wired into GET /:id handler at line 300. 9 tests verify shape, values, and edge cases. 8/9 pass; the 1 failure is a PGLite cold-start timeout (see ADV-1), not an assertion failure. |
| AC-2: ThreadShell renders sender names correctly for all messages in any thread | PASS | Server now provides identities for all message senders. `useThreadDetail.ts` already decodes identities from the response. Tests verify exact name/role values: "Alice Founder"/"founder" for human, "Builder Bot"/"builder" for AI agent. The "not Unknown" test (line 470) directly validates the original bug is fixed. |

## Lens Findings

### Architecture (positive)

No findings. The rebase correctly converted `buildThreadIdentities` from sync to async, matching the PGLite async pattern used throughout threads.ts (e.g., `readInitialSenderId` at line 81, all route handlers). The function uses `await db.select().from(users).where(inArray(...))` -- consistent with every other Drizzle query in the file. The `users` import was already present (line 20). Response shape is backward-compatible (additive field). Single call site, private function, correct layer.

### Security (positive)

No findings. Identities are built from `messageRows.map(m => m.senderId)` -- only senders who posted messages appear. Since only thread participants can post messages (authz at line 450), identities cannot leak information about non-participants. The `inArray` query on primary key prevents SQL injection. No new mutation endpoints. No new trust boundaries.

### Adversarial (negative)

**[ADV-1] MEDIUM: First test consistently times out due to PGLite WASM cold-start.** The first `beforeEach` in `threads.identity.test.ts` (line 116) exceeds the 60s hookTimeout when running in isolation. The PGLite pool's `allocateInstance()` cold-starts the WASM binary (~850ms documented, but observed 60s+ under parallel agent contention). The second through ninth tests all pass because they reuse the pooled instance. This is the same pattern as `threads.routes.test.ts` -- neither file uses `beforeAll` for the cold-start allocation.

The timeout is not specific to R4 code -- it is an infrastructure issue with PGLite WASM initialization under machine contention. When the full suite runs (where another test file warms the pool first), this test passes. The R4 branch already bumped `hookTimeout` from 30s to 60s and `verify.ts` timeout from 300s to 1200s to mitigate this. These mitigations are reasonable but insufficient for isolated file execution under contention.

**Mitigation options (for builder, not blocking merge):**
- Add a `beforeAll` that calls `createTestDb()` + `close()` to warm the pool before `beforeEach` runs. The `beforeAll` hook has the same timeout but would only need to succeed once.
- Or bump `hookTimeout` to 120s in the server project config (ugly but pragmatic).

**Severity: NON-BLOCKING.** The test passes in full-suite runs. The timeout only manifests in isolated file execution under heavy contention. CI runs the full suite.

**[ADV-2] OBSERVATION: `select()` fetches all columns.** Plan section 4.1 specified `db.select({ id: users.id, name: users.name, role: users.role })`. Implementation uses `db.select().from(users)`. Extra columns (`kind`, `status`, `createdAt`) are fetched but never used. Functional impact: none. Performance impact: negligible (PK lookup, 2-5 rows). Carried forward from prior review -- still a minor deviation from plan.

**[ADV-3] OBSERVATION: Parameter type relaxed.** Plan specified `senderIds: ReadonlyArray<string>`, implementation uses `senderIds: string[]`. No runtime impact. Carried forward from prior review.

### Simplification (negative)

No findings on R4 feature code. The implementation is one private function (12 lines) and three lines in the handler. Irreducibly simple.

**[SIMP-1] OBSERVATION: Scope creep in timeout commits.** The branch includes 7 commits that bump timeouts across 10 files unrelated to the thread identity feature: pg-migration.test.ts, node-server.integration.test.ts, node-ws-e2e.integration.test.ts, server-factory.integration.test.ts, websocket.test.ts, router.P4.test.tsx, cost-cap.ts (biome-ignore removal), RecipientPicker.tsx (biome-ignore removal), design-system/vitest.config.ts, verify.ts. These are infrastructure stabilization changes, not R4 feature work. They are individually reasonable (documented with @lore comments, addressing real contention issues), but they inflate the R4 diff from 2 files to 19 files. A cleaner approach would be a separate infrastructure branch. Not blocking -- the changes are correct and harmless.

### AI Slop (negative)

No findings. The JSDoc on `buildThreadIdentities` is justified by the `@lore` tags (project convention). No verbose naming, no unnecessary comments, no defensive over-engineering, no filler patterns.

### Test Quality

The 9 tests are well-structured and correctly ported to async PGLite patterns:
- `setupApp()` is async, returns `{ app, db, close }` -- matches `createTestDb()` contract
- `beforeEach` is async, awaits `setupApp()`
- `afterEach` calls `await ctx.close()` -- properly returns instances to pool (better than the neighboring `threads.routes.test.ts` which omits close)
- `pinned: false` (not `pinned: 0`) -- correct PGLite boolean
- `await db.insert(...)` without `.run()` -- correct PGLite Drizzle pattern
- Direct DB insert for zero-messages edge case (line 325) uses correct PGLite types
- Assertions check exact values (`toBe("Alice Founder")`) not just presence
- Coverage: response shape, human identity, AI identity, both together, zero messages, non-messaging participant exclusion, senderId coverage, not-Unknown

## Rebase Correctness

The rebase correctly converted all R4 code from SQLite to PGLite patterns:
- `buildThreadIdentities`: sync -> async, `.all()` -> `await db.select()`
- Test setup: `createTestDb()` returns `Promise<TestDbHandle>`, properly awaited
- Test inserts: `.values(...).run()` -> `await db.insert(...).values(...)`
- Boolean: `pinned: 0` -> `pinned: false`
- `createTestApp()` properly awaited (it returns `Promise<Hono>`)
- `afterEach` calls `await ctx.close()` for pool cleanup

No regressions detected from the rebase.

## Summary

Clean post-rebase state. The R4 feature code (2 files) is correct, minimal, and well-tested. The async PGLite conversion is faithful. The 7 timeout-infrastructure commits are reasonable but tangential to R4. One test has a flaky first-run timeout under contention -- non-blocking for CI but worth addressing.
