# X3 Design Comparison

## Chosen: Inline Table

Single variant (routine classification). See `inline-table/spec.md` and `inline-table/screenshot.png`.

## Rejected directions

### A. Modal editor per agent
Open a modal dialog when clicking "Edit" on an agent, with a full form inside. Rejected because: (1) W3 AC-47 established that Settings is a single scrollable page with no overlays — adding a modal violates the established Settings interaction grammar. (2) Modals require focus-trap management and escape-key handling that adds complexity for no user benefit on a low-frequency admin page. (3) The OrgChart section already proves inline forms work in this context.

### B. Two-column list/detail split
Left column shows agent list, right column shows the selected agent's full form. Rejected because: (1) This creates a sub-layout within the Settings section that differs from every other section (Profile, OrgChart, Appearance, Backend). (2) At 680px max-width (W3 AC-52), a two-column split would make each column ~330px — too narrow for the soul prompt textarea to be usable. (3) This pattern belongs on a dedicated "Agent Management" page, which is out of X3 scope.

### C. Accordion-per-agent (always-expandable)
Each agent is a collapsible accordion card. Expanding shows the full edit form. Rejected because: (1) Accordions introduce motion and state management overhead (which ones are open?). (2) With 8+ agents, the page would be a wall of collapsed accordions — scanning would be slower than a table. (3) The table format makes it easy to compare agents at a glance (e.g., "which agents use claude-code?"), which accordions lose.

### D. Dedicated page with route
A separate `/settings/agents` page with its own navigation. Rejected because: (1) Spec explicitly says "no new page or navigation entry" and "uses existing Settings patterns." (2) X3 is a settings section, not a standalone management surface.

### E. Inline cell editing (click-to-edit table cells)
Make each table cell directly editable (click name to edit name, click role badge to show dropdown). Rejected because: (1) Soul prompt doesn't fit in a table cell — it needs a textarea. (2) Click-to-edit on every cell creates an ambiguous interaction model (is a click selecting or editing?). (3) The edit-form pattern from OrgChart is proven and consistent.

## Phase 2 critique (self-scored)

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 7 | Agent name is clear primary. Role badge provides quick visual scanning. Soul prompt is appropriately de-emphasized in table, prominent in edit form. |
| Density | 8 | Table is compact. Edit form uses space efficiently with field rows. Soul prompt textarea is the largest element but appropriately sized for its content. |
| Typography | 7 | Monospace for roles, harness types, and soul prompt. Sans for names and labels. Section header follows established pattern. |
| Color | 7 | Uses only Hearth tokens. Role badges use container background. No color decoration. |
| Coherence | 9 | Matches OrgChart pattern exactly (table + inline form + add button). Matches Profile pattern for save/dirty tracking. |
| States | 7 | All states specified (empty, loading, error, populated, edit, add, save-in-flight). Delete confirmation is a sensible addition over OrgChart's immediate delete. |
| Accessibility | 6 | Standard form controls, keyboard navigation, focus management specified. Could improve: no visible focus indicators specified for table rows. |
| Anti-slop | 9 | No AI-aesthetic tells. No gradients, no oversized padding, no centered empty states, no decorative icons. Pure DaisyUI primitives + Hearth tokens. |
| Premium polish | 6 | Functional but not remarkable. The soul prompt textarea in monospace is the one distinctive touch. Could benefit from: (1) a row highlight on hover, (2) subtle transition on form expansion. |
| **Total** | **66/90** | Solid routine design. Matches existing patterns. No risks. |
