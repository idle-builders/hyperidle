# I1 — Adversary Review

Branch: `feat/I1-production-server-data-integrity`
Scope: commits on `main..HEAD` (11 commits, ~1,100 lines changed).
Mode: read-only, in `/workspace/.worktrees/I1`.

---

## MUST-FIX

### M1. `transitionBet` has NO idempotency/status re-check inside the transaction → double-emit of `bet_shipped`, drifted `activeBets`

File: `packages/server/src/services/bet-state-machine.ts:84-192`

The status read (`bet = db.select()...get()`), the `fromState/allowed` check, and
the "kill needs reason" validation all happen OUTSIDE the transaction. Inside the
transaction the code ONLY re-reads the team for capacity. It never re-reads the
bet to confirm its status is still `fromState`.

Failure mode — two concurrent `transitionBet(bet, "shipped")` callers (the
factory pipeline has several paths that can trigger shipment: routine handlers,
manual /api/bets PATCH, retro flows):

1. Caller A reads bet.status = "in_progress", validates transition.
2. Caller B reads bet.status = "in_progress", validates transition.
3. Caller A's transaction runs: updates `bets.status = shipped`, decrements
   `teams.activeBets` (1 → 0), commits.
4. Caller B's transaction runs: updates `bets.status = shipped` AGAIN (no-op by
   value but still a write), decrements `teams.activeBets` AGAIN — `Math.max(0,
   -1)` clamps to 0. The clamp HIDES the bug but `activeBets` is now wrong
   relative to the true in-progress count if any OTHER bet was committed in the
   interim.
5. AFTER commit, BOTH callers emit `bet_shipped` — downstream git-export,
   notifications, observability all fire twice for the same bet. Downstream
   subscribers are not idempotent (e.g. `createGitExportRoutes` triggers a
   commit per event).

The `@lore` comment on lines 71-75 claims this is safe because "write-locking…
rather than racing on a stale activeBets snapshot" — this is TRUE for the
capacity counter but MUTE on the bet status. The `Math.max(0, ...)` clamp on
lines 149 and 161 tells me the author was worried about exactly this case and
papered over the symptom rather than fixing the cause.

Fix: inside the transaction, re-read `bets.status` via `tx` and abort with
InvalidTransitionError if it's no longer `fromState`. Better: the `UPDATE bets`
should have a `WHERE status = fromState` clause and the caller should check the
changed row count.

Evidence the tests don't cover this: B2 in `bet-state-machine.test.ts:283` only
proves sequential non-overlapping commits work. There is ZERO test for
concurrent transitions racing on the same bet. B3 proves the teams counter
rolls back on bet-update failure, but not status idempotency.

### M2. `handoff` is NOT wrapped in a transaction → partial-failure corruption

File: `packages/server/src/services/handoff-protocol.ts:42-131`

The handoff does five writes in sequence with NO transaction:

1. `UPDATE sessions SET state='done', endedAt=now` (line 60)
2. `UPDATE tasks SET ownerAgentId=...` (line 147) OR `transitionTask` (line 220)
3. `INSERT messages` (line 92) — depends on task.threadId
4. `INSERT threads` + `INSERT items` for escalation (lines 187-207)
5. `UPDATE tasks SET auditTrail=...` (line 122)

If step 3 (`INSERT messages`) throws (FK violation — thread was deleted
concurrently; disk full; DB corruption), the session is already ended but the
task ownership has already transitioned AND the audit trail update at step 5
never fires. Result: session `done`, task owned by agent-b, but no message and
no audit entry. Replaying/reconciling is impossible because the audit trail
never recorded the handoff.

Even worse on the `toHuman` path: `transitionTask(..., "blocked")` at line 220
writes to `tasks.auditTrail` with a state-transition entry, then the later
`UPDATE tasks` at line 122 OVERWRITES that column by setting
`auditTrail = JSON.stringify([...existingAudit, auditEntry])`. Line 109 DOES
re-read `freshTask` to preserve `existingAudit`, so this is OK — but ONLY
because of the re-read, which is fragile. If `transitionTask` ever adds a
second write to auditTrail after line 220, the lost-update bug returns.

