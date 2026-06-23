# AL7 — Review execution loop · Code review (reviewer, Phase 4)

Verdict: **NOT DONE**

Reviewed the live diff `origin/main...HEAD` against the locked concept (`plans/AL7/concept.md`),
the architecture (`plans/AL7/architecture.md`), and the round-2 critique mandates. `npm run verify`
is green (6349 tests), but green ≠ the right thing built. Three CRITICAL gaps ship a feature that
either does not meet the workpackage scope (no real tool path), is not actually wired end-to-end on
the human surface (loader returns the wrong shape, UI never receives the staged op), or silently
dropped a mandated enforcement (W2 stage-time capability validation). Plus a regression: the reviews
loader was rewritten to return a non-renderable payload, contradicting the plan's explicit "do not
rewrite the fixture" instruction.

Findings counts: **CRITICAL 3 · WARNING 4 · NIT 3**

---

## AC coverage table

| AC / scenario | Test file:line | Genuinely covered? |
|---|---|---|
| Approve executes staged op via tool, no leaving review | `AL7-staged-operation-dispatcher.integration.test.ts:153` (`executed`+`ok`) and `:806` (C3, real `app` POST verdict) | **Y** |
| C1 — multi-review-per-thread isolation | `AL7-staged-operation-dispatcher.integration.test.ts:200` (two reviews, one thread, only B approved, A stays pending, `executeCapability` once, asserts B's idempotencyKey) | **Y** — genuinely exercises C1 |
| Non-approving verdict does not execute; op stays pending | `:448` (never-approved) + `:488` (descriptive). **No test posts a `request-changes`/`reject` verdict and asserts the op stays pending.** | **PARTIAL** — see W3 |
| After execution, result returns + visible against review | dispatcher `:153`/`:512` + `AL7-reviews-loader.integration.test.ts:108`/`161` | **Y at route level; NO** end-to-end to the canvas — see C2 |
| At-most-once: re-open does not double-execute | `:316` (twice re-delivery) + `:365` (real re-open posts NEW message R, op anchored to M not re-fired) | **Y** — W4 shape correct |
| Never-approved op never executed | `:448` | **Y** |
| Descriptive artifacts do not execute on approve | `:488` (review with no staged_operations row → `executeCapability` not called) | **Y** |
| At-most-once idempotent per approval (constraint) | `:316` + DB UNIQUE `:706` | **Y** |
| Capability validated at STAGE; unknown capability surfaces (W2) | dispatch-time unknown: `:564` (covered). **Stage-time validation: NO test, NO code** | **NO** — see C3 |
| Crash recovery: stranded `executing` → terminal Outcome (C2) | `:615` (sweep → failed + "interrupted") + `:659` (not re-swept) | **Y** |
| Live server boot wires dispatch (C3) | `:806` — real `createApp` `app` fixture POSTs approve, op executes; boot uses default `buildExecuteCapability()` | **Y** |
| Verdict grammar unchanged (constraint) | `npm run check`; no `VERDICT_DECISIONS` change in diff | **Y** |
| Execution failure surfaces, never swallowed (constraint) | `:512` (throws → `failed` + verbatim, `rs` resolves) | **Y** |
| No bypass of the human gate (constraint) | `AL7-tool-registry.test.ts:28` (`stage_operation` registered, no execute verb in any role) | **Y** (but weak — see NIT-2) |
| Spec immutable / approved spec is what executes (constraint) | `:756` (`executeCapability` receives frozen params + idempotencyKey from the row) | **Y** |
| **Loop + at least one REAL tool path** (concept Phase 4, plan §6) | none — `buildExecuteCapability()` registers ONLY `fixture:staged-op` | **NO** — see C1 |

---

## CRITICAL findings

### CRITICAL-1 — No real tool path. The "one real tool path" AC is unmet; only the fixture exists.
`packages/server/src/services/staged-operation-dispatcher.ts:195-211` (`buildExecuteCapability`)
registers exactly **one** capability: `fixture:staged-op`. Every other tool — including the
`github:merge-pr` path the plan (§6) and concept (Phase 4 closure: *"AL7 proves the loop + **at least
one real tool path** (one archetype end-to-end)"*) make a non-optional deliverable — falls through to
`throw new Error("Unknown capability tool…")`. The doc comments at lines 22-24 and 191-193 *claim*
`"github:merge-pr" is the real archetype-A path`, but no such branch exists in the function body. This
is an AI tell: the comment describes code that was never written.

The progress file (`.pipeline/progress/AL7.json:8`) asserts *"execution loop + at-least-one real tool
path"* — that claim is false against the diff. The fixture proves the loop/claim/failure-surfacing
(good), but per MEMORY `live_proof_lanes_run_before_ship` and the plan's own N1 disposition, the WP is
**not DONE** until either (a) the GitHub merge path is implemented and executed once against a
throwaway repo in a local proof lane, or (b) the AC is honestly downgraded and flagged in the PR body
("fixture-proven loop; live forge path UNPROVEN") — the plan forbids the fixture silently standing in.
Currently it does exactly that, with comments pretending otherwise.
**Fix:** implement the `github:merge-pr` branch in `buildExecuteCapability` calling the forge via
MCP/API, prove it live once locally; OR strip the false "github:merge-pr is the real path" comments
and explicitly mark the real-path AC unproven in the PR + progress file. Do not leave comments
describing unwritten code.

### CRITICAL-2 — Reviews loader returns a shape the UI cannot consume; the staged op never reaches the canvas. End-to-end "visible against the review" is broken.
The loader (`packages/server/src/routes/reviews.ts:79-89`) returns:
```
{ ...reviewPayload, stagedOperation: { id, status, capabilityTool, operation, reversibility, outcome: { status, payload, error, executedAt } } }
```
But the web surface consumes it as a `ComposedReviewSubject` (`ReviewPage.tsx:44` casts the response),
and the canvas reads `artifact.stagedOperation` of type `StagedOperationView`
(`ReviewComposition.tsx:678`, `review-composition.ts:66`). Two structural mismatches make the staged
op invisible on the real surface:
1. **Wrong nesting.** The loader puts `stagedOperation` at the **top level of the subject**, but the
   UI reads it off a **`ComposedReviewArtifact`** (`artifact.stagedOperation`). The loader produces no
   `artifacts` array at all (see CRITICAL-2b), so `artifact.stagedOperation` is always `undefined`.
2. **Wrong field names.** Loader emits `stagedOperation.id`; the view type
   (`review-composition.ts:67`) requires `stagedOperationId`. Loader's `outcome` carries `payload`
   (raw JSON object); the view (`review-composition.ts:55`, `ReviewActionOperation.tsx:372`) renders
   `outcome.receipt` (a string) and never reads `payload` — so the success band's receipt line is
   always blank.

No test catches this because the route test
(`AL7-reviews-loader.integration.test.ts`) asserts the **raw JSON** shape, and the web `ReviewPage`
test (`ReviewPage.test.tsx`) injects a **mock loader**, so the real `defaultLoader` →
`ComposedReviewSubject` → `ReviewComposition` → `ReviewActionOperation` chain is never exercised with
the real route output. The AC "result visible against the review" is verified only at the route-JSON
boundary, not on the surface that is supposed to render it. This is the exact half-verified-loader trap
the round-2 critique (W3) warned about, reintroduced at the response-shape level.
**Fix:** reconcile the loader output with `StagedOperationView` (`stagedOperationId`, derive `receipt`
from the tool payload, drop or rename `payload`) AND nest it on the artifact the canvas renders. Add a
test that drives the real `defaultLoader` output through `ReviewComposition` and asserts the
`action_operation` canvas shows the outcome band — not a raw-JSON assertion.

### CRITICAL-2b (same file, regression) — The loader was rewritten to drop the whole review subject; the plan said keep the fixture.
Plan §7 step 2 is explicit: *"keep the stub data until the broader reviews-loader wiring lands — AL7
only **adds** the staged-op/outcome branch to the response, it does not rewrite the whole fixture."*
The builder instead **deleted `FIXTURE_REVIEW` entirely** and now returns `{ ...reviewPayload }` — the
bare parsed review-**message** payload (`{ title, reasoning, artifactRef }`), which is not a
`ComposedReviewSubject` (no `artifacts`, `comments`, `verdictState`, `subject`). The old test
`reviews.routes.integration.test.ts` was flipped from "returns the fixture subject" to "returns 404
for rev-1" (`:19-27`), silently accepting the regression. Any caller that loaded a real review for
rendering now gets an unrenderable payload. This contradicts the locked plan and removes a working
surface to land an incomplete one.
**Fix:** restore the composed-subject stub branch and merge the staged-op/outcome onto the matching
`action_operation` artifact within it, per the plan. Do not delete the fixture wholesale.

### CRITICAL-3 — W2 stage-time capability validation was mandated and is NOT implemented. The capability split is a comment, not an enforcement.
The round-2 critique recorded W2 as RESOLVED *in the plan* on the basis that the stage tool would
*"resolve `(capability.tool, operation)` against the harness capability descriptor for the staging
agent … stage rejected if the agent was never provisioned it"* (architecture §3 step 2, build task 3).
The shipped tool (`packages/server/src/tools/stage-operation.ts:65-104`) does **none** of this. The
handler validates Zod shape, checks the artifact row exists, then inserts the staged op. There is no
capability-descriptor lookup, no provisioning check. `capabilityTool`/`operation`/`params` are
entirely agent-authored free text written straight to the row. An agent can stage an operation against
**any** tool string it was never provisioned — the stage-time half of the capability split named as a
load-bearing safety property in concept hard rule #3 is absent.

It is partially backstopped at *dispatch* time (unknown tool → `failed` Outcome, tested at
`:564`), so an unprovisioned tool cannot *execute* — but the concept's enforcement is at the **write
boundary** ("an agent cannot stage an op it has no live capability for"), and the AC table
(architecture.md:447) lists *"(a) stage against a capability the agent does NOT hold → stage rejected"*
as a required test. **No such test exists** (there is no stage-operation test file at all). The AC is
claimed-covered by the plan but is genuinely uncovered and unenforced.
**Fix:** implement stage-time capability validation against the harness capability descriptor
(`buildToolRegistry`'s provisioning surface) in `stage-operation.ts`, reject the stage when the agent
lacks the capability, and add the stage-rejection integration test. If the descriptor surface is not
yet available to the tool context, this must be flagged as an explicit, surfaced scope cut — not
silently dropped while the plan records it RESOLVED.

---

## WARNING findings

### WARNING-1 — `stage_operation` takes `subjectThreadId` as agent input instead of deriving it from `reviewMessageId`.
Plan §3 step 1: *"Resolve `reviewMessageId` → its thread (`messages.threadId`); set `subjectThreadId`
from that row … The review message id is the dispatch anchor; the thread is derived from it (not the
other way around)."* The shipped tool (`stage-operation.ts:27`, `:90`) accepts `subjectThreadId` as a
**separate agent-supplied field** and writes it verbatim, never cross-checking it against
`messages.threadId` for `reviewMessageId`. An agent (or a bug) can anchor an op to review message M
while claiming a `subjectThreadId` that is a different thread. `subjectThreadId` is "loader index only"
so it does not corrupt dispatch (which keys on `reviewMessageId`), but the loader index can now point
at the wrong thread, and the plan's stated invariant ("op always bound to the exact review") is not
enforced. Also note the tool never validates that `reviewMessageId` is a `review`/`questionnaire`-type
message in a bet host thread (plan §3 step 1, second sentence) — any message id is accepted.
**Fix:** derive `subjectThreadId` from `messages.threadId` for the given `reviewMessageId` inside the
handler; reject if the message does not exist or is not a reviewable type. Drop `subjectThreadId` from
the agent-facing input schema.

### WARNING-2 — Non-approving-verdict path is not tested through the real verdict route.
The AC "a non-approving verdict … remains pending and un-executed" is covered only by proxies: a
never-called dispatcher (`:448`) and a no-staged-op review (`:488`). No test posts a `request-changes`
/ `reject` / `edit` verdict through the route (the way C3 posts `approve`) and asserts the op stays
`pending` and `executeCapability` was not called. The threads.ts guard
(`threads.ts:1379`, `decision === "approve" || "approve-with-comments"`) is correct by reading, but the
behavioral AC has no test exercising the negative branch end-to-end. Given the round-2 lesson that a
proxy test shipped C1 green in r0, this branch should be tested at the route.
**Fix:** add a route-level test: stage an op, POST a `request-changes` verdict resolving M, assert op
`pending` + no Outcome.

### WARNING-3 — Boot sweep is fire-and-forget; no prod-app assertion that it runs (round-2 NIT carried, unaddressed).
`app.ts:427` calls `void sweepStrandedOperations(dispatchDeps).catch(...)`. The round-2 addendum
explicitly asked to *"name the server-start hook that invokes `sweepStrandedOperations` and assert it
runs at boot in the prod-app test (mirror the C3 'prod wires it' discipline)."* The sweep IS wired into
`createApp`, which is good, but (a) it is fire-and-forget so a boot that races a verdict could miss it,
and (b) there is no test that constructs the real app and asserts a pre-seeded stranded `executing` row
becomes `failed` after boot. The sweep function is tested (`:615`) but the **boot call** is not.
**Fix:** add a prod-app integration test: seed a stranded `executing` op, construct `createApp`, assert
the op is swept to `failed`. Optionally await the sweep before the app accepts traffic if races matter.

### WARNING-4 — `sweepStrandedOperations` emits `operation_executed` with `streamId: row.id` for a sweep; status union is fine but the per-thread subscriber contract drifts.
In `ExecuteOne` (`dispatcher.ts:179`) the event uses `streamId: opId`; the doc/event comment
(`events.ts` `OperationExecutedEvent`, "streamId = stagedOperationId") agrees. But architecture §4 says
the UI subscribes per **thread** (`streamId: subjectThreadId`) so the canvas refreshes. The shipped
code streams by **op id**, and the sweep does the same (`dispatcher.ts:103`). With no live WS consumer
in this diff it is inert, but the documented "UI subscribes per thread to refresh the Outcome band"
contract is not what the code emits, and there is no consumer test. Pick one and make the doc + code
agree, or the live-refresh wiring (a follow-on) will subscribe to the wrong stream.
**Fix:** decide the stream key (thread vs op), align `events.ts` doc, `dispatcher.ts`, and architecture
§4; note explicitly if live refresh is deferred.

---

## NIT findings

### NIT-1 — `ExecuteOne` is PascalCase; project convention is camelCase for functions.
`dispatcher.ts:59`/`:113` define and call `ExecuteOne`. `.claude/rules/typescript.md`: camelCase for
functions, PascalCase for types/components. Biome did not catch it. Rename to `executeOne`.

### NIT-2 — The no-bypass test is allow-list-by-denylist; it cannot catch a future renamed execute verb.
`AL7-tool-registry.test.ts:34-41` asserts a fixed `forbidden` list (`execute_operation`,
`dispatch_operation`, `resolve_staged_operations`) is absent. A future agent-facing tool named
anything else that wraps execution would pass. The genuinely robust invariant is "the only AL7
agent-facing tool is `stage_operation`," which the test partially asserts. Consider asserting the
dispatcher module's exports are not reachable via `ALL_TOOL_DEFINITIONS` structurally rather than by a
hand-maintained forbidden-name list. Low risk today (correctly scoped), noted so the denylist is not
mistaken for a real structural guard.

### NIT-3 — Defensive dead guard in `ExecuteOne`.
`dispatcher.ts:133-136`: after a successful CAS claim returning the row id, the code re-selects the row
and guards `if (!row) return;` with a comment "Should not happen." The row was just updated under the
same connection; the guard is unreachable and silently abandons a claimed-but-uneacted op if it ever
fired (no Outcome written → stranded `executing` until the next boot sweep). Either drop the re-select
(use the row you already have via the claim's `.returning()` of all columns) or let a missing row throw
rather than silently return. As written it is AI-slop defensiveness that also hides a (theoretical)
strand.

---

## Lens summary

- **Architecture:** dispatch correctly keyed on `reviewMessageId` (C1 honored in dispatcher + threads
  route); claim CAS mirrors first-verdict-wins; awaited inline; boot sweep present. But the loader
  rewrite (CRITICAL-2b) breaks the subject contract and the stage tool skips capability derivation
  (WARNING-1) and validation (CRITICAL-3) — two plan tasks not delivered.
- **Design:** the Outcome band TSX is faithful to the round-2 design (success `--accent-primary-dim`,
  failure `whitespace-pre-wrap break-words`, inline union replaced by shared tuple, `Failed` story
  with multi-line error). Good. But the data never reaches it on the real surface (CRITICAL-2).
- **Security:** capability split enforced only at dispatch, not at stage (CRITICAL-3); agent-authored
  `subjectThreadId` unverified (WARNING-1). No SSRF/secret-leak issue in the fixture path; the unwritten
  GitHub path would need outbound auth review when built.
- **Adversarial:** the at-most-once claim is genuinely at-most-once across re-delivery, re-open (new
  message), concurrent claim (CAS), and multi-review-per-thread — the strongest part of the diff. No
  TOCTOU between verdict tx and claim: the claim runs after the verdict commits and re-claim returns 0.
- **Simplification / Slop:** comments describing unwritten code (CRITICAL-1), defensive dead guard
  (NIT-3), PascalCase function (NIT-1).

## Scope

Stays within "loop + fixture" — no AL8 connector drift. BUT the "+ one real tool path" half of the
declared scope is unmet (CRITICAL-1). The loader rewrite (CRITICAL-2b) is the one place the build went
*beyond* the plan's instruction and regressed an existing surface.

**Verdict: NOT DONE.** Fix CRITICAL-1 (real path or honest downgrade), CRITICAL-2/2b (loader shape +
end-to-end wiring + restore fixture), CRITICAL-3 (stage-time capability validation + test). The
at-most-once core is solid; the gaps are at the edges the round-2 critique specifically flagged
(real-path proof, real loader, capability enforcement).
