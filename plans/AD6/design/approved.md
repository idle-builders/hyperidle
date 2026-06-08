# AD6 Design: Knowledge Cleanup & Scope Simplification

## Classification: Routine

Existing component family (KnowledgeList, KnowledgeDetail, KnowledgeCreate), known layout patterns (scope pills, overflow menu, metadata aside). This is simplification of existing UI, not novel UI invention. One variant with a "did we consider alternatives" check.

---

## Design Variant: Simplify In Place

### Philosophy

Strip complexity from the existing surfaces. No new components, no new patterns. The user already knows how the knowledge view works — just remove the friction.

---

## Surface 1: Knowledge List — Scope Pills

### Current state
The scope pills are dynamically generated from whatever `scopeKind` values exist in the data. They show raw backend enum names: "factory", "product", "practice", "team", etc. These are not meaningful labels for a user.

### New state
Four fixed scope pills: **All** | **Shared** | **Team** | **Private**

| Pill label | Filters to | Backend values matched |
|---|---|---|
| All | Everything visible to user | (no filter) |
| Shared | Company-wide knowledge | `factory`, `product`, `practice` |
| Team | Team-scoped items | `team` |
| Private | User's personal items | `user` |

Items with `bet` or `task` scopeKind appear under "All" but not under any specific filter pill — they are contextual and rare in the list.

### Behavior
- Pills are always rendered (not data-driven). The current code derives pill labels from `item.scopeKind` values in the data. Change to static set.
- Clicking a pill filters the displayed items client-side (same as current behavior).
- "All" is the default active state (currently it is also the default).
- Styling unchanged — same pill shape, same active/inactive states, same spacing.

### States
- **Empty result after filter**: Show existing EmptyState with "No items match this filter" messaging.
- **Loading/Error**: Unchanged — pills render but are inert during loading.

---

## Surface 2: Knowledge List — Row Badges

### Current state
Each `KnowledgeListRow` can show:
- `kind` badge (pattern/decision/failure — color-coded)
- `status` badge (Active/Stale)
- `Private` badge (when scopeKind === "user")
- Timestamp

### New state
Remove the `kind` badge from list rows. Keep:
- `status` badge (Active/Stale — unchanged)
- `Private` badge (unchanged)
- Timestamp (unchanged)

Rationale: `kind` is agent-assigned metadata that clutters the scan line. Users reported (concept probe) that they do not classify items and find kind labels confusing. The status badge is immediately actionable (it tells you if something needs attention). The kind badge is not.

### Behavior
- `KnowledgeListRow` stops rendering the kind badge. The `kind` prop becomes unused (type remains for API compatibility, just not rendered).
- No visual shift — the row layout is unchanged. The gap previously occupied by kind is absorbed by the flex layout.

---

## Surface 3: Knowledge Detail — Overflow Menu

### Current state
The "..." overflow menu has three items:
1. **Flag** — calls `closeOverflow` (dead button)
2. **Archive** — calls `closeOverflow` (dead button)
3. **Change scope** — works (opens ScopeChangeDialog)

### New state
Two items in the overflow menu:
1. **Archive** — calls `POST /api/knowledge/:id/archive`, navigates to `/knowledge` on success
2. **Change scope** — unchanged (opens ScopeChangeDialog)

**Removed:**
- **Flag** — removed from user-facing menu. Flag is an agent operation (sets status to "draft" and requires a reason). If needed later, it returns via a "Report issue" flow.
- **Merge / Split** — never wired, never rendered in the overflow menu (only in the information architecture docs). API endpoints remain for agent use.

### Archive confirmation
No confirmation dialog. The action is "Archive" (not "Delete"). Items can be restored by agents or via API. The overflow menu closes, the archive call fires, and the user navigates back to the list.

If the archive call fails (network error, 404), show an inline error toast/banner at the top of the detail page: "Could not archive item. Try again." — same pattern as the existing conflict banner.

### Behavior
- On archive success: `navigate("/knowledge")` — same as after create.
- No undo button (AC-3 says "delete with undo OR explicit archive" — we chose explicit archive).
- Archived items disappear from default list views (already true — list only shows active/draft/needs_human).

---

## Surface 4: Knowledge Detail — Metadata Bar & Aside

### Current state
Header metadata bar shows: `Tag(kind)` + `StatusChip` + `Tag(layer)` + confidence + origin agent + timestamp.

Aside metadata card shows: Kind | Status | Confidence | Last edited | Editor | Access count.

### New state
Header metadata bar: `StatusChip` + confidence + origin agent + timestamp. Remove `Tag(kind)` and `Tag(layer)`.

