---
name: contract-review
description: "Read-only review against architecture, design, and security contracts. Domain knowledge for the reviewer persona — all three lenses in one session."
argument-hint: "[file paths or story-id]"
user-invocable: true
min_tool_calls: 12
---

# Contract Review

Read-only review. Produce findings — do NOT make code changes.

Three lenses, one session. Skip the design lens silently if no UI files changed.

## Required reading (do ALL before reviewing code)

1. `plans/<workpackage-id>/architecture.md` — the technical plan (always start here), especially its "Security & abuse cases" block
2. The specific authoritative files named in the plan's **Required reading** section — read each end-to-end
3. `plans/<workpackage-id>/concept.md` — the locked concept output, if present
4. `plans/<workpackage-id>/design/approved.md` — the approved design spec (if UI story)
5. `CLAUDE.md` (tech stack), `packages/design-system/DESIGN.md` + `PRINCIPLES.md` (if UI), canonical-shapes contracts under `docs/<topic>/`
6. The relevant track file in `plans/work-packages/TRACK-*.md`

Then read ALL changed files (via `<target>` or `git diff --name-only`).

## Be thorough

Read every changed file end-to-end. For each file, verify it against the relevant spec section. Don't skim — open the doc, find the section, compare field-by-field, state-by-state, endpoint-by-endpoint. If a state machine has 8 states in the spec, count the states in the code. Surface-level "looks right" is not review.

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

---

## Lens 2: Design (skip if no UI files changed)

Check every component against its spec. If the spec says 4 columns, count the columns. If it specifies motion values (80/150/250ms), check the CSS transitions.

- **Component budget** — only the 19 approved custom components. Any additions need a written reason.
- **Component reuse** — is existing design system code used where it should be? Read `packages/design-system/src/` to know what exists.
- **Consistency** — same visual role = same treatment everywhere. Compare borders, spacing, radii, typography, hover states across sibling components.
- **Token compliance** — no hardcoded colors, spacing, radii, or font sizes. No raw Tailwind color classes.
- **States** — are ALL states handled (empty, loading, error, populated)?
- **Action → feedback loop** — every user action must produce visible acknowledgment on the current screen. Missing pending/loading indicator after submit is CRITICAL.
- **State-conditional affordances** — menus and action lists must filter options by what is semantically valid in the current state.
- **DS promotion** — if a new component will be consumed by 2+ pages, it belongs in `packages/design-system/`, not page-local.
- **Accessibility** — focus management, aria labels, keyboard navigation, focus traps, roving tabindex
- **Design system** — does a `.stories.tsx` file exist? Do classes match Lucid theme tokens?
- **Layout** — does the page layout match the spec (IconRail | Submenu | Main | Rail)?
- **AI aesthetic violations** — oversized padding, purple gradients, hero sections, decorative icons
- **Information density** — 8-12px padding, tight spacing, precision instrument aesthetic
- **Motion** — transitions match spec values (80/150/250ms), no instant snaps

### Visual verification

Look at pixels, not code. Run `cd packages/web && bun run visual:compare <reference-name>` to generate pixel diffs. Read the reference.png, implementation.png, and diff.png. Include screenshot paths and match percentages in findings.

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

## Output

Structured findings per lens: CRITICAL / WARNINGS / OBSERVATIONS with file paths, line numbers, AND the spec reference (doc + section) for each finding. Screenshot evidence for visual issues.

## Target

$ARGUMENTS
