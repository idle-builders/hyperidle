# Synthesis: Five Combinations Worth Exploring

Taking patterns from human KM and agent KM research, remixed for an AI product factory where humans validate and agents execute.

---

## Combination 1: Phase-Native Memory

**Ingredients:** Cline Memory Bank + Shape Up cycles + SECI spiral

**The idea:** Memory isn't a fixed structure. What matters to remember changes as a product moves through its lifecycle. Discovery-phase memory is research, signals, and market context. Build-phase memory is architecture decisions, technical debt, and patterns. Growth-phase memory is what channels work, what copy converts, what users actually do.

Instead of one universal memory bank, each phase has its own **memory shape** — a small set of files tuned to what agents in that phase actually need. When a product transitions phases, a **distillation** happens: the outgoing phase compresses its working memory into a summary that becomes input context for the incoming phase. The raw details get archived (still accessible) but the active context stays lean.

```
DISCOVER phase memory:
  market-signals.md    — what we're seeing out there
  opportunity-brief.md — the shaped opportunity
  → distills into: PRODUCT_BRIEF.md (input to DEFINE)

DEFINE phase memory:
  spec.md              — what we're building and why
  decisions.md         — architecture & design choices with rationale
  brand.md             — voice, positioning, identity
  → distills into: BUILD_CONTEXT.md (input to BUILD)

BUILD phase memory:
  active-work.md       — current sprint state
  decisions.md         — technical decisions made during build (appends)
  blockers.md          — what's stuck and why
  → distills into: LAUNCH_BRIEF.md (input to SHIP)

GROW phase memory:
  channels.md          — what's working, what's not
  user-signals.md      — feedback, behavior patterns, requests
  metrics.md           — what the numbers say
  → distills into: PRODUCT_HEALTH.md (input to EVOLVE/SUNSET decision)
```

The phase transition is the natural compaction point. You don't need a background "Context Keeper" constantly pruning — the act of moving to the next phase forces distillation. Shape Up's cool-down period between cycles gives space for this reflection.

**The SECI angle:** Discovery is heavy on Socialization (agents absorbing market vibes) and Externalization (turning fuzzy signals into a structured brief). Build is heavy on Combination (merging specs + architecture + code). Growth is heavy on Internalization (patterns from data becoming intuition about what works). The memory shape reflects which SECI mode dominates.

**Human role:** Founders review and approve the distillation at each phase transition. This is the natural validation checkpoint — you're not reviewing tasks, you're reviewing "do we have the right understanding to move forward?" Much higher leverage than thumbs-up on individual items.

---

## Combination 2: Decisions as the Atomic Unit

**Ingredients:** ADRs + Zettelkasten linking + KCS capture-in-moment

**The idea:** The basic unit of company knowledge isn't a "learning" or a "note" — it's a **decision with context**. Every significant choice an agent makes gets captured as a lightweight decision record, immediately, as part of the work (KCS: capture in the moment, not later).

```markdown
# DEC-2026-04-01-nimmly-charting

Chose Recharts over D3 for Nimmly valuation dashboard.

Why: SME products need fast iteration. Recharts is 4x faster to implement.
     Our users don't need custom viz — they need clear, readable charts.

Considered: D3 (too complex for our velocity), Chart.js (less React-native)

Outcome: [pending — will be updated after launch]

Links: [[DEC-nimmly-stack]], [[DEC-factory-simplicity-principle]]
Tags: #nimmly #frontend #library-choice
```

Decisions link to other decisions — across products, across time. A pricing decision for Nimmly links to a pricing decision for HyperIdle because they share the tag `#pricing #sme`. The Zettelkasten insight: **value is in the connections, not the individual notes.** Over time, a graph of linked decisions reveals patterns: "we keep choosing simplicity over power for SME tools" becomes an explicit company principle that emerged from practice.

**The KCS twist:** Before making a decision, agents SEARCH existing decisions first. "Reuse before create." If a Builder is choosing a charting library, it first checks: has another product already made this decision? What was the outcome? This is where compound learning happens. Most agent systems solve every problem from scratch — this is the single biggest waste.

**Outcomes complete the loop:** When a decision's outcome becomes known (Recharts worked great / caused problems), the record gets updated. This is KCS "improve on interaction." Over time, the decision graph carries not just choices but results — making it experiential memory, not just factual memory.

