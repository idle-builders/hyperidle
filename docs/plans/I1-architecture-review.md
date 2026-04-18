# I1 Architecture Review

**Branch:** `feat/I1-production-server-data-integrity`
**Commits:** 11 (f90ee5c → 5004d82)
**Reviewer:** Staff Architect
**Scope:** server-factory convergence, handoff data integrity, bet-state atomicity, EventBus hardening, new `GET /api/status/health`, ad-hoc `GET /` handlers on 5 route files, `registerWsRoute` disposer, async `createBunServer` with dynamic `bun:sqlite` import.

Anchor reading: `docs/ARCHITECTURE.md` §2.1, §2.5, §2.6, §5; `docs/INFORMATION_ARCHITECTURE.md` §1–§6 (shell-to-API shape contract); `docs/work-packages/TRACK-I.md` I1 AC; `docs/plans/I1-plan.md` §3–§8.

---

## MUST-FIX

### M1. `createBunServer.dispose` leaks every event-bus disposer registered by `createApp`

**File:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:75-82`

`createApp` attaches a *bag* of event-bus disposers to the Hono instance via the module-scoped `APP_DISPOSERS` WeakMap (`app.ts:143, 268-287`). Production tears down via `disposeApp(hono)` (`app.ts:326-349`). The new `createBunServer.dispose` only invokes `wsDispose()` and `server.stop()` — it never calls `disposeApp(app)`. Consequences in production are limited today (one process, one app), but:

- The new `server-factory.integration.test.ts` runs multiple subprocesses on a throwaway DB, so it's hidden by process isolation rather than correctness — good luck when I5 rewires WebSocket tests to use in-process Hono testing utilities (TRACK-I I5 explicit criterion).
- Any future in-process multi-app test harness (already planned in I5: "Refactor existing websocket.test.ts to use Hono's testing utilities instead of spawning a child process") will silently accumulate subscribers across `registerSessionReviewCreator`, `registerPolicyEngine`, `registerBuiltinRoutineHandlers`, `registerGitExportHandler`, `registerNotificationDispatcher`, and the observability dispatcher — exactly the contamination the I1 plan §6 R2 called out.

**Fix.** `createBunServer.dispose` must compose both: `wsDispose()` → `disposeApp(app)` → `server.stop()`. Export `disposeApp` already does this for every non-WS subscriber; WS stays outside the bag because it's Bun-only. Add an integration test that boots two `createBunServer(0)` instances back-to-back and asserts the event bus from the first has zero listeners after `dispose()`.

Severity: **MUST-FIX.** Ships a dispose contract that is correct-by-construction only in production — anti-pattern.

### M2. `createBunServer` reimplements the runtime SQLite-driver split that already lives in `packages/db`

**File:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:27-38`; duplicates `/workspace/.worktrees/I1/packages/db/src/setup-cli.ts:137-169`.

