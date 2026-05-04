# Track F: Human Interface (UI)

See `CLAUDE.md` for tech stack and `plans/work-packages/dependency-graph.md` for the dependency graph.

---

### UI-00 — Foundation

**Story.** As a UI developer, I want Tailwind CSS, DaisyUI, and custom theme wired up with fonts and behavior dependencies, so that all downstream components inherit consistent styling.

**Depends on.** A1.

**Acceptance criteria.**
- `npm run dev` starts with Tailwind styles applied.
- DaisyUI button renders with factory-dark colors.
- Focus ring visible on keyboard focus.
- Fonts load correctly (Inter body, Space Grotesk headings).
- Grid alignment 4px verified.
- No custom CSS — only utilities and DaisyUI.

**Validation scenarios.**
- Given Vite running, when DaisyUI button rendered, then factory-dark colors applied.

**Contracts / constraints.**
- Theme config in tailwind.config.ts.
- Surface colors, accents, text hierarchy defined (see UI_DESIGN.md).

**Effort.** S (~1d)

---

### UI-10 — Tier 1 Primitives

**Story.** As a component library, I want five foundational primitives (StatusChip, Tag, KeyValue, NavItem, SearchField) that wrap DaisyUI with semantic mapping, so that all blocks and regions use consistent, semantically correct base elements.

**Depends on.** UI-00.

**Acceptance criteria.**
- StatusChip: status enum → correct color, icon, tooltip.
- Tag: label + color → DaisyUI badge-outline.
- KeyValue: label + value → two-column or stacked layout.
- NavItem: label + active state → DaisyUI menu-item with left bar indicator.
- SearchField: input with icons → loading state, clear button, results indicator.
- All five have ≥3 Storybook stories covering states and variants.
- Storybook build succeeds.

**Validation scenarios.**
- Given StatusChip with status='blocked', when rendered, then red color applied.
- Given KeyValue in two-column layout, when rendered, then label left, value right.

**Contracts / constraints.**
- Only DaisyUI classes and Tailwind utilities (no custom CSS).
- Semantic focus on state mapping (status → color, active → style).

**Effort.** M (~2d)

---

### UI-20 — Tier 2 Blocks

**Story.** As a component library, I want six reusable card/row components (ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow) composed from Tier 1, so that pages can quickly assemble domain objects into lists.

**Depends on.** UI-00, UI-10.

**Acceptance criteria.**
- ThreadRow: avatar + title + snippet + timestamp + actions.
- BetCard: pitch + appetite badge + status + actions.
- PitchCard: hypothesis + proposer + status + actions.
- TaskCard: title + owner + state badge + cost + actions.
- KnowledgeRow: layer badge + title + kind + status + timestamp + actions.
- NotificationRow: severity icon + message + timestamp + actions.
- Each composes ≥2 Tier 1 primitives.
- ≥2 Storybook stories per component.
- Storybook build succeeds.

**Validation scenarios.**
- Given BetCard, when rendered, then appetite badge visible.
- Given TaskCard in blocked state, then red border visible.

**Contracts / constraints.**
- Compose only Tier 1 + DaisyUI.
- All states (unread, active, blocked, etc.) visually distinct.

**Effort.** M (~3d)

---

### UI-30 — Tier 3 Shell Regions

**Story.** As a page layout, I want IconRail (left), Submenu (contextual), and Rail (right notification sidebar) so that every page has consistent navigation and ambient awareness.

**Depends on.** UI-00, UI-10, UI-20.

**Acceptance criteria.**
- IconRail: vertical icon menu, labels on hover/expand.
- Submenu: collapsible, nested items, active highlight.
- Rail: bets + blockers + cost sections, collapsible.
- Keyboard nav: arrow keys, Enter to expand, Esc to close.
- Active item state distinct.
- Rail only notification surface (no bell, no global toast).
- Storybook build succeeds.

**Validation scenarios.**
- Given IconRail, when arrow keys pressed, then focus moves between items.
- Given Rail expanded, when collapsed, then icons only visible.

**Contracts / constraints.**
- Rail is the **only** notification surface in app.
- Keyboard-first interaction (arrow keys, Enter, Esc).

**Effort.** M (~3d)

---

### UI-31 — Tier 3 Work/Planning Regions

**Story.** As a work planning surface, I want Canvas (shaped/committed columns with drag), Kanban (four state columns), and PitchSelector (pitch picker modal), so that humans can compose and organize work visually.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- Canvas: drag-drop shaped → committed, capacity badge, over-capacity warning.
- Kanban: drag-drop between state columns (hold, in_progress, review, done).
- PitchSelector: SearchField + pitch list, filter/select, checkmark on select.
- Empty states: "No bets yet", "No tasks in blocked", "No pitches available".
- Storybook build succeeds.

**Validation scenarios.**
- Given Canvas, when drag bet from shaped to committed, then card moves.
- Given Kanban, when dragging task between columns, then task state updates.

**Contracts / constraints.**
- Drag-drop via React libraries (e.g., react-beautiful-dnd).
- Only Tier 1 + Tier 2 + DaisyUI.

**Effort.** M (~3d)

---

### UI-32 — Tier 3 Review Regions

