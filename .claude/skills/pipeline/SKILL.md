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

Set status to `in_progress`. Run the worktree + draft-PR setup once, then dispatch the four persona phases.

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
  --body "Pipeline run for <id>. Each persona commits its output. Cold DoD flips ready (unless PIPELINE_AB_MODE=1)."
```

### Continuous-commit rule (TE-21)

Each persona phase **commits its output and pushes** before returning:

| Phase | What gets committed | CI? |
|---|---|---|
| designer — concept-read / brief.md | prose only | `[skip ci]` |
| designer — approved.md (UI stories) | design artifacts | `[skip ci]` |
| designer — plan | plan doc | `[skip ci]` |
| builder — Mode 1 (failing tests) | test files | run |
| builder — Mode 2 (code) | implementation | run |
| builder — Mode 3 (apply-review fixes) | one commit per applied finding batch | run |
| researcher — retro doc | prose | `[skip ci]` |

CI is the verify gate. There is no `/verify` skill anymore. Builder runs `bun run check && bun run lint && bun run test` locally for fast iteration; CI is the authoritative pass/fail.

**Squash before flipping ready.** Builder squashes the persona-prose commits before Researcher's APPROVED triggers `gh pr ready`. Implementation commits stay atomic; prose commits collapse into one `chore(<id>): pipeline artifacts`. Squash at flip time, not before — Researcher's retro mode still needs the per-phase history to extract cost signals.

### Ready-flip (replaces /ship)

When Researcher's DoD pass emits `Verdict: APPROVED`:

```bash
if [ "${PIPELINE_AB_MODE:-0}" = "1" ]; then
  echo "[AB] Researcher (DoD) approved — leaving PR draft for replay"
else
  gh pr ready
fi
```

In A/B mode the PR stays draft so the run is replayable; the harness compares cost signals across replays without `gh pr merge` destroying the comparison. Outside A/B mode the human still owns `gh pr merge` — pipeline stops at "ready PR with green CI", same boundary as the prior `/ship` skill.

### CI failure handling (replaces /verify retry loop)

If CI is red after a Builder push:

1. Builder pulls the failure log via `gh pr checks <pr-number>`.
2. Builder fixes locally; runs `bun run check && bun run lint && bun run test` until green.
3. Pushes again. CI re-runs.
4. Max 3 push series. After 3, mark `blocked` with reason `ci-red-after-3-fixes`.

Then dispatch the persona sessions below, in order. Update `currentStep` in the progress file before each persona dispatch.

### The 5-persona graph (collapsed from the prior 17-step pipeline)

| # | Persona | Effort | Absorbed skills | Why |
|---|---|---|---|---|
| 1 | **designer** | high | `/concept` (read), `/design`, `/architecture` | Concept doc + variant exploration + technical plan in one durable session, with same-session critique mode-switches (no separate `/design-critique` or `/architecture-critique` — TE-17 dropped them). Spawns the **adversary** once during `/architecture` to challenge the plan. |
| 2 | **builder** | medium | `/write-tests`, `/write-code`, `/apply-review` | TDD red/green + apply-review-fixes inside one session. The previous developer-vs-qa split is now an internal mode. Builder fans out to **reviewer** + **adversary** in parallel post-green-tests. |
| W1 | **reviewer** | high | `/architecture-review`, `/design-review`, `/security-review` | Three positive-lens findings blocks (arch / design / sec) in one fresh-context session. Findings-only, depth-1, no sub-spawning. |
| W2 | **adversary** | medium | `/slop-scan`, `/simplification-scan`, `/adversary-review` | Three negative-lens findings blocks (slop / simplification / adversarial-with-hostile-personas: Saboteur / New Hire / Auditor). Findings-only, depth-1. Also spawned during designer's `/architecture` mode to challenge the plan. |
| 3 | **researcher** | low | `/check-definition-of-done`, `/retro` | Two-mode persona. Mode 1: fresh-context Cold DoD audit of the live PR — the one boundary that must not collapse into any producer session. Mode 2: retro that emits the cost signals the A/B harness and the compound agent read. |
| — | scripts | — | verify, ship | `bun run verify` runs as CI on every push (TE-21 dropped `/verify`). Draft PR opened at worktree setup; `gh pr ready` flips on Researcher's DoD APPROVED (TE-21 dropped `/ship`). In `PIPELINE_AB_MODE=1`, the ready-flip is suppressed so the run can be replayed. |

**Durable agent sessions per story: 3** (designer + builder + researcher). Plus 2 fresh-context findings sessions (reviewer + adversary) spawned by builder in parallel. Plus 1 in-flight adversary spawn during designer's `/architecture` mode. Plus scripts.

---

## Persona dispatches — what to invoke

For each persona phase, spawn a sub-agent of the named type. The persona prompt encodes its own scope; do NOT re-state it here.

```
Phase 1 — designer:
  spawn agent type=designer.
  Designer runs Mode 1 (concept read), Mode 2 (design with Phase 0a
  routine/novel classifier — 1/2/3 variants, in-session critique to
  score≥7 max 4 rounds), Mode 3 (architecture with in-session critique
  to score≥7 max 3 rounds). During Mode 3, designer spawns the adversary
  ONCE for plan-challenge before scoring.
  Designer commits each mode's output (brief, approved.md, plan) and
  pushes (prose commits use [skip ci]).

