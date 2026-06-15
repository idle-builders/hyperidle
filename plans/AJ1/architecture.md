# AJ1 — TSX is the single design source of truth — Architecture

**Workpackage:** AJ1 (Track AJ). Complexity L. Depends on: none.
**Phase:** designer production. No `/design` (no UI surface — infra + source-of-truth inversion).

## Concept check (no-op)

AJ1 introduces **no new primitive, domain concept, or load-bearing noun**. It inverts which medium is authoritative (HTML → TSX) and replaces the regression mechanism. "Golden baseline" is a generic testing term, not a HyperIdle domain noun. Concept-locking is a no-op. No `concept-missing`.

---

## Required reading (for the builder)

- `packages/design-system/viewer/main.tsx` — HTML-mode code paths to remove.
- `packages/design-system/viewer/discovery.ts` — story discovery (KEEP, unchanged; remove only the `order` "HTML demo section order" doc-comment).
- `packages/design-system/src/__tests__/visual-regression.test.ts` — the gate to **replace**.
- `packages/design-system/playwright.config.ts`, `playwright.l1.config.ts`, `playwright.workbench.config.ts` — config rationalization. **All three boot the viewer with `webServer.command: "bun run serve"` — bun is NOT installed in CI; the swap to `npm run -w @hyperidle/design-system serve` is mandatory (see "webServer / bun fix").**
- `packages/design-system/tests/workbench.spec.ts`, `tests/visual/L1/thread-components.spec.ts` — specs asserting HTML-mode behavior, to rewrite.
- `packages/design-system/vite.config.ts` — `publicDir: "../html"` to remove.
- `packages/design-system/package.json` + root `package.json` — script changes + verify wiring.
- `.github/workflows/ci.yml` — how the attested test path reaches CI (see "Wiring" below).
- `scripts/verify-attest.ts` — `ATTESTED_COMMAND = "npm run test:all"`; the gate must be reachable from the attested command OR added to verify explicitly.
- `.claude/rules/visual-parity.md` + 5 skill files.

---

## Plan reconciliation (spec ⇆ reality)

Every spec assumption verified against the tree. Disagreements:

