# G3 — Knowledge Promotion Pipeline — Plan

Work package: `docs/work-packages/TRACK-G.md` §G3
Worktree: `/workspace/.worktrees/G3`
Depends on: G1 (`promote_knowledge` tool, facilitator seeds, CONFLICT_OPEN gate), G2 (attention service), B5 (`knowledge_conflicts`).

---

## 1. Context

G1 shipped the facilitator-driven transitions along the chain
`captured → provisional → validated → active → stale → archived`, with the
CONFLICT_OPEN gate blocking promotion to `validated` when any open conflict
exists. G2 shipped the attention scoring engine.

G3 layers two autonomous behaviors on top of that contract:

1. **Auto-promotion** of repeated, uncontested knowledge from `provisional`
   to `validated` (AC2) without a human in the loop.
2. **Stale detection** of `active` items that have not been touched in more
   than 90 days (AC4).

Plus one safeguard (AC3, "don't auto-validate something that contradicts a
higher-layer principle") and one multi-turn workflow (AC6, the 3-turn
practice meeting).

AC1 (facilitator promotion captured → provisional) and AC5 (open conflict
prevents promotion past provisional) are already live in the G1
`promote_knowledge` tool. G3 does not re-implement them; it exercises them
through new integration tests and ensures the auto-promotion path honors
the same gate.

---

## 2. Constraints (from source)

- **No schema changes.** All G3 state lives on existing
  `knowledge_items` columns + `knowledge_items.meta` (JSON).
- **`promote_knowledge` public shape is frozen** — G1 AC5 regression tests
  must still pass unmodified. All auto-promotion reuses the same transition
  engine (conditional UPDATE, CONFLICT_OPEN gate, edit-log append).
- **Transactions everywhere.** The per-item critical section (read status →
  check gates → conditional UPDATE → edit-log INSERT) runs in a SQLite
  transaction. This mirrors G2's `attention-service.ts` pattern.
- **Editor marker for auto-promotion.** All auto-promotion writes to
  `knowledge_edit_log.editor = 'agent:auto-promotion'` so the provenance of
  a status change is unambiguously machine-originated.
