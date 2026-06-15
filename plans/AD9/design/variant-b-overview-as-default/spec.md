# Variant B — Overview-as-default + persistent quick-nav

**User task.** Same as A, but optimized for the power user who spends the day inside one section and wants the sidebar list always at hand, plus an overview ordered by what needs attention.

## Nav grammar (the signature)

Differs from A on **when the quick-nav sub-list shows** and **how the overview orders**:

1. Click header → select section + surface overview (same as A).
2. Sidebar: the selected section's quick-nav list is **persistently visible** (as today — only the active section reveals sub-items). B does NOT add a second-click reveal step; selecting the section IS the reveal. (This is the same as current behavior — B's bet is that the current reveal is already correct and AD9 should only change the *header destination*, not the reveal model.)
3. Main overview leads with an attention-ordered list (see below).
4. Item click → into item.

AD3 1-team exception preserved identically.

## Work overview — attention-ordered team list

Same frame as A (fixed header + scroll body, `max-w-[800px]`), but the list is **sorted client-side by attention**: `blocked` → `behind` → `agentHealthWarning` → `healthy`, tie-break name asc. No visual sectioning (that's C) — just a smarter default order so the team that needs the founder sits at top.

- **Header:** `Teams` title + a tiny tertiary count sub-line `${n} teams` (mirrors Conversations' optional count) + `New bet` Button.
- **Row:** identical composition to A, but the lead slot carries a `RowDot` whose tone encodes status (so the leftmost glyph, not the right-anchored chip, is the first scan signal):

```
Row
  lead     = RowDot(tone = status→tone)            ← eye lands here first
  title    = team.name
  subtitle = `${activeBets} active · ${activeAgentCount}/${agentCount} agents`
  cells    = [ StatusChip(status), {`${done}/${total}`, numeric, hideBelow 640} ]
  onClick  = navigate(`/work/team/${id}`)
```

## States

Same five as A. Difference: populated state is attention-sorted; the count sub-line appears only when teams exist (suppressed in empty/loading).

## Behavior / motion / keyboard

- Same as A plus: the persistent quick-nav list in the sidebar is itself attention-ordered to match the overview (one ordering rule, two surfaces).
- `⌘1/2/3` unchanged.
- Motion: none beyond existing.

## Mobile

Same three-tab mapping as A; the attention sort carries to mobile so the top-of-list team is the one needing attention.

## Signature

**The list is already triaged.** The founder never sorts — the most-attention team is always first, and the leftmost dot is the at-a-glance signal. The sidebar list and the overview share one order.

## Trade-offs (what B is bad at)

- Attention re-ordering means a team's position is not stable — a founder building muscle memory for "team X is 3rd" gets disrupted when X goes blocked. (Mitigated: stable tie-break by name.)
- Two status signals per row (lead RowDot + StatusChip) is mild redundancy — defensible as glyph (scan) + label (read), but a critic may call it double-encoding.
- Only marginally different from A in structure; the bet is on ordering, not layout.
