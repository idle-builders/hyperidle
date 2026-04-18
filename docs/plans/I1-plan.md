# I1 Plan — Production Server + Data Integrity Fixes

**Track:** I (Hardening & Quality)
**Branch:** `feat/I1-production-server-data-integrity`
**Effort:** L (~4d)
**Depends on:** None

---

## 1. Context

Four unrelated-on-the-surface defects, all caught during the 12-agent review, are grouped because each is small and each is blocking correctness:

1. `packages/server/src/index.ts` boots `createBunServer()` from `server-factory.ts`, and that factory builds its own minimal Hono app (`createFullApp` — only `/health`, `/api/health`, `/api/ws`, test routes). It never mounts bets / tasks / knowledge / conversations / agents / sessions / rail / status / notifications / observability / git-export / routines. `bun dev` therefore returns 404 for every domain route.
2. `handoff-protocol.ts` writes audit entries to `tasks.notes` (line 117). `session-provisioning.revertTaskToAccepted` does the same (line 99). The schema already has a dedicated `tasks.auditTrail` column (`packages/db/src/schema.ts:92`, `schema.pg.ts:92`), and `task-state-machine.ts:61-73` already writes to it correctly. Writing audit to `notes` corrupts the agent-prose column and splits the audit stream across two JSON blobs.
3. `handoff-protocol.ts:57` sets `sessions.cost = 0` on end, zeroing accumulated spend that downstream routines (cost-cap, daily-digest, observability) depend on.
4. `bet-state-machine.transitionBet` issues the team `activeBets` UPDATE and the bet row UPDATE as two separate SQLite statements (lines 120-149). A failure between them leaves `teams.activeBets` drifted from reality; two concurrent commits can lost-update the counter.
5. `EventBus.emit` (`packages/shared/src/event-bus.ts:76-87`) invokes handlers in a bare `for...of`. One throwing handler aborts the remaining handlers — a regression waiting to happen as we add observability, notifications, and git-export side-effects.

## 2. Constraints

- Three-layer boundary intact: these are all Meta Layer / shared-contract fixes. No UI changes.
- Drizzle only — no raw SQL. `db.transaction()` (better-sqlite3 native, see `attention-service.ts:164`, `builtin-routines.ts:499`, `practice-meeting.ts:284` for precedent).
- TypeScript strict; explicit return types on exports; no `any`; no `console.log` (use `createLogger`).
- WebSocket path must keep working. `hono/bun`'s `createBunWebSocket` returns `{ upgradeWebSocket, websocket }`, and Bun's `serve({ fetch, websocket })` needs the `websocket` handler at the top level — this is the reason `server-factory.ts` exists as a separate file today. The fix must NOT regress that.
- `createApp` already exists and is the path used by every integration test (`git-export.test.ts:1100`, `session-provisioning.integration.test.ts`, etc.). Tests pass; production boots a different app. Converge by making production use `createApp`.
- All existing tests must stay green. This includes tests that currently assert on `tasks.notes` containing audit entries — those assertions are wrong per the schema contract and will be flipped as part of the work.

## 3. Design (summary, no implementation code)

### 3.1 Server entrypoint convergence

- Delete `createFullApp` from `server-factory.ts`. Keep only `createBunServer(port, options?)`.
- `createBunServer` builds the db handle (existing `openDb()` call pattern in `index.ts` history), calls `createApp({ db, eventBus, ... })`, then registers the WS route on the inner `/api` sub-router via `registerWsRoute(apiApp, eventBus)` BEFORE returning, and returns `Bun.serve({ fetch: app.fetch, port, websocket: wsHandler })`.
- Options required by `createApp`: `db`, `eventBus` (new one per process), plus optional factories (notification, observability, git-runner). These come from env (`DATABASE_URL`) and default adapters.
- `index.ts` stays thin: read port, call `createBunServer(port)`, log bind address. No route wiring in this file.
- WS nuance: `createApp` currently exposes the `/api` sub-router only by calling `app.route("/api", api)` inside the function, so the sub-router is not returned. We add an internal seam: either (a) export a helper `buildApiRouter(options)` that returns `{ app, api }`, or (b) expose `registerWsRoute` acceptance via an `AppOptions.wsEventBus` hook that `createApp` invokes at the right phase (before `authMiddleware` and before `notFound`).

  **Decision:** (b). Reasoning: keeps the public surface of `createApp` unchanged for tests; the WS registration remains a Bun-only concern driven from `server-factory.ts`; we avoid leaking a new top-level export. Implementation is a single optional callback in `AppOptions`:

  ```
  interface AppOptions {
    ...existing fields
    registerWebSocket?: (apiRouter: Hono) => void;
  }
  ```

  `createApp` calls it just after `api.onError(errorHandler)` and just before `api.use("*", authMiddleware)` — matching today's ordering in `server-factory.ts:34`.

