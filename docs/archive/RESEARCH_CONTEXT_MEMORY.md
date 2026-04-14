# Research: How Others Handle Agent Context & Memory

Compiled from Paperclip, Manus, Cline, Claude Code, gstack, Devin, CrewAI, AutoGen, ICM, and practitioner reports.

---

## 1. The Universal Problem

~65% of enterprise AI agent failures in 2025 were attributed to **context drift or memory loss** — not the models being dumb, but the context going stale or being lost. The problem gets worse with scale: more tasks, more agents, more sessions = more context to manage.

The fundamental tension: agents work inside a finite context window, but real work spans days, weeks, and hundreds of tasks.

---

## 2. What People Are Actually Doing (the landscape)

### Pattern A: Memory Bank (Cline, widely copied)

Six markdown files in a hierarchy. Agent loads them in order at every session start:

```
memory-bank/
├── projectbrief.md    — what this project is (foundation, rarely changes)
├── productContext.md   — why it exists, who it's for, UX goals
├── systemPatterns.md   — architecture choices, design patterns
├── techContext.md      — tech stack, dev setup, constraints
├── activeContext.md    — what's happening NOW, recent changes, next steps
└── progress.md         — what works, what's left, known issues
```

Key rules:
- Files build on each other in dependency order — foundation first, working state last
- `projectbrief.md` stays under 1 page. `activeContext.md` is current state only, not a log
- Update after significant milestones, not every session
- Agent reads ALL of these at session start — it's the "reboot sequence"
- Agent WRITES back to `activeContext.md` and `progress.md` at session end

Why it works: simple, human-readable, editable, no infrastructure. The hierarchy gives structure to what would otherwise be a sprawling mess.

Where it breaks: doesn't handle cross-project knowledge. Doesn't search. Doesn't scale to dozens of parallel workstreams. `progress.md` becomes a changelog that nobody reads.

### Pattern B: File System AS Architecture (Manus / ICM)

Manus's biggest insight: **"The file system is the ultimate context — unlimited in size, persistent by nature, directly operable by the agent."**

The agent treats files not as storage but as **externalized memory**. The context window is just a "viewport" into the file system. When you need to compress context, you don't summarize — you drop the content but keep the file path. The agent can re-read it when needed.

ICM (Interpretable Context Methodology) takes this further: **numbered folders represent stages**, plain markdown carries context. Folder structure IS the orchestration:

```
01-research/
  prompt.md         — what to do at this stage
  output.md         — what the agent produced
  context.md        — relevant background
02-define/
  prompt.md
  output.md
03-build/
  ...
```

One folder's output becomes the next folder's input. Stage sequencing = folder numbering. State management = files on disk. No framework needed.

Where it shines: sequential workflows, human-reviewable at every stage, zero infrastructure.
Where it breaks: not great for real-time multi-agent collaboration. File-based handoffs too slow for tight feedback loops.

### Pattern C: Auto Memory + Topic Files (Claude Code native)

Claude Code splits memory into:
- **CLAUDE.md** — human-written rules/instructions, loaded every session (target <200 lines)
- **Auto memory** — agent-written notes, stored in `~/.claude/projects/<project>/memory/`:
  ```
  MEMORY.md          — index file (<200 lines, loaded at startup)
  debugging.md       — topic file (loaded on-demand)
  api-conventions.md — topic file (loaded on-demand)
  ```

Key mechanics:
- MEMORY.md is the index. Only first 200 lines or 25KB loaded at startup
- Topic files are NOT loaded at startup — agent reads them when it needs them
- Auto memory converts relative dates to absolute ("yesterday" → "2026-03-15")
- Contradicted facts get deleted (switched from Express to Fastify → old entry removed)
- Overlapping entries get merged (3 sessions noted same thing → consolidates to 1)

Where it shines: self-maintaining, no manual work, evolves naturally.
Where it breaks: agent decides what to remember — may miss things you care about. Index file has a hard 200-line cap.

### Pattern D: Persistent Tickets + Heartbeats (Paperclip)

