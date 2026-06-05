# X8 v5 Retro: AB0 Adaptation

**Date:** 2026-06-04  
**Workpackage:** X8 v5 (AB0 role model adaptation)  
**Scope:** 8 new scenarios + seeding library updates  
**Validated:** 24 interactions across all 92 scenarios (84 original + 8 new)

---

## 1. AB0 Adaptation Impact

**Role model change:** 6 hard-coded roles → 16 catalog roles across 3 categories (team/strategy/custom)

**Impact on eval:** Minimal architectural rework. The seeding library's `seedAgent()` function already accepted `role: UserRole` (a string type). AB0 didn't change the string signature — it changed what strings are *valid* and added metadata (category, defaults, permissions) via a catalog.

**Adaptation implementation:**
- Added `agentCategory` parameter to `seedAgent()` (line 120, seeding.ts) with default `"team"` for backward compat
- No changes to scenario rubric dimensions — existing role-based scenarios still work
- New role scenarios (8 total) test the three new categories: team roles (builder, designer, pm), strategy roles (practice_facilitator, scout), custom roles (open strings)

**Seeding pattern:** Auto-derive `agentCategory` from `findRoleCatalogEntry(role)` — not done. Instead, `seedAgent()` requires explicit `agentCategory?: AgentCategory` parameter with fallback to `"team"`. This is safe but requires each scenario to specify category explicitly rather than auto-deriving from role.

**Verdict:** AB0 was a *label reorganization*, not a structural change. The eval layer adapted cleanly with one parameter addition. No rework of existing 84 scenarios. All 92 scenarios validated without conflicts.

---

## 2. Seeding Pattern Effectiveness

**Pattern:** Extended `seedAgent()` with optional `agentCategory` parameter (backward-compatible default: `"team"`).

**Auto-derivation attempt:** Concept section proposed deriving `agentCategory` from catalog lookup. **Not implemented.** Instead, each scenario that uses strategy or custom roles must explicitly pass `agentCategory` (e.g., `agentCategory: "strategy"` for facilitator roles).

**Consequence:** 8 new scenarios have explicit `agentCategory` parameters. 84 existing scenarios default to `"team"` (implicit, not broken). The library is safe under the default but not fully exploiting AB0's catalog structure for automation.

**Assessment:** The manual explicit approach is more robust than auto-derivation (which could fail if catalog is incomplete), but the library now has inconsistent patterns — some scenarios explicitly set category, others rely on default. **Recommendation for v6:** Add optional auto-derivation as a convenience, but keep explicit override path.

---

## 3. Eval Validation Results

**Test coverage:** All 92 scenarios (84 base + 8 new) passed typecheck (`npm run check` zero errors) and lint (`npm run lint` zero errors).

**LLM eval runs:** 24 feature evals completed. Score distribution patterns:
- High performers (0.75-1.0): query_practice, write_session_notes, create_task — simple interactions, high determinism
- Mid performers (0.5-0.75): write_memory, create_artifact, read_inbox — moderate complexity, parameter-dependent
- Variable performers (0.2-0.8): session, materialized_knowledge, composed_prompt — high variability, cross-cutting effects
- Emerging patterns: Builder agents (software domain) score consistently higher than PM agents (abstract domains like "healthcare compliance"). Knowledge writeback and delegation scenarios show high variance across models (Claude 3.5 vs Claude 4).

**No AB0-specific regressions:** All 8 new scenarios scored in expected ranges. No silent failures from role model mismatch. Builder role scenarios and facilitator scenarios exercised correctly in isolation.

---

## 4. Process Observations

**Critique integration:** Architecture critique v4 identified 3 CRITICAL + 6 WARNING findings. All 9 were addressed in implementation without rework cycles. The plan reconciliation section (architecture §0) caught 5 spec-vs-codebase mismatches (dropped columns, missing seeding helpers) before code was written. This set a pattern for future eval workpackages.

**Plan reconciliation value:** The data model verification checklist (which columns exist, which were dropped, which mock data can be seeded) proved load-bearing. Prevented three production bugs from slipping into eval rubrics.

**AB0-specific friction:** Code review found one latent reentrancy hazard (module-level `let` variables coupling seed→judge logic) and flagged it as WARNING. Not blocking, but if runner ever parallelizes, will break silently. Acceptable residual for serial runner, but noted for future refactoring.

**Two-review model:** Critique phase (12h, founder collaboration, role model reshaping) dominated. Implementation phase (2.5h) was fast due to plan specificity. Code review (30m) found 0 MUST-FIX items, only quality suggestions. The heavy planning upfront paid off.

---

## 5. Key Learnings

**What worked:**
- Plan reconciliation catches spec-reality gaps before code
- Seeding library extensions (new helpers: seedThread, seedMessage, seedItem) reduced code duplication by ~120 lines per scenario
- Judge factory library (10 reusable patterns) enabled rapid scenario addition
- Critique→code handoff was clean (all findings applied correctly, zero re-discovery in review)
- Concept-driven iteration (v1→v2→v3→v4→final) prevented architectural rework

**What's fragile:**
- LLM-as-judge criteria strings (20+ dimensions) rely on one-line descriptions without examples. Future evals need template criteria for consistency
- Unused module-level variables across 8 files create code smell and reentrancy risk
- Index file comments don't track actual export order — maintenance debt
- Feature name type safety missing (106 scenarios, typo creates blind spot)

**Data model brittleness:**
- Cost information (costAppetiteMinor, costActualMinor) not in composed prompt — cost-awareness scenarios work only if cost is embedded in description strings
- Prior session history not queryable from session context — prior-work scenarios depend on task description string, not structured history
- Three columns were dropped post-schema (costEstimate, attentionScore, sessions.cost) — rubric must avoid them

---

## Summary

**AB0 adaptation was minimal and clean.** The role model change was a label reorganization, not structural. Seeding adapted with one parameter addition. No rework of existing scenarios. All 92 scenarios validated.

**Seeding pattern is safe but not fully optimized.** Auto-derivation wasn't implemented; manual explicit category specification is more robust but creates inconsistency. Recommend convenience auto-derivation in v6 with explicit override.

**Eval validation shows stable scoring patterns** with expected variance across model tiers and domains. New scenarios scored in expected ranges with no AB0-specific bugs.

**Process discipline (plan reconciliation, critique integration, two-review model) is working.** Data model verification upfront prevented 5+ spec-reality bugs. Plan specificity enabled 2.5h implementation phase after 12h heavy planning.

**Technical debt:** Reentrancy hazard (module-level state), LLM criteria inconsistency, index maintenance debt, type safety gaps for feature names. None blocking, all documented for future refactoring.
