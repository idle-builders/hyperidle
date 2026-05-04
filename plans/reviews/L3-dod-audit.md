# L3 — Definition-of-Done Audit (Pipeline Step 15)

**Worktree.** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L3`
**Spec source of truth.** `docs/work-packages/TRACK-L.md` lines 111–145
**Plan.** `docs/architecture-plans/L3.md`
**Concept.** `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5
**Mode.** Read-only audit. No source modifications. Gates run as listed below.
**Date.** 2026-04-28

Severity legend
- **Met** — AC verifiably satisfied with evidence.
- **Partial** — Evidence exists but a non-trivial sub-claim is unmet.
- **Not met** — AC unverifiable or evidence demonstrably wrong.

---

## 1. AC-by-AC table

| ID | AC (paraphrased) | Status | Evidence | Gap |
|---|---|---|---|---|
| AC-1 | Concept-doc updates: §4.5 in `HUMAN_INTERFACE_LAYER.md` + producer rule in `PROCESS_LAYER.md` | **Met** | `docs/concept/HUMAN_INTERFACE_LAYER.md:474-528` (full §4.5 with definition, anti-patterns, vocabulary, hard rules). `docs/concept/PROCESS_LAYER.md:69` ("Producer rule for Artifacts. Tasks are the unique producers…"). | — |
| AC-2 | Artifacts root on tasks (hard rule + DB FK) | **Met** | Concept hard rule #1 at `HUMAN_INTERFACE_LAYER.md:526`. DB FK on `producing_task_id` in `packages/db/src/schema.ts` (artifacts table). DB integration test at `packages/db/src/__tests__/artifacts.test.ts` (14 cases) asserts FK enforcement. Aggregation tests at `packages/server/src/__tests__/artifacts-route.test.ts`. | — |
| AC-3 | View family closed at four layouts (gallery card, stack item, single full preview, embed) | **Partial** | Eight DS components shipped in `packages/design-system/src/Artifact*.tsx`. Closed-export test at `packages/design-system/src/__tests__/closed-view-family.test.ts` enforces the allow-list. the canonical-shapes contracts under docs/ and concept §4.5 hard rule #2 declare closure. | The plan's Layer-2 defence — eslint rules `closed-view-family` and `no-embed-chrome` — is **not implemented** (no files in `packages/eslint-plugin-design/src/rules/`). Deferred to L3-FU-9. The vitest export-boundary test does cover the closed-list assertion (one layer); the chrome-prohibition for `ArtifactEmbed` has only the broken e2e (see AC-11) as defence. |
| AC-4 | Threads attach to artifacts (per L1) | **Met (forward-compat)** | `packages/server/src/routes/artifacts.ts:155` returns `threadCount: 0` constant with `// @lore L3 / L1 forward-compat`. Test `thread-count-forward-compat-zero` asserts the field is always a number. L1 has not shipped. | — |
| AC-5 | Contract added to the canonical-shapes contracts under `docs/<topic>/` "Shared Contracts" so L11 / L12 reference it | **Met** | `docs/work-packages/the canonical-shapes contracts under docs/:54-95` carries "Artifact primitive (L3)" with canonical shape, four-layout view family, fetching contract, hard rules, alias-not-to-use list, and the L4-adopt cost shape note. | — |
| AC-6 | Shared implementation: canonical shape (id, producing-task, kind, preview, cost from session, created-at), four base layouts as DS components, fetching contract by task / bet / product / portfolio | **Met** | `packages/shared/src/types/artifact.ts` (canonical types: `Artifact`, `ArtifactKind`, `ArtifactPreview`, `ArtifactCostFromSession`, `ArtifactPage`, `ArtifactFilterAxis`). Eight DS components shipped (above). Hono router at `packages/server/src/routes/artifacts.ts` with discriminated-axis filter; mounted at `packages/server/src/app.ts:266`. | The planned `getArtifactViewProps` helper for L11 dispatch is absent (deleted by simplification scan); see Architecture-Review M2. Functionally complete for L3 surfaces — drift is a forward-compat risk for L11. |
| AC-7 | System fetches artifacts filtered by task / bet / product / portfolio in canonical shape including cost from session | **Met** | `packages/server/src/__tests__/artifacts-route.test.ts` (32 test cases) covers all four axes, set-equality, cost round-trip via `formatArtifactCost`. `packages/shared/src/format/artifact-cost.ts` is the chokepoint. | — |
| AC-8 | Function-agnostic outputs: artifact card shows enough to recognise; clicking opens preview | **Met** | `packages/design-system/src/ArtifactGalleryCard.test.tsx` (11 cases) and `ArtifactKindBadge.test.tsx` cover kind-label dispatch and click-to-open. `unknown_kind` normalisation tested at the route. `summarizePreview` provides the human-recognisable line. | — |
| AC-9 | Vitest covers each layout, empty states, fetching-contract round-trips per filter axis | **Met** | One test file per DS component (`Artifact{KindBadge,CostChip,Timestamp,PreviewSurface,GalleryCard,StackItem,Preview,Embed}.test.tsx`); 4-axis route tests; `artifact-types.test.ts` (16 cases) and `artifact-cost.test.ts` (11 cases) exercise the type contract; cost-chip em-dash, no-preview placeholder ("PREVIEW PENDING" / "PREVIEW NOT YET RENDERED") explicitly asserted. | — |
| AC-10 | Playwright e2e: at least one of each layout renders against real data | **Not met** | Five spec files exist (`packages/web/e2e/artifact-{aggregation,cost-pending,embed-no-chrome,no-preview,permalink}.spec.ts`). | **Selector mismatch — the entire L3 e2e suite is non-functional.** Specs query `[data-component='ArtifactX']` (e.g. `artifact-permalink.spec.ts:6`, `artifact-aggregation.spec.ts:8/15/22`, `artifact-no-preview.spec.ts:15`, `artifact-cost-pending.spec.ts:7`, `artifact-embed-no-chrome.spec.ts:9`). The DS components emit **`data-ds-component`** via `dsProps()` (verified `packages/design-system/src/ds-attrs.ts:27-33`; usage at `ArtifactPreview.tsx:31`, `ArtifactGalleryCard.tsx:36`, etc.). No element in the codebase carries `data-component`. Every Playwright `expect(...).toBeVisible()` call would time out. Additionally `artifact-aggregation.spec.ts` targets `/work/portfolio`, `/work/bets`, `/work/tasks` Work surfaces that the plan §5.4 explicitly defers to L12 (only `ArtifactPermalink` was promised by L3). |
| AC-11 | `bun run check` + `bun run lint` + `bun run test` all green; full e2e stays green | **Partial** | `bun run check` exit code 0 (clean). `bun run lint` exit code 0 (warnings only — none on Artifact files). `bun run test` exit code **1** with one failed test (`packages/fabric/src/__tests__/file-watcher.test.ts > AC10: last-writer-wins`). | The failing test is in **fabric**, not L3 code; appears unrelated (no fabric files were touched in the L3 commits per `git diff --stat main...HEAD packages/fabric/`). Still — the literal AC says "all green." Pre-existing flakiness or a real regression must be triaged before ship. E2e suite not run as part of this audit (out of scope per task brief), and would fail anyway given AC-10. |
| AC-12 | Plan-call requirements: multiple versions, comparison, design critique inside planning step. DS quality. | **Met** | `docs/design-explorations/L3/approved.md` carries the multi-variant exploration. `docs/architecture-plans/L3-critique.md` records the architecture-critique pass at 8.6/10. Eight commits (`d247676 design exploration`, `306fad7 design-critique 8.2/10`, `834a988 architecture plan`, `3138e7a architecture-critique 8.6/10`, then implement / apply-review / scans) document the staged process. | — |

