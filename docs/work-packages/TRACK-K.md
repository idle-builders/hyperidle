# Track K: Aesthetics Uplift

A coordinated upgrade of the web app's aesthetic quality and the design-system tooling that keeps it that way as the codebase grows. The web app feels cramped (sampling shows `text-xs (12px)` and `gap-1 / p-2 (8px)` dominate; components hardcode `gap-[4px] / p-[8px]` in pixels). The design system is in good shape — this track tightens the screws on visibility, persistence, principles, enforcement, and density.

**Scope rules (apply to every story in this track):**
- **No specific spacing / typography / density values appear in any acceptance criterion.** Values are produced by K1 research and consumed by downstream stories (especially K7). Where a story needs a number, the criterion reads "the value chosen in K1's recommendations table" or similar.
- **Visual parity is preserved per `/.claude/rules/visual-parity.md`** until K7, which is an intentional, coordinated refresh of HTML and TSX in lockstep. K8 re-baselines the visual-regression snapshots.
- **Mobile usability is a first-class concern**, not a follow-up. K1 research covers mobile; K7 applies it; K8 validates it across viewports.

**Reference docs:** `packages/design-system/PRINCIPLES.md`, `packages/design-system/DESIGN.md`, `packages/design-system/src/tokens.css`, `.claude/rules/design-system.md`, `.claude/rules/frontend.md`, `.claude/rules/visual-parity.md`, `.claude/skills/design-critique/SKILL.md`, `.claude/skills/slop-scan/SKILL.md` (template for a read-only scan skill).

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### K1 — Aesthetic Research & Principles Write-up

**Story.** As a designer-of-record for HyperIdle, I want a deep, multi-source research synthesis on what makes UIs feel premium and usable — covering spacing, typography (including specific guidance on bumping body/heading sizes), color, motion, finishing, mobile/touch usability, AI-aesthetic anti-patterns, and best practices from leading AI design agents — captured as a long-form markdown write-up in the design system, so that all downstream changes (token bumps, rules, lints, component sweeps) draw from one authoritative, citation-backed source.

**Depends on.** None.

**Acceptance criteria.**
- New file `packages/design-system/AESTHETICS.md` (or extension of `PRINCIPLES.md` if the additions stay under ~200 lines — author chooses). Long-form, sectioned by topic: Spacing & Density, Typography, Color & Dark Mode, Borders/Radii/Shadows, Motion, Mobile & Touch, AI-Aesthetic Anti-Patterns.
- Each section concludes with a **recommendations table for HyperIdle** that is the canonical source of values for K7. Each row has: token name, current value, recommended value, rationale, source citations.
- **Every concrete claim is cited** with at least one URL + source name; rules that drive token changes require **≥ 3 reputable sources in agreement** (per CLAUDE.md "never blindly trust the web"). Disagreements between sources are called out.
- Sources include (non-exhaustive): Refactoring UI, Linear engineering blog, Stripe design, Vercel Geist, Apple HIG, Material Design 3, IBM Carbon, Atlassian Design, Shopify Polaris, Practical Typography (Butterick), Nielsen Norman Group, Smashing Magazine; plus surveys of recent (2024–2026) writing on LLM-generated UI tells; plus a survey of the **best Claude / AI design agents and skills** (e.g., shadcn/ui, v0, Magic Patterns, claude.ai canvas patterns) and what their prompts and rules emphasize.
- Every recommendation labelled `lintable: yes / no / partial` with a hint at the regex/AST shape (feeds K6).
- Mobile/touch is a dedicated section: minimum touch-target sizes, when to switch density automatically, breakpoint guidance.
- Typography section explicitly addresses "should we bump body / heading sizes from current values?" with research-backed recommendation.
- A brief "How to read this document" preamble explains the recommendations table is the source of truth for K7.
- `bun run check` + `bun run lint` + `bun run test` all green (no code changes here, but lint catches markdown errors via biome-ignore-style files if applicable).

**Validation scenarios.**
- Given `AESTHETICS.md`, when an agent reads it before opening K7, then it can answer "what is the new `--density-pad-y` and why?" purely from the recommendations table and citations.
- Given a controversial recommendation (e.g., body size bump), when the citations are checked, then ≥ 3 distinct reputable sources are listed.
- Given the AI-aesthetic section, when a typical LLM-generated dashboard is screenshotted, then the document predicts which anti-patterns it would exhibit.
- Given the mobile section, when read alongside the existing density presets in `tokens.css`, then it specifies whether mobile auto-switches density and at what breakpoint.

