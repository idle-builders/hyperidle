# AZ2 — Every page scrolls to its end

Combined requirement + shape + technical plan. One artifact, one approval, then one build session.

Engineering tier `mvp`. Everything below is measured, not remembered: CSS behaviour was proven in headless
Chromium (probe results quoted inline), and every claim about the shipped code carries a `file:line`.

---

## 1. Requirement, sharpened

### What "scrolls to its end" means

A page satisfies this when **all three** hold at a supported viewport, with content taller than the space
the app gives it:

1. **A scroll container exists inside the page.** Some element on the page has
   `scrollHeight > clientHeight` and a computed `overflow-y` of `auto` or `scroll`.
2. **Nothing is clipped that no container can reach.** No element's content extends past an ancestor with
   hidden overflow unless some ancestor between them can scroll to it. Measured as `clippedPx === 0`, the
   same measure the audit used (`plans/reviews/ui-audit-consolidated.md:27`).
3. **Scrolling that container to its end puts the last element of page content fully in view** — its
   bottom edge inside the container's visible box, not merely present in the DOM.

Point 3 is the one that matters to a user and the one a class-name check cannot see. It needs a real
browser.

### Supported viewports

**There is no definition of "supported viewport" anywhere in this repo.** I looked for one:

- The only breakpoint in production code is a single mobile cut at `≤768px`
  (`layers/core-ui/src/hooks/useViewportBreakpoint.ts:23`), which switches `AppShell` between its mobile
  branch (`layers/core-ui/src/layouts/AppShell.tsx:645`) and its desktop branch (`AppShell.tsx:821`).
- E2E specs pick widths ad hoc: 24 uses of 1440, 3 of 1024, one each of 768, 390, 375, 1000, 1200, 1280,
  1920, 2000. No shared constant, no helper — `layers/core-ui/__e2e__/support/` holds only
  `review-trust.ts`, `validation-composition.ts`, `validation-contract.ts`.

So this work package has to name the set. Proposed, and small on purpose:

| Viewport | Why it is in the set |
|---|---|
| 1440 × 900 | Named in plan.md validation scenario 2 and the audit's primary measurement. |
| 1024 × 768 | Named in plan.md validation scenario 1 and AC3. The shortest desktop height — worst case. |
| 375 × 812 | Exercises the *other* AppShell branch (`AppShell.tsx:645`), which is a different DOM chain. |

The set lands as one exported constant next to the new spec so it stops being folklore. **Fork B below**
covers whether to keep the mobile row.

### Out of scope (from plan.md, restated so the builder does not drift)

- Content column width, header/body left-edge alignment — AZ11.
- What the team page chooses to show.
- Scrollbar styling of any kind.
- The pinned-header anatomy and the single-`<h1>` contract stay exactly as documented.
- Window-level scrolling stays impossible; each page owns its own scroll region.

---

## 2. Resolved questions

### 2.1 "Work page" vs "the team page" — the same page, two names

plan.md's narrative says the **Work page** clips; AC3 says the **team page's** roster and artifacts.
Settled: they are one route.

- The route is `work/team/:teamId` → `WorkTeam` (`layers/core-ui/src/router.tsx:82`).
- The sidebar's **Work** entry navigates straight to it when the org has one team
  (`AppShell.tsx:311-313`), so a one-team user reaches it by clicking "Work" and never sees `/work`.
- The mobile header labels `/work/team/` as **"Work"** (`AppShell.tsx:498`).
- The audit names both: *"`/work` and `/work/team/:id` cannot scroll … `/work` short-circuits to the team
  page for a 1-team org, so both routes are dead"* (`plans/reviews/ui-audit-consolidated.md:38,48`).

`/work` itself (`WorkOverview`) is **not** broken — its root and body are the correct shape
(`WorkOverview.tsx:132` + `:146`). It only appears dead because it redirects into the broken page.

**Answer for the artifact: the affected page is `WorkTeam` at `/work/team/:teamId`, which users call
"Work". AC3's wording is the accurate one.**

### 2.2 The documented rule vs the shipped code

`docs/ui-design/page-anatomy.md:13-19` documents the scaffold:

```tsx
<div className="flex flex-col h-full">
  <PageHeader title="…" />               {/* shrink-0 — pinned */}
  <div className="flex-1 overflow-y-auto">…</div>
</div>
```

