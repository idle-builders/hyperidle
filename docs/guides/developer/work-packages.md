## Work Packages

Stories are defined in `.pipeline/work-packages/TRACK-*.md` files (A through J). Each track has numbered stories with acceptance criteria. Implementation follows TDD:

1. Read the acceptance criteria from the track file
2. Write failing tests (red)
3. Implement until tests pass (green)
4. Simplify (refactor)
5. Verify: `npm run check && npm run lint && npm run test`

## Design lifecycle and the human-review gate

A UI workpackage runs through `/design` → `/design-critique` before the build phases. Two facts matter for contributors:

- **Variants are TSX, not mockups.** `/design` authors each variant as an isolated `.stories.tsx` story; a data-fed surface mounts via the [isolation harness](./design-system.md#rendering-data-fed-surfaces-in-isolation). The approved story flows straight into `/architecture` + `/write-code` — there is no HTML-to-TSX rebuild step.
- **`/human-concept-review` is a conditional phase** that runs after `/design-critique`, gated purely on **stakes** — never on whether a human is present. It fires only when the design is high-stakes or the doc rewrite is significant, read from the `DESIGN-CLASS` or `DOC-CLASS` line `/design` already emits:

  | `DESIGN-CLASS` | `/human-concept-review` |
  |---|---|
  | `novel` (large redesign or new essential/base component) | **Runs** (or parks — see below) |
  | `routine` / `routine-low-conf` | Skipped — pipeline proceeds to build |

  The mapping is the unit-tested `conceptReviewDecision()` helper in `@hyperidle/shared` (`novel → "run"`, everything else → `"skip"`; also fires on significant `DOC-CLASS`); the gate reads `DESIGN-CLASS`, it never re-classifies and never adds a presence check.

When it fires, the founder opens the rendered variant in the viewer (`npm run ds:serve`, `:8098`), attaches element-anchored feedback over MCP (a standalone annotation tool wired via `claude mcp add` — never a HyperIdle dependency), and the designer agent revises the TSX until the founder approves.

**Park, don't auto-ship.** A `novel` design in an autonomous run does **not** ship unreviewed — the pipeline writes `status: "awaiting-human-concept-review"` to `.pipeline/progress/<id>.json` and stops that workpackage (siblings proceed). This is a distinct status, not `blocked` (which means something failed); the resolution is the founder running the review, not a bugfix. High-stakes design is not autonomously shippable — the one place the pipeline yields to stakes rather than presence.

**Planning-time forecast.** `/work-planning` (and `/refine` where it runs) records a highlighted **Human concept review.** field (`Yes | No`) on every workpackage spec, forecasting whether the WP will park. It is advisory only — `/design`'s `DESIGN-CLASS` at design time is authoritative. A `No` forecast does not suppress review if `/design` later classifies the design `novel`.
