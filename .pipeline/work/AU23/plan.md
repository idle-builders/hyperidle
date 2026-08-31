# AU23 — agent-orchestration's last eight core-api reads

**Status: PROPOSED — pending a founder decision.** Downgraded from "planned" on 2026-07-30. AU23 was
registered mid-implementation, during AU21's Increment 9 triage wave, as an already-decided closure
owner for AU21's remaining boundary edges — alongside a claim that AU21 was ready to ship with its
AC #2 satisfied. That was rejected: descoping a work package's own headline acceptance criterion into a
new work package, unilaterally and mid-wave, is a founder call, not a builder's. **The open question is
whether AU23 should exist at all, or AU21 should simply finish these eight pairs in place.** Do not
proceed to `/refine` or `/architecture` on the assumption it is approved.

The research below holds up on its own and is kept as the worklist either way.

## The eight pairs

`scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set names them explicitly —
they are deferred, not silently excluded. They are the system's most live paths: every session launch,
every assistant turn, every task or decomposition completion.

**`dispatch::conversation` / `::users` / `::settings` — the assistant-turn runner.** `runTurnInternal`
reads the live transcript, resolves or creates the assistant's own user row, and reads model/cost
config at *run* time, not admission time.

**`run-orchestration::knowledge` / `::org` / `::routine` / `::settings` / `::users` / `::work` —
per-session context assembly** in `context.ts` (`RunOptions` / `RunTransitionSpec` / `RuntimeDeps`).
The largest remaining cluster, needed by all seven session-request families at run time.

**`session-requests::work`** — `taskDispatchAttemptStore.reapTerminal` (a retention sweep, not a launch
decision) plus `lifecycleProjection.work`'s writeback of a session's outcome into
`taskDispatchAttempts` / `bets.decompositionStatus`.

## Why they were not rushed, and what that rules out

Architecture Decision B left context assembly genuinely open — *bake at emit* or *agent pulls via MCP*.
The triage wave found concrete evidence, not just an assertion, that **a naive bake-at-emit is unsafe
for the assistant-turn case**: the assistant's own `maxConcurrentSessions: 1` means a second message
can queue behind an in-flight turn, and a transcript baked at emit for that second turn would miss the
first turn's reply — a real conversational-coherence regression. That finding rules out the naive bake;
it does **not** pick MCP-pull by default, which would add a tool round trip to every session start and
redesign the file-based sandbox-context model. The fork needs its own design-it-twice pass.

For `session-requests::work` a credible path already exists: `routine`'s equivalent writeback migrated
to a core-api event-subscriber (`routine-run-session-end-reactions.ts`, reacting to `session_ended` /
`agent_run_lifecycle_changed`). Mirroring it for `task`/`decomposition` still needs its own red/green
pass — one subtlety already surfaced, `projectTask`'s embedded call to `projectExplicitStart` being a
harmless no-op for `task`-sourced facts, and that is exactly what a rushed fix misses.
`reapTerminalTaskDispatchAttempts` moves into `server-factory.ts`'s existing generic retention sweep.

## Already closed inside AU21 — not this scope

`dispatch::work` was confirmed genuinely dead (`drainQueue` never launched a session on any path) and
deleted rather than migrated; the real task-dispatch path is `@hyperidle/work`'s `task-state-machine.ts`
baking a `task_run` intent that `run-orchestration`'s own poll loop consumes. `dispatch::routine` was
relocated to `@hyperidle/routine`, and the regrowth that fix introduced (`tool-handlers → routine`) was
closed with a new `CoreApiPort` seam route.

## Constraints on whatever gets built

- **Zero regression to AU21's shipped behaviour** — the resolve-at-emit pattern for the other 27 of 35
  enumerated pairs, the `CoreApiPort` / `AgentOrchestrationPort` seams, the routine-runs-as-sessions
  collapse, and Decision B‴'s supersede/deliver-on-next-turn mechanism all stay green throughout.
- The anti-regrowth guard must go green with these eight **removed** from `DEFERRED_FOLLOWUP`, not
  re-added elsewhere, and with no new builder-authored `ALLOWLIST` entry — permanent exemptions are
  founder-signed only, and `ALLOWLIST` stays at its four `cost::*` rows.
- **No stub, mock or fabricated context stands in as proof** that a migrated context-assembly path
  produces the same real session behaviour as today.
- The mechanism is chosen deliberately per cluster with the reasoning recorded, never defaulted.

**Complexity.** L · **Engineering tier.** production · **Depends on.** AU21.
**Refinement required** (the three-way fork). **Design not required** — no UI surface.

## Acceptance criteria

- All ten named pairs are out of `DEFERRED_FOLLOWUP`, `inspect(process.cwd())` returns zero findings,
  and `ALLOWLIST` is unchanged.
- A user message triggering an assistant turn still receives the correct transcript, identity and
  model/cost config without `dispatch` reading `conversation`/`users`/`settings` directly — **and** a
  second message arriving while the first turn is in flight still produces a coherent conversation,
  with the first turn's reply visible to the second. That second half is the regression a naive bake
  would introduce.
- Any of the seven session-request families launches with correct, complete context and no direct run-time
  read of `knowledge`/`org`/`routine`/`settings`/`users`/`work`.
- A terminal task or decomposition session finalizes `taskDispatchAttempts` / `bets.decompositionStatus`
  through a core-api subscriber, with a red/green test covering the `projectExplicitStart` no-op.
- Existing assistant-chat, task-dispatch and session-launch integration tests pass unchanged in
  behaviour — a context migration changes where context resolves from, never what a session receives.

## Out of scope

AU21's other 27 pairs. AY1's mid-run injection into an already-running session — a different
capability, not context assembly at session start. Rebuilding the orphaned `settings`
`kind:"trigger"` config feature, a pre-existing product gap the triage wave flagged.
