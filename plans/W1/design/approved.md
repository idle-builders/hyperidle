# W1 Design Approved

**Date:** 2026-06-01
**Reviewer:** Reviewer agent (Phase 2 critique)
**Design score:** 8/10
**Architecture score:** 7/10
**Verdict:** Approved for W2 implementation

---

## What Was Approved

The complete set of W1 Hearth Foundation Design deliverables:

### Foundation Primitives (10 files)
Avatar.html, Button.html, Input.html, Select.html, Toggle.html, Checkbox.html, TabBar.html, Toast.html, Progress.html, Tooltip.html

### Rewritten Components (7 files)
BetCard.html, ThreadRow.html, Composer.html, EmptyState.html, ErrorState.html, NavItem.html, CommentRow.html

### Screen Mockups (12 files)
conversations-thread-list.html, conversations-thread-detail.html, conversations-empty.html, work-bet-overview.html, work-bet-detail.html, work-empty.html, knowledge-list.html, knowledge-detail.html, knowledge-empty.html, settings.html, onboarding.html, error-states.html

### Design System Docs (2 files)
DESIGN.md (manifesto format), AESTHETICS.md (19 rules)

---

## Key Design Decisions

1. **One size per component.** No density system. Every component has exactly one visual treatment — the one defined in 03-hearth.html. This eliminates 3x CSS surface and 3x visual verification.

2. **Left-aligned empty states.** Empty states use surface-page background and left-alignment. They sit into the canvas rather than floating above it. This is an explicit anti-AI-aesthetic decision (AQ-008).

3. **Status through content only.** Cards are structurally uniform regardless of status. Status is communicated through dots, badges, and text color inside the card. The single exception is toast's 1.5px left-border accent (AQ-004).

4. **Agent avatar distinction via tint.** Agent avatars use accent-primary tint background, accent-primary border, and accent-primary text color. This persists across all sizes and contexts (AQ-012).

5. **Sidebar is consistent across all screens.** Brand wordmark, bet items with 8px status dots, team items, dividers, active state with elevated background + subtle shadow. Knowledge screens adapt the sidebar to show Scope + Topics instead of Bets + Teams.

6. **Settings uses stacked sections.** All five settings sections (Profile, Teams, Appearance, Credentials, Notifications) are displayed in a single scrollable panel rather than separate pages. This matches the tab-switching nav on the left sidebar.

7. **Onboarding is a centered card.** Unlike the rest of the app (which uses sidebar + main panel), onboarding is a single centered elevated card on the page background. This signals "you are not inside the app yet" and focuses attention on the setup flow.

8. **Error states are warm cards.** All three error types (404, API error, empty-but-healthy) use elevated cards with tinted icon circles, helpful descriptions, and pill action buttons. The differentiation is in icon color tint and copy, not in structural treatment.

---

## Noted Gaps for W2 Builder

The following gaps were identified during critique. They do not block approval but must be addressed during TSX implementation:

1. **ARIA roles missing on Toggle, Checkbox, TabBar, Progress.** The HTML references omit role="switch", role="checkbox", role="tablist"/role="tab", and role="progressbar". The TSX implementations must add these.

2. **No disabled state demo for Toggle and Checkbox.** The builder should implement disabled as opacity: 0.5, matching Button/Input/Select treatment.

3. **No prefers-reduced-motion handling.** The builder must add `@media (prefers-reduced-motion: reduce)` to suppress transitions.

4. **Sidebar items in screen mockups use div, not button.** The TSX page implementations should use semantic elements (button or anchor) for interactive sidebar items, matching NavItem.html's pattern.

5. **Settings inline style buttons.** The Edit/Remove buttons use inline React style objects. The TSX should use proper Button component composition.

---

## Token Compliance Summary

All files use `_tokens.css` semantic tokens. The following hardcoded values are intentional and match 03-hearth.html:
- `#c53e30` — destructive button hover
- `#b86305` — amber button hover
- `rgba(22, 118, 79, ...)` — ghost hover tint, action block tint, badge tints
- `rgba(220, 74, 58, ...)` — error icon tint, error badge tint
- `rgba(217, 119, 6, ...)` — amber badge tint
- `rgba(46, 125, 186, ...)` — info badge tint, knowledge empty icon tint
- `rgba(44, 36, 26, ...)` — hover background tint on flat items

These are derived from the three Hearth generators (cream base, forest accent, earth text) and match the reference exactly.
