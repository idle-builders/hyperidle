# U4 Architecture Critique

**Workpackage:** U4 -- DaisyUI Theme + Tailwind Config Update
**Plan reviewed:** `plans/U4/architecture.md`
**Spec reference:** `plans/work-packages/TRACK-U.md` lines 131-161
**Reviewer:** Phase 2 Reviewer (architecture-critique)

---

## Dimension Scores

### 1. Completeness -- 9/10

The plan covers every AC from the spec:

- AC: DaisyUI themes renamed from Lucid to Hearth -- covered by Tasks 1-2, AC-1.
- AC: DaisyUI theme variables mapped to Hearth values -- covered by AC-2 with exact hex values.
- AC: Tailwind extend.colors updated -- covered by AC-3.
- AC: Tailwind extend.borderColor updated -- covered by AC-4.
- AC: Font family updated -- covered by AC-5.
- AC: index.css font import removed -- covered by AC-6.
- AC: useTheme hook updated -- covered by AC-7.
- AC: npm run check passes -- covered by AC-8.

The plan also identifies work beyond the spec ACs: design-system viewer updates (Task 5), HTML theme file rewrites (Task 6), test updates (Tasks 7-8), documentation updates (Task 9), and rules file updates (Task 9). These are necessary for the codebase to remain consistent.

One minor gap: the plan does not mention `packages/web/src/index.css` line 59 (`color: var(--text-mid)`) which references a Lucid token no longer defined in `tokens.css`. However, this is a pre-existing breakage from U3 (tokens.css no longer defines `--text-mid`) and falls under the "component cleanup in U7-U9" scope exclusion. Similarly, `viewer/main.tsx` line 305 references `var(--surface-0)` in an inline style. Both are pre-existing, not U4 regressions. Noting for completeness but not a plan deficiency.

Deduction: -1 for not explicitly calling out the `index.css` `var(--text-mid)` reference as a known pre-existing issue in the Risks section. A builder encountering this during implementation could waste time investigating whether it's in-scope.

### 2. Correctness -- 10/10

Every hex value in the DaisyUI theme mapping (AC-2) was cross-referenced against `packages/design-system/src/tokens.css` (the U3 output). All mappings are correct:

- `primary` maps to `--accent-primary`: light #16764f, dark #2eaa7a -- matches tokens.css lines 126, 180.
- `base-100` maps to `--surface-page`: light #f5f0e6, dark #1a1510 -- matches tokens.css lines 107, 153.
- `error` maps to `--status-error`: light #dc4a3a, dark #ee6a5a -- matches tokens.css lines 134, 193.
- `base-300` maps to `--border-subtle`: light #e8e0d0, dark #3d342a -- matches tokens.css lines 138, 201.
- Radii: `--rounded-box: 16px` matches `--r-default` (tokens.css line 43), `--rounded-btn/badge: 9999px` matches `--r-pill` (tokens.css line 44).
- Font families match tokens.css lines 58-59 exactly.

The `extend.colors` rename from `surface-0..6` to `surface-page/container/elevated/overlay` matches the Hearth token vocabulary. The `extend.borderColor` rename from `border-emphasis` to `border-strong` matches tokens.css line 140/203.

