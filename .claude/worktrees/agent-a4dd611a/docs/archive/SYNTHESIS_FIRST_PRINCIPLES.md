# First Principles Synthesis — Morphological Approach

---

## PART 1: Agent Collaboration & Knowledge Principles

Extracted from the agent research. Three distinct schools of thought about how agents should create, hold, and share knowledge.

### Set A: "The Filesystem School"
*Derived from: Manus, ICM, Cline Memory Bank*

| Principle | Source |
|-----------|--------|
| A1. Files ARE the memory. The context window is a viewport, not a container. | Manus |
| A2. Compress by dropping content, keeping the pointer. Re-read when needed. | Manus |
| A3. Folder structure IS the workflow. Numbered stages, output flows to input. | ICM |
| A4. Layer files from stable (rarely changes) to volatile (changes every session). | Cline Memory Bank |
| A5. Agent writes state back to files at session end. Checkpoint is non-negotiable. | All three |

**Implied flow:**
```
Agent starts → reads layered files (stable first, volatile last)
→ works → writes output as files → checkpoints state
→ next agent/session reads those files as input
→ compaction = archive old files, keep pointers + summaries
```

**Forgetting mechanism:** Files get archived into a `/history` or timestamped folder. Active memory stays small. Old files are reachable but not loaded by default.

**Knowledge density mechanism:** Files must be actively pruned and distilled. A file that grows past a threshold gets split or summarized. The structure itself imposes discipline — if a file is too big, the structure is wrong.

---

### Set B: "The Ticket School"
*Derived from: Paperclip, Linear, standard project management*

| Principle | Source |
|-----------|--------|
| B1. The work unit IS the memory. Context accumulates on the thread. | Paperclip |
| B2. Every task carries goal ancestry (mission → goal → sprint → task). | Paperclip |
| B3. Work moves through defined states. State transitions are meaningful events. | Paperclip / Linear |
| B4. Agents checkpoint by posting to the thread at every heartbeat. | Paperclip |
| B5. Tickets are persistent — they survive reboots, compaction, agent turnover. | Paperclip |

**Implied flow:**
```
Task created with goal ancestry → assigned to agent
→ agent works in heartbeats, posts progress to thread
→ task moves through states (backlog → doing → review → done)
→ thread accumulates all context, decisions, blockers
→ state transition triggers events (notify human, start next task)
```

**Forgetting mechanism:** Done tickets are closed but not deleted. Active context = only open tickets. The backlog is kept lean (Shape Up: no permanent backlog). Done tickets become searchable history.

**Knowledge density mechanism:** Goal ancestry keeps every ticket connected to WHY it exists. Thread accumulation means context is attached to the work, not stored separately. But threads can get long — need compression at ticket close (a "closing summary").

---

### Set C: "The Auto-Learning School"
*Derived from: Claude Code auto-memory, claude-mem, failure-driven memory*

| Principle | Source |
|-----------|--------|
| C1. Knowledge capture is a byproduct of working, not a separate activity. | KCS + Claude Code |
| C2. The agent decides what's worth remembering. | Claude Code auto-memory |
| C3. Contradictions auto-resolve: newer facts overwrite older ones. | Claude Code |
| C4. Overlapping knowledge auto-merges. | Claude Code |
| C5. Failures are more valuable than successes — prioritize loading them. | Failure-driven memory |
| C6. Progressive disclosure: load a summary first, details on demand. | claude-mem |

**Implied flow:**
```
Agent works → system captures observations automatically as it uses tools
→ compresses into summaries → stores with outcome tags (worked/failed/mixed)
→ next session: auto-injects relevant history based on current task
→ agent reads failures first, successes second
→ contradicted memories pruned automatically
```

**Forgetting mechanism:** Automatic. Contradictions deleted. Overlaps merged. Old memories that never get retrieved decay in relevance ranking. The system self-prunes.

**Knowledge density mechanism:** High density because capture is continuous and compression is automatic. But risk of missing what matters (agent decides, not human). The progressive disclosure (index → details on demand) keeps active context lean.

---

## PART 2: Agent Flows Built on Each Principle Set

What does a product development workflow look like under each school?

### Flow A: "The Filesystem Flow"

A product is a folder tree. Lifecycle phases are numbered subfolders. Each phase folder has a standard structure. Agents read from the current phase folder, write into it, and produce a summary that feeds the next phase.

