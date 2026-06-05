# How Knowledge Compounds

The tenth bet is faster than the first. Not because the agents are better models — they are the same models. It is faster because the knowledge the team accumulated in the previous nine bets is available at the start of the tenth. HyperIdle is built around this claim. This document explains the machinery that makes it real.

---

## The five layers

Knowledge in HyperIdle lives in five layers. The lower the layer, the more agent-native. The higher the layer, the more human-native.

```
L4  Factory     monthly     humans write and read, agents propose
L3  Practice    weekly      agents read and write, humans curate
L2  Product     per cycle   both — split by artifact type
L1  Task        per task    agents own, humans sample
L0  Session     minutes     pure agent working set
```

**L0 — Session.** The agent's working set for a single session. Rebuilt at session start by the Knowledge Fabric from L1 through L4. Ephemeral — discarded when the session ends. Formatted in TOON, a compact serialization format that gives roughly 40% fewer tokens than JSON for structured data. An agent spinning up to work on file uploads gets exactly the practices, product knowledge, and task context relevant to file uploads — not everything in the knowledge base. Load what you need, nothing more.

**L1 — Task.** Structured per-task data: what was tried, what happened, what differed from expectation, what failed. Every failure is a first-class record, not a buried log. When task 42 hits an out-of-memory error from 5MB chunks, that failure is recorded in L1 with the task ID, the error, and the resolution. It is queryable. It is findable. It becomes the raw material for L3 if the same pattern shows up on other products.

**L2 — Product.** The department of a single product. Splits into two parts. The human-readable part is beautiful, stable markdown: `BRIEF.md` (what the product is and why), `ARCHITECTURE.md` (how it is built), `BRAND.md` (voice, positioning), `PRINCIPLES.md` (the hard rules for this product). These are the product's soul. If they disappear, the product does not know who it is. The agent-native part is structured rows in the canonical store: decisions, handoffs, cycle reflections, active and historical bets.

**L3 — Practice.** The highest-leverage layer. Knowledge from one product is available to every agent in the same practice. The Builder on Nimmly who discovers the right approach to chunked file uploads writes that into the building practice. The Builder on Ambrovia gets it for free at the start of their next relevant session — no "did you know Ambrovia already solved this?" moment, no copy-paste, no broadcast notification. The knowledge is just there because the materialization step loads relevant practices into every workspace at session start.

This is where Communities of Practice become real. There is one building practice for all Builders across all products. One growth practice for all Growth Agents. One product practice for all Product Managers. What any agent learns at the practice level, every other agent in that practice has access to.

**L4 — Factory.** The company's own operating principles. Stored as human-readable markdown only. Four files: `PRINCIPLES.md` (the short list of hard rules, slow-changing), `FOCUS.md` (what the company is trying to improve this month), `PORTFOLIO.md` (which products get energy this cycle), and `REFLECTIONS/` (monthly notes from coaching sessions). The Chief of Staff proposes changes to these. Humans approve, edit, or reject. Git holds the history.

---

## One canonical store, two projections

All knowledge — L0 through L4 — ultimately traces back to one table: `knowledge_items`. Every knowledge item has an ID, a layer, a scope, a status, a markdown body, and a confidence level.

Humans access the canonical store through the Knowledge view in the Factory app: rich cards, inline editing, scope selectors, filter views. Agents access it through workspace files: markdown prose for reading, TOON packs for structured data. Both projections read and write the same underlying store. There is no synchronization problem because there is one source of truth.

When an agent starts a session, the Knowledge Fabric materializes a relevant slice of the store into the agent's workspace directory. It reads L4 factory principles, L2 product knowledge, and the L3 practices relevant to the agent's role and the task at hand. It does not load everything — a Builder working on payments does not need growth marketing practices. The task description, the agent's role, and tag matching determine what gets loaded.

When an agent writes new knowledge during a session — a practice finding, a decision record, a failure log — it writes to its workspace's `knowledge/` directory. The Knowledge Fabric detects the change, diffs it against the canonical store, and writes it back as a captured knowledge item. The capture happens automatically. There is no separate "document your learnings" step.

---

## The knowledge lifecycle

Every knowledge item moves through a lifecycle:

**Captured** → raw, unvalidated. Automatically created from task outcomes, agent session notes, failures.

**Provisional** → picked up by a facilitator, organized, linked to related items, tagged for retrievability.

**Validated** → confirmed useful and accurate. Either by a human reviewing it in the Knowledge view, or by the facilitator auto-promoting it when the same pattern shows up independently across multiple products (repetition is strong evidence).

**Active** → in use by agents. Referenced in sessions, materialized into workspaces, cited in decisions.

**Stale** → not accessed or referenced recently. Decaying.

**Archived** → retired. History preserved, no longer served to agents.

Most items never need a human. If the same chunk-size finding shows up in five products and is never contradicted, the facilitator can auto-promote it from provisional to validated. Human attention is the scarcest resource — the facilitators protect it.

---

## The attention score

