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

`.pipeline/work-packages/TRACK-<letter>.md` and `.pipeline/work-packages/dependency-graph.md` remain your reference for spec and dependency graph.

Record session start time.

---

## Pre-condition

The pipeline does NOT run `/concept`. Concept-locking is upstream founder work — what a Thread / Block / Artifact / Bet / Cost IS, what it ISN'T, what contracts it commits us to. Those decisions need founder input and don't fit an autonomous pipeline. Before launching the pipeline, the founder must have run `/concept <id>` for any story that introduces or reshapes a primitive — the relevant `docs/concept/*.md` section + `SHARED.md` "Shared Contracts" entry must exist. The pipeline reads them as fixed input.

If a workpackage is dispatched to the pipeline and `/concept` work is missing for a New / Reshaped noun, **fail fast**: mark the workpackage `blocked` with reason `concept-missing` and move on. Do not autonomously redefine concepts.

---

## For each story (any order within a batched group, sequential within yours)

Set status to `in_progress`. Run the worktree + draft-PR setup once, then dispatch the six phases.

### Worktree + draft-PR setup (TE-21)

```bash
# 1. Worktree
git worktree add .worktrees/<id> -b feat/<id>-<desc> main
cd .worktrees/<id> && npm install

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
| 5 — builder /write-docs | docs (concept essence + as-built) + `plans/` retirement | `[skip ci]` |
| 6 — Explore agent /retro | prose | `[skip ci]` |
| ship — builder /ship | attestation + progress file | run |

Local `npm run verify` is the gate. Builder runs it (check, lint:biome, lint:eslint, test, e2e — identical tools to CI) and must pass before pushing. On green, verify writes `.verify-attestation.json` (HMAC-signed with `~/.config/hyperidle/verify-secret`). Builder commits the attestation as the last commit before pushing. CI validates the attestation signature (~30s) instead of re-running the full suite (~10min). See `/ship` for the complete commit → verify → attestation → push flow.

Stories touching authentication, schema migrations, or `packages/server/src/agent-runtime/` set `gate: ci-required` in the workpackage spec; Reviewer holds the ready-flip until CI is green. Default for everything else is `gate: local-green`.

**Squash before flipping ready.** Builder squashes the persona-prose commits before `/ship` flips `gh pr ready`. Implementation commits stay atomic; prose commits collapse into one `chore(<id>): pipeline artifacts`. Squash at ship time, not before — the retro (Phase 6) still needs the per-phase history to extract cost signals.

**Commit at task boundaries in the green phase.** A large L/M full-stack green phase routinely exceeds one builder session (observed: U1, S1, AF8, AH5). The builder commits at every completed task boundary (`feat(<id>): task N — <desc>`), not only once at full green, so a session timeout never strands uncommitted work in the tree. For L workpackages whose task list is clearly larger than a single green-phase budget, split the green phase across builders by design — don't bank on one session.

**Builder-timeout resume protocol.** If a builder session times out mid-green, do NOT restart from scratch and do NOT finish its work yourself (orchestrator stays in role). Spawn builder #2 with: "Assess working-tree state (`git status`, `git log --oneline origin/main..HEAD`); the last `feat(<id>): task N` commit is your resume point; continue from task N+1; do not redo committed tasks." Builder #2 runs verify and continues the phase.

### Ship (after retro)

Ship runs AFTER retro so that the retro prose commit is included in the verified tree. If ship runs before retro, the retro commit invalidates the attestation (check-attestation rejects "source files changed after verify ran").

When Reviewer's `/review` pass emits `Verdict: DONE` (after fix cycle) and retro is complete:

1. **Mark progress done BEFORE ship.** Write `.pipeline/progress/<id>.json` with `status: "done"`, `currentStep: "shipped"`, `completedAt` set. This must happen before `/ship` pushes — ship will merge the PR, so the progress file must already reflect completion. The merge commit on main is proof that ship succeeded; no `6-ship` phase is tracked.
2. Builder commits all remaining code changes (including the progress file).
3. Builder runs `/ship <id>` — this merges `origin/main`, runs `npm run verify`, commits attestation, pushes, flips draft PR ready, and **waits for CI green**.
4. `/ship` is only complete when `gh pr checks` returns green. If CI is red, builder fixes and re-ships (max 3 attempts).

In A/B mode (`PIPELINE_AB_MODE=1`), the builder still runs `/ship` but skips `gh pr ready` — the PR stays draft for replay.

**Ship is the single gate.** The pipeline does not declare a workpackage done until `/ship` confirms CI green. No exceptions.

Then dispatch the persona sessions below, in order. Update `currentStep` in the progress file before each persona dispatch.

### The 6-phase pipeline

| Phase | Persona | Effort | Skills | Why |
|---|---|---|---|---|
| 1 | **designer** | high | `/concept` → `/design` → `/architecture` | Production only. Concept doc + variant exploration + technical plan. |
| 2 | **reviewer** + **designer** | high | `/design-critique` → `/architecture-critique` → designer revision loop | Evaluates designer output. If CRITICAL/WARNING findings, designer revises, reviewer re-critiques (max 3 rounds). Builder receives a clean, approved plan. Context carries to Phase 4. |
| 3 | **builder** | medium | `/write-tests` → `/write-code` | TDD red then green. Implementation only — no docs here. Must pass `npm run verify` before pushing. |
| 4 | **reviewer** + **builder** | high | `/review` + fix loop | Same reviewer from Phase 2 (warm on design/arch). 6 lenses + AC audit. Builder applies fixes; reviewer re-reviews. Reviews code, not docs (docs come next). Verdict DONE required before proceeding. |
| 5 | **builder** | medium | `/write-docs` | Print the concept essence + as-built implementation into `docs/`, then retire superseded `plans/<id>/` artifacts. Runs after review so docs describe the final, reviewed code. |
| 6 | **Explore** | low | `/retro` | Fresh-context retro with cost signals. Must run before ship so retro prose is included in the verified tree. |
| ship | **builder** | medium | `/ship` | Merge main → verify → attest → push → PR ready → CI green. Not a tracked phase — the merge commit on main is proof of completion. |
| — | scripts | — | CI + PR | `npm run verify --raw` runs as CI on every push. Draft PR opens at worktree setup; `/ship` flips ready + waits for CI green after retro. |

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
  DO NOT let the designer exit — it may be needed in Phase 2 to apply critique fixes.

Phase 2 — reviewer + designer (critique loop):
  SPAWN: Agent(subagent_type="reviewer", name="reviewer-<id>")
  Run /design-critique (score variants against 9-dim rubric). Skip if no UI surface.
  Run /architecture-critique (score plan against 9-dim rubric).
  True producer/evaluator separation — different agent reads the
  designer's output cold.

  If critique has CRITICAL or WARNING findings:
    SEND: SendMessage(to="designer-<id>") with the findings.
    Designer revises the plan/design to address each finding, commits + pushes.
    SEND: SendMessage(to="reviewer-<id>") to re-critique the revised plan.
    Repeat until score ≥ 7 or 3 rounds reached.
  The builder receives a clean, approved plan — not a plan + separate critique doc.

  Commit critique output (approved.md, critique doc) and push [skip ci].
  DO NOT let the reviewer exit — it will be reused in Phase 4.

Phase 3 — builder (TDD):
  Rebase check before coding: `git fetch origin main && git merge origin/main --no-edit`.
  Resolve conflicts now — don't let a stale base accumulate drift. (CC-017.)

  SPAWN: Agent(subagent_type="builder", name="builder-<id>")
  Run /write-tests — reads the plan, writes failing tests for all ACs,
  commits + pushes. Do NOT write implementation code — requirement
  definition must not be contaminated by implementation thinking.

  SEND: SendMessage(to="builder-<id>") with /write-code.
  Builder reads the plan + failing tests; writes minimum code to pass.
  Runs npm run verify — must pass before pushing.
  Implementation ONLY — no documentation work in this phase. Docs are
  Phase 5 (after review), so they describe the final, reviewed code.
  If Builder hits a plan-vs-reality conflict, it raises a BLOCKER rather
  than redesigning in-flight (TE-22).

Phase 4 — review (code) + fix loop:
  SEND: SendMessage(to="reviewer-<id>") — reuses Phase 2 session.
  Same reviewer runs /review (warm on design/arch context).
    Six lenses: 3 positive (architecture, design, security) +
    3 negative (adversarial, simplification, slop) + AC completeness.
    Design lens skipped silently if no UI files.
    Reviews CODE, not docs — docs are written next (Phase 5).
    Emits DONE | NOT DONE with AC table + findings.

  If NOT DONE:
    SEND: SendMessage(to="builder-<id>") with findings.
    Builder applies findings; commits + pushes; runs npm run verify.
    SEND back to reviewer for re-review. Max 3 attempts.

  If DONE: proceed to Phase 5 (write-docs).

Phase 5 — write-docs (builder):
  SEND: SendMessage(to="builder-<id>") with /write-docs.
  Builder prints the essence of the concept (plans/<id>/concept.md) and
  the AS-BUILT implementation back into docs/:
    - ground truth (docs/<topic>/) updated to match what shipped;
    - user-facing pages (docs/product/, docs/guides/user/) written per
      the /write-docs 15 principles, when the WP changed what a user
      sees/reads/does. If nothing user-facing changed, say so in the
      commit message — but still do the retirement below.
  Then RETIRE superseded planning artifacts: delete plans/<id>/ files
  whose durable content now lives in docs/ or the shipped code (git
  history preserves them). Do NOT touch retro output (Phase 6, not yet
  written) or non-WP research under plans/reviews/.
  Commits + pushes [skip ci]. Runs after review so docs reflect the
  final reviewed code.

Phase 6 — retro:
  Launch Explore agent with /retro (ephemeral, no reuse needed).
  Writes plans/<id>/retro.md with cost signals the A/B harness reads.
  Commits and pushes with [skip ci].
  Must complete BEFORE ship — retro prose must be in the tree
  when /ship runs verify, otherwise the attestation is invalidated
  by the post-verify retro commit.

Ship (after retro — not a tracked phase):
  BEFORE dispatching /ship, update .pipeline/progress/<id>.json:
  set status to "done", currentStep to "shipped", completedAt to
  now. No "6-ship" phase entry — the merge commit on main is
  proof of completion. This must happen before /ship pushes,
  otherwise the progress update never lands on main.

  SEND: SendMessage(to="builder-<id>") with /ship <id>.
  Builder runs /ship: merges origin/main, runs npm run verify,
  commits attestation, pushes, flips PR ready (unless AB mode),
  and waits for CI green. If CI red, builder fixes and re-ships
  (max 3 attempts). /ship is not done until CI green.
```

