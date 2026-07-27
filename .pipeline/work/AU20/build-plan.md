# AU20 — Incremental build plan (execution plan of record)

**Founder-approved 2026-07-17.** All structural merges land in THIS work package. Execution is a **sequential** series of increments; each increment is **test → code → review → verify → commit → repeat**. Low blast radius: every commit is green, every increment independently verifiable, and a mid-run stop leaves a clean committed prefix.

## Global build constraints (apply to every increment)

- **Discriminated unions, never any-bags (R3 — the load-bearing risk).** A parameterized general interface (`list(filter)`, `get(entity,id,{include})`, `transition(spec)`) must be typed via a pinned entity→row registry and return types **conditional on the discriminant/`include`** — never a widened `RowOf<E> | Enriched` union that forces callers to re-narrow. Enforced in `work`, `review`, `session-runtime`.
- **DI-port TYPE re-exports are not product surface.** Bundle each service's inbound `*Ports`/`*Deps`/`*Accessor`/`*Reader`/`*Writer` type mirrors into ONE `<Service>Deps` contract wired once at the composition root. This is the single biggest mechanical win (e.g. dispatch: 58% of surface).
- **No behavior change except the 3 named correctness bugs.** Reductions collapse surface, never behavior. `npm run verify` (or the affected slice) green after every increment.
- **Merges move reads AND writes together (R1).** A table-ownership move that covers writes but not reads gets reopened (AU12–14). Each merge relocates tables + ports + reads + writes atomically, guards green (`table-ownership-guard`, `composition-boundary-guard`).
- **Verify cadence:** per-increment = affected slice (`npm run check` + `npm run lint` + affected tests) for boundary-stable collapses; **full `npm run verify`** before AND after every merge increment, and once at the very end.
- **Commit discipline:** one increment = one commit, imperative mood, references AU20 + the increment id. Never commit red.

## Increment sequence

### Batch 0 — correctness bug fixes (independent, proves the machinery)
- **I0a — `log_task` lost-update race.** New atomic `appendTaskNote(exec, taskId, entry)` in `work` (mirrors `incrementBetCost`'s `sql\`\`` atomic write; no read-modify-write, no CAS); rewrite `log-task.ts`; port + binding. Failing-first concurrency integration test (two overlapping appends, no note lost).
- **I0b — duplicate `getTeamMembersById` / agent reads in `cost-cap.ts`.** Inline the already-loaded row; delete the dead private helpers. Counting-stub test asserts single fetch.
- **I0c — duplicate `getUserById` across the session chain.** Thread the already-loaded agent row into `buildSessionContextData` (additive optional param). Counting-stub test asserts no re-fetch. (Do NOT touch the routine-session read — different function.)

### Batch A — boundary-stable per-service API collapses (deep-first; each = 1 increment)
Spec per service = `.pipeline/work/AU20/analysis/services/<service>.md`. Migrate every caller; verify affected slice.
A1 knowledge 138→32 · A2 notifications 89→18 · A3 harness-registry 79→15 · A4 work 84→~35 · A5 session-requests 65→20 · A6 filesystems 61→24 · A7 dispatch 59→8 · A8 review 48→13 · A9 git-export 47→20 · A10 tool-handlers 42→4 · A11 users 38→19 · A12 org 36→20 · A13 settings 36→18 · A14 connections 34→18 · A15 conversation 34→19 · A16 policy 32→8 · A17 routine 24→15 · A18 cost 25→11 · A19 observability 23→7 · A20 agent-selection 19→9 · A21 realtime 12→5 · A22 model-gateway 6→4

*(The 8 services absorbed by merges — context-assembly, session-lifecycle, capture-writeback, run-orchestration, trigger-resolution, lifecycle-projection, tool-provider, mcp-provider — are NOT collapsed standalone; their surface is slimmed inside their merge increment. A3/A5 slim the merge anchors harness-registry/session-requests first.)*

### Batch B — structural merges (on already-slim surfaces; full verify each; reads+writes together)
- **B1 — durable-agent-queue:** fold `trigger-resolution` + `lifecycle-projection` into `session-requests` (move `triggerResolutionHistory` + `agentLifecycleInbox` tables, ports, reads+writes; delete 2 packages; removes 2 dependency cycles).
- **B2 — session-runtime:** fold `session-lifecycle` + `context-assembly` + `capture-writeback` into `run-orchestration` (rename → session-runtime); internalize their surfaces; strengthen single-writer custody.
- **B3 — agent-execution-platform (LAST, behind dep-isolation proof):** fold `tool-provider` + `mcp-provider` into `harness-registry`. mcp-provider's Hono + MCP-SDK runtime deps MUST stay behind a dep-isolated entrypoint the remote-worker build excludes, or the zero-DB Mechanism-B seam breaks. If isolation can't be guaranteed cleanly, keep the transport router server-side and fold only the enforcement/bridge-registry.

### Batch C — dissolves + relocations
- **C1 — retention distributed dissolve:** each expired-row sweep becomes a `Reapable(reapExpired(now))` next to its owning schema (users/knowledge/notifications); generic `startReaperSweeps` scheduler + the unowned `propagation_log` reaper home at the composition root. NOT into dispatch.
- **C2 — cross-service relocations:** `checkAndUnblockDependents` → work; practice-meeting → knowledge (ownership moves; reads+writes together).
- **C3 — shared-module relocations:** pure helpers (initials, tool-arg summaries, cron helpers) → `@hyperidle/shared`.

### Close-out
- Re-run the surface index (the service-data-package script) for a fresh baseline; full `npm run verify` green; all guards green; then Phase 9 retro → Phase 10 final review → ship.

## Per-increment cycle (the workflow enforces this)
1. **test** — write failing tests for the increment's target behavior/contract (red).
2. **code** — implement the target design; migrate all callers (green).
3. **review** — adversarial review against the increment spec + global constraints; builder applies fixes (≤3 rounds).
4. **verify** — affected slice (or full, per cadence); fix until green.
5. **commit** — one commit referencing AU20 + increment id.
