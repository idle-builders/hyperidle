# session-requests → **durable-agent-queue** — Product Re-Architecture (AU20)

**Layer:** agent-orchestration
**Merge anchor:** `durable-agent-queue` = `session-requests` + `trigger-resolution` + `lifecycle-projection`
**Implementation-site census now:** **49 methods / 41 types = 90**
**Exact target:** **13 methods / 7 types = 20**

The earlier 16/8 target was not an honest implementation-site count. The census counts the
exported `sessionRunRegistry` object once, not its four members; exported closed-vocabulary
constants count as methods; and a DB row re-export is not a locally declared type. The target below
uses those same rules. No factory, wrapper, object member, alias, constant, or type mirror exists to
manufacture the number.

---

## 0. Product and substrate

This service is the **durable agent-work queue**: accept durable intent, decide admission, create and
lease a session request, record its terminal outcome, project that outcome to the originating
primitive, and retain/reap the durable handoff records. Its customers are work producers,
run-orchestration, session-lifecycle, policy, and the composition-root boot loop.

It owns five tables as one mechanism:

| Table | Queue role |
|---|---|
| `agentWorkIntents` | durable ingress and retry record |
| `triggerResolutionHistory` | idempotent admission decision ledger |
| `agentSessionRequests` | core request lifecycle and worker lease |
| `explicitSessionStarts` | human/API immediate-start admission record |
| `agentLifecycleInbox` | durable terminal-fact projection inbox |

`sessionRunRegistry` is the one process-local overlay: live handles cannot be durable rows. Table
ownership follows this product boundary; it is not the reason the boundary exists.

`taskDispatchAttempts` remains owned by `work`, not by this service. The queue may read it while
resolving a task-dispatch intent and may update/delete it only as part of the already-required
handoff/projection/retention transaction. Those are explicit cross-owner operations supplied by
`DurableAgentQueueDeps`; they do not transfer table ownership or justify a raw repository export.

---

## 1. Stage 1 behavior floor

The committed completeness contract at `b95e1bf5` is protected and must stay green through the
rewrite. It pins:

- idempotent request creation and parameterized request/explicit-start reads;
- one concurrent claim winner, token-fenced renewal/release, expiry and reclaim;
- source/running lists and payload preservation;
- explicit-start creation, lookup, and admission;
- CAS-guarded running/termination/terminal transitions and exactly one terminal inbox fact;
- request claim/renew custody plus private intent claim fencing, expiry, and reclaim;
- run-registry replacement, abort, deregistration, and missing-handle behavior.

The rewrite preserves every capability exercised there and all existing integration behavior. The
custody/retry defects in §3 are existing correctness gaps exposed by code reconciliation, not product
features; correcting them requires the named regression tests before implementation.

---

## 2. Exact public contract

### 2.1 Thirteen top-level exported values

| # | Export | Exact responsibility |
|---|---|---|
| 1 | `enqueueWorkIntent(exec, input)` | Idempotently insert a producer intent. Intent kind/failure vocabularies are literal unions inside `WorkIntentInput`, not exported constants. |
| 2 | `createSessionRequest(exec, input)` | Create a direct/triggered request or explicit-start record from a discriminated input; preserve existing idempotency keys and correlation payloads. Triggered creation is called internally by the intent drain. |
| 3 | `findSessionRequest(exec, query)` | One overloaded implementation for request by id/idempotency/session, active-claim check, termination reason in an existing transaction, explicit-start lookup, and intent-source lookup. Overloads return imported DB row shapes directly; no local row alias. |
| 4 | `listSessionRequests(exec, filter)` | Source-filtered requests or running requests. Filter is inline because no independent public noun is required. |
| 5 | `claimSessionRequest(exec, selector, options)` | Claim next request or a request by id; returns the imported request row/null. Intent and inbox claims are private drain mechanics. |
| 6 | `renewClaim(exec, requestId, claimToken, options)` | Renew an unexpired request claim held by that token. |
| 7 | `releaseClaim(exec, requestId, claimToken)` | Return that token's currently claimed request to pending. |
| 8 | `transitionSessionRequest(exec, transition, deps?, options?)` | Sole public state-machine writer. Root execution is transaction-owning; inline `{transaction:'existing'}` requires the supplied transaction and performs no nested transaction. One implementation/one exported name replaces the old `...InTx` function. |
| 9 | `drainIntents(deps, options?)` | Claim intents privately, resolve authoritative inputs and admission, create the request, and mark handoff atomically. |
| 10 | `drainLifecycleProjections(deps, options?)` | Claim terminal facts privately, idempotently project them to their owning primitive, and acknowledge them. |
| 11 | `startLifecycleProjectionDrain(deps, options?)` | Start the non-overlapping in-process projection cadence and return its stop function. |
| 12 | `reapExpired(deps, options?)` | Transactionally reap terminal intents, terminal explicit starts/task attempts, and projected inbox rows in FK-safe order. |
| 13 | `sessionRunRegistry` | One exported process-local object with inferred `{register,deregister,has,abort}` members. The four members are not four census methods. |

