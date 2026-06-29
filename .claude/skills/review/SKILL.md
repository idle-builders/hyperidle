---
name: review
description: "Read-only review: 3 positive lenses (architecture, design, security), 3 negative lenses (adversarial, simplification, slop), plus AC completeness audit. The single comprehensive review skill."
argument-hint: "[file paths or workpackage-id]"
user-invocable: true
min_tool_calls: 12
---

# Review

Read-only review. Produce findings — do NOT make code changes.

Six lenses + AC completeness audit, one session. Three positive lenses check the code respects contracts. Three negative lenses check what the contracts don't cover. Skip the design lens silently if no UI files changed.

**Why:** The agent that built it is the least qualified to verify it — it's biased toward believing its own work is correct. A fresh-context reviewer catches contract violations the implementer rationalized away, gaps the builder didn't notice, and complexity the builder introduced without realizing it.

## Required reading (do ALL before reviewing code)

1. The workpackage in the relevant track file under `.pipeline/work-packages/TRACK-*.md` — extract every acceptance criterion
2. `plans/<workpackage-id>/architecture.md` — the technical plan (always start here), especially its "Security & abuse cases" block
3. The specific authoritative files named in the plan's **Required reading** section — read each end-to-end
4. `plans/<workpackage-id>/concept.md` — the locked concept output, if present
5. `plans/<workpackage-id>/design/approved.md` — the approved design spec (if UI story)
6. `CLAUDE.md` (tech stack), `packages/design-system/DESIGN.md` + `PRINCIPLES.md` (if UI), canonical-shapes contracts under `docs/<topic>/`
7. `.claude/rules/typescript.md` — TypeScript rules the code must follow

Then read ALL changed files (via `<target>` or `git diff --name-only`).

## Be thorough — be hostile

Read every changed file end-to-end. For each file, verify it against the relevant spec section. Don't skim — open the doc, find the section, compare field-by-field, state-by-state, endpoint-by-endpoint. If a state machine has 8 states in the spec, count the states in the code. Surface-level "looks right" is not review.

Read every function body. Check every `as` cast. Open every test file and verify the assertions actually test something meaningful. If a test says it tests drag-drop, check that the drag-drop library's hooks are actually invoked. If a component claims accessibility, Tab through the focus order mentally. The failure mode is "looks fine" — fight it.

---

## Lens 1: Architecture

- **Layer violations** — does any layer reach past its neighbor?
- **API contracts** — do routes, methods, request/response shapes match architecture docs?
- **Data model alignment** — do fields, types, constraints, indexes match schema requirements exactly?
- **State machines** — do all states and transitions match the spec?
- **Event bus** — are all specified events present with correct payloads?
- **Naming** — do names honestly describe what things do?
- **Component boundaries** — is responsibility correctly assigned across packages?
- **Spec contradictions** — if two docs disagree, flag it
- **Doc staleness** — if the implementation changes behavior that a doc in `docs/` describes (API shape, state machine, UI layout, lifecycle, data model), flag the stale doc section as CRITICAL. The builder must update the doc in the same PR. Docs are not "someone else's problem" — they are part of the deliverable.

---

## Lens 2: Design (skip if no UI files changed)

Check every component against its spec. If the spec says 4 columns, count the columns. If it specifies motion values (80/150/250ms), check the CSS transitions.