restated again at `docs/ui-design/rules.md:10` and a third time in JSDoc at
`framework/design-system/src/PageHeader.tsx:10-13`.

**The rule is correct but incomplete, and the incompleteness is exactly the bug.** It shows the body as a
*direct child* of the root and never says that it must be. Three pages insert a plain block between them:

- `WorkTeam.tsx:709` — `<div className="flex-1 overflow-hidden">`
- `WorkRoutine.tsx:131` — same
- `Conversations.tsx:579` — same

Two of those three survive because their child re-establishes a bounded box (`RoutineDetailPane.tsx:270`
is `flex flex-col h-full`; `ConversationSurface` likewise). `WorkTeam`'s does not — `WorkTeam.tsx:294` is
`flex-1 overflow-y-auto` with no height of its own, and `flex-1` on a child of a *block* does nothing.

**Resolution:** the documented rule stops being prose that pages copy and becomes a component they call.
The doc is rewritten to describe the component and the two body modes. Details in §4.

### 2.3 The `min-h-0` claim in plan.md and in the audit is wrong

This is the disagreement the track constraint tells me to resolve rather than pick a side on, and it
changes the plan materially.

plan.md:9 says *"the body region is declared without the minimum-height reset a flex child needs, so it
grows to its content height instead of its parent's"*, and the audit generalises it:
*"**every** page scroller in the repo is `flex-1 overflow-y-auto` without `min-h-0` (30+ sites) … The
others survive by luck"* (`plans/reviews/ui-audit-consolidated.md:50`).

I measured it in headless Chromium — the exact class chain from `AppShell` down, 400px shell, 1200px
content:

| Shape | Root height | Body height | Scroll containers |
|---|---|---|---|
| **A** documented scaffold, body `flex-1 overflow-y-auto`, **no** `min-h-0` | 400 | 360 | **1** |
| **B** identical **plus** `min-height:0` on the body | 400 | 360 | **1** |
| **C** block wrapper between root and body (the `WorkTeam` shape) | 400 | **1200** | **0** |
| **D** block wrapper, child re-declares `height:100%` (the `WorkRoutine` shape) | 400 | 360 | 1 |
| **E** root without `h-full` | **1240** | 1200 | **0** |
| **F** intermediate flex column, overflow visible, no `min-h-0` | 400 | 1200 | **0** |
| **G** shape F **plus** `min-height:0` on the intermediate | 400 | 320 | **1** |

A and B are byte-identical in layout. `min-h-0` on the scroll body is a **no-op**: an element whose
computed overflow is not `visible` already gets an automatic minimum size of zero as a flex item, so
`overflow-y-auto` supplies the reset by itself. Adding `min-h-0` to 36 page bodies would change nothing
and would not have prevented the team-page defect.

`min-h-0` **is** load-bearing in exactly one place — shape F, an intermediate flex column that does *not*
set its own overflow (F fails, G passes). That shape is what the scaffold's second body mode has to
declare, and it is the only place `min-h-0` should be written.

The real invariant, stated once:

> **A scrolling body must be a flex item of a flex column whose own height is bounded.**

Three proven ways to break it: a block between root and body (C), a root that never fixes its height (E),
an intermediate flex column with visible overflow and no `min-h-0` (F).

**Consequences.** The "30+ sites survive by luck" framing is wrong — the ~36 sites that are
`flex-1 overflow-y-auto` as a direct child of `flex flex-col h-full` are **correct as written**. The
migration below is therefore not a defect sweep. It exists for one reason only: so the enforcement rule
can be a flat prohibition instead of a heuristic. That is a weaker justification than plan.md assumed,
and it is why Fork A is a real fork.

### 2.4 A second broken page the audit missed

`/artifacts/:id` has no scaffold at all — `ArtifactPermalink.tsx:36` returns
`<div className="p-3 flex flex-col gap-3">` holding an `ArtifactPreview` plus a `HostThreadSection`
discussion thread. No root height, no scroll region: shape **E**. Its three other branches
(`:18`, `:23`, `:29`) are the same. Whenever the artifact plus its thread exceeds the pane, the tail is
unreachable. `UNVERIFIED` live — the builder confirms it in the browser before and after.

