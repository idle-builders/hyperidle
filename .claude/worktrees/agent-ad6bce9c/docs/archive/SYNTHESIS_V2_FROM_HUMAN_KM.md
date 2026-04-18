# Synthesis v2: Starting from Human Knowledge Theory

The premise: human knowledge management research is decades ahead of what agent tools currently do. Start from proven human theory. Adapt for agent realities. Arrive at something new.

---

## PART 1: Agent Knowledge Principles — Derived from Human KM

### Set 1: "The Knowledge Spiral" (from SECI)

SECI says knowledge converts between tacit and explicit through four modes. Current agent tools only do Combination (explicit→explicit: merge, compile, cross-reference). What if we took ALL four modes seriously?

**Adapted for agents:**

| SECI Mode | Human version | Agent adaptation |
|-----------|--------------|-----------------|
| Socialization (tacit→tacit) | Pair programming, watching, being in the room | Agents read each other's WORKING context — not just outputs but reasoning, dead ends, the "shape" of the problem. Shared practice spaces where the WAY of working transfers, not just facts. |
| Externalization (tacit→explicit) | Writing up why you made a choice, articulating intuition | After solving a problem, agent explicitly articulates the PATTERN it discovered. Not "I used Recharts" but "For SME tools, choose the simplest viable library because users spend <30s on any visualization." The heuristic, not the fact. |
| Combination (explicit→explicit) | Reports, databases, cross-referencing | What current tools already do. Merge knowledge, compile, connect. The table stakes. |
| Internalization (explicit→tacit) | Learning by doing, practice makes intuitive | Agent loads accumulated patterns and they change its behavior WITHOUT explicit rules. The system prompt evolves from externalized knowledge. An agent that has "internalized" SME product patterns just BUILDS differently — it doesn't need to be told "keep it simple" every time. |

**Principles derived:**
- S1. Knowledge creation requires all four conversions, not just combination
- S2. Externalization is the highest-leverage mode — turning "what worked" into transferable patterns
- S3. Socialization happens through shared working context, not just shared outputs
- S4. Internalization means the agent's behavior should CHANGE based on accumulated knowledge — not just have more files to reference
- S5. The spiral deepens with each cycle — each product built makes the factory smarter at building products

**What forgetting looks like:** The spiral pruning. Old turns of the spiral that have been superseded get dropped. But the PATTERN that emerged from them persists. You forget the specific decision but keep the heuristic it taught you.

**What the flow looks like:**

```
Agent works on a task
   │
   ▼
EXTERNALIZATION: Agent articulates what it learned
   "I discovered that chunked upload works better than
    streaming for files >10MB in Node.js environments"
   │
   ▼
COMBINATION: Learning merges with existing knowledge
   Other agents' learnings about file handling combine.
   A pattern emerges: "our stack handles large files
   better with chunked approaches across the board"
   │
   ▼
INTERNALIZATION: Pattern enters agent behavior
   Next time ANY Builder faces a file handling task,
   the chunked approach is their default. It's in their
   practice context. They don't re-discover it.
   │
   ▼
SOCIALIZATION: Working in this way transfers to new agents
   A new product's Builder reads the practice space and
   absorbs the "way we do things" — not just individual
   decisions but the accumulated working style.
   │
   ▼
   (spiral continues — each cycle deepens)
```

---

### Set 2: "The Learning Loop" (from Double-Loop + Toyota Kata + AAR)

Kata says all work is experimentation toward a target condition. Double-loop says you need to question the rules, not just fix errors. AAR says structured reflection at the moment of completion creates the deepest learning. What if the work unit itself was a learning loop?

**Adapted for agents:**