**Story.** As a review surface, I want ArtifactView (five data shapes) and ReviewHeader (verdict actions with keyboard shortcuts), so that humans can evaluate agent work and respond quickly with structured verdicts.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- ArtifactView: text_diff (green/red), content_preview (HTML+metadata), visual_comparison (before/after), action_summary (structured fields), data_metrics (headlines + charts).
- Each shape has Storybook stories: default, loading, error, empty.
- ReviewHeader: proposer info + all 10 verdict buttons + keyboard shortcuts.
- Keyboard shortcuts work: A → Approve, R → Request Changes, X → Reject, S → Snooze.
- All regions use only Tier 1 + Tier 2 + DaisyUI.
- Accessibility tests (axe) pass.

**Validation scenarios.**
- Given ArtifactView with text_diff, when rendered, then additions green, deletions red.
- Given ReviewHeader, when A pressed, then Approve button focused/activated.

**Contracts / constraints.**
- Syntax highlighting for text_diff (e.g., Prism or highlight.js).
- Keyboard shortcuts pre-fill verdict, user presses Enter to confirm.
- 10 verdict actions: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate.

**Effort.** M (~3d)

---

### UI-40 — Tier 4 Pages

**Story.** As a human user, I want nine domain pages (Conversations/Review, Conversations/Chat, Work/Portfolio, Work/Team, Work/Team+Pitch, Work/Bet, Knowledge/List, Knowledge/Detail, Settings) composed entirely from Tier 3 regions, so that all app functionality is navigable and usable.

**Depends on.** UI-30, UI-31, UI-32, E2, E3, E4, E5, E6.

**Acceptance criteria.**
- All nine pages render without errors.
- Each composed only from Tier 3 regions (no custom components outside 19-component budget).
- Navigation between pages works (Submenu items link to routes).
- Main pane content distinct per domain (thread list, bet list, knowledge list, etc.).
- Rail updates in real time from /api/ws/rail.
- Shell layout (IconRail | Submenu | Main | Rail) consistent.
- Responsive: single-column or tabs on mobile.
- Storybook build succeeds.

**Validation scenarios.**
- Given Conversations page, when item created via API, then item appears in list within 1s.
- Given Work page, when bet transitioned, then Canvas updates in real time.

**Contracts / constraints.**
- No custom components outside the 19-component budget (StatusChip, Tag, KeyValue, NavItem, SearchField, ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector).
- React Router for navigation.

**Effort.** L (~4d)

---

### UI-42 — Settings Panel

**Story.** As a human, I want to access settings from a user avatar menu with five tabs (Profile, Products, Agents, Notifications, Appearance), so that I can configure my experience and agent autonomy levels.

**Depends on.** UI-00, UI-10, UI-20, UI-30.

**Acceptance criteria.**
- Settings modal opens from avatar click in IconRail.
- Five tabs: Profile (name/email/avatar), Products (activate/deactivate per product), Agents (autonomy level dropdowns, pause/reactivate), Notifications (toggles for review/cost/blocker, quiet hours, product mutes), Appearance (theme, density).
- Save button disables while request in flight.
- Validation: cost caps ≥0, times valid 24h format.
- Feedback routed to Rail (not inline toast).
- Only composes existing Tier 1/2 + DaisyUI.

**Validation scenarios.**
- Given Settings opened, when autonomy level changed, then Save button enabled.
- Given invalid cost cap, when Save attempted, then validation error shown.

**Contracts / constraints.**
- Five tabs using DaisyUI tabs component.
- No new components outside 19-component budget.
- Theme UI (light/dark) deferred to v2.

**Effort.** S (~2d)

---

### UI-45 — Global Search Panel

**Story.** As a human, I want to press ⌘K to open a global search modal that searches conversations, bets, and knowledge items with real-time results grouped by type, so that I can quickly navigate to any item.

**Depends on.** UI-00, UI-10, UI-20.

**Acceptance criteria.**
- ⌘K opens search modal (Ctrl+K on Windows/Linux).
- SearchField focused automatically.
- Typing filters results in real time.
- Results grouped by type (Conversations, Work, Knowledge).
- Arrow keys navigate, Enter selects, Esc closes.
- Results rendered as ThreadRow, BetCard-lite, KnowledgeRow.
- No results → "No matches. Try different query."
- Only composes existing Tier 1/2 + DaisyUI.

**Validation scenarios.**
- Given ⌘K pressed, when search modal opened, then SearchField focused.
- Given search typed, when results loaded, then grouped by type.

**Contracts / constraints.**
- No new components outside 19-component budget.
- Results use existing Tier 2 rows.

**Effort.** S (~2d)

---

### UI-50 — Polish

**Story.** As a user, I want smooth transitions, loading states, empty states, keyboard shortcuts, and accessibility features, so that the app feels polished and is usable without a mouse.

**Depends on.** UI-00 through UI-45.

**Acceptance criteria.**
- Page transitions smooth (fade, slide).
- Empty state placeholders for: no conversations, no bets, no knowledge.
- Loading spinner and error toasts.
- Keyboard shortcuts: Alt+1 (Conversations), Alt+2 (Work), Alt+3 (Knowledge), Alt+4 (Settings). Arrow keys in Rail/Submenu. Enter to expand, Esc to close modals.
- ARIA labels on all interactive elements.
- Color contrast WCAG AA minimum.
- Keyboard-only navigation works (no mouse).
- axe accessibility tests pass (Storybook).

**Validation scenarios.**
- Given page transition, when smooth animation plays, then no jarring jumps.
- Given empty conversations list, when rendered, then placeholder shown.
- Given Alt+1 pressed, then Conversations view opens.

**Contracts / constraints.**
- No custom CSS — Tailwind animations.
- axe integration in Storybook.

**Effort.** S (~2d)

---