### 3.2 Handoff data integrity

- `handoff-protocol.ts`:
  - Remove `cost: 0` from the session UPDATE (line 57).
  - Replace both references to `tasks.notes` (lines 103, 117) with `tasks.auditTrail`. Audit-entry JSON shape already matches what `task-state-machine.ts:61-73` writes — reuse the same interface and unify the shape if it drifts.
- `session-provisioning.ts.revertTaskToAccepted`:
  - Replace `task.notes` read (line 89) and `notes: ...` write (line 100) with `task.auditTrail` / `auditTrail: ...`.
- Audit-entry type: the existing `AuditEntry` defined inside `task-state-machine.ts` is the canonical shape (`{ from, to, timestamp, reason? }`). Handoff's current entry (`{ type, fromAgent, toAgent, toHuman, reason, timestamp }`) is richer — we add a union `TaskAuditEntry = StateTransitionAuditEntry | HandoffAuditEntry` in a shared module (`packages/server/src/services/task-audit.ts`) and have both files import it. Keeps the discriminator (`type` vs implicit) explicit.
- Update existing handoff tests (`handoff-protocol.test.ts` lines 361, 389, 406, 437) to read from `auditTrail` instead of `notes`. The pre-handoff `notes` value must now survive the handoff unchanged.

### 3.3 Bet state atomicity

- `transitionBet`: wrap the sequence "compute updates" → "UPDATE teams.activeBets" → "UPDATE bets" in `db.transaction((tx) => { ... })`, using `tx` for both writes. Event emission stays OUTSIDE the transaction (emit only after commit — that is the at-least-once-after-durability contract).
- Capacity check stays inside the transaction (re-read `team` via `tx` and re-check `activeBets < capacity`) so the check-then-act race on two concurrent commits serializes correctly.
- Rollback path: if the bet UPDATE fails, the transaction throws, `activeBets` reverts, and the outer function re-throws. No event emission.
- `updateBetField` does not touch `teams.activeBets` → out of scope here.

### 3.4 EventBus resilience

- `EventBus.emit`:
  - Introduce a module-scoped logger `createLogger({ pkg: "shared.event-bus" })`.
  - Wrap each handler invocation (type-specific loop AND wildcard loop) in `try { handler(event); } catch (err) { log.error("event handler threw", { type, error }); }`.
  - Preserves synchronous ordering: each handler still completes (or throws-and-is-caught) before the next runs.
- Document via `@lore` comment: throwing handlers are a programming error; we isolate them so one bad subscriber cannot break another subscriber's durability contract.

## 4. Acceptance Criteria — Verification Matrix

