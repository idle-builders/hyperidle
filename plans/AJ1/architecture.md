# AJ1 REDO — TSX source of truth + vitest DOM-snapshot regression net — Architecture

**Workpackage:** AJ1 (Track AJ). Complexity L. Depends on: none.
**Phase:** designer production. No `/design` (infra + source-of-truth inversion, no UI surface).
**Status of decision:** the visual-regression approach is **LOCKED — Option A (plain vitest DOM-snapshot net)** per `plans/AJ1/visual-regression-options.md`. This plan is implementation-only; it does NOT re-litigate the choice.

> **This rewrite supersedes the prior screenshot-based AJ1 architecture.** The previous plan (Playwright `toHaveScreenshot` + committed golden PNGs, wired into `verify`) shipped (PR #287) and was reverted (#298) because it broke the core invariant **`verify` must run locally on macOS with zero Docker** (Linux-canonical golden PNGs go permanently red on macOS via sub-pixel AA). The screenshot machinery was then *restored* onto this branch and must now be **ripped out** and replaced with the vitest DOM-snapshot net.

---

## What this workpackage is (one line)

Invert the design source of truth to **TSX** (KEEP — already done), **delete every screenshot/Playwright-visual artifact**, and replace the regression gate with a **deterministic vitest DOM-snapshot net** that renders every catalogued `.stories.tsx` variant in jsdom, serializes the DOM (markup + `className` + inline style + markers, with nondeterministic ids normalized) to committed `.snap` text, runs inside `npm run test` → `npm run verify`, and is git-text-diffable with no Docker, no browser, no PNGs.

---

## De-risk spike — RESULT (run on this branch, recorded, then deleted)

A throwaway `_spike-glob.test.tsx` was written, run via `npx vitest run --project design-system`, and removed. Findings:

1. **`import.meta.glob` enumerates the SAME story set from a vitest test file as the viewer does. ✅ CONFIRMED.**
   - `import.meta.glob("../*.stories.tsx", { eager: true })` from `src/__tests__/` returned **49** modules — exactly the design-system root story count the viewer sees (`viewer/main.tsx:26` globs `"../src/*.stories.tsx"`, same 49).
   - `import.meta.glob("../kinds/*.stories.tsx", { eager: true })` returned **7** (the `src/kinds/` block-renderer stories). Total **56** design-system stories — matches `find packages/design-system/src -name '*.stories.tsx' | wc -l` = 56.
   - **Mechanism is real:** vitest runs on Vite, so `import.meta.glob` transforms at collect time exactly as in the viewer. (This is why the *retired Playwright* test could NOT use it — Playwright runs in plain Node, no Vite transform, glob returns `{}`. The vitest net does not have that problem.)
   - **Glob-root caveat (load-bearing):** the viewer also globs `packages/web/src/shell/*.stories.tsx` and `packages/web/src/components/*.stories.tsx`. **A vitest test living in `packages/design-system` can only glob design-system stories** — it must not reach across package boundaries into `@hyperidle/web` (would couple the DS test to web, and Vite project roots differ). **Scope decision:** the snapshot net covers the **design-system catalog** (the 56 DS stories = the catalogued Tier-1/2/3 + utility components that live in `packages/design-system`, which is what "catalogued components" means for AC2). Web shell/page stories are out of the design-system net's scope (they are app composites, not catalogued design-system components; they already have their own `*.test.tsx` + e2e coverage). State this honestly in the coverage statement.

2. **react-aria / React `useId` nondeterminism is real and MUST be normalized. ✅ CONFIRMED, fix known.**
   - React 19.2.6 `useId()` emits ids of the form **`_r_N_`** (e.g. `_r_0_`). Rendering `RichMessageCard` (uses `useId` → `titleId` → `aria-labelledby`) produced `aria-labelledby="_r_0_"` / `id="_r_0_"`.
   - The counter is **tree-position dependent**: rendering many variants in one test file advances `N` per mount, so the same component can serialize as `_r_3_` one run and `_r_7_` the next if file/test order shifts → snapshot churn / flake **unless normalized**.
   - Also affected: `Input.tsx` (`inputId` → `htmlFor`, `aria-describedby="${inputId}-hint"/"-error"`), `Select.tsx` (`selectId`), `Checkbox.tsx` (`htmlFor={id}`). All route a generated id into `id` / `for` / `aria-*`.
   - **Fix (in the serializer):** regex-replace the React id token `/_r_[0-9a-z]+_/g` → `__id__` (and the legacy `:rN:` form `/:r[0-9a-z]+:/g` → `__id__` for safety across React minor versions) in serialized attribute values BEFORE snapshotting. Because the same token is replaced everywhere, `aria-labelledby` and its target `id` stay referentially consistent in the snapshot (both become `__id__`), so the snapshot still proves the wiring exists without pinning the volatile counter.
   - `@testing-library/react`'s `prettyDOM` is available (`typeof prettyDOM === "function"`) and is the DOM-serializer building block; the custom serializer wraps/normalizes its output (or walks the node directly — see serializer design).

**Spike verdict: Option A is de-risked. Both unknowns resolved. No blocker.**

---

## Required reading (for the builder)

- `plans/AJ1/visual-regression-options.md` — the LOCKED-choice dossier (Option A, §3 + §5). Read the coverage trade in §1/§5.
- `packages/design-system/viewer/discovery.ts` — `discoverStories(...globSources)` + `StoryModule { title, tier, uses, variants: [{name, render}] }`. The snapshot net reuses this exact shape (pass it the test-side glob).
- `packages/design-system/viewer/main.tsx:26-36` — how the viewer globs stories (the net mirrors the DS globs only).
- `packages/design-system/src/__tests__/W2-primitives.test.tsx` — the existing `createRoot` + `act()` render-in-jsdom pattern the net follows.
- `packages/design-system/src/__tests__/visual-regression.test.ts` — the screenshot net to **DELETE**.
- `packages/design-system/playwright.config.ts`, `playwright.workbench.config.ts` — to **DELETE**.
- `packages/design-system/tests/workbench.spec.ts` — Playwright catalog smoke; **DELETE** (replaced by a vitest catalog test — see Task 6).
- `packages/design-system/src/__tests__/__screenshots__/` — **342 golden PNGs to DELETE**.
- `packages/design-system/vitest.config.ts` — note the `**/visual-regression*` and `tests/**` excludes (must be removed/updated once those files are gone).
- `package.json` (root) — `verify` chain (`ds:sync`, `ds:workbench`), `ds:*` scripts.
- `packages/design-system/package.json` — `test:visual`, `test:visual:update`, `sync-check`, `test:workbench` scripts + `@playwright/test` devDep.
- `packages/web/package.json` — `visual:compare` script (dead; AC1 string-scan target — see below).
- `.github/workflows/ci.yml:64-76` — the `Install Playwright (chromium)` + `Visual regression` + `Workbench smoke` CI steps to **DELETE**.
- `knip.json:27-50` — design-system `playwright` config entries to update.
- `scripts/design-source-guard.ts` — AC1 guard (KEEP; one pattern addition — see Task 9).
- `.claude/rules/visual-regression.md`, `.claude/rules/design-system.md`, `.claude/rules/aesthetic-quality.md`, `.claude/skills/{design,design-critique,review,product-deep-review,visual-polish}/SKILL.md` — TSX+snapshot rewording targets.

---

## Plan reconciliation (spec ⇆ reality)

Verified against the worktree (`feat/AJ1-tsx-redo`). This branch is **post HTML→TSX migration** (html/ already deleted, viewer already TSX-only, design-source-guard already exists) **with the screenshot machinery restored**. Disagreements vs. the task brief / prior plan:

| Assumption | Reality | Plan handles by |
|---|---|---|
| "the old screenshot machinery must be ripped out" | TRUE. `visual-regression.test.ts` (screenshot version, ~25KB), `playwright.config.ts`, `playwright.workbench.config.ts`, `tests/workbench.spec.ts`, **342** PNGs under `__screenshots__/`, `ds:sync`/`ds:bless`/`ds:workbench` scripts + their `verify` wiring, and CI steps 64–76 are all present. | Full removal inventory below. |
| "golden PNGs under `__screenshots__/`" + brief mention of a `.test.ts-snapshots/` dir | `__screenshots__/` holds **342 `.png`** (single flat dir). `visual-regression.test.ts-snapshots/` does **NOT** exist (prior plan named it but the restored tree uses `__screenshots__/` via `snapshotPathTemplate`). | Delete `__screenshots__/` entirely (342 PNGs). New `.snap` files live in `src/__tests__/__snapshots__/` (vitest default). |
| "Playwright configs (3)" incl. `playwright.l1.config.ts` | Only **2** DS Playwright configs exist (`playwright.config.ts`, `playwright.workbench.config.ts`). `playwright.l1.config.ts` and `tests/visual/L1/*` are **already gone** (L1 merged earlier). | Delete the 2 that exist; no L1 config to remove. |
| HTML→TSX migration still pending | **Already done & KEPT.** `html/` deleted, viewer TSX-only (no `RenderMode`/`HtmlComponentView`/toggle), `design-source-guard.ts` exists and is wired into `verify`. | KEEP all of it (see "What is KEPT"). No viewer changes needed. |
| `@playwright/test` removable from the repo | **NO.** `packages/web` still uses Playwright for e2e (`playwright.config.ts`, `playwright.ah1/ah5.config.ts`, `e2e/*.spec.ts`). | Remove `@playwright/test` from **`packages/design-system`** devDeps only; it stays in `packages/web`. |
| `web/visual:compare` script | Present (`packages/web/package.json:13` → `npx tsx scripts/visual-compare.ts`); the referenced `scripts/visual-compare.ts` is already deleted (dead script entry). | Remove the dead `visual:compare` script entry; it is also an AC1/AC5 string-scan target. `serve.ts`/`k13-capture.ts`/`visual-compare-map.ts` are already gone. |
| `verify` runs a visual gate today | TRUE on this branch: `verify` chain includes `npm run ds:sync && npm run ds:workbench`. | Remove both from the chain; the new net runs via `npm run test` (already in `test:all`, which `verify-attest` attests). |
| Skill "screenshot" references are all the screenshot net | **FALSE — load-bearing.** Most `npx playwright screenshot` references in `/review`, `/product-deep-review`, `/design`, `/design-critique`, `/visual-polish` are **manual "look at pixels" review acts** (drive the running app at `:5173` or eyeball one story) — legitimate, NOT the regression net. **Only** the *golden-baseline regression* references (`ds:sync` as a pixel gate, `ds:bless`, "golden PNG baselines", the visual-regression rule) describe the deleted net. | Edit only the regression-net language; leave manual screenshot-review acts intact (they remain valid for catching the snapshot net's pure-paint blind spot). |
| `vitest.config.ts` excludes `**/visual-regression*` + `tests/**` | TRUE — these excludes existed to keep the Playwright files out of vitest. | Remove the `**/visual-regression*` exclude (file deleted; new snapshot file must be INCLUDED) and the `tests/**` exclude (workbench.spec deleted). |

**No `docs/` canonical-shape contradiction.** AJ1 touches tooling/skills/design-system infra; no `/concept` gap (no new primitive — "snapshot baseline" is a generic testing term).

---

## What is KEPT (do NOT touch)

1. **HTML→TSX inversion** — `packages/design-system/html/` stays deleted; viewer is TSX-only (no `RenderMode`, `HtmlComponentView`, HTML/TSX toggle); `vite.config.ts` has no `publicDir: "../html"`. No viewer changes in this WP.
2. **`design-source-guard.ts` (AC1)** — KEEP. The filesystem + string-scan guard that enforces "no HTML reference files / no HTML-as-design-reference language." Wired into `verify`. **One pattern addition** (Task 9) so it also fails if the deleted screenshot scripts/strings reappear; otherwise unchanged.
3. **The `.stories.tsx` catalog contract** — `default { title, tier?, uses?, order? }` + named exports as variant components; auto-discovered via `import.meta.glob`; `discoverStories()` shape. The snapshot net is a **consumer** of this contract; it does not change it.
4. **All 27 existing `*.test.tsx`/`*.test.ts` component tests** (W2-primitives, ds-attrs, AI6-tokens, etc.) — unchanged. The snapshot net is additive.
5. **5 skills + `.claude/rules/*` are TSX-first** — KEEP the TSX-first framing; only swap *screenshot-regression* wording for *vitest-snapshot* wording (Task 11). `visual-parity.md` stays gone.
6. **`packages/web` Playwright e2e** — untouched.

---

## Removal inventory (exact, complete)

### DELETE — files (346 paths)

| Path | What | Why |
|---|---|---|
| `packages/design-system/src/__tests__/visual-regression.test.ts` | the screenshot/`toHaveScreenshot` Playwright test (~25KB) | replaced by the vitest snapshot net |
| `packages/design-system/src/__tests__/__screenshots__/` | **342 golden `*.png`** (whole dir) | no more pixel baselines (H1) |
| `packages/design-system/playwright.config.ts` | DS visual-regression Playwright config | no Playwright in the DS net |
| `packages/design-system/playwright.workbench.config.ts` | DS workbench Playwright config | workbench smoke moves to vitest |
| `packages/design-system/tests/workbench.spec.ts` | Playwright catalog smoke | replaced by a vitest catalog test |
| `packages/design-system/tests/` (the now-empty dir) | leftover dir | remove if empty after the spec is deleted |

*(`playwright.l1.config.ts`, `tests/visual/L1/*`, `scripts/serve.ts`, `scripts/k13-capture.ts`, `packages/web/scripts/visual-compare*.ts` are already absent on this branch — confirmed by `ls`/grep. No action.)*

### DELETE — scripts (root `package.json`)

| Script | Current value | Action |
|---|---|---|
| `ds:sync` | `npm run -w @hyperidle/design-system sync-check` | **DELETE** (was the Playwright pixel gate) |
| `ds:bless` | `npm run -w @hyperidle/design-system test:visual:update` | **DELETE** (was `--update-snapshots` for PNGs) |
| `ds:workbench` | `npm run -w @hyperidle/design-system test:workbench` | **DELETE** (Playwright workbench) |
| `verify` | `… && npm run ds:sync && npm run ds:workbench && npm run build …` | **EDIT** — remove `&& npm run ds:sync && npm run ds:workbench` |

`ds:serve` (= `npm run -w @hyperidle/design-system serve`) **STAYS** (the live TSX viewer — review/critique surface, not the net).

### DELETE — scripts (`packages/design-system/package.json`)

| Script | Action |
|---|---|
| `test:visual` (`playwright test --config playwright.config.ts`) | DELETE |
| `test:visual:update` (`… --update-snapshots`) | DELETE |
| `sync-check` (`playwright test --config playwright.config.ts`) | DELETE |
| `test:workbench` (`playwright test --config playwright.workbench.config.ts`) | DELETE |
| `serve` (`vite --config vite.config.ts`) | KEEP |
| `test` (`vitest run`) | KEEP — now also runs the snapshot net |

### DELETE — scripts (`packages/web/package.json`)

| Script | Action |
|---|---|
| `visual:compare` (`npx tsx scripts/visual-compare.ts` — dead, file gone) | DELETE |

### DELETE — dependency

- `@playwright/test` from **`packages/design-system/package.json`** devDependencies (last DS consumer removed). Keep it in `packages/web`. *(No `pixelmatch`/`pngjs` present on this branch — the restored test uses Playwright's built-in `toHaveScreenshot`, not the old custom pixelmatch harness — so nothing to remove there.)*

### DELETE — CI steps (`.github/workflows/ci.yml:64-76`)

- `Install Playwright (chromium)` (`npx playwright install --with-deps chromium`)
- `Visual regression (TSX baselines)` (`npm run ds:sync`)
- `Workbench smoke (…)` (`npm run ds:workbench`)

All three deleted. The snapshot net needs **no CI step** — it runs inside `npm run test:all`, which CI already trusts via the signed attestation (`scripts/verify-attest.ts` runs `test:all` and records the real exit code; `check-attestation.ts` validates). (CI gets no new live step; the existing fast-check live re-run + attestation path covers it.)

### EDIT — config

- `packages/design-system/vitest.config.ts` — remove `"**/visual-regression*"` and `"tests/**"` from `exclude` (those files are gone; the new `*.snapshot.test.tsx` must be picked up by the default `**/*.test.tsx` include). Keep `pool: "forks"`, `setupFiles`, the `node_modules`/`dist`/`integration` excludes.
- `knip.json` — remove the `packages/design-system` `playwright.config` entries (lines ~36-37: `"playwright": { "config": ["playwright.config.ts", "playwright.workbench.config.ts"] }`). Leave `packages/web`'s playwright config block. Leave the `src/**/*.stories.tsx` entry-pattern (stories stay).

### Grep-sweep (run at build time; nothing must dangle)

Builder runs, expecting **zero** hits after the work:
```
grep -rn 'ds:sync\|ds:bless\|ds:workbench\|toHaveScreenshot\|__screenshots__\|test:visual\|sync-check\|test:workbench\|visual:compare' \
  package.json packages/*/package.json .github/workflows knip.json .claude/rules .claude/skills packages/design-system
```
*(Exception: the AC1 guard's FORBIDDEN_PATTERNS legitimately contain `visual:compare` as a string to ban — that hit is allowed in `scripts/design-source-guard.ts` only.)*

---

## The new snapshot net (design)

### File

`packages/design-system/src/__tests__/catalog-snapshot.test.tsx` — a single `*.test.tsx` in design-system, picked up by `npm run test` (vitest, jsdom, `pool: forks`).

> Naming: `catalog-snapshot.test.tsx` (not `visual-regression.test.tsx`) — the new file is a vitest DOM-snapshot test, not a visual-regression screenshot test; a fresh name avoids confusing it with the deleted Playwright file in git history and grep.

### Enumeration (auto-covers the whole DS catalog — no hand-listing)

```ts
import { discoverStories, type StoryModule } from "../../viewer/discovery.js";

const dsRootGlobs = import.meta.glob<Record<string, unknown>>("../*.stories.tsx", { eager: true });
const dsKindsGlobs = import.meta.glob<Record<string, unknown>>("../kinds/*.stories.tsx", { eager: true });
const modules: StoryModule[] = discoverStories(dsRootGlobs as never, dsKindsGlobs as never);
// 56 modules → one describe per module title, one test per variant.
```
- Reuses `discoverStories()` (the viewer's own enumerator) so the net and the viewer agree by construction. A new `.stories.tsx` in `src/` or `src/kinds/` is picked up next run with **zero edits** (AC2 "every catalogued component… without hand-listing").
- ⚠️ UNVERIFIED (builder confirm in red phase): `discoverStories` is imported from `viewer/discovery.ts` into a `src/__tests__/` test — verify the relative path + `.js` ESM specifier resolve under the DS vitest project (the spike imported globs directly; importing `discoverStories` is the same package, expected fine).

### Render path (mirrors W2-primitives.test.tsx)

For each `module.variants[i] = { name, render }`:
1. `createRoot` on a fresh detached `<div>`, `act(() => root.render(createElement(render)))`.
2. Serialize the container's child subtree to normalized text.
3. `expect(serialized).toMatchSnapshot()` — snapshot key = `"<title> > <variantName>"` (vitest derives the key from the `describe`/`test` names, so a failing diff **names the component + variant** → AC2 "naming the component").
4. `root.unmount()` + remove the node (afterEach, like the existing tests).

`@vitest-environment jsdom`; set `IS_REACT_ACT_ENVIRONMENT = true` (same as W2). `pool: forks` already isolates files (prevents cross-file React id-counter leakage).

### Serializer (the determinism layer)

A custom serializer `serializeStoryDom(root: Element): string` (a small helper in the test file, or a sibling `catalog-snapshot.serializer.ts`):

1. **Source markup** via `prettyDOM(node, Infinity, { highlight: false })` from `@testing-library/react` (already a DS dep) OR a hand-walk emitting `tag + sorted-attrs + children` — prefer the hand-walk for full control over normalization (prettyDOM truncates and colorizes; we want raw, stable text). Recommended: a minimal recursive walk that emits, per element:
   - tag name,
   - **`class`** attribute verbatim (carries the Tailwind/token text — the load-bearing signal; do NOT sort class tokens unless churn proves it necessary — class order is stable from the component source, and sorting hides real reorderings),
   - **inline `style`** (token vars written as inline style, if any),
   - **`data-ds-*`** markers (`data-ds-component`, `data-ds-shell`, `data-tier`, `data-uses`, `data-daisyui`),
   - **role / aria-* / type / `for` / `id`** (structural + a11y signal),
   - text content (trimmed; whitespace-collapsed) for leaf text nodes.
   - **Drop** noise attributes that don't carry design intent and can flake: none expected, but `tabindex` from focus libs is fine to keep (stable).
2. **Normalize nondeterminism** (regex on the serialized string, post-walk):
   - React `useId`: `/_r_[0-9a-z]+_/g` → `__id__`; legacy `/:r[0-9a-z]+:/g` → `__id__` (spike-confirmed format `_r_N_`). Applied uniformly so `id`↔`aria-labelledby`/`htmlFor` references stay matched.
   - Any `${id}-hint` / `${id}-error` derived ids collapse to `__id__-hint` / `__id__-error` automatically (the `_r_N_` prefix is what's replaced).
   - (No dates/timestamps render in DS stories; if a future story injects `Date.now()`, add a `/\d{13}/`→`__ts__` rule then. Not needed now.)
3. **Token inlining (OPTIONAL — default OFF).** Tokens are already captured as literal text inside `className` (`bg-[var(--accent-primary)]`), so a class change *is* the token-change signal — no resolution needed. Resolving `var(--accent-primary)` → its computed value is a **trap in jsdom** (`getComputedStyle` does not apply the Tailwind/`<style>` cascade — dossier §2.5, jsdom #3318/#2485/#2986) and would produce empty/false values. **Decision: do NOT inline resolved token values.** The class text is the deterministic, cross-platform token signal. (If a future need arises to snapshot *resolved* values, that requires a browser → H1 violation → out of scope. Documented as a deliberate non-goal.)

### Where `.snap` files live

`packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap` (vitest default colocated `__snapshots__/`), **committed to git** (text, ~one block per variant). Cross-platform stable (no AA, no fonts, no layout — pure serialized DOM text), so the same `.snap` passes on macOS and Linux/CI identically — **no canonical-platform problem** (the entire reason the screenshot net died).

### How an intended change is accepted

1. Author the component/story change.
2. `npm run test` fails, naming `"<Component> > <Variant>"` with a **plain-text diff** (old class/markup vs new).
3. Review the text diff (it is reviewable, unlike a binary PNG).
4. Re-bless: `npx vitest run -u` (or `npm run test -- -u`) — updates the `.snap` text.
5. Commit the updated `.snap` in the **same PR** as the component change; reviewer reads the `.snap` diff.

No new bless script is strictly required (`vitest -u` is the idiom), but add a convenience root script `ds:bless` → `vitest run -u` **only the snapshot file** so muscle memory survives the screenshot→snapshot transition:
`"ds:bless": "vitest run -u packages/design-system/src/__tests__/catalog-snapshot.test.tsx"`. *(Optional — if knip flags it as unused, drop it; `vitest -u` is the documented path.)*

---

## Design-it-twice — two sub-decisions

**(a) Serializer: `prettyDOM` output vs. custom DOM walk.**
- *prettyDOM:* one-liner, well-known. Trade-off: colorizes (must pass `highlight:false`), truncates large trees by default (`Infinity` fixes), and emits a format we don't fully control (future RTL upgrade could shift formatting → mass re-bless). Reject as the *primary*: too much hidden coupling to RTL's printer.
- *Custom walk:* ~40 lines, full control over which attributes/normalizations are in scope; stable across RTL upgrades; emits exactly the "design intent" subset (class + style + markers + a11y). Trade-off: we own ~40 lines. **PICK custom walk** — boring, explicit, churn-proof; the normalization (id regex) lives in one place. (prettyDOM stays available as a debugging aid.)

**(b) Enumeration: reuse `discoverStories()` vs. raw `import.meta.glob` keys.**
- *Raw glob keys:* iterate `Object.entries(glob)`, treat every non-`default` export as a variant. Trade-off: re-implements the CSF-object handling (`{name, render}` vs bare function), tier/title resolution → drift from the viewer.
- *Reuse `discoverStories()`:* the viewer's own normalizer → net and viewer enumerate **identically** by construction; CSF handling, title, variant ordering all shared. Trade-off: a test imports from `viewer/` (a non-`src` dir) — acceptable (same package, `discovery.ts` was deliberately extracted to be importable from vitest per its `@lore K12`). **PICK `discoverStories()`.**

---

## Honest coverage statement (load-bearing — for the reviewer and DoD)

**What the snapshot net CATCHES (deterministically, cheaply, naming the component+variant):**
- DOM elements added / removed / reordered in any catalogued DS component's rendered output.
- `className` composition changes — which, in this codebase, **is** the design-token / spacing / radius / variant signal (tokens are written literally into class, e.g. `bg-[var(--accent-primary)] py-[7px] rounded-[var(--r-default)]`). Any intended Tailwind/token edit moves text here.
- inline `style` changes (token vars set inline).
- `data-ds-*` marker regressions (component/shell/tier/uses/daisyui).
- role / aria / `for` / structural-id-wiring regressions (ids normalized but presence + cross-reference preserved).

**What the snapshot net does NOT catch (the honest blind spot):**
- **Pure-paint regressions with UNCHANGED DOM/class/style text** — e.g. a Tailwind-config or `tokens.css` change that re-resolves what `--accent-primary` *paints* (the class string is identical, only the resolved color moves), a browser font-rendering shift, CSS cascade/specificity bugs between stylesheets, real layout geometry. jsdom does not lay out or apply the cascade, and a class-text snapshot is blind to a value re-mapping behind an unchanged class. **A screenshot would catch these; the snapshot net will not. This is the accepted trade for "no Docker, runs in vitest."**

**Which existing nets cover the gap:**
- **`tokens.css` value re-mapping** → `AI6-tokens.test.tsx` + `npm run token-guard:check` (`scripts/token-resolution-guard.ts`, in `verify`) — guards that token *definitions/resolutions* don't silently change. This closes the single biggest residual (token re-mapping behind an unchanged class).
- **Off-grid/off-scale/cool-gray/AI-aesthetic restyles** → `eslint-plugin-design` (AQ-001…AQ-110) via `npm run lint` — catches a large class of "bad restyle" statically, before render.
- **Removed/renamed variant or prop** → TypeScript strict (`npm run check`).
- **Font / cascade / layout / final painted pixels** → the **live TSX viewer at `:8098`** (`npm run ds:serve`) + the human **`/design` design-critique** gate + manual `npx playwright screenshot` review acts in `/review` and `/product-deep-review` (which drive the *running app* and read PNGs — deliberately KEPT). These are the human backstop for the snapshot net's pure-paint blind spot.

Net: the snapshot net is the automated floor for *structural/class/marker* regression; the viewer + critique + lint + token-guard + types collectively cover what jsdom-text cannot. No single net claims to catch painted pixels — that capability was vetoed (H1).

---

## Acceptance criteria → verification

| AC | Verification method |
|---|---|
| **AC1** One TSX source of truth; no `.html` reference files under `packages/design-system/`; no rule/skill/script names HTML-as-reference | **Guard (static property):** `npm run design-source-guard:check` (already wired into `verify`) — `checkNoHtmlFiles` (no `html/` dir, no stray `.html` except viewer/index.html + playwright-report) + `checkNoHtmlAsReference` (string-scan of `.claude/skills|rules`). KEPT; unchanged except the Task-9 pattern addition. |
| **AC2** Visual regression protects catalogued DS components via the snapshot net; a rendered-appearance change is caught, naming the component | **Vitest snapshot net** (`catalog-snapshot.test.tsx`, runs in `npm run test`). Red-phase proof: builder deliberately edits one component's class (e.g. `Button` `bg-[var(--accent-primary)]` → a different token), runs `npm run test`, asserts the snapshot test FAILS with a text diff whose key names `Button > AllVariants`; revert. Auto-enumeration proof: a separate assertion `expect(modules.length).toBeGreaterThanOrEqual(56)` (and `> 0`) guards that enumeration didn't silently empty out (a glob that returns `{}` would otherwise make the net vacuously green — the exact failure mode that disqualified Playwright's glob). |
| **AC3** Viewer renders only TSX; no HTML mode/toggle; every component reachable + renders | **KEPT from prior merge** (viewer already TSX-only). Re-verified by: (a) `design-source-guard` (no HTML); (b) a **vitest catalog test** (`catalog.test.tsx`, Task 6) replacing the deleted Playwright workbench smoke — asserts `discoverStories(dsGlobs).length >= 29`, every module has ≥1 variant, and each variant renders without throwing in jsdom (`expect(() => render).not.toThrow` is banned by testing rules as the *sole* assertion, so assert the container has ≥1 child element after render). No HTML-toggle assertion needed (toggle no longer exists in source). |
| **AC4** `npm run verify` passes locally on macOS with no Docker; no skipped/weakened visual checks | **One path, macOS-clean:** `npm run verify` → `… && npm run build && … && verify-attest` where `verify-attest` runs `npm run test:all` which includes the snapshot net (vitest). No `ds:sync`/`ds:workbench`/Playwright in the chain → no browser, no PNG, no Docker. Builder runs full `verify` **foreground** on the branch (MEMORY: foreground verify) and confirms green on macOS. The snapshot net IS the visual check — not skipped, not weakened (it is the LOCKED replacement, deterministic cross-platform). |
| **AC5** 5 skills + `.claude/rules/*` describe the TSX + **vitest-snapshot** reality (not screenshots) | **Guard string-scan + manual read:** `design-source-guard` already bans HTML-as-reference strings; **add patterns** (Task 9) so reintroducing `ds:sync`/`toHaveScreenshot`/"golden PNG baseline" regression language in skills/rules fails the guard. Plus `/review` manual read. `visual-regression.md` rewritten to describe the snapshot net; `design-system.md` gate paragraph rewritten; `visual-parity.md` stays deleted. |

---

## Ordered task list (builder, top-to-bottom; each → AC)

1. **(AC2 red) Write the snapshot net test — RED first.** Create `packages/design-system/src/__tests__/catalog-snapshot.test.tsx`: enumerate via `discoverStories(import.meta.glob("../*.stories.tsx",{eager:true}), import.meta.glob("../kinds/*.stories.tsx",{eager:true}))`; `describe(title)` / `test(variant.name)`; render via `createRoot`+`act`; serialize via the custom walk + id-normalization; `toMatchSnapshot()`. Add the `modules.length >= 56` + `> 0` enumeration guard. **No `.snap` committed yet → first run WRITES snapshots (green on write).** Confirm it picks up all 56 stories and produces deterministic output across two consecutive runs (run twice, `git diff` the `.snap` = empty). → AC2.
2. **(AC2) Bless initial snapshots = current appearance.** Commit `__snapshots__/catalog-snapshot.test.tsx.snap`. These are the baseline (constraint: no restyle — they capture the tree as-is). Cross-platform stable → no Linux/Mac fork needed. → AC2.
3. **(AC2) Red-phase proof.** Temporarily change one component's class, `npm run test`, confirm the snapshot test fails naming `<Component> > <Variant>` with a readable text diff; **revert** (do not commit the restyle). → AC2 / validation.
4. **(AC1,AC2) Delete the screenshot test + PNGs.** Delete `src/__tests__/visual-regression.test.ts` and the entire `src/__tests__/__screenshots__/` dir (342 PNGs). → removal.
5. **(AC1) Delete Playwright configs + workbench spec.** Delete `playwright.config.ts`, `playwright.workbench.config.ts`, `tests/workbench.spec.ts` (and the `tests/` dir if empty). → removal.
6. **(AC3) Add the vitest catalog test** `packages/design-system/src/__tests__/catalog.test.tsx` replacing the deleted Playwright workbench smoke: assert `discoverStories(...).length >= 29`, every module has ≥1 variant, each variant renders ≥1 DOM element in jsdom. (No HTML-toggle assertion — gone from source.) → AC3.
7. **(AC4) Fix vitest config.** `packages/design-system/vitest.config.ts`: remove `"**/visual-regression*"` and `"tests/**"` from `exclude` so the new `*.test.tsx` files run and no longer reference deleted paths. → AC4.
8. **(AC1,AC4) Strip scripts + deps + verify chain.** Root `package.json`: delete `ds:sync`, `ds:workbench`; re-point or delete `ds:bless` (→ `vitest run -u <snapshot file>`, or delete); remove `&& npm run ds:sync && npm run ds:workbench` from `verify`. DS `package.json`: delete `test:visual`, `test:visual:update`, `sync-check`, `test:workbench`; remove `@playwright/test` from DS devDeps. Web `package.json`: delete `visual:compare`. `knip.json`: remove DS `playwright.config` entries. → AC1, AC4.
9. **(AC1,AC5) Extend the AC1 guard.** In `scripts/design-source-guard.ts` `FORBIDDEN_PATTERNS`, add regexes so screenshot-regression language can't return to skills/rules: `/golden (png|baseline)/i`, `/toHaveScreenshot/`, `/ds:sync.*(screenshot|pixel|baseline)/i`, `/__screenshots__/`. (Keep existing HTML patterns.) Do NOT ban the words "screenshot"/"Playwright" wholesale — manual screenshot-review acts in `/review` and `/product-deep-review` are legitimate and must survive. → AC1, AC5.
10. **(AC1,AC4) Delete CI steps.** `.github/workflows/ci.yml`: remove `Install Playwright (chromium)`, `Visual regression (TSX baselines)`, `Workbench smoke` (lines 64–76). Snapshot net needs no CI step (covered by `test:all` attestation). → AC4.
11. **(AC5) Rewrite skill + rule wording (snapshot reality).** Edit:
    - `.claude/rules/visual-regression.md` — **rewrite** to describe the vitest snapshot net (file path, `discoverStories` enumeration, custom serializer + id normalization, `__snapshots__/*.snap` committed, re-bless via `vitest -u`, the honest coverage statement). Remove ALL Playwright/golden-PNG/canonical-Linux/ds:sync/ds:bless-as-PNG language.
    - `.claude/rules/design-system.md` (line 28 gate paragraph) — "Visual regression gate: the vitest DOM-snapshot net (`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`, runs in `npm run test`) renders every catalogued story and snapshots normalized DOM+class text; intended change → re-bless with `vitest -u`. See `.claude/rules/visual-regression.md`."
    - `.claude/skills/review/SKILL.md:73` — replace "run `npm run ds:sync` to diff against committed golden baselines" with "the vitest DOM-snapshot net (`npm run test`) catches class/markup/marker regression; for *painted-pixel* review open the story in the live viewer (`npm run ds:serve` → `:8098/#<Component>`) and look." (Keep the manual `npx playwright screenshot` of the running app at :5173 — it covers the snapshot blind spot.)
    - `.claude/skills/product-deep-review/SKILL.md:60` — same swap: `ds:sync` golden-baseline → snapshot net + live viewer; keep the running-app screenshots.
    - `.claude/skills/visual-polish/SKILL.md` — replace the `ds:sync`/`ds:bless`/"golden PNG baselines at ≤5%" regression references (lines 3,51,54,67,72,76,79) with "the vitest snapshot net (`npm run test`) flags structural/class drift; re-bless with `vitest -u`." Keep the manual `npx playwright screenshot` of the story for *visual* polish iteration (that's the human-pixel loop, not the regression net).
    - `.claude/skills/design/SKILL.md` + `.claude/skills/design-critique/SKILL.md` — these reference `npx playwright screenshot` for **manual critique only** (no `ds:sync`/golden-baseline regression language present). **No change needed** unless a build-time grep finds golden-baseline regression wording; the manual screenshot-for-critique acts stay.
    Run the AC1 guard after editing — expect clean. → AC5.
12. **(AC4) Full `npm run verify` foreground on macOS.** Run the entire `verify` chain foreground (MEMORY). Confirm: zero check/lint/knip errors, snapshot net green inside `test:all`, no Playwright/Docker invoked, build passes, attestation signs. Then push; CI runs the (now Playwright-free) chain + attestation. → AC4.

---

## Security & abuse cases

| Class | Applicability |
|---|---|
| Rate-limit on POST/PATCH | **N/A** — no endpoints touched. |
| Input-trust / agent-authored fields | **N/A** — no user/agent input surface. |
| Secret handling | **N/A** — no new credentials (`VERIFY_SECRET` attestation flow untouched; removing CI visual steps does not touch it). |
| Path traversal | **N/A** — no path input; snapshot paths are fixed (`__snapshots__/`). |
| SSRF | **N/A** — no outbound URLs. |
| CI integrity | **Addressed** — the snapshot net runs inside `test:all`, whose real exit code is recorded by `verify-attest` and validated by `check-attestation.ts` (the Z8-166 fix). It cannot be bypassed by a forged attestation. Removing the live Playwright CI steps does NOT weaken this: the net moved from a live CI step into the attested test suite, which CI still validates. |

## route-checklist
N/A — no HTTP routes / middleware.

## protectedTests
- All 27 existing `*.test.tsx` / `*.test.ts` under `packages/design-system/src/__tests__/` **except** `visual-regression.test.ts` (deleted) — their assertions must NOT change (constraint: no component restyle). DoD audits `git diff --name-only` shows no edits to those test files and no edits to component `.tsx` source (except the deliberate-then-reverted red-phase change in Task 3).
- The committed `__snapshots__/catalog-snapshot.test.tsx.snap` is the new baseline; after Task 2 it must not change in this PR (no restyle ⇒ no re-bless).

## sharedFiles
- `package.json` (root) — `verify` chain + `ds:*` scripts (other WPs may add guards/scripts → merge-order risk).
- `packages/design-system/package.json`, `packages/design-system/vitest.config.ts` — DS scripts/config.
- `packages/web/package.json` — `visual:compare` removal.
- `.github/workflows/ci.yml` — CI steps.
- `knip.json` — DS playwright config entries.
- `.claude/skills/{design,design-critique,review,product-deep-review,visual-polish}/SKILL.md`, `.claude/rules/{visual-regression,design-system}.md` — **AJ3 also edits `/design` + `/design-critique`** → AJ1 must land first; keep AJ1's skill edits surgical (regression-net wording only, NOT mockup-authoring workflow) to minimize conflict surface.
- `scripts/design-source-guard.ts` — AC1 guard (pattern addition).

---

## Risks / blockers

1. **Snapshot churn discipline (the LOCKED-choice's known cost).** Every *intended* class edit needs a reviewed `vitest -u` re-bless. Mitigation: text diffs are readable (unlike PNGs); the serializer is scoped to *structure + class + markers* (not full prose), so churn is proportional to real design change. If agents blindly `-u` without reading, the net degrades to noise (MEMORY: tests must not drive behavior) — `/review` must read `.snap` diffs. Documented in `visual-regression.md`.
2. **`discoverStories` import path from a test file** (⚠️ UNVERIFIED — Task 1 confirms). The spike verified `import.meta.glob` enumeration; importing `discoverStories` from `../../viewer/discovery.js` into `src/__tests__/` is same-package and expected to resolve, but builder confirms in red phase. Fallback: inline the trivial CSF-extraction (`Object.entries` minus `default`, treat function/`{render}` as variant) directly in the test — the spike already used raw globs successfully.
3. **Enumeration silently empties.** If a glob-root path is wrong, `discoverStories` returns `[]` and the net is vacuously green. Mitigated by the explicit `modules.length >= 56` guard assertion (Task 1) — fails loudly if the catalog disappears.
4. **Coverage blind spot (accepted, not a bug).** Pure-paint regressions (token *value* re-map, font/cascade/layout) are not caught by jsdom text — see the honest coverage statement. This is the founder-accepted trade for H1–H4. Covered by token-guard + lint + the live viewer + design-critique. Reviewer must accept this trade explicitly, not flag it as a gap.
5. **Web shell/page stories out of scope.** The DS net covers `packages/design-system` stories (56). Web composites (`packages/web/src/{shell,components,pages}/*.stories.tsx`) are NOT in this net (cross-package glob coupling avoided). They have their own `*.test.tsx` + e2e. If "catalogued components" is later read to include web shells, a *separate* web-package snapshot net is a follow-up — flagged, out of AJ1 scope.

## Doc cross-check
No `docs/` canonical-shape contradiction — AJ1 touches tooling/skills/design-system infra only. No `/concept` gap (no new primitive; "snapshot baseline" is a generic testing term).
