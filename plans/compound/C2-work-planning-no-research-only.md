# C2 — Research-only work packages must not exist

**Source:** `/pipeline:compound` run 2026-06-28. Pattern C2 (scope-creep beyond the locked
plan), CONFIRMED at 6 occurrences. Worst case AL1: a *research-only* work package
("research + concept + design + TSX prototype") ballooned into a composite deliverable
because it had no observable outcome to anchor it.

**Decision (founder):** Research-only work packages shouldn't exist. Research belongs in
`/pipeline:work-planning` itself (the existing-implementation check / an Explore agent) or in
`/pipeline:concept`, *before* a work package is registered. Every work package must deliver a
feature or a user/system-observable outcome.

**This repo's change:** none to product code. The fix lives in the **`work-planning` skill**,
which ships from the `agent-pipeline` plugin (source repo `ambrovia/agent-skills-pipeline`).
This file is the handoff: a porting agent applies the diff below to the plugin source.

---

## Target file (in the plugin source repo)

`skills/work-planning/SKILL.md` (cache path observed locally:
`pipeline/<version>/skills/work-planning/SKILL.md`). Two surgical edits — locate by the
anchor text, not line numbers (line numbers drift between versions).

### Edit 1 — extend the "What a work package IS (and isn't)" → "It is NOT:" list

Anchor: the bullet `- A backlog item. If it has no AC, it is not a work package.`
Append immediately after it:

```markdown
- A research / investigation / exploration deliverable. A work package must ship a feature or a user/system-observable outcome — not "produce findings," "explore the space," or "research X." Research is an *input* to scoping, not a unit of delivery: do it here (the existing-implementation check, an Explore agent) or in `/concept` before registering, and let its conclusions shape the AC. A research-only work package has no observable outcome and inevitably balloons into a composite once someone tries to make it deliver something (see AL1).
```

### Edit 2 — add a refusal case under "Refusal cases (return without registering)"

Anchor: the bullet that begins `- The work has no observable outcome — i.e. it's pure
refactoring …` (ends `… parent work package with explicit "code health" AC.`).
Append immediately after it:

```markdown
- The work package is research / investigation / exploration only — its deliverable is findings, a recommendation, or a prototype rather than a shipped feature or outcome. Do the research here (existing-implementation check, Explore agent) or in `/concept`, then register the work package that *acts on* the conclusion. Refuse to register the research as its own work package.
```

---

## Unified diff (apply with `git apply`, adjust path/context for the plugin repo)

```diff
--- a/skills/work-planning/SKILL.md
+++ b/skills/work-planning/SKILL.md
@@ "It is NOT:" list
 - A backlog item. If it has no AC, it is not a work package.
+- A research / investigation / exploration deliverable. A work package must ship a feature or a user/system-observable outcome — not "produce findings," "explore the space," or "research X." Research is an *input* to scoping, not a unit of delivery: do it here (the existing-implementation check, an Explore agent) or in `/concept` before registering, and let its conclusions shape the AC. A research-only work package has no observable outcome and inevitably balloons into a composite once someone tries to make it deliver something (see AL1).
@@ "Refusal cases (return without registering)" list
 - The work has no observable outcome — i.e. it's pure refactoring with no user-visible or system-visible change. Refactors don't get work packages; they happen *inside* a work package whose AC demand the cleanup, or under a parent work package with explicit "code health" AC.
+- The work package is research / investigation / exploration only — its deliverable is findings, a recommendation, or a prototype rather than a shipped feature or outcome. Do the research here (existing-implementation check, Explore agent) or in `/concept`, then register the work package that *acts on* the conclusion. Refuse to register the research as its own work package.
```

---

## Verification (after porting)

The skill change is prose guidance, not executable code — no automated test. Verify by reading
the rendered skill and confirming both insertions landed under the right headings. Optional
sanity check: ask `/pipeline:work-planning` to register a "research the X space" work package —
it should now refuse and point at `/concept`.

> **Local-cache note:** the same two edits were applied to the local plugin cache
> (`~/.claude/plugins/cache/agent-pipeline/.../work-planning/SKILL.md`) so the running
> harness behaves correctly today. That cache is overwritten on plugin update — porting to
> the source repo is what makes the fix durable.
