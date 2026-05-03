---
name: architecture
description: "Produce the technical plan for a story — types, schemas, APIs, file paths, ordered tasks. Architect interrogates the spec, then drafts; adversary challenges. Run AFTER /concept (always) and AFTER /design (when the story has UI)."
argument-hint: "[story-id]"
user-invocable: true
min_tool_calls: 25
---

# Architecture

**Why:** A clear plan prevents wasted implementation time. Without architectural planning, developers build the wrong thing, miss edge cases, or invent abstractions the system doesn't need. The adversary catches errors before they become expensive rework.

This skill produces the **how** — file paths, type signatures, schemas, endpoint shapes, task ordering.

**Fixed inputs** — these have already been settled by upstream skills, and `/architecture` does NOT re-litigate them:
- The **concept doc** (from `/concept`) — what the central nouns ARE, what they ARE NOT, the canonical vocabulary, the contracts (cardinality, closure, mutability, identity, hard rules). The plan respects these; it does not redefine them. Read `docs/concept/*.md` and `docs/work-packages/SHARED.md` "Shared Contracts" before drafting.
- The **approved design** (from `/design`, when the story has UI) — visual contract, component vocabulary, interaction states. Read `docs/design-explorations/<story-id>/approved.md` before drafting.

If `/concept` was skipped because the story uses only locked concepts, that's fine — read the existing `docs/concept/*.md` sections instead. If you find a contradiction between the spec and the existing concept doc, stop: that's a `/concept` gap, not an architecture decision.

## Phase 0 — Interrogate the understanding

Before producing acceptance criteria, walk the decision tree. Pick only the questions that are actually unsettled — the ones where the spec, track file, or existing code don't give you a confident answer. Skip what's already pinned. For each remaining question, propose your recommended answer with the evidence you have, then ask the human (or the adversary in autonomous mode) to confirm, override, or dig deeper. Issue all of these probes in one parallel batch — independent questions don't need separate round-trips.

**Few, important questions.** Three sharp probes force a real decision; ten low-stakes ones are noise that get answered with shrugs while the load-bearing assumption stays silent. The bar to ask is: "will the answer change the plan?" If no, don't ask.

Sample interrogation lines (adapt to the story):
- "What's the smallest version of this that's still useful? My read: X. Confirm or correct?"
- "What's the failure mode if Y is wrong? My read: A. Confirm?"
- "What's actually being asked vs adjacent and tempting to also build? My read: in-scope = X, out = Y."
- "Is any domain term in this spec used inconsistently? My read: term Z is used for two distinct concepts."
- "Does the spec contradict an existing doc? My read: SHARED.md says X, this story says Y."
- "What changes if the user's mental model about W is wrong?"

Stop interrogating when the path is clear, not when you run out of questions. Three to seven branches is typical. If the story already pins a decision, don't re-litigate it — confirm and move on.

## Phase 1 — Plan reconciliation (spec ⇆ reality)

Before locking the plan, reconcile the spec against the actual codebase. (Why: I2, I4, J2, J4, J7, L1 retros all caught spec/codebase drift at write-tests time — too late.)

For every named symbol the spec references — table, route, component, file, constant, env var — verify it exists with the expected shape. The lookups are independent: collect the full symbol list first, then issue all the greps and reads in one parallel batch (one tool-call round, not one per symbol). Specifically:
1. `grep` every symbol in the codebase. Does it exist? With what shape?
2. For UI-touching ACs, read the current rendered DOM (or the existing component) to verify columns / labels / states.
3. For API-touching ACs, read the existing route handler / OpenAPI / schema to verify the contract.

Produce a `Plan reconciliation:` block in the plan listing every spec assumption that disagreed with reality and how the plan handles each. If the spec assumes a table, route, or column that doesn't exist, the plan must include the migration / scaffolding step.

## Phase 2 — Acceptance criteria + tasks

Read the story `$ARGUMENTS` in the relevant track file under `docs/work-packages/` (e.g., `TRACK-A.md` for A-stories) and relevant sections of `docs/ARCHITECTURE.md`. Read existing code in affected packages.

If the story has a UI surface and `/design` produced an approved spec (under `docs/design-explorations/<story-id>/approved.md` or wherever the design step wrote it), read it. The visual contract, component vocabulary, and interaction states are inputs — do not re-litigate them.

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
