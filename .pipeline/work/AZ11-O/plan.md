# AZ11-O — Page orientation and document outline

## Work package

**Outcome.** Every primary page tells the user where they are and presents one coherent document outline: the breadcrumb names the real current page, the page header comes first, and nested authored content cannot become a second page title.

**Why this matters.** A page that identifies an ancestor as current, hides the current artifact behind a long producer title, or renders multiple top-level headings makes navigation and reading unreliable. These defects are independent of page width and must be correct before geometry can align every page to its header.

**What exists today.** `PageScaffold`, `PageHeader`, and the shared `Breadcrumb` already exist. Breadcrumb treatments and current-page identity differ across Work, Knowledge, Review, Agent, create, and Artifact pages. Setup, NotFound, and Artifact do not consistently provide the PageHeader substrate that the geometry package needs. Authored Knowledge, Bet, Artifact, and embedded Review content can participate in the page outline.

**Missing delta.** One approved breadcrumb identity contract and one header-first/document-outline contract across the real primary route branches, without changing routes, data loading, page widths, pane ratios, Block geometry, anchors, or discussion behavior.

**Depends on.** AZ2 — its PageScaffold header/body and scroll contract is the substrate for header-first route anatomy.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Architecture required: enumerate the real 17-surface branch ledger, exact breadcrumb callsites, heading entry points, evidence owners, retained hunks, and line budget. Design is not required: the founder approved the exact breadcrumb arrays, Artifact duplicate rule, `Setup` and `Page not found` titles, and the existing heading-normalization contract on 2026-08-13.

**Constraints.** Breadcrumb roles are positional: root, zero or more intermediates, then the actual current page. Approved callsite arrays are those in the AZ11 corrective architecture decision sheet. Artifact uses `Work / [producing task] / artifact title`, omitting the task intermediate when its normalized title duplicates the artifact title; no missing task route is fabricated. Setup uses H1 `Setup`; NotFound uses H1 `Page not found` and does not repeat that title in its body. PageHeader owns the sole route-document H1. Authored headings demote one level, cap at H6, and suppress only a normalized matching first heading while preserving its Block wrapper, id, anchor, handle, and discussion. Static checks may claim only directly visible syntax; rendered branch and painted behavior require runtime evidence.

**Out of scope.** Page-column width or alignment; managed-pane ratios and gutters; Block layout; sidebar composition; routes, APIs, data states, or fabricated ancestry; content redesign; unrelated copy changes.

## Acceptance criteria

- Every breadcrumb ends with the real current page and uses only real approved ancestry; exactly that final segment is current.
- Long breadcrumbs preserve a readable current-page prefix and never collide with history controls or header actions at supported desktop, tablet, and mobile widths.
- Every real primary route branch begins with PageHeader and renders exactly one top-level heading.
- Knowledge, Bet pitch, text Artifact, and embedded Review headings follow the approved demotion and duplicate-title rules without losing Block identity, anchors, or discussion.
- Direct syntax, rendered branch structure, and painted breadcrumb behavior are each verified by evidence that can actually prove that class of behavior; no static rule claims runtime branch completeness or geometry.

## Validation scenarios

- Given a Knowledge item, Review, Work object, Agent, create page, or Artifact, when its page opens, then the last breadcrumb segment names that page and is the only current segment.
- Given an Artifact with a very long producing-task title at 390px and 1024px, when its header renders, then the Artifact title remains visibly identifiable and no breadcrumb or header rectangle overlaps another.
- Given Setup, NotFound, loading, error, empty, and populated primary states, when each renders, then PageHeader is the first page region and the document contains exactly one H1.
- Given authored content whose first heading matches the page title, when it renders in Knowledge, Bet, Artifact, or embedded Review, then the duplicate heading is suppressed while its Block anchor and discussion attachment remain available.


## Consolidated approved combined round

The following planning record was founder-approved without changes on 2026-08-13 and governed the build. It is retained verbatim so no scope, contract, ownership, evidence distinction, or limitation is lost.

# AZ11-O — Combined requirement, design, and architecture round

**Gate status:** awaiting founder approval. No code is authorized by this artifact.

**Authority:** [`plan.md`](./plan.md), `.pipeline/AZ.md`, `ETHOS.md`, `pipeline.config.yml`, its six bound rule files, and the current `origin/main` source at `252150565fec`. The exact user-facing choices were approved on 2026-08-13; this round does not reopen them.