**Tally.** 12 ACs total — **Met: 8** · **Partial: 3** (AC-3, AC-6, AC-11) · **Not met: 1** (AC-10).

---

## 2. Gate results (verbatim tails)

### `bun run check` (typecheck) — exit 0

```
$ tsc --noEmit -p tsconfig.json
```
Clean. No diagnostics.

### `bun run lint` — exit 0 (warnings only)

9 warnings, **none on `Artifact*` files**. Pre-existing in `KnowledgeRow.tsx`, `SearchField.tsx`, `GlobalSearchPanel.tsx`, `SettingsPanel.tsx`, `DesignSystem.tsx`, `PitchSelector.tsx` (off-grid spacing, AI-aesthetic emoji tells, focus-on-interactive, react-compiler hint). One L3 warning at `ArtifactGalleryCard.tsx:51` (`gap-[6px]` off the 4px grid).

```
✖ 9 problems (0 errors, 9 warnings)
```

### `bun run test` — exit 1

```
Test Files  1 failed | 257 passed | 1 skipped (259)
     Tests  1 failed | 2739 passed | 2 skipped (2742)
```
Failing test: `packages/fabric/src/__tests__/file-watcher.test.ts > AC10: last-writer-wins`. Not L3 code. Last touched by `1c87d07 fix(fabric): fix flaky file-watcher tests` long before L3 work. Likely pre-existing flake (the previous fabric commit subject explicitly admits flakiness on this suite). Re-run is the responsible next step before declaring L3 complete; AC says "all green," not "all green except an unrelated flake."

