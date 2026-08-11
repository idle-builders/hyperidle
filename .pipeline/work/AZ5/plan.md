# AZ5 — No dead or lying controls

## Work package

**Outcome.** Every control that looks actionable does something, and any control that cannot act does not present itself as available.

**Why this matters.** The most prominent button in a review thread — "Open review", the product's core plan → interact → review loop — silently does nothing when its destination cannot be built: no navigation, no message, not disabled. A user clicks the primary call to action on the product's central workflow and the app ignores them. Elsewhere a disabled filter renders identically to its enabled siblings and still shows a pointer cursor. A control that lies about being actionable costs more trust than a missing feature.

**What exists today.** At least one action handler documents a deliberate silent no-op when it cannot construct a destination — avoiding a dead URL, which is right, but rendering a full-contrast primary button that does nothing, which is not. Disabled state is expressed by reducing opacity, which leaves a disabled primary still visually dominant while dropping its label contrast, and at least one disabled control carries no disabled styling at all.

**Missing delta.** Availability must be visible: unavailable actions are either absent or unmistakably unavailable, and never silently inert.

**Depends on.** None.

**Complexity.** S

**Engineering tier.** mvp

**Pre-build.** Not required — no new surface; this decides presence and state of existing controls.

**Constraints.** Do not create dead destinations to make a button work; absence or an explained unavailable state is the correct outcome when there is nowhere to go.

**Out of scope.** Adding the missing review destination itself; cursor and hover behaviour generally (AZ10).

## Acceptance criteria

- Activating any control that renders as available produces an observable result.
- A control whose action cannot be performed is either not rendered or rendered as unavailable with a reason discoverable by the user.
- An unavailable control is visually distinguishable from an available one beyond a change in opacity, and does not present an interactive cursor.
- No user-facing control handler completes with no observable effect and no explanation.

## Validation scenarios

- Given a review request in a thread whose destination cannot be resolved, when the thread renders, then no full-contrast primary action offers to open it.
- Given a review request whose destination resolves, when the user activates it, then the review surface opens.
- Given a filter option that cannot currently be selected, when the user sees it, then it reads as unavailable and does not respond to a click.
