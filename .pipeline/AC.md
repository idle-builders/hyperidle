# Track AC: Outcome Measurement & Scoring

Close the feedback loop between work and learning. HyperIdle tracks whether work ran (session outcome: completed/crashed) but not whether it achieved its goal. This track makes measurement a signal that flows through the system, so bets, agents and knowledge can learn from results.

**Key narrative.** Measurement is progressive. Each work package adds optional scoring that enhances but never blocks the existing bet/task/session lifecycle. A bet can still ship without a score; the score adds signal, not a gate — unless the team opts into verification gates via AC5.

**Inspiration.** Anthropic's Outcomes feature (separate-context evaluator with rubrics), the CLEAR framework, Paperclip's false-success problem (agents self-certifying "done"), and the Execute → Coach → Distill → Improve loop.

**Foundation already shipped.** AC1 (structured outcome fields — `outcomeVerdict` on bets and tasks, PR #210) and AC2 (bet hypothesis validation flow, PR #211) are merged. Everything below builds on those fields.

**Constraint.** "Outcome" and "Rubric" are new primitives — run `/pipeline:refine <id>` before building any of these.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AC3 | Outcome grading: an independent evaluator agent grades task outcomes against their done conditions, in a separate context from the producing agent | backend | L | AC1 (shipped) | unbuilt — carried from the legacy track file. Catches false-success: agents mark work "done" while the artifact does not meet the criterion. Without it the only quality gate is manual human review, and AC1's session-effectiveness scores stay empty because nobody populates them. |
| AC4 | Multi-dimensional scoring rubrics: quality measured along the axes that matter for each kind of work, not one pass/fail verdict | backend | L | AC3 | unbuilt — carried from the legacy track file. A single met/not-met verdict says a task passed but not why; multi-dimensional scores let a team see which dimension it is systematically weak on. |
| AC5 | Verification gates: a task requires independent verification before reaching "done" | backend | M | AC3 | unbuilt — carried from the legacy track file. **Opt-in by design** — AC3's signal is advisory and easy to ignore under deadline pressure; this makes it structural for teams that want it, and stays off for teams that prefer speed. |
| AC6 | Outcome-based knowledge learning: outcome data feeds back into knowledge relevance scoring | backend | L | AC1 (shipped) | unbuilt — carried from the legacy track file. Relevance scoring weighs six factors, none of which measure whether the knowledge actually helped; two of the eight attention signals (impact, usage) are stubbed at zero precisely because no outcome data exists to inform them. |
| AC7 | Portfolio metrics & learning velocity: aggregate hypothesis-validation rate, cost efficiency and agent effectiveness across bets and teams | frontend/backend | L | AC1, AC2 (both shipped) | unbuilt — carried from the legacy track file. The founder's meta-view: is prediction accuracy improving, are tasks getting cheaper per successful outcome, which agents consistently deliver. Learning velocity flat means the system is not compounding. |

## Dependency graph

- `AC3` → `AC1` (shipped): the evaluator writes into the verdict fields AC1 added.
- `AC4` → `AC3`: rubrics configure an evaluator that must exist first.
- `AC5` → `AC3`: the gate consumes the evaluator's signal.
- `AC6` → `AC1` (shipped): consumes the session-effectiveness scores.
- `AC7` → `AC1`, `AC2` (both shipped): aggregates the per-bet and per-task verdicts they record.
- `AC4` and `AC5` are independent of each other — both need only AC3.
