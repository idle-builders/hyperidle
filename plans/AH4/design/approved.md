# AH4 — Approved Design: Add-agent placement affordance

**Direction:** "Placement in context" (single routine variant, in-session critique 8.7/10). The destination team is surfaced in the register matching each surface's semantics: read-only where the team is fixed, a picker where it's chosen.

## Locked decisions

### Surface 1 — `AgentAddDialog` (WorkTeam page): read-only context
- Render a `KeyValue` (design-system, layout `inline`) as the **first element** inside the dialog body, above the "Agent name" field.
  - `label="TEAM"`, `value={teamName}`.
- `AgentAddDialog` gains a **required** prop `teamName: string`.
- `WorkTeam.tsx` passes `teamName={data.team.name}` (already available alongside the existing `teamMembersId={data.teamMembers.id}`).
- No picker. No change to `isDirty` (read-only field never dirties the dialog).

### Surface 2 — `SettingsAgents` add form: explicit picker
- Add a design-system `Select` (size `sm`) as the **first field** in the add form, above "Agent name".
  - Label `"Team"` using the form's existing `.label` / `label-text text-[var(--text-secondary)]` pattern.
  - Options from `GET /api/org` → `teams[]` (`{value: team.id (=teamMembers.id), label: team.name}`).
  - Default selection: first team's id.
- Include the selected `teamId` in the existing `POST /api/agents` body (currently omitted — this is the orphan fix).

## States (with copy)
| State | Surface | Behavior |
|---|---|---|
| Populated (≥1 team) | Settings | `Select` lists teams, first selected; POST sends `teamId`. |
| Populated | WorkTeam | `KeyValue` shows `TEAM  {name}`. |
| Zero teams | Settings | `Select` single disabled option: `"No teams — run Setup to create one"`. Create allowed only as explicit unassigned (`teamId: null`). |
| Loading teams | Settings | `Select` disabled, placeholder `"Loading teams…"`; rest of form interactive. |
| Teams fetch error | Settings | `Select` disabled, placeholder `"Couldn't load teams"`; dialog still opens, name/role usable. |

## Component mapping (zero new components)
| Element | Component | Props |
|---|---|---|
| Read-only team (WorkTeam) | `KeyValue` | `label="TEAM"`, `value={teamName}`, `layout="inline"` |
| Team picker (Settings) | `Select` | `size="sm"`, `value`, `onChange`, `options`, `aria-label="Team"` |
| Empty/loading/error option | `Select` `options` | single `{value:"", label:…, disabled:true}` |

## Behavior / motion / keyboard / mobile
- No new motion, no new keyboard shortcuts (founder filter).
- Tab order: placement field is first in both surfaces.
- Mobile: Settings `Select` stacks full-width (same as existing role/tier selects); inputs ≥16px (AQ-005, inherited from design-system). KeyValue inline wraps gracefully.

## Org-chart arrival (no add-agent design change)
The founder→team edge created at team creation (architecture side effect) renders in the **existing** Settings → Org Chart edge table (`mechanism` = `team`, target label = team name) with no new UI. No redesign of that table — out of scope per spec.

## Rejected (do not re-litigate)
- Unified single picker in both surfaces (lies about WorkTeam's fixed context).
- New `TeamPickerField` primitive (component-budget violation; `Select` suffices).
- Post-create "assign to team" step (contradicts "explicit before confirmation").
- Inline "+ Create team" in the picker (scope creep; bypasses roster provisioning → Setup owns team creation).

## Open questions for the architect
- Resolved by architecture.md: team list source = `GET /api/org` `teams[]` (id = `teamMembers.id`, matches `users.teamId` FK). No new endpoint.
- Confirm whether an explicit-unassigned create (zero-teams path, `teamId:null`) should be allowed or hard-blocked — architecture.md Risk 3 flags this for the reviewer. Design default: allow (user made the choice visibly).
