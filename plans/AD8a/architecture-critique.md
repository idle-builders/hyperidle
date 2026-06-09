# Architecture Critique: AD8a (v2)

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:8 LI:9 AC:N/A DM:9 N:9 MD:9 FMC:7 S:9 V:8

**Verdict: PASS.** The revised plan addressed all three critical findings and all four warnings from v1. Three minor gaps remain (see WARNING section below) but none block implementation.

---

## v1 Finding Resolution

### CRITICAL-1 (17 files missing): RESOLVED

All files flagged in v1 are now in the plan:
- `visual-compare-map.ts` -- section 8.2, Task 8
- `ThreadSections.stories.tsx` -- section 8.2, Task 8
- `ThreadSections.conversations.test.tsx` -- section 8.2, Task 8
- `knowledge-data.ts` (3 occurrences) -- section 8.2, Task 8
- `WorkRoutine.stories.tsx` -- section 8.2, Task 8
- `schema.integration.test.ts` -- section 8.3, Task 5
- `M3-api-wiring.spec.ts` -- section 7.4, Task 9
- `settings-redesign.spec.ts` -- section 7.4, Task 9
- `keyboard-and-responsive.spec.ts` -- section 7.4, Task 9
- `work-bet-session.spec.ts` -- section 7.4, Task 9
- `W3-sidebar.spec.ts` -- section 8.8, Task 9

### CRITICAL-2 (eval scenarios): RESOLVED

New section 8.5 covers all 8 eval scenario files with line-level changes. The plan correctly splits the treatment: description strings and soul prompts change in AD8a, `agentRole: "chief_of_staff"` values stay with `@lore AD8a` comments for AD8b. Task 10 explicitly lists all 9 eval files.

### CRITICAL-3 (skill-tool role auth arrays): RESOLVED

New section 8.6 lists all 5 skill-tool source files and 7 skill-tool test files. The exclusion list in section 11 grep commands includes `roles:.*"chief_of_staff"` and `buildToolRegistry.*chief_of_staff` filters. Section 13 (what AD8a does NOT do) explicitly lists skill-tool role authorization arrays.

### WARNING-1 (seed rename to "Assistant"): RESOLVED

The plan changed from "Assistant" to "System Agent" (section 4.2). The rationale is clear: avoids collision with the concept's per-user assistant. The plan also includes a `@lore AD8a` comment explaining the transitional name.

### WARNING-2 (CocAttachButton aria-label): RESOLVED

Section 8.2 now lists `CocAttachButton.tsx:40` with the aria-label change. Task 8 includes it.

### WARNING-3 (CocOverlay display strings): RESOLVED

Section 8.2 now lists `CocOverlay.tsx:195` (hostTitle) and `CocOverlay.tsx:248` (aria-label) explicitly.

### WARNING-4 (factorySettings stale entry): RESOLVED

New section 4.7 addresses this directly. The plan accepts stale data as a known state and defers cleanup to AD8b, with a `@lore AD8a` comment in seed.ts.

### SUGGESTION-1 (condense section 8): RESOLVED

Section 8 is now structured as clean tables organized by subsystem. The deliberation is gone; only conclusions remain.

### SUGGESTION-2 (task-level file checklists): RESOLVED

Every task in section 9 now ends with an explicit `Files:` line listing all files. Tasks 8, 9, and 10 -- previously vague -- now enumerate their files.

### SUGGESTION-3 (doc file rename): RESOLVED

Section 6.2 explicitly decides: keep filename as-is, add a historical note at the top, defer deeper restructuring to AE1.

### SUGGESTION-4 (AC-1 test specification): RESOLVED

New section 10 provides the full test file path (`packages/db/src/__tests__/AD8a-category-rename.integration.test.ts`) and complete test code with two test cases.

---

## Dimension Scores (v2)

### 1. Spec Alignment: 8/10

The plan covers all 11 ACs with explicit verification methods. The file enumeration is now comprehensive -- ~97 files touched across code, tests, E2E, eval, and docs. Three files were found that are still missing (see WARNING-1 below), but all are minor mechanical changes that a builder will catch through the grep verification commands.

### 2. Layer Integrity: 9/10

Unchanged from v1. Clean layer discipline throughout.

### 3. API Contracts: N/A

No new APIs. Only the dead Rail API is deleted. The plan now includes a security note (section 7) confirming no external consumers.