### Loop rules

- If Builder raises BLOCKER: surface to Designer for plan amendment, then re-enter Phase 3. Max 3 attempts per story.
- If Reviewer verdict is NOT DONE: Builder applies the cited fixes in the Phase 4 loop, reviewer re-reviews. Max 3 attempts per story.
- If CI fails after a Builder push: Builder fixes locally and pushes again. Max 3 attempts per push series.
- If Reviewer's critique (`/design-critique` or `/architecture-critique`) fails to reach ≥7 after the cap: pause, mark `blocked` with reason `concept-or-spec-misalignment`. The concept itself may need upstream `/concept` work.

After ship: verify CI is green (already asserted by /ship). Move to next story.

### Final summary to the human (outcome-first)

When the batch is done/blocked, write ONE summary for the human. Lead with **what was built and what they can now do** — the pipeline mechanics are not the story. The human skim-reads this to know what shipped and decide what to merge.

Per workpackage, 2–4 lines:
- **What now exists / works** — user-visible outcome in plain words (not the workpackage ID/title verbatim).
- **Key surfaces** — 3–5 files/pages/routes touched.
- **Status** — `PR #N · CI green · ready to merge`, or `blocked: <plain reason>`.

For a batch, a one-line lead ("3 of 4 shipped; AF12 blocked on …") then the per-WP lines.

