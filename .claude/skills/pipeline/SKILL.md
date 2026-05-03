---
name: pipeline
description: "Use when multiple work packages need to be built in sequence or parallel. Triggers: batch implementation requested, track or story list provided, 'all' target given."
argument-hint: "[story-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
min_tool_calls: 40
---

# Pipeline — Build Stories End-to-End

Target: **$ARGUMENTS**

You are autonomous. There is NO human. Never pause, never ask, never stop until every story you were given is done or blocked.

**NEVER end your turn without a tool call** unless every story you were given is done/blocked.

---

## What you own

The scheduler invokes you with **one or more story IDs**. The argument is either:

- **A single ID** (e.g. `L7`) — a solo Medium- or Large-complexity story. Do this one and finish.
- **Multiple IDs from the same track** (e.g. `A2 A3 A5`) — a batched group of Small-complexity stories. The scheduler has already verified they share a track and have no inter-dependencies, so you may do them in any order.

Cross-track or cross-complexity batches are NEVER dispatched. If you receive a mixed group, treat it as a scheduler bug: mark every story `blocked` with reason `mixed-batch` and exit.

**State contract — non-negotiable.** You own exactly `.pipeline/progress/<id>.json` for **each ID in $ARGUMENTS, and no others**.

- Read `.pipeline/progress/<id>.json` to resume (skip if `status: done`, resume `in_progress` from `currentStep`).
- Write `.pipeline/progress/<id>.json` after every status/step change for that story.
- NEVER read or write progress files for IDs you weren't given. Other agents own those.
- The legacy `.pipeline/progress.json` is gone — do not create it.

`docs/work-packages/TRACK-<letter>.md` and `docs/work-packages/SHARED.md` remain your reference for spec and dependency graph.

Record session start time.

---

## Pre-condition

The pipeline does NOT run `/concept`. Concept-locking is upstream founder work — what a Thread / Block / Artifact / Bet / Cost IS, what it ISN'T, what contracts it commits us to. Those decisions need founder input and don't fit an autonomous pipeline. Before launching the pipeline, the founder must have run `/concept <id>` for any story that introduces or reshapes a primitive — the relevant `docs/concept/*.md` section + `SHARED.md` "Shared Contracts" entry must exist. The pipeline reads them as fixed input.

If a story is dispatched to the pipeline and `/concept` work is missing for a New / Reshaped noun, **fail fast**: mark the story `blocked` with reason `concept-missing` and move on. Do not autonomously redefine concepts.

---

## For each story (any order within a batched group, sequential within yours)

Set status to `in_progress`. The scheduler / `bin/pipeline` has already created the worktree and opened a **draft PR** (TE-21). Each persona phase commits its output and pushes; CI is the verify gate.

Then dispatch the **four durable persona sessions** below, in order. Update `currentStep` in the progress file before each persona dispatch.

### The 4-persona graph (collapsed from the prior 17-step pipeline)

| # | Persona | Absorbed steps | Why |
|---|---|---|---|
| 1 | **architect** | concept-read, design, architecture | Concept doc consumed as input. Variant exploration + plan production happen in one durable session, with same-session critique mode-switches (no separate `/design-critique` or `/architecture-critique` — TE-17 dropped them). |
| 2 | **builder** | write-tests, write-code, apply-review | TDD red/green + apply-review-fixes inside one session. QA-vs-developer is a prompt mode within the persona; tests are derived from the plan, so the rule survives. |
| W1–W4 | **reviewer workers** (parallel, findings-only) | architecture-review, security-review, design-review, adversary-review | Builder spawns these in parallel via the runtime's sub-agent primitive. Each returns ONE TOON findings block. Hard caps (depth-1, ≤4 parallel) live in the worker prompts so they travel. |
| 3 | **cold-dod** | check-definition-of-done | Fresh context. Reads live PR + spec. Approves or blocks. Doesn't write code. The one boundary that must not collapse. |
| 4 | **reflector** | retro | Reads ledger + `gh pr view` + DoD verdict. Emits structured retro entry that feeds the compound agent. Light. |
| — | scripts | verify, ship | `bun run verify` runs as CI on every push (no skill — TE-21 dropped `/verify`). Continuous-commit logic in `bin/pipeline` flips the draft PR ready when Cold DoD approves (no skill — TE-21 dropped `/ship`). In `PIPELINE_AB_MODE=1`, the final ready-flip / merge step is suppressed so the run can be replayed. |

**Total durable agent sessions per story: 4.** Plus up to 4 parallel reviewer workers. Plus scripts.

---

## Persona dispatches — what to invoke

For each persona phase, spawn a sub-agent of the named type. The persona prompt encodes its own scope; do NOT re-state it here.

