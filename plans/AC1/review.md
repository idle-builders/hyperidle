# AC1 Code Review -- Structured Outcome Fields

**Reviewer:** Phase 4 (code review), carrying forward Phase 2 design + architecture critique context.
**Branch:** `feat/AC1-structured-outcome-fields`
**Verdict:** DONE

---

## AC Completeness Audit

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | Bet hypothesis verdict (validated/refuted/partial/inconclusive) as structured field | PASS | `POST /api/bets/:id/outcome` with Zod `z.enum(BET_OUTCOME_VERDICTS)` validation. Integration tests in `AC1-bet-outcome.test.ts` lines 92-104, 107-117, 119-130. DB column `outcome_verdict` on bets table. |
| AC-2 | Task outcome verdict (met/met_with_rework/partially_met/not_met) set during review | PASS | `PATCH /api/tasks/:id` extended with `outcomeVerdict` field. Integration tests in `AC1-task-outcome.test.ts` lines 75-100. Audit trail updated on write (lines 127-138). |
| AC-3 | Session effectiveness score (0-1) | PASS | `PATCH /api/sessions/:id` extended with `effectivenessScore`. Zod `z.number().min(0).max(1)`. Stored as text per schema convention. Tests in `AC1-session-effectiveness.test.ts` lines 94-108, 111-122. |
| AC-4 | All default to "not evaluated" (null) | PASS | All 10 new DB columns are nullable with no default. Test in `AC1-bet-outcome.test.ts` lines 133-141 verifies null on new bets. |
| AC-5 | Visible on bet detail | PASS | WorkBet.tsx outcome section (lines 1272-1403): view/editing states, verdict badge, summary text, "Record outcome"/"Edit outcome" buttons. Task row verdict badges (lines 1551-1558). Component tests in `WorkBet.outcome.test.tsx` (14 tests). |
| AC-6 | Visible on task detail | PASS | WorkTask.tsx meta-strip Outcome cell (lines 361-373). Session effectiveness score in SessionRow (lines 132-141). Component tests in `WorkTask.outcome.test.tsx` (4 tests). |
| AC-7 | Visible in Work portfolio | PASS | BetCard verdict badge via `outcomeVerdict` prop (BetCard.tsx lines 189-197). Passed from WorkPortfolio (line 371). Component tests in `WorkPortfolio.outcome.test.tsx` lines 166-176. |
| AC-8 | Queryable -- portfolio filterable by verdict | PASS | Multi-select verdict filter pills in WorkPortfolio (lines 218-249). Client-side filtering in `filteredBets` memo (lines 106-117). Component tests in `WorkPortfolio.outcome.test.tsx` lines 100-164. |

All 6 original ACs are met. The architecture plan's extended ACs (9-13) are also covered by tests.

---

## Lens 1: Architecture (Positive)

**Layer integrity:** Human Interface (web) calls Meta Layer (server) via REST. No layer skipping. The server writes to DB via Drizzle. Types flow from shared -> server/web. Clean.

**API contracts match the plan:**
- POST `/api/bets/:id/outcome` -- matches architecture plan section 4 exactly. Zod schema with `verdict: z.enum(BET_OUTCOME_VERDICTS)`, `summary: z.string().max(2000).optional()`. Status guard for completed/killed. Revision log on overwrite.
- PATCH `/api/tasks/:id` extended with `outcomeVerdict` -- matches plan. Audit trail updated.
- PATCH `/api/sessions/:id` with `effectivenessScore` -- matches plan. State made optional (W-1 fix from architecture critique). Score stored as text per schema convention.

**Data model matches spec:**
- Bets: 4 columns (outcomeVerdict, outcomeSummary, outcomeRecordedAt, outcomeRecordedBy) -- correct.
- Tasks: 3 columns (outcomeVerdict, outcomeRecordedAt, outcomeRecordedBy) -- correct.
- Sessions: 3 columns (effectivenessScore, effectivenessRecordedAt, effectivenessRecordedBy) -- correct.
- All nullable, all text type -- matches plan and existing schema convention.

**W-1 fix (session state optional):** Confirmed. `updateSessionSchema.state` is `z.enum(["done", "crashed"]).optional()`. Session_ended event only emitted when state is present. Test at `AC1-session-effectiveness.test.ts` line 94 proves effectiveness-only PATCH works without state.

**W-2 fix (betTasks explicit column select):** Confirmed. `betTasks` select in `bets.ts` line 475-476 adds `outcomeVerdict: tasks.outcomeVerdict` and `outcomeRecordedAt: tasks.outcomeRecordedAt`.

