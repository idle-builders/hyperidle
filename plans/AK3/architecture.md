# AK3 — Architecture: Committing a bet starts work

**Fixed inputs:** `plans/AK3/concept.md` (contracts C1–C8), `plans/AK3/design/approved.md` (four-state tasks section — **binding** over the lower `design/honest-task-state/*` docs, see §Web), `docs/architecture/kernel-strategy-split.md` (decomposition is Kernel; PM context via Strategy port; cost stays Kernel-side; `workspace`→`sandbox` vocab).

> **Revision r1** (post-critique). The three CRITICALs + four WARNINGs from `architecture-critique.md` are resolved against the **actual code** (files cited inline). The two AH3-misattribution gaps are closed by (1) specifying an exact synthetic `ContextAssemblyRequest` honouring the port, and (2) making **deterministic task insertion the v1 PRIMARY path** so no session-less tool-exec question mark remains. The crash-orphan hole is closed by a boot-time recovery sweep.

## Required reading (builder MUST read before implementing)
- `plans/AK3/concept.md`, `plans/AK3/design/approved.md` (the latter is the **binding** UI contract — its precedence order wins).
- `packages/server/src/services/bet-state-machine.ts` — `transitionBet` emits `bet_state_changed { streamId: teamId, betId, fromState, toState }` exactly once (CAS `WHERE status = fromState`).
- `packages/server/src/services/assistant-turn.ts` — **the task-free agent turn precedent (AH3)**. NOTE its real shape: runs with `sandboxPath: ""`, `tools: []`, **no** `assembleContext` (builds context inline via `composeAssistantPrompt`). We reuse its *model-resolve / adapter-select / timeout / never-silent* skeleton and `ASSISTANT_TURN_TIMEOUT_MS`, NOT its context strategy — see §The PM turn.
- `packages/fabric/src/services/task-dispatcher.ts` + `provision-registry.ts` + `packages/server/src/services/session-provisioning.ts` — the dispatch→session path to REUSE (fires on `task_state_changed(accepted)`, requires `ownerAgentId` set).
- `packages/server/src/services/strategy-registry.ts` — `getActiveStrategy()` (throws if unset; always set at boot).
- `packages/shared/src/strategy-port.ts` — `ContextAssemblyRequest<TDb>` (requires `db, sandboxPath, sessionId, taskId, agentId, agentRole, teamId, isRoutine`; `assembleContext` MAY throw).
- `packages/strategy-minimal/src/minimal-strategy.ts` — minimal `assembleContext` only writes scaffold dirs + empty manifest; ignores `taskId`/`isRoutine`; **no DB read coupled to a real session row** (verified — R3 RESOLVED).
- `packages/server/src/tools/create-task.ts` — its ownership/parent semantics (`ownerAgentId = ctx.agentId`, betId from parent `ctx.taskId`) are WRONG for decomposition (see Reconciliation); a new insert path is needed.
- `packages/fabric/src/services/cost-cap.ts` — `checkCostCap(db, eventBus, { agentId, teamId, factoryCap?, factorySpend? }) → { allowed, level?, currentSpend?, cap? }` (returns a result, does NOT throw; the caller decides). Importable directly from `@hyperidle/fabric` — **not** banned by the AK2 ESLint guard (only `assembleContext`/`startWatcher`/`FileWatcher` are banned; cost stays Kernel-side per boundary §3).
- `packages/server/src/server-factory.ts` lines ~240–315 — boot wiring; `makeResolveModel(db, credentialResolver)`, `adapterPool`, `workspaceAdapter`, `sandboxBasePath`, `credentialResolver` all already exist here (they feed `dispatcherDeps`).
- `packages/web/src/router.tsx` — the team page route is `/work/team/:teamId` (`WorkTeam.tsx`, which owns the `add-agent-btn` + `AgentAddDialog`). This is the "Add an agent" target.
- `packages/db/schema.ts` (`bets`, `tasks`, `users`, `teamMembers`), `packages/db/drizzle/` (migrations).
- `docs/process-layer/bets-shape-commit-change-ship.md` §5.2–5.3, `docs/system-prompts/product-manager.md`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handles |
|---|---|---|
| "subscriber on `bet_state_changed(active)`" | `lifecycle-propagation.ts` (in **fabric**) subscribes `bet_state_changed` but only acts on `completed`/`killed`. Decomposition is **Kernel** → must NOT live in fabric. | New **kernel-side** subscriber in `packages/server/src/services/`. Registered at boot in `server-factory.ts` alongside existing registrations. |
| "produced tasks owned by eligible team agents, flow into existing dispatch" | Dispatcher fires on `task_state_changed(accepted)`, requires `ownerAgentId`. `create_task` sets `ownerAgentId = ctx.agentId` (the CALLER) + derives `betId` from a parent task (`ctx.taskId`). | A PM decomposition has no parent task and must assign owners to *eligible team agents*, not the PM. → **new `insertProposedBetTasks` function** scoped to the bet (derives betId from the turn's bet, assigns eligible owners by role). |
| "PM agent gets context via Strategy port; works under minimal Strategy" | `assembleContext` is shaped for a session admission: requires `sessionId`, `taskId`, a real `sandboxPath` to write into, and MAY throw. AH3 (the task-free precedent) does NOT call it — it assembles inline and runs `sandboxPath: ""`. | The decomposition turn **provisions a real scratch sandbox dir + calls `getActiveStrategy().assembleContext(...)` with an exactly-specified synthetic request** (see §The PM turn) so PM context flows through the port (honours boundary C5). Under minimal Strategy → empty scaffold → PM decomposes from the bet alone. A throw → `blocked/failed`. |
| "decompositionStatus the bet surface reads" | `bets` has NO such column. | Migration adds `bets.decomposition_status` + `bets.decomposition_blocker_reason`. GET `/bets/:id` returns them; `BetDetail` type + `WorkBet.tsx` consume them. |
| "teams carry an agent roster" | `users.teamId → teamMembers.id`; eligible = AI user in the bet team's membership group, `status='active'`, role maps to `category==='team'` in the role catalog. Pattern exists in `handoff-protocol.ts:184-202`. | Reuse that join shape (R1). |

---

## The seam (end to end)

```
POST /bets/:id/commit ─► transitionBet(draft→active)  [UNCHANGED]
                              │ emits bet_state_changed(toState=active)
                              ▼
   registerBetDecomposition (NEW, kernel-side subscriber)
                              │  CAS bets.decomposition_status NULL→'running' (WHERE status IS NULL)
                              │  (lost race / re-fire → 0 rows → no-op : idempotent C2/AC7)
                              ▼
   runBetDecomposition(betId)  (NEW service — AH3-shaped task-free turn; resolves WITHOUT throwing)
        1. load bet (goal/done_condition + concept/description body)
        2. findEligibleTeamAgents(bet.teamId) ── none? ─► status='blocked', reason='no_eligible_agent' ─► STOP
        3. pick PM decomposer (team product_manager, else any eligible team-category agent)
        4. cost pre-flight: checkCostCap(...) ── over cap? ─► status='blocked', reason='failed' ─► STOP
        5. mkdir scratch sandbox; getActiveStrategy().assembleContext({synthetic req})  [Strategy port, C5]
              try/catch: assembleContext throw ─► status='blocked', reason='failed' ─► STOP
        6. run PM turn under DECOMPOSITION_TURN_TIMEOUT_MS → structured task list
              (timeout / error / 0 tasks ─► status='blocked', reason='failed'|'empty')
        7. insertProposedBetTasks(betId, taskList): for each task
              owner = eligible team agent matching ownerRole (fallback: round-robin over eligible)
              insert {betId, teamId: bet.teamId, ownerAgentId, state:'proposed'} → transitionTask(→accepted)
              ≥1 inserted ─► status='done'
        8. finally: rm scratch sandbox dir (best-effort)
                              ▼
   task_state_changed(accepted)  ─► EXISTING task-dispatcher ─► provision-registry ─► session-provisioning  [REUSE, C4]
```

No second provisioning route. Decomposition's only runtime output is **accepted tasks with owners** — exactly what the dispatcher already consumes.

**Crash recovery (closes the CAS orphan hole — see §Crash recovery).** A bet whose process dies *after* CAS set `'running'` but *before* a terminal write would be stuck on `'running'` forever (no longer NULL → CAS can never re-acquire). A boot-time sweep resolves any such orphan to `blocked/failed`.

---

## The PM turn — how context is assembled and how tasks are created

This is the load-bearing mechanism. Two parts, each pinned to real code.

### (a) Context via the Strategy port — exact synthetic request (CRITICAL-1, path **a**)

The decomposition turn honours C5 by routing PM context through `getActiveStrategy().assembleContext(...)`, exactly like session admission does — **not** inline like AH3. `ContextAssemblyRequest<HyperIdleDb>` (`strategy-port.ts:29-47`) is satisfied with a synthetic-but-honest request:

```ts
const scratchSandboxPath = path.join(sandboxBasePath, `decomp-${betId}`);
const synthSessionId = `decomp-${betId}`;          // synthetic; no sessions row is inserted
const synthTaskId    = `decomp-${betId}`;          // synthetic; NO tasks row exists yet (that is the point of decomposition)
fs.mkdirSync(scratchSandboxPath, { recursive: true });   // the decomposition service owns mkdir
try {
  await getActiveStrategy().assembleContext({
    db,
    sandboxPath: scratchSandboxPath,
    sessionId: synthSessionId,
    taskId:    synthTaskId,
    agentId:   pmAgentId,
    agentRole: pmAgent.role,
    teamId:    bet.teamId,
    isRoutine: true,                 // ← MUST be true: tells a real Strategy "do NOT read task/bet context off taskId"
                                     //   (the synthTaskId has no tasks row). Minimal ignores it; Fabric branches on it.
  });
} catch {
  // assembleContext MAY throw (strategy-port.ts:107). A throw is NOT silent:
  await markBlocked(db, eventBus, betId, "failed");   // honours C1/AC6
  fs.rmSync(scratchSandboxPath, { recursive: true, force: true });
  return;
}
```

- **Who mkdir/rm's the scratch dir:** the decomposition service. `mkdir` before the call; `rm({ recursive, force })` in the service's `finally` (best-effort, force so a missing dir is a no-op — same idiom as `workspace.destroy`).
- **Why `isRoutine: true`:** the synthetic `taskId` points to no row. `isRoutine` is the port's existing flag for "Strategy MUST NOT read task/bet context" (`strategy-port.ts:42-46`). The Fabric already handles routine via a stub `taskId`; the minimal Strategy ignores both fields (verified, `minimal-strategy.ts:83-89` — only writes scaffold + empty manifest, no DB read on a session row). So under either Strategy this is safe; under minimal the PM gets an empty scaffold and decomposes from the bet alone (the spec's intended minimal-Strategy behaviour).
- **No `sessions` row, no `tasks` row** is inserted for the scratch turn — the synthetic ids exist only to satisfy the port's string fields and the scaffold dir. This keeps decomposition off the session/task state machines (mirrors AH3's "no fake rows" `@lore`).

