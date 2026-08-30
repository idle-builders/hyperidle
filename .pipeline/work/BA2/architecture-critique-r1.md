# BA2 — Architecture critique

**Target:** `.pipeline/work/BA2/architecture.md` + `.pipeline/work/BA2/feasibility.md`
**Authority order used:** `interview-2026-08-25.md` → `founder-rulings.md` → `plan.md` →
`requirements.md` → `harness-research/` → `.pipeline/BA.md`, `CLAUDE.md`, `ETHOS.md`,
`tools/governance/`. `superseded/` was not opened.
**Method:** every load-bearing claim was re-derived from the checkout at its cited `path:line`; the
`hyperidle-trace` MCP tools were not available in this session either, so negatives were established
by `rg -a` enumeration plus reading each hit, and the enumeration is shown where it decides a finding.

**Verdict: NOT PASS — 6 blocking findings.**

---

## What holds up

These were checked, not assumed, and they are correct.

- **The AL7 capture path is production-dead.** `tool-registry.ts:86` gates the whole router on
  `options.sessionWorkflow`. Enumerating every `sessionWorkflow` occurrence outside `__tests__`:
  `harness-adapter.ts:129`, `run-orchestration-composition.ts:332`, `runtime.ts:450`,
  `contracts.ts:49,257`, `provisioner.ts:304,321,789,1195,1211,1469`, `tool-registry.ts:86,91`,
  `tool-types.ts:139` — every one a type or a pass-through, **no constructor anywhere**. The only
  production `runSession({mode:"durable"})` site is `run-orchestration/src/start-runtime.ts:165` and
  it passes `{mode, request, sandboxBasePath, …}` with no `sessionWorkflow`. Phase 4 is a removal.
- **`docs/process-layer/staged-operation.md:14` is false about its own code.** It says "The only
  `sessionWorkflow` producer in production is the session-2 grant path (the task dispatcher, wired in
  `layers/core-api/src/service-bootstrap.ts`)". `rg -a "sessionWorkflow"` over
  `layers/core-api/src/service-bootstrap.ts` and `layers/core-api/src/services/` returns zero hits.
- **Ownership.** `table-owners.json` has 37 tables; `review` owns `proposedCalls`, `tailoredGrants`,
  `operationOutcomes` (−3/+2 → 36 is right). `org` owns `teams`, and `filesystems` is a real
  precedent for a team-scoped table owned elsewhere. `configurationOverrides`
  (`framework/db/src/schema.ts:1184-1209`) is unique on `(kind,key)` with no team column and a
  five-kind check constraint — it cannot hold a per-team list without changing the contract of BA9's
  surface (ruling 2). `policy` owns no tables. The three rejections are sound, and no consumer
  outside `review` needs to read either new table: the adjudicator arrives over `CoreApiPort`, the
  settings screen over an HTTP route, and `routes/threads.ts` is core-api layer code that may call
  its own service's barrel (it already imports `transitionProposedCall`).
- **The per-harness details match both the research and the adapter code.** `--pure` at
  `adapter-pool.ts:366` and again at `cli-harness-adapter.ts:825`; `--dangerously-bypass-hook-trust`
  at `cli-harness-adapter.ts:520-533`, conditional on `.codex-home` existing; `--permission-mode
  bypassPermissions` at `adapter-pool.ts:455-456`; cursor's `returnEnforcementChannel: "none"` at
  `adapter-pool.ts:503` (so cursor genuinely gets no provisioned file today); the claude settings
  object with `Stop` at `provision-return-hook.ts:152-166`; codex's `hooks.json` builder at
  `:308-323`; the opencode plugin dir at `:397` — and research `opencode.md:118` confirms opencode
  loads from **both** `.opencode/plugin` and `.opencode/plugins`, so "beside the existing one" is
  safe. `user_message`-not-`agent_message`, `failClosed`, never-`"ask"`, `apply_patch`'s
  whole-patch `tool_input.command`, and the `MCP:`-prefix exclusion all trace to demonstrated
  findings (`cursor-agent.md:20-25,146-155,175-186,238-239`; `codex.md:104-105,201-228`).