There is no exported claim/renew operation for work intents or lifecycle facts: only their owning
drains use those leases. There is no queue factory. Dependencies are passed only where the operation
needs them; `DurableAgentQueueDeps` is the single composition-root contract, not a bound wrapper whose
members conceal exported operations.

The removed public `claimAgentWorkIntent` / `renewAgentWorkIntentLease` pair was an implementation
seam, not consumer demand: `service-data-23.json` records only `drainAgentWorkIntents` for the worker,
and no caller owns or extends an intent lease. The drain claims privately, performs one bounded
resolution/handoff attempt, and fences both its handoff checkpoint and failure write with the claim
token. It does not expose or promise intent-lease renewal. The old Stage 1 test of those two public
helpers is therefore superseded by public `drainIntents` behavior tests proving one concurrent claim
winner, token-fenced handoff/failure, expiry/reclaim, and retry eligibility. This is contract
translation through the coherent API, not permission to weaken those custody behaviors.

### 2.2 Seven locally declared exported types

1. `WorkIntentInput` — discriminated producer intent; includes literal kind vocabulary.
2. `CreateSessionRequestInput` — direct, triggered, and explicit-start creation union.
3. `FindQuery` — discriminated lookup union, including `claimActive` and existing-transaction reads.
4. `SessionRequestTransition` — running, terminal, termination-requested, and explicit-start union.
5. `ClaimOptions` — `{workerId, now, leaseMs}`; `now` is mandatory at custody boundaries.
6. `AgentLifecycleFact` — canonical terminal fact passed by the drain to the projection callbacks
   supplied through `DurableAgentQueueDeps`; the composition root must implement this contract.
7. `DurableAgentQueueDeps` — one inline structural dependency bundle for authoritative reads,
   admission, projection, and cross-owner work operations.

`AgentSessionRequest`, intent rows, explicit-start rows, and transaction/database executors remain
canonical `@hyperidle/db` types. Re-export them if consumers require the canonical name; do not create
local aliases or structural mirrors, because re-exports are not implementation-site type declarations.
Union arms, option fragments, registry entries, projector functions, and failure/kind vocabularies are
private or inline. Therefore the exact target is **13 + 7 = 20**.

---

## 3. Atomic state, lease, retry, and projection semantics

### 3.1 Lease ownership

Expiry ends custody. A token is authoritative only while row state is claimed, token matches, and
`claimExpiresAt > now`.

- **Claim:** select an eligible row, then CAS. Pending request/intent CAS includes observed
  `updatedAt`; expired reclaim CAS includes observed token, observed expiry, and `claimExpiresAt < now`.
  Lifecycle-inbox reclaim must add the same observed-expiry/still-expired predicates; comparing only
  the old token is insufficient because a same-token extension can race the reclaim.
- **Renew (session requests):** require claimed state, matching token, and unexpired lease at the
  supplied `now`. An expired request holder cannot resurrect custody; it must reclaim and receive a
  new token. Intent and lifecycle leases are private, bounded drain mechanics and have no renewal API.
