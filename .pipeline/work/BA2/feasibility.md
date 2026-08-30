# BA2 — Feasibility

What was checked, how, and the verdict. Two kinds of entry:

- **Repo-verified** — I opened the file and enumerated. Reproducible from this checkout.
- **Phase-1 live** — demonstrated against the installed binaries on 2026-08-25/27 and recorded in
  `harness-research/`. Not re-run here; cited, not re-derived.
- **OPEN** — load-bearing and not yet settled. Each names the command that settles it and the phase
  that owns it.

**Method limitation, stated up front.** The `hyperidle-trace` MCP tools were not available in this
session. Every negative claim below ("nothing constructs X", "nothing reads Y") was established by
enumerating `rg -a` matches across the whole tree and reading each hit, and the enumeration is shown.
`rg -a` was used throughout so a file with control characters could not be silently skipped.

---

## F1 — Is the AL7 capture machinery reachable in production? **Repo-verified: NO.**

**Why it is load-bearing.** Phase 4 deletes it. If a production path ran it, the deletion would be a
behaviour change rather than a removal, and the plan would need a migration story for live rows.

**Method.** The whole router is gated on one field, `options.sessionWorkflow`
(`layers/agent-orchestration/tool-handlers/src/tool-registry.ts:86`). Enumerated every occurrence of
`sessionWorkflow` in the tree outside `__tests__`:

```
run-orchestration-composition.ts:332   pass-through
runtime.ts:450                         pass-through
contracts.ts:49, 257                   type declaration
provisioner.ts:304,789,1195,1211,1469  pass-through / type
tool-registry.ts:86,91                 the consumer
tool-types.ts:139                      type
```

No constructor. Then enumerated every `runSession` entry point: `run-orchestration/src/runtime.ts:470`
(the exported one) and `run-orchestration/src/start-runtime.ts:164-171` (the only production
`mode:"durable"` call). `start-runtime.ts` passes `{mode, request, sandboxBasePath, modelTier,
resolvedModel, completion}` — no `sessionWorkflow`.

**Verdict.** The capture path is dead in production. Deleting it is a removal, not a change.
**Corollary:** `docs/process-layer/staged-operation.md:14` — "The only `sessionWorkflow` producer in
production is the session-2 grant path (the task dispatcher, wired in `service-bootstrap.ts`)" — is
false. `rg -a "sessionWorkflow" layers/core-api/src/service-bootstrap.ts layers/core-api/src/services/*.ts`
returns zero hits.

---

> **CORRECTED in revision 4 (see F31).** F2's answer is right about the machinery and **wrong about
> its reach**: its only entry is `POST /:threadId/messages/:messageId/verdict`, which has **zero
> production callers**. The machine is complete and has never run in production. The claim below that
> the route has "a real UI caller" is false and is retracted.

## F2 — Does the reengagement machinery actually run today? **Repo-verified: the machinery yes, its trigger no.**

**Why it is load-bearing.** AC4 ("the agent resumes and finishes") is satisfied by reusing it. If it
were as dead as the capture half, BA2 would have to build resumption from nothing.

**Method.** Read the chain end to end: `routes/threads.ts:1595-1707` is a mounted production route with
a real UI caller (`core-ui/src/pages/review/ReviewPage.tsx:172-195` and the in-thread verdict bar,
`core-ui/src/ds/RichMessageCard.tsx:333`). Its approve branch calls
`transitionProposedCall({to:"granted"}, {intentRecorder, getTaskById, requireRunnableAgent, getBetById,
getTeamById, assembleSessionKnowledge, readServerConfig, resolveOrCreateCallingThread})` — every one of
those deps is wired at `layers/core-api/src/service-bootstrap.ts:409` and neighbours, not optional in
production. `resolveReengagementRequest` (`review/src/proposed-call-workflow.ts:299-370`) does the full
emit-time bake.

**Verdict.** Live and correct. The only thing that never happens today is the *input* — a granted
proposed call — because F1. Re-keying it from a proposed call to a clearance reuses the whole machine.

---

## F3 — Does `resolveOrCreateCallingThread` already implement D7? **Repo-verified: YES.**

`layers/core-api/src/services/calling-thread-bindings.ts:44-80`: resolves the `(hostKind:"task",
hostId: taskId)` thread, creates it if absent, idempotent on a second call, and seeds the sole human
plus the agent as participants (`:57-60`) precisely so a thread the emit path creates first still shows
up in the founder's participant-scoped inbox (`routes/threads.ts:895`). `"task"` is a declared host
kind (`framework/domain-model/src/thread.ts:23-33`).

**Verdict.** D7 needs no new mechanism. `submit_review` adopts the same resolution.

---

## F4 — Can the permission rules live in an existing store? **Repo-verified: NO.**