**Historical evidence limit:** the retained AZ11 folder contains only the 43-line superseded plan. Reachable history and a bounded local object/worktree search contain no corrective decision sheet, review artifact, or failed implementation diff. Therefore there are no source hunks that can safely be retained or cherry-picked. The tables below reconstruct the build boundary from the explicit AZ11-O constraints, current route/data truth, and current callsites. Founder approval of this artifact also confirms the breadcrumb table where the absent sheet cannot be quoted.

## 1. Sharpened requirement

### 1.1 Definition of done

AZ11-O is done when all of these hold together:

1. Each real page branch starts with the route's `PageHeader`. Its title is the route document's only H1, including loading, error, empty, missing, and populated states.
2. Every breadcrumb is positional: root, zero or more real intermediates, current page. Only the final segment has `aria-current="page"`; its label is the same page identity as the H1.
3. Long breadcrumbs stay on one line. History controls, ancestors, current page, title-row actions, and title never paint over each other at 1440px, 1024px, or 390px. The current segment keeps a readable prefix and truncates at its end.
4. Authored headings in Knowledge, Bet pitch, text Artifact, and embedded Review content shift down one level (`H1 → H2`, …, `H5 → H6`, `H6 → H6`). Only a first authored heading whose normalized text equals its containing document title is visually suppressed.
5. Suppression removes only the heading payload. Its outer `article[data-block-id]`, id, anchor target, handle/action wiring, assistant attachment, anchored messages, and discussion remain present.
6. Evidence says only what it proves. Syntax inspection proves literal callsites/API use. Component/browser execution proves rendered branches and outline. Browser rectangles/screenshots prove painted behavior.

### 1.2 Terms

- **Primary surface:** one user-facing route document. A split destination does not become another document.
- **First page region:** the first rendered child region inside the surface's `PageScaffold`. It is the route `PageHeader`; no hint/action strip may precede it.
- **Current breadcrumb segment:** the last segment by position, never “whichever segment has no `to`”. It is plain text with `aria-current="page"`.
- **Real ancestry:** a route or loaded parent object that exists. A non-link intermediate is allowed when the object exists but no route can be formed. No guessed URL is allowed.
- **Normalized title:** equality under the existing block-derivation `slug()` contract: trim, remove emoji, GFM-lowercase and punctuation handling, then collapse/trim hyphens. This intentionally treats case, spacing, and punctuation-only differences as the same heading identity. The existing `<empty>` sentinel is never enough by itself to suppress two unequal all-stripped strings.
- **First authored heading:** the first top-level derived Block, only when that Block is a heading. A later matching heading is not suppressed.
- **Readable current prefix:** at least the first six visible characters when the label has six characters and the viewport has room for the header's required controls. The browser proof also requires positive width and end ellipsis for overflow.

### 1.3 Scope

In scope:

- `Breadcrumb`, `PageHeader`, and the 17 primary surfaces below.
- Existing authored Block render flow and the two embedded Review H1 entry points.
- Existing state branches, nested panes, and inspector branches only as needed to preserve one route H1.
- Focused unit/component/E2E evidence plus painted screenshots.

Out of scope:

- Route, API, fetch, state-machine, data-model, sidebar, discussion, or anchor changes.
- AZ11-G geometry: page columns, 1120px lane, body/header edge alignment, readable measures, pane ratios, gutters, scroll ownership, or Block's 32px + 9px internal geometry.
- New ancestry, redirects, task URLs without a real `betId`, content redesign, or unrelated copy.

## 2. Approved user-facing shape

No visual variant remains to choose. Use the existing Hearth `PageScaffold` + `PageHeader` + `Breadcrumb` treatment.

### 2.1 Header and responsive behavior

- Header order is `breadcrumb/orientation row → title/actions row → optional subtitle`.
- Breadcrumb is a single non-wrapping flex row with `min-width: 0` and clipped overflow; it never wraps into a second header line.
- Desktop/tablet history controls are a shrink-proof leading item. Current mobile behavior remains: omit `NavHistoryCluster` when `sidebarMobile` is true.
- Root and separators stay readable and shrink-proof. Each intermediate can shrink to zero and ellipsize, with the existing 120px ceiling. The final current segment receives remaining width, has `min-width: 6ch`, keeps its prefix, and ellipsizes at the end with the existing 180px ceiling.
- If the row cannot honor every preferred width, intermediates shrink before the final segment. No absolute positioning is introduced.
- The breadcrumb row and title/action row remain separate. Actions are shrink-proof; title is `min-w-0 truncate`. This prevents breadcrumb/history/actions collisions without changing page-column geometry.
- Breadcrumb links keep the existing focus ring and secondary-to-accent hover behavior. The current segment is not a link.

