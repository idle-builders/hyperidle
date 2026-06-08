## 1. The Five Layers

```
L4  FACTORY        monthly        humans write & read, agents propose
L3  PRACTICE       weekly         agents read/write, humans curate
L2  PRODUCT        per cycle      both — split by artifact type
L1  TASK           per task       agents own, humans sample
L0  SESSION        minutes        pure agent memory
```

The lower you go, the more agent-native. The higher you go, the more human-native. Knowledge flows up through promotion (L1 discoveries become L3 practices become L4 principles) and down through loading (the factory's rules shape what products do).

### L0: Session — the working set

An agent spinning up for a specific task. Minutes to hours.

Borrows from how Letta/MemGPT treats the context window like RAM in an operating system — the agent explicitly manages what's in its working set rather than stuffing everything in upfront. We don't need to implement Letta; we take the idea: **load what you need, nothing more.**

- **Storage**: ephemeral. Rebuilt every session by the Knowledge Fabric's materialization engine (§5).
- **Format**: TOON-style compact pack loaded from L1/L2/L3. TOON gives ~40% fewer tokens than JSON for structured data with minimal parsing loss. This is the difference between an agent that can hold a whole product's context vs. one that burns its window on boilerplate.
- **Materialization budget**: the Knowledge Fabric applies relevance scoring and a token budget to decide what gets loaded. Not everything — just what this task needs (§7).
- **Human touch**: none.

### L1: Task — the unit of work

A task is a tiny experiment. It has an expected outcome. When reality differs, that's the signal worth capturing.

Inspired by Toyota Kata's "every piece of work is learning" — but we're not writing hypothesis documents. A task row is just: what we tried, what happened, what was different, what broke. Four fields. No ritual.

- **Storage**: **SQLite.** Not markdown. A task is structured data — id, parent bet, type, state, expected, actual, failures[], links. Google's Always-On Memory Agent (open-sourced late 2025) made the same call: for structured agent state, SQLite beats vector DBs. Queryable, fast, zero ops.
- **Format for agents**: direct SQL or a thin CLI wrapper — `factory task log TASK-42 "5MB chunks → OOM on Coolify"`.
- **Failures are first-class**. Not buried in logs. A dedicated `failures` table linked to tasks. This is what makes "learning from failures" actually work — it's data, not lore.
- **Human touch**: sampling only. Humans don't read the task DB. They see generated views when something matters (via L2).

### L2: Product — the department

A product runs for months. Some things about it are for humans to read and shape (the brief, the brand, the architecture). Some things are state that only agents care about (task graph, decision links, handoffs).

Don't force either into the wrong format.

**The human-readable part** (markdown files in the product repo):

These are beautiful, short, and stable. A human authors them. An agent reads them.

- `BRIEF.md` — what the product is, who it's for, why it exists
- `ARCHITECTURE.md` — how it's built and why
- `BRAND.md` — voice, positioning
- `PRINCIPLES.md` — the hard rules for this product, distilled over time from what works

These are the product's **soul**. If the files disappear, the product doesn't know who it is.

**The agent-native part** (rows in `knowledge_items` with `layer='L2'` and `scope_id` = product name):

- `tasks` (L1 lives here)
- `decisions` — lightweight rows: topic, choice, why, alternatives, outcome, links. Not 2-page ADRs. A decision is a row. The "decisions become wisdom" bit comes from their *connections*, not their prose.
- `handoffs` — what each agent session left for the next
- `cycles` — bet cycles, with start/end, intent, reality, reflection
- `bets` — active and historical

Agents read and write this directly. Humans only see it through generated views.

**The SECI bit, in practice:** SECI (knowledge converting between tacit and explicit) is a nice theory but we're not running SECI rituals. We just take the essence: **when an agent learns something, capture it inline with the work, not in a separate docs pass.** The capture happens automatically through the task outcome. Promotion to a reusable practice (L3) happens when the same learning shows up twice.

### L3: Practice — cross-product learning

**The highest-leverage layer.** Most agent systems skip this entirely.

Inspired by Knowledge-Centered Service (how good support teams work): before solving a problem from scratch, check if someone already solved it. That single behavior — *reuse before create* — is worth more than any other knowledge management practice.

- **Storage**: unified `knowledge_items` table (§3), `layer='L3'`, scoped by `scope_id` per community of practice (building, product, growth, ops). `topic` is a first-class column for grouping items (e.g. 'auth', 'deployment'). Additional fields in `meta` JSON: summary, what_works, anti_patterns, evidence_task_ids, last_used, tags.
- **Loading into sessions**: TOON-formatted packs, loaded JIT when an agent queries. A practice pack for "file handling" is maybe 200 tokens instead of a 3KB markdown file.
- **Anti-patterns are first-class**. When a task fails in L1, the failure promotes to a candidate anti-pattern. The agent that wrote it or a later reviewer confirms, and it becomes searchable: "don't do X because Y (see TASK-042)."
- **Human touch**: the Knowledge view in the Factory app (see `HUMAN_INTERFACE_LAYER.md` §4.4). Humans review new/updated practices weekly. Sharpen wording. Retire stale ones. Add tacit knowledge agents can't generate — customer taste, market intuition.

This is where Communities of Practice comes in as an inspiration, not a label: all Builders across all products share the same practice community (`layer='L3'`, `scope_id='building'` in `knowledge_items`). Knowledge that emerges in Nimmly is available to HyperIdle immediately. No copy-paste. No "did you know Ambrovia already solved this?" moments.

### L4: Factory — the meta

The company's own brain. What we believe. What we're trying to get to. Which products get energy right now.

- **Storage**: **human-readable markdown only.** This is where humans live. If a file in L4 is hard to read, the architecture is wrong.

Four files:
- `PRINCIPLES.md` — the short list of hard rules (5–10 lines, slow-changing)
- `FOCUS.md` — what we're trying to improve this month (the current target)
- `PORTFOLIO.md` — which products get energy this cycle, and why
- `REFLECTIONS/` — monthly notes from the coaching sessions (one file per month)

The assistant agent proposes changes to these files. Humans approve, edit, or reject. Git is the history.

The inspiration is double-loop learning (question the rules, not just the work) and the Kata improvement cycle (explicit target, explicit current state, explicit next experiment). We're not naming them anywhere in the interface. We're just structuring the monthly conversation around those bones.

---