**Human role:** Founders don't review every decision. They review decisions tagged as high-risk or decisions where the agent is uncertain. But they CAN browse the decision graph anytime to understand why things are the way they are. When onboarding a new product's agents, the relevant decision history is the context — not a wiki page someone wrote months ago, but the actual trail of choices and outcomes.

---

## Combination 3: The Coaching Queue

**Ingredients:** Toyota Kata + Hill Charts + AAR + Double-Loop Learning

**The idea:** The validation queue isn't a list of items to approve/reject. It's a **coaching conversation** between founders and agents. Inspired by Toyota Kata's 5 questions, every validation request comes structured as:

```
1. TARGET: What are we trying to achieve?
   "Nimmly users can compare valuations of 3+ companies side by side"

2. CURRENT STATE: Where are we now?
   "Single company view works. Data model supports multi-company.
    UI only shows one at a time. [HILL: ●●●●○○○○ — past the peak,
    unknowns resolved, executing]"

3. OBSTACLES: What's in the way?
   "Performance degrades above 5 companies. Need pagination or
    virtual scrolling."

4. NEXT EXPERIMENT: What will we try?
   "Implement virtual scrolling with TanStack Virtual. Expect it
    handles 20+ companies smoothly."

5. WHEN CAN WE SEE: When will we know?
   "Tomorrow's heartbeat. Will post benchmark results."
```

The Hill Chart position tells the founder AT A GLANCE whether this is uphill work (figuring things out — needs more attention) or downhill work (executing known solution — less attention needed). A quick scan of hills across all products shows where the real unknowns are.

**The AAR layer:** At the end of each significant piece of work (not every task — significant milestones), an automatic AAR runs:
- What was supposed to happen?
- What actually happened?
- Why the difference?
- What will we do differently?

The AAR output feeds back as a decision record (Combination 2) and updates the phase memory (Combination 1). This is the structured reflection that turns experience into knowledge.

**Double-loop trigger:** The Chief of Staff periodically reviews AAR patterns across products. When it sees the same type of failure repeating, it escalates a double-loop question to founders: "We've had 3 products where the initial landing page copy underperformed. Should we change our approach to how Growth agents write launch copy?" This isn't fixing an error — it's questioning the rules.

**Human role:** Founders are coaches, not approvers. They see the target, state, obstacles, and experiment. They can steer ("wrong target — the real goal is X"), unblock ("try approach Y instead"), or just acknowledge ("looks good, proceed"). The coaching structure means every interaction is a learning loop, not just a gate.

---

## Combination 4: Living Practices (Cross-Product Learning)

**Ingredients:** Communities of Practice + SECI Socialization + Failure-Driven Memory

**The idea:** Departments are per-product. But learning should flow across products by ROLE. All Builders share a practice. All Growth agents share a practice. All Product agents share a practice.

Each practice maintains a shared space — not a knowledge base (too static) but a **living practice file** that evolves through use:

```
practices/
├── building/
│   ├── PRACTICE.md        — "how we build things here" (evolving)
│   ├── patterns.md        — what works repeatedly
│   ├── anti-patterns.md   — what we've learned NOT to do (failure-driven)
│   └── stack-decisions.md — shared tech choices with outcomes
│
├── growth/
│   ├── PRACTICE.md        — "how we grow products here"
│   ├── channels.md        — which channels work for which product types
│   ├── copy-patterns.md   — what copy approaches convert
│   └── anti-patterns.md   — what doesn't work
│
├── product/
│   ├── PRACTICE.md        — "how we think about product here"
│   ├── user-patterns.md   — common SME user behaviors
│   ├── pricing.md         — what pricing models work
│   └── anti-patterns.md   — product mistakes to avoid
│
└── operations/
    ├── PRACTICE.md
    ├── deploy-runbook.md
    └── incident-patterns.md
```

The PRACTICE.md is the Socialization layer — it's the closest thing to "tacit knowledge" agents can share. It's not formal documentation. It's more like tribal knowledge written down: "We've found that SME users abandon onboarding if there are more than 3 steps. Keep it to 2 screens max." It evolves as agents across products contribute to it.

