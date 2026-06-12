# How Knowledge Compounds

HyperIdle stores everything agents learn in a structured knowledge system with five layers, one canonical store, and human curation built into the workflow. What one agent learns on one product becomes available to every agent on every other product. The tenth bet is faster than the first because the accumulated knowledge from nine previous bets is present at session start.

```
Layer   Scope      Cadence     Who owns it
─────   ─────      ───────     ──────────────────────────────────
L4      Factory    monthly     humans write/read, agents propose
L3      Practice   weekly      agents read/write, humans curate
L2      Product    per cycle   both — split by artifact type
L1      Task       per task    agents own, humans sample
L0      Session    minutes     pure agent working set (ephemeral)
```

---

## L0-L1: agent working memory and task records

**L0 — Session.** The agent's working set for a single session. Rebuilt at session start by the Knowledge Fabric from L1 through L4. Ephemeral — discarded when the session ends. Formatted in TOON (a compact serialization that uses ~40% fewer tokens than JSON). An agent working on file uploads gets exactly the practices, product knowledge, and task context relevant to file uploads. Nothing more.

**L1 — Task.** Structured per-task data: what was tried, what happened, what differed from expectation, what failed. Every failure is a first-class record, not a buried log. When task 42 hits an out-of-memory error from 5MB chunks, that failure is recorded with the task ID, error, and resolution. It is queryable, findable, and becomes raw material for L3 if the pattern recurs across products.

---

## L2-L3: product knowledge and cross-product practices

**L2 — Product.** The department of a single product. Two parts:

- *Human-readable:* stable markdown files — `BRIEF.md` (what the product is), `ARCHITECTURE.md` (how it is built), `BRAND.md` (voice and positioning), `PRINCIPLES.md` (hard rules). These are the product's soul.
- *Agent-native:* structured rows in the canonical store — decisions, handoffs, cycle reflections, active and historical bets.

**L3 — Practice.** The highest-leverage layer. Knowledge from one product is available to every agent in the same practice. The Acme Builder who discovers the right approach to chunked uploads writes it into the building practice. The Ambrovia Builder gets it at the next relevant session — no "did you know Acme solved this?" moment, no copy-paste.

One building practice for all Builders. One growth practice for all Growth Agents. One product practice for all Product Managers. This is where Communities of Practice become real.

---

## L4: factory principles

The company's operating principles. Human-readable markdown only. Four files:

- `PRINCIPLES.md` — the short list of hard rules (slow-changing)
- `FOCUS.md` — what the company is improving this month
- `PORTFOLIO.md` — which products get energy this cycle
- `REFLECTIONS/` — monthly notes from assistant conversations

The assistant proposes changes. Humans approve, edit, or reject. Git holds the history.

---

## One canonical store, two projections

All knowledge traces back to one table: `knowledge_items`. Every item has an ID, layer, scope, status, markdown body, and confidence level.

| Projection | Audience | Format |
|-----------|----------|--------|
| **Knowledge view** in the Factory app | Humans | Rich cards, inline editing, scope selectors, filter views |
| **Workspace files** | Agents | Markdown prose for reading, TOON packs for structured data |

Both projections read and write the same store. No synchronization problem because there is one source of truth.

At session start, the Knowledge Fabric materializes a relevant slice. It reads L4 factory principles, L2 product knowledge, and L3 practices relevant to the agent's role and task. A Builder on payments does not get growth marketing practices. Task description, agent role, and tag matching determine what loads.

When an agent writes new knowledge during a session, it writes to the workspace's `knowledge/` directory. The Fabric detects the change, diffs against the canonical store, and writes it back as a captured item. The capture is automatic — no separate "document your learnings" step.

---

## Knowledge lifecycle: captured to archived

Every knowledge item moves through a lifecycle:

1. **Captured** — raw, unvalidated. Auto-created from task outcomes, session notes, failures.
2. **Provisional** — picked up by a facilitator, organized, linked, tagged.
3. **Validated** — confirmed useful and accurate. By human review, or auto-promoted when the same pattern appears independently across multiple products.
4. **Active** — in use by agents. Referenced in sessions, materialized into workspaces, cited in decisions.
5. **Stale** — not accessed recently. Decaying.
6. **Archived** — retired. History preserved, no longer served to agents.

Most items never need a human. If the same chunk-size finding shows up in five products and is never contradicted, the facilitator auto-promotes it. Human attention is the scarcest resource — facilitators protect it.

---

## The attention score surfaces what needs human eyes

Each knowledge item gets a continuous attention score from multiple signals: novelty, impact, conflict with existing knowledge, confidence, taste sensitivity (brand voice, strategy), recency of review, and usage frequency.

When the score crosses a threshold, the item enters the founder's Knowledge view queue. The facilitator shapes the question:

- **High novelty + high impact:** "Is this pattern real? Should we make it a rule?"
- **Conflict:** "These two items contradict each other. Which applies when?"
- **Stale but still referenced:** "This is old but still used. Still true?"
- **Taste-sensitive:** "Does this feel right for our brand?"

The score and the question together keep founder attention focused. Instead of dumping every item on the founder (inbox hell) or acting autonomously (drift), facilitators surface only the items where human judgment makes a difference.

---

## Retros and practice meetings feed knowledge back up

**Retros.** Every bet that ships or is killed produces a retro. The Product Manager drafts it automatically — a routine that fires on bet transition. The retro asks: What was the hypothesis? Did it hold? What surprised us? What should the practice know?

Practice-level patterns flow to practice knowledge as captured entries. Rule-shaped insights — "we keep underestimating brand-voice review effort" — flow to the assistant thread for the founder to decide.

**Weekly practice meetings.** Each practice has a weekly rhythm:

1. **Propose** — agents post findings from the week: patterns, successes, failures, reusable snippets.
2. **React** — agents comment: "we saw the same on Ambrovia," "this contradicts last month," "product-specific, not practice-level."
3. **Synthesize** — the Practice Facilitator decides which become practice items, which are product-specific, and which are noise.

At the next session start, any agent whose practice updated gets the new knowledge through materialization. No notification needed. The knowledge is present in the workspace because that is what materialization does.

---

## What makes this different from agent memory

| Dimension | Typical agent memory | HyperIdle knowledge |
|-----------|---------------------|-------------------|
| **Structure** | Strings in a vector index | Layer, scope, status, confidence, topic, lifecycle |
| **Cross-product** | Per-agent or per-project silo | L3 practice layer shared across all products by design |
| **Curation** | Raw captures accumulate | Facilitators organize, score, promote continuously |
| **Human oversight** | AI-generated and trusted automatically | AI-generated, facilitator-organized, human-curated |

The result: a company that gets better at what it does with every bet it ships.

---

Next: [What is HyperIdle?](./what-is-hyperidle.md) — return to the system overview, or start with [How Work Flows](./how-work-flows.md) for the process model.
