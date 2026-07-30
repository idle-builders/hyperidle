# AU23 — Resolve agent-orchestration's remaining live-context core-api reads (dispatch assistant-turn + run-orchestration context assembly + session-requests write-back)

**Status: PROPOSED — pending founder decision (downgraded from "planned" 2026-07-30).** This work package was
originally registered mid-implementation, during AU21's Increment 9 forensic-triage wave, as an already-decided
closure owner for AU21's remaining boundary-edge pairs — presented alongside a claim that AU21 was "ready to
ship" with AC #2 satisfied. That was rejected on review: descoping AU21's own headline acceptance criterion to a
new work package, unilaterally, mid-wave, is a founder-level scope call, not a builder one (see
`work/AU21/edge-disposition.md`'s "Increment 9 forensic-triage accounting — THIRD pass" section for the full
correction). This plan's research is retained because it holds up on its own merits, and 2 of its original 10
target pairs were closed for real inside AU21 itself the same day (see below) — but whether AU23 should exist as
a separate work package at all, versus AU21 simply finishing the remaining 8 pairs in place, is now an open
question for the founder, not a settled fact.

## Work package

**Work package.** As a maintainer, I want `agent-orchestration` to reach ZERO core-api domain reads for the
remaining eight consumer::provider pairs AU21 left open after its Increment 9 THIRD pass — `dispatch`'s
assistant-turn runner, `run-orchestration`'s per-session context assembly, and `session-requests`'s task/
decomposition write-back — so that the boundary seam AU21 built is actually complete, not "complete except for
the pairs nobody could decide how to migrate."

**Why this matters.** AU21's Increment 9 forensic-triage wave (across two further passes on 2026-07-30) closed 7
of AU21's original 15 remaining boundary-edge findings for real this pass alone (3 dead-code deletions from the
first pass, plus `dispatch::work` deleted and `dispatch::routine` relocated core-side from the THIRD pass) but
explicitly declined to rush the remaining 8 — not because they're low-value, but because they're the system's
most live, most sensitive paths (task/decomposition write-back, assistant chat, every agent session's context)
and architecture.md's own Decision B left the context-assembly resolution genuinely undecided ("bake at emit OR
agent pulls via MCP" — two sanctioned options, and the THIRD pass found real, concrete evidence — not just an
assertion — that "bake at emit" carries a genuine conversational-coherence regression risk for the assistant-turn
case specifically). Guessing wrong here, inside a forensic-accounting wave with no dedicated test-first design
pass, risks exactly the kind of in-flight redesign this WP's own discipline forbids. This work package, if the
founder confirms it should exist separately, is that dedicated pass.