| Concept | Human version | Agent adaptation |
|---------|--------------|-----------------|
| Improvement Kata | Understand challenge → grasp current condition → set target → experiment | Every piece of agent work IS an experiment. Not "implement feature X" but "we believe doing X will achieve Y. We'll know because Z." Explicit hypothesis, explicit expected outcome. |
| Coaching Kata | Manager asks 5 structured questions | Human validation IS coaching. The human doesn't approve/reject — they ask: what's your target? what's actual? what obstacles? what's your next experiment? when can we see? |
| Single-loop | Error → fix the error | Agent adjusts its approach when something fails. Standard retry logic. |
| Double-loop | Error → question the rules that caused the error | Agent (or dedicated meta-agent) asks: why did our template/approach/assumption produce this failure? Proposes changes to practices, templates, system prompts — not just to the current task. |
| AAR | What should have happened? What did happen? Why the gap? What next? | Every completed experiment generates a structured reflection. The gap between hypothesis and reality IS the learning artifact. |

**Principles derived:**
- L1. The work unit is an experiment, not a task. Explicit hypothesis + expected outcome.
- L2. The primary knowledge artifact is the gap between intent and reality.
- L3. Single-loop learning is automatic (agent adjusts). Double-loop requires structured reflection.
- L4. Coaching (human asking questions) produces deeper learning than approval (human saying yes/no).
- L5. Reflection happens at the moment of completion, not deferred.
- L6. Double-loop questions ("should we change the rules?") are the highest-value human contribution.

**What forgetting looks like:** Experiments whose hypotheses have been superseded or disproven get archived. The learning (the gap analysis) persists. You forget the experiment details but keep the insight about what was wrong with the thinking.

**What the flow looks like:**

```
ESTABLISH TARGET (from product goal)
   "Users can compare valuations of 3+ companies"
   │
   ▼
GRASP CURRENT STATE
   "Single company view works. Data model supports multi.
    UI shows one at a time."
   │
   ▼
EXPERIMENT
   Hypothesis: "Virtual scrolling will handle 20+ companies at 60fps"
   Agent builds it. Measures. Records.
   │
   ▼
REFLECT (automatic AAR)
   Expected: 60fps with 20 companies
   Actual: 60fps with 25 companies, but 1.2s initial load
   Gap: load time not anticipated in hypothesis
   Learning: "virtual scrolling works but initial render
   needs optimization for large datasets"
   │
   ▼
NEXT EXPERIMENT (single-loop)
   "Lazy-load company data instead of fetching all upfront"
   │
   ▼
   ...after several experiments...
   │
   ▼
DOUBLE-LOOP QUESTION (periodic, human-triggered or agent-triggered)
   "We've optimized this 3 times. Is the real problem that
    comparing 20 companies at once is the wrong UX? Should
    we rethink the comparison model entirely?"
   │
   ▼
   (this goes to the human for coaching dialogue)
```

---

### Set 3: "The Living Practice" (from KCS + Communities of Practice)

KCS says capture in the moment, reuse before create, improve on every interaction. Communities of Practice say knowledge flows through shared practice across a domain, not through central databases. What if agent knowledge was a living, evolving practice that improves through use?

**Adapted for agents:**

| Concept | Human version | Agent adaptation |
|---------|--------------|-----------------|
| Capture in the moment | Support agent writes knowledge WHILE solving the ticket, not after | Agent writes what it learned AS it works, embedded in the work output. Not a separate "write learnings" step. The work product IS the knowledge artifact. |
| Reuse before create | Search the knowledge base before writing a new article | Before starting any work, agent searches existing knowledge: "has anyone solved this before?" This is the single highest-leverage behavior. Most agent systems skip it entirely. |
| Improve on interaction | Every time you use a knowledge article and find it incomplete, update it RIGHT THEN | When an agent reads a practice file and finds it wrong, outdated, or incomplete, it updates the file as part of its current work. Knowledge gets better through use, not through maintenance cycles. |
| Community of Practice | Cross-team groups who share a domain (all designers, all SREs) | Cross-product agents in the same ROLE share a practice space. All Builders share building practices. All Growth agents share growth practices. The practice evolves as each agent contributes. |
| Double-loop (KCS) | Improve the system that produces answers, not just the answers | When the same type of problem keeps arising, the practice itself changes — not just a new knowledge article, but a new way of approaching the problem class. |

