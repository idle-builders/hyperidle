# AZ1 — Overlays accept input

## Work package

**Outcome.** A user can open global search, type into it, see results and act on one; and at a phone viewport, open the navigation drawer and tap an item. Both dismiss with Escape and with a click outside.

**Why this matters.** Global search is the fastest path to any object by name, and on a phone the drawer is the *only* navigation. Both are dead today, so a desktop user's shortcut and a phone user's entire ability to change page are gone. Not doing this leaves the product unusable on mobile.

**What exists today.** Both surfaces render their panel and scrim inline inside the application root while requesting modal dialog behaviour. That behaviour marks the application root inert; because the panel is a descendant of that root, it inerts itself. Verified live: hit-testing the search input returns the document body, typed characters leave the field empty, Escape does not close, and a drawer navigation item cannot be activated at all. A document-level key listener was added so the shortcuts still close the drawer — the symptom is worked around, the cause is not. The design system's dialog already renders through a dedicated overlay host and does not have this defect.

**Missing delta.** A modal overlay must render outside the region it makes inert.

**Depends on.** None.

**Complexity.** S

**Engineering tier.** mvp

**Pre-build.** Not required — the outcome is a restored interaction with an identified cause and no user-facing design change.

**Constraints.** Existing shortcuts keep working (⌘K opens and closes search; Escape dismisses). No change to what search returns or to drawer styling.

**Out of scope.** Search result ranking or coverage, the palette's empty-state copy, drawer visual design, the scrim's extent over the sidebar.

## Acceptance criteria

- With the global search overlay open, typing inserts characters into its input.
- With the global search overlay open, activating a result navigates to that result.
- The global search overlay closes on Escape and on a click outside it.
- At a phone viewport with the navigation drawer open, activating a navigation item navigates to that destination.
- No overlay marks itself, or any ancestor that contains it, as inert.
- Automated evidence fails if a modal overlay regresses to rendering inside the region it inerts.

## Validation scenarios

- Given a desktop viewport, when the user opens global search and types a thread name, then matching results appear and activating one opens that thread.
- Given a 375px viewport, when the user opens the drawer and taps a primary destination, then that page loads.
- Given either overlay open, when the user presses Escape, then it closes and focus returns to the control that opened it.
