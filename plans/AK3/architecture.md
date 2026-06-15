# AK3 — Architecture: Committing a bet starts work

**Fixed inputs:** `plans/AK3/concept.md` (contracts C1–C8), `plans/AK3/design/approved.md` (four-state tasks section), `docs/architecture/kernel-strategy-split.md` (decomposition is Kernel; PM context via Strategy port).

## Required reading (builder MUST read before implementing)
- `plans/AK3/concept.md`, `plans/AK3/design/approved.md`.
- `packages/server/src/services/bet-state-machine.ts` — `transitionBet` emits `bet_state_changed`.
- `packages/server/src/services/assistant-turn.ts` — **the task-free agent turn precedent** (AH3). The decomposition turn is modelled on this exactly.
- `packages/fabric/src/services/task-dispatcher.ts` + `provision-registry.ts` + `packages/server/src/services/session-provisioning.ts` — the dispatch→session path to REUSE.
- `packages/server/src/tools/create-task.ts` — its ownership/parent semantics are WRONG for decomposition (see Reconciliation); a new tool is needed.
- `packages/server/src/server-factory.ts` lines ~255–315 — boot wiring; where the new subscriber registers and where deps already exist.
- `packages/db/schema.ts` (`bets`, `tasks`, `users`, `teamMembers`), `packages/db/drizzle/` (migrations).
- `docs/process-layer/bets-shape-commit-change-ship.md` §5.2–5.3, `docs/system-prompts/product-manager.md`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handles |
|---|---|---|
| "subscriber on `bet_state_changed(active)`" | `lifecycle-propagation.ts` (in **fabric**) subscribes to `bet_state_changed` but only acts on `completed`/`killed`. Decomposition is **Kernel** → must NOT live in fabric. | New **kernel-side** subscriber in `packages/server/src/services/` (not fabric). Registered at boot in `server-factory.ts` alongside the existing registrations. |
| "produced tasks owned by eligible team agents, flow into existing dispatch" | Dispatcher fires on `task_state_changed(accepted)` and requires `ownerAgentId` set. `create_task` tool sets `ownerAgentId = ctx.agentId` (the CALLER) and derives `betId` from a parent task (`ctx.taskId`). | A PM decomposition has no parent task and must assign owners to *eligible team agents*, not the PM. → **new `propose_bet_tasks` tool** scoped to the decomposition turn (derives betId from the turn's bet, assigns owners by role). |
| "PM agent gets context via Strategy port; works under minimal Strategy" | `assembleContext` writes into a **sandbox** for a *session*. A task-free turn (AH3) has **no sandbox/session**. AH3 builds context inline via `composeAssistantPrompt`, NOT via the Strategy port. | The decomposition turn assembles a scratch sandbox + calls `getActiveStrategy().assembleContext(...)` so PM context flows through the port (honours boundary C5). Under minimal Strategy this yields empty scaffold → PM decomposes from the bet alone. See Design-it-twice. |
| "decompositionStatus the bet surface reads" | `bets` has NO such column. `BetDetail` (web) + GET `/bets/:id` don't carry it. | Migration adds `bets.decomposition_status` + `bets.decomposition_blocker_reason`. GET `/bets/:id` returns them; `BetDetail` type + `WorkBet.tsx` consume them. |
| "teams carry an agent roster" | `users.teamId → teamMembers.id`; eligible agents = `users WHERE teamId IN (teamMembers of bet.teamId) AND kind='ai' AND status='active' AND role can own work`. Pattern exists in `handoff-protocol.ts` (toRole branch). | Reuse that join shape for the eligibility query. |

---

## The seam (end to end)

```
POST /bets/:id/commit ─► transitionBet(draft→active)  [UNCHANGED]
                              │ emits bet_state_changed(toState=active)
                              ▼
   registerBetDecomposition (NEW, kernel-side subscriber)   ── idempotent guard
                              │  set bets.decomposition_status='running'
                              ▼
   runBetDecomposition(betId)  (NEW service — AH3 task-free turn pattern)
        1. load bet (goal/done_condition + concept/description body)
        2. find eligible team agents  ──── none? ─► status='blocked', reason='no_eligible_agent'  ─► STOP
        3. pick PM decomposer (team product_manager, else first eligible)
        4. scratch sandbox + getActiveStrategy().assembleContext(...)   [Strategy port, C5]
        5. run harness turn (adapterPool + model resolve), PM calls propose_bet_tasks
        6. tasks inserted: betId=bet, teamId=bet.teamId, ownerAgentId=eligible agent, state via task SM → 'accepted'
              ├─ ≥1 task ─► status='done'   (each accepted task emits task_state_changed(accepted))
              └─ 0 tasks / turn failed / timeout ─► status='blocked', reason='empty'|'failed'
                              ▼
   task_state_changed(accepted)  ─► EXISTING task-dispatcher ─► provision-registry ─► session-provisioning  [REUSE, C4]
```

No second provisioning route. Decomposition's only output that reaches the runtime is **accepted tasks with owners** — exactly what the dispatcher already consumes.

---

## Design-it-twice — how the PM turn creates tasks

**Option A — `propose_bet_tasks` tool called by the PM during a harness turn.**
The decomposition turn runs the PM through the real harness (like AH3). The PM is given a single tool `propose_bet_tasks({ tasks: [{title, description?, doneCondition?, ownerRole?}] })`. The tool, scoped to the turn's `betId`, inserts tasks and assigns owners. Trade-off: a real LLM turn (cost, latency, nondeterminism) but it IS "running a PM agent" per the locked doc, and reuses the harness/adapter path. Reject reason: harder to test deterministically (needs a stub adapter).

**Option B — deterministic server service builds the breakdown from a structured LLM completion (no tool, no harness).**
Call the model directly for a JSON task list, then insert server-side. Trade-off: simpler, fully testable with a stubbed completion. Reject reason: it is NOT "running a PM agent" (no harness, no tools, no Strategy context window) — it sidesteps the locked-doc intent and can't later grow into the decentralized model; it also duplicates harness plumbing.

**Synthesis (chosen): Option A**, structured on the AH3 template. The decomposition turn = AH3's `runAssistantTurn` shape (load agent, resolve model, select adapter, run under timeout, never-silent) **plus** (a) Strategy-port context assembly into a scratch sandbox (C5), and (b) a session-less tool-execution path so `propose_bet_tasks` runs. Determinism for tests comes from a **test-injectable `runDecompositionTurn` override** (same idiom as `AssistantTurnDeps.runTurn`) — the override inserts a fixed breakdown without a real LLM call, so integration tests assert the seam (commit→tasks→dispatch) without credentials. **Evals** (real LLM, separate, local-only) cover decomposition quality — which is explicitly OUT of scope for AK3 ACs.

This keeps decomposition Kernel-side, reuses the harness, honours the port, and stays testable. The `propose_bet_tasks` tool is the single new authority that creates owner-assigned bet tasks.

---

## Types / schemas / contracts

### Migration (`packages/db/drizzle/` forward-only, additive)
```sql
ALTER TABLE bets ADD COLUMN decomposition_status text;         -- null | 'running' | 'done' | 'blocked'
ALTER TABLE bets ADD COLUMN decomposition_blocker_reason text; -- null | 'no_eligible_agent' | 'empty' | 'failed'
```
Schema (`packages/db/schema.ts`, `bets`): add
```ts
decompositionStatus: text("decomposition_status"),          // DecompositionStatus | null
decompositionBlockerReason: text("decomposition_blocker_reason"), // DecompositionBlockerReason | null
```

### Shared types (`packages/shared`)
```ts
export type DecompositionStatus = "running" | "done" | "blocked";
export type DecompositionBlockerReason = "no_eligible_agent" | "empty" | "failed";
```
Closed enums (concept C8). Adding a variant requires a concept update.

### Decomposition service (`packages/server/src/services/bet-decomposition.ts` — NEW)
```ts
export interface BetDecompositionDeps {
  db: HyperIdleDb; eventBus: EventBus; adapterPool: AdapterPool;
  workspace: SandboxAdapter; sandboxBasePath: string;
  resolveModel?: (tier: string) => Promise<ResolvedModel | undefined>;
  credentialResolver?: CredentialResolver;
  /** Test-injectable: when present, called INSTEAD of the real LLM turn. Inserts a fixed breakdown. */
  runDecompositionTurn?: (ctx: { betId: string; pmAgentId: string }) => Promise<void>;
}
/** Resolves without throwing. Always ends bets.decomposition_status in a terminal value ('done'|'blocked'). */
export async function runBetDecomposition(deps: BetDecompositionDeps, betId: string): Promise<void>;

/** Eligible = active AI user in the bet team's membership group with a work-owning role. */
export async function findEligibleTeamAgents(db: HyperIdleDb, betTeamId: string): Promise<User[]>;
```

### Subscriber (`packages/server/src/services/bet-decomposition-subscriber.ts` — NEW, kernel-side)
```ts
export function registerBetDecomposition(deps: BetDecompositionDeps): () => void;
// eventBus.on("bet_state_changed", e => { if (e.toState !== "active") return;
//   idempotency: CAS bets.decomposition_status null→'running' (WHERE status IS NULL); lost race → no-op
//   void runBetDecomposition(deps, e.betId).catch(... -> set 'blocked'/'failed') })
```
Idempotency (C2): the `null→'running'` compare-and-set on `decomposition_status` is the dedup guard — a re-fired event whose CAS affects 0 rows does nothing. Mirrors the dispatcher's `hasActiveSession` idempotency idiom.

### Tool (`packages/server/src/tools/propose-bet-tasks.ts` — NEW)
```ts
// input: { tasks: Array<{ title: string; description?: string; doneCondition?: string; ownerRole?: UserRole }> }
// betId bound from the decomposition turn context (NOT agent input — prevents cross-bet injection, like create-task R5 D1).
// For each task: owner = an eligible team agent matching ownerRole (fallback: round-robin over eligible agents).
//   insert task {betId, teamId: bet.teamId, ownerAgentId, state:'proposed', ...}
//   transitionTask(proposed→accepted)  → emits task_state_changed(accepted) → dispatcher picks up.
// Returns { created: number }.
```
Owner is an eligible team agent, never the PM author by default (concept C3). The PM may itself be the owner only if it is eligible for that work.

### API (`packages/server/src/routes/bets.ts`)
GET `/bets/:id` (the existing enriched detail handler) adds `decompositionStatus` + `decompositionBlockerReason` to the response. No new endpoint. (`/commit` is unchanged — it already emits the event; decomposition is event-driven, decoupled from the HTTP response so commit stays fast.)

### Web (`packages/web/src/types/bet.ts` + `WorkBet.tsx`)
`BetDetail` adds `decompositionStatus?: DecompositionStatus | null; decompositionBlockerReason?: DecompositionBlockerReason | null`. `WorkBet.tsx` tasks section replaces the unconditional EmptyState with the four-state switch per `approved.md` (precedence: tasks>0 → draft → blocked → decomposing).

---

## Boot wiring (`server-factory.ts`)
Register the subscriber next to the existing ones. Deps already assembled for `dispatcherDeps` (adapterPool, workspaceAdapter, sandboxBasePath, resolveModel, credentialResolver). Add:
```ts
const disposeBetDecomp = registerBetDecomposition({
  db, eventBus, adapterPool, workspace: workspaceAdapter, sandboxBasePath,
  resolveModel: makeResolveModel(db, credentialResolver), credentialResolver,
});
```
Add `disposeBetDecomp()` to the shutdown chain. Kernel-side (server package) — no fabric involvement, honours the boundary.

---

## Acceptance criteria + verification

| # | AC (from spec) | Verification |
|---|---|---|
| AC1 | Committing a bet produces a task breakdown without manual entry | **Integration test**: seed team+builder agent; inject `runDecompositionTurn` stub that calls `propose_bet_tasks` with 2 tasks; `transitionBet(draft→active)`; assert ≥1 `tasks` row with `betId` set, no manual insert. |
| AC2 | Produced tasks owned by eligible team agents + flow into dispatch (session provisioned/attempted) | **Integration test**: register the real dispatcher with a stub provisionSession; after decomposition assert each task `ownerAgentId` ∈ eligible agents, `state='accepted'`, and `provisionSession` was invoked (or attempted) for ≥1 task. |
| AC3 | A committed bet never sits indefinitely with 0 tasks under a "work will start" promise; surface reflects real state | **Component test** (`WorkBet.test.tsx`): render with (a) `decompositionStatus='running'` → `bet-tasks-decomposing`; (b) `='blocked'`,reason `no_eligible_agent` → `bet-tasks-blocked` + "Add an agent"; (c) tasks>0 → `task-row`s, no empty. Assert the permanent "Tasks will appear" string is gone. |
| AC4 | No eligible agent → explicit blocker | **Integration test**: team with zero eligible agents; commit; assert `bets.decomposition_status='blocked'`, `decomposition_blocker_reason='no_eligible_agent'`, zero tasks. **Component test**: that state renders the explicit copy (not a false promise). |
| AC5 | User Sovereignty: no irreversible external action bypassing review gates | **Static + test**: decomposition inserts only internal task rows + provisions sessions (existing reviewed loop). Assert no new outbound side effect. Tasks hitting `review` still produce review threads via existing machinery (unchanged). |
| AC6 | Decomposing is bounded — hung/failed PM turn resolves to blocked | **Integration test**: inject a `runDecompositionTurn` that throws / times out; assert `decomposition_status='blocked'`, reason `'failed'` (never stuck on `'running'`). Honours C1. |
| AC7 | Idempotent: duplicate `bet_state_changed(active)` produces one breakdown | **Integration test**: emit the event twice; assert decomposition runs once (CAS guard), no duplicate tasks. |

---

## Ordered task list

1. **Shared enums** — `DecompositionStatus`, `DecompositionBlockerReason` in `packages/shared`. *(test: importable + `npm run check`.)* sharedFiles.
2. **Migration + schema** — add 2 `bets` columns; forward-only SQL in `packages/db/drizzle/`; schema.ts. *(test: migration runs, columns present.)* sharedFiles: `packages/db/schema.ts`.
3. **`findEligibleTeamAgents`** + **`propose-bet-tasks` tool** — eligibility join (reuse handoff-protocol shape); tool binds betId, assigns eligible owners, proposed→accepted. *(red tests: eligibility query; tool inserts accepted owner-assigned tasks; rejects cross-bet betId.)*
4. **`bet-decomposition.ts` service** — `runBetDecomposition` (AH3-shaped task-free turn + Strategy-port context assembly into scratch sandbox + `runDecompositionTurn` override seam); never-throws, terminal status always set; no-eligible-agent → blocked early. *(red tests: AC1, AC4, AC6.)*
5. **`bet-decomposition-subscriber.ts`** — `registerBetDecomposition`, CAS idempotency. *(red tests: AC7, fires only on `active`.)*
6. **Boot wiring** — register in `server-factory.ts` + shutdown. sharedFiles: `packages/server/src/server-factory.ts`.
7. **GET `/bets/:id`** — return the two new fields. *(red test: response carries them.)* sharedFiles: `packages/server/src/routes/bets.ts`.
8. **Web** — `BetDetail` type + `WorkBet.tsx` four-state tasks section per approved.md. *(red component tests: AC3.)*
9. **Verify** — `npm run check` + `lint` + `test` + targeted integration (AC1/2/4/6/7) + component (AC3).

---

## Security & abuse cases
- **Input-trust (agent-authored fields):** `propose_bet_tasks` task titles/descriptions/doneCondition are agent-authored — validate with Zod (length caps, same as `create-task`'s 512/65536). `betId` is **bound from turn context, never agent input** (prevents cross-bet injection — mirrors create-task R5 D1). `ownerRole` is validated via `findRoleCatalogEntry(role)` from `@hyperidle/shared` (`UserRole` is `string`, NOT a closed enum — the catalog is the gate); owner resolved server-side to an eligible team agent (agent cannot assign an arbitrary user). **Addressed.**
- **Rate-limit:** decomposition is event-driven off `commit` (already a human-gated POST), one per bet via the CAS idempotency guard — not a public-facing POST. No new rate-limit surface. **N/A (covered by commit gating + idempotency).**
- **Cost:** the PM turn consumes model budget — it runs through the existing `checkCostCap`/`recordCostAndCheck` Kernel cost path (cost stays Kernel-side per boundary). If over cap, the turn fails → `blocked/failed` (honest), no runaway. **Addressed.**
- **Path-traversal:** scratch sandbox path derives from `sandboxBasePath` + generated id (same as session provisioning), no user/agent path input. **N/A.**
- **SSRF:** no new outbound URL. **N/A.**
- **Secret-handling:** reuses existing credential resolver; no new credential surface. **N/A.**

## Route checklist
- GET `/bets/:id` (`packages/server/src/routes/bets.ts`) — returns `decompositionStatus` + `decompositionBlockerReason`. (Only route touched. POST `/commit` unchanged.)

## protectedTests
- `packages/server/src/__tests__/bet-state-machine.integration.test.ts` — `transitionBet` behaviour unchanged (decomposition is additive, off the event).
- `packages/fabric/src/services/__tests__/*lifecycle-propagation*` and `*task-dispatcher*` — dispatch/propagation behaviour unchanged (we only feed it accepted tasks).
- `packages/server/src/services/__tests__/*assistant-turn*` (AH3) — pattern reused, not modified.

## sharedFiles
`packages/db/schema.ts`, `packages/shared` (barrel), `packages/server/src/server-factory.ts`, `packages/server/src/routes/bets.ts`, `packages/web/src/types/bet.ts`, `packages/web/src/pages/WorkBet.tsx`.

## Risks / open
- **R1 (eligibility predicate) — RESOLVED:** `UserRole` is `string` (open), so the gate is the **role catalog**, not a closed type. Eligible = active AI user in the bet team's membership group whose role maps (via `findRoleCatalogEntry`) to `category === "team"`. This cleanly includes `builder`/`product_manager`/`growth`/`brand_voice` and excludes `strategy` (facilitator) + `individual` (assistant) categories from *ownership*. Use `AGENT_ROLE_CATALOG` / `findRoleCatalogEntry` from `@hyperidle/shared/agent-roles`. Decomposition *quality* (which team role gets which task) is out of scope — role-match-then-round-robin over team-category agents is acceptable v1. Edge: a team with only strategy/individual members → no eligible owner → `no_eligible_agent` blocker (correct, AC4).
- **R2 (task-free tool execution):** AH3 ran a conversational turn with no tools. The decomposition turn needs `propose_bet_tasks` executable without a session sandbox tool registry. Builder reuses the builtin harness's session-less path or the registry-invoke path from `runSession` Phase 10, scoped to the turn — do NOT spin a full `provisionSession`. If session-less tool exec proves too costly, fall back to the deterministic-insert variant of the override for v1 and keep the real PM turn behind the `runDecompositionTurn` seam (still Kernel, still honest) — flag to reviewer.
- **R3 (Strategy-port under task-free turn):** `assembleContext` expects a sandbox + sessionId. The scratch decomposition sandbox satisfies this; under minimal Strategy it yields empty scaffold (fine). Confirm no DB writes in minimal `assembleContext` couple to a real session row (it doesn't — it only writes files).
- **R4:** "Add an agent" route target (design open Q3) — builder confirms the team-agents settings route.
