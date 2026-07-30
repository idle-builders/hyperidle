# AU23 — Resolve agent-orchestration's remaining live-context core-api reads (dispatch task-queue/assistant-turn + run-orchestration context assembly)

## Work package

**Work package.** As a maintainer, I want `agent-orchestration` to reach ZERO core-api domain reads for the last ten consumer::provider pairs AU21 left open — `dispatch`'s task-queue and assistant-turn runner, and `run-orchestration`'s per-session context assembly — so that the boundary seam AU21 built is actually complete, not "complete except for the ten pairs nobody could decide how to migrate."

**Why this matters.** AU21's Increment 9 forensic-triage wave closed 5 of AU21's original 15 remaining boundary-edge findings (3 dead-code deletions, 2 bounded permanent allowlist exceptions) but explicitly declined to rush the other 10 — not because they're low-value, but because they're the system's most live, most sensitive paths (task dispatch, assistant chat, every agent session's context) and architecture.md's own Decision B left the resolution genuinely undecided ("bake at emit OR agent pulls via MCP" — two sanctioned options, neither chosen). Guessing wrong here, inside a forensic-accounting wave with no dedicated test-first design pass, risks exactly the kind of in-flight redesign this WP's own discipline forbids. This work package is that dedicated pass.

**What exists today.** `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set names the ten pairs explicitly (not silently excluded — see its own doc comment and `edge-disposition.md`'s "Increment 9 forensic-triage accounting" section for the full per-pair reasoning):

- `dispatch::work` — the task-queue's `startupSweep`/`handleTaskStateChanged`/`handleSessionEnded` read `ports.work.listTasks`/`getTaskById` to decide which accepted tasks need dispatching. Note: `@hyperidle/work`'s `task-state-machine.ts` ALSO already bakes+records a `task_run` intent unconditionally whenever a task transitions to `"accepted"` with an owner (confirmed by reading the real code) — meaning `dispatch`'s own task-queue may be partially or fully redundant with the already-working `task_run` baked-intent mechanism, not merely un-migrated. This work package's feasibility pass must determine whether `dispatch`'s task-queue does anything `task_run` doesn't already do (the `GET /api/dispatch-queue` "waiting for capacity" display is the one confirmed real behavior depending on it) before deciding migrate-vs-delete.
- `dispatch::conversation`/`dispatch::users`/`dispatch::settings` — the assistant-turn runner (`runTurnInternal`) reads the live conversation transcript, resolves/creates the assistant's own user row, and reads server config (model/cost) at RUN time, not admission time.
- `run-orchestration::knowledge`/`::org`/`::routine`/`::settings`/`::users`/`::work` — `context.ts`'s per-session context assembly (`RunOptions`/`RunTransitionSpec`/`RuntimeDeps`), the largest single remaining cluster, needed by every one of the seven session-request families at RUN time, not admission time.

**What's genuinely missing.** A settled design decision — for each of these three clusters — on which of Decision B's two resolutions applies (bake the needed context into the already-baked `AgentSessionRequest`/intent payload at EMIT time, vs. let the agent pull live context via its own MCP tools at RUN time, vs. some third option this work package's research surfaces), followed by the actual migration.

**Depends on.**
- **AU21** — this work package closes the ten pairs AU21's own anti-regrowth guard (`DEFERRED_FOLLOWUP`) names as its starting scope; it cannot be scoped tighter than "these ten pairs" until AU21 ships and this list is confirmed stable.

**Complexity.** L

**Engineering tier.** production — these are live, high-traffic paths (every session launch, every assistant turn, every task dispatch decision).

**Pre-build gates.**
- **Refinement:** Required — "bake at emit vs. MCP pull vs. something else" is a genuine three-way fork with real product/architecture consequences (a baked context can go stale mid-run; an MCP-pull adds a tool round-trip cost to every session start) that `/refine` should pin down before `/architecture` designs against a fuzzy target.
- **Design:** Not required — backend/infra, no UI surface (the one UI-adjacent artifact, `GET /api/dispatch-queue`'s snapshot display, is existing and out of scope to change, only to keep truthful).

**Human review gates.** Yes — mandatory for every work package. Forecast: high-friction, matching AU21's own review cadence — this re-touches the same live session-launch and assistant-chat paths AU21's Increments 1-8 already reasoned about carefully.

**Plan calls.**
- Investigate `dispatch`'s task-queue for genuine redundancy with `task_run`'s already-working baked-intent mechanism (`@hyperidle/work`'s `task-state-machine.ts`) BEFORE assuming a migrate-in-place fix — deleting genuinely-dead scheduling logic is a different (smaller, safer) fix than baking it.
- For `run-orchestration`'s context-assembly cluster, treat Decision B's "bake at emit OR agent pulls via MCP" as a real fork requiring its own design-it-twice pass, not a foregone conclusion.
- Cross-reference `edge-disposition.md`'s "Increment 9 forensic-triage accounting" section (the per-pair real-source citations) as the starting worklist — this is not a re-discovery task.

**Contracts / constraints.**
- Zero regression to `AU21`'s already-shipped behavior: the resolve-at-emit pattern for the other 25 (of 35 total enumerated) pairs, the `CoreApiPort`/`AgentOrchestrationPort` seams, the routine-runs-as-sessions collapse, and Decision B‴'s supersede/deliver-on-next-turn mechanism must all stay green throughout.
- Whatever migration mechanism is chosen must not reintroduce a raw DI read from `agent-orchestration` into `core-api` for these ten pairs — the anti-regrowth guard (fully wired into `npm run lint` as a bare check by the time this ships, per AU21's own closure) must go green with `DEFERRED_FOLLOWUP` for these ten pairs REMOVED, not re-added elsewhere.
- No stub/mock of the harness or a fabricated context stands in for proof that a migrated context-assembly path produces the same real session behavior as today.

**Out of scope.**
- Any of AU21's other 25 pairs (already resolved — dead/allowlisted/baked/seam-routed).
- AU22's mid-run injection question (a different capability — delivering a live update into an ALREADY-RUNNING session — not context assembly at session START).
- Rebuilding or wiring up the orphaned `settings` `kind:"trigger"` config feature (`SettingsAgentBehavior.tsx`'s "Triggers" tab) — flagged by AU21's forensic-triage wave as a pre-existing, unrelated product gap, not this work package's concern unless a future work package scopes it explicitly.

## Acceptance criteria

- `dispatch::work`, `dispatch::conversation`, `dispatch::users`, `dispatch::settings`, `run-orchestration::knowledge`, `run-orchestration::org`, `run-orchestration::routine`, `run-orchestration::settings`, `run-orchestration::users`, `run-orchestration::work` are each removed from `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set, with `inspect(process.cwd())` still returning zero findings.
- For `dispatch::work` specifically: a documented, source-verified determination of whether `dispatch`'s task-queue subsystem is genuinely redundant with `task_run`'s baked-intent mechanism, and either its removal (with the `GET /api/dispatch-queue` display migrated to a truthful replacement or deprecated) or its live-state need is preserved through a resolution that does not read core-api directly.
- For the other nine pairs: context needed at session-run/turn time is resolved via ONE of Decision B's sanctioned mechanisms (baked at emit, or a documented agent-side MCP pull), chosen deliberately per cluster with reasoning recorded, not defaulted.
- Existing assistant-chat, task-dispatch, and session-launch integration tests continue to pass unchanged in behavior (a context-assembly migration must not observably change what context a session receives, only where it's resolved from).
- `npm run verify` green.

## Validation scenarios

- Given a task transitions to "accepted" with an owner, when the dispatch/task-run mechanism decides whether to launch a session, then the decision no longer requires `dispatch` to read `work` directly (either because the redundant path is removed, or the decision is now sourced without a direct cross-layer read).
- Given a user sends a message that triggers an assistant turn, when the turn runs, then the assistant still receives the correct transcript, resolved identity, and model/cost config — proven by an integration test — without `dispatch` reading `conversation`/`users`/`settings` directly.
- Given any of the seven session-request families launches a real session, when `run-orchestration` assembles that session's context, then the context is correct and complete (same real behavior as today) without a direct `knowledge`/`org`/`routine`/`settings`/`users`/`work` read at run time.
- Given the anti-regrowth guard's bare check is now part of `npm run lint` (post-AU21), when this work package ships, then the guard is green with `DEFERRED_FOLLOWUP` empty (or this work package's own residual, if any, re-justified in `ALLOWLIST` with the same rigor bar).