### 2.2 Heading behavior

- `PageHeader` keeps its default H1 and is the sole route-document H1.
- Loading headers use a real accessible fallback title, with skeleton paint separate from the H1 text. An H1 made only of skeleton `<div>` elements is not acceptable evidence.
- Managed destination titles are H2: Agent detail, Routine detail, Review artifact examine pane, Conversation/session inspector destinations. They do not use H1.
- Subject-authored headings retain their current visual styles, shifted semantic tag only. H6 caps at H6.
- A suppressed duplicate keeps an empty Block payload slot; it does not remove or hide the Block shell. Discussion/anchor UI can still render inside that shell.
- `Setup` is the H1 for `/setup`.
- `Page not found` is the H1 for `*`. The body keeps the existing description and actions but does not render the same title again.

### 2.3 Breadcrumb callsite contract

Square brackets mean loaded text. “plain” means a real object with no link available from current data.

| Surface | Exact segment array | Reason/link truth |
|---|---|---|
| Work Team | `Work(/work) / [team.name]` | Current source already has both. |
| Work Bet | `Work(/work) / [team](plain) / [bet.title]` | Current `BetDetail` has team name but no trustworthy team id; do not retain its fake `/work` team link. |
| Work Task | `Work(/work) / [team](plain) / [bet.title](/work/bet/:betId) / [task.title]` | Bet URL is real; no team URL can be formed from current task data. |
| Work Routine | `Work(/work) / [teamName](plain, omit when absent) / [routine.name]` | No team id is returned here. The intermediate is real but not linked. |
| New Bet | `Work(/work) / New bet` | Replaces the hand-rolled breadcrumb; final label names the create page. |
| Knowledge item | `Knowledge(/knowledge) / [scopeName](plain, optional) / [topic](plain, optional) / [item.title]` | Appends the missing real current page; classifications remain non-links. |
| New Knowledge | `Knowledge(/knowledge) / New knowledge` | Replaces ambiguous `New`; editable H1 still carries the draft title treatment. |
| Agent with team | `Work(/work) / [teamName](/work/team/:teamId) / [agent.name]` | Both parent objects and route are real. |
| Agent without team | `Conversations(/conversations) / [agent.name]` | Existing page fallback is Conversations; no Agents index route exists. |
| Conversation detail | `Conversations(/conversations) / [threadTitle]` | The selected thread is the current page. Queue `/conversations` needs no breadcrumb. |
| Review with task | `Work(/work) / [betTitle](/work/bet/:betId) / [taskTitle](/work/bet/:betId/task/:taskId) / [subject.title]` | All ids exist on `ComposedReviewSubject`. |
| Review without task | `Work(/work) / [betTitle](/work/bet/:betId) / [subject.title]` | Optional task ancestry is omitted, not fabricated. |
| Artifact, distinct task/title | `Work(/work) / [producingTaskTitle](plain) / [artifactDisplayTitle(data)]` | `Artifact` lacks `betId`, so its task route cannot be formed. |
| Artifact, duplicate task/title | `Work(/work) / [artifactDisplayTitle(data)]` | Omit task intermediate when normalized titles match. |

All other primary pages have no breadcrumb. Their PageHeader title alone gives orientation.

## 3. Real 17-surface branch ledger

The ledger counts route documents, not implementation files. `ReviewComposition` belongs to Review; `AgentDetailPane` and `RoutineDetailPane` belong to Work Team.