**Method.** Read `tools/governance/table-owners.json` (37 tables at the time of this read — **now 40**
in the tree, see F51, all owned, "a table absent from this
file is a build error") and every candidate schema.

- `configurationOverrides` (`framework/db/src/schema.ts:1184-1209`) — unique on `(kind, key)`, no team
  column, `check` constraint enumerating five global kinds. A per-team list cannot key into it without
  changing the uniqueness contract of the surface BA9 owns (founder ruling 2).
- `serverConfig`, `plugins`, `pluginConfigurationDefaults` — global, same problem.
- `layers/core-api/policy` owns **no** tables (`table-owners.json`; the package is 6 files of pure
  logic). Putting a table there would convert a non-SQL orchestration service into a SQL-owning one —
  a structural change, not an extension.

**Verdict.** A new pair of tables is required. `review` is the owner (architecture §2.1) — it already
owns the three tables being retired, so the registry churns by −3/+2 under one unchanged owner.

---

## F5 — Can the hook reach a database without giving `agent-execution` one? **Repo-verified: YES — but the precedent is not the one first claimed.**

**Why it is load-bearing.** `tools/governance/architecture.json` declares `endpoints.mcpRouter.host =
"agent-execution"` and `endpoints.httpApiLayers` excludes it. If the adjudicator needed a `core-api`
import there, the design would be illegal.

**Method.** Read the existing route end to end. `POST /api/mcp/:token/return-status`
(`mcp-route.ts:81-152`) makes a real adjudication with **zero** DB access, consulting an
`enforcementRegistry` object and looking the session up by token.

**Verdict: the mechanism is legal and the shape is right — a per-session gate closure passed at
`bridge.open`, built in `agent-orchestration` where `db` and the seam are in scope. `agent-execution`
gains no DB handle, no `core-api` import, and no knowledge of what a rule is.**

**Correction (critique N2, upheld).** The first revision described this as "exactly how
`enforcementRegistry` already works" and said the gate flag would live "beside the enforcement entry
that already lives there". Both are false:

- `enforcementRegistry` is a **process-level** object created once at `layers/agent-execution/src/boot.ts:162`
  and injected at `createMcpToolBridge({enforcement})` (`mcp/index.ts:29`), keyed by `sessionId` —
  entirely separate from the bridge's token map.
- The token map stores what `createMcpSession` returns — `{token, sessionId, mcpServer, transport}`
  (`mcp-bridge.ts:163`) — and retains neither `registry` nor `onToolCall`.
- `McpSessionRegistry.lookup` is typed to return `{sessionId}` only (`mcp-route.ts:16-19`).

So carrying a per-session `actionGate` is a **widening of three declarations**, not the adoption of an
existing pattern. Architecture §2.4 now says so, and T2 budgets for it.

**Second correction (critique N1, upheld).** `SessionLifecyclePorts` (`provisioner.ts:417-478`) has no
`coreApi` member — its five members are `sessionRequests`, `observability`, `harnessRuntime`,
`toolProvider`, `contextAssembly` — and `rg -a "coreApi" provisioner.ts` returns nothing. The port
member is now declared: `toolProvider.buildActionGate`, built in `buildToolProvider`
(`run-orchestration-composition.ts:318-322`) from the `coreApiTransport` already passed to that
function, which is exactly where `buildProposedCallWorkflowPort` sits today and is deleted. **One port
member added, one deleted.** "Net new seams: zero" was true of the HTTP seam and false of the port;
the architecture no longer claims it.

**Rejected alternative, recorded.** Wiring the adjudicator at boot does not work: `bootAgentExecution`
runs *before* `bootCoreApi` in both composition roots (`applications/desktop/src/create-server.ts:183`
vs `:221`; `applications/remote-server/src/create-server.ts:260` vs `:314`).

## F6 — Can each harness block a session action and return text the model reads? **Phase-1 live: YES, all four.**

Demonstrated against `claude 2.1.220`, `codex-cli 0.146.1`, `opencode 1.18.16`,
`cursor-agent 2026.08.25-3e8eec8` on 2026-08-27. Full evidence in `harness-research/`. Not re-run.

The five findings this architecture is built on, each taken as settled:

1. Native approval is unusable headlessly on all four; hooks are the only path (`FINDINGS.md` §1).
2. `matcher` on codex is tool-name-only, so the rule engine must be ours and run in the hook body (§2).
3. A codex block emits no JSONL at all, so the hook must report home (§3).
4. "Blocked" and "the agent understood" are separate, and each harness fails differently — cursor
   discards `agent_message`, claude's model may refuse the push-back as an injection, opencode's
   message only arrives via the plugin path (§4).
5. Fail-open is silent on codex, cursor and opencode (§5).

---

## F7 — Is `--pure` removal safe against the repo's own spawn? **OPEN. Phase 3 (T10 — opencode) owns it.**

**Status.** Phase 1 proved `--pure` disables the plugin (t6) and that every non-`--pure` run completed
headlessly and exited 0 — but those runs drove the CLI directly, **not** through `CliHarnessAdapter`
with the bridge attached (`opencode.md`, "Still unknown": *NOT TESTED against the repo's spawn*).

**Settled by.** `npm run test:integration:harness -- layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts`
with `--pure` removed from `adapter-pool.ts:355-368` and `cli-harness-adapter.ts:825` and
`XDG_CONFIG_HOME` set — the existing opencode lane must stay green. This is the red-phase check for **T10** and
must be run before T10's own new assertions.

**If it fails**, the fallback is a per-session `XDG_CONFIG_HOME` containing a config that explicitly
lists only our plugin — but that is a fallback, not the plan, and it must be proven rather than
assumed.

---

## F8 — Does opencode's `tool.execute.before` fire for MCP tool calls? **OPEN. Phase 3 (T10 — opencode) owns it.**

**Why it matters.** Intercepting HyperIdle's own MCP tools is out of scope (`plan.md`), and on
cursor-agent the equivalent would gate `submit_review` itself (`cursor-agent.md` F6). The shim skips
`mcp__` / `MCP:` / the `hyperidle` server unconditionally, so **the architecture is correct either
way** — but if the hook does fire for MCP calls, the skip is load-bearing rather than defensive and
needs a test.

**Settled by.** T10's `[harness:opencode]` lane asserting that a session in which the agent calls
`submit_review` produces no adjudication for that call.

---

## F9 — What are opencode's argument names for a file write? **OPEN. Phase 3 (T10 — opencode) owns it.**

Phase 1 proved the hook's shapes are `input = {tool, sessionID, callID}` and `output = {args}` with
`{command: "..."}` for bash (`opencode.md` t13). It did **not** capture the `write`/`edit` shape.

**Settled by.** T10's shim development: log `output.args` for a `write` in the harness lane and read it.
Until then, `file_write` on opencode is unimplemented, not guessed. Do not write a mapping from memory.

---

## F10 — Does a session-start hook fire headlessly on each harness? **PARTLY OPEN. Phases 2–3.**

The proof-of-liveness mechanism (architecture §2.7) depends on it.

| harness | status |
|---|---|
| claude-code | `SessionStart` is in the installed binary's own embedded hooks reference (`claude-code.md` §1). **Firing in `-p` headless was not demonstrated.** T3 proves it. |
| codex | `SessionStart` is one of the eleven schemas extracted from the 0.146.1 binary (`codex.md` Fact 1). Not fired live. **T8** proves it. |
| cursor-agent | `sessionStart` is in the shipped bundle's hook-event enum (`cursor-agent.md` F2). Not fired live. **T9** proves it. |
| opencode | the plugin module's top level **was** proven to evaluate even in the broken-shape case (`opencode.md` t7), and the `event` hook fired for `session.idle` and others (t10). Strongest of the four. |

**If a session-start hook turns out not to fire on some harness**, the fallback is the
per-adjudication ping alone for that harness — weaker (it proves nothing for a session in which the
agent took no gated action) and it must be recorded as such rather than papered over.

---

## F11 — Is `node` available inside the sandbox for the shims? **Repo-verified: yes, with a caveat.**

Every CLI adapter's `envAllowlist` includes `PATH` (`adapter-pool.ts:322,384,471,501`), and the host
runs HyperIdle on Node 24. The provisioned opencode plugin is already a TypeScript module the harness's
own runtime executes (`provision-return-hook.ts:392-436`), so opencode needs no separate interpreter.

**Caveat, recorded not closed.** A remote worker's host is not this machine. If a worker without Node
on `PATH` ever runs a CLI harness, the three script shims fail — and they fail *open*, which §2.7's
liveness ping makes visible rather than silent. That is the correct degradation and needs no extra
mechanism now.

---

## F12 — Does the `action_operation` review canvas need reworking? **Repo-verified: no.**

`layers/core-ui/src/pages/review/ReviewActionOperation.tsx:1-17` frames itself as a "staged, PRE-COMMIT
receipt … the reviewer's verdict is what fires the side-effect" — the capture concept. But its rendered
content is its own fixture (`:48-74`); the capture-specific part is only the `proposedCall` /
`ProposedCallOutcomeView` nesting the loader attaches (`routes/reviews.ts:120-166`;
`core-ui/src/pages/review/review-composition.ts`).

**Verdict.** Removing that nesting is a deletion of dead machinery, not a rework of a canvas — which
`plan.md` puts out of scope. The canvas, its fixture, its story and its layout stay.

---

## F13 — Does anything read `submit_review`'s returned `betId`? **Repo-verified: no.**

`rg -a "submit_review"` across the tree returns 20 hits: `docs/`, this work package, five test files,
and `framework/harness-protocol/src/harness/return-actions.ts` (which names it as a member of the
return-action trio, `:33`, not as a caller). No production consumer of the return value exists.

**Verdict.** Dropping `betId` from the result is free.

---

## F14 — How large is the `proposed_call` rename? **Repo-verified: 20 production files.**

`rg -a -c "proposed_call|proposedCall"` excluding `node_modules`, `dist`, `plans/`, `.pipeline/`,
`docs/`, migration snapshots and tests. The distribution is one file with 44 occurrences
(`review/src/proposed-call-workflow.ts`, which is being rewritten anyway), one with 14
(`framework/db/src/schema.ts`, whose relevant lines are being deleted), and the remaining eighteen with
one to ten each — type unions, event names, check constraints, and the UI's composition types.

**Verdict.** Mechanical and bounded. It is BA2's rubble under the BA track's ownership rule
(`.pipeline/BA.md`: *"finishing a feature and leaving its rubble behind fails the package"*), and it is
isolated in phase 4 so it can be scheduled independently of the feature work.

---

## F15 — Does the founder's "hold the agent inline" option need re-evaluating? **No. Closed by ruling.**

`founder-rulings.md` §5 and `FINDINGS.md` §B: technically real (a claude hook held open 95 s, proven),
measured, and rejected on the flow — a held agent is frozen inside the tool call and cannot compose the
review, which is the work the design depends on. Not resurrected here. Likewise `permissionDecision:
"defer"` (present in the 2.1.220 binary by symbol, never run, and documented to be ignored when the
model batches tool calls — under `bypassPermissions` a batched call would then simply execute).

Consequence: **cursor-agent's open question "can a deny be lifted mid-session?"
(`cursor-agent.md`, "Still unknown") is not load-bearing for BA2.** Approval starts a new session
(D10), so nothing needs to change inside a running one. Recorded so phase 3 does not spend a probe on
it.

---

# Revision 2 — findings raised by the first critique

Each was reproduced at the code before the architecture was changed. None was accepted on the
critique's word.

> **Superseded by revision 3 (F25–F29).** F16 and F17 record the *orchestration-side* liveness proof,
> which revision 3 deleted. Their **findings** stand — `run-orchestration` still cannot read; the
> cry-wolf populations are still real — but the fixes they describe were replaced, and F17's claimed
> compiler forcing function turned out not to exist (F27). Read F25–F29 for the design that stands.

## F16 — Can `run-orchestration` read the rule list or write a thread? **Repo-verified: NO. (B1)**

**Method.** Two independent checks.

- **Manifest.** `layers/agent-orchestration/run-orchestration/package.json` `dependencies` are exactly
  `@hyperidle/db`, `diagnostics`, `domain-model`, `event-bus`, `harness-capability`,
  `harness-protocol`, plus `drizzle-orm`, `hono`, `zod`. Neither `@hyperidle/review` (to ask whether a
  team has a rule) nor `@hyperidle/conversation` (to post a message) is reachable.
- **Injected surface.** `SessionLifecyclePorts` (`provisioner.ts:417-478`) has five members —
  `sessionRequests`, `observability`, `harnessRuntime`, `toolProvider`, `contextAssembly`. No
  conversation write, no `coreApi`.

**Verdict: the first revision's §2.7 was not implementable as written**, and it contradicted its own
§2.6, which refused to gate the seed prompt on precisely this ground.

**What replaced it, and why it is not the same defect.** `run-orchestration` now reads **one boolean
off an in-process runtime object it already queries in the same function** — `computeForceReturnCount()`
(`provisioner.ts:1578-1583`) already calls `enforcementRegistry.get(sessionId)` at teardown — and puts
two additive fields on the session context that `transitionRun` turns into the `session_ended` event it
**already emits**, on both the completed path (`transition-run.ts:199-226`) and the crashed path
(`:272-290`). Every domain read and the thread write move to a new core-api **layer** subscriber, a
sibling of `agent-run-admission-reactions.ts`, which already imports `@hyperidle/conversation`,
`@hyperidle/review`, `@hyperidle/work`, `@hyperidle/users` and `@hyperidle/settings` (`:34-45`) because
core-api layer code may.

**The sanctioned precedent, verified in place.** `SessionEndedEvent.routineRunOutcome`
(`framework/event-bus/src/events.ts:166-178`) carries a fact from `run-orchestration` and its own
comment says it is "Consumed by the core-api subscriber `routine-run-session-end-reactions.ts`, the
literal replacement for `run-orchestration`'s deleted direct `routineRuns` write". That is the identical
shape.

**Why carrying is necessary, not convenient.** The subscriber cannot derive which harness ran:
`session_ended` does not carry it, and `agentRunConfig` is owned by `run-orchestration`
(`tools/governance/table-owners.json`), so core-api may not read it.

**Residual, flagged not assumed.** Whether an additive field on an already-emitted event clears the
blind-executor ruling is a founder question, not mine to settle. Architecture §2.7 states the fallback
if it does not: `review` records the session-start ping itself, since that ping already reaches it over
the seam, at the cost of one column and a write per session start.

## F17 — Would the liveness proof alarm on sessions nobody meant to gate? **Repo-verified: YES, as first written. (B2)**

- **builtin.** The MCP bridge is opened only when `selectedAdapter.meta.type !== "builtin"`
  (`provisioner.ts:1331-1340`). A builtin session has no bridge, therefore no gate entry, therefore can
  never ping. With the first revision's single silence condition ("empty rule list"), **every** builtin
  session for a team with a rule would have been reported unproven — for a harness founder ruling 7 puts
  out of scope and whose consequence the ruling explicitly *accepts*.
- **The phase gap.** The teardown check landed in phase 2 and three of four shims in phase 3, so every
  codex, cursor-agent and opencode session in between would alarm correctly by the letter and uselessly
  in fact.

**Fix, and why it cannot go stale.** The decisive silence condition is a declared harness capability —
`actionGate`, a new **non-optional** field on `HarnessCapabilities`
(`framework/harness-protocol/src/harness/harness-adapter.ts:234`), immediately beside
`returnEnforcement`, which the provisioner already reads (`provisioner.ts:150,1425`) and which each
adapter already declares (`adapter-pool.ts:327,388,474,503`). Non-optional deliberately, copying that
field's own `@lore` (`harness-adapter.ts:231-233`): it is "the 'uniform across harnesses' forcing
function — `npm run check` fails any adapter that doesn't declare this". `"none"` ⇒ silent; builtin
declares `"none"` permanently; each phase-3 task flips its own value **in the same commit as its shim**,
so the alarm becomes live for a harness at the moment it becomes true.

Note the first revision of this fix cited `framework/harness-capability`'s `HarnessCapabilityDescriptor`
— that is the **UI-facing** descriptor listed in settings, not the object `harness.getCapabilities()`
returns and the provisioner dispatches on. The correct home is `HarnessCapabilities`. A hardcoded
harness list would have gone stale between phases; a declaration cannot.

## F18 — Is a review without an artifact approvable? **Repo-verified: NO. (B3)**

**Method.** Read both halves.

- `submit_review` takes the `type:"review"` branch **only** `if (input.artifactRef)`
  (`tool-definitions.ts:642-652`); otherwise it writes `type:"plain"` with the reasoning flattened into
  text (`:653-657`). `artifactRef` is optional in the schema (`:593`).
- The verdict toolbar renders under `if (isReview)` (`RichMessageCard.tsx:377-396`), and
  `const isReview = review !== null && review.redacted === false` (`:318`) — a `plain` message is not a
  review.

**Consequence as first written:** an agent that called `submit_review` with `clearsRuleId` and no
artifact produced a plain message, a `blocked` row stamped to it, no approve control for the human, no
resumption, and nobody told. AC3, AC4 and AC7 all unreachable on that path.

**Fix.** `clearsRuleId` present ⇒ `artifactRef` required, in the input schema. The agent is alive when
it hits this and has `create_artifact` (`tool-definitions.ts:1404`). This is also what D11 already says
a review is.

## F19 — What happens when an approved review has no clearance? **Repo-verified: nothing, silently. (B4)**

`routes/threads.ts:1631-1636`:

```
const pcView = await findProposedCall(db, { by: { reviewMessageId: messageId } });
if (!pcView) {
    // No PC anchored to this review message — verdict accepted but nothing to do
    return c.json({ ok: true }, 200);
}
```

**This is the founder's day-one flow.** The interview and the plan both say the list starts empty and a
fresh system means the agent always self-elects. A self-elected review was never blocked, so nothing is
attached; under the inherited branch the human approves and the agent is never brought back.

**Fix, and its scope check.** Approval now resumes the agent unconditionally; the clearance, when
present, rides along. This is not a widening: AC4 says "the agent resumes its work and finishes it" and
D10 says approval resumes rather than fires a command, both without conditioning on a clearance. The
same branch covers a review naming a wrong rule id and one whose rule a human deleted between block and
approval (`onDelete: cascade` takes the clearance with it). If resumption is impossible the human is
told in that thread — never `{ok:true}` and silence.

## F20 — Is the `session_ended` liveness net live, and does BA2 break it? **Repo-verified: live, and yes as first written. (B5)**

**Method.** Traced the whole chain.

`service-bootstrap.ts:379` wires `registerReviewSubscriptions`
(`review/src/session-review-creator.ts:34-66`), which subscribes `session_ended` →
`handleUnconsumedGrantOnSessionEnd` (`proposed-call-workflow.ts:733-765`), which selects
`tailoredGrants` where `consumed = false` for `(taskScope, agentScope)` and calls `applyLivenessRetry`
(`:681-729`): `retryCount === 0` → one reengagement intent; otherwise → the call goes `held` and a
`failed` `operationOutcomes` row is written (`:719-726`).

**Both tables are on the delete list**, and neither `handleUnconsumedGrantOnSessionEnd` nor
`session-review-creator.ts` nor the subscription appeared in either list in the first revision.

**Fix.** It survives, re-keyed off `actionClearances`, and moves into the same core-api subscriber as
F16's check. Trigger: the session ended with a clearance still `cleared` and never `spent`. First
no-show retries once; second marks the clearance `abandoned` and posts into the thread the human
approved in.

**Surfacing improves rather than degrades.** Today's second no-show writes a row the review loader
nests into the review page (`routes/reviews.ts:120-166`) — it reaches a page, never a thread. AC6 asks
for the thread. (This also corrects the first revision's imprecise "tells nobody", critique N5.)

**Pre-existing bug found on the way, not chased.** `session-review-creator.ts:58` passes
`resolveOrCreateCallingThread` into `handleUnconsumedGrantOnSessionEnd`, and that function's own
`applyLivenessRetry` call (`:758-765`) omits it from the bake — so a liveness-net re-provision today
bakes no calling thread. The rewrite forwards it; it disappears with the rewrite rather than being
fixed separately.

## F21 — Does `envAllowlist` isolate `XDG_CONFIG_HOME`? **Repo-verified: NO — it does the opposite. (B6)**

**Method.** Read the env builder and the repo's own rule for the identical case.

```
// cli-harness-adapter.ts:314-329 — buildSandboxedEnv
for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
}
for (const [key, value] of Object.entries(resolvedEnvMap)) env[key] = value;
```

`envAllowlist` **forwards `process.env`**. Adding `XDG_CONFIG_HOME` to it forwards the operator's own
value into the sandbox — exactly the leak the mitigation existed to stop. `resolvedEnvMap` is applied
after the allowlist and therefore wins, and is the injection lever.

The repo states the rule about itself: *"`CODEX_HOME` must NOT be in `envAllowlist` (it is injected
here, not forwarded from `process.env`)"* (`cli-harness-adapter.ts:522-525`), with the per-session
injection in the adapter body at `:526-533`.

**Fix.** Inject `XDG_CONFIG_HOME` into `resolvedEnvMap` per session, pointing at a directory inside the
sandbox — the `CODEX_HOME` shape. Never allowlist it.

**Do not copy the neighbouring case.** `XDG_DATA_HOME` **is** in opencode's `envAllowlist`
(`adapter-pool.ts:384`) and is correct there: callers set it deliberately for SQLite isolation. The two
are different mechanisms.

**Evidence, which was missing entirely.** A harness-lane assertion is now named: with the sandbox's
provisioned environment, `opencode debug config` must resolve **no** `plugin` path outside the sandbox
and **no** MCP server other than `hyperidle`, with a decoy plugin and permission block planted in a
scratch global config location. `opencode debug config` is the same command phase 1 used to prove the
leak exists (`opencode.md` §5), so the assertion is the direct inverse of a demonstrated finding. The
red case is spelled out in architecture §6: allowlist it instead of injecting it and the decoy appears.

## F22 — Does adding a field to `ReviewPayload` survive read-back? **Repo-verified: only if the schema is updated too.**

`reviewPayloadSchema` (`routes/threads-schema.ts:155-159`) is a plain `z.object`, which strips unknown
keys. The repo has already been bitten by this: the `@lore` at `:209-211` records that using
`plainPayloadSchema` for read-back "would strip the `toolCalls` field from messages written by the
assistant agent".

**Verdict.** `taskId` and `clearsRule` must be added to `reviewPayloadSchema` in the same change that
adds them to `ReviewPayload` (`framework/domain-model/src/thread.ts:199-203`), or they vanish silently
between write and read — and F19's resumption, which reads `taskId` off the payload, would fail on
every approval. A service test asserting the round-trip is named in architecture §6.

## F23 — Which AL7 tests actually die? **Repo-verified: six, not five. (N4)**

`layers/core-api/src/__tests__/AL7-classifier.test.ts:12` imports `classifyReversibility, identityHash`
from `@hyperidle/tool-handlers` — both deleted. It was missing from the first revision's list.

`AL7-no-kernel-executor.test.ts` **survives**: it asserts the *absence* of an execute/dispatch surface
and imports no deleted symbol. That assertion remains true under BA2 and is worth keeping — the founder
killed capture, and this test is what stops a kernel executor coming back.

## F24 — Is a task-free session gated? **Decided: no. (N9)**

A CLI session with `params.taskId == null` is real — the assistant and `knowledge_action`
(`provisioner.ts:1306-1311`). Gating one would deny an action, tell the agent to call `submit_review`,
and `submit_review` would return `NOT_FOUND` on an empty `ctx.taskId` — a false instruction with no
recourse and nobody told.

**Decision.** When `params.taskId == null` no gate is built and the harness reports no gate channel, so
the liveness check is silent too. The plan's "a session with no task is a modelling gap, not a case
this bends for" licenses not bending; it does not license leaving it unstated, which is what the first
revision did.

---

# Revision 3 — findings raised by the second critique

Each reproduced at the code before the architecture changed. Four of the five concern the liveness
proof, which is why revision 3 replaces its **mechanism** rather than its placement.

## F25 — Can anything be read off a bridge entry at teardown? **Repo-verified: NO. (r2 BLK-1)**

Three independent facts:

1. **The bridge is closed first.** `provisioner.ts:1577` calls `closeMcpBridge`, under the comment
   "X2: Unregister the MCP bridge BEFORE calling endSession/crashSession". Every `transitionRun` call
   is after it (`:1606`, `:1658`, `:1685`). `close` → `sessions.unregister(token)` →
   `active.delete(token)` (`mcp/index.ts:44-47`), so the entry is gone before the emit.
2. **There is no accessor to add it to.** `openMcpBridge` is declared to return
   `Promise<{ readonly token: string; readonly url: string }>` (`provisioner.ts:253-263`), and the
   three widenings revision 2 declared (`createMcpSession`'s return, `McpSessionRegistry.lookup`,
   `bridge.open`'s parameter) add a way in, not a way back out.
3. **The cited precedent was a different object.** `computeForceReturnCount` reads
   `ports.harnessRuntime.enforcementRegistry.get(sessionId)` — and F5's own correction says
   `enforcementRegistry` is a separate process-level object (`boot.ts:162`) from the bridge token map.
   Revision 2 contradicted its own correction.

**Verdict.** The read was not implementable. Revision 3 removes the read entirely — nothing is held on
the bridge for teardown, because there is no teardown step.

## F26 — Would the silence conditions have covered every `session_ended`? **Repo-verified: NO. (r2 BLK-2)**

Two producers beyond the two `transitionRun` sites revision 2 named, both setting neither proposed
field:

- `layers/agent-orchestration/run-orchestration/src/runtime-reapers.ts:196-208` —
  `reapStaleRoutineSessions` emits `session_ended` directly for each stale routine session with
  `outcome:"crashed"`, `routineRunOutcome:"timeout"` and no session context. **Live production path.**
- `layers/agent-orchestration/run-orchestration/src/session-store.ts:206-217` — `endSessionByCas` emits
  it too. Exported at `run-orchestration/src/index.ts`; no production caller found, so latent.

Both would have yielded `gateChannel === undefined`, which is neither `"none"` nor a match for any
silence condition, so a team with one rule would have been told its gate could not be confirmed on
every reaped session — including builtin ones. Revision 2's own §2.4/§2.7 also disagreed with each
other on the sentinel (`"none"` vs `null`) for task-free sessions.

**Verdict.** Confirmed. Revision 3 emits nothing on session end for this purpose, so the whole class is
gone.

## F27 — Does the `actionGate` forcing function exist? **Repo-verified: NO. This was my claim and it was false. (r2 BLK-3)**

Revision 2 asserted that a non-optional `actionGate` on `HarnessCapabilities`, declared per adapter,
would make `npm run check` fail a forgotten declaration. At the code:

- `returnEnforcementChannel` — the field whose pattern I copied — is **optional**:
  `readonly returnEnforcementChannel?: ReturnEnforcementChannel;` (`cli-harness-adapter.ts:121`).
- **All four CLI harnesses share one `getCapabilities`** (`cli-harness-adapter.ts:947`), which fills the
  non-optional capability from that optional config with a fallback:
  `returnEnforcement: this.config.returnEnforcementChannel ?? deriveCliChannel(this.config.binary)`
  (`:959-960`). The compiler forces **one** value for all four, not one per harness.
- The construction sites are three, not one: `builtin-harness-adapter.ts:347`,
  `cli-harness-adapter.ts:957`, and **`remote-harness-adapter.ts:207-223`**, a real adapter registered
  through `createWorkerAdapter` at `layers/agent-execution/src/boot.ts:198-199` and absent from my
  task's "all five adapters".

So a phase-3 task could have shipped its shim, forgotten its declaration, compiled clean, and silently
disabled the only detection of a dead gate for that harness — reintroducing the exact silent fail-open
the mechanism existed to catch.

**Verdict.** Confirmed and material. Revision 3 removes every per-harness declaration: the only thing
that says "this harness is gated" is a heartbeat from a live shim. There is nothing to forget and
nothing that can go stale.

## F28 — Can the day-one approval resume the agent? **Repo-verified: NOT as specified. (r2 BLK-4)**

Revision 2 asserted resumption on every approval and that "nothing new is built". Three facts make that
impossible for an approval with no clearance:

- `resolveReengagementRequest(db, proposedCallId, deps)` (`proposed-call-workflow.ts:299-370`) takes an
  id, loads the call **and its grant**, throws `ReengagementSourceUnavailableError` when either is
  missing, and returns `sourceId: view.call.id` with
  `sourceCorrelation: { taskId, proposedCallId, grantedAgentId }`.
- `agentSessionRequests.sourceId` is `text("source_id").notNull()` (`framework/db/src/schema.ts:292`),
  and the request is keyed for idempotency on `(sourceKind, sourceId, idempotencyKey)`.
- `proposedCallSessionRequestInputSchema` requires
  `sourceCorrelation.proposedCallId: z.string().min(1)` (`framework/domain-model/src/session-request.ts:95-104`)
  — non-optional.

The founder's day-one flow has no clearance, therefore no id, therefore no `sourceId` and no
correlation key. A builder would have had to invent the contract.

**Fix, and why it is the smallest one.** Key the resumption on the **review message id**, which exists
on every verdict by construction: `sourceKind: "review_approved"`, `sourceId` = the message id,
`idempotencyKey: verdict:<messageId>`, `sourceCorrelation: { taskId, reviewMessageId, agentId }`. All
three correlation members always exist — `taskId` from the review payload, `agentId` from the sender.
The resolver's first lookup changes from a proposed call to a review message; the clearance becomes an
optional extra used to name the cleared rule in the prompt.

**"Nothing new is built" is retracted.** Reused: the entire emit-time bake (bet, team, ranked
knowledge, `harnessDisabled`, `requireRunnableAgent`, calling thread), the recorder, the queue, the
drain, the liveness retry. New: the resolver's key and first lookup, the `review_approved` union
member, and the correlation shape. A re-key of an existing machine — but not nothing.

## F29 — Can a per-session dead-gate alarm be built on the review side at all? **Examined honestly: NO. (r2 BLK-5, and the reason for the new mechanism)**

The coordinator asked for the review-side fallback as the primary design, and to say plainly if it
cannot detect a dead gate.

**What `review` can observe:** heartbeats and adjudications (carrying `sessionId` and `harness`),
`session_ended` (via the core-api subscriber it already has, carrying `sessionId`/`agentId`/`taskId`),
and its own tables.

**Every primary failure mode has the same signature at `review`: zero heartbeats for that session.**
claude with the `PreToolUse` entry removed, codex without the trust flag, opencode under `--pure` — all
produce silence, verified in phase 1.

**The blocker.** To turn silence into an alarm, something must know that a heartbeat was *expected* —
i.e. which harness ran and whether a shim was provisioned. `session_ended` does not carry the harness;
`agentRunConfig` is owned by `run-orchestration` (`tools/governance/table-owners.json`), so core-api may
not read it. Without that fact, "never heartbeated" and "never gated" are the same observation, which is
F26's cry-wolf. Candidate workarounds were examined and each fails: deriving the harness from a
*previous* session of the same team proves nothing about this one; contradiction against a concurrently
healthy session still needs this session's harness; and an agent's `clearsRuleId` that matches no block
is a real but narrow signal that depends on the agent asking.

**Verdict, stated plainly as instructed.** A per-session alarm is not constructible review-side. It is
therefore **dropped, not relocated** — no third variant of the orchestration-side one.

**What is constructible, and what revision 3 builds:** the heartbeat is recorded per `(teamId, harness)`
and the permission list displays it. That satisfies the constraint's own words — "'no block was
reported' may never be read as 'nothing needed blocking'" — because the screen where a human forms the
belief now carries the evidence for it. The trade (a pull, not a push) is stated in §2.7 rather than
hidden, and the founder question that would unlock an active alarm is kept open in §9.

**Evidence the mechanism fires, which revision 2 lacked entirely (r2 BLK-5).** Every named check on the
old §2.7 asserted silence, so a subscriber that did nothing passed all of them. Revision 3's §6 asserts
the positive on both sides, per harness: a live gate advances the heartbeat; a **really broken** gate —
broken by the same edit the red table names — lets the gated action through **and** leaves the heartbeat
un-advanced, so the list still reports that harness as never-checked. The heartbeat is written only by
the shim's own seam call, so writing it from provisioning or teardown is the one way to make this lie,
and the CI half asserts directly against that.

## F30 — Do all five verdict buttons work? **Repo-verified: NO, three of five. (r2 N-2)**

`VERDICT_DECISIONS` has five members (`framework/domain-model/src/thread.ts:38-44`) and the in-thread
toolbar renders all five (`RichMessageCard.tsx:81-87`), but `verdictInputSchema` accepts
`["approve","request-changes","reject"]` (`routes/threads.ts:1591-1594`). "Approve with comments" and
"Edit" 400 today.

Pre-existing, but BA2 makes the verdict path load-bearing: a human clicking a visible Approve button on
a BA2 review would clear nothing, resume nobody, and see no error handling designed for it — the silent
failure `plan.md` says may not be reproduced anywhere new. §2.5.1 widens the route enum to all five and
maps them, two lines plus a mapping, and flags it as a judgement call the founder can strike.

---

# Revision 4 — findings raised by the third critique

Each reproduced at the code. This round also drew on `superseded/feasibility.md`, which the coordinator
released as a **fact source** (its concept stays dead): it is a `path:line` audit of the current tree
and it had r3's BLK-1 right as its own findings B1/B2, plus facts no critique reached.

## F31 — Does the verdict route the approval half hangs on have a production caller? **Repo-verified: NO. (r3 BLK-1)**

**Method.** Enumerated `/verdict` across the tree excluding `node_modules`, `dist`, `.pipeline/` and
`plans/`. Every hit is a test (`agent-run-admission-failed-reengagement-migration.integration.test.ts:180`,
`threads.reengagement-baked-emit.integration.test.ts:151,209,246`,
`AL7-proposed-call-capture.integration.test.ts:430`), a doc, or an eslint rule fixture. **No production
caller.**

The browser's only verdict call is `postVerdictHostMessage`
(`layers/core-ui/src/services/host-threads.ts:132-150`), which POSTs
`{type:"verdict", payload:{decision, resolvesMessageId}}` to `POST /api/threads/:id/messages`. Its own
`@lore` at `:125-130` states it: *"The client only calls the canonical `POST /api/threads/:id/messages`
with `type:\"verdict\"`."* Both UI entries reach it — `RichMessageCard.tsx:330-334` →
`ThreadShell.tsx:349-360` → `onAppendMessage`, and `ReviewPage.tsx:173-194` → `postVerdictHostMessage`.

And the live branch throws the decision away (`layers/core-api/src/routes/threads.ts:1533-1537`):

```
const decision = input.payload.decision;
// AL7 trust-first: approve verdict handled by proposed-call workflow (Task 8).
void decision; // will be used by Task 8 implementation
```

**Verdict.** Revisions 1–3 specified the clearance, the resumption and ACs 4/6/7 against a route no
human path reaches, and §6 step 5 would have posted to it — the harness lane going green on a chain no
human can traverse. **Fix:** everything moves to the live messages route, replacing `void decision`.
The `/verdict` route is AL7's and joins the phase-4 delete list.

**Authorization is a decision now, not an accident.** The live branch already requires
`senderAgent?.role === "founder"` and rejects a self-verdict (`threads.ts:1366-1373`) and a
`resolvesMessageId` outside the posted-to thread (`:1362-1365`). BA2 adopts it. It is strictly stronger
than the dead route's `authorizeWrite`, which — per `superseded/feasibility.md` §5, re-verified at
`layers/core-api/src/auth/access-boundary.ts:32-40,61-79` — does **not** enforce participation for a
`bet` or `task` host: both are host-scope and `canWrite` returns true for any authenticated principal.

## F32 — Is there any surface on which a human can approve a task-hosted review? **Repo-verified: NO. Worse than r3 stated. (r3 BLK-1b)**

Found by following `superseded/feasibility.md` E1 and §7.1/§7.6, then re-verified independently.

1. **No in-thread verdict control exists.** `RichMessageCard`'s verdict toolbar
   (`RichMessageCard.tsx:377-396`) is mounted only by `ThreadShell`. Enumerating `ThreadShell` mounts
   outside tests and stories: exactly one — `layers/core-ui/src/shell/AssistantOverlay.tsx:480`, the
   assistant popover. The conversation removed it on purpose (`Conversations.tsx:9-21`:
   *"`ThreadShell`/`RichMessageCard`/inline-verdict are GONE from the conversation… The decision UI
   lives on the review page"*). `HostThreadSection.tsx:255-266` renders `CommentRow`, which returns
   null for `type:"review"`.
2. **The review page is reachable only from a bet-hosted thread.** `Conversations.tsx:480` —
   `const reviewBetId = data.thread.hostKind === "bet" ? data.thread.hostId : null;`, with its own
   comment at `:475-479` conceding that for a task host "the review open action no-ops (no dead URL)".
   `open-handler.ts:107-118` — `if (betId === null) return;`. **BA2 puts every review on a task
   thread, so this hop no-ops for every review BA2 creates.**
3. **Its approve button cannot fire even on a bet.** `ReviewPage.tsx:131-133` —
   `hostId = subject?.taskId ?? subject?.betId ?? ""`, `hostKind = subject?.taskId ? "task" : "bet"`.
   The reviews loader spreads the review **message payload** into the response
   (`routes/reviews.ts:166-169`), and `ReviewPayload` is `{title, reasoning, artifactRef}`
   (`framework/domain-model/src/thread.ts:199-203`) — no `taskId`, no `betId`. So `hostId` is `""`,
   `useHostThread` skips its fetch, `hostThread.data` stays null, and `handleSubmitVerdict` returns on
   its first line (`ReviewPage.tsx:173-176`). Only the hardcoded `"rev-1"` fixture
   (`routes/reviews.ts:42-87`) makes it appear to work.

**Verdict.** The claim "the human-facing half of AC3/AC4 needs no new surface", carried through three
revisions, is false. **Fix (§2.8, T4b):** the loader returns the review's own `threadId`; `ReviewPage`
uses it instead of deriving a host; the route and `open-handler`'s `case "review"` gain a task-hosted
shape. AM1's decision that the decision UI lives on the review page is **not** reopened — no verdict
bar returns to the conversation.

**A second reason the loader change is load-bearing:** the live verdict branch rejects a
`resolvesMessageId` whose message is not in the posted-to thread (`threads.ts:1362-1365`). Deriving the
host from `taskId ?? betId` can select a different thread from the one the review message is in;
returning the message's own thread id cannot.

## F33 — Do two of the five verdict buttons 400? **Repo-verified: NO. My revision-3 claim was false. (r3 BLK-2)**

The rendered buttons (`RichMessageCard.tsx:81-87`) post through `POST /messages`, validated by
`messageInputSchema`'s verdict arm (`threads-schema.ts:186-190`) → `verdictPayloadSchema`
(`threads-schema.ts:166-170`), whose `decision` is `z.enum(VERDICT_DECISIONS)` — **all five accepted.**
The three-value enum (`threads.ts:1591-1594`) is on the route F31 shows nothing calls.

**Verdict.** The scope revision 3 added, and the founder question it raised, are **struck**. §2.5.1 now
maps all five decisions because all five arrive, not because anything is broken. Useful cross-check:
this finding cuts the opposite way from F31 and both point at the same conclusion — the *messages*
route is the live one.

## F34 — Can `review` read `messages`? **Repo-verified: NO. (r3 BLK-3)**

`messages` is owned by `conversation` (`tools/governance/table-owners.json`), and ownership covers
reads. `@hyperidle/review`'s manifest lists `@hyperidle/conversation` under **devDependencies**
(`layers/core-api/review/package.json:20-26`), so a production import would be an ownership violation
and a prod→dev violation at once.

**Fix.** `getReviewMessage` becomes an injected dep on the resolver's bag and on `ReviewPorts`, the
same Mechanism C shape `getTaskById`/`getBetById`/`getTeamById`/`resolveOrCreateCallingThread` already
use (`proposed-call-workflow.ts:303-306`, `ports.ts:71-145`, wired at `service-bootstrap.ts:379+`). The
implementation lives in core-api **layer** code, which may import both — `routes/reviews.ts:6` already
imports `@hyperidle/conversation` and `:9` `@hyperidle/work`, and `calling-thread-bindings.ts:35-38` is
the precedent for exactly this pairing (a fact `superseded/feasibility.md` §5 records). §2.10's
`reviewMessageId → thread` resolution takes the same dep.

## F35 — Would a required `ReviewPayload.taskId` break existing data? **Repo-verified: YES. (r3 BLK-4)**

`reviewPayloadSchema` (`threads-schema.ts:155-159`) is used on **both** sides: the write arm
(`messageInputSchema`, `:186-190`) and the **read-back** arm (`messageRowSchema`, `:218-221`), consumed
by `rowToMessage` via `.parse()` (`threads.ts:593-596`) — which throws, not strips. A review row written
before BA2 carries `{title, reasoning, artifactRef}`; with `taskId` required, both union arms fail and
listing the thread that holds it fails.

It was also self-contradictory: §2.5.1 specified a fallback for "no `taskId` on the payload", a state a
required field makes unreachable, while the re-key's correctness argument said "all three always exist".

**Fix.** `taskId`, `clearsRule` and `clearsRuleRequested` are all **optional**. Pre-BA2 rows keep
parsing; no migration. The correctness claim narrows to the truth: `reviewMessageId` and `agentId`
always exist; `taskId` exists on every review BA2 writes and its absence is exactly the
cannot-resume fallback, which a service test now drives.

## F36 — Facts taken from `superseded/feasibility.md` that are still true and load-bearing

Beyond BLK-1 (its B1/B2) and F32 (its E1, §7.1, §7.6), four things changed this document:

- **§5 — `routes/reviews.ts` is core-api *layer* code and already imports `@hyperidle/conversation`
  (`:6`) and `@hyperidle/work` (`:9`).** Re-verified. This is the answer to F34: the read needs no new
  package edge, only a declared injection.
- **§5 — `authorizeWrite` does not enforce participation for a `bet` or `task` host**
  (`auth/access-boundary.ts:32-40,61-79`). Re-verified. It makes the messages route's founder +
  non-self check the *stronger* gate, which turns F31's authz question from a risk into a free
  improvement.
- **E4 — `FIXTURE_REVIEW` is served from a shipping handler** for `reviewMessageId === "rev-1"`
  (`routes/reviews.ts:34-79,86-89`). Re-verified. This feature's rubble; added to the delete list.
- **E5 — the reversibility annotation plumbing is dead.** `annotations.destructiveHint` /
  `idempotentHint` is declared at `harness-protocol/src/harness/tool-seam.ts:99` and
  `tool-handlers/src/tool-types.ts:44,102`, forwarded by `toRegistered` (`:64`), and read by exactly one
  function — `classifyReversibility`, which BA2 deletes. No tool definition sets it. Added to the
  delete list; without it BA2 would delete the reader and leave the declarations.

Two more of its findings are confirmations rather than changes: **§7.5 N-2** (`proposed_calls.reversibility`
has zero readers, so the table drop is safe) and **E3** (`AL7-two-session-trust-first.integration.test.ts`
spawns real binaries against an inline tool and an in-memory router — "the only end-to-end proof in the
repo proves a mock"), which is already on the delete list and is the reason §6 insists on the real
provisioner and the real bridge.

## F37 — Will the new harness test actually run? **Repo-verified: only if it is listed. (my own find)**

`vitest.integration.config.ts:21-45` defines `HARNESS_INCLUDE` as an **explicit list** plus two globs,
`layers/core-api/src/__tests__/*-real.integration.test.ts` and the routes equivalent.
`action-gate-realbinary.integration.test.ts` matches **neither** glob — the pattern requires the name to
end `-real.integration.test.ts`, and this ends `-realbinary.integration.test.ts` (which is why
`real-harness-return-enforcement-realbinary.integration.test.ts` is listed explicitly).

The lore at `:36-39` names the consequence exactly: without the entry the file "matches the service
lane's `layers/**` include and hard-fails CI where the binaries are absent". So an unlisted file does
not silently skip — it breaks per-merge CI. Added to T7.

---

# Revision 5 — findings raised by the fourth critique

Both blockers reproduced at the code. Both sit inside revision 4's own new material.

## F38 — Does the "Open review" button render for a task-hosted review? **Repo-verified: NO. (r4 BLK-1)**

Revision 4 retracted "no new surface is needed" and named three fixes — the loader, `ReviewPage`, the
route and `open-handler`. **None of them is the gate.** The button is hidden one hop earlier.

`layers/core-ui/src/components/PartList.tsx:44-46`:

```
// UI-005: The "Open review" button is only available when the bet is resolvable.
const canOpen = (betId != null && betId !== "") || part.reviewTarget.betId !== "";
return <ReviewRequestPart part={part} onOpen={onOpen} canOpen={canOpen} />;
```

Both disjuncts are false for every BA2 review:

- `betId` is `Conversations.tsx:480`'s `reviewBetId`, which the page sets to `null` for a task host:
  `const reviewBetId = data.thread.hostKind === "bet" ? data.thread.hostId : null;`
- `part.reviewTarget.betId` is **always** `""` — `layers/core-ui/src/components/parts/part.ts:375`
  builds `const reviewTarget: ReviewTarget = { betId: "", reviewId: message.id };` unconditionally, and
  `ReviewTarget` (`part.ts:102-106`) is `{ betId, reviewId }` with **no field a task host could travel
  in**.

`ReviewRequestPart.tsx:63` renders the `Button` only inside `{canOpen && (…)}`, so the human sees no
control at all — not a disabled one — and `open-handler.ts:107-118` is never reached. Making it "gain a
task-hosted shape" therefore changes nothing observable.

**Verdict.** After T4b exactly as revision 4 wrote it, a task-hosted BA2 review still had no human
entry point, so ACs 3, 4 and 7 stayed unreachable — the precise failure §2.8 says T4b exists to
prevent.

**Fix (§2.8 step 0, T4b).** Widen `ReviewTarget` to carry the review's thread, set it in the part
builder, and make `canOpen` resolve for a task host — or delete the gate outright once the route no
longer needs a bet. Files added to T4b: `parts/part.ts`, `PartList.tsx`, `Conversations.tsx`.

**The evidence had the same hole.** Revision 4's named assertion mounted `ReviewPage` directly, so it
would have gone green with the entry point invisible. §6 now asserts at the `Conversations` level: a
task-hosted thread holding an unresolved BA2 review renders a reachable "Open review" affordance whose
click navigates to the review route. **Red today for two independent reasons** — `canOpen` false, and
`handleSubmitVerdict` returning on its first line — and it stays red if either half is skipped.

## F39 — What happens if the post-commit resumption throws? **Repo-verified: nothing reaches the human. (r4 BLK-2)**

§2.5.1 put BA2's verdict work at the `void decision` site, which is correct — the transaction closes at
`threads.ts:1460` and the block runs at `:1521-1537`, post-commit. But revision 4's failure branch
covered only two *predicates* (no `taskId`, agent not runnable). A **throw** was uncovered, and the
placement makes it the likely outcome:

- **The neighbouring precedent at that exact site is throw-on-failure**, stated in its own `@lore`
  (`threads.ts:1477-1485`): *"On a failed submit here, the message is committed with no turn intent;
  this handler throws (no try/catch — same as `knowledge.ts`'s site 4), the caller sees a 5xx…"*. A
  builder copying the neighbour leaves the verdict committed, the review resolved
  (`resolveMessageIfUnresolved` ran inside the transaction at `:1441-1451`), the clearance possibly
  already `cleared`, the agent never resumed, and nothing written to the thread.
- **The browser swallows it.** `postVerdictHostMessage` converts only 409 and 403 into outcome values
  and throws on every other non-OK status (`host-threads.ts:147-150`). `handleSubmitVerdict`
  (`ReviewPage.tsx:173-196`) has no `try`/`catch`, so the rejection kills the handler before
  `hostThread.refresh()` and the loader re-fetch, and the page's `error` state is loader-only
  (`:145-152`) and never set. The human clicks Approve and sees an unchanged page.

That is "approved-but-not-done", which `plan.md`'s constraint and AC6 forbid by name — and it is a
state **BA2 creates**: the line being replaced is `void decision;` and cannot fail.

**Fix.** The post-commit block is wrapped and **any** failure, predicate or thrown, takes one branch: a
plain message into the thread the human approved in, and the POST still returns success carrying a
recorded-but-not-resumed outcome. §6 gains the assertion that was missing: with the intent recorder
forced to throw, the verdict is still resolved, a message lands in the approving thread, and the
response is not a 5xx. It was the one branch of AC6 nothing proved — §6's existing AC6 coverage is all
downstream of a resumption that was *successfully recorded*.

## F40 — The six other r4 notes, verified

- **N-1 — the cannot-resume message would assert something false about legacy reviews.** `taskId` is
  optional, so the branch is reachable for any review row BA2 did not write —
  `tools/setup/src/demo-world/conversations.ts:410,595,764` and any pre-upgrade `submit_review` row.
  Today approving one does nothing. The message is now gated on a BA2 origin (a clearance row, or a
  `taskId`) and silent otherwise.
- **N-2 — a second, route-bypassing approval door exists.** `policy-engine.ts:148-175`'s `auto_resolve`
  writes a `verdict` message with `deps.conversation.insertMessage` directly against the most recent
  review-typed message in the thread, then calls `resolveMessageIfUnresolved` and `updateThread` — never
  touching the messages route. It would resolve a BA2 review with no clearance transition and no
  resumption. Narrow today (`handoff-protocol.ts:165-169` mints a fresh thread per review item, so the
  target is an empty thread), and closing it is a policy question, not BA2's. Recorded in §9.
- **N-3 — `useHostThread` resolves by host, not by id.** `useHostThread.ts:61-93` looks up by
  `(hostKind, hostId)`; using a known thread id means fetching `GET /api/threads/:id` directly, which is
  the URL that hook already builds at `:88-91`. Named in §2.8 step 2 and in T4b.
- **N-4 — four widenings, not three.** `openMcpBridge`'s own options object (`provisioner.ts:253-263`)
  must carry the gate before `bridge.open` / `createMcpSession` / `lookup` can. Compiler-caught; a
  budget note only.
- **N-5 — the `"rev-1"` deletion has a test consumer.**
  `layers/core-api/src/routes/__tests__/reviews.routes.integration.test.ts` asserts the fixture path
  returns 200. It goes red loudly; scope accounting, not risk.
- **N-6 — the gate is not free, and §4 now prices it.** A live read per call plus a heartbeat upsert on
  every adjudication means a round trip, a query and an upsert per gated action, including on an empty
  rule list. AC1 holds behaviourally, not in cost. Accepted at `mvp`, with the reason and the cheap
  first mitigation stated.
- **N-7 — "live" overstated the `session_ended` net.** It is wired (`service-bootstrap.ts:379`) and the
  net is the only thing that subscription does, but its trigger reads `tailoredGrants`, which nothing
  writes in production. Like `/verdict`, it is **complete and unreached**. §1 corrected. The decision is
  unaffected: both tables it reads are on the delete list, so it can be neither deleted nor left.
- **N-8 — the heartbeat is weaker than phase 1 asked for and needed an explicit yes.** It has one:
  founder ruling §10, recorded as a *deferred* decision. §9 keeps the four things it does not catch
  stated plainly, and keeps the escalation named.

---

# Revision 6 — findings from the AC8 review-surface audit (ruling 11)

Four of these were **executed**, not read: a throwaway vitest file in the `core-ui` project rendered the
real components with the real payload shapes, and was deleted after the run. Where a result is quoted it
is the observed output, not an inference from the source.

## F41 — Does the review page render a real review? **Executed: NO. It crashes.**

The reviews loader returns the review message's payload verbatim
(`layers/core-api/src/routes/reviews.ts:115-119`, `return c.json({ ...reviewPayload })`). That payload is
`ReviewPayload` — `{ title, reasoning: string[], artifactRef }` and nothing else
(`framework/domain-model/src/thread.ts:199-203`; written that way by `submit_review` at
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:644-649`). The client casts it:
`return (await res.json()) as ComposedReviewSubject` (`ReviewPage.tsx:48`) — a cast that has never been
true.

`ReviewComposition` dereferences, unconditionally: `subject.artifacts.find` (`:768`),
`subject.conversation.filter` (`:790`), `s.tools.map` (`:249`), `s.intent.filter` / `s.intent.length`
(`:436,455`), `s.resultKpis.map` (`:445`), `s.needs.length` / `s.needs.map` (`:476,478`),
`s.artifacts.length` / `s.artifacts.map` (`:575,577`).

**Executed** — `ReviewPage` rendered with a loader returning exactly the three real fields:

```
TypeError: Cannot read properties of undefined (reading 'find')
 ❯ ReviewComposition layers/core-ui/src/pages/review/ReviewComposition.tsx:768:43
```

with a rendered body of `<div />`. In the app this reaches the shell's only `ErrorBoundary`
(`layers/core-ui/src/layouts/AppShell.tsx:669`; fallback at `components/ErrorBoundary.tsx:67-82`), so
the human sees **"Something went wrong. An unexpected error occurred. Please reload the page."**

`ReviewPage`'s own `error` state (`:199-210`) does not help: it is set only from a rejected loader
promise (`:151-153`), never from a render throw.

**Consequence:** the entry point revisions 1–5 were repairing led to a crash. Architecture §2.8.1 A.

## F42 — Does the shipping demo route render correctly? **Executed: NO, and it renders a mock.**

`FIXTURE_REVIEW` (`routes/reviews.ts:42-87`) is returned from the shipping handler for
`reviewMessageId === "rev-1"` (`:88-90`). Rendered through the real `ReviewPage`:

- `TOKENS_LINE: [" · 9 min ago"]` — the fixture carries no `tokens`, and
  `ReviewComposition.tsx:258` renders `{s.tokens} · {s.producedAgo}` unconditionally, so the separator
  hangs with nothing on its left. Any loader that returns `tokens: ""` produces the same.
- `CHECKOUT_MOCK: true`, `CHECKOUT_TOTAL: true` — the rendered DOM contains `"SPRING24"` and
  `"$120.00"`. Source: `ResultSection` renders `<CheckoutProof />` unconditionally
  (`ReviewComposition.tsx:450`); `CheckoutProof` (`:346-352`) draws two `CheckoutCard`s (`:355-414`)
  containing `SPRING24`, `Promo (SPRING24) −$24.00`, `Subtotal $120.00`, `This code expired on Apr 3.`
  This is not the fixture's data — it is hardcoded in the production component and renders inside
  **every** review, including a real one. `ResultRow` (`:415`) has exactly two callers,
  both inside `CheckoutCard` (`:401-402`), so it dies with it.
- `ARTIFACTS_SECTION: true` with `artifacts: [] as unknown[]` (`routes/reviews.ts:85`) — the section
  renders with a count of zero.

## F43 — Do the two conversation entry points work on a task host? **Executed: no, and worse than "no".**

`PartList` rendered with `betId={null}` — the exact value `Conversations.tsx:480` passes for a
task-hosted thread — and a review part whose `reviewTarget.betId` is `""` (the only value
`part.ts:375` and `:411` ever build):

- `OPEN_REVIEW_PRESENT: false`. `PartList.tsx:46` computes
  `canOpen = (betId != null && betId !== "") || part.reviewTarget.betId !== ""` — both disjuncts false —
  and `ReviewRequestPart.tsx:63` renders the button only `{canOpen && …}`. Confirms r4 BLK-1 by
  execution.
- `INSPECT_REVIEW_PRESENT: true`, `NAVIGATE_CALLS: 0`. **New — no critique found this.**
  `ReviewResolvedPart.tsx:49-63` renders "Inspect review" with **no `canOpen` gate at all**, unlike
  `ReviewRequestPart`. The click reaches `open-handler.ts:107-119`, where `pageBetId` and `targetBetId`
  are both null and `if (betId === null) return;` (`:115`) swallows it. A visible button that does
  nothing, forever.

`part.ts:411` also gives a resolved **questionnaire** a `reviewTarget`, so the same dead button appears
for one — and on a bet-hosted thread, where it is *not* dead, it navigates to the review route with a
questionnaire message id, which the loader happily serves (F44).

## F44 — Does the loader check that the message is a review? **Repo-verified: NO.**

`routes/reviews.ts:101-105` calls `findMessage(db, { id })` and 404s only when the row is absent. Nothing
inspects `type`. A questionnaire, a plain message or a verdict id all return 200 with that message's
payload — which then crashes the page for the same reason as F41.

## F45 — Can any canvas render with real data today? **WRONG — see F60. Five of nine do, in the demo world.**

> **This finding is false and is kept only as the record of an error.** Its enumeration of the *loader's*
> two sources is accurate; its conclusion is not, because it never looked at what the demo world writes.
> F60 has the correction.


The registry has exactly one production consumer: `ReviewComposition.tsx:682`
(`const Canvas = getReviewCanvas(artifact.kind)`), inside `ExaminePane`, fed from `subject.artifacts`.
Every other reference in the tree is a test or `canvas-registry.ts` itself (enumerated with
`rg -a "getReviewCanvas|REVIEW_CANVAS_REGISTRY"`: 1 production hit, 3 registry hits, ~30 test hits).

`subject.artifacts` has two possible sources in the loader and neither produces anything:

1. `reviewPayload.artifacts` (`routes/reviews.ts:149-151`) — `ReviewPayload` has no `artifacts` field
   (`thread.ts:199-203`), so this is always `[]`.
2. The append at `:145-164` — requires a `proposed_calls` row. `captureProposedCall` has never run in
   production (superseded feasibility B3: the `sessionWorkflow` object is never constructed on any
   production path), the table therefore has zero rows (superseded N-2), and §2.11 deletes it.

Even the demo fixture carries `artifacts: [] as unknown[]` (`:85`). **So no review canvas has ever
rendered, on any route, with any data.**

**And the fallback is a lie, not an empty state.** Each canvas substitutes a hardcoded demo when the
payload fails its type guard: `ReviewCodeDiff.tsx:807` (`if (!isCodeDiffPayload(payload)) return
CODE_DIFF_FIXTURE;` — a fabricated GitHub PR at `:213-214`), `ReviewBatch.tsx:561` ("Atlas Freight"
invoices at `:140`), `ReviewMetricsMoved.tsx:557-558`, `ReviewVisualDiff.tsx:439`,
`ReviewActionOperation.tsx:533-534` (a Stripe refund at `:50`), `ReviewFieldChangeSet.tsx:390`,
`ReviewRenderedInContext.tsx:556-559`, `ReviewBrowserPreview.tsx:503-504`,
`ReviewOutcomeSummary.tsx:357-358`. Harmless while unreachable; a data-corruption-shaped failure the day
someone populates `artifacts`. Architecture §2.8.1 D1/D2.

## F46 — Where else can a human meet a review? **Repo-verified: the conversation, and nowhere else.**

Enumerated every production path that can put a review in front of a human:

| path | verdict |
|---|---|
| `Conversations` → "Open review" / "Inspect review" | the only real one; broken per F43 |
| `router.tsx:89` direct URL | works as a route; destination crashes (F41) |
| Notification popover | navigates a persisted `sourceLink` = `/conversations/:threadId` (`notifications/src/install.ts:432`; `NotificationPopover.tsx:117-121`) — i.e. into the conversation. But the listener is driven off `items` (`install.ts:441-455`) and `submit_review` creates none (`tool-definitions.ts:599-667`), so **no notification is ever raised for an agent-raised review** |
| Conversations list | participant-scoped (`threads.ts:807-824`) with a per-row `hasUnresolvedReview` flag (`:826-836`) — this is the reachability signal that actually exists |
| `AssistantOverlay.tsx:480` | the **only** production `<ThreadShell` mount in the tree, and therefore the only mount of the inline verdict toolbar (`RichMessageCard.tsx:377-396`). It renders `useAssistantThread()` = `GET /api/threads/assistant`, `hostTitle="Assistant"` (`:329,486`) — never a task or bet thread. Not a review entry point |
| `SessionView` | `derivePartsFromSession` (`part.ts:492-560`) emits only `prose`, `tool` and `reasoning` — no review kind |
| Task page (`WorkTask.tsx:342`) / Bet page | `HostThreadSection` renders `CommentRow` with no rich slots (`:255-266`); `CommentRow.tsx:209-212` returns `null` for `type:"review"`. The review is a sender header, a timestamp, and an empty body |

## F47 — Does a human learn anything from clicking Approve? **Repo-verified: no, either way.**

- **On refusal, nothing.** `postVerdictHostMessage` returns `"ok" | "race" | "forbidden"`
  (`host-threads.ts:132-150`) and `ReviewPage.tsx:191` discards the return value;
  `handleSubmitVerdict` (`:173-197`) has no `try`/`catch`, so the 400 branch — which `throw`s at
  `host-threads.ts:150` — becomes an unhandled rejection. A non-founder (`threads.ts:1368-1373`:
  `if (!isFounder || selfVerdict) return 403`) clicks Approve and the page is unchanged.
- **On success, nothing either.** `ReviewComposition.tsx:770` derives
  `resolved = resolvedProp ?? subject.verdict?.decision !== undefined`; `ReviewPage` passes no
  `resolved` prop (`:227-234`) and the loader never returns a `verdict`, so the verdict bar stays live
  and no decision is marked. The refresh at `:192-194` re-reads the same payload.

The fix is cheap on both sides because the props already exist and are already honoured: `Verdict`
disables on `resolved` (`:148,157,166,180`) and highlights `activeDecision` (`:268`).

## F48 — Is `submit_review`'s thread reachable by a human? **Repo-verified: not when it creates one.**

`tool-definitions.ts:633-638` inserts the thread with `participants: [ctx.agentId]`. The thread list is
participant-scoped (`threads.ts:807-824`), so a thread with only the agent in it appears in no human's
list. The precedent for the fix is in the same file, nine lines above `submit_review`'s caller:
`create_item` resolves recipients and merges them into the thread's participants
(`tool-definitions.ts:450-467`, `resolveReviewRecipientsForItem` + `mergeParticipants`), backed by the
live route `GET /api/org/review-recipients` (`routes/org.ts:218-225`) over
`ReviewPorts.org.resolveReviewRecipients` (`review/src/ports.ts:83-89`).

## F49 — Is there any green end-to-end proof of the review surface? **Repo-verified: no.**

The two Playwright specs that exercise the verdict path — `"RichMessageCard mounts inline with
ArtifactView + 5 verdict buttons"` (`__e2e__/L11-rich-messages.spec.ts:72`) and `"thread-verdict:
clicking Approve on RichMessageCard POSTs verdict payload"` (`__e2e__/R9-action-prominence.spec.ts:1204`)
— are both on the known-failing exclusion list (`__e2e__/known-pre-existing-failures.ts:198,341`), which
that file's header (`:1-40`) documents as chronic pre-existing e2e debt. So the review surface has no
green end-to-end proof at any level, and AC8's evidence must not be built there. Architecture §6.

## F50 — Does removing the bet from the review URL cost anything? **Repo-verified: it is net removal.**

Every production site that touches the review route or `ReviewTarget.betId`, enumerated with
`rg -a "reviewTarget|route: \"review\"|ReviewTarget|work/bet/.*review"`:

`router.tsx:89`; `open-handler.ts:22-30,41-48,107-119`; `part.ts:103-106,205-209,375,411`;
`PartList.tsx:38,44-47`; `ReviewRequestPart.tsx:22,31,63,69`; `ReviewResolvedPart.tsx:51`;
`Conversations.tsx:291-295,475-490`; `ReviewPage.tsx:27-30,32-37,121-126`. Two production
`createOpenHandler` call sites exist and no more: `Conversations.tsx:487` and `AssistantOverlay.tsx:53`
(the latter already passes `{}`, so it is conditionally broken today and is fixed for free).

Moving to `/reviews/:reviewId` **deletes** the `canOpen` computation, the `OpenHandlerContext.betId`
field, `ReviewTarget.betId` and its two builders, the page-supplied `reviewBetId`, and `ReviewPage`'s
`betId`/`overrideBetId` — against **widening** `ReviewTarget` to carry a thread, which revision 5
proposed. The redirect for the old URL has an exact precedent: `RedirectProductToTeam`
(`router.tsx:38-44,84`), written because "Navigate cannot forward params directly in React Router v7".

`Conversations.tsx:291-295`'s `InspectDestination` regex was **absent from revision 5's T4b file list** —
the pane presentation would have kept matching the old URL and silently stopped resolving.

---

# Revision 7 — findings from the AC9 content-path audit (ruling 12)

Two of these were **executed** against the real schemas and vocabularies in the `domain-model` vitest
project; the probe file was deleted after the run. F51 in particular is the answer to "why are the
artifacts empty", and it is not the answer the audit expected.

## F51 — Can an agent attach an artifact it just created to a review? **Executed: NO. Every kind is rejected.**

`create_artifact` (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1400-1466`) is a
live, wired agent tool. It writes a real `artifacts` row through the same `POST /artifacts` route a human
uses (`:1444-1453`), binds `producingTaskId: ctx.taskId` from context and never from input (`:1446`),
emits `artifact_created`, and returns `ok({ artifactId, kind })` where `kind` is one of the six
`ARTIFACT_KINDS`.

`submit_review` accepts `artifactRef: { id, kind }` where `kind` is `z.enum(ARTIFACT_VIEW_SHAPES)`
(`:586-589`).

**Executed** — the exact `artifactRefSchema` from `:586-589`, fed each of the six kinds:

```
ARTIFACT_KINDS:       ["text","code","image","data","html","url"]
ARTIFACT_VIEW_SHAPES: ["text_diff","content_preview","visual_comparison","action_summary","data_metrics"]
OVERLAP:              []
submit_review artifactRef {kind:"text"}  -> REJECTED
submit_review artifactRef {kind:"code"}  -> REJECTED
submit_review artifactRef {kind:"image"} -> REJECTED
submit_review artifactRef {kind:"data"}  -> REJECTED
submit_review artifactRef {kind:"html"}  -> REJECTED
submit_review artifactRef {kind:"url"}   -> REJECTED
```

An agent doing the obvious thing gets `INVALID_INPUT` on every kind. Neither tool's description mentions
that a second vocabulary exists or how to map onto it, and the enum reaches the model as five bare words
it has never seen. The chain can only be completed by guessing a view-shape word — and the id is never
checked against the artifacts table either, so a guessed pair validates whether or not it refers to
anything.

**This is also an AC3 blocker, not only an AC9 one.** Architecture §2.5 B3 makes `artifactRef` *required*
when `clearsRuleId` is present. With no acceptable kind, every BA2 review would fail to submit.

## F52 — Is the reference resolved when it is valid? **Repo-verified: NO. It is never read.**

`routes/reviews.ts:115-119` parses the message payload and spreads it. Nothing in the handler reads
`artifactRef`. `artifacts` is fed only from `reviewPayload.artifacts` — a field `ReviewPayload`
(`framework/domain-model/src/thread.ts:199-203`) does not have — and from the proposed-call append
(`:149-172`) over a table with no production writer that §2.11 deletes. The demo fixture ships
`artifacts: []` (`:85`). So `subject.artifacts` is `[]` on every path, which is F45's finding with its
cause now named.

## F53 — Does anything render off `ARTIFACT_VIEW_SHAPES`? **Repo-verified: NO. Two readers, both validators.**

`rg -a "ARTIFACT_VIEW_SHAPES|ArtifactViewShape"` across `layers/` and `framework/`, excluding `dist/` and
tests: `tool-definitions.ts:28,588` and `threads-schema.ts:8,82` (both `z.enum(...)` validators), the
declaration itself (`thread.ts:52-59`), its use as `ArtifactRef.kind` (`:148`), and two barrel exports
(`index.ts:213,242`). **No renderer dispatches on it.** Its one downstream consumer is a label lookup for
a conversation Embed (`part.ts:265-282`), where `text_diff` picks a `diff` Embed and everything else picks
`artifact`. It is a fifth vocabulary that exists only to be validated against.

Note the same file's comment (`thread.ts:47-51`) already concedes the shapes are "distinct from the L3
Artifact primitive's `kind`" and "describe HOW a review-message embed renders its preview" — a job nothing
in the tree performs.

## F54 — Could the nine canvases be fed from what agents produce? **The question was wrong — see F60/F61.**

> **Superseded.** The table below is accurate about one thing — a *six-kind artifact preview* cannot be
> mapped onto a canvas payload — and that survives as the reason a resolved `artifactRef` renders on
> `ReviewUnknownCanvas` rather than a guessed canvas (§2.8.2 B). But the premise that this is the only
> channel is false: the demo world feeds the canvases **directly from the review message payload**, and
> that is the channel an agent gets (F61). Nothing new has to be produced or mapped.


The canvas payloads are *analyses* of artifacts, not artifacts:

| canvas payload | wants | produced by |
|---|---|---|
| `CodeDiffPayload` (`review-artifact.ts:161-180`) | files with hunks, per-file review band, rationale, trivia rollup | nothing |
| `MetricsMovedPayload` (`:115-135`) | period headlines prior→current, a tie-out that balances, exceptions | nothing |
| `BatchPayload` (`:182-205`) | rollup counts, flagged/auto/drafted partitions | nothing |
| `FieldChangeSetPayload` (`:76-86`) | old→new per field with provenance and unchanged count | nothing |
| `ActionOperationPayload` (`:88-102`) | verb, amount wire, blast radius, receipt fields | nothing (its one feeder is the `proposed_calls` table BA2 deletes) |
| `OutcomeSummaryPayload` (`:54-74`) | agent, tools, tokens, done-conditions, needs-you | duplicates the review page's own frame |

`create_artifact`'s six kinds are **content**: `text` (body + format), `code` (`{path, lang, text}` — one
file's source), `image`, `data`, `html`, `url` (`framework/domain-model/src/kinds/registry.ts`). The diff
was removed from the `code` kind **deliberately** — that file's own `@lore AM5 K0` (`:63-68`): *"PURIFIED
from {kind:'code', file, hunks} — a diff baked into a content shape. The diff belongs to the Review
composition (built from two code instances)"*. Nothing in the tree builds two code instances or diffs
them. So `code_diff` alone needs a second artifact and a differ before it can render anything real.

## F55 — Is there already a renderer for real agent artifacts? **Repo-verified: YES, live and shipping.**

`composeArtifactBody` (`layers/core-ui/src/ds/kinds/compose-artifact-body.tsx:84-206`) dispatches the six
real kinds to the shared block primitives — `text` → `deriveBlocks` + `Block` stream, `code` →
`CodePayload`, `image` → `ImagePayload`, `html` → a sealed `ArtifactFrame`, `url` → an inline link,
`data` → `KpiStat` + rows table + `Sparkline`. It is wrapped by `ArtifactPreviewSurface`
(`ds/ArtifactPreviewSurface.tsx:137-151`) inside a `RendererErrorBoundary` (`:104-112`), and by
`ArtifactPreview` (`ds/ArtifactPreview.tsx:33-63`), which adds the kind badge, label, task title and
timestamp. Exported from the ds barrel (`ds/index.ts:17-18`).

Its production caller with real data is `ArtifactPermalink.tsx:121` —
`<ArtifactPreview data={data} sanitizeHtml={sanitizeHtml} showTitle={false} />` — the page behind
`/artifacts/:id`. **And the conversation already routes a review's artifact there**: `artifactRefToEmbed`
(`part.ts:275-282`) builds `{ route: "artifact", artifactId: ref.id }`. The review *page* is the only
surface in the product that does not use it.

`ComposedReviewSubject.artifacts` can therefore be `readonly Artifact[]` — the domain type at
`framework/domain-model/src/types/artifact.ts:42-54`, which `GET /artifacts/:id` already returns and which
core-ui already imports. No new vocabulary is required at either end.

## F56 — What does the product already do with an artifact it cannot render? **Repo-verified: a reasoned answer already exists.**

`ArtifactUnrenderable` (`ds/kinds/artifact-unrenderable.tsx`) is the never-invent fallback, and its AZ6
lore (`:10-27`) is the decision ruling 12's third point asks for, already taken: there are **three**
reasons an artifact cannot be shown — `unknown-kind`, `empty`, `malformed` (`:36-43`) — and *"they must
not share a sentence"*; the kind is classified with `isRegisteredKind`, *"the same function the API uses,
so the two ends of the system agree on what 'supported' means"*; and an artifact with nothing stored gets
no "View source" control, because *"offering to reveal a source and then showing whitespace is a second
small lie."* A null preview renders "No preview available" (`ArtifactPreviewSurface.tsx:49-56`).

Contrast the nine canvases, each of which does the opposite on the same condition — e.g.
`ReviewCodeDiff.tsx:807`, `if (!isCodeDiffPayload(payload)) return CODE_DIFF_FIXTURE;`.

## F57 — Where can an end-to-end review proof actually live? **Repo-verified: not the default e2e lane; the AH family, unwired.**

- **The default Playwright lane mocks the entire API.** `playwright.config.ts:6-10`: *"the e2e mocks API
  calls via page.route(), so no API server is needed"*; `webServer` runs vite alone on port 5179
  (`:67-69`). A review spec there proves a fixture. It also carries `grepInvert` over the 277-entry
  exclusion list (`:28-39`), which holds both verdict specs (F49).
- **Three real-backend lanes already exist.** `playwright.ah1.config.ts` boots the real Hono server
  against a per-boot `mkdtemp` PGlite dir with Drizzle migrations applied
  (`__scripts__/ah1-test-server.ts:27-60`) plus a real vite build; `.ah5` adds a real LLM call; `.ah6`
  adds cassette replay. Each has its own `testMatch` and **none sets `grepInvert`**. AH1's own header
  states the rule to inherit: shell-scaffolding mocks only, *"the credential routes must reach the REAL
  backend"* (`ah1-onboarding-credentials.spec.ts:14-18`).
- **None of the three is run by anything.** `test:e2e:ah1` / `:ah5` / `:ah6` are npm scripts
  (`package.json:33-35`); `verify:release` runs `test:e2e:full` (`:52`), which is the default mocked
  config, and the only CI e2e job runs the same on version-bump PRs only
  (`.github/workflows/release-guard.yml:158-159`). Three real-backend lanes protect nothing. A fourth
  added the same way would protect nothing either — hence the `verify:release` wiring in §6.
- **AH5's own UI half is `test.fixme()`-gated** (`ah5-live-agent-path.spec.ts:15-22`), so no live
  agent → UI proof exists in the tree today. That is why §6 splits AC10 between the browser lane and T7's
  harness lane rather than claiming one lane does both.

## F58 — Does `totals.tables` stay 37? **Repo-verified: NO. It is 40 now, and must return to 37.**

`tools/governance/src/lib/governance-registry.ts:163` asserts
`registry.totals.tables === liveTables.size` and throws otherwise, on every lint run. Revisions 1–5 said
the count "stays 37" because T1's three additions offset T12's three deletions — true in sum, false in
sequence: T1 is phase 2 and T12 is phase 4. The committed `tools/governance/table-owners.json` now reads
`{"tables": 40, "owned": 40, "unowned": 0}` with 40 owner rows: `teamActionRules`, `actionClearances`,
`teamActionGateChecks` all present and owned by `review`, and `proposedCalls`, `tailoredGrants`,
`operationOutcomes` still present. **T12 must take it back to 37 in the same commit as the drop
migration.** Architecture §2.1 and T1/T12 corrected.

## F59 — A pre-existing typecheck gap, and whether this work makes it fatal

`@hyperidle/review`'s `tsconfig.json` never declared `framework/harness-protocol` or
`framework/harness-capability` as project references, although `proposed-call-workflow.ts` already imports
from `@hyperidle/harness-protocol`. Confirmed pre-existing and not this package's to fix.

**Does anything shaped in revisions 6–7 make it newly fatal?** No. T4b, T4c, T4d, T4e and T4f touch
`layers/core-api/src/routes/` (the core-api *layer*, not the `review` package), `layers/core-ui/`,
`framework/domain-model/`, `framework/api-contract/` and the e2e scripts. None adds an import to
`@hyperidle/review`. T1 and T6, which do work inside that package, predate this addendum. Recorded so a
builder that hits it knows it is inherited, not caused.

---

# Revision 8 — the correction (ruling 13)

## F60 — Do the nine canvases render real data? **YES, five of nine do. F45 was WRONG, and this is how.**

**The fact.** `tools/setup/src/demo-world/conversations.ts` seeds three `type:"review"` messages
(`:410`, `:595`, `:764`) whose payloads carry a populated `artifacts` array with real canvas payloads for
five of the nine kinds:

| kind | demo instances |
|---|---|
| `outcome_summary` | `:469`, `:642`, `:818` |
| `visual_diff` | `:503` |
| `browser_preview` | `:520` |
| `code_diff` | `:664`, `:844` |
| `metrics_moved` | `:894` |

Persisted whole — `conversations.ts:1624`, `payload: JSON.stringify(message.payload)` — so the whole
object reaches `messages.payload` including `artifacts`. Served whole: for a review with no proposed call,
which is every demo review, the loader returns `c.json({ ...reviewPayload })` at
**`routes/reviews.ts:117-119`**, and that spread carries `artifacts` through to
`ComposedReviewSubject.artifacts` → `ReviewComposition.tsx:682` → the canvas.

**Note the precise path**, because it decides what may be deleted: the coordinator cited
`routes/reviews.ts:149-150,176`, which is the **proposed-call branch**. Both branches carry `artifacts`,
but the demo world travels the **early return at `:117-119`**, and §2.11 deletes the other one. The early
return is the survivor and the one T4d edits.

`ReviewCodeDiff` even reads the payload directly rather than through the guard —
`ReviewCodeDiffView payload={artifact.payload}` (`ReviewCodeDiff.tsx:860`), `mapCodeDiffPayload(payload ?? CODE_DIFF_FIXTURE)`
(`:633`) — so a well-formed demo payload renders the demo's diff, not the fixture.

**How F45 got it wrong, recorded because the method is the transferable part.** Two checks were made and
both were of the wrong object:

1. **The type.** `ReviewPayload` (`thread.ts:199-203`) declares `{title, reasoning, artifactRef}` and no
   `artifacts`. True — and irrelevant, because the payload is stored as `JSON.stringify` of whatever the
   producer built and read back with a schema that does not strip unknown keys. **The persisted object is
   a superset of its declared type**, so the declaration cannot answer "what data exists".
2. **The fixture.** `FIXTURE_REVIEW` genuinely ships `artifacts: []` (`routes/reviews.ts:85`), and F42
   *executed* a probe against it and observed an empty artifacts section. A real execution against the
   wrong input is more convincing than a bad inference, not less — it made a narrow check feel like a
   broad one.

Neither check looked at the seeded database, which is where the answer was. The enumeration that *was*
done — "one production consumer, two loader sources" — was correct and still is; it simply does not
support the conclusion drawn from it. This is the fifth claim in this package that read as obviously true
and was false, and the first one I produced.

**What survives from F45/F54:** that a *stored six-kind artifact* cannot be mapped onto a canvas payload
(F54's table), which is why a resolved `artifactRef` renders on `ReviewUnknownCanvas` (§2.8.2 B). What
does not survive: every conclusion about the canvases being unreachable, and the deletion that followed.

## F61 — How does an agent feed a canvas, keeping the six-kind consolidation? **The demo world's channel, one field wide.**

There are two independent channels onto a review, on two different axes, and conflating them is what
produced revision 7's fork:

| channel | carries | vocabulary | feeds |
|---|---|---|---|
| **canvas artifacts on the review payload** | `{id, tool, app, sourceHref, title, kind, payload}` | `ReviewCanvasKind` (9) — AL2's review-**rendering** vocabulary | the nine canvases, proven by the demo world |
| **`artifactRef`** | `{id, kind}` pointing at an `artifacts` **row** | today `ArtifactViewShape` (5); should be `ArtifactKind` (6) | the conversation Embed → `/artifacts/:id` |

**AM5 consolidated the artifact primitive's kinds, not the canvas kinds.** `ARTIFACT_KINDS`
(`framework/domain-model/src/kinds/registry.ts`) and `ReviewCanvasKind`
(`core-ui/src/pages/review/review-artifact.ts:12-21`) are different axes; the second was untouched by the
consolidation and is alive. So giving `submit_review` an `artifacts` input reintroduces nothing pre-AM5 —
it uses the vocabulary the renderers have always used and the demo world writes today.

`ARTIFACT_VIEW_SHAPES` is the third vocabulary and the actual break: five values, two readers, both
`z.enum` validators, no renderer (F53), zero overlap with the six (F51). Deleting it and respelling
`ArtifactRef.kind` to `ArtifactKind` is what ruling 13 means by "stop speaking the pre-AM5 names".

## F62 — What must an agent supply per canvas kind? **Verified against each payload interface.**

Read from `core-ui/src/pages/review/review-artifact.ts` and checked against the demo instances:

- `outcome_summary` (`:54-74`) — facts about the agent's own run; nothing external. Demo `:469`.
- `code_diff` (`:161-180`) — files with hunks and per-file band; the agent has the diff in its sandbox.
  Demo `:664`.
- `visual_diff` (`:137-145`) — **labels only, no image URLs** (verified against the demo payload at
  `conversations.ts:503-512`: `before{label}`, `after{label}`, `diffRegions[{id,label}]`, `overlayMode`).
  Much cheaper than the name suggests — it is a described comparison, not an image pipeline.
- `browser_preview` (`:207-211`) — `{url, title, previewBody}`, `previewBody` an HTML string
  (`conversations.ts:520-527`). The cheapest of the nine.
- `metrics_moved` (`:115-135`) — needs prior **and** current per headline and a `tieOut` that balances.
  Demo `:894`.
- `field_change_set` (`:76-86`) — old→new per field with provenance. **No demo instance.**
- `action_operation` (`:88-102`) — verb, amount wire, irreversible/reversible, blast radius, receipt
  fields. **No demo instance — and this is the shape BA2's own push-back review produces.**
- `rendered_in_context` (`:104-113`) — inbox row plus body. **No demo instance.**
- `batch` (`:182-205`) — rollup plus flagged/auto/drafted. **No demo instance.**

## F63 — Is the fixture-substitution trap live once agents supply payloads? **Yes, and this work springs it.**

Nine sites, each `if (!isXPayload(payload)) return FIXTURE`: `ReviewCodeDiff.tsx:807`,
`ReviewBatch.tsx:561`, `ReviewMetricsMoved.tsx:557-558`, `ReviewVisualDiff.tsx:439`,
`ReviewActionOperation.tsx:533-534`, `ReviewFieldChangeSet.tsx:390`, `ReviewRenderedInContext.tsx:556-559`,
`ReviewBrowserPreview.tsx:503-504`, `ReviewOutcomeSummary.tsx:357-358`.

Harmless while the only producer is a demo world that writes correct shapes. **The moment an agent
composes a payload, a near-miss renders a fabricated GitHub PR (`ReviewCodeDiff.tsx:213-214`) or Stripe
refund (`ReviewActionOperation.tsx:50`) in place of the agent's real work** — a confident lie, and exactly
what AC9's last sentence forbids.

`ReviewUnknownCanvas` (`ReviewUnknownCanvas.tsx:11-40`) is the replacement and needs nothing built: it is
already the registry's default for an unregistered kind (`canvas-registry.ts:36`), renders a source header
plus the payload, and its own comment states the contract — *"Never crashes or leaves a blank surface."*

## F64 — Can the manual test be run against the product? **Yes: `npm run setup -- --demo` then `npm run dev`.**

`seedDemoWorld` is opt-in behind `--demo` (`tools/setup/src/setup-cli.ts:203-206`, whose `@lore AF17`
records that it is deliberately not seeded into production databases) and is also reachable from
`tools/setup/src/bootstrap-pg.ts:29`. `npm run setup` is the CLI (`package.json:57`), `npm run dev` boots
server 3001 + web 5173. So §6.1 Part 0 — the baseline that proves the canvases already render — is
runnable today, before any BA2 change, which is why it is ordered first.

---

# Revision 9 — the traces the design should have had (first surface critique, 7 blocking)

All seven findings were reproduced. The three below are the ones that turn on behaviour rather than
text, so they were **executed**; the probe files were deleted after the runs.

## F65 — Does an `artifacts` array on `submit_review` reach the database? **Executed: NO. It is dropped silently.**

`submit_review` does not write to the table — it calls `ports.coreApi.insertMessage`, i.e.
`POST /api/threads/:id/messages`. The full write path, opened rather than assumed:

| step | site | what happens |
|---|---|---|
| ① | `tool-handlers/src/tool-definitions.ts:643` | `if (input.artifactRef) { …review… } else { …plain… }`. An agent supplying `artifacts` and no `artifactRef` gets a **plain message and no review at all** |
| ② | `core-api/src/routes/threads.ts:1301-1305` | `messageInputSchema.safeParse(body)` → `const input = parsed.data` |
| ②a | `core-api/src/routes/threads-schema.ts:155-159` | `reviewPayloadSchema` declares `artifactRef: artifactRefSchema` with **no `.optional()`** — a canvas-only review cannot be written |
| ②b | same | a bare `z.object`, so **unknown keys are stripped** |
| ③ | `threads.ts:1382` → `:1422` | `enrichedPayload = input.payload` → `payload: JSON.stringify(enrichedPayload)` — the *parsed* object is what persists |

**Executed** against the exact schema at `:150-159`:

```
PARSE_OK: true
KEYS_AFTER_PARSE: ["title","reasoning","artifactRef"]
NO_ARTIFACTREF_ACCEPTED: false
```

The parse **succeeds** and `artifacts` is gone. Nothing reports a failure anywhere — the silent-drop shape
that `threads-schema.ts:86-95`'s own `@lore AH3 H2` documents for `notice` and names as *"the same class of
bug as AD8b's `toolCalls` addition"*, and that F22 already recorded for this package.

**Why the demo world does not hit it:** `conversations.ts:1624` inserts **straight into the `messages`
table**, bypassing the route and its schema entirely. That is precisely why its payload is a superset of
`ReviewPayload` — and reading that superset as evidence the agent's write path also works was the error.

**The repair is a split this file already has.** `messageInputSchema` (write) uses `plainPayloadSchema`;
`messageRowSchema` (read) uses `plainPayloadSchemaWithToolCalls`. **`review` is the only message type
pointing both unions at the same schema** (`threads-schema.ts:213-231`) — one omission that causes this
finding *and* F66.

## F66 — Does `.optional()` let an old `artifactRef.kind` keep parsing? **Executed: NO. It rejects it.**

```
RESPELLED_optional {kind:"text_diff"}        -> REJECTED
RESPELLED_optional {kind:"visual_comparison"} -> REJECTED
RESPELLED_optional {absent}                   -> ACCEPTED
```

`z.enum(ARTIFACT_KINDS).optional()` tolerates an **absent** key, never a **present, non-member** value.
Revision 8's "respelled to `ArtifactKind`, optional on read, so an existing row carrying `text_diff` still
parses" is a category error: the r3 BLK-4 rule concerns *adding optional fields*, not *narrowing a closed
enum*.

**Blast radius, verified.** All three seeded reviews carry pre-consolidation values —
`conversations.ts:419` `visual_comparison`, `:603` `text_diff`, `:772` `text_diff` — and `rowToMessage`
(`threads.ts:593-596`) does a **throwing** `messageRowSchema.parse` with no `safeParse` and no fallback;
the file's comment at `:578-582` says it fails loudly by design. Both union arms would fail, so **listing
any thread containing a demo review throws**, taking out §6.1 Run A step 3 and the AC8 entry point.

Fix: strict on the write arm, `z.string().optional()` on the read arm. The value is never trusted anyway —
the loader reads the real kind off the artifact row, which is why carrying a second copy in the payload was
the bug in the first place.

## F67 — Do the canvases fabricate only when a payload fails its guard? **NO. Five fabricate on the success path.**

Revision 6 recorded the `if (!isXPayload(p)) return FIXTURE` fallbacks and stopped there. **The guard was
read; the mapper on the other side of it was not.** Reading all nine mappers:

| file | site | invented on a payload that PASSED its guard |
|---|---|---|
| `ReviewBrowserPreview.tsx` | `479-500` | `navLinks: ["Product","Pricing","Docs","Changelog"]`; `tiers: [{name:"Solo", price:"$19", cadence:"/mo", cta:"Get started", featured:true}]`; `previewBody` dumped into **both** `subhead` and `footerNote` and rendered as text |
| `ReviewVisualDiff.tsx` | `415-436` | `title: "Onboarding · Create account"`, `tool: "figma"`; `:429` coerces any region id outside `["cta","email","hero"]` to `"cta"` — the demo's own `r1`/`r2` both become `cta` |
| `ReviewRenderedInContext.tsx` | `535-552` | `tool: "mailchimp"`, `senderEmail: "hello@example.com"` |
| `ReviewMetricsMoved.tsx` | `528-535` | `provenance.tool: "quickbooks"` on every figure |
| `ReviewActionOperation.tsx` | `453-465` | `tool: "stripe"` |

`ReviewOutcomeSummary` has **no mapper and no fixture** — it reads the payload directly (`:357-359`,
falling back to `{}`), and `grep -c FIXTURE` on it returns `0`. `ReviewCodeDiff`, `ReviewFieldChangeSet`
and `ReviewBatch` map without inventing.

So the demo world's own pricing preview — payload `{url, title, previewBody}` at `conversations.ts:516-527`
— renders a **`Solo` tier at `$19 /mo`** that exists nowhere in the data. AC9's sentence *"A canvas that
silently substitutes a fabricated demo fails this"* is failed **on the success path**, and this package is
what makes that path reachable for an agent's real work.

## F68 — Is `action_operation` producible by BA2's push-back loop? **NO. It requires money.**

`ActionOperationPayload` (`review-artifact.ts:88-101`) requires
`amountWire: {currency: string; units: number; formatted: string}`, and the runtime guard enforces it:
`ReviewActionOperation.tsx:441-451` returns false without `isString(payload.amountWire.formatted)`.

A clearance for *"run this command"* or *"write this file"* — the actions the interview names — has no
currency, no units and no formatted amount. An agent could satisfy this canvas **only by inventing a
monetary amount**, at the exact moment a human is authorising something consequential. Revision 8's claim
that this is "BA2's own canvas" is wrong.

`outcome_summary` fits without strain and is already proven: `achieved` is what the agent did,
`doneConditions` what remains, and `needsYou[{category, severity, detail, jumpLabel}]` **is** "this action
needs a human".

**And BA2 was about to remove this canvas's only mitigation.** `mapActionPayload:453-455` hardcodes
`tool: "stripe"`, and the file's `@lore AL7 CRITICAL-3` (`:468-477`) records `ProposedCallArgsPanel` as the
fix for *"the approver saw fake Stripe ids/amount, not the agent's real call"* — which §2.11 deletes with
the proposed-call machinery. F67's mapper fix removes the fabrication **at source**, which is what makes
the panel's deletion safe; the two must land in the same task, and T4e now says so.

## F69 — Non-blocking findings, verified

- **`ReviewOutcomeSummary` has no fixture** (`grep -c FIXTURE` → 0; falls back to `{} as
  Partial<OutcomeSummaryPayload>` at `:357-359`). "Nine fixture constants" was eight, and the §6.2
  per-canvas pair would have been **vacuous** for this one.
- **`ReviewRenderedInContext.tsx:63` is `export const FIXTURE`** and `stories.tsx:10` imports it, so
  "delete the constants" and "stories keep their sample data" collide on one file. The story inlines a
  copy; the production export goes.
- **`ReviewCodeDiff` uses `CODE_DIFF_FIXTURE` three times** (`:629` default `initialExpandedPath`, `:633`
  `payload ?? CODE_DIFF_FIXTURE`, `:807`), not once.
- **`part.ts:266-282` is a live reader of the old vocabulary** and was missing from T4d.
  `ARTIFACT_KIND_LABEL` is `Partial<Record<string, string>>`, so `npm run check` catches the
  `ref.kind === "text_diff"` comparison but **not** the label map — every label would silently degrade to
  "Artifact".
- **`ComposedReviewSubject.prompt` is required** (`review-composition.ts:109`) and was absent from
  §2.8.1 A1's table.
- **The `work.get(db,"artifact",id)` at `routes/reviews.ts:146` is inside the branch §2.11 deletes**, so
  "the call it already makes" will not exist on the surviving path.
- **`@hyperidle/tool-handlers` cannot import core-ui** — its dependencies are `db`, `domain-model`,
  `harness-protocol`, `zod` (`package.json:13-18`).
- **The migration is `0065_team_action_rules.sql`** — main took 0061–0064 during the rebase onto
  `eaaa74de8`.

---

# Revision 10 — the ruling-14 sweep

## F70 — Does anything else in the specified design fabricate content in production code? **One more. `ReviewOutcomeSummary`.**

Ruling 14 / `.claude/rules/typescript.md`: production code may not carry fabricated content as a fallback,
a placeholder or a convenience; prefilling the database with demo rows is fine. **The line is code versus
data.** This is the enumeration, file by file, across every production file the design touches.

### The violation

`ReviewOutcomeSummary.tsx:368-374` — the guard-failure path feeds the view three values it does not have:

| written | invented |
|---|---|
| `tokens={payload.tokens ?? 0}` | a token count of **0** where there is no measurement. Indistinguishable from a real zero |
| `standing={payload.standing ?? "Awaiting"}` | a **review state**, which drives the blocking indicator |
| `achieved={payload.achieved ?? artifact.title}` | the artifact's title standing in for **the agent's own claim about what it achieved** — it reads like the agent's sentence and is not |

`agentName ?? ""`, `agentInitials ?? ""`, `reviewerName ?? ""`, `tools ?? []`, `doneConditions ?? []`,
`needsYou ?? []` on the same call are honest empties and stay.

**Why revision 9 missed it.** It ran `grep -c FIXTURE` on the file, got `0`, and concluded *"nothing was
ever fabricated there"* — **testing for the shape of the defect (a constant named `FIXTURE`) instead of
the property the rule names (a value the code does not have)**. No `FIXTURE` grep will ever find a
`?? 0`. Retracted in §2.8.2 D and in the §2.8.2 C table. This is the fourth time in this package that a
claim was made from a proxy rather than from the thing itself.

### Two more the sweep names so they are not missed

- **`ReviewActionOperation.tsx:49` is `const REFUND`, not `FIXTURE`**, and its guard-failure branch
  returns it (`:533-535`). Seven files carry a `FIXTURE`-named constant; this is the eighth and a grep for
  `FIXTURE` skips it, leaving the Stripe refund in shipping code.
- **`routes/reviews.ts:164` — `kind: artifactRow?.kind ?? "action_operation"`**, a fabricated artifact
  kind. It is inside the proposed-call branch §2.11 deletes, so it goes with that branch; recorded so the
  refactor does not carry it onto the surviving early-return path.

### Clean — enumerated, not assumed

| checked | result |
|---|---|
| ~~all nine canvas mappers~~ | **WRONG — see F71.** All three certified clean here fabricate; `ReviewCodeDiff` and `ReviewFieldChangeSet` inside the mapper this row says it read. The sweep enumerated mappers, not rendered output |
| `ToolLogo.tsx:74-77` | **does not invent a vendor.** An unknown tool gets a neutral monogram built from the tool string and labelled with it. Load-bearing: §2.8.2 D routes the mappers to `artifact.tool`, so a brand fallback here would have moved the lie one layer down instead of removing it |
| `CanvasSourceHeader.tsx` | renders `app`/`record` as given; no substitution |
| `ReviewUnknownCanvas.tsx:11-40` | renders `JSON.stringify(artifact.payload)` — the actual payload. Nothing invented; only the sentence was wrong (NB-3) |
| the composed frame, §2.8.1 A1 | no invented default: `tokens: ""`, `tools: []`, `prompt: ""`, `betTitle` empty when there is no bet, `authorName` from the real sender |
| `part.ts:280`, `:538` | `?? "Artifact"` and `?? "Tool call"` are generic type nouns — a thing called "Artifact" is one. Not violations |
| `ReviewComposition.tsx` | no other hardcoded content; T4c's builder has already removed the checkout strings |
| `ReviewPage.tsx`, `open-handler.ts`, `PartList.tsx`, `ReviewRequestPart.tsx`, `ReviewResolvedPart.tsx`, `review-composition.ts` | clean |

### Seeding, under the same ruling

Ruling 14 makes demo **rows** explicitly allowed, which settles §9's open question. Four kinds have no
data anywhere: `field_change_set`, `rendered_in_context`, `batch`, `action_operation`. T4d seeds all four
as payload literals in `demo-world/conversations.ts` — data, no code — so all nine canvases render real
content and §6.1 Run A covers all nine.

Seeding `action_operation` proves the **renderer** and does not disturb F68: BA2's own push-back flow
still cannot produce one, because a command clearance has no `amountWire`. A demo company having a refund
to approve is honest demo data; BA2 inventing an amount in code would be the prohibited thing.

---

# Revision 11 — the sweep at the rendered-output layer

## F71 — What actually reaches the DOM that the payload did not supply? **All nine canvases invent.**

**Method — deliberately not reading code first.** Six previous passes verified at whatever layer was
open: the type (F45), the fixture (F42), the schema declaration (F65), the guard (revision 6), the mapper
(F67), the constant name (F70). The layers are **guard → mapper → view → rendered output**, and the
fabrication has been at a different one each time. So: render each of the nine canvases with a payload
whose every supplied string is prefixed `Zx`, dump `container.textContent`, and list every word-like
token that is not a sentinel. Then work back to source. Executed in the `core-ui` vitest project; probe
deleted after the run.

**Raw result, verbatim from the run:**

| canvas | foreign tokens in the DOM |
|---|---|
| `outcome_summary` | `0 tok` |
| `field_change_set` | `record·`, `fields changed·`, `needs you`, `unchanged`, `approved`, `Approve all fields` |
| `action_operation` | `Blast radius`, `reversibility`, `What this touches`, `Irreversible once submitted — confirm to proceed.`, `Reject`, **`Approve refund`** |
| `rendered_in_context` | `Opened`, `render`, `desktop`, `mobile`, **`HyperIdle`**, `flag`, `unverified claim`, `send plan`, `exclusions`, `Send plan`, `Approve send`, `Request changes` |
| `metrics_moved` | **`Recognized revenue closed at … up … from April. The period ties to bank; biggest open item is a $0.00 wire with no source.`**, `Apr`, `May`, `Roll-forward reconciliation`, `Account`, `Opening`, `Activity`, `Closing`, `bank`, `Exceptions by amount` |
| `visual_diff` | **`Create your account`**, **`Start your 14-day trial — no card required.`**, **`you@company.com`**, `Password`, **`Create account`**, `F` (figma mark), `Build`, `Differing regions` |
| `code_diff` | `All checks passed`, **`coverage +0.4%`**, `files changed · relevance-ranked`, `Collapse`, `Logic`, **`Minor`**, **`generated & formatting — safe to skip`** |
| `batch` | `NEED YOU`, `tickets ·`, `need you`, `triaged`, `auto-resolved`, `drafted`, **`Median first response would drop → once the N drafts send.`**, `flagged · routine`, `Approve all except flagged`, **`neutral`**, **`CHURN THREAT`**, **`No reply drafted — policy routes this straight to you.`**, **`Held for your review — why`**, `Take over`, `Hold` |
| `browser_preview` | `Product`, `Pricing`, `Docs`, `Changelog`, `Get started`, `Preview`, **`Solo`**, **`Founder`**, **`$19`**, `/mo`, `Approve`, `Request changes` |

Bold = a value a reader would take for real data. The rest is chrome — region labels and buttons that
name a region without asserting a value. **That distinction is the rule** (§2.8.2 D), and it is why a
string list is not the specification.

### Three that neither critique named, found only because the DOM was read

| site | invented |
|---|---|
| `ReviewCodeDiff.tsx:335-336` | **`coverage +0.4%`** — a hardcoded test-coverage figure on every diff. F70 certified this file clean |
| `ReviewCodeDiff.tsx:751-753` | `Minor / generated & formatting — safe to skip`. The payload's own `triviaSummary` renders separately, so this is additive invention |
| `ReviewBrowserPreview.tsx:233` | a **second** tier, `Founder`, hardcoded in the *view* — beyond the mapper's `Solo`. The DOM read `SoloFounder$19/mo` |
| `ReviewActionOperation.tsx` | an **`Approve refund`** button on an operation that is not a refund |

### `outcome_summary` — the guard-skipped optional

The sentinel payload **omitted `tokens`** and the canvas rendered `0 tok`. `isOutcomeSummaryPayload`
(`:342-353`) checks `agentName`, `agentInitials`, `achieved`, `tools`, `doneConditions`, `needsYou`,
`standing` — **not `tokens`**. So this is the **guard-passing** path, not the guard-failure path revision
10 assigned it to.

And the remedy revision 10 specified is unsafe: `TokensChip` takes `tokens: number` (`:73`), so deleting
`?? 0` renders `undefined tok`. **A guard-skipped optional needs conditional rendering, not a different
default.** `reviewerName` is the other guard-skipped field; its `?? ""` is honest and stays.

### The method's own blind spot, stated because it bounds this result

The sweep reads the **default** DOM. Two real fabrications were **not** in the dump and were found only by
working back to source afterwards:

- `ReviewFieldChangeSet.tsx:212` — `<ToolLogo tool="salesforce">` on every provenance line, behind the
  per-field `expanded` disclosure.
- `ReviewFieldChangeSet.tsx:335` — "Owner, Lead source, Probability, Type, Account, and N more were left
  as-is", behind the `showUnchanged` disclosure.

So **"rendered output" must mean every reachable state, not the first paint.** §6.2's assertion and §6.1
step 12 both now say to expand every disclosure.

### Two remedies are type changes, not subtraction

`ChangeSet.tool` is the literal `"salesforce"` (`ReviewFieldChangeSet.tsx:47`) and `BatchFixture.tool`
the literal `"zendesk"` (`ReviewBatch.tsx:60`). Sourcing them from `artifact.tool` widens both to
`string`. §2.8.2 D promised "subtraction"; this is two one-word type widenings on top of it.

## F72 — Can `visual_diff` be made honest by a mapper change? **No. Its payload has nothing to render.**

`MockScreen` (`ReviewVisualDiff.tsx:114-160`) is a hand-drawn fake product screen — "Create your
account", "Start your 14-day trial — no card required.", an Email field placeholdered `you@company.com`,
a Password field, a "Create account" button. It is mounted unconditionally as **both** evidence panes:
`:250-251` (thumbnails), `:316-317` (side-by-side, via `RenderPane`), `:330,339` (overlay/swipe). A figma
mark is hardcoded at `:190` and `:320`. **Confirmed in the DOM** — the sweep's `visual_diff` row above.

`VisualDiffPayload` (`review-artifact.ts:137-145`) is `{before{label}, after{label},
diffRegions[{id,label}], overlayMode}` — **labels only, no images**. So removing the mapper's invented
`title` and `tool` leaves the panes exactly as fabricated as before, and there is no payload field to
fall back to.

This is the general problem at its extreme: the nine canvases were built against richer content than
their payload types declare, and `visual_diff` is where the un-derivable region is the *entire* evidence
surface. Architecture §2.8.2 E; founder decision at §9 question 10.
