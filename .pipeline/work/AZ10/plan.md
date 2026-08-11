# AZ10 — The interface responds to the pointer

## Work package

**Outcome.** Things that can be clicked look clickable, respond when pointed at, and — where they lead somewhere — behave like real destinations a user can open in a new tab, copy or middle-click.

**Why this matters.** The application currently renders no links at all: every navigation is a button plus a programmatic call, so there is no way to open a thread in a new tab, copy its address, or preview where something goes before clicking. Eleven of eighteen interactive elements on a typical page show the default arrow cursor, including the entire primary navigation, and the most-used list in the product — the conversation queue — has no hover response whatsoever. This is the cheapest possible change with the largest effect on whether the product feels real.

**What exists today.** The router is in place and every destination has an address; the pages simply do not use anchors to reach them. Some lists get hover and cursor treatment through the shared row primitive; the hand-rolled ones get neither. Focus rings exist but at least one sits flush against the neighbouring item.

**Missing delta.** Navigation expressed as links, and a consistent pointer, hover and focus response on everything interactive.

**Depends on.** None.

**Complexity.** S

**Engineering tier.** mvp

**Pre-build.** Not required — no new surface or visual concept; hover and focus treatments already exist in the shared primitives.

**Constraints.** Keyboard activation and existing shortcuts must not regress. Controls that act without changing the address stay buttons — this is not a blanket conversion.

**Out of scope.** Changing any route or address; adding a browser-history or breadcrumb affordance.

## Acceptance criteria

- Anything whose activation changes the current address is a link carrying that address, and supports modifier-click and middle-click to open separately.
- Every interactive element presents an interactive cursor.
- Every interactive element has a visible hover response.
- Keyboard focus is visible on every interactive element and does not overlap adjacent elements.
- Automated evidence fails if a navigation control is introduced without an address.

## Validation scenarios

- Given the conversation queue, when the user points at a row, then the row responds and the cursor indicates it can be clicked.
- Given any list of objects, when the user middle-clicks an item, then it opens separately without disturbing the current view.
- Given a keyboard user tabbing through the sidebar, when focus lands on an item, then the focus indicator is fully visible and does not touch the neighbouring item.
