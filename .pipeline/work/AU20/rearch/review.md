# review — Service-as-Product (AU20 re-architecture, both lenses)

**Layer:** core-api · **Substrate:** owned-tables (3) · **Confidence:** high

`review` is the **AL7 trust-first judgment domain**. An agent proposes an
irreversible tool call, a human verdict grants a single-use tailored permission,
the grant is consumed at execution, and the outcome is recorded. It also hosts
the **review-item surface**: projecting a flagged knowledge item (or a risky
session) into an actionable `items` row for a human.

---

## 1. INSIDE-OUT (anchor)

### Substrate & floor
Substrate is **owned DB tables** — three of them:

| Table | Role |
|---|---|
| `proposedCalls` | aggregate ROOT — the staged irreversible call + its verdict state |
| `tailoredGrants` | CHILD — the single-use permission a `granted` verdict composes |
| `operationOutcomes` | CHILD — the executed result recorded against a call |

Nominal owned-tables floor = **~5 × 3 = 15** CRUD ops. But that ceiling is wrong
for this substrate: **the three tables are ONE aggregate, not three independent
entities.** `tailoredGrants` and `operationOutcomes` have no life outside a
`proposedCall` — no consumer creates, lists, updates, or deletes a grant or an
outcome on its own; they are only ever written *inside* a verdict transition and
only ever read *joined onto* their parent call. So the child tables contribute
**zero independent methods**. The coherent aggregate floor is:

- **create** the root (`recordProposedCall`, ON-CONFLICT dedupe — a proposal has no from-state)
- **read** the aggregate with optional children (`findProposedCall`, include-parameterized)
- **transition** the aggregate through its lifecycle (`transitionProposedCall`)

→ **coherent aggregate floor = 3 lifecycle ops** (well under the naive 15).

### Genuine owned capabilities beyond the floor
1. **The AL7 verdict state machine** — this is the owned *algorithm*, expressed
   as the `transition` op above (it isn't extra surface, it IS the aggregate's
   update): `captured → held | granted → consumed → outcome-recorded`. The
   heterogeneity (id-key vs scope-tuple selector, `void` vs CAS-claim return,
   grant-composition + reengagement-intent side effects on `granted`,
   `ToolResult` payload on `outcome-recorded`) is captured in a **discriminated
   transition spec**, not smeared across four methods.
2. **Review-item projection** — turn a flagged knowledge item into an actionable
   `items` row + review thread + event. Genuinely owned behavior (writes an
   `items` row via port, emits on the bus); not CRUD over review's own tables but
   a coherent capability review owns as the "record of judgment" surface.
3. **Event reactivity** — `session_ended` must (a) create a review item for a
   risky session and (b) close any unconsumed grant (liveness net). One boot
   entry-point owns this wiring.

Everything else the old service exposed was **fragmentation** (use-case-shaped
finders/mutators, per-edge DI port types) or **mis-homed code** (the
practice-meeting ritual, which mutated only `knowledge`'s tables — relocated to
`@hyperidle/knowledge` where it touches them directly; it left review's ledger
entirely, taking a 9-accessor port + 9 mirror types with it).

---

## 2. OUTSIDE-IN (real demand, from live consumers)

Verified against actual imports (service-data consumer list is partly stale — it
still names `createPracticeMeeting`, now relocated, and several
`session-requests` *internal* method names that review never owned):

| Consumer (real import) | What it needs | Served by |
|---|---|---|
| `routes/threads.ts` (verdict handler) | look up a staged call; hold/grant it | `findProposedCall`, `transitionProposedCall` |
| `routes/reviews.ts` | render a call + its outcome/grant | `findProposedCall({include})` |
| `session-requests-bindings.ts` | granted-call lookup on reengagement | `findProposedCall({include:{grant}})` |
| `tool-provider-bindings.ts` | capture a proposal; consume the grant / record outcome at execution | `recordProposedCall`, `transitionProposedCall` |
| `dispatch-bindings` + `tool-handlers-bindings` | create a knowledge review-item; idempotency probe | `createReviewItem`, `attentionReviewReasoningMarker` |
| `server-factory.ts` | boot the session_ended reactivity | `registerReviewSubscriptions` |

