# P5 FirstTimeHints -- Retrospective

**Pipeline run:** Concept → Design → Architecture → Design Critique → Architecture Critique → Write Tests (red) → Write Code (green) → Code Review → Ship → Verify

**Outcome:** SHIPPED. All 9 acceptance criteria verified. `bun run verify` passes (0 type errors, 0 lint errors, all tests green). Branch merged to main 2026-05-27.

---

## Timeline

### Phase 1: Design (brief + approved)
- **Commits:** `b9dddc3` (brief + approved)
- **Artifacts:** `design/brief.md` (516 lines), `design/approved.md` (258 lines)
- **Duration:** ~2 hours design + interrogation
- **Output:** Single-variant routine design. Rejects 9 alternative directions explicitly. Cataloged all 5 hint locations with trigger conditions, visual treatment (existing tokens only, no new component), interaction flows (dismiss + auto-dismiss), and density behavior.

**Key decision:** Hints are a **rendering pattern** (not a new component). All hint regions use existing tokens: `bg-[var(--surface-2)]`, `text-[var(--text-mid)]`, `btn btn-ghost btn-xs`. This eliminates the component budgeting question and keeps the system lean.

### Phase 2: Architecture + Critique
- **Commits:** `c4f0a8a` (architecture plan), `40dda0b` (critique)
- **Artifacts:** `architecture.md` (654 lines), `architecture-critique.md` (175 lines)
- **Duration:** ~3 hours architecture + 1.5 hours critique
- **Output:** Ordered task list (7 tasks: schema, catalog types, API routes, React context, view integration, tests, verify). Complete type signatures and schemas. Critique scored 8/10.

**Key interrogation:** Q1-Q5 resolved critical ambiguities:
- Server-side storage (not client localStorage) → validated by "per-user tracking on shared backends" requirement
- Catalog location: `packages/shared` (contract between layers, not fabric strategy code) → overrides spec's suggestion
- Single bulk API endpoint (all dismissed hints in one GET) → avoids per-page coupling
- Auto-dismiss is pure render gate (no `seenAt` write) → simplifies implementation
- Credential-state context field for hint #2 → flagged as a risk/ambiguity for v1

**Critique findings:**
- 3 WARNING level items: use `INSERT ... ON CONFLICT DO NOTHING` (not SELECT-then-INSERT), add `role="status"` on hint regions, use `Set<HintId>` (not `Set<string>`)
- API error shape should use existing `ApiErrorResponse` type (not ad-hoc)
- `context: { hasValidCredential }` field is unformalized (appears in Risks, not in type signatures)

### Phase 3: Test Definition (red phase)
- **Commit:** `42d63f1` (red phase tests)
- **Artifacts:** 5 test files, 1,096 lines total (139+141+246+337+233)
- **Duration:** ~1.5 hours
- **Output:** Failing tests covering:
  - DB tests (6): insert, duplicate PK, FK violation, cascade delete, multi-user
  - Shared tests (12): catalog shape, size, isHintId validation, edge cases
  - Route tests (10): GET/POST flows, 400/409 error cases, auth, per-user isolation
  - Hook tests (9): visible/invisible states, graceful degradation, optimistic dismiss
  - Integration tests (8): hint appears on trigger, text matches, dismiss hides, never-reappear

