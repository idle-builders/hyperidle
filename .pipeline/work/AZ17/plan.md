# AZ17 — Notifications navigator

## Work package

**Outcome.** A person deciding what needs attention can scan, filter, group and open notifications directly in the sidebar navigator, without first visiting a separate list surface.

**Why this matters.** Notifications are a “where should I go next?” mechanism. Keeping their useful state in a separate popover or list adds a transition at the exact moment the person is trying to orient quickly.

**What exists today.** The sidebar exposes a Notifications trigger with an unread signal, and a popover presents notification rows. The AZ13 shell reserves the large navigator region for domain-owned browsing.

**Missing delta.** A notification-specific navigator that defines useful row status, grouping, filtering, ordering and read-state behavior, then retires redundant list or popover navigation only where equivalent access is proven.

**Depends on.** AZ13 — the stable domain switcher and dynamic navigator region must exist before Notifications can own that region.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Design required. Notification priority, read state, grouping and the relationship to the existing popover need an approved interaction model.

**Constraints.** Use only notification state the product can truthfully provide. Preserve full-label and assistive-technology access. Do not remove an existing access path until its user-visible capabilities are available in the navigator or deliberately rejected.

**Out of scope.** New notification sources, delivery channels or notification settings.

## Acceptance criteria

- The Notifications destination fills the sidebar navigator with a useful, scannable notification view whose ordering and status meanings are explicit and consistent.
- A user can narrow and organize the notification view using the controls selected in design, and open a notification’s real destination from its row.
- Sorting, filtering, grouping and responsive behavior are explicitly designed and validated for both the fixed desktop sidebar and the mobile drawer.
- Any notification list or popover made redundant is removed only after all retained user journeys are reachable from the navigator.

## Validation scenarios

- Given unread and previously seen notifications, when the user opens Notifications, then the navigator makes their different states and ordering understandable without opening another list.
- Given the user is looking for a particular kind of notification, when they use the navigator controls, then the visible rows update predictably and remain operable by keyboard.
