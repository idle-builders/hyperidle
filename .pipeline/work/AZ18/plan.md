# AZ18 — Conversations navigator

## Work package

**Outcome.** A person can scan, resume and organize their conversations directly in the sidebar navigator, making the separate conversation-list step unnecessary where the navigator covers the same journeys.

**Why this matters.** Conversation switching is frequent and often recency-driven. Requiring a full list page between the current thread and the next one breaks flow and spends the main canvas on navigation rather than conversation.

**What exists today.** AZ13 preserves a provisional five-row conversation list in the dynamic navigator while the main Conversations page owns the complete list and its richer state.

**Missing delta.** A conversation-specific navigator with an intentional row model, canonical ordering, useful status, and appropriate search/filter/group controls; plus evidence-based retirement of the full list page if no unique journey remains there.

**Depends on.** AZ13 — the stable domain switcher and dynamic navigator region must exist before Conversations can own that region.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Design required. The row information, grouping model and list-page retirement decision are consequential interaction choices.

**Constraints.** One canonical ordering contract must drive every remaining representation. Full titles must remain available when visually shortened. Preserve creation and deep-link entry paths.

**Out of scope.** Conversation message composition, thread content design and new conversation-domain backend concepts.

## Acceptance criteria

- The Conversations destination fills the navigator with enough of the conversation set and state to support scanning and resuming work without an intermediate list for retained journeys.
- Sorting, filtering, grouping and search behavior selected in design are consistent, keyboard-operable and based on one canonical ordering contract.
- Responsive behavior is explicitly designed and validated for both the fixed desktop sidebar and the mobile drawer.
- The full Conversations list page is removed only if every retained list-page journey, including creating and opening conversations, remains directly reachable.

## Validation scenarios

- Given many conversations with different recency and attention states, when the user opens Conversations, then they can locate and open the intended thread from the navigator.
- Given a deep conversation route, when the user opens the mobile drawer, then the same conversation-navigation capabilities are available without losing the current thread until a new one is chosen.
