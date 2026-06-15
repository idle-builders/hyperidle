# AJ1 REDO — Visual-Regression Options Dossier (web-researched)

**Author:** architect (AJ1 redo) · **Date:** 2026-06-15 · **Status:** options for founder decision — nothing implemented, nothing locked.

This dossier exists because the previous AJ1 net (Playwright `toHaveScreenshot` diffing live TSX renders against committed Linux golden PNGs, wired into `npm run verify`) was reverted off main (PR #287 → reverted by #298). It broke a core invariant: **`verify` must run locally on macOS with no Docker.** Linux-canonical golden PNGs make `verify` permanently red on macOS via sub-pixel AA rounding, which dragged Docker in as a crutch. The founder's verdict: **the screenshot paradigm itself is wrong here.**

---

## 1. Problem statement & hard constraints

**The migration that is KEPT (good):** TSX components are now the single design source of truth (the ~49 HTML reference files are gone). This dossier is *only* about what — if anything — replaces the screenshot net.

**What the net is supposed to protect (original AC2 intent):**
> "A change that alters a component's rendered appearance is caught, naming the component."

**HARD CONSTRAINTS (founder, non-negotiable — any option violating ANY of these is auto-disqualified):**

| # | Constraint |
|---|---|
| H1 | **NO** Playwright, screenshots, golden/baseline PNGs, pixel-diff, or Docker. Any approach using these is already a fail. |
| H2 | `npm run verify` MUST pass locally on macOS with zero Docker, zero external services. |
| H3 | MUST be efficient: ideally inside the existing vitest suite, sub-second-ish per component, low-maintenance, deterministic, cross-platform-stable, git-friendly (text diffs, not binary blobs). |
| H4 | Prefer text-based mechanisms (serialize rendered DOM + resolved token/className values, snapshot/diff as text). |

**Reframe in a non-screenshot world — what a text net CAN and CANNOT catch:**

- **CAN catch (deterministically, cheaply):** changed/removed/added DOM elements; changed `className` composition; changed applied design-token references (since this codebase writes tokens *literally* into `className`, e.g. `bg-[var(--accent-primary)]`); changed inline styles; changed `data-*` markers; changed ARIA/role/name structure; changed variant→class mappings. This is the **vast majority of real "did this restyle change?" events** — every intended Tailwind/token edit moves text here.
- **CANNOT catch:** genuine pixel-level rendering regressions that do **not** change DOM/class/inline-style text — e.g. a Tailwind config change that re-resolves what `--accent-primary` paints, a browser font-rendering shift, a CSS cascade/specificity bug between two stylesheets, real layout geometry (jsdom does not lay out or compute the cascade). A screenshot would catch these; a text net will not. **Be honest: this is the trade.** In practice this codebase's tokens are the single paint authority and are themselves guarded by token tests, which shrinks the blind spot substantially (see §3).

---

## 2. Codebase reality (so the options are concrete)

Findings from inspecting the worktree:

1. **Reverted screenshot net** lives at `packages/design-system/src/__tests__/visual-regression.test.ts` (Playwright, port 8098 viewer, `toHaveScreenshot` ≤5%, Linux golden PNGs in `__screenshots__/`). It is excluded from vitest (`vitest.config.ts` excludes `**/visual-regression*`) and runs via `npm run ds:sync` → `playwright test`. **This is exactly what H1 disqualifies.**
2. **The vitest component net already exists and already does ~80% of a text net's job.** 27 `*.test.tsx` files render real React via `createRoot` in jsdom and assert on the DOM — e.g. `W2-primitives.test.tsx` asserts every primitive emits `data-ds-component`, `data-ds-source`, and renders per-variant. `ds-attrs.test.ts` guards the marker contract. `AI6-tokens.test.tsx` guards tokens. A text-snapshot net would live **right here**, same files, same render path, sub-second.
3. **Stories are discoverable in-process** via `discoverStories(...globs)` (`viewer/discovery.ts`), returning `{ title, tier, uses, variants: [{ name, render }] }`. `import.meta.glob` is Vite-only — but **vitest runs on Vite**, so a `*.snapshot.test.tsx` *can* call `import.meta.glob('../**/*.stories.tsx')` and enumerate every story's variants exactly like the viewer does. (This is why the *Playwright* version couldn't use it — Playwright is plain Node. Vitest can.) ⚠️ UNVERIFIED that the existing glob roots resolve cleanly from a test file; needs a spike, but the mechanism is standard Vite.
4. **Tokens are written literally into `className`.** Example, `Button.tsx`: `bg-[var(--accent-primary)] ... text-[12px] py-[7px] px-[18px]`. The design intent (token + spacing + radius) is **plain text in the DOM `class` attribute** — no Tailwind compilation needed to read it. This is the single most important fact in this dossier: **a className/DOM text snapshot captures resolved design intent without needing a browser or the Tailwind cascade.**
5. **jsdom does NOT help with computed styles.** Confirmed against jsdom issues #3318 (ignores specificity), #2485 (ignores `!important`), #2986 (stale after style change): jsdom's `getComputedStyle` does **not** apply external/`<style>` cascade and does no layout. So **computed-style snapshotting is a trap** — it would return Tailwind classes *un-resolved* and be both useless and misleading. The robust signal is the **className string + inline style + DOM structure**, not `getComputedStyle`.

