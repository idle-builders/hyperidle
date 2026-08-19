# review — destroyer verdict (REVISED after founder rulings)

Supersedes `.pipeline/work/AU20/destroy/verdicts/review.md`. Same 21 rows, same no-sampling standard.

---

## What changed after the rulings

My headline call was wrong in the founder's direction and wrong in my own direction on the same
file: I killed the loop the founder wants finished (A1), and I kept the auto-review the founder
killed (A2). Row 11 flipped end-for-end — I said "keep subscriber 1, delete subscriber 2"; the
correct call is "delete subscriber 1 (A2), keep subscriber 2 (A1)".

**21 of 21 rows changed.** Nothing in this package is DELETE any more. The cuts this pass still
buys land outside the package (A2's gate, its risk-tier reader, seven port members, the demo
fixture) and in a relocation (the knowledge review-item factory leaves).

### Methods

| # | Method | Old | New | Ruling |
|---|---|---|---|---|
| 1 | `findProposedCall` | DELETE | KEEP | A1 FINISH — it is the reader the verdict endpoint and the review page both call. |
| 2 | `resolveReengagementRequest` | DELETE | FINISH | A1 — must additionally bake the approved call, else session 2 can never be grant-bearing. |
| 3 | `recordProposedCall` | DELETE | FINISH | A1 — must stop hardcoding `reversibility:"irreversible"` and must mint the review anchor. |
| 4 | `transitionProposedCall` (consumed overload) | DELETE | KEEP | A1 — the CAS-consume is correct as written. |
| 5 | `transitionProposedCall` (non-consumed overload) | DELETE | KEEP | A1 — the granted/held/outcome signature is correct as written. |
| 6 | `transitionProposedCall` (implementation) | DELETE | FINISH | A1 — its granted branch swallows the bake failure; that swallow is the loop's silent-death path. |
| 7 | `handleUnconsumedGrantOnSessionEnd` | DELETE | KEEP | A1 — the liveness net becomes live the moment grants exist. |
| 8 | `reengageOnAdmissionFailure` | DELETE | KEEP | A1 — same behavior, second trigger point; its producer returns. |
| 9 | `attentionReviewReasoningMarker` | KEEP | MERGE | Not a ruling — re-check of "should this service exist". Belongs in `@hyperidle/knowledge`. |
| 10 | `createReviewItem` | KEEP | MERGE | Same re-check. `review` becomes one feature, not two. |
| 11 | `registerReviewSubscriptions` | SIMPLIFY (keep sub 1, kill sub 2) | SIMPLIFY (kill sub 1, keep sub 2) | A2 kills the risk-tier session-review creator; A1 keeps the liveness net. Exact inversion. |

### Types / DI ports

| Declaration | Old | New | Ruling |
|---|---|---|---|
| `ReviewAgentWorkIntentInput` | DELETE | KEEP | A1 — its producer returns. |
| `ReviewPorts` | SIMPLIFY (keep work/conversation/users/org, drop the 7 reengagement deps) | SIMPLIFY (keep the reengagement deps, drop the A2 routing deps) | A1 + A2 — exact inversion of which half survives. |
| `ProposedCallQuery` | DELETE | KEEP | A1. |
| `ProposedCallView` | DELETE | KEEP | A1. |
| `ReengagementResolverDeps` | DELETE | SIMPLIFY | A1 — survives, but its five optional members must become required. |
| `BakedReengagementRequest` | DELETE | FINISH | A1 — must carry the approved call. |
| `ProposedCallTransition` | DELETE | KEEP | A1. |
| `CreateReviewItemInput` | KEEP | MERGE | Moves with the factory. |
| `CreateReviewItemResult` | KEEP | MERGE | Moves with the factory. |
| `ReengagementSourceUnavailableError` (class) | DELETE | SIMPLIFY | A1 — survives in substance, but as a returned result, not a thrown error every caller swallows. |

### Ruling 3 — knowledge ritual

