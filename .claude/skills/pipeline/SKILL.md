---
name: pipeline
description: "Use when multiple work packages need to be built in sequence or parallel. Triggers: batch implementation requested, track or workpackage list provided, 'all' target given."
argument-hint: "[workpackage-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
min_tool_calls: 40
---

# Pipeline — Build Workpackages End-to-End

Target: **<target>**

You are autonomous. There is NO human. Never pause, never ask, never stop until every workpackage you were given is done or blocked.

**NEVER end your turn without a tool call** unless every workpackage you were given is done/blocked.

---

## What you own

The scheduler invokes you with **one or more workpackage IDs**. The argument is either:

- **A single ID** (e.g. `L7`) — a solo Medium- or Large-complexity workpackage. Do this one and finish.
- **Multiple IDs from the same track** (e.g. `A2 A3 A5`) — a batched group of Small-complexity workpackages. The scheduler has already verified they share a track and have no inter-dependencies, so you may do them in any order.

Cross-track or cross-complexity batches are NEVER dispatched. If you receive a mixed group, treat it as a scheduler bug: mark every workpackage `blocked` with reason `mixed-batch` and exit.

**State contract — non-negotiable.** You own exactly `.pipeline/progress/<id>.json` for **each ID in <target>, and no others**.

- Read `.pipeline/progress/<id>.json` to resume (skip if `status: done`, resume `in_progress` from `currentStep`).
- Write `.pipeline/progress/<id>.json` after every status/step change for that workpackage.
- NEVER read or write progress files for IDs you weren't given. Other agents own those.
- The legacy `.pipeline/progress.json` is gone — do not create it.

`plans/work-packages/TRACK-<letter>.md` and `plans/work-packages/dependency-graph.md` remain your reference for spec and dependency graph.

Record session start time.

---

## Pre-condition

The pipeline does NOT run `/concept`. Concept-locking is upstream founder work — what a Thread / Block / Artifact / Bet / Cost IS, what it ISN'T, what contracts it commits us to. Those decisions need founder input and don't fit an autonomous pipeline. Before launching the pipeline, the founder must have run `/concept <id>` for any story that introduces or reshapes a primitive — the relevant `docs/concept/*.md` section + `SHARED.md` "Shared Contracts" entry must exist. The pipeline reads them as fixed input.

If a workpackage is dispatched to the pipeline and `/concept` work is missing for a New / Reshaped noun, **fail fast**: mark the workpackage `blocked` with reason `concept-missing` and move on. Do not autonomously redefine concepts.

---

## For each story (any order within a batched group, sequential within yours)

Set status to `in_progress`. Run the worktree + draft-PR setup once, then dispatch the five phases.

### Worktree + draft-PR setup (TE-21)

```bash
# 1. Worktree
git worktree add .worktrees/<id> -b feat/<id>-<desc> main
cd .worktrees/<id> && bun install

# 2. Initial empty commit so the branch exists on the remote
git commit --allow-empty -m "chore(<id>): open WIP — pipeline scaffolding [skip ci]"
git push -u origin HEAD

# 3. Draft PR — opens once, every push auto-updates it
gh pr create --draft --title "feat(<id>): WIP" \
  --body "Pipeline run for <id>. Each persona commits its output. Reviewer DONE flips ready (unless PIPELINE_AB_MODE=1)."
```

### Continuous-commit rule (TE-21)

Each persona phase **commits its output and pushes** before returning:

| Phase | What gets committed | CI? |
|---|---|---|
| 1 — designer /concept | prose only | `[skip ci]` |
| 1 — designer /design (UI stories) | design variants | `[skip ci]` |
| 1 — designer /architecture | plan doc | `[skip ci]` |
| 2 — reviewer /design-critique | approved.md | `[skip ci]` |
| 2 — reviewer /architecture-critique | critique doc | `[skip ci]` |
| 3 — builder /write-tests (red) | test files | run |
| 3 — builder /write-code (green) | implementation (verified) | run |
| 4 — builder (apply review fixes) | one commit per applied finding batch | run |
| 5 — Explore agent /retro | prose | `[skip ci]` |

Local `bun run verify` is the gate. Builder runs it (check, lint:biome, lint:eslint, test, e2e — identical tools to CI) and must pass before pushing. On green, verify writes `.verify-attestation.json` (HMAC-signed with `~/.config/hyperidle/verify-secret`). Builder commits the attestation as the last commit before pushing. CI validates the attestation signature (~30s) instead of re-running the full suite (~10min). See `/ship` for the complete commit → verify → attestation → push flow.

Stories touching authentication, schema migrations, or `packages/server/src/agent-runtime/` set `gate: ci-required` in the workpackage spec; Reviewer holds the ready-flip until CI is green. Default for everything else is `gate: local-green`.

**Squash before flipping ready.** Builder squashes the persona-prose commits before Reviewer's DONE triggers `gh pr ready`. Implementation commits stay atomic; prose commits collapse into one `chore(<id>): pipeline artifacts`. Squash at flip time, not before — Researcher's retro still needs the per-phase history to extract cost signals.

