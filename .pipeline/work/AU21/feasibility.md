# AU21 — Feasibility

Engineering tier: **production**. Probes below cover the load-bearing, previously-unproven claims this
plan rests on. Everything else (moving DI ports to a different injected shape, deleting a dead
capability, re-running a script) reuses patterns AU19 already shipped and needs no probe.

## Probe 1 — Location-transparent transport over the *literal* core-api route stack is real — GO (benefit is runtime route-identity, NOT type-safety)

**Question (open question #1 from requirements):** can execution/orchestration's write-back reuse the
same door `core-ui` uses AND avoid a forced network hop when colocated?

**Finding.** Yes, and the transport mechanism already exists in shipped code:
- `core-ui` calls core-api through `hc<AppType>(baseUrl, { fetch: apiFetch })`
  (`packages/web/src/api/client.ts`). The `hc` client takes an **injectable `fetch`** — transport is
  already a swapped-in dependency, not hardcoded.
- Hono's in-process dispatch (`app.request(path, init)`) is used across the codebase's own integration
  tests (`packages/core-api/src/**/__tests__/*.integration.test.ts` — 10+ call sites) to drive the
  **full real route + middleware stack** with zero socket. `app.request` is a `fetch`-shaped
  `(Request) => Promise<Response>`.
- Therefore the same client, given an Application-injected `fetch`, is **in-process on `desktop`**
  (`fetch = app.request`) and **network on a split topology** (`fetch = globalThis.fetch`) — identical
  call site. This is the `HarnessPort` pattern (Application picks the transport at boot) applied to the
  HTTP route stack.

**CRITICAL correction (verified `packages/core-api/src/app.ts:749`):** `AppType` is a **bare
`export type AppType = Hono`** — the typed per-route RPC schema was lost when routes moved to untyped
`app.route(path, sub)` (see @lore AF4/§4g). So `hc<AppType>` provides **no compile-time route /
request / response typing**. The seam's value is therefore **runtime route-identity** — an agent write
traverses the *exact same route handler + middleware + validation* a human's UI action does (provable
by a runtime contract test that asserts the route ran) — **not** static type-safety. `CoreApiPort`'s
method types are hand-written mirrors the compiler cannot check against the real routes; that gap is
closed by a per-method contract test (architecture.md §11, AC #1), not by `tsc`.

**Verdict: GO.** Open question #1 resolves to "reuse the literal route stack, Application-injected
transport"; the benefit is runtime route-identity, and the type-checking gap is a named, tested
compensating control — not an assumed guarantee.

## Probe 2 — Mechanism C forbids the naive seam home; `@hyperidle/api-contract` is the sanctioned one — GO-WITH-CONSTRAINT

**Question (open question #2):** where does the seam's typed contract live so ~10 orchestration
Services can consume it without violating "a Service never imports a Service or a Layer package"?

**Finding.**
- `AppType` is exported from `@hyperidle/core-api/schemas`, but (Probe 1) it is a bare `Hono` — it
  carries no route surface to reuse, and importing it into an orchestration **Service** imports a
  **Layer package**, which Mechanism C forbids (`runtime-simplification.md` §Enforcement-3: a
  Service's deps may only be `@hyperidle/db`, `@hyperidle/shared`, "plus a narrow shared
  ports/contracts package … if /architecture decides one is needed"). Confirmed: every orchestration
  Service's `package.json` lists only `@hyperidle/db` + `@hyperidle/shared` (+ drizzle/zod).
- `@hyperidle/api-contract` already exists, has **zero dependencies**, and already holds hand-written
  wire-shape types. It is the exact "narrow shared ports/contracts package" Mechanism C's escape hatch
  names.

**Verdict: GO-WITH-CONSTRAINT.** The seam contract (`CoreApiPort` + per-Service method groups) lives
in `@hyperidle/api-contract`, hand-typed as narrow structural mirrors of the core-api route
request/response shapes — same discipline `HarnessPort` uses in `@hyperidle/shared`. Orchestration
Services add `@hyperidle/api-contract` to `dependencies` (allowed). The Application adapts a concrete
client onto the narrow interface. Because the mirrors are hand-written (Probe 1), their fidelity to
the real routes is a **tested** obligation, not a compiler-checked one.

## Probe 3 — Delete orchestration's drain-time core reads; agents self-recover via MCP — GO-WITH-CHANGE (new pre-handoff channel required; verified line-by-line)

**Question (AC #2):** can orchestration's core-api reads at session-launch be removed entirely, given
they exist today for crash-recovery?

**Founder ruling (2026-07-17, R3):** *"i never approved or designed this crash recovery mechanism… the
agent can also recover itself. the agent can pull the latest information via mcp. agents are better at
recovery than any hardwired system."* The drain-time re-validation is inherited (AU9 PR #425 → hardened
by AU12/13/15 for ownership → relocated by AU19), never independently chosen. Delete it.

**Finding — verified line-by-line against `agent-work-intent-worker.ts`:**
- `resolveAuthoritativeInput` reads **core-api domain state in all 7 branches**:
  `conversation.getMessageById`, `work.getTaskById`/`getBetById`, `knowledge.findById`,
  `routine.getRoutineRunById`/`getRoutineById`, `review.findGrantedProposedCall`,
  `org.getTeamMembersByTeamId`, `users.listUsersByTeam`/`getUserById` (+ `requireRunnableActor` in
  every branch). All classified **(b) core domain → DELETE**.
- Its only **(a) own-state** reads are idempotency/dedup: the `agentWorkIntents` CAS claim,
  `explicitSessionStarts`, `taskDispatchAttempts` (session-requests-owned / orchestration-written).
  **KEEP verbatim** — "have I already dispatched this?" is orchestration's own state.
- **What the protected crash-replay tests actually assert (checked, not assumed):** idempotency/dedup
  only — `recordAgentWorkIntent` idempotent (`second.id === first.id`, `rows.toHaveLength(1)`);
  `createAgentSessionRequest` idempotent by source/action key; concurrent-duplicate →
  `winners.toHaveLength(1)`. **No test asserts "replay re-reads core state and rejects a stale
  request."** So deleting the (b) reads breaks **no protected guarantee** — the own-row CAS mechanics
  that satisfy the dedup tests are untouched.
- **Recovery replacement — one part already exists, one part is NEW (B1 correction):** (i) the running
  agent pulls current source state via the same MCP/tool surface it already uses (`agent-execution`
  mcp-provider/tool-provider) — exists; (ii) agent overload is handled by orchestration's own
  provision-time `ConcurrencyLimitError` defer/retry — exists; (iii) **failure report-back does NOT
  fully exist today.** Verified: the drain worker (`agent-work-intent-worker.ts`) emits **nothing** —
  no `emit`/`eventBus` call anywhere in it; `AgentRunLifecycleChangedEvent` fires only **post-session**
  (`session-lifecycle.ts:158`). So **pre-handoff** drain failures (bad baked payload, `MAX_ATTEMPTS`,
  provisioning failure — before any session) have **no** channel to core-api. Deleting the drain-time
  re-check as first drafted would reintroduce the AU15 permanent-routine-brick bug, whose guard
  (`routine-scheduler.au15.integration.test.ts` AC-3d) depends on `failOrRelease` finalizing the
  routine run. **Fix:** a genuinely NEW against-grain EventBus inversion `agent_run_admission_failed`,
  emitted by `failOrRelease`, with core-api subscribers that finalize their own state (routine → run
  `error`, replacing the deleted direct write) and decide retry/abandon — and BOTH events' core-api
  reactions (pre- and post-handoff) are new code, not existing wiring. Architecture.md §6 B5 designs it;
  AC #2b + the rewired AU15 AC-3d test prove it.

**Verdict: GO-WITH-CHANGE — the model holds, given the NEW pre-handoff failure channel.**
Orchestration→core domain reads go to **zero**, deleted not rerouted, PROVIDED the new
`agent_run_admission_failed` channel + core-api subscribers are built (else the AU15 brick returns).
Two items are Increment-0 / founder work, not assumed: (i) **`taskDispatchAttempts` ownership** — 3
core-api Services write it (`work`×2, `policy`) yet its `task_run` read re-validates state, so "keep as
orchestration-owned" is unproven; who owns it and whether the re-check deletes is an Increment-0
question. (ii) **target-agent runnability + the emit→deactivate→drain race** — an authority check;
preferred cover is provision-time credential-context failure (cleaner than supersede/cancel), founder
to confirm. Everything else deletes cleanly.


## Not probed (reused AU19 patterns, no uncertainty)

- Extending `scripts/generate-dependency-graph.ts` with a new seam-edge classification — it already
  classifies port-derived vs EventBus edges by scanning `ports.ts`; adding a seam case is mechanical.
- Deleting a confirmed-dead or duplicate capability — AU12–AU18 did this dozens of times.
- Moving a raw DI port to a seam call — structurally identical to AU19's Mechanism-C port migrations.
- A lint/guard that fails a new raw `agent-orchestration → core-api` port — same `tsc`-negative-case /
  eslint technique AU19's Mechanism C already uses; the only new work is the rule, not the mechanism.
