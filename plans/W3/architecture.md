# W3 Architecture Plan — Screen Implementation Parity

> Make every TSX screen match the revised HTML mockups in `packages/design-system/html/screens/`.

---

## 0. Orientation

**Source of truth.** The 14 HTML mockup files are the authoritative design. TSX must match them. HTML files are never modified.

**Scope.** 59 acceptance criteria across 8 screen groups. One new route, one new page component, one new in-page state (knowledge edit mode), cross-cutting sidebar changes, cross-cutting max-width centering, and E2E test updates.

**Depends on.** W2 (density removal, primitives) must be merged to main before W3 branches.

**Out of scope.** Session dial-in view, RecipientPicker design, block ref embeds, mobile layouts.

---

## 1. Cross-Cutting: Sidebar (AC-1 through AC-4)

### 1.1 Current State

`packages/web/src/shell/Sidebar.tsx` has three sections (Conversations, Work, Knowledge) with:
- Conversations: recent thread sub-items (correct per AC-4)
- Work: team sub-items from API (correct per AC-2)
- Knowledge: static KNOWLEDGE_SCOPE_ITEMS (Practices, Products, Factory) as sub-items

Bottom strip has: CoC button ("Chief of Staff") and a Settings button (avatar + gear icon).

### 1.2 Changes Required

**AC-1: Bottom strip = Search hint + avatar + Assistant button.**

The mockup shows three elements:
1. Search hint row: "Search" label + `Cmd+K` kbd badge
2. Divider
3. Row: user avatar (28px, initials) + "Assistant" text (the CoC/Assistant button)

Current bottom strip has CoC button (full-width with "Chief of Staff" text) + Settings button (avatar + gear). The mockup merges avatar and Assistant into a single row: avatar on left (clicking it opens settings), "Assistant" text on right (clicking it toggles CoC).

**Changes to `Sidebar.tsx`:**
- Remove the separate CoC button and Settings button
- Replace with mockup layout:
  - `sidebar-search-hint` row: `<span>Search</span> <kbd>Cmd+K</kbd>` — clicking anywhere opens command-K
  - Divider (`<hr>`)
  - Bottom row: avatar (28px circle, initials, `onClick={onSettingsClick}`) + "Assistant" text/button (`onClick={onCocClick}`)
- The avatar needs `cursor: pointer` and serves as the settings trigger
- The "Assistant" label serves as the CoC trigger

**Props changes to `SidebarProps`:** Add `onSearchClick: () => void` — wired in AppShell to `commandK.open()`.

**AppShell changes:** Pass `onSearchClick={commandK.open}` to Sidebar.

**AC-2: Work sub-nav = teams from API.** Already correct. No changes.

**AC-3: Knowledge sub-nav = no sub-items.** Currently renders three static scope items. Remove the `KNOWLEDGE_SCOPE_ITEMS` list rendering from the Knowledge section. The sidebar should show only the "Knowledge" section header with no sub-items. Scopes are handled as inline pills on the Knowledge list page (already implemented).

