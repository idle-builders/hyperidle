---
name: architecture-review
description: "Read-only architectural review. Run by the architect agent."
argument-hint: "[file paths or workpackage-id]"
user-invocable: true
min_tool_calls: 10
---

# Architecture Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading (do ALL before reviewing code)

1. `plans/<workpackage-id>/architecture.md` — the technical plan (always start here)
2. The specific authoritative files named in the plan's **Required reading** section — these are the `docs/<topic>/<file>.md` paths the architect picked. Read each one end-to-end.
3. `plans/<workpackage-id>/concept.md` — the locked concept output, if present
4. `CLAUDE.md` (tech stack), canonical-shapes contracts under `docs/<topic>/`, and `plans/work-packages/dependency-graph.md`
5. The relevant track file in `plans/work-packages/TRACK-*.md` for the workpackage being reviewed

Then read the changed files (via `<target>` or `git diff --name-only`).

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

## Target

$ARGUMENTS
