# AF7 — Architecture Plan: Task Auto-Dispatch & Session Execution

Closes Z8-004, Z8-039, Z8-047, Z8-048, Z8-050, Z8-092, Z8-093, Z8-094, Z8-095,
dispatch-half of Z8-010.

This plan wires machinery that already exists. No new primitive, no new layer,
no new framework. Eight defects, each with a grounded root cause and a minimal
fix. Every file:line below was read during interrogation.

---

## 0. Current-state ground truth (traced, not assumed)

**The production boot path** (`packages/server/src/server-factory.ts`
`createServer`):
- L148-151 constructs `adapterPool` (`createLocalAdapterPool`), `workspaceAdapter`
  (`LocalWorkspaceAdapter`), `workspaceBasePath`.
- L167-181 calls `bootstrapFabric` via the `strategyBootstrap` wrapper but passes
  **only** `readAlertPreferences`. It does **NOT** pass `dispatcherDeps`.
- `setProvisionSessionFn(provisionSession)` is **never called** in production —
  only in `AD2-task-dispatcher.integration.test.ts:65` and other tests.

**Consequence chain (Z8-004 / dispatch-half of Z8-010):**
`bootstrapFabric` (`fabric/src/bootstrap.ts` L77) registers the dispatcher only
`if (ctx.dispatcherDeps)`. Deps are never supplied ⇒ dispatcher never registers
⇒ no `task_state_changed`/`session_ended` subscriptions ⇒ queue stays empty ⇒
`GET /api/dispatch-queue` (`dispatch-queue-routes.ts` → `getDispatchQueueSnapshot`)
always returns `{ entries: [], draining: false }`. Even if it *were* registered,
`drainQueue` → `resolveProvisionSession` (`task-dispatcher.ts` L155-165) throws
because `getProvisionSessionFn()` is null.

**`provisionSession`** (`session-provisioning.ts` L231) runs all 11 phases
inline, including the full `for await (harness.streamEvents)` loop (L583) — it
returns only after the agent finishes. Both call sites await it to completion:
the dispatcher's `drainQueue` (L282) and `POST /api/sessions` (`sessions-routes.ts`
L189).

**`BuiltinHarnessAdapter`** (`builtin-harness-adapter.ts`):
- `setSessionToolRegistry(sessionId, registry)` (L162) pre-registers a
  `BuiltinSession` under the *provisioning* sessionId.
- `startSession` (L194) mints a **new** internal id `builtin-${nextId++}`
  (L199) and *reconciles* the pre-registered session by scanning the map for
  "the first session with `loopPromise===null && registry!==null && !done`"
  (L210-216), then re-keys it. **This is the Z8-092/093 isolation bug**: under
  two concurrent provisions the scan can bind session B's registry to session A.

**`PATCH /api/sessions/:id`** (`sessions-routes.ts` L283): writes `state` +
`endedAt` and emits `session_ended` (L318-329). It does **not** consult or stop
the runtime. If a session is still executing in `provisionSession`, this creates
a DB row that says "done/crashed" while the harness loop runs on — the Z8-094/095
zombie path.

**Handoff** (`handoff-protocol.ts` L110-113): sets session `state:"done"` inside
the tx, intentionally does NOT emit `session_ended`. But the running
`provisionSession` loop for that session is unaware — the prior agent's harness
keeps streaming and its registry keeps executing tools. **Handoff does not stop
tool access** (AC5 gap).

**Workspace lifecycle:** `endSession` deletes the workspace (`session-lifecycle.ts`
L271-275); `crashSession` **preserves** it (L337-338, by design for post-mortem).
Nothing ever reclaims preserved/abandoned workspaces (AC6 gap).

**Lifecycle retry** (`lifecycle-propagation.ts` `retryFailedPropagations` L605):
- On a successful retry, `propagateSessionToTask`/`propagateTaskToBet` insert a
  **new** `applied` row (`logPropagation`) but the **original** `pending_retry`
  row is left at `pending_retry` (only `attempts` was bumped L650-653). Next
  heartbeat re-selects it and retries again ⇒ **double-log + repeated work**.
- The `attempts >= MAX_RETRY_ATTEMPTS` branch (L612) marks the row `failed`
  purely on attempt count, even if the underlying transition already succeeded
  on a prior pass ⇒ **succeeded retry marked failed** + spurious notification.

**Z8-050 incoherent adapters:** `createLocalAdapterPool` registers only
`claude-code`, `builtin`, and CLI adapters. `RemoteHarnessAdapter` is wired
dynamically by `worker-ws.ts:117` (coherent — keep). `DockerWorkspaceAdapter`
and `IsolatedHarnessAdapter` are instantiated **only in tests** — never reachable
in production. Silent dead paths.

---

## 1. Dispatcher boot-wiring (AC1; Z8-004, Z8-010-dispatch)

### Design
Two production edits in `server-factory.ts`, both inside `createServer` after the
adapter instances exist (after L151) and before `createApp`:

1. **Register provisionSession into the runtime registry.** Import
   `setProvisionSessionFn` from `@hyperidle/fabric` and `provisionSession` from
   `./services/session-provisioning.js`; call once:
   ```ts
   setProvisionSessionFn(provisionSession);
   ```
   This is the *only* legal way to cross the fabric→server boundary (the registry
   leaf exists precisely for this — `provision-registry.ts` header). Do NOT add a
   static import of `provisionSession` into fabric.

2. **Pass `dispatcherDeps` through the `strategyBootstrap` wrapper.** Extend the
   wrapper at L167-181 to add:
   ```ts
   dispatcherDeps: {
     adapterPool,
     workspace: workspaceAdapter,
     workspaceBasePath,
     resolveModel: makeResolveModel(db, credentialResolver), // see below
     mcpBridgeRegistry,
     mcpBaseUrl,
   },
   ```
   `bootstrapFabric` already forwards this to `registerTaskDispatcher`
   (`bootstrap.ts` L77-85). The `TaskDispatcherDeps` shape (`task-dispatcher.ts`
   L74-101) already declares all these fields; no fabric type change needed.