Fix: wrap the entire `handoff` body in `db.transaction((tx) => {...})`. The
emit at the end is already correctly post-commit (implicit, since handoff has
no emit before the final update — but `transitionTask` DOES emit inside the
toHuman path, which means a partial failure emits `task_state_changed=blocked`
even when the handoff as a whole fails. That's a real cross-subscriber leak:
notifications tell a human the task is blocked, but the task is still owned by
the original agent).

### M3. `bet_state_changed` / `bet_shipped` emits are NOT idempotent; EventBus try/catch silently swallows handler errors

File: `packages/shared/src/event-bus.ts:101-126`

The new try/catch around each handler (good intent) logs the error via
`getLogger().error(...)` and moves on. BUT:

1. **Lost async failures.** If a handler returns a Promise (`async (e) =>
   {...}`), `(handler as EventHandler<T>)(event)` INVOKES the handler and
   returns immediately. A rejected Promise is an unhandled rejection — it does
   NOT enter the try/catch. The @lore comment claims "one throwing handler
   must not abort delivery" but that's only true for synchronous throws.

   Check: `EventHandler` type — let me verify. In `events.ts` an
   `EventHandler<T>` is `(event: EventByType<T>) => void`. The return type is
   `void`, which in TypeScript allows `Promise<void>` to be assigned (covariant
   void). Several production handlers ARE async (git-export, notifications,
   observability dispatcher). If any of them rejects, the bus sees nothing.

2. **Durability contract violated.** The class doc says "synchronous-after-
   durability — at-least-once delivery when emit() is called after database
   write durability." But now errors are swallowed — no retry, no dead-letter.
   An at-least-once guarantee that silently drops to zero-times on handler
   failure isn't at-least-once. It's best-effort-with-logs.

3. **No backpressure / re-entrancy guard.** A handler that calls `emit()`
   during its own dispatch re-enters — events may arrive in a surprising order.
   Previously a thrown handler short-circuited this; now it always proceeds.

Fix options:
- Either make the handler type strictly `void` (not `Promise<void>`) and add
  an ESLint rule forbidding async handlers, OR
- `await` each handler inside a for-of loop and catch rejected promises.
  Requires `emit` to become `async` → breaks the "synchronous-after-durability"
  claim and cascades into every emit call site. Significant rework.

Minimum fix: explicitly check `handler(event)` return value with `if (result &&
typeof result.then === 'function') result.catch(err => getLogger().error(...))`.
Acknowledge async handlers are second-class and not part of the durability
contract.

---

## SHOULD-FIX

### S1. `server-factory.ts` — no PORT validation, silent coercion

File: `packages/server/src/index.ts:5`

```
const port = Number(process.env.PORT) || 3001;
```

`Number("")` = 0, `0 || 3301` = 3301. `Number("0x1F")` = 31. `Number("-1")` =
-1 — passed to `serve()` as `port: -1` which Bun may reject or silently
reinterpret. `Number("99999")` = 99999 which is above the valid port range —
Bun will throw at `serve()` but only AFTER `createBunServer` opened the DB.

Validate: `const port = Number.parseInt(process.env.PORT ?? "3001", 10); if
(!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(...)`.

### S2. `createBunServer` leaks DB handle on serve() failure

File: `packages/server/src/server-factory.ts:55-84`

```
const db = await openProductionDb(dbPath);
const eventBus = new EventBus();
// ...
const server = serve({...});   // if this throws (port in use), `db` is never closed.
```

The `dispose()` function doesn't close the DB either — it only calls
`server.stop()` and `wsDispose()`. The underlying `bun:sqlite` Database handle
is left open until process exit. Not a production problem (the process dies),
but test harnesses that spawn multiple `createBunServer` calls in the same
Node process WILL leak FD + WAL checkpoints, leading to flaky "database is
locked" errors on retry.

Add `sqlite.close()` to the dispose path and to a try/catch wrapping the
`serve()` call.

