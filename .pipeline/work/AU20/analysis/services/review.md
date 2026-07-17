# review — Service-as-Product Analysis (revised post-critique)

**Verdict:** standalone (AL7 judgment core earns its boundary) — **but relocate the practice-meeting workflow out to `knowledge`.**
**Current public exports:** 48 · **Target:** ~13 (73% collapse, honestly counted)

---

## Product purpose

`review` is the **AL7 trust-first judgment domain**: an agent proposes an irreversible
action (`proposedCalls`), a human verdict grants a single-use tailored permission
(`tailoredGrants`), and the executed result is recorded (`operationOutcomes`). Those
three tables are review's own; no sibling owns approval/verdict state, so review cannot
dissolve into `work` or `conversation` — it is the *record of judgment*, not a CRUD
extension. It also hosts the **review-item surface** (turn a flagged knowledge item or a
risky session into an actionable `items` row for a human).

Consumers: `dispatch` (createPracticeMeeting — see relocation below), `session-requests`
(granted-call lookup on the reengagement path), `attention`/routes (proposed-call +
review-item surfaces).

---

## THE HEADLINE FINDING — relocate practice-meeting to `knowledge`

The critique's central coherence question, which the first pass dodged: the 3-turn
**practice-meeting workflow mutates ONLY knowledge's tables** (`knowledgeItems` /
`knowledgeAppProjection` / `knowledgeEditLog`) and owns **none** of review's 3 tables. It
is a knowledge-authoring ritual housed in `review` purely by the name "review". This is
not "would add a service" — **relocating** existing code to its actual data owner adds no
service.

Evidence it belongs in `knowledge`:
- Every write it makes is a `knowledge`-owned table. To live in `review` it needs an
  injected `PracticeMeetingKnowledgeStore` port of **9 raw primitives** + **9 `Raw*`
  mirror types** — the single biggest INSIDE smell in this service, a same-layer service
  reaching into another's raw table CRUD.