Every real demand is a lookup, a lifecycle transition, a review-item creation, or
boot wiring — no consumer wants a bespoke method per use case.

---

## 3. THE COHERENT PRODUCT API (fused)

| # | Interface | Lens | Source |
|---|---|---|---|
| 1 | `recordProposedCall(db, input) -> { firstCapture: boolean }` | both | `proposedCalls` create (ON-CONFLICT dedupe); tool-provider capture demand |
| 2 | `findProposedCall(db, query) -> ProposedCallView \| undefined`<br>`query = { by:{reviewMessageId}\|{id}, include?:{outcome?,grant?} }` | both | aggregate read; absorbs all 3 old finders + narrow route projection via column pick. New lookup axis (by task/agent) = new `by` variant, no new method |
| 3 | `transitionProposedCall(tx, spec) -> void \| {proposedCallId}\|null`<br>`spec = ProposedCallTransition` (discriminated by `to`) | both | the AL7 state machine = the aggregate's update; covers hold/grant/consume/outcome. New verdict state = new `to` branch, no new method |
| 4 | `createReviewItem(db, bus, input) -> { itemId, threadId }` | both | genuine capability — knowledge-flag → actionable item + thread + event |
| 5 | `attentionReviewReasoningMarker(knowledgeItemId) -> string` | outside-in | idempotency contract the attention engine LIKE-probes; pure helper |
| 6 | `registerReviewSubscriptions(db, bus, ports) -> unsubscribe` | inside-out | owned event reactivity: session_ended → review-item + unconsumed-grant liveness net (reuses #3 internally) |

Plus one composite outbound-edge type: **`ReviewPorts`** (`work`,
`conversation`, `users`, `org`, `intentRecorder` — no knowledge port; a new edge
is a field, not a new exported interface).

**Types (7, all genuine):** `ProposedCallQuery` (filter), `ProposedCallView`
(discriminated include return), `ProposedCallTransition` (transition spec),
`CreateReviewItemInput`, `CreateReviewItemResult`, `ReviewPorts` (deps bag),
`ReviewAgentWorkIntentInput` (recorder contract for `granted`).

---

## 4. TARGET NUMBERS

- **Substrate floor:** 15 nominal (5×3) → **coherent aggregate floor = 3**
  (child tables contribute 0 independent ops).
- **Target methods = 6** = 3 aggregate-lifecycle ops + 3 justified capabilities
  (review-item projection, its idempotency marker, event-reactivity boot).
- **Target types = 7** (listed above — no per-caller mirrors).
- **Current: 9 methods / 7 types** (data), 6 live value-exports in the barrel.

**Already at target — the AU20 Am9 collapse landed this.** What was DELETED to
get here (not internalized): 3 use-case finders → 1 `findProposedCall`; 4
use-case mutators → 1 `transitionProposedCall`; 8 individual DI-port interfaces →
1 `ReviewPorts`. What was RELOCATED off the ledger: the practice-meeting workflow
(11 exports) + `PracticeMeetingKnowledgeStore` port + 9 `Raw*` mirror types → all
moved to `@hyperidle/knowledge` (its real data owner) and now gone from review.

**Lean AND complete — every real feature still deliverable:**
- Agent proposes irreversible call → `recordProposedCall`.
- Human verdict (approve/hold) → `transitionProposedCall({to:'held'|'granted'})`.
- Execute with single-use grant → `transitionProposedCall({to:'consumed'})` (CAS).
- Record what happened → `transitionProposedCall({to:'outcome-recorded'})`.
- Reengagement / review render / granted-call lookup → `findProposedCall` with includes.
- Flagged-knowledge review item → `createReviewItem` (+ marker idempotency).
- Risky-session review item + unconsumed-grant closure → `registerReviewSubscriptions`.
- Practice meeting → still shipped, now from `knowledge` (correct owner).

No method can be dropped (each has a live consumer); no capability is lost. The
scaling test passes sub-linearly: a new verdict state, a new lookup axis, or a
new review-item trigger each adds a branch/variant/caller, never a new export.
