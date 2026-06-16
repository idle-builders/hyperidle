# AJ6 — Retro (Phase 6)

**Workpackage:** Design-system viewer as whole-product design-review surface  
**Track:** AJ — Design-system & viewer infrastructure  
**Status:** COMPLETE (Phase 1 locked in prior session; Phases 2–6 this session)

## Summary

AJ6 locked concept + architecture in a prior session and resumed at Phase 2 (critique). The two-axis Catalog remodel was a *routine design* (catalog-tier-grouping pattern on existing component) but the *architecture* was *moderate complexity* (classification precedence, no-cycle guard, snapshot guard). Critique found 2 CRITICAL architecture gaps **before build**, paid off via designer revision, leading to TDD-green first pass. Code review discovered 2 CRITICAL defects the build system missed (ESLint flat-config gotcha, embodiment-story-in-snapshot), both fixed in revision round 1. **Cost: ~10h productive work, zero infrastructure overhead this session.**

---

## Phases & Timeline

| Phase | Outcome | Evidence |
|-------|---------|----------|
| 1 — Concept | LOCKED in prior session | commit `cbfa5a4d` |
| 2 — Critique (design) | 8.5/10, routine, no CRITICAL | `plans/AJ6/design-critique.md`, commit `80c4c7ef` |
| 2 — Critique (architecture) | 7.5/10, 2 CRITICAL findings (C1 page-precedence, C2 no-cycle unenforceable) | `plans/AJ6/architecture-critique.md`, commit `80c4c7ef` |
| 2 — Designer revision | Resolved C1 + C2 + W1–W6 | commit `aa63efba` |
| 3 — Build (tasks 1–6) | TDD green first pass; 6 commits | commits `7f93c1f7` → `c6901bf1` |
| 4 — Code review | 2 CRITICAL defects found; fixed in 1 revision round | commits `0dc57d57`, `a9889a98` |
| 5 — Ship | Attestation green | commit `fdcbbe63` |
| 6 — Docs + Retro | Artifact retirement + observations | commit `f8c4e28c` → this file |

---

## Cost Signals

### Productive Work
- **Phase 2 critique:** ~1h design + ~1h architecture (reviewer found real gaps C1/C2)
- **Phase 2 revision:** ~0.5h (designer resolved 6 findings, plan cleaned)
- **Phase 3 build:** ~4h (6 tasks + lint, TDD green first pass, 60 files touched, 504+869 insertions)
- **Phase 4 code review:** ~1.5h (2 CRITICAL defects, 2 fix commits, 1 revision round)
- **Phase 5 ship:** ~0.5h (verify + attestation)
- **Total:** ~8.5h of domain work

### Infrastructure Overhead
- **Zero.** No stale-base rebases, no attestation churn, no CI rerun loops, no permission prompts. Session fast.

### Why TDD Green First Pass?
- Concept + architecture locked in prior session eliminated spec drift during build.
- Critique round pinned two ambiguities (page classification precedence in AC1, concrete no-cycle gate in AC8) before write-tests, so test suite was precise (not exploratory).
- Designer's revision loop propagated critique findings back into the plan, so builder received a clean spec.

---

## Code Review Findings & Fixes

### CRITICAL-1: AC8 (no-cycle ESLint rule) did not fire on `viewer/discovery.ts`

**Discovery:** Builder committed AC8 as a single ESLint flat-config block with `files: ["packages/design-system/src/**", "packages/design-system/viewer/discovery.ts"]` and `ignores: ["packages/design-system/viewer/**"]`. Tests passed; linting passed. But `discovery.ts` sits in `viewer/`, which IS in the ignore list. **ESLint flat-config precedence: `ignores` beats `files` within the same config object** — `files` does not override `ignores`.

**Builder's mistake:** Inline comment asserted the opposite ("files in same block override ignores"). Factually wrong about flat-config semantics.

**Fix (commit `0dc57d57`):** Split the single block into two separate config objects:
- **AC8a:** `files: ["packages/design-system/src/**/*.{ts,tsx}"]` (design-system package exports)
- **AC8b:** `files: ["packages/design-system/viewer/discovery.ts"]` (discovery contract alone)

