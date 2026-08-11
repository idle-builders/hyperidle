# AZ11 — One page geometry

## Work package

**Outcome.** Every page places its title, its content and its navigation in the same place, so moving between pages feels like moving inside one product.

**Why this matters.** Content width is currently declared five different ways across the app, and on every page the header's left edge misses the body's left edge by around 200px, so the title floats free of the content it names. Three different breadcrumb treatments exist, and on detail pages the back control overlaps the first character of the breadcrumb text. Onboarding banners render *above* the page header on three surfaces, pushing the real content down and, on a phone, consuming a sixth of the screen. Each is small; together they are why the app reads as several products.

**What exists today.** A page header and section label primitive are used on the main pages, and the layout rules document a single scaffold — but geometry within that scaffold was never decided, so each page chose. Breadcrumbs vary in separator style, in spacing and in truncation behaviour; on one page the middle crumb truncates while the longest final crumb does not. The final breadcrumb also repeats the page title directly beneath it, and on one page that repetition is a genuine second top-level heading, which the documented heading contract forbids.

**Missing delta.** One decided geometry — column width, shared left edge, breadcrumb treatment, and what may occupy the top of a page — applied to every page.

**Depends on.** AZ2 — the page scaffold and its scroll contract are settled there; deciding geometry inside a scaffold that is still being fixed would be done twice.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Design required.** Choosing one content width and one breadcrumb treatment across surfaces with genuinely different content shapes (dense lists vs. prose vs. forms) is a user-facing decision not determined by an existing approved pattern.

**Constraints.** The documented pinned-header anatomy and the one-top-level-heading-per-page rule are fixed and must hold after the change.

**Out of scope.** Sidebar composition (AZ13); what any page shows; the onboarding system's content or triggering, beyond where it may render.

## Acceptance criteria

- All primary pages resolve their content column from one rule.
- A page's header and its body content share a left edge.
- One breadcrumb treatment is used everywhere a breadcrumb appears, and no control within it overlaps its text.
- Where a breadcrumb must shorten, it shortens predictably and the current page remains readable.
- A page's title is not repeated as a heading inside its own body.
- Every page renders exactly one top-level heading, and pages currently rendering none render one.
- Nothing renders above a page's header.

## Validation scenarios

- Given any two primary pages, when the user moves between them, then the title and the first content element sit at the same left edge on both.
- Given a deeply nested page with a long title, when the breadcrumb cannot fit, then it shortens without hiding which page the user is on.
- Given a page carrying an onboarding hint, when the page loads, then the hint appears below the page header and the content does not shift down the page.