**Failure-driven memory is key here.** The `anti-patterns.md` files are arguably more valuable than the patterns. Research showed that feeding failures improves output more than feeding successes. "We tried long-form blog content for Nimmly and got zero traction. Short, actionable posts with data worked 5x better" — this prevents the HyperIdle Growth agent from repeating the same experiment.

**The SECI Socialization problem:** Agent systems have no equivalent of "pairing" or "watching someone work." But they can approximate it: when a Builder in one product solves a hard problem, the practice file gets updated, and all Builders across products load that updated context in their next session. It's asynchronous socialization through shared written practice — imperfect, but better than isolated silos.

**Human role:** Founders occasionally review and curate practice files. This is where the "taste filter" applies at the meta level — not just "is this product good?" but "is our approach to building products good?" The CPO curates building and product practices. The CEO curates growth and operations practices.

---

## Combination 5: The Opinionated Workspace

**Ingredients:** Linear's opinionated workflow + Obsidian's linking + Shape Up's pitches + the validation queue

**The idea:** Instead of generic "tasks" or "tickets," the workspace has opinionated object types that enforce good knowledge practices by design. You can't create work without context.

**Core objects:**

**Pitch** (inspired by Shape Up)
Not a ticket. A shaped proposal with problem, appetite, solution sketch, rabbit holes, and constraints. Created during DISCOVER/DEFINE. Must link to market signals or user feedback that inspired it. Reviewed at the betting table (founders decide what to build next).

**Decision** (inspired by ADRs)
A choice with context. Created as agents work. Carries: what, why, what else was considered, outcome (updated later). Links to related decisions. Searchable. This is the company's institutional memory.

**Experiment** (inspired by Toyota Kata)
A hypothesis with expected outcome and actual outcome. Created during BUILD and GROW phases. "We believe [X] will cause [Y]. We'll know by [date/metric]." Forces agents to be explicit about what they're testing and what they expect. Prevents random action.

**Reflection** (inspired by AAR)
Structured comparison of intent vs. reality. Created at phase transitions and milestones. Feeds into practice files and decision records. The reflection is what turns experience into knowledge.

**Signal** (inspired by KCS capture-in-moment)
A raw observation from the market, from users, from metrics, from anywhere. Captured immediately when noticed. Tagged and linked. Signals accumulate into patterns that inspire pitches. "3 users asked about PDF export this week" is a signal. 10 signals about the same thing becomes a pitch.

These five objects — pitch, decision, experiment, reflection, signal — are the vocabulary of the workspace. Everything the company does produces one of these. They link to each other. They live as files. They're human-readable and agent-writable. The linking creates a knowledge graph that grows with the company.

**The opinionated part:** agents can't just "do stuff." They operate through these objects. A Builder doesn't just write code — it creates experiments ("I believe using virtual scrolling will handle 20+ companies") and decisions ("chose TanStack Virtual because..."). A Growth agent doesn't just post content — it creates experiments ("this blog post targets keyword X, expecting Y traffic") and captures signals ("post got 3x average engagement — tagging for pattern analysis").

**Human role:** Founders interact primarily through pitches (strategic direction), reflections (learning), and high-risk decisions (validation). The signal stream gives them a pulse on what's happening without reading reports. The experiment log shows what's being tested and what's working. It's a dashboard built from the actual work, not a separate reporting layer.

---

## What These Have in Common

All five combinations share a few principles:

1. **Knowledge is created as a byproduct of work, not as a separate activity.** No one writes docs. The objects agents work with ARE the docs.

2. **Context travels with the work.** Decisions carry their rationale. Experiments carry their hypothesis. Pitches carry their market context. Nothing exists without its "why."

3. **Compaction happens at natural boundaries.** Phase transitions, not arbitrary schedules. The act of moving forward forces distillation of what matters.

4. **Cross-product learning flows through shared practice, not central databases.** Agents in the same role share a living practice space. The graph of linked decisions surfaces patterns across products.

5. **Human validation is coaching, not gatekeeping.** Founders see targets, states, and experiments — not task lists. They steer direction, not execution.

6. **Failure is first-class knowledge.** Anti-patterns, failed experiments, and the gap between intent and reality are explicitly captured and prioritized over success stories.

---

*These are starting points, not blueprints. Pick one to prototype, see what works, learn, iterate. The factory should build its own knowledge management the same way it builds products — experimentally.*
