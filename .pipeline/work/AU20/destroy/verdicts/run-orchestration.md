# run-orchestration — destroyer verdict

## Should this service exist?

**KEEP — this is the engine room.** This package spawns, provisions, executes, and finalizes agent runs, and it owns the `sessions` table. Agents as first-class participants is what HyperIdle *is*; delete this and the product is a chat app with no agents. It has also already been destroyed twice (AU20 first pass absorbed three services, AU21 stripped it to a blind executor), so the survivors are mostly spine.

That does not make it clean. It still carries: a **dead feature** (effectiveness scoring — no production writer anywhere, only a demo-data seeder), a **second way to start a session** (legacy bare runs, kept "for tests and deployments that haven't wired the harness"), a **test-only run mode** (`assemble`), a **test-only execution seam** baked into a production type, a **test-only subpath export** (`scaffolding.ts`), **DI self-injection theater** (the composition injects this package's own `startWatcher` back into this package through a ports bag), two **dead interface members**, and a type mirror (`RuntimePorts.sessionRequests`) whose multiplexed signatures force `as` casts at every call site.

## If written today, from scratch

- `startRuntime` — boot: drain loop, worker ingress, writeback subscriber, reapers, recovery
- `runSession` — durable mode (+ one-shot for the eval bench)
- `transitionRun` — terminal transitions where a runtime is live
- `createProvisioner` (internal) — admit + run one session in a sandbox: the product core
- internal plumbing it composes: `createContextAssembler`, `createWorkerIngress`, `createWritebackProcessor`, `createRuntimeReapers`, `startWatcher`, `mountFilesystemsForAgent`, `buildProvisioningPlan`, `applyProvisioningPlan`
- `sessions` accessors behind real screens: `findSessionById`, `listSessions`, `countActiveRunsByAgent`, `listLatestOutcomeByTask`, `listRunSummaries`, one CAS terminal writer, `writeSessionNotes`
- core's two downward commands: `endRunForHandoff`, `requestRunStopForTasks`

Everything outside that shape is cut below.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 12 |
| KEEP | 8 |

Surface: 23 methods → 21 methods (9% of method count — but the real cut is 3 whole features, 2 run-mode/seam surfaces, 2 dead members, and 5 of 21 type declarations; see feature kills).

Types/ports: 21 declarations → 5 DELETE, 8 SIMPLIFY, 8 KEEP.

## Feature-level kills

1. **Effectiveness scoring (AC1) — dead feature.** `sessions.effectivenessScore/RecordedAt/RecordedBy` has **no production writer**. The only writers are the PATCH route's effectiveness branch (no UI, no agent tool, no subscriber calls it — confirmed across layers/framework/applications) and `tools/setup/src/demo-world/activity.ts`, which seeds fake scores so the badge renders in demos. The UI badge (`layers/core-ui/src/pages/WorkTask.tsx:88`) is permanently empty in real use. Kill: the effectiveness-only PATCH branch in `layers/agent-orchestration/src/routes/sessions.ts`, `recordSessionMetadata`, the effectiveness fields of `endSessionByCas`/`EndSessionByCasInput`/`RunSummary`, the three DB columns, the api-contract fields, the UI badge, the demo seeding. Breaks: nothing — nobody feeds it. A metric nobody writes is enterprise theater.
2. **Bare runs — a second way to start a session.** `createBareRun` fires only when the deployment wired no execution adapters; the route comment says it exists "for tests and deployments that haven't wired the harness" (`layers/core-api/src/routes/sessions-routes.ts:120`). Every real deployment wires builtin at minimum. Kill: `createBareRun`, `CreateBareRunInput`, seam route `POST /api/agent-orchestration/runs/bare`, port method `runs.createBareRun`, the legacy branch of `POST /api/sessions`. Breaks: a harness-less deployment cannot create a session row — acceptable, it could never run one.
3. **`assemble` run mode — test-only.** `runSession({mode:"assemble"})` has zero production callers; only core-api parity tests and this package's own tests use it, and `runtime.ts:479` even probes an untyped `deps.assemble` hook that exists in no declared type. Kill the mode, both union arms in `RunOptions`/`RunResult`, and the hook. Tests re-target `createContextAssembler` directly or die.
4. **`RuntimePorts.sessionProvisioner` — a test seam in a production type.** Its own doc says "Test-only execution seam; production runSession binds the internal provisioner" (`contracts.ts:188`). Tests must not drive production surface. Kill the member; tests stub at the adapter-pool level.
5. **`scaffolding.ts` subpath — test-only export file.** `@hyperidle/run-orchestration/scaffolding` is imported by exactly two test files. Kill the file.
6. **startWatcher DI self-injection loop.** `run-orchestration-composition.ts:76` injects this package's own exported `startWatcher` back into this package's context assembler via `composition.context.filesystems.startWatcher`. `context.ts` imports it directly instead; kill the barrel export, the `FilesystemsReader`/`ContextAssemblyPorts` mirror, `RuntimeDeps.composition.context`, and the `FileWatcher`/`FileWatcherConfig` exports.
7. **Dead members:** `RuntimeReapers.reapSandboxes` (zero callers anywhere, prod or test) and `WritebackProcessor.process` (zero production callers; the factory collapses to the subscriber function).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `buildProvisioningPlan` | INTERNAL (provisioner.ts:1425) | SIMPLIFY | Core value — agents hold their own credentials (Ethos 2) — but the barrel export serves only core-api tests; unexport, keep internal. |
| 2 | `applyProvisioningPlan` | INTERNAL (provisioner.ts:1429) | SIMPLIFY | Same: real work, test-only export. Unexport from barrel. |
| 3 | `createContextAssembler` | INTERNAL (runtime.ts, start-runtime.ts) | SIMPLIFY | Keep the assembler; kill the self-injection ports param (import `startWatcher` directly) and the test-only `scaffolding.ts` subpath. |
| 4 | `createBareRun` | UI:POST /api/sessions (legacy branch) + seam POST /runs/bare | DELETE | Second way to start a session, kept for tests/back-compat; kill callers, seam route, and port method with it. |
| 5 | `endRunForHandoff` | UI:POST /api/tasks/:id/handoff, AGENT:handoff_to | KEEP | Handoff between agents/humans is core collaboration; the three documented no-CAS/no-emit/no-outcome differences are load-bearing. |
| 6 | `startWatcher` | INTERNAL (context.ts, via DI loop) | SIMPLIFY | Sandbox change detection feeds shared-knowledge writeback — core. But de-loop the DI theater: direct import, kill barrel export. |
| 7 | `mountFilesystemsForAgent` | INTERNAL (provisioner Phase 4.5) | SIMPLIFY | Mounting injected filesystems is core agent capability; barrel export serves only a core-api test — unexport. |
| 8 | `createProvisioner` | INTERNAL (start-runtime, runtime) | KEEP | The spine: admit + run a session. 1,871 lines is heavy but it IS the product; every agent run goes through it. |
| 9 | `requestRunStopForTasks` | UI:POST /api/bets/:id/kill + seam /runs/stop-for-tasks | SIMPLIFY | Killing a bet must stop its runs — core. But `STOP_DISPOSITIONS` is a one-key map behind a `reason` param with one legal value; drop the param and map. |
| 10 | `createRuntimeReapers` | INTERNAL (start-runtime.ts:421) | SIMPLIFY | Routine reap + sandbox sweep are live; `reapSandboxes` member has zero callers anywhere — delete it. |
| 11 | `runSession` | INTERNAL (start-runtime drain, durable) + eval bench (one-shot) | SIMPLIFY | Durable is production; one-shot is the eval bench's door (Track AS, founder-valued). `assemble` mode + the untyped `deps.assemble` hook are test-only — delete. |
| 12 | `findSessionById` | UI:GET /api/sessions/:id/activity, /starts/:startId, seam sessions/:sessionId | KEEP | Sessions is a core primitive; this is its read. Multiple real screens (activity feed, start-projection polling, handoff resolution). |
| 13 | `listSessions` | UI:GET /api/sessions/ | SIMPLIFY | Conversations page queries task_id+state=active only; the agentId filter and limit/offset paging have no caller — drop them. |
| 14 | `countActiveRunsByAgent` | UI:GET /api/agent-orchestration/runs/active-counts | KEEP | Live agent state on the roster/recipients screens — core visibility into what agents are doing. |
| 15 | `listLatestOutcomeByTask` | UI:GET /api/agent-orchestration/runs/latest-outcomes | KEEP | Task-list run state — how humans see agent work land. |
| 16 | `listRunSummaries` | UI:GET /api/agent-orchestration/runs | SIMPLIFY | Run history per task/agent is core; drop the `effectivenessScore` column with the dead feature. |
| 17 | `endSessionByCas` | UI:PATCH /api/sessions/:id | MERGE | Fold with `transition-run.ts`'s private `updateSessionRow` — two CAS terminal writers in one package is one idea twice. Preserve the emit-gating invariants; drop effectiveness fields. Door stays: the only unstick for a hard-crash-orphaned run. |
| 18 | `recordSessionMetadata` | UI:PATCH /api/sessions/:id (effectiveness-only branch) | DELETE | Its only door branch serves effectiveness scoring, which has no production writer; dies with the feature, branch and all. |
| 19 | `writeSessionNotes` | AGENT:write_session_notes | KEEP | An agent recording what it did is shared-knowledge core; real tool door. |
| 20 | `startRuntime` | BOOTSTRAP (agent-orchestration boot.ts, remote-server create-server) | KEEP | The composition root of the whole engine: drain, ingress, writeback, reapers, recovery, disposal. |
| 21 | `transitionRun` | UI:PATCH /api/sessions/:id + INTERNAL (run-transition service, start-runtime) | SIMPLIFY | Core transition engine, but the 4-armed spec union returns `Promise<unknown>` and callers cast; split into honestly-typed operations. Delete the two dead `void ports;` statements (lines 44, 66). |
| 22 | `createWorkerIngress` | INTERNAL → worker WebSocket door via `RuntimeHandle.registerWorkerWebSocket` (boot.ts:400) | KEEP | Remote workers are the shared-backend deployment story; Zod-validated worker protocol is the agent-execution door. |
| 23 | `createWritebackProcessor` | INTERNAL (start-runtime.ts:419, event: sandbox_writeback_changes_detected) | SIMPLIFY | Writeback into shared knowledge is core. But the `process` member has zero production callers — collapse the factory to the subscribe function. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `HeldConnectionForProvisioning` | KEEP | Port member shape for the live spawn-time connection read; Mechanism C (machine-enforced boundary) forces the structural twin. |
| `HeldConnectionsReaderPort` | KEEP | Wired live in boot.ts; agents holding their own credentials is Ethos 2. |
| `ServiceConnectionResolverPort` | KEEP | The ONLY plaintext token path (AN1 hard rule 1); Application-composed by design. |
| `ProvisioningPlan` | SIMPLIFY | Its own @lore says "removed from barrel — no cross-package consumer" yet index.ts:26 still exports it. Remove from barrel; keep file-local for tests. |
| `RuntimePorts` | SIMPLIFY | The session-requests mirror multiplexes 6 `findSessionRequest` overloads and a 5-armed `transitionSessionRequest` returning an 8-way union — every caller casts (`as Promise<...>`). Split into named members with honest types. DELETE the `sessionProvisioner` member (self-documented test-only seam). |
| `RunResult` | SIMPLIFY | Drop the `assembled` arm with the assemble-mode kill; the `Awaited<ReturnType<ReturnType<typeof import(...)>>>` gymnastics goes with it. |
| `RunOptions` | SIMPLIFY | Drop the `assemble` arm. Durable + one-shot remain. |
| `RunTransitionSpec` | SIMPLIFY | Survives only as transitionRun's parameter; shrinks when transitionRun's union is split. |
| `RunTransitionResult` | DELETE | Alias of `Awaited<ReturnType<transitionRun>>` = `unknown`. A named type for `unknown` with zero production consumers. |
| `RuntimeDeps` | SIMPLIFY | The DI root, keep — but `composition.context` dies with the startWatcher de-loop, and several `Parameters<typeof import(...)>` chains flatten with the other kills. |
| `RuntimeHandle` | KEEP | startRuntime's owned-resource contract; boot uses both members (registerWorkerWebSocket, dispose). |
| `AgentTerminationReason` | DELETE | Zero external consumers, and transition-run.ts:30 declares its own private duplicate — the export is a stale mirror. |
| `CreateBareRunInput` | DELETE | Dies with createBareRun. |
| `FileWatcherConfig` | DELETE | No external consumer (composition imports only the function); becomes file-internal after the de-loop. |
| `FileWatcher` | DELETE | Same — the one-member (`stop`) handle type stays file-internal. |
| `FilesystemForProvisioning` | KEEP | Port member shape for the live filesystem read; Mechanism-C twin of `@hyperidle/filesystems`' own type. |
| `InjectedFilesystemsReaderPort` | KEEP | Wired live in boot.ts; injected filesystems into the sandbox is core agent capability. |
| `SessionLifecycleAgentRunConfigReader` | KEEP | Live per-agent config read at spawn (system prompt, harness, model); wired at composition.ts:388. Mechanism-C cost, one honest member. |
| `StoppedRun` | KEEP | The seam wire type for bet-kill; core writes one propagation-log hop per stopped run — a count could not serve that. |
| `RunSummary` | SIMPLIFY | The 8-column projection is right; drop `effectivenessScore` with the feature. |
| `EndSessionByCasInput` | SIMPLIFY | Drop `effectivenessScore`/`actor` with the feature; the rest is the CAS input. |

## Holes this leaves

- **A harness-less deployment cannot create sessions** (bare runs gone). Acceptable: it could never run them, and the explicit-start path is the one real door.
- **Effectiveness history is gone.** Nothing real ever wrote it; demo worlds lose a fake badge.
- **Two core-api parity tests lose their door** (`context-bundle-sandbox-byte-parity`, `session-knowledge-assembler-ranking-parity` ride assemble mode). Rewrite against the durable path or delete with the mode.
- **The endSessionByCas/updateSessionRow merge is delicate.** The no-emit rules for handoff (spurious review items) and the persisted-vs-emitted outcome split are asserted invariants; the merged CAS helper must keep both, or reviews fire on every handoff.
- **PATCH /api/sessions/:id remains an API-only door** — no UI button ends a stuck run, and the reaper covers routine sessions only, so a hard-crash-orphaned task run is curl-or-nothing. That hole predates this pass; named here so the founder can price a UI affordance or a broader reaper.
- Known-weak negatives were re-checked with `rg -a` across layers/framework/applications/tools before every DELETE/TEST-ONLY call; the graph's zero-door results for the bootstrap spine (startRuntime etc.) were confirmed as BOOTSTRAP wiring, not death.