### S3. Unsafe type cast at `openProductionDb` boundary

File: `packages/server/src/server-factory.ts:37`

```
return bunDrizzle(sqlite, { schema: dbSchema.schema }) as unknown as HyperIdleDb;
```

This is a double-cast (`as unknown as`) — the codebase's `typescript.md` rule
says "no unsafe `as` casts." The @lore comment justifies it by structural
compatibility with better-sqlite3's Drizzle driver, but:

- bun-sqlite's `run()` returns `void`, better-sqlite3's returns a `RunResult`
  object (`{ changes, lastInsertRowid }`). Any caller that reads
  `result.changes` will silently get `undefined` in production.
- `transaction()` in bun-sqlite (session.js:31-39) invokes the callback
  SYNCHRONOUSLY, same as better-sqlite3. OK.
- `prepareQuery` is identical.

Check call-sites for `.run()` return-value usage:


Grep confirms no callers read `.run().changes` or `.lastInsertRowid` today.
That makes the cast safe NOW, but there is no guardrail preventing a future
commit from adding one and silently breaking in production. A thin type-
narrowing wrapper that returns `Pick<HyperIdleDb, ...>` would at least prevent
reach-through to driver-specific return shapes. Alternatively, assert the
behavioral subset with a runtime smoke test at server boot.

### S4. Async IIFE boot in `index.ts` provides no error telemetry

File: `packages/server/src/index.ts`

