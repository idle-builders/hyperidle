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

### K10 — Density-Aware Component Audit & Critique (research-only)

**Story.** As the designer-of-record for HyperIdle, I want a thorough design-critique pass on every Tier 1+2 primitive AND every Tier 3 shell that asks the question "should this scale with density, and if so on which axes?" — captured as a per-component matrix in `packages/design-system/research/density-audit.md` — so that the K11 sweep refactors components against an explicit, design-justified spec rather than mechanically swapping every literal pixel for a token. Some surfaces should scale on every axis (list rows, body text); some should only scale on a subset (chips on internal padding only, never font-size); some should not scale at all (icons, status dots, brand marks). The research output identifies any new density variables the system needs, before any code is written.

**Depends on.** K9.

**Background.** K9 widened the density ladder so each step is felt, but only ~20 % of design-system components actually consume density tokens (NavItem, ThreadRow, KeyValue partially, plus 3 shells). The other ~80 % use literal pixel values, so toggling density barely changes the rendered surface a user looks at on `/work/portfolio`, `/work/team`, `/knowledge`, etc. The naive fix — swap every literal for a token — is wrong: a `StatusChip` should be 20 px tall regardless of tier (it's a badge, not a row); a brand `IconRail` button should stay 40 px (motor-memory affordance); the danger-red `Tag` shouldn't grow font-size with comfortable (it's a callout, not body copy). Only an explicit per-component design judgment yields the right matrix. This story is that judgment, captured.

**Acceptance criteria.**

- New file `packages/design-system/research/density-audit.md`. Per-component matrix with one row per primitive + one row per shell (28 rows total: 14 design-system primitives + 8 web shells + the 6 page surfaces — `/work/portfolio`, `/work/team`, `/work/bet/:id`, `/conversations/{review,chat}`, `/knowledge`, `/knowledge/:id`).
- Each row's columns:
  1. **Component** name + tier (1/2/3 or page).
  2. **Density-aware?** `yes` / `no` / `partial`. If `partial`, which axes (e.g. "padding only, font-size literal").
  3. **Tokens it should consume** — list of `--density-*` tokens that apply. May reference a new token from column 5 below.
  4. **Tokens that explicitly stay literal** — and why (e.g. "StatusChip height: 20 px; this is a badge, not a row, and badges shouldn't grow with comfortable").
  5. **New tokens needed (if any)** — proposed name + per-tier values + rationale + cite the design system that supports the value (e.g. "`--density-icon-size`: 16 / 20 / 24 px; matches Material 3's icon-size cascade; chips/buttons/nav use this so density toggle scales icons too without each component owning the size").
  6. **Sources** — at least one citation per row, ≥ 3 distinct organization domains for any *new* density variable proposed.
- A summary section at the top: counts (how many `yes` / `no` / `partial`), proposed-new-token list with one-line rationale each.
- An "AI-aesthetic safeguards" section listing density anti-patterns the audit revealed: "comfortable mode must not turn the app into a marketing landing page" — concrete don'ts (no oversized hero spacing, no inflated buttons, no center-aligned content).
- A "Density-discriminated screenshot rubric" section: for each refreshed surface, what should a reviewer compare across compact / default / comfortable to validate the design intent? E.g., "BetCard at compact: 4 rows visible per scroll; at default: 3; at comfortable: 2.5. If you see the same row count, the density isn't doing its job."
- Research is performed via parallel `designer` subagents (one per shell + one per page; primitives can be batched), each returning a draft row + rationale. Final synthesis is the audit doc.
- The 10-gate vitest for AESTHETICS.md still passes (no AESTHETICS.md changes here — K10 is purely research; K11 will incorporate findings into AESTHETICS.md).
- `bun run check` + `bun run lint` + `bun run test` all green (no code changes).

**Validation scenarios.**

- Given `density-audit.md`, when an agent reads it before opening K11, then it can answer "should `BetCard` body text scale with density?" purely from the matrix.
- Given a proposed new token (e.g. `--density-icon-size`), when its row is read, then the per-tier values + rationale + ≥ 3 citations are visible.
- Given the AI-aesthetic safeguards section, when comfortable mode is screenshotted, then a reviewer can apply the rubric and predict whether the surface drifted toward marketing-landing-page anti-patterns.
- Given the screenshot rubric, when a tier is toggled in the dev server, then the documented "what should change" matches what the eye sees.

**Contracts / constraints.**

- **No code or token changes in this story.** Pure research. K11 implements.
- **Author must not invent density values** for new tokens without ≥ 3 reputable citations (per K1's discipline). New tokens that can't earn 3 citations are flagged as `(designer-call)` with explicit rationale.
- **No emojis. No marketing language. Crisp prose, citations, tables.**
- **The matrix is the spec for K11.** If a row is unclear or contradictory, fix it here, not in K11.

**Effort.** M (~2-3 days)

---

### K11 — Density Sweep + Lint Enforcement

**Story.** As a user toggling density in Settings, I want every surface I look at — BetCards on `/work/portfolio`, the Kanban board, ThreadRows in conversations, knowledge rows, the review header — to actually shift in the way K10's audit prescribes, AND I want the design lint plugin to enforce that newly-density-aware components don't drift back to literal pixels in future PRs. Together these turn the K9 ladder from "values exist in tokens.css" into "the app feels different at every tier across every surface."

**Depends on.** K10 (the audit matrix is the implementation spec), K6 (ESLint plugin to extend), K9 (current ladder values).

**Acceptance criteria.**

- **Component refactor per K10's matrix.** Every component with `Density-aware? = yes` or `partial` consumes its prescribed `--density-*` tokens. HTML reference and TSX move in lockstep per `.claude/rules/visual-parity.md`. Components with `Density-aware? = no` (e.g. `StatusChip`, `IconRail` icons) are left literal — the lint rule below explicitly allows them.
- **New density variables added** (if K10 identified any). Defined in `tokens.css` + `html/_tokens.css` per tier per K10's recommendations. AESTHETICS.md updated with the new rows.
- **`AESTHETICS.md` updated** with the K10 matrix as a new appendix table, plus per-section recommendations for the new tokens. The K9 changelog at the top of § Spacing & Density gains a K11 sub-bullet listing the swept components.
- **`design/use-density-tokens` (new ESLint rule).** Flags literal pixel padding/gap/font-size values inside components that K10's audit marked as density-aware. The rule reads an opt-out manifest `packages/eslint-plugin-design/density-allowlist.json` (generated from K10's matrix — components marked `no` or specific axes marked literal are listed). Rule level: `error` for `packages/design-system/src/**`, `warn` for `packages/web/src/**`. New AQ rule (e.g. **AQ-017**) added to `.claude/rules/aesthetic-quality.md` with the cross-reference.
- **`design/no-density-tokens` (new ESLint rule).** Inverse: flags `var(--density-*)` consumption inside components K10's audit explicitly marked as density-static (e.g. `StatusChip`, `IconRail`). Density-aware shouldn't leak to surfaces that should look the same at every tier.
- **Updated `/design-lint` skill.** Reads K10's matrix at run-time as the source of truth for which components should be density-aware; cross-references with the AST findings; flags any drift. The higher-level checks gain a "density-tier consistency" check (same-role components should have the same density-awareness shape).
- **Visual-regression rebaseline.** Every snapshot of a swept component diffs against current. Regenerate, diff intentional, commit as a separate `chore(K11):` commit citing the K11 token/sweep commit hash. The 5 % threshold passes against the new HTML/TSX pair.
- **Playwright responsive matrix extended.** `responsive-density.spec.ts` gains assertions per swept primitive: at each of compact / default / comfortable, the rendered `getBoundingClientRect` of the primitive matches the expected px range. One assertion block per primitive that should scale on a measurable axis. (Skip primitives that scale only on text-color or letter-spacing — those need a different assertion shape.)
- **`/design-critique` re-pass.** Run the skill on every refreshed surface at all 3 tiers. Score ≥ 8 / 10 on every dimension at every tier. Iterate until clean (max 3 attempts per surface).
- **`bun run check && bun run lint && bun run test`** all green. `bun run lint:design` produces no NEW warnings beyond K7's documented baseline; the new `design/use-density-tokens` rule passes against the swept components.
- **`docs/lore.md` entry** (or per-component `@lore` comments) capturing the rationale for any "stays literal" decision that future agents would otherwise revert. E.g. "StatusChip height stays at 20 px because density toggling badges destroys their as-callout function — see K10 § StatusChip."

**Validation scenarios.**

- Given the rendered web app at `/work/portfolio` toggled to comfortable, when measured, then BetCard outer padding, gap between cards, and KeyValue font-sizes all match the K10-prescribed comfortable values.
- Given the same page at compact, when measured, then BetCards are visibly tighter than default — the density toggle is felt, not 4 px of nudging.
- Given a developer adds a new component to `packages/design-system/src/` that uses `p-[8px]` instead of `var(--density-pad-y)`, when `bun run lint` runs, then `design/use-density-tokens` flags it and points to the K10 matrix row that says "this component class is density-aware."
- Given a developer adds `var(--density-pad-x)` to `StatusChip` (which K10 marked density-static), when lint runs, then `design/no-density-tokens` flags it.
- Given the `/design-lint` skill is invoked on `packages/web/src/pages/`, when run, then findings include a "density-tier consistency" callout if same-role components diverge in density-awareness.
- Given the screenshot rubric from K10, when a reviewer compares the three tiers of `/work/portfolio`, then the documented row counts hold (e.g. 4 / 3 / 2.5 BetCards visible).

**Contracts / constraints.**

- **K10's matrix is the spec.** Don't change a component's density-awareness without updating the matrix first.
- **HTML and TSX in lockstep** per visual-parity rule (intentional refresh, like K7).
- **No invented density variables.** Any new tokens come from K10. If implementation reveals a missing token, stop and amend K10, then resume.
- **Don't sweep blindly.** Components K10 marked `no` stay literal — that's intentional design judgment.
- **The two new lint rules must not contradict each other.** A component is in exactly one bucket: density-aware (some axes prescribed) OR density-static (no `--density-*` tokens). The opt-out manifest is the arbiter.

**Effort.** L (~5-6 days)

---

### K12 — Unified Design System Workbench

**Story.** As a designer or agent reviewing the design system at port 8098, I want every component HyperIdle ships — Tier 1 primitives, Tier 2 blocks, Tier 3 shells, and the web-app composite components in `packages/web/src/components/` — to appear as a discoverable tile on the catalog home AND to be previewable at all three density tiers (`compact` / `default` / `comfortable`) AND in both themes (Lucid Dark / Lucid Light) from one workbench, so that the K11 sweep and the K13 re-validation can eyeball every surface at every tier from a single screen rather than spinning up the full app and navigating to a real page.

**Depends on.** K10 (audit names which components exist + which are density-aware). Independent of K11 — can run in parallel.

**Background.** Today there are two design-system viewers and they disagree:
- The port-8098 viewer at `packages/design-system/viewer/main.tsx` ships a hardcoded catalog with **14 Tier 1+2 components** (5 + 6 + 3 utility) and an `import.meta.glob` that only reaches into `../src/*.stories.tsx`. It's the only viewer with HTML/TSX render-mode toggle.
- The in-app `/designsystem` route at `packages/web/src/designsystem/DesignSystem.tsx` discovers from three globs (`design-system/src/`, `web/src/shell/`, `web/src/components/`) and shows all 29 components. No HTML/TSX toggle.

The user found this gap when looking for IconRail and ReviewHeader and seeing a 14-tile catalog. Half the components are invisible from what is *supposed* to be the canonical visual workbench. K11's design-critique pass at all three tiers needs every surface visible on one screen.

**Acceptance criteria.**

- **Catalog auto-generates from discovered stories.** Replace the hardcoded `TIER1` / `TIER2` / `UTILITY` arrays in `packages/design-system/viewer/main.tsx` with a derivation from `discoverStories()`. Add a `tier` field to each story's default export: `"1" | "2" | "3" | "utility"` (matches the existing `data-ds-tier` shape from K2). The catalog tiles are sorted by tier then alphabetically.
- **Discovery globs extended.** `discoverStories()` in `viewer/main.tsx` adds two new globs reaching into the web package: `import.meta.glob("../../web/src/shell/*.stories.tsx", { eager: true })` and `import.meta.glob("../../web/src/components/*.stories.tsx", { eager: true })`. Vite's workspace symlinks make this work at build time. Document the cross-package read with a `// @lore` comment explaining why design-system needs build-time-only access to web's stories (one workbench, not two).
- **Every story's default export carries `tier`.** All 29 `.stories.tsx` files (14 in `design-system/src/`, 8 in `web/src/shell/`, 7 in `web/src/components/`) gain `tier: "1" | "2" | "3" | "utility"` on their default export. This is additive metadata — existing `title` and `order` are preserved. The mapping comes from K10's audit (Tier 1 / 2 / 3 columns) and `.claude/rules/design-system.md`.
- **Density-tier toolbar selector.** The toolbar (alongside the existing HTML/TSX mode toggle and Dark/Light theme toggle) gains a third pill with three buttons: `Compact` / `Default` / `Comfortable`. Clicking sets `data-density` on the viewer's `<html>` element AND syncs into the iframe (`<html>`) for HTML mode using the same theme-iframe-sync pattern the existing theme switcher uses. State persists in `localStorage["ds-density"]`.
- **Tier 3 / utility component rendering.** Tier 3 shells (IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector) and web-app composite components (CurationSuggestionCard, ErrorBoundary, GlobalSearchPanel, KnowledgeTopicGroup, ReasoningBlock, SettingsPanel, ThreadSections) render in TSX mode using their existing `.stories.tsx` exports. **HTML mode is suppressed for components that don't have a `.html` reference file under `packages/design-system/html/`** — the toolbar's HTML/TSX toggle hides itself when no HTML file exists for the active component. This is the cheapest correct behavior; an empty HTML iframe or a 404 isn't useful.
- **Catalog header copy.** The `<div className="catalog-version">` text auto-counts: `{n} components · 4 tiers · factory-dark` rather than the literal `"14 components · 3 tiers · factory-dark"` it ships today.
- **Composition graph still renders, but is now data-driven.** The hardcoded `<pre>` block at the bottom of `Catalog()` is replaced by deriving the graph from each component's `meta.uses` array (a new optional field on the story default export). Components opt-in by listing their dependencies. The graph renders alphabetically by tier, then by component name.
- **Vitest** in `packages/design-system/__tests__/viewer-discovery.test.ts` (new): synthetic glob shape passed to `discoverStories()` returns the expected `(title, tier, variants)` shape; tier-bucketing is correct; missing-tier defaults to `"utility"` with a console warning; non-existent HTML reference correctly suppresses the HTML-mode toggle.
- **Playwright smoke** in `packages/design-system/tests/workbench.spec.ts` (new): hit `:8098`, assert the catalog renders ≥29 tiles total grouped by tier; click any Tier 3 shell tile, assert it loads in TSX mode and shows the component; toggle density to `comfortable`, assert `getComputedStyle` on a primitive that consumes density tokens reflects the comfortable values.
- `bun run check && bun run lint && bun run test` all green.

**Validation scenarios.**

- Given a designer opens `:8098`, when the catalog loads, then they see ≥29 tiles grouped under Tier 1 / Tier 2 / Tier 3 / Utility headings.
- Given the designer clicks `IconRail`, when the page loads, then it renders in TSX mode (no HTML file exists for IconRail), the HTML/TSX toggle is hidden, and the component renders.
- Given the designer toggles density to `comfortable`, when a primitive that consumes density tokens (NavItem, ThreadRow, KeyValue) is rendered, then `getComputedStyle` reflects the comfortable values from `tokens.css` (44+ px row-h, 16 px body, etc.).
- Given a developer adds a new component + story without a `tier` field, when the viewer loads, then the component appears in the `Utility` bucket with a console warning naming the file (so the omission is visible without breaking the build).
- Given a developer adds a new component with `meta.uses: ["StatusChip", "Tag"]`, when the catalog renders, then the composition graph shows `<NewComponent> → StatusChip, Tag`.

**Contracts / constraints.**

- **Cross-package import is build-time only.** The viewer's two new globs cross from `packages/design-system` into `packages/web` via Vite's workspace symlinks. This is acceptable for the viewer (a developer-only build target) but must NOT leak into design-system's runtime exports. The `package.json` of `packages/design-system` does not gain a runtime dependency on `@hyperidle/web`.
- **Stories MUST be self-rendering.** Tier 3 shells and web composites that depend on context (router, store, query client) provide a story-local mock or wrapper inside the `.stories.tsx`, not in the viewer. The viewer renders stories naively.
- **Density toggle does not persist into the rendered component's localStorage** (which the in-app `useTheme` / density preference uses). The viewer's `data-density` is set directly on the document, mirroring the existing theme-switcher pattern.
- **HTML mode availability is feature-detected**, not configured. The viewer asks "does `/<title>.html` exist?" via a HEAD request before showing the HTML toggle, falling back gracefully if the request fails.
- **Catalog tile copy.** The `meta` and `uses` strings on tiles use the Lucid uppercase mono chrome convention for headings; component names stay sentence-cased.

**Effort.** S (~1-1.5 days)

---

### K13 — Density Ladder Re-validation & Tuning

**Story.** As the designer-of-record, after K11 means every surface actually shifts with density AND K12 means every surface is visible on one workbench, I want a fresh design-critique pass on the running app at all 3 tiers across every page and primitive — focused on aesthetics and usability, not just rule compliance — so that the K9 ladder values can be tuned (or new density variables added) based on how the app *actually feels* now that the toggle reaches everywhere. The K9 values were chosen against research bands (iOS Settings / Notion / Apple Mail); K13 confirms or adjusts them against lived experience.

**Depends on.** K11, K12.

**Acceptance criteria.**

- **Tier-by-tier critique.** Run `/design-critique` on every main page (8 pages total) AND every Tier 1+2 primitive at all 3 tiers (84 critique runs total: 28 surfaces × 3 tiers). Capture findings + scores in `packages/design-system/research/density-critique-K13.md`. Score ≥ 8 / 10 on every dimension at every tier.
- **Cross-tier coherence assessment.** A new section in the critique doc grades the *transition* between tiers: does compact → default feel like a meaningful step? does default → comfortable? Are any surfaces visually identical across two tiers (= broken)? Are any surfaces unrecognizably different across one tier (= over-stepped)?
- **AI-aesthetic check at comfortable.** Comfortable mode is the failure mode for "this app started feeling like a marketing landing page." Run `/design-lint` on every page at comfortable; the AI-aesthetic catalog (AQ-101..AQ-113) must produce zero new findings vs. default.
- **Ladder tuning recommendations.** Based on findings, the doc proposes (a) which token values to adjust, (b) which new density variables (if any) to add, (c) which existing tokens to retire if they're carrying no signal. Each recommendation is `(designer-call)` with explicit rationale and at least one before/after screenshot (captured via the K12 workbench at all 3 tiers).
- **AESTHETICS.md updates.** Apply the recommended adjustments to the recommendations table. K9's K9 changelog gains a K13 sub-bullet for any value that was tuned. New tokens (if any) get full rows with citations.
- **`tokens.css` updated** per the ladder adjustments. `density-tier.test.ts` adjusted if the ratio rule shifts.
- **Visual-regression rebaseline** if any token values changed. Separate `chore(K13):` commit.
- **Before/after screenshots** of every page at each tier committed under `packages/design-system/research/before-after-K13/`. Each page has a 3 × 2 grid: rows = `before-K11 / after-K11 / after-K13`, columns = `compact / default / comfortable`. Captured via the K12 workbench.
- **`bun run check && bun run lint && bun run test`** all green.
- **Skill + rule audit.** Re-read `.claude/rules/aesthetic-quality.md`, `.claude/skills/design-critique/SKILL.md`, `.claude/skills/design-lint/SKILL.md`, and the K6 ESLint rules. Are they making proper use of density-awareness? Where do they need new rules / new dimensions / new checks? Capture as a follow-up TODO list in `packages/design-system/research/density-skill-audit-K13.md` (a deliverable, not requiring action — feeds a future K14 if needed).
- **Workbench root font-size normalization.** K12 left the workbench at a 14 px root font (`packages/design-system/viewer/viewer.css`'s `html` / `body` rule), which makes density tokens compute 12.5 % smaller in the workbench than in the real app's 16 px root. The critique pass and the before/after screenshots above MUST run against a workbench that matches production rooting; either (a) bump the workbench root to 16 px and re-verify the existing Playwright workbench smoke tests still pass under the K12 contract, or (b) leave the 14 px root and *explicitly document* the offset in `viewer.css` `@lore` plus a callout at the top of `density-critique-K13.md`. Default to option (a). Whichever path is chosen, the critique findings cite the root font-size in effect so future agents can interpret the screenshots correctly.

**Validation scenarios.**

- Given `density-critique-K13.md`, when read, then every page at every tier has a recorded score ≥ 8/10 on every dimension.
- Given the cross-tier coherence section, when read, then the doc explicitly states for each surface whether compact / default / comfortable feel like distinct, intentional choices.
- Given the comfortable-mode AI-aesthetic check, when run, then zero new findings vs. default.
- Given the before/after screenshots, when compared by a human reviewer, then the K13 tuning is visible (or the doc explicitly says "no tuning needed; K11 ladder confirmed").
- Given the skill+rule audit, when read by a future K14 author, then they have a concrete TODO list of skill/rule updates.

**Contracts / constraints.**

- **Designer-call discipline.** Tuning recommendations are explicitly `(designer-call)` — they're judgment, not 3-source convergence. The K1 resolution category applies.
- **Don't tune for the sake of tuning.** "No change; K11 ladder confirmed" is a valid outcome and should be the default unless a critique finding clearly warrants adjustment.
- **Skill/rule audit produces a TODO list, not implementation.** That's the next story (K14 if you green-light it). K13 stays focused on the ladder + the critique.

**Effort.** M (~2-3 days)

---

## Track K dependency graph

```
K1 ─────┬─► K5 ─► K6 ─┐
        │              │
K2 ─────┼─────────► K4 │                          ┌─► K11 ─┐
        │              ├─► K7 ─► K8 ─► K9 ─► K10 ─┤        ├─► K13
K3 ─────┘              │                          └─► K12 ─┘
                       │
        K1 ────────────┘
```

Critical path: **K1 → K5 → K6 → K7 → K8 → K9 → K10 → K11 → K13**. K2, K3, K4 land in parallel where dependencies allow.

**K11 (Density Sweep + Lint) and K12 (Unified Workbench) run in parallel after K10.** They touch disjoint surface areas: K11 modifies component `.tsx` files (production code) and adds new ESLint rules; K12 extends the design-system viewer (`packages/design-system/viewer/main.tsx`) and adds a `tier` field to story default exports. The only shared touch point is `.stories.tsx` files, where K12 adds metadata that K11 does not depend on.

K10 → K11/K12 → K13 is the "make density real" arc: research first (no code), then sweep + enforce + workbench in parallel (the bulk of the work), then re-validate the ladder against lived experience using the new workbench (tune + audit). K10's audit matrix is the explicit gate before K11 touches any component code; K12's workbench is the canonical visual surface K13 needs.