**Migration:** 0026_cuddly_zombie.sql has all 10 ALTER TABLE ADD COLUMN statements. All nullable. Matches plan.

**Diff scope:** The diff delivers every task in the plan. No extra endpoints, no extra columns, no scope creep.

---

## Lens 2: Design (Positive)

**TSX matches approved design:**

- Outcome section position: after stat cards row, before pitch section -- matches design section 1.1. Confirmed at WorkBet.tsx line 1271 (after `bet-stats-row` div, before `bet-pitch-section`).
- Not-evaluated state: "Not evaluated" text + "Record outcome" button -- matches design.
- Populated state: verdict badge + "Edit outcome" button + summary text -- matches design.
- Editing state: `<form>` with select + textarea + Cancel/Save -- matches design.
- Badge style: neutral `bg-[var(--surface-container)] text-[var(--text-secondary)]` -- matches design section 1.1 ("DEFAULT neutral badge style").
- Task row verdict badges: before state badge, only when not null -- matches design section 1.2.
- Meta-strip Outcome cell: last position, "--" when null, verdict label when populated -- matches design section 2.1.
- Session effectiveness: plain number, 2dp, font-mono tabular-nums -- matches design section 2.2.
- Portfolio verdict pills: multi-select, bordered-pill style matching team pills -- matches design section 3.1.
- BetCard verdict badge: after status badge, neutral style -- matches design section 3.2.

**States present:**
- Default (not evaluated): present
- Populated: present
- Editing: present (inline form)
- Saving: present (Save button shows "Saving..." and is disabled, line 1396)
- Error: present (inline error below save, line 1379-1381)
- Loading: N/A (outcome section is part of bet detail, which handles loading at page level)
- Empty: present (shows "Not evaluated" with action button)

**Tokens only:** All colors use CSS custom properties (`--surface-container`, `--text-secondary`, `--accent-primary`, `--border-subtle`, etc.). All spacing uses the Hearth grid values (3, 6, 9, 12, 18, 24). All font sizes on the closed type scale (11, 12, 13, 14). No hardcoded colors.

**Accessibility:**
- W-1 (aria-label on verdict badge): Confirmed. `aria-label={`Outcome: ${bet.outcomeVerdict}`}` on the badge at line 1287. Test verifies at `WorkBet.outcome.test.tsx` line 110-119.
- W-2 (use `<form>` element): Confirmed. `<form aria-label="Record bet outcome">` at line 1331. Test verifies at line 132-139.
- Keyboard: Select and textarea are standard form elements with tab navigation. Cancel/Save buttons have proper type attributes.
- Filter pills: `aria-pressed` attribute on verdict filter buttons (line 226).

**Stories:** `BetCard.stories.tsx` has a new `WithVerdictBadge` story showing all four verdict values plus a "not evaluated" card.

---

## Lens 3: Security (Positive)

**STRIDE assessment:**

| Threat | Status | Evidence |
|---|---|---|
| Spoofing | Mitigated | 401 test in each API test file confirms auth is required. |
| Tampering (verdict enum injection) | Mitigated | Zod `z.enum()` at API boundary rejects unknown values. Test: `AC1-bet-outcome.test.ts` line 175 (invalid verdict -> 400). |
| Tampering (summary overflow) | Mitigated | Zod `.max(2000)` on summary field. Test: line 194 (2001 chars -> 400). |
| Tampering (effectiveness range) | Mitigated | Zod `.min(0).max(1)`. Tests: lines 152, 162 (1.5 and -0.1 -> 400). |
| Information Disclosure | N/A | No new secrets. Outcome data is intentionally visible. |
| Denial of Service | Mitigated | Existing rate-limit middleware applies. No new unbounded queries. |
| Elevation of Privilege | N/A | No new role-based restrictions in AC1 (by design -- "any user with write access"). |

**Input validation complete.** All three new write paths (bet outcome POST, task outcome PATCH, session effectiveness PATCH) validate at the Zod boundary.

**No XSS surface.** Summary text is rendered via React's default escaping (`<p>{bet.outcomeSummary}</p>`). No `dangerouslySetInnerHTML`.

---

## Lens 4: Adversarial (Negative)

**F-1 (LOW): Merge conflict markers in attestation file.** The file `.verify-attestations/e50e6d9103b2d842fa9f50d955393594e89b2e50.json` contains git merge conflict markers (`<<<<<<<<`, `========`, `>>>>>>>>`). This is a committed conflict. It will not affect runtime (attestation files are consumed by CI, and the latest attestation `0a5af5a8...` is clean), but it is noise in the diff. The builder should delete this file or resolve the conflict before merge.