```
await createBunServer(port);
log.info(`Server running on http://localhost:${port}`);
```

If `createBunServer` rejects (DB path unwritable, migrations not run, port
taken), the unhandled rejection crashes the process with a raw stack trace. No
structured log, no graceful shutdown, no sentry hook. The log line ALSO fires
if createBunServer resolves with a broken server (unlikely but possible if a
future hook silently fails inside `registerWebSocket`). 

Wrap in try/catch, log structured boot-failed, `process.exit(1)`.

### S5. `registerWsRoute` — `busDisposers.length = 0` after dispose mutates a captured array while handlers may still fire

File: `packages/server/src/routes/ws.ts:119-125`

The disposer does:

```
for (const dispose of busDisposers) dispose();
busDisposers.length = 0;
clients.clear();
```

The `clients.clear()` runs AFTER all EventBus `.off()` calls complete. But
between the last `dispose()` call and `clients.clear()`, another synchronous
emit could have fired — except we just unregistered, so no new events reach
this route. However, there is STILL a subtle race with in-flight WebSocket
messages:

- WS `onMessage` handler mutates `clients.get(rawWs).topics` synchronously. If
  a WS message arrives DURING dispose (Bun's WS is event-driven, single-
  threaded, but receives are queued microtasks), the message handler may
  observe `clients.get(rawWs) === undefined` after `clients.clear()` ran.
  Currently the code handles that (checks `if (state)`), so it's not a crash
  — just silently drops the subscribe/unsubscribe ack.

Not critical, but the @lore comment oversells the safety. Document that
in-flight messages may be dropped during shutdown.

### S6. Five new `GET /` root handlers: information disclosure risk

Files:
- `packages/server/src/routes/git-export-routes.ts:107-112`
- `packages/server/src/routes/knowledge.ts:84-87`
- `packages/server/src/routes/notifications-routes.ts:195-201`
- `packages/server/src/routes/observability-routes.ts:129-135`
- `packages/server/src/routes/sessions-routes.ts:33-36`
- `packages/server/src/routes/status.ts:24-27` (`/health` on status router)

All behind `authMiddleware`, so not public. But:

- `knowledge.ts:84`: `GET /api/knowledge` returns `db.select().from(knowledgeItems).all()` — EVERY knowledge item in the database, across all layers, with no pagination, no filter. For a factory with 10K knowledge items this is multi-MB. One authenticated caller can trivially exhaust memory or request timeout.
- `sessions-routes.ts:33`: `GET /api/sessions` returns EVERY session ever — same problem. No pagination, no date filter.
- `notifications-routes.ts:195`: `config` is redacted, OK. But `endpoints` is a hardcoded array — if a future endpoint is added and this list is forgotten, UI index breaks silently.
- `observability-routes.ts:129`: same redacted pattern. Exposes `adapter` type + `batchSize` etc. — reasonable for an authenticated admin but includes `bufferCap` which could inform a DoS tuned-flood attack. Minor.

The `I1 S2` test just asserts `status !== 404` — it does NOT assert that the
response is small / paginated. That's a legitimate test weakness: a handler
returning "200 + everything in the table" passes the test.

Fix: knowledge and sessions roots should return the top N (50) by recency,
with a Link header / `X-Next-Cursor` for pagination.

### S7. `task-audit.ts` union is NOT exhaustive and has no runtime discriminator for the state-transition variant

File: `packages/server/src/services/task-audit.ts`

```
export type TaskAuditEntry = StateTransitionAuditEntry | HandoffAuditEntry;
```

`HandoffAuditEntry` has `type: "handoff"`. `StateTransitionAuditEntry` has NO
`type` field. A reader doing `if (entry.type === "handoff") { ... } else {
/* state transition */ }` falls through on an unknown third variant without
TypeScript complaining — the `else` branch lies about its type.

When I1 adds a future `RevertAuditEntry` (already implicit in
`revertTaskToAccepted`, which writes a `StateTransitionAuditEntry` shape but
the entry semantically IS a revert), no type error catches the non-
exhaustiveness.

Fix: require `type: "state_transition" | "handoff"` on BOTH variants. Add an
`assertNever(entry)` in readers to catch new variants at compile time. This
also migrates the persisted JSON, but a backfill is cheap — all existing rows
are implicitly `state_transition`.

### S8. Handoff partial-failure leaves `task_state_changed` emitted without matching DB state

File: `packages/server/src/services/handoff-protocol.ts:211-243` (`handleToHuman`)

`transitionTask(..., "blocked")` at line 220 emits `task_state_changed` BEFORE
the review item is inserted (line 226). If the `INSERT items` throws (e.g.
NULL FK on threadId, disk full), the task is blocked, the event already fired
(subscribers notified), but no review item exists. A facilitator who responds
to the event looking for the review item finds nothing — "phantom handoff."

Combined with M2 (handoff not tx-wrapped) the blast radius is real: partial
handoffs are observable by downstream subscribers.

---

## NIT

### N1. `index.ts` log line lies on race condition
File: `packages/server/src/index.ts:9`
`log.info('Server running on http://localhost:${port}')` fires immediately
after `await createBunServer(port)` resolves. But `serve()` returns synchronously
before the OS actually binds the socket, and `createAndSeedDb` in the tests
polls `/api/health` — in production, if a reverse proxy hits the URL in the
log line before Bun's event loop accepts the connection, the user sees a
confusing "connection refused." Minor.

### N2. Lore comment in `bet-state-machine.ts:122-127` admits bypass of `tx` argument
The comment rationalizes using `db.update` instead of `tx.update` inside the
transaction callback — "Better-sqlite3 serializes all writes on the single
underlying connection during the transaction." True but brittle: if Drizzle
ever changes the transaction API to use a different connection (e.g. if bun-
sqlite upgrades to wrap the tx in a savepoint on a different handle), this
silently stops working and writes leak out of the transaction. The
"observable to callers that spy on the db handle" justification is for test
convenience only. Prefer `tx.update` and fix the test to spy differently.

### N3. `createBunServer` pops `wsDispose` to `null` after calling it but `dispose` is callable multiple times
File: `packages/server/src/server-factory.ts:75-81`
Safe because `server.stop()` is idempotent in Bun, but if a caller calls
`dispose()` twice, the first call sets `wsDispose = null` inside the closure
captured by `dispose`. The second call's `if (wsDispose)` short-circuits
cleanly. OK, but the ordering of `wsDispose()` then `server.stop()` means
WebSocket handlers lose their EventBus subscription BEFORE the server closes
the sockets — for a few microseconds, open WS clients may send subscribe
messages that succeed (topics updated in local map) but never receive events.
Not user-visible.

### N4. `handoff` reads `freshTask` (line 109) but only uses `freshTask.auditTrail`
Minor: reading the whole task row when only one column is needed. Drizzle
doesn't make `SELECT auditTrail` trivial, but a `.columns({ auditTrail: true })`
narrows the read. Not a perf issue at this scale.

### N5. Integration test spawns a Bun subprocess (server-factory.integration.test.ts:143)
The `bun run src/index.ts` subprocess dance is documented (@lore) as the only
option because Vitest runs under Node. Fine. But the test has no timeout
annotation on individual `it(...)` blocks — if the server subprocess hangs
during teardown, the 15s `beforeAll` timeout saves us but the `afterAll`
has no timeout. A `serverProcess.kill()` that fails silently (PID already
exited) is OK, but `fs.rmSync` on a WAL-locked DB file on Linux COULD throw,
leaving tmp dirs. Add `try/catch` around rmSync.

### N6. Test `websocket.test.ts` does not set `NODE_ENV=test`
The newer `server-factory.integration.test.ts` sets NODE_ENV=test; the older
`websocket.test.ts` does not. In the older test, `registerTestRoutes` fires
because `NODE_ENV !== "production"` is true (NODE_ENV is undefined). Harmless
for now but inconsistent — both tests should set NODE_ENV explicitly.

---

## FALSE-POSITIVE

### FP1. EventBus async-handler concern has one mitigation I should credit
The `EventHandler<T>` type signature is strictly `(event) => void`, and the
repository bans async handlers by convention. Most of the production handlers
I checked (session-review-creator, policy-engine, built-in routines, git-
export registration, notifications dispatcher) use synchronous bodies that
enqueue Promises internally — they themselves don't return the Promise. So in
practice M3.1 (lost async rejections) is contained. However, `registerGit-
ExportHandler` runs `void runGitExport(...)` which is fire-and-forget inside
the handler — any rejection there is already lost independently of EventBus.
Keep M3 as a SHOULD-FIX rather than MUST, and fix git-export's own rejection
handling separately.

→ Demoting M3 from MUST-FIX to SHOULD-FIX on that basis.

### FP2. `createBunServer` spawning in tests — DATABASE_URL isolation is correct
Each test creates `fs.mkdtempSync(...)` + distinct DATABASE_URL. No shared
file, no cross-test pollution. The @lore already covers this. Clean.

### FP3. WS disposer race: in-flight events firing after dispose
Checked `registerWsRoute` — `eventBus.on(...)` returns the disposer, dispose
calls them synchronously. Because `EventBus.emit` is synchronous, any event
currently being dispatched to the WS forwarder is already on the stack when
dispose is called; the forwarder completes on the current tick, then
`busDisposers` fire, then the next emit misses. No race. Concern resolved.

### FP4. bet_state_machine uses `db` inside transaction callback
I initially flagged this as suspicious. Verified in
`drizzle-orm/bun-sqlite/session.js:31-39` and `better-sqlite3/session.js:31-
35`: `this.client.transaction(() => ...)` wraps in BEGIN...COMMIT on the SAME
sqlite client. `db.update(...)` inside the callback uses the same underlying
session. Atomicity holds for a single-process server. Not safe under multi-
process (different Bun procs sharing the DB file), but I1's architecture is
single-process.

However, M1 (missing status re-check) stands independently.

---

## VERDICT

**REVISE.**

M1 (`bet_shipped` double-emit via missing intra-tx status re-check) and M2
(handoff partial-failure without transaction) are real production-visible
bugs. M1 is especially bad because the `Math.max(0, ...)` clamp on lines 149
and 161 actively hides the symptom — the bug is indistinguishable from
"working correctly" until a downstream subscriber (git-export commits,
notifications firing twice, Langfuse double-tracing) makes the duplication
externally observable, at which point you're debugging from user reports.

M3 demoted to SHOULD-FIX per FP1. S1-S8 are risk-reducing but not
ship-blocking.

Do not merge until M1 and M2 have failing-test-then-fix commits.
