# BA2 — Architecture critique (r2)

Independent re-evaluation of `architecture.md` + `feasibility.md` as they stand. `architecture-critique-r1.md`
was not read. Every load-bearing claim below was checked at its cited `path:line` in this worktree with
`rg -a` and by reading the file; `hyperidle-trace` MCP tools were not available in this session either, so
negatives were established by whole-tree enumeration and are shown.

**Verdict: BLOCKED — 5 blocking findings.**

---

## What holds up

Fact-audited and confirmed, against the code, not the shape:

- **F1 / §1 "the capture machinery is production-dead".** Reproduced the enumeration independently:
  `sessionWorkflow` outside `__tests__` appears at `harness-adapter.ts:129`, `run-orchestration-composition.ts:332`,
  `runtime.ts:450`, `contracts.ts:49,257`, `provisioner.ts:304,321,789,1195,1211,1469`, `tool-registry.ts:86,91`,
  `tool-types.ts:139` — every one a type or a pass-through, no constructor. `start-runtime.ts:164-171` is the only
  production `runSession({mode:"durable"})` and passes none. Phase 4 is a removal, not a behaviour change.
- **B3 / F18.** `tool-definitions.ts:642-657` takes the `review` branch only `if (input.artifactRef)`;
  `artifactRef` is optional at `:594`; `RichMessageCard.tsx:318` defines `isReview` and `:377` gates the verdict
  toolbar on it. A plain review request genuinely has no approve control. The fix (`clearsRuleId` ⇒ `artifactRef`)
  is correctly placed, and `reviewPayloadSchema` (`threads-schema.ts:157`) already requires `artifactRef`, so the
  two agree.
- **F22 / the payload strip trap.** `reviewPayloadSchema` (`threads-schema.ts:155-159`) is a plain `z.object`
  used in *both* `messageInputSchema` and the row schema, so adding `taskId`/`clearsRule` there covers write and
  read-back. The `@lore` at `:209-211` is real and says what the document says it says.
- **B6 / F21.** `buildSandboxedEnv` (`cli-harness-adapter.ts:313-329`) forwards `process.env[key]` per allowlist
  key and then applies `resolvedEnvMap` over it; the `CODEX_HOME` rule and its per-session injection are at
  `:522-533`; `XDG_DATA_HOME` is in opencode's allowlist at `adapter-pool.ts:384`. The prescribed lever is the
  right one and the distinction the document draws is real. Re-engage re-spawns with `session.spawnEnv`
  (`cli-harness-adapter.ts:848`), so the injection carries to the re-engage path too.
- **`--pure` removal sites.** `adapter-pool.ts` opencode args (the `"--pure"` entry in the `run` array) and
  `cli-harness-adapter.ts:825`. Both real.
- **The `routineRunOutcome` precedent.** `events.ts:166-178` carries exactly the wording quoted, including
  "the literal replacement for `run-orchestration`'s deleted direct `routineRuns` write". The *shape* claim
  (additive field on an already-emitted event, consumed by a core-api subscriber) is correct.
- **B5 / F20.** `service-bootstrap.ts:378-380` wires `registerReviewSubscriptions`; `session-review-creator.ts:39-66`
  subscribes `session_ended` → `handleUnconsumedGrantOnSessionEnd`; `proposed-call-workflow.ts:681-729` is
  `applyLivenessRetry` and its second no-show writes the `operationOutcomes` failed row at `:719-726`. The net is
  live and both its tables are on the delete list. The pre-existing bug is real too: `session-review-creator.ts:58`
  passes `resolveOrCreateCallingThread`, and `handleUnconsumedGrantOnSessionEnd`'s own `applyLivenessRetry` call
  (`:758-765`) omits it.
- **`proposed_call_executed` names a fact that cannot occur.** Whole-tree enumeration finds only the two type
  declarations, the union and registry entries, one doc comment (`routes/reviews.ts:30`) and one test — no
  production emitter. `.pipeline/BA.md:51` does assign the decision to BA2. The deletion is correctly BA2's call.
- **F19.** `threads.ts:1630-1636` is verbatim as quoted. **F16** — `SessionLifecyclePorts` (`provisioner.ts:417-478`)
  has exactly the five members named and no `coreApi`. **F3** — `calling-thread-bindings.ts:44-80` does what is
  claimed, including seeding the human participant. **`submit_review` is a return action** (`return-actions.ts:33`).
  **`create_artifact` exists** (`tool-definitions.ts:1400-1404`). **Migration numbers**: `0060` is the highest on
  disk, so `0061`/`0062` are the next free, and the descriptive-name divergence is right.
