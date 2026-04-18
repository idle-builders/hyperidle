# I1 — Combined Simplification + Slop Scan

**Branch:** `feat/I1-production-server-data-integrity`
**Scope:** 11 commits, 23 files, +1114/-164
**Method:** Read-only scan — simplification (over-abstraction, dead code, duplication) + slop (AI anti-patterns, defensive programming for impossible states, type holes).

Severity legend: **MUST-FIX** (ship-blocker), **SHOULD-FIX** (real debt), **NIT** (cosmetic), **FALSE POSITIVE** (surface pattern, explicit reason to keep).

---

## packages/server/src/services/task-audit.ts (NEW FILE)

- **MUST-FIX** — The file's premise is a "unified audit trail" but only one of the two producers uses it. `packages/server/src/services/task-state-machine.ts:31-35` still defines its **own** `interface AuditEntry { from; to; timestamp }` and writes entries of that shape — with no `reason` field — into `tasks.auditTrail`. The new `StateTransitionAuditEntry` in `task-audit.ts:21-26` adds an optional `reason`. Callers reading `auditTrail` that trust the union discriminator will fail on entries written by `transitionTask`, and the "reason" the comment promises is never captured for normal state transitions. Either: (a) make `task-state-machine.ts` import and use `StateTransitionAuditEntry` — that was the point of extracting the type; or (b) delete `task-audit.ts` and let each call site declare what it writes. As shipped, the module pays its cost (two extra imports, coordinated comments) without delivering the unification.
- **SHOULD-FIX** — Discriminating `StateTransitionAuditEntry` from `HandoffAuditEntry` on the **absence** of a `type` tag is fragile. Adding a third entry kind later requires auditing every reader. If `task-audit.ts` survives the first bullet, give the state-transition entry an explicit `type: "state_transition"` tag and migrate readers. One-shot cost, permanent safety.
- **NIT** — The JSDoc is 20 lines of prose for a 14-line file. The `@lore` note duplicates text that also lives in `handoff-protocol.ts` and `session-provisioning.ts`. Pick one home.

## packages/shared/src/event-bus.ts

- **SHOULD-FIX** — `getLogger()` with module-scoped `let logger: Logger | null = null` (lines 11-17) exists **solely** to dodge a Vitest `vi.mock` hoisting gotcha. That's test-tail wagging production-dog. The comment admits it ("Instantiated lazily so that a `vi.mock` factory referencing hoisted test-scoped vars... does not run before those vars are initialized"). The fix is to restructure the test (`vi.doMock` or `vi.hoisted`), not to carry lazy-init cruft in production forever. Tag with `@todo` if you keep it; right now it reads like a legitimate production pattern.
- **NIT** — Two try/catch blocks with logger calls that differ only in the log message string ("event handler threw" vs "wildcard event handler threw"). Fine, but a tiny `safeInvoke(handler, event, label)` helper local to the file would kill six lines of duplication. Minor — keep or fold per taste.
- **FALSE POSITIVE** — The isolation (per-handler try/catch) itself is correct and load-bearing for at-least-once delivery after a throwing subscriber. Do not remove.

## packages/server/src/services/bet-state-machine.ts

- **SHOULD-FIX** — The `@lore I1 B3` block (lines 122-127) explains that inside `db.transaction(() => {...})` we call `db.update` instead of `tx.update` "so tests can spy on `db`." That's a test-shape leak into production code. If the test needs spy fidelity, inject a single `queryRunner`; don't constrain how production writes work so a spy keeps working. The comment even flags this is only OK because "better-sqlite3 serializes writes" — which is true, but it's a fragile contract with PostgreSQL (mentioned in the tech stack) where using `db` instead of `tx` inside a transaction callback will NOT participate in the transaction. This will silently break the moment the driver switches. Use `tx`.
- **SHOULD-FIX** — `updates as Record<string, string>` (line 167, line 234) — unsafe cast around a heterogeneous object containing strings and ISO strings. Drizzle accepts typed update bags; the cast is a capitulation, not a necessity. Type `updates` properly.
- **NIT** — The `killed` transition guard (lines 154-164) duplicates the "was this bet counted in activeBets" decision implicit in VALID_TRANSITIONS. A single `wasActive = ["committed","in_progress","behind","blocked","paused","review"].includes(fromState)` keeps the decision table in one place. Minor.

## packages/server/src/services/handoff-protocol.ts

