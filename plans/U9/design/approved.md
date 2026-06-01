# U9 Approved Design — Screen Layouts

**Variant:** Single (routine classification). Hearth token migration + portfolio restructure + Canvas removal.

---

## Universal patterns across all screens

### Page wrapper
Every page uses the same outer structure:
```
<div className="flex flex-col gap-[var(--density-gap)] h-full" data-testid="<page>-page">
  {/* page header with title + actions */}
  {/* filter pills (if applicable) */}
  {/* content */}
</div>
```

### Hearth token migration (all pages)
All old Lucid tokens must be replaced:
- `var(--surface-2)` / `var(--surface-3)` -> `var(--surface-container)` / `var(--surface-elevated)`
- `var(--text-hi)` -> `var(--text-primary)`
- `var(--text-mid)` -> `var(--text-secondary)`
- `var(--text-lo)` -> `var(--text-tertiary)`
- `var(--r0)` / `var(--r1)` / `var(--r2)` / `var(--r3)` -> `var(--r-none)` / `var(--r-subtle)` / `var(--r-default)` / `var(--r-pill)`
- `var(--ok)` -> `var(--status-success)` or `var(--accent-primary)`
- `var(--danger)` -> `var(--status-error)`
- `bg-base-200` / `bg-base-300` -> `bg-[var(--surface-elevated)]` / `bg-[var(--surface-container)]`

### Section heading pattern (mono chrome)
```html
<h2 class="text-[12px] font-[family-name:var(--font-mono)] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
  Section Title
</h2>
```
This is the existing pattern in the codebase. Keep it.

### Card surface pattern
Cards use elevated surface + warm shadow + default radius:
```html
<div class="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]">
  <!-- card content -->
</div>
```

### Pill filter bar pattern
Used in Conversations, Work Portfolio, Knowledge List:
```html
<div role="tablist" aria-label="Filter" class="flex items-center gap-[var(--space-2)] mb-[var(--space-3)] shrink-0">
  <button role="tab" aria-selected="true"
    class="btn btn-xs btn-primary">
    Active filter
  </button>
  <button role="tab" aria-selected="false"
    class="btn btn-xs btn-ghost text-[var(--text-secondary)]">
    Inactive filter
  </button>
</div>
```
Active filter uses `btn-primary` (forest green pill). Inactive uses `btn-ghost`.

---

## 1. Conversations Page

### Current state
The page works. FilterPillBar exists with All/Blocking/Async. ThreadSections renders the thread list. ConversationsDetail renders the thread detail with ThreadShell.

### Changes needed

**1a. Filter pill bar styling**
- Replace `btn-neutral` (active) with `btn-primary` (forest green pill)
- Keep `btn-ghost` for inactive
- Add "New Thread" button to the right of the filter bar, styled as `btn btn-xs btn-primary` with forest green accent. This opens the RecipientPicker.

**1b. Token migration on ConversationsDetail wrapper**
- `var(--r1)` -> `var(--r-subtle)`
- `var(--surface-2)` -> `var(--surface-container)`
- `var(--text-mid)` -> `var(--text-secondary)`
- `var(--text-lo)` -> `var(--text-tertiary)`
- `var(--ok)` -> `var(--accent-primary)` (for live badge)

**1c. Hint banner styling**
- `var(--r1)` -> `var(--r-subtle)` on hint card
- `var(--surface-2)` -> `var(--surface-container)` background
- `var(--text-mid)` -> `var(--text-secondary)` for body
- `var(--text-lo)` -> `var(--text-tertiary)` for dismiss button

**1d. Page header with New Thread button**
```
┌─────────────────────────────────────────────┐
│  [All] [Blocking] [Async]      [+ New Thread]│
├─────────────────────────────────────────────┤
│  ThreadSections (list of ThreadRows)        │
│  ...                                         │
└─────────────────────────────────────────────┘
```

