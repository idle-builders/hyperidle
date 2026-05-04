# Persona architecture — context economics + brain-power routing

The right architecture isn't decided by counting sessions or grouping skills. It's decided by two orthogonal axes per atomic action:

- **Does previous context HELP, hurt, or not matter?**
- **What level of brain power does this action need?**

A persona is a contiguous run of actions where both answers stay the same. A persona switch is justified when *either* axis flips. The model assigned per persona drops cost dramatically.

---

## What Hermes (Nous Research) actually does

Reading the source, not forks:

- **One long-running primary agent.** Not multi-agent at the core.
- **Two-layer context injection** every turn: a *base* layer (session summary, representations, peer card — refreshed on `contextCadence`) plus a *dialectic supplement* (LLM-derived reasoning, refreshed on `dialecticCadence`).
- **ContextCompressor** monitors usage, fires at 50% of window, protects first 3 turns + last 20 messages, summarizes the middle via auxiliary model call.
- **`MEMORY.md` (2,200 chars) + `USER.md` (1,375 chars)** injected into system prompt at session start. Tiny, dense, persistent across sessions.
- **Multi-provider fallback** (Claude → OpenRouter → others) — not multi-*agent*, multi-*provider*. Hermes routes the same agent's calls across models on errors.
- **13,700-line conversation loop, 61 tools across 52 toolsets**, multi-tool parallelism via ThreadPoolExecutor.
- **Memory cadences are the cost knob.** `contextCadence` (base layer refresh), `dialecticCadence` (LLM reasoning fire rate), `dialecticDepth` (1–3 chat passes). Cost dialed independently from depth.

**Lesson:** Hermes is fundamentally a *single agent with smart memory layering*, not a panel of specialists. The "multi-agent" is an add-on, not the spine. ([Hermes architecture docs](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture))

This puts Hermes in the Cognition camp, not Anthropic's. The dialectic-cadence pattern is what HyperIdle is missing — a way to refresh "thinking-about-the-task" without spawning a new agent.

---

## The two-axis matrix

Every atomic action in the pipeline maps to a cell:

|                              | **Context HELPS** | **Context NEUTRAL** | **Context HURTS (need fresh)** |
|---|---|---|---|
| **High brain (Opus)** | concept, design synthesis, architecture, DoD final judgment | — | DoD audit (cold), adversarial reviews where critic must NOT see implementer reasoning |
| **Medium brain (Sonnet)** | apply-review-fixes, retro synthesis | architecture-review (compares against plan), security-review, design-review | adversarial-reviewer (Saboteur/New Hire/Auditor personas) |
| **Low brain (Haiku/cheap)** | exploration summaries, AC mapping | scan operations (slop, simplification), file lookups, doc anchor reads | — |
| **None (script)** | — | verify, ship, route-check, AC-coverage script, brief-write, diff-summary | — |

**Decoding the columns:**

- **HELPS:** the action depends on prior reasoning. Concept builds on the spec read; design builds on concept; architecture builds on design. Apply-review needs the implementer's mental model.
- **NEUTRAL:** the action is bounded — give it a file diff and a checklist, it doesn't need conversation history. Reviews that compare code to a plan fall here. Scans pattern-match without needing prior context.
- **HURTS:** the action's value comes from *not* knowing the producer's reasoning. Adversarial review with a "Saboteur" persona must enter cold. DoD audit must not inherit "I've worked hard, this is good enough."

---

## Persona derivation from the matrix

A persona = contiguous cells in the same row that share "context HELPS" or "NEUTRAL." A persona switch happens when:

1. The row changes (brain power need changes → switch model)
2. The column flips to HURTS (need fresh context)
3. Or the action is a script (no agent at all)

Applying this to the 17-step pipeline:

### Persona 1: **The Architect** (Opus, long context, HELPS column)
Actions: read concept docs → define nouns → design variants → critique own design (mode-switch) → architect plan → critique own plan (mode-switch) → write detailed spec for builder.

