# AK5 — Retro: Promote a knowledge item into a bet

**Status:** Shipped. PR #306. 12 commits across 7 days (2026-06-08 to 2026-06-15). M complexity. Design 8.5/10, Architecture 4.3/5 (APPROVED second-pass). Code review: 1 CRITICAL (empty-editor multi-team path), 3 carry-forward WARNINGs. One review-round loop. Full verify green w/ attestation.

---

## Phase timeline

| Phase | Commits | Cost | Notes |
|-------|---------|------|-------|
| WIP scaffolding | 1 | — | `d6f213e6` pipeline setup |
| Concept + Design + Architecture | 3 | — | Docs-only: concept, design/approved.md, architecture.md |
| Design + Architecture Critique (Phase 2) | 1 | — | `58ea6143` design 8.5/10, architecture 4.3/5; 4 CARRYFORWARDs + 3 WARNINGs noted |
| Red phase (TDD) | 1 | — | `8e3f5d57` failing tests for AC1+AC2+AC3+AC7 |
| Green phase (implementation) | 5 | 1 code-review loop | `42b9a81b` schema FK column → `863aef4a` web UI → `8c75d1d8` schema+stories → `6bad0d1e` organize imports + `60a47969` mock-inventory |
| Critical bug fix | 1 | 1 additional test | `9adf7f2e` empty-editor multi-team path + async-path regression test |
| Verify attestation | 1 | — | `7d98cae6` chore: add verify attestation |
| As-built forward-edge | 1 | — | `9f7cd745` docs forward knowledge→bet edge + stale comment fix |

---

## Key findings

### SUCCESS — Test-first TDD discipline paid off again

All 7 ACs had red-phase test assertions from the start. Green phase went to first-pass implementation on the single-team path (BodyEditor sync on async data not yet caught). **The async-path test** (`AK5-promote-bet.test.tsx` lines 395–463) was the load-bearing artifact that proved the CRITICAL bug existed after initial implementation. The test strategy (mock useKnowledgeItem with `isLoading: true` initially, assert loading gate present, rerender settled, assert textarea content) **directly matched the architectural constraint** (TipTap captures initialContent once at mount, never re-syncs per `@lore T1`). The lore comment in T1 was already there from an earlier workpackage — referencing it explicitly in the new @lore AK5 comments made it discoverable at code-review time.

**Compound:** CC-010 (TDD red-green success — protect). This retro confirms the disciplined red-phase commitment before writing a line of implementation code, and the test-discovery of a critical production bug that would have shipped silently under fixture-fallback masking.

### FRICTION — Test-realism gap exposed the async-path bug

The initial implementation passed all tests **because the test suite used fixtures to pre-seed the body in the `useKnowledgeItem` mock**. The fixture fallback in `WorkBetCreate` was a "defensive fallback" to avoid a second fetch when the client already had the knowledge item (reasonable on paper), but it **masked the async-empty-editor bug entirely**. On the multi-team path, the real async data flow never happened in the test, so the bug lived. 

The code-review CRITICAL finding: *"The fixture-path test mocked textarea editor instead of the async TipTap path. Mounting BodyEditor with `initialContent=""` before useKnowledgeItem resolves leaves the editor permanently empty."* The fix: remove the fixture fallback, add a loading gate, and write a **new async-path test** that explicitly drives the async boundary condition (isLoading → settled) instead of the happy-path fixture case.

**Root cause:** The green-phase test suite had **two path shapes** (fixture-resolved and async-resolved) but only one was exercised. The synchronous fixture path was too similar to production for comfort but didn't actually test the async boundary. A test-realism audit at red-review time would have caught this: "The useKnowledgeItem hook is async; this test must prove the async path works, not just the fixture fallback."

**Compound:** A new candidate, not yet tracked. Test-fixture masking of async-boundary conditions. Recommend tagging as a risk pattern: when a hook/service call is mocked in tests, the test must include both (a) the happy-path fixture case and (b) a distinctly-async case with loading/error states, to prevent production boundaries from being masked.

### FRICTION — Multi-team routing shape asymmetry under-specified in plan

