# Block 2 — Durable State Surface (hook-injected)

**Cohort:** Round 1, parallel against `main`.
**Includes:** TE-6, TE-13, TE-20, TE-25.

---

## Load-bearing claim

*The runner is the durable substrate; agents are ephemeral. State that survives across persona handoffs lives in TOON files the runner owns and is **injected via hooks** at session-start, not read by the agent through tool calls.*

The implementation is the upgrade: prior framing had agents reading `.pipeline/briefs/<id>.toon` and `.pipeline/memory/<id>.toon` via `Read`. That still costs a tool call, still re-feeds the brief on every turn through trajectory replay, and lets agents "forget" to read it. **Hook-injected state lives in the system prompt — zero tool calls, automatic, can't be skipped.**

If this is right, persona handoffs become information-lossless and cache-friendly. If wrong (e.g., the brief silently drops nuance the next persona needed; pre-fetched data inflates the prompt without being consumed), the cheapest manifestation is rework loops; the most expensive is wrong code shipping past Cold DoD because Cold DoD also reads the brief.

## Value lever

Mixed:
- **Cache writes** — TE-6 + TE-20 + TE-25 replace per-session re-reads of CLAUDE.md / AGENT.md / story file / plan with a single ~2 KB injection at session start. Stable injection prefix → cache hit.
- **Iteration count** — pre-fetched data eliminates turn-1 read iterations.
- **Output tokens** — TE-13's structured review findings instead of free-form prose.

Block 2's *real* value is enabling Block 1b and Round 3 — A/B'd in isolation it may show only modest direct savings, but it makes 1b's persona collapse information-lossless and makes Round 3's cheap-model personas start coherent. Worth A/B-ing standalone in round 1; the round-1 number is a floor, not the headline.

## Risk profile

