# How others run multi-agent / multi-step coding pipelines

Synthesis of the current public state of the art (April 2026). The headline: **the field is split, and the split tracks the task type**. Picking the right side for HyperIdle is more important than tuning either.

---

## The two camps

### Cognition (Devin) — "Don't build multi-agents"
Position: multi-agent coding is fragile because it plays telephone with context. Their writing — *Don't Build Multi-Agents* (2025) and *Multi-Agents: What's Actually Working* (early 2026) — argues that for production coding, a **single decision-making agent** plus disposable read-only sub-agents wins. ([Cognition blog](https://cognition.ai/blog/dont-build-multi-agents), [follow-up](https://cognition.ai/blog/multi-agents-working))

Quote: "Today, the edit decision-making and applying are more often done by a single model in one action. This reflects lessons learned from earlier attempts at splitting work across agents."

Devin's actual architecture in 2026: presents as a single engineer; coordinates internal sub-agents but *abstracts them away*. Devin 2.0 added "managed Devins" — task-scoped parallel delegation, not a shared cognitive workspace. ([Cognition Devin 2.0](https://cognition.ai/blog/devin-2))

What they keep multi-agent: read-only exploration. What they keep single-agent: decisions, edits, planning.

### Anthropic — multi-agent, when it parallelizes
Position: orchestrator + parallel workers (Opus + Sonnet) **outperformed single-agent Opus by 90.2%** on research evals. ([Anthropic engineering blog](https://www.anthropic.com/engineering/multi-agent-research-system))

But the cost: **~15× the tokens of a single chat session** for the multi-agent system. Their 16-agent C-compiler demo ran ~2,000 sessions at **~$20,000 in API costs** for 100,000 lines of Rust. ([Anthropic on multi-agent costs](https://www.anthropic.com/engineering/multi-agent-research-system), [Agent Teams release](https://code.claude.com/docs/en/agent-teams))

Critically, that 90% win was on **research** (deeply parallel branching exploration), not coding. Coding is sequentially coupled — the value of parallelism is much lower because every decision constrains the next.

### The reconciliation
**Both positions are right for different task shapes.**

| Task shape | Architecture | Why |
|---|---|---|
| Wide, branching exploration (research, multi-source synthesis) | Multi-agent (orchestrator + parallel workers) | Parallelism dominates token cost |
| Sequentially-coupled production (coding, refactors, migrations) | Single decision-thread + read-only sub-agents | Context coherence dominates correctness |
| Long-running with many distinct phases | Hybrid: long main thread + cold adversarial checkpoints | State persistence is the constraint |

**HyperIdle's pipeline is sequentially coupled.** Story implementation is not branching exploration — every step's output constrains the next. It looks like Anthropic's research model but should be built like Devin's coding model.

---

## What both camps agree on

These are the points of consensus across Cognition, Anthropic, LangChain, and the production-deployments literature:

1. **Read-only sub-agents are fine.** Explore/grep/lookup tasks isolate cleanly, return small summaries, don't fragment decisions. Both Claude Code and OpenCode use them. ([Claude Code subagents docs](https://code.claude.com/docs/en/sub-agents))
2. **Edit/decision agents should be one agent at a time.** "Splitting decisions across agents" is consistently the failure mode reported in production. ([Cognition](https://cognition.ai/blog/dont-build-multi-agents), [Vellum on context engineering](https://www.vellum.ai/blog/multi-agent-systems-building-with-context-engineering))
3. **Strictly-typed handoffs.** When agents do hand off, the contract must be a schema (JSON, TOON), never free-form text. Free-form drift is the #1 production failure. ([Multi-Agent System Patterns](https://medium.com/@mjgmario/multi-agent-system-patterns-a-unified-guide-to-designing-agentic-architectures-04bb31ab9c41))
4. **State on disk, resumable.** "Every multi-step task gets a state file. Intermediate findings written to disk. Agents re-read these files when context compacts." 65% of enterprise AI failures are context drift, not context exhaustion. ([Indium 2026 state persistence](https://www.indium.tech/blog/7-state-persistence-strategies-ai-agents-2026/))
5. **Prefix caching is the dominant cost lever.** System prompt + tool defs + skill body are the cacheable prefix; user/task-specific content goes last. KV cache reuse cuts 81% of cost in well-designed systems. ([HF / LMCache on Claude Code reuse](https://huggingface.co/blog/kobe0938/context-engineering-reuse-pattern-claude-code))
6. **Sub-agents are not cheap.** Each one costs ~20K to cold-start; multi-agent flows cost 4–7× single-agent; Agent Teams cost ~15×. ([Claude API subagent docs](https://platform.claude.com/docs/en/agent-sdk/subagents))

---

## The map-reduce-and-manage pattern (what's actually working)

Cognition's update: the pattern that survives in production is **map-reduce-with-a-manager**, where:
- **Manager** splits work and owns the synthesis. Single coherent view of the goal.
- **Workers** execute independently — but only on cleanly separable, independent subtasks (e.g., "research these 5 unrelated topics in parallel").
- **Manager re-synthesizes** worker outputs into a unified state.
- **Critically:** the system must "feel as coherent as a single agent working on a single task" from the user's perspective.

This is *not* the same as a pipeline of specialist agents handing off to each other. The manager is always the same agent across the run. Workers are scoped to *parallelizable* subtasks, never sequential phases.

**Implication for HyperIdle:** the current pipeline is laid out as sequential specialist handoffs (concept → design → architecture → code → review → ship). That's exactly the pattern Cognition reports as fragile. The map-reduce model would invert it: one manager owns the whole story; reviews/scans are parallel workers; everything else stays in the manager's context.

---

## State persistence in long-running tasks

The 2026 consensus on long sessions:
- **Server-side compaction** (OpenAI's API now supports it; Anthropic via Claude Code's autocompact). Keeps agents coherent across sessions spanning 5M tokens / 150 tool calls. ([OpenAI Skills on long sessions](https://www.paperclipped.de/en/blog/openai-responses-api-agent-skills/))
- **State files as the durable layer.** The agent owns ephemeral context; the state file owns durable memory. Resume = read state file + skim recent messages.
- **Anchored iterative summarization.** Maintain a structured persistent summary; on compaction trigger, only the new span is summarized and merged. This is what Factory.ai documented and what Claude Code's autocompact does internally. ([Factory.ai compression evaluation](https://factory.ai/news/evaluating-compression))
- **Failure-driven optimization.** Replay logs of failed runs to refine prompts (ACON pattern). HyperIdle's `/retro` is an embryonic version.

---

## Specialist roles — when they're worth it

The QA-vs-developer-vs-reviewer split that motivated TE-7's 9-session count is real, but the literature warns it's commonly over-applied:

> "Early iterations tried using one super agent to do everything, but it failed. Bounded agents with clear roles work infinitely better — The Analyst focuses solely on feature analysis, The Sentinel only audits, The Healer only debugs."
> ([700+ test coverage with specialized agents](https://openobserve.ai/blog/autonomous-qa-testing-ai-agents-claude-code/))

But "bounded role" ≠ "separate session". A single agent with clear mode prompts (`<persona>analyst</persona>` vs `<persona>healer</persona>`) is often equivalent. The split into separate sessions is justified only when:
- **Adversarial value is real** (the critic must not see the producer's reasoning) — true for DoD audit, debatable elsewhere.
- **Tool permissions differ** (writer needs Write, reviewer doesn't) — security, not cost.
- **Context would overflow if combined** — only true past ~500K tokens of accumulated state.

For HyperIdle specifically: QA writing tests vs developer writing code is a *role distinction*, but the L10 data shows they read the same files and operate on the same plan. The gain from separating them is small; the cost (cache-write tax, no shared context) is real.

---

## What this means for HyperIdle's TE-7

The user is right that 6 was too aggressive and 9 is closer. But the literature suggests the *shape* matters more than the count. Three specific reframings the research supports:

### 1. Single "build manager" thread, not a chain of specialists
One long-running session owns concept → design → architecture → write-tests → write-code → apply-review. Internal "phase prompts" switch the persona (designer mode, architect mode, qa-tester mode). Cache prefix is stable across phases — huge cost win. The session uses sub-agents only for *parallelizable* work (multi-perspective review, multi-file exploration).

This drops the "QA writes tests, dev writes code" question into a *prompt-mode question* inside one session, not a session-boundary question. Specialization survives; cache-write tax dies.

Expected pattern: 1 manager thread + N parallel review workers + 1 cold DoD + 1 ship + 1 retro = **5 distinct sessions but only 1 long-running**.

### 2. Reviews as map-reduce, not sequential
Today: 4 specialists (architect, adversary, security, designer) in 4 separate sessions reading the same code, then 1 applier reads all 4 outputs.

Map-reduce: 4 workers spawned in parallel from the manager (each is a focused critique with one tight prompt), each returns one TOON findings block. Manager (same agent that wrote the code? Or a separate cold reviewer? Open question) merges and applies fixes.

Cognition explicitly warns: don't make this the architecture for *decisions*. It's fine for *findings*. So the 4 reviews are workers; the applier is the manager. Mirrors `/review` skill's existing parallel-spawn but compresses 4 sessions to 4 worker invocations from 1 manager.

### 3. Adversarial = cold session, not separate role
The only role separation that the literature supports as load-bearing for *coding* (not research) is the cold final auditor. DoD must enter without seeing the implementer's reasoning. Everything else can collapse into the manager thread.

Implication: keep `/check-definition-of-done` as a hard cold boundary. Drop the *concept* of separate critic/adversary sessions for design and architecture — those critiques live as mode prompts inside the producer session, like Anthropic's "extended thinking" for the lead agent.

---

## Concrete revision proposal

Replace TE-7's 9-row table with this shape:

| Layer | Sessions | Composition |
|---|---|---|
| Manager (long-running, ~80% of story cost) | 1 | concept reading → design → architecture → write-tests → write-code → apply-review (all in one context, mode-switched by prompt). Spawns workers for review and exploration. |
| Workers (parallel, read-only or findings-only) | N (typically 4–6 per story) | Multi-perspective review (architect/adversary/security/designer), structural search, AC coverage check. Each is a small Haiku/Sonnet sub-agent returning TOON. |
| Cold auditor | 1 | `/check-definition-of-done`. Fresh context, reads raw artifacts. |
| Ship | 1 | `/ship`. Light, different tool perms (push, gh PR). |
| Retro | 1 | `/retro`. Reads ledger only. |

Total durable sessions per story: **~4–5**, only 1 of which is long.
Worker invocations on top: **~4–6**, all small.

This matches Cognition's "don't fragment decisions" + Anthropic's "parallelize what's parallelizable" + the consensus on prefix caching + state persistence.

---

## What we should measure to validate this

The L10 data showed 9 sessions × ~$0.80/session cache-write tax = ~$7 of pure preamble re-caching. The manager-thread approach predicts that cost drops by ~80% because the cache prefix only writes once per story. Combined with TE-14 (Read dedup) and TE-10 (doc splits), the projection: **L10 equivalent runs at ~$8–10**, not $25.

Verification: re-run L10 (or an equivalent) under the new shape; compare per-bucket costs.

---

## Sources

- [Cognition: Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- [Cognition: Multi-Agents — What's Actually Working](https://cognition.ai/blog/multi-agents-working)
- [Cognition: Devin 2.0](https://cognition.ai/blog/devin-2)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [Claude Code: Agent Teams docs](https://code.claude.com/docs/en/agent-teams)
- [Claude Code: subagent docs](https://code.claude.com/docs/en/sub-agents)
- [LangChain: choosing the right multi-agent architecture](https://blog.langchain.com/choosing-the-right-multi-agent-architecture/)
- [LangChain: how and when to build multi-agent systems](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems/)
- [Vellum: multi-agent systems with context engineering](https://www.vellum.ai/blog/multi-agent-systems-building-with-context-engineering)
- [HuggingFace / LMCache: context engineering & reuse in Claude Code](https://huggingface.co/blog/kobe0938/context-engineering-reuse-pattern-claude-code)
- [Factory.ai: evaluating context compression](https://factory.ai/news/evaluating-compression)
- [Indium: 7 state persistence strategies for long-running agents](https://www.indium.tech/blog/7-state-persistence-strategies-ai-agents-2026/)
- [OpenObserve: 700+ tests with specialized QA agents](https://openobserve.ai/blog/autonomous-qa-testing-ai-agents-claude-code/)
- [AddyOsmani: code agent orchestra](https://addyosmani.com/blog/code-agent-orchestra/)
- [AddyOsmani: long-running agents](https://addyosmani.com/blog/long-running-agents/)