Remove props: `activeScope`, `onSelectScope` from SidebarProps (and from AppShell's Sidebar invocation). The `KNOWLEDGE_SCOPE_ITEMS` array and its rendering loop are deleted from Sidebar.tsx.

**AC-4: Conversations sub-nav = recent threads.** Already correct. No changes needed.

### 1.3 Files Modified

| File | Change |
|------|--------|
| `packages/web/src/shell/Sidebar.tsx` | Restructure bottom strip; remove knowledge scope sub-items; add onSearchClick prop |
| `packages/web/src/layouts/AppShell.tsx` | Pass `onSearchClick` to Sidebar; remove `activeScope`/`onSelectScope` props from Sidebar call; remove handleSelectScope and activeScope state |
| `packages/web/src/shell/shell-types.ts` | No changes expected |

### 1.4 E2E Impact

- `conversations-submenu.spec.ts` — may assert on sidebar scope items; update
- `knowledge-ia.spec.ts` — may click sidebar scope buttons; update to use inline pills instead
- `settings-overlay.spec.ts` — avatar click triggers settings; selector may change
- `U9-screen-layouts.spec.ts` — layout assertions may reference sidebar structure

---

## 2. Conversations Pages (AC-5 through AC-12)

### 2.1 Thread List (AC-5 through AC-8)

**AC-5: Flat chronological list (no Active/Resolved grouping).**

Current: `ThreadSections` component renders threads. Inspect whether it groups by section. The mockup shows a simple flat list sorted reverse-chronologically. If ThreadSections currently groups, the grouping logic needs removal/bypass. If it's already flat, no change needed.

Action: Verify `packages/web/src/components/ThreadSections.tsx` — if it groups threads under section headers, remove the grouping. Render all threads in a single flat `<div>` sorted by timestamp descending.

**AC-6: Filter chips are toggle-style (Blocking, Unread).**

Current: `FilterPillBar` in Conversations.tsx renders "All / Blocking / Async" as mutually exclusive tabs (`role="tab"`). The mockup shows "Blocking" and "Unread" as independently toggleable chip buttons (not tabs).

Changes:
- Replace `ConversationsFilter` type from `"all" | "blocking" | "async"` to `{ blocking: boolean; unread: boolean }` — or keep simple by allowing combinations
- Replace `role="tablist"` / `role="tab"` with toggle buttons (`aria-pressed`)
- Each chip toggles independently: clicking "Blocking" toggles `blocking` filter on/off
- Filter logic: when both are off, show all. When one is on, filter to matching threads. When both are on, filter to threads matching both criteria.

Type changes in `AppShellOutletContext`:
- `conversationsFilter` changes from `ConversationsFilter` (string enum) to `{ blocking: boolean; unread: boolean }`
- `onFilterChange` changes signature accordingly

**AC-7: "Blocking" badge on thread rows with unresolved reviews.**

Current: `ThreadRow` component in design system. Check if it already has a `blocking` badge prop. The mockup shows `<span class="badge badge--blocking">Blocking</span>` in the thread meta area.

If ThreadRow doesn't support a blocking badge, add a `blocking?: boolean` prop. When true, render a red-tinted "Blocking" badge in the meta section.

**AC-8: "New thread" button in header.**

Current: The "New Thread" button exists in `FilterPillBar` inside Conversations.tsx. The mockup places it in the main header (top-right). Move the button or add it to the header area.

Changes: The mockup's main-header has `<h2>` on left + filter chips in middle + "New thread" button on right. Match this layout.

### 2.2 Thread Detail (AC-9 through AC-12)

**AC-9: Inline artifact card.**

Current: `resolveArtifactSlot` in Conversations.tsx renders ArtifactView for artifact refs. The mockup shows a card with: artifact type label (uppercase), title, preview content, status indicator. Check if ArtifactView already produces this card shape, or if the mockup's `.artifact-card` needs a new sub-component.

The existing `ArtifactPreview` / `ArtifactEmbed` components in the design system may already cover this. If not, create an inline artifact card that matches the mockup (type label, title, preview text, status badge).

The mock data in thread fixtures needs at least one message with an artifact ref so the E2E test can verify AC-9.

**AC-10: "Dial in" button with live indicator.**

Current: The dial-in header exists in `ConversationsDetail` — a `live-dot` span + "Dial In" button that appears when `activeSession` is non-null. The mockup shows a `btn-secondary` with a pulsing green dot + "Dial in" text in the thread detail header bar (not above the messages).

Changes: Move the dial-in affordance from above the messages into the main header's right side (next to badges). Match mockup: `<button class="btn-secondary"><span class="live-dot"></span> Dial in</button>`.

**AC-11: Approve/Reject verdict buttons.**

Current: `ThreadShell` renders `RichMessageCard` for review messages, which includes verdict buttons. The mockup shows an action row with "Approve" (primary btn) + "Reject" (secondary btn) below a review request message. Verify the existing verdict buttons match this shape.

**AC-12: Composer stretch (align-items: stretch).**

Current: The `Composer` component. The mockup shows `.thread-composer` with `align-items: stretch` so the input and Send button are equal height. Verify/fix the Composer component's layout. Add `items-stretch` to the composer flex container.

### 2.3 Files Modified

| File | Change |
|------|--------|
| `packages/web/src/components/ThreadSections.tsx` | Remove section grouping if present; flat list |
| `packages/web/src/pages/Conversations.tsx` | Restructure FilterPillBar (toggle chips), move header layout, move dial-in to header |
| `packages/web/src/components/ThreadSections.tsx` or its types | Update filter type |
| `packages/design-system/src/ThreadRow.tsx` | Add `blocking` badge prop |
| `packages/design-system/src/Composer.tsx` | Ensure `items-stretch` layout |
| `packages/web/src/layouts/AppShell.tsx` | Update ConversationsFilter type in OutletContext |

---

## 3. Work Pages (AC-13 through AC-32)

### 3.1 Bet Overview / Portfolio (AC-13 through AC-18)

**AC-13: Status filter tabs as horizontal pills.**

The mockup shows a `tab-bar-pill` container with All/Active/Completed/Draft pills in the content header. Current: team pill filters exist but no status filter tabs.

Add a `statusFilter` state to WorkPortfolio: `"all" | "active" | "completed" | "draft"`. Render a pill-tab bar matching the mockup's `.tab-bar-pill` (container with rounded-full bg) + `.tab-pill` (individual pills). Place it in the header row between the heading and the New bet button.

Filter bets client-side: when "active" selected, show bets with status "active"; etc.

**AC-14: Team pill filters from API.**

Already implemented. Verify the styling matches the mockup's `.team-pill` (border + text, not filled buttons).

Current: uses DaisyUI `btn btn-xs btn-primary/btn-ghost`. Mockup uses custom `.team-pill` with `border: 1.5px solid var(--border-default)` and `--active` variant with green tint. Switch from DaisyUI btn classes to custom classes matching the mockup.

**AC-15: No status dots on bet cards.**

Current BetCard in design system — check if it renders status dots. If so, remove. Mockup shows only a status badge (e.g., `badge--green "Active"`), no colored dot.

**AC-16: Bet cards show title, description, progress bar + %, avatar group, budget badge.**

Current BetCard may not show description or progress. The mockup shows:
- Top row: status badge (left) + budget badge (right)
- Title (17px, 600 weight)
- Description (13px, 3-4 lines, text-secondary)
- Progress bar (8px track)
- Footer: avatar group (left) + percentage label (right, mono)

Extend `BetCard` props: add `description?: string`, `progress?: number`, `avatarGroup?: Array<{initials: string; agent?: boolean}>`, `budgetLabel?: string`.

The WorkPortfolio page passes these from the bet data.

**AC-17: "New bet" button.** Already exists. Verify position matches mockup (right side of header row).

**AC-18: Bet grid max-width 960px, centered.** Add `max-w-[960px] mx-auto w-full` to the bet grid container in WorkPortfolio.

### 3.2 Bet Detail (AC-19 through AC-25)

**AC-19: Overflow action menu.**

Current: `BetActionsBar` renders inline buttons (Pause, Adjust appetite, Unblock, Kill). Mockup shows a single "..." overflow button in the header that opens a dropdown with these actions.

Replace `BetActionsBar` with:
1. A `btn-overflow` button ("...") in the header row
2. A dropdown/popover (DaisyUI `dropdown` + `dropdown-content`) with menu items: Pause, Adjust appetite, Unblock, Kill

**AC-20: Stat cards row.**

Current: cost section exists but not as stat cards. Mockup shows a 3-card row:
- Progress: percentage + progress bar
- Budget spent: dollar amount + "of $X appetite" sub
- Team: avatar group + "N members" text

Create a `StatsRow` section in WorkBet composed from simple div cards matching `.stat-card` in mockup (background, border-radius, padding). Not a new design-system component — inline page-level composition.

**AC-21: "Pitch" section with Edit button.**

Current: conditional BodyEditor (mutable) or BetPitch (immutable). The mockup shows a section with "PITCH" title + "Edit" ghost button on the right. Match this layout: add the section title row with Edit button.

**AC-22: Task rows — title, owner, status badge, clickable.**

Current: task table with sortable columns (title, status, outcome, owner, cost, session). Mockup shows simpler task rows: `.task-row` with `.task-info` (title + meta line "Owner . Status . Started") + status badge. No table, no sort headers.

Replace the `<table>` with a flat list of `.task-row` divs. Each row is clickable (navigates to task detail page via the new route).

Navigation: `onClick={() => navigate(\`/work/bet/${betId}/task/${task.id}\`)}`.

**AC-23: Artifacts section.** Current `ArtifactSection` exists. Mockup shows simple artifact rows (icon + name + meta). Verify existing component matches or simplify to match mockup's `.artifact-row` pattern.

**AC-24: Discussion section with composer + Send.** Current `HostThreadSection` exists. Mockup shows "Discussion" section title + messages + composer (input + Send button with `align-items: stretch`). Verify composer stretch. Verify section title matches mockup's `.section-title` style.

**AC-25: Content max-width 800px, centered.** Wrap the detail body in `max-w-[800px] mx-auto w-full`. Match mockup's `.detail-body`.

### 3.3 Task Detail — NEW Page (AC-26 through AC-32)

**AC-26: Route `/work/bet/:betId/task/:taskId`.**

New route in `router.tsx`. New page component `WorkTask.tsx` in `packages/web/src/pages/`.

```typescript
// router.tsx — add after the bet route
{ path: "work/bet/:betId/task/:taskId", element: <WorkTask /> },
```

Import: `import { WorkTask } from "./pages/WorkTask";`

**AC-27: Breadcrumb.**

Work / [Team] / [Bet] / [Task title]. Needs bet data to resolve team name. Use `useBet(betId)` to get bet.team, and fetch task from the bet's task list or a dedicated endpoint.

Data fetching approach: `useBet(betId)` returns the bet with its tasks. Find the task by taskId from bet.tasks. If not found, show error state.

**AC-28: Metadata strip.**

The mockup shows `.meta-strip` — a horizontal card divided into cells:
- Owner: avatar + name
- Status: live-dot + "In progress"
- Started: relative time
- Cost: dollar amount
- Session: Active/Completed + Dial-in button

Render as a flex row of `.meta-cell` divs inside a `.meta-strip` container. Not a new design-system component — page-level composition.

**AC-29: Sessions section.**

List of agent sessions for this task. Each row: title, agent, cost, tokens, status. Active sessions show "Dial in" button.

Data: Need a sessions endpoint or derive from task data. Current task type in `BetDetail["tasks"]` has `latestSessionHarnessUrl` and `latestSessionOutcome`. For full session list, may need `GET /api/sessions?task_id=<taskId>`.

Check if `/api/sessions` endpoint exists and supports `task_id` filter. The `useActiveSessionForTask` hook in Conversations.tsx already fetches from this endpoint. Create a `useTaskSessions(taskId)` hook that fetches all sessions (not just active).

**AC-30: Discussion section.** Reuse `HostThreadSection` with `hostKind="task"` and `hostId={taskId}`.

**AC-31: Artifacts section.** Reuse `ArtifactSection` with `filter={{ axis: "task", taskId }}`.

**AC-32: Content max-width 800px, centered.** Same pattern as bet detail.

### 3.4 New Files

| File | Purpose |
|------|---------|
| `packages/web/src/pages/WorkTask.tsx` | Task detail page component |
| `packages/web/src/pages/WorkTask.stories.tsx` | Storybook stories for task detail |
| `packages/web/src/hooks/useTaskSessions.ts` | Hook to fetch sessions for a task |

### 3.5 Modified Files

| File | Change |
|------|--------|
| `packages/web/src/router.tsx` | Add task detail route |
| `packages/web/src/pages/WorkPortfolio.tsx` | Add status filter tabs, restyle team pills, add max-width, update bet card props |
| `packages/web/src/pages/WorkBet.tsx` | Replace action bar with overflow menu, add stat cards, simplify task rows to flat list, add task row navigation, add max-width |
| `packages/design-system/src/BetCard.tsx` | Add description, progress, avatarGroup, budgetLabel props |
| `packages/design-system/src/BetCard.stories.tsx` | Update stories for new props |

---

## 4. Knowledge Pages (AC-33 through AC-46)

### 4.1 Knowledge List (AC-33 through AC-38)

**AC-33: Scope filter pills inline above the list.**

Current: scope pills exist in KnowledgeList.tsx with fixed options (All/Practices/Products/Factory). Mockup shows scope pills with data-driven labels ("All", "Auth", "Infrastructure", "Product", "API Design").

Change: derive scope pills from the data (unique topic values or scope tags from the API) instead of hardcoded options. Add an "All" pill at the start.

**AC-34: Sort controls visible.**

Current: sort controls exist (Relevance/Recency/Frequency) in the Triage view only. Mockup shows them below scope pills, above the list, visible in both views. Move sort controls to be always visible (not tab-gated).

Mockup style: `.sort-bar` with "Sort:" label + plain text buttons (not pill buttons). Active option: green + bold. Change from DaisyUI btn classes to plain text buttons matching the mockup.

**AC-35: Knowledge rows — title, preview, kind badge, status badge, no status dots.**

Current KnowledgeRow renders title + layer/kind/status chips + timestamp. Verify no status dots. Add preview text display (body excerpt).

**AC-36: "+ New" button in header.** Already exists. Verify position.

**AC-37: Curated/Triage tab switching.** Already works. Verify tab styling matches mockup's `.tab-bar-pill` pattern.

**AC-38: Content max-width 800px, centered.** Add to the `.knowledge-list` container.

### 4.2 Knowledge Detail (AC-39 through AC-43)

**AC-39: "Edit" as primary button + "..." overflow.**

Current: "Edit" button + "Change scope" button inline. Mockup shows "Edit" as `.btn-primary` + "..." overflow button with Flag/Archive/Change scope items.

Replace "Change scope" button with overflow button. Move scope change, flag, archive into a dropdown menu from the "..." button.

**AC-40: Two-column layout — body + metadata aside.**

Current: `grid-cols-1 lg:grid-cols-[1fr_14rem]`. Mockup shows side-by-side at all desktop widths. Change to always two-column at desktop. The aside shows metadata card with: Kind, Status, Confidence, Last edited, Editor, Access count.

Replace `RelatedSidebar` with a `MetadataAside` that renders a `.meta-card` matching the mockup.

**AC-41: Backlinks card in aside.**

Add a second `.meta-card` in the aside showing backlinks. Data source: `relatedItems` from the item, rendered as clickable links.

**AC-42: Discussion thread below body.** Already exists via `HostThreadSection`. Verify it renders below the body content, not in the two-column area. The mockup shows `.discussion-section` as a full-width section below the body+aside columns.

**AC-43: Content max-width 960px, centered.** Already present in the mockup (`detail-body { max-width: 960px; margin: 0 auto }`). Verify in TSX.

### 4.3 Knowledge Edit Mode — NEW State (AC-44 through AC-46)

**AC-44: Edit mode — "Done" replaces "Edit", formatting toolbar, editor border, save indicator.**

Current: `editing` state toggle exists. BodyEditor is mounted when `editing=true`. The mockup adds:
1. Toolbar: Bold/Italic/Heading/List/Code buttons above the editor
2. Editor border: `.editor-area` with `border: 1px solid var(--border-default)` around the body
3. Save indicator: "Saving..." / "Saved (checkmark)" in the header bar

Current BodyEditor already has formatting toolbar (TipTap). The `.editor-area` border wrapper needs to be added around the BodyEditor in KnowledgeDetail when editing. The save indicator already exists (`saveStatus`).

Changes:
- When `editing=true`, replace "Edit" button text with "Done" (already done)
- Wrap BodyEditor in a div with border matching `.editor-area`
- Ensure the toolbar renders (BodyEditor `variant="full"` already shows it)
- Move save indicator to the header bar (next to Done button): "Saved (checkmark)" or "Saving..."

**AC-45: "Done" returns to read mode.** Already implemented via `exitEdit()`.

**AC-46: Metadata aside stays read-only.** Already the case — aside is not conditionally rendered based on editing state. Verify this remains true after the aside restructuring (AC-40).

### 4.4 Files Modified

| File | Change |
|------|--------|
| `packages/web/src/pages/KnowledgeList.tsx` | Data-driven scope pills, move sort controls, add max-width, restyle sort controls |
| `packages/web/src/pages/KnowledgeDetail.tsx` | Overflow menu, two-column layout, metadata aside, backlinks card, editor border, save indicator in header |
| `packages/design-system/src/KnowledgeRow.tsx` | Verify no status dots; add preview prop if missing |

---

## 5. Settings (AC-47 through AC-52)

### 5.1 Current Architecture

Settings is currently an overlay mode within AppShell. When `settingsOpen=true`:
- Sidebar shows settings navigation items (Profile, Org chart, etc.)
- Main pane renders the active section component
- Only one section visible at a time

### 5.2 Required Change: Stacked Layout

**AC-47: All sections visible, scrollable, single page.**

The mockup shows ALL settings sections stacked vertically in one scrollable page. No section navigation in the sidebar — the sidebar still shows the three main views (Conversations, Work, Knowledge) with a "Settings" label above section items.

Architecture decision: **Replace the section-switching pattern with a single `SettingsPage` component** that renders all sections stacked. The sidebar in settings mode still shows section labels (for anchor-scroll navigation), but the main pane renders everything at once.

New file: `packages/web/src/pages/SettingsPage.tsx` — renders all settings sections stacked:
1. Header: "Settings" + subtitle
2. Profile section
3. Org chart section
4. Appearance section
5. Credentials section
6. Notifications section
7. Backend section

Each section is an `<section>` with an `id` matching the section key, so sidebar items can scroll to them via `scrollIntoView`.

**AppShell changes:** When `settingsOpen=true`, render `<SettingsPage />` instead of the conditional section switch. Remove `activeSettingsSection` state (no longer needed for section switching — only for scroll-to).

**AC-48: "Save profile" button text.** Already says "Save Profile" in SettingsProfile.tsx. Verify casing: mockup says "Save profile" (lowercase p). Update if needed.

**AC-49: "Org chart" section.** Already exists as `SettingsOrgChart`. The mockup shows team rows with Edit buttons. Verify the section title says "Org chart" (not "Org Chart"). Note: mockup uses lowercase in section title.

**AC-50: Theme selector as visual swatch cards.**

Current: `<select>` dropdown in SettingsAppearance.tsx. Mockup shows three `.theme-option` cards (Light/Dark/System) with colored swatches.

Replace the `<select>` with three clickable card divs:
- Light: cream swatch
- Dark: dark swatch
- System: split diagonal swatch

Active card gets a green border + shadow. Use the mockup's `.theme-option` / `.theme-option--active` styling.

**AC-51: "Backend" section showing mode.** Already exists. Mockup shows "Mode: Local (laptop)" as read-only text. Simplify to match.

**AC-52: Content max-width 680px, centered.** Add `max-w-[680px] mx-auto w-full` to the settings body container.

### 5.3 New/Modified Files

| File | Change |
|------|--------|
| `packages/web/src/pages/SettingsPage.tsx` | NEW — stacked all-sections layout |
| `packages/web/src/layouts/AppShell.tsx` | Render SettingsPage instead of individual sections |
| `packages/web/src/settings/SettingsAppearance.tsx` | Theme swatch cards replace select dropdown |
| `packages/web/src/settings/SettingsProfile.tsx` | Verify "Save profile" button text casing |

---

## 6. Onboarding (AC-53 through AC-56)

### 6.1 Current State

`SetupFlow.tsx` at `/setup` — minimal form with name, API key, and optional repo path. No card container, no brand/tagline, no illustration.

### 6.2 Required Changes

**AC-53: Card container with shadow, brand + tagline, illustration.**

The mockup shows:
- Full-page centered layout (`min-height: 100vh`)
- Card: `.onboarding-card` — `max-width: 520px`, `padding: 48px`, `box-shadow: var(--shadow-elevated)`, `border-radius: var(--r-default)`
- Brand: "HyperIdle" (20px, 700)
- Tagline: "Your agentic operating system. Humans steer, agents build."
- Abstract illustration: three mini-cards with colored dots + placeholder lines

Restructure SetupFlow.tsx to match this layout.

**AC-54: Three fields.** Already has name (required), API key (required), project folder (optional). Correct.

**AC-55: "Start HyperIdle" button, disabled until name + API key filled.** Already implemented. Verify button text says "Start HyperIdle".

**AC-56: No step indicator, no email field, no team name field.** Already correct after R2 simplification. Verify no vestiges remain.

### 6.3 Files Modified

| File | Change |
|------|--------|
| `packages/web/src/pages/SetupFlow.tsx` | Card wrapper, brand/tagline, illustration, styling to match mockup |

---

## 7. Cross-Cutting: Max-Width Centering (AC-57)

Every content area needs `max-width + margin: 0 auto`. The mockup specifies different widths per screen:

| Screen | Max-width | Element |
|--------|-----------|---------|
| Thread list | 800px | `.thread-list` |
| Thread messages | 720px | `.thread-messages` |
| Thread composer | 720px | `.thread-composer` |
| Bet overview grid | 960px | `.bet-grid` |
| Bet detail body | 800px | `.detail-body` |
| Task detail body | 800px | `.detail-body` |
| Knowledge list | 800px | `.knowledge-list` |
| Knowledge detail body | 960px | `.detail-body` |
| Settings body | 680px | `.settings-body` |

Implementation: add the appropriate `max-w-[Npx] mx-auto w-full` Tailwind classes to each page's scrollable content container. Some already have it; verify all match the mockup widths.

**Important:** This must NOT be applied at the `<main>` level in AppShell (that would break the sidebar+main flex layout). Each page component applies its own max-width to its scrollable content area.

---

## 8. E2E Tests (AC-58, AC-59)

### 8.1 Tests That Will Break

Based on the changes above, these E2E test files will need updates:

| Test file | Reason |
|-----------|--------|
| `conversations-submenu.spec.ts` | Sidebar knowledge scope items removed |
| `knowledge-ia.spec.ts` | Sidebar scope navigation removed; scope pills in page body |
| `l10-conversations-filter.spec.ts` | Filter changed from tabs to toggle chips; different filter types |
| `U9-screen-layouts.spec.ts` | Layout structure changes across all screens |
| `settings-overlay.spec.ts` | Settings layout changed to stacked; sidebar structure changed |
| `settings-redesign.spec.ts` | Settings layout changed |
| `settings.spec.ts` | Theme selector changed from select to swatch cards |
| `work-surface.spec.ts` | Bet card structure changed; status tabs added |
| `work.spec.ts` | Task table replaced with row list |
| `L13-product-drilldown.spec.ts` | Task row structure changed |
| `L14-bet-actions.spec.ts` | Action bar replaced with overflow menu |
| `setup-flow.spec.ts` | Onboarding layout restructured |

### 8.2 New E2E Tests

| Test file | Covers |
|-----------|--------|
| `W3-task-detail.spec.ts` | AC-26 through AC-32: new task detail page |
| `W3-knowledge-edit.spec.ts` | AC-44 through AC-46: knowledge edit mode (if not covered by existing `knowledge-edit.spec.ts`) |
| `W3-sidebar.spec.ts` | AC-1 through AC-4: sidebar bottom strip, sub-nav changes |
| `W3-screen-parity.spec.ts` | AC-57: max-width centering across all screens |

---

## 9. Type Changes

### 9.1 ConversationsFilter

```typescript
// Before (string union):
type ConversationsFilter = "all" | "blocking" | "async";

// After (toggle object):
interface ConversationsFilter {
  blocking: boolean;
  unread: boolean;
}
```

Update in: `packages/web/src/components/ThreadSections.tsx` (type definition), `AppShellOutletContext`, `Conversations.tsx`, `AppShell.tsx`.

### 9.2 BetCard Props

```typescript
// Extended BetCard props:
interface BetCardProps {
  // ... existing
  description?: string;
  progress?: number;
  avatarGroup?: ReadonlyArray<{ initials: string; agent?: boolean }>;
  budgetLabel?: string;
}
```

### 9.3 SidebarProps

```typescript
// Remove:
activeScope: string | null;
onSelectScope: (scope: string) => void;

// Add:
onSearchClick: () => void;
```

### 9.4 WorkTask Page Props

```typescript
interface WorkTaskProps {
  // Override for stories/tests
  overrideBetId?: string;
  overrideTaskId?: string;
}
```

---

## 10. Task Ordering

The work is organized into 6 phases. Each phase can be implemented and verified independently. Earlier phases unblock later ones.

### Phase 1: Cross-Cutting Foundation (AC-1, AC-2, AC-3, AC-4, AC-57)

1. **Sidebar bottom strip** — restructure to search hint + avatar + assistant
2. **Remove knowledge scope sub-items** from sidebar
3. **Max-width centering** — add to all page containers

Verification: visual inspection of sidebar on all views; verify max-width with browser dev tools.

### Phase 2: Conversations (AC-5 through AC-12)

4. **Flat thread list** — remove section grouping
5. **Toggle filter chips** — replace tab-based filter with toggle chips
6. **Blocking badge** on ThreadRow
7. **New thread button** positioning
8. **Artifact card** in thread detail
9. **Dial-in button** in header
10. **Verdict buttons** verification
11. **Composer stretch**

Verification: E2E tests for thread list rendering, filter toggles, artifact card presence.

### Phase 3: Work Pages (AC-13 through AC-25)

12. **Status filter tabs** in portfolio header
13. **Team pill restyling**
14. **BetCard enrichment** (description, progress, avatar group, budget)
15. **Bet detail overflow menu** (replace inline action bar)
16. **Stat cards row**
17. **Pitch section layout**
18. **Task rows** (replace table with flat list, add navigation)
19. **Max-width centering** on portfolio and detail

Verification: E2E tests for filter tabs, bet card content, overflow menu, task row clicks.

### Phase 4: Task Detail — New Page (AC-26 through AC-32)

20. **Route registration** in router.tsx
21. **WorkTask page component** — breadcrumb, metadata strip, sessions, discussion, artifacts
22. **useTaskSessions hook**
23. **Stories**

Verification: Navigate to task detail from bet detail; verify breadcrumb, metadata, sessions list.

### Phase 5: Knowledge + Settings + Onboarding (AC-33 through AC-56)

24. **Knowledge list** — data-driven scope pills, sort controls, max-width
25. **Knowledge detail** — overflow menu, two-column layout, metadata aside, backlinks
26. **Knowledge edit mode** — editor border, toolbar, save indicator in header
27. **Settings stacked layout** — SettingsPage component, theme swatch cards
28. **Onboarding** — card wrapper, brand/tagline, illustration

Verification: visual parity checks, E2E tests for edit mode, settings sections.

### Phase 6: E2E Updates + Verify (AC-58, AC-59)

29. **Update broken E2E tests** — all tests listed in section 8.1
30. **Write new E2E tests** — for task detail, knowledge edit, sidebar, centering
31. **Run `npm run verify`** — must pass clean

---

## 11. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| ConversationsFilter type change cascades widely | Phase 2 is isolated; update all consumers in one commit |
| BetCard prop additions break existing stories/tests | Keep all new props optional with backward-compatible defaults |
| Settings stacked layout breaks existing E2E | Phase 5 includes E2E updates for settings |
| Task detail page needs session API endpoint | useActiveSessionForTask already calls `/api/sessions?task_id=...`; extend to fetch all sessions |
| Thread flat list may change sort order | Mock data must have timestamps; sort by descending timestamp |
| Sidebar bottom strip restructuring breaks multiple E2E tests | Do sidebar first (Phase 1) so all subsequent phases test against the new sidebar |

---

## 12. Component Budget

No new custom design-system components are introduced. All new UI is composed from:
- Existing Tier 1 primitives (Avatar, StatusChip, Tag, Button, etc.)
- DaisyUI primitives (dropdown, dialog, etc.)
- Page-level composition (stat cards, metadata strip, overflow menu)

The only new files are:
- `WorkTask.tsx` — page component (Tier 3, in web package)
- `SettingsPage.tsx` — page component (Tier 3, in web package)
- `useTaskSessions.ts` — hook (in web package)

This respects the 19-component budget.

---

## 13. Summary of All File Changes

### New Files
| Path | Type |
|------|------|
| `packages/web/src/pages/WorkTask.tsx` | Page component |
| `packages/web/src/pages/WorkTask.stories.tsx` | Stories |
| `packages/web/src/pages/SettingsPage.tsx` | Page component |
| `packages/web/src/hooks/useTaskSessions.ts` | Hook |
| `packages/web/e2e/W3-task-detail.spec.ts` | E2E test |
| `packages/web/e2e/W3-sidebar.spec.ts` | E2E test |

### Modified Files (by package)

**packages/web/src/shell/**
- `Sidebar.tsx` — bottom strip, remove knowledge scopes

**packages/web/src/layouts/**
- `AppShell.tsx` — sidebar props, settings rendering, filter type

**packages/web/src/pages/**
- `Conversations.tsx` — filter chips, header layout
- `WorkPortfolio.tsx` — status tabs, team pill styling, bet card props, max-width
- `WorkBet.tsx` — overflow menu, stat cards, task rows, max-width
- `KnowledgeList.tsx` — scope pills, sort controls, max-width
- `KnowledgeDetail.tsx` — overflow menu, two-column layout, metadata aside, edit mode
- `SetupFlow.tsx` — card layout, brand/tagline, illustration

**packages/web/src/settings/**
- `SettingsAppearance.tsx` — theme swatch cards

**packages/web/src/components/**
- `ThreadSections.tsx` — flat list, filter type change

**packages/design-system/src/**
- `BetCard.tsx` — extended props (description, progress, avatarGroup, budgetLabel)
- `ThreadRow.tsx` — blocking badge prop
- `Composer.tsx` — items-stretch layout
- `KnowledgeRow.tsx` — verify no dots, add preview

**packages/web/e2e/** — ~12 existing test files updated (see section 8.1)
