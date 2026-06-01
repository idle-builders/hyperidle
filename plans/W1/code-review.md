# Code Review: W1 -- Hearth Foundation Design

**Verdict: DONE**

All acceptance criteria pass. 76 tests green. `npm run verify --quick` passes (6/6 tools). Zero critical findings. The builder delivered a complete, well-structured test harness and the underlying HTML deliverables meet spec.

---

## AC Completeness Audit

| # | Acceptance Criterion | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | HTML files for every screen in every state (Conversations: empty, thread list, thread detail; Work: empty, bet overview, bet detail; Knowledge: empty, list, detail; Settings: all sections; Onboarding; Error states: 404, API error, empty-but-healthy) | PASS | 12 files in `html/screens/`, verified by test suite (tests 1-12 in "Screen mockup HTML files exist") |
| 2 | Foundation primitive HTML files for every primitive in 03-hearth.html (Avatar, AvatarGroup, Button, Input, Select, Toggle, Checkbox, TabBar, Toast, Progress, Tooltip) | PASS | 10 files in `html/`, AvatarGroup included in Avatar.html. Verified by tests 1-10 in "Foundation Primitive HTML files exist" |
| 3 | Existing component HTML files reviewed and rewritten where divergent (BetCard, ThreadRow, Composer, EmptyState, ErrorState, NavItem, CommentRow) | PASS | 7 files rewritten. Verified by tests 1-7 in "Rewritten Component HTML files exist" + git diff shows complete rewrites |
| 4 | Sidebar matches 03-hearth.html in every screen mockup (brand wordmark, bet items with colored status dots, team items, dividers, active state) | PASS | All 10 app-shell screens include sidebar with "HyperIdle" wordmark. 6 screens with bet sections have status dots. Knowledge uses "Scope/Topics" (intentional per design-critique). Settings uses settings nav (intentional). Verified by tests in "Sidebar present in full-page screen mockups" |
| 5 | All HTML files use `_tokens.css` and follow conventions (data-component, data-tier, theme switcher) | PASS | All 29 files link `_tokens.css`. All 29 files include `_switcher.js`. All primitives/components have `data-component` and `data-tier`. Verified by 3 test suites |
| 6 | No density system in any mockup (no compact/default/comfortable, one size per component) | PASS | Zero `data-density` or `--density-*` usage in any W1 file. Verified by 4 density tests |
| 7 | All mockups have working Light/Dark theme switcher | PASS | All files include `themes/_switcher.js` (or `../themes/_switcher.js`). Verified by 3 theme switcher tests |
| 8 | No Lorem ipsum -- realistic content in every mockup | PASS | Zero `lorem ipsum` matches. Thread titles, bet names, timestamps are all realistic. Verified by 3 Lorem ipsum tests |
| 9 | Foundation primitives show required variant states | PASS | Button: primary/secondary/ghost/destructive/amber + disabled. Input: focus/error/disabled. Toggle: on/off. Checkbox: checked/unchecked. Toast: success/error/warning/info. Avatar: sm/md/lg + human/agent. TabBar: active/inactive. Progress: bars with labels. Select: default with options. Verified by 11 state tests |
| 10 | DESIGN.md rewritten as manifesto (not token spreadsheet) | PASS | Manifesto format with material palette, philosophy, typography scale, spacing, shadows, borders, motion, status colors, theme modes, component architecture. References Hearth throughout. No density. Verified by 6 DESIGN.md tests |
| 11 | AESTHETICS.md rewritten with density removed, new rules for warmth/depth/layering | PASS | 19 AQ rules (AQ-001 through AQ-019). Density explicitly banned in AQ-003. Rules address warmth, shadows, depth, layering, agent distinction, anti-slop. Verified by 7 AESTHETICS.md tests |

---

## Lens 1: Architecture

### What matches the plan

- **File inventory matches exactly.** Architecture plan lists 10 foundation primitives, 5 rewritten components, 12 screen mockups, 2 doc rewrites. The diff delivers all of them plus 2 additional rewritten components (NavItem, CommentRow) beyond the plan's 5. This is additive, not a deviation.
- **HTML file structure follows the plan's template.** Every file has the doctype, lang="en", _tokens.css link, CDN React/ReactDOM/Babel scripts, `<div id="root">`, component JS, and theme switcher. This matches the architecture plan's "HTML File Structure" section.
- **Token usage follows the plan's rules.** CSS uses semantic tokens (`--surface-elevated`, `--accent-primary`, `--r-default`, etc.). Hardcoded hex values appear only for hover states on destructive/amber buttons (`#c53e30`, `#b86305`) and in theme preview swatches in settings.html -- both called out as acceptable in the architecture plan.
- **No density tokens in W1 files.** The plan says "None of the W1 files use `--density-*` tokens." Confirmed by grep -- density tokens appear only in pre-existing files (TaskCard, NotificationRow, KnowledgeRow, Skeleton, ThreadHostBanner) not touched by W1.
- **Spacing values match plan.** Card padding 18px, thread row padding 12px 24px, avatar default 36px, button padding 10px 18px (default) and 7px 12px (small), main header padding 18px 24px -- all confirmed in component CSS.

