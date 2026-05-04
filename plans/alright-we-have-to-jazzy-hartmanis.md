# Aesthetics Uplift — Plan

## Context

The web app feels cramped and visually off, even though the underlying design system is in good shape. The user wants a coordinated upgrade across seven workstreams:

1. **DOM inspectability** — design-system elements should be identifiable from the DOM via `data-*` attributes (currently only `data-status` and `data-testid` exist on a handful of components; `data-component` / `data-tier` are required by `.claude/rules/design-system.md` but not actually emitted by the TSX layer).
2. **Theme persistence** — currently `Settings → Appearance` has system/light/dark, but `setSettings` is in-memory (J3 deferred), so reload loses preference. Add localStorage persistence, synchronous boot script (no flash), and runtime `prefers-color-scheme` listener.
3. **DS-vs-custom CLI inspector** — for any page, see which elements come from `@hyperidle/design-system` vs. custom code, with reuse candidates.
4. **Web research on aesthetics** — capture authoritative principles for what makes UIs feel premium and usable, both from human design literature and from "things AI gets wrong."
5. **Codify principles** — a *longer-form, research-backed write-up* in the design system, plus *short concise* Claude rules, so future agents apply these by default.
6. **Design linter** — proper ESLint/Biome plugin so violations show up inline; plus a `/design-lint` skill for higher-level checks; plus the short Claude rule above.
7. **Density / typography refresh** — token adjustments **and** a hardcoded-pixel sweep across components. Confirmed by sampling: shells use `gap-1` / `p-2` heavily; components hardcode `gap-[4px]` / `p-[8px]`. Re-baseline visual regression after.

Goal: a polished, distinctive, usable UI plus the rules + tooling to keep it that way as the codebase grows. Visual parity (HTML ↔ TSX, 5% threshold) is preserved per token, then re-baselined intentionally for the spacing sweep.

---

## Critical files

**Tokens & principles (foundation):**
- `packages/design-system/src/tokens.css` — surfaces, accents, text, borders, density presets (lines 132–156)
- `packages/design-system/DESIGN.md` — token reference
- `packages/design-system/PRINCIPLES.md` — seven universals + surprise principles + AI-aesthetic blacklist
- `packages/web/tailwind.config.ts` — DaisyUI Lucid Dark/Light themes

**Theme application:**
- `packages/web/src/layouts/AppShell.tsx` lines 219–236 (theme `useEffect`)
- `packages/web/src/components/SettingsPanel.tsx` — current theme control (Appearance tab)
- `packages/web/index.html` — boot script for synchronous theme application (avoid flash of wrong theme)

**Design-system TSX components (need `data-ds-*` attributes added):**
- All 14 files in `packages/design-system/src/*.tsx` (Tier 1/2)
- Tier 3 shells in `packages/web/src/shell/*.tsx`

**Linter / inspector targets:**
- `packages/design-system/scripts/` — new `inspect-page.ts`
- New ESLint plugin package: `packages/eslint-plugin-design/`
- `eslint.config.js` — register the new plugin
- `.claude/skills/design-lint/` — skill folder
- `.claude/rules/aesthetic-quality.md` — short rule

**Existing skill templates to clone:**
- `.claude/skills/slop-scan/SKILL.md`, `.claude/skills/simplification-scan/SKILL.md` (read-only scan pattern)
- `.claude/skills/design-critique/SKILL.md` and its `references/` (extension target)

**Visual regression infrastructure:**
- `packages/design-system/src/__tests__/visual-regression.test.ts` (Playwright + pixelmatch, 5% gate)
- `packages/web/scripts/visual-compare.ts` (reference-prototype diffing)

---

## Workstreams

The seven asks become seven workstreams. **A unblocks C, F.** D and E can run in parallel with A. G (token / spacing refresh) lands last because it triggers a visual-regression re-baseline.

### Workstream A — `data-ds-*` attributes on every design-system element

**Why:** Required by both the user's #1 ask and `.claude/rules/design-system.md`, but not implemented in TSX. Unlocks the inspector (C), the design linter (F), and gives humans a one-glance view in DevTools of what's design-system vs. custom.

**Convention (additive; non-breaking):**

