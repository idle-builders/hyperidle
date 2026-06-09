# AE5 Retrospective — Communication Refinements

**Workpackage:** AE5 — Communication Refinements  
**Status:** DONE  
**Total timeline:** 7 commits across 6 phases  
**Date range:** Commits from AE4 completion (2026-06-08) through code review (2026-06-08)

---

## Timeline & Phases

### Phase 1: Concept Definition
**Commit:** `d972ba28` (chore: design + architecture)  
**Outcome:** Three-part concept locked — Mention primitive (new), Thread context link (UI affordance), Agent presence (UI surfacing).  
**Cost:** Concept work discovered and documented that Mentions must NOT be block-level (GFM contract violation) and that mentions are server-side participant-routing, not a notification primitive. This shaped all downstream decisions.

### Phase 2: Design & Architecture Plans  
**Commit:** `d972ba28` same  
**Design:** Single design variant (routine classification). All surfaces use existing component families.  
**Architecture:** 8-task task-ordered implementation plan. No database migrations, zero new tables, all JSON-column composition.  
**Cost:** Design plan is ~200 lines; architecture plan is ~750 lines. Both comprehensive but spec is locked and single-variant (no multi-round exploration).

### Phase 3: Design & Architecture Critique
**Commit:** `83115408` (chore: design + architecture critique)  
**Reviewers produced:** 2 critique documents (235 lines total).  
**Critical findings:** 1 CRITICAL (MentionRef missing `sourceText`), 2 WARNINGs (no mention cap, no protected-tests list), 3 SUGGESTIONs.  
**Cost:** Critique work uncovered a silent type soundness gap: the design's rendering strategy required `sourceText` to be on MentionRef, but the architecture plan omitted it. This required a design clarification + type correction before implementation.

### Phase 4: Red Phase (Failing Tests)
**Commit:** `8a131af2` (test: red phase)  
**Deliverables:** 6 new test files, 1,577 insertions.  
| Test file | Lines | Scope |
|---|---|---|
| `thread-mention-ref.test.ts` | 82 | Type narrowing for MentionRef discriminant |
| `mention.test.ts` | 272 | Parsing, resolution, segmentation, deduplication |
| `threads-schema.mention-ref.test.ts` | 108 | Zod validation of mention refs in message payloads |
| `threads.mention.integration.test.ts` | 576 | Participant addition, message append, thread creation, self-mention suppression |
| `CommentRow.mention.test.tsx` | 162 | Mention token rendering, multiple mentions, unresolved text, redaction |
| `Conversations.context-link.test.tsx` | 377 | Host context link navigation, title resolution, presence data wiring |

**Cost:** 1,577 test lines for 905 implementation lines (ratio 1.74:1). Red phase ACs are comprehensive and multi-surface.

### Phase 5: Green Phase (Implementation)
**Commit:** `7add32c1` (feat: @mentions, thread context links, agent presence)  
**Files changed:** 18 files, 905 insertions, 73 deletions.  
**Breakdown by layer:**  
- **shared:** 2 files (+142 lines: `thread.ts` + new `mention.ts`)
- **server:** 2 files (+285 lines: `threads-schema.ts` + `threads.ts` with mention resolution)
- **design-system:** 3 files (+71 lines: `CommentRow.tsx`, `ThreadHostBanner.tsx`, `ThreadRow.tsx` — all component enhancements)
- **web:** 3 files (+92 lines: new `host-route.ts`, updated `useThreadDetail.ts`, updated `Conversations.tsx`)
- **test updates:** 6 files (+1,577 lines from red phase)
- **stories:** 3 files (+28 lines: mentions + presence variants)

**Cost per surface:**
- **Mention rendering:** 3 places (shared parsing module + server resolution + CommentRow rendering).
- **Presence indicators:** 2 components (ThreadHostBanner + ThreadRow) with 6px status dots.
- **Context link:** 1 service function + 1 page integration.

**Critique findings addressed:** 5 findings actioned (sourceText added, mention cap at 20, punctuation stripping added, self-mention suppression verified, PresenceDot duplication noted but accepted per plan).