### States
- **Empty (no threads):** ThreadSections shows EmptyState. Filter bar visible but disabled.
- **Loading:** SkeletonList. Filter bar visible but disabled.
- **Error:** ErrorState. Filter bar visible but disabled.
- **Populated:** Filter bar active + ThreadSections + thread list.
- **Thread detail (threadId in URL):** ConversationsDetail fills the page. No filter bar visible.

---

## 2. Work — All Bets (Portfolio)

### Current state
Shows: page title "Portfolio" + team card grid + Canvas (draft/active drag-drop) + BetCreateDialog + ArtifactSection.

### New design

**Major restructure.** Portfolio becomes a flat bet grid with team pill filters.

```
┌─────────────────────────────────────────────┐
│  All bets                       [+ New bet] │
├─────────────────────────────────────────────┤
│  [All teams] [Growth] [Nimmly] [Design]     │
├─────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐         │
│  │  BetCard     │  │  BetCard     │         │
│  │  status dot  │  │  status dot  │         │
│  │  progress    │  │  progress    │         │
│  │  avatars     │  │  avatars     │         │
│  │  budget      │  │  budget      │         │
│  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐         │
│  │  BetCard     │  │  BetCard     │         │
│  │  ...         │  │  ...         │         │
│  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────┤
│  Artifacts section                           │
└─────────────────────────────────────────────┘
```

**Header row:**
- Title: "All bets" — uses the standard mono uppercase heading pattern
- "New bet" button: `btn btn-xs btn-primary` (forest green pill)

**Team pill filter bar:**
- "All teams" pill (active by default, `btn-primary`)
- One pill per team from `useTeams()` data
- Clicking a team pill filters the bet grid to that team's bets
- Clicking the active pill deselects it (returns to all)
- Clicking a sidebar team sub-item navigates to `/work/portfolio?team=:teamId` and pre-selects the matching pill

**Bet grid:**
- `grid grid-cols-1 sm:grid-cols-2 gap-[var(--density-gap)]`
- Each cell is a `<BetCard>` from the design system
- BetCard shows: title, team name, status (colored dot via StatusChip), progress bar, budget badge
- Cards are clickable (navigate to `/work/bet/:betId`)
- Cards have hover lift: `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]` with `transition duration-[var(--motion-fast)]`

**Data source:** New hook or modified `useCanvasBets()` that fetches ALL bets (not just draft/active) across all teams. Filter client-side by team when a pill is selected.

**What's removed:**
- Team card grid (the inline `<button>` team cards in the current code)
- Canvas component import and rendering
- `@dnd-kit` usage on this page
- Cycle management stripe (already hidden per M3 lore)

**What's kept:**
- BetCreateDialog (already Hearth-styled from U8)
- ArtifactSection (below the bet grid)

### States
- **Empty (no bets):** EmptyState with "No bets yet" + "New bet" CTA button
- **Loading:** 2-column grid of SkeletonCard
- **Error:** ErrorState
- **Populated:** Team pills + bet grid
- **Filtered (no results):** EmptyState "No bets for [Team Name]" + clear filter link

---

## 3. Work — Team View

### Current state
Shows: breadcrumb + team header + burn vs cap section + active bets list + roster + ArtifactSection. Uses old Lucid tokens throughout.

### Changes needed

**3a. Token migration (all sections)**
- `var(--surface-2)` -> `var(--surface-container)` on section cards
- `var(--surface-3)` -> `var(--surface-elevated)` on roster rows
- `var(--text-hi)` -> `var(--text-primary)`
- `var(--text-lo)` -> `var(--text-tertiary)`
- `var(--r0)` -> `var(--r-none)`, `var(--r1)` -> `var(--r-subtle)`

