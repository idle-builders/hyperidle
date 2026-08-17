# review — destroyer verdict

## Should this service exist?

**KILL THE SERVICE.** `review` is two unrelated features glued together:

1. **The AL7 proposed-call approval loop** (proposed-call-workflow.ts, ~800 lines, 8 of the 11 exported functions, all 3 owned tables). **It has never run in production.** The ignition switch — `sessionWorkflow` on a provisioned session — is never constructed anywhere in production code. Every reference in `layers/`, `framework/`, `applications/`, `tools/` is a type declaration or an optional passthrough (`provisioner.ts:1239/1503`, `runtime.ts:456`, `contracts.ts:214`, `run-orchestration-composition.ts:333`); the only real durable-run construction site (`start-runtime.ts:167`) never passes it. So `tool-registry.ts`'s workflow router (`wf = options.sessionWorkflow`, line 84) never fires, `captureProposedCall` is never called, and `proposedCalls`/`tailoredGrants`/`operationOutcomes` are written by exactly one function (`recordProposedCall`) whose only production caller is that dead branch. Every downstream consumer — the reengagement resolver, the grant/consume state machine, the liveness net, the admission-failure reengagement — operates on rows that cannot exist. Confirmed with `rg -a` across all four roots; the graph's doors for these functions are real routes wired to a dead client.
   It is also DELETE **by policy**, independent of reachability: its own comments say "classify reversibility → route irreversible to review" and "fail-closed treats unknowns as irreversible" (`tool-registry.ts:13,100-101`, `tool.ts:327` falls back to `"irreversible"`). That is precisely the reversible/irreversible gate-by-default classifier ETHOS §2 forbids. Approval machinery that exists "because irreversible" — this is its purest specimen, and it was never even switched on.

2. **Review-item creation** (review-item-factory.ts + session-review-creator.ts subscriber 1, ~200 lines). Live, real doors (`score_attention` agent tool, `POST /api/knowledge/:id/recompute-attention`, routine scheduler, session-end review routing to humans). This is genuine core value — humans reviewing agent work and knowledge is the collaboration surface, non-blocking, post-hoc, not a gate.

After the delete, `review` owns **zero tables** and stops being a SQL-owning Service. The two survivors are pure composition over `work`/`conversation`/`users`/`org` ports — they belong beside the other reaction files in `layers/core-api/src/services/` (pattern: `work-session-end-reactions.ts`). Route survivors there; delete the package.

Practice-meeting check: relocated to `@hyperidle/knowledge`; nothing live remains in `review` (only `@lore` comments referencing the move + one test fixture string). Clean.

## If written today, from scratch

Three functions, no package, no owned tables:

- `createReviewItem(deps)` — the knowledge/attention review-item factory (live, multi-door)
- `attentionReviewReasoningMarker(id)` — its idempotency contract with the attention engine
- one `session_ended` subscriber creating a review item for medium/high-risk task sessions and routing it to humans (AD1)

Nothing else. The approval state machine, if a real learning ever earns it, gets rebuilt small at that time — not preserved dormant.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 0 |
| SIMPLIFY | 1 |
| KEEP | 2 |

Surface: 11 methods → 3 methods (73% cut). Plus: 1 class DELETE; 9 type declarations → 6 DELETE, 1 SIMPLIFY, 2 KEEP. Net effect: the package itself dies; survivors relocate.

## Feature-level kills

**The AL7 proposed-call approval loop — whole-feature DELETE.** Kills, beyond this package:

- **Tables**: `proposedCalls`, `tailoredGrants`, `operationOutcomes` (`framework/db/src/schema.ts`) — only this package touches them.
- **Routes**: `POST /api/reviews/proposed-calls`, `POST /api/reviews/proposed-calls/consume`, `POST /api/reviews/proposed-calls/:id/outcome` (`layers/core-api/src/routes/reviews.ts:187-209`); the proposed-call nesting inside `GET /api/reviews/:reviewMessageId` (lines 101-166 — `pcView` is always undefined in production today, so deleting it changes zero observed behavior); the proposed-call branch of the verdict handler (`layers/core-api/src/routes/threads.ts:1619+` from `findProposedCall` onward — verdict survives as a plain thread-resolution act). Also the `"rev-1"` demo fixture (`FIXTURE_REVIEW`, reviews.ts:36-81) — a design stub living inside a production route; dies too.
- **Dispatch**: both workflow-router branches in `tool-registry.ts` (lines 100-119, 131-193); `ProposedCallWorkflowPort`, `classifyReversibility`, the `reversibility` field and the allow/routeToReview partition fn (`framework/tool-protocol/src/tool.ts:304-405`); `SessionWorkflow` (`framework/harness-protocol/src/harness/harness-adapter.ts`) and every `sessionWorkflow` passthrough (provisioner, runtime, contracts, harness-port).
- **Seam**: the three `review.*` ops on `CoreApiPort` (`framework/api-contract/src/core-api-port.ts:726-730`) + their wiring (`core-api-port-composition.ts:798-822`, `run-orchestration-composition.ts:231-233`).
- **Events/model**: `ProposedCallGrantedEvent`, `proposed_call_executed`, `framework/domain-model/src/proposed-call.ts` (`REVERSIBILITY` etc.), `AL7-proposed-call-types.test.ts`.
- **Intents**: the `"reengagement"` case in `agent-run-admission-reactions.ts:113` and the `reengagement` member of the shared intent union — no producer remains.
- **UI**: `ReviewOutcomeSummary.tsx`'s `"irreversible"` kind and any proposedCall rendering on `ReviewPage`.
- **Tests that die with it**: `reengagement-resolver.integration.test.ts`, `agent-work-intent-recorder-shared-type.test.ts`, `AL7-two-session-loop.integration.test.ts`, `session-review-creator.reengagement-liveness-baked-emit.integration.test.ts`, the AL7 slices of the admission-failure and boundary tests. Test-only reachable code confirms, not excuses, the verdict.

