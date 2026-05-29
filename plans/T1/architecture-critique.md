# T1 Architecture Critique -- BodyEditor Component (TipTap WYSIWYG)

**Reviewer:** Architecture Critique (Phase 2)  
**Plan reviewed:** `plans/T1/architecture.md`  
**Spec:** `plans/work-packages/TRACK-T.md` lines 13-55  
**Concept:** `plans/human-authoring/editing-experience-concept.md` (locked)

---

## Score Table

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Spec Fidelity | 9 | All 9 ACs mapped. Every criterion has a concrete implementation path. |
| 2 | Concept Alignment | 9 | Respects locked concept: TipTap, GFM round-trip, two variants, slash menu, floating toolbar, headless + Lucid tokens. |
| 3 | Type Safety | 8 | Props interface is complete. SlashMenuItem type defined. No `any` or `as` casts in pseudocode. |
| 4 | Data Flow | 8 | `initialContent` consumed once at mount, `onChange` fires on every mutation, parent owns debounce. Round-trip contract is clear. |
| 5 | Component Boundaries | 8 | Clean separation: orchestrator, hook, extensions, slash menu, floating toolbar. Internal modules not exported. |
| 6 | Extension Model | 6 | Missing `@tiptap/suggestion` and `tippy.js` from dependency table. Factual error claiming StarterKit includes suggestion. |
| 7 | Token Compliance | 8 | All CSS uses semantic tokens. No hex values. Spacing uses em-based multiples. Token names verified against tokens.css. |
| 8 | Test Strategy | 7 | Unit tests cover round-trip for all BlockKinds. No E2E tests (justified as deferred to T2). Slash menu tests are integration-level. |
| 9 | Implementation Ordering | 8 | Red-green-verify phasing correct. Task dependencies are implicit but logical. |

**Average: 7.9 / 10**

---

## Findings

### Strengths

**S1 -- Complete AC coverage.** Every one of the 9 acceptance criteria from TRACK-T.md has a corresponding section in the plan. The mapping is traceable: AC "slash menu inserts all 8 insertable BlockKind types" maps to Section 4 with an explicit items table; AC "floating toolbar appears on text selection" maps to Section 5; AC "variant prop" maps to Section 7. No AC is hand-waved.

**S2 -- Sound variant architecture.** The extension-level gating (two builder functions rather than runtime conditionals in render) is the correct approach. It means a mini editor never loads heading/list/table code. The variant feature matrix (Section 7) is explicit about what each variant supports.

**S3 -- Scoped CSS over Tailwind prose.** Using a scoped `.body-editor` CSS file with semantic tokens is the right call for ProseMirror content. TipTap renders semantic HTML elements -- scoped CSS targeting those elements is cleaner and more maintainable than Tailwind utility classes on elements the component does not control. Every token in the CSS (`--text-hi`, `--surface-1`, `--border-subtle`, `--r1`, `--mono`, `--density-text`, `--density-text-h1`, etc.) was verified to exist in `packages/design-system/src/tokens.css`.

**S4 -- Honest self-critique.** Section 14 identifies real weaknesses (`window.prompt` UX, ReactRenderer complexity, no E2E). The over-engineering check is warranted -- four internal files is the right granularity for the distinct concerns.

**S5 -- Correct concept alignment.** The plan respects every locked decision: TipTap as the editor, `tiptap-markdown` for GFM serialization, design-system-level component with TipTap as peer dependency, two variants (full/mini), slash menu with exactly the 8 insertable BlockKind types, no drag-to-reorder in v1, URL-only images in v1.

### Issues

**I1 -- MUST FIX: Missing `@tiptap/suggestion` dependency.** Section 4 (line 185) states "`@tiptap/suggestion` extension (included via StarterKit)." This is factually incorrect. `@tiptap/suggestion` is a standalone package (`npm install @tiptap/suggestion`). StarterKit does not include it. The package does not appear in the dependency table (Section 2), in the `peerDependencies` block, or in the `packages/web/package.json` dependencies block. The builder will hit a missing module error when implementing the slash menu.

**Required change:** Add `@tiptap/suggestion` (version `^2.12.0`) to the dependency table and both `peerDependencies` / `dependencies` blocks. Remove the "(included via StarterKit)" parenthetical. The builder should handle this -- it does not require a plan revision.

