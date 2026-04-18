# Research: How Humans & Companies Manage Knowledge

What works in human organizations — theory and practice — that we can learn from when designing context management for an AI company.

---

## 1. Theoretical Frameworks

### SECI Model (Nonaka & Takeuchi, 1990)

The foundational model of how organizations create knowledge. Knowledge converts between **tacit** (in people's heads, hard to articulate) and **explicit** (written down, shareable) through four modes:

```
              Tacit → Tacit          Tacit → Explicit
            ┌──────────────┐      ┌──────────────────┐
            │ SOCIALIZATION │      │ EXTERNALIZATION   │
            │               │      │                   │
            │ Shared        │      │ Articulating      │
            │ experience,   │ ──▶  │ what you know     │
            │ watching,     │      │ into docs,        │
            │ pairing,      │      │ specs, models,    │
            │ being there   │      │ frameworks        │
            └──────────────┘      └──────────────────┘
                   ▲                        │
                   │                        ▼
            ┌──────────────┐      ┌──────────────────┐
            │INTERNALIZATION│      │  COMBINATION      │
            │               │      │                   │
            │ Learning by   │      │ Merging explicit  │
            │ doing,        │ ◀──  │ knowledge:        │
            │ practice      │      │ reports, DBs,     │
            │ makes tacit   │      │ cross-referencing │
            └──────────────┘      └──────────────────┘
           Explicit → Tacit        Explicit → Explicit
```

**Why it matters for us:**
- Most AI agent systems only do COMBINATION (explicit → explicit: merge docs, compile reports)
- They skip SOCIALIZATION entirely (agents don't pair or share experience implicitly)
- EXTERNALIZATION is the hardest: converting tacit insight into something the next agent can use
- INTERNALIZATION happens when agents learn from past decisions and start "just knowing" how to handle similar situations
- The SECI cycle is a SPIRAL — each loop creates richer knowledge. Our factory should explicitly support all four modes, not just combination.

**Practical implication:** When an agent completes a task, don't just log what happened (combination). Capture WHY decisions were made, what felt right/wrong (externalization). When an agent starts a new session, don't just load facts — load decision context so it can internalize patterns.

---

### Double-Loop Learning (Argyris & Schön)

**Single-loop learning:** "We made an error → fix the error → continue"
**Double-loop learning:** "We made an error → why did our RULES produce this error? → change the rules"

```
Single loop:  Action → Outcome → Adjust action
                ↑_________________________↓

Double loop:  Action → Outcome → Adjust action
                                     ↓
                              Question the goals,
                              assumptions, and
                              rules that led to
                              that action
                                     ↓
                              Change the governing
                              variables
```

Most organizations resist double-loop learning because it means questioning assumptions, admitting the rules are wrong, and changing fundamental approaches — not just tweaking execution.

**Why it matters for us:**
- Most agent systems do single-loop only: task failed → retry with different approach
- Double-loop = "why did we build this feature at all?" or "why does our product template assume Next.js?" or "why are we targeting this market segment?"
- The Chief of Staff / Context Keeper should be doing double-loop analysis: not just "what went wrong" but "what assumptions were wrong?"
- Monthly retrospectives should explicitly ask double-loop questions

---

### Communities of Practice (Wenger & Lave, 1991)

Groups of people who share a concern, set of problems, or passion about a topic, and deepen their knowledge by interacting regularly. Key characteristics:

- **Domain:** shared area of interest
- **Community:** members who interact and learn together
- **Practice:** shared repertoire of resources, experiences, tools, ways of addressing recurring problems

They're NOT formal teams. They form organically around shared practice. Benefits: drive strategy, generate new ideas, transfer best practice, reduce learning curves, solve problems quickly, minimize knowledge loss.

**Why it matters for us:**
- Our "departments" per product are formal teams. But we also need cross-product communities of practice.
- All Builders across products share a practice (coding, architecture). All Growth agents share a practice (marketing, content).
- A "Builder community" where learnings from Nimmly's Builder flow to HyperIdle's Builder is a community of practice.
- This is how cross-product knowledge flows WITHOUT a centralized knowledge base. Agents in the same role naturally share context.

---

### Toyota Kata (Mike Rother)

Not a knowledge management framework per se — it's a **practice pattern** for continuous improvement that creates knowledge as a byproduct.

**Improvement Kata (4 steps, repeated endlessly):**
1. Understand the direction/challenge
2. Grasp the current condition
3. Establish the next target condition
4. Experiment toward the target condition (PDCA cycles)

**Coaching Kata:** A manager asks 5 questions to guide someone through the Improvement Kata:
1. What is the target condition?
2. What is the actual condition now?
3. What obstacles do you think are preventing you?
4. What is your next step? (What do you expect?)
5. When can we go and see what we learned?

**Why it matters for us:**
- This is the pattern for how founders interact with agents. Not "do this task" but "here's the target, what's the current state, what obstacles do you see, what's your next experiment?"
- Built-in learning loop — every cycle generates knowledge about what works
- The 5 coaching questions could literally be the template for human-agent interaction in the validation queue
- Knowledge isn't stored in documents — it's created through the practice of improving

---

## 2. Practical Methodologies

### Architecture Decision Records (ADRs)

Lightweight documents that capture decisions with context. Structure:

```
# ADR-001: Use Recharts for data visualization

## Status: Accepted

## Context
We need a charting library for the Nimmly valuation dashboard.
D3 is powerful but complex. Recharts is simpler but less flexible.
Our products are SME tools — simplicity matters more than custom viz.

## Decision
Use Recharts for all standard data visualization.
Fall back to D3 only for custom interactive visualizations.

## Consequences
+ Faster development, smaller bundle
+ Consistent look across products
- Limited customization for complex charts
- May need to switch if we need advanced interactions
```

**Why it matters for us:**
- Decisions without context are useless. "We use Recharts" means nothing 3 months later. "We chose Recharts because simplicity > flexibility for SME tools" is knowledge.
- ADRs are the EXTERNALIZATION step of SECI — turning tacit "we just knew" into explicit "here's why"
- They survive team member turnover. When a new Builder agent starts, ADRs tell it WHY things are the way they are.
- They're files. Simple markdown. No infrastructure needed.
- They accumulate into a decision history that agents can search.

---

### After Action Review (AAR)

Originated in U.S. military (1970s). A meta-analysis of 61 studies found AARs produce a large effect on outcomes (d = 0.79), outperforming most training methods. Four questions:

1. **What was supposed to happen?** (plan/intent)
2. **What actually happened?** (reality)
3. **Why was there a difference?** (analysis)
4. **What will we do differently next time?** (improvement)

Key rules: conducted immediately (not weeks later), self-discovery (participants figure it out, not told), focused on few key issues (not everything), results captured and fed forward.

**Why it matters for us:**
- Every product launch, every sprint, every significant agent task should generate an AAR
- The gap between "what was supposed to happen" and "what actually happened" is where all the learning lives
- AARs feed directly into LEARNINGS.md and into the SECI externalization step
- They should be AUTOMATIC — agents run them at the end of sprints, product phases, launches
- The AAR output becomes input to the next cycle — this is the knowledge spiral

---

### Knowledge-Centered Service (KCS)

30-year-old methodology for managing knowledge in support/service orgs. Core insight: **capture knowledge in the moment of use, not as a separate activity.**

Four practices:
1. **Capture** — in the moment, in the asker's context (not later, not abstractly)
2. **Structure** — consistent format for readability and findability
3. **Reuse** — search before creating; link to existing knowledge
4. **Improve** — update knowledge every time you interact with it (not in separate "maintenance" passes)

KCS is a "double-loop" model — it doesn't just capture answers, it improves the system that produces answers.

**Why it matters for us:**
- "Capture in the moment" = agents should write learnings as they work, not in a separate "wrap-up" step
- "Reuse before create" = agents should SEARCH existing knowledge before solving a problem from scratch. This is the single highest-leverage behavior.
- "Improve on interaction" = every time an agent reads a knowledge file and finds it incomplete or wrong, it should update it RIGHT THEN
- This turns every agent interaction into a knowledge improvement loop. Files get better through use, not through dedicated maintenance.

---

### Shape Up (Basecamp / Ryan Singer)

Product development methodology with built-in knowledge management:

**The Pitch:** A structured document (problem, appetite, solution, rabbit holes, limitations) that captures the THINKING behind a project, not just the requirements. Pitches are the externalization of product intuition.

**The Betting Table:** Senior team reviews pitches and "bets" on which to build. Not a backlog — no accumulated pile. Each cycle, you start fresh. Old pitches die unless someone re-pitches them. This prevents knowledge debt.

**Hill Charts:** Track work on a spectrum from "unknown" to "known" to "done." The uphill side = figuring things out. The downhill side = execution. This makes the KNOWLEDGE STATE of work visible.

**Cool-down:** 2 weeks between 6-week cycles for fixing, polishing, and — crucially — for the knowledge created during the cycle to settle and be reflected on.

**Why it matters for us:**
- Pitches > user stories for our factory. A pitch captures WHY and CONSTRAINTS, not just WHAT.
- The betting table model fits: founders review pitches, bet on which products/features to build next cycle
- Hill charts make knowledge progress visible — useful for human review of agent work
- Cool-down periods are where double-loop learning happens. Without them, you never reflect.
- No shared backlog = no growing pile of stale knowledge

---

### Zettelkasten / Second Brain (Luhmann, Ahrens, Forte)

Knowledge management through atomic, linked notes:

- Each note captures ONE idea
- Notes link to related notes (not organized in folders)
- Knowledge emerges from the connections, not the individual notes
- The graph grows organically — new connections reveal insights

Used by Niklas Luhmann to write 70+ books. The key insight: **the value is in the links between ideas, not the ideas themselves.**

**Why it matters for us:**
- Product decisions connect across products. A pricing decision for Nimmly relates to a pricing decision for HyperIdle. Links make that visible.
- Obsidian (which you already mentioned for deep review) is built for this pattern
- Agent learnings could be structured as atomic notes with links rather than long documents
- The graph structure naturally surfaces patterns: if many notes link to "SME users prefer simple pricing," that's a strong signal
- BUT: agents are bad at maintaining link quality. This needs human curation or a dedicated Context Keeper skill.

---

## 3. How Collaboration Platforms Structure Knowledge

### Notion (teams, wikis, product docs)
- **Databases with views:** Same data, different presentations (table, board, timeline, gallery)
- **Templates:** Reusable structures for recurring content (meeting notes, specs, retrospectives)
- **Relations:** Pages link to database entries. A product page links to its decisions, its team, its metrics.
- **Toggle blocks:** Progressive disclosure — show summary, click for details
- Pattern: **structured flexibility** — enough structure to find things, enough flexibility to adapt

### Linear (product/engineering teams)
- **Projects > Issues > Comments** hierarchy with automatic state tracking
- **Cycles** (like sprints) with built-in velocity tracking
- **Triage** — explicit inbox for new items before they enter the workflow
- **Views** — everyone sees the same data filtered to their context (my issues, my team, blocked, etc.)
- Pattern: **opinionated workflow** — the tool enforces good practices rather than being infinitely flexible

### Obsidian (individual/small team knowledge)
- **Local-first markdown files** — you own the data
- **Bidirectional links** — `[[link]]` syntax creates connections both ways
- **Graph view** — visual map of how knowledge connects
- **Daily notes** — temporal anchor for what happened when
- **Plugins** — extensible for any workflow (Kanban, templates, Git sync, etc.)
- Pattern: **emergent structure** — start with notes, structure emerges from linking

### Confluence (enterprise knowledge base)
- **Spaces > Pages** hierarchy (like folders, but with richer metadata)
- **Labels/tags** for cross-cutting concerns
- **Templates** for consistency (decision records, meeting notes, runbooks)
- **Comments and inline comments** — knowledge attached to specific content
- Pattern: **hierarchical with cross-links** — tree structure plus labels for discoverability

---

## 4. Patterns That Work Across All of These

### 1. Capture at the moment of creation
Every methodology agrees: capture knowledge WHEN it's created, not later. KCS, AAR, ADRs — all emphasize immediacy. Context is freshest in the moment.

### 2. Structure enables retrieval
Unstructured notes are write-only memory. Templates, formats, and conventions make knowledge findable. ADR format, AAR format, pitch format — all enforce structure.

### 3. Knowledge has a lifecycle
Knowledge isn't static. It's created → validated → used → updated → eventually retired. The SECI spiral, KCS improve-on-use, and Manus's "prune stale context" all reflect this.

### 4. Links > hierarchy
Strict hierarchies break. Cross-cutting concerns don't fit neatly into folders. Links (Zettelkasten, Obsidian, Notion relations) let knowledge connect across boundaries. Critical for a multi-product company.

### 5. Separate stable from volatile
Cline's Memory Bank, Claude Code's CLAUDE.md vs. auto-memory, and Shape Up's pitch vs. hill chart all separate knowledge that rarely changes (identity, architecture, mission) from knowledge that changes constantly (active context, progress, current state).

### 6. Reflection creates learning
Raw experience ≠ knowledge. AARs, retrospectives, cool-down periods, double-loop questioning — all are structured reflection that transforms experience into reusable knowledge. Without reflection, you just accumulate data.

### 7. Reuse before create
KCS's most powerful principle. Before solving a problem, search for existing solutions. This is where most AI agent systems fail: they solve from scratch every time, ignoring accumulated knowledge.

### 8. Knowledge needs community
SECI's socialization, Wenger's communities of practice, and the Zettelkasten graph all show: knowledge grows through connection, not isolation. Isolated silos of per-product knowledge miss the compound learning effect.

---

Sources:
- [SECI Model — Nonaka & Takeuchi](https://en.wikipedia.org/wiki/SECI_model_of_knowledge_dimensions)
- [SECI Operationalization — Frontiers in Psychology](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.02730/full)
- [Double-Loop Learning — Argyris](https://en.wikipedia.org/wiki/Double-loop_learning)
- [Double-Loop Learning in Organizations — Action Design](https://actiondesign.com/resources/readings/double-loop-learning)
- [Communities of Practice — Wenger](https://infed.org/dir/welcome/learning-in-organizations-theory-and-practice/)
- [Toyota Kata — Mike Rother](http://www-personal.umich.edu/~mrother/The_Improvement_Kata.html)
- [Architecture Decision Records](https://github.com/joelparkerhenderson/architecture-decision-record)
- [ADRs — Martin Fowler](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
- [After Action Review — Wikipedia](https://en.wikipedia.org/wiki/After-action_review)
- [AAR Leaders Guide — U.S. Army](https://pinnacle-leaders.com/wp-content/uploads/2018/02/Leaders_Guide_to_AAR.pdf)
- [Knowledge-Centered Service — Consortium for Service Innovation](https://www.serviceinnovation.org/kcs/)
- [KCS — Atlassian](https://www.atlassian.com/itsm/knowledge-management/kcs)
- [Shape Up — Basecamp](https://basecamp.com/shapeup)
- [Zettelkasten Method](https://zettelkasten.de/introduction/)
- [Cline Memory Bank](https://docs.cline.bot/features/memory-bank)
- [Building Your Second Brain in Obsidian](https://medium.com/@anjanj/the-ultimate-zettelkasten-system-how-i-built-a-second-brain-in-obsidian-95c29f89c6f7)
- [Knowledge Management Best Practices — Atlassian](https://www.atlassian.com/software/confluence/resources/guides/best-practices/knowledge-management)