Why one persona: each step builds on the prior. Self-critique within the session is healthy ("here's my design; now adversary mode: what's wrong with it?"). Mode-switching is via prompt, not session.

Why Opus: definitional thinking. Hard reasoning. Worth the price.

**Output:** locked plan with route-checklist, ordered tasks, types, schemas, ACs.

### Persona 2: **The Builder** (Sonnet, long context, HELPS column)
Actions: read locked plan → write failing tests → run tests (red) → write code → run tests (green) → iterate → apply review findings → re-run tests.

Why one persona: TDD is one rhythm. Same files, same intent. The "QA shouldn't write the code they test" rule survives because **the tests come from the plan**, not the builder's intuition. The builder is *executing* a spec, not designing.

Why Sonnet: this is execution, not exploration. Sonnet 4.6 is the field's "daily driver" for coding. Roughly **40% the cost of Opus** for indistinguishable code-writing performance per multiple 2026 benchmarks. ([Claude model comparison](https://www.morphllm.com/comparisons/claude-sonnet-vs-opus-vs-haiku-coding))

**Output:** tests + code + commits, pushed continuously.

### Persona 3: **The Reviewers** (parallel, fresh context per worker, NEUTRAL or HURTS)
Actions: spawned in parallel by Builder when ready: architecture-review, security-review, design-review (NEUTRAL), adversarial-reviewer (HURTS — fresh context required).

Each worker:
- Gets the diff + the plan + a tight prompt
- Returns ONE TOON findings block
- Never makes decisions

Why parallel + fresh: each perspective is independent. Cache-write tax paid once per worker but they're cheap (Sonnet, small prompt, bounded output).

Why Sonnet for most + Opus only for adversarial-reviewer with hostile personas: most reviews are pattern-matching against a known plan — Sonnet handles it. The adversarial-reviewer pattern (Saboteur/New Hire/Auditor — *each must find at least one issue*) deserves a slightly stronger model because the "find what's wrong" task benefits from depth.

### Persona 4: **The Cold Auditor** (Opus, fresh context, HURTS)
Actions: read story → read live PR → verify each AC → take screenshots if UI → run tests → final go/no-go.

Why fresh: must not inherit Builder's framing.

Why Opus: this is the "is this actually done correctly" judgment call. Wrong answer here means broken code ships.

### Persona 5: **The Reflector** (Sonnet, fresh context, NEUTRAL)
Actions: read ledger → read `gh pr view` → identify what went well/badly → propose process improvements.

Why fresh: reflection benefits from distance. Why Sonnet: this is synthesis, not deep reasoning.

### Scripts (no agent)
- `verify` (CI on every push)
- `ship` (continuous commit; no separate session)
- `brief-write` (post-step hook in runner)
- `diff-summary`, `route-check`, `ac-coverage`, `concept-check`

---

## Why this beats the previous proposals

The 9-session and 6-session proposals counted sessions. Wrong axis. The right axes are *context need* (HELPS/NEUTRAL/HURTS) and *brain power* (Opus/Sonnet/Haiku/script).