Nothing of that shape is left inside `review`: the practice-meeting sub-module already relocated to
`@hyperidle/knowledge`, and only `@lore` comments referencing the move remain
(`layers/core-api/review/src/index.ts:10-12`, `ports.ts:11-12,83-85`). **The relocated machinery is
still core and is `PLUGIN` under Ruling 3** — it is a ritual about the work, not the machinery of
working. It lives across `layers/core-api/knowledge/src/index.ts`,
`layers/core-api/src/routes/knowledge.ts`, `layers/core-api/routine/src/routine-scheduler.ts` +
`ports.ts`, `layers/core-api/src/services/routine-scheduler-bindings.ts`, and role/event vocabulary
in `framework/domain-model/src/agent-roles.ts` + `events.ts`. Out of my rows — flagging it so it
lands in whoever owns `knowledge`/`routine`.

The **attention-engine knowledge review** (rows 9/10's real caller,
`layers/core-api/knowledge/src/attention-service.ts:295-322`) is NOT ritual and NOT A2: it is the
knowledge fabric noticing an item has drifted and putting a non-blocking item in a human's inbox.
That is the machinery of keeping shared knowledge true. It stays core — it just stops living in
`review`.

### Ruling 1 — shared backend

My first wave did not rest this service's verdicts on a single-user premise (I killed the loop for
never having run, not for having one user), so no row moves on Ruling 1 alone. It does harden two
things: the AD1 human-routing code I am now deleting under A2 was the only multi-human routing in
this package, and **that routing logic must not be lost** — it moves to wherever the approval review
item is created (see W3 below). Approve→act between several humans and their agents is exactly the
shared-backend case, and the acting human's identity for the verdict must come from OIDC, not from
the participant list `authorizeWrite` reads today (`layers/core-api/src/routes/threads.ts:1651-1656`).

---

### What must be wired for approve→act to work

Nine pieces. Today **none** of them is connected, so the honest description of the current product
is not "approval is broken" — it is "there is no approval, and agents execute irreversible tools
directly", because with no `sessionWorkflow` the router at
`layers/agent-orchestration/tool-handlers/src/tool-registry.ts:133` is skipped entirely and
`def.handler` runs (line 197).

**W1 — the ignition switch. Nothing ever constructs a `RegistrySessionWorkflow`.**
`options.sessionWorkflow` is read at `tool-registry.ts:84` and threaded through
`layers/agent-orchestration/run-orchestration/src/provisioner.ts:1239` and `:1503`,
`run-orchestration/src/runtime.ts:456`, `run-orchestration/src/contracts.ts:214`, and
`layers/agent-orchestration/src/services/run-orchestration-composition.ts:333`. The only durable
construction path never sets it — `start-runtime.ts:166-173` calls
`runSession(deps, { mode:"durable", request, sandboxBasePath, modelTier, resolvedModel, completion:"admit" })`.
Every other reference in `layers/`, `framework/`, `applications/`, `tools/` is a type declaration, a
passthrough, or a test. The `ProposedCallWorkflowPort` behind it **is** correctly wired
(`run-orchestration-composition.ts:226-234, 323-337` over `CoreApiPort.review`) — the port is live,
the switch is absent.

**W2 — the capture anchors cannot exist at provision time.** `RegistrySessionWorkflow` demands
`reviewMessageId` + `subjectThreadId` + `artifactId` up front
(`framework/tool-protocol/src/tool.ts:160-168`), but those only come into being *during* the session
(`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1575` creates the artifact,
`:740` posts the `type:"review"` message). `rg -a reviewMessageId` across all four roots finds zero
production producers; only the AL7 integration tests hand-seed them
(`layers/core-api/src/__tests__/AL7-proposed-call-capture.integration.test.ts:150-158`). This is a
design defect, not a missing line: the anchor must be minted **at capture time** inside
`recordProposedCall`, and the session-time workflow must shrink to the dial (which tools this human
asked to be asked about) plus the session role.

**W3 — the human is never told.** On capture the router returns `AWAITING_REVIEW` to the agent and
aborts session 1 (`tool-registry.ts:105-119` and `:177-191`), and that is all that happens. No
review message, no `items` row, no recipients. Needs: create the review message + item at capture,
and reuse the human-routing that A2's dying subscriber holds today
(`layers/core-api/review/src/session-review-creator.ts:86-107` — `org.resolveReviewRecipients`,
falling back to all humans, merged into thread participants). The `items` row is what makes the
existing policy engine work — it already decides push vs queue vs auto-resolve from riskTier and the
agent's approval rate (`layers/core-api/policy/src/policy-engine.ts:119-150`).