3. **`resolveModel` for the dispatcher.** The dispatcher calls
   `deps.resolveModel("workhorse")` (`task-dispatcher.ts` L269). Today the HTTP
   path resolves models in `sessions-routes.ts` via `resolveModelTier`
   (L144-162). Extract a small factory in server-factory:
   ```ts
   function makeResolveModel(db, credentialResolver) {
     return async (tier: string) => {
       const cfg = await readServerConfig(db);
       return resolveModelTier(tier as ModelTier, cfg.modelGateway, credentialResolver);
     };
   }
   ```
   When `credentialResolver`/gateway resolution fails, the dispatcher already
   treats it as unrecoverable-per-task (`task-dispatcher.ts` L270-279) — correct.

### Why not move the dispatcher registration into server
Rejected. The dispatcher lives in fabric by the kernel/strategy boundary
(`task-dispatcher.ts` header). Moving it would break the dependency graph
contract enforced by `O3`. Cost: re-architecting bootstrap = high coupling, no
benefit. The injection seam already exists; we just feed it.

### Files touched
- `packages/server/src/server-factory.ts` (the two edits above + `makeResolveModel`).

### Test strategy (AC1)
- **Integration** `server-factory-dispatch.integration.test.ts` (new): boot the
  real `createServer(0)` against a PGlite test DB seeded with one team, one
  agent, one bet, one accepted task with `ownerAgentId` set, using a **stubbed
  adapter pool** that records `startSession` and completes immediately (mirror
  `CapturingHarnessAdapter` from the AD2 test). Assert: within a bounded poll,
  `GET /api/dispatch-queue` reflects the task being enqueued/drained AND a
  `sessions` row appears for the task. This proves the wire end-to-end — the AC's
  "visible in the dispatch surface."
  - ⚠️ `createServer` constructs a real `LocalAdapterPool`. To inject a stub,
    add an **optional** `deps` param to `createServer(port, deps?)` (test-only
    override of `adapterPool`/`workspaceAdapter`) — same DI pattern already used
    by `createApp`'s `SessionRouteDeps`. Production call sites pass nothing.

---

## 2. Non-blocking session provision (AC2; Z8-047)

### Problem
`POST /api/sessions` awaits `provisionSession` to full completion
(`sessions-routes.ts` L189-210) and returns the *completed* row with 200. The
caller is blocked for the entire agent run (minutes). The dispatcher's
`drainQueue` also awaits it (`task-dispatcher.ts` L282) — but the dispatcher runs
in a fire-and-forget `scheduleDrain` (L422-428) so it is already off the request
path. The fix is for the **HTTP POST** path only; the dispatcher's await is fine
(it has no caller waiting).

### Design — split provision into "admit" and "run"
Refactor `provisionSession` callers to a non-blocking hand-off without changing
the orchestrator's internal phase logic:

- Introduce `startSessionProvision(deps, params): Promise<{ sessionId, taskId }>`
  in `session-provisioning.ts` that performs **Phases 1-7 synchronously** (load
  agent, cost pre-flight, adapter select + concurrency check, task transition,
  workspace spawn, **insert session row**, materialize, start watcher) and then
  **detaches** Phases 8-11 (harness start + event loop + teardown) via a
  fire-and-forget tail with a top-level `.catch` that funnels to `crashSession`.
  It resolves as soon as the session row is committed and `session_started` is
  emitted.
  - Rationale: the synchronous prefix is exactly the part that produces the
    HTTP-observable result (a session row + admission errors `CostCapExceeded`
    422 / `ConcurrencyLimit` 429 / `MissingCredential` 500). The detached tail
    is the long-running work.
  - **Admission-error mapping — all admission failures MUST throw before the P5
    row insert (the detach boundary).** Verified phase order: cost pre-flight is
    P2 (`session-provisioning.ts` L260, before insert), concurrency/adapter-select
    is P3 (before insert) — both already throw pre-row. The route's credential
    pre-flight already resolves `resolvedModel` and maps `MissingCredentialError`
    → 500 **before** calling provision (`sessions-routes.ts` L139-178, returns 500
    at L168-174). **The gap (WARNING):** that pre-flight runs only
    `if (deps.credentialResolver)` (L141). In **local mode (no credentialResolver)**
    `resolvedModel` stays `undefined`, and the builtin adapter throws
    `"resolvedModel is required"` at **P9 `harness.startSession`**
    (`builtin-harness-adapter.ts` L195) — which, under the new detached tail,
    lands in `crashSession` via `.catch`, NOT the POST's 500 mapping. **Fix (option
    (a), chosen):** add a **synchronous `resolvedModel` presence guard in the admit
    prefix, before the P5 row insert** — when the selected adapter requires a
    resolved model (builtin) and `resolvedModel` is absent, throw a
    `MissingCredentialError`-class error so the route maps it to 500 **pre-detach,
    pre-insert**. This keeps the honest contract (no doomed row inserted) and
    preserves the existing `R1-wire-agent-execution` assertion: 500 +
    `code=MISSING_CREDENTIAL` + **no session row** + harness never started.
  - With cost (P2), concurrency (P3), and `resolvedModel` presence (new, pre-P5)
    all validated synchronously before detach, **every** admission failure still
    maps to its HTTP status (422/429/500) on the POST path. The detached tail's
    `.catch`→`crashSession` then only handles genuine *runtime* failures (harness
    errors mid-stream), which legitimately become `state=crashed`, not HTTP errors.
  - `provisionSession` (the existing fully-awaited function) is **retained** for
    the dispatcher and for tests that assert on the final outcome — it becomes a
    thin wrapper: `await startSessionProvision(...)` then `await runResult`.
    Internally factor the body into `admitSession()` (1-7) and `runSession()`
    (8-11) so both entry points share one implementation. No duplicated phase
    logic.

- `POST /api/sessions` calls `startSessionProvision`, returns **202 Accepted**
  with the freshly-inserted session row (`{ id, state: "active", ... }`).
  - ⚠️ Status-code change 200→202 is the honest contract: the work is accepted,
    not done. Verify no web client asserts strictly on 200 for this route before
    shipping (grep `POST.*sessions` in `packages/web`). If a client depends on
    the completed row, keep 202 and have the client poll `GET /sessions/:id`
    (it already lists/filters — `sessions-routes.ts` L94).