**3b. Section cards use Hearth card pattern**
Burn vs cap and bet rows wrapped in:
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]
```

**3c. Team header with member avatars**
- Breadcrumb stays as `btn btn-ghost btn-xs`
- Team name as `text-[length:var(--density-text-h1)] font-[600] text-[var(--text-primary)]`
- StatusChip for team status
- Phase + Lead as secondary text in `text-[var(--text-tertiary)]`

**3d. Roster rows**
Each member row uses warm elevated surface:
```
bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-[var(--space-3)]
```
Avatar circle: `bg-[var(--surface-container)]`

### States
Same as current (loading, error, 404, populated). Token migration only.

---

## 4. Work — Bet Detail

### Current state
Complex page: breadcrumb + BetCard + actions bar + hints + cost section + pitch/editor + task table + ArtifactSection + HostThreadSection + ArtifactThreadsSummary + TaskSheet.

### Changes needed

**4a. Token migration throughout**
Same substitutions as above on all section cards, hint banners, etc.

**4b. Cost section card**
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]
```

**4c. Task table**
- Table stays as DaisyUI `table table-xs`
- Row hover: `hover:bg-[var(--surface-container)]`
- Sort header text: `text-[var(--text-tertiary)]`

**4d. Breadcrumb**
```
Portfolio > [Team Name] > BET-123
```
Links use `text-[var(--text-secondary)] hover:text-[var(--text-primary)]`

**4e. BetPitch (read-only blocks) and BodyEditor (edit mode)**
- BetPitch section wraps in `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)]` for visual containment
- Anchored messages: `bg-[var(--surface-container)]` (warm container, not elevated)

**4f. ConsequencePreviewDialog and AppetiteDialog**
- Dialog backdrop: `bg-[var(--surface-overlay)]`
- Dialog card: `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)]`
- Token migration on all text classes

### States
Same as current. Token migration + card surface treatment.

---

## 5. Knowledge — List

### Current state
Title "Knowledge Base" + scope badge + "+ New" button + Triage/Curated tabs + sort controls + KnowledgeRow list grouped by topic.

### Changes needed

**5a. Add scope pill filter bar**
Insert between header and Triage/Curated tabs:
```
[All] [Design] [Frontend] [Nimmly] [Growth] [Factory]
```
- "All" is active by default
- Scope pills come from the sidebar knowledge sub-items + a dynamic list of scopes
- Clicking a pill filters knowledge items to that scope
- This coexists with Triage/Curated tabs (pills filter what; tabs filter how)

**5b. Triage/Curated tabs restyle**
- Replace `btn-neutral` (active) with `btn-primary` (forest green)
- Keep `btn-ghost` for inactive

**5c. Sort controls restyle**
- Same: `btn-neutral` -> `btn-primary` for active radio
- `btn-ghost` for inactive

**5d. Token migration**
- `var(--r1)` -> `var(--r-subtle)` on hint cards
- `var(--surface-2)` -> `var(--surface-container)` on hint backgrounds
- `var(--surface-ghost)` -> `var(--surface-container)` on private badges
- `var(--text-mid)` -> `var(--text-secondary)`
- `var(--text-lo)` -> `var(--text-tertiary)`
- `var(--r2)` -> `var(--r-subtle)` on private badge

**5e. "+ New" button**
Style as `btn btn-xs btn-primary` (forest green) instead of `btn-ghost`.

### States
Same as current. Add "filtered empty" state when a scope pill is selected but no items match.

---

## 6. Knowledge — Detail

### Current state
Title + metadata bar + body (KnowledgeBody / BodyEditor) + HostThreadSection + related sidebar. Uses a 2-column grid layout.

### Changes needed

**6a. Elevated body surface**
The body content area gets a card treatment:
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]
```

**6b. Metadata header**
- Tags and StatusChip already restyled in U7/U8
- Token migration on `badge-ghost` -> ensure warm styling
- Confidence badge: warm surface

**6c. Related sidebar**
- Border: `border-[var(--border-subtle)]`
- Text: `text-[var(--text-secondary)]` for links

**6d. Conflict banner**
- `var(--surface-4)` -> `var(--surface-container)`
- `var(--border-subtle)` stays (already correct)
- `var(--r2)` -> `var(--r-subtle)`
- `var(--text-mid)` -> `var(--text-secondary)`

**6e. Edit mode**
- BodyEditor already restyled in U8
- Save indicator text: `var(--text-tertiary)` for status, `var(--status-error)` for error

### States
Same as current. Token migration + body card treatment.

---

## 7. Settings Pages

### Current state
Settings render in the main pane when `settingsOpen` is true. The sidebar shows settings nav items. Each section (Profile, OrgChart, Credentials, Notifications, Appearance, Teams, Backend, Worker) is a separate component.

### Changes needed

**7a. Settings sections card pattern**
Each section uses the same Hearth card pattern:
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[var(--density-card-pad)]
```

