DESIGN-CLASS: routine  ref=AgentAddDialog+SettingsAgents-add-form  pattern=none

# AH4 Design Brief — Add-agent placement affordance

## User task
A founder adds an agent and must know — before confirming — which team it joins, so the org chart matches what they built. Two entry surfaces with different placement semantics:
- **WorkTeam → Add agent (`AgentAddDialog`):** destination is FIXED to the team being viewed. The user is not choosing; they're confirming. → surface as read-only context.
- **Settings → Agents → add form (`SettingsAgents`):** destination is CHOSEN from existing teams. → surface as an explicit picker.

The org chart (Settings → Org Chart edge table) shows the new founder→team edge automatically on team creation — no add-agent design change needed there; it is the architecture's side effect rendered in the existing table.

## Reuse inventory (hard gate)
| Visual element needed | Renders via | New? |
|---|---|---|
| Team picker (Settings add form) | `Select` (`@hyperidle/design-system`) — already used in both forms for Role/Tier | reuse |
| Read-only "Joins {team}" (WorkTeam dialog) | `KeyValue` (label/value pair, tabular, design-system) | reuse |
| Empty-teams guidance (Settings, zero teams) | disabled `Select` option + tertiary-text hint `<p>` — same pattern as SettingsOrgChart team-empty copy | reuse |
| Section heading ("PLACEMENT" / inline label) | existing `.label` + uppercase micro-label pattern already in AgentAddDialog | reuse |

Zero NEW components. The placement affordance is built entirely from `Select` + `KeyValue` + existing label patterns.

## Phase 0 settled answers
- Primary state: populated (≥1 team exists). The Settings picker defaults to the first team.
- Edge state: zero teams → disabled option "No teams — run Setup", agent creatable only as explicit unassigned (matches SettingsOrgChart copy).
- WorkTeam dialog: never a picker — the page IS the team context; a picker there would imply you can reassign, which is out of scope (no multi-team, no move).
- Copy register: terse. "Joins {team}" / "Team" label. No guided prose.

## Out of scope
Org-chart visual redesign; multi-team membership; moving an existing agent between teams; the founder→team edge rendering (it lands in the existing edge table unchanged).