- **Ownership.** `table-owners.json` totals 37/37 owned; `review` owns exactly the three tables being retired;
  `agentRunConfig` is `run-orchestration`'s. 37 − 3 + 2 = 36 is correct, and the "core-api may not read
  `agentRunConfig`" premise stands under the repo's ownership rule.
- **N2 and N1, both upheld and now stated honestly.** `createMcpSession` returns `{token,sessionId,mcpServer,transport}`
  (`mcp-bridge.ts:163`), `McpSessionRegistry.lookup` is typed `{sessionId}` (`mcp-route.ts:16-19`),
  `enforcementRegistry` is created at `boot.ts:162` and is a different object. The document no longer claims an
  existing pattern, and that correction is right.

---

## BLOCKING

### BLK-1 — §2.7's liveness flag cannot be read where §2.7 reads it

`§2.7`: *"The flag lives on the per-session bridge entry, alongside the gate itself (§2.4's widening)"* and
*"at teardown it reads the flag off the runtime object it already holds — the identical call shape as
`computeForceReturnCount()` (`provisioner.ts:1578-1583`)"*.

Three facts, each verified:

1. `provisioner.ts:1573-1578` — **the bridge is closed before teardown**, with the comment
   *"X2: Unregister the MCP bridge BEFORE calling endSession/crashSession"*. `closeMcpBridge` →
   `McpToolBridge.close` → `sessions.unregister(token)` → `active.delete(token)` (`mcp/index.ts:44-47`). The
   per-session entry, and anything hung on it, is gone before either `transitionRun` call (`:1608` crash path,
   and the completed path below it).
2. `openMcpBridge` returns `{ readonly token: string; readonly url: string }` and nothing else
   (`provisioner.ts:253-263`). There is **no accessor on `SessionLifecycleHarnessRuntime`** by which
   `run-orchestration` could read anything back off the bridge entry, and §2.4's three declared widenings
   (`createMcpSession` return, `McpSessionRegistry.lookup`, `bridge.open` param) do not add one.
3. The cited "identical call shape" is not the same object. `computeForceReturnCount` reads
   `ports.harnessRuntime.enforcementRegistry.get(sessionId)` — and §1's own N2 row and F5 both say
   `enforcementRegistry` is a *separate process-level object* from the bridge token map. The document's own
   correction contradicts §2.7's justification.

**Impact.** The plan constraint *"A gate that fails open must be detectable"* and AC-map row 8 rest entirely on
this read. A builder following §2.7 literally writes an accessor nobody declared onto an entry that no longer
exists at the point of the emit. **Authority:** `plan.md` Constraints; `requirements.md` AC1/AC2 context.

Note: §2.4 step 1 has `run-orchestration` *construct* the gate and hand it to `openMcpBridge`, so
`run-orchestration` holds that object for the session's life — a placement that would work. §2.7 states the other
one. Which of the two is meant has to be settled in the document, not by the builder.

### BLK-2 — the silence conditions do not cover the field's own absence, and two live producers never set it

`§2.7` declares `gateChannel: string | null` and makes silence condition 1 *"`gateChannel` is `\"none\"`"*.
`§2.4 N9` and `§2.7` also say a task-free session *"reports `null`"*. Those are two different values and only one
of them silences.

Worse, `session_ended` has more producers than the two `transitionRun` sites the document names:

- `layers/agent-orchestration/run-orchestration/src/runtime-reapers.ts:196-208` — `reapStaleRoutineSessions`
  emits `session_ended` directly for every stale routine session, carrying `routineRunOutcome:"timeout"` and no
  session context. It is a live production path (the same second-producer channel `events.ts:166-178` documents).
- `layers/agent-orchestration/run-orchestration/src/session-store.ts:206-217` — `endSessionByCas` emits it too
  (exported at `run-orchestration/src/index.ts:71`; no production caller found today, so this one is latent).

For any team that has at least one rule, a reaped session yields `gateChannel === undefined` (≠ `"none"`) and
`gateAlive === undefined` (≠ `true`), so **the subscriber posts "the permission gate could not be confirmed"
into that task's thread on a session it was never able to gate — including a builtin one**, which is precisely
the cry-wolf failure B2 exists to prevent and the consequence ruling 7 says is accepted rather than reported.
§6's B2 assertions test only builtin and a not-yet-shimmed harness, so nothing named would catch it.

**Authority:** `founder-rulings.md` §7; `plan.md` AC1 ("nothing interrupts and nothing is reviewed" on a fresh
system) and the fail-open-detectable constraint.

### BLK-3 — the `actionGate` forcing function does not exist at the level claimed