**7b. Form elements**
All already using DaisyUI classes (`input`, `select`, `textarea`, `toggle`, `checkbox`, `radio`) which are themed by U4's Hearth DaisyUI theme. No changes needed unless any settings component uses inline hardcoded colors or old tokens.

**7c. Token sweep**
Grep all settings files for old token references and replace. The existing settings components are mostly DaisyUI-based so the token changes from U4 should already cover most styling.

### States
Settings are form pages — always populated. Error states for save failures use DaisyUI alert.

---

## 8. BetCreateDialog

### Current state
Already uses `description` (not pitch), assigns to team, creates as draft. Uses BodyEditor for the description field.

### Changes needed

**8a. Dialog surface**
```
bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)]
```

**8b. Token migration**
- `var(--text-lo)` -> `var(--text-tertiary)` on labels and hints
- `var(--text-mid)` -> `var(--text-secondary)` on title preview

**8c. Buttons**
- Cancel: `btn btn-sm btn-ghost` (already correct)
- Create: `btn btn-sm btn-primary` (forest green, already correct from U4 theme)

### States
Same as current. Minor token migration.

---

## Canvas/Kanban removal

### What to remove
- Remove the `<Canvas>` component rendering from `WorkPortfolio.tsx`
- Remove the `useCanvasBets` import and usage from `WorkPortfolio.tsx`
- The `Canvas.tsx` component file and its stories can be deleted OR kept but unused (architect decides based on other consumers)
- Remove any `@dnd-kit/core` usage from WorkPortfolio

### What replaces it
A flat bet grid (described in section 2 above) that fetches bets from `GET /api/bets` with optional `?team_id=` filter.

---

## Mobile adaptation

U9 spec says "Out of scope: Mobile-specific layouts (follow-up)." The pages should not break on mobile but no mobile-specific design is needed. The 2-column bet grid already has `grid-cols-1 sm:grid-cols-2` which collapses to single column on narrow viewports.

---

## Open questions for architect

1. **Bet list API endpoint.** Portfolio needs ALL bets. Does `GET /api/bets` exist with optional `?team_id=` filter? Or does a new endpoint/hook need to be created?
2. **Canvas deletion scope.** Does anything else import `Canvas.tsx`? If not, delete. If yes, keep but remove from Portfolio.
3. **Knowledge scope data.** Where do the scope pill filter labels come from? The sidebar uses `KNOWLEDGE_SCOPE_ITEMS` (Practices, Products, Factory). The spec says "concrete practices (e.g., 'Design', 'Frontend') and teams (e.g., 'Nimmly')". This is more granular than the current 3 fixed scopes. Does this need an API endpoint or can it be derived from team data?
4. **Team pill filter for Portfolio.** When the user clicks a sidebar team sub-item, does it navigate to `/work/portfolio?team=:teamId` (flat portfolio view with filter) or to `/work/team/:teamId` (team detail view)? The spec says both exist. The sidebar sub-item currently navigates to `/work/team/:teamId`. For portfolio pill filters, the URL state needs `?team=:teamId` on the portfolio route.

---

## Rejection list (locked)

1. **Canvas/Kanban drag-drop.** Removed per U0 concept.
2. **3-column bet grid.** Too narrow for bet card content.
3. **Team cards as portfolio primary view.** Replaced by flat bet grid with team pill filters.
4. **Tabs instead of pills for filters.** Inconsistent with Hearth pill aesthetic.
5. **Cool-gray hover states.** All hover/active states use warm tokens.
6. **Custom filter dropdown.** Pills are simpler and match the U0 pattern.
7. **Inline team avatars in pill filter.** Over-decoration. Plain text labels in pill buttons.