Architecture critique **WARNING D5** flagged: single-team and multi-team flows have **different landing experiences**.
- Single-team: `MenuItem` click → optimistic POST → navigate to `/work/bet/:id` (edit page).
- Multi-team: `MenuItem` click → navigate to `WorkBetCreate?fromKnowledge=:id` (create page) → founder picks team + clicks Create again.

The architecture prose describes "promote → land in editor" for single-team, then defers multi-team routing to "whichever the plan settles" as routine. The two experiences are functionally equivalent (AC1+AC3 both satisfied: draft exists, provenance recoverable, lands in authoring surface), but the visual/UX path is different — one is in-place + fast, the other is page-nav + two-step.

**Impact:** No production bug, but a **UX asymmetry** that could surprise users in a multi-team factory. The plan correctly chose to reuse `WorkBetCreate` (not build a new promote-wizard page), but should have explicitly stated: *"Single-team is optimistic in-place; multi-team navigates to the existing team-picker form and requires a second Create click."* This is a documentation/transparency issue, not a functional bug.

**Compound:** Candidates CC-007 (spec/reality drift) and CC-008 (protected-test contracts). The multi-team landing experience should have been a stated acceptance scenario (validation scenario 3) rather than deferred to architecture "settlement." When a feature has N distinct user paths, each path should have at least one named test or scenario.

### CARRY-FORWARD — Multi-team provenance drop risk (architecture-critique CARRY-FORWARD #2)

Architecture critique called out:
> *"this is the ONLY place sourceKnowledgeItemId can silently drop on the multi-team path. Verify it reaches handleCreate's payload."*

The risk was real: the `?fromKnowledge=` search param is read in `WorkBetCreate` (line 35), but must be explicitly carried into the `handleCreate` POST payload (line ~87). The reviewer added a `@lore AK5` comment calling it out as the critical carry-forward point. The builder **did carry it forward correctly** (`payload.sourceKnowledgeItemId = fromKnowledgeId` when `fromKnowledgeId !== undefined`), and the test (`WorkBetCreate async-path test` line 465–501) verified the payload includes it.

**Learning:** The reviewer's explicit "this is the ONLY place" framing + carry-forward lore comment in the code proved effective. The builder caught it and tested it. This is a working pattern for critical single-point-of-failure spots. The pass was due to explicit call-out + loaded test, not accident.

### FRICTION — Two-commit rework for stale comment

After the critical bug fix commit `9adf7f2e`, a follow-up commit `9f7cd745` was needed to "fix stale loading-gate comment" — the comment in the render section still mentioned the knowledgeLoading gate as "new" and "deferred to later," but it was already in the code. This was a documentation/hygiene issue (the comment was correct in spirit but stale in wording), not a bug, but it required a second doc commit.

**Compound:** A micro-pattern: builders commit code + comment together. When a comment is added to describe a new feature, it should be written in the present tense ("the gate defers...") not future tense ("we will defer..."). Code review should flag stale forward-looking comments as a NIT + auto-fix in the same review round, not a separate follow-up commit.

### SUCCESS — Lore comments proved discoverable

AK5 added four `@lore AK5` comments in the code:
1. `schema.ts:~193` — RESTRICT rationale (knowledge items have no hard-delete endpoint).
2. `KnowledgeDetail.tsx:~200` — team resolution strategy (single-team auto-resolves, multi-team falls back to picker).
3. `WorkBetCreate.tsx:~35` — multi-team provenance drop risk (the ONLY place it can be lost).
4. `WorkBetCreate.tsx:~47-62` — loading gate + TipTap initialization (defer mount until fetch settles).

The reviewer and the builder both referenced these lore comments as the key decision points. They were written at the moment of decision-making (during implementation or in code-review comments), not retrofitted, and they were indexed by workpackage + theme, making them searchable. **Future contributors should be able to `grep "@lore AK5"` and find the rationale.**

**Compound:** CC-010 continuation — lore comments are part of the working pattern. They should be preserved and not removed during refactoring.

### FRICTION — Schema migration prose was inaccurate; SQL correct due to automation