**What exists today.** `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set names the
eight pairs explicitly (not silently excluded — see its own doc comment and `edge-disposition.md`'s "Increment 9
forensic-triage accounting — THIRD pass" section for the full per-pair reasoning):

- `dispatch::conversation`/`dispatch::users`/`dispatch::settings` — the assistant-turn runner (`runTurnInternal`)
  reads the live conversation transcript, resolves/creates the assistant's own user row, and reads server config
  (model/cost) at RUN time, not admission time. THIRD-pass finding: baking the transcript at emit time is
  genuinely UNSAFE (not just unmigrated) — the assistant's own `maxConcurrentSessions:1` means a second message
  can queue behind an in-flight turn, and a baked-at-emit transcript for that second turn would miss the first
  turn's own reply, a real conversational-coherence regression.
- `run-orchestration::knowledge`/`::org`/`::routine`/`::settings`/`::users`/`::work` — `context.ts`'s per-session
  context assembly (`RunOptions`/`RunTransitionSpec`/`RuntimeDeps`), the largest single remaining cluster, needed
  by every one of the seven session-request families at RUN time, not admission time. Same staleness-risk class
  as the assistant-turn transcript, at larger scale.
- `session-requests::work` — `taskDispatchAttemptStore.reapTerminal` (a retention-sweep delete, not a
  session-launch decision) + `lifecycleProjection.work`'s writeback of a session's own outcome into
  `taskDispatchAttempts`/`bets.decompositionStatus`. THIRD-pass finding: real, credible feasibility evidence
  exists — `routine`'s equivalent writeback already migrated to a core-api event-subscriber pattern
  (`routine-run-session-end-reactions.ts`, reacting to `session_ended`/`agent_run_lifecycle_changed`) — but
  completing the analogous migration for `task`/`decomposition` needs its own dedicated red/green pass (a real
  subtlety was already found: `projectTask`'s embedded call to `projectExplicitStart` is a harmless no-op for
  `task`-sourced facts, the kind of detail a rushed fix would risk missing).

**Already closed inside AU21 itself (NOT this work package's scope, listed here only so this plan doesn't
re-discover them):** `dispatch::work` (the task-queue trigger was confirmed genuinely dead code — `drainQueue`
never launched a session on any path — deleted, not migrated; the real task-dispatch path is `@hyperidle/work`'s
`task-state-machine.ts` baking a `task_run` intent, consumed by `run-orchestration`'s own independent poll loop)
and `dispatch::routine` (`provisionTeamRoutines` relocated to `@hyperidle/routine`; a regrowth this same fix
introduced, `tool-handlers -> routine`, was also closed via a new `CoreApiPort` seam route).

**What's genuinely missing.** A settled design decision — for the assistant-turn and context-assembly clusters —
on which of Decision B's two resolutions applies (bake the needed context into the already-baked
`AgentSessionRequest`/intent payload at EMIT time — now confirmed to carry a real staleness cost for at least the
assistant-turn case — vs. let the agent pull live context via its own MCP tools at RUN time, which would mean
redesigning today's file-based sandbox-context model, vs. some third option this work package's research
surfaces), followed by the actual migration; and a dedicated red/green pass for `session-requests::work`'s
already-evidenced (but unverified) migration path.

**Depends on.**
- **AU21** — this work package, if it proceeds, closes the eight pairs AU21's own anti-regrowth guard
  (`DEFERRED_FOLLOWUP`) names as its starting scope; it cannot be scoped tighter than "these eight pairs" until
  the founder decides whether AU21 finishes them in place instead.

**Complexity.** L

**Engineering tier.** production — these are live, high-traffic paths (every session launch, every assistant
turn, every task/decomposition completion).

**Pre-build gates.**
- **Refinement:** Required — "bake at emit vs. MCP pull vs. something else" is a genuine three-way fork with real
  product/architecture consequences (a baked context can go stale mid-run, now confirmed not just theorized; an
  MCP-pull adds a tool round-trip cost to every session start and redesigns the sandbox-context model) that
  `/refine` should pin down before `/architecture` designs against a fuzzy target.
- **Design:** Not required — backend/infra, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Forecast: high-friction, matching AU21's own
review cadence — this re-touches the same live session-launch and assistant-chat paths AU21's Increments 1-8
already reasoned about carefully.

**Plan calls.**
- Get an explicit founder decision on whether this work package should exist at all, versus AU21 finishing the
  remaining 8 pairs in place — do not proceed to `/refine` or `/architecture` on the assumption this WP is
  already approved.
- For `run-orchestration`'s context-assembly cluster (and the assistant-turn transcript specifically), treat
  Decision B's "bake at emit OR agent pulls via MCP" as a real fork requiring its own design-it-twice pass — the
  THIRD pass's staleness-risk finding rules out a naive "just bake it" fix, it does not pick the other side by
  default either.
- For `session-requests::work`, follow the THIRD pass's evidenced path (mirror
  `routine-run-session-end-reactions.ts`'s pattern for `task`/`decomposition`; move
  `reapTerminalTaskDispatchAttempts` into `server-factory.ts`'s existing generic retention sweep) with a real
  red/green test cycle, not a repeat of the rushed attempt this wave correctly declined to finish.
- Cross-reference `edge-disposition.md`'s "Increment 9 forensic-triage accounting — THIRD pass" section (the
  per-pair real-source citations) as the starting worklist — this is not a re-discovery task.

**Contracts / constraints.**
- Zero regression to `AU21`'s already-shipped behavior: the resolve-at-emit pattern for the other 27 (of 35 total
  enumerated) pairs, the `CoreApiPort`/`AgentOrchestrationPort` seams, the routine-runs-as-sessions collapse, and
  Decision B‴'s supersede/deliver-on-next-turn mechanism must all stay green throughout.
- Whatever migration mechanism is chosen must not reintroduce a raw DI read from `agent-orchestration` into
  `core-api` for these eight pairs — the anti-regrowth guard (already wired into `npm run lint` as a bare check)
  must go green with `DEFERRED_FOLLOWUP` for these eight pairs REMOVED, not re-added elsewhere, and without a new
  builder-authored `ALLOWLIST` entry (permanent exemptions are founder-signed only).
- No stub/mock of the harness or a fabricated context stands in for proof that a migrated context-assembly path
  produces the same real session behavior as today.

**Out of scope.**
- Any of AU21's other 27 pairs (already resolved — dead/allowlisted/baked/seam-routed/relocated).
- AU22's mid-run injection question (a different capability — delivering a live update into an ALREADY-RUNNING
  session — not context assembly at session START).
- Rebuilding or wiring up the orphaned `settings` `kind:"trigger"` config feature (`SettingsAgentBehavior.tsx`'s
  "Triggers" tab) — flagged by AU21's forensic-triage wave as a pre-existing, unrelated product gap, not this
  work package's concern unless a future work package scopes it explicitly.

## Acceptance criteria

- `dispatch::conversation`, `dispatch::users`, `dispatch::settings`, `run-orchestration::knowledge`,
  `run-orchestration::org`, `run-orchestration::routine`, `run-orchestration::settings`, `run-orchestration::users`,
  `run-orchestration::work`, `session-requests::work` are each removed from
  `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set, with `inspect(process.cwd())` still
  returning zero findings, and with no new builder-authored `ALLOWLIST` entry substituting for real closure.