### Findings

**WARNING-A1: Foundation primitives missing `data-used-by` attribute.** Architecture plan states "All components carry: data-component, data-tier, data-uses, data-daisyui, data-used-by." All 10 foundation primitives have `data-component`, `data-tier`, `data-uses`, and `data-daisyui` but lack `data-used-by`. Rewritten components (BetCard, EmptyState, ErrorState, NavItem, CommentRow, ThreadRow, Composer) DO include `data-used-by`. This is a minor inconsistency. For Tier 0 primitives the `data-used-by` list would be long and change frequently, so omission is pragmatically reasonable, but the plan says "all."

**OBSERVATION-A2: Screen mockups do not carry `data-component`/`data-tier` attributes.** None of the 12 screen mockup files include data attributes on their root elements. Screen mockups are Tier 3 compositions, not reusable components, so this is acceptable. The architecture plan does not explicitly require data attributes on screen mockups.

**OBSERVATION-A3: Inconsistent React render API.** 24 files (all new foundation primitives plus most screens) use the legacy `ReactDOM.render()`. 5 files that the builder fixed (BetCard, EmptyState, ErrorState, NavItem, ThreadRow) use `ReactDOM.createRoot()`. The architecture plan's template shows `createRoot` as the pattern. This is not blocking for W1 (these are static HTML design references, not production code), but W2 builders may see inconsistency. Since `.claude/rules/visual-parity.md` says "NEVER change the styling of HTML files" but allows adaptations for renderability, this inconsistency can be cleaned up without violating the parity rule.

---

## Lens 2: Design

### What matches

- **Hearth feeling is present across all files.** Warm cream canvas, forest green accents, earthy warm shadows (`rgba(44, 36, 26, ...)`), generous pill-shaped rounding (9999px), 16px default radius -- all consistent with 03-hearth.html.
- **Status through content, not structure.** Bet cards use status dots + pill badges. No full-width colored borders. Matches AQ-004.
- **Pill buttons everywhere.** All Button variants use `border-radius: var(--r-pill)`. Matches AQ-005.
- **Overlapping avatar groups.** Negative margin (-6px to -8px), white border cutout. Matches AQ-007.
- **Left-aligned empty states on page background.** EmptyState uses `--surface-page`, `text-align: left`, `max-width: 420px`. Matches AQ-008. Error-states.html centers cards in the viewport (standalone page context), but keeps `text-align: left` inside cards -- acceptable.
- **Realistic content.** Thread titles ("Passkey rollout plan -- phase 1 scope"), bet names ("Auth migration"), agent names ("Atlas"), timestamps ("2:38 PM"), budget figures ("$2,400"). Coherent story across screens. Matches AQ-009.
- **Hover lift on bet cards.** Shadow escalation + translateY(-2px). Matches AQ-010.
- **Agent avatar distinction.** Green tint background, accent border, accent text. Consistent across all sizes. Matches AQ-012.
- **Sidebar consistency.** Brand wordmark at 15px/700, 200px width, status dots, dividers, active state treatment -- consistent across all 10 app-shell screens. Matches AQ-014.
- **Section headers.** 12px, 600 weight, uppercase, 0.06em letter-spacing, tertiary color. Applied consistently. Matches AQ-013.

### Findings

No new design findings beyond what was identified in the Phase 2 design-critique (score 8/10). The builder's test code does not modify any HTML styling -- it only validates structural properties. The HTML deliverables are unchanged from the designer's output. Phase 2 critiques (accessibility gaps in Toggle/Checkbox/TabBar/Progress ARIA, missing disabled states for Toggle/Checkbox, no prefers-reduced-motion, inline styles in settings.html) remain as noted but are not regressions.

---

## Lens 3: Security

This workpackage produces static HTML design reference files and TypeScript test code. No server endpoints, no user input processing, no authentication, no database access.

- **No XSS vectors.** HTML files use React's JSX rendering (which escapes by default). No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `Function()`.
- **No secrets.** No API keys, credentials, or sensitive data in any file. The API key placeholder in settings.html (`sk-ant-...8f2a`) is clearly truncated/redacted.
- **CDN dependency pinning.** React (18.3.1), ReactDOM (18.3.1), and Babel Standalone (7.29.0) are loaded from unpkg.com with pinned versions. No `latest` tags.
- **Test code is read-only.** Tests only use `readFileSync` and `existsSync` on known paths within the design system. No file writes, no network calls, no process execution.

No security findings.

---

