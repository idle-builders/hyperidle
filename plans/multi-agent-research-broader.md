# Broader research — open source landscape + adversarial value + ship-as-no-op

Three direct answers, then synthesis.

---

## 1. Does separate-thread adversarial review add value?

**Yes — but only when scoped to findings, never decisions.**

The literature is consistent on this distinction:

- **Microsoft RedCodeAgent** (red-teaming code agents): adversarial agent in separate context discovers real-world risks static benchmarks miss. "Consistently outperforms leading jailbreak methods." Findings only — never integrated as decisions. ([Microsoft Research](https://www.microsoft.com/en-us/research/blog/redcodeagent-automatic-red-teaming-agent-against-diverse-code-agents/))
- **Adversarial Code Review skills** (popular Claude skill pattern): three hostile personas — Saboteur, New Hire, Security Auditor — **each must find at least one issue** to eliminate rubber-stamp reviews. Each runs in fresh context. The integrating agent is single-threaded. ([alirezarezvani/claude-skills adversarial-reviewer](https://github.com/alirezarezvani/claude-skills/blob/main/engineering-team/adversarial-reviewer/SKILL.md))
- **HN: "Adversarial Code Review paired agents, zero noise, validated findings"** — production-shipped pattern. ([HN thread](https://news.ycombinator.com/item?id=47360961))

The Cognition "don't multi-agent" warning is specifically about **fragmenting decisions**, not findings. When a separate-thread agent's output is "here are 7 issues with severity tags," that's findings. When it's "merge this not that," it's a decision — and decisions in separate threads are where the telephone game starts.

**Concrete rule the consensus supports:**

| Output type | Separate thread | Why |
|---|---|---|
| Findings (TOON-shaped, severity-tagged, location-pinned) | **Yes — high value** | Forces fresh perspective, breaks self-review monoculture |
| Decisions (merge/don't merge, refactor X to Y, ship/block) | **No — fragile** | Single integrator must own the decision |
| Approvals (sign-off, gate-pass) | **Yes, but cold** | DoD audit must not see implementer's reasoning |
| Suggestions / refinements | **Inline mode-switch** | Cheaper, equally effective |

This **validates** keeping `/architecture-review`, `/security-review`, `/adversary-review`, `/design-review`, `/check-definition-of-done` as separate-context. The mistake was running them as **4 sequential sessions** when they're **4 parallel workers** spawned by one manager. Same adversarial value at a quarter of the cache-write cost.

---

## 2. Broader open source landscape — what others actually do

Beyond Cognition and Anthropic:

### OpenCode
Built-in `build` (full-access) + `plan` (read-only) agents, plus a `general` subagent for complex multi-step searches. Agent Teams implementation with **event-driven messaging, append-only JSONL writes, peer-to-peer communication, two-level state machines**. ([OpenCode agents docs](https://opencode.ai/docs/agents/), [agent teams writeup](https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol))

### Hermes (Nous Research)
Self-hosted, model-agnostic. **Primary orchestrator + specialized sub-agents, each with narrow responsibility.** The community fork `opencode-hermes-multiagent` runs **17 specialized agents** (research, planning, implementation, quality, infrastructure) — same shape as HyperIdle's pipeline. 64K GitHub stars in two months. ([Hermes Agent](https://hermes-agent.nousresearch.com/), [opencode-hermes-multiagent](https://github.com/1ilkhamov/opencode-hermes-multiagent))

The fact that a 17-agent specialist pipeline is the most-starred OSS pattern means HyperIdle's instinct isn't crazy. But it's also where the cost complaints live.

### Pi (badlogic/pi-mono)
Minimal harness — only 4 default tools (read, write, edit, bash). Auto-compaction. Steering messages — user can interject mid-execution and the message arrives after the current tool. Sub-agents, plan mode, MCP integration. **Philosophy: "adapts to your workflows rather than the other way around."** ([pi-mono](https://github.com/badlogic/pi-mono))

### Plandex
Designed for **large tasks spanning many steps and dozens of files.** Plan-then-execute. ([Plandex](https://github.com/plandex-ai/plandex))

### Ralph (the most relevant pattern for HyperIdle's autocompact problem)
Autonomous loop that **intentionally loses context every iteration.** Hooks the model's exit attempt and re-injects the prompt in a *clean* context window. State lives on disk (git, `prd.json`, `progress.txt`). Each iteration: fresh context → read state → do one unit → write state → exit. **This is the Ralph Loop**, and it solves the long-running-task / context-compaction problem by inverting it: don't fight compaction, embrace it. ([Ralph](https://github.com/snarktank/ralph), [What Ralph Is](https://www.knightli.com/en/2026/04/27/ralph-autonomous-agent-loop-claude-code-amp/))

HyperIdle's `.pipeline/progress/<id>.toon` is already a Ralph-shaped state file. The pipeline runner just doesn't *use* it the Ralph way — it spawns one specialist per session instead of looping the same generalist with fresh context.

### Cursor Cloud Agents / GitHub Copilot agentic / Composio AO
**Continuous commit pattern.** Agent runs autonomously on a branch, commits incrementally, pushes, CI runs, agent reads CI output, fixes, re-pushes. **30% of Cursor's own merged PRs are from these agents.** No "ship" step — shipping is a side-effect of work-in-progress. ([Cursor Cloud Agents](https://www.nxcode.io/resources/news/cursor-cloud-agents-virtual-machines-autonomous-coding-guide-2026), [Continuous AI on GitHub](https://github.blog/ai-and-ml/generative-ai/continuous-ai-in-practice-what-developers-can-automate-today-with-agentic-ci/))

### LangGraph / CrewAI / AutoGen — the framework camps
- **LangGraph (graphs + state + conditional edges):** ~5% token overhead. Best for stateful pipelines.
- **CrewAI (role-based crews with backstories):** ~18% token overhead. Optimized for collaboration narrative, expensive.
- **AutoGen (conversational GroupChat with selector):** Multi-turn conversations between agents.

The well-documented migration pattern: **teams prototype on CrewAI for the role-clarity, then migrate to LangGraph when they need real state management.** That migration mirrors what HyperIdle should do — the spec reads like CrewAI (role per skill); the runtime should be LangGraph-shaped (one stateful graph, parallel branches where they help).

---

## 3. Ship-as-no-op via continuous commit

The user is right and the rest of the field has already done this:

- **Cursor Cloud Agents (Feb 2026):** "Build software, test it themselves, record video demos, produce merge-ready PRs." 30% of their internal merged PRs are from agents.
- **GitHub Copilot agentic mode:** "Spins up a dedicated branch, reads instructions, writes code, runs the test suite, diagnoses its own test failures, iterates, and only tags a developer for review once the tests pass."
- **Composio AO:** "Multiple agents in isolated worktrees, each with its own PR... pushes hardest past session management into autonomous PR handling. Agents fix CI failures, respond to review comments, and manage their own PR lifecycle."

The pattern: **PR creation is part of the worktree setup, not a final step.** Every meaningful change is a commit + push. CI is the gate, not a separate `/verify` skill. PR review comments are inputs to the next iteration of the manager thread.

**For HyperIdle this means:**
- `bin/pipeline` worktree setup creates the branch and opens the draft PR before any agent runs.
- The manager thread commits incrementally as each phase completes (design → commit, plan → commit, tests → commit, code → commit).
- `git push` after every commit. The PR auto-updates. CI runs against every push.
- The "ship" step disappears. There's nothing to ship — the PR has been live since minute zero.
- DoD audit reads the PR's current state (raw artifacts), passes or fails, marks the PR ready-for-review or blocked.
- Retro reads `gh pr view --json` for CI history, comments, and the ledger.

`/ship` becomes: nothing. `/verify` becomes: nothing (CI runs it). `/check-definition-of-done` reads the live PR.

---

## Synthesis: the architecture this points at

Combining the three answers:

**Manager thread (single long-running session, ~80% of cost):**
- Phase-mode prompts: concept-reading → design → architecture → write-tests → write-code → apply-review.
- Phase-mode does the role-switch (QA-tester for tests, developer for code) without paying cache-write tax 9 times.
- **Commits incrementally; pushes after each phase.** PR auto-updates from minute zero.
- Spawns parallel workers (cheap, findings-only) for review and exploration.

**Parallel workers (4–6 per story, fired by manager, return TOON findings):**
- adversarial-reviewer (Saboteur / New Hire / Security Auditor — fresh context, must find issues)
- architecture-reviewer
- security-reviewer
- design-reviewer
- explorer (Haiku) for read-only exploration when needed
- AC-coverage check (script, no LLM)

**Cold DoD (1 session, fresh context, end-of-story):**
- Reads live PR. Approves or blocks. **Doesn't write code.**

**Retro (1 light session):**
- Reads ledger + `gh pr view`. Writes lessons-learned. **Doesn't write code.**

**Ralph Loop fallback for the manager thread:**
- If the manager hits autocompact, the runner intercepts, re-spawns with the same `.pipeline/progress/<id>.toon` + briefs as state. Manager picks up where it left off. **No separate /ship session means resume-after-compact is straightforward.**

**Total durable sessions per story:** 3 (manager + DoD + retro). Plus 4–6 small parallel worker invocations.

---

## What changes for HyperIdle's TE-7

The current 9-session shape is the right shape for **CrewAI-style role narrative**. It's the wrong shape for **token cost**. Here's the concrete revision the broader research points at:

| Was (TE-7 v2) | Becomes |
|---|---|
| 9 sessions: design / arch / write-tests / write-code / scan-review / applier / DoD / ship / retro | 3 sessions: manager / DoD / retro |
| QA writes tests, dev writes code (separate sessions) | One manager, phase-mode prompts switch persona |
| 4 sequential review specialists | 4 parallel workers, returning TOON findings |
| `/ship` as separate session | Continuous commit, PR live from worktree setup |
| `/verify` skill | CI on every push, no skill needed |
| Adversarial = separate session for every reviewer | Adversarial = parallel workers for findings + cold DoD for approval |

**Predicted cost:** L10's $24.74 → ~$5–7 per story.

---

## Sources

- [OpenCode agents](https://opencode.ai/docs/agents/)
- [Porting Claude Code's Agent Teams to OpenCode](https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol)
- [Hermes Agent — Nous Research](https://hermes-agent.nousresearch.com/)
- [opencode-hermes-multiagent (17 specialized agents)](https://github.com/1ilkhamov/opencode-hermes-multiagent)
- [Pi mono — badlogic](https://github.com/badlogic/pi-mono)
- [Plandex](https://github.com/plandex-ai/plandex)
- [Ralph autonomous loop](https://github.com/snarktank/ralph)
- [What Ralph Is — autonomous Claude Code loop](https://www.knightli.com/en/2026/04/27/ralph-autonomous-agent-loop-claude-code-amp/)
- [Anatomy of an Agent Harness — LangChain](https://blog.langchain.com/the-anatomy-of-an-agent-harness/)
- [9 Open-Source Agent Orchestrators 2026 — Augment Code](https://www.augmentcode.com/tools/open-source-agent-orchestrators)
- [Cursor Cloud Agents — autonomous PR creation](https://www.nxcode.io/resources/news/cursor-cloud-agents-virtual-machines-autonomous-coding-guide-2026)
- [GitHub continuous AI in practice](https://github.blog/ai-and-ml/generative-ai/continuous-ai-in-practice-what-developers-can-automate-today-with-agentic-ci/)
- [Microsoft RedCodeAgent](https://www.microsoft.com/en-us/research/blog/redcodeagent-automatic-red-teaming-agent-against-diverse-code-agents/)
- [Adversarial reviewer skill (3 hostile personas)](https://github.com/alirezarezvani/claude-skills/blob/main/engineering-team/adversarial-reviewer/SKILL.md)
- [HN: Adversarial Code Review paired agents](https://news.ycombinator.com/item?id=47360961)
- [LangGraph vs CrewAI vs AutoGen — 2026 comparison](https://dev.to/synsun/autogen-vs-langgraph-vs-crewai-which-agent-framework-actually-holds-up-in-2026-3fl8)
- [AddyOsmani: agent harness engineering](https://addyosmani.com/blog/agent-harness-engineering/)
