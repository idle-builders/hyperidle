# AZ2 — Every page scrolls to its end

## Work package

**Outcome.** At every supported viewport, a user can reach the last element of content on every page.

**Why this matters.** The Work page — the product's primary planning surface — clips 538px of content at 1440×900 and 706px at 1024×768 with no scroll container anywhere on the page: no scrollbar, no wheel response, no keyboard scroll. The agent roster and the entire artifacts section are unreachable on desktop. A user cannot see who is on their team. The same latent fault sits under nearly every other page and is one wrapper away from repeating.

**What exists today.** Pages follow a documented scaffold — pinned header, `flex-1` scrolling body — but the body region is declared without the minimum-height reset a flex child needs, so it grows to its content height instead of its parent's. Where an intermediate wrapper also hides overflow, the content is clipped and no ancestor can scroll it. Four regions in the codebase declare the reset correctly; the rest survive only because nothing clips them yet. The documented layout rule states this contract; nothing enforces it.

**Missing delta.** The scroll contract must be structural and enforced, not restated per page.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the correct behaviour is already documented and the cause is identified. An architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

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