This path genuinely calls the port, so the C5 boundary-compliance claim is honest. (Critique CRITICAL-1 path **a** chosen over **b**; we do NOT assemble inline, so we keep the port claim.)

### (b) Task creation — deterministic insertion is the v1 PRIMARY path (CRITICAL-2)

The critique correctly flags that a session-less harness *tool call* of `propose_bet_tasks` has no grounded execution path: the tool registry is session-scoped (`ToolContext` requires non-null `agentId/sessionId/taskId/sandboxPath`, `tool-registry.ts:39-54`) and the builtin harness runs tools **internally** via `setSessionToolRegistry` inside a provisioned session (`builtin-harness-adapter.ts:8-11`, `session-provisioning.ts:586`) — AH3 ran `tools: []` precisely because no task-free tool path exists. Rather than invent one, **v1 inserts tasks directly server-side**:

- The PM turn returns a **structured task list** (the harness completion text parsed as a JSON breakdown), NOT a tool-call loop. The turn runs `tools: []` exactly like AH3.
- The server then calls **`insertProposedBetTasks(deps, betId, taskList)`** — a plain server function (not a harness tool) that performs the insert + owner-assignment + `transitionTask(→accepted)`. This is the *same insert logic* a future `propose_bet_tasks` harness tool would call; it is just invoked directly here, with no `ToolContext`.
- The real-harness-tool path (PM calls `propose_bet_tasks` mid-turn) is explicitly a **later upgrade** kept behind the `runDecompositionTurn` seam (below). It is NOT v1, so no session-less ToolContext is specified or required. When the decentralized/harness-tool path is built, `insertProposedBetTasks` becomes the tool's handler body unchanged.

