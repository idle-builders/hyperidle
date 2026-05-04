---
name: pipeline
description: "Use when multiple work packages need to be built in sequence or parallel. Triggers: batch implementation requested, track or story list provided, 'all' target given."
argument-hint: "[story-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
min_tool_calls: 80
---

# Pipeline — Build Stories End-to-End

Target: **<target>**

You are autonomous. There is NO human. Never pause, never ask, never stop until every story you were given is done or blocked.

**NEVER end your turn without a tool call** unless every story you were given is done/blocked.

---

## What you own

The scheduler invokes you with **one or more story IDs**. The argument is either:

- **A single ID** (e.g. `L7`) — a solo Medium- or Large-complexity story. Do this one and finish.
- **Multiple IDs from the same track** (e.g. `A2 A3 A5`) — a batched group of Small-complexity stories. The scheduler has already verified they share a track and have no inter-dependencies, so you may do them in any order.

Cross-track or cross-complexity batches are NEVER dispatched. If you receive a mixed group, treat it as a scheduler bug: mark every story `blocked` with reason `mixed-batch` and exit.

**State contract — non-negotiable.** You own exactly `.pipeline/progress/<id>.json` for **each ID in <target>, and no others**.

- Read `.pipeline/progress/<id>.json` to resume (skip if `status: done`, resume `in_progress` from `currentStep`).
- Write `.pipeline/progress/<id>.json` after every status/step change for that story.
- NEVER read or write progress files for IDs you weren't given. Other agents own those.
- The legacy `.pipeline/progress.json` is gone — do not create it.

`plans/work-packages/TRACK-<letter>.md` and `plans/work-packages/SHARED.md` remain your reference for spec and dependency graph.

Record session start time.

---

## For each story (any order within a batched group, sequential within yours):

Set status to `in_progress`. Create worktree:
```
git worktree add .worktrees/<id> -b feat/<id>-<desc> main
cd .worktrees/<id> && bun install
```

Then execute these steps. **Each step spawns an agent with a skill. Update `currentStep` in progress file before each step.**

**Pre-condition.** The pipeline does NOT run `/concept`. Concept-locking is upstream founder work — what a Thread / Block / Artifact / Bet / Cost IS, what it ISN'T, what contracts it commits us to. Those decisions need founder input and don't fit an autonomous pipeline. Before launching the pipeline, the founder must have run `/concept <id>` for any story that introduces or reshapes a primitive — the relevant `docs/<topic>/<section>.md` file + `SHARED.md` "Shared Contracts" entry must exist. The pipeline reads them as fixed input.

If a story is dispatched to the pipeline and `/concept` work is missing for a New / Reshaped noun, **fail fast**: mark the story `blocked` with reason `concept-missing` and move on. Do not autonomously redefine concepts.

Then execute these steps. **Each step spawns an agent with a skill. Update `currentStep` in progress file before each step.**