| Spec assumption | Reality | Plan handles by |
|---|---|---|
| "~49 HTML reference files in `html/`" | **65 files** under `html/`: 46 `*.html` component refs + `_catalog.html` + `_tokens.css` + 4 L11 `mockup.html` + 14 `screens/*.html` + `themes/` (2 css + `_switcher.js`). | Delete the entire `packages/design-system/html/` tree (65 files). Count is higher than spec's "~49" — spec said "plus L11 subdirs"; screens/ + themes/ are also part of the layer. |
| "Visual regression diffs TSX vs HTML at ≤5%" via `playwright.config.ts` | TRUE — `src/__tests__/visual-regression.test.ts` screenshots `/{Component}.html` vs `/#{Component}` TSX-mode, pixelmatch <5%. 25 components. | Replace with TSX-story-vs-golden-PNG gate (same 25 components). |
| "`visual-compare.ts` / `visual-compare-map.ts` diff TSX renders against HTML references" | **FALSE.** Those scripts diff the **live web app (`:5173`) against `plans/design-synthesis/` React prototypes** — a different, app-level comparison. **`plans/design-synthesis/` does not exist** → these scripts are already dead/broken. They still name HTML-as-reference language. | Delete both scripts + the `visual:compare` web script + remove from 4 skills. Not part of the component-parity gate, but in-scope for AC1/AC5 (skills name `visual:compare`). |
| AC4: "`npm run verify` … no skipped/weakened visual checks" implies verify runs a visual check today | **FALSE — load-bearing.** `npm run verify` runs check/lint/knip/guards/build + attestation. **No Playwright, no `ds:sync`, no visual gate.** CI re-runs fast checks + validates attestation; `verify-attest` runs `npm run test:all` (vitest only — Playwright configs are NOT vitest). **The visual gate is currently orphaned** (`ds:sync` is manual-only). | **The inversion must WIRE the new TSX-baseline gate into `verify` (and therefore CI).** This is the central correctness gap: deleting the old gate and not wiring the new one would *satisfy* AC4 trivially but *violate* AC2 + the "replaced, never deleted" constraint. See "Wiring decision" below. |
| `playwright.l1.config.ts` runs `tests/visual/L1/thread-components.spec.ts` | TRUE — asserts `html/<C>.html` exists via `existsSync` + clicks "TSX" toggle. Both assumptions die in the inversion. | Rewrite spec (drop existsSync + TSX-toggle click) and fold into the single visual config, or delete L1 config and merge components into the main gate's component list. |
| `playwright.workbench.config.ts` asserts HTML/TSX toggle + density toggle | TRUE — `workbench.spec.ts` asserts toggle is hidden for shells; density toggle behavior. | Rewrite: toggle assertions removed (toggle no longer exists); keep catalog/tier/render smoke. Density toggle is **out of scope** (MEMORY: density removal is a separate effort) — leave density assertions as-is unless they break. |
| Viewer "feature-detects HTML availability" | TRUE — `htmlGlobs = import.meta.glob("../html/*.html")`, `HTML_AVAILABLE_TITLES`, `isHtmlAvailable`, `RenderMode`, `HtmlComponentView`, `Toolbar` HTML/TSX pill, `mode` state, force-TSX effect. | Remove all of it (see "Viewer simplification"). |
| `serve.ts` / `serve:static` serves html | TRUE — `scripts/serve.ts` is a static server for `html/`; `serve:static` script points at it. | Delete `serve.ts` + `serve:static` script. (`serve` = `vite` stays — that's the TSX viewer.) |
| `k13-capture.ts` references html | Captures workbench + web-app screenshots into `research/`; one-off K13 artifact tool, hardcoded absolute path to a dead worktree. | Delete (dead one-off; also names HTML workbench). Confirm not referenced by any live script (it is not). |

**Grep false-positives ruled out:** `src/Progress.tsx`, `Button.tsx`, `kinds/html-renderer.tsx` etc. match `\.html` only via `dangerouslySetInnerHTML` / `html-renderer` substrings — production code, not references, **untouched**. `U8-hearth-restyle.test.tsx:247` is a code comment ("BetCard.html mockup uses…") — update the comment text only (AC5-adjacent, low priority), no logic change.

---

## Central decision: the replacement regression mechanism

### Design-it-twice

**Option A — Playwright built-in `toHaveScreenshot()` golden baselines.**
Replace the custom pixelmatch test with `await expect(page).toHaveScreenshot('<Component>-<variant>.png')`. Playwright stores baselines under `<spec>-snapshots/<name>-<project>-<platform>.png`, auto-diffs, and re-blesses with `--update-snapshots`. Threshold via `maxDiffPixelRatio` / `maxDiffPixels` in config.
- *Trade-off:* Baselines are **platform-suffixed** (`-darwin`, `-linux`) — a Mac-captured baseline won't match a Linux CI render unless captured on Linux. Anti-aliasing/font-rendering differs across OS.
- *Reject reason on its own:* Without pinning the capture environment, CI (Linux) fails against Mac-blessed baselines. BUT this is solvable and is the boring, well-understood path.

**Option B — keep the custom pixelmatch harness, swap the "expected" source from HTML page to a committed PNG.**
Keep `visual-regression.test.ts`'s screenshot+pixelmatch code; instead of screenshotting `/{C}.html`, read a committed `baselines/<C>/<section>.png` from disk and diff the live TSX section against it. Bless = run a `--update` flag that overwrites the PNGs.
- *Trade-off:* We own ~150 lines of pixelmatch/crop/report code forever; must hand-roll the bless workflow and platform handling.
- *Reject reason:* Reinvents exactly what `toHaveScreenshot` ships, against ETHOS "Search Before Building" and "boring technology."

**Decision: Option A — Playwright `toHaveScreenshot`**, with the cross-platform problem solved by **committing to CI/Linux as the single canonical baseline platform** (CI is the merge-blocking gate, so it is the source of truth) + a platform-agnostic `snapshotPathTemplate` + 5% ratio so local Mac `verify` tolerates the Linux baselines. The full bless workflow and rationale are in "Canonical capture platform" under the Wiring decision below — do NOT pin to the developer's machine; pin to Linux/CI.

⚠️ **Resolve the platform question concretely (builder must verify against current Playwright docs https://playwright.dev/docs/test-snapshots):**
- Set `snapshotPathTemplate` to a **platform-agnostic** path (drop the `{platform}` token) so one baseline set serves all environments, AND set a tolerant `maxDiffPixelRatio: 0.05` (5%, matching the retired gate's non-negotiable threshold) + `threshold: 0.2` (per-pixel). 5% absorbs cross-platform AA jitter while still catching real visual change (a restyle moves far more than 5%).
- This mirrors how the old gate already tolerated 5% — it is **not** a weakening (AC4): the retired HTML-diff gate used the *same* 5% ceiling (`DIFF_THRESHOLD_PERCENT = 5`).
- Builder MUST verify the chosen `maxDiffPixelRatio` actually catches a deliberate restyle in the red phase (validation scenario 2: "names the component whose baseline drifted").

### Mechanism spec

| Concern | Decision |
|---|---|
| **Tool** | Playwright `expect(locator).toHaveScreenshot(name)` against the live TSX story rendered in the viewer at `:8098`. **The viewer is booted by `webServer` via `npm run -w @hyperidle/design-system serve` — NOT `bun run serve` (see "webServer / bun fix" below; bun is never installed in CI).** |
| **What is screenshotted** | Each `.demo-section` of each component's TSX story (same granularity the old gate used), clipped to component content area. One baseline PNG per `<Component>/<section>`. Reuse the existing `screenshotSections` clip logic to define the locator/region, but assert via `toHaveScreenshot` (or pass the captured buffer through Playwright's snapshot assertion). |
| **Component set (runtime catalog-DOM enumeration — NOT `discoverStories()`)** | The set is **every catalogued component with a story** (AC2 "every catalogued component"): the current 25 in `COMPONENTS` + the 5 L1 components (`ThreadHostBanner`, `CommentRow`, `Composer`, `ThreadShell`, `RichMessageCard`). **Do NOT call `discoverStories()` from the Playwright test.** `discoverStories()` consumes `import.meta.glob` (Vite-only); the Playwright spec runs in Node via `@playwright/test`, outside Vite — the glob returns nothing there, which is exactly why the retired test hardcoded `COMPONENTS`. **Enumerate at runtime by reading the live viewer catalog DOM instead:** in a `beforeAll`, navigate to the catalog (`:8098/#`), then `page.locator("button.component-link .component-name")` → `allTextContents()` to collect every catalogued component name (verified: `viewer/main.tsx:210-217` renders one `button.component-link` per `StoryModule`, with the title in `.component-name`). Then for each name, navigate to `#<Component>` and screenshot each `.demo-section`. This keeps "every catalogued component" automatic (a new story adds a catalog link → the gate picks it up next run) with no hand-maintained array and no Vite import. **Marker note:** the catalog lists both Tier 1/2 components (emit `data-ds-component`) and Tier 3 shells (emit `data-ds-shell`) — the enumeration treats them identically (it reads catalog links, not markers), but the marker-presence assertion below must check **both** selectors (see Marker presence row). |
| **Marker presence (dual selector)** | The TSX-only marker test asserts each opened component exposes its `dsProps()` marker. Tier 1/2 emit `data-ds-component="<name>"`; **Tier 3 shells (e.g. `ThreadShell`) emit `data-ds-shell="<name>"`, NOT `data-ds-component`** (verified `thread-components.spec.ts:46`). Assert presence of `[data-ds-component="<name>"], [data-ds-shell="<name>"]` (either matches) so shells are not false-failed. |
| **Baseline location** | `packages/design-system/src/__tests__/visual-regression.test.ts-snapshots/` (Playwright default, committed to git). **Un-ignore** them: `.gitignore` currently ignores `sync-reports/`/`visual-reports/` (those stay ignored — they were diff *output*, not baselines). Add the snapshots dir to git (it is not currently ignored). |
| **Threshold** | `maxDiffPixelRatio: 0.05`, `threshold: 0.2`. Documented as "same 5% ceiling as the retired HTML gate — not a weakening." |
| **Bless / update workflow** | `npm run -w @hyperidle/design-system test:visual:update` → `playwright test --config playwright.config.ts --update-snapshots`. Document in `visual-parity.md`'s replacement (now `visual-regression.md`): "Intentional visual change → review the diff, then re-bless with `npm run ds:bless`; commit the updated PNGs in the same PR as the component change." Add root alias `ds:bless`. |
| **Capture determinism** | Keep `FREEZE_CSS` (kills animation/caret), fixed `1024×900` viewport, `colorScheme: dark`, `fullyParallel:false`, `workers:1` — all already in `playwright.config.ts`. Wait for fonts ready before capture. |
| **Interactive hover/focus states (RE-CAPTURED, not dropped)** | The retired gate ran ~22 interactive-state pixel diffs (hover + focus) for 11 `INTERACTIVE_COMPONENTS` (verified `visual-regression.test.ts:361-477`). **"Equivalent coverage" is a stated constraint — these are RE-CAPTURED, not dropped.** Port the same 11-component map (keep its `sectionIndex` + selector metadata, but use the **TSX viewer story selector**, dropping the `htmlSelector`/HTML-page half). For each, force the state on the live TSX element — `locator.hover({ force: true })` for hover, `locator.focus()` (or `evaluate(el => el.focus())`) for focus — then assert `toHaveScreenshot('<Component>-<state>.png')`. These hover/focus PNGs are committed baselines alongside the default-state ones. Components where no interactive target is found are skipped explicitly (same as the old gate's `count()===0` skip). |

### webServer / bun fix (CRITICAL — bun is never in CI)

All three Playwright configs boot the viewer with `webServer.command: "bun run serve"` (`playwright.config.ts:15`, `playwright.l1.config.ts:18`, `playwright.workbench.config.ts:24`). **CI (`ci.yml`) runs `ubuntu-latest` with only `setup-node` + `npm ci` — there is no `bun` on the runner.** Left as-is, the webServer dies with `bun: command not found`, the gate never runs, and AC4 ("verify passes with NO skipped visual checks") is silently vacuous in CI — the exact failure this workpackage exists to prevent.

**Fix (chosen): swap the launcher to npm, no new CI toolchain.** Change every `webServer.command` from `"bun run serve"` to `"npm run -w @hyperidle/design-system serve"`. Verified: the `serve` script is `vite --config vite.config.ts` (`packages/design-system/package.json:16`) — vite is the actual runtime; bun was only the launcher. After this swap the gate boots on plain Node + npm (already present in CI) with **zero bun dependency**. This is the cleaner inversion (removes bun as the last non-portable dependency of the gate); rejected the alternative of adding `oven-sh/setup-bun` to CI (adds a toolchain solely to launch vite). Builder applies this swap in all three configs as part of Task 1.

---

## Wiring decision (AC4 — load-bearing)

The new gate is a Playwright suite; `verify-attest` only attests `npm run test:all` (vitest). **Three options:**

- **(W1) Add the visual gate to `verify` as its own step** and to CI as its own job. Most explicit; CI gets a real Playwright run (needs `npx playwright install chromium` in CI).
- **(W2) Fold into the attested test path** — make `test:all` depend on the visual gate. Couples slow Playwright into every `npm run test:all`; rejected (test:all must stay fast per CLAUDE.md test taxonomy).
- **(W3) Add a dedicated `ds:sync` step to `npm run verify`** (between guards and build) + a CI step `npm run ds:sync` after build with `playwright install`.

**Decision: W3.** Add `npm run ds:sync` (re-pointed to the new TSX-baseline config) to the `verify` chain AND a separate CI step. Rationale: keeps Playwright out of `test:all` (preserves fast unit/component runs), makes the visual gate a first-class `verify` citizen, and CI runs it live (not attested — visual baselines are deterministic enough to re-run, unlike the DB-heavy suite). `ds:sync` already exists as the script name → re-point it from the HTML-diff config to the TSX-baseline config; semantics preserved, name reused.

**Two distinct gates — which runs where (no conflation):**

| Gate | Runs locally via | Runs in CI via | Notes |
|---|---|---|---|
| **Visual regression (AC2/AC4)** — `ds:sync` Playwright TSX-baseline suite | the `verify` chain (insert `npm run ds:sync` before `build`) | a **separate, explicit CI step** added to `ci.yml` | **CI does NOT run `npm run verify`** — verified: `ci.yml` lists steps individually (check, lint, knip, mock-inventory, build×2, validate-attestation) and the attested path is `npm run test:all` (vitest only). So the visual gate reaches CI **only** via the new explicit CI step, never via the verify chain. AC4 is satisfied on **two independent paths**: local `verify` (now includes `ds:sync`) AND the CI step. State this plainly in any DoD: "AC4-local = `verify` chain runs `ds:sync`; AC4-CI = the new `Visual regression` CI step." |
| **AC1 design-source guard** — filesystem + string scan (`design-source-guard:check`) | the `verify` chain (alongside `nimmly-guard:check`, `demo-fixture-guard:check`, `token-guard:check`) | **local-only — NOT in CI** | Verified: the existing guards (`nimmly-guard`, `demo-fixture-guard`, `token-guard`) run in `verify` but are **not** wired into CI. The new `design-source-guard` follows that exact pattern — local-only, like its siblings. This is intentional and consistent; the plan does **not** claim CI enforces AC1's guard. (CI does re-run check/lint/knip live, but not the project-specific guards.) |

CI: add to `ci.yml` after "Build (desktop)" (`run: npm run -w @hyperidle/desktop build`, line 61): step `Install Playwright (chromium)` → `npx playwright install --with-deps chromium`, then step `Visual regression (TSX baselines)` → `npm run ds:sync`. ⚠️ Builder verify on the feature branch before merge (MEMORY: test CI before merge) — confirm Linux baselines match (the platform risk; see "Canonical capture platform" below).

### Canonical capture platform — CI/Linux is the blessing authority

Mac-blessed PNGs vs Linux-CI render may exceed 5% AA/font jitter, and a Mac-only baseline would leave CI permanently red (or force someone to weaken the 5% ratio). **Commit to ONE canonical capture platform: CI/Linux is the blessing authority**, because CI is the gate that blocks merge. Baselines are Linux-rendered; local `verify` on a Mac tolerates the 5% ratio against the Linux baselines (and vice-versa). Concrete bless workflow:

1. **Author the visual change** on any platform; run the gate locally to eyeball the diff.
2. **Regenerate canonical (Linux) baselines via CI**, NOT by committing Mac PNGs. The bless command is `npm run ds:bless` (→ `playwright test --config playwright.config.ts --update-snapshots`). To produce **Linux** baselines a contributor runs it inside the same Linux environment CI uses — either (a) trigger the gate on the feature branch, download the CI run's updated-snapshot artifact (the `Visual regression` step uploads `*-snapshots/` as an artifact when invoked with `--update-snapshots`), and commit those PNGs; or (b) run `npm run ds:bless` in a Linux container matching CI (`mcr.microsoft.com/playwright:v<version>` per the `@playwright/test` version, currently `^1.59.1`). Option (a) is preferred (no local Docker needed).
3. **Commit the Linux PNGs in the same PR** as the component change. Never commit Mac-rendered PNGs as canonical, and never raise the 5% ratio to absorb a platform delta.

This removes the Task-12 surprise: the builder blesses on/for Linux from the start, so CI is green by construction and no one is forced to weaken the threshold. (Builder may add a `--update-snapshots` mode to the CI step gated behind a manual `workflow_dispatch` input to make option (a) one click; if that is more than the WP needs, option (b)'s container command is the fallback and must be documented in `visual-regression.md`.)

---

## Viewer simplification (`viewer/main.tsx`)

Remove (HTML-mode code paths):
- `htmlGlobs`, `HTML_AVAILABLE_TITLES`, `isHtmlAvailable` (lines ~96-119).
- `type RenderMode`, `HtmlComponentView` component (lines ~254-310).
- `Toolbar` props `mode`, `onModeChange`, `showModeToggle` + the HTML/TSX `toolbar-pill` block (lines ~335-352).
- In `App`: `mode`/`setMode` state, `htmlAvailable`, `showModeToggle`, `effectiveMode`, the force-TSX `useEffect` (lines ~404-420). The `isComponentPage` branch always renders `<TsxComponentView>`.
- The K12 `@lore` block describing HTML feature-detect (lines ~96-106) — replace with one line noting HTML mode was removed in AJ1.

Keep unchanged: `discoverStories`, `useHashRoute`, `useTheme`, `Catalog`, `CatalogTier`, `TsxComponentView`, `pascalToTitle`, theme/density toolbar pills. **Density toggle stays** (out of AJ1 scope; MEMORY density-removal is a separate effort — do not touch).

`vite.config.ts`: remove `publicDir: "../html"` (nothing left to serve statically).

`discovery.ts`: `StoryMeta.order` jsdoc says "matching the HTML demo section order" — reword to "explicit variant display order." No logic change.

---

## File inventory

### DELETE (67 files + dirs)
- `packages/design-system/html/` — entire tree: **65 files** (46 `*.html` + `_catalog.html` + `_tokens.css` + 4 `L11-*/mockup.html` + 14 `screens/*.html` + `themes/{hearth-dark.css,hearth-light.css,_switcher.js}`).
- `packages/design-system/scripts/serve.ts` (static HTML server).
- `packages/design-system/scripts/k13-capture.ts` (dead one-off; HTML workbench capture).
- `packages/web/scripts/visual-compare.ts` (dead — targets nonexistent `plans/design-synthesis/`; names HTML reference).
- `packages/web/scripts/visual-compare-map.ts` (dead — same).
- `.claude/rules/visual-parity.md` (HTML-as-truth rule) — *or* rewrite (see below; plan = **rewrite to `visual-regression.md`**, delete `visual-parity.md`).
- `packages/design-system/playwright.l1.config.ts` (fold L1 components into main gate) — **conditional**: keep if builder prefers separate L1 run; default = delete + merge.

### MODIFY
- `packages/design-system/src/__tests__/visual-regression.test.ts` — **rewrite**: drop HTML page screenshot + HTML-mode toggle clicks; screenshot live TSX story; assert via `toHaveScreenshot` vs committed baseline. **Marker-presence test: dual selector `[data-ds-component="<name>"], [data-ds-shell="<name>"]`** (Tier 3 shells emit `data-ds-shell`, not `data-ds-component` — `ThreadShell` would false-fail on a single-selector check), TSX viewer only (remove HTML half). **Component list: enumerate at runtime from the catalog DOM** (`beforeAll`: navigate `:8098/#`, `page.locator("button.component-link .component-name").allTextContents()`) — **do NOT call `discoverStories()`** (Vite-only `import.meta.glob`, returns nothing in the Node/Playwright runtime). **Re-capture interactive hover/focus states** (port the 11-component `INTERACTIVE_COMPONENTS` map, TSX-side selectors only, `hover({force:true})`/`focus()`, assert `toHaveScreenshot('<C>-<state>.png')`). Update the file-header `@lore`.
- `packages/design-system/playwright.config.ts` — add `expect.toHaveScreenshot` config (`maxDiffPixelRatio: 0.05`, `threshold: 0.2`), `snapshotPathTemplate` (platform-agnostic, no `{platform}` token). **Change `webServer.command` from `"bun run serve"` → `"npm run -w @hyperidle/design-system serve"` (bun is never in CI).** Keep viewport/workers.
- `packages/design-system/playwright.workbench.config.ts` + `packages/design-system/playwright.l1.config.ts` (if kept) — **same `webServer.command` swap `bun run serve` → `npm run -w @hyperidle/design-system serve`.** (All three configs currently use bun; all must swap so any config bootable in CI uses Node.)
- `packages/design-system/playwright.workbench.config.ts` + `tests/workbench.spec.ts` — remove the "IconRail loads in TSX mode with HTML/TSX toggle hidden" assertions about the toggle (toggle is gone — rewrite to assert component renders in demo grid, no toggle present at all). Keep catalog/tier smoke + density (untouched).
- `packages/design-system/tests/visual/L1/thread-components.spec.ts` — remove `existsSync(html/<C>.html)` tests and the `getByRole("button",{name:"TSX"}).click()`; assert the TSX render + markers directly. (Or delete and merge into main gate.)
- `packages/design-system/viewer/main.tsx` — viewer simplification (above).
- `packages/design-system/viewer/discovery.ts` — jsdoc wording only.
- `packages/design-system/vite.config.ts` — remove `publicDir`.
- `packages/design-system/package.json` — `scripts`: remove `serve:static`; re-point `sync-check`/`test:visual` to the TSX-baseline config (same config file, new test body); add `test:visual:update` (`playwright test --config playwright.config.ts --update-snapshots`).
- `package.json` (root) — `ds:sync` re-pointed (already → `-w design-system sync-check`, stays); add to `verify` chain (insert `npm run ds:sync` before `npm run build`); add `ds:bless` → `-w @hyperidle/design-system test:visual:update`. Remove `visual:compare` is in **web** package — remove `packages/web/package.json` `visual:compare` script.
- `packages/web/package.json` — remove `visual:compare` script.
- `.github/workflows/ci.yml` — add `Install Playwright (chromium)` + `Visual regression (TSX baselines)` steps after Build.
- `.claude/skills/design/SKILL.md` — lines 53,63,154,155,222,226,230,239: `mockup.html`/`html/` reference language. **Scope caution:** AJ3 rewrites `/design` to author TSX variants. AJ1's edit is *minimal*: only remove "HTML-as-design-reference" claims and the `packages/design-system/html/` pattern-match path (line 53,63). Do NOT rewrite the mockup-authoring workflow (that's AJ3). Reword line 53/63 pattern-match to reference live stories/catalog instead of `html/`.
- `.claude/skills/design-critique/SKILL.md` — line 179: `html/themes/` → `src/tokens.css` theme variants. (mockup.html screenshot lines 38,161-163 = AJ3 scope; leave.)
- `.claude/skills/review/SKILL.md` — line 73,175: `npm run visual:compare <reference>` → the new TSX-baseline gate (`npm run ds:sync` / open the story in the viewer). Remove the dead `visual:compare` instruction.
- `.claude/skills/product-deep-review/SKILL.md` — line 60: `npm run visual:compare <reference>` → TSX-baseline / story-open instruction.
- `.claude/skills/visual-polish/SKILL.md` — lines 24-31,77,81-83: `visual:compare` + `visual-compare-map.ts` + `plans/design-synthesis/` reference machinery. Re-point to the TSX viewer story + the new gate; remove dead `visual-compare-map.ts` mapping reference.
- `.claude/rules/design-system.md` — "Dual representation: each component has a `.tsx` and `.html`"; "`html/themes/`"; "`npm run ds:sync` compares HTML vs TSX"; "served on `:8098` via `ds:serve`". Rewrite to TSX-only reality (single `.tsx` source; `ds:sync` = TSX-vs-golden-baseline; viewer serves TSX stories). **This rule file also names HTML-as-truth (AC1/AC5-adjacent) — must be edited even though spec lists only 5 skills + visual-parity.** Flag for reviewer.
- `CLAUDE.md` / `.worktrees/AJ1/CLAUDE.md` design-system section: check for `:8098` HTML-mode language (grep found none beyond rules). No change unless grep at build time finds HTML-as-reference text.
- `packages/design-system/src/__tests__/U8-hearth-restyle.test.tsx:247` — comment text only ("BetCard.html mockup" → "BetCard story/baseline"). Cosmetic.

### CREATE
- `.claude/rules/visual-regression.md` — replaces `visual-parity.md`. Content: "TSX is the single design source of truth. The visual-regression gate (`npm run ds:sync`) screenshots each live TSX story and diffs against committed golden PNG baselines under `…test.ts-snapshots/` at ≤5%. Intentional change → review diff, re-bless with `npm run ds:bless`, commit baselines in the same PR. Never raise the 5% ratio to make a diff pass — fix the component or bless deliberately."
- `packages/design-system/src/__tests__/visual-regression.test.ts-snapshots/` — committed golden PNGs (generated by first `--update-snapshots` run). One per component/section.

---

## Acceptance criteria → verification

| AC | Verification method |
|---|---|
| **AC1** One TSX source of truth; no `.html` refs; no rule/skill/script names HTML-as-reference | **Lint/build check (static property):** add a guard (extend an existing guard script pattern, e.g. a `design-source-guard.ts` mirroring `nimmly-guard.ts`) that fails if any `*.html` exists under `packages/design-system/` OR if `packages/design-system/html/` dir exists OR if `visual:compare`/`pixel-for-pixel`/HTML-as-truth strings remain in `.claude/skills|rules`. Wire into `verify`. (Not a vitest test — it's a filesystem property → guard script per CLAUDE.md.) |
| **AC2** Visual regression catches rendered-appearance change against a committed baseline, names the component | **Playwright gate** (`ds:sync`). Red-phase proof: builder deliberately restyles one component, runs gate, asserts it FAILS naming that component (validation scenario 2). Baseline mismatch → Playwright reports the failing snapshot name. |
| **AC3** Viewer renders only TSX; no HTML mode/toggle/iframe; every component reachable + renders | **Playwright workbench spec** (`workbench.spec.ts`, rewritten): assert no `.toolbar-btn` with text `^HTML$` exists anywhere; assert each catalogued component (**enumerated from the catalog DOM at runtime, not `discoverStories()`**) opens and shows `.demo-section`. |
| **AC4** `npm run verify` passes on inverted tree, no skipped/weakened visual checks | **Two independent paths (no conflation — see Wiring table):** (1) **local** — `npm run verify` (now includes `ds:sync`) green; builder runs full `verify` foreground on the branch (MEMORY). (2) **CI** — CI does NOT run `verify`; the gate runs via the new explicit `Visual regression (TSX baselines)` CI step (after Build), which boots the viewer via `npm run -w @hyperidle/design-system serve` (no bun) and runs `ds:sync` against canonical Linux baselines. The 5% ratio = the retired gate's ceiling → not weakened; not raised to absorb platform jitter (Linux is canonical). |
| **AC5** 5 skills + visual-parity.md describe TSX-first reality | **Guard (static):** the AC1 guard's string-scan covers the skills + rules. Plus manual read in `/review`. `visual-parity.md` deleted, `visual-regression.md` created. |

---

## Ordered task list (builder, top-to-bottom)

1. **(AC2,AC4) Rewrite the gate config + fix the bun launcher.** Edit `playwright.config.ts`: add `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.05, threshold: 0.2 } }`, `snapshotPathTemplate` (no platform token). **Swap `webServer.command` `"bun run serve"` → `"npm run -w @hyperidle/design-system serve"` in `playwright.config.ts`, `playwright.workbench.config.ts`, and `playwright.l1.config.ts` (if kept) — bun is never installed in CI, so the gate must launch the viewer via npm/vite.** Verify config shape against https://playwright.dev/docs/test-snapshots. → AC2, AC4.
2. **(AC2) Rewrite `visual-regression.test.ts`.** Screenshot live TSX story sections (reuse `screenshotSections` clip math); assert each via `toHaveScreenshot('<Component>-<section>.png')`. **Enumerate the component set at runtime from the catalog DOM** (`beforeAll`: goto `:8098/#`, `page.locator("button.component-link .component-name").allTextContents()`) — **NOT `discoverStories()`** (Vite-only, dead in Node). **Marker-presence: dual selector `[data-ds-component], [data-ds-shell]`** so shells pass. **Re-capture interactive hover/focus states** for the 11 `INTERACTIVE_COMPONENTS` (TSX selectors, `hover({force:true})`/`focus()`, `toHaveScreenshot('<C>-<state>.png')`). Remove all HTML page navigation + TSX-toggle clicks. → AC2.
3. **(AC2) Bless initial baselines — on/for Linux (canonical).** Generate baselines on the canonical Linux platform (CI artifact or `mcr.microsoft.com/playwright:v<version>` container running `npm run ds:bless`), NOT Mac PNGs — Linux/CI is the blessing authority. Commit the Linux PNGs. These ARE the golden = current appearance (constraint: no restyle). Includes default + hover/focus state baselines. → AC2.
4. **(AC2) Red-phase proof.** Temporarily restyle one component, run `ds:sync`, confirm failure names it, revert. (Do NOT commit the restyle.) → AC2 / validation scenario 2.
5. **(AC3) Simplify viewer** `main.tsx` + `vite.config.ts` `publicDir` removal + `discovery.ts` jsdoc. → AC3.
6. **(AC3) Rewrite workbench + L1 specs** to drop toggle/existsSync/HTML-toggle-click; assert TSX-only render + markers + "no HTML button." → AC3.
7. **(AC1) Delete the HTML tree** `packages/design-system/html/` (65 files). → AC1.
8. **(AC1) Delete dead scripts** `serve.ts`, `k13-capture.ts`, `packages/web/scripts/visual-compare*.ts`; remove `serve:static` (ds pkg) + `visual:compare` (web pkg) scripts. → AC1.
9. **(AC1,AC5) Add AC1 guard** `scripts/design-source-guard.ts` (filesystem + string scan) mirroring `nimmly-guard.ts`; add `design-source-guard:check` to `verify`. → AC1, AC5.
10. **(AC4) Wire visual gate into verify + CI (two distinct paths — see Wiring table).** Root `package.json`: insert `npm run ds:sync` into the `verify` chain before `build` (local path); add `ds:bless` → `-w @hyperidle/design-system test:visual:update`. Add `test:visual:update` + re-point `sync-check`/`test:visual` in ds `package.json`. `ci.yml` (CI path — CI does NOT run `verify`, so the gate reaches CI ONLY here): after "Build (desktop)" (line 61) add step `Install Playwright (chromium)` → `npx playwright install --with-deps chromium`, then step `Visual regression (TSX baselines)` → `npm run ds:sync`. Note: AC1's `design-source-guard:check` is wired into `verify` only (local), matching its sibling guards which are not in CI. → AC4.
11. **(AC5) Rewrite docs/skills.** Delete `visual-parity.md`, create `visual-regression.md` (include the canonical-Linux bless workflow + "never raise the 5% ratio"); edit `.claude/rules/design-system.md`; edit the 5 skills (minimal — only HTML-as-truth + `visual:compare` language, NOT AJ3's mockup-authoring rewrite); fix U8 comment. **Also sweep `packages/design-system/*.md` for dangling `html/` paths** (`THEMES.md` documents `html/themes/` which is deleted; `DESIGN.md`/`FEEDBACK.md`/`AESTHETICS.md` may reference `html/` + `ds:serve`-of-html) — reword to TSX reality so no doc points at a deleted path. → AC5.
12. **(AC4) Full `npm run verify` foreground** on branch (local visual path). Then push branch + confirm CI green via the new explicit CI visual step (MEMORY: test CI before merge — the Playwright-in-CI step is new and untested; validate canonical Linux baselines match in CI, not on Mac). → AC4.

---

## Security & abuse cases

| Class | Applicability |
|---|---|
| Rate-limit on POST/PATCH | **N/A** — no endpoints touched. |
| Input-trust / agent-authored fields | **N/A** — no user/agent input surface. |
| Secret handling | **N/A** — no new credentials. (`VERIFY_SECRET` attestation flow untouched.) |
| Path traversal | **N/A** — no path input; snapshot paths are static config. |
| SSRF | **N/A** — no outbound URLs. |
| CI integrity | **Addressed** — visual gate runs LIVE in CI (not attested), so it cannot be bypassed via a forged attestation (consistent with the Z8-166 fix: fast/deterministic checks run live). |

---

## Migrations (renamed/removed symbols → call sites)

| Symbol removed | Call sites to update |
|---|---|
| `html/*.html` files | `visual-regression.test.ts` (rewritten), `thread-components.spec.ts` (rewritten), `vite.config.ts publicDir` (removed), `serve.ts` (deleted). No production import — `html/` was never imported by shipping code. |
| `serve:static` script | grep confirms only in ds `package.json`. No CI/doc refs. |
| `visual:compare` script | `packages/web/package.json`; referenced in `/review`, `/product-deep-review`, `/visual-polish` skills → reroute/remove. |
| `RenderMode`, `HtmlComponentView`, `isHtmlAvailable`, `HTML_AVAILABLE_TITLES`, `htmlGlobs` | Only in `viewer/main.tsx` (local). `workbench.spec.ts` asserts on the rendered toggle → rewritten. |
| `ds:sync` semantics (HTML-diff → TSX-baseline) | Same script name; body changes. Doc refs in `.claude/rules/design-system.md` reworded. |

## route-checklist
N/A — no HTTP routes / middleware in this workpackage.

## protectedTests
None frozen — the visual-regression suite is intentionally rewritten (its assertions MUST change: HTML-diff → TSX-baseline). All non-visual vitest suites (`*.test.ts(x)` under `src/__tests__/` except `visual-regression.test.ts`) must keep passing unchanged; DoD audits `git diff --name-only` shows no edits to component `.tsx` source (constraint: no restyle) except the deliberate-then-reverted red-phase change.

## sharedFiles
- `package.json` (root) — verify chain + scripts (other WPs may add guards).
- `.github/workflows/ci.yml` — CI steps.
- `.claude/skills/{design,design-critique,review,product-deep-review,visual-polish}/SKILL.md` — **AJ3 also edits `/design`, `/design-critique`** → merge-order risk; AJ1 must land first (AJ3 depends on AJ1). Keep AJ1's skill edits minimal to reduce conflict surface.
- `.claude/rules/design-system.md`, `.claude/rules/visual-parity.md`.

---

## Risks / blockers

1. **Cross-platform baseline drift (highest — now mitigated by canonical-platform decision).** Mac-blessed PNGs vs Linux CI render: AA/font jitter may exceed 5%. *Resolution (no longer left open):* **Linux/CI is the canonical blessing authority** (see "Canonical capture platform"). Baselines are Linux-rendered (via CI artifact or `mcr.microsoft.com/playwright` container); local Mac `verify` tolerates them via the 5% ratio + platform-agnostic `snapshotPathTemplate`. Builder blesses on/for Linux from the start, so CI is green by construction. Builder MUST still validate CI green on-branch before merge (MEMORY: test CI before merge) — but recovery is defined (re-bless on Linux), never "weaken the 5% ratio."
2. **`verify` runtime grows.** Adding Playwright to `verify` adds ~30-90s + `playwright install` in CI. Acceptable (visual gate is the point); keep it out of `test:all` so unit runs stay fast.
3. **Scope bleed into AJ3.** `/design` + `/design-critique` skills are AJ3 territory. AJ1 edits must be surgical (HTML-as-truth removal only). Over-editing the mockup-authoring workflow now = rework when AJ3 lands. Flagged in tasks 11.
4. **`.claude/rules/design-system.md` is not in the spec's "5 skills + visual-parity" list** but it explicitly names HTML-as-truth ("dual representation… `.html`"). Leaving it violates AC1 ("no rule names HTML as the design reference"). Plan includes it; reviewer should confirm the spec's list was non-exhaustive.
5. **L1/workbench config consolidation** is a judgment call (delete L1 config + merge, vs keep separate). Default = merge into the single gate so "every catalogued component" is covered by one auto-derived list; avoids a second hand-maintained component array.

## Doc cross-check
No `docs/` canonical-shape contradiction — AJ1 touches tooling/skills/design-system infra only; `docs/ui-design/` describes tokens/components (unaffected — no restyle). No `/concept` gap.
