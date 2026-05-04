# Token Efficiency — Overview

**Goal.** Materially cut per-story token volume, cost, and wall-clock without weakening autonomy or validation gates. We don't claim a percentage in advance — we measure it.

**Validation rule (replaces all $-savings estimates anywhere in this folder).** Every block is judged by **parallel A/B**: same story, same SHA, same model frontmatter except the variable under test, run twice in worktrees, compared on total tokens / wall-clock / AC pass rate. **Ship rule:** ≥10% improvement on cost or wall-clock with **no AC regression**, observed on at least **3 stories of mixed complexity** (S / M / L). <10% deltas are noise; we don't chase them.

**Tool-agnostic.** Every change targets artifacts that travel between agent systems — `CLAUDE.md` / `AGENTS.md` / `SKILL.md` / agent role definitions / `package.json` scripts / hook scripts as repo files. We may move from Claude Code to Hermes, OpenCode, or another harness; nothing here should require a specific runtime.

**Packaging rule.** Every script lives in exactly one of two places:
- **Global** — root `package.json` script (`bun run <name>`). Use when ≥2 skills or personas need it.
- **Skill-local** — `.claude/skills/<skill>/<helper>.ts` invoked via `bun .claude/skills/<skill>/<helper>.ts`. Use when one skill owns it.

No `bin/` zoo. No drive-by `packages/`.

---

## Round 1 setup (live)

- **Locked baseline SHA:** `9d44305` (post-`chore/drop-langfuse-stack` merge — first SHA where `bun run obs:env` works against the DuckDB collector).
- **First A/B story:** **L15** (strip drag/drop from Kanban, M, ~3d).
- **Block branches** (off `9d44305`): `block-1a-plumbing`, `block-1b-structure`, `block-2-state-hooks`, `block-4-docs`, `block-6-search`.
- **Arm worktrees** (`.worktrees/L15-<arm>` → branch `ab/L15-<arm>`):
  - `L15-baseline` ← `9d44305`
  - `L15-1a`, `L15-1b`, `L15-2`, `L15-4`, `L15-6` ← respective block branches
- **Note on 1b:** the original plan deferred 1b to Round 2 because TE-21 (drop `/verify` skill) depends on TE-3 (`scripts/verify.ts`) shipping in 1a. Running 1b in parallel off the locked SHA is fine for *measurement* — we just A/B 1b vs. baseline directly. The TE-21 work inside 1b stays blocked until 1a's `scripts/verify.ts` lands; until then, 1b's branch carries only the structural changes (TE-7/17/18/19/22) that don't need it.
- **Per-run flow** (interactive Claude session per worktree — `bin/pipeline` is the Docker harness, not used here):
  ```bash
  cd .worktrees/L15-<arm>
  source <(bun run obs:env --ab=L15 --variant=<arm>)   # MUST be before `claude` so the env is inherited
  claude                                                # drive the story interactively (/concept → /architecture → /implement → /ship)
  ```
  `obs:env` sets `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_RESOURCE_ATTRIBUTES=…,ab.test=L15,ab.arm=<arm>`. Claude inherits these at launch and tags every span. `/ship` lands a green PR but does not merge.
- **Re-run an arm:** close the PR, `git reset --hard <branch>` in the worktree, re-source the env, relaunch `claude`.

## Status

- **Block 0 — Observability Floor.** **Done.** OTel → LangSmith with `hyperidle.*` span attributes. Step-efficiency metric in retro ledger. This is the substrate every A/B reads off; it is not itself A/B'd.
- **Block 1a — Plumbing** (per-turn cost). Round 1, parallel.
- **Block 1b — Structure** (session-count cost). Round 2, against post-round-1 baseline.
- **Block 2 — State via hooks** (durable surface, hook-injected). Round 1, parallel.
- **Block 3 — Model routing.** Folded into 1b as a frontmatter scaffold (all `opus` for now). Activated as a parameter flip in a later step, not a separate block A/B in round 1.
- **Block 4 — Docs & caching topology.** Round 1, parallel.
- **Block 5 — Iteration discipline.** Folded into 1a; not a separate block.
- **Block 6 — Search & static helpers.** Round 1, parallel.
- **Block 7 — Single-shot mode.** Deferred — needs harness rework, A/B'd against the fully-shipped baseline.

