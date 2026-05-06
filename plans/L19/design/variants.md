# L19 Design — Harness Jump-Out from Session Metadata

## Classification: Routine

L19 uses the existing component family. No new custom components are introduced. The two UI additions -- outcome chip and jump-out affordance -- compose from `StatusChip` (existing Tier 1) and an anchor element (DaisyUI primitive), placed into existing extensibility points (TaskCard `actions` slot, bet-detail task table rows, TaskSheet summary section).

---

## Variant A: Inline Outcome Chip + Trailing Jump-Out Link

### Outcome chip

The `SessionOutcome` type (`"completed" | "crashed" | "stopped"`) maps to the existing `Status` type used by `StatusChip`:

| SessionOutcome | Status | Rationale |
|----------------|--------|-----------|
| `completed` | `done` | Session finished successfully -- same signal as task "done" |
| `crashed` | `error` | Session failed -- same signal as task "killed" |
| `stopped` | `paused` | Session was manually stopped -- action-pending, not an error |
| (null / no session) | (not rendered) | No chip shown |

The mapping is exhaustive over the `SessionOutcome` union. A new function `sessionOutcomeToStatus` is added to `status-mapping.ts` alongside the existing `taskStateToStatus`, `betStatusToStatus`, and `knowledgeStatusToStatus` functions. This keeps the mapping co-located with its peers.

The outcome chip renders with the label derived from the outcome value in uppercase (e.g., "COMPLETED", "CRASHED", "STOPPED") -- same pattern as StatusChip renders `status.toUpperCase()`.

### Outcome chip placement

**Bet-detail task table (WorkBet.tsx).** A new column "Outcome" is added between the existing "Status" and "Owner" columns. The column header is sortable, following the existing `SortableHeader` pattern. When no session exists for a task, the cell is empty (no chip, no placeholder text). This avoids visual noise for tasks that haven't been worked on yet.

**TaskCard (Kanban).** The outcome chip is rendered via the existing `actions` slot. This is a caller-side decision: callers that have session data pass an outcome chip as the `actions` ReactNode. No change to TaskCard props is needed -- the `actions` slot already accepts `ReactNode`.

**TaskSheet.** The outcome chip renders in the task summary section (the area that currently shows `task.owner`, `task.betTag`, `task.cost`). It is placed inline after the existing metadata, separated by a dot delimiter (same pattern as the existing `betTag` and `cost` separators).

### Jump-out affordance

**Shape: text link, not icon button.** A text link reading "Open in harness" (or the harness name if available). Rationale: an icon button alone (e.g., external-link icon) is ambiguous -- it could mean "copy link", "share", or "open". A text link is self-documenting and requires no tooltip. The link is styled as a monospace `text-xs` element with `text-[var(--primary)]` color, matching the existing link treatment in the design system.

**Behavior:**
- `<a href={harnessUrl} target="_blank" rel="noopener noreferrer">` -- opens in a new tab. This is the correct default for "jump out to an external tool": the user keeps HyperIdle open while inspecting the harness. Using `window.open` or a button with `onClick` would be less accessible and would not support middle-click/Ctrl+click.
- `aria-label="Open session in harness (opens in new tab)"` for screen readers.
- No confirmation dialog. The harness URL is opaque but validated: if the URL does not start with `http://` or `https://`, the affordance is hidden entirely (defensive, never broken-link). This validation happens in the rendering layer, not the API.

**Jump-out placement:**

**Bet-detail task table.** A new column "Session" is added as the last column (after "Cost"). It contains: (1) the jump-out link when a latest session exists and the URL is valid, or (2) empty when no session or URL is malformed. The column is not sortable -- it contains an action, not sortable data.

**TaskSheet.** The jump-out link renders below the outcome chip in the task summary section. It is visually grouped with the session metadata (outcome, cost, tokens).

**TaskCard (Kanban).** The jump-out link is NOT shown on the Kanban card. Rationale: Kanban cards are dense and the card's `actions` slot is already used for the outcome chip. Adding a link would crowd the card. The TaskSheet (opened by clicking the card) is the proper detail surface for the jump-out. This follows the design principle "humans validate, agents execute" -- the Kanban view is a scanning surface, the Sheet is the action surface.

### Session metadata in TaskSheet

When a latest session exists, the TaskSheet summary section is extended with a "Session" subsection below the existing task metadata. It contains:

