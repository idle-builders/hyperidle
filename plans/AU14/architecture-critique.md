# AU14 — Knowledge write-path unification — Architecture Critique (Round 1)

**Verdict:** CHANGES REQUIRED. 1 CRITICAL, 1 WARNING, 3 NOTE.
**Reviewer:** independent evaluator (not the plan author). All claims below verified against actual code at `/Users/tg/hyperidle`.

---

## What the plan gets right (credit where due)

- **The load-bearing inversion is CORRECT and I independently verified it.** `getKnowledgeEvents()` (`packages/server/src/knowledge/events.ts`) has **zero `.on()` subscribers** anywhere in the repo — its only importer is `knowledge-repository.ts` (grep-confirmed). The live mechanism is the shared `EventBus`, with real subscribers: `ws-broadcaster.ts:45` (`knowledge_updated`), `git-export.ts:584` (`knowledge_updated`), `knowledge/relevance-listener.ts:46` (`knowledge_accessed`), and `services/observability/dispatcher.ts:442` (`knowledge_updated`→`knowledge_write`, dropping `knowledge_created`/`archived`/`accessed` at 481-483). The plan's decision to keep the route's `EventBus` emit, remove the dead singleton emit, and delete `events.ts` is the right call. The spec's suggested direction (line 780) really is backwards, and following it would silently kill route-driven WS/git/observability events.
- **Q2 read-side preservation (§5) is accurate.** GET `/`, `/:id`, `/triage-count` filter on `knowledgeItems.scopeKind`/`updatedBy` (kernel columns, not projection) — the plan correctly leaves them untouched, and the projection changes below do NOT affect Q2/AC-2.
- **Line references check out.** import at repo line 23 ✓, singleton emits at ~182-187 and ~382-387 ✓, `kind` at interface line 34 ✓, projection insert line 164 ✓, POST ~585-645 ✓, PATCH ~757-849 ✓, AC12 `>= 2` at test line 466 ✓, AC11 `=== 1` at 420/443 ✓.
- **Scope discipline (§6d, §11)** — correctly defers merge/split/archive/flag/scope-change. Good.

---

## CRITICAL-1 — §9 D3 rests on a FALSE blast-radius claim; populating `projection.scopeId` for route-created items is a real behavior change to at least four consumers, which the WP forbids.

The plan (§9 D3) states: *"The only reader of projection `scopeId` is `list()` with a `scopeId` filter (context-assembly L2 fetch)."* **This is false.** Grep for `knowledgeAppProjection.scopeId` returns five readers, three of them semantically load-bearing:

