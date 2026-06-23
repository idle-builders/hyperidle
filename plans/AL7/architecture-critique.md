# AL7 — Architecture critique (reviewer, Phase 2)

Scored against the 9-dimension rubric, with the hardest pressure on the load-bearing risks for this
WP: at-most-once correctness, descriptive-vs-operative, the capability/no-bypass split, failure
surfacing, the DB-level idempotency defense, AC coverage, and scope discipline. I grounded every
claim against the real code: `threads.ts` verdict path (1180–1398), `tool-registry.ts`,
`submit-review.ts`, `reviews.ts`, and `event-bus-guarantees.md`.

The plan is well-written and its at-most-once *mechanism* (claim-then-act, mirroring first-verdict-
wins) is the right pattern. But it binds that mechanism to the **wrong granularity**, and several
contracts the concept made load-bearing are not actually defended in the plan as written. Findings
below, severity-ordered.

---

## CRITICAL findings

### C1 — Dispatch granularity mismatch: an approve on a bet thread fires *every* pending op on that thread, including ops belonging to other Subjects/reviews
This is the central correctness flaw and it breaks two ACs.

- A verdict resolves a **specific message** (`input.payload.resolvesMessageId`), and first-verdict-
  wins is enforced on **`messages.resolvedAt`** for *that message* (threads.ts:1288–1298). The
  thread is not the unit of resolution — the **message (the review)** is.
- `submit-review.ts` **finds-or-creates exactly one bet host thread per bet** (`hostKind="bet"`,
  `hostId=betId`) and reuses it across the bet's life. So one bet thread accumulates **many review
  messages and, over time, many staged ops**.
- The plan's dispatcher (`resolveStagedOperations(subjectThreadId)`, §4) selects
  `WHERE subjectThreadId = ? AND status = 'pending'` — i.e. **all pending ops anchored to the whole
  bet thread** — and executes all of them on *any* approving verdict against *any* message in that
  thread.

Consequence: approving review B fires the still-pending staged op from review A (and any future
review's op staged-but-not-yet-resolved). This directly violates:
- AC "A non-approving verdict … remains pending and un-executed" — review A got request-changes, its
  op is pending; an unrelated approve on review B executes it anyway.
- AC "A staged operation that the human never approves is never executed" — same path.

**Fix:** anchor the claim to the **resolved review message**, not the thread. The staged op must
carry the `resolvesMessageId` (or the review message id) it is staged against, and
`resolveStagedOperations` must filter `WHERE reviewMessageId = ? AND status = 'pending'`, invoked
with the message id the verdict just resolved — not the thread id. Add a `reviewMessageId` column
(FK to `messages.id`) to `staged_operations`. The `subjectThreadId` stays for the loader/index but
is **not** the dispatch key. Without this the loop is wrong, not just imprecise.

### C2 — The TOCTOU/atomicity claim is overstated: the claim transition runs *outside* the verdict transaction, after the response, fire-and-forget
The concept's hard rule #1 demands the at-most-once guard be a persisted conditional transition
"mirroring `threads.ts` first-verdict-wins." The plan says it mirrors it — but the real
first-verdict-wins runs **inside the verdict DB transaction** (threads.ts:1288–1298, throws
`VerdictRaceConflict` to roll the whole tx back). The plan's claim runs in
`resolveStagedOperations`, which §5 invokes **after** the transaction commits and **after** the 201
response, as a detached `void … .catch()`.

Two real gaps this opens:
1. **Approve succeeds, dispatch never runs.** If the process dies, the event loop drops the detached
   promise, or `dispatchDeps` is absent (it is *optional*, exactly like `assistantTurnDeps`), the
   verdict is recorded `approved` but no op is ever claimed or executed. There is **no reconciliation
   sweep** (explicitly out of scope, §10). So "approve" silently means "approved but nothing
   happened" — the exact failure AL7 exists to eliminate. This is not at-most-once being violated;
   it is **at-most-once degrading to at-most-zero with no visibility**, and rule #8 (failure
   surfaces) does not catch it because no Outcome row is ever written — there is no `failed` row,
   just nothing.
2. The plan's own §4 note ("if the process dies mid-dispatch the op is left `executing`") is honest
   about stranded `executing` rows, but the canvas (design) has **no rendering for `executing`** as a
   terminal-ish stuck state and the loader/AC set has no path that surfaces a stuck op. A stranded
   `executing` op is invisible to the reviewer — a silent swallow by another name.