Each knowledge item gets a continuous attention score computed from multiple signals: novelty (have we seen this before?), impact (how many agents and products would be affected if it is wrong?), conflict (does it contradict something we already believe?), confidence (how certain are we?), taste sensitivity (is this the kind of thing that needs human judgment — brand voice, strategic framing, customer intuition?), recency of review, and usage frequency.

When the score crosses a threshold, the item enters the founder's Knowledge view queue. The facilitator also shapes what kind of feedback to ask for:

- High novelty and high impact: "Is this pattern real? Should we make it a rule?"
- Conflict: "These two items contradict each other. Which applies when?"
- Stale but still referenced: "This is old but still used. Still true?"
- Taste-sensitive: "Does this feel right for our brand?"

The score and the question together are what keep the founder's attention focused. Instead of dumping every knowledge item on the founder (inbox hell) or acting on everything autonomously (drift), the facilitators surface only the items where human judgment actually makes a difference.

---

## Retros: learning flows back up

Every bet that ships or is killed produces a retro. The Product Manager drafts it automatically — this is a routine that fires on bet transition, not something that can be skipped.

The retro asks: What was the original hypothesis? Did it hold? What surprised us? What patterns showed up that the practice should know? What should the factory's operating principles change to reflect?

The output routes to two places. Practice-level patterns flow to the practice community's knowledge items as captured entries. The practice facilitator picks them up and either auto-promotes (if they repeat what other products already learned) or surfaces them in the Knowledge view for human review. Rule-shaped insights — "we keep underestimating brand-voice review effort" — flow to the Coach thread with the Chief of Staff for the founder to decide whether they become a principle.

This is the learning loop that compounds. Each bet adds to the practice. Each practice addition improves the next bet on every product. Over time, the foundation of accumulated practice knowledge means fewer failures, faster decomposition, and less time spent rediscovering things the team already knows.

---

## Practice meetings: the weekly contribution loop

Practices do not wait for retros. Each practice has its own weekly rhythm:

**Propose.** Every agent in the practice posts the findings it accumulated during the week — patterns noticed, things that worked, things that failed, snippets that should be reusable.

**React.** All agents see the proposals and comment: "we saw the same thing on Ambrovia," "this contradicts what we learned last month," "this is product-specific, not practice-level."

**Synthesize.** The Practice Facilitator reads all proposals and reactions, decides which become captured practice items, which route to specific product knowledge, and which are noise. The facilitator writes the accepted items back to the canonical store.

At the next session start, any Builder or Growth Agent whose practice has been updated gets the new knowledge automatically through materialization. There is no notification. There is no "please read the updated docs." The knowledge is present in the workspace because that is what materialization does.

---

## The Knowledge view

The Knowledge view in the Factory app is the human's curation surface. It has three scopes: Practice (cross-product knowledge organized by discipline), Product (one product's accumulated knowledge), and Factory (principles and portfolio strategy).

Within each scope, knowledge items are organized into topics. Topics are living groupings maintained by the practice facilitators — not rigid categories, but evolving clusters that the facilitators create, merge, split, and rename as knowledge accumulates. A mature building practice might have topics for authentication, file handling, deployment, testing, performance. Each topic shows how many items are active vs. uncurated vs. stale, so the founder can see at a glance where attention is needed.

Five saved filter views provide starting points:
- **By topic** — the default browsing structure.
- **Needs attention** — sorted by attention score. Where the facilitators think human eyes are needed this week.
- **Recently created** — what agents are contributing right now.
- **Most accessed** — what agents rely on most. Errors here have the highest cost.
- **Stale** — what needs pruning.

The founder's job in the Knowledge view is not to approve every entry. It is to tend the garden: sharpen wording, retire stale items, add the tacit knowledge agents cannot generate, and occasionally decide when a practice pattern should become a factory principle.

---

## What makes it different from memory

Most agent frameworks have memory. They store what an agent did in a vector database and retrieve it later. HyperIdle's knowledge system is different in four ways.

**It is structured, not just searchable.** Knowledge items have layer, scope, status, confidence, topic, and lifecycle. They are not just strings in a vector index. They can be filtered, browsed, and curated as a corpus.

**It crosses product boundaries by design.** A vector database per agent or per product does not give you cross-product learning. The L3 practice layer is deliberately shared across products. Knowledge from Nimmly is available to HyperIdle's Builder. That is not automatic in a per-agent memory model.

**It has facilitators.** Raw captures never become reliable knowledge without curation. Facilitators continuously organize, score, and promote items. Without them, information accumulates but knowledge does not. With them, the signal finds the right eyes at the right time.

**It has human curation built into the workflow.** The Knowledge view, the attention score, and the weekly practice meeting are all mechanisms for human judgment to shape what the agents know. Knowledge in HyperIdle is not AI-generated and then trusted automatically. It is AI-generated, facilitator-organized, and human-curated.

The result is a company that gets better at what it does with every bet it ships.

---

For the agents who produce and consume this knowledge, read [Human + AI Collaboration](./human-ai-collaboration.md). For the process model that generates the knowledge in the first place, read [How Work Flows](./how-work-flows.md).
