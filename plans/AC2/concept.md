# AC2 Concept: Bet Hypothesis Validation Flow

## Required reading for downstream agents

- `plans/AC1/concept.md` -- locked concept for Structured Outcome Fields (AC2's foundation)
- `plans/AC1/architecture.md` -- AC1 technical plan
- `plans/AC1/design/approved.md` -- AC1 approved design
- `docs/knowledge-architecture/the-five-layers.md` -- L0-L4 layer definitions, promotion rules
- `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` -- projection model, materialization
- `docs/knowledge-architecture/canonical-shapes.md` -- knowledge_items and knowledge_strategy_fabric shapes
- `docs/process-layer/bets-shape-commit-change-ship.md` -- bet lifecycle, ship → retro flow
- `docs/process-layer/retros-and-reviews-learning-flows-back-up.md` -- retro process definition
- `docs/human-interface-layer/verdict-actions.md` -- existing verdict vocabulary (collision surface)
- `packages/fabric/src/types.ts` -- KnowledgeKind, KnowledgeLayer, KnowledgeStatus
- `packages/fabric/src/services/builtin-routines.ts` -- `builtin:post-bet-retro` routine
- `packages/db/src/schema.ts` -- bets (with AC1 outcome fields), knowledgeItems, knowledgeStrategyFabric
- `packages/shared/src/types.ts` -- BetOutcomeVerdict, BET_OUTCOME_VERDICTS
- `packages/web/src/pages/WorkBet.tsx` -- existing bet detail page with AC1 outcome section
- `packages/web/src/types/bet.ts` -- BetDetail type

---

## Phase 0 -- Identify the nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Validation** | A structured, guided post-ship act by the founder comparing what was predicted (hypothesis) against what happened, recording a verdict, and capturing learnings. | New concept (not a primitive -- it is a flow/act, not an entity) |
| **Retro knowledge item** | A knowledge item created as the output of validation, carrying structured retro data (hypothesis, reality, verdict, learnings). | New specialization of existing `knowledgeItems` entity |
| **AI-assisted draft** | A facilitator agent generating a pre-filled verdict, summary, and learnings suggestion for the founder to review and edit. | New interaction pattern (not a primitive) |
| **Bet** | Existing primitive. Time-boxed committed unit of work with hypothesis and done condition. | Stable -- used as-is |
| **Outcome** | Existing inline field group on bets (verdict + summary). AC1 locked this. | Stable -- AC2 extends the UI flow around it, does not change the data shape |
| **Knowledge item** | Existing entity. Scoped, versioned content in the canonical store. | Stable -- AC2 creates instances of it, does not reshape it |
| **Knowledge promotion** | Existing pipeline. Items flow up L0→L4 through facilitator agents and human curation. | Stable -- AC2 feeds into it, does not change it |

Only **Validation** and **Retro knowledge item** enter the full probe. The AI-assisted draft is an interaction pattern, not a concept that needs probing -- it is a standard agent-suggest-human-reviews flow.

---

## Phase 1 -- Probe the essence

### Validation

**Probe 1: Identity -- What IS a Validation?**

My read: A Validation is NOT an entity. It is a **guided flow** -- a sequence of user interactions that transforms the AC1 inline outcome fields (verdict + summary) and simultaneously produces a retro knowledge item. The flow itself has no persistent identity. The bet's outcome fields and the created knowledge item are the durable artifacts; the flow is ephemeral.

The temptation: make Validation a first-class entity with its own row in a `validations` table (status: draft/complete, linked to bet, linked to knowledge item). This is over-engineering. The cardinality is 1:1 with the bet outcome -- there is no "validation without an outcome" or "outcome without a validation." The bet's `outcomeVerdict !== null` IS the evidence that validation occurred.

Decision: Validation is a **UI-layer flow**, not a data-layer entity. It composes the existing bet outcome PATCH (AC1) with a new knowledge item creation into one guided interaction. No new table. No new ID.

**Probe 2: Essential properties -- What must every Validation have?**

My read: A validation flow must include:
1. **Side-by-side comparison**: the original hypothesis text (immutable, from `bets.hypothesis`) and a reality summary (what actually happened, written by the founder or drafted by AI)
2. **Verdict selection**: choosing one of the four BetOutcomeVerdict values (validated/refuted/partial/inconclusive) -- this writes to the AC1 `outcomeVerdict` field
3. **Learnings capture**: free-text that becomes the body of the retro knowledge item
4. **Knowledge item creation**: the output -- a `knowledgeItems` row with scope_kind='bet', scope_id=betId, and kind='reflection' on its fabric row

What is NOT essential:
- A score or numeric rating (that is AC4 rubric territory)
- Multiple rounds of validation (the flow is one-shot; re-validation overwrites via the AC1 mechanism)
- Approval by another party (the founder validates alone; the retro item can be curated later via the normal Knowledge view)

**Probe 3: Authority -- Who performs Validation?**

My read: Only the founder (human user) can complete a validation. The AI-assisted draft is a suggestion -- the agent proposes, the human confirms. This matches the "humans validate, agents execute" design principle. The validation act is inherently human: did my prediction match reality?

The `outcomeRecordedBy` field (AC1) records who saved. For AI-assisted drafts, the `outcomeRecordedBy` is still the founder (the human who clicked Save), not the agent that drafted the suggestion. The agent is an invisible helper, not the author of record.

### Retro Knowledge Item

**Probe 1: Identity -- What IS a Retro Knowledge Item?**

My read: A retro knowledge item is a regular `knowledgeItems` row, distinguished by:
- `scopeKind = 'bet'` and `scopeId = <betId>` (scoped to the specific bet)
- `kind = 'reflection'` on the `knowledgeStrategyFabric` row (NOT a new kind "retro")
- A structured body format that embeds the hypothesis, verdict, reality, and learnings

Critical decision: the AC2 spec says "kind: retro" but `KnowledgeKind` already has `"reflection"` which is defined as "retrospective observations" in the eval scenarios and is used for practice meeting outputs. A bet retro IS a retrospective observation. Adding a ninth `"retro"` kind would:
- Split the concept (reflection vs retro) where none exists
- Require updating the KnowledgeKind type, all downstream consumers, and the global search
- Create vocabulary confusion: "Is my post-bet learning a reflection or a retro?"

The answer: use `kind = 'reflection'`. The spec's "kind: retro" is shorthand for the concept, not a literal enum value. The `scopeKind = 'bet'` filter is what distinguishes bet retro reflections from other reflections (practice meeting outputs, brand observations). Queryable: `WHERE scope_kind = 'bet' AND kind = 'reflection'`.

**Probe 2: Essential properties -- What must every Retro Knowledge Item have?**

My read: The retro knowledge item body must include structured sections:
- **Hypothesis** (immutable text copied from `bets.hypothesis` at validation time -- not a reference, a snapshot)
- **Verdict** (the BetOutcomeVerdict value at the time of creation)
- **Reality summary** (what actually happened)
- **Learnings** (what the founder extracted as reusable knowledge)

These are stored as markdown sections in the `body` field, not as separate columns. The knowledge system stores body as markdown text; blocks are derived at render time. Adding columns for hypothesis/verdict/learnings would be a new entity shape -- rejected per the "knowledge items are generic" design.

However: the body includes a machine-readable header (YAML frontmatter or structured marker) so that querying and promotion logic can extract the verdict and hypothesis without parsing free-text markdown. Format:

```
---
betId: <id>
hypothesis: <text>
verdict: <validated|refuted|partial|inconclusive>
---

## Reality

<founder-written or AI-drafted text>

## Learnings

<founder-written or AI-drafted text>
```

**Probe 3: Lifecycle -- How does a Retro Knowledge Item move through states?**

My read: Created as `status = 'active'` (not draft). The validation flow is the creation act -- by the time the founder clicks Save, the content is reviewed and intentional. This differs from agent-proposed knowledge (which starts as 'draft' and needs human triage). The founder IS the human reviewer; creating it already constitutes triage.

After creation, the item follows the standard knowledge lifecycle: active → stale → archived (via the knowledge decay routine). Promotion (L-layer escalation) happens through the existing facilitator pipeline -- if the same learning appears in 3+ bets, the practice facilitator can propose it as an L3 practice item. AC2 does not build promotion logic; it feeds the existing pipeline.

**Probe 4: Vocabulary collision -- "retro" vs existing terms**

Collisions identified:
1. **"retro" vs `builtin:post-bet-retro` routine**: The existing routine creates a review item (an `items` row on a thread) when a bet completes. AC2 creates a knowledge item when the founder validates. These are different acts: the routine fires automatically on bet completion (producing a review thread for human attention); the validation is a human-initiated act that produces queryable knowledge. They are complementary, not conflicting. The routine says "hey, this bet shipped, do a retro." The validation IS the retro.
2. **"retro" vs "reflection" kind**: Resolved above -- use `kind = 'reflection'`, not a new `kind = 'retro'`.
3. **"validation" vs `knowledgeStatus = 'validated'`**: The knowledge status 'validated' means a knowledge item has been confirmed as reliable. AC2's "validation" means evaluating a bet hypothesis. Different axes. Context disambiguates: "bet validation" vs "knowledge validation." No rename needed but documentation must be clear.
4. **"validation" vs `BetOutcomeVerdict = 'validated'`**: The verdict value 'validated' means the hypothesis held. The flow "validation" means the act of evaluating. "I validated the bet" (did the flow) vs "the verdict is validated" (the hypothesis held). English is ambiguous here. In the UI, the flow is labeled "Evaluate hypothesis" or "Record retro" -- not "Validate" -- to avoid confusion with the verdict value.

---

## Phase 2 -- Rejection list

### What Validation is NOT

1. **Validation is not a separate entity.** It has no ID, no row in a table, no lifecycle of its own. It is a UI flow that composes two existing operations (bet outcome PATCH + knowledge item creation). Why: 1:1 cardinality with bet outcome; a separate entity would need its own state machine (draft/in-progress/complete) for no gain. The bet's `outcomeVerdict !== null` IS the completion evidence.

2. **Validation is not automatic.** The spec says "AI-assisted drafting" but this is a suggestion, not an autonomous evaluation. No agent decides whether a hypothesis held. AC3 adds evaluator agents; AC2 is strictly human-in-the-loop with optional AI drafting assistance. The line: the agent writes a first draft; the founder has final authority.

3. **Validation is not a gate.** Completing validation does not change the bet's status. A completed bet with no validation is a valid state (the "not evaluated" indicator from AC1 persists). There is no workflow that blocks on validation. This is the same progressive enhancement principle from AC1.

4. **Validation is not a review.** The existing `builtin:post-bet-retro` routine creates a review item on a thread for the founder's attention. Validation is the founder's response to that review -- or an independent act initiated from the bet detail page. Validation does not produce a review item; it produces a knowledge item. The review and the knowledge are complementary outputs from the same reflective moment.

5. **Validation is not a multi-step wizard.** The spec says "guided flow" but this is a single-page interaction: the founder sees hypothesis + reality side-by-side, fills in verdict + learnings, clicks Save. There is no next/back, no multi-page wizard, no progress bar. One screen, one save.

6. **Validation is not quantitative analysis.** AC4 adds rubric scoring with metrics. AC2 is qualitative: did the hypothesis hold? What did we learn? No numbers, no dashboards, no charts.

### What a Retro Knowledge Item is NOT

1. **It is not a new kind.** It uses `kind = 'reflection'` on the fabric row, not a new `kind = 'retro'`. Why: "reflection" already means "retrospective observations" and is the semantic match. Adding a ninth kind splits the concept without benefit. The `scopeKind = 'bet'` + `kind = 'reflection'` pair is the discriminator.

2. **It is not a separate system.** The spec says "enters the existing knowledge pipeline." The retro item is a regular knowledge item, queryable and promotable through the same views, the same decay routine, the same facilitator pipeline. No parallel retro system.

3. **It is not immutable after creation.** The founder can edit the body (learnings, reality summary) through the standard Knowledge view PATCH. The embedded hypothesis snapshot in the body IS immutable (the spec says "no post-hoc rationalization") -- but this is enforced by convention (the hypothesis text is embedded as a read-only header block in the body), not by a technical lock. The bet's actual `hypothesis` field is the source of truth for the original prediction.

---

## Phase 3 -- Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **validation flow** | The guided interaction for evaluating a bet's hypothesis. A UI flow, not an entity. | retro flow (ambiguous with routine), evaluation wizard, hypothesis review (collides with thread review) |
| **retro knowledge item** | A knowledgeItems row created by the validation flow, scoped to a bet, kind='reflection'. | retro item (informal OK in conversation, not in code), retrospective, retro entry |
| **hypothesis snapshot** | The immutable copy of `bets.hypothesis` embedded in the retro knowledge item body at creation time. | original hypothesis (ambiguous), prediction |
| **reality summary** | The founder-written (or AI-drafted) description of what actually happened. Part of the retro knowledge item body. | actual outcome (collides with AC1 outcomeSummary), what happened |
| **learnings** | The reusable knowledge extracted from comparing hypothesis vs reality. Part of the retro knowledge item body. | takeaways, insights (too vague), lessons learned (corporate speak) |
| **AI-assisted draft** | A facilitator agent's suggested verdict + summary + learnings, pre-filled for the founder to review and edit. | auto-draft, AI suggestion, agent proposal |

**Critical:** The UI label for the validation flow action is "Evaluate hypothesis" or "Record retro" -- NOT "Validate" (which collides with the verdict value "validated"). The section header on the bet detail page is "Retro" -- not "Validation" (too generic and collides with knowledge status).

---

## Phase 4 -- Contracts

### Cardinality contracts

- Each bet has at most one retro knowledge item (0:1). If the founder re-validates (overwriting the outcome), the existing knowledge item is updated in place (body overwritten with audit), NOT replaced with a new row.
- The validation flow creates exactly one knowledge item per completion. There is no "partial validation" that creates a draft knowledge item.

### Closure contracts

- The retro knowledge item body format (YAML frontmatter + markdown sections) is a **convention contract**: the frontmatter schema (`betId`, `hypothesis`, `verdict`) is fixed. Adding a frontmatter field requires updating this concept doc.
- The `kind = 'reflection'` value is from the existing closed `KnowledgeKind` enum. No new enum value is introduced by AC2.
- The verdict in the frontmatter mirrors `BetOutcomeVerdict` -- same closed enum (validated/refuted/partial/inconclusive).

### Mutability contracts

- The hypothesis snapshot in the retro body is **immutable by convention**. The body field itself is mutable (standard knowledge editing), but the hypothesis section must not be altered. This is enforced by the UI (hypothesis renders as a read-only block in the Knowledge detail view for bet-scoped reflections), not by a database constraint.
- The verdict, reality summary, and learnings sections in the body are mutable through the standard knowledge PATCH. Re-validation from the bet detail page updates both the bet outcome fields AND the retro knowledge item body atomically.
- The `outcomeRecordedAt` and `outcomeRecordedBy` fields on the bet track the LATEST evaluation, not the first. Same mutability as AC1.

### Identity contracts

- The retro knowledge item is identified by its `knowledgeItems.id` (opaque UUID), same as all knowledge items.
- The link between a bet and its retro knowledge item is: `scope_kind = 'bet'` AND `scope_id = betId`. There is no FK from the bet to the knowledge item. The query `SELECT * FROM knowledge_items WHERE scope_kind = 'bet' AND scope_id = ? AND EXISTS (SELECT 1 FROM knowledge_strategy_fabric WHERE kind = 'reflection' AND knowledge_item_id = knowledge_items.id)` finds the retro item.
- Deduplication: at most one `kind = 'reflection'` knowledge item per bet. Enforced at the API level (upsert behavior), not by a unique index (the unique index would span two tables -- knowledgeItems.scope_kind+scope_id + knowledgeStrategyFabric.kind -- which is not possible in a single constraint).

### Hard rules

1. **The hypothesis snapshot is immutable.** The original hypothesis text from `bets.hypothesis` is copied into the retro knowledge item body at creation time. The copy is never updated even if `bets.hypothesis` changes later (it shouldn't -- the spec says hypothesis is locked after ship, but defense in depth). The snapshot IS the historical record.
2. **Validation does not block bet completion.** The bet can be in status `completed` with no validation performed. The "not evaluated" indicator from AC1 persists indefinitely.
3. **The retro knowledge item enters the existing pipeline.** No separate promotion path, no special facilitator, no bypass. `scope_kind = 'bet'` places it outside the L0-L4 layer system (SCOPE_TO_LAYER maps 'bet' to null). However, the learnings CAN be promoted -- a facilitator agent can create a new L3 practice item citing this retro item. The retro item itself stays at scope_kind='bet' (bet-scoped, not layer-assigned).
4. **AI-assisted drafting is cost-capped.** The facilitator agent call for draft generation is subject to the existing cost cap system (session cost tracking, cost sentinel). The draft request must not exceed one LLM call.
5. **The existing `builtin:post-bet-retro` routine is preserved.** AC2 does NOT replace or modify the routine. The routine creates a review thread item; AC2 creates a knowledge item. They coexist. The validation flow MAY be triggered from the review item (the founder reads the retro review, then clicks through to record the validation), but this navigation is a UI convenience, not a data dependency.

---

## Phase 5 -- Rationale

The gap AC2 fills: today, when a bet ships, the `builtin:post-bet-retro` routine creates a review item that asks "did the hypothesis hold?" The founder can record a verdict (AC1), but the learnings stay as prose in a thread message -- unstructured, unqueryable, invisible to the knowledge pipeline. AC2 closes this gap by pairing the verdict with a structured knowledge item that captures hypothesis, reality, and learnings in a format the knowledge system can query, promote, and surface to future bets.

The key design tension is: "should the retro be a new entity or a specialization of existing entities?" We chose specialization because:
- The outcome verdict already lives on the bet (AC1). Duplicating it in a new entity creates a sync problem.
- The learnings are knowledge. The knowledge system already handles scoping, promotion, and decay. Building a parallel retro system would be pure accidental complexity.
- The validation flow is the UI that ties these two existing write operations together into one guided interaction.

The decision to use `kind = 'reflection'` (not a new 'retro' kind) follows from the concept docs: "reflection" means "retrospective observations." A bet retro IS a retrospective observation. The discriminator is scope, not kind. This keeps the KnowledgeKind enum tight and avoids the "one enum value per feature" anti-pattern.

---

## Phase 6 -- Self-critique

**Is the rejection list substantive?** Yes -- six distinct rejections for Validation, three for Retro Knowledge Item. Each names a real temptation ("make it a gate," "make it a wizard," "add a new kind") with a concrete reason for rejection.

**Does the canonical term collide?** Three collisions identified and resolved:
1. "retro" vs `builtin:post-bet-retro` -- complementary, not conflicting (review item vs knowledge item)
2. "reflection" already used -- this is a feature, not a bug; we reuse the kind
3. "validation" vs `validated` verdict and `validated` knowledge status -- disambiguated by context ("bet validation" = the flow, "verdict: validated" = the hypothesis held, "status: validated" = the knowledge item is confirmed)

Verified via grep: `KnowledgeKind` has `"reflection"` at `packages/fabric/src/types.ts:57`. `KnowledgeStatus` has `"validated"` at `packages/fabric/src/types.ts:39`. The knowledge `status = 'validated'` and the bet `outcomeVerdict = 'validated'` are in different domains with no shared code path.

**Are the contracts complete?** Cardinality (0:1 per bet), closure (no new enum value), mutability (hypothesis snapshot immutable by convention, rest mutable), identity (UUID, found via scope query), and five hard rules. The deduplication contract (at most one per bet, enforced at API level) is the weakest point -- no DB-level constraint. Acceptable because: single-user system (founder only), the upsert API prevents duplicates, and a stray duplicate is harmless (the knowledge view shows both, the founder deletes one).

**Is the rationale concrete?** Yes -- names the specific gap (prose in threads vs structured knowledge), the design tension (new entity vs specialization), and the deciding factor (avoiding sync problems and parallel systems).

**Missing doc updates?** The `docs/knowledge-architecture/canonical-shapes.md` does not need updating because no new kind or shape is introduced -- the retro knowledge item is a regular `knowledgeItems` row with a convention for body format. The `docs/process-layer/retros-and-reviews-learning-flows-back-up.md` could mention that AC2 makes the retro produce structured knowledge, but that is a documentation improvement, not a concept-level change. Deferred.

---

## Canonical body format for retro knowledge items

```markdown
---
betId: <bet-id>
hypothesis: <original hypothesis text, immutable snapshot>
verdict: validated | refuted | partial | inconclusive
validatedAt: <ISO 8601 timestamp>
validatedBy: <user id>
---

## Reality

<What actually happened. Written by the founder or AI-drafted and edited.>

## Learnings

<Reusable knowledge extracted from comparing hypothesis vs reality.>
```

This frontmatter is the structured overlay that makes retro items queryable beyond full-text search. The markdown body below the frontmatter renders in the Knowledge view through the standard block derivation pipeline (deriveBlocks).