### Ready-flip (replaces /ship)

When Reviewer's `/review` pass emits `Verdict: DONE` (after fix cycle):

```bash
if [ "${PIPELINE_AB_MODE:-0}" = "1" ]; then
  echo "[AB] Reviewer approved — leaving PR draft for replay"
else
  gh pr ready
fi
```

In A/B mode the PR stays draft so the run is replayable; the harness compares cost signals across replays without `gh pr merge` destroying the comparison. Outside A/B mode the human still owns `gh pr merge` — pipeline stops at "ready PR with green local verify" (or "green CI" for `gate: ci-required` stories).

### Post-push CI handling

Phase 4 advances on green local verify; CI runs in parallel.

- `gate: local-green`: ready-flip does not wait on CI. If CI goes red after merge, surface for revert or follow-up — do not silently retry.
- `gate: ci-required`: Reviewer holds the ready-flip until CI is green. If CI is red:
  1. Builder pulls the failure log via `gh pr checks <pr-number>`.
  2. Builder reproduces with `bun run verify`. If local is green and CI is red on the same SHA, lint-config drift is the root — fix the parity, not the symptom.
  3. Pushes again; max 3 push series. After 3, mark `blocked` with reason `ci-red-after-3-fixes`.

Then dispatch the persona sessions below, in order. Update `currentStep` in the progress file before each persona dispatch.

### The 5-phase pipeline

| Phase | Persona | Effort | Skills | Why |
|---|---|---|---|---|
| 1 | **designer** | high | `/concept` → `/design` → `/architecture` | Production only. Concept doc + variant exploration + technical plan. |
| 2 | **reviewer** | high | `/design-critique` → `/architecture-critique` | Evaluates designer output. True producer/evaluator separation — different agent, not just different mode. Context carries to Phase 4. |
| 3 | **builder** | medium | `/write-tests` → `/write-code` | TDD red then green. Must pass `bun run verify` before pushing. No broken code reaches the reviewer. |
| 4 | **reviewer** | high | `/review` | Same reviewer from Phase 2 (warm on design/arch). 6 lenses: 3 positive (architecture, design, security) + 3 negative (adversarial, simplification, slop) + AC audit. Builder applies fixes. |
| 5 | **Explore** | low | `/retro` | Fresh-context retro with cost signals. Built-in Explore agent, not a custom persona. |
| — | scripts | — | CI + PR | `bun run verify --raw` runs as CI on every push. Draft PR opens at worktree setup; `gh pr ready` flips on Reviewer's DONE + green local verify (or green CI for `gate: ci-required`). |

**Durable agent sessions per story: 3** (designer, reviewer, builder). Spawned once each with named handles (`designer-<id>`, `reviewer-<id>`, `builder-<id>`). After initial spawn, all subsequent communication uses `SendMessage(to=<name>)` to reuse the live session — no re-spawn, no cache-creation cost. Explore agent for retro is ephemeral.

---

## Persona dispatches — what to invoke

For each phase, the orchestrator spawns agents exactly ONCE with a stable name, then uses `SendMessage` for all subsequent communication. This avoids re-paying cache creation costs (~100k tokens per spawn).

**Spawn rule:** Use `Agent(subagent_type=<type>, name="<type>-<id>")` for first contact. Use `SendMessage(to="<type>-<id>")` for every subsequent message to that agent.

```
Phase 1 — designer (production):
  SPAWN: Agent(subagent_type="designer", name="designer-<id>")
  Run /concept (read concept doc, probe if New/Reshaped nouns exist).
  Run /design (classify routine/novel, generate 1-3 variants).
    Skip /design if no UI surface.
  Run /architecture (interrogate spec, draft plan).
  Commit each skill's output (concept.md, variants, plan) and push.
  Prose commits use [skip ci].
  Designer exits after Phase 1.

Phase 2 — reviewer (critique):
  SPAWN: Agent(subagent_type="reviewer", name="reviewer-<id>")
  Run /design-critique (score variants against 9-dim rubric, ≥7 to advance,
    max 4 rounds). Skip if no UI surface.
  Run /architecture-critique (score plan against 9-dim rubric, ≥7 to advance,
    max 3 rounds).
  True producer/evaluator separation — different agent reads the
  designer's output cold.
  Commit critique output (approved.md, critique doc) and push [skip ci].
  DO NOT let this agent exit — it will be reused in Phase 4.

Phase 3 — builder (TDD):
  SPAWN: Agent(subagent_type="builder", name="builder-<id>")
  Run /write-tests — reads the plan, writes failing tests for all ACs,
  commits + pushes. Do NOT write implementation code — requirement
  definition must not be contaminated by implementation thinking.

  SEND: SendMessage(to="builder-<id>") with /write-code.
  Builder reads the plan + failing tests; writes minimum code to pass.
  Runs bun run verify — must pass before pushing.
  If Builder hits a plan-vs-reality conflict, it raises a BLOCKER rather
  than redesigning in-flight (TE-22).

Phase 4 — review:
  SEND: SendMessage(to="reviewer-<id>") — reuses Phase 2 session.
  Same reviewer runs /review (warm on design/arch context).
    Six lenses: 3 positive (architecture, design, security) +
    3 negative (adversarial, simplification, slop) + AC completeness.
    Design lens skipped silently if no UI files.
    Emits DONE | NOT DONE with AC table + findings.

  SEND: SendMessage(to="builder-<id>") with findings.
  Builder applies findings; commits + pushes; runs bun run verify.

  Gate: if reviewer verdict is NOT DONE →
    SendMessage(to="builder-<id>") to fix, then
    SendMessage(to="reviewer-<id>") to re-review. Max 3 attempts.
  If DONE and PIPELINE_AB_MODE != 1 → flip draft PR ready (gh pr ready).
  In AB mode, leave the PR draft.

Phase 5 — retro:
  Launch Explore agent with /retro (ephemeral, no reuse needed).
  Writes docs/retro/<id>.md with cost signals the A/B harness reads.
```

