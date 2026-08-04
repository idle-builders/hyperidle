# AU27 — Code review

**Reviewer:** independent evaluator (not the producer). **Base:** `origin/main@75d85687`.
**Head reviewed:** `1dae6d7b` (17 commits) in `.worktrees/pipeline-AU27`, branch `pipeline/AU27`.
**Contract:** `.pipeline/work/AU27/plan.md` as amended 2026-08-04 (SCOPE LOCK + the AC-6 strike + the two
founder-added ACs + the 2026-08-04 guard-removal amendment), `architecture.md` rev 4, `architecture-critique.md`
round 2, `.claude/rules/typescript.md`, `.claude/rules/testing.md`, `CLAUDE.md`, `ETHOS.md`.
**Tier:** production.

## Verification actually run (not taken on trust)

| Gate | Result |
|---|---|
| `npm run check` | PASS — 33/33 packages, 0 errors |
| `npm run lint` (full chain, post-guard-removal) | PASS — 0 errors; 449 warnings / 139 infos, all pre-existing baseline |
| `npm run test` (affected slice) | PASS — 356 files, 3419 tests |
| `npm run test:integration:service` | PASS — 317 files / 2991 tests, 1 file + 5 tests skipped (pre-existing) |
| `npm run knip` + `npm run knip:production` | PASS — zero unused files/exports/deps; config hints only |
| `scripts/composition-edge-anti-regrowth-guard.ts` (AU21 AC #2) | **PASS** |
| `rg -ai al6` repo-wide (excl. `plans/`, `.pipeline/`, lockfile base64) | **zero hits** |
| `npm ci --dry-run` | succeeds (lockfile staleness is non-fatal — see W7) |

Harness lane (`test:integration:harness`) NOT run — release-gated, and the new Increment-8 proof lives there.
Its assertions were read line by line instead (see §Test honesty).

---

## 1. Architecture lens

**The five deletions are real and complete.** `packages/agent-orchestration/dispatch/` is gone from disk,
from `vitest.config.ts:46`, from `core-api/package.json`, from `core-api/tsconfig.json`, and from
`core-api/src/routines.ts` (`export { dispatchOps }` removed). `RunOptions.conversational`
(`contracts.ts:220`), `RuntimePorts.dispatch`, `RuntimeDeps.assistantTurn`,
`HarnessRunOutput.conversationalReply`/`conversationalToolCalls` (`shared/src/harness-port.ts:159-161`),
`RunContextBundle.conversational`, `CompletionEvent.toolCalls`, `isConversational`, the conversational
registry fork, the reply-capture branch, `composeAssistantPrompt`, `assistant-draft-registry.ts` and
`buildAssistantDraftRegistry` are all gone. A production-only sweep for AC-4's identifier list returns
**zero** live references (only `@lore …relocated from @hyperidle/dispatch` provenance in
`core-api/routine/*` — see N4). `npm run check` + `knip` are the mechanical proof AC-4 asked for.

**The correctly-KEPT symbols are kept.** `SessionConfig.messages` (`harness-adapter.ts:125`),
`ConversationMessage` (`:63`), `runChatTurn` (`builtin-harness-adapter.ts:460`) all survive — deleting
them would have undone AU21 H2. The chat-vs-planning fork at `builtin-harness-adapter.ts:387` now keys on
the generic `params.transcript`, not on "is this the assistant". Correct, and matches architecture §3's
stated retention.

**No second execution entry.** `start-runtime.ts` no longer contains any `sourceKind === "assistant"`
branch; every kind falls through the one drain (`:110-160`). The port that made the fork possible
(`RunOrchestrationDispatchPort`) is deleted from `contracts.ts`, so the branch cannot be reintroduced
without re-adding a type — a compile-level backstop, which is the right shape for this AC.

**AU21 AC #2 is preserved and slightly strengthened.** `ToolContext.threadId` is baked at emit
(`assistant-turn-resolver.ts:206` from the already-loaded `message.threadId`; task/session_start/
reengagement via `resolveOrCreateCallingThread`) and read on the run path only by
`parseBakedCallingThreadId` (`runtime.ts:210-216`), a `JSON.parse` of the drained payload. The new
core-side resolve-or-create is a **write at bake time inside core-api**, not a read back — it is not an
orchestration→core edge at all. The guard runs green; `DEFERRED_FOLLOWUP` is still
`new Set([])` (`composition-edge-anti-regrowth-guard.ts:417`); `ALLOWLIST`/`isStatelessProvider`/
`STATELESS_METHODS` remain deleted; and AU27 **removed** the last `SEAM_GROUPS` entry
(`generate-dependency-graph.ts:150` is now `new Set([])`), i.e. one fewer exemption than main had.
**Nothing was added to any exemption set.**

**Corrective closure rule (`.pipeline/AU.md:9`) vs `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`.**
That document self-declares SUPERSEDED (`:3-11`) and redirects to `docs/architecture/runtime-simplification.md`
+ AU21's architecture; I checked against both. No forbidden edge remains or is introduced:
- "Core App … does not own session provisioning" — AU27 adds no provisioning to core. ✅
- "Conversation Service … must not own Assistant provisioning" — `session-not-returned-notice.ts` reacts to
  an agent-layer event with a `messages` write; conversation owns `messages`. ✅
- "Agent Layer … does not own Work, Conversation, Knowledge, Users, Settings" — `reply` writes through
  `ports.coreApi.insertMessage` → `POST /threads/:id/messages`, never a direct conversation write
  (`tool-definitions.ts:185-193`), and the anti-regrowth guard confirms no new raw edge. ✅
- `core-api → agent-orchestration` (server-factory importing `startRuntime`) is pre-existing and is AU26's
  scope, not reopened here; AU27 *shrinks* that file. ✅

**Tier fit.** Production tier, and the rigor matches: the gate change touches all 6 sites with a compile-forced
port-type change (`run-orchestration-composition.ts:124`), the never-silent net is an existing event + one new
subscriber, and the model-override guard (`server-factory.ts:719-733`) closes a real
`UnsupportedAgentProviderError` throw the switchover would otherwise have newly exposed. No
over-engineering above tier found. Two places fall *below* tier — see W1 and W2.

## 2. Design lens

Not applicable as a producing lens — AU27 adds no UI. The one UI file touched
(`packages/web/src/shell/AssistantOverlay.tsx`) is deletion-only: `ToolCallRow`,
`BetDraftCardForToolCall`, `renderToolCallSummaries` and the `renderMessageExtra` prop are removed. Net
token hygiene *improves* (the deleted `ToolCallRow` hardcoded `rgba(22, 118, 79, 0.03)`, `11px`, `13px`,
`9px 12px` — all off-token). No new component ⇒ no new story artifact required. `AK4-AssistantOverlay.bet-card.test.tsx`
deleted with its subject. The assistant's distinct visual spot is untouched. This is the deliberate,
scope-locked loss ("accept the loss, delete the dead branches, preserve nothing") and it was executed as
written. One residue: see W6.

## 3. Security lens (STRIDE + agent layer)

- **Elevation / arbitrary-thread write.** `reply` deliberately takes **no** `threadId` argument
  (`tool-definitions.ts:139`, asserted by `reply-tool.integration.test.ts:178-181`); it can only post to
  `ctx.threadId`, which core baked. A compromised model cannot redirect the write. Authorization runs through
  the real route (`canWrite → canRead`, host-scope for `task`), same middleware a human hits. Correct.
- **Loop / self-retrigger.** `routes/threads.ts` refuses to record an `assistant_turn` intent for an
  `ast-`-prefixed sender, and `AH6-lane-gates-broken-turn.integration.test.ts` Term 2 now proves it. No
  reply→retrigger loop.
- **Injection at the render boundary.** No new HTML/DOM/shell/SQL sink. `reply` text is stored as JSON
  payload and rendered through React. `buildForceReturnMessage` interpolates only names from the closed
  `RETURN_ACTION_NAMES` tuple, never model-supplied text.
- **Secrets.** `harnessTestResolvedModel`'s `apiKeyEnv: null` reasoning in
  `assistant-reply-live-harness.integration.test.ts:11-27` is correct and explicitly avoids shadowing
  codex's native keychain auth with a fake `OPENAI_API_KEY`. No secret is baked, logged, or shipped.
  `AU9-assistant-handoff-realbinary.integration.test.ts:75-80` encrypts the real key via
  `encryptCredentialValue` rather than storing it plain. Good.
- **Prompt injection (agent layer).** `assembleTaskFreePrompt` now renders the calling-thread transcript
  verbatim into the system prompt as `User: …` / `Assistant: …` (`provisioner.ts:485-490`). A user can forge
  a `Assistant:` turn inside their own message text. This is **not new** — the deleted conversational branch
  did the identical concatenation — and the principal is the thread's own user, so no privilege is crossed.
  Recorded as N7, not a finding against this change.
- **Tool-surface expansion.** The assistant goes from 3 tools to ~17. That is the founder's verbatim
  direction, and no AL7 gate is introduced: `params.sessionWorkflow` is set only for the two-session
  proposed-call flow, never an assistant turn. `reply` declares `reversibility: "reversible"` so it does not
  fail closed to `irreversible` under AL7 — verified at `tool-definitions.ts:170` and asserted in test.

**No CRITICAL security finding.**

## 4. Adversarial lens

*Saboteur:* no weakened test, no widened exemption, no silenced gate. The one thing that could have been a
silent weakening — the assistant losing return enforcement — went the other way: `exempt` no longer
includes `isConversational` (`provisioner.ts:1290-1295`), so the assistant is now *subject* to the gate for
the first time, with a narrowed required set. `MAX_FORCE_RETURNS` is unchanged at 2.

*New Hire (Day 7):* the required-return rule is stated structurally with no `sourceKind` anywhere
(`provisioner.ts:1281-1282`) and is readable. The two orphaned comment blocks (W5) and the stale
`dispatchOps` comments (W4) are what would cost the new hire time.

*Auditor:* PR-claim-vs-diff spot checks all held — "all 6 force sites" is genuinely 6 (`builtin` chat
`:581`, `builtin` execute `:751`, `mcp-route:140`, `cli-harness-adapter:773`, `return-status-tool:80`,
`run-orchestration-composition:124`), and the two builtin synthetic-gate sites were reconciled
(`builtin-harness-adapter.ts:739-742` explicitly notes one was previously unguarded). "Return gate adjusted,
not shadowed" holds: `EnforcementEntry.gate` keeps its `{ returned }` shape, one registry, one
`shouldForceReturn`, no parallel mechanism anywhere.

*Type safety:* production adds **zero** new `any`, `@ts-ignore`, `@ts-expect-error`, or non-null assertion.
Test-world adds ~20 `as ProvisionSessionParams` / `as unknown as RuntimeDeps` casts, all matching the
existing `test-ports.ts` house pattern (N6).

## 5. Simplification lens

For a deletion WP the ledger is right: **−4371 / +6211** overall, but production is net-negative
(dispatch's 4 files + `assistant-draft-registry.ts` + `dispatch-bindings.ts` deleted, ~470 lines removed
from `tool-definitions.ts`, ~150 from `AssistantOverlay.tsx`, ~55 from `context.ts`); the `+` is
overwhelmingly new tests and `.pipeline/` planning docs. Three growth points, each justified against the
lock: the `reply` tool (item 1), the required-set parameter (founder amendment), the never-silent
subscriber (AC-8's second half). The one growth item added *without* a lock justification was the
`al6-naming-guard` — and the founder has since deleted it (`1dae6d7b`), together with three other
name-policing/dead guards. That deletion is correct and I endorse it.

**No duplicated machinery found.** The Increment-8 required-action proof was folded into the existing
real-binary suite (`real-harness-return-enforcement-realbinary.integration.test.ts:605,939`), not copied.
The new `assistant-reply-live-harness.integration.test.ts` is a genuinely different proof (assistant reply
end-to-end vs. hook-transport enforcement) and shares the lane, the `requireHarness` gate and the locked
model seam — that is a new file, not a parallel copy.

## 6. AI-slop lens

Low. No "TODO: implement" on implemented code, no "for now"/"simplified version", no defensive null checks
on non-nullable types, no single-use wrapper. Comment density is high but the comments are load-bearing
(the `@lore` convention is mandated by CLAUDE.md). The genuine slop is: two orphaned section-banner comments
(W5), one dangling trailing comment (W5), a duplicated JSDoc block on `parseBakedAgentConfig`
(`runtime.ts:131-146` — two adjacent `/** … */` blocks, only the second binds), and a near-vacuous
`runCheck` smoke test that has now been deleted with its guard.

---

## Acceptance criteria

| # | AC (as amended) | Verdict | Evidence |
|---|---|---|---|
| 0 | Task's calling thread exists when a session needs one — **SCOPE LOCK**: no schema change, emit-path resolve-or-create | **MET** | `core-api/src/services/calling-thread-bindings.ts:29-45`; wired at all 5 composition roots — `task-run-resolver-bindings.ts:41`, `sessions-routes.ts:422`, `threads.ts:1730`, `agent-run-admission-reactions.ts:131`, `server-factory.ts:546`. `tasks.threadId` untouched, zero migrations in the diff. Tests: `calling-thread-bindings.integration.test.ts:25,45` (creates + idempotent). See W3 for the divergence. |
| 1 | Generic `reply`, every agent kind, through the `CoreApiPort` seam; proven by a task_run test | **MET** | `tool-definitions.ts:147-196` (no `roles` ⇒ every role); `reply-tool.integration.test.ts:83-118` asserts `app.fetch` saw `POST /threads/thread-reply-1/messages` and the real row landed with `senderId=agent-reply-1`. |
| 2 | `ToolContext.threadId` from the baked request, **zero** orchestration→core read; guard stays green | **MET** | `shared/src/tool.ts:45-54`; `runtime.ts:210-216` parses payload only; `provisioner.ts:1162` forwards to `ToolContext`. Tests: `calling-thread-id-bake.integration.test.ts:51,95`, `provisioner-tool-context-thread-id.integration.test.ts:137,185`. Guard PASS, zero exemptions added. |
| 3 | Assistant replies by calling `reply` DURING the session, not a post-hoc orchestration write | **MET** | `core-api-port-assistant-reply-seam.integration.test.ts` (the assistant's own `reply` crosses the seam under `ast-<userId>`, exactly one `thread_message_appended`); `assistant-reply-live-harness.integration.test.ts` on 5 harness lanes asserting the literal `HARNESS_REPLY_OK` text. No orchestration-side write path survives (the capture branch is deleted). |
| 4 | `conversational` mode fully removed | **MET** | Production sweep for the 9 AC-4 identifiers returns zero live hits; `npm run check` + `knip` green; `dispatch/` absent from disk and from every manifest. |
| 5 | Assistant flows through the shared poller; no second execution entry; **test asserts the intent is consumed by the shared poller** | **MET, with a merge-lane gap (W1)** | Static: the `if` and its port/dep are deleted (`start-runtime.ts`, `contracts.ts`). Runtime: `AU9-assistant-handoff-realbinary.integration.test.ts:107-131` posts through the real `createServer` and polls until the assistant reply + `agentSessionRequests` + `sessions` rows exist — a genuine end-to-end poller proof, but it sits in the **release-gated harness lane**. The service-lane test only asserts the intent is *recorded*, never consumed, and the architecture's promised `transitionAgentRunLifecycle` `running→completed` assertion was not written. |
| 6 | ~~Pre-handoff failure UX~~ — **STRUCK** | **CORRECTLY ABSENT** | `persistTurnFailureInternal` deleted with `dispatch`; `agent-run-admission-reactions.ts:152-156` `case "assistant_turn"` remains the pre-existing informational no-op. Nothing half-built, no dead scaffolding. |
| 7 | No calling thread ⇒ clean typed error, never a crash | **MET** | `tool-definitions.ts:174-180` returns `err("NO_CALLING_THREAD")`; `reply-tool.integration.test.ts:141-160`. (Covers the shared code path; the architecture asked for both `routine_run` *and* `knowledge_action` cases — one is written. Immaterial: the branch is `if (!ctx.threadId)`.) |
| 8 | **(founder-added)** Return gate forces the **session-appropriate** action; the message names it; proven on a real harness | **MET** | Set-based: `RETURN_ACTION_NAMES` gains `reply`, `isRequiredReturnAction` (`return-actions.ts:104-112`), `createGate(requiredReturnActions?)` (`return-enforcement.ts:48-58`), `EnforcementEntry.requiredReturnActions` (`enforcement-registry.ts:30-37`). All 6 sites adjusted, port type changed first so it is a compile dependency. Symmetry proven both ways: `return-gate-required-actions.test.ts:19,54` (send_message does NOT satisfy a `reply`-required gate; `reply` does NOT satisfy a trio-required gate). Real-route proof at `real-harness-return-enforcement-realbinary.integration.test.ts:605,939`. Never-silent half: `session-not-returned-notice.ts` + `session-not-returned-calling-thread-id.integration.test.ts:96,172` + `O3-service-move-bootstrap.integration.test.ts:117,254`. |
| 9 | **(founder-added, re-amended)** No `AL6` WP-id naming in production — **no lint rule** | **MET** | `rg -ai "al6"` across `packages/`, `scripts/`, `docs/`, root configs: **zero** real hits (only base64 substrings in `package-lock.json`/`bun.lock` and one PNG). Constants, markers, headers, filenames and the allowlist rows are all renamed. The guard and its test are deleted per the founder's 2026-08-04 amendment; no standing machinery remains. |

**9 of 9 live ACs met.** One (AC-5) is met but with its runtime proof only in the release-gated lane.

---

## Findings

### CRITICAL

None.

### WARNING

**W1 — AC-5's runtime proof does not run in the merge lane; the promised durable-lifecycle assertion was
never written.**
`architecture.md` §7 Inc 6 and §8 AC-5 both promised: *"assert the request traverses `runClaimedRequest`
and the durable lifecycle (`transitionAgentRunLifecycle`, status `running`→`completed`) — **not** merely
'a session row exists', which is already true today."* What shipped is
`AU9-assistant-handoff-realbinary.integration.test.ts:126-131`, which asserts exactly
`agentSessionRequests` length 1 and `sessions` length 1 — the shape the architecture named as
insufficient — and it lives in `HARNESS_INCLUDE` (`vitest.integration.config.ts:33`), i.e. the
release-gated harness lane, not per-merge verify. The service lane's replacement
(`AH6-lane-gates-broken-turn.integration.test.ts:178-192`) asserts only that the
`agent_work_intents` row was *recorded*; its own comment concedes the fixture "never drains it". So on the
lane CI actually runs per merge, nothing proves the assistant is consumed by the shared poller.
**Required fix:** add a service-lane integration test that drains an `assistant_turn`
`agentSessionRequests` row through `drainAgentSessionRequests`/`runClaimedRequest` with a scripted
adapter and asserts the `agent_runs` lifecycle reaches `completed` — or, at minimum, strengthen
`AU9-...:126` to assert the lifecycle transition rather than row existence.

**W2 — The AU9 realbinary test carries the exact false-green the builder fixed in the Increment-8 test.**
`AU9-assistant-handoff-realbinary.integration.test.ts:121-126` polls
`messages WHERE senderId = 'ast-au9-real-human'` and asserts `.toBe(1)`. AU27's own Increment 5 wires
`registerSessionNotReturnedNotice` into `createServer` (`server-factory.ts:489-497`), and that notice is
authored as `event.agentId` — i.e. `ast-au9-real-human`. A turn that never calls `reply`, exhausts the
force budget and gets caught by the never-silent net produces **exactly one** message from that sender and
passes this assertion. This is the identical defect commit `932e479b` identified and fixed in
`assistant-reply-live-harness.integration.test.ts:311-325`, left unfixed in the sibling test the same WP
rewrote. The prompt even asks for a literal answer (`"Reply with exactly: durable handoff works"`) that is
never asserted.
**Required fix:** assert the payload text contains `durable handoff works` and
`.not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT)`, mirroring `assistant-reply-live-harness`'s guard.

**W3 — `resolveOrCreateCallingThread` creates a thread whose shape diverges from the established
`resolveOrCreateHostThread` contract it claims to mirror.**
`calling-thread-bindings.ts:36-44` writes `initiatorId: agentId` and `participants: [agentId]`, with no
initial message. The idiom architecture §Decision 0 cites as "the same shape",
`web/src/services/host-threads.ts:55-70`, writes `participants: [founderId, agentId]` plus a
`"Thread started."` initial message. Reads are unaffected (`task` is host-scope,
`access-boundary.ts:31,63-66`), but the participant column is a live filter elsewhere —
`routes/threads.ts:895` runs a `participantProbe` LIKE query, and `conversation-store.ts:233,261,407,451`
filter on it. A founder's participant-probe inbox will not surface an agent's `reply` posted into a task
thread the emit path created, because the founder is not a participant. Whichever thread gets created
first (UI or emit) wins and its participant list is never reconciled.
**Required fix:** include the task's owner/initiator alongside the agent in `participants`, or state
explicitly (with a `@lore`) why the emit-created thread deliberately has an agent-only participant list.

**W4 — Production and tooling comments assert mechanisms this WP deleted.** The founder ruled that
comments narrating removals are debt; comments that *falsely assert a deleted mechanism still runs* are
worse. Confirmed at source:
- `packages/core-api/src/app.ts:21-22` — "its trigger is now started through `dispatchOps.start` (called
  from `registerAgentLayerServices`)". `dispatchOps` no longer exists; `registerAgentLayerServices` no
  longer starts anything of the kind.
- `packages/db/src/seed-fixtures.ts:26-29` — "team-creation flow now asks `dispatchOps` to provision each
  team's builtin routines; dispatch owns the canonical five builtin defaults."
- `packages/core-api/src/services/routine-scheduler-bindings.ts:16,19` — "`dispatchOps`
  (`dispatch-bindings.ts`) no longer knows about routines at all" — present tense about a deleted file.
- `scripts/typecheck-gate.ts:416-420` — "…and the new `dispatch-bindings.ts` now import
  `@hyperidle/dispatch`."
- `scripts/honest-harness-guard.ts:559-561` — "`runAssistantTurn` cannot run a CLI harness".
- `scripts/lib/honest-harness-predicate.ts:68-77` — cites `conversational-reply-row.integration.test.ts`
  (does not exist anywhere in the tree) and `runAssistantTurn` as its justification.
- `scripts/ah6-generate-cassette-keys.ts:79` — "must match `buildAssistantDraftRegistry` tool specs".
**Required fix:** rewrite each to describe the present design, or delete it.

**W5 — Three comment blocks AU27 itself added are tombstones by the founder's own definition.**
- `packages/agent-orchestration/run-orchestration/src/context.ts:389-393` — a section banner with **no code
  under it**, existing only to say where the deleted `composeAssistantPrompt` went. Delete the banner.
- `packages/agent-orchestration/tool-handlers/src/tool-definitions.ts:1636-1640` — a dangling comment after
  the file's last closing brace, narrating what `create_bet`/`edit_bet` now are, saying "two lines above"
  when the call sites are at `:1624-1625` (twelve lines above), and ending with "providing one is a later
  WP".
- `packages/core-api/src/services/run-orchestration-composition.ts:229-232` — a section banner with no code,
  reading "no second execution entry to wire".
Also `packages/agent-orchestration/run-orchestration/src/start-runtime.ts:171-174` cites `plan.md`'s
"Out of scope (c)" from production source — a pipeline artifact that will be retired.
**Required fix:** delete the three empty banners and the dangling comment; restate the `start-runtime.ts`
note as a standalone description of the claim/lease behaviour with no `plan.md` reference.

**W6 — `docs/agent-layer/return-gate-enforcement.md` still says the return set is three. AU27 made that
false, in a file AU27 edited.** `:3` — "must invoke one of **three** return actions"; `:11` — "**Three**
tool names form the closed accepted-return set (`RETURN_ACTION_NAMES`…)"; `:13-17` — a three-row table with
no `reply` row. `RETURN_ACTION_NAMES` is now four members (`return-actions.ts:34-39`). The builder touched
this file in seven places for the rename and left the one factual claim the change invalidated. `docs/` is
ground truth and the SCOPE LOCK explicitly requires it to describe the system as it is.
I do not accept the "pre-existing / out of scope" classification: the sentence was true on `origin/main`
and is false on this branch **because of this diff**.
Same class, same cause, three more sites:
- `packages/eval/src/scenarios/force-return.ts:66,76,313,323` — the scenario seeds instruct the agent
  *"Do NOT call submit_review, handoff_to, or send_message"* to drive it into the force path. `reply` is now
  a return action and is in every role's registry (`roles: undefined`), so a compliant agent can satisfy the
  gate with `reply` and the eval's premise silently collapses. This is a live eval-correctness bug AU27
  introduced, not cosmetics.
- `packages/agent-execution/harness-registry/src/return-status-tool.ts:113` — the `return_status` tool's
  **static description**, shown to every agent including the assistant, still says *"call exactly one of:
  submit_review, handoff_to, or send_message"*. The builder flagged the `:80` self-check message as a
  residual gap because `ToolContext` has no harness type; that is an honest scoping of the *literal-naming*
  half. The description at `:113` is a different, unscoped defect — it does not need the harness type, it
  needs `reply` added. An assistant that calls `return_status` is told to call a tool that will not satisfy
  its gate.
- `packages/shared/src/harness/return-actions.ts:136-146` — `FORCE_RETURN_MESSAGE`'s `@lore` says "All
  three return tools are named", and `return-gate.test.ts:207` pins that to exactly the trio. Correct as the
  *default* message, but the doc sentence is now false about the set.
**Required fix:** update `:3`, `:11` and the `:13-17` table to four with a `reply` row; add `reply` to
`return-status-tool.ts:113`; add `reply` (or an explicit "and do not call `reply` either") to the four eval
seed prompts; reword the `FORCE_RETURN_MESSAGE` `@lore`.

**W7 — `docs/guides/developer/linting-and-formatting.md` documents a guard commit `1dae6d7b` just
deleted.** `:14` — "`npm run lint` chains **three** domain guard scripts" (it chains eight); `:20` — a
table row for `scripts/test-naming-guard.ts --check`, now deleted. Same false-ground-truth class as W4/W6,
and this one was created by the most recent commit.
**Required fix:** drop the `test-naming-guard` row and correct the count (or drop the count).

**W8 — `scripts/au9-direct-handoff-guard.ts` is a dead guard that survived the cull, and its `PASS` reads
as coverage.** Its only scan surface is `files(join(root, "packages/server/src"))`
(`au9-direct-handoff-guard.ts:80`); `files()` returns `[]` for a missing root (`:62`); `packages/server`
was deleted in AU19. I ran `inspect(repoRoot)` directly: it returns `[]` having read zero files. It is in
the `lint` chain and prints `au9-direct-handoff-guard: PASS`. Commit `1dae6d7b` explicitly **kept** it as
"enforces a real architectural invariant (import boundary)" — it enforces nothing. Its `agentFiles`
allowlist (`:12-55`) is 11 `packages/server/src/...` paths, every one dead, with five `@lore` blocks saying
so.
**Required fix:** either repoint the scan root to the live trees the forbidden symbols now live in
(`packages/agent-orchestration/**`, `packages/core-api/src/services/**`) and re-derive the allowlist, or
delete the guard as part of the same cull.

### NOTE

**N1 — The four-harness coverage floor does not see the assistant's own realbinary test, and its two
builtin-only exemptions are both dead.** `AU9-assistant-handoff-realbinary.integration.test.ts` lives at
`packages/core-api/src/__tests__/`, is not under a `harness/__tests__/` dir, and is not in
`EXPLICIT_HARNESS_INTEGRATION` (`honest-harness-predicate.ts:49-58` — AU27 added its *own* new file to
that list and did not notice the neighbour). So `isHarnessIntegrationPath` is false for it: neither
`honest-harness-guard` nor the attestation agentic floor inspects a file whose name ends `realbinary`.
Separately, `BUILTIN_ONLY_INTEGRATION` (`:82-85`) holds two entries, both inert: `AV1-assistant-ready...`
(no such file exists) and `harness/__tests__/AU9-assistant-handoff-realbinary...` (path mismatch —
`endsWith` never matches the real location). Its doc block justifies the carve-out with "the assistant turn
cannot run a CLI harness (no sandbox cwd, no .mcp.json bridge)" and cites
`conversational-reply-row.integration.test.ts` — AU27 *disproved* the first (its own 5-lane test runs the
assistant with a real sandbox and MCP bridge) and deleted the second. This is the "reads as coverage but
cannot fail" species; worth folding into the same cleanup as W8.

**N2 — The `no-ungated-stream-drain` ESLint rule no longer covers the primary turn drain.** Its `files`
scope (`eslint.config.ts:1137-1141`) is `core-api/src/services`, `agent-execution/harness-registry`,
`desktop`, `remote-worker`. The canonical turn drain is
`packages/agent-orchestration/run-orchestration/src/provisioner.ts:1482` — outside every glob. Pre-existing
(the AU19 relocation), but AU27 edited exactly that drain and renamed the rule's marker strings, so it is
the natural moment to repoint the scope.

**N3 — No wiring-completeness proof for the new optional bake dep.** `resolveOrCreateCallingThread` is
optional on all four resolvers (`task-run-resolver.ts:104`, `session-start-resolver.ts:83`,
`proposed-call-workflow.ts:244`, and via `ReviewPorts:185`). Dropping any one composition-root wiring
degrades silently to "no `callingThreadId`" ⇒ `reply` returns `NO_CALLING_THREAD` — no type error, no test
failure. `architecture.md` §7 Inc 1 promised the K1 precedent explicitly: *"every composition-root resolver
site gets a proof it supplies the bake, each sanity-broken."* Not delivered; the resolver tests inject a
local `resolveOrCreateCallingThreadForTest` fake. AU21's K1 was reopened for a wiring gap of this exact
shape. I verified all five sites by hand this round; nothing mechanically holds them.

**N4 — `@lore` provenance referring to `@hyperidle/dispatch` survives in six places.**
`core-api/routine/src/index.ts:51,67`, `routine/src/ports.ts:22`, `routine/src/routine-scheduler.ts:32,109`,
`services/routine-scheduler-bindings.ts:4`. These are relocation-history tags, which `architecture.md`
Decision 8 explicitly preserves, so this is consistent — flagged only so the boundary between "provenance
(keep)" and W4's "false present-tense assertion (fix)" is on the record.

**N5 — `package-lock.json` was not regenerated.** It still declares the workspace
`packages/agent-orchestration/dispatch` (`:16539-16546`), the link `node_modules/@hyperidle/dispatch`
(`:2739-2742`), and `"@hyperidle/dispatch": "*"` under `packages/core-api` (`:16629`), none of which exist.
`npm ci --dry-run` tolerates it (removes the stale link, exit 0), so this is not CI-breaking — but the next
`npm install` on any branch produces an unrelated lockfile diff. Regenerate.

**N6 — Test-world type escape hatches.** ~20 `as ProvisionSessionParams` / `as unknown as RuntimeDeps` /
`db as HyperIdleDb` casts in the new run-orchestration integration tests, plus two
`buildToolDefinitions(...).find(...)!` non-null assertions. All match the existing `test-ports.ts` house
pattern, all in `__tests__`. **Production adds zero new casts, `any`s, suppressions or non-null
assertions** — that half is clean.

**N7 — Generic transcript-in-system-prompt.** `provisioner.ts:485-490` renders the calling-thread
transcript verbatim into the system prompt for *any* kind that bakes one. Today only `assistant_turn` bakes
a transcript and its content is the principal's own, so no trust boundary is crossed. If a future kind
bakes a transcript containing third-party content, this becomes a prompt-injection surface. Recorded, not
actionable now.

**N8 — Thread creation is check-then-insert with no unique constraint.**
`calling-thread-bindings.ts:31-44` does `findThread` then `insertThread`; `threads_host_idx`
(`schema.ts:739`) is a plain index on `(hostKind, hostId, lastActiveAt)`, not unique. Two concurrent emits
for the same task, or an emit racing the UI's `resolveOrCreateHostThread`, can create two threads for one
host. `findThread` then returns an arbitrary one. Pre-users, so low stakes; the idempotency test only
covers the sequential case.

**N9 — AU27 removes 12 `AL6` badges from production and adds 83 `AU27` ones.** 83 `AU27` mentions across
non-test production source; 160 lines repo-wide referencing `AU27 Increment N` / `Decision N` / `C11` /
`BLOCKER fix` / `plan.md` / `architecture.md`. Bare `@lore AU27` is the sanctioned repo-wide convention and
I am not objecting to it. `AU27 Increment 8 (BLOCKER fix)` and `AU27 C11` are different — they name
sections of a `.pipeline/` document that `/pipeline:write-docs` retires, so the pointer dies. Worth a
convention decision, not a fix in this WP.

**N10 — `CLAUDE.md` is stale ground truth (pre-existing, not AU27's doing).** `:130` lists
`packages/server`, `packages/fabric`, `packages/strategy-minimal` as monorepo members; none exist
(`ls packages/` = agent-execution, agent-orchestration, api-contract, core-api, db, design-system, desktop,
eslint-plugin-authz, eslint-plugin-design, eval, remote-server, remote-worker, shared, web). `:124` cites
`packages/fabric/src/services/` as where the schedulers live. This is the same false-ground-truth class
this WP has been cleaning, at the file every agent reads first.

**N11 — Residual, honestly scoped.** `return-status-tool.ts:80`'s force message uses bare tool names
because `ToolContext` carries no harness type. The builder flagged this and it is genuinely scoped: the
*other five* sites all name the harness-literal tool, and this sixth is an agent-initiated self-check whose
`forceMessage` is advisory — the gate itself is unaffected, and `isRequiredReturnAction`'s
`stripMcpNamespace` accepts every dialect (`return-gate-required-actions.test.ts:34`). Not a hole. The
adjacent `:113` static description, however, is a real gap — see W6.

---

## Test honesty

- `requireHarness` still hard-fails (`require-harness.ts:82-90`); no `skipIf`-to-green anywhere in the new
  tests (grepped).
- No stub of the thing under test. `assistant-reply-live-harness.integration.test.ts` uses the sanctioned
  `harnessTestResolvedModel` model seam only — the adapter, sandbox, MCP bridge, route and `reply` call are
  all real — and it documents precisely why (`:11-27`), including the codex-keychain hazard.
- The Increment-8 assertion **genuinely cannot pass on a failed turn**: it requires
  `payload.text` to be defined, to differ from `SESSION_NOT_RETURNED_NOTICE_TEXT`, and to contain
  `HARNESS_REPLY_OK` (`:311-325`). The never-silent false green is closed here. It is **not** closed in the
  sibling AU9 test — W2.
- Static/structural properties are enforced by lint or the type system, never `readFileSync`-in-a-test. The
  one test that read the filesystem (`return-enforcement-naming-guard.test.ts`) is deleted with its guard;
  even while it existed it tested `checkContent` as a pure function, which was compliant.
- New tests are honestly located: unit properties in `*.test.ts`, DB/app properties in
  `*.integration.test.ts` (service project), real-binary properties in `HARNESS_INCLUDE`
  (`vitest.integration.config.ts:33-35`).

---

## World counts

| World | Files touched | Standard applied |
|---|---|---|
| Production source (`packages/*/src`, `packages/*/*/src`, non-test) | ~40 (6 deleted, 3 created, ~31 edited) | Full six lenses. Zero new `any`/suppression/non-null assertion. |
| Tests / fixtures (`__tests__`, `*.test.ts(x)`, `e2e`) | ~40 (6 deleted, ~10 created, ~24 edited) | Honesty + non-hollowness. House-pattern casts accepted. |
| Tooling (`scripts/`, `eslint.config.ts`, vitest configs, `package.json`) | 10 | Correctness of the guard surface. |
| Docs (`docs/`) | 8 | Ground-truth accuracy. |
| Pipeline state (`.pipeline/`) | 5 | Contract record. |

**Production never imports test or tooling code.** Verified: no `packages/**/src` non-test file imports
from `scripts/` or from a `__tests__` path (`require-harness.ts` is imported only by tests, and
`honest-harness-predicate.ts` only by `scripts/`). The one direction that does cross —
`packages/db/src/__tests__/return-enforcement-naming-guard.test.ts` importing `scripts/al6-naming-guard.js`
— was test→tooling and is now deleted.

---

## Verdict rationale

The work package's stated content — the generic `reply` tool, `ToolContext.threadId` baked at emit, the
assistant onto the shared poller, the deletion of `conversational` mode and `@hyperidle/dispatch`, and the
`AL6` purge — is delivered, in full, against a green `check` / `lint` / `test` / `test:integration:service`
/ `knip` and a green AU21 boundary guard with **zero** exemptions added and one removed. The founder's two
added ACs are met, and the struck one is genuinely absent rather than half-built. No CRITICAL finding, no
security hole, no boundary regression, no forbidden edge under the track's corrective closure rule.

Eight WARNINGs remain. Four are documentation/comment falsehoods this diff created (W4, W5, W6, W7) — W6
is the one with teeth, because `return-status-tool.ts:113` misinstructs a live agent and the eval seeds at
`force-return.ts:66,76,313,323` are now defeatable by the very tool this WP added. Two are test-strength
gaps (W1's merge-lane hole, W2's surviving false green). W3 is a real behavioural divergence in the new
thread-creation path. W8 is a dead guard that survived the cull the founder just ordered.

None of these unmeets an AC and none blocks the mechanism from working — but W2 (a proof that can pass on a
failed turn), W6 (an agent told to call the wrong tool) and W8 (a guard that cannot fail) are each exactly
the class of thing this review exists to catch, and W6's eval breakage is a live correctness regression
rather than staleness. They are cheap and local to fix.

VERDICT: NOT DONE
