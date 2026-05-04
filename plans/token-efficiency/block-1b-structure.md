# Block 1b — Structure (session-count cost)

**Cohort:** Round 2, A/B'd against post-round-1 baseline.
**Includes:** TE-7, TE-17, TE-18, TE-19-scaffold, TE-21, TE-22.

---

## Load-bearing claim

*Persona — not skill, not session — is the right unit of session boundary. The pipeline's 17-skill choreography is mostly cache-write tax masquerading as adversarial discipline.* The author/critic boundary that actually matters (Cold DoD reads the live PR; adversarial Reviewers run hostile personas in fresh context) is preserved, while the boundaries that don't matter (design vs. design-critique as separate skills) collapse into intra-session mode-switches.

If this claim is wrong (collapsed handoffs lose information that briefs cannot restore; mode-switching loses the adversarial signal), the cheapest manifestation is rework loops. The expensive failure is wrong code shipping past Cold DoD because the session boundary that should have caught it was collapsed.

## Value lever

This block primarily attacks **cache writes** and **cross-session preamble re-caching**:
- Redundant critique skills (TE-17) — fewer cold sessions.
- Scans + reviews as separate sessions (TE-7's Reviewer fan-out collapses into one Builder-spawned worker fan-out).
- `/verify` as a skill (TE-21) — drops two sessions.
- 17 cold starts → 4 (TE-7).

Output savings on `/design` (TE-18) hit a different bucket — output tokens — but the lever is the same: stop emitting work the spec doesn't justify.

## Risk profile

- **System complexity:** High. Pipeline graph rewrite, four new persona definitions, draft-PR / continuous-commit setup, `bin/pipeline` changes. Multiple SKILL.md deletions and edits. One-way: rolling back means restoring deleted skills *and* unwinding worktree-level commit logic.
- **Info-loss risk:** Medium-High. Collapsed handoffs depend on Block 2 briefs / memory being right (Block 2 is parallel in round 1, so 1b lands when Block 2 has either won or been replaced with a stripped fallback). TE-18 misclassification ships unexplored UI. The author / critic boundaries that *do* matter (Cold DoD, adversarial Reviewers) survive only because the prompts encode them; subtle prompt regressions silently lose adversarial discipline.
- **Compounds with:** Block 2 (briefs / memory make the persona collapse safer), Block 1a (TE-21 needs the verify orchestrator script), Round 3 (personas are the routing unit for the model flip).

## Dependencies

- **Upstream:** Block 1a merged — TE-21 needs `scripts/verify.ts`. Block 2 ideally merged — TE-7's persona collapse is information-lossless when briefs / memory exist; without them, 1b still ships but with smaller savings (personas re-read raw artifacts the way the current pipeline does).
- **Downstream:** Round 3 (model flip) is only tractable once personas are crisp. Block 7 single-shot needs a cheap, well-instrumented full pipeline as the fallback.

## Shippability

Large. One-way on the pipeline graph (going back means restoring 4 deleted skills + reverting `bin/pipeline` worktree changes). Measurable via Block 0's per-persona cost dashboard.

---

## TEs

### TE-7 — Pipeline 17 steps → 4 personas (+ workers + scripts)

Edit `.claude/skills/pipeline/SKILL.md`. The grouping isn't by skill, it's by persona from the matrix in [README.md](./README.md). Each persona gets one durable session; reviewers fan out as parallel workers; mechanical work is scripts.

| # | Persona | Steps absorbed | Notes |
|---|---|---|---|
| 1 | **Architect** | 0 + 1 + 2 + 3 + 4 | concept → design → architecture, with critique as same-session mode-switch. Drops `/design-critique` and `/architecture-critique` as separate skills (TE-17). |
| 2 | **Builder** | 5 + 6 + 9 + 14 + 14b | write-tests → write-code → apply-review-fixes. QA-vs-developer is a prompt mode within the persona; tests are derived from the plan (not intuition), so the rule survives. |
| W1–W4 | **Reviewers** (parallel workers, findings-only) | 7 + 8 + 10 + 11 + 12 + 13 | Spawned by Builder via the runtime's sub-agent primitive. Each returns ONE TOON findings block. Adversarial worker uses hostile personas (Saboteur / New Hire / Auditor). Hard cap: depth-1, ≤4 parallel. Cap named in the persona prompt itself, not in the harness config — so it travels. |
| 3 | **Cold DoD** | 15 | Fresh context. Reads live PR. Approves or blocks. Doesn't write code. |
| 4 | **Reflector** | 17 | Reads ledger + `gh pr view`. Light. |
| — | Scripts | 15b + 16 | `verify` runs as CI on every push (no skill). `ship` is continuous commit + auto-PR (TE-21), no separate session. |

**Total durable agent sessions per story: 4.** Plus 4 parallel Reviewer workers. Plus scripts.

**Adversarial principle preserved.** Author / critic boundaries that matter live as mode prompts inside Architect (concept / design / arch self-critique) or as fresh-context Reviewer workers (multi-perspective code review). Cold DoD enforces the one boundary that must not be inside any session.

### TE-17 — Drop redundant pipeline steps

The L10 data confirmed two skills run twice:
- `/design` already runs design-critique internally → drop `/design-critique` from `.claude/skills/pipeline/SKILL.md` step 2.
- `/architecture` already runs adversary internally → drop `/architecture-critique` from step 4.

If a critique loop is needed, it lives *inside* the producer skill (mode switch in the same session). Cheap, in-cache, no second cold start.

**Effort:** pure spec edit, 10 minutes. Lowest-risk item to ship.
**Risk:** losing iteration count tracking ("up to 3× until score ≥7"). **Mitigation:** the producer skill keeps the loop counter in its own brief output.

### TE-18 — `/design` variant gating by novelty

`/design` is consistently among the most expensive single skills because it always emits 3 variants. For routine UI (existing component family, known layout), 1 variant + a "did we consider X, Y, Z" check is sufficient. For genuinely novel UI (new pattern, new affordance), 3 variants stays.

Edit `.claude/skills/design/SKILL.md`: add a Phase 0 that classifies the story as `routine | novel` based on (a) does the spec reference an existing component, (b) is there a similar pattern in `packages/design-system/html/`. `routine` → 1 variant. `novel` → 3 variants.

**Risk:** misclassification skips exploration on something that needed it. **Mitigation:** the design-critique mode within `/design` (now part of `/design` itself per TE-17) flags low-confidence routine classifications and triggers a 2-variant fallback. A/B should pair routine-UI stories specifically; novel-UI stories aren't where this lever shows up.

### TE-19-scaffold — Model frontmatter (all `opus`, parameter for later)

Add `model: <class>` frontmatter to each `.claude/agents/<persona>/AGENT.md` and `.claude/agents/<role>/AGENT.md` for Reviewer workers and the Explorer. **All values are `opus`** in this round. The scaffold lands here so the Round 3 model flip is a parameter change, not a code change.

| Persona | Round 1b value | Round 3 target |
|---|---|---|
| Architect | `opus` | `opus` |
| Builder | `opus` | `sonnet` |
| Reviewer (arch / security / design) | `opus` | `sonnet` |
| Reviewer (adversarial-with-hostile-personas) | `opus` | `opus` |
| Cold DoD | `opus` | `opus` |
| Reflector | `opus` | `sonnet` |
| Explorer worker | `opus` (or omit if no Explorer this round) | `haiku` |

**Tool-agnostic:** name *classes* (`opus | sonnet | haiku`) — let a small adapter map class → harness-specific model ID. Frontmatter travels across Claude Code, OpenCode, Hermes.

### TE-21 — Continuous commit + ship-as-no-op

The pipeline already creates a worktree and branch in `bin/pipeline` setup. Extend this:

1. Open a **draft PR** at worktree setup (`gh pr create --draft --title "feat: <id> WIP"`).
2. Each persona phase commits its output (`git commit -am "<persona>: <phase summary>"`).
3. Builder pushes after each commit. PR auto-updates. CI runs on every push.
4. `/verify` skill is dropped — CI is verify (uses TE-3's `bun run verify` from Block 1a).
5. `/ship` skill is dropped — `gh pr ready` flips draft to ready when Cold DoD approves.
6. **A/B mode:** when `PIPELINE_AB_MODE=1`, the final `gh pr ready` / merge step is suppressed so the run can be replayed.

**Risk:** noisy commit history if every persona commits prose work. **Mitigation:** Builder squashes its commits before flipping the PR ready (`git rebase --interactive` or `gh pr merge --squash` at merge time). Prose-only commits use `[skip ci]` to avoid burning CI on plan locks / brief writes.

### TE-22 — Plan-and-execute discipline in persona prompts

ICML 2024 result: plan-and-execute is **3.6× faster than ReAct** because the plan is one expensive call and execution is mechanical. The Architect → Builder handoff *is* plan-and-execute *only if Builder is forbidden to re-plan*.

Add to Builder's persona prompt verbatim: "**Execute the locked plan mechanically. If the plan is wrong, raise it as a blocker — do NOT redesign in-flight.**"

**Inert in 1b's all-Opus configuration; load-bearing in Round 3.** Sonnet Builder works *because* it's executing, not deciding. Without TE-22, Sonnet Builder will burn iterations re-planning and we'll blame the wrong thing. Land the rule now so the Round 3 flip is a one-parameter change.

**Risk:** legitimate plan ambiguities get raised as blockers instead of resolved in-flight. **Mitigation:** retro tracks `replan_count` (Block 0 attribute) and blocker rate — if blockers spike, plans are under-specified, not the rule.

---

## How they reinforce each other

| Pair | Effect |
|---|---|
| TE-7 + TE-17 | Dropping redundant skills makes the 17→4 persona grouping cleaner — fewer steps to absorb. |
| TE-7 + TE-21 | Two whole sessions (`/verify`, `/ship`) drop. |
| TE-18 + TE-7 | Conditional `/design` makes Architect cheaper by default; novel UI still gets full 3-variant exploration. |
| TE-19-scaffold + TE-7 | Persona shape from TE-7 is what makes per-persona model routing tractable. One model per role, not per skill. |
| TE-22 + TE-19 (Round 3) | Plan-execute discipline is what makes the cheaper Sonnet Builder viable in Round 3. |
| TE-21 + Block 1a TE-3 | `bun run verify` becomes a CI step instead of a skill — same script, different invocation. |

## How they could make each other worse

| Pair | Risk | Mitigation |
|---|---|---|
| TE-7 + adversarial principle | Collapsing producer + critic loses adversarial value | Group only on coupling; never collapse author ↔ critic boundaries — Architect self-critique stays in-session, but Cold DoD and adversarial Reviewers stay in fresh context |
| TE-17 + iteration loops | Dropping `/design-critique` / `/architecture-critique` could lose the loop counter | Producer skill keeps the counter in its brief output; same loop, single session, no separate skill |
| TE-18 + misclassification | Routine vs. novel call wrong → routine UI ships unexplored | Internal critique mode flags low-confidence routine and triggers 2-variant fallback |
| TE-21 + noisy PR history | Every persona commits prose, PR history becomes a stream | Builder squashes before flipping draft → ready; prose-only commits use `[skip ci]` |
| TE-21 + CI feedback latency | Without `/verify` as a skill, the agent waits on CI for failure detail | `bun run verify` still runnable locally inside a persona session; CI is the gate, local run is the iteration tool |
| TE-22 + legitimate plan errors | Builder raises blockers on plans that just need clarification | Retro tracks blocker rate; if blockers spike, Architect's plans need more detail |

---

## Open questions / adversary attacks

- **TE-7's Reviewer fan-out cap** ("depth-1, ≤4 parallel") is not a property of the pipeline graph — it's a property of whatever harness primitive spawns the workers. If the harness changes, that cap moves. Settled by naming the cap in the persona prompt itself, not in the harness config.
- **TE-17:** "Dropping `/design-critique` as a separate skill loses the iteration-count gate ('up to 3× until score ≥7')." → Producer keeps the loop counter. Snapshot test on a known story that previously needed two design iterations.
- **TE-21:** "Cold DoD reading a live PR is fine, but if Builder's auto-pushes trigger noisy CI runs, we burn CI minutes." → Squash before flipping ready; `[skip ci]` on prose-only commits.
- **TE-18:** "Routine-vs-novel classification is the exact kind of judgment a small classifier gets wrong." → Design-critique mode flags low-confidence routine and triggers 2-variant fallback. Snapshot test that an L-story with no matching `packages/design-system/html/` component is classified `novel`.
- **TE-22:** "Builder raises blockers on plan ambiguities that just need clarification, slowing every story." → Retro tracks blocker rate; if blockers spike, plans are under-specified.

## A/B mechanics

- **Branch:** `block-1b-structure` off the post-round-1 baseline SHA.
- **Compared against:** post-round-1 baseline, **not** original `main`. (Round 1 winners shipped first.)
- **Stories:** 3 of mixed complexity (S / M / L).
- **Primary signals:** session count per story, total cache-write tokens, wall-clock per persona phase, AC pass rate.
- **Ship rule:** ≥10% improvement on cost or wall-clock with **no AC regression** on all 3 stories.
- **Quality supplement:** for at least 5 stories post-merge, retro pass-by-hand comparing diff quality vs. baseline. Block 1b removes redundancy; if it also removes signal, retros catch what cost numbers won't.

---

## Files touched

- `.claude/skills/pipeline/SKILL.md` — TE-7 grouping table.
- `.claude/skills/design/SKILL.md` — TE-18 Phase-0 router.
- `.claude/skills/design-critique/SKILL.md` — deleted (TE-17).
- `.claude/skills/architecture-critique/SKILL.md` — deleted (TE-17).
- `.claude/skills/verify/SKILL.md` — deleted (TE-21).
- `.claude/skills/ship/SKILL.md` — deleted (TE-21); replaced by continuous commit logic in `bin/pipeline`.
- `.claude/agents/architect/AGENT.md`, `.claude/agents/builder/AGENT.md`, `.claude/agents/cold-dod/AGENT.md`, `.claude/agents/reflector/AGENT.md`, plus reviewer worker agents — new persona definitions with `model:` frontmatter.
- `bin/pipeline` — draft-PR creation, continuous commit, `PIPELINE_AB_MODE` gate.
- Builder persona prompt — TE-22 plan-execute rule.