### Concurrency-leak guard
The detached tail must `adapterPool.release(adapterId)` and run teardown on every
exit path — `provisionSession` already does this in its finally-style branches
(L661-683, L701-732). Moving those into `runSession` keeps the guarantee. The
adapter slot is reserved during admission (`select()` increments load at L284)
and released by the tail, so concurrency accounting stays correct across the
async boundary.

### Files touched
- `packages/server/src/services/session-provisioning.ts` (split into
  `admitSession`/`runSession`; add `startSessionProvision`; keep `provisionSession`
  as wrapper; **add synchronous `resolvedModel` presence guard in `admitSession`
  before the P5 insert** for adapters that require it — throws
  `MissingCredentialError`-class pre-detach).
- `packages/server/src/routes/sessions-routes.ts` (POST returns 202 from
  `startSessionProvision`; existing `MissingCredentialError`→500 mapping at
  L167-174 now also catches the admit-prefix `resolvedModel` guard throw).

### Test strategy (AC2)
- **Integration**: scripted slow harness whose `streamEvents` blocks on a
  deferred promise. Assert `POST /api/sessions` resolves (202 + session row)
  **before** the harness deferred is settled. Then settle it and assert the
  session reaches `done`. Proves the caller is not blocked for the full run.
- **Integration (admission errors stay on the POST path, not the detached tail)**:
  - cost-cap → 422 + **no session row** (P2 throws pre-insert).
  - concurrency limit → 429 + **no session row** (P3 throws pre-insert).
  - missing credential **in local mode** (no `credentialResolver`, builtin adapter,
    `resolvedModel` absent) → **500 + `code=MISSING_CREDENTIAL` + no session row +
    harness never started**. This is the WARNING-2 path: it must be caught by the
    new synchronous `resolvedModel` presence guard in admit, NOT surface as a later
    `state=crashed`. (Mirrors the existing `R1-wire-agent-execution` AC6/AC7 test —
    see protected-tests list §13.)

---

## 3. Per-session harness/registry isolation (AC3; Z8-092, Z8-093)

### Root cause
`BuiltinHarnessAdapter.startSession` decouples the caller's sessionId from the
internal `builtin-N` id and *guesses* which pre-registered registry to bind via a
map scan (`builtin-harness-adapter.ts` L199-216). Under two concurrent
`provisionSession` calls interleaving `setSessionToolRegistry` → `startSession`,
the scan can bind the wrong registry. Each session also gets a different
externally-visible id than the one provisioning tracks.

### Design — make the sessionId the contract
1. **`startSession` accepts the sessionId from config; stop minting a new one.**
   Add `sessionId: string` to `SessionConfig` (already plumbed: provisioning has
   `sessionId` at Phase 8 / `toolContext.sessionId`). The builtin adapter keys
   its session map on the **provided** sessionId, eliminating the re-key scan.
   - Other adapters (`ClaudeAgentSdkAdapter`, `CliHarnessAdapter`,
     `RemoteHarnessAdapter`) currently mint their own handle ids; making
     `config.sessionId` available is additive — they may ignore it (their handles
     stay internal). Only the builtin adapter's correctness depends on it.
2. **Bind registry by exact sessionId, no scan.** `setSessionToolRegistry(id, reg)`
   stores under `id`; `startSession(config)` looks up `config.sessionId` directly.
   Delete the `preRegistered` scan loop (L210-235).
3. **Provisioning passes the row's sessionId into config.** In
   `session-provisioning.ts` Phase 9 (`harness.startSession({...})` L544), add
   `sessionId` to the config object. The `setSessionToolRegistry(sessionId,
   registry)` call (L422) already uses the same id — now they match exactly.

### Why this is the minimal correct fix
The whole "reconcile pre-registered session" dance exists *only* because the
adapter minted its own id. Removing the id-minting removes the ambiguity. No new
locking, no per-session mutex needed — the `Map<sessionId, BuiltinSession>` is
already per-session; the bug was the lookup key, not the storage.

### Files touched
- `packages/shared/src/harness/harness-adapter.ts` (add `sessionId` to
  `SessionConfig`).
- `packages/server/src/harness/builtin-harness-adapter.ts` (key on
  `config.sessionId`; delete reconcile scan).
- `packages/server/src/services/session-provisioning.ts` (pass `sessionId` in
  Phase 9 config).
- Mock + other adapters: accept the new optional field (no behavior change).

### Test strategy (AC3)
- **Integration**: two concurrent builtin sessions, each registry stubbed to
  return a session-identifying sentinel from a tool call. Drive both through
  `provisionSession` concurrently; assert each session's `tool_call_recorded`
  events carry **only its own** sentinel — neither observes the other's context.
  This directly encodes the AC validation scenario.

---

## 4. DB/runtime state-sync contract — no zombie path (AC4; Z8-094, Z8-095)

### Root cause
`PATCH /api/sessions/:id` flips DB state + emits `session_ended` with zero
knowledge of the runtime (`sessions-routes.ts` L283-333). The runtime
(`runSession` loop) is the *real* source of truth for an active session's
lifecycle. Two writers, no coordination ⇒ zombie.

### Design — the runtime owns active-session state; PATCH is constrained
1. **Define the contract explicitly (lore comment + enforcement):** *the
   provisioning runtime is the sole writer of the terminal transition for a
   session it is actively running.* `endSession`/`crashSession`
   (`session-lifecycle.ts`) are the only paths that write `state in {done,
   crashed}` + emit `session_ended` for a runtime-owned session.