---

## 3. Options

Each: what it is · precedent + sources · efficiency · catches/misses · maintenance · H-compliance · vitest fit · verdict.

### Option A — DOM + className + token serialized snapshot in vitest (`toMatchSnapshot` with a custom serializer)

**What it is.** A new `*.snapshot.test.tsx` enumerates every story variant (via `import.meta.glob` like the viewer), renders each in jsdom (`createRoot`, the exact path `W2-primitives.test.tsx` already uses), serializes the rendered subtree to **normalized text** — tag tree + `data-ds-*` markers + the `class` attribute (optionally sorted/diff-friendly) + inline `style` + role/aria — and asserts `toMatchSnapshot()`. Snapshots are `.snap` text files committed to git. A restyle (token swap, spacing change, variant rewiring, element added/removed) changes the snapshot text and **fails naming the component+variant**; intended changes are re-blessed with `vitest -u` and the diff is reviewed as plain text in the PR.

**Precedent + sources.** Vitest's first-class snapshot feature compares **text representations, not images**, stored as `.snap` text files in git, with `expect.addSnapshotSerializer()` / `snapshotSerializers` for custom output ([Vitest snapshot guide](https://vitest.dev/guide/snapshot)). DOM-tree/HTML snapshot testing as a deliberate non-pixel alternative is an established pattern ([heyayush DOM-tree snapshot deep dive](https://heyayush.com/post/2024-10-11_dom-tree-testing-deep-dive-into-snapshot-testing-with-jest-or-vitest); [Storybook docs: "snapshot tests take DOM/HTML snapshots and compare against DOM/HTML baselines"](https://storybook.js.org/docs/writing-tests/snapshot-testing)). `@testing-library`'s `asFragment()`/`prettyDOM` is the standard React DOM serializer feeding this.

**Efficiency.** Runs inside `npm run test` (vitest), jsdom render is sub-millisecond per variant; whole catalog (56 stories) well under a few seconds. Text `.snap` diffs are tiny. No browser, no server, no port 8098.

**Catches.** Element add/remove/reorder; `className` change (→ token, spacing, radius, variant class changes — the bulk of real restyles since tokens are literal in class); inline-style change; marker (`data-ds-*`) regressions; role/aria structure. Names the failing component+variant exactly (snapshot key).

**Misses.** Pure-paint regressions with no DOM/class/style-text change (token *value* re-mapping, font rendering, cascade/specificity bugs across stylesheets, real layout geometry). Token-value re-mapping is separately covered by token tests (`AI6-tokens.test.tsx`) + the `token-guard:check` in `verify`.

**Maintenance.** Medium-low. Snapshot churn on every *intended* class edit (re-bless with `-u`) — but text diffs are reviewable, unlike a binary PNG re-bless. The serializer must **normalize** non-determinism (sort class tokens, strip volatile ids/`react-aria` random ids, freeze dates) or it flakes — this is the main build cost and a known snapshot pitfall ("obsolete/over-broad snapshots become noise"). Scoping the snapshot to *structure + class + markers* (not full text content) keeps churn proportional to real design change.

**H-compliance.** H1 ✅ (no playwright/png/docker) · H2 ✅ (pure vitest/jsdom, macOS-clean, deterministic cross-platform — no AA, no fonts) · H3 ✅ (in vitest, sub-second, git text diffs) · H4 ✅ (text-based by construction). vitest fit ✅ (same render path as 27 existing tests).

