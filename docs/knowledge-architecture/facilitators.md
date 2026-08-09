# Facilitators

Most agent systems have workers (agents that do things) and maybe an orchestrator (routes work). They're missing the role that actually makes knowledge compound: **the facilitator** — a dedicated agent per layer whose entire job is to organize the layer's knowledge, score what needs human attention, and collect exactly the feedback that converts information into knowledge. The role a great librarian, community manager, or editor plays in a human org. Without them, information accumulates but knowledge doesn't.

> **Load-bearing doc.** `layers/core-api/knowledge/src/promotion-pipeline.ts` quotes the auto-promotion sentence in §Auto-promotion verbatim (code comment still references `KNOWLEDGE_ARCHITECTURE.md §6.5` — the old monolith path; update that comment when renaming). Change that section and the code comment together.

## The facilitator family

| Layer | Agent | What they organize |
|-------|-------|--------------------|
| L4 Factory | **System assistant** (factory-level singleton, `framework/factory-defaults/src/factory-roster.ts:124-127`) | Factory-level knowledge above the per-product teams |
| L3 Practice | **Facilitator** (one per community: build/product/growth/ops, plus facilitation itself) | Role-specific practices, anti-patterns, conflicts, community-wide learnings |
| L2 Product | **Product Manager** (one per product) | Product cycles, team coordination, bet shaping, cross-function handoffs — and its own facilitation quality |

In code: role `facilitator`, category `strategy` (`framework/domain-model/src/agent-roles.ts:150` — renamed from `practice_facilitator`, @lore AD8c). The default factory roster seeds five facilitators plus the system-assistant singleton (`factory-roster.ts:92-128`); the minimal strategy roster concept no longer exists — the roster is a fixed constant (AU28 step 6: the swappable-roster injection seam was removed as dead, zero-production-caller code). The Product Manager is a `team`-category agent ("Team lead", `agent-roles.ts:65-72`) — its facilitator hat is a conceptual framing, not a code category. The assistant is a per-user individual agent with guardrails (`agent-roles.ts:187-197`, @lore AD8b). Role identity and the full taxonomy live in [agent-model](../agent-layer/agent-model.md).

Facilitators don't do the work itself — no code, no copy, no deploys. Worker agents (builder, growth, ops, …) do that. Facilitators coordinate, organize, score, and route: the factory's nervous system.

Worker agents sit in a **matrix**: each reports vertically to its Product Manager and belongs horizontally to a community of practice led by a facilitator — implemented as the `community` field per catalog role plus `communityForRole()` (`agent-roles.ts:242`); communities are `build/product/growth/ops/facilitation` (`framework/factory-defaults/src/factory-roster.ts`).

The fifth facilitator — for **facilitation itself** — means the facilitators form their own community of practice (`seed-agent-pf-facilitation`). Turtles stop there.

## What facilitators do