2. **PATCH must request termination, not assert it.** Change `PATCH
   /api/sessions/:id` so that when `body.state` is present and the session is
   still `active`:
   - It calls an **abort hook** keyed on sessionId (see §5 `SessionRunRegistry`)
     to signal the running harness to stop. The actual DB transition + event are
     then emitted by the runtime teardown (`crashSession`/`endSession`), exactly
     once.
   - If no runtime entry exists for that sessionId (e.g. session already ended,
     or a legacy bare-insert session with no running loop), PATCH falls back to
     the current direct write — but **guards on current state**: only transition
     `active → {done,crashed}`; reject (409) a PATCH that would move an already-
     terminal session. This closes the desync where PATCH double-emits
     `session_ended` for a session the runtime already ended.
   - Effectiveness-only PATCH (no `state`) is unchanged (`sessions-routes.ts`
     L296-312) — it never ends a session.
3. **Idempotent terminal write — rowcount-gated emit (hard invariant).**
   `endSession`/`crashSession` SET with a `where(state='active')` guard (CAS) so a
   duplicate teardown is a no-op rather than a second `session_ended`. Currently
   the UPDATE is unconditional (`session-lifecycle.ts` L231-237 endSession,
   L302-308 crashSession). Add the
   `and(eq(sessions.id, …), eq(sessions.state, "active"))` predicate.
   - **HARD INVARIANT (the load-bearing rule the builder must not weaken):**
     `eventBus.emit({type:"session_ended", …})` fires **iff the CAS UPDATE
     returned rowCount > 0** — gate the emit on the **rowcount**, not merely on
     "the UPDATE ran." A builder who applies the `where(state='active')` predicate
     but leaves the `eventBus.emit` (L240-241 / L311-312) unconditional reopens
     the exact bug this fix closes: a handoff-ended session (already `done`) whose
     detached `runSession` tail later calls `endSession` would emit a **spurious
     `session_ended`** that handoff is forbidden to emit (`handoff-protocol.ts`
     L100-103; concept.md §"A Handoff is not a session_ended").
   - ⚠️ UNVERIFIED Drizzle rowcount API: use `db.update(...).returning({ id })`
     and gate on the returned array length (`rows.length > 0`) — `.returning()`
     works on both SQLite and PostgreSQL drizzle drivers. Builder must confirm the
     project's driver returns affected rows from `.returning()` under a CAS
     `where`; if the dialect/driver does not, fall back to a `SELECT … WHERE
     id=… AND state='active'` guard inside the same tx before the UPDATE+emit.

### Files touched
- `packages/server/src/routes/sessions-routes.ts` (PATCH: abort-or-guarded-write).
- `packages/server/src/services/session-lifecycle.ts` (CAS terminal write; emit
  only on real transition).
- New `packages/server/src/services/session-run-registry.ts` (see §5).

### Test strategy (AC4)
- **Integration crash scenario** (AC validation): scripted harness emits an
  `error` event mid-run. Assert DB row ends `state=crashed, outcome=crashed`,
  `session_ended(outcome=crashed)` emitted **exactly once**, and a PATCH arriving
  after teardown returns 409 / is a no-op (no second event).
- **Integration**: PATCH `state=crashed` on an actively-running session triggers
  abort → runtime teardown sets crashed once; no double `session_ended`.
- **Integration (rowcount-gated emit invariant)**: invoke teardown
  (`endSession`/`crashSession`) on a session row that is **already terminal**
  (`done`/`crashed`) — assert the CAS UPDATE affects zero rows and **zero**
  additional `session_ended` events are emitted. This directly encodes the §4.3
  hard invariant and is the same code path a handoff-ended session hits (see the
  zero-`session_ended`-after-handoff assertion in §5 AC5 test).

---

## 5. Handoff stops prior session's tool access (AC5; Z8-048)

### Root cause
Handoff ends the session row but the `runSession` loop + the bound tool registry
keep running. The HarnessAdapter interface has no abort
(`harness-adapter.ts` L81-86) — only `stopSession`, which the orchestrator calls
*itself* at loop end, not reachable from handoff.

### Critical: where builtin tool execution actually stops (revocation truth)
The builtin adapter does **not** invoke tools through the provisioning event loop.
`session-provisioning.ts` L639-647 explicitly **skips** `registry.invoke` for
builtin (`if (interceptToolCalls && selectedAdapter.meta.type !== "builtin")` —
verified L645). Builtin executes tools **internally** inside its own `runLoop`
(`builtin-harness-adapter.ts` `runLoop` L362; tool execution in `executeToolCalls`
L589-603). Therefore **breaking the provisioning loop on `aborted` does NOT stop
builtin tool execution** — the builtin loop runs independently.

The **actual** stop for builtin is `adapter.stopSession(handle)` → it sets the
builtin session's internal `aborted` flag (`builtin-harness-adapter.ts` L323-326)
and then `await session.loopPromise` (L329-331), so the running `runLoop` halts.
`runLoop` checks `session.aborted` between iterations (L373, L381, L391, L399,
L404). The provisioning-loop break is **secondary** — it matters only for
non-builtin adapters that route tools through `registry.invoke`.

### Design — `SessionRunRegistry` + cooperative abort
1. **New `SessionRunRegistry`** (`packages/server/src/services/session-run-registry.ts`):
   a process-singleton `Map<sessionId, { abort: () => void; handle: SessionHandle;
   adapter: HarnessAdapter }>`. `runSession` registers itself at harness-start and
   deregisters at teardown.