### Loop rules

- If Builder raises BLOCKER: surface to Designer for plan amendment, then re-enter Phase 3. Max 3 attempts per story.
- If Reviewer verdict is NOT DONE: re-enter Phase 3 to fix the cited gaps. Max 3 attempts per story.
- If CI fails after a Builder push: Builder fixes locally and pushes again. Max 3 attempts per push series.
- If Reviewer's critique (`/design-critique` or `/architecture-critique`) fails to reach ≥7 after the cap: pause, mark `blocked` with reason `concept-or-spec-misalignment`. The concept itself may need upstream `/concept` work.

After Phase 5: set status to `done`. Move to next story.

---

## Why this is structured this way

### Adversarial principle preserved

Author / critic boundaries are enforced by persona separation: (a) the **designer** produces (`/design`, `/architecture`) and the **reviewer** evaluates (`/design-critique`, `/architecture-critique`) — different agents, true independence; (b) the same **reviewer** later reviews the code in Phase 4, already warm on the design/architecture decisions, applying both positive lenses (does it respect contracts?) and negative lenses (what would break it?). The reviewer's AC completeness audit enforces the one boundary that must not be inside any producer session — it reads a *live* PR against the spec, not Builder's notes about the PR.

### Why the reviewer does critique (not the designer)

The agent that created the design cannot objectively score it. Moving critique to the reviewer gives true producer/evaluator separation — different agents, not just a "cognitive mode switch" on the same agent. Bonus: the reviewer's Phase 2 context (design decisions, architecture contracts) carries into Phase 4's code review, so it arrives warm on the spec it's checking code against.

### Why /verify and /ship are gone (TE-21)

`bun run verify` is the same script regardless of who invokes it; CI runs it on every push. `/ship` was a wrapper around `gh pr create` and a CI-watch loop; the worktree setup creates the draft PR up front, every persona pushes incrementally, and Reviewer's DONE verdict flips it ready.

### Why /design's variant count is now conditional (TE-18)

Routine UI (existing component family, known layout) gets 1 variant + a "did we consider X / Y / Z" check. Genuinely novel UI gets 3. L1 / L2 / L3 primitives are always novel.

---

## Token Efficiency

- **Spawn once, message many.** Each agent is spawned exactly once per story with a stable name. Use `SendMessage` for all follow-up communication. Never re-spawn an agent that's still alive.
- **Incremental verification.** Builder uses `bun run check` (fast typecheck) after edits. Full `bun run verify` only before pushing.
- **Error output is capped.** The check/lint/test wrappers show max 10 files. Don't re-run hoping for different output — fix the shown errors first.

## Rules

- **Never stop after planning.** Architect is Phase 1. The plan isn't done until Builder makes it real and Reviewer approves.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked`.
- `.pipeline/progress/<id>.json` is the checkpoint for each story you own. Write it after every status/step change. Touch only files for the IDs in $ARGUMENTS — never anyone else's.

**Don't rationalize skipping personas:**
- "Concept work isn't done but I'll figure it out" → no. Fail fast with `blocked: concept-missing`; the founder runs `/concept` upstream.
- "The plan is done, I can stop" → planning is Phase 1 of 5. You haven't built anything yet.
- "This story is simple, skip the review" → simple stories have the highest skip rate and highest regression rate.
- "The reviewer is redundant, tests passed" → tests prove behavior, the reviewer proves the RIGHT thing was built against the spec, in *fresh context*. The boundary is the value.
- "The retro is navel-gazing" → without the cost signals it emits, the A/B harness can't prove block-1b actually saved tokens, and `/compound` can't propose the next round.

**When to skip `/design` + `/design-critique`:** the story has no UI surface (pure backend, schema, infra, concept-doc-only). Verify by reading the AC list — if no AC mentions a page, component, layout, route on the web side, or visible state, Designer skips `/design` and Reviewer skips `/design-critique`. When in doubt, run `/design` with `routine` classification; one variant is cheap and the brief serves as documentation.
