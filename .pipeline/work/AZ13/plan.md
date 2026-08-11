# AZ13 — Sidebar navigation is one system

## Work package

**Outcome.** The sidebar presents one navigation system whose items are readable, and the primary destinations stay reachable from anywhere in the app.

**Why this matters.** Beneath the three primary destinations sits a second, unlabelled list of recent objects truncated to about fourteen characters — "Write the four-em…", "Decision: client-si…" — with no tooltip and an order that disagrees with the main list it duplicates, and disagrees again on a third page. Meanwhile, opening settings replaces the primary navigation entirely, leaving a single unlabelled icon as the only way back to the rest of the product. A user's map of the application changes depending on where they are standing.

**What exists today.** The sidebar hosts primary navigation, a secondary recent-objects list and a settings mode that takes over the whole region. The secondary list has no heading, no full-text affordance and no stated ordering rule. Documentation still describes a brand mark in this region that the shipped sidebar does not render — two sources of truth that disagree.

**Missing delta.** A decided sidebar composition: what the secondary list is for, or that it should not exist; and primary navigation that persists across app modes.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the architecture round.** The product decisions — whether the secondary list earns its space, and how a mode like settings coexists with primary navigation — are made in the architecture round below and approved there before any code is written.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Whatever is decided must hold at every viewport, including the phone drawer, which presents the same navigation.

**Out of scope.** Page content; the notification and assistant overlays anchored near the sidebar; search entry point behaviour (AZ1).

## Acceptance criteria

- The sidebar presents one navigation system with a stated purpose for each region it contains.
- Primary destinations are reachable from every application state, including while settings is open.
- Any list item whose label is shortened exposes its full text to both pointer and assistive technology.
- Where a list has an order, that order is the same everywhere the list appears.
- The shipped sidebar and the documentation describing it agree.

## Validation scenarios

- Given settings is open, when the user wants to return to conversations, then a labelled primary destination is visible without discovering an unlabelled icon.
- Given a secondary list item whose label is shortened, when the user points at it, then the full label is available.
- Given the same list on two different pages, when the user compares them, then the items appear in the same order.
