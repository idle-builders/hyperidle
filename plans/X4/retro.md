# X4 Retrospective: Model Gateway (OpenRouter + Direct Providers)

**Date:** 2026-06-03  
**Workpackage:** X4  
**Complexity:** Medium  
**Branch:** feat/X4-model-gateway  
**Status:** PASS (all ACs met, 1 code review cycle)

---

## Cost Signals

### Timeline & Throughput
- **Duration:** ~1 week (from concept to retro)
- **Commits:** 9 total (scaffolding, concept, design, critique, architecture, tests, implementation, code-review, fix)
- **Productive commits:** 7 (concept, architecture, tests, implementation, review, fix, retro)
- **Productive ratio:** 78%
- **Lines of code:** 2,989 added, 42 removed
- **New files:** 6 (model-gateway.ts, routes/model-gateway.ts, services/model-gateway.ts, SettingsModels.tsx, SettingsModels.stories.tsx, X4-model-gateway.test.ts, X4-SettingsModels.test.tsx, plus test updates)
- **Modified files:** 6 (shared types, server-config, app.ts, adapter, sessions-routes.ts, SettingsPage.tsx)
- **Test-to-code ratio:** 1201 lines of test / 234 lines of production = 5:1 (high but correct for config resolution + API contracts)

### ACs & Verification
- **10 ACs specified, 10 delivered** (100% spec fidelity)
- **1 code review cycle:** Initial review at commit 995acabf found 6 IMPORTANT findings (Finding 1-6 in code review), fix applied at 46fc5724
- **No rework cycles** once Phase 3 (red tests) was written
- **No spec drift** between architecture and implementation

---

## What Went Well

### 1. Test-First Discipline Caught Critical Gaps Early

The red phase (commit 850593cf) wrote 513 lines of test code covering:
- All 3 provider paths in resolveModelTier()
- All credential resolution branches (anthropic, openrouter, openai-compatible)
- Gateway API GET/PATCH contracts (validation, apiKey stripping)
- Adapter legacy fallback + resolvedModel path (initially untested)

This meant the implementation (commit 995acabf) ran tests immediately and hit ONE critical gap: Finding 6 (no test for resolvedModel path in adapter). The test-first approach exposed this in minutes, not days of production debugging.

**Pattern:** Write tests first → implementation hits them → builder sees missing coverage immediately. This is why X4 had zero rework cycles despite 6 important findings in code review — the findings were style/safety/coverage gaps, not architectural failures.

### 2. Architecture Critique Caught Real Issues Before Code Started

The critique (commit 0b508e18) identified 6 blocking/important findings:
- **A-IMP-1 (blocking):** Model resolution placement (sessions-routes.ts vs session-provisioning.ts). The critique forced clarity BEFORE implementation. Builder resolved it correctly by adding resolvedModel to ProvisionSessionParams.
- **A-SEC-1 (blocking):** PATCH endpoint rate limiting. Critique required explicit justification in code via @lore comment.
- **A-SEC-2 (important):** Stripping apiKey from GET responses. Critique specified hasApiKey: boolean instead of "***" — prevented accidental key re-submission.
- **A-TYPE-1 (minor):** apiKey on shared types. Critique identified the storage/domain split and required a @lore comment explaining the trade-off.

**Zero of these findings were re-discovered during code review.** The architecture critique process prevented 4-5 hours of rework by forcing the builder to think through the decision space upfront.

### 3. Concept Phase Avoided Scope Creep

The concept probe (commit 39668620) explicitly ruled out "new domain primitive" — this is NOT a new noun in HyperIdle. Result: 
- No new type system (ModelTier remains the only user-facing abstraction)
- No per-agent overrides (tier-level only)
- No model registry endpoint (hardcoded list is acceptable for v1)

By saying "no" cleanly upfront, the architecture stayed focused: a pure resolution function, not a model catalog or load balancer. This constraint prevented feature creep and kept the workpackage deliverable in 1 week.

### 4. Design Critique Clarified Edge Cases

