---
name: architecture-review
description: "Read-only architectural review. Run by the architect agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Architecture Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading (do ALL before reviewing code)

1. `docs/ARCHITECTURE.md` — layers, API contracts, data models, event bus, deployment
2. `docs/PROCESS_LAYER.md` — state machines, task/bet lifecycles, handoff protocol
3. `docs/KNOWLEDGE_ARCHITECTURE.md` — knowledge fabric, L0-L4, materialization, conflicts
4. `docs/AGENT_LAYER.md` — agent runtime, session provisioning, workspace adapters
5. `docs/work-packages/SHARED.md` — tech stack, shared contracts, dependency graph
6. The relevant track file in `docs/work-packages/TRACK-*.md` for the story being reviewed

Then read the changed files (via `$ARGUMENTS` or `git diff --name-only`).

## Be thorough

Read every changed file end-to-end. For each file, verify it against the relevant spec section. Don't skim — open the doc, find the section, compare field-by-field, state-by-state, endpoint-by-endpoint. If a state machine has 8 states in the spec, count the states in the code. If a schema has 6 indexes, count the indexes. Surface-level "looks right" is not architecture review.

## Review for:
- **Layer violations** — does any layer reach past its neighbor?
- **API contracts** — do routes, methods, request/response shapes match architecture docs?
- **Data model alignment** — do fields, types, constraints, indexes match schema requirements exactly?
- **State machines** — do all states and transitions match PROCESS_LAYER.md and REQUIREMENTS.md?
- **Event bus** — are all specified events present with correct payloads?
- **Naming** — do names honestly describe what things do?
- **Component boundaries** — is responsibility correctly assigned across packages?
- **Spec contradictions** — if two docs disagree, flag it

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths, line numbers, AND the spec reference (doc + section) for each finding.
