DOC-CLASS: significant

# AU5 Requirements: Configuration Surface For Agent Behavior

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md`
- `.pipeline/work-packages/AU2/requirements.md`
- `.pipeline/plans/AU2.md`
- `.pipeline/plans/AU4.md`
- `docs/architecture/runtime-simplification.md`
- `docs/guides/user/settings.md`
- `docs/ui-design/settings-consistency.md`
- `docs/ui-design/foundation.md`
- `docs/ui-design/our-components.md`
- `docs/agent-layer/agent-model.md`
- `docs/architecture/connection-model.md`
- `packages/web/src/pages/SettingsPage.tsx`
- `packages/web/src/settings/SettingsAgents.tsx`
- `packages/web/src/settings/SettingsHarnesses.tsx`
- `packages/web/src/settings/SettingsConnections.tsx`
- `packages/design-system/src/tokens.css`
- `packages/design-system/src/SplitView.tsx`
- `packages/design-system/src/Row.tsx`

## Goal

AU5 makes the AU runtime simplification visible to operators. A product operator gets one Settings area for the configuration that controls agent behavior: agents, skills, routines, triggers, tools, and MCP. The operator can see each item, where it came from, which value is active, whether a user override is active, and what happens when the origin plugin is disabled or missing.

The surface must feel like normal HyperIdle Settings, not an admin console and not plugin internals. It should help operators answer: "what will the system do when this event happens, which agent will act, which prompt/source will shape it, and what can I edit?"

## Success

- Agents, skills, routines, triggers, tools, and MCP configuration are reachable from one Settings area.
- Fabric and Strategy are not exposed as user-facing concepts.
- Plugin-provided, built-in, and user-owned configuration show origin, active value, and override state in plain product language.
- Supported fields can be edited and reloaded with the active value preserved.
- Trigger rows show event, chosen agent, prompt source, and default/plugin/user ownership.
- Disabled or missing plugin origins explain whether the item still runs, is disabled, or survives as a user override.
- Existing Settings sections for agents, harnesses, connections, assistant-as-agent, filesystems, appearance, credentials, notifications, backend, and routines remain reachable.

## Scope

In scope:

- A new Settings surface or section grouping for agent-behavior configuration.
- Read and edit flows for AU2 resolved configuration kinds: agent, skill, routine, trigger, tool, MCP, and harness/tool metadata where currently supported.
- Provenance and override presentation for built-in defaults, plugin defaults, user overrides, disabled origins, removed origins, and user-owned items.
- Trigger inspection and editing around AU4 trigger rule values and trigger history/read model.
- Links or deep handoffs back to existing Settings Agents, Agent backends, Connections, and existing routine surfaces where those remain the correct editor.
- User guide draft and significant concept review materials.

Out of scope:

- Plugin marketplace, installation, distribution, signing, sandboxing, trust tiers, or enterprise approval flows.
- Adding new harnesses, tools, MCP servers, skills, or LLM event kinds.
- Reworking Work, Conversation, or Knowledge IA except links into Settings.
- Eval/tuning UI.
- New preemptive security gates.

## Guide Draft

Settings now includes Agent behavior, the place to inspect and edit what makes HyperIdle's agents act.

The surface groups configuration by the thing the operator is trying to understand: agents, triggers, routines, skills, tools, and MCP. Each row shows the active value and its origin. Built-in defaults and plugin defaults are readable starting points. User edits become overrides and are shown as the active value. The origin remains visible so the operator can still understand where the configuration came from.

Triggers explain automation in operational language: the event that fires, the agent attached to it, the prompt source used, and whether the rule is a default, plugin-provided, or user-owned override. If no trigger matches, HyperIdle uses the default eligible agent with no event-specific prompt.

When a plugin is disabled or removed, Settings does not hide affected behavior. Rows explain whether the default no longer applies, whether a user override still runs, or whether the item needs attention. Existing Settings pages remain part of the flow: agent identity and model/harness details still edit through Agents, backend authentication through Agent backends and Connections, and routine schedule details through the routine editor where applicable.

## Nouns

**Agent behavior configuration**: The set of editable app configuration records that influence which agents exist, what they can use, when agent work starts, and what prompt/tool/MCP context applies.

Hard rules:

- It is app configuration, not plugin internals.
- It does not execute work by itself; trigger/runtime services consume resolved values.
- It never presents Fabric or Strategy as product concepts.

**Origin state**: The user-facing state of a configuration item's source.

Hard rules:

- Built-in, plugin, user-owned, user override, disabled plugin, and removed plugin are distinct states.
- Disabled/removed origins are visible states, not silent deletes.
- Secret values are never displayed as provenance or active values.

**Trigger configuration row**: A settings row for an AU4 trigger rule or fallback-relevant rule shape.

Hard rules:

- It shows event, chosen agent, prompt source, origin, and override state.
- It distinguishes schedule/firing definitions from agent-run trigger rules.
- It links to trigger history when available but does not require history to edit the rule.

## Acceptance Criteria And Verification

| AC | Requirement | Verification method |
|---|---|---|
| AC1 | One Settings area exposes agents, skills, routines, triggers, tools, and MCP configuration without Fabric/Strategy labels. | Component test renders the new Settings surface with fixture resolved config for every kind and asserts all six categories are visible and no user-facing Fabric/Strategy string appears. |
| AC2 | Plugin-provided config shows origin, active value, and override state. | Component test renders plugin default and user override fixtures and asserts origin label, active value label, and override marker text for each supported kind. |
| AC3 | Supported edits save and reload as the active value. | Integration/component test mocks PATCH/PUT config update, edits one agent field, one trigger prompt/agent binding, and one tool/MCP setting, then reloads and asserts `valueSource="user_override"` and active values are shown. |
| AC4 | Trigger configuration shows event, attached agent, prompt source, and ownership. | Component test renders AU4 trigger fixture rows for fallback, builtin, plugin, and user override and asserts event, chosen agent, prompt source, and ownership labels. |
| AC5 | Disabled or removed plugin origins produce understandable state. | Component test renders disabled-origin and removed-origin fixtures and asserts rows explain whether the item is disabled, needs attention, or still runs because a user override exists. |
| AC6 | Existing settings remain reachable. | Component or Playwright test opens Settings and asserts links/sections for Agents, Agent backends, Connections, and existing routine handoff remain present. |
| AC7 | Static Settings design contract is honored. | `npm run lint` covers design lint and Settings consistency gate; new Settings files use design-system primitives and no raw DaisyUI controls. |
| AC8 | Type safety and tests are green. | `npm run check`, `npm run lint`, and `npm run test` pass. |