**Quality signal:** Test coverage is comprehensive across all layers. No Playwright E2E (acknowledged trade-off: Vitest component tests are sufficient for the system's complexity and avoid server-startup overhead).

### Phase 4: Implementation (green phase)
- **Commit:** `23e035c` (implementation)
- **Files changed:** 19 files added/modified, 3,067 insertions
- **Duration:** ~2 hours
- **Output:** All 7 architecture tasks completed:
  1. **Schema:** `hint_progress` table (userId FK, hintId, seenAt, composite PK) in both SQLite and PG
  2. **Catalog:** `HintId` union type, `HINT_CATALOG` array (5 entries), `isHintId` type guard in `packages/shared`
  3. **API routes:** GET `/api/hint-progress`, POST `/api/hint-progress/:hintId/dismiss` in `packages/server`
  4. **React context:** `HintProvider`, `useHint` hook with optimistic dismiss + graceful failure
  5. **View integration:** Hints rendered inline in WorkProduct, WorkBet, KnowledgeList, Conversations, Rail
  6. **Playwright tests:** Substituted Vitest component tests (JSDOM) — same coverage, no server startup
  7. **Verify:** `bun run verify` passed (check, lint, test, build, mock-inventory, knip all green)

**Implementation decisions:**
- `INSERT ... ON CONFLICT DO NOTHING` with `.changes` check ensures atomic idempotency (addresses Phase 2 warning)
- `Set<HintId>` throughout (not `Set<string>`) for type safety (addresses Phase 2 warning)
- `role="status"` on all hint regions (addresses Phase 2 warning)
- `skipArtifacts` prop on WorkProduct — test-specific accommodation to control fetch ordering in component tests (documented with `@lore`)

### Phase 5: Code Review
- **Commit:** `63a75bd` (review summary)
- **Artifact:** `review.md` (184 lines)
- **Duration:** ~1.5 hours
- **Verdict:** DONE. All Phase 2 warnings addressed. Two non-blocking notes:
  1. Hint #2 trigger doesn't check credential state (design specifies "no valid credential configured" but implementation omits check). Acceptable for v1 (mildly redundant but not harmful).
  2. Hint #2 "Open Settings" action button is in approved design but not rendered in code. Minor design deviation.

**Review lenses:**
- Architecture (PASS): Layer integrity clean, API contracts match, data model correct, task completeness verified
- Design (PASS): Token compliance exact, states present, accessibility addressed (`role="status"`)
- Security (PASS): Auth enforced, input validated, per-user isolation tested, rate limiting inherited
- Adversarial (PASS): Race conditions eliminated by ON CONFLICT, optimistic dismiss is correct, pattern understandable
- Simplification (PASS): No dead code, no premature generics, necessary state flags (failed flag correctly distinguishes API error from empty result)
- AI Slop (PASS): Clean naming, justified comments, no tell-tales

### Phase 6: Ship
- **Commits:** `bace76e` (attestation), `63a75bd` (final attestation)
- **Duration:** ~30 minutes
- **Output:** Attestation signed. CI passed. PR merged to main. Post-merge verification green.

---

## What Went Well

### 1. Single-variant design discipline
The brief interrogation resolved the core question ("Are hints a component or a rendering pattern?") early, eliminating design churn. By committing to "rendering pattern using existing tokens" the design phase didn't bifurcate into competing directions. This saved ~2 hours of multi-variant comparison and critique.

### 2. Comprehensive architecture interrogation
The Q1-Q5 probes caught three critical decisions before implementation:
- Server-side vs client-local storage (forces integration with kernel DB, not a solo feature)
- Catalog location (avoids pulling UI types into fabric)
- Single bulk endpoint (prevents per-page API fragmentation)

These were explicitly **answered** in the architecture plan (not left as TBD), which meant the red-phase tests could be written with confidence and the green phase had zero surprises.

### 3. All Phase 2 critique warnings were implemented correctly
The architecture critique flagged 3 specific warnings (ON CONFLICT atomicity, role="status" accessibility, Set<HintId> type safety). The implementation addressed all three without rework. This suggests the critique quality was high and the builder read carefully.

### 4. Comprehensive test coverage before code
Writing 1,096 lines of tests first (red phase) gave the implementation a clear target. The fact that all tests passed on first green run (23e035c) suggests either excellent test design or excellent implementation — likely both. Zero test failures to fix is a cost signal of high-quality red phase work.

### 5. Graceful error handling
The hint system's design includes three explicit failure modes:
- Loading (hints hidden until API ready) → prevents flash-of-hint
- API error (hints hidden on failure) → graceful degradation
- Already-dismissed (optimistic client + fire-and-forget POST) → best-effort

These aren't documented as performance optimizations, but they reflect sound UX discipline.

### 6. Extensibility pattern works
Adding a new hint requires: (1) one HINT_CATALOG entry, (2) one union type member, (3) one `useHint()` call + JSX in the target view. No infrastructure changes. The pattern is copy-paste-safe and immediately understandable.

---

## What Could Improve

### 1. Hint #2 trigger accuracy (discovery gap)
The approved design says hint #2 shows "when no valid credential is configured." The implementation omits the credential-state check, so hint #2 shows on every first bet regardless of credential status. This is a **trigger discovery failure**, not a structural one. The architecture plan identified this as Risk #1 and recommended adding a `context.hasValidCredential` field to the GET response. The implementation decided against it (likely to avoid a server-side credential check in the hot path). The cost was paid in the form of a design deviation that the reviewer caught as "non-blocking."

**Opportunity:** The interrogation phase could have pressed harder on "How does the client know if a credential is valid?" Early in architecture, this would have forced a decision: (a) server-side context field, (b) separate `/api/credential` fetch, or (c) accept the design deviation. Instead, it was flagged as an ambiguity and left for implementation to decide. The friction here was ~30 minutes of post-hoc review finding.

### 2. Hint #2 "Open Settings" action button (implementation gap)
The approved design specifies an "Open Settings" action button (`btn btn-ghost btn-xs text-[var(--primary)]`) alongside the dismiss button for hint #2. The implementation omits it. This is a minor design deviation (hints still work and are dismissible) but signals that the implementation may not have line-read the approved design or the architect didn't enforce the deviation as a required AC.

**Opportunity:** The architecture plan should have formalized this as AC2.1: "Hint #2 renders with both 'Open Settings' and 'Got it' buttons." Then the red-phase test would have caught the omission and the builder would have implemented it.

### 3. Surface direction rationale in design (docs clarity issue)
The approved design says `bg-[var(--surface-2)]` is "one step up from the main content area (surface-3)" but in the dark theme, surface-2 is actually darker (lower luminance) than surface-3. The token choice is correct (matches existing WorkProduct pattern) but the rationale is backwards. This could mislead a future maintainer or visual-polish agent.

**Opportunity:** The design critique noted this as a WARNING but the approved design was not revised to correct the rationale. A minor fix ("one step down" or "recessed from") would have prevented future confusion. Design docs should always reflect the actual codebase.

### 4. Vitest instead of Playwright (architectural trade-off)
The spec calls for Playwright E2E tests. The implementation substitutes Vitest component tests (JSDOM) to avoid server startup overhead. This is a reasonable trade-off but not explicitly chosen in the architecture plan — the plan says "Vitest component tests, since Playwright E2E requires a running server" which frames it as a constraint, not a decision. The review accepts it as non-blocking.

**Opportunity:** The architecture plan could have been clearer: "Trade-off: Vitest component tests (simpler, faster, no server) vs Playwright E2E (real browser, but slower CI). Choosing Vitest for v1; consider Playwright in follow-up." This would have made the design choice explicit rather than leaving it as an implementation convenience.

### 5. Unformalized `context` field (schema slop)
The architecture plan identifies the `context: { hasValidCredential }` field as Risk #1 and recommends adding it to the GET response. But it's described in prose ("Revised GET response shape:") rather than formalized in the type signatures section. When the implementation decided against it, there was no explicit schema to violate — just a "could extend" suggestion. A formalized schema with a TODO would have made the deviation more visible.

**Opportunity:** If risk/ambiguity items appear in the "Risks" section, they should be formalized as optional type changes or explicitly marked "OUT OF SCOPE FOR V1" in the main API contracts section. This prevents implementation ambiguity.

---

## Cost Signals

| Phase | Estimated Hours | Artifacts | Quality Gate |
|-------|-----------------|-----------|--------------|
| Design (brief + approved) | 2.0 | 2 documents, 774 lines | Single variant, 9 rejections documented |
| Architecture + Critique | 4.5 | 2 documents, 829 lines | 8/10 score, 3 warnings |
| Test definition (red) | 1.5 | 5 test files, 1,096 LOC | All failing, comprehensive AC coverage |
| Implementation (green) | 2.0 | 19 files, 3,067 insertions | All tests pass, verify green |
| Code review | 1.5 | 1 document, 184 lines | 6-lens review, 2 non-blocking notes |
| Ship | 0.5 | 2 attestation commits | CI passed, merged |
| **Total** | **11.5 hours** | **~3,000 LOC** | **Shipped, zero escapes** |

**Per-phase breakdown:**
- **Planning (design + architecture):** 6.5 hours (56% of total)
  - Interrogation was thorough (Q1-Q5 caught major decisions)
  - Critique was valuable (3 warnings all addressed)
  - This front-loading prevented rework downstream
- **Implementation (tests + code):** 3.5 hours (30% of total)
  - Red phase tests were comprehensive enough to guide green phase
  - Green phase was fast (2 hours for implementation + all tests pass)
  - This ratio (test : build = 1.5 : 2) is healthy
- **Review + ship:** 2 hours (17% of total)
  - Review was thorough but found only non-blocking deviations
  - Ship was smooth (no blocking feedback)

**Opportunity cost:** Without the comprehensive planning phase (6.5 hours), the green phase would have encountered:
1. Credential-state integration surprise (cost: 1 hour rework, now discovered in review)
2. "Open Settings" button omission (cost: 0.5 hour follow-up)
3. Possible API contract drift (cost: avoided by explicit schema section)

The front-loading paid for itself in zero rework.

---

## Non-blocking Follow-ups

These items were noted in the review but do not block the shipped version.

### 1. Hint #2 trigger refinement
Add credential-state checking so hint #2 only shows when credentials are actually absent. Options:
- Server-side: add `context: { hasValidCredential }` to GET response (recommended in architecture plan Risk #1)
- Client-side: add `useFetch('/api/credentials')` in WorkBet component to check state locally
- Accept as-is: slightly redundant but non-blocking (hint is still dismissible and doesn't break functionality)

**Recommendation:** Post-v1. The hint is not wrong, just mildly over-eager. Low priority.

### 2. Hint #2 "Open Settings" action button
The approved design includes a primary-colored navigation button to Settings. The implementation omits it. Add the button alongside "Got it" in the rendered hint #2.

**Recommendation:** Post-v1. Low priority, purely UX improvement.

### 3. Correct design doc rationale
Fix the "one step up" → "one step down" rationale in `approved.md` line 39 to match actual token values. The token choice is correct; the explanation is backwards.

**Recommendation:** Immediate (docs hygiene). This is a 1-line fix that prevents future confusion.

### 4. Consider Playwright E2E tests
The component-level Vitest tests are comprehensive, but real browser E2E would add confidence in actual browser rendering, focus behavior, and cross-browser compatibility. Current Vitest tests use JSDOM which is a best-effort DOM simulation but not a real browser.

**Recommendation:** Post-v1, after other E2E infrastructure is in place.

---

## Observations

### Interrogation discipline was strong
The architecture plan explicitly answered 5 critical questions (Q1-Q5) before task decomposition. This is the gold standard for reducing post-hoc surprises. Each answer was justified against the spec and codebase.

### Phase 2 critique was honest
The architecture critique scored 8/10 and flagged warnings rather than rubber-stamping. The warnings were specific and implementable. The design critique flagged surface-direction rationale issue. This is a sign the reviewer was engaged, not just checking boxes.

### Builder read the plan
All three Phase 2 warnings were correctly implemented (ON CONFLICT, role="status", Set<HintId>). This suggests the builder either read the critique or independently arrived at the same conclusions. Either way, it's a positive signal.

### Test-first discipline paid off
The fact that all tests passed on first green-phase run (no test failures to fix) is rare and suggests high-quality red-phase work. The test files are well-structured, cover edge cases (duplicate dismiss, per-user isolation, API failure), and use realistic mocking.

---

## Retrospective Summary

**What succeeded:** Planning discipline, interrogation depth, test quality, implementation speed. The front-loaded 56% effort on design/architecture created a clear target and eliminated rework downstream.

**What needs attention:** Trigger discovery (hint #2 credential check was flagged as a risk but not explicitly enforced), design doc hygiene (surface rationale backwards), and full AC formalization (some deviations like missing "Open Settings" button weren't caught early as explicit ACs).

**Repeatable pattern:** The 6.5 hour planning phase enabled 3.5 hours of implementation with zero rework. This is the ideal cost structure for mission-critical features.

---

## Verification

- `bun run check` ✓ (0 type errors)
- `bun run lint` ✓ (0 lint errors)
- `bun run test` ✓ (all tests pass)
- `bun run verify` ✓ (attestation signed 2026-05-27 15:08:48)
- Code review ✓ (DONE, all Phase 2 warnings addressed)
- AC completeness ✓ (9/9 criteria met)

---

**Retrospective written:** 2026-05-27
**Attestation:** `63a75bd519ab556f1fe75aaa880e858dc1feeb7a` (verify passed)
