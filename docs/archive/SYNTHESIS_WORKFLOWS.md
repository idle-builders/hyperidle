# Synthesis: Three Workflow Designs for an Agent Collaboration Tool

How agents work, how humans validate, and what they see — described as actual flows.

---

## Version A: The Stream

**Core metaphor:** A river of work flowing through the company. Agents produce objects that flow downstream. Humans dip in when needed.

### What agents produce

Every agent action creates one of three objects:

- **A Work Item** — something concrete (code committed, content written, config deployed)
- **A Decision** — a choice with context and rationale
- **A Question** — something the agent can't or shouldn't resolve alone

These objects flow into a single chronological stream per product. Think of it as a project timeline where you can see everything that's happened.

### What the founder sees

Open the app. You see your products listed. Each product shows a stream. The stream has a filter:

- **All** — everything, full timeline
- **Needs me** — questions + high-risk decisions waiting for input
- **Decisions** — browse what agents decided and why
- **Milestones** — phase transitions, launches, significant completions

**The "Needs me" view is the daily driver.** Morning coffee, you open it, see 4 items:

```
NIMMLY — Needs you (3)

→ [QUESTION] Builder: "The CSV import handles German number
   formatting (1.234,56) but the spec doesn't mention locale
   support. Should I add locale detection or assume US format?"

   [US only] [Add locale detection] [Let me think — park it]

→ [DECISION · high-risk] Growth: "Ready to send launch email
   to 847 subscribers. Subject: 'Your M&A blind spots,
   visualized.' Preview below."

   [Send it] [Edit first →] [Hold]

→ [MILESTONE] Builder: "Build phase complete.
   Distillation ready for review."

   Here's what we built, what we decided, and what we learned.
   Ready to move to SHIP phase?

   [Review distillation →] [Not yet]
```

The stream captures everything but only surfaces what needs human attention. You can always scroll back to see the full history — every decision, every work item, every question — but you don't have to.

### How a phase transition works

When the Builder finishes the BUILD phase, it triggers a distillation. The tool automatically:

1. Collects all decisions made during BUILD
2. Collects the current state of the product (what works, what's incomplete)
3. Collects open questions and known issues
4. Packages this into a **Phase Review** object

The founder sees the Phase Review in their stream. It's a single document that summarizes the phase — not a list of tasks, but a narrative: "Here's what we built, here's why we made the choices we did, here's what we learned, here's what's ready and what isn't." The founder reads it, adds comments, approves or sends back, and the product moves to the next phase. The distilled summary becomes the starting context for the next phase's agents.

### How cross-product learning works

Decisions are tagged by domain (`#pricing`, `#auth`, `#onboarding`, `#charting`). When an agent in HyperIdle is about to make a decision about onboarding, the tool surfaces: "Nimmly's Builder decided to keep onboarding to 2 steps (DEC-2026-03-15). Outcome: 73% completion rate." The agent sees this as context. The human sees it if they browse the decision.

### Strengths
- Simple mental model — one stream per product
- Low overhead — agents just produce objects, no special workflow to follow
- Human attention is efficiently directed via "Needs me"
- Full history preserved and browsable

### Weaknesses
- Stream can get noisy for active products
- No explicit structure for HOW agents should work (very flexible, maybe too flexible)
- Cross-product learning depends on good tagging

---

## Version B: The Board

**Core metaphor:** A Kanban-style board per product, but the columns are lifecycle phases and the cards are shaped work with embedded knowledge.

### The board layout

Each product has a board. Columns are phases:

```
| DISCOVER | DEFINE | BUILD | SHIP | GROW | OPERATE |
```

Within each column, cards represent units of work. But cards aren't tasks — they're **experiments** in the Toyota Kata sense. Each card has:

```
┌─────────────────────────────────────┐
│ Add multi-company comparison view   │
│                                     │
│ TARGET: Users compare 3+ companies  │
│ CURRENT: Single company works       │
│ HYPOTHESIS: Virtual scrolling will  │
│   handle 20+ companies              │
│                                     │
│ ●●●●●○○○ [hill chart position]     │
│                                     │
│ Agent: Builder                      │
│ Decisions: 2 | Questions: 1        │
│ Last activity: 12 min ago           │
└─────────────────────────────────────┘
```

### What the founder sees

Open a product's board. Scan the hill chart dots to see where unknowns remain. Cards on the left side of the hill = still figuring things out (pay attention). Cards on the right = executing (less attention needed).

Click into a card to see the full experiment thread:

```
EXPERIMENT: Multi-company comparison view
Hill: ●●●●●○○○ (executing — unknowns resolved)

─── Timeline ───

Apr 1, 09:15 — Builder
  Started. Reviewed existing single-company component.
  DECISION: Extend CompanyCard component rather than rebuild.
  Why: 80% of the UI is reusable. Rebuilding would take 3x longer.

Apr 1, 10:30 — Builder
  Hit performance issue above 5 companies.
  DECISION: Use TanStack Virtual for scrolling.
  Why: Already in our stack for Nimmly tables. Lightweight.
  Considered: Pagination (worse UX for comparison),
  windowing from scratch (reinventing the wheel).

Apr 1, 11:45 — Builder
  QUESTION for CPO: Should comparison view support
  drag-to-reorder companies, or fixed order by name?

  Context: Drag-reorder adds ~2 days of work and introduces
  state complexity. Fixed order is simpler but less flexible.

  [Drag-reorder] [Fixed order] [Comment]

Apr 1, 14:00 — Builder
  Implemented fixed order (per CPO).
  Comparison view working with 25 companies.
  Performance: 60fps scroll, 1.2s initial load.
  Hill position: moved past peak → executing.

  NEXT: Style polish, responsive breakpoints,
  write tests, update DECISIONS.md
```

### How validation works

The board itself IS the validation surface. The founder doesn't go to a separate queue — they look at the board. What needs attention is visible through:

- **Hill position** — dots on the left (uphill) = unknowns, needs more founder input
- **Question badges** — a card with pending questions shows a red dot
- **Phase boundary** — a card can't move to the next column without founder approval

Founder input happens in-context: click the card, see the thread, answer the question, see the decisions the agent made, approve or redirect. The thread IS the knowledge — it's not stored elsewhere and summarized separately. It's the primary record.

### How phase transitions work

When all cards in BUILD are complete (right side of hill, tests passing), the board proposes a phase transition. It generates a **Phase Summary Card** that sits between the columns:

```
| BUILD |  ──[PHASE REVIEW]──  | SHIP |

Phase Review: BUILD → SHIP
─────────────────────────────
Built: 4 features, 12 decisions made
Key decisions:
  - Recharts for viz (simplicity > power)
  - US locale only for MVP (revisit in v2)
  - TanStack Virtual for lists (proven in our stack)

What we learned:
  - Performance testing early saved us from a
    rewrite on the comparison view
  - Our onboarding template worked first try —
    pattern is proven across products

Open items for SHIP:
  - Need final copy review on landing page
  - Stripe integration untested with real cards

[Approve transition →] [Not ready — here's why]
```

### How cross-product learning works

The board has a side panel: **Practices**. It shows relevant patterns from other products, contextual to what's on the board. If you're looking at a card about onboarding, the practices panel shows: "Across 3 products, 2-step onboarding outperforms 3+ steps. See: Nimmly (73% completion), Ambrovia (68% completion)."

Agents see this same panel as context when they work on a card.

### Strengths
- Visual — founders see the state of everything at a glance
- Hill charts make knowledge state (unknown vs. known) explicit
- Experiments as the work unit forces agents to be explicit about hypotheses
- Thread-per-experiment keeps knowledge attached to context

### Weaknesses
- More structured — agents need to follow the experiment pattern
- Board can get cluttered with many parallel experiments
- Less free-form than the stream — might constrain creative work

---

## Version C: The Notebook

**Core metaphor:** Each product is a living document — like a lab notebook — that agents write into and humans annotate. Knowledge and work are the same thing.

### The notebook structure

Each product is a notebook with chapters that correspond to lifecycle phases. The currently active chapter is always open. Previous chapters are collapsed but accessible.

```
NIMMLY NOTEBOOK

Chapter 1: Discovery (completed, collapsed)
  └ Market signals, opportunity brief, go/no-go decision

Chapter 2: Definition (completed, collapsed)
  └ Product spec, architecture decisions, brand identity

Chapter 3: Build (active, expanded)
  ├── Week 1: Foundation
  │   ├── Entry: Set up project from factory template
  │   ├── Entry: Database schema design
  │   │   └── DECISION: Separate tables per entity type
  │   │       Rationale: Cleaner queries, easier to extend
  │   │       CPO note: "Makes sense. Watch for join complexity."
  │   └── Entry: Basic company profile CRUD
  │
  ├── Week 2: Core Features
  │   ├── Entry: Valuation dashboard
  │   │   └── DECISION: Recharts over D3
  │   │       Rationale: Speed of iteration > customization
  │   │   └── REFLECTION: Took 2 days, estimate was 3.
  │   │       Template UI components saved time.
  │   ├── Entry: CSV import pipeline
  │   │   └── QUESTION → CPO: Locale handling?
  │   │       CPO: "US only for MVP. Tag for v2."
  │   │   └── FAILED EXPERIMENT: Tried streaming parser
  │   │       for large files. Memory issues with PapaParse
  │   │       streaming mode. Fell back to chunked upload.
  │   │       LESSON: PapaParse streaming is unreliable >50MB
  │   └── Entry: Multi-company comparison view
  │       └── ...
  │
  └── Week 3: Polish & Prep (in progress)
      └── ...

Chapter 4: Ship (upcoming)
Chapter 5: Grow (upcoming)
```

### How agents write

Agents write entries as they work. An entry is a short narrative — what they did, what they decided, what they learned. Not task updates ("completed ticket X") but knowledge artifacts ("built the comparison view, chose virtual scrolling because..."). Decisions, questions, experiments, and failures are inline — they're part of the narrative, not separate objects.

The writing style matters. The notebook reads like a project journal, not a log file. It's meant to be readable by humans weeks or months later. An agent that writes good notebook entries is producing knowledge as a byproduct of working.

### How founders interact

Founders read the notebook. They annotate entries with notes, questions, and steering. Their annotations are visually distinct (like margin notes or inline comments):

```
Entry: Built CSV import with chunked upload approach
DECISION: Max file size 50MB, chunked into 5MB pieces

  CPO margin note: "50MB feels low for M&A data.
  Check with first 3 users what their actual file
  sizes look like. If >50MB is common, revisit."

  CEO margin note: "Can we use this as a selling point?
  'Import your existing analysis in seconds' —
  talk to Growth about landing page copy."
```

The annotations are context that flows forward. When the Growth agent writes landing page copy, it sees the CEO's note about CSV import as a selling point. When the Builder revisits file size limits, it sees the CPO's note about checking with users.

### The chapter transition

When a chapter closes, the notebook generates a **chapter summary** — a 1-page distillation of what happened, what was decided, and what was learned. Previous chapters collapse to their summary but remain expandable for full detail.

The summary is collaboratively reviewed: the agent drafts it, the founder edits and approves it. This is the validation moment — not "is the code good?" but "do we have a shared understanding of where we are?"

### How cross-product learning works

The notebook has a **margin reference** feature. When an agent writes about a topic that connects to another product's notebook, a reference appears in the margin:

```
Entry: Chose 2-step onboarding flow

  Margin ref: "See Nimmly Chapter 3, Week 1:
  Same decision, 73% completion rate.
  See Ambrovia Chapter 5: 3-step flow,
  51% completion — switched to 2-step in v2."
```

The factory-level learning lives in a **meta-notebook** — "The Factory Notebook" — that accumulates cross-product patterns, anti-patterns, and principles. The Context Keeper maintains this. It reads like a growing playbook: "Here's what we've learned about building SME products across our portfolio."

### How failure is captured

Failed experiments are first-class entries, visually distinct (maybe a different color or marker). They're not hidden or cleaned up — they stay in the narrative:

```
FAILED EXPERIMENT: Streaming CSV parser
  Tried PapaParse streaming for files >10MB.
  Memory spiked to 2GB on a 45MB file.
  Crashed the container.

  Fell back to: chunked upload (5MB pieces,
  server-side assembly).

  LESSON: PapaParse streaming mode is unreliable
  for large files on Node.js. Don't use it again.
  Tagged: #csv #performance #anti-pattern
```

This entry is now searchable. When any future agent across any product considers PapaParse streaming, this shows up.

### Strengths
- Knowledge and work are truly unified — the notebook IS the work AND the documentation
- Rich narrative context — decisions don't live in isolation, they're embedded in the story
- Natural for human reading — founders can read a chapter and deeply understand what happened
- Founder annotations create a coaching dialogue directly on the work
- Failed experiments are preserved in context, not stripped out

### Weaknesses
- Agents need to be good writers (narrative quality matters)
- Could get long — need discipline about what's worth an entry
- Less visual than the board — no at-a-glance status like hill charts
- Search/cross-reference depends on good tagging and margin references

---

## Comparison

| Dimension | Stream | Board | Notebook |
|-----------|--------|-------|----------|
| **Mental model** | River of events | Kanban of experiments | Lab journal |
| **Primary object** | Work item, decision, question | Experiment card | Narrative entry |
| **How founders engage** | Filter to "needs me", respond | Scan hills, click into cards | Read chapters, annotate margins |
| **Knowledge capture** | Objects accumulate in timeline | Threaded on experiment cards | Inline in narrative |
| **Phase transitions** | Phase Review object in stream | Summary card between columns | Chapter summary |
| **Cross-product learning** | Tagged decisions, searchable | Practices side panel | Margin references + meta-notebook |
| **Best for** | High-volume, many products | Active development, visual thinkers | Deep product understanding |
| **Risk** | Noisy at scale | Rigid structure | Verbose, depends on writing quality |

---

## A hybrid thought

These aren't mutually exclusive. You could combine:

- **The Board** as the daily working view (agents move experiments through phases, founders scan hills)
- **The Notebook** as the knowledge layer underneath (every experiment card opens into a narrative thread with margin annotations)
- **The Stream** as the notification/queue layer on top (filtered "needs me" view for mobile/quick triage)

Three views of the same underlying work — one visual (board), one narrative (notebook), one temporal (stream). The data is the same. The view matches the context: quick scan on phone = stream, working session at desk = board, deep review = notebook.

---

*Pick one to prototype. Or pick the hybrid. The tool itself should be one of our products — dogfood it to run the factory.*