| # | AC | Verification method | Test file |
|---|----|---------------------|-----------|
| S1 | `bun dev` → `GET /api/status/health` returns 200 | Integration test: build app via `createBunServer(0)` (random port), fetch the endpoint, assert 200 + JSON. | NEW `packages/server/src/__tests__/server-factory.integration.test.ts` |
| S2 | All domain routes return non-404 | Integration test: same harness, hit each of `/api/bets`, `/api/tasks`, `/api/knowledge`, `/api/conversations`, `/api/agents`, `/api/sessions`, `/api/rail`, `/api/status/*`, `/api/notifications`, `/api/observability`, `/api/git-export`, `/api/routines`. Assert status ≠ 404 (200, 401, or 400 all acceptable — proof the route is mounted). | Same |
| S3 | `GET /api/bets` returns 200 with valid JSON | Same harness with a valid `HYPERIDLE_API_KEY` header and seeded DB. Assert 200 + `Array.isArray(body)`. | Same |
| S4 | `POST /api/conversations/items` returns 201 | Same harness + seeded product. Assert 201 + body contains `id`. | Same |
| S5 | WebSocket upgrade at `/ws?token=<key>` succeeds | Integration test: start `createBunServer(0)`, open `WebSocket(\`ws://localhost:${port}/api/ws?token=${key}\`)`, await `open` event, assert `readyState === 1`, close. | Same (or extend existing `websocket.test.ts`) |
| H1 | Handoff writes to `tasks.auditTrail`, not `tasks.notes` | Unit: insert task with `notes: "agent prose"`, run `handoff(...)`, re-read task, assert `task.notes === "agent prose"` AND `JSON.parse(task.auditTrail)` contains the handoff entry. | `handoff-protocol.test.ts` (modify existing + add new) |
| H2 | `revertTaskToAccepted` writes to `tasks.auditTrail` | Unit: call `provisionSession` with a harness adapter that throws inside `workspace.spawn`, assert `task.notes` unchanged and `task.auditTrail` contains `{ to: "accepted", reason: "..." }`. | `session-provisioning.test.ts` (existing has revert coverage — switch assertion) |
| H3 | Handoff does NOT zero `sessions.cost` | Unit: seed session with `cost: 150`, run handoff, re-read session, assert `cost === 150` and `state === "done"` and `endedAt` set. | `handoff-protocol.test.ts` |
| B1 | `transitionBet` wraps in `db.transaction()` | Unit: spy on `db.transaction` (Vitest `vi.spyOn(db, "transaction")`), call `transitionBet(... , "committed")`, assert spy called once. | `bet-state-machine.test.ts` |
| B2 | Two sequential commits increment `activeBets` to 2 | Unit: seed team `activeBets: 0, capacity: 3`, two bets in `shaped`. Call `transitionBet(..., "committed")` on each. Assert `team.activeBets === 2`. | `bet-state-machine.test.ts` |
| B3 | Failed bet UPDATE rolls back `activeBets` | Unit: monkey-patch or pass a `db` where the bets UPDATE throws (use a bet-id that violates a CHECK, or spy/mock `.update(bets)` to throw inside the transaction). Assert `team.activeBets === 0` after. | `bet-state-machine.test.ts` |
| E1 | Throwing handler does not block subsequent handlers | Unit: `bus.on("task_state_changed", () => { throw new Error("boom"); }); bus.on("task_state_changed", spy);` then `bus.emit(...)`. Assert `spy` was called once. | `event-bus.test.ts` |
| E2 | Error is logged | Unit: inject/spy logger (via `vi.spyOn(console, "error")` if logger falls back, or module-level logger mock). Assert error message captured. | `event-bus.test.ts` |
| E3 | Wildcard path also isolates errors | Unit: `bus.on("*", () => { throw; }); bus.on("*", spy); bus.emit(...)`. Assert `spy` ran. | `event-bus.test.ts` |

Validation gate: `bun run check` + `bun run lint` + `bun run test` all green before ship.

## 5. Ordered Task List

Each task is its own atomic commit. Tests land red before code in the /implement loop (TDD red → green).

1. **Audit-entry type unification**
   - New file `packages/server/src/services/task-audit.ts` exporting `TaskAuditEntry` union + append helper.
   - Touches: none else yet.
   - Proves: type exported, `bun run check` green.

2. **EventBus resilience (tests + code)** — independent, do first to unblock any handler-throwing race fixes downstream.
   - Modify `packages/shared/src/__tests__/event-bus.test.ts`: add E1, E2, E3.
   - Modify `packages/shared/src/event-bus.ts`: try/catch around each handler, inject logger.
   - Proves: E1-E3 green; existing EventBus tests still green.

3. **Bet state atomicity (tests + code)**
   - Modify `bet-state-machine.test.ts`: add B1, B2, B3.
   - Modify `services/bet-state-machine.ts`: wrap in `db.transaction`, move capacity re-check inside.
   - Proves: B1-B3 green; existing bet tests still green.

4. **Handoff data integrity (tests + code)**
   - Modify `handoff-protocol.test.ts`: add H1, H3; flip existing assertions from `notes` to `auditTrail`.
   - Modify `services/handoff-protocol.ts`: drop `cost: 0`; write to `auditTrail`; reuse `task-audit.ts` helper.
   - Modify `session-provisioning.test.ts`: add/flip H2 assertions.
   - Modify `services/session-provisioning.ts`: `revertTaskToAccepted` writes to `auditTrail`.
   - Proves: H1-H3 green; all existing handoff/session-provisioning tests still green.