- **Component budget** — only the custom components catalogued in `packages/design-system/DESIGN.md`. Any additions need a written reason.
- **Reuse** — read `packages/design-system/src/index.ts` before the diff. Any new component, hook, or helper whose job an existing design-system export, `@hyperidle/shared` registry, or `utils/` function already does is CRITICAL — the fix is adoption or extension, not a polished fork. A deliberate exception needs a `@lore` comment naming the reason.
- **Reinvention tells** — grep for hand-rolled `rounded-full` initials (→ `Avatar`), local status→color/label builders (→ `StatusChip` + `status-mapping.ts`), inline date math or `toLocaleDateString` (→ shared time formatter), bare `animate-pulse` (→ `Skeleton`), hand-built button styling (→ `Button`), a third copy of anything (→ promote it).
- **Consistency** — same visual role = same treatment everywhere. Compare borders, spacing, radii, typography, hover states across sibling components.
- **Token compliance** — no hardcoded colors, spacing, radii, or font sizes. No raw Tailwind color classes.
- **States** — are ALL states handled (empty, loading, error, populated)?
- **Action → feedback loop** — every user action must produce visible acknowledgment on the current screen. Missing pending/loading indicator after submit is CRITICAL.
- **State-conditional affordances** — menus and action lists must filter options by what is semantically valid in the current state.
- **DS promotion** — if a new component will be consumed by 2+ pages, it belongs in `packages/design-system/`, not page-local.
- **Accessibility** — focus management, aria labels, keyboard navigation, focus traps, roving tabindex
- **Design system** — does a `.stories.tsx` file exist? Do classes use Hearth tokens (`packages/design-system/src/tokens.css`)? Does every referenced `var(--…)` actually exist in tokens.css? A dangling token reference renders as silent breakage — CRITICAL.
- **Layout** — does the page layout match the approved design and the app-shell structure in `docs/information-architecture/`?
- **AI aesthetic violations** — oversized padding, purple gradients, hero sections, decorative icons
- **Information density** — 8-12px padding, tight spacing, precision instrument aesthetic
- **Motion** — transitions match spec values (80/150/250ms), no instant snaps

### Visual verification

Look at pixels, not code. Open the component story in the live TSX viewer (`npm run ds:serve`, then navigate to `http://localhost:8098/#<ComponentName>`). The vitest DOM-snapshot net (`npm run test`) catches class/markup/marker regression; for *painted-pixel* review open the story in the live viewer (`npm run ds:serve` → `:8098/#<ComponentName>`) and look, or `npx playwright screenshot http://localhost:8098/#<ComponentName> /tmp/review.png` to read the PNG. Include screenshot paths and diff evidence in findings.

---

## Lens 3: Security

Check every endpoint for input validation. Grep for known dangerous patterns — don't rely on just reading the changed files.

### Bad patterns (find what shouldn't exist)

- **STRIDE** — Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege
- **Input validation** — unsanitized user input, missing schema validation at boundaries
- **Auth** — missing authorization checks, leaked internal state, privilege escalation
- **OWASP top 10** — injection, broken access control, cryptographic failures, SSRF
- **Agent-specific** — prompt injection, workspace escape, knowledge poisoning, tool misuse
- **XSS** — `dangerouslySetInnerHTML`, unescaped template literals, innerHTML assignments
- **Dangerous patterns** — grep for `eval`, `Function(`, `innerHTML`, `dangerouslySetInnerHTML`, `child_process`, `exec(` across the codebase, not just changed files

### Absence checks (find what should exist but doesn't)

- **Human-text → agent-context sanitization** — every path where user-supplied text reaches agent context must have sanitization (unicode normalization, control char stripping, format char removal). Missing sanitization is CRITICAL.
- **Rate limiting on new action endpoints** — any new POST/PUT/DELETE must have per-identity rate limiting.
- **Scoped authorization on new resources** — verify authorization is scoped to the actor's team/workspace, not "anyone with a valid session."
- **Concurrent-write handling** — create-or-update patterns must handle race conditions.

---

## Lens 4: Adversarial (hostile personas)

Switch mindset: you are no longer checking contracts — you are trying to break the code. Read the diff through three hostile personas:

**The Saboteur** — Could a working backdoor or silent regression pass tests, lint, and a normal review? Where could a race condition fire only at scale? What test was weakened?

**The New Hire (Day 7)** — Reading this code cold, what would take 10 minutes to understand that should take 10 seconds? Which name lies about its behavior? What invariant must you know that nothing tells you?

**The Auditor** — Does every claim in the PR description match the diff? "Rate-limit added" — is it actually wired up? Coverage claims supported?