- **Release:** token is mandatory. Update only `status='claimed' AND claimToken=:token`; clear all
  claim fields and return to pending. A missing or stale token is a no-op/false, never an administrative
  release path.
- **Claimed → running:** require claimed state, matching token, and an active lease at supplied `now`.
  The transition clears claim fields. Tokenless running admission is forbidden.
- **Terminal:** preserve Stage 1/AU9 one-winner CAS. Running terminalization compares status+sessionId;
  claimed terminalization compares active claim+token. Request terminal update and unique lifecycle
  inbox insert occur in the same owner transaction.

Required new integration regressions, added before the fixes:

1. request renewal at exactly/after expiry returns false and does not extend request custody;
2. tokenless/stale release cannot change a claimed request;
3. claimed→running with missing/stale/expired token fails and leaves the row claimed;
4. lifecycle reclaim loses when the observed lease was extended before its CAS, then succeeds only
   after the new expiry;
5. concurrent running/terminal writers still yield one winner and one inbox fact.

### 3.2 Intent availability and retry

`updatedAt` currently doubles as `eligibleAt`: failure writes a future timestamp for exponential
backoff. Keep the existing schema at MVP tier, but make the claim predicate for pending intents
require `updatedAt <= now`. Claimed intents remain reclaimable only after lease expiry. Attempts
increment in the claim CAS. Handoff remains one transaction: resolve/admit/create, then mark the intent
`handed_off` with its token; custody loss rolls the transaction back. At max attempts, preserve the
existing stable failure code and terminal projection behavior.

Regression: with a deterministic clock, one failure leaves the intent pending but unclaimable before
its future `updatedAt`; it becomes claimable at the boundary; a single drain call cannot immediately
reclaim itself and burn all attempts.

Public intent-custody proof must additionally race two `drainIntents` calls and observe one claim
attempt/handoff outcome, then exercise reclaim only after expiry. Tests must not import private queue
helpers or retain deleted public claim/renew aliases merely to preserve the old test shape.

### 3.3 Lifecycle projection retry and poison facts

Projection is deliberately **at least once**: owner projection commits before inbox acknowledgement,
so every projector remains idempotent/CAS-guarded. Do not add a table or a security/gating layer.
Use existing inbox `attempts`, `lastError`, `claimToken`, `claimExpiresAt`, and `projectedAt`:

- claim increments `attempts`; failure records `lastError` and retains the claim until its lease
  expires, providing retry backoff without a schema change or immediate hot loop;
- a failed fact does not abort the batch; continue with later eligible facts so one poison row cannot
  starve the queue;
- after the existing configurable maximum attempts, mark the fact handled by setting `projectedAt`
  while retaining `lastError` as its durable poison/dead-letter evidence; the ordinary reaper later
  removes it after the same projected-row retention window;
- successful projection clears `lastError`, sets `projectedAt`, and clears custody with a
  token-conditioned CAS.

Regressions: a failing projector is attempted once per lease window, does not block a following valid
fact, reaches handled/poison state only at max attempts, and a crash after an idempotent projection but
before acknowledgement safely reprojects then acknowledges once.

---

## 4. Fold and physical migration

The merge is physical, not a barrel illusion.

1. Move trigger decision/history and lifecycle projector implementations into private queue modules.
   `drainIntents` calls the resolver directly; `drainLifecycleProjections` calls the projector registry
   directly. Preserve trigger decision idempotency, unsupported-source failure recording, terminal
   projection to routine/work/explicit-start/task-dispatch, and scheduler behavior.
2. Remove all trigger-resolution and lifecycle-projection exports from `index.ts`; delete their public
   port files/types and the reciprocal DI edges. No `resolveTrigger*`, `recordSessionForResolutionHistory`,
   inbox repository function, projector registry/constant, or source/state constant remains public.
3. Replace the old request/intent/explicit-start function families with the 13 exports above. Delete
   old implementation files once their logic lives behind the coherent operations; do not retain
   deprecated aliases.