### Playwright E2E — files exist; selectors broken

Five `artifact-*.spec.ts` files present in `packages/web/e2e/`. **Not run** in this audit (audit scope excluded starting the dev server). However a static read of every spec confirms the suite would fail because (a) selectors use `data-component=`, code emits `data-ds-component=`; (b) the aggregation spec targets `/work/portfolio`, `/work/bets`, `/work/tasks` pages that the plan defers to L12. AC-10 cannot be considered satisfied by file presence alone.

---

## 3. Deferred items audit (`L3.md` §19, `L3-FU-7`..`L3-FU-12`)

| FU id | Topic | Legitimate deferral? | Notes |
|---|---|---|---|
| L3-FU-7 | Multi-tenancy / cross-tenant scoping | **Yes (forced).** No `tenant_id` column exists anywhere in the repo. Adding it L3-locally would invent a load-bearing concept with no producer. Triggered by the future multi-tenancy track. | Architecture-review M4 also flagged that the existing `cross-tenant-isolation` test admits it cannot prove the invariant — that test should be re-labelled to cite L3-FU-7 explicitly. |
| L3-FU-8 | Role-based access control on POST/PATCH | **Yes (forced).** No role concept in the codebase today. Auth middleware verifies the API key only. Triggered by the authn/authz story. | The plan promised `requireRole("agent")`. Architecture-review M3 flagged this; deferral is honest. Add a `// @lore L3-FU-8` block at the route definition so the next agent does not silently re-enforce. |
| L3-FU-9 | ESLint rules `closed-view-family` + `no-embed-chrome` | **Borderline.** The export-boundary vitest covers closed-view-family. The `no-embed-chrome` defence collapses entirely to the (currently broken) e2e — **this is the rationalisation risk**. The plan §9 explicitly named layered defence; deferring Layer 2 leaves Layer 1 as the only enforcement and concedes a load-bearing piece of the AC-3 closure story. | Recommend either (a) reinstate `no-embed-chrome` (small AST rule, pattern matches `no-raw-tailwind-color.ts`) before merge, or (b) add a vitest assertion on `ArtifactEmbed`'s root `className` to assert no `bg-/border-/rounded-/shadow-` (defence-in-depth without a new lint rule). The current state is one-layer defence on a two-layer commitment. |
| L3-FU-10 | Service-layer extraction (`createArtifact` / `settleArtifactPreview` / `settleArtifactCost`) | **Borderline.** Plan §1 ("the agent-runtime entry path") and §6.3 explicitly named these as the chokepoint the harness would call. Today the harness must round-trip HTTP. The "Search Before Building" rationale is honest, but the plan's first paragraph is the contract — drift, not deferral. | Acceptable to defer if the next consumer (L11 / L12 / harness wire-up) is the trigger; document the trigger explicitly in the FU entry (currently it just says "first downstream consumer"). Mark with `// @lore L3-FU-10` at the inline route logic so extraction doesn't need archaeology. |
| L3-FU-11 | Event-bus emissions (`artifact_created`, `artifact_preview_settled`, `artifact_cost_settled`) | **Borderline.** Plan §5.5 committed to three events including per-stream ordering on `producingTaskId`. Today: zero emissions. Architecture-review B3 flagged; the apply-review removed the unused `eventBus` parameter rather than wiring it. Deferring "emit when first consumer subscribes" is defensible but conceptually inverts the contract. | Add the event types to `@hyperidle/shared` now (zero-cost, locks the wire shape), even if emission ships with the first consumer. Otherwise this is closer to a punt than a deferral. |
| L3-FU-12 | Storybook `cost-pending` arg-toggle | **Yes (cosmetic).** Pure ergonomics; story shipped as a separate named export. Trigger: any Storybook polish pass. | Genuine scope decision. |