Do **not** report: phase numbers, persona names, critique scores, review-round counts, attestation internals, verify tool lists. Keep it scannable. (Mirrors `/ship` step 7b.)

---

## Why this is structured this way

### Adversarial principle preserved

Author / critic boundaries are enforced by persona separation: (a) the **designer** produces (`/design`, `/architecture`) and the **reviewer** evaluates (`/design-critique`, `/architecture-critique`) — different agents, true independence; (b) the same **reviewer** later reviews the code in Phase 4, already warm on the design/architecture decisions, applying both positive lenses (does it respect contracts?) and negative lenses (what would break it?). The reviewer's AC completeness audit enforces the one boundary that must not be inside any producer session — it reads a *live* PR against the spec, not Builder's notes about the PR.

### Why the reviewer does critique (not the designer)

The agent that created the design cannot objectively score it. Moving critique to the reviewer gives true producer/evaluator separation — different agents, not just a "cognitive mode switch" on the same agent. Bonus: the reviewer's Phase 2 context (design decisions, architecture contracts) carries into Phase 4's code review, so it arrives warm on the spec it's checking code against.

### Why /ship runs after retro

`/ship` owns the full sequence: merge main → verify → attest → push → PR ready → CI green. It runs after retro (Phase 6) so that the retro prose commit is included in the verified tree. If ship ran before retro, the retro commit would invalidate the attestation — check-attestation rejects "source files changed after verify ran." This ordering was learned from U8 where the post-ship retro commit caused three CI failures and required a full re-verify cycle (~12 minutes).