- **System complexity:** Medium. New hook scripts (SessionStart, UserPromptSubmit), new runner-owned file shapes, new TOON-emit logic in `packages/pipeline/src/runner.ts`. Codec already exists (`packages/shared/src/toon-codec.ts`).
- **Info-loss risk:** Medium. The runner's brief is a lossy projection of the prior persona's full output. If the projection drops a nuance the next persona needed, you get rework loops or, worse, wrong code that passes Cold DoD because Cold DoD also reads the brief. Mitigated by the hard rule that adversarial personas read raw artifacts, but rule enforcement is prompt-level.
- **Compounds with:** Block 1b (briefs make persona collapse safe), Round 3 (cheap-model personas need memory to start coherent — without Block 2, Round 3's savings shrink).

## Dependencies

- **Upstream:** Block 0 (need observability to detect "memory drift" and "brief framing pollution"). Codec already shipped.
- **Downstream:** Block 1b's persona collapse is information-lossless because of this block. Round 3 cheap-model personas need memory to be cost-effective.

## Shippability

Medium. Reversible at file level (delete `.pipeline/briefs/`, `.pipeline/memory/`, hook scripts). Measurable via per-persona token counts and a new `hyperidle.brief.injected` / `hyperidle.prefetch.consumed_ratio` attribute.

---

## Implementation principle — hooks, not Reads

State files are owned by the runner and **injected via hooks**:

- **SessionStart hook** — runs once per persona session. Loads `.pipeline/memory/<id>.toon` (story-level static context) and the relevant `.pipeline/briefs/<id>.toon` slice (per-step delta). Concatenates into a `## Story context` system prompt section.
- **UserPromptSubmit hook (optional, harness-dependent)** — re-injects on every turn for personas that benefit (Cold DoD reading PR state mid-run). Most personas don't need this.
- **Agent never calls `Read` on these paths.** The brief is in the prompt, not on disk from the agent's perspective.

**Tool-agnostic note:** Claude Code uses the `hooks` config in `settings.json`. OpenCode, Hermes, and other harnesses ship equivalent SessionStart primitives — wiring varies, content is identical.

---

## TEs

### TE-6 — Handover brief (`.pipeline/briefs/<id>.toon`)

Runner-written, never agent-written. After each persona phase the runner extracts: prior-step score, target files (with line numbers), open issues, ledger entry. Next persona's SessionStart hook injects this brief.

**Hard rule:** adversarial personas (critics, reviewers, Cold DoD) read the *raw* artifact, not the brief. The hook for these personas injects pointers (file paths) instead of summaries. Encoded in each persona's hook config — not as a prompt rule the agent can ignore.

### TE-13 — Reviews return TOON files

Each Reviewer worker writes findings to `.pipeline/reviews/<id>/<reviewer>.toon` (gitignored), one file per perspective, individual items deletable. Builder's SessionStart hook injects the open findings into the Builder's prompt. Builder applies fixes, marks resolved items via a runner script.

### TE-20 — Story memory file (`.pipeline/memory/<id>.toon`)

Per-story file, ≤2 KB, TOON shape. Injected at every persona's session start via the SessionStart hook. Replaces re-reading the story spec, the locked plan summary, and the open issues list.

Schema:
```toon
story.id: L10
story.spec.headline: One-line goal
story.spec.acs: [3 short bullets]
plan.locked: yes
plan.summary: One-paragraph
plan.routes: [GET /api/x, POST /api/y]
plan.targetFiles: [3-5 paths with line ranges]
openIssues: [if any]
priorPersona.headline: Architect locked plan, ready for Builder
```

Owner: pipeline runner writes it after each persona phase. Personas only consume it (via hook injection); never write.

### TE-25 — Pre-prompt context pre-fetch by the runner

Extends TE-20: the runner doesn't just inject the memory file. Before invoking each persona, it pre-fetches the data that persona will inevitably need on turn 1, into the same SessionStart hook output:

| Persona | Pre-fetched into system prompt |
|---|---|
| Architect | Concept doc anchors for nouns mentioned in the story |
| Builder | Locked plan + failing test scaffold paths |
| Reviewers | Diff (`git diff main..HEAD --stat` + targeted hunks) |
| Cold DoD | AC list + screenshot routes derived from failing-then-passing tests |
| Reflector | Ledger + `gh pr view --json` |

Each pre-fetched item = one fewer iteration the persona spends "reading in." Cap pre-fetch at ~5 KB total per persona; monitor consumption ratio via the new `hyperidle.prefetch.consumed_ratio` attribute.

---

## How they reinforce each other

| Pair | Effect |
|---|---|
| TE-6 + TE-20 | Memory file is the static base; brief is the per-step delta. Same TOON codec, different cadences. |
| TE-20 + TE-25 | Memory = static; pre-fetch = dynamic per-persona. Both runner-owned, both injected at SessionStart. |
| TE-13 + TE-6 | Review findings flow through the same hook pipe as briefs — Builder's SessionStart hook injects open findings as "things to fix." |
| All four + Block 1b TE-7 | Hook-injected state is what makes the persona collapse information-lossless. |

## How they could make each other worse

| Pair | Risk | Mitigation |
|---|---|---|
| TE-6 + adversarial personas | Critic reads producer's self-summary, inherits framing | Adversarial-persona hook injects raw artifact path, not the brief. Snapshot test: adversarial Reviewer's prompt cites `.pipeline/artifacts/<id>/<step>.md`, not `.pipeline/briefs/<id>.toon`. |
| TE-20 + memory pollution | Personas treat memory as license to skip the brief | Memory = static story-level context (spec, plan summary). Brief = per-step delta. Both injected; neither replaces the other. Hook output sections labelled explicitly: "Story context (stable):" vs. "Just-handed-off:". |
| TE-25 + over-fetching | Pre-fetched data persona doesn't end up using bloats system prompt | Heuristic per persona, capped at ~5 KB total. Sample-based: monitor `hyperidle.prefetch.consumed_ratio`. |
| TE-20 + memory drift on resume | Pipeline re-runs (resumes after blocker) regenerate memory but the prior persona's brief is now stale | Runner regenerates *both* memory and brief at every persona-phase boundary; never resume from mid-phase. |

---

## Open questions / adversary attacks

- **TE-6:** "Critic personas read the producer's self-summary and inherit the producer's framing." → Hard rule: adversarial-persona hooks inject paths, not summaries.
- **TE-20:** "Memory file pollution — personas treat memory as license to skip the brief." → Explicit prompt section split.
- **TE-25:** "Pre-fetched data the persona doesn't end up using bloats the system prompt and hurts cache more than it helps." → Cap + monitor `consumed_ratio`. If <50% on average, prune.
- **Memory regeneration cadence:** "Pipeline resumes regenerate memory; brief is now stale." → Regenerate both at every phase boundary.
- **Hook portability:** "SessionStart hooks are Claude Code-specific config; switching harnesses breaks the injection." → True for the wiring; the *content* is harness-agnostic. Each harness ships an equivalent primitive; the migration cost is hours, not weeks.

## A/B mechanics

- **Branch:** `block-2-state-hooks` off the locked baseline SHA.
- **Compared against:** `main` at the same SHA.
- **Stories:** 3 of mixed complexity (S / M / L).
- **Primary signals:** turn-1 read tool calls per persona (should drop to ~0 for Architect / Builder / Reflector), `hyperidle.brief.injected`, `hyperidle.prefetch.consumed_ratio`, total cache-write tokens.
- **Ship rule:** ≥10% improvement on cost or wall-clock with no AC regression on all 3 stories. Direct savings may be modest in isolation; the unlock value for Block 1b / Round 3 is the headline.

---

## Files touched

- `.claude/hooks/session-start.ts` — SessionStart hook that injects memory + brief.
- `.claude/hooks/session-start-adversarial.ts` — variant that injects paths only (for adversarial personas).
- `.claude/settings.json` — hook wiring per persona.
- `packages/pipeline/src/runner.ts` — write briefs / memory / pre-fetch slices after each persona phase.
- `packages/pipeline/src/brief.ts` — new module: brief/memory/prefetch generators (runner-side).
- `.pipeline/briefs/`, `.pipeline/memory/`, `.pipeline/reviews/` — gitignored runtime directories.
- Each `.claude/agents/<persona>/AGENT.md` — note that state arrives via SessionStart hook; do NOT read `.pipeline/briefs/` etc. as `Read` calls.