- **Outcome chip** (StatusChip with the mapped outcome status)
- **Cost** (formatted as `$X.XX` from `cost` in cents)
- **Tokens** (formatted as `Xk in / Xk out` from `tokensInput` and `tokensOutput`)
- **Jump-out link** ("Open in harness")

All four items are on a single dense line, separated by `|` pipe delimiters, matching the monospace-metadata aesthetic. When no session exists, the entire subsection is hidden.

Layout:
```
COMPLETED | $4.20 | 12k in / 3k out | Open in harness
```

### Empty / loading / error states

| State | Behavior |
|-------|----------|
| No session for task | Outcome column empty, no chip, no jump-out link. Session subsection in TaskSheet hidden. |
| Session exists, no harness URL | Outcome chip shown. Jump-out link hidden. Cost and tokens shown if available. |
| Session exists, malformed harness URL | Same as "no harness URL" -- affordance hidden. Never render a broken link. |
| Session exists, URL valid | Full treatment: outcome chip + jump-out link + cost + tokens. |
| Loading (bet detail fetch in progress) | Existing skeleton treatment (SkeletonCard + SkeletonList). No special session skeleton. |
| API error | Existing ErrorState treatment. No special session error. |

### Keyboard and focus

- Jump-out link is a standard `<a>` element -- focusable via Tab, activatable via Enter. No special keyboard handling needed.
- Outcome chip is a `<span>` -- not interactive, not focusable. Correct: chips are read-only status indicators.
- In TaskSheet, the jump-out link participates in the existing focus trap (it is a focusable element inside the dialog).

### Mobile (viewport <= 1024px)

- Bet-detail task table: The "Outcome" and "Session" columns are included in the scrollable table. The table already has `overflow-x-auto` so horizontal scroll handles narrow viewports. No special mobile treatment.
- TaskSheet: The session metadata line wraps naturally. The jump-out link remains a text link with a 44px minimum touch target height (inherited from the parent's layout).
- TaskCard: No change -- jump-out is not on the card.

---

## Did we consider

### Alternative: Icon button instead of text link
Rejected. An external-link icon is ambiguous without a tooltip. A text link is self-documenting, accessible, and consistent with the dense monospace aesthetic.

### Alternative: Jump-out opens in same tab
Rejected. The user is inspecting an external tool. Opening in the same tab loses their HyperIdle context. `target="_blank"` with `rel="noopener noreferrer"` is the correct pattern.

### Alternative: Outcome chip replaces the existing task state chip
Rejected. The task state (proposed, in_progress, done, etc.) and the session outcome (completed, crashed, stopped) are different dimensions. A task can be `in_progress` with a `crashed` session (the agent crashed but the task isn't done). Both chips carry independent information.

### Alternative: Jump-out in a popover/dropdown
Rejected. Over-engineering for a single action. A popover is warranted when there are multiple actions (e.g., "Open in harness", "Copy URL", "View logs"). L19 has exactly one action. A text link is sufficient.

### Alternative: Show session count badge on task
Rejected. The spec says "latest session", not "all sessions". Showing a count (e.g., "3 sessions") would invite users to browse session history, which L19 explicitly defers. The latest session is the only one surfaced.

### Alternative: Inline session timeline in TaskSheet
Rejected. The spec says "HyperIdle does NOT render the session interior." A timeline would be interior-adjacent. The jump-out to the harness is the correct boundary.

### Alternative: New "SessionChip" custom component
Rejected. StatusChip already handles the presentation. Adding a SessionChip would violate the 19-component budget for a single-use wrapper. The mapping function (`sessionOutcomeToStatus`) is the right abstraction -- it converts the domain value to the existing presentation type.

---

## Component budget impact

No new custom components. L19 uses:
- `StatusChip` (existing Tier 1) for outcome chip
- `<a>` (HTML primitive) for jump-out link
- `SortableHeader` (existing co-located component in WorkBet) for the new table column
- `TaskSheet` (existing Tier 3) extended with session metadata section

---

## Self-critique

**Score: 7/10.** The design is conservative by intent -- L19 is a Small-complexity story and the existing component vocabulary handles it. The main risk is the table getting wide with two new columns (Outcome + Session). On narrow viewports this is handled by `overflow-x-auto`, but the table may feel cramped at around 800px. Mitigation: the "Session" column could be merged into the "Outcome" column (outcome chip + link in the same cell) if table width becomes a problem in visual testing. This is a builder-time call, not a design-time decision.