`§2.7` and `F17`: *"`actionGate` is a new **non-optional** field on `HarnessCapabilities` … declared per adapter
in `adapter-pool.ts` exactly as `returnEnforcementChannel` is (`:327,388,474,503`) … `npm run check` fails any
adapter that doesn't declare this."*

At the code:

- `adapter-pool.ts:327,388,474,503` declare **`returnEnforcementChannel`**, a field on `CliAdapterConfig`, and it
  is **optional**: `readonly returnEnforcementChannel?: ReturnEnforcementChannel;` (`cli-harness-adapter.ts:121`).
- All four CLI harnesses share **one** `getCapabilities` implementation, which fills the non-optional capability
  from that optional config with a fallback: `returnEnforcement: this.config.returnEnforcementChannel ??
  deriveCliChannel(this.config.binary)` (`cli-harness-adapter.ts:959-960`).

So the compiler forces **one** value for all four CLI harnesses, not one per adapter. A phase-3 task that ships
its shim and forgets its declaration compiles, gets whatever the shared site defaults to, and — if that default
is the silent value — **permanently disables the only detection of a dead gate for that harness**. No named test
catches it either: §6 step 8 asserts `gateAlive === true`, not that `gateChannel` names the shim.

The enumeration of construction sites is also short. Production `HarnessCapabilities` constructors are
`builtin-harness-adapter.ts:347`, `cli-harness-adapter.ts:957`, and **`remote-harness-adapter.ts:207-223`** — a
real adapter registered at `layers/agent-execution/src/boot.ts:199`, absent from T2's *"declared `\"none\"` on all
five adapters"*. (`tools/eval/src/direct-harness-adapter.ts:124` and the `__testing__` mock are two more, outside
the shipping roots.)

**Impact.** The self-scoping property B2 was rewritten around is asserted on a mechanism that does not do what is
claimed. **Authority:** `plan.md` constraint (fail-open must be detectable); §2.7's own claim.

### BLK-4 — the no-clearance approval has no resumption identity, and "nothing new is built" is false there

`§2.5.1`: *"Resume the agent, always … the existing emit-time bake records the reengagement"*, and `§2.9`:
*"Reuse the live machine, re-keyed from a proposed call to a clearance … Nothing new is built. Per §2.5.1 it now
runs on **every** approval."* `§6` makes the empty-list case a first-class assertion (B4) and calls it the
founder's day-one flow.

The machine cannot run without a row:

- `resolveReengagementRequest(db, proposedCallId, deps)` (`proposed-call-workflow.ts:299-370`) takes an id, loads
  the call **and its grant**, throws `ReengagementSourceUnavailableError` if either is missing, and returns
  `sourceId: view.call.id` and `sourceCorrelation: { taskId, proposedCallId, grantedAgentId }`.
- `agentSessionRequests.sourceId` is `text(...).notNull()` (`framework/db/src/schema.ts`, `agentSessionRequests`
  definition), and the idempotency unique index is `(sourceKind, sourceId, idempotencyKey)`.
- `proposedCallSessionRequestInputSchema` (`framework/domain-model/src/session-request.ts:95-104`) requires
  `sourceCorrelation.proposedCallId: z.string().min(1)` — non-optional.

On the day-one flow there is no clearance, therefore no id, therefore no `sourceId` and no correlation key. §2.11's
rename table lists `proposedCallId → clearanceId` at those exact lines with no mention of making it optional, and
§2.9 asserts nothing new is built. A builder reaches this and must invent the missing contract (a second entry
shape for the resolver; a `sourceId` derived from the review message; an optional correlation member; an
idempotency key) — product/structural invention in the flow the document calls the most common one.