**W4 — approve goes to the endpoint that throws the decision away.** The UI's approve button calls
`handleSubmitVerdict` (`layers/core-ui/src/pages/review/ReviewPage.tsx:173-195`) →
`postVerdictHostMessage` (`layers/core-ui/src/services/host-threads.ts:132-151`) →
`POST /api/threads/:threadId/messages` with `type:"verdict"`. That handler emits `thread_resolved`
and then literally discards the decision:

```ts
// layers/core-api/src/routes/threads.ts:1558-1561
const decision = input.payload.decision;
// AL7 trust-first: approve verdict handled by proposed-call workflow (Task 8).
// Tailored grant composed + proposed_call_granted emitted there.
void decision; // will be used by Task 8 implementation
```

The endpoint that *does* mint the grant — `POST /api/threads/:threadId/messages/:messageId/verdict`
(`threads.ts:1619-1736`, calling `transitionProposedCall({to:"granted"})` at `:1680-1718` and
emitting `proposed_call_granted` at `:1720-1728`) — has **zero clients**; `rg -a` over the repo finds
no caller outside its own definition. Fix: one of the two paths, not both. Either the message
handler's verdict branch calls the same granted-transition block, or the UI calls the verdict
endpoint. Today it is neither, which is the single line that makes approve→act impossible.

**W5 — session 2 is never grant-bearing, so a minted grant could never be consumed anyway.**
Nothing in production ever constructs `approvedCall` — `rg -a approvedCall` returns only its two
readers (`tool-registry.ts:139-144`, `framework/tool-protocol/src/tool.ts:395`) and the type
(`framework/harness-protocol/src/harness/harness-adapter.ts:35-40`). The reengagement intent the
granted transition records (`proposed-call-workflow.ts:583-595`) drains into an ordinary session:
`runtime.ts:432-470` builds `provisionParams` from the baked request and copies
`options.sessionWorkflow`, which is `undefined`. Needs: `BakedReengagementRequest` carries the
approved call (`toolId`/`args`/`argPinned`/`identityHash`, all already on the `tailoredGrants` row),
and the drain turns it into
`sessionWorkflow: { sessionRole:"grant-bearing", routeToReview:["irreversible"], approvedCall, ...anchors }`.

**W6 — the two bake failures are swallowed, and that is how the finished loop will fail silently.**
`proposed-call-workflow.ts:579-581` and `:705-707` both `catch { bakedRequest = undefined; }`. With
W5 done, an undefined bake means the reengagement session runs with no approved call → the grant is
never consumed → the liveness net burns `retryCount` and then writes a `failed` outcome
(`applyLivenessRetry`, `:718-730`). The human sees "approved" and then, two sessions later, "did not
execute". Surface the failure at approve time instead.

**W7 — the classifier must become the human's dial, not a fail-closed default.**
`recordProposedCall` hardcodes `reversibility: "irreversible"` (`proposed-call-workflow.ts:419`) and
`classifyReversibility` returns `"irreversible"` for any unsignalled tool
(`framework/tool-protocol/src/tool.ts:324-327`), and the unknown-tool branch routes to review before
it even knows the tool exists (`tool-registry.ts:102-120`). That is the gate-by-default classifier
ETHOS forbids, and it is the difference between finishing A1 and shipping a general approval gate.
The dial already has a home: every tool is seeded into `settings` with its `reversibility`
(`layers/core-api/settings/src/plugin-configuration.ts:760-771`), and exactly one builtin tool
declares itself irreversible (`framework/tool-protocol/src/builtin-tool-catalog.ts:171-176`,
`commit_file`). Default must be "no review"; review happens only for a tool a human marked.

**W8 — the harness-side allowlist carrier is test-only.** `composeWorkflowAllowDeny`
(`framework/tool-protocol/src/tool.ts:383-410`) has no production caller — confirmed with `rg -a`;
only `layers/core-api/src/__tests__/AL7-classifier.test.ts` uses it. Without it the per-harness
native allow/deny lists never learn about the grant, so a subscription-CLI harness can run its own
copy of the tool without passing the registry router. Not required for a builtin-harness loop; is
required before claiming the loop holds across harnesses.