- **`KnowledgeKind` is a closed union** in `packages/shared/src/types.ts`.
  The practice meeting does NOT introduce new kind values; proposal/reaction
  items reuse existing kinds (`reflection` for proposals and reactions, or
  the caller's declared kind) and carry the meeting-phase distinction in
  `meta`.
- **TypeScript strict.** No `any`, no `@ts-ignore`, no unsafe `as`. Explicit
  return types on all exports. Workspace imports. `.js` suffixes on
  relative imports.
- **No console.log** in production code; tests use `expect` assertions.

---

## 3. Design

### 3.1 Module location

**Decision:** `packages/fabric/src/promotion-pipeline.ts` owns the pure and
near-pure database logic (auto-promotion check, contradiction heuristic,
stale detection, sweep drivers). The practice-meeting orchestration is an
application-level concern that emits domain events and creates review
items, so it lives in the server layer at
`packages/server/src/services/practice-meeting.ts`.

Justification:
- Fabric is already home to knowledge-domain pure functions: repository,
  conflict resolution, attention scoring. Promotion-pipeline is the same
  flavor of code — derivations over `knowledge_items` with transactional
  writes guarded by the same invariants.
- Practice meeting is a multi-turn workflow that emits `knowledge_updated`
  domain events. That's server-shaped (events, transitions into review),
  consistent with G2's `attention-service.ts` living in
  `packages/server/src/services/`.

### 3.2 Signature key (auto-promotion matching)

The "same finding in 5 products" AC requires a grouping key. The heuristic:

```
signature = `${layer}::${topic ?? ''}::${kind}`
```

Items in the same `(layer, topic, kind)` triad are treated as the same
finding. `scope_id` is *deliberately excluded* from the key — cross-product
repetition is the entire point of AC2.

The promotion check counts **distinct `scope_id` values** among non-archived
items with that signature. A single item that appears on 5 different
products yields count = 5. Items without a `scope_id` contribute nothing to
the distinct-scope count (they cannot demonstrate cross-product
repetition).

**Constant.** The threshold lives at the module top as
`AUTO_PROMOTION_REPETITION_THRESHOLD = 5` with an inline comment citing
`KNOWLEDGE_ARCHITECTURE.md` §6.5 and TRACK-G §G3 AC2.

### 3.3 Contradiction heuristic (AC3)

**The heuristic.** An L3 proposed practice contradicts an L4 principle if
any of the following holds:

1. An L4 `principle` item shares the L3 item's `topic` AND has its
   `meta.forbids` array containing a string that equals the L3 item's
   `topic` or appears in the L3 item's `meta.claims` array.
2. An L4 `principle` item shares the L3 item's `topic` AND the L3 item's
   `meta.claims` array contains a string that appears in the L4 item's
   `meta.forbids` array.

If either condition matches, promotion is blocked and the item is flagged
for human review via a `knowledge_updated` event with
`action = 'contradiction_flagged'`. The L4 item's id is included in the
returned result so the human can inspect both sides.

**Documented limitations.** This is a structural heuristic, not NLP. It
catches the explicit case where the L4 principle's author has written
`meta.forbids: ["use-session-tokens-for-csrf"]` and the L3 author's
`meta.claims` contains `"use-session-tokens-for-csrf"`. It WILL miss
contradictions expressed only in prose. False positives are possible if
two items share a topic string but mean different things. The function
returns a `contradicts: true` result with the reason string — the caller
(auto-promotion sweep) refuses the promotion; downstream a human reviews.

We trade precision for determinism: every run of the check yields the
same answer given the same database state, which keeps G3 auto-promotion
idempotent and predictable.

### 3.4 Stale detection (AC4)

```
STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000   // 90 days
```

An `active` item is stale if `updated_at < now - STALE_THRESHOLD_MS`. The
`knowledge_edit_log` would be a richer signal (time of last non-system
edit), but `updated_at` already reflects every meaningful write and is
what the Knowledge view sorts on. A future story can refine if the heuristic
proves insufficient — documented as a follow-up in §8.

Transition: `active → stale`, editor = `'agent:auto-promotion'`, using the
same conditional-UPDATE pattern as G1.

### 3.5 Auto-promotion sweep

```
runAutoPromotionSweep(db, eventBus, options?):
  for each provisional item P:
    signature = signatureFor(P)
    distinctScopes = countDistinctScopes(signature, excluding archived)
    if distinctScopes < AUTO_PROMOTION_REPETITION_THRESHOLD: skip
    if hasOpenConflict(P.id):                                  skip  // AC5
    contradiction = detectLayerContradiction(P)
    if contradiction.contradicts:
      emit knowledge_updated {action: 'contradiction_flagged'}
      skip  // AC3
    promoteToValidated(P, editor='agent:auto-promotion')
```

`promoteToValidated` reuses the exact logic from
`promote-knowledge.ts` (transaction, gate, conditional UPDATE, edit log).
We extract that gate+update+log into a helper in the new pipeline file so
both the tool and the sweep share the same implementation and both satisfy
G1 AC5.

Each successful promotion emits a `knowledge_updated` event
`{ action: 'auto_promoted', itemId }` so UI / Triage subscribers see
the change.

### 3.6 Stale sweep

```
runStaleSweep(db, eventBus, now):
  for each item where status='active' AND updated_at < now - STALE_THRESHOLD_MS:
    markStale(item.id, now)  // active -> stale, editor = agent:auto-promotion
    emit knowledge_updated {action: 'marked_stale'}
```

### 3.7 Practice meeting (AC6)

A practice meeting is identified by an **anchor row** in `knowledge_items`:

```
kind:   'reflection'
layer:  'L2'
scope_id: caller-supplied community or product id
topic:  'practice_meeting'
meta:   '{"role":"anchor","turnsCompleted":[], ... }'
status: 'captured'
```

No new table — per the plan constraint that G3 introduces no schema
changes.

**Turn 1 — proposals.** Input is `{ meetingId, proposals: Proposal[] }`.
For each proposal, create a `knowledge_items` row with `status='captured'`
and `meta.meetingId = anchor.id`, `meta.meetingPhase = 'proposal'`.
Append turn 1 to the anchor's `meta.turnsCompleted`.

**Turn 2 — reactions.** Input is
`{ meetingId, reactions: { proposalId, body, author }[] }`. Create a
reaction `knowledge_items` row per reaction with `meta.meetingPhase =
'reaction'`, `meta.proposalId` pointing at the proposal. Append turn 2
to the anchor's `meta.turnsCompleted`.

**Turn 3 — synthesis.** Input is
`{ meetingId, synthesis: { title, body, layer, scopeId, topic, kind? }[] }`.
Create 1..N `knowledge_items` rows with `status = 'provisional'` (the
synthesized output is the PROMOTED result — it jumps to provisional
because the meeting has already surfaced, critiqued, and agreed on it —
matching AC6 "turn 3 creates/updates items"). Archive all of the meeting's
proposal and reaction items (their role is intermediate). Append turn 3 to
the anchor's `meta.turnsCompleted`.

**Ordering.** The anchor's `meta.turnsCompleted` is the source of truth
for turn order. `runPracticeMeetingTurn(meetingId, turnNumber, input)`
rejects with `INVALID_TURN` if the requested turn is not one greater than
the last completed turn (i.e. turn 2 before turn 1, or turn 1 twice).

**Event emission.** Every created or archived item emits a
`knowledge_updated` domain event with `action = 'practice_meeting_turn_<N>'`.

### 3.8 Transaction boundaries

- Auto-promotion: one transaction per item (gate + UPDATE + edit log).
- Stale sweep: one transaction per item (UPDATE + edit log).
- Practice meeting turn: one transaction per turn (anchor read + row
  inserts + anchor meta update + edit logs).

The sweep drivers loop over candidates serially — SQLite's per-transaction
serialization is sufficient for the expected volumes (dozens of items per
sweep) and parallel execution would buy nothing while making ordering
harder to reason about.

---

## 4. Test → AC mapping

All tests are written red-first before any implementation.

### 4.1 `packages/fabric/src/__tests__/promotion-pipeline.test.ts` — NEW

AC2 (auto-promotion at 5+ cross-scope repetitions):

| # | Test | Binds to |
|---|------|---------|
| 2.1 | `checkAutoPromotion returns shouldPromote=true when 5 distinct scopes match signature` | AC2 |
| 2.2 | `checkAutoPromotion returns shouldPromote=false at count=4 (just below threshold)` | AC2 |
| 2.3 | `checkAutoPromotion ignores archived items in the count` | AC2 |
| 2.4 | `checkAutoPromotion ignores items without scope_id (can't demonstrate cross-product)` | AC2 |
| 2.5 | `runAutoPromotionSweep promotes provisional→validated when count>=5, no conflicts, no contradictions` | AC2 + AC5 integration |
| 2.6 | `runAutoPromotionSweep emits knowledge_updated action=auto_promoted` | AC2 |
| 2.7 | `runAutoPromotionSweep writes editor='agent:auto-promotion' on the edit log` | AC2 constraint |

AC3 (layer contradiction flagged, not auto-promoted):

| # | Test | Binds to |
|---|------|---------|
| 3.1 | `detectLayerContradiction returns contradicts=true when L4 principle.meta.forbids overlaps L3.meta.claims` | AC3 |
| 3.2 | `detectLayerContradiction returns contradicts=true when L4 principle.meta.forbids contains the L3 topic` | AC3 |
| 3.3 | `detectLayerContradiction returns contradicts=false when no overlap` | AC3 |
| 3.4 | `detectLayerContradiction returns contradicts=false when topics don't match` | AC3 |
| 3.5 | `runAutoPromotionSweep does NOT promote when contradiction detected, even with 5+ repetitions` | AC3 |
| 3.6 | `runAutoPromotionSweep emits knowledge_updated action=contradiction_flagged` | AC3 |

AC4 (stale detection):

| # | Test | Binds to |
|---|------|---------|
| 4.1 | `findStaleItems returns active items with updated_at older than 90 days` | AC4 |
| 4.2 | `findStaleItems does NOT return active items within 90 days` | AC4 |
| 4.3 | `findStaleItems does NOT return non-active items (stale, provisional, etc.)` | AC4 |
| 4.4 | `markStale transitions active→stale and writes edit log with editor='agent:auto-promotion'` | AC4 constraint |
| 4.5 | `runStaleSweep emits knowledge_updated action=marked_stale` | AC4 |

AC5 integration (open conflict prevents promotion):

| # | Test | Binds to |
|---|------|---------|
| 5.1 | `runAutoPromotionSweep does NOT promote when an open conflict exists on the item, even with 5+ repetitions` | AC5 |
| 5.2 | `runAutoPromotionSweep DOES promote when only resolved/discarded conflicts exist` | AC5 |

### 4.2 `packages/server/src/__tests__/practice-meeting.test.ts` — NEW

AC6 (3-turn practice meeting):

| # | Test | Binds to |
|---|------|---------|
| 6.1 | `turn 1 creates proposal knowledge_items with status=captured and meta.meetingId` | AC6 |
| 6.2 | `turn 2 creates reaction knowledge_items linked to proposals via meta.proposalId` | AC6 |
| 6.3 | `turn 3 creates synthesized knowledge_items with status=provisional` | AC6 |
| 6.4 | `turn 3 archives all proposal and reaction intermediates` | AC6 |
| 6.5 | `running turn 2 before turn 1 returns INVALID_TURN` | AC6 ordering |
| 6.6 | `running turn 1 twice returns INVALID_TURN on the second call` | AC6 ordering |
| 6.7 | `each turn emits knowledge_updated events for created/updated items` | AC6 |
| 6.8 | `unknown meetingId returns NOT_FOUND` | AC6 robustness |

Total planned new tests: 7 (AC2) + 6 (AC3) + 5 (AC4) + 2 (AC5) + 8 (AC6) = **28**.
Minimum to pass the verification gate (+15): easily met.

---

## 5. Implementation order

1. Write the plan (this file).
2. Write all failing tests (§4.1, §4.2). Run `bun run test` — confirm the
   new tests fail with module-missing or API-shape errors.
3. Implement `packages/fabric/src/promotion-pipeline.ts`. Make §4.1 green.
4. Re-export public symbols from `packages/fabric/src/index.ts`.
5. Implement `packages/server/src/services/practice-meeting.ts`. Make
   §4.2 green.
6. Run `bun run check && bun run lint && bun run test`. Fix whatever is
   yellow.
7. Append any non-obvious decisions as inline `@lore` comments.

---

## 6. Data model changes

**None.** Every new behavior uses existing columns:

| Behavior | Columns / tables read |
|----------|-----------------------|
| Auto-promotion signature | `knowledge_items.layer`, `.topic`, `.kind`, `.scopeId`, `.status` |
| Contradiction heuristic | `knowledge_items.layer`, `.kind`, `.topic`, `.meta` (JSON) |
| Stale detection | `knowledge_items.status`, `.updatedAt` |
| Practice meeting | `knowledge_items.meta` (JSON), `.status`, `.kind`, `.layer` |

No migration required. No new event type (reuses `knowledge_updated`).

---

## 7. Risks & trade-offs

### 7.1 Signature scaling

`(layer, topic, kind)` signature matches may hit items in the thousands as
the knowledge corpus grows. The auto-promotion sweep runs a
`SELECT COUNT(DISTINCT scope_id)` aggregate per provisional item.
Mitigation: indexed columns (`ki_layer_idx`, `ki_topic_idx`, `ki_kind_idx`,
`ki_status_idx`) make this fast at the sizes we expect in G3/G4. If
profiling later shows a hot loop, the sweep switches to a single
`GROUP BY (layer, topic, kind)` query building an in-memory count table.

### 7.2 Contradiction heuristic recall

The structural `meta.forbids` / `meta.claims` heuristic will miss the
majority of real contradictions written only in prose. AC3 asks only that
structural contradictions block auto-promotion; prose-level contradictions
require the attention engine + human review. Documented, bounded, and
deterministic — we ship the narrow version and flag the gap.

### 7.3 Stale detection by `updated_at` alone

An item edited by a bot (materialization engine bumping `meta.usageCount`)
would reset `updated_at` even though no human interacted with it. If that
becomes noisy, the next iteration uses `knowledge_edit_log` with a
non-system editor filter.

### 7.4 Concurrency

Each per-item transition runs in its own SQLite transaction with the
conditional-UPDATE pattern from G1 (`WHERE status = fromStatus`). Two
racing callers cannot both succeed — loser sees 0 rows changed and the
sweep silently skips (the sweep is idempotent — next tick re-evaluates).

### 7.5 Practice meeting turn idempotency

If a turn runs twice (e.g. the scheduler retries after a crash), we return
`INVALID_TURN`. We do NOT attempt auto-resume: the caller is responsible
for inspecting `anchor.meta.turnsCompleted` and deciding whether to
advance. This is the conservative choice — re-running a synthesis turn
would archive the proposals twice and double-insert the synthesized items.

### 7.6 `KnowledgeKind` enum pressure

We do not add `proposal` / `reaction` / `practice_meeting` kinds to the
union because doing so ripples to every switch/case site that keys on
`kind`. Instead, meeting-phase disambiguation lives in
`meta.meetingPhase`. This isolates the feature to G3 and lets the G3+ path
evolve without a cross-package schema change.

---

## 8. Follow-ups (out of scope for G3)

- **Signature tuning** — once the corpus has real data, revisit whether
  `(layer, topic, kind)` is the right grouping or if a richer similarity
  key (e.g. title-hash, meta.signature) yields cleaner auto-promotions.
- **Prose contradiction detection** — wire the attention engine's
  "conflict" signal into the contradiction check so prose-level
  contradictions also block auto-promotion.
- **Edit-log-driven staleness** — switch `findStaleItems` to honor
  `knowledge_edit_log` with editor ≠ `agent:*` for a "human last touched"
  signal once materialization noise becomes an issue.
- **Routine wiring** — G4 will schedule the two sweeps (auto-promotion,
  stale) and the weekly practice meeting.