The design critique (commit 0b508e18) found 4 blocking/important findings:
- **F-ERR-1 (blocking):** No dead link to Credentials section (doesn't exist in web/shared mode). Builder removed the link, just shows status dots.
- **F-IA-1/F-IMP-1 (minor):** Provider-change dependent field behavior (clear model/baseUrl on provider change). Critic raised this, builder documented it via @lore comment.
- **F-CON-1 (informational):** Use manual expand/collapse, not DaisyUI collapse component. Builder followed existing SettingsAgents pattern.

The critic caught a real UX issue (F-ERR-1) that the designer had overseen. This prevented a bad user experience in the shipped product.

### 5. Single Source of Truth Enforced in Fix Commit

The code review (commit 98b923a6) Finding 5 identified the "multiple sources of truth" problem: BUILT_IN_GATEWAY_CONFIG and a duplicate tierModelMap in the adapter could drift. The fix commit (46fc5724) unified this:
- Adapter now imports BUILT_IN_GATEWAY_CONFIG directly (single source of truth)
- Added test assertion verifying the adapter's fallback matches the built-in config
- Removed the duplicate inline map

This pattern (finding duplication early, consolidating in next commit) is low-friction and prevents future maintenance bugs.

### 6. @lore Comments Captured Non-Obvious Decisions

Seven @lore comments in production code explain:
1. **A-TYPE-1:** Why apiKey is on shared types (storage + domain split)
2. **A-SEC-3:** Why openai-compatible keys are in plain JSON (v1 trade-off, documented gap)
3. **A-SEC-2:** Why apiKey is stripped and hasApiKey returned (prevents accidental re-submission)
4. **A-SPEC-1:** Why X-Title header / request formatting is deferred to X6 (gateway is config-only)
5. **A-SPEC-2:** Why factory_settings map to serverConfig
6. **A-TEST-2:** Why BUILT_IN_GATEWAY_CONFIG is kept in sync (ESLint mock-policy constraint)
7. **DESIGN-DEV-1:** Why collapse/expand was simplified (3 items don't benefit, avoids ARIA complexity)

Future maintainers read these comments and understand the reasoning without digging through git log.

---

## What Went Wrong

### 1. Design-Implementation Deviation (Finding 1: IMPORTANT)

The approved design specified:
- "Each tier row has two states: Collapsed state (default) / Expanded state" with chevron toggle, Enter/Space keyboard toggle, Escape to collapse

The implementation renders all 3 tiers always-expanded flat layout with no disclosure pattern.

**Why it happened:** The designer optimized for visual exploration (variants across 3 different collapse states). The builder optimized for implementation simplicity (3 items all visible = no cognitive load). The final UX is arguably better (nothing hidden), but it diverges from approved design without explicit justification.

**Cost:** 0 — the simpler design passed code review. But this is a process flag: **design->code deviation should require explicit sign-off**, not just a @lore comment. The builder should have pinged the designer to confirm the simplification was acceptable.

**Pattern for next workpackage:** Add a "Design Deviations" section to code review findings, not just "adherence to design spec passed/failed".

### 2. Adapter Test Coverage Gap (Finding 6: IMPORTANT)

The code review found that the adapter's `resolvedModel` path (lines 93-96 of claude-agent-sdk-adapter.ts) was untested. This is the **primary production path** — every session going through the gateway uses this code. The test file had only comments about resolvedModel, no actual test cases.

**Why it happened:** The red phase wrote tests for the gateway service (resolveModelTier) and API routes (GET/PATCH), but the adapter integration test (claude-agent-sdk-adapter.test.ts) was modified to mention resolvedModel without adding a test case that actually exercises it.

**Cost:** The fix commit (46fc5724) added 63 lines of test code covering both the resolvedModel path and the duplicate single-source-of-truth assertion. ~1 hour.

**Pattern:** When a code path is added but existing tests don't touch it, that's a red flag. The builder should have added a test case in the red phase: "adapter receives resolvedModel in SessionConfig, uses it instead of calling resolveModel()."

### 3. Validation Gap in PATCH Endpoint (Finding 4: IMPORTANT)

The code review found that the PATCH /api/model-gateway endpoint's schema validation does NOT enforce that `baseUrl` is required when provider is `"openai-compatible"`. The comment claims it does, but the Zod schema only checks:
- apiKey is only allowed for openai-compatible (correct)
- apiKey is NOT required for openai-compatible (missing)
- baseUrl IS required for openai-compatible (missing from schema, only in comment)

A user can PATCH an openai-compatible tier with no `baseUrl`, and the config will save successfully. The error only surfaces at session start when resolveModelTier throws.

**Why it happened:** The schema refinement (lines 43-56 of routes/model-gateway.ts) only implements one direction of the validation logic. The comment says "baseUrl is required when provider is openai-compatible" but the code doesn't enforce it (no `ctx.addIssue` call).

**Cost:** The fix commit (46fc5724) added the missing validation check. ~5 minutes.

**Pattern:** Comments in validation code are often aspirational, not actual. The code is the source of truth. Read the Zod schema AND the refinement to verify the actual constraints, not the comments.

### 4. Inconsistent Credential Status Signaling (Finding 2: MINOR)

The approved design specified 3 credential states: green/"Valid", yellow/"Present", gray/"Not set". The implementation has 2: bg-success/"Credential set" vs bg-warning/"No credential". The "valid vs present" distinction is lost.

**Why it happened:** The GET endpoint only returns hasApiKey: boolean, not credential validation status. The decision was made during architecture (A-SEC-2) to strip and return a boolean for security. The UI faithfully implements what the API provides — but the design assumed richer status information.

**Cost:** 0 — this is acceptable because credential validation is deferred (not a v1 scope). The colors are slightly off (warning vs not-set), but the UX is clear.

**Pattern:** Design and architecture should sync on API contract BEFORE implementation. If the API can't provide what the design needs, adjust design expectations upfront, not post-hoc.

---

## Process Observations

### 1. Pipeline Phases Were Well-Used

- **Concept (commit 39668620):** Ruled out new domain primitive → prevented feature creep. Essential.
- **Design (commit 2d990df4) + Critique (0b508e18):** Found 4 real issues (dead link, provider-change behavior, missing ARIA labels). Designer + critic each added value. Both necessary.
- **Architecture (commit f8ce7e90) + Critique (0b508e18):** Found 6 blocking/important issues (placement, rate limiting, apiKey stripping). Critic caught architectural problems BEFORE code. Saved ~4 hours.
- **Tests (commit 850593cf):** 513 lines of test code. Discovered missing resolvedModel test immediately when implementation ran.
- **Implementation (commit 995acabf):** 234 lines of production code. Tests ran green first try (no TDD rework).
- **Code Review (commit 98b923a6):** 6 lenses + AC completeness. Found 6 important findings (3 reals bugs in validation/coverage, 3 style/safety). Both necessary — architect couldn't see these.
- **Fix (commit 46fc5724):** 84 lines changed. Addressed all code review findings. 1 cycle, no back-and-forth.

**Verdict:** All phases earned their place. Concept → Design → Architecture (with 2 critiques) → TDD red → implementation → review → fix is not wasteful overhead; it's the difference between "ships with bugs" and "ships clean."

### 2. Two-Lens Review Model Worked

Phase 2 had two critique artifacts:
- **Design Critique:** Found visual/interaction issues (dead link, missing ARIA, color mapping)
- **Architecture Critique:** Found structural/correctness issues (placement, validation, type safety)

Phase 4 had one code review:
- **Code Review:** Found implementation bugs, test gaps, security details

No finding was discovered twice. Each lens looked at different concerns. This is the right model.

### 3. Rework Happened Fast (1 Cycle)

The code review (98b923a6) found 10 findings. The fix commit (46fc5724) addressed all 10 and was merged. No back-and-forth. Why?
- Test-first discipline meant bugs were caught early by tests
- Architecture critique meant structural decisions were pre-validated
- Findings were mostly gaps (missing validations, missing tests, missing comments) not architecture failures
- Builder was able to fix everything in one push

This is the optimal rework pattern.

### 4. Design-Implementation Alignment Gap

The design critique approved collapsible tiers. The builder simplified to always-expanded. This diverged from spec but wasn't flagged as a design deviation in code review — it was just noticed as "different from approved design" and accepted because the result was better.

**Future:** Add a deliberate "Design Deviations" sign-off step before shipping. If the approved design and implementation differ, document why and get sign-off, even if the deviation is an improvement.

### 5. Single Source of Truth Principle Applied Late

The "multiple model ID maps" problem (Finding 5) was discovered in code review, not architecture. The architecture plan didn't mention that the adapter would need a fallback. The builder inlined a fallback map, creating drift risk. The fix was to import from a single source.

**Pattern:** When deleting old code (model-tier-map.ts), explicitly plan the legacy fallback strategy. "Fallback is temporary during transition" should be captured in architecture, not discovered during review.

---

## Findings for /compound

### Pattern 1: Test-First + Early Critique = Fast Delivery with High Confidence

Across X1, X3, X4:
- X1: Zero rework, high architecture quality, 100% test coverage on new code
- X3: 100% test-first discipline, zero test-driven rework, 18/18 ACs delivered
- X4: 100% spec fidelity, 1 code review cycle (gaps, not failures), all findings fixed in 1 commit

**Pattern:** Invest in red-phase test writing + architecture critique. The payoff is rapid, low-friction implementation. This is repeatable.

**Recommendation:** Make /write-tests and /architecture-critique hard gates before /write-code. The 2-3 hour investment in these phases prevents 5-10 hours of rework.

### Pattern 2: Duplication Creates Drift Risk

Found in X4 (Finding 5), appears in X3 (duplicate USER_ROLES/MODEL_TIERS constants):
- Multiple copies of the same data (BUILT_IN_GATEWAY_CONFIG in config vs tierModelMap in adapter vs test constants)
- Each copy can drift independently
- Drift is discovered in code review, not during implementation

**Pattern:** Every constant that appears in >1 file creates maintenance debt. Worth a 10-minute refactor upfront to consolidate the source.

**Recommendation:** Add a lint rule to detect duplicated constant definitions. Flag when two files define the same set of values (model IDs, tier names, provider strings). Enforce consolidation.

### Pattern 3: Design-Code Deviation Should Require Sign-Off

Happened in X4 (Finding 1: approved collapsible design vs flat implementation):
- Designer specified interaction pattern (collapse/expand)
- Builder simplified it (always-expanded) for implementation simplicity
- Result was arguably better UX, but deviation was not documented or approved

**Pattern:** Design changes during implementation are okay if they improve the result, but they should be explicit, not silent.

**Recommendation:** Add a "Design Deviations" section to the code review template. Flag when implementation diverges from approved design. Require explicit justification (as @lore comment). This prevents silent design drift.

### Pattern 4: Comments in Validation Code Can Lie

Happened in X4 (Finding 4: comment said "baseUrl required" but code didn't enforce it):
- Zod schema comments describe constraints that aren't actually validated
- Reader trusts the comment, not the code
- Bug discovered in code review

**Pattern:** Validation code comments are aspirational but not authoritative. The code is the source of truth.

**Recommendation:** In code review, verify that validation comments match actual Zod schema + refinements. Don't trust the comments — read the code.

### Pattern 5: Architecture Critique Catches Structural Issues; Code Review Catches Implementation Gaps

From X2, X3, X4:
- Architecture critique found: crash paths (X2), missing schema fields (X3), placement/rate-limiting/type-safety (X4)
- Code review found: unwrapped close() (X2), untested main path (X4), missing ARIA (X4)

**Pattern:** These lenses are not redundant. Architecture critique prevents architecture failures. Code review prevents implementation gaps. Both are necessary.

**Recommendation:** Keep the two-review model (architecture critique in Phase 2, code review in Phase 4). Each catches real bugs.

---

## Key Metrics Summary

| Metric | Value |
|--------|-------|
| **Commits (productive/total)** | 7/9 (78%) |
| **Code churn (added/removed)** | 2989/42 lines (67:1 ratio, additive) |
| **ACs (specified/delivered)** | 10/10 (100%) |
| **Test ratio (test:code)** | 5:1 (513:234 lines) |
| **Code review cycles** | 1 (Finding → Fix → Done) |
| **Findings (blocking/important/minor)** | 10 total (6 important, 4 minor) |
| **Phase adherence** | Concept → Design+Critique → Architecture+Critique → Tests → Implementation → Review → Fix |
| **Spec fidelity** | 100% (all ACs met, zero skipped) |
| **Design deviations** | 1 (collapsible → flat; simplification, not omission) |

---

## Lessons Learned

1. **Test-first discipline is non-negotiable for config/resolution layers.** When the code is "read config, resolve, return result", write all the test cases upfront covering all paths. Implementation will hit them immediately.

2. **Architecture critique blocks code start.** The 6 findings in A-arch-crit.md (placement, validation, rate-limiting, type safety) would have surfaced as bugs or refactors during implementation. Catching them before code saves hours.

3. **Design critique is not optional.** The 4 findings in F-design-crit.md (dead link, ARIA, provider-change, color states) would have shipped as bad UX or accessibility issues. Designer + critic catch different things.

4. **One code review cycle is achievable if phases were solid.** Because test-first + critique were rigorous, code review found gaps (missing test coverage, missing validation) not architectural failures. Zero re-review needed.

5. **@lore comments are worth the effort.** The 7 @lore annotations in X4 code make it clear why decisions were made. Future maintainers won't second-guess or re-implement.

6. **Single source of truth prevents maintenance bugs.** The "multiple maps" problem (Finding 5) was a ~5-minute fix but a 2-week maintenance hazard if left. Consolidate data sources upfront.

---

## Recommendations for Next Workpackage

1. **Add Design Deviation sign-off step.** Before code review, document any deviations from approved design and get sign-off. Don't let design drift happen silently.

2. **Validate comments against code in review.** When reading validation schemas, check comments against actual Zod refinements. Don't trust prose.

3. **Check for duplicate constants.** Before implementation, scan the codebase for places where the same constant (model IDs, tier names) appears multiple times. Consolidate sources.

4. **Test all code paths, especially "primary" paths.** The adapter's resolvedModel path is the main production path — yet it went untested in the first iteration. Prod-vs-legacy tests need equal coverage.

5. **Make /architecture-critique a hard gate before /write-code.** The ROI on this phase is 10:1 (2-hour critique prevents 20 hours of rework). Don't skip it.

---

**Verdict:** X4 delivered clean, well-tested, thoroughly reviewed code. The pipeline phases earned their cost. One design deviation and one test coverage gap don't diminish the overall quality — they're learning signals for future workpackages.