**W9 — the demo fixture sits in the live route.** `FIXTURE_REVIEW` / `"rev-1"`
(`layers/core-api/src/routes/reviews.ts:36-91`) short-circuits the real loader with a hand-written
story. It must go before this feature is real. (Unchanged from the first wave — still DELETE.)

**Where the line is.** Finishing A1 licenses exactly this: *a human marked a tool "ask me first", so
when an agent calls it the call is staged, the human approves, and the agent gets a one-shot,
scope-tuple-keyed permission to do that one thing.* It does not license: routing unknown tools to
review, defaulting unsignalled tools to irreversible, deriving "needs review" from a risk tier, or
any gate justified by "irreversible". W7 is where that line is enforced in code — if W7 is skipped,
finishing A1 ships the thing ETHOS forbids.

---

## Should this service exist?

**KEEP AS the proposed-call approval Service — one feature, three owned tables.** With A1 finished,
`review` owns the only durable state in the approve→act loop (`proposedCalls`, `tailoredGrants`,
`operationOutcomes`), plus the state machine over it and the two liveness triggers. That is a
coherent Service with a real product purpose: a human approves a specific agent action, and the
agent gets to do it. It is not a wrapper, not a port bag, not observability.

But it should be **one** feature, not two. After A2's subscriber dies, the leftover
`createReviewItem` + `attentionReviewReasoningMarker` have nothing to do with proposed calls: their
only real caller is the knowledge attention engine's threshold crossing
(`layers/core-api/knowledge/src/attention-service.ts:295-322`), plus a knowledge-action failure flag
(`layers/core-api/src/services/agent-run-admission-reactions.ts:59-81`) and the two composition sites
that curry them (`layers/core-api/src/routes/knowledge.ts:296-311`,
`layers/core-api/src/services/routine-scheduler-bindings.ts:61-76`). Move them into
`@hyperidle/knowledge`, which already owns both callers and both tables' domain. That deletes the
`KnowledgeReviewWriter` port, the currying factory that exists only to satisfy its 3-arg shape, and
the `review → knowledge` fan-in entirely.

Net: `review` survives, smaller and single-purpose. The package boundary earns itself for the first
time.

## If written today, from scratch

The loop, at MVP tier, is six functions and one dial:

- `recordProposedCall(db, input)` — capture the staged call **and mint its review anchor** (artifact
  + review message + item), taking the classified reversibility as input rather than hardcoding it
- `findProposedCall(db, query)` — the parameterized reader
- `transitionProposedCall(db, transition, ports)` — `held | granted | consumed | outcome-recorded`
- `resolveReengagementRequest(db, id, deps)` — bake the grant-bearing session's request, **including
  the approved call**
- `handleUnconsumedGrantOnSessionEnd` — the crash/no-show net
- `reengageOnAdmissionFailure` — the same net, pre-handoff trigger
- the dial: a per-tool "ask me first" flag a human sets, replacing `classifyReversibility`'s
  fail-closed default

Everything else in the current package either moves out (the knowledge factory) or dies with A2.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 0 |
| PLUGIN | 0 (in-package; see Ruling 3 note for the out-of-package pointer) |
| FINISH | 4 |
| MERGE | 4 |
| SIMPLIFY | 4 |
| KEEP | 9 |

Surface: 11 methods → 9 in this package (2 relocate). **0% cut inside the package.** Say it plainly:
this pass cuts nothing here. The cuts it does buy are elsewhere — A2's gate and subscriber, the
`work` risk-tier reader and its table, seven `ReviewPorts` members, the `KnowledgeReviewWriter` port,
the `"rev-1"` fixture, and ~9 test files that assert on A2's behavior.

## Feature-level kills