- For the assistant-turn and context-assembly clusters: context needed at session-run/turn time is resolved via
  ONE of Decision B's sanctioned mechanisms (baked at emit, or a documented agent-side MCP pull), chosen
  deliberately per cluster with reasoning recorded, not defaulted — and the chosen mechanism must not reintroduce
  the staleness regression the THIRD pass found for a naive bake.
- For `session-requests::work`: `task`/`decomposition`'s writeback migrates to the same core-api event-subscriber
  pattern already proven for `routine`, with a real red/green test proving the `projectExplicitStart` no-op
  subtlety (and any other found along the way) doesn't regress.
- Existing assistant-chat, task-dispatch, and session-launch integration tests continue to pass unchanged in
  behavior (a context-assembly migration must not observably change what context a session receives, only where
  it's resolved from).
- `npm run verify` green.

## Validation scenarios

- Given a user sends a message that triggers an assistant turn, when the turn runs, then the assistant still
  receives the correct transcript, resolved identity, and model/cost config — proven by an integration test —
  without `dispatch` reading `conversation`/`users`/`settings` directly, AND a second message arriving while the
  first turn is still in flight still produces a coherent conversation (the first turn's reply is visible to the
  second turn) — the exact regression the THIRD pass found a naive bake-at-emit fix would introduce.
- Given any of the seven session-request families launches a real session, when `run-orchestration` assembles
  that session's context, then the context is correct and complete (same real behavior as today) without a direct
  `knowledge`/`org`/`routine`/`settings`/`users`/`work` read at run time.
- Given a task or bet-decomposition session reaches a terminal state, when `run-orchestration` emits
  `session_ended`/`agent_run_lifecycle_changed`, then a core-api subscriber (mirroring
  `routine-run-session-end-reactions.ts`) finalizes `taskDispatchAttempts`/`bets.decompositionStatus` — without
  `session-requests` reaching into `work` directly.
- Given the anti-regrowth guard's bare check is already part of `npm run lint` (post-AU21), when this work
  package ships, then the guard is green with `DEFERRED_FOLLOWUP` empty and `ALLOWLIST` unchanged (still only the
  4 founder-signed `cost::*` rows).
