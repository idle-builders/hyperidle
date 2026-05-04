---
name: architecture-critique
description: "Architecture quality gate. ALWAYS invoke this skill on the OUTPUT of /architecture (the plan), before any test or code is written. Scores the plan 0-10 across nine dimensions: spec alignment, layer integrity, contracts, data model, naming, depth, failure-mode coverage, simplicity, and verifiability. Iterates fixes until the score crosses the threshold."
argument-hint: "[story-id|plan-path]"
user-invocable: true
min_tool_calls: 5
---

# Architecture Critique

The architectural counterpart of `/design-critique`. Where design-critique scores a UI artifact, this scores **the plan itself** — the typed contracts, the schemas, the route map, the task order, the security/abuse cases, the protected-test list. The plan goes into write-tests; if the plan is wrong, every test downstream encodes the wrong intent.

This is **not** `/architecture-review`. The review skill audits the *implemented code* against the spec, after the fact. This skill audits the *plan* against the spec, before any code is written. They run at different phases and surface different classes of issues.

## When This Runs

- **In the pipeline:** step 4, immediately after `/architecture` produces the plan, before `/write-tests`.
- **Inside `/architecture` Phase 4:** the architect runs this on themselves and iterates. Fixes go into the plan, not into a separate findings file.
- **On explicit `/architecture-critique <story-id>`:** full audit of the plan saved under TaskCreate or in `docs/work-packages/`/the worktree's plan output.

## Required Reading (use anchor reads via `bun run docs:read`)

1. The story in `docs/work-packages/TRACK-<letter>.md`.
2. `docs/concept/architecture/` — system layering, component boundaries (use `bun run docs:read architecture#<section>`).
3. `docs/concept/process-layer/`, `knowledge-architecture/`, `agent-layer/` — only the sections that match the plan's scope.
4. `docs/work-packages/SHARED.md#shared-contracts`.
5. UI stories: `docs/concept/human-interface-layer/`, `information-architecture/` — section-scoped + `plans/design-explorations/<story-id>/approved.md`.
6. The plan itself — every section.

## The Critique Loop

```
1. Read the plan
2. Score it (0-10) against the 9 dimensions below
3. List specific findings (CRITICAL / WARNING / SUGGESTION) with plan-section references
4. Architect fixes the highest-priority issue IN THE PLAN
5. Re-score
6. Repeat until score >= 7 or 4 iterations reached
```

## Scoring Dimensions (0-10 each, averaged)

### 1. Spec Alignment

- Does every acceptance criterion in the story map to a task in the plan?
- Does every plan task trace back to an AC or a forced dependency?
- Are scope-creep tasks present (things not asked for)? They shouldn't be.
- For UI stories, does the plan match the contracts in `approved.md`? If `/design` was skipped on a UI story, that's CRITICAL.
- **Smell:** plan has more tasks than the story has ACs. Plan is missing a verification method for an AC. Plan invents requirements.

### 2. Layer Integrity

- Does any task in the plan reach past its layer? (Human Interface ↔ Meta Layer ↔ Agent Runtime — strict downward dependency.)
- Does the Meta Layer call models? It shouldn't.
- Does the frontend access the Primitive Store directly? It shouldn't.
- Does a `packages/web` task reach into `packages/server`'s internals or vice versa?
- **Smell:** schema or query in the wrong package. Direct DB access from the frontend. Cross-package private-API call.

### 3. API Contracts

- Are all routes named with their HTTP method, path, request shape, response shape, and status codes?
- Is the request/response body shape a TypeScript type the plan exports, not "looks like the existing endpoint"?
- Are error shapes specified (status code + body)? "Returns an error" is not a contract.
- For closed vocabularies (e.g. message-type discriminants in TRACK-L L1), is the union closed and exhaustively type-checked?
- **Smell:** "POST /threads" with no request body. Vague "returns the thread" with no field list. Open string union where a closed discriminant is required.

### 4. Data Model Alignment

- Do the schemas match the spec field-by-field, type-by-type? (If the spec says 6 indexes, the plan lists 6.)
- Are foreign keys, unique constraints, NOT NULL, default values, and check constraints all specified?
- For dual-driver stories, does the schema work in both SQLite and PostgreSQL? (Watch for `JSONB`, `SERIAL`, `bigint` mismatches.)
- Are migration names forward-only with rollback plans documented?
- **Smell:** column without a type. Missing FK on a relation. Migration without a rollback note. Schema diverges from the spec's field list.

### 5. Naming

- Do names honestly describe what things do?
- Does a function or column name eliminate a paragraph of doc?
- Do new names conflict with existing closed vocabularies (Bet / Task / Session / Thread / Block / Artifact)?
- Are domain terms used consistently with `docs/concept/` and `SHARED.md`?
- **Smell:** generic names (`Manager`, `Service`, `Handler`, `Helper`, `Util`). Function name lies about side effects. New name shadowing or aliasing an existing primitive.

### 6. Module Depth (Interface Simplicity Hides Complexity)

From *A Philosophy of Software Design*: deep modules have small interfaces hiding significant complexity. Shallow modules have large interfaces with thin implementations.

