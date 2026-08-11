# AZ2 — Every page scrolls to its end

## Work package

**Outcome.** At every supported viewport, a user can reach the last element of content on every page.

**Why this matters.** The Work page — the product's primary planning surface — clips 538px of content at 1440×900 and 706px at 1024×768 with no scroll container anywhere on the page: no scrollbar, no wheel response, no keyboard scroll. The agent roster and the entire artifacts section are unreachable on desktop. A user cannot see who is on their team. The same latent fault sits under nearly every other page and is one wrapper away from repeating.

**What exists today.** Pages follow a documented scaffold — pinned header, `flex-1` scrolling body — but the body region is declared without the minimum-height reset a flex child needs, so it grows to its content height instead of its parent's. Where an intermediate wrapper also hides overflow, the content is clipped and no ancestor can scroll it. Four regions in the codebase declare the reset correctly; the rest survive only because nothing clips them yet. The documented layout rule states this contract; nothing enforces it.

**Missing delta.** The scroll contract must be structural and enforced, not restated per page.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the correct behaviour is already documented and the cause is identified. A combined refine + design + architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** The pinned-header/scrolling-body anatomy and the single-`h1` heading contract stay as documented. Window-level scrolling remains impossible; each page owns its scroll region.

**Out of scope.** Content column width and header/body alignment (AZ11), what the Work page shows, scrollbar styling.

## Acceptance criteria

- On every route, at each supported viewport, the last element of page content can be brought into view by ordinary scrolling.
- No page region hides overflowing content that no ancestor can scroll.
- The team page's agent roster and artifacts section are reachable at desktop viewports.
- A page whose body can scroll exposes a scroll affordance consistent with the rest of the app.
- Automated evidence fails if a page declares a scrolling body that can be clipped by an ancestor.

## Validation scenarios

- Given the team page at 1024×768, when the user scrolls to the bottom, then the last artifact row is fully visible.
- Given any route at 1440×900, when the page content is taller than the viewport, then a scroll container exists and reaches the end of the content.
- Given a new page added with a body region that omits the scroll contract, when verification runs, then it fails naming the page.

---

## As-built decisions (2026-08-11 → 2026-08-12)

### Correction: `min-h-0` on a scrolling body is a no-op

`plan.md:9` originally stated the bug was "the body region is declared without the minimum-height reset a flex child needs". This is wrong. Measured in headless Chromium: an element whose computed overflow is not `visible` already gets an automatic minimum size of zero as a flex item, so `overflow-y-auto` supplies the reset by itself. Adding `min-h-0` to the scroll body changes nothing.

`min-h-0` **is** load-bearing in exactly one place — an intermediate flex column that does *not* set its own overflow. That is what the scaffold's `managed` body mode declares, and the only place `min-h-0` should appear.