- Its lore already records that knowledge's general `create()`/`update()` were *not*
  reusable (fresh internal clock, `scopeId` write differences). Sitting **inside**
  knowledge, the workflow touches those tables directly (legal, Mechanism A) with the
  exact clock/scope semantics it needs — the DI port and the 9 mirror types **evaporate
  entirely**, and the critique's "coarsening is optimistic, floor is ~5 methods" concern
  (finding #4) becomes moot.
- Its only external consumer, `dispatch`, already depends on `knowledge`
  (`buildAttentionService`, auto-promotion/stale sweeps). Its `DispatchReviewAccessor
  .createPracticeMeeting` one-method mirror port simply re-homes to
  `ports.knowledge.createPracticeMeeting` — no new dependency edge, and AU19's whole
  `practiceMeetingKnowledgeStore` 9-accessor construction apparatus in
  `builtin-routine-handlers.ts` disappears.
- Conceptually: a practice meeting produces *provisional knowledge* from
  proposals→reactions→synthesis. That is knowledge authoring, not action-approval
  judgment. Review's vocabulary is proposed-call / grant / outcome; the meeting shares
  none of it.

**Effect on review's ledger:** removes `createPracticeMeeting`, `runPracticeMeetingTurn`,
`PRACTICE_MEETING_ANCHOR_ROLE` + ~8 practice DTOs (11 exports) AND the entire
`PracticeMeetingKnowledgeStore` port + 9 `Raw*`/row/archive mirror types (~14 exports).
These are relocated/eliminated, not hidden — they leave review's surface. Review is now
*only* the AL7 loop + the review-item surface, and its remaining outbound edges collapse
to a tiny bag with **no knowledge port at all**.

Review stays **standalone** — relocating one mis-homed sub-module sharpens the boundary;
it does not fold review into a sibling.

---

## Target API (post-relocation) — ~13 exports

### 1. `findProposedCall(db, query) -> ProposedCallView | undefined`
Replaces `findGrantedProposedCall`, `findProposedCallByReviewMessageId`,
`findProposedCallWithOutcomeByReviewMessageId`.
`query = { by: {reviewMessageId} | {id}, include?: { outcome?, grant? } }`;
`ProposedCallView = { call: ProposedCall; outcome?: OperationOutcome; grant?: TailoredGrant }`.
The three finders differ only by lookup key and which sibling row they join (left-join
outcome / inner-join grant). One filter-parameterized reader with a discriminated
selector + include flags serves every current lookup and absorbs future ones (by task, by
agent) as a new `by` variant — **no new method**. The narrow route projection is a subset
of the full-call+outcome view; the caller picks columns.

### 2. `transitionProposedCall(tx, transition) -> TransitionResult`
Replaces `holdProposedCall`, `composeTailoredGrant`, `consumeTailoredGrant`,
`recordOutcome`. The AL7 loop is a state machine
(`captured → held | granted → consumed → outcome-recorded`). **Honest signature** (the
critique correctly rejected the naive `(tx,id,to)` as false-uniform): a **discriminated
transition object** whose selector, payload, and return vary by target state —

| `to` | selector | payload | returns |
|---|---|---|---|
| `held` | `{id}` | — | `void` |
| `granted` | `{id}` | `{taskScope, agentScope, approvedToolId, approvedArgs, argPinned?, identityHash?}` | `void` (composes grant + records reengagement intent via `ports.intentRecorder`, 3-write tx) |
| `consumed` | `{taskId, agentId, toolId}` scope-tuple | — | `{proposedCallId} \| null` (CAS claim) |
| `outcome-recorded` | `{id}` | `{result: ToolResult}` | `void` |

The heterogeneity the critique flagged (scope-tuple vs id key, `{proposedCallId}` vs
`void` return, injected recorder, `ToolResult` payload) is **captured in the discriminated
union type**, not hidden behind a lying signature. One public transition entrypoint;
adding a state (revoked / expired) is a new `to` branch, not a new export — sub-linear.

### 3. `recordProposedCall(db, input) -> { firstCapture: boolean }`
= `captureProposedCall`. The lifecycle's single create entry-point (ON-CONFLICT dedupe);
kept distinct from `transition` because creation has no from-state.

### 4. `createReviewItem(db, bus, input) -> { itemId, threadId }`  (+ `attentionReviewReasoningMarker`)
= `buildCreateReviewItemForKnowledge` (the knowledge-flag path only). **The critique was
right that the two review-item paths are NOT one source-parameterized act** — the
knowledge-flag path is a straight `insertThread + createItem + emit`, while the
session-review path adds risk-tier gating (may create *nothing*), thread reuse via
`task.threadId`, org recipient resolution, and participant merge. So they are **not**
unified: this is the imperative knowledge-flag creator (its 3-arg shape is fixed by
knowledge's `KnowledgeReviewWriter` port); the session path lives in the subscription
registrar (#5). Both share one small internal `insertReviewItem` helper (thread + item +
event) — a private primitive, not a forced public fork. `attentionReviewReasoningMarker`
stays exported: it is the idempotency contract the attention engine LIKE-probes. The bare
`ATTENTION_REVIEW_SOURCE` constant becomes internal (folded into the marker).

### 5. `registerReviewSubscriptions(db, bus, ports) -> unsubscribe`
Folds `registerSessionReviewCreator` (with its full gating + routing + participant-merge
body) **and** the `handleUnconsumedGrantOnSessionEnd` liveness net into one idempotent
boot entry-point. Event wiring, not a per-caller product method. The liveness net's
terminal branch reuses `transitionProposedCall({to:'held'})` + a failed-outcome write
**internally** — it is one `session_ended` subscriber symbol, counted **only here** (the
first pass double-counted it under transition too — corrected).

### 6. `ReviewPorts` — composite outbound bag
Replaces `ReviewWorkStore`, `ReviewConversationStore`, `ReviewUserDirectory`,
`ReviewOrgRouting`, `ReviewRoutingContext`, `ReviewTaskPatch`, `TaskRiskTierReader`, and
the 4 `ReviewAgentWorkIntent*` types. `interface ReviewPorts { work; conversation; users;
org; intentRecorder }` — **no knowledge port** (relocated with practice-meeting). One
composite deps bag localizes every outbound edge; a new dependency is a field, not a new
exported interface. `ReviewAgentWorkIntentInput` is the one payload type kept as the
recorder's contract.

**Honest export tally (~13):** `findProposedCall`, `ProposedCallView`, `ProposedCallQuery`,
`recordProposedCall`, `transitionProposedCall`, `ProposedCallTransition`,
`createReviewItem`, `CreateReviewItemInput`, `CreateReviewItemResult`,
`attentionReviewReasoningMarker`, `registerReviewSubscriptions`, `ReviewPorts`,
`ReviewAgentWorkIntentInput`. The first pass's "14" was only reachable because it double-
counted the liveness net and undercounted transition's payload/selector types; this count
is honest AND lower than that because practice-meeting's ~11 exports genuinely left the
ledger via relocation.

---

## Inside lens

Two internal modules behind a tiny barrel: the proposed-call state machine
(finder + create + transition) and the review-item surface (imperative creator + the
session subscription). One `ReviewPorts` bag is the only outbound-edge declaration. The
proposed-call lifecycle lives in one `transitionProposedCall`, so a new verdict state is a
`to`-branch. The **biggest structural win is subtractive**: relocating practice-meeting
deletes review's largest INSIDE smell wholesale — a same-layer service reaching into
`knowledge`'s raw table CRUD through 9 injected primitives + 9 mirror types — rather than
merely coarsening it.

## Scaling test — PASS (sub-linear)

- New verdict outcome / call state → new `to` value + branch on `transitionProposedCall`,
  no new method (vs cloning `revokeProposedCall`, `expireProposedCall`).
- New lookup dimension (by task, by agent) → new `by` variant on `findProposedCall`, no
  `findProposedCallByTask` sprawl.
- A consumer wanting granted calls with outcomes is already
  `findProposedCall({ by:{id}, include:{ outcome:true, grant:true } })` — zero new surface.
- New review-item trigger → a new caller of the shared internal helper, not a new export.

The current shape fails the test: 3 use-case-shaped finders + 4 use-case-shaped mutators a
new use case would clone, plus a workflow wired through 9 hand-carved knowledge accessors.

## Consolidation judgment

- **Outward:** none. No sibling owns approval/verdict state; review is the record of
  judgment, not a CRUD extension. Standalone is earned.
- **Relocation (the real coherence move):** practice-meeting → `knowledge` (its actual
  data owner). Not a service add; a re-home that eliminates review's biggest port smell
  and lands the ritual where its tables and clock/scope semantics live.
- **Inward:** the residual over-fragmentation (48 exports for an AL7 loop + a review-item
  creator serving ~2 real external requests) collapses to ~13 general, composable
  interfaces.

**Confidence:** high.