Aside metadata card:
- **Kind** row: Keep — read-only, shows agent-assigned kind when present. Display "—" when absent.
- **Status** row: Keep.
- **Scope** row: NEW — shows the human-readable scope label ("Shared", "Team: X", "Private") instead of raw scopeKind.
- **Confidence** row: Keep.
- **Last edited** row: Keep.
- **Editor** row: Keep.
- **Access count** row: Keep.

Rationale: The header metadata bar is prime real estate for scanning. Kind and layer are agent-internal labels that consume space without aiding user decisions. Status, confidence, and origin agent are immediately meaningful.

---

## Surface 5: Knowledge Create — Scope Picker

### Current state (KnowledgeCreate.tsx)
A `<select>` dropdown with all 7 SCOPE_KINDS: factory, product, practice, team, bet, task, user. Below it, a conditional "Scope ID" text input for scopes that require an external id.

### New state
Replace the dropdown with a segmented control (radio group styled as pills). Three options:

```
[ Shared ]  [ Team ]  [ Private ]
```

| Label | Sends to API |
|---|---|
| Shared | `scopeKind: "factory"`, no scopeId |
| Team | `scopeKind: "team"`, scopeId = user's current teamId (auto-filled) |
| Private | `scopeKind: "user"`, scopeId = userId (auto-filled, already works) |

- The "Scope ID" free-text input is **removed**. Team scope auto-fills from the user's team context. If the user has no team, the Team option is disabled with a tooltip: "Join a team first."
- Default selection: **Shared** (matches current default of "factory").

### Styling
Same pill styling as the knowledge list scope pills (border-based, accent-primary on active). Horizontally laid out, 12px gap, inside the metadata aside card where the scope selector lives today.

### Edge case: user has no team
If `useCurrentUser()` returns no teamId, the "Team" pill is visually dimmed (opacity 0.5) and non-interactive. Clicking it does nothing. No tooltip required in v1 — the visual dimming is sufficient signal.

---

## Surface 6: KnowledgeCreateDialog (overlay variant)

### Current state
Same 7-value dropdown as KnowledgeCreate page. Used when creating from bet/task context (locked scope).

### New state
When **not locked**: Show the same 3-option segmented control as the full-page create.
When **locked** (bet/task context): Show read-only tag (unchanged behavior).

The "Kind" dropdown is **removed** from both KnowledgeCreate and KnowledgeCreateDialog. Kind is never sent in the create payload — removing the selector aligns UI with reality.

---

## "Did we consider" check

| Alternative | Why not |
|---|---|
| Keep kind as optional tag-style input | Kind is not a user concept. Users write; agents classify. Adding optional controls invites confusion. |
| Show all 7 scopes with better labels | Too many choices. "Practice" and "Product" require scope IDs the user does not have at hand. Scope change dialog exists for power users who need these. |
| Add undo to archive | Increases scope. Archive is non-destructive (item exists, can be restored via API or future UI). Undo adds a toast system and a restore endpoint call we do not need in v1. |
| Confirmation dialog for archive | Over-engineering for a non-destructive action. Archive is not delete. The mental model should be "move to archive" not "destroy." |
| Show bet/task scope items separately | They are rare in practice (agent-created). Showing them inline under "All" is correct — they are visible but not filterable because users do not create them. |

---

## Component impact summary

| Component | Change type |
|---|---|
| `KnowledgeList.tsx` | Scope pills become static 4-pill set; kind badge removed from rows |
| `KnowledgeDetail.tsx` | Overflow menu wired (archive works, flag removed); metadata bar simplified |
| `KnowledgeCreate.tsx` | Scope dropdown replaced with 3-pill segmented control; kind selector removed |
| `KnowledgeCreateDialog.tsx` | Same 3-pill control when unlocked; kind reference removed |
| `ScopeChangeDialog.tsx` | Unchanged (power-user escape hatch for all 7 scopes) |
| `KnowledgeOverflowMenu` (inline) | Reduced to 2 items (Archive + Change scope) |

### No new components needed
All changes compose existing primitives (pill buttons, overflow menu, navigate). No component budget impact.

---

## Keyboard & focus

- Scope pills in list: arrow-left/right between pills (existing behavior preserved).
- Overflow menu: Escape to close (already implemented).
- Create page scope picker: arrow-left/right between the 3 radio pills. Tab moves to next field.

---

## Accessibility

- Scope pill group: `role="radiogroup"` with `aria-label="Scope"`. Each pill: `role="radio"` + `aria-checked`.
- Archive action: after success, focus moves to the knowledge list (natural from navigation).
- Disabled "Team" pill: `aria-disabled="true"` + visual dimming.