**Contracts / constraints.**
- Research is performed via parallel `general-purpose` agents (one per topic), each saving an intermediate report under `packages/design-system/research/<topic>.md`. Final synthesis is `AESTHETICS.md` — the per-topic reports remain as appendices.
- **No code or token changes in this story.** The recommendations table is a *spec*; K7 implements it.
- Author must not invent values. If sources disagree and no consensus emerges, the recommendation is "no change, see [section]" — never a guess.
- No emojis. No marketing language. Crisp prose, citations, tables.

**Effort.** L (~5d)

---

### K2 — Design-System DOM Markers (`data-ds-*` attributes)

**Story.** As a developer or designer inspecting a rendered page, I want every design-system component to expose `data-ds-component`, `data-ds-tier`, and `data-ds-source` attributes (and shells to expose `data-ds-shell`), so that I can identify in DevTools which DOM nodes come from the design system vs. custom code, and so that automated tools (K4 inspector, K6 linter, future visual reports) have a structured handle.

**Depends on.** None.

**Acceptance criteria.**
- New helper `dsProps(name, tier)` in `packages/design-system/src/ds-attrs.ts` returning a typed `{ "data-ds-component": string; "data-ds-tier": "1" | "2" | "3"; "data-ds-source": "design-system" }`. Spreadable on outermost JSX element.
- Every Tier 1 + Tier 2 TSX component in `packages/design-system/src/*.tsx` (BetCard, EmptyState, ErrorState, KeyValue, KnowledgeRow, NavItem, NotificationRow, PitchCard, SearchField, Skeleton, StatusChip, Tag, TaskCard, ThreadRow) spreads `dsProps(...)` on its outer element.
- Tier 3 shell components in `packages/web/src/shell/*.tsx` (IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector) carry `data-ds-shell="<name>"` + `data-ds-tier="3"` + `data-ds-source="web-shell"` on their outer element.
- HTML reference files in `packages/design-system/html/*.html` carry the matching attributes on the corresponding outer element (per `.claude/rules/design-system.md` which already requires this for HTML).
- New Vitest test `packages/design-system/src/__tests__/ds-attrs.test.ts` rendering each component once and asserting the attributes are present and correct.
- New Playwright assertion in the existing visual-regression test suite confirming that every demo section's outer element exposes a `data-ds-component` (Tier 1/2) or `data-ds-shell` (Tier 3).
- Visual-regression diff for every component remains under the 5% threshold (attributes don't affect layout, so no re-baseline needed).
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given the rendered web app at `/work/portfolio`, when DevTools is opened, then every BetCard's outer `<div>` shows `data-ds-component="BetCard"` and `data-ds-tier="2"`.
- Given a custom component in `packages/web/src/components/`, when rendered, then it does **not** expose `data-ds-component` (so the inspector in K4 can distinguish).
- Given the visual-regression run, when a component's outer element lacks the attribute, then the assertion fails with a clear message naming the offending file.
- Given a developer writes a new component in `packages/design-system/src/` and forgets the attribute, then K6's lint (once shipped) flags it; until K6 lands, the visual-regression assertion catches it.

**Contracts / constraints.**
- Attributes are additive. They must never affect rendering, accessibility, or visual parity.
- Tier values are strings (`"1"`, `"2"`, `"3"`) — DOM attributes are always strings; pick string at the source rather than coercing later.
- Attribute names use the `data-ds-*` namespace consistently — do not invent new prefixes.
- Helper name `dsProps` is short on purpose — it appears in every component file.

**Effort.** S (~1d)

---

### K3 — Theme Persistence (Settings panel stays sole control)

**Story.** As a user of the web app, I want my chosen theme (system / light / dark) to persist across reloads and to follow my OS color-scheme changes when set to "system", so that my preference is remembered and the experience feels native.

**Depends on.** None.

**Acceptance criteria.**
- Boot script in `packages/web/index.html` runs synchronously before React mounts: reads `localStorage["hyperidle-theme"]` (`"light" | "dark" | "system"`, default `"system"`) and applies `data-theme` to `<html>` immediately. No flash-of-wrong-theme on reload.
- New hook `packages/web/src/hooks/useTheme.ts` exposing `{ theme, resolvedTheme, setTheme }` — reads/writes localStorage, applies `data-theme`, subscribes to `matchMedia("(prefers-color-scheme: dark)")` so `system` mode follows OS at runtime.
- `AppShell.tsx` uses `useTheme()` instead of the inline `useEffect` at lines 229–236. `SettingsPanel.tsx` reads/writes via the same hook so the Appearance tab reflects and updates the persisted value.
- `DEFAULT_SETTINGS.appearance.theme` reads from `useTheme()`'s initial value, not a hardcoded constant.
- New Playwright test `packages/web/tests/theme-persistence.spec.ts`:
  - Default = system → resolves to OS preference.
  - Set to dark in Settings → reload → still dark.
  - Set to system → emulate OS color-scheme change → app re-renders without reload.
- Lore comment on the boot script explaining FOIT prevention.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given a fresh browser, when the app loads with no localStorage entry, then `system` is applied and the resolved theme matches the OS.
- Given the user sets theme to dark in Settings, when they reload the page, then the page renders dark from the first paint (no white flash).
- Given the user is on `system` mode, when they toggle their OS color-scheme, then the app re-renders to match without a manual reload.
- Given the user changes theme in Settings, when they look at the Appearance tab, then the toggle reflects the live persisted value.

**Contracts / constraints.**
- localStorage key is `hyperidle-theme`. Allowed values: `"light" | "dark" | "system"`. Anything else is treated as `"system"`.
- Boot script is plain JS (no bundler), kept under 30 lines, mirrors the pattern in `packages/design-system/html/themes/_switcher.js`.
- No new theme toggle is added to IconRail or top bar — Settings → Appearance remains the only control surface (out of scope).
- Server-side persistence (J3/J8) remains deferred — this story is local-only.

**Effort.** S (~1d)

---

### K4 — DS-vs-Custom CLI Inspector

**Story.** As a developer reviewing a page or PR, I want a CLI tool `bun run ds:inspect <page-path>` that statically analyzes a page file and reports which JSX elements come from the design system, the web shell, DaisyUI primitives, custom components, or inline-styled elements — with reuse candidates suggested for the latter two — so that I can audit design-system reuse without running the app.

**Depends on.** K2 (the inspector reads imports plus uses class-signature heuristics that reference DS primitives identified by `data-ds-component`).

**Acceptance criteria.**
- New script `packages/design-system/scripts/inspect-page.ts` using the TypeScript Compiler API (already a transitive devDependency — no new package added).
- Script accepts a single argument: a path to a `.tsx` file under `packages/web/src/`. Walks transitive imports limited to `packages/web/src/**` + `packages/design-system/src/**`.
- Buckets every JSX element into one of: `design-system` (imported from `@hyperidle/design-system`), `web-shell` (imported from `packages/web/src/shell/`), `daisyui-primitive` (`btn`, `modal`, `badge`, `menu`, `tabs`, `input`, `textarea`, `select`, `checkbox`, `radio`, `tooltip`, `alert`, `skeleton`, `avatar`, `divider`, `collapse`, `loading`, `toggle`, `drawer`, `dropdown` — class-rooted), `custom-component` (other local imports), `inline-styled` (raw HTML element with ≥ 3 layout/spacing Tailwind classes).
- Output: human-readable report to stdout showing per-bucket counts, percent design-system reuse, and for `inline-styled` and `custom-component` entries, a "reuse candidate" hint based on a fingerprint table (e.g., a `<span>` with `inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-full uppercase` ⇒ suggest `StatusChip`).
- `--format=json` flag emits machine-readable output usable by future CI tools.
- Wired as `bun run ds:inspect` in root `package.json#scripts`.
- Snapshot test in `packages/design-system/__tests__/inspect-page.test.ts` running against a known page (e.g., `WorkPortfolio.tsx`) and asserting the report shape.
- Fingerprint table lives next to `inspect-page.ts` (single file, easy to extend) and is documented inline.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given `bun run ds:inspect packages/web/src/pages/WorkPortfolio.tsx`, when run, then the report shows non-zero design-system reuse and lists at least `EmptyState`, `KeyValue`, `SkeletonCard`, `StatusChip` under the design-system bucket.
- Given a page with an inline-styled chip-like span, when the report is generated, then the entry includes a `reuse candidate: StatusChip` hint.
- Given `--format=json`, when the script runs, then valid JSON is emitted with all bucket arrays.
- Given a non-existent file path, when the script runs, then it exits with a clear error message and non-zero status.

**Contracts / constraints.**
- No runtime DOM overlay is built — CLI report only (per user direction).
- Script must run without spinning up the dev server.
- Heuristics are deterministic and documented; the report must be reproducible across runs.
- DaisyUI primitive detection looks for canonical DaisyUI class roots — keep the list explicit and short.

**Effort.** M (~2d)

---

### K5 — Concise Claude Rules + `/design-critique` Update

**Story.** As an agent doing UI work, I want a short, prescriptive Claude rule that points at the long-form `AESTHETICS.md` plus token references, and I want `/design-critique` updated with the new dimensions and required reading, so that aesthetic quality is enforced by default in every UI change without me re-reading 200 lines of background each time.

**Depends on.** K1 (the long-form write-up must exist for the rule to point at).

**Acceptance criteria.**
- New file `.claude/rules/aesthetic-quality.md`, terse (< 60 lines), formatted in the same style as `.claude/rules/frontend.md`. Lists hard rules with `→` remediation pointers. Names required reading: `packages/design-system/AESTHETICS.md`, `PRINCIPLES.md`, `DESIGN.md`. Stops short of restating principles — points to the long-form for that.
- Updated `.claude/skills/design-critique/SKILL.md` adds a 9th scoring dimension "Premium polish" tied to the AESTHETICS.md checklist, expands the Tailwind anti-pattern list with research-backed additions from K1, and adds `AESTHETICS.md` to the Required Reading block.
- Updated `.claude/rules/skill-discovery.md` flowchart adds `/design-lint` (placeholder; K6 ships the skill itself).
- `.claude/skills/design-critique/references/` gains any reference docs called out by K1 that don't already exist; existing ones are extended with K1 findings (e.g., `spacing.md`, `typography.md`, `color.md`).
- Cross-links: every section in `AESTHETICS.md` that has an enforceable rule references the rule ID it maps to; the rule file references the AESTHETICS.md section.
- `bun run check` + `bun run lint` + `bun run test` all green (no code changes here).

**Validation scenarios.**
- Given a fresh agent picks up a UI task, when it follows skill-discovery, then it lands on `/design-critique` and reads `aesthetic-quality.md` plus `AESTHETICS.md` before writing code.
- Given the rule file, when scanned, then it is concise (< 60 lines) and contains no values that aren't already in `AESTHETICS.md` or the token files.
- Given the design-critique skill, when invoked on a sample component, then it scores against the new 9th dimension with a specific finding.

**Contracts / constraints.**
- Rule file is short by design. The principle is: short rule + long-form reference, not duplicated content.
- No values appear in the rule file. Values live in `AESTHETICS.md` or `tokens.css`.
- Skill format follows existing conventions — frontmatter, `When This Runs`, scoring dimensions, output format.

**Effort.** S (~1d)

---

### K6 — Design Linter (ESLint Plugin + `/design-lint` Skill)

**Story.** As an agent or developer touching UI code, I want a proper ESLint plugin that flags off-token / off-grid / AI-aesthetic / missing-DS-marker violations inline in my editor and in `bun run lint`, plus a `/design-lint` skill that adds higher-level cross-component checks, so that the principles from K1/K5 are enforced automatically and drift is impossible to ship.

**Depends on.** K1 (rule values come from research), K2 (one rule requires the `data-ds-component` marker), K5 (rule file must exist).

**Acceptance criteria.**
- New workspace package `packages/eslint-plugin-design/` exporting an ESLint flat-config-compatible plugin. Each rule is authored in TypeScript with `RuleTester` unit tests.
- Rules (each rule's specific allowlists / scales come from K1's recommendations table):
  - `design/no-hardcoded-color` — hex/rgb/hsl literals in `*.tsx` outside the token-file allowlist.
  - `design/no-off-grid-spacing` — `(p|gap|m)-\[Npx\]` where N is not on the 4px grid (allowlist for sub-grid values comes from K1).
  - `design/no-off-scale-radius` — `rounded-\[Npx\]` not in the closed scale (scale comes from `tokens.css`).
  - `design/no-off-scale-font-size` — `text-\[Npx\]` not in the type scale (scale comes from K1).
  - `design/no-ai-aesthetic` — class-name match against the K1 anti-pattern list (the list comes from K1 — this story does not invent it).
  - `design/no-raw-tailwind-color` — raw color classes outside the Lucid palette.
  - `design/require-ds-attribute` — default-exported function in `packages/design-system/src/*.tsx` whose outermost JSX element lacks `data-ds-component`.
  - `design/require-stories-sibling` — component file under `packages/design-system/src/` or `packages/web/src/components/` without a `.stories.tsx` sibling.
  - `design/require-focus-on-interactive` — `<div onClick={...}>` / `<span onClick={...}>` without `tabIndex`, `role`, or focus-visible class.
- Each rule has its own docs page under `packages/eslint-plugin-design/docs/rules/<rule>.md` linking to the corresponding section in `AESTHETICS.md`.
- Plugin wired into `eslint.config.js` targeting `packages/web/src/**/*.tsx` and `packages/design-system/src/**/*.tsx`. Rules start as `warn`; promotable to `error` after the codebase is clean (K7's sweep should make most pass; final promotion is in K8).
- New skill `.claude/skills/design-lint/SKILL.md` modelled on `slop-scan` and `simplification-scan`. Runs the ESLint plugin via `bun run lint:design`. Adds higher-level checks the AST can't easily do: cross-component consistency ("same role, same treatment"), hierarchy clarity, missing empty/error states. Output mirrors slop-scan format: `LEVEL  file:line  message  → fix`.
- `lint:design` script in root `package.json` running `eslint` with only the `design/*` rules surfacing.
- `bun run lint:design` runs clean on a known-good fixture and flags every expected violation on a bad fixture (committed under `packages/eslint-plugin-design/test-fixtures/`).
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given a TSX file with `text-[15px]`, when `bun run lint:design` runs, then it flags as off-scale unless 15px is in K1's recommended scale.
- Given a TSX file using `rounded-2xl`, when lint runs, then it flags as AI-aesthetic.
- Given a design-system component without `data-ds-component`, when lint runs, then `design/require-ds-attribute` fires.
- Given a custom component without a `.stories.tsx` sibling, when lint runs, then `design/require-stories-sibling` fires.
- Given the editor with the ESLint extension, when a developer types an off-grid value, then the violation is highlighted inline.
- Given the `/design-lint` skill is invoked on `packages/web/src/pages/`, when run, then findings include both ESLint violations and higher-level consistency issues.

**Contracts / constraints.**
- ESLint over Biome plugins because Biome's GritQL plugin model is immature and ESLint already runs in the repo for things Biome can't cover. Pure-syntactic rules can later move to Biome if its plugin story matures.
- No rule encodes a value that isn't already in `AESTHETICS.md` or `tokens.css` (no duplication of source-of-truth).
- Rules emit clear messages with `→ fix:` suffix, mirroring slop-scan output.
- Plugin package's `package.json` declares peer dep on `eslint` and `typescript`. Built via `tsup` or equivalent if needed; otherwise compiled in-place via the workspace tsconfig.

**Effort.** L (~5d)

---

### K7 — Density, Typography & Mobile Refresh

**Story.** As a user of the web app, I want the default density (paddings, gaps, row heights), the body and heading type sizes, and the mobile-viewport behavior all updated to the values produced by K1's research, with the changes applied to the design tokens AND to components that hardcode pixel values, so that the app stops feeling cramped and feels comfortable on mobile, without breaking visual parity.

**Depends on.** K1 (provides every value), K2 (provides DOM markers used by validation), K6 (lint must pass on the new values).

**Acceptance criteria.**
- **No invented values.** Every numeric change in this story is traceable to a row in K1's recommendations table. PR description references the source rows.
- **Spacing audit (read-only first):** before any code change, an inventory of every spacing class, text size, border, and radius across `packages/web/src/**` and `packages/design-system/src/**` is produced as `packages/design-system/research/spacing-audit.md` showing frequency, off-scale offenders, and the proposed fix per offender. Audit must precede any token edit.
- **Token refresh:** `tokens.css` density presets (`default`, `compact`, `comfortable`) and any other tokens called out by K1 are updated to the K1-recommended values. Compact and comfortable shift proportionally so the 3-tier ladder stays coherent. New tokens introduced if K1 calls for them (e.g., page-title size). DESIGN.md is updated to match.
- **Typography bump:** body and/or heading sizes are bumped per K1's recommendation. The type scale in `DESIGN.md` is updated. If K1 introduces new sizes, they are added to the scale rather than replacing existing ones (mode of additive change).
- **Component pixel sweep:** every component in `packages/design-system/src/` that hardcodes pixel values (e.g., `BetCard` with `p-[8px] gap-[4px]`) is updated in BOTH HTML reference and TSX in lockstep with K1-recommended values. This is a coordinated design refresh, not a parity fix — `.claude/rules/visual-parity.md` allows this when HTML and TSX move together.
- **Shell sweep:** spacing in `packages/web/src/shell/*.tsx` is updated where K1 calls for it; intentionally tight gaps (e.g., between a status dot and chip text) are preserved per K1's "do not touch" callouts.
- **Mobile:** at viewport widths called out by K1 (typically tablet/phone breakpoints), the app applies the density preset K1 recommends (likely `comfortable` for touch). Implementation: `useViewportBreakpoint` extended (or a new media-query hook) toggles `data-density` on the AppShell root automatically, while still respecting an explicit user override from Settings.
- Visual regression tests fail initially as expected. Snapshots are NOT re-baselined in this story — that is K8's job, gated on design-critique scores.
- `bun run lint:design` passes (or only fires expected lints — e.g., visual-regression failures aren't a lint concern).
- `bun run check` + `bun run lint` + `bun run test` (excluding the visual-regression test) all green.

**Validation scenarios.**
- Given the audit report, when reviewed, then every off-scale offender either has a proposed fix or a documented exception.
- Given the token refresh PR, when an agent looks at a changed value, then the PR description cites the corresponding K1 recommendations row.
- Given a viewport at the K1-specified mobile breakpoint, when the page loads with no user override, then `[data-density]` resolves to the K1-recommended mobile preset.
- Given a user has explicitly set density in Settings, when the viewport changes to the mobile breakpoint, then the user's choice still wins (override-respecting behavior).
- Given each refreshed component, when screenshotted, then the visual difference vs. before is intentional and matches the K1 rationale.

**Contracts / constraints.**
- HTML and TSX must change in the same commit per component to preserve the intent of `visual-parity.md`. Visual regression comparison stays meaningful.
- Touch-target sizes meet WCAG / iOS / Android minimums per K1's mobile section.
- Component pixel sweep does not change any component's outer-element semantics — `data-ds-*` attributes from K2 remain.
- Don't sweep blindly. Audit dictates which spacings are intentionally tight and stay.
- Server-side persistence of density (J8) remains out of scope.

**Effort.** L (~6d)

---

### K8 — Validation, Visual-Regression Re-baseline & Accessibility

**Story.** As a founding team member, I want the aesthetics uplift validated end-to-end — design-critique scores ≥ 8 on every refreshed component, visual-regression snapshots intentionally re-baselined and locked back to the 5% threshold, axe-core a11y audit clean, and Playwright responsive tests covering the mobile breakpoint behavior introduced in K7 — so that the uplift is provably done and protected against regression.

**Depends on.** K7. Soft-depends on K6 (rules promoted from `warn` to `error` once the codebase is clean).

**Acceptance criteria.**
- Run `/design-critique all` against every page and every refreshed component. Score ≥ 8/10 for each. Any below 8 is fixed and re-scored before this story closes. Findings and final scores recorded as `packages/design-system/research/critique-results.md`.
- Re-baseline `packages/design-system/sync-reports/` after design-critique passes: regenerate HTML and TSX screenshots for every component and the per-component diff. The 5% threshold in `visual-regression.test.ts` passes against the new HTML/TSX pair.
- Playwright responsive E2E test `packages/web/tests/responsive-density.spec.ts` covering: (a) at the K1-specified mobile breakpoint, default density resolves to the K1-mobile preset; (b) explicit user override in Settings persists across breakpoint changes; (c) theme persistence (from K3) holds across breakpoints.
- axe-core integrated via `@axe-core/playwright`. Zero violations at WCAG 2.1 AA on every main page after the refresh.
- Touch-target audit script (or skill invocation) confirms every interactive element meets the K1-specified minimum size at the mobile breakpoint.
- ESLint design rules from K6 promoted from `warn` to `error` for `packages/design-system/src/**` and any rule classes that the codebase passes cleanly. Rules that still have legitimate warnings remain `warn` with a per-warning waiver list.
- Side-by-side before/after screenshots of every main page committed under `packages/design-system/research/before-after/`.
- `bun run check` + `bun run lint` + `bun run test` (including visual-regression) all green.

**Validation scenarios.**
- Given the design-critique results document, when read, then every component scores ≥ 8/10 on all 9 dimensions.
- Given the visual-regression run, when executed against the new baseline, then every component is under the 5% threshold.
- Given a viewport size below the K1 mobile breakpoint, when the responsive test runs, then it observes the expected density preset and theme behavior.
- Given the axe-core audit, when run on every main page, then zero violations.
- Given the before/after screenshots, when compared, then the intended aesthetic improvement is visually obvious to a human reviewer.

**Contracts / constraints.**
- Re-baselining is intentional and cited — every regenerated snapshot's commit message references the K7 PR that drove the change.
- axe-core integration uses `@axe-core/playwright`. If not yet a devDependency, add it.
- Touch-target audit may live as part of `/design-lint` (an additional check the skill runs) or as a standalone script — author chooses; either is acceptable.
- The design-critique pass is the gate. If a component scores < 8, K7 is reopened (per pipeline rules: max 3 attempts before blocked).

**Effort.** M (~3d)

---

### K9 — Density Ladder Re-tier (Real Comfortable Mode)

**Story.** As a user of the web app on a normal laptop or external monitor, I want the default density to feel like a modern productivity app rather than a Linear-tight power-user tool, AND I want a "comfortable" mode that genuinely feels comfortable (iOS Settings / Notion / Apple Mail comfort band) — including a body and heading font-size bump under comfortable — so that the density toggle is a real choice rather than a 4-pixel cosmetic difference. Power users keep a tight tier (renamed `compact`) for small screens; nobody loses what they had.

**Depends on.** K7 (touches the same density tokens), K8 (rebaselined visual-regression and contrast).

**Background.** K7's `compact = default × 0.75` / `comfortable = default × 1.25` ratio is internally consistent but, after rounding to the 4-px grid, produces deltas of one grid unit per step (`pad-x` 8/12/16, `pad-y` 4/8/12). Visually the three tiers read as the same layout slightly nudged. This story re-tiers the ladder so each step is felt, drops the never-useful ultra-compact tier, and shifts the ladder toward generous — the broader productivity-app market has moved off Linear-tight defaults and tiny-fonts/tiny-spacings are dying. The new ratios are **`compact = default × 0.75` / `comfortable = default × 1.5`** and the per-step deltas are visible (≥ 4 px on `pad-x`, 8 px on `pad-y`/`gap`, 12 px on `row-h`, 1 px per step on body text).

**Acceptance criteria.**

- **AESTHETICS.md re-spec.** The Spacing & Density and Typography recommendations tables in `packages/design-system/AESTHETICS.md` are updated to reflect the new ladder. AQ-003 reads `compact = default × 0.75; comfortable = default × 1.5` (designer-call, with the rationale "comfortable tier matches iOS Settings / Notion / Apple Mail comfort band"). Each row that changes is tagged `(designer-call)` per the K1 resolution category. The previous "no change" rows that this story overrides are explicitly listed in a brief K9 changelog at the top of the section.
- **`tokens.css` density tier values.** The three density blocks read:
  - `[data-density="compact"]`: `--density-pad-x: 0.75rem` (12 px), `--density-pad-y: 0.5rem` (8 px), `--density-gap: 0.5rem` (8 px), `--density-row-h: 2rem` (32 px), `--density-text: 0.875rem` (14 px) — i.e. today's `default` becomes the new `compact`.
  - `[data-density="default"]` (`:root` fallback): `--density-pad-x: 1rem` (16 px), `--density-pad-y: 0.75rem` (12 px), `--density-gap: 0.75rem` (12 px), `--density-row-h: 2.75rem` (44 px), `--density-text: 0.9375rem` (15 px), `--leading-body: 1.55`. Already meets the AQ-015 44-px touch-target floor at default — auto-density on mobile no longer needs to flip the tier just to clear it.
  - `[data-density="comfortable"]`: `--density-pad-x: 1.5rem` (24 px), `--density-pad-y: 1rem` (16 px), `--density-gap: 1rem` (16 px), `--density-row-h: 3.5rem` (56 px), `--density-text: 1rem` (16 px), `--leading-body: 1.6`, `--tracking-caps: 0.015em` (slightly tighter at the larger size).
- **Heading-scale density tokens (new).** `--density-text-h1` and `--density-text-h2` are introduced and overridden per density tier so the H1/H2 type scale grows with comfortable: 24 / 26 / 28 px for H1, 18 / 20 / 22 px for H2 (compact / default / comfortable).
- **Type-scale variables under density selectors.** The existing literal heading sizes in `tokens.css` and any heading utilities used by H1/H2 in `packages/design-system/src/*.tsx` and `packages/web/src/{shell,pages}/**` are converted to `var(--density-text-h1)` / `var(--density-text-h2)` so headings actually grow under `[data-density="comfortable"]`. Components that use a one-off heading size (e.g. a banner) can stay literal — flag the exception inline.
- **AQ-003 ratio enforcement (designer-call).** A small assertion in `packages/design-system/src/__tests__/density-tier.test.ts` parses `tokens.css` and asserts that for `pad-x`, `pad-y`, `gap` the new ratio holds within 4 px of `default × 0.75` (compact) and `default × 1.5` (comfortable). `row-h` is exempt from the upper-bound assertion because the AQ-015 44-px floor and the new 56-px comfortable were both designer calls.
- **Mobile auto-density unchanged in mechanism, simpler in effect.** `useAutoDensity` still flips to `comfortable` at viewport ≤ 1024 px when the user preference is `auto`. The new `default` already clears the 44-px touch-target floor, so the mobile bump is now an aesthetic choice (more breathing room on a phone) rather than a hard a11y requirement. The `@lore` comment on `useAutoDensity.ts` is updated to reflect this.
- **AQ-005 still satisfied.** Mobile inputs ≥ 16 px font-size at viewport ≤ 768 px. Under the new ladder, every tier on mobile already clears it: comfortable's body is 16 px, default is 15 px (still below floor — keep the dedicated lint), compact is 14 px. The `design/require-mobile-input-size` rule stays at warn.
- **Design-critique re-pass.** Run `/design-critique` on every refreshed component AND on each main page at all 3 tiers (compact, default, comfortable). Score ≥ 8/10 on every dimension at every tier. Save findings as `packages/design-system/research/critique-results-K9.md`.
- **Visual-regression rebaseline.** Every snapshot diffs (token values shifted). Regenerate `sync-reports/` HTML and TSX screenshots; the 5 % threshold passes against the new pair. Commit the rebaseline as a separate `chore(K9):` commit citing the K9 token commit hash.
- **Playwright responsive test extended.** `packages/web/e2e/responsive-density.spec.ts` (added in K8) gains a 6th case asserting that under `[data-density="comfortable"]` the `KeyValue` value font-size resolves to 16 px (proving the new heading-scale density-token wiring works end-to-end at runtime).
- **axe-core re-pass.** Re-run the K8 axe-core suite at all 3 tiers — zero WCAG 2.1 AA violations. The bigger fonts make text contrast easier; the new tracking on uppercase labels needs spot-checking.
- **DESIGN.md updated.** Token reference matches the new tier values + the new `--density-text-h1` / `--density-text-h2` tokens.
- **lint:design and lint pass clean.** `bun run check && bun run lint && bun run test` all green; `bun run lint:design` produces no NEW warnings beyond K7's documented baseline (waivers.md unchanged).

**Validation scenarios.**

- Given the rendered web app at `/work/portfolio` with `[data-density="comfortable"]`, when measured, then `BetCard` outer padding is 16 px, gap between cards is 16 px, row height in any list region is 56 px, and the page H1 is 28 px.
- Given the same page at `[data-density="compact"]`, when measured, then padding is 12 px, gap 8 px, row 32 px, H1 24 px — identical to today's "default".
- Given the user toggles density in Settings from default → comfortable, when the next paint completes, then the visual change is *obvious* (cards visibly larger, headings visibly larger, more whitespace) — not a subtle 4 px nudge.
- Given a 13" laptop at 1280 × 800 with default density, when the page renders, then it does not look uncomfortably sparse — it should match the iOS Mail / Notion default density that today's sites converge on.
- Given the `density-tier.test.ts` ratio assertion, when run, then `pad-x` / `pad-y` / `gap` all satisfy `compact ≈ default × 0.75` and `comfortable ≈ default × 1.5` within 4 px.

**Contracts / constraints.**

- **No invented color values.** This story does not touch color tokens.
- **Designer-call discipline.** The new ratios and the per-tier numerics are explicit designer calls per the K1 resolution category. Each row that diverges from K1's "no change" verdict carries a `(designer-call)` tag and a one-line rationale citing the iOS Settings / Notion / Apple Mail comfort band.
- **Lockstep TSX + HTML edits per visual-parity rule.** Any component whose pixel hardcodes need re-tier (BetCard, KnowledgeRow, NavItem, NotificationRow, PitchCard, TaskCard, ThreadRow, KeyValue, etc.) updates BOTH the HTML reference AND the TSX in the same commit. Same dance K7 did.
- **The mobile auto-density flip is preserved** (UX consistency: on a phone you still get the most spacious tier by default), even though the floor it was guaranteeing is now met at default. Document this in the `@lore` on `useAutoDensity`.
- **The compact tier is still callable** (Settings still offers it). It's intended for power users on small screens or who genuinely prefer Linear-tight density.
- **Server-side persistence (J3/J8 deferred)** remains out of scope.

**Effort.** L (~3-4 days)

---

## Track K dependency graph

```
K1 ─────┬─► K5 ─► K6 ─┐
        │              │
K2 ─────┼─────────► K4 │
        │              ├─► K7 ─► K8 ─► K9
K3 ─────┘              │
                       │
        K1 ────────────┘
```

Critical path: **K1 → K5 → K6 → K7 → K8 → K9**. K2, K3, K4 land in parallel where dependencies allow.
