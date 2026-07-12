# AU15 — Definition of Done

Each acceptance criterion → concrete verification. Per CLAUDE.md: runtime behavior → automated test (imports code, asserts behavior); static property → lint/guard (not grep-in-a-test). Gate: `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service` (the routine + intent paths hit real DB/txns → service integration lane).

## AC-1 — routine selection no longer calls `agent-selection.ts` at fire-time; resolved through the intent-queue/drain path

Two-part verification.

- **Static (the edge is gone):** `scripts/au6-agent-boundary-guard.ts` extended with a zero-allowlist rule — `routine-scheduler.ts` importing from `agent-selection` is a finding; its `--fixtures` self-test asserts both the positive (import present → finding) and negative (import absent → clean) cases. Runs in `npm run lint`. Backstop: `npm run check` (removing the import + `delegatedTo` type-checks) and the existing `au9`/`au11` guards stay green.
  - Type: **lint guard** (static codebase property).
- **Runtime (drain path resolves the agent):** `agent-work-intent-worker.routine-selection.integration.test.ts` — a recorded `routine_run` intent, drained, produces a handed-off `AgentSessionRequest` whose target agent is chosen by `resolveAuthoritativeInput` (owner when not at WIP; delegate when owner at WIP + delegate available). Asserts on `agentSessionRequests`/intent `status="handed_off"` + `defaultAgentId`.
  - Type: **service integration test** (`*.integration.test.ts`).

Decision recorded in `architecture.md §3`: drain-time (moved), fire-time requirement proven not real (provision-time WIP already authoritative). The "formalized second mode" branch is explicitly **not** taken.

## AC-2 — WIP-limit + owner-role resolution produce the same effective outcome under the new timing, for every built-in routine

- **Built-ins (the 5 named):** `builtin-routines.integration.test.ts` — assert `practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion` each still run via `runBuiltinRoutine`, write a terminal `routineRuns` row, and attribute output to `routine.ownerAgentId`. They never invoked fire-time selection, so behavior is unchanged; add an explicit owner-attribution assertion if the existing suite lacks one.
  - Type: **service integration test**.
- **WIP effective outcome (generic path):** `session-provisioning`'s `ConcurrencyLimitError` is the authoritative WIP gate — covered by (a) R1's owner-at-WIP → delegate case, and (b) a case asserting an owner-at-WIP + no-delegate intent defers (request released to pending/retry, `routineRun` stays `running`, no second run) rather than erroring terminally.
  - Type: **service integration test**.

## AC-3 — if timing moved fire→drain, validation rules out (or documents/accepts) the fire↔drain race

- **Documented + tested.** `architecture.md §8` argues the race is *resolved* (WIP evaluated at drain + provision, the points closest to execution) and enumerates the three anti-double-run guarantees (idempotency key, CAS-lease claim, fire-time coalescing).
- **Test:** coalescing test (R3) — with an in-flight `routineRun(running)`, a second `checkAndFireRoutine` writes no second run/intent (`{fired:false, reason:"previous run still in progress"}`). Idempotency test — recording the same `routine_run` intent twice yields one row (covered by `recordAgentWorkIntent`'s existing dedupe; assert in R1's setup or reuse `agent-work-intent-*.integration.test.ts`).
  - Type: **service integration test** + architecture-doc analysis.

## AC-4 — AU8's should-graph guard requires no special-cased allowlist entry for this edge

- **Static.** After AU15, `routine-scheduler.ts` (Core) imports nothing from `agent-selection.ts`; the residual Core→Agent edge that AU11 filed for an AU8 allowlist no longer exists. Verified by the AC-1 `au6` rule (finding if the import returns) — so a future AU8 graph guard needs no carve-out for this edge. `server-factory.ts`'s stale `@lore AU11` residual-edge note is replaced (comment; `npm run check` compiles).
  - Type: **lint guard** (the AC-1 guard doubles as the AC-4 proof) + doc update.

## Read/write-ownership (founder directive — verified, not asserted)

- **routines / routineRuns:** `scripts/au13-work-routine-ownership-guard.ts` (zero-allowlist, in `npm run lint`) — fails on any raw `.from/.insert/.update/.delete` outside `work-service.ts`/`routine-service.ts`. AU15's new coalesce read (`findRunningRoutineRun`) and drain-resolver reads (`getRoutineRunById`/`getRoutineById`) route through `routine-service.ts`; `routine-scheduler.ts` + `agent-work-intent-worker.ts` are not allowlisted, so any regression is caught. **Verification = guard stays green.**
- **agent_work_intents:** AU15's only write is `recordAgentWorkIntent`; only reads are inside the owner module. New `au6` rule (AC-1 §static) also flags a raw `agentWorkIntents` `.from/.insert/.update/.delete` in `routine-scheduler.ts`. The broader single-owner guard is out of AU15 scope (3 pre-existing non-owner accessors — `routes/threads.ts`, `routes/sessions-routes.ts`, `agent-layer-boot.ts`) and logged as a separate future WP.
  - Type: **lint guard** (au13 existing + au6 extension) + scoping note.

## Gate (all green before done)

`npm run check` · `npm run lint` (biome + eslint + au3/au6/au7/au9/au10/au11/au13/au14 guards) · `npm run test` · `npm run test:integration:service`. Evals (`delegation.ts` repointed) are ungated/release-lane; repoint them for honesty, do not gate on them.