**A2 — automatic review after risky work: whole-feature DELETE.** Confirmed with evidence: the gate
is `riskTier !== "medium" && riskTier !== "high" → return`
(`layers/core-api/review/src/session-review-creator.ts:64-65`), reading
`work.getRiskTierByTaskId` → `task_planning_signals`
(`layers/core-api/work/src/task-planning-signals.ts:21-25`). `rg -a` over all four roots finds
**zero production writers** of that table — every `insert(taskPlanningSignals)` is a test
(`layers/core-api/work/src/__tests__/task-planning-signals.integration.test.ts`,
`layers/core-api/src/__tests__/session-review-creator.integration.test.ts`,
`AD1-session-review-routing.integration.test.ts`, `handoff-to.integration.test.ts`). The gate always
returns early. Dies with it: subscriber 1 of `registerReviewSubscriptions`, `getRiskTierByTaskId` and
its `ReviewPorts.work` member, the `task_planning_signals` table and `work`'s reader, the
`ReviewPorts` `users`/`org`/`conversation.updateThread`/`conversation.getThreadById`/
`work.updateTaskById` members, and the tests above.

**Salvage from A2 before it goes:** the human-routing block
(`session-review-creator.ts:86-107`) is the only code in the repo that resolves *which humans* should
see a review. Under Ruling 1 that is core. Move it to the approval review item's creation (W3), then
delete the subscriber.

**The `"rev-1"` demo fixture — DELETE.** `FIXTURE_REVIEW` at `layers/core-api/src/routes/reviews.ts:36-81`
is a hand-written story served by a production route. Unchanged from the first wave.