```
nimmly/
├── 00-identity/
│   ├── brief.md         — what this product is (stable, rarely changes)
│   ├── brand.md         — voice, positioning
│   └── principles.md    — product-specific constraints
│
├── 01-discover/
│   ├── signals.md       — market observations
│   ├── analysis.md      — structured evaluation
│   └── SUMMARY.md       — distilled output → feeds 02-define
│
├── 02-define/
│   ├── spec.md          — product specification
│   ├── architecture.md  — technical decisions with rationale
│   ├── scope.md         — what's in, what's out, rabbit holes
│   └── SUMMARY.md       — distilled → feeds 03-build
│
├── 03-build/
│   ├── active.md        — what's in progress right now
│   ├── decisions/       — one file per significant decision (ADR-style)
│   ├── failures/        — what we tried that didn't work
│   └── SUMMARY.md       — distilled → feeds 04-ship
│
├── 04-ship/  ...
├── 05-grow/  ...
│
├── history/             — archived phase details after distillation
└── practices/           — cross-product shared files (symlinked from factory-level)
```

**How an agent works in this flow:**
1. Reads `00-identity/` (always — who am I working for?)
2. Reads current phase `SUMMARY.md` from previous phase (context of how we got here)
3. Reads current phase active files (what's the state?)
4. Does the work
5. Writes results into current phase files
6. On phase completion: writes SUMMARY.md, moves old details to `history/`

**How agents collaborate:** Agent A writes into `03-build/decisions/auth-approach.md`. Agent B reads it before making a related decision. They collaborate through the filesystem — no direct messaging needed. The files ARE the communication channel.

**Cross-product learning:** The `practices/` folder is symlinked from a factory-level practices directory. All products share it. An agent that learns something updates the practice file. All future agents across all products see it.

---

### Flow B: "The Ticket Flow"

A product is a set of goals. Goals decompose into tasks. Tasks have threads. Everything is a state machine. Work flows through states and agents pick up tasks based on assignment and priority.

```
PRODUCT: Nimmly
├── MISSION: Help SME buyers make smarter M&A decisions
│
├── GOAL: Launch MVP with valuation dashboard
│   ├── TASK: Build company profile CRUD
│   │   State: done
│   │   Thread: [agent notes, decisions, blockers, resolution]
│   │   Closing summary: "Built with Prisma ORM, REST API..."
│   │
│   ├── TASK: Build valuation comparison chart
│   │   State: in_progress
│   │   Thread: [current working notes]
│   │   Goal ancestry: Mission → MVP Goal → This task
│   │
│   └── TASK: CSV import pipeline
│       State: in_review (waiting for human validation)
│       Thread: [implementation notes, decision: PapaParse, failed experiment: streaming]
│
├── GOAL: Acquire first 100 users
│   ├── TASK: Write landing page copy
│   ├── TASK: Set up Plausible analytics
│   └── ...
```

**How an agent works in this flow:**
1. Checks assigned tasks sorted by priority
2. Reads goal ancestry (mission → goal → this task) for context
3. Reads the task thread (past heartbeats, decisions, blockers)
4. Works one heartbeat cycle
5. Posts to thread: what I did, what I decided, what's next
6. Updates task state if needed (→ in_review, → blocked, → done)
7. If done: writes closing summary on the ticket

**How agents collaborate:** Through task dependencies and thread references. A Builder's task references a Growth task ("landing page copy needed for launch"). The Growth agent can read the Builder's thread for product context. Collaboration = reading each other's threads.

**Cross-product learning:** Closing summaries from done tasks are searchable. Before starting a new task, an agent searches: "has any product done something similar?" Surfaces relevant closed tickets with summaries.

---

### Flow C: "The Auto-Learning Flow"

Agents just work. The system captures knowledge automatically. No explicit knowledge management tasks. Knowledge infrastructure runs in the background.

```
Agent works on Nimmly → uses tools → system hooks capture:
  - What tools were called and their results
  - Decisions made (detected from output patterns)
  - Errors encountered and how they were resolved
  - Outcome of experiments (tracked against hypotheses)

System compresses into:
  - Per-product memory (what happened in Nimmly)
  - Per-role memory (what all Builders have learned)
  - Failure log (prioritized, tagged)

Next session starts → system injects:
  - Top 5 relevant memories for this task (by similarity)
  - Any failures related to this type of work
  - Cross-product patterns if applicable
```

**How an agent works in this flow:**
1. Starts session. System auto-injects relevant context.
2. Works naturally. No explicit knowledge-writing required.
3. System captures observations in the background.
4. If agent notices something important, it CAN explicitly flag it (but doesn't have to).
5. Session ends. System compresses and indexes.

**How agents collaborate:** Through the shared memory layer. Agent A's captured knowledge surfaces for Agent B when relevant. No explicit handoff needed — the system infers relevance.

**Cross-product learning:** Automatic. Memories are tagged by product AND by topic. Topic-level matches surface across products.

---

## PART 3: Human Validation & Presentation Principles

How should humans interact with agent work? Four distinct schools.

### Set G: "The Coaching School"
*Derived from: Toyota Kata, Double-Loop Learning*

| Principle | Source |
|-----------|--------|
| G1. Human asks structured questions, doesn't give answers. | Toyota Kata |
| G2. Agent presents: target, current state, obstacles, next experiment. | Toyota Kata |
| G3. Learning happens through the dialogue, not through review. | Kata coaching |
| G4. Periodically question the rules, not just the errors. | Double-Loop |
| G5. The interaction itself produces knowledge (the coaching record). | Kata |

**How the human engages:**
The human is a coach. They see what the agent is trying to achieve, where it is, and what it plans to do next. They redirect, unblock, or challenge assumptions. The conversation is the validation — not a separate approval step.

---

### Set H: "The Milestone Review School"
*Derived from: Shape Up betting, ADR review, AAR, phase gates*

| Principle | Source |
|-----------|--------|
| H1. Review at defined moments (phase transitions, milestones), not continuously. | Shape Up |
| H2. Structured artifacts make review efficient (pitch, ADR, AAR format). | All |
| H3. Binary decisions at review points: go/no-go, bet/pass, accept/rework. | Shape Up |
| H4. No permanent backlog. Old proposals expire unless re-proposed. | Shape Up |
| H5. Cool-down between cycles for reflection. | Shape Up |

**How the human engages:**
The human is a decision-maker at key moments. They review a shaped artifact (pitch, phase summary, AAR) and make a call. Between reviews, agents run autonomously. The rhythm is defined: review at phase transitions, bet on what to build next, retrospect on what happened.

---

### Set I: "The Annotation School"
*Derived from: Obsidian, Confluence inline comments, Zettelkasten, editorial review*

| Principle | Source |
|-----------|--------|
| I1. Human writes in the margins of agent work. | Confluence / editorial |
| I2. Annotations are context that flows forward to future agents. | Zettelkasten linking |
| I3. Agent work and human notes live together, not in separate systems. | Obsidian |
| I4. The graph of linked annotations reveals patterns over time. | Zettelkasten |
| I5. Human can edit/delete agent memory directly. | Claude Code, Memory Bank |

**How the human engages:**
The human reads agent output and writes notes directly on it. "Good direction but watch out for X." "This contradicts what we learned in Nimmly." "Move this up in priority." The annotations become part of the context for the next agent session. Over time, the annotations form a layer of human judgment on top of the agent's work.

---

### Set J: "The Dashboard School"
*Derived from: Linear views, Hill charts, Notion databases, analytics*

| Principle | Source |
|-----------|--------|
| J1. Human sees aggregate state at a glance. | Linear |
| J2. Filter to what needs attention (triage). | Linear |
| J3. Visual indicators of knowledge state: unknown → known → done. | Shape Up hill charts |
| J4. Same underlying data, different views for different needs. | Notion |
| J5. Risk/attention signals surface automatically. | Linear triage |

**How the human engages:**
The human opens a dashboard and scans. Visual indicators show where attention is needed. They filter by product, by risk level, by role. They can drill down from overview to detail. The dashboard doesn't present work to review — it presents the state of the company and lets the human choose where to focus.

---

## PART 4: The Morphological Box

Agent principles on one axis, human validation principles on the other. Mark meaningful combinations.

```
                    │ G: Coaching   │ H: Milestone  │ I: Annotation │ J: Dashboard
                    │               │    Review      │               │
────────────────────┼───────────────┼───────────────┼───────────────┼──────────────
A: Filesystem       │     A+G       │     A+H       │    A+I ★      │    A+J
                    │               │    ★★         │               │
────────────────────┼───────────────┼───────────────┼───────────────┼──────────────
B: Ticket           │    B+G ★      │     B+H       │     B+I       │   B+J ★★
                    │               │               │               │
────────────────────┼───────────────┼───────────────┼───────────────┼──────────────
C: Auto-Learning    │     C+G       │    C+H ★      │     C+I       │   C+J ★★
                    │               │               │               │
```

★ = interesting tension worth exploring
★★ = natural fit

---

## PART 5: Analysis of Each Meaningful Combination

### A+H: Filesystem + Milestone Review ★★

**Why it fits:** The filesystem flow already has natural phase boundaries (folders = stages). Milestone review at phase transitions feels organic — the SUMMARY.md that an agent writes to close a phase IS the review artifact. The human reads the summary, reviews key decisions, and approves the transition.

**What the workflow looks like:**
1. Agents work within a phase folder, reading and writing files
2. When a phase is complete, agent writes SUMMARY.md (structured: what was done, key decisions, learnings, open items)
3. Human gets notified: "Nimmly BUILD phase summary ready for review"
4. Human reads the summary. It links to specific decision files and failure files for detail.
5. Human responds: approve transition / request changes / add notes
6. On approval, current phase details archive to `history/`, SUMMARY.md becomes input to next phase
7. Between phases: cool-down for reflection (agents can run AARs)

**Forgetting:** Natural. Phase transition = distillation moment. Raw details move to history. Only the summary carries forward. Old files are still accessible but not loaded.

**Cross-product knowledge:** Practice files shared via symlinks. Phase summaries are searchable across products ("show me all BUILD summaries").

**Human effort:** Low-to-medium. Review at transitions only (maybe 4-5 reviews per product lifecycle). Structured format makes review fast. Deep-dive is optional (click through to decision files).

---

### A+I: Filesystem + Annotation ★

**Why it's interesting:** The filesystem is already human-readable markdown. Annotations fit naturally as notes in the files themselves — like margin comments in a document. The tension: does the human annotate the working files directly, or a separate review copy?

**What the workflow looks like:**
1. Agents work in phase folders, write files
2. Human can open ANY file at any time and add annotations (inline comments, notes at the bottom)
3. Annotations are marked (e.g., `> [CPO]: Watch out for scope creep here`)
4. Next agent session: annotations are part of the file context. Agent reads human notes as part of reading the file.
5. Human can also edit/delete agent-written content directly — fix errors, remove hallucinations, sharpen descriptions.

**Forgetting:** Same as A+H — phase transition distillation. But human annotations carry extra weight: if a human annotated something, it's more likely to survive distillation.

**What makes it interesting:** The annotation creates a dialogue IN the files. Agent writes → human comments → agent reads comments and responds in next session → human reads response. It's async collaboration through files, like track-changes in a document but for knowledge.

**Risk:** Could get messy. Unclear who "owns" a file if both agent and human write in it. Need clear visual separation between agent content and human annotations.

---

### B+G: Ticket + Coaching ★

**Why it's interesting:** The ticket system gives structure (tasks, states, threads). The coaching model gives the human a way to guide agents without micromanaging. The tension: coaching requires dialogue, but tickets are typically asynchronous.

**What the workflow looks like:**
1. Agent picks up a task, reads goal ancestry and thread
2. Before starting significant work, agent posts a "kata check-in" to the thread:
   - Target condition
   - Current state
   - Obstacles I see
   - My next experiment
   - When we can see results
3. Human can respond in the thread: redirect, unblock, challenge
4. Agent reads response on next heartbeat, adjusts approach
5. When task is done, agent posts closing summary + self-AAR
6. Periodically, human asks double-loop questions: "Why are we doing this task at all?"

**Forgetting:** Done tickets close with a summary. Thread is archived. Only the summary enters the searchable history. Active context = open tickets only.

**What makes it interesting:** Combines the discipline of tickets (state machine, goal ancestry, clear ownership) with the depth of coaching (structured questions, learning dialogue). The thread becomes a coaching record — a trail of how thinking evolved.

**Risk:** If the human doesn't engage with the coaching check-ins, they become noise. Needs a rhythm — maybe daily or twice-daily review of check-ins.

---

### B+J: Ticket + Dashboard ★★

**Why it fits:** This is basically Linear for AI agents. Tickets have states, states drive dashboard views, the human sees aggregate status and filters to what needs attention. Natural and proven pattern.

**What the workflow looks like:**
1. Agents work through tickets, updating states, posting to threads
2. Dashboard shows:
   - Per product: tickets by state (how many in progress, how many blocked, how many in review)
   - Across products: portfolio view (which products need attention)
   - Filtered views: "my reviews" (what's waiting for me), "blocked" (what's stuck), "recent decisions" (what agents decided)
3. Human scans dashboard, clicks into items that need them
4. Inside a ticket: full thread, goal ancestry, decisions, blockers
5. Human acts: approve, redirect, unblock, close

**Forgetting:** Managed by ticket lifecycle. Done/cancelled tickets leave active view. Dashboard only shows live state. History is searchable but not in your face.

**Cross-product knowledge:** Dashboard can surface patterns: "3 products have blocked tickets about auth" → suggests a shared solution.

**Human effort:** Low for daily triage (scan dashboard, handle flagged items). Adjustable depth — can go surface-level or deep into any ticket thread.

**What makes it strong:** Proven pattern that millions of teams already use. Adapting it for agents means the human interaction model is familiar. No new mental model to learn.

---

### C+H: Auto-Learning + Milestone Review ★

**Why it's interesting:** Auto-learning means zero knowledge-management overhead for agents — they just work, the system captures. Milestone review means humans engage only at defined moments, not continuously. Together: the most hands-off approach possible.

**What the workflow looks like:**
1. Agents work freely. System captures knowledge in the background.
2. At milestones (phase transitions, launches, monthly reviews), system generates a structured review artifact:
   - Auto-compiled from captured observations
   - Key decisions (detected from agent behavior)
   - Failures and how they were resolved
   - Metrics and outcomes
   - Suggested learnings for the practice files
3. Human reviews the auto-generated artifact
4. Human validates, corrects, adds judgment
5. Validated knowledge gets promoted to practice files and product memory

**Forgetting:** Automatic. The system manages relevance decay. Human validation at milestones is the quality gate — only validated knowledge gets promoted to long-term memory.

**What makes it interesting:** Minimizes overhead for both agents and humans. Agents don't spend tokens on knowledge management. Humans don't review continuously. The system does the grunt work of capturing and compressing. Humans add the judgment layer.

**Risk:** Auto-generated review artifacts might miss nuance. "The system captured 47 decisions this sprint" — is the summary accurate? Depends on compression quality. The human review is the safety net, but if the artifact is bad, the review is useless.

---

### C+J: Auto-Learning + Dashboard ★★

**Why it fits:** Auto-learning generates signals continuously. A dashboard surfaces those signals in real-time. The human monitors the pulse of the company without actively managing anything.

**What the workflow looks like:**
1. Agents work. System captures everything.
2. Dashboard shows:
   - Knowledge health: how many new learnings captured, how many contradictions resolved, staleness indicators
   - Failure radar: recent failures across all products (prioritized)
   - Decision log: rolling feed of agent decisions with context
   - Cross-product patterns: "Builders across 3 products chose X this week"
   - Attention signals: anomalies, high-risk decisions, items where agent expressed uncertainty
3. Human checks dashboard periodically, drills into anything interesting
4. Can override: "this decision was wrong, here's why" → feeds back into the learning system
5. Can curate: "this pattern is important, promote to practice files"

**Forgetting:** Fully automatic. Dashboard shows live state. Old signals age out of view. Human overrides prevent specific knowledge from being forgotten.

**What makes it interesting:** The most "AI company" approach. The system runs itself. Humans provide taste, judgment, and course correction — not management. Closest to the "2 people looking like 20" vision.

**Risk:** If the dashboard is noisy or the auto-capture is low quality, the human can't trust it. Trust is everything — if you don't trust the signals, you fall back to manually reviewing everything and the dashboard becomes overhead, not leverage.

---

## PART 6: Three Promising Combinations

Based on the analysis, three paths stand out as worth prototyping:

### Combo 1: A+H — "Phase Folders with Milestone Reviews"
**For teams that want:** Clear structure, defined rhythm, minimal overhead
**Philosophy:** The filesystem IS the process. Agents work in structured folders. Humans review at phase transitions.
**Feels like:** A well-organized research lab with quarterly reviews

### Combo 2: B+J+G — "Coached Tickets with Dashboard"
**For teams that want:** Real-time awareness, proven patterns, coaching depth when needed
**Philosophy:** Tickets flow through states. Dashboard gives the pulse. Coaching adds depth at key moments.
**Feels like:** A Linear-for-agents with a coaching layer on top

### Combo 3: C+J+H — "Auto-Learning with Dashboard and Milestone Validation"
**For teams that want:** Maximum automation, minimum overhead, trust-and-verify
**Philosophy:** Agents just work. System captures knowledge automatically. Dashboard shows the pulse. Humans validate at milestones.
**Feels like:** An AI company that runs itself, with humans as strategic reviewers

---

*These are the three prototyping candidates. Each has a different philosophy about where the intelligence lives (in the structure, in the workflow, or in the system) and how humans engage (reviewing artifacts, coaching through dialogue, or monitoring signals).*