- **SHOULD-FIX** — Tight coupling to `task-audit.ts` (see first `task-audit.ts` bullet). The code pattern `const existingAudit: TaskAuditEntry[] = freshTask?.auditTrail ? (JSON.parse(freshTask.auditTrail) as TaskAuditEntry[]) : []` is near-duplicated in `session-provisioning.ts:90-92`. Extract `readAuditTrail(db, taskId): TaskAuditEntry[]` and `appendAuditEntry(db, taskId, entry)` — this is the actual missing abstraction, not the type file. DRY win plus single source of truth for the JSON schema.
- **NIT** — `result.targetAgentId ?? sessionContext.agentId` as the message recipient when no target exists (line 96) is wrong-but-innocuous: a handoff with no target delivers the notification back to the sender. Either assert one of `{toHuman, toAgent, toRole}` is present (earlier validation does this) or explicitly document the self-addressed message as "escalated; self-receipt for audit."

## packages/server/src/services/session-provisioning.ts

- **SHOULD-FIX** — `revertTaskToAccepted` duplicates the audit-append pattern from `handoff` (see above). Fold into the proposed `appendAuditEntry` helper.
- **FALSE POSITIVE** — The `biome-ignore` + `console.warn` on line 370-374 is explicitly acknowledged ("observability adapter not yet stood up") and confined to a crash-teardown branch. Fine for now; will be replaced when the adapter is universally available.
- **FALSE POSITIVE** — `validateSoulPromptPath` reads defensive but is a real security boundary for `soulPromptPath` flowing unfiltered to the harness (comment at lines 36-42 is load-bearing). Keep.

## packages/server/src/app.ts

- **SHOULD-FIX** — `registerWebSocket?: (apiRouter: Hono) => void` (lines 72-82) is an options-hook abstraction for **one** caller (`createBunServer`). The comment says "Kept optional so non-Bun integration tests can omit it" — but integration tests spawn the production binary as a subprocess (see `server-factory.integration.test.ts` lines 143-153), so they never instantiate `createApp` in-process. Which in-process caller **without** Bun actually exists? If none, delete the hook and inline `registerWsRoute(api, eventBus)` unconditionally inside `createApp` guarded by a runtime check, or move WS registration into `createBunServer` calling into the returned `app` directly. The current shape exists "just in case" — YAGNI.
- **SHOULD-FIX** — The `APP_DISPOSERS` WeakMap + `disposeApp(hono)` (lines 143, 326-349) is a lot of indirection to carry 6 disposer functions. A simple `createApp(options): { app: Hono; dispose: () => void }` return-shape rewrite eliminates the WeakMap, the "lore" comment justifying it, and the try-each-disposer loop — callers already destructure the return. Right now the WeakMap exists to keep `app` as the bare default export at line 317, which is itself a stale pattern if nothing imports `app` directly anymore.
- **NIT** — `appLogger.error("disposeApp: disposer threw", ...)` inside `disposeApp` — disposer failures here are almost always test-lifecycle double-disposes, and the long `@lore G4 dispose-swallow` comment (lines 333-341) says so. If the failure mode is only "already unsubscribed," catch and continue silently; stop paging the logger on benign reentry.

## packages/server/src/routes/{status,sessions-routes,knowledge,notifications-routes,observability-routes,git-export-routes}.ts

**The 5 (actually 6 counting status) minimal root `GET /` handlers — these mask a test-design issue.**

- **MUST-FIX** — The S2 integration test (`server-factory.integration.test.ts:178-208`) asserts `expect(res.status).not.toBe(404)` for every `/api/<domain>` path. "Is the route mounted" is the question; "does the route have a GET / handler" is what was implemented. These are not the same thing. To satisfy the test, five route files grew a no-op `GET /` that returns either an index payload or a naked list dump — in `sessions-routes.ts:33-36` it blindly selects **every** session row with no pagination, no auth scope, no ordering, returned as raw JSON. In `knowledge.ts:84-87` it does the same for every knowledge item. These are real endpoints now. They leak data, scale badly, and exist only because the test asserted the wrong thing.

  Fix: change S2 to probe a known real sub-route (`/api/sessions/<id>` → 404 for unknown id, which is `!== 404` at the router level — wait, that IS 404; better: `OPTIONS /api/sessions` or assert the Hono 404 body shape has the API error envelope). Remove the five noise `GET /` handlers. If a real index endpoint is wanted, design it (pagination, filters, auth scope) rather than dumping the table.

- **SHOULD-FIX** — `sessions-routes.ts:33-36` and `knowledge.ts:84-87` specifically: full-table dumps with no limit. Even if the test rationale survives, these should be `.limit(100)` or return `{ count, endpoints: [...] }` like `notifications-routes.ts` and `git-export-routes.ts` do. The inconsistency across the six files is its own smell — notifications/observability/git-export return a small index envelope; sessions/knowledge dump the table; status returns a different shape entirely. Pick one or kill all.