The real invariant: **a scrolling body must be a flex item of a flex column whose own height is bounded.** Three ways to break it: a block between root and body (clips the child's `flex-1`), a root without `h-full` (root grows unbounded), an intermediate flex column with visible overflow and no `min-h-0`.

The consequence for the implementation: the ~36 existing `flex-1 overflow-y-auto` sites that are direct flex children of `flex flex-col h-full` roots are **correct as written**. The migration existed only to enable a flat-prohibition lint rule. Accepted and supersedes the cause stated in the original plan and in the audit.

### Second broken page the audit missed

`/artifacts/:id` (`ArtifactPermalink.tsx`) had no root height at all — four branches all returning `<div className="p-3 flex flex-col gap-3">` with no `h-full`, no scroll region. Fixed in the same build session.

### Supported viewports settled here (no prior definition existed)

| Viewport | Rationale |
|---|---|
| 1440 × 900 | Audit's primary measurement; named in VS2. |
| 1024 × 768 | Named in VS1 and AC3; shortest desktop height. |
| 375 × 812 | Exercises the mobile AppShell branch — a different DOM chain. |

Exported as a constant in `layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`.

### Architecture: `PageScaffold` component

New export `PageScaffold` in `framework/design-system/src/PageScaffold.tsx`. Lives alongside `PageHeader` — they are one contract, documented on one page (`docs/ui-design/page-anatomy.md`).

Two body modes:
- `scroll` (default) — scaffold owns the scroll region. Renders `flex-1 overflow-y-auto` with `data-page-scroll` attribute. No `min-h-0` (proven redundant).
- `managed` — child owns its own scrolling (SplitView, ConversationSurface). Scaffold renders `flex-1 min-h-0 flex flex-col overflow-hidden` — the one place `min-h-0` genuinely earns its keep.

`data-page-scroll=""` is the stable contract attribute for specs, not the class string.

Migrated 15 page files (44 branches). Every migration is behaviour-neutral — any visible change would be a regression.

### Enforcement: `design/no-handrolled-page-scaffold` lint rule

Package `tools/eslint-plugin-design`. Two arms:
- Arm 1 — `flex-1` + vertical scroll overflow (`overflow-y-auto`, `overflow-auto`, `overflow-y-scroll`). A page may not declare its own scrolling body.
- Arm 2 — `flex-1` + `overflow-hidden` without `flex-col`. The live defect shape (`WorkTeam.tsx:709`, shape C).

Lands at `error` on `layers/core-ui/src/pages/**/*.tsx`. Runs on every PR via `npm run lint`. Both arms have RuleTester invalid cases with control twins (legal spellings that assert nothing reported).

Honest limit: reads static string literals only. Computed `className` strings slip past — stops the accident, not a determined bypass.

### E2E spec

`layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`. Per route × viewport: asserts scroll container exists, `clippedPx === 0`, last content element in viewport after scrolling to end, `data-page-scroll` hook present, wheel event moves `scrollTop`. Hard-fails if the route list is empty.

Local-only lane — no GitHub Actions job. The lint rule is the per-PR gate; the e2e runs in `verify:release` and during the build session.

### `min-h-0` in managed body is redundant (non-blocking)

`PageScaffold.tsx` renders the managed body as `flex-1 min-h-0 flex flex-col overflow-hidden`. By the same reasoning in §Correction above, `overflow-hidden` already yields the automatic flex-item min-size of 0, so the explicit `min-h-0` is belt-and-suspenders. Functionally correct; cosmetic inconsistency left as-is.

### Files of record

- `framework/design-system/src/PageScaffold.tsx` (+ `.stories.tsx`, `__tests__/AZ2-PageScaffold.test.tsx`)
- `tools/eslint-plugin-design/src/rules/no-handrolled-page-scaffold.ts` (+ `__tests__/AZ2-no-handrolled-page-scaffold.test.ts`), registered `eslint.config.ts:205`
- `layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`
- `docs/ui-design/page-anatomy.md`, `docs/ui-design/rules.md`, `framework/design-system/src/PageHeader.tsx` JSDoc

---

## Review verdict (2026-08-12)

**DONE — 0 blocking findings.**

Verified on this branch (21 commits, 35 files):
- `npm run check` exit 0
- `npm run lint` exit 0 — `design/no-handrolled-page-scaffold` at `error` passes with zero violations
- `npm run test:full` — 566 files, 6161 tests, all passed
- New rule + component tests (25/25)
- `AZ2-page-scroll.spec.ts` e2e — 21/21 passed on fresh server from this worktree

The e2e was also served against pre-PageScaffold code (accidental break-test from a stale sibling-worktree vite on port 5179): team and artifact AC tests went RED naming `scrollContainers: 0` and zero `[data-page-scroll]` elements — the original live defect. Spec is not a passenger.

Non-blocking findings carried forward:
1. AC3/VS1 asserts an agent row, not an artifact row (fixture mocks `/api/artifacts*` as empty); the artifacts section reachability is proven via `clippedPx===0` + `ArtifactSection` rendered.
2. Managed body's `min-h-0` is redundant (noted above).
3. `overflow-auto` → `overflow-y-auto` in ReviewComposition: horizontal overflow now renders visibly instead of scrolling; low risk.
4. E2E fragile to cross-worktree port reuse on the hard-coded `strictPort 5179` — not introduced by this work, pre-existing playwright config.