Every other route page is the correct shape. `ReviewPage.tsx:203` looks bare but delegates to
`ReviewComposition.tsx:753` (`flex h-full flex-col`) + `:760` (`min-h-0 flex-1 overflow-auto`) — a fifth
correct region the audit's `overflow-y-auto` grep missed because it spells it `overflow-auto`. **The lint
rule must therefore match `overflow-auto` and `overflow-y-scroll`, not just `overflow-y-auto`.**

### 2.5 Measured population

Production files only, stories and tests excluded.

| | Count | Where |
|---|---|---|
| Regions declaring a scrolling body (`flex-1` + a scroll overflow) | 40 | across 24 files |
| …of which also declare `min-h-0` | **5** | `Sidebar.tsx:656`, `NotificationPopover.tsx:177`, `SettingsHarnesses.tsx:351`, `RichMessageCard.tsx:503`, `ReviewComposition.tsx:760` |
| Page roots spelled `flex flex-col h-full` under `pages/` | **44** | 15 files |
| Intermediate wrappers that hide overflow between root and body | **3** | `WorkTeam.tsx:709`, `WorkRoutine.tsx:131`, `Conversations.tsx:579` |
| Pages with no scaffold at all | **1** | `ArtifactPermalink.tsx` (4 branches) |
| Pages that actually cannot scroll today | **2** | `WorkTeam` (audit-verified live), `ArtifactPermalink` (static, unverified live) |

plan.md says four regions declare the reset; it is five — `ReviewComposition.tsx:760` was missed for the
spelling reason above.

---

## 3. User-facing shape

### What changes on screen

**On the team page, everything below the fold becomes reachable.** Today the AGENTS heading is visible and
its roster plus the entire ARTIFACTS section are not — 538px of content cut off at 1440×900, 706px at
1024×768, with the wheel doing nothing (`plans/reviews/ui-audit-consolidated.md:40`). After the fix the
page scrolls and ends at the last artifact row. No layout, spacing, or content changes — the same DOM,
now reachable.

**On `/artifacts/:id`, a long artifact plus its discussion becomes reachable.** Same nature of change.

**Every other page looks and behaves identically.** The migration replaces hand-written class strings with
a component that emits the same class strings. If any page looks different afterwards, that is a
regression, not an improvement.

### The scroll affordance (AC4)

"Consistent with the rest of the app" has a concrete answer here, and it is *do nothing extra*:

- The app defines **no scrollbar styling at all** — zero matches for `scrollbar`, `::-webkit-scrollbar`,
  `scrollbar-width` or `scrollbar-gutter` anywhere in `layers/core-ui/src` or
  `framework/design-system/src`. Every scrolling region shows the platform's own scrollbar.
- Every existing scroll region is a plain `<div>` with an overflow class and **no `tabIndex`, no `role`,
  no ARIA** — `Sidebar.tsx:656`, `NotificationPopover.tsx:177`, `SettingsHarnesses.tsx:351`,
  `ReviewComposition.tsx:760`.

So "consistent" means: **a real `overflow-y-auto` container and nothing on top of it.** The platform draws
the scrollbar, the wheel and trackpad work, and keyboard scrolling works once focus is inside the region —
exactly as the sidebar and the notification popover behave today. Scrollbar styling is out of scope by
plan.md, which is consistent with this answer.

I considered adding `tabIndex={0}` to make the body keyboard-scrollable without first focusing something
inside it, because plan.md:7 lists "no keyboard scroll" among the symptoms. **Recommendation: do not.** It
would put a focus ring on every page body and insert a stop in every page's tab order — a *new*
inconsistency with all five existing scroll regions, to fix a symptom that is really just "there is no
scroll container". Once the container exists, keyboard scrolling behaves as it does everywhere else in the
app.

### Forks for the founder

**Fork A — how much to migrate.** *(the real decision)*

|  | A1 — migrate every page (**recommended**) | A2 — fix the two broken pages only |
|---|---|---|
| Touches | 15 page files, 44 branches, ~180 line-touches | 2 files, ~10 line-touches |
| Enforcement rule | flat prohibition: a page may not hand-write a scrolling body — the message names the file and points at the component | must tolerate 42 legal hand-written scaffolds, so it can only guess at the broken shapes |
| Next page added | cannot get this wrong; the scaffold is the only way in | can get it wrong in any shape the heuristic misses |
| Risk | 44 mechanical edits; two existing tests pin class strings (§6) | leaves plan.md's "structural, not restated per page" unmet |

