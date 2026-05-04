## 9. The Facilitators — the most undervalued role in the factory

Most agent systems have workers (agents that do things) and maybe an orchestrator (routes work). They're missing the role that actually makes knowledge compound: **the facilitator**. A dedicated agent per layer whose entire job is to organize the layer's knowledge, score what needs human attention, and collect exactly the feedback that converts information into knowledge.

This is the role that a great chief of staff, a great librarian, a great community manager, or a great editor plays in a human org. Without them, information accumulates but knowledge doesn't. With them, the signal finds the right eyes at the right time.

We already had the Chief of Staff at L4. The missing insight: **the same function needs to exist at L2 and L3**, specialized to those layers.

### The facilitator family

| Layer | Facilitator | Role analogy | What they organize |
|-------|------------|-------------|-------------------|
| L4 Factory | **Chief of Staff** | COO / chief of staff | Factory principles, portfolio, cross-product patterns, coaching the Product Managers |
| L3 Practice | **Practice Facilitator** (one per community: build/product/growth/ops, plus facilitation itself) | Guild lead / master craftsperson | Role-specific practices, anti-patterns, conflicts, community-wide learnings |
| L2 Product | **Product Manager** (one per product) | Team lead | Product cycles, team coordination, shaped pitches, cross-function handoffs — AND its own facilitation quality |

Facilitators don't do the work itself. They don't write code, write copy, talk to customers, or deploy — that's what the worker agents (Builder, Product Agent, Growth, Ops) are for. The facilitators coordinate, organize, score, and route. Think of them as the factory's nervous system: sensing where attention is needed and directing it there.

The worker agents sit in a **matrix**: each reports vertically to their Product Manager (team lead for this product) and horizontally belongs to a Practice Facilitator-led community (their craft guild across products). Exactly like a well-run engineering org where you have a team lead for your squad *and* a guild lead for your discipline.

### What facilitators do, concretely

1. **Continuously organize.** Merge duplicates. Resolve conflicts. Archive stale items. Link related artifacts. Tag for retrievability.
2. **Score every information item for human attention.** (See the attention scoring model below.)
3. **Shape the human's queue for their layer.** The L3 Practice Facilitator prepares the weekly Knowledge view curation queue. The L2 Product Manager shapes pitches for the weekly Bet Canvas. The L4 Chief of Staff prepares the monthly coaching conversation.
4. **Ask for the right kind of feedback.** Different items need different human input. A contradicting pair needs *resolution*. A novel pattern needs *validation*. A stable-but-stale practice needs *retirement or extension*. The facilitator picks the question.
5. **Close the loop.** When a human gives feedback, the facilitator writes it back into the knowledge store and bumps the confidence/attention scores accordingly.

### Information → Knowledge: the state machine

Raw capture is not knowledge. A task outcome, a failed attempt, a decision record — these are *information*. They become *knowledge* only when they've been validated, contextualized, and proven reusable.

Every item in the factory has a status:

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

**Most items never need a human.** If the same pattern shows up in 5 products and never gets contradicted, the facilitator can auto-promote it from PROVISIONAL straight to VALIDATED via repetition. Human attention is the scarcest resource in the factory — the facilitators exist so humans only see the items where their specific judgment actually matters.

### The attention score

Each item gets a continuous score. When it crosses a threshold, it enters a human's queue. The score is a weighted sum of:

