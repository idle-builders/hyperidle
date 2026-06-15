# Variant — "Placement in context" (the single routine variant)

## User task
A founder adding an agent sees, before confirming, exactly which team it joins — surfaced in the register that matches the surface's semantics (fixed context vs. explicit choice).

## Thesis
Placement is not one widget. The *same information* (destination team) is rendered two ways because the user's relationship to it differs: in WorkTeam the team is a given (show it), in Settings it is a decision (let them make it). Honoring that distinction is the signature.

## Component composition (named, design-system)
### Surface 1 — `AgentAddDialog` (WorkTeam page) — read-only context
- Add a `KeyValue` (layout `inline`) directly under the dialog title row, above the "Agent name" field.
  - `label="TEAM"`, `value={teamName}` → renders as `TEAM            Acme` (mono uppercase tertiary label left, primary value right — KeyValue's built-in inline style).
- No picker. The dialog already carries `teamMembersId`; we add a `teamName` prop for the label.
- Rationale: the user opened this dialog *from* the Acme team page. The team is the context, not a choice.

### Surface 2 — `SettingsAgents` add form — explicit picker
- Add a `Select` (size `sm`, design-system) as the FIRST field in the add form, above "Agent name", so placement is decided before identity.
  - `label="Team"` (existing `.label` + `label-text` pattern, matching the form's other fields).
  - Options sourced from `GET /api/org` `teams[]` (`{id: teamMembers.id, name}`) — same source SettingsOrgChart uses.
  - Default value: first team's id.
  - Include selected `teamId` in the existing POST `/api/agents` body.

## Information hierarchy
1. **Destination team** — first thing in the form/dialog (placement before identity). In Settings: a `Select`. In WorkTeam: a `KeyValue` row.
2. Agent name (existing).
3. Role + soul + config (existing, unchanged).

## States
- **Populated (≥1 team), Settings:** `Select` shows all teams, first selected. POST sends `teamId`.
- **Populated, WorkTeam:** `KeyValue` shows `TEAM  {name}`. Always present (WorkTeam always has a team).
- **Empty (0 teams), Settings:** `Select` shows a single disabled option `"No teams — run Setup to create one"` (mirrors SettingsOrgChart team-empty copy); tertiary-text hint below. Create is allowed only as explicit unassigned (`teamId:null`) — the user sees they're creating an orphan.
- **Loading (Settings, fetching teams):** the `Select` renders disabled with a `"Loading teams…"` placeholder until `GET /api/org` resolves; the rest of the form is interactive. Falls back gracefully — name/role usable immediately.
- **Error (Settings, teams fetch fails):** `Select` shows disabled `"Couldn't load teams"`; create disabled until retry (form already toasts on failure). Does not block the dialog from opening.

## Behavior / motion / keyboard
- No new motion. `Select` and `KeyValue` carry their tuned focus/hover states.
- `Select` participates in the existing form tab order; placed first → it receives focus order before name.
- No new keyboard shortcuts (founder filter: no keyboard-verb shortcuts).
- `isDirty` (AgentAddDialog) unaffected — placement is read-only there, never makes the dialog dirty.

## Mobile adaptation
- Settings form on mobile (single Settings tab): the `Select` stacks full-width above the name input — same flow as the existing role/tier selects which already stack. Input font ≥16px (AQ-005) honored by the design-system `Select`.
- WorkTeam `KeyValue` inline row wraps naturally; on narrow widths it remains label-left/value-right (KeyValue inline handles this).

## Signature
Two registers for one fact: a `KeyValue` where the team is a given, a `Select` where it's a choice. The UI never asks the user to choose something already determined, and never hides a choice they actually have.

## Trade-offs (what this is bad at)
- Two code paths for "placement" instead of one shared component — slightly more surface to maintain. Mitigated: both are one-liners over existing components, no new component.
- The WorkTeam `KeyValue` is informational only; a user wanting to add an agent to a *different* team must go to that team's page. Acceptable — moving/cross-team is explicitly out of scope.