Recommending A1. §2.3 removed the "42 sites are broken" justification, so A1 is now bought purely with
enforcement quality — but that is precisely what plan.md's missing delta asks for, and a rule that has to
tolerate 42 legal spellings of the thing it forbids is not enforcement.

**Fork B — viewports.** Two desktop (1440×900, 1024×768, both named in plan.md) or those plus 375×812.
Recommending all three: the mobile AppShell branch (`AppShell.tsx:645`) is a genuinely different DOM
chain, and the audit noted mobile behaves *differently* from desktop here
(`plans/reviews/ui-audit-consolidated.md:281`) — which is exactly the kind of asymmetry worth one extra
row in a table.

No other fork. The pinned-header anatomy, the impossibility of window scroll, and the absence of scrollbar
styling are all fixed by plan.md constraints or by what the app already does.

---

## 4. Technical plan

### 4.1 The structural mechanism

**One new export: `PageScaffold`, in `framework/design-system/src/PageScaffold.tsx`.**

Checked first, per the track constraint and `.claude/rules/design-system.md:15-17`: nothing in
`framework/design-system/src/index.ts` does this job. `PageHeader` owns the pinned strip only and says so
(`PageHeader.tsx:10-13`, which explicitly makes the root scaffold *the caller's* problem — that delegation
is the hole). `ThreadShell.tsx:398` and `SplitView.tsx:188` are surfaces, not page scaffolds. `Fold`,
`ItemList`, `UnifiedSplitView` are unrelated. So this is a new component, not a fork of an existing one.

