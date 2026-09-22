# Facilitators

Most agent systems have workers (agents that do things) and maybe an orchestrator (routes work). They're missing the role that actually makes knowledge compound: **the facilitator** — a dedicated agent whose entire job is to organize knowledge, score what needs human attention, and collect exactly the feedback that converts information into knowledge. The role a great librarian, community manager, or editor plays in a human org. Without them, information accumulates but knowledge doesn't.

> **Load-bearing doc.** `layers/core-api/knowledge/src/promotion-pipeline.ts` quotes the auto-promotion sentence in §Auto-promotion verbatim (code comment still references `KNOWLEDGE_ARCHITECTURE.md §6.5` — the old monolith path; update that comment when renaming). Change that section and the code comment together.

## The facilitator family

| Scope of care | Agent | What they organize |
|-------|-------|--------------------|
| Factory-wide | **System Agent** (factory-level singleton, `layers/core-api/src/bootstrap/factory-state.ts`) | Factory-scoped knowledge above the per-product teams |
| Practice (per community) | **Facilitator** (one per community: build/product/growth/ops, plus facilitation itself) | Role-specific practices, anti-patterns, conflicts, community-wide learnings |
| Product (per team) | **Product Manager** (one per product) | Product cycles, team coordination, task shaping, cross-function handoffs — and its own facilitation quality |

In code: role `facilitator`, category `individual` (`framework/domain-model/src/agent-roles.ts` — renamed from `practice_facilitator`, @lore AD8c; moved from `strategy` to `individual` in BA9d). Facilitators are now provided by the document-management plugin (BA9d wave 2), not seeded at factory boot. The Product Manager is a `team`-category agent ("Team lead") — its facilitator hat is a conceptual framing, not a code category. The assistant is a per-user individual agent with guardrails (@lore AD8b). Role identity and the full taxonomy live in [agent-model](../agent-layer/agent-model.md).

Facilitators don't do the work itself — no code, no copy, no deploys. Worker agents (builder, growth, ops, …) do that. Facilitators coordinate, organize, score, and route: the factory's nervous system.

Worker agents sit in a **matrix**: each reports vertically to its Product
Manager and belongs horizontally to a community of practice led by a
facilitator.

**A practice is a role, and a practice is now a tree location, not a scope value.** `scope_kind='practice'` is gone — `SCOPE_KINDS` is exactly `factory | team | user` (`framework/domain-model/src/types.ts`). Every practice is instead an ordinary knowledge item nested under a "Practices" root (seeded once, migration `0080`), one folder per practice, named for the role it serves — `Building`, `Product Manager`, `Growth`, and so on. A practice can nest its own knowledge inside it exactly the way any other knowledge item can. Because Practices items are `factory`-scoped, they reach every session the same way any other factory item does — there is no subtree selection that hands an agent only "its" practice; every agent's session receives every practice folder, same as every other factory item.

**Matching an agent to its own practice is title matching, and it is a deliberate stopgap, not a mechanism.** Nothing in the schema or the assembler ties an agent's `role` string to a specific practice item's id — the practice folder is simply named after the role it serves, by convention, at seed time (`PRACTICE_FOLDER_ID`, `tools/setup/src/demo-world/knowledge.ts`). Founder: *"for now whatever works and later we will launch a session to rework that entire role/practice aspect since it seems broken."* Whether a practice and an agent role are one thing, and whether agents should be assigned practices by id instead of by name, is an open question for a future session — not something this doc should describe as settled.

The fifth practice — for **facilitation itself** — means the facilitators form their own community of practice (`seed-agent-pf-facilitation`). Turtles stop there.

## What facilitators do