Paperclip treats tasks as **persistent tickets with threaded conversations**. The ticket IS the memory:
- 7-state lifecycle: backlog → todo → in_progress → in_review → blocked → done → cancelled
- Agent must post a comment at the end of every heartbeat (what happened, what's next)
- Sessions survive reboots — agent resumes same task context across heartbeats
- Every task carries **goal ancestry** (company mission → product goal → sprint → task)
- Ticket-level context = the accumulated conversation thread on that ticket

Where it shines: natural task-level memory. The ticket thread IS the working memory. Audit trail built in.
Where it breaks: no semantic search across tickets. Cross-project learning still manual. Thread gets long over many heartbeats.

### Pattern E: Session Capture + Compression (claude-mem)

claude-mem hooks into every session event (start, tool use, stop, end) and captures observations to SQLite + Chroma vector store:
- PostToolUse hook captures what tools did and their results
- AI-driven compression creates "semantic summaries" (~10x token savings)
- Progressive disclosure: start with compact index (~50-100 tokens), fetch details (~500-1000 tokens) on demand
- Search by type, date, project
- At session start, automatically injects relevant historical context

Where it shines: zero manual effort, captures everything, searchable, works across projects.
Where it breaks: needs infrastructure (SQLite + Chroma). Compression may lose nuance. "Relevant" context retrieval depends on query quality.

### Pattern F: Failure-Driven Memory

One of the most underappreciated patterns. Practitioners found that **feeding past quality failures as memory improves future output more than feeding successes.**

Key insight: "Leave the wrong turns in the context." When the model sees a failed action + the resulting error, it implicitly updates its beliefs and avoids repeating mistakes.

Practical implementation: maintain a `failures.md` or tag entries in LEARNINGS.md with outcome (worked/failed/mixed). Prioritize loading failure context over success context.

---

## 3. Key Lessons from Practitioners

### What kills agents in practice

1. **Context poisoning** — stale or wrong information in context causes compounding errors. Old facts mislead worse than no facts.
2. **Context stuffing** — loading everything "just in case" makes reasoning WORSE, not better. Production experience shows less is more.
3. **No experiential memory** — agents store what happened but not whether it worked. They record facts but don't learn from outcomes. This is where most systems fail.
4. **Cross-workflow staleness** — a decision in one workflow stays trapped there while other workflows operate on outdated info.
5. **Todo.md token waste** — Manus found ~30% of all actions were spent rewriting a todo file. Switched to a separate planner that returns structured plans instead.

### What actually works

1. **File system as primary memory** — Manus, ICM, Memory Bank all converge on this. Files are unlimited, persistent, human-readable, agent-operable. No infrastructure needed.
2. **Hierarchy and layers** — don't put everything in one file. Layer from stable (project brief) to volatile (active context). Load stable layers once, reload volatile layers often.
3. **Compression = keep the pointer, drop the content** — if you have the file path or URL, you can drop the actual content from context. Agent re-reads when needed. This is how Manus handles web pages and documents.
4. **Just-in-time loading** — Claude Code's approach: only load topic files when the agent actually needs them. Don't pre-stuff context with everything.
5. **Explicit checkpointing** — every agent must write a handoff/checkpoint at session end. This is non-negotiable across all successful systems.
6. **Outcome-tagged learning** — tag memories with whether they worked. Prioritize failure context for loading.
7. **Human-editable memory** — markdown files that humans can open, read, and fix. If the agent hallucinates a goal, you just delete the line. Critical for human-in-the-loop trust.
8. **Small, focused context beats large, comprehensive context** — Anthropic's principle: "find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."

### Devin's interesting lesson

Devin (with Sonnet 4.5) found that the model became **aware of its own context window** and started exhibiting "context anxiety" — taking shortcuts or leaving tasks incomplete when it BELIEVED it was near the end of its window, even when it had plenty of room. The lesson: how you manage context affects agent psychology, not just information availability.

---

## 4. Emerging Patterns for Multi-Product Companies

Nobody has fully solved this yet, but the converging ideas are:

**Per-product memory banks** — each product gets its own Memory Bank-style hierarchy. The product IS a context boundary.

**Shared company-level context** — a thin layer of company-wide knowledge (mission, standards, learnings) that sits above product-specific context.

**Phase-aware memory** — different lifecycle phases need different files active. In DISCOVER phase, you need market research and competitor data. In BUILD phase, you need architecture and codebase context. In GROW phase, you need brand voice and analytics. The active context changes shape based on where the product is in its lifecycle.

**Cross-product learning file** — a curated file (not append-only) that distills patterns across all products. "We've learned that X pricing model works for SME tools." Updated periodically by a dedicated context/knowledge agent.

**Forget actively** — multiple sources emphasize: pruning outdated context is as important as adding new context. Stale info is worse than no info.

---

## 5. Open Questions No One Has Solved

- How to efficiently share learnings between agents working on different products without context pollution
- How to handle contradictory memories (one agent learned X works, another learned X fails — in different contexts)
- How to prevent memory from growing into something no one reviews
- How to balance "agent decides what to remember" vs "human curates what matters"
- How context should transform as a product moves through lifecycle phases
- How to measure whether memory is actually helping or hurting agent performance

---

Sources:
- [Cline Memory Bank](https://docs.cline.bot/features/memory-bank)
- [Cline Memory Bank Instructions](https://github.com/cline/prompts/blob/main/.clinerules/memory-bank.md)
- [Manus: Context Engineering Lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [ICM: Folder Structure as Agent Architecture](https://arxiv.org/abs/2603.16021)
- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory)
- [claude-mem Plugin](https://github.com/thedotmack/claude-mem)
- [Paperclip AI](https://github.com/paperclipai/paperclip)
- [Paperclip Task Management](https://fujigo-soft.com/en/2026/03/25/assigning-work-to-an-ai-team-task-management-checkout-and-conflict-resolution-in-paperclip/)
- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Devin + Sonnet 4.5 Lessons](https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges)
- [gstack Framework](https://github.com/garrytan/gstack)
- [Memory for AI Agents — The New Stack](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/)
- [Dust: Company Data as Filesystem](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)
- [Agent Memory Failures in Production](https://dev.to/jonathanfarrow/-how-an-agent-actually-learns-from-experience-2m28)
- [Failure-Driven Agent Memory](https://dev.to/agentkit/i-gave-my-ai-agent-memory-of-its-past-failures-it-didnt-just-avoid-mistakes-it-used-them-as-51f0)
- [Why Single Markdown Can't Be Agent Memory](https://dev.to/origin_matrix_b790e656217/why-a-single-markdown-file-cant-be-your-ai-agents-memory-10l3)
- [Agent Memory: When Markdown Is All You Need](https://dev.to/imaginex/ai-agent-memory-management-when-markdown-files-are-all-you-need-5ekk)
- [Don't Build Multi-Agents — HN Discussion](https://news.ycombinator.com/item?id=45096962)
