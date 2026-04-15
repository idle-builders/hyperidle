---
name: check-definition-of-done
description: "Independent audit: is every acceptance criterion met with evidence?"
argument-hint: "[story-id]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Agent
---

# Check Definition of Done

**Why:** The agent that built it is the least qualified to verify it — it's biased toward believing its own work is correct. An independent auditor catches gaps the implementer rationalized away. Without this gate, "it works on my machine" becomes "it shipped broken."

You are an independent auditor for `$ARGUMENTS`. Trust nothing — only what you can observe and run.

Read the story in `docs/WORK_PACKAGES.md`. Extract every acceptance criterion.

For each criterion:
1. **Complete?** — find the implementation and test that address it
2. **Correct?** — compare against the spec (not just "does it work")
3. **Proven?** — can you prove to someone else this works? What is the evidence?

Watch for subtle incompleteness:
- "error handling" ≠ happy-path-only code
- "validates input" ≠ a schema that accepts everything
- A criterion with multiple conditions (A *and* B) requires proof of both
- "accessible" ≠ "it renders"

For correctness, compare against the spec — not just "does it work":
- API contracts: do routes, methods, request/response shapes match the architecture docs?
- Data models: do fields, types, constraints, relations match the schema requirements?
- Edge cases: are they handled, not just the golden path?

## How to prove things

Use every tool at your disposal. "I implemented it" is not proof. Only observable output is proof.

| Criterion type | How to prove it | Example |
|---------------|----------------|---------|
| Schema/data model | Run the migration, inspect the DB | `bun run db:migrate && sqlite3 data.db ".schema"` |
| API endpoint | Call it and show the response | `curl localhost:3001/api/health` or write a test that hits it |
| Type safety | Run the type checker | `bun run check` — zero errors proves types are correct |
| Test coverage | Run tests with coverage | `bun run test:coverage` — show % for new files |
| Exports/imports | Grep for the export and its consumers | `Grep(pattern: "createTestDb")` to verify it's exported and importable |
| Config/setup | Show the file exists with correct content | `Read(file_path: "drizzle.config.ts")` |
| Behavior | Run the specific test that exercises it | `bun run test -- schema.test.ts` and show the output |
| Performance | Run a benchmark or timed test | `time bun run test` or a specific perf test |
| UI/visual | Take a screenshot or run Playwright | `bun run test:e2e` or inspect the rendered component |
| Error handling | Trigger the error path in a test | Show a test that sends bad input and gets the expected error |
| FK/constraints | Insert violating data, show it rejects | Test that inserts an orphan row and asserts the FK error |
| Seed/fixtures | Run the seed, count rows | `bun run db:seed && sqlite3 data.db "SELECT count(*) FROM products"` |

Spawn specialist agents as needed: **architect** for API/layer compliance, **qa** for test coverage gaps, **security-researcher** for auth/validation criteria.

Verdict: **DONE** (all criteria pass with evidence) or **NOT DONE** (list every gap).

**Don't rationalize passing:**
- "The tests pass, so the criterion is met" → tests prove code behavior, not that the RIGHT thing was built. Compare against the spec.
- "This criterion is obviously met" → if it's obvious, proving it takes 30 seconds. If you can't prove it, it's assumed, not obvious.
- "Close enough, I'll fix it next story" → next story has its own criteria. Deferred gaps become permanent.