1. **Continuously organize.** Merge duplicates, resolve conflicts (`knowledgeConflicts`, `framework/db/src/schema.ts:962`; see [sync-and-conflict-resolution](./sync-and-conflict-resolution.md)), archive stale items (stale sweep, `layers/core-api/knowledge/src/promotion-pipeline.ts:83`), link and tag for retrievability.
2. **Score every item for human attention.** Weighted 8-signal attention score, threshold 0.7 → review item. Signal and question tables live in [relevance-and-attention](./relevance-and-attention.md).
3. **Shape the human's queue for their layer.** The facilitator curates the Knowledge view triage queue; the Product Manager shapes the coming cycle's bets.
4. **Ask for the right kind of feedback.** A contradicting pair needs *resolution*; a novel pattern needs *validation*; a stable-but-stale practice needs *retirement or extension*. The facilitator picks the question — the question-kind routing table is in [relevance-and-attention](./relevance-and-attention.md). (Design intent; the question strings aren't in code yet.)
5. **Close the loop.** Human feedback is written back into the knowledge store (`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`) and bumps confidence/attention scores.

## Information → knowledge: the lifecycle

Raw capture is not knowledge. A task outcome, a failed attempt, a decision record — these are *information*. They become *knowledge* only when validated, contextualized, and proven reusable. Every item has a status:

```
CAPTURED      ─┐
               │  (a task failed, a decision was made, a pattern appeared)
               ▼
PROVISIONAL    ─┐
               │  (picked up by a facilitator, organized, linked)
               ▼
NEEDS HUMAN    ─┐
               │  (scored high enough to surface for human review)
               ▼
VALIDATED      ─┐
               │  (human confirmed, sharpened, or explicitly retired)
               ▼
ACTIVE         ─┐
               │  (in use by other agents, being referenced)
               ▼
STALE          ─┐
               │  (no reads, no references, decaying)
               ▼
ARCHIVED
```

Implemented as `KNOWLEDGE_STATUSES` (`framework/domain-model/src/knowledge.ts:20-28`) — the full 7-value lifecycle is the single kernel-owned status set; there is no separate, narrower kernel enum anymore (the old kernel/strategy split on status was retired along with the fabric package). `captured`, `provisional`, and `needs_human` are **pre-validation drafts**.

### Auto-promotion

**Most items never need a human.** If the same pattern shows up in 5 products and never gets contradicted, the facilitator can auto-promote it from PROVISIONAL straight to VALIDATED via repetition. Implemented in `layers/core-api/knowledge/src/promotion-pipeline.ts` — cross-scope repetition on the same `(layer, topic, kind)` signature, threshold 5, edit-log editor marker `system:auto-promotion` (`AUTO_PROMOTION_EDITOR`). Human attention is the scarcest resource; facilitators exist so humans only see the items where their specific judgment actually matters.

## The Product Manager's two jobs

**Job 1 — Coordinator.** Runs the product's cycles: kicks off bets, tracks status, calls the end-of-cycle reflection. Resolves cross-function handoffs, unblocks the team, shapes the next cycle's bets, escalates beyond-product-scope items.

**Job 2 — Self-improver.** Watches its own coordination and asks: *am I running this team well?* Captures facilitation-level learnings, reflects on facilitation quality, proposes process changes.

The self-improvement loop is the critical move. Without it, the Product Manager is a static process runner. With it, facilitation gets better over time — and one product's facilitation learnings transfer to the next via the facilitation community of practice. That's the lever that makes the 5th product cheaper than the 4th.

## The org stays flat

The agent side is **always flat**: one layer of product teams, each with its own Product Manager, under one factory-level system assistant. There is never a business-facilitator or any middle-management agent layer — `AGENT_ROLE_CATALOG` has no such role (`agent-roles.ts:44-198`), and scope kinds include `product` but no `business` (`SCOPE_KINDS`, `framework/domain-model/src/types.ts:181-189`).

A product team owns *a unit of value* — standalone product or part of a larger multi-product business — but the business dimension lives as human-maintained metadata, never as a nested agent hierarchy. **Business leaders are always the humans:** suite-level strategy, pricing, positioning, bundling.

## Git export structure — NOT IMPLEMENTED

> **Not implemented.** There is no git export. The exporter was deleted in AU26
> (increment C1) and the code paths this section used to cite have not existed
> since AU19. The canonical `knowledge_items` table (`framework/db/src/schema.ts`)
> is the only store; nothing writes markdown files to a git repo. Whether
> knowledge should live in git at all is an open product question for a future
> knowledge work package, not a description of the system.
>
> The shape below is kept as the design sketch it always was:

```
products/
  <scopeId>/
    BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md   # L2 items
factory/
  PRINCIPLES.md, FOCUS.md
  PORTFOLIO.md                # human-maintained: which products belong to which business
  REFLECTIONS/<topic>.md      # L4 REFLECTION items
```

- Sketched kinds: `BRIEF`, `ARCHITECTURE`, `BRAND`, `PRINCIPLES`, `FOCUS`, `PORTFOLIO`, `REFLECTION`.
- Sketched rule: only `active` and `validated` items would export; pre-validation drafts (`captured`/`provisional`/`needs_human`) and `archived` tombstones would stay out.
- No `businesses/` directory, no nesting. Business-level framing is human-maintained at the factory level — the agent structure stays dead simple.

## The learning loop

Agents produce information → the attention engine scores it (`layers/core-api/knowledge/src/attention-scoring.ts`, `ATTENTION_THRESHOLD` 0.7 in `scoring-config.ts:91`) → high-signal items become review items (`createReviewItemForKnowledge`, `layers/core-api/review/src/review-item-factory.ts`) → surfaced to the matching human view (view routing rules in [items-and-routing](../human-interface-layer/items-and-routing.md)) → humans validate → writeback updates status + confidence/attention → validated knowledge is assembled into future sessions.

## Why facilitators exist

Without them, every information item either (a) sits in the database unread until it's too late, (b) gets dumped on the humans who drown in inbox overload, or (c) gets auto-applied without validation and the factory drifts. Most agent frameworks do (a) and call it "memory." Some try (b) and users quit. Almost nobody does (c) well because the validation step is genuinely hard.

Facilitators are where human-in-the-loop becomes sustainable. Without them, "humans validate" is just another word for "humans become a bottleneck" — and the whole architecture is just a database with a pretty frontend.