Phase 2 — builder:
  spawn agent type=builder. Builder reads the plan; writes failing tests
  (Mode 1); commits + pushes; writes code (Mode 2); commits + pushes; runs
  bun run check && bun run lint && bun run test locally; on green, spawns
  reviewer + adversary in parallel; collects their TOON findings; applies
  them (Mode 3); commits + pushes. If Builder hits a plan-vs-reality
  conflict, it raises a BLOCKER rather than redesigning in-flight (TE-22).

Phase 2 fan-out — reviewer + adversary (parallel, depth-1, findings-only):
  spawn agent type=reviewer    (architecture / design / security lenses,
                                3 TOON blocks; design lens skipped silently
                                if no UI files)
  spawn agent type=adversary   (slop / simplification / adversarial lenses,
                                3 TOON blocks; adversarial lens runs all 3
                                hostile-persona passes — Saboteur, New Hire,
                                Auditor — in one block)

Phase 3 — researcher (Mode 1: Cold DoD):
  spawn agent type=researcher in fresh context with /check-definition-of-done.
  Researcher reads gh pr view + the spec + the plan and emits
  APPROVED | BLOCKED with an AC table.
  If BLOCKED → back to Phase 2 (max 3 attempts per story).
  If APPROVED and PIPELINE_AB_MODE != 1 → flip draft PR ready
  (`gh pr ready`). In AB mode, leave the PR draft.

Phase 4 — researcher (Mode 2: retro):
  re-spawn agent type=researcher with /retro. Writes docs/retro/<id>.md
  with the cost signals the A/B harness reads.
```

### Loop rules

- If Builder raises BLOCKER: surface to Designer for plan amendment, then re-enter Phase 2. Max 3 attempts per story.
- If Researcher's DoD blocks: re-enter Phase 2 to fix the cited gaps. Max 3 attempts per story.
- If CI fails after a Builder push: Builder fixes locally and pushes again. Max 3 attempts per push series.
- If Designer's in-session critique fails to reach ≥7 after the cap: pause, mark `blocked` with reason `concept-or-spec-misalignment`. The concept itself may need upstream `/concept` work.

After Phase 4: set status to `done`. Move to next story.

---

## Why this is structured this way

### Adversarial principle preserved

Author / critic boundaries that matter live as either (a) **mode prompts inside Designer** for the plan / design own-critique, plus a single in-flight **adversary** spawn for plan-challenge, or (b) **fresh-context reviewer + adversary** spawned by Builder for code review. Researcher's Mode-1 DoD enforces the one boundary that must not be inside any producer session — it reads a *live* PR, not Builder's notes about the PR.

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
- "The plan is done, I can stop" → planning is Phase 1 of 4. You haven't built anything yet.
- "This story is simple, skip the reviewer + adversary fan-out" → simple stories have the highest skip rate and highest regression rate.
- "Researcher's DoD is redundant, tests passed" → tests prove behavior, DoD proves the RIGHT thing was built against the spec, in *fresh context*. The boundary is the value.
- "Researcher's retro is navel-gazing" → without the cost signals it emits, the A/B harness can't prove block-1b actually saved tokens, and the compound agent can't propose the next round.

**When Designer can skip Mode 2 (`/design`):** the story has no UI surface (pure backend, schema, infra, concept-doc-only). Verify by reading the AC list — if no AC mentions a page, component, layout, route on the web side, or visible state, skip Mode 2 and go straight to Mode 3 (`/architecture`). When in doubt, run `/design` with `routine` classification; one variant is cheap and the brief serves as documentation.