```
Phase 1 — architect:
  spawn agent type=architect with skills /concept (read-only), /design,
  /architecture available. Architect runs design's Phase 0a routine/novel
  classifier, generates 1 / 2 / 3 variants accordingly, runs in-session
  critique to score-≥7 (max 4 rounds), then runs /architecture in the same
  session including its in-session architectural critique (max 3 rounds).
  Architect commits each phase output (brief, approved.md, plan) and pushes.

Phase 2 — builder:
  spawn agent type=builder. Builder reads the plan; writes failing tests
  (Mode 1); commits + pushes; writes code (Mode 2); commits + pushes; runs
  bun run verify locally; on green, spawns the 4 reviewer workers in
  parallel; collects their TOON findings; applies them (Mode 3); commits +
  pushes. If Builder hits a plan-vs-reality conflict, it raises a BLOCKER
  rather than redesigning in-flight (TE-22).

Phase 2 fan-out — reviewer workers (parallel, depth-1):
  spawn agent type=reviewer-arch
  spawn agent type=reviewer-security
  spawn agent type=reviewer-design   (skip if no UI files in the diff)
  spawn agent type=reviewer-adversarial
  Each returns ONE TOON findings block. Builder absorbs them in apply-review
  mode.

Phase 3 — cold-dod:
  spawn agent type=cold-dod in fresh context. Cold DoD reads gh pr view +
  the spec + the plan and emits APPROVED | BLOCKED with an AC table.
  If BLOCKED → back to Phase 2 (max 3 attempts per story).
  If APPROVED and PIPELINE_AB_MODE != 1 → flip draft PR ready
  (`gh pr ready`). In AB mode, leave the PR draft.

Phase 4 — reflector:
  spawn agent type=reflector. Writes docs/retro/<id>.md with the cost
  signals the A/B harness reads.
```

### Loop rules

- If Builder raises BLOCKER: surface to Architect for plan amendment, then re-enter Phase 2. Max 3 attempts per story.
- If Cold DoD blocks: re-enter Phase 2 to fix the cited gaps. Max 3 attempts per story.
- If CI fails after a Builder push: Builder fixes locally and pushes again. Max 3 attempts per push series.
- If Architect's in-session critique fails to reach ≥7 after the cap: pause, mark `blocked` with reason `concept-or-spec-misalignment`. The concept itself may need upstream `/concept` work.

After Phase 4: set status to `done`. Move to next story.

---

## Why this is structured this way

### Adversarial principle preserved

Author / critic boundaries that matter live as either (a) **mode prompts inside Architect** for the plan / design own-critique, or (b) **fresh-context Reviewer workers** for code review. Cold DoD enforces the one boundary that must not be inside any session — it reads a *live* PR, not Builder's notes about the PR.

### Why redundant skills are gone (TE-17)

`/design` already runs the design rubric internally (now Phase 2 of /design). `/architecture` already runs the architectural rubric internally (now Phase 4 of /architecture). Calling them as separate skills was cache-write tax for the same loop.

### Why /verify and /ship are gone (TE-21)

`bun run verify` is the same script regardless of who invokes it; CI runs it on every push. `/ship` was a wrapper around `gh pr create` and a CI-watch loop; the worktree setup creates the draft PR up front, every persona pushes incrementally, and Cold DoD's APPROVED flips it ready.

### Why /design's variant count is now conditional (TE-18)

Routine UI (existing component family, known layout) gets 1 variant + a "did we consider X / Y / Z" check. Genuinely novel UI gets 3. L1 / L2 / L3 primitives are always novel.

---

## Rules

- **Never stop after planning.** Architect is Phase 1. The plan isn't done until Builder makes it real and Cold DoD approves.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked`.
- `.pipeline/progress/<id>.json` is the checkpoint for each story you own. Write it after every status/step change. Touch only files for the IDs in $ARGUMENTS — never anyone else's.

**Don't rationalize skipping personas:**
- "Concept work isn't done but I'll figure it out" → no. Fail fast with `blocked: concept-missing`; the founder runs `/concept` upstream.
- "The plan is done, I can stop" → planning is one of four phases. You haven't built anything yet.
- "This story is simple, skip Builder reviewer fan-out" → simple stories have the highest skip rate and highest regression rate.
- "Cold DoD is redundant, tests passed" → tests prove behavior, DoD proves the RIGHT thing was built against the spec, in *fresh context*. The boundary is the value.
- "Reflector is navel-gazing" → without the cost signals it emits, the A/B harness can't prove block-1b actually saved tokens, and the compound agent can't propose the next round.

**When the Architect can skip the design step within Phase 1:** the story has no UI surface (pure backend, schema, infra, concept-doc-only). Verify by reading the AC list — if no AC mentions a page, component, layout, route on the web side, or visible state, skip the design portion and go straight to /architecture. When in doubt, run /design with `routine` classification; one variant is cheap and the brief serves as documentation.