**Principles derived:**
- P1. Knowledge capture is embedded in the work, not a separate activity
- P2. Reuse before create — search existing knowledge before solving from scratch
- P3. Knowledge improves through use. Every interaction with a knowledge artifact is an opportunity to update it.
- P4. Cross-product learning flows through role-based practice communities, not central databases
- P5. When the same problem recurs, change the practice (the approach), not just the knowledge (the facts)

**What forgetting looks like:** KCS-style: knowledge that is never accessed decays in relevance. Knowledge that is accessed and found wrong gets corrected (which is a form of forgetting the wrong thing). Practices that stop working get explicitly retired. Active forgetting = the practice community deciding "we no longer do it this way."

**What the flow looks like:**

```
Agent gets a task
   │
   ▼
REUSE: Search existing knowledge first
   "Has any agent in any product handled CSV import before?"
   Found: Nimmly Builder's experience — chunked upload works,
   streaming doesn't. PapaParse streaming unreliable >50MB.
   │
   ▼
WORK: Do the task, informed by prior knowledge
   Uses chunked approach from the start (saved 2 days of
   rediscovering the streaming problem)
   │
   ▼
CAPTURE: Write what was learned IN the work
   Not a separate step. The commit message, the decision file,
   the code comments — they all carry the knowledge.
   "Using chunked upload per factory practice. Added: our max
    chunk size works better at 2MB than 5MB for our hosting."
   │
   ▼
IMPROVE: Update the practice if needed
   Practice file said "5MB chunks." This agent found 2MB works
   better. Updates the practice file right now: "2MB chunks
   recommended (5MB caused timeouts on Coolify containers)."
   │
   ▼
SHARE: Updated practice is now available to all agents
   Next time any Builder across any product handles uploads,
   they get the improved practice.
```

---

### Set 4: "The Decision Architecture" (from ADRs + Zettelkasten + Shape Up)

ADRs say decisions with context are the atomic unit of knowledge. Zettelkasten says value is in the links between ideas. Shape Up says shaped thinking (pitches) beats flat requirements, and knowledge debt (backlogs) kills. What if the company's knowledge was a graph of linked decisions that reveals patterns?

**Adapted for agents:**

| Concept | Human version | Agent adaptation |
|---------|--------------|-----------------|
| ADR | Developer writes a decision record with context, alternatives, consequences | Every significant agent choice produces a structured record: what, why, what else was considered, outcome (updated later). This IS the externalization from SECI. |
| Zettelkasten linking | Notes link to notes. Patterns emerge from connections. | Decisions link to related decisions across products and time. The graph reveals: "we always choose simplicity over power" or "chunked approaches consistently outperform streaming in our stack." |
| Shape Up pitch | Structured proposal: problem, appetite, solution, rabbit holes | The unit of work enters the system as a shaped pitch, not a flat ticket. Carries the thinking, not just the requirement. |
| No backlog | Old pitches expire unless re-proposed | Decisions and learnings that aren't referenced decay. No growing pile of stale knowledge. If nobody links to it or searches for it, it's probably not important. |
| Hill chart | Visual: unknown → known → done | The knowledge state of work is visible. How much of this problem have we figured out? What's still unknown? |