### 4. Data Model Alignment: 9/10

Improved from v1. The migration approach remains sound. The stale `factorySettings` question is now addressed in section 4.7 with an explicit decision (accept stale data, defer to AD8b) and a `@lore` comment. The AC-1 integration test is fully specified in section 10.

### 5. Naming: 9/10

Improved from v1. The "System Agent" name resolves the semantic collision with the concept's per-user assistant. The `@lore AD8a` comments on the seed explain the temporary inconsistency between display name ("System Agent") and role string ("chief_of_staff"). The three-type taxonomy names are clean.

### 6. Module Depth: 9/10

Unchanged from v1. No new modules or abstractions.

### 7. Failure-Mode Coverage: 7/10

Improved from v1. The plan now includes:
- Security note on Rail API deletion (section 7, no external consumers)
- Exhaustive E2E file enumeration (section 7.4, 8.8, 8.9)
- Comprehensive grep exclusion lists (section 11) with `grep -v` filters for all known structural identifiers

Remaining gap: the grep commands are defensive but rely on pattern matching (`grep -v 'roles:.*"chief_of_staff"'`) which could miss edge cases where the same string appears in a different format. This is acceptable given the alternative (manual enumeration of every line in ~50 files).

### 8. Simplicity / Over-Engineering Risk: 9/10

Improved from v1. Section 8's deliberation is condensed. The AD8a/AD8b boundary is now articulated in one paragraph (section 8 header) instead of three pages. Section 13 (what AD8a does NOT do) grew to 15 items, which is thorough scope discipline. The self-critique (section 14) covers 7 tensions honestly.

### 9. Verifiability: 8/10

Improved substantially from v1. The plan now has:
- Full AC-1 integration test code (section 10) with file path and two test cases
- Grep verification commands with correct exclusion lists (section 11)
- Explicit file lists per task (section 9)
- W3-sidebar.spec.ts regression guard handling (keep assertion, update comments)

---

## WARNING (v2 -- new findings)

### WARNING-1: Three files with dead nouns still not in the plan

Grep against the current codebase found three additional files the revised plan does not list:

1. **`packages/server/src/routes/__tests__/X3-agents.integration.test.ts:83`** -- `name: "X3 Chief of Staff"` in test seed data. This is a display string in test fixture data.
2. **`packages/design-system/src/ThreadRow.stories.tsx:108`** -- `title="Chief of Staff -- weekly reflection"` in a Storybook story. The plan covers `packages/web/src/components/ThreadSections.stories.tsx` but misses the design-system package entirely.
3. **`packages/db/src/__tests__/seed.integration.test.ts:93`** -- test name `"seeds one Chief of Staff, >=1 Practice Facilitator, >=1 Product Manager (AC1)"`. After the seed is renamed to "System Agent", this test name should update to match.

Impact: low. All three are mechanical string replacements. The builder's grep verification (section 11) will catch these at Task 15 if they are not addressed in earlier tasks. But the builder should be aware these files exist.

### WARNING-2: `@lore AD8a` comment volume

The plan says "one `@lore AD8a` comment per file at the relevant location" (section 14, point 5). Across 5 skill-tool source files, 7 skill-tool test files, 8 Rail infrastructure files, 8 eval scenario files, and ~10 other exclusion files, that is ~38 `@lore AD8a` comments to add. This is a significant amount of comment injection for a builder to track. A checklist per task would help.

---

## What's Working Well

1. **The AD8a/AD8b boundary is razor-sharp.** "What humans see" (AD8a) vs "what code sees" (AD8b) is the cleanest possible split for a vocabulary purge. Section 13 now lists 15 explicit exclusions.

2. **"System Agent" resolves the naming tension.** The transitional name is deliberately boring, does not promise per-user behavior, and communicates "this exists for system reasons." The `@lore` annotation ensures AD8b picks it up.

3. **The grep verification commands are now practical.** The exclusion filters in section 11 cover every known structural identifier pattern. A builder running these commands after implementation will get actionable results, not pages of false positives.

4. **Task ordering minimizes broken intermediate states.** Schema + types first, then seeds, then API deletion, then display strings, then docs. Each phase leaves `npm run check` passing.

5. **The AC-1 integration test is fully specified.** Section 10 provides production-ready test code with the correct vitest fixture pattern and two complementary test cases (insert new value + verify migration converted old values).