**Fix:** (a) The claim (`pending → executing`) must commit *durably and atomically with, or
guaranteed-after, the verdict tx* via a mechanism that cannot be lost on crash — either fold the
claim into the verdict transaction (claim inside the same `db.transaction` that sets
`messages.resolvedAt`, then dispatch the tool call after commit reading the already-`executing`
rows), or write a durable "dispatch intent" row in the verdict tx that a sweep drains. (b) If a
crash-recovery sweep is genuinely out of scope, then the plan must state that a lost dispatch is a
**known, surfaced gap** — and add a verification that a claimed-but-unexecuted op is visibly
distinguishable on the canvas (a stuck-`executing` band), not invisible. As written, the plan claims
crash-safety it does not have.

### C3 — `dispatchDeps` optionality + the silent `.catch()` is a no-bypass and a failure-surfacing hole
§5: `void resolveStagedOperations(dispatchDeps, threadId).catch((e) => /* observability adapter;
never throw into the response */)`. And `dispatchDeps` is optional (4th arg, no-op when absent,
mirroring `assistantTurnDeps`). And **`app.ts:412` constructs `createThreadRoutes` with only 3 args
today** — so unless the live boot is also changed to pass `dispatchDeps`, the production server
approves into the void exactly like today, and every unit/integration test that constructs the route
without the 4th dep exercises a no-op path. The "optional dep" precedent is fine for an *assistant
turn* (a nicety); for the **execution loop it is the entire feature** — making it optional means the
feature can be silently absent and still pass a green build.

Separately, the `.catch()` swallows any error that escapes `resolveStagedOperations` itself (a DB
error on the claim, a bug before the try/catch around `executeCapability`). Rule #8 says failure
surfaces; a top-level swallowed catch into "observability" is precisely the silent swallow the rule
forbids for anything the reviewer needs to see.

**Fix:** (a) Make the live server boot wiring of `dispatchDeps` a mandatory build task with a test
asserting the production app passes it (not just that the function works when given deps). Consider
making the dep **required** for the threads route in the server boot path even if a test seam keeps
it injectable. (b) The top-level `.catch()` must do more than log: a failure to even *attempt*
dispatch on an approved op must produce a surfaced state against the review (a `failed`/stuck
Outcome the loader returns), not just an observability event the reviewer never sees.

---

## WARNING findings