Each block has clean scope; both now apply rule without ambiguity. Proof: injecting `import @hyperidle/web` → ESLint error fires on both src/** and discovery.ts; removing → clean.

**Lore captured:** `eslint.config.ts` lines 712–761 + @lore block documents the flat-config gotcha.

---

### CRITICAL-2: AC9 (snapshot churn guard) violated — `CatalogAxis.stories.tsx` leaked into catalog

**Discovery:** Design spec included `CatalogAxis.stories.tsx` as a *design-only fixture story* — it embodies the grouped-catalog render + axis divider for design review at `:8098` before the real wiring landed. Builder committed it to `packages/design-system/src/` (inside the glob scope), rendering it as a real catalog component. Snapshot test caught the additive drift: re-blessing added 157 lines (CatalogAxis variants) when AC9 said "only Tokens additive."

**Root cause:** Design comment (approved.md line 77) said "may be deleted once the real grouped catalog ships" — builder didn't read or didn't prioritize the deletion. Story belongs in plan/design artifacts, not in the shipped catalog glob.

**Fix (commit `a9889a98`):** Delete `CatalogAxis.stories.tsx` (157 lines) + remove from `DS_COMPONENT_GROUPS` registry entry. Re-bless snapshot: CatalogAxis blocks gone, Tokens block preserved (2nd snapshot never happened).

**Bonus finds in same commit:**

- **W-1:** `seg()` prefix-substring matching allowed false positives. Path `pages/work-summary.stories.tsx` would match `seg('pages/work')` even though it's not in the `pages/work/` directory. Tightened to require trailing `/` boundary: only `/pages/work/` with slash matches. Added 3 tests proving false-prefix rejects + true-segment accepts.

- **O-4:** Removed stale builder-note comment from `Tokens.stories.tsx` header ("Builder note (AJ6 green phase): swap tier → group once StoryMeta.group lands") — note is obsolete once commit lands.

- **O-5:** Removed redundant exact-match checks in `deriveFromTitle` (title === 'Page: Conversations' and title === 'Page: Settings' subsumed by subsequent startsWith checks).

- **Artifact shadow:** Stale `discovery.js` (build artifact) was gitignored but sitting in `viewer/__tests__/` where vitest found it before the TS source. Check .gitignore for shadowing build outputs in test roots.

---

## Lessons & Patterns

### 1. ESLint Flat-Config Gotcha (Critical Learning)
**Gotcha:** In a single ESLint flat-config block, `ignores: []` wins over `files: []`. There is no override; `files` is a filter, not a whitelist. Developers familiar with eslintrc (where `ignores` was a separate top-level key) often get this wrong.

**Mitigation:** 
- Document the precedence in code (@lore block or comment).
- Split scopes that could conflict into separate config blocks.
- Test the rule on boundary files (e.g., `discovery.ts` in an `ignores` dir) to verify it fires.

### 2. Design-Only Embodiment Stories Have a Lifecycle (Emerging Pattern)
**Pattern:** When shipping a novel UI surface (catalog remodel, feedback overlay, design tokens), designers often produce *fixture-only stories* to visualize the design before implementation is ready. Examples:
- **AJ6:** `CatalogAxis.stories.tsx` (grouped catalog + axis divider design)
- **W2:** Token gallery fixture story (not committed)
- **AJ5:** Feedback overlay mockups

**Lifecycle:**
1. **Design phase:** Author as a pure fixture story in the design plan (`.stories.tsx` inlined in `approved.md`).
2. **Build phase:** Optionally commit a fixture story to the design-system source *with explicit lifecycle comment* ("Delete once real wiring ships").
3. **Post-build:** Delete the fixture story before the glob-rendered catalog ships (it's not a real component).

**Gotcha:** If the fixture story sits in a glob-scanned directory (e.g., `src/*.stories.tsx`), it WILL be rendered as a real component. Vitest snapshot guard catches it (additive churn), but the deletion is still rework.

**Mitigation:**
- Plan should explicitly name design-only fixture stories and their deletion trigger.
- Code review should verify deletion happened or confirm it was intentional (kept as a hidden story or a dev-only demo page).
- Snapshot guard will catch any accidental leaks as additive churn → review reads the diff and confirms.

### 3. Gitignored Build Artifacts Can Shadow Sources (Artifact Management)
**Gotcha:** A stale build artifact (e.g., `discovery.js` from a previous tsconfig) can sit in a test directory and be discovered by the test runner before the TS source. This doesn't break the build (tests still pass) but it is a stale-state smell.

**Mitigation:**
- Extend `.gitignore` to catch build outputs: `**/src/**/*.{js,js.map,d.ts,d.ts.map,tsbuildinfo}`.
- Before major test runs, check for stray `.js` / `.d.ts` in source directories and delete them.
- Vitest discovery will fail if the artifact shadow breaks the test, so this is a UX friction (rebuild loop confusion) more than a correctness issue.

### 4. False-Prefix Path Matching is a Subtle Bug
**Gotcha:** String prefix-matching logic for path classification (`seg('pages/work')` matching any path starting with that string) can false-match `pages/work-summary`, `pages/working`, etc.

**Mitigation:**
- Require segment boundary markers (e.g., trailing `/`) in path classification rules.
- Add explicit test cases for false-prefix paths: "pages/work-summary.stories.tsx should NOT match seg('pages/work')."

### 5. Critique Catches Real Gaps Before Build (Success Pattern — Protect)
**Success:** The two-agent critique (design + architecture, independent reviewers) found 2 CRITICAL architecture gaps **before write-tests**:

- **C1:** Page classification precedence ambiguity (path-rule vs title-rule authoritative?).
- **C2:** AC8 (no-cycle guard) stated as unresolved OR ("eslint OR check assertion"), not a concrete gate.

Designer revised the plan the same session, pinning C1 (classification rule order) and C2 (split ESLint config blocks). **This revision loop paid for itself:** builder received a precise spec, TDD tests matched intent exactly, code review found zero "spec mismatch" class failures (only tool/toolchain issues like flat-config precedence).

**Contrast:** Without critique, these gaps would have been discovered at Phase 4 code review or Phase 5 CI, requiring rework of the plan + tests + code.

**Protect:** The critique loop (Phase 2 → designer revision → builder gets clean spec) is a durable pattern. Do not collapse multiple reviewers into one or skip design-critique for "routine" designs.

### 6. TDD Red-Phase Before Implementation (Success Pattern — Protect)
**Success:** Build phase committed tests first (all red) and immediately green on implementation. Zero exploratory red→green rework. Why? Because the spec (concept + architecture) was locked and precise by the time write-tests ran.

**Corollary:** The locked spec came from critique. If critique had not pinned C1/C2, tests would have been written against an ambiguous spec, leading to red-phase rework and exploration.

---

## Observations for Retro Log

See `.pipeline/retro-log.jsonl` for 6 appended observations (cost signals, lessons, compound-candidate notes).

---

## Artifacts Retired

- `plans/AJ6/concept.md` → Content moved to commit history + lore comments + design-system docs.
- `plans/AJ6/design/approved.md` + `comparison.md` + `rejected.md` → Content locked, rationale in code.
- `plans/AJ6/design-critique.md` + `architecture-critique.md` → Findings resolved in Phase 2 revision; history kept for reference.

---

## Follow-Ups

None blocking. The following are watches for next design-review surfaces (AJ5, AJ7):

- **Embodiment-story-in-snapshot pattern:** If AJ5 or AJ7 ship design-only fixture stories via glob, confirm deletion trigger is named in plan and enforced at code review.
- **ESLint flat-config boundary rules:** When the next AC requires static scoped rule (package boundary, path restriction), document the `ignores`-beats-`files` precedence in @lore and test boundary files.

---

## Definition of Done — Verified

- [x] Code review PASS (2 CRITICAL defects found + fixed)
- [x] Attestation green (verify signed off)
- [x] Snapshot re-blessed (CatalogAxis removed, Tokens preserved)
- [x] No lint/type errors
- [x] No pre-existing lint baseline drift
- [x] All tests pass
- [x] Concept + architecture locked and carried forward
- [x] No stacked PRs (AJ5 #324 merged first; AJ6 rebased on clean main)

**READY TO SHIP**