2. **Abort = stop harness (primary) + break provisioning loop (secondary).**
   `abort(sessionId)`:
   - **Primary (the real revocation):** calls `adapter.stopSession(handle)`. For
     builtin this sets the internal `aborted` flag (`builtin-harness-adapter.ts`
     L323-326) and awaits `loopPromise` — halting `runLoop`/`executeToolCalls`,
     which is where builtin tools actually run. For subprocess (`Cli`,
     `Isolated`) and remote (`Remote`), `stopSession` terminates the child /
     sends the stop message. **A builder who adds only the loop-break flag and
     trusts "no further registry.invoke" ships an abort that does nothing for
     builtin — do not.**
   - **Secondary:** flips a per-session `aborted` flag the provisioning event loop
     checks each iteration (`session-provisioning.ts` L583 loop) — on abort it
     `break`s and enters teardown. This stops `registry.invoke` for **non-builtin**
     adapters only (builtin's `registry.invoke` is already skipped at L645).
   - The session-scoped tool registry is dropped on teardown. The combination
     (`stopSession` halts builtin's internal loop; loop-break halts non-builtin
     invokes) is the revocation: "the prior agent cannot keep acting."
3. **Abort latency contract (resolves §12.4 contradiction — design (a) chosen).**
   `stopSession` sets `aborted` but `runLoop` observes it only between iterations;
   a tool invocation already dispatched in the current turn would otherwise run to
   completion and increment `session.toolCallCount` (L603), so a "count frozen"
   assertion can flake. **Fix the contract, not just the test:** add an `aborted`
   check inside builtin `executeToolCalls` **before each invoke**
   (`builtin-harness-adapter.ts` L595 loop, guard at the top of each iteration
   before `session.toolCallCount++` at L603) — on `aborted`, stop dispatching new
   tool calls. The AC5 assertion is therefore **"no tool call *starts* after
   handoff completes"** (no `tool_call` event / no `toolCallCount` increment for a
   call not already in flight), NOT "the exact count is frozen at the pre-handoff
   value." This makes plan §5 and the §12 test strategy agree: in-flight invoke at
   the instant of abort may complete (+1), but **no new invoke starts**.
4. **Handoff calls abort post-commit.** `handoff-protocol.ts` sets the session
   `state:"done"` in-tx (L110-114) and releases dedup post-commit (L327). Add:
   after commit, `sessionRunRegistry.abort(sessionContext.sessionId)`. Handoff
   **never** emits `session_ended` (preserves the contract at L100-103) — abort
   drives `stopSession`+teardown, and teardown for a handoff-ended session must
   skip the `endSession` DB write (state already `done`) to avoid a second write.
   - **Hard invariant (gates the spurious-`session_ended` hazard, see §4.3):** the
     detached `runSession` tail funnels its exit through `endSession`/`crashSession`
     unconditionally, and on the **abort path the loop breaks with `crashed=false`**
     (`session-provisioning.ts` L648-651: only an `error` event sets `crashed`),
     so it calls `endSession` (normal-completion branch), not `crashSession`. With
     the §4.3 CAS guard, `endSession`'s `UPDATE … WHERE state='active'` returns
     rowCount=0 (row already `done`) AND the `session_ended` emit is gated on that
     rowcount ⇒ **no second write, no spurious `session_ended` after handoff.**
     This is safe ONLY if the emit is gated on rowcount, not merely the UPDATE
     issued — §4.3 makes that the invariant.
   - ⚠️ Coupling: `handoff-protocol.ts` (server) importing
     `session-run-registry.ts` (server) is in-layer — fine. The registry must be
     a **leaf singleton** (like `provision-registry.ts`) so both the route layer
     and the orchestrator share one instance without circular imports.

### Why a cooperative flag, not process kill
The builtin harness runs in-process (it is an LLM loop, not a subprocess), so a
cooperative `aborted` flag — checked between iterations AND before each tool
invoke — driven by `stopSession` is the correct stop. For subprocess adapters
(`Cli`, `Isolated`) and remote (`Remote`), `stopSession` already terminates the
child/sends the stop message. One abort path, adapter-appropriate teardown.

### Files touched
- New `packages/server/src/services/session-run-registry.ts`.
- `packages/server/src/services/session-provisioning.ts` (register/deregister;
  check `aborted` in provisioning loop — secondary, non-builtin only).