- **AC5 is genuinely structural.** A clearance row is created only by a real block; rules are created
  only by a human in settings; `submit_review` with an unmatched `clearsRuleId` stamps nothing. There
  is no path by which naming an action in a review can cause it to be blocked, for that agent or any
  other. This is the right shape and it survives the two-agent / two-session / rule-added-midway
  cases.
- **`submit_review` really does anchor to the bet** (`tool-definitions.ts:613-620,634-637`) and really
  does return `betId` (`:660`) with no production consumer — `rg -a "submit_review"` finds only docs,
  tests, and `return-actions.ts:33`, which names it as a return action, not a caller.
- **BA8 is handled correctly.** `.pipeline/BA.md:51` says in terms that whether
  `proposed_call_executed` "survives, is renamed, or is dropped is BA2's architecture to settle".
  §2.10 settles it and does not edit BA8's row. Ruling 2 (`enabled` stays, BA9's) is respected.
- **No work-package ids leak into code.** Migration names, table names and the test-file name are all
  descriptive; §5's note on diverging from the `0059_BA1_…` precedent is the right call.
- **Scope.** Two tables, one route, one optional tool field, four shims, one settings screen. No
  classifier, no capture, no argument pinning, no reversibility tier, no per-agent scope. That is
  proportionate to `mvp` and to the founder's "let's not build a gigantic machinery".

---

## BLOCKING

### B1 — §2.7's proof of liveness needs two crossings `run-orchestration` does not have, and neither is declared

§2.7: *"At session teardown, the provisioner asks the gate whether it ever heard from the session. If
it did not **and the session's team has at least one rule**, that is recorded as a gate-unproven
session and **a plain message is posted into the task's thread**."*

Both italicised facts are outside this service.

- `@hyperidle/run-orchestration`'s manifest (`layers/agent-orchestration/run-orchestration/package.json`)
  depends on `@hyperidle/db`, `diagnostics`, `domain-model`, `event-bus`, `harness-capability`,
  `harness-protocol` and nothing else. It cannot import `@hyperidle/review` (to ask whether the team
  has a rule) or `@hyperidle/conversation` (to post the message).
- Its injected surface is `SessionLifecyclePorts` (`provisioner.ts:417-478`): `sessionRequests`,
  `observability`, `harnessRuntime`, `toolProvider`, `contextAssembly`. There is no `coreApi` member
  and no conversation write.
- The architecture nowhere names the new port ops, or the event + core-api subscriber that would
  carry the message (the shape `session_not_returned` uses at `provisioner.ts:1633-1660` with a
  `conversation` subscriber). T2 says only "the teardown gate-unproven check".

It also contradicts the same document one section earlier. §2.6 refuses to gate the seed prompt on
the team having rules because *"Gating it would require a domain read on the run path, which
`run-orchestration` does not do"* — and then §2.7 requires exactly a domain read from
`run-orchestration`, while §2.4 insists "The read must be live, per call. Nothing here is baked at
emit time." One of these two positions has to give, and the document does not say which.

This is the newest and most load-bearing mechanism in the package — it is what discharges the plan's
constraint *"A gate that fails open must be detectable"*. Leaving its two contracts implicit is what
produces a builder decision made in the wrong service.

### B2 — the same mechanism cries wolf on sessions it was never meant to cover

§2.7 states exactly one silence condition: an empty rule list. Two populations then get a false alarm.

- **builtin.** The MCP bridge is opened only for `selectedAdapter.meta.type !== "builtin"`
  (`provisioner.ts:1340`), so a builtin session never has a gate entry and can never ping. Every
  builtin session for a team with one or more rules would therefore be reported as "the permission
  gate could not be confirmed". Ruling 7 says builtin is out of scope and that the consequence — a
  team's rule does not reach a builtin agent — is *accepted*; reporting it once per session is the
  opposite of accepting it.
- **harnesses not yet shimmed.** The task order puts the teardown check in T2 (phase 2) and the
  codex / cursor-agent / opencode shims in T7–T9 (phase 3). Between those phases every codex,
  cursor and opencode session for a team with a rule reports gate-unproven, correctly by the letter
  and uselessly in fact.