**I2 -- MUST FIX: Missing `tippy.js` dependency.** Section 4 (line 281) references `tippy.js` for slash menu dropdown positioning: "rendered via TipTap's ReactRenderer + tippy.js (comes with @tiptap/suggestion)." While `@tiptap/suggestion` does depend on `tippy.js` transitively, the plan should list it explicitly since it is used directly for positioning configuration (the `tippyOptions` in BubbleMenu configuration, Section 5 line 350). If the builder needs to configure tippy options, they need `tippy.js` types available.

**Required change:** The builder should add `tippy.js` (or verify it resolves transitively). This is a builder-level fix, not a plan-blocking issue.

**I3 -- Minor: `dsProps` naming inconsistency.** Section 9 (line 45) says the component uses `dsProps("BodyEditor", "2")` producing PascalCase. However, the existing `Block` component (Block.tsx line 74, the `@lore` comment) explicitly sets `data-ds-component="block"` in lowercase, bypassing `dsProps`, because the contract requires lowercase. The plan should clarify whether BodyEditor follows the `dsProps` PascalCase convention (which is the default for non-Block components) or uses lowercase. Looking at other components, `dsProps` with PascalCase is the standard for everything except Block (which has a specific lore reason for lowercase). The plan's approach is correct -- but the builder should be aware of the Block exception to avoid copying the wrong pattern.

**I4 -- Minor: h3 uses `calc()` instead of a token.** In Section 9 (line 540), `h3` uses `font-size: calc(var(--density-text) * 1.1)`. This is a computed value, not a token. `tokens.css` defines `--density-text-h1` and `--density-text-h2` but has no `--density-text-h3`. The `calc()` approach is pragmatic but introduces a value outside the closed type scale (AQ-004). The builder should either: (a) add a `--density-text-h3` token, or (b) use `var(--density-text)` with a weight/style change to differentiate h3 without an off-scale size.

**I5 -- Minor: Hardcoded pixel values in BubbleMenu.** Section 5 (lines 326-333) specifies `gap-[4px]`, `px-[4px]`, `py-[2px]`, `28x28px` button sizes. These are 4px-grid-compliant (AQ-001: 4px multiples, 2px reserved for chip/icon internals -- and toolbar buttons are icon-sized internals). However, per AQ-002, component internals should prefer `var(--density-pad-*)` and `var(--density-gap)` density tokens. The toolbar is a small surface so fixed values may be acceptable, but the builder should evaluate whether density tokens are more appropriate here to maintain density-responsiveness.

**I6 -- Minor: No `aria-label` or accessibility attributes specified.** The floating toolbar buttons (Section 5) are described as text labels (**B**, *I*, `<>`, ~~S~~, Link) but the plan does not specify `aria-label` attributes for these buttons. Similarly, the slash menu dropdown (Section 4) does not specify `role="listbox"`, `role="option"`, or `aria-activedescendant` for keyboard navigation. The builder should add appropriate ARIA attributes.

**I7 -- Minor: `window.prompt` for image URL is a known compromise.** The plan acknowledges this (Section 12) and the concept doc marks image upload as out of scope. Acceptable for v1. No action required.

**I8 -- Observation: No HTML component file.** The design-system rules (`visual-parity.md`) state HTML files are the design source of truth. The plan explicitly justifies skipping the `.html` file (Section 13) because the editor requires JS lifecycle. This is the correct call -- an interactive TipTap editor cannot be represented as a static HTML snapshot. The visual regression testing will rely on Storybook screenshots instead.

**I9 -- Observation: Test file location.** The plan places tests at `packages/design-system/src/__tests__/BodyEditor.test.tsx`, which matches the existing test directory pattern (confirmed: `__tests__/Block.test.tsx`, `__tests__/ArtifactCostChip.test.tsx`, etc.).

---

## Verdict: PASS (7.9 / 10)

The plan is sound enough for a builder to implement correctly. The average score exceeds the 7.0 threshold.

**I1 (missing `@tiptap/suggestion`) is the only significant issue.** It is a factual error in the dependency list, but it is straightforward for the builder to resolve: install the missing package alongside the others. It does not require a plan revision because the slash menu implementation in Section 4 correctly describes how to use the suggestion API -- it just forgot to list it as a dependency.

**Builder directives (carry forward to Phase 3/4 review):**
1. Install `@tiptap/suggestion` as peer + dev dependency in design-system and as dependency in web.
2. Verify `tippy.js` resolves (it should come transitively via `@tiptap/suggestion`).
3. Consider adding a `--density-text-h3` token or use the base `--density-text` for h3 to avoid `calc()` off-scale (I4).
4. Add ARIA attributes to slash menu dropdown and floating toolbar buttons (I6).
5. Evaluate density tokens vs. fixed px values for BubbleMenu internals (I5).