| Step | Agent | Skill | Why |
|------|-------|-------|-----|
| 0 | - | `/concept` | **what is this thing?**. Make sure the concept of what we are working on is well defined. |
| 1 | designer | `/design <id>` | Multi-variant UX/UI exploration. Three parallel sub-agents under different constraints, embodied HTML mockups + screenshots, `/design-critique` per variant, synthesis → `plans/design-explorations/<id>/approved.md`. **Skip when the story has no UI surface.** Operates *inside* the concept already locked upstream; does not redefine it. |
| 2 | designer | `/design-critique` | Score the approved design against the nine-dimension rubric. Iterate until score ≥7 or 4 iterations reached. Skip when step 1 was skipped. |
| 3 | architect | `/architecture <id>` | Produce the technical plan — types, schemas, routes, file paths, ordered tasks, security & abuse cases, route checklist, protected tests, plan reconciliation. Architect interrogates one-question-at-a-time. Consumes the concept doc + approved design as fixed inputs. **If the spec enumerates a route list, the plan output MUST include a `route-checklist:` block listing every route + every file the guard/middleware must cover.** Recurrence: L7 retro PROPOSED-L7-B. |
| 4 | architect | `/architecture-critique` | Score the plan against the nine-dimension architectural rubric (spec alignment, layer integrity, contracts, data model, naming, depth, failure-mode coverage, simplicity, verifiability). Catches CC-003 happy-path ACs, CC-007 spec drift, CC-008 missing protected-tests, L7 missing route-checklist BEFORE write-tests encodes the wrong intent. Iterate until score ≥7 or 3 iterations reached. |
| 5 | developer | `/write-tests <id>` | Tests first define the requirement, not the implementation — catches when the wrong thing gets built |
| 6 | developer | `/write-code <id>` | With tests as targets, implementation stays lean and every line exists because a test demands it |
| 7 | adversary | `/simplification-scan` | Scan for over-abstraction — findings only, no code changes |
| 8 | adversary | `/slop-scan` | Scan for AI anti-patterns — findings only, no code changes |
| 9 | developer | `/apply-review` (steps 7+8) | Apply simplification and slop-scan findings, validate each fix |
| 10 | architect | `/architecture-review` | Layer violations, API contracts, data model alignment — checks the IMPLEMENTATION against the plan and spec. Different from `/architecture-critique` (step 4), which scored the plan itself before code. |
| 11 | adversary | `/adversary-review` | Over-engineering, error paths, type safety, coupling, test quality |
| 12 | security-researcher | `/security-review` | STRIDE, input validation, auth, OWASP top 10 |
| 13 | designer | `/design-review` | Component specs, states, accessibility, `/designsystem` (skip if no UI) |
| 14 | developer | `/apply-review` (steps 10-13) | Apply review findings, validate each fix |
| 14b | qa | `/apply-review` (steps 10-13) | Apply test-related review findings if any |
| 15 | qa | `/check-definition-of-done <id>` | Independent auditor catches gaps the implementer rationalized away |
-- repeat 5 to 15 until done --
| 15b | developer | `/verify` | Run `bun run check && bun run lint && bun run test` — all three must pass. Lint includes Biome + ESLint (React Compiler, hooks, Drizzle safety). **Also run all Playwright e2e specs locally before push, not just unit tests** — UI-shape changes that pass unit tests can break the e2e selectors of unrelated specs. Recurrence: L7 retro; L10 retro. |
| 16 | developer | `/ship <id>` | Clean git history with atomic commits lets future agents trace decisions. CI must be green before merge. |
| 17 | — | `/retro <id>` | Recording what went well/badly feeds the compound agent to improve the process over time |

If step 15 (DoD) fails: back to step 5. Max 3 attempts, then `blocked`.
If step 15b (verify) fails: fix issues and re-run. Max 3 attempts.
If review (steps 10-13) blocks: back to step 6. Max 3 attempts.
If `/architecture-critique` (step 4) fails to reach ≥7 after 3 rounds: pause, mark `blocked` with reason `concept-or-spec-misalignment`, and surface — the concept itself may be the problem and needs upstream `/concept` work, not pipeline retry.

After step 17: set status to `done`. Move to next story.

---

## Rules

- **Never stop after planning.** Step 1 is just the beginning. Immediately proceed to step 2.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked`.
- `.pipeline/progress/<id>.json` is the checkpoint for each story you own. Write it after every status/step change. Touch only files for the IDs in <target> — never anyone else's.

**Don't rationalize skipping steps:**
- "Concept work isn't done but I'll figure it out" → no. The pipeline does not perform `/concept`. If concept work is missing for a New / Reshaped noun, fail fast with `blocked: concept-missing`; the founder runs `/concept` upstream.
- "Design is just spec writing, skip to architecture" → step 1 explores variants the founder hasn't seen yet. Skipping = locking onto the first idea, which is rarely the best.
- "Architecture-critique repeats /architecture" → no — `/architecture` produces the plan; `/architecture-critique` scores it against a 9-dimension rubric and surfaces the failure modes the compound log keeps catching too late (CC-003 happy-path ACs, CC-007 spec drift, CC-008 protected-tests, L7 route-checklist).
- "The plan is done, I can stop" → planning is step 3 of 17. You haven't built anything yet.
- "This story is simple, skip to code" → simple stories have the highest skip rate and highest regression rate
- "The DoD check is redundant, tests passed" → tests prove behavior, DoD proves the RIGHT thing was built against the spec
- "Simplify/slop-scan aren't needed" → AI code accumulates cruft that compounds across stories. 2 minutes now saves hours later.

**When to skip /design + /design-critique (steps 1-2):** the story has no UI surface (pure backend, schema, infra, concept-doc-only). Verify by reading the AC list — if no AC mentions a page, component, layout, route on the web side, or visible state, skip. When in doubt, run `/design`; the cost is bounded and the variants serve as documentation even when the founder picks the obvious one.

## Target

$ARGUMENTS