Why acceptable: nothing observable changes — the loop never fires today. The delete makes the shipped truth honest.

**The `review` package itself — DELETE after relocation.** Survivors move to `layers/core-api/src/services/` as a plain reaction module; the package, barrel, Mechanism-C ceremony, and Table-ACL claim over three empty tables all evaporate.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `findProposedCall` | UI:GET /api/reviews/:reviewMessageId (+3 more routes, 2 events) | DELETE | Reads tables with no reachable production writer; every door serves rows that cannot exist. |
| 2 | `resolveReengagementRequest` | INTERNAL (transitionProposedCall, applyLivenessRetry) | DELETE | Bakes reengagement runs for grants that are never minted; dies with the loop. |
| 3 | `recordProposedCall` | UI:POST /api/reviews/proposed-calls | DELETE | Sole writer of `proposedCalls`; its only client is the never-activated workflow router; hardcodes `reversibility:"irreversible"` — the gate-by-default classifier ETHOS forbids. |
| 4 | `transitionProposedCall` (consumed overload) | UI:POST /api/reviews/proposed-calls/consume | DELETE | CAS-consumes grants that never exist; dead route, dead seam client. |
| 5 | `transitionProposedCall` (non-consumed overload) | UI:POST /api/threads/:threadId/messages/:messageId/verdict, POST …/:id/outcome | DELETE | held/granted/outcome transitions on unreachable rows; verdict handler's PC branch dies with it. |
| 6 | `transitionProposedCall` (implementation) | same as 4-5 | DELETE | The state machine has no state to run on. |
| 7 | `handleUnconsumedGrantOnSessionEnd` | EVENT:session_ended (livenessHandler) | DELETE | Scans an always-empty `tailoredGrants` on every session end; liveness net for a feature that never lived. |
| 8 | `reengageOnAdmissionFailure` | EVENT:agent_run_admission_failed | DELETE | Reengagement intents are only recorded by rows 5-7 — deleted; case handler in admission-reactions dies too. |
| 9 | `attentionReviewReasoningMarker` | UI:POST /api/knowledge/:id/recompute-attention, AGENT:score_attention | KEEP | Live idempotency contract for attention-engine knowledge reviews — shared-knowledge core value; relocates with the factory. |
| 10 | `createReviewItem` | AGENT:score_attention, UI:recompute-attention, SCHED:routine-scheduler, +11 doors | KEEP | The one load-bearing thing here: creates the review items humans actually see, across knowledge/routine/bet surfaces; relocates out of the dying package. |
| 11 | `registerReviewSubscriptions` | BOOTSTRAP (service-bootstrap.ts:433) | SIMPLIFY | Delete subscriber 2 (liveness net) and all seven reengagement port wirings; survives as the AD1 session-review creator only, moved to core-api services. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReviewAgentWorkIntentInput` | DELETE | Exists only to type reengagement intents; no producer remains. |
| `ReviewPorts` | SIMPLIFY | Keep `work`/`conversation`/`users`/`org` (the AD1 creator's real deps); DELETE `intentRecorder`, `requireRunnableAgent`, `getBetById`, `getTeamById`, `assembleSessionKnowledge`, `readServerConfig`, `resolveOrCreateCallingThread` — all seven exist solely for the reengagement bake. After the move it's a local deps type, not an exported port bag. |
| `ProposedCallQuery` | DELETE | Input type of deleted `findProposedCall`. |
| `ProposedCallView` | DELETE | Return type of deleted `findProposedCall`. |
| `ReengagementResolverDeps` | DELETE | Deps bag mirroring the deleted resolver — the exact `*Deps`-mirroring-one-function shape the brief names. |
| `BakedReengagementRequest` | DELETE | Return type of deleted resolver. |
| `ProposedCallTransition` | DELETE | The discriminated union IS the dead state machine. |
| `CreateReviewItemInput` | KEEP | Contract of the live factory (fixed by `KnowledgeReviewWriter`'s 3-arg port shape). |
| `CreateReviewItemResult` | KEEP | Two-field return of the live factory. |
| `ReengagementSourceUnavailableError` (class) | DELETE | Thrown only by the deleted resolver, caught-and-swallowed by deleted callers. |

## Holes this leaves

1. **No human-approval gate on agent tool calls, anywhere.** This hole already exists at runtime — the loop was never switched on — so the delete changes shipped behavior by exactly nothing; it changes the codebase's honesty by a lot. If a real learning ever earns a review gate on a specific tool, rebuild it small at that moment. Founder should know this kills the whole AL7 two-session grant/consume design, including three migration-managed tables. One tension to price consciously: a prior trust-model ruling ("AL7 gates unconditionally") suggests this loop was once chosen — but what shipped never turns it on, and the standing policy ruling for this pass is that irreversible-classifier approval machinery is DELETE.
2. **Verdict "approve" on a review message becomes purely a thread-resolution act** — no grant is minted. Identical to today's observable behavior.
3. **`review` stops existing as a Service** — the Table ACL entry for its three tables, the Mechanism-C port ceremony, and the package boundary all go; two small functions live on as ordinary core-api composition code.
