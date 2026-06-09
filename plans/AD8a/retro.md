# Retro: AD8a — Agent Type System + Noun Purge

**Dates:** Pipeline start 2026-06-08 — completion 2026-06-09  
**Cost:** 21 commits | 2 architecture revisions + critique | 5 implementation commits  
**Scope:** Schema rename (personal→individual), 97 files touched (code/tests/docs/E2E), Rail API purge, three-type taxonomy doc rewrite

---

## What Went Well

**1. Architecture critique caught 17+ missed files in the first pass.**

v1 plan missed: visual-compare-map.ts, ThreadSections stories, knowledge-data.ts, schema.integration.test.ts, six E2E spec files. The critique process identified every gap systematically — this is the system working as designed. No rework required post-implementation because the plan was thorough before the builder started.

**2. Clear scope boundary prevented scope creep.**

The decision to split AD8a (what humans see) from AD8b (what code sees) was articulated in the plan v2 summary. The builder followed this boundary religiously. No accidental structural renames crept in. Section 13 (what AD8a does NOT do) listed 15 explicit exclusions and the builder honored every one.

**3. Phased task ordering minimized broken intermediate states.**

Schema → types → seeds → Rail deletion → display strings → docs. Each commit left `npm run check` passing. The builder could have stopped after any phase and the codebase would be halfway-done but coherent, not half-broken.

**4. `@lore AD8a` comment strategy worked as intended.**

38 comments across skill-tools, Rail infrastructure, eval scenarios, and exclusion files marked the AD8b work clearly for the next agent. The comments say "what AD8b will do", not "why AD8a decided", keeping them actionable.

---

## What Didn't Go Well

**1. Doc purge was skipped in Task 13 on the first pass.**

The commit "feat(AD8a): Task 14 — noun purge doc/code updates" was a separate pass from earlier display-string updates. The code-review phase caught this and required a follow-up. The plan made it clear (Task 14 was final) but the builder did not batch docs with the rest of Task 8-10. Minor friction, no rework of the completed code.

**2. Naming resolution required critique feedback.**

The concept initially proposed "Assistant" as the seed agent display name. The critique (WARNING-1) flagged that this creates a semantic collision with the per-user assistant concept in AD8b. The plan had to revise to "System Agent" — a deliberately boring transitional name. This is a reviewer catch, not a builder miss, but it required an extra plan pass.

**3. Merge conflict on Rail deletion required context switching.**

The builder encountered a merge conflict when Rail.ts was deleted — origin/main had moved and the deletion needed to be replayed. One commit was required to resolve. Low impact but added one more touch to the rail-deletion phase.

---

## Cost Signals

| Metric | Value |
|--------|-------|
| Total commits | 21 |
| Plan revisions | 2 (v1 + v2 after critique) |
| Critique rounds | 1 (architecture-critique.md) |
| Implementation phases | 6 (schema, seeds, Rail, display strings, web code, docs) |
| Files edited | ~97 |
| Files deleted | 4 (Rail API files) |
| Test files written | 1 (AD8a-category-rename.integration.test.ts) |
| Review rounds | 1 (code-review.md identified doc-purge gap) |

The cost was front-loaded in architecture (2 revisions + 1 critique pass). Implementation was methodical. The final pipeline run (verify + attestation) required two attempts (306081da, 95ea5567) — both successful, suggesting the build system itself was recalibrating, not code regressions.

---

## Observations for `/compound`

**Pattern 1: Critique before code prevents large reworks.**

The architecture critique identified 17+ missed files. If those files had been discovered post-implementation during the grep verification phase (Task 15), they would have required stopping the builder and adding new changes. Instead, the critique forced completeness upfront. This pattern should be standard for vocabulary/purge work — finalize the file enumeration before the builder starts.

**Pattern 2: Intermediate naming decisions benefit from reviewer perspective.**

The "System Agent" vs "Assistant" choice came from the reviewer, not the designer. The reviewer has the vantage point to see collisions with other concepts. Naming decisions in purge/rename workpackages should be reviewed before the plan is locked.

**Pattern 3: Scope boundary clarity (what vs how) unblocks large refactors.**

The AD8a/AD8b split (what humans see / what code sees) was so clear that the builder never questioned whether to include file renames, API path changes, or type union updates. A fuzzier boundary would have spawned decisions and delays. This clarity should be part of the architecture plan for any rename/purge task.

**Pattern 4: Doc purge should be explicit in task ordering, not assumed.**

The builder batched display-string updates (Tasks 7-10) but treated doc purge separately (Task 14). The plan said "Task 14 is last", but the builder did not treat it as equally urgent. Docs should be called out as a distinct phase with its own commit, not batched with code.

---

## Key Decisions Preserved

- **"System Agent" transitional name:** Deliberately boring, does not promise per-user behavior. `@lore` explains it to AD8b.
- **Keep `chief_of_staff` role string:** Role renames cascade across tool authorization, API routes, WebSocket topics. AD8b handles this atomically.
- **Stale `soul_template:chief_of_staff` factorySettings:** Accept the stale key in existing databases. AD8b removes it when creating the new assistant soul template.
- **Keep Rail topic names and item-router routing values:** These are behavioral strings, not display strings. Renaming them changes what arrives at subscribers. AD8b handles the full rename with new infrastructure.
- **Keep Rail API deletion + doc replacement separate:** The API is gone; the Rail UI concept is replaced by "assistant" in docs. The API deletion and concept rename are two separate changes, kept in the same commit for clarity but with different scopes.

---

## Quality Gates Passed

- `npm run check` (zero type errors)
- `npm run lint` (zero lint errors)
- `npm run test:all` (all green)
- `npm run verify` (full pipeline including attestation)
- Grep verification (zero dead-noun occurrences outside exclusion list)

---

## For the Next Agent (AD8b)

The AD8a branch leaves you with:
- All display strings and docs updated
- Schema migrated and tested
- Rail API deleted
- Comprehensive `@lore AD8a` comments on 38 exclusion locations
- Three-type taxonomy doc ready (no further rewrites needed)

Your work begins with structural renames: role strings, file names, API paths, WebSocket topics, type unions, type-level routing return values, and hint IDs. Use the `@lore AD8a` comments as your checklist. No behavioral changes — just renaming infrastructure that the display-layer updates have already accounted for.

---

**Status: COMPLETE.** AD8a scope is fully executed. All acceptance criteria verified. Ready for merge.