| # | Surface and route | Real rendered branches | Header/H1 plan | Evidence owner |
|---:|---|---|---|---|
| 1 | Setup `/setup` | descriptor/catalog loading, ready, submit error within one page | Wrap in `PageScaffold`; first region `PageHeader title="Setup"`; preserve card/form body | `SetupFlow.test.tsx`, `AE2-SetupFlow.test.tsx`, E2E painted setup |
| 2 | Conversations queue `/conversations` | thread-list loading, error, empty, populated | Existing `PageHeader title="Conversations"` remains first | `Conversations.test.tsx`, new branch matrix |
| 3 | Conversation detail `/conversations/:threadId` | loading, not-found, error, defensive no-data, populated; populated may open artifact/knowledge/review/session/path inspector | Every branch gets `PageHeader`; populated title/breadcrumb come from loaded thread. Move hint/dial controls into PageHeader actions/subtitle or body after it; remove/demote `ConversationSurface` H1 | `Conversations.test.tsx`, context-link tests, branch matrix, painted long-title proof |
| 4 | Work overview `/work` | loading, error, zero teams, populated; one team redirects and paints no document | Add `PageHeader title="Teams"` to error/empty; keep current loaded headers | `WorkOverview.test.tsx`, branch matrix |
| 5 | Work Team `/work/team/:teamId` | loading, 404, other error, null, missing team, populated; populated standalone, agent split, routine split | Existing outer `PageHeader` remains sole H1 in every branch. Nested Agent/Routine pane titles become H2; no nested H1 | WorkTeam tests, pane tests, branch matrix |
| 6 | Work Routine `/work/routine/:routineId` | loading, error, not-found, populated | Existing PageHeaders stay; exact populated breadcrumb above | WorkRoutine AA1/AA2 tests, branch matrix |
| 7 | New Bet `/work/bet/new` | default, from-Knowledge loading/prefill, submit error | Replace hand-rolled header/nav/title span with `PageHeader title={derivedTitle || "Untitled bet"}` and approved breadcrumb | `WorkBetCreate.test.tsx`, branch matrix |
| 8 | Work Bet `/work/bet/:betId` | loading, error, not-found, populated | Error/not-found gain PageHeader. Loading H1 says `Bet` while skeleton is decorative. Loaded title/breadcrumb exact above | WorkBet core/detail/pitch tests, branch matrix |
| 9 | Work Task `/work/bet/:betId/task/:taskId` | bet loading, error, task not-found, populated | Error/not-found gain PageHeader. Loading H1 says `Task`. Loaded title/breadcrumb exact above | WorkTask outcome + E2E task detail + branch matrix |
| 10 | Review `/work/bet/:betId/review/:reviewId` | loading, error, populated; populated closed/open artifact and compact split | Loading/error use `PageHeader title="Review"`. Populated `FrameHeader` becomes PageHeader with `subject.title` and exact breadcrumb. Examine title is H2; embedded headings demote | ReviewPage/Composition/canvas tests, branch matrix, painted split proof |
| 11 | Agent `/agents/:agentId` | loading, 404, other error, null, populated | Existing PageHeaders remain; loaded breadcrumb uses team/no-team array above | AgentProfile tests, branch matrix |
| 12 | Knowledge list `/knowledge` | outer loading, outer error, system empty, curated empty, triage empty, populated | Add `PageHeader title="Knowledge"` to outer loading/error; loaded header stays | KnowledgeList tests, branch matrix |
| 13 | New Knowledge `/knowledge/new` | editing, validation/submit error | Existing PageHeader stays; current breadcrumb becomes `New knowledge` | KnowledgeCreate tests, branch matrix |
| 14 | Knowledge detail `/knowledge/:knowledgeId` | legacy/fixture/API-resolved content; edit/read modes; empty/populated authored body | Existing PageHeader stays; append item title to breadcrumb; pass item title into authored outline context | KnowledgeDetail + KnowledgeBody tests, branch matrix |
| 15 | Artifact `/artifacts/:id` | loading, 404, other error, populated | Every branch gets PageHeader. Populated title is `artifactDisplayTitle(data)` plus exact breadcrumb; body preview stops restating its title as page chrome | ArtifactPermalink + ArtifactPreview tests, branch matrix, long breadcrumb proof |
| 16 | Settings (settings overlay surface) | populated sections and child loading/error states | Replace custom H2 header with `PageHeader title="Settings"`; section titles stay H2 | `AF15-SettingsPage.test.tsx`, settings E2E, branch matrix |
| 17 | NotFound `*` | one standalone branch | `PageScaffold` + first `PageHeader title="Page not found"`; body does not repeat title | new `NotFound.test.tsx`, navigation E2E, painted standalone proof |

### Nested heading entry points covered by the ledger