| Signal | Why it matters | Weight |
|--------|----------------|--------|
| **Novelty** | Have we seen this pattern before? New patterns carry more information. | high |
| **Impact** | If wrong, how many agents/products would be affected? | high |
| **Conflict** | Does this contradict something we already believe? Contradictions force choice. | high |
| **Repetition** | Has this shown up multiple times independently? (Auto-validates without human.) | reduces need |
| **Confidence** | How sure are we? Based on outcome data, agent uncertainty, agreement. | reduces need |
| **Taste sensitivity** | Is this the kind of thing that needs human judgment? (Brand voice, aesthetics, strategic framing, customer intuition — things agents can't generate.) | high |
| **Recency of review** | Has a human looked at this part of the system recently? | medium |
| **Usage frequency** | Is this actually being used, or just sitting there? | medium |

Low score → the facilitator handles it autonomously. High score → it surfaces in the Knowledge view's "needs attention" list. The facilitator also chooses *what kind* of feedback to ask for:

| Signal | Question to ask |
|--------|-----------------|
| Novelty + high impact | "Is this pattern real? Should we make it a rule?" (validation) |
| Conflict | "A and B contradict. Which applies when?" (resolution) |
| Stale but popular | "This is old but still referenced. Still true?" (refresh) |
| Taste-sensitive | "Does this feel right for our brand/customer?" (judgment) |
| Cross-layer promotion | "Should this practice become a factory principle?" (elevation) |

This last column is the real point. Most agent systems either dump everything on humans (inbox hell) or auto-act on everything (drift). The facilitator's job is to ask the *right kind of question* about the *right item* at the *right time*. That's the work that converts information into knowledge.

### The Product Manager as team lead

The Product Manager isn't just a librarian. It's the **team lead** — the CEO of the product. Classic matrix structure: vertical line management (it leads the product team) plus horizontal community membership (each team member also belongs to a cross-product community of practice led by a Practice Facilitator).

```
                 │ Build community   │ Product community │ Growth community  │ Ops community
                 │ (Practice Facil.) │ (Practice Facil.) │ (Practice Facil.) │ (Practice Facil.)
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
Nimmly           │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
HyperIdle        │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
Ambrovia         │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
```

Two jobs running in parallel:

**Job 1 — Coordinator:** Runs the product's cycles: kicks off bets, tracks status, calls the end-of-cycle reflection. Resolves cross-function handoffs within the team. Unblocks the team. Shapes 2–4 pitches for the next cycle's Bet Canvas. Escalates to the Chief of Staff when something is beyond product scope.

**Job 2 — Self-improver:** Watches its own coordination and asks: *am I running this team well?* Captures facilitation-level learnings. Runs its own end-of-cycle reflection on facilitation quality. Proposes process changes. Learns from the Chief of Staff's coaching.

**This self-improvement loop is the critical move.** Without it, the Product Manager is just a static process runner. With it, the facilitator gets better at facilitating over time. It's also the lever that makes the 5th product cheaper than the 4th: the Nimmly Product Manager's facilitation learnings transfer via the Practice Facilitator for "product leadership" to HyperIdle's Product Manager.

And yes — **the facilitators themselves form a community of practice.** There's a fifth Practice Facilitator for "facilitation itself" — it organizes how the Product Managers learn from each other. Turtles, but only this far down.

### The team layer stays flat

The agent side of the factory is **always flat**. There is one layer of product teams, each with its own Product Manager. There is never a Business Facilitator or any other middle-management agent layer between the Product Managers and the Chief of Staff.

A product team owns *a unit of value*, in two shapes: a standalone product that IS a business (example: Ambrovia), or a product that is part of a larger multi-product business (example: an "SME Finance Suite" that bundles Ambrovia + Nimmly). Each product still has its own team and Product Manager. **The business leaders are always the humans.** They own suite-level strategy, pricing, positioning, cross-product bundling, and the decision about whether a product is standalone or part of a suite. The Chief of Staff surfaces cross-product items to the humans but doesn't delegate to another agent layer below itself.

```
                        Humans
                    (business level)
                           │
                  Chief of Staff (Factory)
                           │
           ┌───────────────┼───────────────┐
           │               │               │
  Product Manager  Product Manager  Product Manager
      (Ambrovia)       (Nimmly)        (HyperIdle)
```

File structure reflects this — the business dimension lives as metadata the humans maintain, not as a nested agent hierarchy. The markdown files below are **exports** from the canonical `knowledge_items` table, maintained in Git for version history:

```
exports/
  products/
    ambrovia/
      BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md
    nimmly/
      BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md
    hyperidle/
      ...

  factory/
    PRINCIPLES.md
    FOCUS.md
    PORTFOLIO.md       # human-maintained: which products belong to which business
    BUSINESSES.md      # human-maintained: the business-level framing
```

No `businesses/` directory. No nesting. The business-level thinking lives in two human-maintained markdown files at the factory level. This keeps the agent structure dead simple and puts strategic business judgment exactly where it belongs — with the people.

### What the Practice Facilitator does

One per community (build, product, growth, ops). They: ingest task outcomes and failures flagged as potentially reusable by Product Managers; merge duplicates across products ("Nimmly and Ambrovia both hit this chunk-size issue"); resolve conflicts ("practice X says one thing, practice Y says the opposite — surface for human"); score everything for attention; curate the weekly Knowledge view queue for the founders; retire practices that aren't being used.

They're the community's librarian. They don't write the practices. They make sure the right ones exist, are findable, and are trusted.

### The cost of NOT having facilitators

Without these agents, every information item either (a) sits in the database unread until it's too late, (b) gets dumped on the founders who drown in inbox overload, or (c) gets auto-applied without validation and the factory drifts. Most agent frameworks today do (a) and call it "memory." Some try (b) and users quit. Almost nobody does (c) well because the validation step is genuinely hard.

The facilitators are where the human-in-the-loop idea actually becomes sustainable. Without them, "humans validate" is just another word for "humans become a bottleneck."

---
