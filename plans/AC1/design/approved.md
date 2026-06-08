# AC1 Approved Design -- Structured Outcome Fields

## Summary

Outcome data surfaces as inline additions to three existing pages. No new components, no new pages, no new primitives. The design composes existing Hearth patterns (section headers, meta-strip cells, badge pills, tab-bar-pill filters, KeyValue pairs).

---

## 1. Bet Detail (WorkBet.tsx)

### 1.1 Outcome Section

**Position:** After the stat cards row, before the Pitch section. Same section header pattern as "Tasks", "Artifacts", "Discussion" (13px semibold uppercase tracking text-tertiary, border-b border-subtle).

**Section title:** "Outcome"

**Not evaluated state (default):**
```
OUTCOME
-----------------------------------------
Not evaluated     [Record outcome]
```
- "Not evaluated" in 13px text-tertiary (quiet, not alarming)
- "Record outcome" as a `btn btn-xs btn-ghost` (same style as "Add knowledge" button that already exists on the page)

**Populated state:**
```
OUTCOME
-----------------------------------------
[Validated]   Recorded 3d ago by @Founder

The chunked upload hypothesis held -- failure rate dropped
from 12% to 2.1% across 500 uploads in the test cohort.

                              [Edit outcome]
```
- Verdict badge: pill-shaped, 12px font, same structural treatment as status badges but using DEFAULT (neutral) badge style -- `bg-[var(--surface-container)] text-[var(--text-secondary)]`. NOT color-coded by verdict value. The text content (Validated / Refuted / Partial / Inconclusive) is what differentiates, not color.
- "Recorded 3d ago by @Founder" in 12px text-tertiary
- Summary text in 14px text-secondary, max 3 lines with overflow truncation and "Show more" toggle
- "Edit outcome" as `btn btn-xs btn-ghost` aligned right

**Record/Edit interaction:**
When the user clicks "Record outcome" or "Edit outcome", the section expands inline (no modal) to show:
```
OUTCOME
-----------------------------------------
Verdict:    [select: Validated | Refuted | Partial | Inconclusive]
Summary:    [textarea, 3 rows, placeholder: "What happened? Did the hypothesis hold?"]

                              [Cancel]  [Save]
```
- Select uses `select select-bordered select-sm` (DaisyUI)
- Textarea uses `textarea textarea-bordered text-base resize-none h-20` (same as kill/pause reason textarea)
- Cancel: `btn btn-xs btn-ghost`
- Save: `btn btn-xs btn-primary`
- On save: POST/PATCH to API, section collapses back to populated state
- Inline form appears with a 120ms opacity transition (motion-fast)

**States:**
- Empty/not evaluated: quiet "Not evaluated" + action button
- Populated: verdict badge + metadata + summary + edit button
- Editing: inline form replacing the content
- Saving: Save button shows "..." and is disabled (same pattern as ConsequencePreviewDialog)
- Error: inline `text-xs text-error` below the save button (same pattern as other dialogs on this page)

### 1.2 Task Rows -- Outcome Badge

Each task row in the bet detail task list gains an optional outcome badge BEFORE the state badge:

```
[task title]                              [Met]  [Done]
[meta line: owner / status / time]
```

- Outcome badge uses the same neutral badge style as the verdict badge on the bet
- Only shown when outcome is not null. When null, the row is unchanged (no "Not evaluated" clutter in the list).
- Badge label mapping:
  - `met` -> "Met"
  - `met_with_rework` -> "Rework"
  - `partially_met` -> "Partial"
  - `not_met` -> "Not met"

---

## 2. Task Detail (WorkTask.tsx)

### 2.1 Meta-Strip -- Outcome Cell

A new cell is added to the existing bordered metadata cell grid, positioned AFTER the "Sessions" cell (last position):

```
| Owner | Status | Started | Cost | Sessions | Outcome |
```

**Not evaluated state:**
```
OUTCOME
--
(dim-dash)
```
- Section label: "Outcome" in 11px semibold uppercase tracking text-tertiary (same as other meta-strip labels)
- Value: em-dash "--" in 13px text-tertiary

**Populated state:**
```
OUTCOME
Met with rework
```
- Value: verdict label in 13px font-500 text-primary (same weight/color as other meta-strip values like owner name)

**Editing:** The meta-strip is read-only display. Outcome is set via the existing review flow or a future endpoint. The task detail page does NOT have an inline edit for outcome in AC1 (the spec says "set during review, not automatically" -- the review process is where this gets populated).

### 2.2 Sessions -- Effectiveness Score

Each session row gains an effectiveness score display between the cost and the status indicator:

```
[Session title]   [agent]   $2.40   0.85   [Active]
```