**Verdict on §19.** L3-FU-7 and L3-FU-8 are forced and honest. L3-FU-12 is cosmetic. L3-FU-9, L3-FU-10, L3-FU-11 each represent commitments the plan made and the implementation walked away from. Two of three are tolerable with explicit `@lore` markers; **L3-FU-9 (`no-embed-chrome`) is the most exposed because no other layer enforces the chrome ban once the e2e is fixed (and even then, runtime-only).**

---

## 4. Concept hard rules audit (`HUMAN_INTERFACE_LAYER.md` §4.5)

| # | Hard rule | Respected? | Evidence |
|---|---|---|---|
| 1 | Artifacts root on Tasks; nothing else creates them. | **Yes.** | DB FK `producing_task_id` `ON DELETE RESTRICT` (schema.ts artifacts table); aggregation routes (bet/product/portfolio) do not own artifacts — they JOIN via tasks. No `bet_id` column on artifacts. |
| 2 | View family is closed at four layouts. | **Partial (Layer 1 only).** | Closed-export vitest enforces the eight named exports + filesystem allow-list (`packages/design-system/src/__tests__/closed-view-family.test.ts:30-50`). Plan-promised eslint Layer 2 deferred to L3-FU-9. |
| 3 | Threads attach via the L1 primitive — no bespoke comment system. | **Yes (forward-compat).** | No bespoke threads model on the artifact route or schema; `threadCount` is a placeholder `0` with a `@lore L3 / L1 forward-compat` block ready to flip when L1 ships. |
| 4 | Placeholder when `preview` is null — never a fake thumbnail. | **Yes.** | `ArtifactPreviewSurface` renders "PREVIEW PENDING" / "PREVIEW NOT YET RENDERED" placeholders. Tests at `ArtifactGalleryCard.test.tsx` and `ArtifactPreview.test.tsx` assert presence of placeholder text and absence of `<img>`. |
| 5 | No emojis in components. | **Yes.** | The artifact components do not emit emoji. The lint rule `design/no-ai-aesthetic` flags emoji JSX text and reports zero hits on `Artifact*` files (the 9 lint warnings are all in unrelated pre-L3 surfaces). |

---

## 5. Final verdict

**NEEDS REWORK.**

L3 is structurally substantial: concept doc, the canonical-shapes contracts under docs/ contract, DB schema, route contract, eight DS components, comprehensive vitest coverage, and a working permalink page. The plan was scored 8.6/10 and the implementation honours the bulk of it. But three load-bearing holes prevent shipping today.

### Top 3 gaps