- `packages/server/src/harness/builtin-harness-adapter.ts` (check `session.aborted`
  inside `executeToolCalls` before each invoke — the before-each-invoke guard
  that makes AC5's "no new tool call starts" deterministic).
- `packages/server/src/services/handoff-protocol.ts` (abort post-commit).
- `packages/server/src/routes/sessions-routes.ts` (PATCH uses the registry — §4).

### Test strategy (AC5)
- **Integration** (AC validation): start a builtin session whose registry counts
  tool invocations; mid-run, call `handoff` to another agent. Assert (matching the
  §5.3 contract — design (a)):
  - After handoff completes, the prior session starts **no new tool call**: no
    `tool_call` event for a call not already in flight at abort time. Drive
    determinism by gating the harness on a deferred promise so handoff fires at a
    known point; assert the post-handoff `toolCallCount` does not grow beyond at
    most one in-flight call (NOT "count frozen at the pre-handoff value" — that
    assertion contradicts cooperative abort and can flake).
  - The session row is `done`, the harness reports stopped
    (`stopSession`→"stopped").
  - **Zero `session_ended` events** for that session after the handoff-driven
    abort+teardown (the §4.3 rowcount-gated invariant — handoff must never emit
    `session_ended`).
  - A subsequent `registry.invoke` from the prior session's context cannot fire:
    builtin's `runLoop` has halted (`stopSession` awaited `loopPromise`); for
    non-builtin the provisioning loop has exited.

---

## 6. Workspace lifecycle — reclaim crashed/abandoned (AC6; Z8-039)

### Root cause
`crashSession` preserves the workspace by design (`session-lifecycle.ts`
L337-338). Nothing ever reclaims it. Over time `HYPERIDLE_WORKSPACES_DIR`
accumulates dead trees.

### Design — a strategy-layer reclamation sweep
1. **A periodic sweep** registered in `bootstrapFabric` alongside the other
   scheduled jobs (mirror `startCostSentinel` pattern, `bootstrap.ts` L62):
   `startWorkspaceReaper(db, { workspaceBasePath, ttlMs })`.
   - ⚠️ `bootstrap.ts` is in fabric and must not import server fs paths. Pass
     `workspaceBasePath` through `dispatcherDeps`-style context (it is already in
     scope at the boot path). The reaper reads `sessions` rows: for each dir under
     `workspaceBasePath`, if its session is terminal (`state in {done, crashed}`)
     and `endedAt` older than TTL (default 24h, env
     `HYPERIDLE_WORKSPACE_TTL_HOURS`), `fs.promises.rm(dir, {recursive,force})`.
   - Dirs with **no matching session row** (orphaned by a crash before the row
     committed) older than TTL are also reclaimed.
   - Active-session workspaces are never touched.
   - **Ordering note (admit/run split, §2):** in `admitSession` the workspace dir
     is spawned at **P4 (`adapter.spawn`) before the session row is inserted at
     P5**, so a dir can legitimately exist with no `sessions` row for a brief
     window. The orphan-dir reclamation is **TTL-guarded** precisely so this
     window (and crash-before-row-commit) is safe — the reaper MUST never reclaim
     an orphan dir younger than TTL. The TTL is the deliberate margin, not luck.
2. **Reaper is idempotent and crash-safe.** `rm({force})` on an already-gone dir
   is a no-op (the existing pattern, `session-provisioning.ts` L729-732).

### Why a sweep, not eager delete on crash
Crash workspaces are intentionally retained for post-mortem (doc + lore). Eager
delete would destroy that value. A TTL sweep keeps the post-mortem window while
bounding disk. Cost: one `setInterval` + a directory scan every N minutes —
negligible at single-founder scale (matches the propagation heartbeat / cost
sentinel precedent).

### Files touched
- New `packages/fabric/src/services/workspace-reaper.ts`.
- `packages/fabric/src/bootstrap.ts` (start the reaper; needs `workspaceBasePath`
  in ctx — it is already passed via `dispatcherDeps.workspaceBasePath`, reuse it,
  or add an explicit `workspaceBasePath?` to the bootstrap ctx).
- `packages/fabric/src/index.ts` (export reaper if a route/test needs it).

### Test strategy (AC6)
- **Integration** (AC validation): seed a crashed session with an on-disk
  workspace and `endedAt` past TTL; run one reaper pass; assert the dir is gone
  and an active session's dir survives.

---

## 7. Lifecycle-propagation retry — no double-log, no false-fail (AC for §"What's missing"; part of dispatch correctness)

### Root cause (`lifecycle-propagation.ts` `retryFailedPropagations` L605-662)
- A successful retry inserts a fresh `applied` row but leaves the original
  `pending_retry` row at `pending_retry` ⇒ re-selected forever (double-log,
  repeated transition attempts that then log `skipped`).
- The `attempts >= MAX` branch marks `failed` on count alone, even if the
  transition already landed.

### Design — resolve the original row by retry outcome
1. **Re-attempt returns a status.** Refactor `propagateSessionToTask` /
   `propagateTaskToBet` to return a discriminated result
   `{ status: "applied" | "skipped" | "pending_retry"; reason? }` instead of
   logging a *new* row internally when invoked from the retry path. (Keep the
   first-attempt path logging as-is; add an internal `apply*` core that returns
   the status, with the event-driven wrappers logging the first attempt.)
2. **Retry updates the existing row in place:**
   - `applied`/`skipped` ⇒ `UPDATE propagationLog SET status=<status>,
     appliedAt=now, failureReason=… WHERE id=row.id`. The row is **resolved** —
     never re-selected. No second `applied` row.
   - still failing ⇒ keep `pending_retry`, `attempts` already incremented.
   - **Retry-path event emission (SUGGESTION, folded):** a retry resolving to
     `applied` SHOULD emit `propagation_applied` **once** (the transition really
     landed on this pass); a retry resolving to `skipped` SHOULD **not** emit
     (nothing changed). First-attempt event emission
     (`lifecycle-propagation.ts` L344-358) is unchanged — the `apply*` core
     returns the status and the retry caller decides emission, exactly as the
     first-attempt wrapper already does.
3. **MAX-attempts only fails an *unresolved* row.** The terminal `failed` write
   keeps the existing `WHERE status='pending_retry'` semantics, so a row resolved
   to `applied` by a concurrent/earlier pass is never flipped to `failed`. Add a
   guard: only emit the `propagation_exhausted` notification + `propagation_failed`
   event when the `UPDATE … SET status='failed' WHERE id=… AND status='pending_retry'`
   actually affected a row (CAS) — prevents the double-notify and the
   "succeeded-retry-marked-failed" case.

### Why in place, not new rows
The propagation_log is an audit *and* a work queue. A retry that resolves the
work must close the queue entry, not append a parallel one. In-place resolution
keeps "one source event → one terminal log row," which is the only way the
heartbeat can ever drain.

### Files touched
- `packages/fabric/src/services/lifecycle-propagation.ts` (return-status refactor
  of the two propagate fns; in-place resolve in `retryFailedPropagations`;
  CAS-guarded terminal fail).

### Test strategy
- **Integration**: force a transient failure (e.g. stub a transition to throw
  once), let the heartbeat retry succeed, assert exactly **one** terminal
  `applied` row for that source event and **zero** residual `pending_retry`.
  Also assert exactly **one** `propagation_applied` event for that source event
  (retry-path emission), and **zero** `propagation_applied` for a retry that
  resolves `skipped` (a no-op transition).
- **Integration**: a row that reaches MAX attempts while still failing →
  `failed` + exactly one `propagation_exhausted` notification. A row that
  succeeded on its last allowed attempt is **not** marked failed.

---

## 8. Incoherent remote/docker/isolated adapters (Z8-050)

### Decision matrix
| Adapter | Status today | AF7 decision |
|---|---|---|
| `RemoteHarnessAdapter` | Wired via `worker-ws.ts:117` on worker connect | **Keep — coherent.** It is reachable in production. No change (worker-token security is AF11). |
| `DockerWorkspaceAdapter` | Test-only; never in `createLocalAdapterPool` | **Mark unsupported.** Not a silent dead path: add a registration guard. |
| `IsolatedHarnessAdapter` | Test-only; never in pool | **Mark unsupported (v1).** |

### Design — explicit, not silent
- Add a single **opt-in env gate** in `createLocalAdapterPool`
  (`adapter-pool.ts` L292): docker/isolated adapters register **only** when
  `HYPERIDLE_ENABLE_DOCKER=1` / `HYPERIDLE_ENABLE_ISOLATED=1` *and* their runtime
  prerequisite is available (docker binary on PATH; isolated worker script
  resolvable). When the flag is set but the prereq is missing, **log a warning
  and skip** — never throw, never register a broken adapter.
- Add a `@lore Z8-050` comment at the registration site documenting: these
  adapters are experimental, off by default, and selectable by an agent's
  `harnessType` only when enabled. This converts a silent dead path into a
  documented, explicitly-gated capability.
- Do **not** delete the adapters — they have passing tests and a future. The fix
  is coherence (reachable iff enabled + available), not removal.

### Files touched
- `packages/server/src/harness/adapter-pool.ts` (`createLocalAdapterPool`:
  gated docker/isolated registration with availability check + `@lore`).

### Test strategy
- **Unit** on `createLocalAdapterPool`: with flags unset, pool contains exactly
  `{claude-code, builtin}` (+ any CLI on PATH) and **not** docker/isolated. With
  `HYPERIDLE_ENABLE_DOCKER=1` but docker absent, pool still excludes docker and a
  warning is recorded (inject a logger spy). Static enforcement that no
  production code registers docker/isolated unconditionally.

---

## 9. Ordered task list for the builder

Red-phase tests first per AC (CLAUDE.md First Principle), then implementation.

1. **§3 isolation** (`SessionConfig.sessionId`, builtin key-by-id, drop scan).
   Foundational — §5 abort and §2 split both reference the sessionId contract.
2. **§4 + §5 `SessionRunRegistry`** (new leaf singleton; CAS terminal write in
   `session-lifecycle.ts`). §5 depends on §4's CAS guard.
3. **§2 admit/run split** (`admitSession`/`runSession`/`startSessionProvision`;
   register in `SessionRunRegistry` from `runSession`; **synchronous
   `resolvedModel` presence guard in `admitSession` before P5 insert**). Depends
   on §3 (sessionId) and §4/§5 (registry).
4. **§5 handoff abort** (post-commit `abort` in `handoff-protocol.ts`; **per-invoke
   `aborted` check in builtin `executeToolCalls`** so AC5's "no new tool call
   starts" is deterministic).
5. **§4 PATCH** rewrite (abort-or-guarded-write; 409 on terminal).
6. **§1 boot-wiring** (`setProvisionSessionFn` + `dispatcherDeps` +
   `makeResolveModel`; optional `createServer(port, deps?)` for tests).
7. **§7 propagation retry** in-place resolve (independent — can parallelize).
8. **§6 workspace reaper** (new fabric service + bootstrap start; independent).
9. **§8 Z8-050 adapter gating** (independent).
10. Full `npm run check && npm run lint && npm run test:all`.

---

## 10. Interface/type changes (summary)

- `SessionConfig` (`packages/shared/src/harness/harness-adapter.ts`): add
  `readonly sessionId: string` (the provisioning-assigned id). All adapters
  accept it; only builtin's correctness depends on it.
- `session-provisioning.ts`: export `admitSession`, `runSession`,
  `startSessionProvision`; `provisionSession` stays as a wrapper for the
  dispatcher + outcome-asserting tests.
- New `packages/server/src/services/session-run-registry.ts`: leaf singleton
  `{ register, deregister, abort, has }` keyed by sessionId.
- `builtin-harness-adapter.ts`: per-invoke `aborted` check in `executeToolCalls`
  (§5.3); no signature change.
- `session-lifecycle.ts`: `endSession`/`crashSession` CAS terminal write
  (`where(state='active')`) with `session_ended` emit gated on rowcount (§4.3).
- New `packages/fabric/src/services/workspace-reaper.ts`:
  `startWorkspaceReaper(db, { workspaceBasePath, ttlMs }): () => void`.
- `lifecycle-propagation.ts`: internal `apply*` cores returning
  `{ status, reason? }`; `retryFailedPropagations` resolves rows in place.
- `server-factory.ts`: `makeResolveModel`; pass `dispatcherDeps`; call
  `setProvisionSessionFn`; optional test `deps` param on `createServer`.
- `bootstrap.ts`: start the workspace reaper (needs `workspaceBasePath` in ctx).
- `adapter-pool.ts`: gated docker/isolated registration.

No DB schema change. No migration. (`sessions.state`, `outcome`,
`workspaceSnapshot`, `endedAt` columns already exist —
`packages/db/src/schema.ts` L212-214.)

---

## 11. Contracts & boundaries honored

- **fabric never imports server**: dispatcher uses `provision-registry`
  (runtime injection); workspace reaper takes `workspaceBasePath` as data, not a
  server import.
- **No credential exfil on session/worker path**: AF7 adds no new credential
  flow. `resolveModel` reuses the existing `credentialResolver` already in
  server-factory. Worker-token fix (Z8-014) untouched — AF11.
- **Cost uses AF10 accounting**: `recordCostAndCheck`/`scaleForCurrency`
  unchanged.
- **No bet/task state-machine change**: AF7 consumes existing transitions; the
  propagation retry fix is about *log resolution*, not transition rules (AF12).

---

## 12. Risks & open questions (surfaced early)

1. **202 vs 200 on `POST /api/sessions`** (§2). If a web client strictly asserts
   200 + completed row, we either keep 202 + client polls, or return 200 with the
   *admitted* (active) row. Recommend 202 + active row; verify
   `packages/web` callers before ship.
2. **`SessionConfig.sessionId` ripple** (§3). Adding a required field touches
   every adapter + the mock + tests that build `SessionConfig` inline. Mitigate
   by making it required at the type level but trivially supplied (all call sites
   already have a sessionId in scope). ⚠️ Builder must update mock-harness-adapter
   and any inline-config tests.
3. **Reaper TTL default** (§6). 24h is a guess. Make it env-tunable; document the
   default. No data-loss risk (only terminal/orphan dirs past TTL).
4. **Cooperative abort latency — RESOLVED to design (a) (§5.3).** The builtin loop
   checks `aborted` between iterations; an in-flight tool invoke would otherwise
   complete and increment `toolCallCount`, contradicting a "count frozen"
   assertion. **Decision:** add the per-invoke `aborted` check inside builtin
   `executeToolCalls` (before each invoke, L595 loop) AND scope the AC5 assertion
   to **"no tool call *starts* after handoff completes"** (not "count frozen").
   Plan §5 and the §12 test strategy now agree. An invoke already dispatched at the
   instant of abort may complete (+1); no new invoke starts. Do **not** ship the
   per-iteration-only check paired with a "count frozen" assertion — they
   contradict.

---

## 13. Protected tests — existing assertions this plan WILL break (update deliberately)

The 200→202 contract change (§2) and the boot-wiring (§1) touch existing tests
whose assertions are now wrong. The builder MUST update these in the red phase,
**deliberately** — not discover them as surprise failures at `test:all`. Grepped
and verified against the worktree:

**A. POST `/api/sessions` status + completed-row body (broken by §2 200→202).**
- `packages/server/src/__tests__/R1-wire-agent-execution.integration.test.ts`
  - **L221-294** "returns 200 with state=done and outcome=completed…": asserts
    `res.status === 200` (L270) and `body.state === "done"` / `body.outcome ===
    "completed"` (L274-276). Under §2 the POST returns **202** with the *admitted*
    row (`state="active"`, no `outcome`). → Rewrite: assert **202**, `body.state
    === "active"`; then poll `GET /api/sessions/:id` until `state === "done"` to
    assert the eventual completion (the detached tail's result).
  - **L344-388** "returns 200 with state=crashed when the harness throws…":
    asserts `res.status === 200` (L379). → Rewrite: assert **202** + active row,
    then poll until `state === "crashed"`.
  - **L296-343** "AC6/AC7: Missing credential returns 500 … no session row":
    asserts `res.status === 500`, `body.code === "MISSING_CREDENTIAL"`, **zero**
    session rows, harness **never started**. This is the WARNING-2 contract and
    must **still pass unchanged** after §2's synchronous `resolvedModel`-presence
    guard. Treat as a regression guard, not a rewrite — if it breaks, the admit
    prefix is wrong.
  - **L455-** (`CostCapExceededError` → 422) and **L495-** (`ConcurrencyLimitError`
    → 429): must **still pass** (P2/P3 throw pre-insert). Regression guards.
- `packages/server/src/__tests__/sessions.integration.test.ts`
  - **L78-87** "POST /api/sessions create session" asserts **201** — this is the
    **legacy bare-insert path** (no adapters wired), unaffected by §2 (which only
    changes the adapters-present branch). Leave as-is; verify the test still
    exercises the no-adapters path after changes.
  - **L240-286** PATCH `state=done` / `state=crashed` assert **200** + emitted
    `session_ended` (L245-254, L283-286). §4 rewrites PATCH (abort-or-guarded-write,
    409 on already-terminal). These tests run against a **bare-insert** session
    with **no running runtime entry** ⇒ they hit §4's fallback direct-write branch,
    so 200 + single `session_ended` should still hold for an `active→terminal`
    PATCH. → Builder must confirm the fallback path keeps these green and add the
    new 409-on-already-terminal case alongside them.

**B. Dispatcher wiring test (touched by §1 boot-wiring).**
- `packages/server/src/__tests__/AD2-task-dispatcher.integration.test.ts`
  - **L65** `setProvisionSessionFn(provisionSession)` is wired **at module load**
    in the test itself (test-local wiring). §1 makes production
    `createServer` call `setProvisionSessionFn` too. The registry is a
    **process-global singleton** — double-wiring (test + production-under-test) is
    last-write-wins and harmless here, but the builder MUST verify the new
    `server-factory-dispatch.integration.test.ts` (§1) and this AD2 test do not
    interfere when run in the same process (vitest isolation per file mitigates;
    confirm no cross-file global leak). The AD2 assertions (L255-264 session row
    appears, L348-487 handoff re-dispatch via `session_ended`) must still pass —
    they validate the **same wire** §1 now also exercises from `createServer`.
  - Note: AD2 AC2 (L351-487) emits `session_ended` to drive handoff re-dispatch.
    This is the **dispatcher's** consumption of `session_ended`, unrelated to §5's
    rule that *handoff-protocol* must not emit it — no conflict, but the builder
    should not confuse the two when reading the handoff path.

If any other `packages/web` client asserts strictly on 200 for POST `/sessions`,
grep `POST.*sessions` / `status === 200` in `packages/web` before red phase
(§2/§12.1 already flags this) and update or switch to polling `GET
/sessions/:id`.

---

## 14. SUGGESTIONs — disposition

Three reviewer SUGGESTIONs, each folded or explicitly deferred:

1. **Reaper orphan-dir vs admit/run split ordering (§6).** **Folded.** State the
   ordering explicitly in §6: in `admitSession`, the workspace dir is spawned at
   **P4 (`adapter.spawn`) before the session row is inserted at P5**, so there is a
   brief window where a dir exists with no matching `sessions` row. The reaper's
   "orphan dir with no session row ⇒ reclaim" rule is **TTL-guarded (24h default)**;
   that TTL is the deliberate safety margin for this window (and for crash-before-row
   commit), not an accident. The reaper must never reclaim an orphan dir younger
   than TTL. (Add this sentence to §6.1.)
2. **Retry-path event emission (§7).** **Folded.** Specify in §7: a retry that
   resolves to `applied` SHOULD emit `propagation_applied` **once** (the transition
   really landed on this pass); a retry that resolves to `skipped` SHOULD **not**
   emit (nothing changed). First-attempt event emission (`lifecycle-propagation.ts`
   L344-358) is unchanged. Add to §7 test assertions: assert exactly one
   `propagation_applied` for a transient-fail-then-succeed source event, and **zero**
   `propagation_applied` for a retry that resolves `skipped`.
3. **`createServer(port, deps?)` test-DI lore (§1).** **Folded.** The optional
   `deps` param widens a production entry point for tests only. Add a `@lore` at the
   param documenting: test-only override of `adapterPool`/`workspaceAdapter`,
   production passes nothing; ensure `knip` does not flag the optional branch as
   dead (it is reached by `server-factory-dispatch.integration.test.ts`). Mirrors
   `createApp`'s existing `SessionRouteDeps` DI pattern.