1. **`services/practice-meeting.ts:581-584`** — branches explicitly on nullness:
   ```
   anchorScopeId === null ? isNull(knowledgeAppProjection.scopeId)
                          : eq(knowledgeAppProjection.scopeId, anchorScopeId)
   ```
   Route-created items today have `projection.scopeId = null` (the route's `upsertProjectionLayer` writes only `layer`). They therefore match the `anchorScopeId === null` candidate branch and are excluded from any specific-scope anchor. After AU14, `repo.create` writes `projection.scopeId = resolvedScopeId`, so these items **drop out of the null-anchor set and into the specific-scope set** — a real change to practice-meeting candidate selection.
2. **`knowledge/promotion-pipeline.ts:204,224`** — `COUNT(DISTINCT scopeId)` gated by `isNotNull(knowledgeAppProjection.scopeId)`, with an explicit comment: *"Items with NULL scope_id are excluded — they cannot demonstrate cross-product repetition (which is the whole point of AC2)."* Route-created items are excluded from this count **today**; after AU14 they are counted — **this can change which knowledge gets promoted.** That is a core product behavior, not an audit-only detail.
3. **`knowledge/attention-service.ts:321`** — `eq(scopeId, filter.scopeId)`; route items newly match scoped attention queries.
4. `knowledge/attention-scoring.ts:268` selects `scopeId`; `knowledge-repository.ts:438` is `list()` (the only reader the plan acknowledged).

The WP's binding constraint is *"No behavior change visible to any existing consumer"* and validation scenario 3 is *"all pass with no behavior change to any consumer."* D3 is exactly such a change, to `promotion-pipeline` and `practice-meeting`, and the plan waved it through on a one-reader premise that does not survive a grep.

**Why this is structurally forced (and why "accept" is not free):** `repo.create` writes the *same* `input.scopeId` to both the kernel row (line 146) and the projection row (line 163). The route MUST pass `resolvedScopeId` (the kernel `scopeId` is read by Q2/GET filters — nulling it would break AC-2). So routing through `repo.create` **cannot** reproduce the route's current split (kernel `scopeId` set, projection `scopeId` null). The convergence therefore *necessarily* changes `projection.scopeId` for route items. The plan noticed the symmetric problem for `kind` (§6a item 3: makes `kind` optional so `projection.kind` stays null) but did **not** apply the same reasoning to `scopeId` — an internal inconsistency.

**Required resolution (pick and justify one, do not hand-wave):**
- **(A) Preserve** `projection.scopeId = null` for route items — but note this is impossible through the current `repo.create` signature without either regressing kernel `scopeId` (breaks Q2) or adding a decoupling parameter (re-introduces the very divergence AU14 removes). If chosen, the plan must show the exact mechanism.
- **(B) Accept the convergence deliberately** — enumerate **all five** `projection.scopeId` readers, state the concrete behavior change for each (esp. promotion-pipeline cross-product counting and practice-meeting anchoring), justify it against the WP's *own* stated goal ("route items behave like tool-created items"), explicitly record that this **supersedes** the literal "no behavior change" for `projection.scopeId` (the WP author evidently did not know route items had null projection scopeId), and add integration tests that **lock the new behavior** (e.g. a route-created team-scoped item now appears in `list({ scopeId })` and is counted by the promotion cross-product query). A deliberate, tested, enumerated acceptance is defensible under the convergence ethos; a false "one reader → accept" is not.

Either way, replace the D3 paragraph's factual claim and its evidence base.

---

## WARNING-1 — D1/D2 edit-log deltas are judged only against the AC12 test's tolerance, not against the production consumers that read the edit log with semantic filters.

`relevance-service.ts:98-99` and `attention-scoring.ts:315` both read `knowledgeEditLog` filtered by `editor === "human"` (counting human-edit activity per item). The plan's §9:
- **D1** (create edit-log row now written on the API path): for a human-authored API create, `editor = body.updatedBy` — if that resolves to `"human"`, `relevance-service`/`attention-scoring` will now count a create row they did not count before.
- **D2** (`updatedBy` field row now written on update): when the editor value changes, `repo.update` writes an extra `editType:"update"` row whose `editor` may be `"human"`, again feeding those two consumers.

The plan justifies both with *"AC12's `>= 2` tolerates it"* — but AC12 is one test; the constraint is consumer-invariance. Neither `relevance-service` nor `attention-scoring` is mentioned in §9. Add them to the analysis: either show `editor` is never `"human"` on these paths (unlikely — the route's `updatedBy` is caller-supplied), or state and accept the relevance/attention-scoring shift with the same rigor demanded for D3. D1 is explicitly wanted by validation-scenario-1, so the likely outcome is "accept + note the relevance/attention consumers"; the point is the plan must *say* so rather than stop at the test.

---

## NOTE-1 — §4 "double event / AC-3 would break" rationale is imprecise.

The plan says removing the repo singleton emit "prevents a double event once the route calls `repo.create`/`update` (route bus-event + repo singleton-event would otherwise both fire — AC-3 'exactly one event' would break)." The singleton fires `knowledge_item_updated` on the **separate** `KnowledgeEvents` emitter, not on the `EventBus`; it has zero consumers, so AC-3's per-consumer count would **not** break even if left in place. The correct reason to remove it is (a) it is dead/pointless and (b) `knip:production` flags it. The conclusion (remove) is right; fix the justification so a reader does not believe the singleton is observable on the bus.

## NOTE-2 — Dispatcher path is mis-cited.

§3 cites `observability/dispatcher.ts`; the actual file is `services/observability/dispatcher.ts`. The mechanism claim is correct (verified at lines 442-483); just fix the path so §6e's "no changes" list and any reader can find it.

## NOTE-3 — Stale doc reference (informational, not a plan defect).

`docs/knowledge-architecture/sync-and-conflict-resolution.md:32` describes a `packages/fabric/src/events.ts` + `setKnowledgeEventBus` bridge that no longer exists (file absent). It does not affect the plan (the plan concerns the *server* singleton), but if AU14 touches knowledge-event docs at write-docs time, this stale line should be corrected.

---

## Dimension scores (9-dim architecture rubric)

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Context & problem framing | 9 | Clear, accurate two-path diagnosis. |
| 2 | Constraint capture | 6 | Captures the event/Q2 constraints but misses that projection-row byte-preservation is structurally impossible through `repo.create` — the key tension is never surfaced. |
| 3 | Core architectural decision (event mechanism) | 10 | Correct inversion, independently verified. |
| 4 | Consumer blast-radius analysis | 3 | **CRITICAL.** False "one reader" claim; four consumers of `projection.scopeId` missed. |
| 5 | Data/contract fidelity (projection + edit log) | 4 | D1/D2/D3 shift data that flows to semantic consumers; not reconciled with "no behavior change." |
| 6 | Validation / test strategy | 6 | Tests prove test-survival, not consumer-invariance; no test locks the changed consumer behavior. |
| 7 | Scope discipline | 9 | Correctly defers merge/split/etc. |
| 8 | Risk / trade-off honesty | 5 | Right instinct to flag D1/D2/D3, wrong evidence, premature "accept." |
| 9 | Task sequencing / buildability | 9 | Ordered, each step compiles; TDD note present. |

**Blocking items:** CRITICAL-1, WARNING-1. Address both (and fold the NOTEs) then resubmit.

---

# Round 2 re-critique

**Verdict:** APPROVED. 0 CRITICAL, 0 WARNING, 1 NOTE (non-blocking).

Re-evaluated the revised `architecture.md` against the Round-1 findings and re-verified the underlying code.

## CRITICAL-1 — RESOLVED.
- §9 D3 now enumerates **all five** `projection.scopeId` readers (grep-verified: `knowledge-repository.ts:438` list, `practice-meeting.ts:581-584` isNull/eq branch, `promotion-pipeline.ts:204,224` DISTINCT+isNotNull, `attention-service.ts:321` eq, `attention-scoring.ts:268` select). The false "only `list()` reads it" claim is gone.
- New §5 correctly identifies the **structural cause**: `repo.create` couples kernel and projection `scopeId` (lines 146/163), the kernel column must stay set for Q2, so `projection.scopeId` population is *forced* by the convergence, not incidental. This is accurate — I confirmed `repo.create` writes `input.scopeId` to both rows.
- The decision is now a **deliberate, enumerated, test-locked ACCEPT** (net-new test 2 locks the new `projection.scopeId` behavior), with an explicit statement that it supersedes the literal "no behavior change" for that one column and a documented fallback-to-escalation if the reviewer rejects it. This is the right disposition: (a) it is the WP's own stated convergence goal ("API and tool items behave the same"); (b) the literal constraint is genuinely unsatisfiable for this column through `repo.create` without re-introducing the divergence AU14 exists to remove; (c) the change is toward correctness. **I confirm "accept" is the correct call.**

## WARNING-1 — RESOLVED.
- §9 D1 and D2 now name `relevance-service.ts:98-99` and `attention-scoring.ts:315` (`editor="human"` counts) as consumers and reason about the effect (bounded, directionally-correct provenance) rather than leaning on AC12's `>= 2`. Judgment is sound: D1 is validation-scenario-1's explicit intent; D2 is bounded to one row per genuine editor change.

## NOTEs — folded.
- §4 double-event rationale corrected (singleton is a separate emitter with zero consumers; removal is for deadness/knip, not a bus double-count). Accurate.
- Dispatcher path corrected to `services/observability/dispatcher.ts` (§3, §6e). Accurate.
- Stale fabric-events doc reference captured as non-blocking write-docs hygiene (§11).

## NOTE (new, non-blocking) — strengthen the D3 lock at its highest-stakes consumer.
Net-new test 2 locks `projection.scopeId` via the projection row directly (good). The highest-stakes consumer is `promotion-pipeline.ts` — D3 changes *what knowledge gets promoted* (route items now count toward `COUNT(DISTINCT scopeId)` cross-product repetition). Consider one additional integration assertion that a route-created scoped item now participates in a promotion cross-product count, so a future regression in that specific, product-visible path is caught directly rather than inferred. Non-blocking: test 2 + the enumerated acceptance are sufficient to clear.

## Dimension re-scores
| # | Dimension | R1 | R2 |
|---|---|---|---|
| 4 | Consumer blast-radius analysis | 3 | 9 |
| 5 | Data/contract fidelity | 4 | 8 |
| 6 | Validation / test strategy | 6 | 8 |
| 8 | Risk / trade-off honesty | 5 | 9 |

**No CRITICAL or WARNING remain. Plan cleared for build.**