**Determinism for tests.** `BetDecompositionDeps.runDecompositionTurn?` is a test-injectable override (same idiom as `AssistantTurnDeps.runTurn`, `assistant-turn.ts:75`). When present it is called INSTEAD of the real LLM turn and returns a fixed `taskList` — so integration tests assert the full seam (commit→tasks→accepted→dispatch) without LLM credentials. The override receives `{ betId, pmAgentId }` and returns `DecompositionTaskInput[]`; the service then runs `insertProposedBetTasks` on its output (so even the override exercises the real owner-assignment + accept path). **Evals** (real LLM, local-only) cover decomposition quality — OUT of scope for AK3 ACs.

This keeps decomposition Kernel-side, reuses the dispatch path, honours the port (a), and is fully buildable with **zero session-less-tool question marks**.

---

## Crash recovery — boot-time orphan sweep (CRITICAL-3)

The CAS guard `decomposition_status NULL→'running'` dedups live re-fires, but a crash after `'running'` is set and before a terminal write strands the column on `'running'` forever (no longer NULL → CAS can never re-acquire) → a bet stuck in the UI "Decomposing" state with 0 tasks → direct C1/AC3 violation. Close it with a **boot-time sweep**, registered in `server-factory.ts` right after the subscriber:

```ts
// resolveOrphanedDecompositions(db): on boot, any bet still 'running' is an orphan
// (no decomposition is in-flight at process start — the in-process turns died with the
// old process). Resolve each to blocked/failed so the surface never lies (C1/AC3).
export async function resolveOrphanedDecompositions(db: HyperIdleDb): Promise<number> {
  const res = await db.update(bets)
    .set({ decompositionStatus: "blocked", decompositionBlockerReason: "failed" })
    .where(eq(bets.decompositionStatus, "running"));
  return /* affected row count */;
}
```

