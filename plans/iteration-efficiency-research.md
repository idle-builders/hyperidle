# Iteration efficiency — research synthesis

The other half of the cost equation. **Cost = tokens-per-iteration × number-of-iterations.** Every TE in the concept doc attacks the first factor; the literature shows the second factor often dominates.

---

## The cost cascade

Rough rule from production data: **1× tokens for a chat call, ~4× for a single-agent loop, ~15× for multi-agent.** ([Cost cascade rule across multiple sources](https://blogs.oracle.com/developers/what-is-the-ai-agent-loop-the-core-architecture-behind-autonomous-ai-systems))

Every loop iteration carries the prior trajectory forward. Each ReAct step appends the previous tool output; cost grows with steps because every past turn stays in context. **Plan-and-execute is mostly linear in step count, ReAct is super-linear.** ([SurePrompts plan-and-execute](https://sureprompts.com/blog/plan-and-execute-prompting), [TELUS plan-and-execute](https://www.telusdigital.com/insights/data-and-ai/article/building-ai-agents-with-plan-and-execute))

**Implication:** doubling tokens-per-turn but halving turn count is a net win. Halving tokens-per-turn while doubling turns is a net loss.

---

## Six techniques the literature converges on

### 1. Plan-and-Execute over ReAct
Original Kim et al. ICML 2024 paper: **3.6× speedup** vs sequential ReAct. The planner generates the full task breakdown upfront (one expensive call); the executor works through subtasks mechanically (cheap, parallelizable, smaller context). ([SurePrompts](https://sureprompts.com/blog/plan-and-execute-prompting))

Maps to HyperIdle: this is exactly what the Architect → Builder persona handoff does. The locked plan + brief is the "plan" handed to "execute." But Builder needs to actually execute mechanically — if Builder is allowed to re-plan, you've lost the gain. **The discipline is in the persona prompts, not just the architecture.**

### 2. Parallel tool calling
Single reasoning trace produces multiple tool calls executed in parallel. **1.4×–2.4× latency speedup; up to 3.7× on independent operations** (file reads, API queries, parallel checks). Fewer agent turns, less context overhead from repeated planning. ([Salesforce W&D paper](https://arxiv.org/html/2602.07359v1), [Letta docs](https://docs.letta.com/guides/agents/parallel-tool-calling/))

Maps to HyperIdle: most personas read 3–5 files at the start of their phase. If they batch those reads in one turn instead of sequentially, that's 4 fewer turns × ~$0.30/turn cache-write = ~$1.20/persona. Across 4 personas: ~$5/story.

### 3. Interleaved thinking (Claude 4+ specific, but pattern is general)
Reasoning between tool calls happens inside one response block, not in a separate ReAct turn. **"Like a domain expert mentally juggling facts while explaining a concept" vs "a detective taking notes."** ([Anthropic interleaved thinking docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking), [AWS Strands writeup](https://aws.amazon.com/blogs/opensource/using-strands-agents-with-claude-4-interleaved-thinking/))

Auto-enabled on Opus 4.7. Beta header `interleaved-thinking-2025-05-14` for older models. Reduces tool calls AND iteration count.

### 4. Pre-prompt context injection
The runner pre-fetches needed context (story spec, plan summary, target file paths) and injects it into the persona's system prompt **before** the first turn. Persona starts with everything it needs — no "let me read the plan first" iteration. ([Anthropic effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

Maps to HyperIdle: TE-20 (story memory file) starts this. Extend by also pre-fetching the diff for review personas, the plan for the Builder, the AC list for DoD. Each pre-fetched item = one fewer iteration.

### 5. Multi-turn fragmentation hurts — fewer, fatter turns
Research benchmark: when prompts are "sharded" across multiple conversation turns, **average performance drops 39% across all tested models, including frontier reasoning models.** Why: early incorrect attempts remain in context and poison subsequent reasoning. ([Context-Bench, Sundeep Teki](https://www.sundeepteki.org/blog/context-bench-a-benchmark-for-evaluating-agentic-context-engineering))

Maps to HyperIdle: skills that say "first ask the user about X, then about Y, then about Z" and skills that build up context over many turns are the most expensive *and* the lowest quality. Single-prompt skills with all context up front beat both.

### 6. Trajectory reduction
Drop intermediate tool-call results from the trajectory once they're no longer needed. The trajectory grows linearly with calls; the cost of *re-feeding* the whole trajectory at each turn grows quadratically. ([Trajectory Reduction paper](https://arxiv.org/pdf/2509.23586))

Maps to HyperIdle: the Read-dedup hook (TE-14) is one form of this. A more aggressive form: have the runner *strip* tool results from the trajectory after summarizing them into the brief. Hermes' ContextCompressor at 50% threshold is this pattern.

---

## What the data on per-persona iteration count would look like

Step-efficiency metric: `minimum_tool_calls / actual_tool_calls`. ([DeepEval step-efficiency](https://deepeval.com/docs/metrics-step-efficiency))

A phase that needs 3 reads + 2 writes (5 minimum) but ran 18 turns = **28% efficient**. The Builder persona on a typical L-story almost certainly runs 50+ turns when the minimum is closer to 15.

This metric belongs in the retro ledger. Three retro signals to track:
- **Step efficiency per persona** (minimum vs actual)
- **Re-read count** (TE-14 hook output)
- **Plan-stability** — how many times Builder had to re-plan vs follow the locked plan mechanically

If Builder consistently re-plans, that's a *plan quality* problem (Architect under-spec'd), not a model problem. Surfaces in retro before you blame Sonnet for being weaker than Opus.

---

## Single-shot mode — when the loop disappears

For *known patterns* — "add a CRUD route for X", "add a column to schema Y" — the entire pipeline can collapse into a single-shot generator + CI verification:

1. Pre-fetch: spec, similar prior story, template files.
2. One Opus call: produce plan + tests + code in one response.
3. Commit + push.
4. CI runs.
5. If green: PR ready. If red: Architect persona kicks in for the *failure*, not the whole story.

Validated by Claude Opus 4.7 reports: "phenomenal on one-shot coding tasks, more correct and complete than 4.6." ([Vercel feedback on Opus 4.7](https://www.anthropic.com/claude/opus))

**Saves:** entire pipeline cost (~$5–10/story) for stories matching the pattern. Probably 30–50% of L-stories qualify. Even bigger for S-stories.

The classifier ("does this match a known pattern?") is itself a Haiku call — ~$0.01.

---

## Concrete additions to the token-efficiency concept

Six new TEs the iteration-efficiency lens points at:

### TE-22 — Plan-and-execute discipline in persona prompts
The Architect → Builder handoff is plan-and-execute *only if Builder is forbidden to re-plan*. Add to Builder's persona prompt: "Execute the locked plan mechanically. If the plan is wrong, raise it as a blocker — do NOT redesign in-flight." Saves ~$2–3/story by preventing re-planning loops.

### TE-23 — Parallel tool calling instructed in skill prompts
Add to every persona prompt: "When reading multiple files or running multiple independent commands, batch them into a single response. Sequential reads are a bug, not a style." Saves ~$3–5/story (~4 turns saved per persona × 4 personas).

### TE-24 — Interleaved thinking enabled
Set `extra_headers: {"anthropic-beta": "interleaved-thinking-2025-05-14"}` for non-4.7 models in the runner config. For 4.7+, auto-on. Saves ~10–20% on iteration count for the personas that reason between tool calls (Architect, Cold DoD especially). Tool-agnostic note: this is Anthropic-specific; equivalent feature in OpenRouter cheap models is "function calling with reasoning blocks" — same idea, different flag.

### TE-25 — Pre-prompt context pre-fetch by the runner
Extend TE-20: the runner doesn't just inject the memory file, it also pre-fetches the **diff** (for Reviewers), the **plan** (for Builder), the **AC list + screenshot routes** (for DoD), and the **ledger** (for Reflector). Each pre-fetched item = one fewer iteration. Saves ~$2–4/story.

### TE-26 — Step-efficiency in retro ledger
Add to `.pipeline/progress/<id>.toon`: `tool_calls_actual` per persona, `tool_calls_minimum_estimate` (heuristic: count of distinct files touched + count of distinct commands run). Retro flags personas with <50% efficiency. Drives prompt fixes. **No direct savings — drives every other TE's measurement.**

### TE-27 — Single-shot mode for known patterns
A pre-pipeline classifier (Haiku, ~$0.01) checks if the story matches a known pattern (CRUD route, schema column add, copy change, etc.). If yes, skip the full pipeline; route to a single-shot generator with templates. CI is the only verification. **Saves ~$5–10/story for the 30–50% of stories that qualify.** Falls back to full pipeline on classifier uncertainty or CI failure.

### TE-28 — Trajectory pruning (Hermes-pattern ContextCompressor)
At 50% context threshold, the runner strips intermediate tool-call results from the persona's trajectory and replaces them with the brief summary. Hermes does this; it's what enables their long-running primary agent. **Saves ~$2–4/story by cutting the quadratic re-feeding cost.**

---

## How these stack with the existing TEs

| Pair | Effect |
|---|---|
| TE-22 (no re-plan) + TE-19 (Sonnet Builder) | Sonnet is fine *if* it's executing, not re-deciding. The discipline is what makes the cheaper model viable. |
| TE-23 (parallel tools) + TE-14 (read dedup) | Batched reads land in context once; dedup prevents repeats across batches. Compounds. |
| TE-24 (interleaved thinking) + TE-22 (no re-plan) | Interleaved thinking inside a turn replaces re-planning across turns. Same outcome, fewer iterations. |
| TE-25 (pre-fetch) + TE-20 (memory file) | Memory = static; pre-fetch = dynamic per-persona. Both runner-owned. |
| TE-27 (single-shot mode) + TE-21 (continuous commit) | Single-shot writes one commit, pushes, CI gates. The entire pipeline collapses to one round-trip. |
| TE-28 (trajectory pruning) + TE-6 (briefs) | Brief is the durable summary that survives the trajectory pruning. |

---

## Estimated added impact

On L10's $24.74 baseline, before any of the original TEs:

| TE | Saves |
|---|---|
| TE-22 plan-execute discipline | $2–3 |
| TE-23 parallel tool batching | $3–5 |
| TE-24 interleaved thinking | $1–2 |
| TE-25 pre-prompt pre-fetch | $2–4 |
| TE-26 step efficiency metric | (measurement, drives others) |
| TE-27 single-shot for known patterns | $5–10 (avg, weighted by % of qualifying stories) |
| TE-28 trajectory pruning | $2–4 |
| **Total iteration-efficiency layer** | **~$15–28/story** |

Combined with the original 18 TEs (~$15–20/story compression) and the 3 routing/persona TEs (~$10–15/story), full stack predicted: **L10's $24.74 → $3–5 per story** for stories that use single-shot mode, **$5–8 per story** for stories that need the full pipeline.

---

## Sources

- [Plan-and-Execute Prompting (SurePrompts)](https://sureprompts.com/blog/plan-and-execute-prompting)
- [TELUS — Plan-and-Execute Loops](https://www.telusdigital.com/insights/data-and-ai/article/building-ai-agents-with-plan-and-execute)
- [Salesforce W&D — Scaling Parallel Tool Calling](https://arxiv.org/html/2602.07359v1)
- [Letta — parallel tool calling guide](https://docs.letta.com/guides/agents/parallel-tool-calling/)
- [Anthropic — extended/interleaved thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [AWS — Strands agents with Claude 4 interleaved thinking](https://aws.amazon.com/blogs/opensource/using-strands-agents-with-claude-4-interleaved-thinking/)
- [Anthropic — effective context engineering for agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Context-Bench (Sundeep Teki) — multi-turn fragmentation](https://www.sundeepteki.org/blog/context-bench-a-benchmark-for-evaluating-agentic-context-engineering)
- [Trajectory Reduction paper (arXiv)](https://arxiv.org/pdf/2509.23586)
- [DeepEval — step efficiency metric](https://deepeval.com/docs/metrics-step-efficiency)
- [Statsig — tool calling optimization](https://www.statsig.com/perspectives/tool-calling-optimization)
- [Oracle — anatomy of the AI agent loop](https://blogs.oracle.com/developers/what-is-the-ai-agent-loop-the-core-architecture-behind-autonomous-ai-systems)
- [Anthropic — Claude Opus 4.7 best practices](https://claudefa.st/blog/guide/development/opus-4-7-best-practices)
- [AddyOsmani — agent harness engineering](https://addyosmani.com/blog/agent-harness-engineering/)
- [Inngest — agent tool loop patterns](https://www.inngest.com/docs/ai-patterns/agent-tool-loops)