**Authority:** `requirements.md` AC4 and D10; `interview-2026-08-25.md` ("on a fresh system the agent always
self-elects"); `founder-rulings.md` §1.

### BLK-5 — the gate-unproven alarm has no named assertion that it ever fires

Every named check on §2.7 asserts **silence**: §6 harness-lane step 8 (*"`gateAlive` was true … and that **no**
gate-unproven message was posted"*), §6 B2 (*"a builtin session and a not-yet-shimmed harness produce **no**
gate-unproven message"*), §6 CI half (*"the subscriber's three silence conditions"*). The red-case table's rows
resolve to *"step 8 fails"* — i.e. `gateAlive` goes false — never to *"the message appears in the task's thread"*.

A subscriber that computes the conditions correctly and then posts nothing at all passes every assertion the
document names. The one obligation §2.7 exists to discharge — the human learns a gate could not be confirmed —
is unproven, while its two siblings (§2.9's admission-failure message and §2.10's second-no-show message) both
get positive assertions (§6 B5, §6 AC6). Given BLK-1 and BLK-2 both break this mechanism in ways that only show
up as a *missing* message, the one-sided evidence is what would let them ship green.

**Authority:** `plan.md` constraint *"A gate that fails open must be detectable"*; `.claude/rules/testing.md` /
`CLAUDE.md` (proof is the observed output, not the absence of one).

---

## NON-BLOCKING DEFECTS

- **N-1 — the delete/rename enumeration is short by several sites.** All compiler-caught, none silent, but the
  builder's checklist should say so: `framework/domain-model/src/proposed-call.ts` (a whole 47-line file, exported
  at `framework/domain-model/src/index.ts:153-154` as `ProposedCall`/`ProposedCallStatus`/`Reversibility`); the
  **duplicate** `ProposedCallExecutedEvent` in `framework/domain-model/src/events.ts:564` and its union entry at
  `:634` (§2.11 names only the `event-bus` copy); `framework/event-bus/src/index.ts:28`;
  `framework/db/src/index.ts:59,66,82`; `layers/agent-orchestration/src/index.ts:62`;
  `layers/agent-orchestration/tool-handlers/src/index.ts:36,39,40`; and
  `layers/core-ui/src/pages/review/ReviewComposition.tsx:733-740`, which reads `artifact.proposedCall` /
  `artifact.stagedOperation` and is not named in §2.11's UI list.

- **N-2 — the verdict vocabulary is five-valued, not two.** `VERDICT_DECISIONS` has five members
  (`framework/domain-model/src/thread.ts:38-44`) and the in-thread toolbar renders all five
  (`RichMessageCard.tsx:81-87`), but the verdict route's own schema accepts only
  `["approve","request-changes","reject"]` (`threads.ts:1593`). §2.5.1's "approve" / "any non-approve" split does
  not cover `approve-with-comments` and `edit`, which 400 today. Pre-existing, but a human clicking "Approve with
  comments" on a BA2 review neither clears nor declines nor resumes, and the document reads as if it does.

- **N-3 — an approved review whose `clearsRuleId` never matched has no human-facing signal.** §2.5 returns
  `clearanceAttached: false` **to the agent**; §2.5.1 treats a wrong rule id as a normal branch; §2.10's net
  triggers only on a clearance that is `cleared` and never `spent`, so it cannot fire when nothing was ever
  cleared. The block stays in place, the human's approval did nothing, and nobody is told. Not blocking because
  the resumed agent hits the same rule and can raise a second review — but that is a recovery, not a report, and
  `plan.md` says the silent-failure shape may not be reproduced anywhere new.

- **N-4 — §9 reverses `requirements.md`'s recorded decline assumption without flagging it as a change.**
  `requirements.md` "Assumption taken, not confirmed" says a decline carries the human's reasoning back and the
  agent may re-argue. §9 implements *"decline sets `declined`, the agent is not resumed, nothing stops it raising
  a better review later"* — but the agent's session has already ended (it satisfied the return gate by calling
  `submit_review`, `return-actions.ts:33`), so nothing brings it back and "later" has no trigger. The assumption
  is overturnable; overturning it is a founder call and should be raised as one.

- **N-5 — §6's B6 assertion needs its red case spelled out to be non-vacuous.** *"with a decoy plugin and
  permission block planted in a scratch global config location"* only reproduces the named red case
  ("allowlist `XDG_CONFIG_HOME` instead of injecting it") if the test also sets `process.env.XDG_CONFIG_HOME` to
  that decoy directory before spawning — `envAllowlist` copies from `process.env` and copies nothing when the var
  is unset (`cli-harness-adapter.ts:314-320`). Research §5 (`opencode.md:167-179`) proved both halves; say which
  one the assertion drives.

- **N-6 — F16's own fallback is the shape §2.7's stated placement actually requires.** If BLK-1 is resolved by
  keeping the flag off orchestration entirely, the fallback already written into §2.7 (`review` records the
  `phase:"session-start"` ping, which crosses the seam anyway) removes the additive-field question in §9 as well.
  Recorded, not prescribed.

---

## FOLLOW-UP / NOTE

- The `action_operation` canvas keeps a header that describes the killed concept
  (`ReviewActionOperation.tsx:1-17`, *"staged, PRE-COMMIT receipt … the reviewer's verdict is what fires the
  side-effect"*). F12 correctly puts canvas rework out of scope; the stale framing is worth one line in T14's doc
  pass so the next reader does not take it for current.
- `resolveOrCreateHostCallingThread` seeds participants from `findUser(db,{kind:"human"})` — the sole-human
  assumption (`calling-thread-bindings.ts:55-56`). Not BA2's row (BA7 owns it), but every thread this feature
  creates inherits it.