`openProductionDb` does a dynamic `import("bun:sqlite")` + `import("drizzle-orm/bun-sqlite")`, sets PRAGMAs, casts the handle to `HyperIdleDb`. This is the third copy of runtime-conditional SQLite opening (`setup-cli.ts` has it for `bun:sqlite`; `connection.ts` has the Node `better-sqlite3` path; now `server-factory.ts` has its own Bun path). The `@lore` correctly identifies *why* (Bun can't dlopen better-sqlite3), but the cross-cutting concern — "open a HyperIdleDb for the current runtime" — belongs in `packages/db`, not `packages/server`.

This matters because H4 already shipped `createPgDb` + `resolveProfile` + `PROFILE_DEFAULTS` (`packages/db/src/profiles.ts`, `pg-connection.ts`). The next track that wires Postgres into the server boot path has to choose between:
- (a) adding a third if-branch to `server-factory.ts` (driver sprawl in server package),
- (b) refactoring `server-factory.ts` to call a new `packages/db` factory,
- (c) introducing a new module anyway.

Option (c) is where we'll land if nobody flags it. The clean seam is to add to `packages/db`:

```
// packages/db/src/index.ts
export async function openRuntimeDb(opts: {
  profile: DeploymentProfile;
  url: string;
}): Promise<{ db: HyperIdleDb; close: () => Promise<void> }>;
```

…which dispatches on `profile.dbDriver` → `{ sqlite-bun, sqlite-node, postgres }`. `createBunServer` becomes a one-liner. The PG type story (separate `HyperIdlePgDb` type today) is a genuine boundary — flagged as a separate concern in O1 below.

Severity: **MUST-FIX** for coupling direction (server must not know about Bun/Node/PG driver choice); **SHOULD-FIX** if we treat I1 as strictly "converge on createApp" and push the abstraction to the first track that actually needs PG at runtime. Recommend MUST-FIX given TRACK-I I6 lists no driver refactor — this is the cheapest moment to do it.

### M3. The cast at the Bun-SQLite boundary bypasses the strict-mode rule the repo enforces elsewhere

**File:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:37` — `return bunDrizzle(sqlite, { schema: dbSchema.schema }) as unknown as HyperIdleDb;`

`.claude/rules/typescript.md` says "No `any`, no `@ts-ignore`, no unsafe `as` casts." The `as unknown as HyperIdleDb` is exactly the unsafe cast the rule prohibits. The `@lore` justifies it ("structural compatibility"), but drizzle's `BunSQLiteDatabase` and `BetterSQLite3Database` types diverge on `$with`, `run()` return types (`RunResult` vs `void` — the seed.ts comment acknowledges this), and the `.transaction()` callback signature. The cast will compile-check *calls that exist today* against the `HyperIdleDb` (better-sqlite3) nominal type — it won't catch the next feature that relies on `RunResult.changes` to detect a no-op UPDATE (e.g. optimistic locking in I3 `knowledge-repository.update`).

**Fix.** Either:
- (a) Widen `HyperIdleDb` in `packages/db` to a union type that both drivers satisfy (`BunSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>`), then every call-site that relies on driver-specific surface gets flagged by the compiler.
- (b) Keep the cast but localize it to a factory function in `packages/db` (same as M2). That way there's *one* boundary, documented and covered by a test that exercises both drivers against the repository layer.

Severity: **MUST-FIX**. An untyped cast masking a driver-specific divergence ships latent bugs that bypass the test suite.

---

## SHOULD-FIX

### S1. The new `GET /` and `GET /health` handlers are ad-hoc — no architectural contract behind them

**Files:** `routes/status.ts:24-26`, `routes/sessions-routes.ts:33-36`, `routes/knowledge.ts:82-87`, `routes/notifications-routes.ts:193-200`, `routes/observability-routes.ts:75-81`, `routes/git-export-routes.ts:106-112`.

The I1 plan §4 S2 verifies "route is mounted" — that's a *test-fixture* need, not a REST contract. The responses are inconsistent:

| Route | `GET /` shape |
|---|---|
| `/api/status` | `{ activeSessions, agentStates, totalCost, uptime }` (pre-existing) |
| `/api/sessions` | `Session[]` (list) |
| `/api/knowledge` | `KnowledgeItem[]` (list) |
| `/api/notifications` | `{ config, endpoints }` (index) |
| `/api/observability` | `{ config, endpoints }` (index) |
| `/api/git-export` | `{ config, endpoints }` (index) |

Three different shapes — list, descriptor, index. `INFORMATION_ARCHITECTURE.md` + `ARCHITECTURE.md §2.5` give specific contracts for the domain-level reads (see `/rail`, `/bets/canvas`, `/knowledge/:layer`). These new handlers don't map to any documented data contract — they're mount-probes in production clothes.

**Fix.** Pick one pattern and document it as a convention:

- **Recommended:** every route module exposes a *capabilities descriptor* — `GET /` → `{ endpoints: string[] }`. Cheap, uniform, low-risk of leaking data, matches the self-describing API convention implicit in `/api/health`. Update `sessions-routes.ts` and `knowledge.ts` to follow it (remove the full-table-scan responses — those belong behind a filter/pagination contract, see SHOULD-FIX S2).
- Alternative: drop the GET / handlers entirely and make the integration test assert the subroutes actually used by the UI (`/bets/canvas`, `/knowledge/L2`, `/sessions?taskId=X`). That's closer to a contract test.

Severity: **SHOULD-FIX.** Shipping three response shapes for "index" invites contract drift and UI code that handles three cases.

### S2. `GET /api/sessions` and `GET /api/knowledge` do unbounded table scans

**Files:** `routes/sessions-routes.ts:33-36`, `routes/knowledge.ts:83-86`.

These handlers return `db.select().from(X).all()` with no pagination, no filtering. `sessions` grows unboundedly (one row per agent-session-start per product, per day, per cycle). `knowledge_items` explicitly aims to grow — the architecture doc §2.4 calls out "Materialization budget" because the set is large enough to need relevance scoring.

Both handlers were added as "proves route is mounted" tests per I1 plan §4 S2. I5 defers pagination to I6 ("Pagination added to `GET /agents/:id/inbox` and `GET /bets`" — note: sessions + knowledge *not* listed). Two failure modes:
- Operator smoke-tests `/api/sessions` at day-100; fetches 50k rows.
- Test-path `S2` passes because scan is fast at seed-volume — production bug surfaces as latency spike.

**Fix.** Either make these index descriptors per S1, or implement them with an explicit LIMIT/offset + filter contract before this ships. Matches the S1 recommendation.

Severity: **SHOULD-FIX.** Latent O(N) read on a growing table is a classic "cheap at test time, expensive later" trap.

### S3. `/api/status/health` vs `/api/health` duplication is a contract smell, not a fix

**File:** `routes/status.ts:24-26` + `app.ts:166-172`.

The I1 plan §8 C1 notes the AC naming conflict (`/api/status/health` vs existing `/api/health`) and resolves by coexistence: the unauthenticated probe stays at `/api/health`, and a new authenticated probe is mounted at `/api/status/health` that returns *the same shape*. Both return `{ status: "ok", timestamp }`. No unique responsibility.

Arch docs (`ARCHITECTURE.md §2.5`) list only `GET /status` as "factory health, agent count, cost burn" — a one-level-deep detailed status read. The nested `/health` under `/status` replicates `/api/health` with the sole difference being `authMiddleware`. That's a middleware property of the overall health probe, not a second endpoint.

**Fix options:**
- (a) Rewrite the I1 AC to target `GET /api/status` (already exists, returns richer data) — the AC language is ambiguous on what "health" means here. A one-line AC edit beats a redundant endpoint.
- (b) Keep `/api/status/health` but differentiate its payload: include `dbConnected: boolean`, `eventBusSubscriberCount: number`, `migrationHash: string` — turn it into the authenticated deep-health probe operators actually want.

Severity: **SHOULD-FIX.** Two endpoints, one responsibility, perpetual drift.

### S4. `transitionBet` comment and behavior disagree about whether `tx` or `db` is used inside the transaction

**File:** `services/bet-state-machine.ts:122-170`.

The `@lore I1 B3` comment says:

> inside the tx callback we intentionally use `db.update` (not the `tx` handle) for the `bets` and `teams` writes. Better-sqlite3 serializes all writes on the single underlying connection during the transaction, so atomicity is preserved

This is load-bearing lore and it is *true for the synchronous better-sqlite3 driver*. It is **not** true for `postgres-js` (H4). On PG, Drizzle's `db.transaction(cb)` runs `cb` with a dedicated client checked out of the pool; writes routed through the outer `db` handle go through a *different* connection and do not participate in the transaction — they commit independently.

When the H4 PG path actually boots (today it's schema-only), `transitionBet` will silently lose atomicity. The test `B3` pinned to better-sqlite3 won't catch it.

**Fix.** Use the `tx` parameter:

```
db.transaction((tx) => {
  // tx.select(...), tx.update(...) — not db.*
});
```

Yes, you lose the "observable to spies on the db handle" property the comment calls out. The fix for that is to spy on `tx` instead (pass a factory or mock the transaction). Don't design for the test at the expense of the PG correctness story.

Severity: **SHOULD-FIX.** Ships a correctness trap against a driver we already have migrations for.

### S5. `registerWsRoute`'s disposer cleans up event-bus subscriptions but not the per-client `Set`

**File:** `routes/ws.ts:119-125`.

```
return (): void => {
  for (const dispose of busDisposers) dispose();
  busDisposers.length = 0;
  clients.clear();  // <-- closes the Map but doesn't close open sockets
};
```

If the disposer runs while clients are connected, their WS contexts remain open, and their `onMessage` / `onClose` closures still reference the (now-empty) `clients` map. When a socket subsequently closes, `clients.delete(rawWs)` is a no-op against an already-empty map. Messages sent by a still-connected client during the small window where `ws.ts` has been disposed but the server hasn't stopped go silently nowhere (no subscription forwards them).

This is a minor leak in the production path because `createBunServer.dispose` sequence is `wsDispose()` → (implied) `server.stop()`. The `server.stop()` closes sockets. But the ordering is undocumented — swap it and you get a leak.

**Fix.** Either:
- (a) Document the ordering constraint in a `@lore` on both `registerWsRoute`'s return and `createBunServer.dispose`.
- (b) Have the disposer iterate `clients` and call `ws.close()` before clearing.

Severity: **SHOULD-FIX**, borderline NIT.

---

## NIT

### N1. `TaskAuditEntry` union type is in `packages/server/src/services/`, not `packages/shared`

**File:** `services/task-audit.ts`.

The union is a *contract* — both handoff, state-machine revert, and future audit readers (including, eventually, the UI) need to discriminate. It lives in `packages/server/src/services/` today because that's where its only writers live. The moment the web package needs to render an audit timeline, this type gets pulled across the layer boundary or duplicated. `packages/shared` is where schema-derived contract types belong (see `events.ts`, `api-types.ts`).

Severity: **NIT.** Move it when something else needs it; flag for I4 / I6 frontend work.

### N2. `EventBus.emit` logs every thrown handler as an error — hot-path logger lookup

**File:** `shared/src/event-bus.ts:12-17`.

The lazy `getLogger()` is fine for correctness (solves the `vi.mock` hoist race). But on every emit *that catches a throw*, it re-enters `getLogger()`. In a healthy system, exceptions are rare — so this is fine. Flag only because the `@lore` explicitly says "Throwing handlers are still a programming error — this guard limits the blast radius, it does not condone them." If any downstream handler ever legitimately throws under high event volume (say, a rate-limited Langfuse forwarder), the log spam + synchronous logger path become measurable.

Severity: **NIT.** Worth a counter/rate-limit in the logger, not a test-blocking issue.

### N3. `server-factory.ts` unused-lore: `createFullApp` rename is documented but the old symbol isn't grep-able

**File:** `server-factory.ts:50-54` — the `@lore I1 S1-S5` refers to the *old* `createFullApp`. That symbol is gone. A future reader greps for `createFullApp`, finds the lore comment, and has no context.

Severity: **NIT.** Either remove the name from the lore or leave a one-line deprecation stub in a comment block.

### N4. `@lore I1 B3` justifies `db.update` inside a `tx` callback based on test observability — overrules the driver's semantic contract

See S4. If S4 is fixed by using `tx.update(...)`, this `@lore` should be rewritten to say "use `tx` inside transactions" — the current one discourages the correct pattern.

Severity: **NIT** (downstream of S4 fix).

### N5. The `notFound` handler returns structured JSON for `/api` and plain text elsewhere

**File:** `app.ts:291-312`.

Not touched by I1 directly but exercised by the new GET / handlers — every new route increases the blast radius of the inconsistency. Top-level 404 returns `c.text("404 Not Found")`; `/api` 404 returns `ApiErrorResponse`. Web client code path for 404 handling now depends on URL prefix. Minor.

Severity: **NIT.** Normalize to `ApiErrorResponse` everywhere.

---

## OK (what's well done)

### O1. Layer boundaries respected

The three-layer dependency (Human Interface → Meta Layer → Agent Runtime) is **not crossed** by any I1 change. Evidence:

- `server-factory.ts` + `app.ts`: pure Meta Layer composition (SQLite, EventBus, Hono). No harness or workspace imports.
- `handoff-protocol.ts`: writes to `tasks.auditTrail`, emits bus events. Does not call harness adapters.
- `bet-state-machine.ts`: Primitive Store writes + bus events. No UI or harness coupling.
- `EventBus` hardening: lives in `packages/shared`, no upward leak.
- WS route auth gate (`routes/ws.ts:62-73`) correctly sits *before* `authMiddleware` in the `/api` sub-router, preserving the Meta → HUI contract that Conversations/Rail subscribe to `/api/ws`.

### O2. Bet-state transaction + event ordering is architecturally correct

Capacity check re-read inside the tx (`services/bet-state-machine.ts:132-144`) + events emitted *after* commit (`:175-192`) implement the at-least-once-after-durability contract from `ARCHITECTURE.md §2.6` correctly. The event ordering choice (bet_state_changed first, then conditionally bet_shipped) matches the intent of the §7.1 data-flow example. Good.

### O3. EventBus resilience matches the stated contract

The I1 plan §3.4 — isolate per-handler failures without changing the synchronous-after-durability contract — is implemented exactly. Type-specific *and* wildcard paths both guard. Tests E1/E2/E3 pin all three paths.

### O4. Handoff data integrity fix aligns notes-vs-audit separation across all three writers

Handoff, `revertTaskToAccepted`, and `log_task` all now write to their correct columns:
- `log_task` → `tasks.notes` (prose) — `skill-tools/log-task.ts`
- `handoff` → `tasks.auditTrail` (JSON) — `services/handoff-protocol.ts:122`
- `revertTaskToAccepted` → `tasks.auditTrail` (JSON) — `services/session-provisioning.ts:99-103`
- `transitionTask` → `tasks.auditTrail` (JSON) — pre-existing `task-state-machine.ts`

The `TaskAuditEntry` discriminated union (`services/task-audit.ts`) is the right shape — tagging only the handoff variant preserves existing state-transition shape (no migration needed). The `@lore I1 H2` comment explicitly discriminates against `kind: "handoff"`. Good discipline.

### O5. `registerWebSocket` hook on `AppOptions` preserves `createApp`'s public surface

The design decision in I1 plan §3.1 (b) — optional callback rather than exposing the sub-router — minimizes the surface change. Non-Bun callers (integration tests) omit the hook, production passes it, and `createApp` owns the ordering constraint (after `onError`, before `authMiddleware`). Correct seam.

### O6. `DATABASE_URL` env convention + default matches docs

`createBunServer` reads `DATABASE_URL` env with `./hyperidle.db` default — matches `ARCHITECTURE.md §6.1` ("SQLite by default. One database file per factory instance (`hyperidle.db`)").

---

## Cross-cutting: coupling between `server-factory` and `createApp`'s internal structure

**Concern raised in scope:** Will `server-factory.ts` break when we swap DB drivers per H4?

**Answer:** Partial yes. Today `server-factory.ts` couples to:

1. `HyperIdleDb` type — defined as better-sqlite3's drizzle output. Any runtime that returns a *different* type (PG, Bun-sqlite) requires the cast at M3, OR a union widening. **Breaks at PG runtime unless M2/M3 are addressed.**
2. The `registerWebSocket` hook ordering (after `onError`, before `authMiddleware`) — enshrined in `app.ts`. If any future route re-orders middleware, WS auth breaks silently. Low risk; pinned by `websocket.test.ts` + `server-factory.integration.test.ts` S5.
3. The `APP_DISPOSERS` WeakMap contract — `disposeApp(hono)` is the only public access. `createBunServer.dispose` does not use it (see M1). **Breaks correctness silently today for in-process multi-app tests.**

**Recommendation for H4 PG wiring:** block on M2+M3+S4 before the PG runtime path is enabled. The I1 work shipped the correct shape — but the driver-split happens to land on better-sqlite3's side today and masks the PG issues.

---

## Top findings (TL;DR for the ship checklist)

1. **MUST-FIX M1:** `createBunServer.dispose` leaks non-WS event-bus subscribers by not calling `disposeApp(app)`.
2. **MUST-FIX M2:** Runtime SQLite driver selection belongs in `packages/db`, not `packages/server`. Fix before H4 PG runtime lands.
3. **MUST-FIX M3:** `as unknown as HyperIdleDb` cast hides driver-surface divergence; widen the type or localize the cast.
4. **SHOULD-FIX S4:** `transitionBet` uses `db.*` inside the `tx` callback — correct for better-sqlite3, silently breaks atomicity on PG.
5. **SHOULD-FIX S1/S2:** GET / handlers lack a contract and two of them do unbounded scans.
6. **SHOULD-FIX S3:** `/api/status/health` duplicates `/api/health` without differentiating responsibility.

Everything else is NIT / OK.