| Attribute | Values | Where |
|---|---|---|
| `data-ds-component` | `BetCard` / `StatusChip` / etc. (PascalCase) | Outer element of every Tier 1 & 2 TSX in `packages/design-system/src/` |
| `data-ds-tier` | `1` / `2` / `3` | Same element |
| `data-ds-shell` | `IconRail` / `Submenu` / `Rail` / `Canvas` / `Kanban` / etc. | Outer element of Tier 3 in `packages/web/src/shell/` |
| `data-ds-source` | `design-system` / `web-shell` | Helps the inspector and overlay classify quickly |

**Implementation:**

1. Tiny helper `dsProps(name, tier)` in `packages/design-system/src/ds-attrs.ts` returning a typed prop object — keeps every component a one-liner spread.
2. Spread on outer element of each component: `<div {...dsProps("BetCard", 2)} className="...">`.
3. Add the same attrs to corresponding HTML files in `packages/design-system/html/*.html` for parity (already required by the design-system rule but not consistently applied).
4. New Vitest test in `packages/design-system/src/__tests__/ds-attrs.test.ts` rendering every component and asserting the attribute is present.
5. ESLint rule (lives in the new plugin from Workstream F) that fails when a file in `packages/design-system/src/*.tsx` exports a JSX-returning function whose outermost element lacks `data-ds-component`.