5. **Server entrypoint convergence — seam in createApp**
   - Modify `app.ts`: add optional `registerWebSocket?: (api: Hono) => void` to `AppOptions`; call it at the right ordering point.
   - No behavior change yet. Proves: `bun run check` green; all existing tests still green.

6. **Server entrypoint convergence — server-factory rewrite (tests + code)**
   - Add NEW `packages/server/src/__tests__/server-factory.integration.test.ts`: S1–S5.
   - Rewrite `server-factory.ts`: remove `createFullApp`; new `createBunServer` opens db, builds eventBus, calls `createApp({ db, eventBus, registerWebSocket: (api) => registerWsRoute(api, eventBus) })`, returns `Bun.serve(...)`.
   - Thin `index.ts` stays as-is (or slimmed further if needed).
   - Proves: S1-S5 green; no regressions anywhere.

7. **Verify & ship**
   - `bun run check`, `bun run lint`, `bun run test`.
   - Manually smoke `bun dev` → `curl /api/bets` returns 200 (or 401 with key), not 404.
   - Commit per task above, push, open PR.

Dependencies: (1) precedes (4). (5) precedes (6). (2), (3) are independent and can run in any order after (1). Overall chain: 1 → (2 ∥ 3) → 4 → 5 → 6 → 7.

## 6. Risks & Ambiguities

- **R1 — Tests currently asserting on `tasks.notes` for audit content.** Four call sites in `handoff-protocol.test.ts` (lines 361, 389, 406, 437). These tests pass today because the PRODUCTION code is wrong — they encode the bug. We must flip them, and the /check-definition-of-done audit must confirm that `notes` no longer carries audit JSON in any code path. No `grep` for `notes: JSON.stringify(` should remain under `services/`.

- **R2 — WebSocket wiring order.** `createBunWebSocket()` in `ws.ts` is module-scoped: `wsHandler` is a singleton. Calling `registerWsRoute(api, eventBus)` from inside `createApp`'s options callback is safe in production (one app per process) but could bite in-process test harnesses that create multiple apps sharing the same process — every app would register handlers against the same `wsHandler`. Mitigation: `registerWsRoute` is only invoked when `registerWebSocket` is provided by the caller. Integration tests that don't need WS simply omit the option. Flag to implementer: verify `websocket.test.ts` still isolates across runs.

- **R3 — `db.transaction` and better-sqlite3 async semantics.** Better-sqlite3 transactions are synchronous; Drizzle's `db.transaction(cb)` requires `cb` to be synchronous on the sqlite driver. `transitionBet` is currently `async` but performs no await inside the section we're wrapping. The transaction callback stays synchronous. Existing precedent: `practice-meeting.ts:284`, `attention-service.ts:164` — both use sync callbacks. Flag for /implement: do NOT make the tx callback `async`.

- **R4 — PostgreSQL driver parity.** `packages/db` supports both SQLite and PostgreSQL (per track spec). `db.transaction` exists on both Drizzle drivers but the PG driver's callback is async. The codebase currently only instantiates SQLite in runtime paths; PG is schema-only today. `transitionBet` using a sync callback is fine for SQLite and we accept the PG-port cost as a separate concern when PG runtime lands.

- **R5 — Scope creep.** I2 (security) adds `crypto.timingSafeEqual` and WS short-lived tokens. We intentionally do NOT touch WS auth here — the API-key-in-query path stays as-is for I1 and gets hardened in I2.

### CONFUSION: revertTaskToAccepted audit-entry shape divergence

I'm uncertain about: `revertTaskToAccepted` currently writes a `{ from, to, timestamp, reason }` entry shape, while handoff writes `{ type: "handoff", fromAgent, toAgent, toHuman, reason, timestamp }`. Both will now land in `tasks.auditTrail`. Do we unify them or keep them discriminated?

Options:
A) Keep them as a discriminated union (`TaskAuditEntry = StateTransitionEntry | HandoffEntry`) with an explicit `kind` field added to both. Consequences: downstream readers must discriminate; richer audit; requires adding `kind` to `task-state-machine.ts` writes too.
B) Unify on the richer handoff shape, coerce transitions into it. Consequences: one read path; simpler; loses the "why this field" specificity for state transitions.

Proceeding with (A) because the audit stream already carries two semantically distinct event kinds and collapsing them throws away information that future UI (Conversations → Coach) will want to render differently. Flag for review during /implement design phase.

## 7. Files Touched