- **Why "any `running` at boot is an orphan":** decomposition turns run in-process and are never resumed across a restart (mirrors AH3's `@lore §1.7`: the in-memory in-flight set is empty after a crash). So at boot, a `'running'` row can only be a dead turn. Resolving it to `blocked/failed` is correct and conservative (`failed` → "Couldn't plan the work", offering re-commit).
- **Idempotent + safe:** runs once at boot before the subscriber starts processing events; updates only `'running'` rows; a clean boot updates 0 rows.
- This makes `'running'` a **guaranteed-terminal-eventually** state under crash, satisfying AC3.

---

## Types / schemas / contracts

### Migration (`packages/db/drizzle/` forward-only, additive)
```sql
ALTER TABLE bets ADD COLUMN decomposition_status text;         -- null | 'running' | 'done' | 'blocked'
ALTER TABLE bets ADD COLUMN decomposition_blocker_reason text; -- null | 'no_eligible_agent' | 'empty' | 'failed'
```
Nullable `text`, no default — safe on both SQLite and Postgres, no dual-driver hazard. **Rollback:** drop the two columns (`ALTER TABLE bets DROP COLUMN decomposition_status; DROP COLUMN decomposition_blocker_reason;`).
Schema (`packages/db/schema.ts`, `bets`):
```ts
decompositionStatus: text("decomposition_status"),               // DecompositionStatus | null
decompositionBlockerReason: text("decomposition_blocker_reason"),// DecompositionBlockerReason | null
```

### Shared types (`packages/shared`)
```ts
export type DecompositionStatus = "running" | "done" | "blocked";
export type DecompositionBlockerReason = "no_eligible_agent" | "empty" | "failed";
export interface DecompositionTaskInput {
  title: string; description?: string; doneCondition?: string; ownerRole?: UserRole;
}
export const DECOMPOSITION_TURN_TIMEOUT_MS = 120_000; // 2 min; reuses the AH3 timeout magnitude (ASSISTANT_TURN_TIMEOUT_MS).
```
Closed enums (concept C8). Adding a variant requires a concept update.

### Decomposition service (`packages/server/src/services/bet-decomposition.ts` — NEW)
```ts
export interface BetDecompositionDeps {
  db: HyperIdleDb; eventBus: EventBus; adapterPool: AdapterPool;
  sandbox: SandboxAdapter;          // ← renamed from `workspace` (locked vocab §4: workspace→sandbox); see WARNING-6
  sandboxBasePath: string;
  resolveModel?: (tier: string) => Promise<ResolvedModel | undefined>;
  credentialResolver?: CredentialResolver;
  /** AC6 fast-timeout injection (mirrors AssistantTurnDeps.turnTimeoutMs). */
  turnTimeoutMs?: number;
  /** Test-injectable: called INSTEAD of the real LLM turn; returns a fixed task list. */
  runDecompositionTurn?: (ctx: { betId: string; pmAgentId: string }) => Promise<DecompositionTaskInput[]>;
}
/** Resolves WITHOUT throwing. Always ends bets.decomposition_status terminal ('done'|'blocked'). */
export async function runBetDecomposition(deps: BetDecompositionDeps, betId: string): Promise<void>;

/** Eligible = active AI user in the bet team's membership group whose role maps to category 'team'. */
export async function findEligibleTeamAgents(db: HyperIdleDb, betTeamId: string): Promise<User[]>;

/** Insert each task as a proposed bet task, assign an eligible owner, transition →accepted.
 *  Shared insert logic; v1 calls it directly, a future propose_bet_tasks tool reuses it verbatim. */
export async function insertProposedBetTasks(
  deps: { db: HyperIdleDb; eventBus: EventBus },
  bet: { id: string; teamId: string },
  eligible: User[],
  tasks: DecompositionTaskInput[],
): Promise<{ created: number }>;

/** Boot-time orphan sweep (CRITICAL-3). Resolves any 'running' bet to blocked/failed. */
export async function resolveOrphanedDecompositions(db: HyperIdleDb): Promise<number>;
```

### Subscriber (`packages/server/src/services/bet-decomposition-subscriber.ts` — NEW, kernel-side)
```ts
export function registerBetDecomposition(deps: BetDecompositionDeps): () => void;
// eventBus.on("bet_state_changed", e => { if (e.toState !== "active") return;
//   CAS bets.decomposition_status NULL→'running' (WHERE id=betId AND decomposition_status IS NULL);
//   if 0 rows affected → return (idempotent: re-fire / concurrent loses the race);
//   void runBetDecomposition(deps, e.betId)  // never throws; sets terminal status itself
// })
```
Idempotency (C2/AC7): the `NULL→'running'` CAS is the dedup guard — a re-fired event whose CAS affects 0 rows does nothing. Mirrors the dispatcher's `hasActiveSession` idiom.

### Owner assignment (inside `insertProposedBetTasks`) — round-robin fallback (WARNING-7)
For each task: `owner = first eligible agent whose role === ownerRole`; if `ownerRole` is absent OR no eligible agent matches that role (e.g. PM proposes a `growth` task on a builder-only team), **fall back to round-robin over the eligible list** (cycle an index across tasks for spread). **Round-robin-over-eligible is acceptable v1** — decomposition *quality* (right role → right task) is explicitly out of scope per the spec. The invariant we enforce: **every produced task lands on an eligible agent** even on role-mismatch. A test asserts this (a `growth`-role task on a builder-only team still gets a builder owner, never an empty/ineligible owner, never a per-task "fail"). `betId` is bound from the bet (NOT from agent/PM input → no cross-bet injection, mirrors `create-task` R5 D1). `ownerRole` validated via `findRoleCatalogEntry`.

### API (`packages/server/src/routes/bets.ts`)
GET `/bets/:id` (existing enriched detail handler) adds `decompositionStatus` + `decompositionBlockerReason`. No new endpoint. POST `/commit` unchanged — decomposition is event-driven, decoupled from the HTTP response so commit stays fast.

### Web (`packages/web/src/types/bet.ts` + `WorkBet.tsx`)
`BetDetail` adds `decompositionStatus?: DecompositionStatus | null; decompositionBlockerReason?: DecompositionBlockerReason | null`. `WorkBet.tsx` replaces the unconditional `EmptyState` with the four-state switch.

**Precedence follows `plans/AK3/design/approved.md` (binding): `tasks>0` FIRST, then `draft`, then `blocked`, then `decomposing`.** The lower docs `plans/AK3/design/honest-task-state/spec.md` (line ~38) and `variant.tsx` list a `draft → populated` order that hides real tasks on a draft bet that already has tasks — **that ordering is superseded; do not copy it.** (Cross-ref design-critique WARNING-1.) "Add an agent" action links to **`/work/team/{bet.teamId}`** (the `WorkTeam` page that owns the add-agent control — verified `router.tsx:78`, `WorkTeam.tsx:473`); AC4's component test asserts the link targets this real route.

---

## Boot wiring (`server-factory.ts`)
Register next to the existing registrations (~L255–315). All deps already exist locally (they feed `dispatcherDeps`): `adapterPool`, `workspaceAdapter`, `sandboxBasePath`, `makeResolveModel(db, credentialResolver)`, `credentialResolver`.
```ts
// 1. Boot-time orphan sweep BEFORE the subscriber starts (CRITICAL-3).
await resolveOrphanedDecompositions(db);
// 2. Register the kernel-side decomposition subscriber.
const disposeBetDecomp = registerBetDecomposition({
  db, eventBus, adapterPool, sandbox: workspaceAdapter, sandboxBasePath,
  resolveModel: makeResolveModel(db, credentialResolver), credentialResolver,
});
```
Add `disposeBetDecomp()` to the shutdown chain. Kernel-side (server package) — no fabric involvement, honours the boundary. (The local var is still named `workspaceAdapter` — only the new interface FIELD is `sandbox`, per the locked vocab; we do not rename the long-standing `ProvisionSessionDeps.workspace` field, which is out of AK3 scope.)

---

## Acceptance criteria + verification

| # | AC (from spec) | Verification |
|---|---|---|
| AC1 | Committing a bet produces a task breakdown without manual entry | **Integration test**: seed team+builder agent; inject `runDecompositionTurn` returning 2 tasks; `transitionBet(draft→active)`; assert ≥1 `tasks` row with `betId` set, no manual insert; `bets.decomposition_status='done'`. |
| AC2 | Produced tasks owned by eligible team agents + flow into dispatch | **Integration test**: register the real dispatcher with a stub provisionSession; after decomposition assert each task `ownerAgentId ∈ eligible`, `state='accepted'`, and `provisionSession` was invoked/attempted for ≥1 task. Plus a unit test on `insertProposedBetTasks`: a `growth`-role task on a builder-only team still lands on an eligible (builder) owner (round-robin fallback, WARNING-7). |
| AC3 | Bet never sits indefinitely with 0 tasks under a "work will start" promise; surface reflects real state | **Component test** (`WorkBet.test.tsx`): render with (a) `decompositionStatus='running'`,0 tasks → `bet-tasks-decomposing`; (b) `='blocked'`,`no_eligible_agent` → `bet-tasks-blocked` + "Add an agent" link to `/work/team/:teamId`; (c) tasks>0 (even on a draft bet) → `task-row`s, no empty (precedence). Assert the permanent "Tasks will appear" string is gone. **Plus integration** (`resolveOrphanedDecompositions`): seed a bet with `decomposition_status='running'`, run the sweep, assert it flips to `blocked/failed` (crash-orphan closed). |
| AC4 | No eligible agent → explicit blocker | **Integration test**: team with zero eligible agents; commit; assert `bets.decomposition_status='blocked'`, `reason='no_eligible_agent'`, zero tasks. **Component test**: that state renders the explicit copy + "Add an agent" → `/work/team/:teamId`. |
| AC5 | User Sovereignty: no irreversible external action bypassing review gates | **Test**: decomposition's ONLY writes are `tasks` rows + the two `bets` columns + event emits — assert no outbound network/file/MCP side effect; the PM turn runs `tools: []` (no tool surface to take an external action). Tasks reaching `review` still produce review threads via existing machinery (unchanged). |
| AC6 | Decomposing is bounded — hung/failed PM turn resolves to blocked | **Integration test**: inject `runDecompositionTurn` that rejects / hangs past `turnTimeoutMs` (set to a few ms); assert `decomposition_status='blocked'`, `reason='failed'`, never stuck on `'running'`. Honours C1 + names `DECOMPOSITION_TURN_TIMEOUT_MS`. |
| AC7 | Idempotent: duplicate `bet_state_changed(active)` → one breakdown | **Integration test**: emit the event twice; assert decomposition runs once (CAS guard), no duplicate tasks. |

---

## Ordered task list

1. **Shared enums + constant + input type** — `DecompositionStatus`, `DecompositionBlockerReason`, `DecompositionTaskInput`, `DECOMPOSITION_TURN_TIMEOUT_MS` in `packages/shared`. *(test: importable + `npm run check`.)* sharedFiles: `packages/shared` barrel.
2. **Migration + schema** — add 2 `bets` columns; forward-only SQL in `packages/db/drizzle/`; schema.ts. *(test: migration runs, columns present.)* sharedFiles: `packages/db/schema.ts`.
3. **`findEligibleTeamAgents` + `insertProposedBetTasks`** — eligibility join (reuse handoff-protocol shape); insert binds betId from the bet, assigns eligible owners with round-robin fallback, proposed→accepted. *(red tests: eligibility query; insert produces accepted owner-assigned tasks; role-mismatch still lands on an eligible owner.)*
4. **`bet-decomposition.ts` service** — `runBetDecomposition` (AH3-shaped task-free turn: model-resolve + adapter-select + **cost pre-flight `checkCostCap`** + scratch-sandbox `assembleContext` via port + `tools:[]` turn under `DECOMPOSITION_TURN_TIMEOUT_MS` + `runDecompositionTurn` override seam + `insertProposedBetTasks`); never-throws, terminal status always set; no-eligible-agent → blocked early; scratch dir mkdir/rm. Plus `resolveOrphanedDecompositions`. *(red tests: AC1, AC4, AC6, orphan-sweep.)*
5. **`bet-decomposition-subscriber.ts`** — `registerBetDecomposition`, CAS idempotency, fires only on `active`. *(red tests: AC7.)*
6. **Boot wiring** — `resolveOrphanedDecompositions(db)` then `registerBetDecomposition(...)` in `server-factory.ts` + shutdown. sharedFiles: `packages/server/src/server-factory.ts`.
7. **GET `/bets/:id`** — return the two new fields. *(red test: response carries them.)* sharedFiles: `packages/server/src/routes/bets.ts`.
8. **Web** — `BetDetail` type + `WorkBet.tsx` four-state tasks section per `approved.md` (precedence tasks>0 first; "Add an agent" → `/work/team/:teamId`). *(red component tests: AC3, AC4.)* sharedFiles: `packages/web/src/types/bet.ts`, `packages/web/src/pages/WorkBet.tsx`.
9. **Verify** — `npm run check` + `lint` + `test` + targeted integration (AC1/2/4/6/7 + orphan-sweep) + component (AC3/4).

---

## Security & abuse cases
- **Input-trust (agent-authored fields):** `insertProposedBetTasks` task titles/descriptions/doneCondition come from PM-turn output — validate with Zod (length caps 512/65536, same as `create-task`). `betId` is **bound from the bet, never agent input** (cross-bet injection prevented — mirrors create-task R5 D1). `ownerRole` validated via `findRoleCatalogEntry` (`UserRole` is `string`, NOT a closed enum — the catalog is the gate); owner resolved server-side to an eligible team agent. **Addressed.**
- **Rate-limit:** decomposition is event-driven off `commit` (human-gated POST), one per bet via the CAS guard — not a public-facing POST. **N/A (covered by commit gating + idempotency).**
- **Cost (WARNING-4):** the decomposition PM turn does NOT call `session-provisioning`, so it does NOT inherit the session cost path. Therefore the service calls **`checkCostCap(db, eventBus, { agentId: pmAgentId, teamId: bet.teamId })` itself as a pre-flight (step 4)** — if `!allowed` the turn never runs and status → `blocked/failed` (honest, no runaway). Per-event `recordCostAndCheck` accumulation (the in-loop cost ledger) is **NOT** wired for v1: the turn is a single bounded completion behind a human-gated commit, one per bet, capped by `DECOMPOSITION_TURN_TIMEOUT_MS` — the pre-flight cap gate is sufficient for v1 and there is no detached/multi-step loop to overrun mid-turn. This is the explicit v1 trade-off (pre-flight cap, no per-event accrual). `checkCostCap` is a direct Kernel import from `@hyperidle/fabric` (cost stays Kernel-side per boundary §3; not behind the Strategy port; not banned by the AK2 ESLint guard). **Addressed.**
- **Path-traversal:** scratch sandbox path = `sandboxBasePath` + `decomp-${betId}` (betId is a server-generated UUID, no user/agent path input). **N/A.**
- **SSRF / Secret-handling:** no new outbound URL; reuses the existing credential resolver. **N/A.**

## Route checklist
- GET `/bets/:id` (`packages/server/src/routes/bets.ts`) — returns `decompositionStatus` + `decompositionBlockerReason`. (Only server route touched. POST `/commit` unchanged.)
- Web link target: `/work/team/:teamId` (existing route, `router.tsx:78`) — the "Add an agent" recovery path. Not a new route; the component test asserts the link points here.

## protectedTests
- `packages/server/src/__tests__/bet-state-machine.integration.test.ts` — `transitionBet` behaviour unchanged (decomposition is additive, off the event).
- `packages/fabric/src/services/__tests__/*lifecycle-propagation*` and `*task-dispatcher*` — dispatch/propagation behaviour unchanged (we only feed it accepted tasks).
- `packages/server/src/services/__tests__/*assistant-turn*` (AH3) — pattern reused, not modified.

## sharedFiles
`packages/db/schema.ts`, `packages/shared` (barrel), `packages/server/src/server-factory.ts`, `packages/server/src/routes/bets.ts`, `packages/web/src/types/bet.ts`, `packages/web/src/pages/WorkBet.tsx`.

## Risks / open (all RESOLVED)
- **R1 (eligibility predicate) — RESOLVED:** `UserRole` is `string` (open) → the gate is the role catalog. Eligible = active AI user in the bet team's membership group whose role maps (via `findRoleCatalogEntry`) to `category === "team"` (includes `builder`/`product_manager`/`growth`/`brand_voice`; excludes `strategy` facilitators + `individual` assistants). Use `AGENT_ROLE_CATALOG`/`findRoleCatalogEntry` from `@hyperidle/shared`. A team with only strategy/individual members → no eligible owner → `no_eligible_agent` (AC4). Decomposition quality (which role gets which task) out of scope; round-robin fallback is v1 (WARNING-7).
- **R2 (task-free tool execution) — RESOLVED (CRITICAL-2):** v1 does NOT execute a harness tool task-free. The PM turn runs `tools: []` (like AH3) and returns a structured list; the server inserts via `insertProposedBetTasks` directly. The harness-tool path (`propose_bet_tasks`) is a later upgrade behind the `runDecompositionTurn` seam — no session-less ToolContext is specified or needed.
- **R3 (Strategy-port under task-free turn) — RESOLVED (CRITICAL-1):** `assembleContext` is called with a fully-specified synthetic request (real scratch sandbox dir, synthetic session/task ids, `isRoutine: true`); a throw → `blocked/failed`. Verified minimal `assembleContext` writes only scaffold files + empty manifest, no DB write coupled to a real session row (`minimal-strategy.ts:83-89`), so the synthetic ids are safe.
- **R4 ("Add an agent" route) — RESOLVED:** target is `/work/team/:teamId` (`router.tsx:78` → `WorkTeam.tsx`, which owns the add-agent control). AC4's component test asserts the link targets it.
- **R5 (CAS crash-orphan) — RESOLVED (CRITICAL-3):** boot-time `resolveOrphanedDecompositions` flips any `'running'` bet to `blocked/failed`, making `'running'` eventually-terminal under crash (AC3).