Architecture plan stated: *"SQLite + Postgres both: `ALTER TABLE bets ADD COLUMN source_knowledge_item_id text REFERENCES knowledge_items(id)`."*

Critique **WARNING A2+A6** found:
1. Codebase is **Postgres-only** (no SQLite lane); the "SQLite + Postgres" claim was stale inherited language.
2. The hand-sketched SQL doesn't match drizzle-kit output — Postgres emits `ADD COLUMN` + separate `ADD CONSTRAINT ... FOREIGN KEY`, not inline `REFERENCES`.

**Impact:** None. The plan also said the migration is **generated** via `npm run db:generate`, which is the correct mechanism. So the builder didn't hand-write the DDL, and drizzle-kit emitted the correct syntax. The prose was illustrative and wrong, but harmless.

**Learning:** When prose gives an SQL example, either (a) make it schema-dialect-explicit ("Postgres: ..."), or (b) omit the example and state "generated via `npm run db:generate`" only. Hand-sketched DDL examples in plans often diverge from actual tooling output, especially for FK constraints.

### FRICTION — AK1 noun incomplete in prose; code correct

Architecture prose referenced `deriveTitleFromPitch` (the old AK1 name), but AK1 rename to **`deriveTitle`** was already complete in server + shared. The old name now survives only as a client-local helper in `WorkBetCreate.tsx:49` (unrelated to AK5's flow, which doesn't call title-derivation server-side).

**Impact:** Prose-only stale reference. AK5 correctly reuses the existing title-derivation, which is now called `deriveTitle` server-side. The code is correct; the plan prose was out of sync with the AK1 rename that landed before AK5 started.

**Learning:** Architecture plans should pin vocabulary to the **current** code state at the moment of writing, not assume historical names. A `grep deriveTitle packages/` check at plan-write time would have caught this.

---

## Detailed observations for retro log

The following are recorded to `.pipeline/retro-log.jsonl`:

1. **TDD red-phase test discovery of CRITICAL async bug** — Test suite proved the production async-empty-editor bug in multi-team path. Fixture masking was removed, loading gate added, async-path test written to drive the boundary condition. Green-phase implementation benefited from explicit lore comment (T1 constraint) and carry-forward architecture guidance. This is a textbook TDD + code-review collaboration. | severity: low | tags: ["tdd-critical-discovery", "working-process", "test-realism"] | compoundCandidates: ["CC-010"]

2. **Test-fixture masking of async boundaries** — The fixture-fallback `knowledgeFixtures` in WorkBetCreate prevented the async-path bug from being caught in the test suite. The synchronous fixture-resolved test was too close to production for comfort but didn't exercise the real async boundary. The bug only manifested when real async data flow occurred (multi-team path). | severity: medium | tags: ["test-fixture-masking", "async-boundary", "test-realism-gap"] | compoundCandidates: []

3. **Multi-team UX asymmetry under-specified at plan time** — Architecture settled on reusing WorkBetCreate for multi-team, but the user experience is visibly different: single-team is in-place + fast (MenuItem → POST → land), multi-team is page-nav + two-step (MenuItem → nav to form → team select → Create). Both satisfy ACs, but UX shape divergence should have been explicit in plan validation scenarios. | severity: medium | tags: ["ux-asymmetry", "plan-completeness", "multi-path-scenarios"] | compoundCandidates: ["CC-007", "CC-008"]

4. **Explicit carry-forward lore comment + test verification proved effective** — Reviewer called out "this is the ONLY place sourceKnowledgeItemId can silently drop" with a tagged `@lore AK5` comment in the code. Builder explicitly carried it forward and tested it. Working pattern: single-point-of-failure spots should get explicit reviewer flagging + lore comment in place + test coverage. | severity: low | tags: ["code-review-pattern", "lore-effective", "single-point-of-failure"] | compoundCandidates: []

5. **Stale forward-looking comment required doc follow-up commit** — Initial implementation added "defer to later" language in a comment, but the feature was already implemented. Follow-up commit `9f7cd745` fixed the stale comment wording. Code-review should have flagged this as a NIT + auto-fixed in the same review, not deferred to a second commit. | severity: low | tags: ["comment-staleness", "review-hygiene"] | compoundCandidates: []