- `/workspace/packages/server/src/index.ts` (slim; possibly unchanged)
- `/workspace/packages/server/src/server-factory.ts` (rewrite)
- `/workspace/packages/server/src/app.ts` (add `registerWebSocket` hook in `AppOptions`)
- `/workspace/packages/server/src/services/handoff-protocol.ts` (audit + cost fix)
- `/workspace/packages/server/src/services/session-provisioning.ts` (audit fix in `revertTaskToAccepted`)
- `/workspace/packages/server/src/services/bet-state-machine.ts` (transaction wrap)
- `/workspace/packages/server/src/services/task-audit.ts` (NEW — shared audit types)
- `/workspace/packages/shared/src/event-bus.ts` (try/catch per handler)
- `/workspace/packages/server/src/__tests__/handoff-protocol.test.ts` (flip + add)
- `/workspace/packages/server/src/__tests__/session-provisioning.test.ts` (flip + add)
- `/workspace/packages/server/src/__tests__/bet-state-machine.test.ts` (add)
- `/workspace/packages/server/src/__tests__/server-factory.integration.test.ts` (NEW)
- `/workspace/packages/shared/src/__tests__/event-bus.test.ts` (add)

No UI changes. No schema changes (auditTrail column already exists on both SQLite and PG schemas).

## 8. Adversary Follow-ups (decisions locked in)

- **C1 — Route name mismatch.** The AC says `GET /api/status/health`. The current codebase has only `/api/health` (mounted pre-auth). **Decision:** add a trivial `GET /health` subroute to `routes/status.ts` that returns `{ status: "ok" }` (authenticated). S1 tests `/api/status/health` and S2 continues to include `/api/health` in the domain-route sweep. Both endpoints coexist; `/api/health` stays unauthenticated for liveness, `/api/status/health` is the authenticated status probe.
- **C2 — `log_task` writes to `notes`.** Scope addition: `skill-tools/log-task.ts` writes agent-authored prose, NOT audit entries (the tool description's word "audit" is imprecise). **Decision:** `log_task` continues to write to `tasks.notes` but the entry shape changes from `{type, agentId, sessionId, text, timestamp}` JSON to plain text prose appended with a separator. If the existing test `log-task.test.ts:84` asserts JSON shape, it is relaxed to assert substring match. Handoff's H1 test proves `notes` is never written by handoff; a new assertion in `log-task.test.ts` proves `log_task` never writes to `auditTrail`.
- **C3 — `log_task` cross-cutting guard.** Add a single grep-style unit test (or code review checklist item) at the end: no source under `packages/server/src/services/**` or `skill-tools/**` writes to `tasks.notes` with a JSON-serialised object. Document as `@lore`.
- **W1 — WebSocket test duplication.** Keep the existing `websocket.test.ts` (production-path spawn test) as-is. The new `server-factory.integration.test.ts` uses in-process `createBunServer(0)` and its own dedicated WS subtest; both test files coexist. S5 is proved by the new in-process test; the spawn test is the production-smoke guard.
- **W2 — In-process WS test isolation.** `registerWsRoute` must return a disposer `() => void` that unregisters its EventBus listeners. `server-factory.integration.test.ts` calls the disposer in `afterAll`. This is a scope increase but matches the existing `disposeApp` pattern in `app.ts`.
- **W5 — Logger injection seam.** Use `vi.mock("@hyperidle/shared", ...)` or better, mock `createLogger` to capture calls. Concretely: `EventBus` imports `createLogger` at module scope; tests use `vi.mock` to replace the `createLogger` export with a factory returning a spy object. Decision locked.
- **W6 — Audit append helper.** Dropped. `task-audit.ts` exports the `TaskAuditEntry` union type only; appending stays inline at each call site (`[...existing, newEntry]`).
- **W7 — Post-tx event ordering.** `transitionBet` emits `bet_state_changed` first, then conditionally `bet_shipped`. Both AFTER transaction commits, both outside the tx callback. Test coverage: B1/B2 verify events fire after commit (order-check via captured emitter calls).
- **W8 — DB source in `createBunServer`.** Read `DATABASE_URL` env var with default `./hyperidle.db`. Use `createDb` (or whatever `packages/db` exports) to open the handle. Document env var in `.env.example` (I6 work package covers full env documentation — this story adds the one var).

These decisions close the adversary blockers and unlock test writing.