---

## Persona matrix — the frame for everything else

The right unit is not "skill" or "session." It's **persona**: a contiguous run of atomic actions where two answers stay constant.

- **Does previous context HELP, NOT MATTER, or HURT this action?**
- **What brain power does this action need?** (high / medium / low / none-script)

A persona switch is justified when *either* axis flips.

|                              | **Context HELPS** | **Context NEUTRAL** | **Context HURTS (need fresh)** |
|---|---|---|---|
| **High brain (Opus-class)** | concept, design synthesis, architecture, DoD final judgment | — | DoD audit (cold), adversarial-with-hostile-personas |
| **Medium brain (Sonnet-class)** | apply-review-fixes, retro synthesis | architecture-review, security-review, design-review (compares to plan) | adversarial-reviewer (Saboteur/New Hire/Auditor) |
| **Low brain (Haiku-class)** | exploration summaries, AC mapping | scans (slop, simplification), file lookups, doc anchor reads | — |
| **None (script)** | — | verify, ship, route-check, AC-coverage, brief-write, diff-summary | — |

**Personas that fall out of the matrix:**

1. **Architect** — high brain, long context. concept → design → architecture, with self-critique as same-session mode-switch.
2. **Builder** — medium brain, long context (forked from Architect's brief). write-tests → write-code → apply-review-fixes. TDD as one rhythm; tests come from the *plan*, not Builder intuition.
3. **Reviewers** — medium brain, parallel × 4, fresh context per worker, findings-only. Architecture / security / design (NEUTRAL) plus adversarial with hostile personas (HURTS).
4. **Cold DoD** — high brain, fresh context. Reads live PR. Approves or blocks. Doesn't write code.
5. **Reflector** — medium brain, fresh light context. Reads ledger + PR comments. Doesn't write code.
6. **Scripts** — no agent. verify (CI on every push), ship (continuous commit, no separate session), brief-write, diff-summary, ac-coverage, route-check.

Total durable agent sessions per story: 4 (Architect, Builder, Cold DoD, Reflector). Plus parallel Reviewer workers. Plus scripts.

Every block tunes one of these personas, the artifacts they read, the scripts they call, or the model they run on.

---

## Waste signatures we are attacking

1. `/design-critique` and `/architecture-critique` run redundantly — those critiques already run *inside* `/design` and `/architecture`. → Block 1b.
2. 3 scans + 3 reviews are separate sessions even though they read the same files. → Block 1b.
3. `/verify` is a skill instead of a script + CI. → Block 1a (script) + Block 1b (drop the skill, wire CI).
4. `/design` always emits 3 variants even when the story is a routine restyle. → Block 1b.
5. Every session re-caches a near-identical preamble (CLAUDE.md / AGENT.md / SKILL.md / story / plan). → Block 4 + Block 2.
6. File reads inflate by ~26% with ~71% within-session repeats (OpenWolf). → Block 4.

---

## A/B harness — how blocks are run

Each block ships behind a worktree-level toggle and is run as a parallel A/B against an unmodified baseline.

**Mechanics.**
- Pick 3 stories of mixed complexity (S / M / L) from the upcoming queue.
- For each story: spin two worktrees from the same `main` SHA, same target spec, same model frontmatter except for the variable under test. Run both pipelines start to finish. Both pinned to the same Anthropic snapshot — no model drift between arms.
- Record per arm: total tokens (cache-read / cache-write / output broken out), wall-clock per persona phase, AC pass/fail, rework loops, blocker rate. All read from Block 0's OTel stream.
- Tag every span with `hyperidle.experiment.arm` so LangSmith can group runs.
- Worktree naming: `.worktrees/<story-id>-<arm>` so parallel arms don't collide.

**No-merge mode.** `.claude/skills/ship/SKILL.md` runs `gh pr merge --delete-branch` at the end. For repeatable A/Bs we need a `PIPELINE_AB_MODE=1` env flag that gates the merge step — pipeline runs to PR-ready, stops, leaves the branch alive for replay.

**Lock the baseline SHA.** All variant branches forked from the same `main` SHA at experiment-start. If `main` keeps moving during the experiment, baselines drift and runs aren't comparable.

**A/B is directional, not statistical.** Hunting 10–20% deltas; a few percent is noise we ignore.

**Ship rule per block.**
1. Total spend (or wall-clock) ≥10% lower in the variant arm,
2. AC pass rate ≥ baseline,
3. No new failure modes introduced (rework loops, blocker rate not materially worse).

If only 1 or 2 of 3 stories show the delta, expand to 5 stories. If still mixed, the block doesn't ship as-is — pull it apart and A/B the constituents separately, or shelve it.

---

## Round 1 — parallel cohort

Four branches off one frozen `main` SHA. Each tested independently against `main`. Independent contributions; combined effect not summable (final combined A/B captures the stack).

| Branch | Block | Lever | Risk |
|---|---|---|---|
| `block-1a-plumbing` | 1a | Per-turn cost (verify orchestrator, parallel tools, TOON progress) | Low |
| `block-2-state-hooks` | 2 | Cache writes (state injected via hooks, no agent reads) | Medium |
| `block-4-docs` | 4 | Cache reads (skill diet + doc split + read-dedup) | Medium-High |
| `block-6-search` | 6 | Cache reads + iteration count (LSP via MCP, search dispatch) | Medium |

Run each across 3 stories. Land winners. Open question: SKILL.md merge conflicts between 1a/1b/4 — expected; resolve in merge order.

## Round 2 — block 1b against post-round-1 baseline

Persona collapse, drop redundant critique, design variant gating, continuous commit, plan-execute discipline, model frontmatter scaffold (all values `opus`).

A/B'd against the merged-round-1 baseline, **not** against original `main`. Otherwise we double-credit shared token pools.

## Round 3 — model flip (Block 3 activation)

Frontmatter `model:` values flip from `opus` to `sonnet` / `haiku` per persona. Stricter ship rule: rework rate ≤ Opus +5pp AND total spend ≥10% lower. Otherwise revert.

## Later — Block 7 single-shot

A/B'd against the fully-shipped baseline, on the qualifying subset only. Classifier false-positive rate must be measurable; on false-positive the story is re-routed through the regular pipeline and counted as a *cost* against single-shot's savings, not absorbed silently.

---

## What the A/B will **not** tell you

The A/B measures cost and AC-pass. It does **not** measure architectural drift, code-quality drift, or downstream review burden — and these are exactly what Block 1b's plan-execute rule and Block 7's single-shot bypass put at risk. **Supplement the A/B with a retro pass at the end of each story comparing diff quality between arms by hand**, at least for the first 5 Round-3 stories and the first 5 Block-7 stories. If you only trust the cost number, you will convince yourself the cheap arm won and ship a slow erosion of code quality.

---

## Files referenced (absolute paths)

- `/Users/tobiasgrundmann/Development/hyperidle/packages/shared/src/toon-codec.ts` — codec
- `/Users/tobiasgrundmann/Development/hyperidle/packages/pipeline/src/runner.ts` — Block 0 instrumentation site
- `/Users/tobiasgrundmann/Development/hyperidle/packages/pipeline/src/progress.ts` — TE-5 migration target
- `/Users/tobiasgrundmann/Development/hyperidle/.pipeline/` — durable state directory
- `/Users/tobiasgrundmann/Development/hyperidle/.claude/skills/` — 27 skill directories
- `/Users/tobiasgrundmann/Development/hyperidle/.claude/skills/ship/SKILL.md` — gate the merge step on `PIPELINE_AB_MODE=1`
- `/Users/tobiasgrundmann/Development/hyperidle/bin/pipeline` — worktree setup target

---

## Per-block files

- [block-1a-plumbing.md](./block-1a-plumbing.md) — verify orchestrator, reporters, parallel tool calls, TOON progress
- [block-1b-structure.md](./block-1b-structure.md) — persona collapse, drop redundant critique, design gating, continuous commit, plan-execute, model frontmatter scaffold
- [block-2-state-hooks.md](./block-2-state-hooks.md) — briefs, story memory, review files, pre-fetch — all hook-injected
- [block-4-docs.md](./block-4-docs.md) — skill diet, doc split + anchor reader, caching prefixes, read-dedup
- [block-6-search.md](./block-6-search.md) — search dispatch, AC coverage, TS LSP via MCP
- [block-7-singleshot.md](./block-7-singleshot.md) — deferred — pipeline-bypass for known patterns