**Verdict: CANDIDATE (strongest).**

---

### Option B — ARIA / accessibility-tree snapshot (`toMatchAriaSnapshot`)

**What it is.** Render each story, assert `toMatchAriaSnapshot()` — a YAML-ish text capture of the accessibility tree (roles + accessible names + structure). Catches semantic/structure regressions (a button became a div, a label vanished, heading levels changed).

**Precedent + sources.** Marketed explicitly as "a semantic alternative to visual regression testing that asserts structure and meaning rather than pixels" ([Vitest 4 / InfoQ](https://www.infoq.com/news/2025/12/vitest-4-browser-mode/); [Vitest ARIA snapshots](https://main.vitest.dev/guide/browser/aria-snapshots); [Playwright aria-snapshots](https://playwright.dev/docs/aria-snapshots)). Usable against plain DOM elements in jsdom; the stability/polling extras are browser-mode-only and not needed for static stories ([search synthesis, Vitest issue #9947](https://github.com/vitest-dev/vitest/issues/9947)).

**Efficiency.** Same as A — in-vitest, sub-second, YAML text in git.

**Catches.** Semantic structure + accessible naming regressions. **Misses.** Everything visual — it deliberately ignores `className`, tokens, spacing, color. A pure restyle (swap `--accent-primary` class, change padding) does **not** change the ARIA tree → **not caught.** That is the opposite of what AC2 wants.

**Maintenance.** Low (stable, terse). **H-compliance:** all ✅. **vitest fit** ✅.

**Verdict: CANDIDATE — but as an a11y net, not a visual-regression net.** It catches almost none of AC2's "appearance changed" intent. **Recommend as a complement to A (cheap, orthogonal), never as the visual net itself.**

---

### Option C — Resolved computed-style snapshot in jsdom (`getComputedStyle`)

**What it is.** Render, walk the tree, snapshot `getComputedStyle(el)` for a chosen property set (color, padding, font-size…).

**Why it fails — sources.** jsdom's `getComputedStyle` does **not** apply the Tailwind/`<style>` cascade and does no layout: it ignores specificity ([jsdom #3318](https://github.com/jsdom/jsdom/issues/3318)), ignores `!important` ([#2485](https://github.com/jsdom/jsdom/issues/2485)), goes stale after style changes ([#2986](https://github.com/jsdom/jsdom/issues/2986)); layout values are only "computed" on access and are not real ([MDN getComputedStyle](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)). Against Tailwind-arbitrary classes it would return **un-resolved / empty** values — useless *and* dangerously false-green. Resolving it for real requires a browser → H1 violation.

**Verdict: REJECTED.** Either useless (jsdom — won't resolve Tailwind) or disqualified (real browser → screenshots/H1). Option A captures the *same intent* (the class that *would* resolve) without the resolution step.

---

### Option D — Screenshot-based tools (Chromatic / Percy / Argos / Lost Pixel / reg-suit / jest-image-snapshot / Playwright `toHaveScreenshot` / Vitest 4 `toMatchScreenshot` & browser-mode visual)

**What they are / why listed.** The dominant "visual regression" category. **Every one of these is screenshot/pixel-diff based** — capture → pixel-compare against baseline images → diff overlay ([Lost Pixel](https://github.com/lost-pixel/lost-pixel) bills itself "open-source alternative to Percy, Chromatic, Applitools"; [Chromatic](https://www.chromatic.com/docs/snapshots/) "captures the actual pixels"; [Bug0 tools guide](https://bug0.com/knowledge-base/visual-regression-testing-tools); [Storybook+Chromatic](https://bug0.com/knowledge-base/storybook-visual-regression-testing-chromatic)). Vitest 4's *visual* feature is also `toMatchScreenshot` (browser-mode, real images) ([Vitest 4 / InfoQ](https://www.infoq.com/news/2025/12/vitest-4-browser-mode/); [Vitest visual-regression docs](https://main.vitest.dev/guide/browser/visual-regression-testing)). Storybook's *DOM* snapshot mode is non-pixel — but that is Option A's pattern, not this row.

**Why rejected.** All require either committed baseline images (binary blobs, cross-platform AA drift, the exact macOS-vs-Linux problem that sank #287) **or** a SaaS/external service. Direct H1 + H2 violations. Cloud ones (Chromatic/Percy/Argos) also add H2's "zero external services" violation.

**Verdict: REJECTED — auto-disqualified by H1 (and several by H2).** This is the paradigm the founder already vetoed; listed only for completeness.

---

### Option E — Class/structure assertion tests (explicit, no snapshot files)

**What it is.** Hand-written `*.test.tsx` that render and assert specific contracts (`expect(btn.className).toContain('bg-[var(--accent-primary)]')`, marker present, element count). This is what the codebase *already does* in `W2-primitives.test.tsx`, `ds-attrs.test.ts`, `AI6-tokens.test.tsx` — just broadened per component.

**Precedent.** Standard `@testing-library` assertion testing; no novel tooling.

**Efficiency.** In-vitest, sub-second. **Catches.** Exactly the contracts you write — high signal, **zero churn** (no `-u` re-bless), explicit intent. **Misses.** Anything you didn't think to assert (no auto-coverage of new variants/regressions you didn't anticipate). The inverse trade vs A: A auto-covers everything but churns; E covers only what's written but never false-fires.

**Maintenance.** Higher up-front (write assertions per component), near-zero ongoing. No snapshot-rot. **H-compliance:** all ✅. **vitest fit** ✅ (already the house style).

**Verdict: CANDIDATE.** Lower coverage breadth than A, but the most honest/stable. Best as the *floor* that A's auto-coverage sits on top of — or as the whole net if the team wants zero snapshot churn.

---

## 4. Serious evaluation — "rip out visual regression entirely"

This is a real option, not a strawman. The screenshot net is **already reverted**; doing nothing is the current state of main.

**What already protects appearance without any dedicated visual net:**

| Existing net | Covers |
|---|---|
| 27 `*.test.tsx` component tests (jsdom render + DOM/marker/variant assertions) | element presence, variant rendering, `data-ds-*` markers, per-component structure |
| `AI6-tokens.test.tsx` + `npm run token-guard:check` (in `verify`) | token definitions don't silently change/disappear — closes Option A's biggest blind spot (token-value re-mapping) |
| `ds-attrs.test.ts` | the marker contract |
| `eslint-plugin-design` (AQ-001…AQ-019, AQ-101…) via `npm run lint` | off-grid spacing, off-scale type/radius/motion, hardcoded/cool colors, AI-aesthetic tells — **statically, before render**. A large class of "bad restyle" is caught here, not by pixels. |
| TypeScript strict (`npm run check`) | prop/variant API shape; a removed variant is a type error |
| `.stories.tsx` catalog contract (`design-source-guard:check`, viewer) | every component has a story; humans eyeball the live viewer at `:8098` |

**Real risk if removed:** a change that alters a component's rendered class/structure in a way that (a) is *not* an off-grid/off-scale lint violation, (b) doesn't break a typed API, and (c) isn't asserted by an existing component test — would land silently until a human looks at the viewer. That window is real but **narrow**, and the live viewer + design-critique gate (`/design`, `/visual-polish`) are the human backstop the project already relies on.

**When removal is the right call:** if no text option clears *both* the high-quality bar (catches the AC2 class of changes meaningfully) *and* the efficiency/low-maintenance bar (doesn't become snapshot-rot that agents blindly `-u` through — which **defeats the entire purpose**, MEMORY: "tests must not drive behavior"; a net everyone re-blesses without reading is worse than no net). Given the founder already killed the screenshot net, the bar for the replacement is high: it must earn its maintenance cost.

---

## 5. Recommendation

**Primary recommendation: Option A (DOM + className + token text snapshot in vitest) as the visual net, with Option E's explicit assertions as the stable floor, and Option B (ARIA) as a cheap orthogonal complement.** All three live in `packages/design-system/src/__tests__/*.test.tsx`, run in `npm run test`, are sub-second, deterministic on macOS, Docker-free, and git-text-diffable — clearing H1–H4 cleanly.

**Why A beats the others:** it's the only candidate that auto-covers the *whole catalog* and *names the component+variant* on a real restyle (AC2's literal intent), and in this codebase it captures **resolved design intent as text** because tokens/spacing/radius are written literally into `className` — no browser, no cascade, no AA. C is rejected (jsdom can't resolve; browser violates H1). D is the vetoed paradigm. B alone misses all pure visual change; E alone misses unanticipated regressions.

**The one honest trade the founder must decide — A's blind spot vs A's churn:**

> Option A catches ~the entire class of *intended-style-change detection* deterministically and cheaply, but it **cannot** catch a pure-paint regression that leaves DOM/class/style text unchanged (token re-mapping, font/cascade/layout). Token re-mapping is separately guarded by token tests; the residual (font/cascade/layout) is exactly what only a screenshot would catch — and screenshots are vetoed. **So the decision is: accept that residual blind spot (covered by the live viewer + human design-critique), in exchange for a net that runs in the existing vitest suite with zero Docker.** The secondary cost is snapshot churn: every intended class edit needs a reviewed `vitest -u` re-bless. If the team won't *read* those diffs, A degrades to noise — in which case drop A and ship **E only** (explicit assertions, zero churn, narrower coverage).

**Decision the founder makes from this dossier:**
1. **A + E + B** — broadest coverage, accepts snapshot churn (recommended if PRs will review `.snap` diffs).
2. **E + B only** — zero snapshot churn, narrower coverage, no re-bless ritual (recommended if churn discipline is a concern).
3. **Remove entirely** — rely on existing component tests + lint + types + token-guard + live-viewer/human critique (defensible given they already cover most of it; lowest maintenance, widest silent-regression window).

I recommend **#1**, falling back to **#2** if the team is unwilling to review snapshot diffs. I do **not** recommend full removal (#3) — the marginal cost of E+B over the existing nets is low and it closes the "unanticipated structural restyle" gap that lint+types miss.

**Open spike before locking (⚠️ UNVERIFIED):** confirm `import.meta.glob('../**/*.stories.tsx')` resolves the same story set from a vitest test file as the viewer sees, and that `react-aria`/random-id non-determinism can be normalized by the serializer. Both are standard, but unproven in this repo — a half-day spike de-risks Option A before any commitment.

---

## Sources

- [Vitest — Snapshot guide](https://vitest.dev/guide/snapshot) — text snapshots, `.snap` git files, custom serializers (primary).
- [Vitest — ARIA snapshots](https://main.vitest.dev/guide/browser/aria-snapshots) · [Vitest issue #9947](https://github.com/vitest-dev/vitest/issues/9947) · [Playwright aria-snapshots](https://playwright.dev/docs/aria-snapshots).
- [Vitest 4 / InfoQ](https://www.infoq.com/news/2025/12/vitest-4-browser-mode/) — browser mode + `toMatchScreenshot` (image-based) + ARIA as semantic alternative.
- [Vitest — Visual regression (browser, screenshot-based)](https://main.vitest.dev/guide/browser/visual-regression-testing).
- [Storybook — Snapshot tests](https://storybook.js.org/docs/writing-tests/snapshot-testing) — DOM/HTML snapshots vs image baselines (the key non-pixel distinction).
- [DOM-tree snapshot deep dive (heyayush)](https://heyayush.com/post/2024-10-11_dom-tree-testing-deep-dive-into-snapshot-testing-with-jest-or-vitest).
- [Lost Pixel (GitHub)](https://github.com/lost-pixel/lost-pixel) · [Chromatic snapshots](https://www.chromatic.com/docs/snapshots/) · [Bug0 — VRT tools 2026](https://bug0.com/knowledge-base/visual-regression-testing-tools) · [Storybook+Chromatic VRT](https://bug0.com/knowledge-base/storybook-visual-regression-testing-chromatic) — confirm Chromatic/Percy/Argos/Lost Pixel/reg-suit/jest-image-snapshot are screenshot-based (rejected).
- jsdom getComputedStyle limitations: [#3318 specificity](https://github.com/jsdom/jsdom/issues/3318) · [#2485 !important](https://github.com/jsdom/jsdom/issues/2485) · [#2986 stale](https://github.com/jsdom/jsdom/issues/2986) · [MDN getComputedStyle](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle).

**Source-vetting note (per repo policy):** primary docs (Vitest/Playwright/Storybook/MDN/jsdom-issues) are load-bearing here; the marketing/comparison pages (Bug0, Lost Pixel blog, Medium) are used only to *classify tools as screenshot-based*, a claim cross-checked against each tool's own primary docs. The "AI diffing is the future" marketing framing is ignored — irrelevant to a text-net decision and unverified.
