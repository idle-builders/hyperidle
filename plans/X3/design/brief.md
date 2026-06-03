DESIGN-CLASS: routine  ref=SettingsOrgChart  pattern=none

# X3 Design Brief — Agent Configuration in Settings

## Classification rationale

- **Existing component reference:** SettingsOrgChart provides the exact pattern — entity table with inline add/edit form. SettingsProfile provides the save-with-dirty-tracking pattern.
- **Pattern match:** No `packages/design-system/html/` pattern, but the TSX Settings components are well-established (5 existing sections, consistent layout vocabulary).
- **Result:** `routine`. The interaction grammar is settled (table rows + inline expansion for editing). One variant with explicit rejected directions.

## Interrogated brief

**Who is doing this and what decision are they making?**
A founder in Settings, configuring their AI team. They're adjusting agent personas and capabilities to match their team's needs. This is a low-frequency admin task (done during setup or when reshaping the team), not a high-frequency workflow.

**What's the smallest UI surface that delivers the outcome?**
A new section in the stacked SettingsPage between "Org chart" and "Appearance". Lists all AI agents in a table. Each agent expands inline for editing. A "+ Add Agent" button opens an inline creation form.

**Primary state — which is most common?**
Populated. A fresh factory seeds 8+ agents (builder, CoS, PM, 5 practice facilitators). The empty state is theoretically possible but unlikely after setup.

**Which existing component or DaisyUI primitive does this compose from?**
- `table table-xs` — agent list (same as OrgChart)
- `input input-sm input-bordered` — name, max concurrent sessions
- `select select-sm select-bordered` — role, harness type, model tier
- `textarea textarea-sm textarea-bordered` — soul prompt
- `btn btn-primary btn-sm` / `btn btn-ghost btn-sm` — save, cancel, add, delete
- `badge badge-sm` — role/status indicators in the table
- `loading loading-spinner loading-xs` — in-flight save indicator

**What gets overflowed/truncated when dense?**
Soul prompt text in the table row — show first line only, truncated with ellipsis. Full content visible only in the expanded edit form.

**Open question for architect:**
The soul prompt textarea will be large (500+ tokens of markdown). Should the edit form be an inline expansion below the row (like OrgChart's add form) or a slide-out panel? My read: inline expansion. It keeps the single-page-scrollable contract (W3 AC-47). The textarea can be tall (8-10 rows) without breaking the layout.