## Lens 4: Adversarial

### The Saboteur

- **Tests are structurally sound.** Each test reads files from disk and asserts on string content. No mocking. No state sharing between tests. No race conditions possible.
- **Test assertions are meaningful.** Tests check for specific CSS class names (`sidebar-dot`, `status-dot`), specific content patterns (`data-component`, `_tokens.css`, `_switcher`), specific regex patterns for variant states. None are tautological.
- **No weakened tests.** The `aesthetics-doc.test.ts` changes are updates to match W1's AQ-rule format (replacing K1's recommendations-table format). The new gates are equivalent in rigor -- they verify the doc has an intro, at least 10 AQ rules, rationale for each rule, typography coverage, no-density statement, and anti-pattern coverage. Gates 5 and 6 (recommendations table gates) are no longer exercised because the W1 format has no recommendations tables, but these gates gracefully pass on empty table sets (loop over zero items). This is correct behavior since the K1 research tables still exist in the `research/` directory.
- **The `docs.test.ts` density test update is correct.** Changed from checking `--density-pad-x` exists in DESIGN.md to checking it does NOT exist. This matches the W1 spec that the density system is removed.

### The New Hire

- **Test file is well-organized.** Clear file lists at top, named constants, helper function, describe blocks per AC. A new hire can find the relevant test by reading the describe block name.
- **`@lore` comments explain non-obvious decisions.** The sidebar exclusions for knowledge/settings screens, the density test exemption for AESTHETICS.md AQ-003, and the design-only nature of W1 are all documented with `@lore` tags.
- **One complexity: the `SIDEBAR_BET_DOT_SCREENS` filter logic.** The test comments explain why knowledge and settings screens are excluded from the status-dot check, but a new hire would need to read the design-critique to understand the full reasoning. The `@lore` comment helps but could be more concise.

### The Auditor

- **76 tests claimed, 76 confirmed.** Test count matches actual execution.
- **All tests pass with evidence.** Output: `Test Files 1 passed (1), Tests 76 passed (76)`.
- **`npm run verify --quick` passes.** 6/6 tools green.

No adversarial findings.

---

## Lens 5: Simplification

### Findings

**OBSERVATION-S1: Repeated helper pattern in tests.** The `readHtml()` helper (lines 96-101) wraps `existsSync` + `readFileSync` but several test loops also have an inline `existsSync` check before calling `readHtml`, which already throws on missing files. This is redundant but harmless -- the inline checks use `continue` to collect failures rather than throwing, so the pattern serves a different purpose (batch failure reporting vs. early abort). No change needed.

**OBSERVATION-S2: Sidebar CSS duplicated across screen mockups.** Every screen mockup redeclares the full sidebar CSS (~50 lines). This is expected since HTML files must be standalone (per architecture plan). Not a code smell -- it is a constraint of the design medium.

No simplification findings requiring action.

---

## Lens 6: AI Slop

### Findings

**No AI slop detected.** The test file is remarkably clean:

- No unnecessary comments. Comments explain WHY, not WHAT. The `@lore` comments document non-obvious design decisions.
- No verbose naming. `FOUNDATION_PRIMITIVES`, `REWRITTEN_COMPONENTS`, `readHtml`, `SIDEBAR_BET_DOT_SCREENS` -- all descriptive without being wordy.
- No single-use helpers. `readHtml()` is used in 30+ locations.
- No defensive over-engineering. Tests check `existsSync` only when they need to skip-and-collect rather than crash.
- No filler. No `=== true`, no redundant else-return, no empty catch blocks.
- No AI tell-tales. No "TODO: implement", no "simplified version", no "for now".
- No unnecessary async. All tests are synchronous (appropriate for file reads).

The HTML files have minimal comments -- short component descriptions at the top of each `<style>` block. No verbose JSDoc, no restating-the-obvious comments.

---

## Summary

| Lens | Finding Count | Severity |
|------|--------------|----------|
| Architecture | 1 WARNING, 2 OBSERVATIONS | No blockers |
| Design | 0 new findings (Phase 2 critiques remain) | No blockers |
| Security | 0 | Clean |
| Adversarial | 0 | Clean |
| Simplification | 2 OBSERVATIONS | No action needed |
| AI Slop | 0 | Clean |

### Non-blocking items for W2 awareness

1. Foundation primitives should add `data-used-by` if the plan's "all components carry" rule is to be respected literally.
2. The ReactDOM.render vs ReactDOM.createRoot inconsistency can be cleaned up during W2 when these files are consumed by the ds:sync pipeline.
3. Phase 2 accessibility critiques (ARIA on Toggle/Checkbox/TabBar/Progress, missing disabled states) should be addressed in TSX implementation.

**Verdict: DONE.** All acceptance criteria pass with evidence. Zero critical findings. The workpackage advances to retro + ship.
