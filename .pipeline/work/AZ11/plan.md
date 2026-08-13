# AZ11 — One page geometry

> **Superseded by maintainer amendment, 2026-08-13.** Two independent reviews of the combined implementation found that this plan joined page orientation/document outline with standard/managed geometry and asked static tooling to prove runtime behavior. The founder approved replacement by [`AZ11-O`](../AZ11-O/plan.md) followed by [`AZ11-G`](../AZ11-G/plan.md). This file remains the authority for the failed combined run and its retained evidence; no new build may execute this plan.

## Work package

**Outcome.** Every page places its title, its content and its navigation in the same place, so moving between pages feels like moving inside one product.

**Why this matters.** Content width is currently declared five different ways across the app, and on every page the header's left edge misses the body's left edge by around 200px, so the title floats free of the content it names. Three different breadcrumb treatments exist, and on detail pages the back control overlaps the first character of the breadcrumb text. Onboarding banners render *above* the page header on three surfaces (founder ruling 2026-08-11: those banners are being deleted outright — see the bug list — but the rule that nothing may sit above a page header is this package's to set). Each is small; together they are why the app reads as several products.

**What exists today.** A page header and section label primitive are used on the main pages, and the layout rules document a single scaffold — but geometry within that scaffold was never decided, so each page chose. Breadcrumbs vary in separator style, in spacing and in truncation behaviour; on one page the middle crumb truncates while the longest final crumb does not. The final breadcrumb also repeats the page title directly beneath it, and on one page that repetition is a genuine second top-level heading, which the documented heading contract forbids.

**Missing delta.** One decided geometry — column width, shared left edge, breadcrumb treatment, and what may occupy the top of a page — applied to every page.

**Depends on.** AZ2 — the page scaffold and its scroll contract are settled there; deciding geometry inside a scaffold that is still being fixed would be done twice.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** The decision — one content column rule and one breadcrumb treatment spanning dense lists, prose and forms — is made in the combined refine + design + architecture round below and approved there before any code is written.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** The documented pinned-header anatomy and the one-top-level-heading-per-page rule are fixed and must hold after the change.

**Out of scope.** Sidebar composition (AZ13); what any page shows; deleting the onboarding banners themselves (bug-list work).

## Acceptance criteria

- All primary pages resolve their content column from one rule.
- A page's header and its body content share a left edge.
- One breadcrumb treatment is used everywhere a breadcrumb appears, and no control within it overlaps its text.
- Where a breadcrumb must shorten, it shortens predictably and the current page remains readable.
- A page's title is not repeated as a heading inside its own body.
- Every page renders exactly one top-level heading, and pages currently rendering none render one.
- Nothing renders above a page's header, and the rule is enforced rather than restated.

## Validation scenarios

- Given any two primary pages, when the user moves between them, then the title and the first content element sit at the same left edge on both.
- Given a deeply nested page with a long title, when the breadcrumb cannot fit, then it shortens without hiding which page the user is on.
- Given any page, when it loads, then the page header is the first thing in the content region and nothing precedes it.