- Score shown as a plain number (2 decimal places) in 12px font-mono tabular-nums text-tertiary
- When null: nothing shown (no placeholder, no dash -- the field simply is not rendered)
- The score does not have a badge treatment. It is a small supporting number, not a primary signal.

---

## 3. Work Portfolio (WorkPortfolio.tsx)

### 3.1 Verdict Filter

A new filter group is added to the header row, AFTER the team pill filters. It appears only when there are completed/killed bets (bets that could have outcomes).

**Appearance:** A set of pill-shaped filter buttons using the same bordered-pill style as team pills:

```
All bets  [All | Active | Completed | Draft]  [TeamA] [TeamB]  [Validated] [Refuted] [Partial] [Inconclusive] [Not evaluated]
```

- Same pill style as team pills: `border-[1.5px] rounded-[var(--r-pill)] text-[12px] font-[500]`
- Active pill: `border-[var(--accent-primary)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)]`
- Inactive pill: `border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]`
- "Not evaluated" filter shows bets where outcome verdict is null
- Multiple verdict pills can be active simultaneously (multi-select, unlike status filter which is single-select)
- Filtering is client-side (same as team filter -- `filteredBets` memo already exists)

**Label:** No explicit "Verdict:" label. The pills are self-explanatory and adding a label would clutter the already-dense header.

### 3.2 BetCard -- Verdict Badge

The existing BetCard gains an optional verdict badge. Position: after the status badge, before the budget label.

```
[BetCard]
  [Active]  [Validated]  $2,400
```

- Same neutral badge style as everywhere else
- Only shown when verdict is not null
- This requires adding a `verdict` prop to the BetCard component

---

## 4. Component Budget Impact

**New components: 0.** All UI is composed from existing DaisyUI primitives (select, textarea, btn, badge pills) and inline styling matching established patterns.

**Modified components: 1.** BetCard gains an optional `verdict?: string` prop for the verdict badge display.

**Modified pages: 3.**
- WorkBet.tsx: new Outcome section + task row verdict badges
- WorkTask.tsx: new meta-strip cell + session effectiveness score
- WorkPortfolio.tsx: new verdict filter pills + BetCard verdict prop

---

## 5. Behavior and Interaction

### Keyboard
- Tab navigates through the "Record outcome" / "Edit outcome" buttons normally
- In the inline edit form: Tab moves between select, textarea, Cancel, Save. Escape cancels and collapses the form. Enter on Save submits.
- Verdict filter pills in portfolio: standard button keyboard interaction (Enter/Space to toggle)

### Focus management
- When "Record outcome" is clicked, focus moves to the verdict select dropdown
- When "Cancel" is clicked or Escape is pressed, focus returns to the "Record outcome" button
- When "Save" succeeds, focus returns to the "Edit outcome" button

### Motion
- Inline edit form: opacity 0->1 over `var(--motion-fast)` (120ms)
- Verdict badges: no motion (they are static content)
- Portfolio filter pills: same transition as team pills (`transition-all duration-[var(--motion-default)]`)

---

## 6. Mobile Adaptation

On mobile (three-tab layout):
- Bet outcome section renders full-width, same layout, no changes needed
- Task meta-strip wraps naturally (existing flex layout handles this)
- Portfolio verdict filter pills wrap into a second row (same as team pills do today)
- Session effectiveness score renders inline (the row already wraps on narrow viewports)

---

## 7. Open Questions for Architecture

1. **API shape for recording bet outcome:** PATCH `/api/bets/:id` with `{ field: "outcome_verdict", value: "validated" }` (extend existing PATCH discriminated union) or a dedicated POST `/api/bets/:id/outcome`?
2. **API shape for task outcome:** Same question -- extend PATCH `/api/tasks/:id` or dedicated endpoint?
3. **Session effectiveness score write endpoint:** PATCH `/api/sessions/:id` already exists with `{ outcome, notes }` -- extend to include `effectivenessScore`?
4. **Portfolio query:** Does the bet list API (`GET /api/bets`) need to return outcome_verdict in the list response, or is it already returned as part of the full bet row?
5. **BetCard component:** The BetCard lives in `packages/design-system/`. Should the verdict prop be added there, or should the portfolio page render the badge separately (outside the BetCard)?

---

## 8. Rejection List (locked -- do not re-litigate)

1. No modal for recording outcomes. Inline form only.
2. No color-coded verdict badges. All neutral style.
3. No separate "Outcomes" page or panel.
4. No verdict as a stat card.
5. No inline editing in the task meta-strip (read-only display in AC1).
6. No effectiveness score badge treatment (plain number).
7. No "Not evaluated" badge in task rows or BetCard (only shown when populated).
8. No status-filter-style single-select for verdict filter (multi-select pills instead).