| Entry point | Current state | Required change |
|---|---|---|
| `framework/design-system/src/block/HeadingPayload.tsx` via `render-payload.tsx` and `Block.tsx` | Emits authored H1–H6 unchanged | Accept route-document context; shift +1 capped at 6; suppress matching first payload only |
| `KnowledgeBody.tsx` | Maps derived blocks with stable ids, assistant attach, anchored messages | Pass item title + block index into Block; do not filter blocks |
| `WorkBet.tsx` `BetPitch` | Same Block stream plus discussion/attach wiring | Pass bet title + block index; do not filter blocks |
| `compose-artifact-body.tsx` through `ArtifactPreviewSurface`/`ArtifactPreview` | Text kind maps Blocks with no title context | Thread artifact display title to full-size text composition; gallery behavior unchanged |
| `ReviewBrowserPreview.tsx` | Embedded authored `h1` | Render semantic H2; suppress it only when normalized first heading equals artifact title |
| `ReviewRenderedInContext.tsx` `EmailRender` | Embedded authored `h1` | Same H2/duplicate rule; email paint styles remain |
| `ConversationSurface.tsx`, `SessionView.tsx` | Managed content currently emits H1 | Route PageHeader owns H1; these nested destination/header titles become H2 or are omitted when PageHeader already paints the same title |
| `AgentDetailPane.tsx`, `RoutineDetailPane.tsx`, Review `ExaminePane` | Pane title is a non-heading span | Promote to H2, preserving paint and actions |

## 4. Technical contracts

### 4.1 Breadcrumb

Update `Breadcrumb` so render semantics depend only on index:

- `segments` is a non-empty readonly tuple type.
- For `index < last`: render a link only when `to` exists; otherwise render plain intermediate text. Never set `aria-current` on an intermediate.
- For `index === last`: always render plain current text and set `aria-current="page"`, even if a caller accidentally supplies `to`.
- Add stable markers `data-breadcrumb-role="root|intermediate|current"` for runtime and painted evidence. These markers describe rendered roles, not source completeness.
- Preserve injected `LinkComponent`, `testId`, link focus behavior, and slash separators.
- Apply the one-line flex allocation from §2.1. No page widths or PageHeader padding change.

Callsites own labels and ancestry. No shared route inference helper is added; the loaded data differs by page and a helper would invite fabricated ancestry.

### 4.2 Page document outline

Keep `PageHeader` as the sole route H1. Add no second page-header primitive.

For authored Blocks, add a narrow optional context to `Block` and pass it through `renderPayload` to `HeadingPayload`:

```ts
interface AuthoredOutlineContext {
  readonly documentTitle: string;
  readonly blockIndex: number;
  readonly levelOffset: 1;
}
```

Rules:

- Non-heading payloads ignore it.
- Effective level is `min(6, payload.level + levelOffset)`.
- Suppress payload output only when `blockIndex === 0`, payload is heading, and normalized payload text equals normalized `documentTitle`.
- `Block` still renders the same outer article, gutter, slots, keyboard handlers, block id, and payload container when suppressed.
- Re-export block-derivation's existing pure `slug()` contract and use it through one narrow heading-identity helper shared by Block and Review embedded headings. The helper follows §1.2 and guards the `<empty>` sentinel collision; no second normalization algorithm is added.
- Default context is absent, so non-page Block consumers keep current H1–H6 behavior.

Artifact propagation is full-view only: `ArtifactPreview` passes its display title to `ArtifactPreviewSurface`, then `composeArtifactBody`. Gallery/stack previews do not gain page-outline semantics.

### 4.3 Fallback/header states

- Reuse `PageHeader`; do not create a fallback header component.
- The smallest page-local fallback nouns are `Conversations`, `Conversation`, `Teams`, `Bet`, `Task`, `Review`, `Knowledge`, `Artifact`, `Agent`, `Team`, and `Routine` as named in the ledger.
- Extend `ErrorState` only enough to omit its internal title row for standalone NotFound. Default behavior for every existing caller stays unchanged.
- Preserve existing `PageScaffold body="managed"` choices and all current scroll owners.

### 4.4 Static/runtime/paint boundary

| Evidence class | May prove | Must not claim |
|---|---|---|
| Static syntax | Exact listed Breadcrumb arrays are present; hand-rolled create/settings/review headers are gone; no production H1 remains outside PageHeader except explicitly isolated external documents | That conditional branches render, H1 count at runtime, truncation, overlap, pixels |
| Runtime branch | A rendered state begins with PageHeader; exactly one H1 exists; only final crumb is current; heading tag/suppression and Block identity/slots survive | Width allocation or non-overlap |
| Painted geometry | Current prefix visibility, ellipsis, and non-intersecting rectangles at named viewports; visible order in screenshots | Unvisited branch completeness or source enforcement |

