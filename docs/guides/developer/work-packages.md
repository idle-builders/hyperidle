# Work Packages

Work packages are the unit of delivery. A work package's spec is `.pipeline/work/<id>/plan.md`, registered in a per-track coordination file `.pipeline/<track>.md` (WP registry table + dependency graph). `/refine` adds `requirements.md`, `/design` adds `design/`, `/architecture` adds `architecture.md` + `feasibility.md`, all alongside `plan.md`. A package that has not been refined yet has no plan — its registry row in `.pipeline/<track>.md` is the whole record, and the plan is written with the maintainer at refinement. Each work package carries acceptance criteria; per-WP progress lands in `.pipeline/progress/<id>.json`, retro observations in `.pipeline/retro-log/<id>.jsonl`.

Pipeline phases, skill routing, and orchestration mechanics are owned by [.claude/rules/skill-discovery.md](../../../.claude/rules/skill-discovery.md) — this page only orients a developer.

## Build flow

TDD, always: red tests from the acceptance criteria → implement to green → refactor → verify. The full validation doctrine (which criterion gets a test vs a lint rule, verify commands) is in the repo root [CLAUDE.md](../../../CLAUDE.md).

## Design phase

A UI work package runs `/pipeline:design` → `/pipeline:design-critique` before any build phase. Variants are TSX, not mockups: each variant is an isolated `.stories.tsx` story — the story IS the design artifact, and the approved story flows straight into architecture and write-code with no HTML-to-TSX rebuild. Data-fed surfaces mount via the [isolation harness](./design-system.md#rendering-data-fed-surfaces-in-isolation).

## Human concept review

`/pipeline:human-concept-review` is a conditional, stakes-gated phase after the critiques. It fires when **either** signal is high-stakes:

| Signal | Emitted by | High-stakes value |
|---|---|---|
| `DESIGN-CLASS` | `/pipeline:design` | `novel` (large redesign or new essential primitive) |
| `DOC-CLASS` | `/pipeline:refine` | `significant` (new or heavily rewritten user/dev-guide page) |

The founder reviews the user/dev-guide draft and the rendered variant, and the planner revises code + draft to approval. The gate reads the emitted class lines verbatim — it never re-classifies and never checks whether a human is present.

**Park, don't auto-ship.** A high-stakes work package in an autonomous run does not ship unreviewed: the pipeline parks it (writes a park status to its progress file) and stops that work package; sibling work packages proceed. Parked is distinct from `blocked` (something failed) — the resolution is a founder review, not a bugfix.

**Planning-time forecast.** A WP spec may carry an advisory **Human design review.** `Yes | No` field. It forecasts whether the WP will park; the design-time classification is authoritative and overrides a `No` forecast.