6. **Lore comments at decision points proved discoverable and valuable** — Four `@lore AK5` comments captured in code during implementation at the moment of architectural decision-making, indexed by workpackage + theme. These were referenced by reviewer and builder as rationale sources. Pattern is working. | severity: low | tags: ["lore-effective", "decision-capture"] | compoundCandidates: ["CC-010"]

7. **Schema migration prose inaccurate; automation masked the error** — Plan stated "SQLite + Postgres both: ... REFERENCES ..." but codebase is Postgres-only and drizzle-kit emits different syntax. Plan also said "generated via `npm run db:generate`" which is the correct path. Builder used the automated path, so incorrect prose had zero impact on actual SQL. Lesson: hand-sketched SQL examples in plan prose are fragile; either make them dialect-explicit or omit them entirely. | severity: low | tags: ["schema-prose", "plan-illustration-drift"] | compoundCandidates: []

8. **AK1 harness-vocabulary rename incomplete in prose** — Architecture prose referenced old `deriveTitleFromPitch` name (changed to `deriveTitle` in AK1). AK5 code is correct (reuses existing deriveTitle without calling it); prose was out of sync with upstream rename. A vocabulary-sweep grep at plan-write time would have caught this. | severity: low | tags: ["vocabulary-drift", "plan-accuracy"] | compoundCandidates: []

9. **Code review CRITICAL → fix → re-review → DONE, one loop** — Green-phase implementation shipped with empty-editor multi-team bug. Code review flagged CRITICAL. Builder immediately added loading gate + async-path test + removed fixture fallback. Re-review DONE. Total: one rework loop. Efficient recovery thanks to focused code-review CRITICAL flag and clear remediation path. | severity: low | tags: ["code-review-loop", "quick-recovery"] | compoundCandidates: []

---

## Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Commits | 12 total | 1 scaffolding, 1 red, 5 green, 1 critical fix, 1 attestation, 1 doc, 2 doc (follow-ups) |
| Code-review rounds | 1 CRITICAL loop | Green → CRITICAL → fix → DONE |
| Design critique | 8.5/10 | Routine, single-variant + alternatives. 2 WARNINGs (multi-team UX asymmetry, placement self-flagged) |
| Architecture critique | 4.3/5 | APPROVED. 3 WARNINGs (stale noun, migration prose, multi-team asymmetry) + 4 carry-forwards (highlighted weak spots) |
| Test coverage | 7 ACs × 1 test each + 1 async-path regression test | All ACs have red-phase tests. Fixture-path + async-path both covered. |
| Verify | Green | Full verify suite passed w/ attestation after critical fix |
| Productivity commits | ~64% | 8 commits with semantic change; 4 chore/doc commits |

---

## Critical signals for next compound pass

1. **Test-fixture masking pattern** (emerging) — When a hook/service is async but tests mock it with sync fixtures, the fixture path can mask async-boundary bugs. Recommend adding a "test both paths" pattern to the red-phase checklist for async surfaces. Watch for third occurrence.

2. **Multi-path scenarios under-specified** — Features with N distinct user paths (single-team vs multi-team, admin vs non-admin, etc.) should have N named acceptance scenarios at plan time, not deferred to architecture settlement. AK5 and prior AK3 both had this. Pattern recognition opportunity for a plan-checklist item.

3. **Carry-forward lore comments as safety net** — Explicit reviewer flagging of critical single-point-of-failure spots + lore comment in code + test coverage proved effective. This working pattern should be documented and protected.

4. **Prose × tooling drift on DDL/SQL examples** — Hand-sketched SQL in plan prose diverges from actual tool output. Either make examples dialect-explicit or remove them and rely on automation. Low priority but recurring micro-friction.

---

## Confirmation

AK5 is shipped and merged to main (PR #306). The CRITICAL multi-team bug was caught at code-review, fixed, re-reviewed, and verified before merge. All ACs satisfied. TDD red-phase discipline + explicit code-review guidance + lore comments + targeted test + architectural reuse worked well together.