Also review for:
- **Over-abstraction** — helpers for one-time ops, factories with one product, generic solutions to specific problems
- **Missing error paths** — what happens when this throws? Who catches it? What state is left?
- **Type safety** — `any`, `as`, `@ts-ignore`, `!` assertions. Count them. Each one is a finding.
- **Coupling** — shared mutable state, import cycles, god objects
- **Test quality** — happy-path-only tests, tautologies, tests that mock everything
- **Stubbed harness seam (BLOCKING)** — a harness/agent-touching AC proven only by a stubbed/scripted/`vi.mock`'d adapter in `*.integration.test.ts` is a false green (CC-004) and is a **blocking** finding, not advisory. The proof must hit the real installed harness, gated by `requireHarness(<name>)` (the honest gate — never a key proxy); an absent binary must hard-fail via `requireHarness`, not `skipIf`. Track AR1 enforces this via the `honest-harness-guard` lint check (`scripts/honest-harness-guard.ts`) + the attestation agentic floor; a new dirty harness-facing integration file that is not on `scripts/honest-harness-guard.allowlist.json` fails the build. See `.claude/rules/testing.md` §Integration tests: two archetypes.
- **Performance** — N+1 queries, unbounded lists, missing indexes, allocations in render loops

---

## Lens 5: Simplification

Flag anything where the same result could be achieved with simpler means:
- Helpers used only once (inline them)
- Premature generics
- Dead code and unused exports
- Commented-out code
- Error handling for impossible scenarios
- Unnecessary async (async on functions that never await)
- Wrapper types adding no value

---

## Lens 6: AI Slop

Flag AI-generated code anti-patterns:
- **Verbose naming** — shorten when context is clear
- **Unnecessary comments** — comments that restate the code
- **Over-abstraction** — single-use helpers, trivial wrappers
- **Defensive over-engineering** — null checks for non-nullable types, try-catch around non-throwing code, validation of internal args
- **Unnecessary async** — async on functions that never await
- **Filler** — empty catch blocks, `=== true`, redundant else-return
- **AI tell-tales** — "TODO: implement" on implemented code, "simplified version", "for now", "in production"

---

## AC Completeness Audit

For each acceptance criterion from the workpackage:

1. **Complete?** — find the implementation and test that address it
2. **Correct?** — compare against the spec (not just "does it work")
3. **Proven?** — can you prove to someone else this works? What is the evidence?

Watch for subtle incompleteness:
- "error handling" ≠ happy-path-only code
- "validates input" ≠ a schema that accepts everything
- A criterion with multiple conditions (A *and* B) requires proof of both
- "accessible" ≠ "it renders"

### How to prove things

"I implemented it" is not proof. Only observable output is proof.

| Criterion type | How to prove it | Example |
|---------------|----------------|---------|
| Schema/data model | Run the migration, inspect the DB | `npm run db:migrate && sqlite3 data.db ".schema"` |
| API endpoint | Call it and show the response | `curl localhost:3001/api/health` or integration test |
| Type safety | Run the type checker | `npm run check` — zero errors |
| Test coverage | Run tests with coverage | `npm run test:coverage` — show % for new files |
| Behavior | Run the specific test that exercises it | `npm run test -- schema.test.ts` |
| UI/visual | **Take a Playwright screenshot and look at it** | `cd packages/web && npx playwright screenshot http://localhost:5173/<route> /tmp/review-<name>.png --wait-for-timeout=3000` then read the PNG |
| Error handling | Trigger the error path in a test | Test that sends bad input and asserts expected error |
| FK/constraints | Insert violating data, show it rejects | Test that inserts orphan row and asserts FK error |

For UI criteria, look at pixels not code. Missing E2E coverage for UI criteria is NOT DONE.

---

## Output

Structured findings per lens: CRITICAL / WARNINGS / OBSERVATIONS with file paths, line numbers, AND the spec reference (doc + section) for each finding. Screenshot evidence for visual issues.

AC table: each acceptance criterion → PASS (with evidence) or FAIL (with gap description).

Verdict: **DONE** (all criteria pass, zero critical findings) or **NOT DONE** (list every gap and critical finding).

**Don't rationalize passing:**
- "The tests pass, so the criterion is met" → tests prove code behavior, not that the RIGHT thing was built.
- "This criterion is obviously met" → if it's obvious, proving it takes 30 seconds.
- "Close enough, I'll fix it next workpackage" → deferred gaps become permanent.

## Target

$ARGUMENTS