**Principles derived:**
- D1. The atomic knowledge unit is a decision with context (what, why, alternatives, outcome)
- D2. Decisions link to form a graph. Patterns emerge from the connections.
- D3. Work enters the system as shaped thinking (pitches), not flat requirements
- D4. Knowledge that isn't used decays. No permanent backlog of stale knowledge.
- D5. The knowledge state of work is explicitly visible (what's unknown vs. known)

**What forgetting looks like:** Zettelkasten-style: notes with no incoming links are orphans. They're candidates for pruning. Decisions whose outcomes were superseded get marked as historical. The graph self-prunes through relevance — heavily-linked decisions are important, orphans fade.

**What the flow looks like:**

```
PITCH: Shaped proposal enters the system
   Problem, appetite, solution sketch, rabbit holes, constraints
   Links to: market signals, user feedback, related decisions
   │
   ▼
WORK: Agent works, producing decisions
   Each significant choice → decision record
   Links to: the pitch, related decisions in other products,
   relevant practice knowledge
   │
   ▼
GRAPH GROWS: Decisions accumulate and link
   After 3 products, the graph shows:
   - 12 decisions about library choices → pattern: "we always pick
     the simpler option"
   - 5 decisions about onboarding → pattern: "2 steps max"
   - 3 failed experiments with streaming → anti-pattern noted
   │
   ▼
PATTERNS SURFACE: The graph reveals principles
   Emergent: "Our products succeed when we choose simplicity
   and fail when we over-engineer." This wasn't stated as a rule.
   It emerged from linked decisions. NOW it can become a rule
   (internalization in SECI terms).
   │
   ▼
DECAY: Unused decisions fade
   A decision from 8 months ago with no links and no searches
   → archived. Still accessible if needed, but doesn't pollute
   active context.
```

---

## PART 2: Human Validation Principles — Also Derived from Human KM

Now the same exercise for HOW HUMANS VALIDATE, starting from the same frameworks.

### Set V1: "Coaching Validation" (from Toyota Kata)

The human is a coach, not a gatekeeper. Validation happens through structured dialogue that produces learning for both sides.

- V1a. Human asks questions, doesn't give answers. The agent arrives at better solutions through the coaching dialogue.
- V1b. Structured format: target → current state → obstacles → next experiment → when can we see?
- V1c. The coaching record IS knowledge. The dialogue itself is a valuable artifact.
- V1d. Coaching intensity varies by risk and uncertainty. High-uncertainty work gets more coaching. Routine work gets less.

### Set V2: "Reflective Validation" (from AAR + Double-Loop + SECI Externalization)

The human validates by reflecting on OUTCOMES with the agent. The reflection itself is the highest-value knowledge creation.

- V2a. Validation happens at completion, not during work. Let agents work, reflect together after.
- V2b. Structured reflection: intent vs. reality. The gap is what matters.
- V2c. Human's unique contribution is the double-loop question: "should we change the rules?"
- V2d. Reflections are the primary EXTERNALIZATION moment — where tacit judgment becomes explicit knowledge.
- V2e. The reflection artifact (not the work artifact) is what enters long-term memory.

### Set V3: "Practice Curation" (from KCS + Communities of Practice)

The human validates by curating the shared practices. Not reviewing individual work, but shaping the collective knowledge.

- V3a. Human reviews and curates practice files, not individual tasks.
- V3b. When human uses knowledge and finds it wrong, they update it immediately (KCS improve-on-interaction).
- V3c. Human decides when a practice should change (double-loop) vs. when an individual case was an exception.
- V3d. Human brings the "outside view" — customer conversations, market context, taste — that agents can't generate.
- V3e. The human's tacit judgment enters the system through practice curation (SECI socialization channel).

### Set V4: "Pattern Recognition" (from Zettelkasten + Decision Graph)

The human validates by seeing patterns in the decision graph that agents can't see — cross-cutting themes, strategic implications, taste.

- V4a. Human sees the decision graph, not individual decisions. Patterns over points.
- V4b. Human elevates emergent patterns into explicit principles ("we always do X — let's make that a rule").
- V4c. Human spots contradictions in the graph ("Nimmly chose simplicity but HyperIdle is over-engineering — why?").
- V4d. Human prunes: "this pattern is outdated, we've learned better."
- V4e. The knowledge state visibility (hill chart / unknown→known) lets human focus attention where uncertainty is highest.

---

## PART 3: The Morphological Box

Agent knowledge sets on one axis, human validation sets on the other. Now we can see which combinations produce genuinely new approaches.

```
                    │ V1: Coaching     │ V2: Reflective   │ V3: Practice     │ V4: Pattern
                    │ (Kata)           │ (AAR+DblLoop)    │ Curation (KCS)   │ Recognition
────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────
S: Knowledge Spiral │    S+V1          │    S+V2          │    S+V3          │    S+V4
   (SECI)           │    [1]           │    [2]           │    [3]           │
────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────
L: Learning Loop    │    L+V1          │    L+V2          │                  │    L+V4
   (Kata+DblLoop    │    [4]           │    [5]           │                  │
    +AAR)           │                  │                  │                  │
────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────
P: Living Practice  │                  │                  │    P+V3          │    P+V4
   (KCS+CoP)        │                  │                  │    [6]           │    [7]
────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────
D: Decision Arch.   │                  │    D+V2          │                  │    D+V4
   (ADR+Zettel+     │                  │    [8]           │                  │    [9]
    ShapeUp)         │                  │                  │                  │
```

Nine interesting combinations. Let me describe each briefly:

---

### [1] Knowledge Spiral + Coaching (S+V1)

Agents create knowledge through all four SECI modes. Humans coach through Kata questions at key moments.

**How it works:** Agent externalizes a pattern after work → human coaches: "Is that really the pattern? What about the case where...?" → dialogue produces a richer externalization → this enters the practice (combination) → next agent internalizes it.

**The human role:** The coach ensures externalization is GOOD. Agents are prone to shallow externalization ("Recharts is good"). The coaching question forces depth ("WHY is Recharts good for THIS context?"). The coaching dialogue is itself a SECI socialization moment — human tacit judgment transfers to the agent's future behavior.

**Forgetting:** Coached externalizations survive longer than un-coached ones. Knowledge that went through coaching has higher quality and stickiness.

---

### [2] Knowledge Spiral + Reflective Validation (S+V2)

Agents create knowledge through SECI. Humans validate by reflecting on outcomes with agents.

**How it works:** Agent completes work → structured reflection (AAR): intent vs. reality → human joins the reflection and adds the double-loop question: "should we change our approach?" → the reflection itself becomes the externalization artifact → enters the spiral.

**The human role:** The reflector. Humans bring the "why was our thinking wrong?" question. Agents can analyze what happened. Humans question why we expected what we expected.

**Forgetting:** Reflections that led to practice changes are kept. Reflections that confirmed existing practice are summarized and archived.

---

### [3] Knowledge Spiral + Practice Curation (S+V3)

Agents create knowledge through SECI. Humans validate by curating the shared practices.

**How it works:** Agents externalize → externalizations accumulate in practice spaces → human periodically curates: sharpens good patterns, corrects bad ones, prunes stale ones, elevates tacit judgment into the practice. The human IS the socialization channel — their taste and judgment enter the system through practice curation.

**The human role:** The curator/editor. Not reviewing individual work. Shaping the collective intelligence. Like a chief editor who doesn't write articles but shapes the voice and standards of the publication.

**Forgetting:** Human-curated practice files have a "last curated" date. If a practice hasn't been curated in X weeks, it's flagged for review. Uncurated practices eventually get deprioritized for loading.

---

### [4] Learning Loop + Coaching (L+V1)

All work is experiments with hypotheses. Humans coach through Kata questions.

**How it works:** Agent frames work as experiment → posts target/current/obstacles/next step → human coaches: challenges hypothesis, redirects, unblocks → agent runs experiment → reflects → coaching dialogue on the reflection.

**The human role:** The scientific advisor. "Your hypothesis is too narrow." "You're not controlling for X." "What would falsify this?" Pure Kata coaching, but applied to the experiment structure.

**Forgetting:** Failed experiments are KEPT (they're the most valuable). Hypotheses that were superseded get archived. The learning (gap analysis) always persists.

---

### [5] Learning Loop + Reflective Validation (L+V2)

All work is experiments. Validation happens through structured reflection on outcomes.

**How it works:** Agent runs experiment → auto-generates AAR (intent vs. reality) → human reviews the AAR → adds double-loop questions → reflection produces learning → learning changes the next experiment's hypothesis.

**The human role:** The retrospective partner. Adds the "zoom out" perspective. "You've run 4 experiments on onboarding. The pattern is that complexity always loses. Should we make 'maximum 2 steps' a hard rule?"

**Forgetting:** AARs compress over time. Recent AARs are detailed. Old AARs get distilled to their core learning (the gap + the insight). The experiments themselves can be forgotten; the meta-learning persists.

---

### [6] Living Practice + Practice Curation (P+V3)

Knowledge lives in shared practices that improve through use. Humans curate the practices.

**How it works:** Agents search before working (reuse) → work → capture learnings in the practice → improve practice files when they find errors → human curates periodically: sharpens, corrects, prunes → curated practices are higher-confidence knowledge.

**The human role:** The master practitioner. Like a senior craftsperson who doesn't do every piece of work but maintains the standards, the tools, and the shared wisdom of the workshop.

**Forgetting:** KCS-style. Practices that aren't accessed decay. Practices that are accessed and updated stay fresh. Human curation is the quality gate — curated practices are "validated knowledge," uncurated practices are "provisional."

---

### [7] Living Practice + Pattern Recognition (P+V4)

Knowledge lives in practices. Humans spot patterns across practices and products.

**How it works:** Practices accumulate per role across products → human reviews the practice graph → spots cross-cutting patterns: "all our successful products have 2-step onboarding, simple pricing, and a free tier" → elevates these into company principles → principles shape future practice.

**The human role:** The strategist. Sees what agents can't: the forest, not the trees. Cross-cutting themes. Strategic implications of accumulated tactical knowledge.

**Forgetting:** Human-identified patterns are high-confidence, long-lived. Practice details that served those patterns can be forgotten as long as the pattern persists.

---

### [8] Decision Architecture + Reflective Validation (D+V2)

Knowledge is a graph of linked decisions. Validation happens through reflecting on decision outcomes.

**How it works:** Agents produce decisions → decisions link across products → at milestones, structured reflection: which decisions worked? which didn't? why? → outcome tags on decisions → graph now carries not just choices but results → reflections identify patterns in what works.

**The human role:** The decision reviewer. Looks at decisions and their outcomes. "We chose the simple option 8 times. 6 times it worked. 2 times we had to rebuild. Under what conditions does simplicity fail?"

**Forgetting:** Decisions whose outcomes are known and whose patterns have been extracted → archived (keep the pattern, forget the specifics). Decisions with unknown outcomes stay active until resolved.

---

### [9] Decision Architecture + Pattern Recognition (D+V4)

Knowledge is a decision graph. Humans see patterns in the graph and elevate them.

**How it works:** Decisions accumulate and link → the graph grows → human explores the graph visually → spots clusters, contradictions, recurring themes → elevates patterns into explicit principles → principles feed back into agent decision-making.

**The human role:** The graph reader. Like a researcher looking at a citation network. Where are the hubs? What keeps getting linked to? What's contradicted? What's orphaned?

**Forgetting:** Graph-based pruning. Orphaned decisions (no links) decay. Contradicted decisions get flagged for resolution. Heavily-linked decisions are important and persist.

---

## PART 4: The Most Promising Paths

These nine aren't all equal. Some have natural synergies. Here's my read:

**The "Science Lab" — [4] + [5]: Learning Loop + Coaching/Reflection**
Everything is an experiment. Humans coach and reflect. Knowledge emerges from the gap between hypothesis and reality. This is the most rigorous and probably produces the highest-quality knowledge. But it's high-effort for humans — lots of coaching dialogue.

**The "Living Workshop" — [3] + [6]: Knowledge Spiral + Living Practice + Practice Curation**
Knowledge flows through SECI modes and accumulates in shared practices. Humans curate the practices. This is the most organic and probably the most sustainable long-term. Lower human effort — you're editing the playbook, not coaching every move.

**The "Decision Observatory" — [8] + [9]: Decision Architecture + Reflection + Pattern Recognition**
Knowledge is a growing graph of linked decisions. Humans reflect on outcomes and spot patterns. This probably produces the most STRATEGIC knowledge — seeing the forest. But it depends on agents producing good decision records consistently.

**The "Full Stack" — [3] + [5] + [9]: Spiral + Practice + Reflection + Patterns**
The ambitious combination. Agents externalize through the SECI spiral. Practices accumulate through KCS principles. Reflections happen at milestones (AAR). Human sees the graph and curates the practices. This covers all bases but might be complex to implement.

---

*These are starting points for design, not finished products. Each one implies a different tool, a different interface, a different daily rhythm. What resonates?*