- **FALSE POSITIVE** — `status.ts` `GET /health` (lines 24-26) is NOT the same thing: it's the authenticated health probe explicitly required by I1 S1, documented in the plan, and distinct from the public `/api/health`. Keep.

## packages/server/src/routes/ws.ts

- **SHOULD-FIX** — The disposer return pattern (lines 119-125) now correctly cleans up, but `for (const [ws, state] of clients)` (lines 41-47, 50-57) iterates the full client map twice for every event. At N clients × M subscribers, this is O(N×M) per event with no fast path for "no subscribers to topic X." Not urgent (single-process, single-digit clients), but flag before this becomes the hot path.
- **NIT** — The `busDisposers.length = 0; clients.clear();` sequence at the end of the disposer (lines 122-124) — clearing `clients` on teardown drops references but open sockets are not explicitly closed. If `registerWsRoute` is re-called after dispose (the test scenario the comment describes), stale `WSContext` handles are discarded without `ws.close()`. Probably fine — Bun GC closes them — but document or close.

## packages/server/src/server-factory.ts

- **FALSE POSITIVE** — `as unknown as HyperIdleDb` (line 37) is the documented boundary between `bun:sqlite` and `better-sqlite3`-typed code. The comment (lines 18-26) cites the upstream Bun issue. Keep.
- **NIT** — `let wsDispose: (() => void) | null = null` captured by closure then reassigned inside the `registerWebSocket` hook (lines 60-67) is awkward. If `registerWebSocket` stays, return the disposer from the hook rather than side-effecting outer state.

## packages/server/src/routes/status.ts

- **SHOULD-FIX** — Two health endpoints now: the public `/api/health` inside `app.ts:166-172` and the authenticated `/api/status/health` here. The second response shape exactly mirrors the first (`{ status: "ok", timestamp: ISO }`). If the only difference is "behind auth," say so in the body (`{ status: "ok", authenticated: true }`) or return `{ ...statusSummary, status: "ok" }` so the endpoint earns its presence. Right now it's a duplicate with a different URL.

## packages/server/src/skill-tools/log-task.ts

- **FALSE POSITIVE** — The `@lore I1 C2/C3` comment (lines 19-27) explains why this tool appends plain prose to `notes` and NOT to `auditTrail`. The distinction is load-bearing (the fix this branch ships). Keep exactly as-is.
- **NIT** — `logTaskInputSchema.safeParse(args)` inside `handler` (line 29) is redundant — `tool-registry` already validates `inputSchema` before dispatching. Double-validation is defensive against a failure mode that cannot occur at this layer. Remove or demote to an assertion.

## packages/server/src/__tests__/websocket.test.ts

- **SHOULD-FIX** — The new migrate-the-DB prelude (lines 22-29) reproduces exactly the logic in `server-factory.integration.test.ts` (`createAndSeedDb`). Two subprocess-spawning tests now each carry a hand-rolled migrate+seed block. Extract `createSeededServerSubprocess({ apiKey, port, fixtures? })` into a shared test helper. Otherwise the next agent's subprocess test writes the same 30 lines a third time.

## Cross-cutting observations

- The I1 plan references ("plan §3.2", "plan §8 W7", "plan §R3") live inside `@lore` comments — good. Some are duplicated across three files (e.g. the notes-vs-auditTrail distinction appears in `task-audit.ts`, `handoff-protocol.ts`, `session-provisioning.ts`, and `log-task.ts`). A single reference-pointer in `task-audit.ts` with "see $file" elsewhere would be cleaner.
- The `revisionLog` on bets (JSON-string array) and `auditTrail` on tasks (JSON-string array) are the same pattern reinvented twice. Not an I1 problem, but if a `task-audit.ts` helper module survives, it should plausibly live in a package-level `json-log.ts` that bets and tasks both use. Flag for a future simplify pass — out of scope for I1 fix-pass.

---

## Summary

| Severity | Count |
|---|---|
| MUST-FIX | 2 |
| SHOULD-FIX | 12 |
| NIT | 8 |
| FALSE POSITIVE | 5 |

**Top 3 to fix in the fix-pass:**
1. `task-state-machine.ts` is NOT using the new `StateTransitionAuditEntry` type — the "unification" is incomplete. Either complete it or delete `task-audit.ts` (MUST-FIX).
2. Six route files gained noise `GET /` handlers to pass an S2 test that asserts "not 404." Fix the test, delete the handlers, stop dumping full tables on `/api/sessions` and `/api/knowledge` (MUST-FIX).
3. Extract `readAuditTrail` / `appendAuditEntry` helpers — both `handoff-protocol.ts` and `session-provisioning.ts` hand-roll the same JSON-parse / push / JSON-stringify dance; this is the abstraction worth extracting, not the type file (SHOULD-FIX, unblocks #1).