1. **Continuously organize.** Merge duplicates, resolve conflicts (`knowledgeConflicts`, `framework/db/src/schema.ts:962`; see [sync-and-conflict-resolution](./sync-and-conflict-resolution.md)), archive stale items (stale sweep, `layers/core-api/knowledge/src/promotion-pipeline.ts`), nest and reorder for retrievability.
2. **Score every item for human attention.** Weighted 8-signal attention score, threshold 0.7 → review item. Signal and question tables live in [relevance-and-attention](./relevance-and-attention.md).
3. **Shape the human's queue for their scope.** The facilitator curates the Knowledge view triage queue; the Product Manager shapes the coming cycle's tasks.
4. **Ask for the right kind of feedback.** A contradicting pair needs *resolution*; a novel pattern needs *validation*; a stable-but-stale practice needs *retirement or extension*. The facilitator picks the question — the question-kind routing table is in [relevance-and-attention](./relevance-and-attention.md). (Design intent; the question strings aren't in code yet.)
5. **Close the loop.** Human feedback is written back into the knowledge store (`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`) and bumps confidence/attention scores.

## Information → knowledge: the lifecycle

Raw capture is not knowledge. A task outcome, a failed attempt, a decision record — these are *information*. They become *knowledge* only when validated, contextualized, and proven reusable. Every item has a status:

```
PROPOSED       ─┐
               │  (created — by a human, by an agent's writeback, by a directory materialising)
               ▼
ACTIVE         ─┐
               │  (a human vouches for it, or it auto-promotes on repetition)
               ▼
STALE          ─┐
               │  (no reads, no references, decaying — the weekly sweep sets this)
               ▼
ARCHIVED
```

Implemented as `KNOWLEDGE_STATUSES` — `proposed | active | stale | archived` (`framework/domain-model/src/knowledge.ts`). This collapses what used to be **two** status vocabularies — a 7-value kernel enum (`captured`/`provisional`/`validated`/`active`/`stale`/`archived`/`needs_human`) and a 4-value strategy-side one — into one. `needs_human` is gone entirely: crossing the attention threshold creates a review item directly (see below); it no longer gates or blocks an item's own status. There is no separate authorization/facilitator-role gate on who may promote an item — the layer-keyed permission check this used to have (`NON_FACILITATOR_MAX_LAYER`, `FACILITATOR_ROLES`) is deleted along with `layer`, and nothing replaces it. Founder: *"we don't need authorization checks. later we can risk based checks which isolate what needs review."*

### Auto-promotion

**Most items never need a human.** If the same finding shows up independently under 5+ distinct scopes and never gets contradicted, it auto-promotes from `proposed` straight to `active` via repetition. Implemented in `layers/core-api/knowledge/src/promotion-pipeline.ts` — the grouping key used to be `(layer, topic, kind)`; with those three vocabularies deleted, the signature is now the sibling set — same `parentKind`/`parentId` — counted by distinct `scope_id` among those siblings (threshold 5, edit-log editor marker `system:auto-promotion`, `AUTO_PROMOTION_EDITOR`). An open conflict on the item blocks its own promotion. Human attention is the scarcest resource; facilitators exist so humans only see the items where their specific judgment actually matters.

## The Product Manager's two jobs

**Job 1 — Coordinator.** Runs the product's cycles: kicks off tasks, tracks status, calls the end-of-cycle reflection. Resolves cross-function handoffs, unblocks the team, shapes the next cycle's tasks, escalates beyond-product-scope items.

**Job 2 — Self-improver.** Watches its own coordination and asks: *am I running this team well?* Captures facilitation-level learnings, reflects on facilitation quality, proposes process changes.

The self-improvement loop is the critical move. Without it, the Product Manager is a static process runner. With it, facilitation gets better over time — and one product's facilitation learnings transfer to the next via the facilitation community of practice. That's the lever that makes the 5th product cheaper than the 4th.

## The org stays flat

The agent side is **always flat**: one layer of product teams, each with its own Product Manager, under one factory-level system assistant. There is never a business-facilitator or any middle-management agent layer — the roles in use are the distinct role strings among the agents that actually exist (`roleLabel`, `framework/domain-model/src/agent-roles.ts`; there is no hardcoded role catalog to check against, by design — see the @lore there), and `SCOPE_KINDS` has never had a `business` value.

A product team owns *a unit of value* — standalone product or part of a larger multi-product business — but the business dimension lives as human-maintained metadata, never as a nested agent hierarchy. **Business leaders are always the humans:** suite-level strategy, pricing, positioning, bundling.

## Git export structure — NOT IMPLEMENTED

> **Not implemented.** There is no git export. The exporter was deleted in AU26
> (increment C1) and the code paths this section used to cite have not existed
> since AU19. The canonical `knowledge_items` table (`framework/db/src/schema.ts`)
> is the only store; nothing writes markdown files to a git repo. Whether
> knowledge should live in git at all is an open product question for a future
> knowledge work package, not a description of the system.
>
> The shape below is kept as the design sketch it always was — updated only to
> drop the two scope values (`product`, `practice`) that no longer exist; the
> sketch was never implemented against either shape:

```
factory/
  PRINCIPLES.md, FOCUS.md
  PORTFOLIO.md                # human-maintained: which products belong to which business
  REFLECTIONS/<name>.md
```

- Sketched kinds: `PRINCIPLE`, `FOCUS`, `PORTFOLIO`, `REFLECTION` — design vocabulary only; `kind` itself no longer exists as a column.
- Sketched rule: only `active` items would export; `proposed` drafts and `archived` tombstones would stay out.
- No `businesses/` directory, no nesting. Business-level framing is human-maintained at the factory level — the agent structure stays dead simple.

## The learning loop

Agents produce information → the attention engine scores it (`layers/core-api/knowledge/src/attention-scoring.ts`, `ATTENTION_THRESHOLD` 0.7 in `scoring-config.ts`) → high-signal items become a review message posted into the knowledge item's own thread → humans validate → writeback updates status + confidence/attention → validated knowledge is assembled into future sessions.

## Why facilitators exist

Without them, every information item either (a) sits in the database unread until it's too late, (b) gets dumped on the humans who drown in inbox overload, or (c) gets auto-applied without validation and the factory drifts. Most agent frameworks do (a) and call it "memory." Some try (b) and users quit. Almost nobody does (c) well because the validation step is genuinely hard.

Facilitators are where human-in-the-loop becomes sustainable. Without them, "humans validate" is just another word for "humans become a bottleneck" — and the whole architecture is just a database with a pretty frontend.