The previous proposals also assumed one model. **Single-model is a 2x–4x cost mistake.** Per the consensus on routing, the same workload run with proper Opus/Sonnet/Haiku tiering costs **60–70% less** than Opus-everywhere — *before* any structural compression. ([Tiered routing benchmark](https://www.augmentcode.com/guides/ai-model-routing-guide))

Applied to L10 ($24.74):

| Persona | Old cost (Opus) | New cost | Why |
|---|---|---|---|
| Architect (concept+design+arch+critiques) | ~$10 | ~$10 | Stays Opus — high brain |
| Builder (tests+code+apply) | ~$10 | ~$4 | Sonnet ~40% the cost |
| Reviewers (×4 parallel) | ~$5.76 | ~$2 | Sonnet, parallel, small prompts |
| Cold DoD | ~$1.50 | ~$1.50 | Opus stays |
| Retro | (already cheap) | ~$0.50 | Sonnet |
| Verify / Ship / scripts | ~$2 | $0 | No agent |
| **Total** | **~$24.74** | **~$18** | Just from routing + script-ifying |

Then add structural compression (TE-1…TE-18 from the concept doc): **~$6–8** projected.

Combined: **L10 → ~$5–7 per story**. From routing + scripts + structural compression, in that priority order.

---

## What this means for HyperIdle's TE-7

Replace TE-7's table with the persona table above. Concretely:

```
.claude/skills/pipeline/SKILL.md
```

| Phase | Persona | Model | Context | Includes |
|---|---|---|---|---|
| 1 | Architect | Opus | Long, builds | concept + design + design-critique-mode + architecture + architecture-critique-mode |
| 2 | Builder | **Sonnet** | Long, builds (forked from Architect's brief) | write-tests + write-code + apply-review |
| 3 | Reviewers | **Sonnet** (Opus for adversarial) | Fresh, parallel × 4 | arch-review + adversary-review (with hostile personas) + security-review + design-review |
| 4 | Cold DoD | Opus | Fresh, cold | check-definition-of-done |
| 5 | Reflector | **Sonnet** | Fresh, light | retro |
| Scripts | — | — | — | verify (CI), ship (continuous commit), diff-summary, ac-coverage, route-check, brief-write |

**Total durable agent sessions:** 4 (Architect, Builder, Cold DoD, Reflector). Plus parallel Reviewers (cheap, bounded). Plus scripts.

**Continuous commit:** branch + draft PR opened at worktree setup. Builder commits per phase, pushes, PR auto-updates, CI runs on every push.

---

## Three knobs to add (Hermes-inspired)

Hermes exposes `contextCadence`, `dialecticCadence`, `dialecticDepth` as independent knobs. HyperIdle should mirror this:

1. **`briefCadence`** — how often the runner refreshes `.pipeline/briefs/<id>.toon` from the persona's session. Every phase = cheap; every turn = expensive.
2. **`memoryFile`** — equivalent to Hermes' `MEMORY.md`. A 1–2 KB file injected at every persona's session start. Captures: this story's spec headline, the locked plan summary, the open issues. No prose. TOON.
3. **`compressionThreshold`** — at what % of context window does the runner force a Ralph-loop fresh-context spawn with the brief as state. Default 50% (Hermes' default).

These three turn the pipeline runner into something close to Hermes' `run_agent.py` shape, but for the multi-persona case.

---

## Sources

- [Hermes Agent — architecture docs (Nous Research)](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Hermes — context window problem (Medium)](https://medium.com/@maclarensg_50191/how-hermes-agent-solves-the-context-window-problem-and-what-every-agent-builder-should-borrow-bf90071f4757)
- [Hermes memory providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers)
- [Augment Code — Best AI Model for Coding Agents 2026 routing guide](https://www.augmentcode.com/guides/ai-model-routing-guide)
- [Caylent — Haiku 4.5 multi-agent opportunity](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)
- [Morph — Claude Sonnet vs Opus vs Haiku coding benchmark 2026](https://www.morphllm.com/comparisons/claude-sonnet-vs-opus-vs-haiku-coding)
- [OpenRouter — model routing for cost optimization](https://openrouter.ai/pricing)
- [Sid Saladi — OpenRouter 90% cost reduction](https://sidsaladi.substack.com/p/openrouter-101-the-complete-guide)
- [MindStudio — context rot in coding agents](https://www.mindstudio.ai/blog/context-rot-ai-coding-agents-explained)
- [caines.ca — context management & fresh-context resets](https://caines.ca/posts/2026-02-12-managing-context/)
- [Hindsight — why agents lose context](https://hindsight.vectorize.io/guides/2026/04/21/guide-why-ai-agents-lose-context-and-how-hindsight-fixes-it)