No omnibus “all pages comply” lint rule is added. That was the failed AZ11 proof error. Existing typecheck/lint remain syntax gates; the explicit runtime branch matrix owns branches.

## 5. Files and ownership

### Shared implementation

- `framework/block-derivation/src/blocks/normalise.ts` and `src/index.ts` only to expose the existing heading identity
- `framework/block-derivation/src/__tests__/blocks/slug.test.ts` for the sentinel boundary
- `framework/design-system/src/Breadcrumb.tsx`
- `framework/design-system/src/Block.tsx`
- `framework/design-system/src/block/render-payload.tsx`
- `framework/design-system/src/block/HeadingPayload.tsx`
- `framework/design-system/src/ArtifactPreview.tsx`
- `framework/design-system/src/ArtifactPreviewSurface.tsx`
- `framework/design-system/src/kinds/compose-artifact-body.tsx`
- `framework/design-system/src/ErrorState.tsx` only for optional inner title
- `framework/design-system/src/index.ts` only if the normalizer/type needs public export

### Primary pages

- `layers/core-ui/src/pages/SetupFlow.tsx`
- `layers/core-ui/src/pages/NotFound.tsx`
- `layers/core-ui/src/pages/Conversations.tsx`
- `layers/core-ui/src/pages/WorkOverview.tsx`
- `layers/core-ui/src/pages/WorkTeam.tsx`
- `layers/core-ui/src/pages/WorkRoutine.tsx`
- `layers/core-ui/src/pages/WorkBetCreate.tsx`
- `layers/core-ui/src/pages/WorkBet.tsx`
- `layers/core-ui/src/pages/WorkTask.tsx`
- `layers/core-ui/src/pages/AgentProfile.tsx`
- `layers/core-ui/src/pages/KnowledgeList.tsx`
- `layers/core-ui/src/pages/KnowledgeCreate.tsx`
- `layers/core-ui/src/pages/KnowledgeDetail.tsx`
- `layers/core-ui/src/pages/knowledge/KnowledgeBody.tsx`
- `layers/core-ui/src/pages/ArtifactPermalink.tsx`
- `layers/core-ui/src/pages/SettingsPage.tsx`
- `layers/core-ui/src/pages/review/ReviewPage.tsx`
- `layers/core-ui/src/pages/review/ReviewComposition.tsx`
- `layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx`
- `layers/core-ui/src/pages/review/ReviewRenderedInContext.tsx`
- `layers/core-ui/src/pages/work/AgentDetailPane.tsx`
- `layers/core-ui/src/pages/work/RoutineDetailPane.tsx`
- `layers/core-ui/src/components/ConversationSurface.tsx`
- `layers/core-ui/src/components/SessionView.tsx`

### Evidence

- Extend `framework/design-system/src/__tests__/AG4-Breadcrumb.test.tsx`.
- Extend `framework/design-system/src/__tests__/Block.test.tsx` and block payload tests.
- Extend `KnowledgeBody.test.tsx`, `WorkBet.pitch.test.tsx`, ArtifactPreview tests, Review embedded-canvas tests, and affected page tests.
- Add one focused `layers/core-ui/src/__tests__/page-outline-ledger.test.tsx` runtime branch ledger. It imports/render pages; it does not read source files.
- Add `layers/core-ui/__e2e__/page-orientation.spec.ts` for real route paint/rectangles/screenshots.

## 6. Tests first, then code

### Task 1 — Red: shared semantics

1. In Breadcrumb tests, prove a non-linked intermediate is not current, final is the sole current segment, a final accidental `to` does not make it a link, roles are marked, and an empty segment array is rejected by TypeScript.
2. In Block/Heading tests, prove +1 demotion for all six levels, H6 cap, the existing slug normalization and `<empty>` boundary, matching-first suppression, later-match preservation, and unchanged default behavior without context.
3. Prove suppressed heading Block retains `data-block-id`, `article`, keyboard/action callback, gutter/handle slot, inline discussion slot, and anchor target.
4. In Knowledge, Bet, Artifact, and Review tests, prove their real adapters pass the correct title/index and preserve ids/discussion.