It lives in `framework/design-system` because that is where `PageHeader` lives and the two are one
contract, documented on one page (`docs/ui-design/page-anatomy.md`) — splitting them across packages would
re-open the same gap. `.claude/rules/design-system.md:22` ("a component consumed by 2+ pages belongs in
`framework/design-system/`") points the same way.

```tsx
export interface PageScaffoldProps {
  /** Pinned header strip. Normally a <PageHeader>. Omit for a page with no title strip. */
  header?: ReactNode;
  /**
   * "scroll"  (default) — the scaffold owns the scroll region; children are page content.
   * "managed" — the child owns its own scrolling (SplitView, ConversationSurface,
   *             a detail pane). The scaffold still guarantees the child a bounded
   *             flex column to size against.
   */
  body?: "scroll" | "managed";
  children: ReactNode;
  "data-testid"?: string;
}
```

renders

```tsx
<div className="flex flex-col h-full" {...dsProps("PageScaffold", "1")} data-testid={testId}>
  {header}
  {body === "managed"
    ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    : <div className="flex-1 overflow-y-auto" data-page-scroll="">{children}</div>}
</div>
```

Why each class is there, tied to the probes in §2.3:

- Root `flex flex-col h-full` — without `h-full` the root grows past the pane and nothing scrolls
  (shape **E**).
- Scroll body `flex-1 overflow-y-auto`, **no `min-h-0`** — proven redundant (A ≡ B). Writing it would be
  cargo cult, and this document's job is to stop that.
- Managed body `flex-1 min-h-0 flex flex-col overflow-hidden` — `flex flex-col` is what `WorkTeam.tsx:709`
  is missing (shape **C**, the live defect); `min-h-0` is the one place it genuinely earns its keep
  (shape **F** → **G**).
- `data-page-scroll` — a stable hook for the browser evidence in §5, so the spec asserts on a contract
  attribute rather than on class strings.

Deliverables that ship with it, per `.claude/rules/design-system.md`: `PageScaffold.stories.tsx` (required,
not optional), the `dsProps` marker (enforced by `design/require-ds-attribute`), the export pair in
`framework/design-system/src/index.ts`, and a written entry for the component budget.

> Note, no action: `.claude/rules/design-system.md:21` says the budget is catalogued in
> `framework/design-system/DESIGN.md`, but `DESIGN.md` has no component catalogue — `PageHeader` is not in
> it either. The rule does not bite today. Flagging it for AZ7/AZ15; not fixing it here.

### 4.2 Migration

Fifteen page files. Each `flex flex-col h-full` root plus its body becomes one `<PageScaffold>`. Branch
counts from the live grep:

| File | Roots | Body mode | Note |
|---|---|---|---|
| `pages/WorkTeam.tsx` | 6 (`:113,132,147,161,182,678`) | scroll ×5, **managed** for `:678` | **the live defect.** `:709` block → managed body; `:294` stays `flex-1 overflow-y-auto` and now works, because its parent is a flex column |
| `pages/Conversations.tsx` | 5 (`:354,362,375,548,647`) + `:461,505,726,387` | mixed; `:579` → managed | already works; migrating for uniformity |
| `pages/WorkBet.tsx` | 4 (`:700,719,729,783`) | scroll | |
| `pages/WorkRoutine.tsx` | 4 (`:68,82,93,109`) | scroll ×3, **managed** for `:109` (`:131`) | |
| `pages/WorkTask.tsx` | 4 (`:126,145,161,178`) | scroll | |
| `pages/WorkOverview.tsx` | 4 (`:86,101,114,132`) | scroll | |
| `pages/AgentProfile.tsx` | 5 (`:97,114,127,138,209`) | scroll | |
| `pages/KnowledgeList.tsx` | 3 (`:928,936,951`) | scroll | |
| `pages/KnowledgeDetail.tsx` | 1 (`:782`) | scroll | `data-testid="knowledge-detail-body"` on `:871` must move onto the scaffold body |
| `pages/KnowledgeCreate.tsx` | 1 (`:130`) | scroll | |
| `pages/WorkBetCreate.tsx` | 1 (`:118`) | scroll | |
| `pages/SettingsPage.tsx` | 1 (`:39`) | scroll | rendered inside `main` at `AppShell.tsx:590` |
| `pages/review/ReviewPage.tsx` | `:187,196,203` | managed for `:203` | delegates to `ReviewComposition.tsx:753`, already correct |
| `pages/work/RoutineDetailPane.tsx` | 1 (`:270`) | scroll | a pane, not a route, but the identical shape — migrating keeps the lint rule's `pages/**` scope clean without an exclusion |
| `pages/work/AgentDetailPane.tsx` | 2 (`:144,152`) | scroll | same |
| `pages/ArtifactPermalink.tsx` | **0** (`:18,23,29,36`) | scroll, **no header** | second real defect; wrap all four branches. No `PageHeader` — a page title is a content decision this WP does not own |

`pages/NotFound.tsx:42` is rendered **outside** `AppShell` (`router.tsx:104`) against the full window. It
is not a page inside the shell and is left alone; the lint rule's message covers it if someone later adds
a scrolling body there.

Not touched: `shell/Sidebar.tsx`, `shell/NotificationPopover.tsx`, `settings/SettingsHarnesses.tsx`,
`design-system/RichMessageCard.tsx`, `components/ThreadSections.tsx`, `components/SessionView.tsx`,
`components/SessionActivityPanel.tsx`, `components/GlobalSearchPanel.tsx`, `shell/TaskSheet.tsx`. These are
regions inside a page, not page scaffolds; each is correct and none is a route.

**AppShell is not modified.** `main`'s `overflow-hidden` (`AppShell.tsx:581`) is the deliberate
"window-scroll is impossible" boundary named in plan.md's constraints, and the desktop/mobile roots
(`:823`, `:648`) are correct. Nothing about this work needs to move.

### 4.3 Enforcement, per acceptance criterion

CLAUDE.md's split decides this: a **static codebase property** gets a lint rule, **runtime behaviour** gets
a test in something that actually runs it.

**Static (AC5) → one ESLint rule, `design/no-handrolled-page-scaffold`.**

- Package: `tools/eslint-plugin-design` — the plugin that already owns `no-handrolled-page-header`, the
  closest analogue (`tools/eslint-plugin-design/src/rules/no-handrolled-page-header.ts`). Same shape:
  read `className` string literals, report on the literal node. It reuses that file's helpers
  (`collectClassStringsFromJSXAttribute`, `createRule`, `asReportNode` from `../util.js`) and its
  in-file path guard.
- Registered in `tools/eslint-plugin-design/src/index.ts` alongside the other 24 rules.
- **File discovery is the ESLint `files` glob**, `["layers/core-ui/src/pages/**/*.tsx"]`, added to the
  existing block at `eslint.config.ts:177-198` that already scopes `no-handrolled-page-header`. A glob, not
  a path list — a new page file under `pages/` is covered the moment it exists, and a renamed folder is a
  two-line reviewable diff rather than a silent hole.
- Two arms, matching the two shapes that are provably broken or provably a trap:
  - **Arm 1** — a class string combining a grow token (`flex-1`) with a vertical scroll overflow
    (`overflow-y-auto`, `overflow-auto`, `overflow-y-scroll`). A page may not declare its own scrolling
    body; only `PageScaffold` may. Message: *"`<file>` declares a scrolling page body by hand. Use
    `<PageScaffold>` from @hyperidle/design-system — it owns the scroll contract."*
  - **Arm 2** — a class string combining `flex-1` with `overflow-hidden` **without** `flex-col`. This is
    literally `WorkTeam.tsx:709`, shape **C**: a block that clips and gives its child nothing to size
    against. Message points at `<PageScaffold body="managed">`.
- Lands at `error`, with every violation cleared in the same pull request — the standing rule in
  `tools/governance/README.md:41-44`.
- **Break-test:** RuleTester cases in `tools/eslint-plugin-design/src/__tests__/`, one invalid case per arm
  **and a control twin per arm** — the same intent written the legal way, asserting nothing is reported.
  That twin discipline is `tools/governance/README.md:113-120`, and a detector that flags everything is
  worthless without it.
- Honest limit: this rule reads static string literals only. `className={cx(...)}` or a computed string
  slips past, exactly as `no-handrolled-page-header` documents about itself
  (`no-handrolled-page-header.ts:19-35`). It stops the accident, which is what happened here; it does not
  stop a determined bypass, and per the repo's own memory chasing exotic spellings is not worth it.

**Runtime (AC1, AC2, AC3, AC4) → one Playwright spec,
`layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`.**

jsdom does no layout, so a component test can never answer "can the user reach the last element". Only a
real browser can. The spec, for each route × viewport in the table:

1. Asserts its own route list is non-empty and **hard-fails if it is** — a sweep that silently covers zero
   routes reads as passing forever.
2. Counts scroll containers (`scrollHeight > clientHeight` and computed `overflow-y` in `auto`/`scroll`)
   and computes `clippedPx` — the same two numbers the audit reported.
3. Asserts `clippedPx === 0`.
4. Where content exceeds the pane: scrolls the container to its end and asserts the last content element's
   bottom edge is inside the container's visible box.
5. Asserts the page's scroll region carries `data-page-scroll` and a computed `overflow-y` of `auto` — the
   affordance check for AC4, and a wheel event that moves `scrollTop`.

All assertions are numbers and DOM facts — **no screenshots, no image comparison, no Docker**, matching the
repo's visual-regression policy.

**State this plainly rather than let it be discovered later:** e2e is a local-only lane here — there is no
GitHub Actions job for it, and `npm run verify` does not run tests at all. So the browser evidence runs in
`npm run verify:release` and in this build session, while **the lint rule is the part that runs on every
pull request**. That is a real asymmetry in the gate and it is deliberate, not an oversight.

**Component contract → `PageScaffold.test.tsx`** (jsdom, `framework/design-system/src/__tests__/`). Renders
the component through its import and asserts the DOM contract: root is a flex column with `h-full`; the
header slot is the first child; scroll mode emits exactly one `data-page-scroll` element; managed mode
emits none and gives its child a flex column; `data-testid` passes through. This is a component's rendered
output through an import — a legitimate test, not a filesystem grep.

**Docs.** `docs/ui-design/page-anatomy.md:9-21` and `docs/ui-design/rules.md:10` are rewritten to describe
the component and the two body modes, and the `min-h-0` correction from §2.3 is recorded there once so the
next agent does not re-derive it. `PageHeader.tsx:10-13`'s JSDoc, which currently hands the root scaffold to
the caller, points at `PageScaffold` instead. `page-anatomy.md:93-101` (Enforcement) gains the new rule.

### 4.4 Ownership and contracts

- `framework/design-system` owns the page scaffold shape, as it already owns the page header. Pages
  consume it; no page declares page-level geometry after this.
- `tools/eslint-plugin-design` owns the static prohibition. No governance registry changes — this is a
  design-system adoption rule, not a package-boundary rule, so nothing in `tools/governance/` moves.
- `layers/core-ui/__e2e__` owns the browser evidence and the viewport constant.
- `docs/ui-design/page-anatomy.md` remains the human-readable statement; after this it describes a
  component instead of a pattern to copy.

### 4.5 Ordered task list — one build session

Validation before implementation, per CLAUDE.md.

1. **Record the defect live.** Run the app, open `/work/team/:id` at 1440×900 and 1024×768, record scroll
   containers and `clippedPx`. Expect `0` and `538`/`706`. Do the same for `/artifacts/:id`. This is the
   red baseline — without it, green proves nothing.
2. **Write the failing evidence.** RuleTester cases (2 invalid + 2 control twins); `PageScaffold.test.tsx`;
   `AZ2-page-scroll.spec.ts` with the viewport constant. All red.
3. **Build `PageScaffold`** + `.stories.tsx` + `index.ts` exports. Component test goes green.
4. **Migrate `WorkTeam.tsx` first** — the live defect. Re-run step 1's measurement: scroll containers ≥ 1,
   `clippedPx === 0`, last artifact row reachable at both desktop viewports. **Look at the painted page**
   before continuing.
5. **Migrate `ArtifactPermalink.tsx`** (headerless scaffold, four branches). Re-measure.
6. **Migrate the remaining 13 files**, branch by branch. Behaviour-neutral by construction — any visible
   change is a regression to fix, not to accept.
7. **Add the lint rule**, register it, wire it at `error` on `pages/**` in the existing
   `eslint.config.ts:177` block. Zero violations must remain, since step 6 removed them all.
8. **Reconcile the two class-pinning tests** — `WorkTeam.AG1.test.tsx:214-218` and
   `WorkTeam.AV4.test.tsx:287-290` both assert `outer.className` contains `overflow-y-auto`. Rewrite them
   to assert the scaffold contract (`data-page-scroll` present on the team page's body) rather than a class
   literal. Keep `data-testid="work-team-page"` on the element the rest of the suite locates.
9. **Update the docs** — `page-anatomy.md`, `rules.md:10`, `PageHeader.tsx` JSDoc; record the `min-h-0`
   correction.
10. **Verify.** `npm run check`, `npm run lint`, `npm run test:full`; the new e2e spec locally; a Playwright
    screenshot of the team page scrolled to its end, read as an image.

---

## 5. Acceptance criteria → evidence

| # | Criterion | What proves it |
|---|---|---|
| AC1 | On every route, at each supported viewport, the last element of page content can be reached by ordinary scrolling | `AZ2-page-scroll.spec.ts` — per route × viewport: scrolls the container to its end and asserts the last content element's bottom edge is inside the container's visible box. Hard-fails if the route list is empty. |
| AC2 | No page region hides overflowing content that no ancestor can scroll | Same spec: `clippedPx === 0` per route × viewport — the audit's own measure. |
| AC3 | The team page's agent roster and artifacts section are reachable at desktop viewports | Same spec, `/work/team/:id` at 1440×900 and 1024×768: the roster's last member row and the last artifact row are both scrolled into view and asserted visible. Plus a screenshot of the scrolled page, read by the builder (step 10). |
| AC4 | A page whose body can scroll exposes a scroll affordance consistent with the rest of the app | Same spec: the scroll region carries `data-page-scroll`, its computed `overflow-y` is `auto`, and a wheel event moves `scrollTop`. "Consistent" is settled in §3: platform scrollbar, no styling, no `tabIndex` — identical to `Sidebar.tsx:656` and the four other existing regions. |
| AC5 | Automated evidence fails if a page declares a scrolling body that can be clipped by an ancestor | `design/no-handrolled-page-scaffold` at `error` on `layers/core-ui/src/pages/**/*.tsx`, both arms, each with a RuleTester invalid case **and** a control twin. Runs in `npm run lint` on every pull request. |
| VS1 | Team page at 1024×768: scrolling to the bottom shows the last artifact row fully | `AZ2-page-scroll.spec.ts`, the AC3 case at 1024×768 — the exact scenario, asserted on the artifact row's bounding box, not on its presence in the DOM. |
| VS2 | Any route at 1440×900 with content taller than the viewport: a scroll container exists and reaches the end | `AZ2-page-scroll.spec.ts`, the AC1/AC2 cases at 1440×900. |
| VS3 | A new page with a body region that omits the scroll contract fails verification, naming the page | `design/no-handrolled-page-scaffold` — a new page under `pages/**` writing `flex-1 overflow-y-auto` (arm 1) or `flex-1 overflow-hidden` without `flex-col` (arm 2) fails `npm run lint` with the file named. The RuleTester invalid cases are that scenario, written down. |

**Automatic vs. looked-at.** Automatic: the lint rule (every pull request); the component contract test
(every pull request); the browser sweep (locally, and in `verify:release`). Looked at by the builder: the
team page painted and scrolled to its end, before and after, at both desktop viewports — a UI claim is not
done until someone has seen the pixels, and the numbers in step 1 are the before/after that makes the claim
checkable.

---

## 6. Risks and open blockers

1. **Two tests pin class strings on production code.** `WorkTeam.AG1.test.tsx:214-218` and
   `WorkTeam.AV4.test.tsx:287-290` assert `outer.className` contains `overflow-y-auto`. Rewriting them is
   task 8. The trap: making the component emit a class *because a test demands it* would be tests driving
   behaviour. The component's classes come from the probe results in §2.3 and nowhere else; the tests move
   to the contract attribute.
2. **`data-testid` placement drifts during migration.** `WorkTeam` carries `work-team-page` on the root in
   five branches (`:113,132,147,161,182`) and on the **body** in the loaded branch (`:294`);
   `KnowledgeDetail` carries `knowledge-detail-body` on its body (`:871`). Many specs locate pages by these.
   `PageScaffold` passes `data-testid` to the root, so the loaded-branch case needs care. Mitigation: run
   the full unit + component suite after each file, not once at the end.
3. **Split-view paths are the subtle ones.** `WorkTeam` renders `teamBody` in three configurations — bare,
   inside `SplitView` origin for `?routine`, and for `?agent` (`WorkTeam.tsx:709-751`). `SplitView.tsx:197`
   gives its origin `flex min-w-0 flex-col overflow-auto`, which is a bounded flex column, so `teamBody`
   works there today and must still work after. Both split states need their own measurement, not just the
   bare one.
4. **`ArtifactPermalink` being broken is a static inference, not a live measurement.** Shape **E** is
   proven; that *this page's* content exceeds the pane in practice is not. Builder confirms in the browser
   at step 1 before claiming a fix.
5. **The browser evidence has no CI job.** Stated in §4.3 and worth repeating: the strongest evidence for
   ACs 1–4 runs locally and in `verify:release`. If someone later breaks a scroll chain in a way the lint
   rule cannot see, per-merge CI will not catch it. That is the trade this repo has already made about
   e2e; this work package does not change it and should not pretend otherwise.
6. **Scope pressure.** 15 files × 44 branches is mechanical but not free. If the founder picks Fork A2
   instead, the lint rule must be re-specified as a narrower heuristic — that changes §4.3 and is a real
   consequence of the choice, not a detail. Estimated total under Fork A1: roughly 550 changed lines
   (component + stories ~120, migration ~180, lint rule + tests ~150, e2e spec ~120), well under the point
   where the problem should be re-questioned.
7. **Nothing here is blocked.** No dependency, no external service, no unresolved question except the two
   forks in §3.

---

## 7. Founder approval — 2026-08-11

Approved as written, with both forks decided:

- **Fork A → A1.** Migrate all 15 page files (44 branches) onto `PageScaffold`. The lint rule is therefore
  the flat prohibition described in §4.3, not a heuristic.
- **Fork B → all three viewports.** 1440×900, 1024×768 and 375×812.

The §2.3 correction (`min-h-0` on a scrolling body is a no-op; the real invariant is a bounded flex column)
is accepted and supersedes the cause stated in `plan.md:9` and in the audit. It is recorded in the docs as
part of task 9 so it is not re-derived.

No further human gate before review. Build proceeds against §4.5.