A signal that fires on sessions nobody intended to gate is a signal a human learns to ignore, which
costs exactly the property §2.7 exists to buy. The check needs a stated scope — "a CLI harness with a
provisioned shim" — and the architecture does not give it one.

### B3 — a review with no `artifactRef` is unapprovable, and the design assumes it is not

§2.8 concludes: *"the in-thread verdict bar (`RichMessageCard.tsx:333`) already renders review
messages with approve/decline in any thread — so the human-facing half of AC3 and AC4 needs no new
surface."*

The verdict toolbar renders under `if (isReview)` (`RichMessageCard.tsx:376-396`), and `isReview` is
true only for a `review`-typed message with a valid payload (`:318`). But `submit_review` posts a
`review` message **only when the agent supplied an `artifactRef`**; without one it falls back to a
`plain` message (`tool-definitions.ts:643-657`). `artifactRef` is optional in the input schema
(`:593`).

So a pushed-back agent that calls `submit_review` with `clearsRuleId` and no artifact produces:
a plain message with no approve/decline affordance; a `blocked` clearance row stamped with that
message id (§2.5 stamps unconditionally); no way for the human to clear it; no resumption; and
nobody told. The agent is permanently blocked on that rule for that task and the human sees a chat
message that looks like a request and cannot be answered. AC3, AC4 and AC7 are all unreachable on
that path, and it is the path an agent takes whenever it does not build an artifact first.

The architecture must decide this explicitly — require an artifact when `clearsRuleId` is set,
reject the call, or give the plain message a verdict affordance — not assume the review branch.

### B4 — approving a review that carries no clearance is undefined, and the inherited code silently does nothing