### Task 2 — Red: route branch ledger

Add the focused component suite and render every row/branch named in §3. For each rendered document assert:

- first page region is `data-ds-component="PageHeader"`;
- exactly one H1 exists and its accessible text is the expected loaded/fallback title;
- nested pane/canvas headings are H2+;
- each breadcrumb's labels, routes, and sole final current marker match §2.3.

Use existing override props and request mocks. Do not add production branch registries or test-only exports to production files.

### Task 3 — Green: shared primitives

Implement §4.1 and §4.2 with the smallest API changes. Keep existing default behavior. Add one `@lore` at Block's context seam explaining why duplicate suppression must not filter the Block.

### Task 4 — Green: page branches

Migrate the 17 surfaces in ledger order, reusing PageHeader. Replace hand-rolled WorkBetCreate, Settings, Conversation, and Review headers. Add missing headers to fallback states. Apply exact breadcrumb arrays. Demote nested managed headings. Keep every fetch, action, state, route, scroll mode, and body wrapper otherwise unchanged.

### Task 5 — Green: painted proof

Create the E2E spec with realistic long fixture strings:

- task: `Prepare the international launch readiness assessment for every supported market`;
- artifact: `International launch readiness assessment and unresolved rollout decisions`.

At 1440×900, 1024×768, and 390×844:

1. Open populated Artifact and capture screenshots.
2. Assert current segment has positive width; its visible text starts with `Internat`; overflow ends with ellipsis when constrained.
3. Assert bounding rectangles for history cluster, every breadcrumb text segment, PageHeader actions, and title do not intersect (edge-touch within 0.5px allowed).
4. Open a long Work Task and a Review with an open artifact; repeat collision checks.
5. Open Setup and NotFound; capture their first viewport and assert one visible H1.

Run with a fresh worktree-owned server (`CI=1`) so Playwright cannot reuse another checkout. Build screenshots were temporary evidence; the durable E2E writes future output under Playwright's `test-results/page-orientation/`.

### Task 6 — Verification

Focused red/green runs first, then required gates:

```text
npm run check
npm run lint
npm run test
npm run test:full
npm run test:e2e -- page-orientation.spec.ts
npm run verify
```

Manually open the saved 1440, 1024, and 390 screenshots before claiming painted completion.

## 7. Acceptance criteria to evidence

| Acceptance criterion | Static syntax evidence | Runtime branch evidence | Painted evidence |
|---|---|---|---|
| Every breadcrumb ends at real current page; sole final current | Callsite table diff and TypeScript non-empty tuple | Breadcrumb unit tests + 17-surface suite assert labels/URLs/one `aria-current` | Screenshots show current label in context |
| Long breadcrumbs preserve current prefix and do not collide | CSS/API diff only; no geometry claim | E2E confirms target nodes exist and overflow state | Rectangle assertions + screenshots at 1440/1024/390 |
| Every primary branch begins PageHeader and has one H1 | Census confirms listed hand-rolled H1/header sites removed | Component branch ledger renders every named state and counts/order-checks H1 | Setup, NotFound, Artifact, Task, Review screenshots |
| Knowledge, Bet, text Artifact, embedded Review demote/suppress without identity loss | Shared context is visibly passed at four entry points | Unit/component tests assert tags, cap, wrapper/id/slots/anchors/discussion | Screenshots of duplicate and non-duplicate authored content |
| Evidence classes stay honest | This table and test names state ownership | Branch suite makes no pixel claim | E2E makes no unvisited-branch claim |

## 8. Retained hunks and line budget

### Retained failed-run hunks

None. No failed AZ11 implementation diff or corrective sheet is present in retained files, reachable refs, local worktrees, stashes, or the bounded object search. Recreating an apparent hunk from memory would be less safe than a tests-first build from current `origin/main`.

Retained **decisions**, because they are explicit in AZ11-O:

- positional breadcrumb roles;
- Artifact ancestry and duplicate-task omission;
- Setup/NotFound H1 copy;
- PageHeader sole-H1 ownership;
- +1 authored heading demotion capped at H6;
- matching-first suppression without removing Block identity/anchor/discussion;
- separate syntax, runtime, and paint evidence.

### Changed-line budget

Budget counts additions plus deletions, excluding generated screenshots:

| Area | Budget |
|---|---:|
| Breadcrumb implementation + tests | 110 |
| Authored outline implementation + DS tests | 190 |
| Artifact/Review propagation + tests | 150 |
| 17 page/nested heading migrations | 210 |
| Runtime branch ledger tests | 150 |
| Painted E2E spec | 110 |
| **Total ceiling** | **920 changed lines** |

Expected net production change is below 250 lines because most page work replaces existing headers or adds one prop. If the diff reaches 920 changed lines before evidence is complete, stop and return to this founder gate; do not cross the repository's 1,000-line complexity warning by adding an omnibus abstraction or generated page registry.

## 9. Founder gate

No implementation blocker remains if the founder approves this artifact, including the reconstructed breadcrumb arrays in §2.3. If any array differs from the unavailable corrective decision sheet, the founder must name that row before approval. Approval authorizes the same agent to run Tasks 1–6 in one tests-then-code session, followed by one fresh-agent review and no added phase or human gate.

## As-built result and one-review repair record

The founder-approved custom procedure allowed one fresh implementation review only. That review returned **NOT-DONE** with five blocking findings. The same builder repaired all five in a red-first continuation; a second review was explicitly forbidden. Founder explicitly approved shipping this repaired result on 2026-08-13, creating a human-authorized exception to the normal ship precondition that the last review verdict be DONE.

| Finding | Red evidence | As-built repair and green evidence |
|---|---|---|
| B1 — Setup submit unreachable | Focused component assertion failed because no scrolling page body owned the submit control. | Restored PageScaffold's scrolling body while keeping PageHeader first. Runtime ledger proves the scroll region contains Start HyperIdle; setup top and scrolled-submit PNGs were inspected. |
| B2 — semantic demotion changed paint | Source H1 demoted to H2 painted 20px instead of its original 24px. | Semantic tag uses the effective level; visual class uses the authored source level. All six levels and H6 cap pass. |
| B3 — runtime ledger absent | Review found no compact real rendered 17-surface ledger; static source reading could not prove branches. | Added a real-import runtime ledger for all 17 route documents, plus existing focused state suites for loading/error/empty/populated and split branches. It checks first PageHeader, one H1, and sole final current crumb without pixel claims. |
| B4 — painted proof incomplete | Required separator/history/action/title rectangles, current prefix, real overflow/ellipsis, and distinct titles were not asserted. | E2E uses distinct task/artifact titles and proves rectangles, six-character prefix, CSS ellipsis, actual scroll overflow, and non-collision at 1440/1024/390. |
| B5 — Artifact metadata removed | Suppressing the preview header removed kind, label, producing task, time, id, and title together. | ArtifactPreview now suppresses only its repeated display title; kind, label, producing task, timestamp, and id remain. Unit and painted evidence pass. |

### Final evidence

- Original red receipt: 4 intended failures / 56 tests. Review-repair red receipt: 3 failures / 49 tests for Setup scroll, heading paint, and Artifact metadata. B3 and B4 were missing-evidence failures; the first strengthened runtime/painted assertions then passed after the evidence owners were added.
- Focused component/runtime tests: 83/83 passed.
- Fresh worktree-owned focused Playwright server: 5/5 passed.
- Affected tests: 244 files / 2,287 tests passed.
- Full fast suite: 569 files / 6,240 tests passed.
- npm run check: 55 packages passed. npm run lint: passed with zero governance violations. npm run verify: passed through typecheck, lint, knip, production knip, dependency and mock inventories, design backlog drift, web build, and desktop build.
- git diff --check passed. Production H1 census found no direct production H1 outside PageHeader; runtime ownership remains with the route ledger rather than this syntax check.
- Exact implementation/test/durable-evidence budget: **919 changed lines of 920**. Approved planning/review artifacts and generated screenshots were excluded, as defined before build.
- Ten generated PNGs were personally inspected before consolidation: Artifact and Task at desktop/tablet/mobile, Review tablet, Setup top, Setup scrolled to submit, and NotFound desktop. They showed reachable Setup content, readable/non-colliding headers, and preserved Artifact metadata. Generated PNGs were intentionally removed at ship after this durable record was written; future E2E output goes to Playwright's test-results directory.

### Accepted limitation

Task-body summary geometry visible at mobile width pre-existed this package and was deliberately preserved because page-column/body geometry belongs to the dependent geometry package. This package owns orientation, breadcrumb identity, and document outline only.