4. Physically delete `packages/core-api/src/services/session-requests-bindings.ts` and
   `lifecycle-projection-bindings.ts`. Migrate producers and the composition root to the public queue
   operations/deps directly. Mechanism C still applies: a Service package MUST NOT import
   `@hyperidle/session-requests`, including with `import type` or `typeof import`. Therefore
   `run-orchestration` and `session-lifecycle` express the queue edge as inline structural operation
   members on their already-required aggregate dependency ports, and the Layer composition root wires
   those members to the real 13 queue exports. These consumer-owned DI signatures are the mechanical
   boundary contract, not provider exports and not session-request census surface. Do not create a
   standalone `RunOrchestrationSessionRequestsPort`, `SessionLifecycleSessionRequestsAccessor`, local
   query/result/row aliases, registry mirror, bound queue facade, or test-only copy. Use canonical
   `@hyperidle/db` rows and `@hyperidle/shared` vocabulary directly; keep selectors, filters, transition
   arms, and option fragments inline in the aggregate member. The composition root must type-check the
   real provider functions against the consumer port without `any`, `unknown`, or casts that erase
   compatibility.
5. Migrate caller families: policy/work/dispatch/review producers; sessions/tasks/bets/threads/knowledge
   routes and app injection; run-orchestration boot/runtime/provisioning/recovery; session-lifecycle
   transition/abort flows; trigger, lifecycle, intent, retention, recovery, and explicit-start tests.
   Every old symbol is rerouted, then deleted—never wrapped.
6. Retention keeps one owner transaction and FK-safe order: projected inbox rows first, then terminal
   intents/explicit starts, then terminal work-owned task-dispatch attempts through the injected work
   operation. The queue selects eligibility; work performs its owned-table deletion in that same
   transaction. No direct `taskDispatchAttempts` import remains in session-requests.

Static acceptance: implementation-site census is exactly **13 methods / 7 types**; old export names,
compatibility facades, provider-side or standalone consumer type mirrors, direct trigger/lifecycle
seams, and direct `taskDispatchAttempts` imports are absent by the project lint/type/static checks.
Inline consumer-owned operation signatures required by Mechanism C are explicitly permitted under
the constraints in step 4; rejecting them while also forbidding direct Service imports would make the
architecture impossible to implement. Runtime acceptance:
the protected Stage 1 contract plus the regressions in §3, service integration lane, `npm run check`,
`npm run lint`, and `npm run test` are green.

### 4.1 Destruction measurement adjudication

“Net-heavily-negative” is measured as actual physical production removal, while completeness tests
and necessary caller migration remain visible rather than being discouraged or gamed. For this merge
anchor the concrete floor is:

- the old queue production modules are physically deleted, not retained or merely unexported;
- replacement production source under `session-requests/src` is at least **35% smaller** than the
  deleted production source it replaces;
- the complete increment, including new regression/completeness tests and all caller migrations, is
  still net-negative; and
- the implementation-site surface is exactly **13 methods / 7 types**.

The observed candidate diff of **+3,488 / -4,598** satisfies this rule: it removes 1,110 lines overall
(24.1% of deleted volume), while the queue production replacement is about 1,430 lines / 41% smaller
than the deleted production modules. A reviewer must not demand deletion of tests, unsafe compression,
or compatibility-erasing casts merely to increase the raw deletion/addition ratio. Conversely, the
positive migration/test lines do not excuse retaining any old module, export, facade, or dead helper.

---

## 5. Scaling and completeness

New producers add a `WorkIntentInput` value, new lookup dimensions add a `FindQuery` arm, new terminal
dispositions add a `SessionRequestTransition` arm, and new terminal owners add a private projector plus
dependency. None creates another method. The service therefore scales with queue capabilities rather
than caller count.

No behavior is discarded: durable producer ingress, authoritative resolution, trigger history,
direct/triggered/explicit creation, every request lookup and list, claim/renew/release/reclaim,
running/termination/terminal transitions, intent retry/handoff, terminal projection, retention,
boot scheduling, and live-run abort all remain. The only changed outcomes are the explicitly tested
custody/retry correctness fixes in §3.