**F-2 (OBSERVATION): BetOutcomeVerdict cast in Zod.** At `bets.ts` line 144: `z.enum(BET_OUTCOME_VERDICTS as unknown as [string, ...string[]])`. Same pattern at `tasks.ts` line 31. This `as unknown as` cast works around Zod's `z.enum()` requiring a mutable tuple type while the source is `readonly`. This is a known Zod limitation and the cast is safe (the values are a closed const array). Acceptable.

**F-3 (OBSERVATION): `c.get("userId")` can be undefined.** In the bet outcome handler (line 771), `actor = c.get("userId")` is used without a null check. This is correct -- `outcomeRecordedBy` is nullable in the schema, and undefined from auth context writes null to DB. The fallback in sessions (line 310: `actor ?? existing.agentId`) is also correct. No issue.

**F-4 (LOW): `updates` record uses `Record<string, string | null>` but sets non-string values.** In `tasks.ts` line 119, `updates` is typed as `Record<string, string | null>`, but `outcomeRecordedBy` at line 131 calls `c.get("userId") ?? null` which can be `undefined ?? null = null`. This is actually fine since `?? null` coerces undefined to null. However, the type annotation is slightly loose -- it works because Drizzle accepts these at the `.set()` call. No runtime issue.

**F-5 (OBSERVATION): No `as` casts in page-level code.** Zero unsafe casts in WorkBet.tsx, WorkTask.tsx, WorkPortfolio.tsx. The `as typeof outcomeVerdictForm` at line 1351 is a controlled narrowing within a select onChange. Clean.

**Test quality:**
- All API tests use `createTestDb()` and `createTestApp()` -- real Hono app, real PGLite DB. No filesystem-reading tests.
- Frontend tests use `@testing-library/react` with `userEvent` for interaction testing. No `waitFor` timeout hacks.
- Tests assert on specific values, not just `toBeDefined()` or `not.toThrow()`.
- Boundary values tested: effectivenessScore 0, 1, 1.5, -0.1. All four verdict enum values tested.
- Auth (401) tests in all three API test files.

---

## Lens 5: Simplification (Negative)

**No findings.** The implementation is clean and minimal:
- Zero new components created (all composed from existing DaisyUI primitives + inline styling).
- No single-use helpers -- `TASK_VERDICT_LABEL` and `BET_VERDICT_LABEL` are used at their render sites.
- No premature generics.
- No dead code.
- No commented-out code.
- The outcome section is conditionally rendered only for completed/killed bets -- no wasted DOM for draft/active.
- Client-side filtering is consistent with existing patterns (team filter, status filter).

---

## Lens 6: AI Slop (Negative)

**No findings.** Specific checks:
- No unnecessary comments explaining obvious code.
- No `TODO: implement` markers on implemented code.
- No defensive null checks for non-nullable types.
- No try-catch around non-throwing code.
- No `=== true` or redundant else-return patterns.
- No verbose naming (the label maps are appropriately concise).
- Lore comments are load-bearing and explain non-obvious decisions (S-1 text storage, W-1 state optional).

---

## Docs Review: canonical-shapes.md Update

The update adds an "Outcome Verdict shapes (AC1)" section with three subsections (BetOutcomeVerdict, TaskOutcomeVerdict, Session effectivenessScore). Assessment against write-docs rubric:

- **Accuracy:** Types match the implemented code exactly. All four bet verdicts, all four task verdicts, [0,1] range for effectiveness.
- **Completeness:** Each enum value has a one-line explanation. Storage convention (text), null semantics, and validation boundary documented.
- **Cross-references:** References @lore AC1 S-1 in schema.ts, the TRACK-AC workpackage, and plans/AC1/concept.md.
- **Conciseness:** No filler. Each paragraph earns its place.
- **Follows existing structure:** Mirrors the Money/TokenUsage section above it (type definition, bullet list of semantics, implementation story reference).

Docs are clean.

---

## Summary of Findings

| ID | Severity | Description | Action |
|---|---|---|---|
| F-1 | LOW | Merge conflict markers in `.verify-attestations/e50e6d9103b2d842fa9f50d955393594e89b2e50.json` | Delete the conflicted file before merge. The clean attestation at `0a5af5a8...json` is sufficient. |

No critical or high findings. One low-severity hygiene issue (committed merge conflict markers in a non-runtime file). All ACs met. All Phase 2 warnings (W-1, W-2, W-3) addressed.

---

**Verdict: DONE**
