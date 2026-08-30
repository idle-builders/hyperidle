# AZ2 — Every page scrolls to its end

## Work package

**Outcome.** At every supported viewport, a user can reach the last element of content on every page.

**Why this matters.** The Work page — the product's primary planning surface — clipped 538px of content at 1440×900 and 706px at 1024×768 with no scroll container anywhere on the page: no scrollbar, no wheel response, no keyboard scroll. The agent roster and the entire artifacts section were unreachable on desktop. The same latent fault sat under nearly every other page, one wrapper away from repeating. The documented layout rule stated the contract; nothing enforced it. The delta is a scroll contract that is structural and enforced, not restated per page.

**Complexity.** M · **Engineering tier.** mvp · **Depends on.** None.

**Execution procedure (founder decision, 2026-08-11).** Skip the standard phase set. One agent runs a single **combined refine + design + architecture round** and stops. The founder approves that one artifact before any code. The same agent then builds in one session — tests, then code. One fresh agent reviews, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after approval. The orchestrator does not add phases to this.

**Constraints.** The pinned-header/scrolling-body anatomy and the single-`h1` heading contract stay as documented. Window-level scrolling remains impossible; each page owns its scroll region.

**Out of scope.** Content column width and header/body alignment (AZ11), what the Work page shows, scrollbar styling.

## Acceptance criteria

- On every route, at each supported viewport, the last element of page content can be brought into view by ordinary scrolling.
- No page region hides overflowing content that no ancestor can scroll.
- The team page's agent roster and artifacts section are reachable at desktop viewports.
- A page whose body can scroll exposes a scroll affordance consistent with the rest of the app.
- Automated evidence fails if a page declares a scrolling body that can be clipped by an ancestor.

---

# As built (2026-08-11 → 2026-08-12)

## Correction: `min-h-0` on a scrolling body is a no-op

The plan and the audit both blamed a missing minimum-height reset on the body region. That is wrong,
and measured wrong in headless Chromium: an element whose computed overflow is not `visible` already
gets an automatic flex-item minimum size of zero, so `overflow-y-auto` supplies the reset by itself.
Adding `min-h-0` to a scroll body changes nothing.

`min-h-0` **is** load-bearing in exactly one place — an intermediate flex column that does *not* set
its own overflow. That is the scaffold's `managed` body mode, and the only place it should appear.

The real invariant: **a scrolling body must be a flex item of a flex column whose own height is
bounded.** Three ways to break it — a block element between root and body (it clips the child's
`flex-1`), a root without `h-full` (it grows unbounded), an intermediate flex column with visible
overflow and no `min-h-0`.

Consequence: the ~36 existing `flex-1 overflow-y-auto` sites that are direct flex children of
`flex flex-col h-full` roots were **correct as written**. The migration existed only to enable a flat
prohibition lint rule, not to fix them.

The audit also missed a second broken page: `/artifacts/:id` (`ArtifactPermalink.tsx`) had no root
height at all — four branches each returning `<div className="p-3 flex flex-col gap-3">`, no `h-full`,
no scroll region.

## Supported viewports, settled here

No definition existed before. Exported as a constant in `layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`.

| Viewport | Why |
|---|---|
| 1440 × 900 | The audit's primary measurement. |
| 1024 × 768 | Shortest desktop height. |
| 375 × 812 | Exercises the mobile AppShell branch — a different DOM chain. |

## Architecture: `PageScaffold`

`framework/design-system/src/PageScaffold.tsx`, alongside `PageHeader` — they are one contract,
documented on one page (`docs/ui-design/page-anatomy.md`). Two body modes:

- `scroll` (default) — the scaffold owns the scroll region: `flex-1 overflow-y-auto` plus the
  `data-page-scroll` attribute. No `min-h-0`, proven redundant above.
- `managed` — the child owns its scrolling (SplitView, ConversationSurface). Renders
  `flex-1 min-h-0 flex flex-col overflow-hidden`. Its `min-h-0` is *also* redundant by the same
  reasoning (`overflow-hidden` yields the automatic min-size) and was left as belt-and-braces.

`data-page-scroll=""` is the stable contract attribute for specs — never the class string. 15 page
files (44 branches) migrated; every migration is behaviour-neutral, so any visible change is a
regression.

## Enforcement

`design/no-handrolled-page-scaffold` in `tools/eslint-plugin-design`, at `error` on
`layers/core-ui/src/pages/**/*.tsx`, running on every PR via `npm run lint`. Two arms: `flex-1` plus a
vertical scroll overflow (a page may not declare its own scrolling body), and `flex-1` plus
`overflow-hidden` without `flex-col` (the live defect shape). Both have RuleTester invalid cases with
control twins that assert nothing is reported.

**Honest limit:** it reads static string literals only. A computed `className` slips past. It stops
the accident, not a determined bypass.

`layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts` asserts, per route × viewport, that a scroll container
exists, `clippedPx === 0`, the last content element is in view after scrolling to the end, the
`data-page-scroll` hook is present, and a wheel event moves `scrollTop`. It hard-fails on an empty
route list. Local-only lane, running in `verify:release` — the lint rule is the per-PR gate. The spec
was accidentally served against pre-PageScaffold code and went red naming `scrollContainers: 0`, so it
is not a passenger.

## Known residue

`ReviewComposition` moved from `overflow-auto` to `overflow-y-auto`, so horizontal overflow there now
renders visibly instead of scrolling. Low risk, accepted. The e2e is fragile to cross-worktree port
reuse on the hard-coded `strictPort 5179` — pre-existing playwright config, not introduced here.