**Gotcha:** Pixel-perfect visual parity is preserved (attributes don't affect layout). The 5% threshold in `visual-regression.test.ts` is unaffected.

---

### Workstream B — Theme persistence (Settings panel stays the only control)

**Why:** Per user's answer, theme stays in Settings → Appearance. The work is plumbing: persist preference, prevent flash on reload, react to OS theme changes.

**Implementation:**

1. **Boot script in `packages/web/index.html`** runs synchronously before React mounts:
   - Reads `localStorage["hyperidle-theme"]` (`"light" | "dark" | "system"`, default `"system"`).
   - Applies `data-theme` to `<html>` immediately to avoid flash-of-wrong-theme.
   - Mirrors the pattern in `packages/design-system/html/themes/_switcher.js`.
2. **`useTheme()` hook** in `packages/web/src/hooks/useTheme.ts`:
   - Reads / writes localStorage.
   - Applies `data-theme` on change.
   - Subscribes to `matchMedia("(prefers-color-scheme: dark)")` — `system` mode follows OS at runtime.
3. **`AppShell.tsx`** delegates to `useTheme()` instead of the inline `useEffect` at lines 229–236. `SettingsPanel.tsx` reads/writes the same hook so the two stay in sync. `DEFAULT_SETTINGS.appearance.theme` is read from `useTheme()` rather than hardcoded.
4. **Playwright test** in `packages/web/tests/theme-toggle.spec.ts`:
   - Default = system → resolves to OS preference.
   - Set to `dark` in Settings → reload → still dark.
   - Set to `system` → emulate OS color-scheme change → app re-renders.

**Lore comment on `index.html`:** explain the boot script is there to prevent FOIT.

**Out of scope this round:** quick-toggle button in IconRail. Server-side persistence (J3/J8 still deferred).

---

### Workstream C — DS-vs-custom CLI inspector

**Why:** User wants to see, for a page, what's reusing the design system vs. what's reinventing styles, **from a code perspective** (not runtime). One tool: `bun run ds:inspect <page-path>`.

**`packages/design-system/scripts/inspect-page.ts`:**

Uses the TypeScript Compiler API (already a transitive dep — no new dependency) to:

1. Parse the entry file and walk transitive imports limited to `packages/web/src/**` + `packages/design-system/src/**`.
2. Collect every JSX element used. Bucket each into:
   - **design-system** — import from `@hyperidle/design-system`.
   - **web-shell** — import from `packages/web/src/shell/`.
   - **daisyui-primitive** — `<button className="btn ...">`, `<div className="modal ...">`, etc., recognized by their daisyUI class root.
   - **custom-component** — local React component import.
   - **inline-styled** — raw HTML element (`<div>`, `<span>`) carrying significant Tailwind classes (heuristic: ≥ 3 layout/spacing classes).
3. Emit a report, e.g.:
   ```
   WorkPortfolio.tsx
   ─────────────────────────────────────
   Design-system reuse: 8/19 elements (42%)

   ✓ design-system    EmptyState, KeyValue, SkeletonCard, StatusChip
   ✓ web-shell        IconRail, Submenu, Rail
   ⚠ daisyui          btn (×4), modal (×1)
   ✗ custom           PortfolioGridItem  (packages/web/src/components/PortfolioGridItem.tsx:1)
                       reuse candidate: BetCard
   ✗ inline-styled    <div className="flex p-3 border ..."> at WorkPortfolio.tsx:42
                       reuse candidate: KeyValue or new Tier 2 primitive
   ```
4. Heuristic for **reuse candidates**: pattern-match the Tailwind class signature on each `inline-styled` element against a small fingerprint table of known DS primitives (e.g., `inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-full uppercase` ⇒ likely a `StatusChip`). The fingerprints live alongside `inspect-page.ts` and are updated as new primitives are added.
5. Optional `--format=json` flag for piping into other tools.
6. Wire as `package.json#scripts.ds:inspect`.

**Validation:** Snapshot test in `packages/design-system/__tests__/inspect-page.test.ts` running against a known page and asserting the report shape.

---

### Workstream D — Aesthetic research

**Why:** User wants research-backed principles, not opinions. Findings feed into the long-form write-up (E1) and the linter rules (F).

**Research scope (4 parallel agents):**

| Agent | Focus | Sources to consult |
|---|---|---|
| 1 | Spacing, grid, density | Refactoring UI book, Linear engineering blog, Material Design 3 spec, Stripe design posts, Vercel Geist docs |
| 2 | Typography systems | Practical Typography (Butterick), Vercel Geist, IBM Carbon type, modular scale literature, Inter font docs |
| 3 | Color & dark mode | Stripe color, Linear's "warm grays" essay, Apple HIG dark mode, Material 3 dynamic color |
| 4 | "AI aesthetic" pitfalls | Recent (2024–2026) writing on LLM-generated UI tells, Vercel v0 critiques, design-Twitter discourse |

Each agent saves a structured markdown report under `packages/design-system/research/<topic>.md`:
- 3–7 concrete, falsifiable rules ("body line-height 1.5–1.65 for 14px+; tighter for headings").
- Each rule with source citation.
- Each rule labeled `lintable: yes / no / partial` with a hint at the regex/AST check (feeds F).

Cross-source agreement gate: only rules backed by ≥ 3 reputable sources go into the principles. Per CLAUDE.md, never trust a single source — the web is full of opinion.

---

### Workstream E — Codified principles, rules, and skill update

**Three deliverables (per user instruction):**

**E1 — Long-form write-up** (lives in the design system):
- New file: `packages/design-system/AESTHETICS.md` (or extend `PRINCIPLES.md` if the section count is small enough — I'll prefer extending if < 200 lines of additions, else split).
- Structure: each topic (spacing, type, color, motion, finishing) gets a section with the research-backed rules, examples, anti-examples, and a "lint coverage" footnote pointing to the design-lint rule that enforces it (or noting that it's manual-only).
- Cited sources at the bottom.

**E2 — Short Claude rule:**
- New: `.claude/rules/aesthetic-quality.md` — terse, prescriptive, < 60 lines.
  - Required reading: `AESTHETICS.md` + `PRINCIPLES.md` + `DESIGN.md`.
  - Trigger: agent touches anything under `packages/web/src/` or `packages/design-system/src/`.
  - Hard rules with `→` remediation pointers (mirror `frontend.md` style).

**E3 — Updated `/design-critique` skill:**
- Add a 9th scoring dimension "Premium polish" tied to the AESTHETICS.md checklist.
- Update the Tailwind anti-pattern list with research-backed additions.
- Add references to new docs in the "Required Reading" block.
- Add `/design-lint` to `.claude/rules/skill-discovery.md` flowchart.

---

### Workstream F — Design linter (ESLint plugin + script + skill + rule)

**Why:** Principles without enforcement decay. Per the user, package as a proper plugin so violations surface inline.

**F1 — `packages/eslint-plugin-design/` (new workspace package)**

New ESLint plugin with rules (each authored in TypeScript, tested with `RuleTester`):

| Rule | What it flags |
|---|---|
| `design/no-hardcoded-color` | Hex/rgb/hsl literals in `*.tsx` outside an allowlist (the token files). |
| `design/no-off-grid-spacing` | `(p\|gap\|m)-\[Npx\]` where `N % 4 !== 0` (with allowlist for known sub-grid values like 2px, 6px on chips). |
| `design/no-off-scale-radius` | `rounded-\[Npx\]` where `N` ∉ {0, 4, 8, 12, 9999}. |
| `design/no-off-scale-font-size` | `text-\[Npx\]` where `N` ∉ {11, 12, 13, 14, 18, 24}. |
| `design/no-ai-aesthetic` | Class match: `rounded-2xl\|rounded-3xl\|p-8\|p-10\|p-12\|bg-gradient-\|backdrop-blur-`. |
| `design/no-raw-tailwind-color` | `text-(gray\|slate\|zinc\|stone)-\d+`, `bg-(gray\|slate)-\d+`, `border-(white\|black)/\d+`. |
| `design/require-ds-attribute` | Any default-exported function in `packages/design-system/src/*.tsx` whose outermost JSX element lacks `data-ds-component`. |
| `design/require-stories-sibling` | Component file under `packages/design-system/src/` or `packages/web/src/components/` without a `.stories.tsx` sibling. |
| `design/require-focus-on-interactive` | `<div onClick={...}>` / `<span onClick={...}>` without `tabIndex`, `role`, or focus-visible class. |

Wired into `eslint.config.js` targeting `packages/web/src/**/*.tsx` and `packages/design-system/src/**/*.tsx`. Each rule has its own docs page under `packages/eslint-plugin-design/docs/rules/<rule>.md` (links to the corresponding section in `AESTHETICS.md`).

**Why ESLint over Biome plugin:** Biome's plugin authoring is GritQL-based and immature; ESLint is mature, has a robust testing harness, and the repo already runs ESLint for things Biome can't cover (React Compiler, drizzle). Pure-syntactic rules (basic regex) could move to Biome later if/when its plugin model matures.

**F2 — Higher-level skill: `.claude/skills/design-lint/SKILL.md`**

Skill that:
- Runs the ESLint plugin (via `bun run lint:design`).
- Adds higher-level checks the AST can't easily do:
  - Cross-component consistency ("same role, same treatment" — e.g., section headers all use the same class signature).
  - Hierarchy clarity (does the visual weight match information importance?).
  - Missing empty/error states for data-driven views.
- Output mirrors slop-scan format: `LEVEL  file:line  message  → fix`.

**F3 — `lint:design` script in root `package.json`**

`eslint --no-eslintrc --config eslint.config.js packages/**/*.{tsx,ts}` — reuses the plugin already wired into the main config but emits only the `design/*` rules. Added to root `lint` script. Non-blocking initially (warnings); promoted to errors after the codebase is clean.

---

### Workstream G — Density & typography refresh (tokens + component pixel sweep)

**Why:** User's "crammed" intuition is correct. Per the user's answer, change tokens AND hardcoded pixel values.

**G1 — Audit (read-only, runs first)**

Inventory script (or design-critique skill against `all`) tabulates:
- Every spacing class in `packages/web/src/**` and `packages/design-system/src/**` with frequency.
- Every text size with frequency.
- Every border / radius value.
- Compares against the type scale and 4px grid; flags off-scale.

Output: `packages/design-system/research/spacing-audit.md` with the 10 worst offenders and proposed fixes. Confirms hypothesis with data before changing values.

**G2 — Token refresh**

Adjustments (subject to research from D):

| Token (default density) | Current | Proposed | Rationale |
|---|---|---|---|
| `--density-pad-y` | 8px | 10px | More vertical breathing room in rows |
| `--density-pad-x` | 12px | 14px | Subtle horizontal breathing room |
| `--density-gap` | 8px | 10px | Aligns with audit |
| `--density-row-h` | 32px | 36px | Touch-friendly, less crammed |
| `--density-text` | 14px | 14px (keep) but `line-height` becomes 1.5 (currently 1.45 in DESIGN.md) | Body legibility |
| New: `--text-page-title` | — | 18px / 600 / 1.3 | Page-level titles get their own size |

Compact and comfortable presets shifted proportionally so the 3-tier ladder remains coherent.

**G3 — Component pixel sweep (HTML + TSX in lockstep)**

Per-component changes, one PR each (per `.claude/rules/visual-parity.md`, HTML and TSX must move together — this is a coordinated design refresh, not parity-fixing):

- `BetCard`: `p-[8px] gap-[4px]` → `p-[12px] gap-[8px]`
- `TaskCard`: same pattern
- `PitchCard`: same
- `KnowledgeRow`, `NotificationRow`, `ThreadRow`: bump row height to 36; gap 4px → 6px between icon-text pairs only where hierarchy is suffering (audit dictates).
- `Submenu` and `Rail` items in `packages/web/src/shell/`: `gap-1` → `gap-2`.
- **Leave alone:** intentionally tight gaps inside chips/badges (e.g., StatusChip's 6px between dot and text). Audit calls these out explicitly.

**G4 — Re-baseline + score**

After G2 and G3:
1. Visual regression will fail. Run `bun run ds:sync` to regenerate baseline screenshots.
2. Run `/design-critique` against each refreshed component; require ≥ 8/10 before committing the new baseline.
3. Run `bun run lint:design` — must be clean on the touched files.
4. Manual: open each main route in `bun dev`, take a screenshot, eyeball-compare to the pre-refresh screenshots saved in step G1.

---

## Sequencing

```
A (data-attrs)    ─┬─→  C (CLI inspector)  ─┐
                   ├─→  F (linter / skill / rule) ─→ G3/G4 (sweep + re-baseline)
D (research) ─────┴─→  E (long-form + rule + skill) ─→ F
                                                       ↑
                              E informs F's rule set ──┘
B (theme persistence) — independent

G1 (audit) → G2 (tokens) → G3 (sweep)
```

**Suggested execution order:**
1. **A** (small, high-leverage, unblocks others)
2. **B**, **D** in parallel (B is small UI plumbing; D is read-only research)
3. **E** (after D), **C** (after A)
4. **F** (after E — rules need to exist before lint encodes them)
5. **G1** → **G2** → **G3** → **G4** (last; re-baseline is the closing act)

---

## Verification

End-to-end proof, per workstream:

| Workstream | Validation |
|---|---|
| A | Vitest: every DS component renders `data-ds-component`. Manual: DevTools on `/work/portfolio` shows the attribute on every BetCard. |
| B | Playwright: set theme in Settings → reload preserves it. Emulate OS color-scheme change while in `system` mode → app re-renders. Visual screenshots of both themes. |
| C | `bun run ds:inspect packages/web/src/pages/WorkPortfolio.tsx` prints expected breakdown. Snapshot test on the report. |
| D | Files in `packages/design-system/research/*.md` exist with citations. Each principle traceable to ≥ 3 sources. |
| E | `AESTHETICS.md` exists; `.claude/rules/aesthetic-quality.md` exists; `/design-critique` SKILL.md links them. |
| F | `bun run lint:design` runs clean on a known-good fixture and flags expected issues on a bad fixture. ESLint surfaces violations inline in the editor. Skill invocation produces a slop-scan-shaped report. |
| G | Side-by-side screenshots (before / after) for each refreshed component; all `/design-critique` scores ≥ 8; visual-regression baseline updated and the 5% threshold passes against the new HTML/TSX pair. |

End-to-end: launch `bun dev`, navigate to each main page, screenshot, run `/design-critique`, confirm score ≥ 8 each. Then `bun run check && bun run lint && bun run test` — all green.

---

## Out of scope (explicitly)

- Quick-toggle theme button in IconRail (per user's answer — Settings panel stays the only control).
- Runtime DOM-walking inspector overlay (per user's answer — CLI report is the only inspector).
- Server-side persistence of user theme/density preferences (J3/J8 deferred).
- Adding new design-system components — this plan tightens what exists; new primitives go through their own work-package.
- Internationalization spacing adjustments (CJK, RTL).
- Mobile/responsive redesign — current breakpoint logic stays.