`/ship` exists as a separate skill because the sequence is error-prone (attestation conflicts from stale main, dirty tree, CI divergence) and must be followed exactly. The pipeline delegates to `/ship` rather than inlining this logic because every inline attempt has produced a different subset of the steps.

### Why /design's variant count is now conditional (TE-18)

Routine UI (existing component family, known layout) gets 1 variant + a "did we consider X / Y / Z" check. Genuinely novel UI gets 3. L1 / L2 / L3 primitives are always novel.

---

## Token Efficiency

- **Spawn once, message many.** Each agent is spawned exactly once per story with a stable name. Use `SendMessage` for all follow-up communication. Never re-spawn an agent that's still alive.
- **Incremental verification.** Builder uses `npm run check` (fast typecheck) after edits. Full `npm run verify` only before pushing.
- **Error output is capped.** The check/lint/test wrappers show max 10 files. Don't re-run hoping for different output — fix the shown errors first.

## Rules

- **Never stop after planning.** Architect is Phase 1. The plan isn't done until Builder makes it real and Reviewer approves.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked`.
- `.pipeline/progress/<id>.json` is the checkpoint for each story you own. Write it after every status/step change. Touch only files for the IDs in $ARGUMENTS — never anyone else's.

**Don't rationalize skipping personas:**
- "Concept work isn't done but I'll figure it out" → no. Fail fast with `blocked: concept-missing`; the founder runs `/concept` upstream.
- "The plan is done, I can stop" → planning is Phase 1 of 6. You haven't built anything yet.
- "This story is simple, skip the review" → simple stories have the highest skip rate and highest regression rate.
- "The reviewer is redundant, tests passed" → tests prove behavior, the reviewer proves the RIGHT thing was built against the spec, in *fresh context*. The boundary is the value.
- "The retro is navel-gazing" → without the cost signals it emits, the A/B harness can't prove block-1b actually saved tokens, and `/compound` can't propose the next round.

**When to skip `/design` + `/design-critique`:** the story has no UI surface (pure backend, schema, infra, concept-doc-only). Verify by reading the AC list — if no AC mentions a page, component, layout, route on the web side, or visible state, Designer skips `/design` and Reviewer skips `/design-critique`. When in doubt, run `/design` with `routine` classification; one variant is cheap and the brief serves as documentation.