**Not killed, contrary to the first wave:** the three proposed-call write routes
(`reviews.ts:187-209`), the seam ops (`framework/api-contract/src/core-api-port.ts:726-730` and their
composition), the workflow router branches, `ProposedCallWorkflowPort`, the three tables, and the
`ProposedCallGrantedEvent` / `proposed_call_executed` event types (also protected by Ruling 2 — the
defect there is missing emission, not a missing subscriber: `proposed_call_executed` is declared at
`framework/domain-model/src/events.ts:554-563`, cased in the dispatcher at
`layers/core-api/src/observability/dispatcher.ts:438`, and emitted nowhere).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `findProposedCall` | UI:GET /api/reviews/:reviewMessageId, UI:POST /api/threads/:threadId/messages/:messageId/verdict, INTERNAL | KEEP | The reader both the review page and the verdict endpoint need; correct as written. |
| 2 | `resolveReengagementRequest` | INTERNAL (granted transition, applyLivenessRetry) | FINISH | Must also bake the approved call from the grant row — without it session 2 is never grant-bearing (W5). |
| 3 | `recordProposedCall` | UI:POST /api/reviews/proposed-calls (seam: `CoreApiPort.review.captureProposedCall`) | FINISH | Must mint the review anchor it currently assumes exists (W2) and take the classified reversibility instead of hardcoding `"irreversible"` at line 419 (W7). |
| 4 | `transitionProposedCall` (consumed overload) | UI:POST /api/reviews/proposed-calls/consume (seam) | KEEP | The CAS claim on `(taskScope, agentScope, approvedToolId, consumed=false)` is exactly right; one-shot, no double-execute. |
| 5 | `transitionProposedCall` (non-consumed overload) | UI:POST /api/threads/…/verdict, UI:POST /api/reviews/proposed-calls/:id/outcome | KEEP | Signature is honest about the four transitions; no change needed. |
| 6 | `transitionProposedCall` (implementation) | same as 4-5 | FINISH | The granted branch's `catch { bakedRequest = undefined }` (lines 579-581) turns a failed approve into a silent two-session-later failure (W6). |
| 7 | `handleUnconsumedGrantOnSessionEnd` | EVENT:session_ended (livenessHandler, `session-review-creator.ts:137-157`) | KEEP | Crash/no-show net; becomes live the moment grants exist. Already wired at `service-bootstrap.ts:432-471`. |
| 8 | `reengageOnAdmissionFailure` | EVENT:agent_run_admission_failed (`agent-run-admission-reactions.ts:113-126`) | KEEP | Same behavior, pre-handoff trigger; its producer returns with A1. |
| 9 | `attentionReviewReasoningMarker` | UI:POST /api/knowledge/:id/recompute-attention, AGENT:score_attention, SCHED:routine-scheduler | MERGE | Fold into `@hyperidle/knowledge` beside `attention-service.ts`, its only real consumer — the LIKE-probe idempotency contract is knowledge's, not review's. |
| 10 | `createReviewItem` | AGENT:score_attention, UI:recompute-attention, SCHED:routine-scheduler, EVENT:agent_run_admission_failed | MERGE | Fold into `@hyperidle/knowledge`; kills the `KnowledgeReviewWriter` port and the currying factory that exists only to satisfy its 3-arg shape. |
| 11 | `registerReviewSubscriptions` | BOOTSTRAP (`service-bootstrap.ts:432`) | SIMPLIFY | Delete subscriber 1 (A2's risk-tier session-review creator) and its five routing ports; keep subscriber 2 (the liveness net) and its seven bake ports. Exact inverse of the first wave. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReviewAgentWorkIntentInput` | KEEP | The recorder contract for the `reengagement` intent the granted transition and the liveness net both produce. |
| `ReviewPorts` | SIMPLIFY | KEEP `intentRecorder`, `requireRunnableAgent`, `work.getTaskById`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`. DELETE `work.getRiskTierByTaskId`, `work.updateTaskById`, `conversation.updateThread`, `conversation.getThreadById`, `users.*`, `org.*` — all A2's, except `org.resolveReviewRecipients` which is salvaged to the new capture path (W3), not deleted outright. `work.createItem` + `conversation.insertThread` leave with rows 9/10. |
| `ProposedCallQuery` | KEEP | Input of the live reader; the `by`-variant shape is the right extension point. |
| `ProposedCallView` | KEEP | Return of the live reader; the review page consumes exactly this shape. |
| `ReengagementResolverDeps` | SIMPLIFY | Survives as the resolver's deps, but make the five optional members (`getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread`) required — every production wiring site already supplies all five (`threads.ts:1705-1716`, `service-bootstrap.ts:449-467`), and optionality only buys a half-baked request that fails later. `optionalReengagementBakeDeps` (lines 232-246) dies with the optionality. |
| `BakedReengagementRequest` | FINISH | Must carry the approved call (`toolId`/`args`/`argPinned`/`identityHash`) so the drain can build a grant-bearing `sessionWorkflow` (W5). |
| `ProposedCallTransition` | KEEP | The discriminated union IS the state machine, and the state machine is the feature. |
| `CreateReviewItemInput` | MERGE | Moves to `@hyperidle/knowledge` with row 10. |
| `CreateReviewItemResult` | MERGE | Moves to `@hyperidle/knowledge` with row 10. |
| `ReengagementSourceUnavailableError` (class) | SIMPLIFY | Both call sites catch and discard it (lines 579-581, 705-707). Return a result type instead of throwing an error nobody handles — the discard is W6, the loop's silent-failure path. |

## Holes this leaves

1. **Automatic post-hoc review of risky agent work disappears entirely** (A2). Nothing observable
   changes — the gate never fired, because nothing ever wrote a risk tier. What genuinely goes is the
   *idea* that finishing a medium/high-risk task should produce a review item. If that idea is wanted
   later, it comes back as a human-set dial, not a tier classifier.
2. **The multi-human review routing must be moved, not deleted.** `org.resolveReviewRecipients` +
   the participant merge is the only "who should see this" logic in the repo. Under Ruling 1 it is
   core. If A2 is deleted carelessly, the finished A1 loop will mint approvals nobody is told about.
3. **Finishing A1 is nine wiring pieces, not one.** W1-W9 above. Any subset short of {W1, W2, W3, W4,
   W5} leaves approve→act still impossible; W6 and W7 decide whether the finished loop is honest;
   W8 decides whether it holds outside the builtin harness.
4. **Until W7 lands, the code in the repo is a gate-by-default classifier.** `recordProposedCall`'s
   hardcoded `"irreversible"`, `classifyReversibility`'s unsignalled default, and the unknown-tool
   branch all say "route it to a human unless proven safe". Switching on the loop before inverting
   that default ships the exact thing ETHOS forbids — the founder should treat W7 as a precondition
   of W1, not a follow-up.
5. **`review` keeps its three tables and its Service boundary.** The first wave's "package dies"
   conclusion is withdrawn. What does leave is the knowledge review-item factory and the
   `KnowledgeReviewWriter` port that exists only to shape it.