### W1 — The UNIQUE-on-idempotencyKey defense does not actually defend at-most-once *execution*; it defends at-most-one-row, and the agent controls the key
§2 claims "two independent guards." True at the row level — but note what each actually buys:
- The UNIQUE index prevents a second *staging row* for the same key. Good for "agent can't fork two
  live commits." But the key is **agent-authored** (`idempotencyKey: z.string().min(1)`,
  stage-operation §3) with no server-side derivation or validation. An agent that authors a
  *fresh* key per stage (trivially: a UUID) gets a *fresh* row every time — the UNIQUE constraint is
  vacuous against an adversarial/buggy agent, and the concept explicitly says "retry = new staged
  op, new key." So the UNIQUE constraint is real but narrow; it is **not** a defense against
  double-*execution* (that is solely C1/C2's claim transition). The plan presents them as
  co-equal "two guards"; they guard different things and only one guards execution.
- There is **no check that the idempotency key is also passed to the tool/MCP** so the *tool* dedupes
  (the concept: "the tool + Kernel dedupe on it"). The dispatcher `executeCapability(toSpec(op))`
  (§4) is not shown to forward the key to the GitHub/Stripe call. If HyperIdle's claim is lost
  (C2) and a retry produces a new op with a new key, the *tool* would happily double-execute because
  it never saw a stable idempotency key. The whole point of an idempotency key is the tool honoring
  it; the plan stops at the DB.
**Fix:** state plainly that the claim transition is the sole at-most-once-*execution* guard and the
UNIQUE index is an anti-fork guard, not a co-equal execution guard. And require the dispatcher to
forward `idempotencyKey` to the tool call (`executeCapability` contract) so the executor dedupes —
otherwise the at-most-once promise stops at HyperIdle's boundary, which contradicts
trigger-not-executor + "tool dedupes on the key."

### W2 — Descriptive-vs-operative decision is "has a staged_operations row" — correct in spirit, but the *spoofability* question is unaddressed
The plan's rule (AC table, §8): operative = "has a `staged_operations` row"; descriptive = none.
That is the right structural answer and is not spoofable by the *reviewer*. But the concept asked
"where is that decision made and is it spoofable?" — the real surface is **who can insert a
`staged_operations` row**. The only writer is the `stage_operation` tool (Agent Runtime). So the
classification is "whatever the agent decided to stage executes." The concept's safety story is that
the agent only ever holds the *draft* verb and the Kernel holds the live verb — but in this plan the
agent's `stage_operation` call is what *creates the executable*, and `capabilityTool` + `operation`
+ `params` are **entirely agent-authored free text** (§3 Zod: `tool: z.string()`, `operation:
z.string()`, `params: z.record(...)`). Nothing validates that `(capabilityTool, operation)` is a
real, registered, gated capability resolved via the harness capability descriptor — the concept's
explicit requirement ("capability resolved via the harness capability descriptor … NOT a hardcoded
map," "OPEN vocab"). The plan *names* the descriptor (§2 comment) but the dispatcher resolves the
capability via a 2-entry `Map` keyed by `capabilityTool` (§6), and an op naming an unknown tool
just… is skipped or throws? Undefined.
**Fix:** define what happens when `executeCapability` has no entry for `capabilityTool` (must be a
surfaced `failed` Outcome, never a silent skip — else "approve did nothing" again). And state how a
staged op's capability is validated against the harness capability descriptor at *stage* time, so an
agent cannot stage an operation against a capability it was never provisioned — otherwise the
capability split is a comment, not an enforcement.

### W3 — Reviews loader change is under-specified and the route takes no `db` today
§7 says "the reviews loader … gains the staged-op + outcome rows for the Subject." But
`reviews.ts` is a **hardcoded fixture** (`FIXTURE_REVIEW`), `createReviewRoutes()` takes **no `db`
argument**, and it returns 404 for anything but `rev-1`. There is no `betId → thread → staged_ops`
query path in existence. Wiring real staged-op/outcome rows means giving the route a `db` dep,
mapping the review→Subject→thread, and querying both new tables — a non-trivial task the plan treats
as a one-liner. And the AC "result visible against the review" is verified partly via "reviews loader
returns it" (§8) — but the loader is fictional today.
**Fix:** expand §7 into a real task: thread `db` into `createReviewRoutes`, define the
review→thread→staged-op join, and define the response shape addition. Re-point the "visible against
the review" AC's verification at the real loader, and add a test that the loader returns the Outcome
for a resolved Subject (not just the component rendering it from props).

### W4 — Re-open re-entry correctness depends on a `pending` row, but the verdict path that re-opens never touches staged ops, and re-approve resolves a *new* message
Concept lifecycle: a non-approving verdict leaves the op `pending` (the plan's "no `held` write"
decision, §5), and a re-open + fresh approve "may re-enter executing only if never reached
executing/executed." The plan leans on the row staying `pending`. But trace the real re-open: a
re-open happens on a `review`/`questionnaire` message (threads.ts:1250, `willReopen`), which clears
`threads.resolvedAt` but writes **no** verdict. The *next* approve resolves a **new** verdict message
(new `resolvesMessageId`). With C1's fix (dispatch keyed on `reviewMessageId`), the staged op was
anchored to the **original** review message — so the re-approve against a *new* message id would not
find it. The plan has not reconciled "re-open + re-approve must re-enter the same pending op" with
"dispatch is keyed to the resolved message." This is the interaction the WP's headline at-most-once
AC ("re-opening … does not double-execute") and its sibling ("never-approved is never executed")
both live on, and the plan only reasons about it at thread granularity (which is C1-wrong).
**Fix:** decide and document the re-open identity: the staged op must be re-locatable across re-open
by the **Subject/review identity** that survives re-open (the review message it was staged against,
or a stable `subjectId`), and the re-approve dispatch must resolve ops by that stable identity — not
by whichever message id happens to carry the verdict. Then the at-most-once claim
(`WHERE status='pending'`) still does the dedup. Spell this out; it is currently hand-waved.

### W5 — `onDelete: "restrict"` on `stagedByAgentId → users.id` and on the thread/artifact FKs may break existing deletion paths
The new FKs use `onDelete: "restrict"` against `threads`, `artifacts`, and `users`. If any existing
flow deletes a thread/artifact/user (test teardown, agent removal, bet cleanup), a lingering staged
op now blocks it with a constraint error. The plan doesn't check whether anything deletes these
today. Low blast radius for AL7's own tests, but a latent foot-gun for the broader suite.
**Fix:** confirm no existing deletion path is broken by `restrict`; if agents/threads are ever
deleted, decide `set null` / cascade per FK intentionally rather than defaulting all to `restrict`.

---

## NIT findings

### N1 — `executeCapability` as an injected `Map` is fine for AL7 but the GitHub "real path" has a soft fallback that risks shipping mocked
§6 allows the real GitHub path to "fall back to a recorded/contract test against the forge client and
the *fixture* tool carries the live at-most-once proof" if no live credential exists. Per MEMORY
(`feedback_live_proof_lanes_run_before_ship`: a WP that proves a real/live path must actually
execute it before DONE; stubs+fixtures+review aren't proof), this fallback is the exact pattern that
shipped AH5 mocked three times. The fixture proving the *loop* is fine; but the WP's "one real tool
path" must genuinely execute against the forge at least once, locally, or be honestly marked as
not-proven.
**Fix:** make the real-path live execution a non-optional local proof step (e2e/local lane), or
explicitly downgrade the AC to "fixture-proven loop + contract-tested forge client" and flag that
the live path is unproven — don't let the fallback quietly stand in for the real proof.

### N2 — `status` and outcome `status` as unconstrained text with app-boundary validation — acceptable, but the const tuples must be the single source
§2 mirrors `messages.type` (unconstrained text + shared const tuple). Fine and consistent. Just
ensure `STAGED_OPERATION_STATUSES` / `OPERATION_OUTCOME_STATUSES` (task 1) are the *only* place the
strings live and the dispatcher/canvas both import them (the canvas currently inlines a local
`StagedOperationStatus` union, ReviewActionOperation.tsx:82 — that must be replaced by the shared
tuple-derived type, or they drift).
**Fix:** derive the canvas's status type from the shared tuple; delete the inline union.

### N3 — `operation_executed` event payload is elided (`/* ... */`) — define it or it can't be consumed
§4 emits `{ type: "operation_executed", streamId: subjectThreadId, /* ... */ }`. The reviews loader
/ live canvas presumably needs the staged-op id + outcome to refresh. An undefined payload is a
build-time gap.
**Fix:** define the event payload (op id, status, outcome ref) so the UI can react; register the
event type in the shared event union.

---

## AC coverage audit
Every AC and validation scenario has a mapped verification method in §8 — that table is genuinely
thorough and is a strength. The gaps are not *missing* mappings but mappings that verify the
**wrong granularity or a fictional surface**:
- "Non-approving verdict does not execute" + "never-approved is never executed" — mapped to a
  dispatcher test, but the test as described calls `resolveStagedOperations` directly and asserts the
  thread-level pending behavior; it will **pass while C1 is still broken**, because a single-review
  single-op fixture never exercises the multi-review-per-thread case. **The test must include a
  second pending op (different review) on the same bet thread and assert the unrelated approve does
  NOT fire it.** Add that case or C1 ships green.
- "result visible against the review" — half-verified via the fictional reviews loader (W3); the
  loader test does not exist yet.
- "at-most-once: re-open does not double-execute" — the dispatcher "call twice" test proves the
  claim returns 0 the second time, but does **not** prove the *re-open → new verdict message →
  re-approve* path (W4). Add the real re-open scenario, not just a double-call of the same function.
- The "no bypass" static check (dispatcher not in `ALL_TOOL_DEFINITIONS`; `toolsForRole` never
  contains an execute verb) is a good, correctly-typed check — keep it.

## Scope discipline
Good. §10 explicitly fences off AL8 broad coverage, AL6 return-enforcement, crash-recovery sweep,
the autonomy auto-flow path, and the policy engine. The 2-entry `executeCapability` map honors
"loop + one real tool path + fixture." No drift into AL8's connector model. The one soft spot is
N1's live-proof fallback, which is a proof-rigor issue, not a scope creep.

---

## Score: 5 / 10
The mechanism instinct is right and the plan is unusually well-grounded in the real seam. But it
binds at-most-once to the **bet-thread granularity** when resolution is **per-review-message** (C1) —
an approve on one review fires another review's pending op, breaking two ACs; it claims a crash-safe
claim transition it does not have because dispatch is detached, post-response, and optional (C2/C3),
opening a silent at-most-zero hole that rule #8 does not catch; and the agent-authored,
descriptor-unvalidated capability/params (W2) leave the capability split as a comment rather than an
enforcement. The reviews-loader task (W3) and the re-open re-entry identity (W4) are under-specified
in exactly the places the headline ACs depend on.

**Verdict: NOT build-ready. Must revise.** Three CRITICALs (C1 dispatch granularity, C2 claim
atomicity/lost-dispatch, C3 optional-dep + swallowed failure) are correctness defects that would
ship green against the planned tests. Re-anchor dispatch to the resolved review message, make the
claim durable-and-non-optional, and define capability validation + the reviews loader before code.