- Is the public surface small for the size of the problem solved?
- Are there entry points that exist only for one caller? (Symptom of leaking implementation.)
- Are `export`s narrow — only what the module's contract requires?
- For shared primitives (Thread / Block / Artifact), does ONE well-shaped API serve every consumer named in the story, without each consumer needing a custom wrapper?
- **Smell:** one new function per consumer. Public types that mirror internal data shapes 1:1. Five exports where two would do.

### 7. Failure-Mode Coverage

- Has every error path been identified?
- For every external call (DB, HTTP, model, queue), is the timeout / retry / failure behaviour specified?
- For every input boundary (user input, agent-authored field, external API response), is the validation rule specified?
- Does the plan's "Security & abuse cases" block address rate-limiting, input-trust, secret-handling, path-traversal, and SSRF — each marked applicable+addressed or N/A with reason? (CC-003.)
- Does the plan name the *route checklist* for any guard/middleware enumerated in the spec? (CC re: L7.)
- **Smell:** happy-path-only ACs. "Returns an error" without specifying status. Missing rate-limit on POST/PATCH. Missing validation at trust boundary. Missing route in route-checklist. (Recurrence: CC-003, CC-004 — security review still surfaces findings not in plan ACs.)

### 8. Simplicity / Over-Engineering Risk

- Is there a feature flag, abstract base class, plugin point, or registry that no caller demands today?
- Is there error handling for cases that can't happen?
- Is there validation in internal code that's already validated at the boundary?
- Is there a backwards-compatibility shim for code with no callers yet?
- Is the design-it-twice section absent from a non-trivial decision, or theatre-present on a forced one?
- **Smell:** abstraction with one implementation. "Future-proof" anything. Three similar tasks compressed into a generic helper before the third repeat. Commented-out scaffolding for "next phase".

### 9. Verifiability

- Does every AC have a concrete verification method (test name, assertion, expected output) — not "write a test"?
- Are the verification methods aligned with what's actually testable in this codebase (Vitest unit, Playwright e2e, integration test against real DB)?
- Is there a failing-test-first ordering — does the plan name the test before the implementation it proves?
- Is the protected-tests list populated for any test whose contract must not drift? (CC-008.)
- **Smell:** AC verifies "the feature works". AC verifies a behaviour that has no harness in the codebase. Test order inverted (implementation listed before its proving test). Empty protected-tests block.

## Scoring Guide

| Score | Meaning | Action |
|-------|---------|--------|
| 9-10 | Exceptional | Ship the plan. The architect produced a plan a senior engineer would defend. |
| 7-8 | Good | Minor follow-ups. Acceptable for `/write-tests`. |
| 5-6 | Mediocre | Needs work on 2-3 dimensions before tests. |
| 3-4 | Poor | Structural issues. Plan is missing core contracts or has scope leaks. Restart Phase 2 of `/architecture`. |
| 0-2 | Architecture Slop | Start over. Plan reads like a list of vibes. Re-interrogate. |

## Output Format

```
## Architecture Critique: <story-id>

**Score: X/10** (SA:_ LI:_ AC:_ DM:_ N:_ MD:_ FMC:_ S:_ V:_)

### CRITICAL
- [plan §<section>] Description of issue → specific fix to apply

### WARNING
- [plan §<section>] Description of issue → specific fix to apply

### SUGGESTION
- [plan §<section>] Description of issue → specific fix to apply

### What's Working Well
- 1-2 things the plan does right (reinforces good patterns; helps next architect)
```

## Common Failure Modes Caught By This Skill

These are the recurrences the compound-candidates log keeps surfacing — every one is something architecture-critique should catch in the plan, not architecture-review in the code:

- **CC-003 — happy-path-only ACs.** Security & abuse cases block missing or thin. Caught by Dimension 7.
- **CC-007 — spec/codebase drift.** Plan references tables, routes, components that don't exist. Caught by reading the Plan reconciliation section against `grep` reality during scoring.
- **CC-008 — protected-tests drift.** Plan doesn't enumerate which test contracts are frozen. Caught by Dimension 9.
- **L7 PROPOSED-L7-B — route-checklist gap.** Plan enumerates guard but not the route × file matrix the guard must cover. Caught by Dimension 7.
- **L7 (e2e selectors).** Plan changes UI shape without listing affected e2e specs in protected-tests. Caught by Dimension 9 + cross-referencing changed component vs e2e selectors.

When the plan ships these gaps, this skill blocks; when the plan addresses them, the downstream review/security/dod skills have less to surface.

## Anti-Patterns

- **"Looks complete" scoring.** Score by reading every plan section against its rubric dimension. Don't skim; verify field-by-field.
- **Critiquing in the abstract.** Every finding has a plan-section reference and a concrete fix.
- **Letting design-it-twice be theatre.** If the plan lists two alternatives but the second is straw-manned, that's worse than not having two — flag it.
- **Re-doing the architect's job.** This skill scores; it does not rewrite the plan. The architect applies the fixes; this skill rescores.


## Target

$ARGUMENTS
