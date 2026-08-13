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
