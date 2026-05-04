---
name: architecture-critique
description: "Score the technical plan against the 9-dimension architectural rubric. Evaluation act — separate from production. Same designer agent, different cognitive mode."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 8
---

# Architecture Critique

**Why:** The mind that just wrote the plan cannot objectively evaluate it. Switching to evaluation mode — even within the same session — requires a deliberate cognitive break. This skill is that break.

Read the plan produced by `/architecture` at `plans/<workpackage-id>/architecture.md`.

## Challenge the plan

Switch to adversarial thinking. Challenge the plan for: over-engineering, missing deps, gaps in AC coverage, scope creep snuck in during interrogation, missing security/abuse cases, missing protected-test list, route-checklist gaps. Address critical issues. Max 1 round.

## Score against the rubric

Score the plan 0-10 against the 9-dimension architectural rubric below. Iterate fixes until score ≥ 7 or 3 rounds reached.

### Architectural rubric (0-10 each, averaged)

1. **Spec alignment** — every AC maps to a task; no scope-creep tasks; UI plan matches `approved.md` if `/design` ran.
2. **Layer integrity** — no Human-Interface ↔ Meta-Layer ↔ Agent-Runtime violation; Meta Layer doesn't call models; frontend doesn't reach the Primitive Store.
3. **API contracts** — every route has method, path, request shape, response shape, status codes, error shape; closed unions are exhaustive.
4. **Data model alignment** — schemas field-for-field with the spec; FKs, unique constraints, NOT NULL, defaults, check constraints all named; dual-driver issues (`JSONB`, `SERIAL`) flagged.
5. **Naming** — names eliminate documentation; no generic `Manager`/`Service`/`Helper`; no shadowing of closed vocabularies (Bet/Task/Session/Thread/Block/Artifact).
6. **Module depth** — small public surface for the size of problem; no per-consumer entry points; one well-shaped API for shared primitives.
7. **Failure-mode coverage** — error paths identified; rate-limiting, input-trust, secrets, path-traversal, SSRF marked applicable+addressed or N/A; route-checklist present when the spec enumerates a route list. (CC-003, L7 PROPOSED-L7-B.)
8. **Simplicity** — no flags / abstract bases / plugin points without a caller; no error handling for impossible cases; no future-proof scaffolding; design-it-twice present iff non-trivial.
9. **Verifiability** — every AC has a concrete verification method; protected-tests list populated. (CC-008.)

Score ≥ 7 ships the plan. 5-6 needs work on 2-3 dimensions. ≤ 4 restarts `/architecture` Phase 2.

### Output line (downstream contract)

```
ARCHITECTURE-SCORE: <int>/10  rounds=<n>  score-line: SA:_ LI:_ AC:_ DM:_ N:_ MD:_ FMC:_ S:_ V:_
```

The retro reads `rounds=<n>` to track plan-quality drift over time.

### Common failure modes this rubric catches

- **CC-003 — happy-path-only ACs.** Dim 7.
- **CC-007 — spec/codebase drift.** Plan reconciliation section against grep reality.
- **CC-008 — protected-tests drift.** Dim 9.
- **L7 PROPOSED-L7-B — route-checklist gap.** Dim 7.
- **L7 e2e selectors.** Dim 9 — UI shape change vs e2e specs in protected-tests.

## Target

$ARGUMENTS
