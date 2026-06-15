# AJ2 Retro — The founder can see and steer the pipeline

Opt-in interactive pipeline mode: concept recap (confirm/redirect) at the end of `/concept`, readable ship summary before the human merge in `/ship`. Markdown skill-file change only (`pipeline|concept|ship|work-planning/SKILL.md`) — no product code.

## What went well
- Round-1 architecture critique caught 2 CRITICAL early (recap firing site; unbounded redirect loop); designer fixed in one revision cycle (7.8 → 8.9).
- Honest verification: no fake `readFileSync`/grep "tests" invented for a markdown-only change. Proof = structural reviewer-diff parity checklist + founder walkthrough, per CLAUDE.md.
- Scope discipline airtight: resisted AJ3 creep, work-planning kept to a one-liner, no new artifact files, autonomous path untouched.
- Final code review: zero CRITICAL/WARNING.

## Friction
- **TDD red-phase mismatch on process/skill WPs.** `/write-tests` produced nothing — a markdown prompt-instruction change has no importable runtime. Correct (no fake tests), but the red phase had no artifact.
- **Cross-skill contract gap.** CRITICAL-1: the designer's first plan placed the recap in a pipeline phase, contradicting the pipeline's own "does NOT run `/concept`" precondition. Editing skill A against an assumption skill B's contract contradicts — a class of silent bug.

## Cost signals
- Phases: concept+architecture (designer) → architecture-critique → revise → re-critique → write-code (4-file, ~100 LOC markdown) → verify PASS → code-review → retire-docs.
- 1 revision cycle. Score progression 7.8 → 8.9. Round-1 CRITICAL 2 → final 0.
- Green phase: 0 test files (markdown-only). Verify PASS (2913 tests, all pre-existing).

## For future workpackages
1. **Process/skill-only WPs don't fit TDD red-phase.** Consider a "spec definition" framing instead of "test writing" when a WP has no runtime — so future process-WPs don't burn a cycle deciding whether to invent fake tests.
2. **Cross-skill contract gaps are a recurring bug class.** Before editing a skill that dispatches to another skill, verify the target skill's live precondition in writing. Static/checklist territory, not a test.
3. **Check whether a constraint is a law or an assumption.** The elegant fix moved the recap *upstream* into `/concept` (where it already runs) rather than amending the pipeline precondition or adding a lateral phase.

## JSONL (orchestrator appends to retro-log.jsonl)
```json
{"workpackage":"AJ2","phase_sequence":["concept","architecture","architecture-critique","revise","re-critique","write-code","verify","code-review","retire-docs"],"phase_count":9,"revision_cycles":1,"critical_findings_round1":2,"critical_findings_final":0,"score_progression":[7.8,8.9],"key_insight":"Process/skill-only WPs (no runtime) produce no test artifacts — red phase produced nothing; verification was diff-read + human walkthrough. Consider 'spec definition' framing for process-only red phase.","recurrence_signal":"Cross-skill contract gaps: designer edits one skill assuming another skill's behavior without checking its live precondition — caught by round-1 critique. Guard: 'verify target-skill contract before editing a dispatch site'.","acceptance_valid":true}
```