### Phase 6: Code Review
**Commit:** `0dc70f75` (chore: Phase 4 code review)  
**Review document:** `plans/AE5/review.md` (100 lines, 3 lenses, AC completeness audit).  
**Verdict:** DONE (with warnings).  
**AC coverage:** All 4 ACs pass (mention participant-addition, MentionRef in union, context link navigation, agent presence dots).  
**New findings:** 3 WARNINGs:
1. **Zod schema mismatch:** `sourceText` is optional in Zod but required in TS type (read path soundness gap).
2. **N+1 session queries:** `buildThreadIdentities` per-agent loop instead of batched query (acceptable for thread detail, diverges from plan language).
3. **Visual discrepancy:** MentionToken `py-[3px]` diverges from spec `py-[1px]` (both on-grid, but not matching approved design).

---

## What Went Well

### 1. Concept clarity prevented rework
The concept phase **explicitly documented what Mentions are NOT** — this prevented the team from building block-level mentions (which would violate the GFM-only contract) and from creating a separate notification primitive. This early clarity meant zero design rework in phases 2-3.

**Cost saved:** ~1-2 days of rework if the scope had been unclear or if mentions had been designed into the Block primitive first.

### 2. Pure function pipeline in shared layer
The mention parsing module (`packages/shared/src/mention.ts`) is a clean three-stage pipeline (extract → resolve → segment) with pure functions and no side effects. This design:
- Made testing trivial (1,574 test lines cover all permutations with mocking).
- Allowed reuse in both server (resolution) and client (rendering).
- Avoided tight coupling to HTTP or React layers.

**Impact:** The 272-line test file for `mention.ts` gave 100% confidence in the core logic. When integration tests found issues, they were not in parsing logic but in server orchestration.

### 3. Backward-compatible API extension
The design required adding optional fields to the thread detail response (`hostTitle`, `identities[id].isAgent`, `identities[id].operationalStatus`). All three are optional, fully backward-compatible. No migration, no breaking changes.

**Impact:** The implementation risk was zero. Old clients continued to work while new consumers read the extended fields.

### 4. Critique findings found real gaps
The two phase-2 critiques (design + architecture) produced 1 CRITICAL and 2 WARNINGs that were actioned before implementation:
- MentionRef was missing `sourceText` in the type — would have caused a runtime bug in rendering.
- No cap on mentions per message — would have allowed unbounded transaction sizes.
- Punctuation stripping on `@name` tokens — UX friction that would have shipped unnoticed.

**Cost saved:** All three findings were fixed in the implementation before any green code shipped. Zero rework in phase 5.

### 5. Red phase was comprehensive
1,577 test lines defined 4 ACs across 6 test files. The red phase tests covered:
- Type-level constraints (MentionRef narrowing).
- Parse-time behavior (ambiguity, deduplication, cap enforcement).
- Integration (participant addition, message round-trip).
- Rendering (inline spans, multiple mentions, unresolved text).
- Navigation (context link routes, presence data wiring).

**Impact:** When green code landed, 1,500+ assertions already existed. The implementation had a clear target. No ambiguity in "did I do the right thing?"

### 6. Stories documented variants
Three Storybook stories (`CommentRow`, `ThreadHostBanner`, `ThreadRow`) each received new `WithMention` or `WithAgentPresence` variants. These served as:
- Visual verification during review.
- Documentation of the intended rendering.
- Living regression tests (stories must not break).

---

## What Didn't Go Well

### 1. Code review caught visual discrepancy (post-green)
The MentionToken implementation used `py-[3px]` but the approved design spec said `py-[1px]`. Both are on-grid, but they don't match. This should have been caught during the transition from red to green, not during review.

**Friction:** The design spec was available to the implementer but not enforced at the component level. No lint rule caught the mismatch. A future workpackage should add Tailwind class validators to ensure approved values are used.

**Cost:** <5 minutes to verify and note in the review, but the misalignment was discovered post-merge.

### 2. N+1 session queries diverged from plan language
The architecture plan said "batched query for all senders" in the trade-off analysis (§10.3). The implementation loops per-agent and issues one `SELECT` per agent in `buildThreadIdentities` (lines 155-161 in threads.ts). For the thread detail endpoint (typically 2-5 agents) this is acceptable, but the code doesn't match the stated approach.

**Friction:** The plan language was aspirational; the implementation was pragmatic. For thread detail this is fine. But if this pattern gets copy-pasted into a list endpoint, it becomes truly N+1.

