# L21 Retrospective — CoC Create-on-the-Fly (Bottom-Right Rail Overlay Thread)

## Pipeline Overview

**Duration:** 8 commits over the full pipeline (scaffolding → ship)
**Tests:** 43 new tests (red phase: 1808ce0, green phase: b10a0cf, fixes: 2572f1c)
**Phases completed:** 5/5 (design → review → architecture → build → review & fix)
**Verdict:** DONE with 4 findings; all fixed in single commit.

### Commit Timeline

| Commit | Phase | Content |
|--------|-------|---------|
| 63188b5 | 0 | Scaffolding + WIP branch |
| d0dad05 | 1 | Design variants (3 explored, Variant B selected, 7.9/10 approved) |
| 3bda18f | 1 | Architecture plan (16 ordered tasks, 8.6/10 approved) |
| 775d5ac | 2 | Design critique + Architecture critique (phase scores) |
| 1808ce0 | 3 | Red tests: 43 assertions (CocOverlay, CocTrigger, coach endpoint, E2E) |
| b10a0cf | 3 | Green: full implementation + 100% test passage |
| df747f3 | 4 | Code review: DONE with 4 findings (S1, A3, D1, ADV1) |
| 2572f1c | 4 | Fix round: all 4 findings addressed in single commit |

---

## Timeline Observations

### What Worked Well

1. **Variant exploration caught the winner early.** Three spatial approaches (drawer, popover, inset) scored 68/73/63 respectively. Popover won on coherence because it avoids conflict with Main. The 3-variant exercise cost ~30 min but prevented shipped friction.

2. **Critique phases separated from production.** Design critique (reviewer, not designer) scored 7.9/10, finding keyboard discovery gaps. Architecture critique (reviewer, different agent) scored 8.6/10, finding agent-id mismatch and identity-resolution gaps. Both non-blocking but redirected the builder away from blind spots. Designer never reopened docs — reviewer's job was to poke edges.

3. **Red tests forced specification clarity.** Writing 43 failing tests before code meant the builder had a complete executable spec. No ambiguity about coach thread shape, trigger render logic, error handling, keyboard nav, accessibility. All ACs turned into testable assertions.

4. **Single review-fix commit.** Builder received 4 findings (S1 error handling, A3 attach affordance, D1 animation, ADV1 dead code), fixed all in one commit, ran `bun run verify`, shipped. No iteration.

### Cost Signals

- **Design phase:** 1 commit (variants), critique added minimal cost. No re-work.
- **Architecture phase:** 1 commit (plan), no amendments. Builder followed faithfully.
- **Red tests:** 1 commit, 43 tests, all passed on green. No churn.
- **Green implementation:** 1 commit, 7 files (6 new + AppShell), all tests green immediately.
- **Review + fix:** 2 commits (findings + fixes). 4 findings, all low/medium, no blockers.

**Total post-green rework: 2 commits.** No re-design, no re-architect. This is the pattern.

---

## What Could Improve

### 1. Deferred Mobile Was Not Flagged for Follow-Up

Design spec deferred mobile (FAB + bottom sheet). AC doesn't mandate it, so correct. But no follow-up task in manifest. If next workpackage assumes mobile works, it discovers the gap by test failure.

**Pattern:** Document deferrals in work package manifest so next agent has visibility.

### 2. GET with Create Side-Effect Is Pragmatic but Unconventional

Coach endpoint (`GET /api/threads/coach`) creates thread on read. Architecture critique flagged this (LOW) — pragmatic but violates REST semantics. Builder added `@lore` comment explaining resolveOrCreate pattern, which is good. **But:** Decision should surface in architecture plan, not left to builder judgment.

**Pattern:** Trade-off decisions (pragmatism vs semantics) belong in the plan, not deferred to production code.

### 3. "Message" Kind Extended But UI Never Implemented

Architecture extended `InlineRef.kind` to include `"message"` for attaching specific messages to coach questions. Type change merged, Zod schema accepted. But review found: no component implements message attachment. The `"message"` kind is forward-compatible but unused.

**Pattern:** If a type extends to enable a feature, implement the UI surface or note it as pending. Don't extend enums halfway.

### 4. Attach Affordance Coupling Not Obvious Until Code Review

Architecture plan said CocContext would be consumed by "items in Main." Too vague. Builder implemented context but no component consumed it initially. Review found gap (A3), builder added CocAttachButton component in fix commit.

**Pattern:** Name specific files/lines when coupling exists. "CocContext consumed by BetCard in packages/web/src/shell/Canvas.tsx" beats abstract "attachable components."

---

## Patterns to Watch

### The Reviewer Catches Design Gaps

- **Design phase:** 1 point (keyboard discovery). Score 7.9/10.
- **Architecture phase:** 3 points (agent id, identity resolution, REST semantics). All noted, none blocking.
- **Code review:** 4 findings (error handling, affordance, animation, dead code).

**Pattern:** Reviewer's job is catching 15% edge cases the producer missed. Findings are mild (no CRITICAL), consistent, and actionable. This is healthy.

### AC Rigor Determines Review Rigor

All 9 ACs satisfied in green. Review findings were improvements, not violations. Vague ACs ("let user attach items") = looser review. Tight ACs ("attach affordance shall render on hover") = tighter review.

**Pattern:** AC rigor is the quality floor.

### One Commit Per Role Transition Keeps History Clear

8-commit arc (scaffolding → design → critique → tests → green → review → fixes) is readable. Each commit is single-purpose. A future agent can trace the decision path.

**Pattern:** One commit per role transition keeps history legible.

---

## Metrics Summary

| Metric | Value | Signal |
|--------|-------|--------|
| Design variants explored | 3 | High confidence |
| Design critique score | 7.9/10 | Acceptable |
| Architecture critique score | 8.6/10 | Strong |
| Red-phase tests | 43 | Complete coverage |
| Files changed | 7 | Minimal surface |
| Review findings | 4 (1 S, 1 A, 1 D, 1 ADV) | No blockers |
| Fix round commits | 1 | Efficient |
| Post-ship rework | 0 | Clean ship |

---

## Recommendation

L21 executed the pipeline as designed. Variant exploration, critique discipline, TDD rigor, code review. Zero rework after fixes merged. The GET `/api/threads/coach` pattern (resolve-or-create on read) is pragmatic and works, but future workpackages should know this pattern exists. Add a section to `docs/process-layer/` documenting when to use GET vs POST for idempotent resolution endpoints.