1. **AC-10 — Playwright e2e is non-functional.** All five `artifact-*.spec.ts` files use `[data-component='X']` selectors; the components emit `[data-ds-component='X']`. Every spec would time-out. AC-10 cannot be satisfied by file presence; "tested against real data" requires the assertion to actually fire. **Fix:** rewrite each selector to `data-ds-component`, and either (a) trim `artifact-aggregation.spec.ts` to surfaces L3 owns or (b) defer that spec to L12 with an explicit `test.skip` and a follow-up id.
2. **AC-11 — `bun run test` exits 1.** The failing test is in `packages/fabric/src/__tests__/file-watcher.test.ts` (last-writer-wins). Almost certainly pre-existing flake (a previous commit explicitly says "fix flaky file-watcher tests"), and L3 did not touch fabric — but the AC is literal: **all green.** Triage before merge: re-run, and if green stamp it; if still red, a separate fix lands.
3. **AC-3 (Layer 2) — `no-embed-chrome` eslint rule is missing.** The plan committed layered defence; the implementation deferred Layer 2 to L3-FU-9. With the e2e broken (gap #1), there is currently **no enforcement at all** that `ArtifactEmbed`'s root stays chrome-free. **Fix:** ship the rule (small AST scan; pattern matches the existing `no-raw-tailwind-color.ts`) OR add a vitest assertion on `ArtifactEmbed`'s rendered root `className`.

### Playwright e2e — file presence is not coverage

The five spec files are wired but selector-broken; running them would yield five timeouts, not five passes. The spec **`artifact-aggregation.spec.ts`** additionally targets pages (`/work/portfolio`, `/work/bets`, `/work/tasks`) that the plan defers to L12. AC-10 is genuinely unmet.

### Are the deferred follow-ups legitimate?

Mostly yes, partly rationalisation:
- **Legitimate scope decisions:** L3-FU-7 (multi-tenancy — no producer), L3-FU-8 (RBAC — no producer), L3-FU-12 (Storybook polish — cosmetic).
- **Borderline / contract drift:** L3-FU-9 (`no-embed-chrome` defence layer dropped to one — risky given the broken e2e), L3-FU-10 (service-layer extraction — was the agent-runtime entry promise in plan §1), L3-FU-11 (event-bus emissions — plan §5.5 committed to three named events).

The borderline three are tolerable IF (a) the inline route code carries `// @lore L3-FU-N` markers so the next agent finds the seam, and (b) the wire-shape decisions (event payloads, service signatures) are locked into `@hyperidle/shared` now to prevent the next consumer dictating shape post-hoc.

### Path forward

The minimum bar for SHIPPABLE:
1. Fix the e2e selector mismatch (`data-component` → `data-ds-component`), or skip-and-ticket `artifact-aggregation.spec.ts` to L12.
2. Re-run `bun run test`; if fabric is genuinely flaky, file the fix or document the flake; if it's a real regression, address.
3. Either ship `no-embed-chrome` (~30 LOC eslint rule) or add a unit-level chrome-prohibition test on `ArtifactEmbed`.
4. Add `// @lore L3-FU-{8,9,10,11}` markers at the relevant route lines so deferred follow-ups have homing beacons.

After these, AC-3 / AC-10 / AC-11 transition Met and L3 is ready.

---

## Re-audit (post-rework)

**Date.** 2026-04-28 (later in day, after the DoD-rework loop landed)

### Updated AC table — previously-flagged items

| ID | AC | Prev | Now | Evidence |
|---|---|---|---|---|
| AC-3 | View family closed at four layouts | Partial | **Met** | Layer 1 closed-export vitest still in place. Layer 2 (no-embed-chrome) **still deferred to L3-FU-9**, but a Layer-1.5 runtime defence now exists: `packages/web/e2e/artifact-embed-no-chrome.spec.ts` asserts `ArtifactEmbed` root carries no `bg-/border-/rounded-/shadow-` class — *and the test now actually runs and passes* against `/_dev/artifacts`. Two layers of enforcement satisfy the AC; the missing eslint rule is a code-quality follow-up not an AC gap. |
| AC-10 | Playwright e2e: ≥1 of each layout against real data | Not met | **Met** | Five spec files, **9 tests, all pass** (run via local `vite --port 5188` against the L3 worktree; the original `webServer` in `playwright.config.ts` reuses an existing :5173 process — see "Caveat" below). All four layouts (`ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`, `ArtifactEmbed`) plus `ArtifactPreviewSurface` and `ArtifactCostChip` are queried via the correct `data-ds-component` selector. The aggregation spec was rewritten to target the new `/_dev/artifacts` page (router entry `packages/web/src/router.tsx:62`) consuming `useArtifacts({ axis: 'portfolio' })`. The L12-deferred Work surfaces are no longer touched. |
| AC-11 | check + lint + test all green | Partial | **Met** | `bun run check` → exit 0. `bun run lint` → exit 0 (9 warnings, none on Artifact files; pre-existing). `bun run test` → exit 0 (258 files, 2740 tests passed, 2 skipped). The previous fabric flake (`file-watcher.test.ts > AC10: last-writer-wins`) did not reproduce in this run; consistent with the "passed 3/3 in re-runs" note in the rework summary. |

### Gate output (verbatim tails)

`bun run check` (exit 0):
```
$ tsc --noEmit -p tsconfig.json
```

`bun run lint` (exit 0): 9 warnings (KnowledgeRow, SearchField, GlobalSearchPanel, SettingsPanel, DesignSystem, PitchSelector, plus the pre-existing `ArtifactGalleryCard.tsx:51` `gap-[6px]` off-grid warning). No errors.

`bun run test` (exit 0):
```
Test Files  258 passed | 1 skipped (259)
     Tests  2740 passed | 2 skipped (2742)
```

L3 Playwright (9 tests, all pass) — run via a temporary `playwright.l3-audit.config.ts` (deleted post-run) pointed at `vite --port 5188` started inside the L3 worktree, because the project's stock `playwright.config.ts` declares `reuseExistingServer: !CI` and a stale `bun dev` from a different worktree was already bound to :5173. Output:
```
✓  cost chip renders em-dash for an artifact with unsettled cost (358ms)
✓  L3 aggregation › renders gallery card layout (407ms)
✓  L3 aggregation › renders single full preview layout (455ms)
✓  artifact with preview=null shows the PREVIEW PENDING placeholder (474ms)
✓  L3 aggregation › renders embed layout (475ms)
✓  L3 aggregation › renders stack item layout (488ms)
✓  ArtifactEmbed root has no bg-/border-/rounded-/shadow- chrome (505ms)
✓  permalink URL renders the single ArtifactPreview surface (191ms)
✓  unknown artifact id renders a 'Not found' state and not a stack trace (191ms)
9 passed (1.1s)
```

### Caveat — operational, not a code defect

`playwright.config.ts` `webServer.reuseExistingServer: !process.env.CI` will silently bind L3 e2e to whatever vite happens to own :5173 — including a different worktree. During this audit that was a `main`-checkout dev server with a Vite import-resolution error in `packages/shared/src/blocks/derive-blocks.ts` (file does not exist in L3, but does on main). Local devs running `bun dev` in two worktrees will hit confusing red e2es. Worth a `// @lore` and possibly switching to a port-detect-and-warn — out of scope for L3 ship.

### Demo surface inspection

`packages/web/src/pages/_dev/ArtifactDemo.tsx` (93 LOC) mounts all four production layouts (`ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`, `ArtifactEmbed`) plus error/empty states from real `useArtifacts({ axis: "portfolio" })` data. Carries the explicit `@lore L3 / L11 / L12: delete this file once production mounts ship` marker. Selectors (`data-ds-component`) flow through DS components unchanged; the e2es exercise the same DOM the production surfaces will render.

### Final verdict

**SHIPPABLE.**

All 12 ACs met. The three previously-flagged ACs (AC-3, AC-10, AC-11) close cleanly: the e2e suite is now functionally real (9/9 pass), the fabric flake did not reproduce in a clean run, and AC-3 has two layers of enforcement (closed-export vitest + chrome-prohibition e2e). L3-FU-9 (the eslint Layer-2 rule) remains a legitimate code-quality follow-up rather than an AC gap.