The "Design-it-Twice" section (DaisyUI `secondary` mapping) documents a genuine decision point and the rationale is sound -- accent-secondary (#d97706) provides visual distinction for secondary buttons, whereas text-secondary would be near-invisible.

### 3. Ordering -- 10/10

Tasks 1-6 are all marked as parallel (no dependencies between them), which is correct -- they touch different files. Task 7 (unit tests) depends on Tasks 1-6, Task 8 (E2E tests) depends on Tasks 3-4, and Task 10 (verify) depends on all. This is a valid dependency DAG.

The plan correctly identifies that documentation (Task 9) can run in parallel with everything, since docs don't block code compilation.

### 4. Risk -- 9/10

Four risks are identified and well-analyzed:

- R1 (component visual breakage): correctly scoped as accepted -- ~30 component files become no-ops.
- R2 (base-300 as border-subtle): sound judgment with clear rationale.
- R3 (boot script default change to light-first): correctly analyzed, with the edge case about localStorage migration.
- R4 (viewer localStorage key collision): correctly handled by fall-through to default.

Deduction: -1 for not identifying the risk that `docs.test.ts` checks for specific string content in `DESIGN.md` and `THEMES.md` (e.g., "Lucid", "--surface-0", "Geist"). If the documentation rewrite (Task 9) is incomplete or uses slightly different phrasing, these tests will fail. The plan lists the assertion changes (lines 304-309) but does not flag the bidirectional coupling between doc content and test assertions as a risk.

### 5. Testability -- 9/10

Every AC has a verification method:
- AC-1 through AC-7: unit test assertions specified with exact expected values.
- AC-8: `npm run check` pass.
- E2E verification for AC-2 (computed styles) and AC-7 (Settings panel persistence).

The test change specifications are detailed down to line numbers in existing test files. The protected tests section (tokens.test.ts is fully protected, theme/useTheme tests change values but not structure) is well-specified.

Deduction: -1 for the design-system viewer (Task 5) having no automated test. "Manual verification via design system viewer" is listed, which contradicts the project's testing philosophy. While this is a developer tool and not user-facing, a basic smoke test (e.g., asserting the viewer Tailwind config contains `hearth-dark`) would be cheap and valuable.

### 6. Scope Discipline -- 10/10

The plan stays strictly within U4 boundaries. It explicitly marks component file updates as out-of-scope ("NOT fixed in U4 -- spec says 'fixed in component workpackages'"). It does not touch `tokens.css` (U3 territory). It does not change app shell layout (U6 scope). It does not add new types or schemas beyond the viewer's `Theme` type literal change.

The migration manifest (lines 429-455) clearly separates "config-level" renames (in scope) from "component-level" renames (out of scope).

### 7. Contract Fidelity -- 10/10

**Upstream (U3):** The plan consumes U3's `tokens.css` output faithfully. Every hex value traces back to a named Hearth token. The plan does not modify `tokens.css` or `tokens.test.ts`.

**Downstream (U7-U9):** The plan establishes the contract that U7-U9 will consume: Tailwind config keys are `surface-page/container/elevated/overlay`, `text-primary/secondary/tertiary`, `border-strong` (replacing `border-emphasis`), `font-mono` (replacing `font-heading`). The migration manifest (lines 429-455) provides the complete rename table for downstream consumers.

**DaisyUI contract:** DaisyUI theme variables are mapped to hardcoded hex values (not CSS variable references), which is correct -- DaisyUI themes are static objects processed at build time by the plugin.

### 8. Pragmatism -- 9/10

The plan is proportional to the task. It's a configuration rename with cascading test/doc updates -- no new abstractions, no new patterns, no over-engineering. The "Design-it-Twice" section appropriately limits itself to one genuine decision point (DaisyUI `secondary` mapping) rather than inventing complexity.

Deduction: -1 for the HTML theme file rewrite (Task 6). The plan specifies that both `hearth-light.css` and `hearth-dark.css` must define all tokens that `themes.test.ts` checks (line 269 lists ~35 tokens). But the new HTML theme files will need to define Hearth token names, while the old files defined Lucid token names. The plan lists the required token names but does not provide the actual CSS values for the HTML theme files. The builder will need to derive these from `tokens.css`, which is straightforward but should have been specified to avoid ambiguity. This is a minor pragmatism issue -- the builder can read `tokens.css` -- but the plan is less complete here than elsewhere.

### 9. Clarity -- 9/10

The plan is highly actionable. Code blocks show before/after values. Line numbers reference specific locations in current source. The reconciliation table (lines 17-36) maps every spec assumption to verified reality. The symbol rename manifest provides a complete lookup table.

Deduction: -1 for Task 6's HTML theme file contents. The plan says "CSS file with `[data-theme="hearth-light"]` selector containing all Hearth light-mode token values" but does not list the actual CSS property-value pairs. Every other task has exact values specified. This inconsistency could slow the builder.

---

## Overall Score: 9.4/10

**Verdict: PASS**

This is a thorough, well-grounded architecture plan. The reconciliation table demonstrates that the designer read every file before planning. Value mappings are correct against the U3 token source. Task ordering is valid. Scope boundaries are clear. The migration manifest gives downstream workpackages a complete rename reference.

## Notes for Phase 4

1. Verify that `index.css` line 59 (`color: var(--text-mid)`) is left as-is (pre-existing U3 breakage, U7-U9 scope).
2. Verify that `viewer/main.tsx` line 305 (`var(--surface-0)`) is left as-is (viewer cleanup scope).
3. Verify that HTML theme files (`hearth-dark.css`, `hearth-light.css`) define all tokens listed in the updated `REQUIRED_TOKENS` array in `themes.test.ts`.
4. Verify that `docs.test.ts` assertions and documentation content are mutually consistent after the rewrite.
5. Watch for the `_switcher.js` inline styles referencing `var(--surface-3)` and `var(--text-mid)` (line 44, 56) -- these should be updated to Hearth token names per the plan (line 273-274).
6. Check that the aesthetic-quality rules file (`AQ-011`) references the updated radius scale (`--r-none/subtle/default/pill` not `--r0/r1/r2/r3`) -- this may be a cross-cutting concern beyond U4.