§2.5 defines the approve verdict only for rows that exist: *"rows with `reviewMessageId = <that
message>` and `state='blocked'` move to `cleared`."* It never says what happens when there are none.

Today's route already answers, and the answer is silence: `routes/threads.ts:1631-1636` —

```
const pcView = await findProposedCall(db, { by: { reviewMessageId: messageId } });
if (!pcView) {
    // No PC anchored to this review message — verdict accepted but nothing to do
    return c.json({ ok: true }, 200);
}
```

Two reachable populations land there under BA2:

- **the founder's day-one flow.** The interview and the plan both say the list starts empty and *"a
  fresh system means the agent always self-elects"*. A self-elected review was never blocked, so
  §2.5 attaches nothing (`clearanceAttached: false`). The human approves. Under the inherited branch
  nothing clears and — critically — **nothing resumes the agent**, because resumption in §2.9 is
  driven off the clearance transition. The agent that asked is never brought back. D10 and AC4 both
  say the agent is brought back and decides when it is done.
- **a review that names the wrong rule id**, or one whose rule the human deleted in settings between
  block and approval (`ruleId → teamActionRules.id, onDelete: cascade` in §2.2 removes the clearance
  row with the rule). Approve returns `ok`, nothing happens, nobody is told.

Both are "approved-but-not-done", which the plan names as *"a defect this package may not
reproduce"*. The architecture has to state whether an approval with no clearance resumes the agent,
and what the human sees if it cannot.

### B5 — the live `session_ended` liveness net is in neither the delete list nor the survivor list, and its table is being deleted

`registerReviewSubscriptions` is wired in production at `layers/core-api/src/service-bootstrap.ts:379`
and subscribes `session_ended` (`session-review-creator.ts:39-62`) → `handleUnconsumedGrantOnSessionEnd`
(`proposed-call-workflow.ts:733-765`), which selects `tailoredGrants` where `consumed = false` for
`(taskScope, agentScope)` and applies `applyLivenessRetry`: first no-show re-provisions once, second
no-show holds the proposed call and writes a `failed` `operationOutcomes` row
(`proposed-call-workflow.ts:681-729`).

§2.10 deletes `tailoredGrants` and `operationOutcomes`, and says `applyLivenessRetry` "survives,
re-keyed" — but never mentions `handleUnconsumedGrantOnSessionEnd`, `session-review-creator.ts`, or
the `session_ended` subscription that is `applyLivenessRetry`'s **main trigger**. Two consequences:

- the file stops compiling on both deleted tables, and it is not on the delete list;
- the behaviour it provides has no stated replacement. In BA2 vocabulary its trigger is "the resumed
  session ended with the clearance still `cleared` and never `spent`" — the agent came back and did
  not do the thing. Today that retries once and then surfaces a failure; after BA2 as written it does
  nothing at all, silently. That is a regression on the exact class of silence AC6 and the plan's
  constraint are about.

§2.9 covers only the *admission* failure branch (`agent-run-admission-reactions.ts:107-121`). The
session-ended branch is the other half of the same net and is unaccounted for.

### B6 — the stated lever for the one new security exposure re-opens it

§2.3 and §4 agree that removing `--pure` lets the operator's global opencode config and plugins into
the sandbox, that this is "the one real new exposure in this package", and that it must be closed in
the same change. The prescribed close is: *"set `XDG_CONFIG_HOME` to a per-session directory **and add
it to `envAllowlist`** (`adapter-pool.ts:384`)"*.

`envAllowlist` is a **forwarding list from the host process**, not a delivery mechanism:

```
// cli-harness-adapter.ts:314-329
for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
}
for (const [key, value] of Object.entries(resolvedEnvMap)) env[key] = value;
```

Adding `XDG_CONFIG_HOME` to the allowlist forwards the operator's own `XDG_CONFIG_HOME` into the
sandbox — the leak the mitigation exists to stop. The repo already records the correct pattern for
exactly this case, and it is the opposite one: *"`CODEX_HOME` must NOT be in `envAllowlist` (it is
injected here, not forwarded from `process.env`)"* (`cli-harness-adapter.ts:522-525`), with the
injection done per session in the adapter body (`:526-533`).

A builder following §2.3 literally either produces the leak or has to work out that the document is
wrong about the lever. Compounding it, §6's verification lists nothing that asserts isolation — no
lane checks that a global opencode plugin or permission config outside the sandbox has no effect on a
session. A security control with the wrong mechanism and no evidence is not a control.

---

## NON-BLOCKING DEFECTS

- **N1 — `ports.coreApi` does not exist where §2.4 uses it.** §2.4 step 2: *"The closure calls
  `ports.coreApi.review.adjudicateAction(...)` over the existing seam."* `SessionLifecyclePorts`
  (`provisioner.ts:417-478`) has no `coreApi` member and `rg -a "coreApi" provisioner.ts` returns
  nothing. The mechanism is feasible — `run-orchestration-composition.ts:378-384` has
  `coreApiTransport` in hand where it builds `toolProvider` — but a new injected port member is
  required and neither §2.4 nor T2 declares it. "Net new seams: **zero**" (§2.1, F5) is true of the
  HTTP seam and false of the port.
- **N2 — the `enforcementRegistry` precedent is not the shape claimed.** F5 and §2.7 say the
  adjudicator reaches its per-session state "exactly how `enforcementRegistry` already works" and
  that the flag lives "beside the enforcement entry that already lives there". It does not:
  `enforcementRegistry` is a **process-level** object created once at
  `layers/agent-execution/src/boot.ts:162` and injected at `createMcpToolBridge({enforcement})`
  (`mcp/index.ts:29`), keyed by `sessionId`, entirely separate from the bridge's token map. The
  bridge's map stores what `createMcpSession` returns — `{token, sessionId, mcpServer, transport}`
  (`mcp-bridge.ts:163`) — and retains neither `registry` nor `onToolCall`; `McpSessionRegistry.lookup`
  is typed to return `{sessionId}` only (`mcp-route.ts:16-19`). Carrying a per-session `actionGate`
  through `bridge.open` is a reasonable design, but it is a widening of three declarations, not an
  existing pattern.
- **N3 — the clearance-stamp contract is undeclared.** §2.5 has `submit_review`'s handler stamp the
  blocked row. That handler is `tool-handlers` code reaching core-api only through
  `ports.coreApi` (`tool-definitions.ts` passim), so a second `CoreApiPort.review` op is needed.
  T1 declares only `adjudicateAction`.
- **N4 — the delete list is one test short.** `layers/core-api/src/__tests__/AL7-classifier.test.ts`
  imports `classifyReversibility, identityHash` from `@hyperidle/tool-handlers` (`:12`) — both
  symbols §2.10 deletes. It is not among the five test files listed. (Compile-visible, so cheap; but
  a delete list that is short by inspection is this track's recurring failure.)
- **N5 — "retries and tells nobody" is imprecise.** The second no-show writes
  `operationOutcomes {status:"failed", error:"approved op did not execute…"}`
  (`proposed-call-workflow.ts:719-726`), which the review loader nests into the review view
  (`routes/reviews.ts:120-166`). The real defect is that it never reaches the **thread**, and that
  BA2 deletes the table the current surfacing writes to. Stating it as "tells nobody" understates
  what is being removed.
- **N6 — the teardown check's placement is not failure-proof.** Phase 11
  (`provisioner.ts:1568-1578`) is **not** inside a `finally`; only `adapterPool.release` is
  (`:1557-1559`). A throw from `harness.startSession` (`:1500`), from `registerSessionRun`, or from
  the non-crashed `harness.stopSession` (`:1558`) propagates and skips teardown entirely, as does a
  server restart mid-session. §2.7's residual-gap list names only "session-start fires but PreToolUse
  does not"; this one belongs there or the check belongs in a `finally`.
- **N7 — §6 overstates the recorded payloads.** "the four shims' **recorded real payloads** (captured
  from phase 1's live runs)" — F9 records that opencode's `write`/`edit` argument shape was **not**
  captured and is OPEN, with the explicit instruction "Do not write a mapping from memory". Three
  harnesses have real payloads; opencode's file-write payload does not exist yet.
- **N8 — §1's `sessionWorkflow` enumeration is incomplete** (omits `harness-adapter.ts:129`,
  `provisioner.ts:321`, `tool-registry.ts:91`, `tool-types.ts:139`). The conclusion is unaffected — I
  re-enumerated and there is still no production constructor — but the row presents the list as the
  evidence, and a short list is not evidence.
- **N9 — task-free sessions are undecided.** A CLI session with `params.taskId == null` is real
  (`provisioner.ts:1306-1311` names the assistant and `knowledge_action`). Such a session would be
  adjudicated and denied like any other, told to call `submit_review`, and `submit_review` would fail
  with `NOT_FOUND` on an empty `ctx.taskId` — the push-back's instruction is false and the agent has
  no recourse, with nobody told. §2.8 disposes of `ctx.taskId === ""` for the review path but says
  nothing about the gate's behaviour in such a session. The plan's "a session with no task is a
  modelling gap, not a case this bends for" arguably licenses not bending — but it does not license
  leaving it unstated.

---

## FOLLOW-UP / NOTES

- **`action_cleared` will have no subscriber.** `rg -a "proposed_call_granted"` finds the emit at
  `routes/threads.ts:1690`, the type at `events.ts:583-598`, the registry entry at `:707`, and
  tests — **no production subscriber** (the `@lore` at `events.ts:587` names a
  `handleProposedCallGranted` subscription that no longer exists). Renaming it preserves an
  emitted-and-unread event. Worth a line in §2.10 saying so, or attaching BA8's row to it as §2.10
  already suggests.
- **T10's builtin lane cannot go red if the feature breaks.** It asserts the absence of blocking, so
  it stays green whether the gate works or not; it can only go red if someone adds builtin
  interception. That is a legitimate guard against papering over ruling 7 — but §6 lists it among
  the harness lanes that must be green before shipping, and it is not evidence of the feature.
- **The harness lane's step 4 depends on model compliance.** "Assert the agent called `submit_review`
  with `clearsRuleId`" is a live-LLM behavioural assertion, and research §4 records Sonnet refusing
  the push-back twice on two phrasings. The break-table row for it ("delete the standing-policy
  section → step 4 becomes unreliable") is honest, but the lane's own steady-state flakiness should be
  named where it will be read.
- **`hyperidle-trace` was unavailable in both the producing and the reviewing session.** Both sides
  fell back to `rg -a` enumeration. The claims I re-derived held, but the repeated unavailability is
  worth raising separately — CLAUDE.md makes trace the first tool for exactly these questions.
