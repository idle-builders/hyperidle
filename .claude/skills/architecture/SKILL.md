---
name: architecture
description: "Produce the technical plan for a story — types, schemas, APIs, file paths, ordered tasks. Architect interrogates the spec, then drafts; adversary challenges. Run AFTER /concept (always) and AFTER /design (when the story has UI)."
argument-hint: "[story-id]"
user-invocable: true
min_tool_calls: 25
---

# Architecture

Produces the **how** — file paths, type signatures, schemas, endpoint shapes, task ordering.

**Fixed inputs (do NOT re-litigate):**
- Concept doc from `/concept` — includes which docs were read and the relevant canonical-shapes contracts in `docs/<topic>/`.
- Approved design from `/design` (UI stories) — `plans/design/<story-id>/approved.md`.

**Doc discovery:** Read the "Required reading" from `/concept` output if available. Otherwise `ls docs/` to identify relevant topic folders. **Output a "Required reading" section in the plan** listing the specific doc files the engineer must read before implementing. This is the natural filter — downstream skills read only what the plan prescribes.

If the spec contradicts an existing concept doc, stop — that's a `/concept` gap.

## Phase 0 — Interrogate the understanding

Before producing acceptance criteria, walk the decision tree. Ask hard questions ONE AT A TIME (not as a list dump). For each, propose your recommended answer based on what you can read in the spec / track file / existing code, then let the human (or the adversary in autonomous mode) confirm, override, or dig deeper.

**One question at a time.** A list of ten questions invites the easy ones to be answered and the hard ones to become silent assumptions that surface as bugs later.

Sample interrogation lines (adapt to the story):
- "What's the smallest version of this that's still useful? My read: X. Confirm or correct?"
- "What's the failure mode if Y is wrong? My read: A. Confirm?"
- "What's actually being asked vs adjacent and tempting to also build? My read: in-scope = X, out = Y."
- "Is any domain term in this spec used inconsistently? My read: term Z is used for two distinct concepts."
- "Does the spec contradict an existing doc? My read: docs/<topic>/canonical-shapes.md says X, this story says Y."
- "What changes if the user's mental model about W is wrong?"

Stop interrogating when the path is clear, not when you run out of questions. Three to seven branches is typical. If the story already pins a decision, don't re-litigate it — confirm and move on.

## Phase 1 — Plan reconciliation (spec ⇆ reality)

Before locking the plan, reconcile the spec against the actual codebase. (Why: I2, I4, J2, J4, J7, L1 retros all caught spec/codebase drift at write-tests time — too late.)

For every named symbol the spec references — table, route, component, file, constant, env var:
1. `grep` for it in the codebase. Does it exist? With what shape?
2. For UI-touching ACs, read the current rendered DOM (or the existing component) to verify columns / labels / states.
3. For API-touching ACs, read the existing route handler / OpenAPI / schema to verify the contract.

Produce a `Plan reconciliation:` block in the plan listing every spec assumption that disagreed with reality and how the plan handles each. If the spec assumes a table, route, or column that doesn't exist, the plan must include the migration / scaffolding step.

## Phase 2 — Acceptance criteria + tasks

Read the story `$ARGUMENTS` in the relevant track file under `plans/work-packages/` (e.g., `TRACK-A.md` for A-stories). Read existing code in affected packages and the relevant doc sections identified in doc discovery above.

If the story has a UI surface and `/design` produced an approved spec (under `plans/design/<story-id>/approved.md` or wherever the design step wrote it), read it. The visual contract, component vocabulary, and interaction states are inputs — do not re-litigate them.

Produce:
1. **Acceptance criteria** — each with a specific verification method (see table below)
2. **Ordered task list** — what to do, which files, which test proves it, dependencies between tasks
3. **Type signatures / schemas / endpoints** — the contracts the implementation must match
4. **Risks or ambiguities**
5. **Route checklist** (if applicable) — when the spec enumerates a route list (e.g., "guard mounts on /sessions, /tasks, /bets"), the plan MUST include a `route-checklist:` block listing every route + every file the guard/middleware must cover. Step `/architecture-review` then greps the implementation against that checklist before signing off. Recurrence: L7 retro PROPOSED-L7-B (factory-paused-guard plan §8 enumerated all routes; impl applied to one route only).
6. **Security & abuse cases** — required block. Default checklist: rate-limit on every POST/PATCH, input-trust boundary for any agent-authored field, secret-handling for any new credential surface, path-traversal for any path input, SSRF for any outbound URL. Plan is not green until each is either marked applicable+addressed or explicitly N/A with reason. (CC-003.)
7. **Protected tests** — `protectedTests: string[]` listing test files whose assertions must not change. DoD audits the protected set with `git diff --name-only`. (CC-008.)

**Every acceptance criterion MUST have a concrete verification method.** "Write a test" is not specific enough. Say exactly what the test does and what it asserts.

| Criterion type | Verification methods |
|---------------|---------------------|
| Schema exists | Migration runs without error; `.schema` output shows expected tables/columns/constraints |
| API endpoint | Integration test hits the endpoint, asserts status code + response shape |
| Type safety | `bun run check` passes with zero errors; exported types are importable from other packages |
| Data integrity | Test inserts violating data (orphan FK, duplicate unique), asserts rejection |
| CRUD operations | Test creates, reads, updates, deletes a row; asserts each operation's result |
| Config/setup | File exists with expected content; importing it doesn't error |
| Seed data | Seed script runs; query confirms ≥1 row per table |
| UI component | Playwright E2E navigates to page, asserts visible elements + interactions |
| Error handling | Test triggers the error path (bad input, missing resource), asserts error response |
| Performance | Benchmark test runs N operations in < X ms |
| Coverage | `bun run test:coverage` shows 100% of new files |
| Dual-driver/compat | Same test suite runs against both SQLite and PostgreSQL |

## Phase 3 — Design-it-twice (for non-trivial decisions)

When a sub-decision in the plan is non-trivial — a schema with multiple plausible shapes, an API where versioning matters, a primitive that 4+ stories will consume — sketch **two** alternative shapes and pick. The reverse cost of getting it wrong is the budget for this phase.

For each alternative: 1-paragraph shape, 1 trade-off, 1 reason to reject. The synthesis often combines insights from both. Inspired by *A Philosophy of Software Design* — "design it twice" — and the founder reframe in TRACK-L on reusable primitives.

Skip when the decision is forced (existing pattern, single sane shape, low blast radius). Don't theatre-design where one obvious answer exists.

## Phase 4 — Adversary challenge + critique

Spawn an **adversary agent** to challenge the plan — over-engineering, missing deps, gaps in AC coverage, scope creep snuck in during interrogation, missing security/abuse cases, missing protected-test list, route-checklist gaps. Address critical issues. Max 1 round.

Then run `/architecture-critique` to score the plan against the architectural rubric. Iterate fixes until score ≥ 7 or 3 rounds reached.

Save the final plan via TaskCreate so downstream skills can read it.

## Target

$ARGUMENTS