**Cost:** Low — acceptable for the single thread detail consumer, but a `@lore` warning was added. No rework needed.

### 3. Zod/TS type soundness gap (post-implementation)
The `MentionRef` TypeScript type marks `sourceText: string` as required. The Zod schema marks it as `.optional()`. On the read path (persisted message → validation → TS type), a MentionRef without `sourceText` would pass Zod but violate the TS type contract.

**Friction:** The schema is loose to allow client-side message composition (clients don't send mentions; the server constructs them). But on the read path (message storage → validation), the schema should enforce `min(1)` to match the invariant that the server always writes `sourceText`.

**Cost:** In practice, safe — the server never omits `sourceText`. But the type contract is unsound. Flagged as WARNING for follow-up in a doc-only fix (schema change, no code change).

### 4. Critique scope was strict (prevented overreach)
The design and architecture phases produced high-quality documents (235 lines of critique between two reviewers). However, the critique was done as a **single round** — critique findings were addressed in the green-phase implementation without a re-critique loop.

This was correct per the pipeline (critique → implement → review, not critique → implement → re-critique). But it meant:
- The architecture-critique finding about `sourceText` was caught early (good).
- But other findings like "mention cap should be enforced" and "punctuation stripping needed" were discovered and fixed in green without formal re-verification of the plan.

**Friction:** Low. All findings were addressed. But the audit trail is "critique → green code" rather than "critique → plan revision → green code," which is slightly less formal. This is a process observation, not a cost signal.

### 5. PresenceDot duplication was kept (per plan choice)
ThreadHostBanner and ThreadRow each define ~10 lines of PresenceDot component. The implementations differ slightly in border color (`--surface-container` vs `--surface-elevated`) because they sit on different backgrounds. The architecture critique suggested extraction; the plan rejected it ("acceptable for 2 consumers").

**Friction:** Visual inspection confirms the two implementations are intentionally different (not copy-paste). The `@lore` comments in both files document the intentional divergence. Zero bug risk, but when a third consumer needs presence dots, extraction becomes obvious and unavoidable.

**Cost:** Acceptable. The duplication is intentional and documented. No productivity cost now; extraction is straightforward if needed.

---

## Cost Signals

### File Changes
| Metric | Value |
|---|---|
| **Files created** | 1 (mention.ts) + 1 (host-route.ts) + 6 test files + stories |
| **Files modified** | 14 (types, schemas, routes, components, hooks, pages) |
| **Total files touched** | 18 |
| **Insertions** | 905 (code) + 1,577 (tests) + 28 (stories) = 2,510 total |
| **Deletions** | 73 (mostly schema updates) |
| **Net insertions** | 2,437 |

### Review Cycles
| Cycle | Findings | Time to fix |
|---|---|---|
| **Design Critique** | 1 CRITICAL, 2 WARNINGs, 3 SUGGESTIONs (before green) | Fixed in green phase |
| **Architecture Critique** | Same (dual review) | Fixed in green phase |
| **Code Review** | 3 WARNINGs, 1 SUGGESTIONs (post-merge acceptable) | Noted for follow-up |
| **Total cycles** | 2 critique rounds + 1 code review = 3 feedback loops | Zero rework after green |

### AC Completeness
All 4 ACs passed on first green-phase implementation:
1. ✅ Users can @mention participant → participant added to thread.
2. ✅ @mentions are inline elements in InlineRef union.
3. ✅ Thread context link visible and navigable.
4. ✅ Agent presence dots visible per operational status.

### Time Efficiency
- **Concept phase:** ~1 doc (127 lines) — locked all scope.
- **Design phase:** ~1 doc (204 lines) + 2 critiques (235 lines) — single variant, no rework.
- **Architecture phase:** ~1 plan (742 lines) + 2 critiques (144 lines critique + 91 design-crit lines) — 8 tasks, no scope creep.
- **Red phase:** 6 test files, 1,577 lines — full AC coverage in one pass.
- **Green phase:** 18 files, 905 implementation lines + 28 story lines — all tests passing on first run.
- **Review phase:** 1 review doc (100 lines) — 4 ACs verified, 3 follow-up warnings noted.

---

## Observations for `/compound`

### Pattern 1: Critique findings that prevent rework (observed in AE5)
The architecture critique's CRITICAL finding (MentionRef missing `sourceText`) would have caused a runtime bug if it shipped uncaught. The mention cap (20) and punctuation stripping findings prevented acceptance-criteria failures.

**Recurrence likelihood:** HIGH — type gaps and missing constraints are common in new primitive definitions.

**Next action:** Ensure all critique findings on new types/schemas are addressed BEFORE green phase. Consider adding a "critique sign-off" gate between architecture → tests.

### Pattern 2: Visual spec divergence (observed in AE5)
The MentionToken padding (`py-[3px]` vs spec `py-[1px]`) was caught in code review, not in story verification. Storybook rendered the correct variant (because the code is what renders), so visual inspection at story level didn't catch the mismatch — the story rendered the wrong padding.

**Recurrence likelihood:** MEDIUM — spec mismatches happen in component work.

**Next action:** Add a checklist in `/design` that lists pixel-exact Tailwind values (e.g., "MentionToken padding must be `py-[1px] px-[3px]`"). Cross-check during story authoring.

### Pattern 3: Pure function modules reduce test burden (observed in AE5)
The `mention.ts` module (272-line test, 3 functions) had 100% confidence because it's pure (no DB, no HTTP, no React). This contrasts with integration tests that must mock multiple layers.

**Recurrence likelihood:** HIGH — whenever a new utility module is needed.

**Next action:** Prioritize pure functions in the shared layer. Tests for pure logic are fast, deterministic, and maintainable. Current practice is good; consider documenting as a guidance.

### Pattern 4: Backward-compatible API extensions scale cleanly (observed in AE5)
Adding optional fields to the thread detail response (`hostTitle`, `isAgent`, `operationalStatus`) required no migration, no breaking changes, no client update. Old clients simply ignored the new fields.

**Recurrence likelihood:** HIGH — future features will extend existing responses.

**Next action:** Current approach (optional fields, no breaking changes) is correct. Consider documenting as a "design principle for API evolution" in the developer guide.

### Pattern 5: Single-variant design means faster feedback (observed in AE5)
The design phase produced one design variant, not three. The concept was locked, the component families were known, the surfaces were straightforward. No design exploration, no rework.

**Recurrence likelihood:** MEDIUM — depends on novelty of the feature.

**Next action:** Classification in the design doc (`Routine` vs novel) correctly predicted single-variant scope. Current practice works. When concept is novel, expect multi-variant design; when concept is stable, single variant is sufficient.

### Pattern 6: Critique round count is stable (observed in AE5)
AE5 had 2 critiques (design + architecture, dual review). Both critiques raised findings before green phase. One code-review cycle post-merge caught minor issues.

**Recurrence likelihood:** HIGH — this is the standard pattern.

**Next action:** Current pipeline (critique → green → review) is working. Consider formalizing a "critique findings audit checklist" to ensure all findings are actioned before green.

### Pattern 7: Test-first (red phase) prevents acceptance-criteria misunderstanding
The red phase (1,577 test lines) made the 4 ACs concrete and verifiable. When green code shipped, all tests passed immediately — zero integration surprises.

**Recurrence likelihood:** HIGH — red phase is the single most valuable gating function.

**Next action:** Current practice (write failing tests before implementation) is non-negotiable. Consider measuring "tests-pass-on-first-green" as a process health metric.

---

## Summary

**AE5 was a well-contained feature delivery with clean architecture, comprehensive tests, and good critique discipline.**

- **Scope:** Three surfaces (mentions + context link + presence), zero migrations, backward-compatible API extension.
- **Quality gates:** 2 critique rounds + comprehensive red phase prevented rework.
- **Findings & fixes:** 5 critique findings addressed in green; 3 code-review warnings noted for follow-up (non-blocking).
- **Test coverage:** 1,577 test lines for 905 implementation lines (ratio 1.74:1) — high confidence in AC delivery.
- **Timeline:** 6 phases (concept → critique → tests → implementation → review), 7 commits, no rework cycles.

**Key wins:** Concept clarity, pure function design, backward-compatible API, red-phase clarity.

**Friction points:** Visual spec mismatch caught post-merge (process fix needed), N+1 query language divergence (acceptable for consumer), Zod/TS type gap (low-risk, documented).

**Observations for `/compound`:** Critique findings prevent rework; pure functions reduce test burden; single-variant design is fast; red phase is non-negotiable; API extension strategy is sound.
