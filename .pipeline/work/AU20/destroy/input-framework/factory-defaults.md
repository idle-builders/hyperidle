# Destroyer input — `factory-defaults` (framework)

Package: `framework/factory-defaults`
Surface: 2 exported functions, 0 classes (0 member methods), 6 interface/type declarations, 3 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `resolveAgentScaffoldSpecs` | yes | `framework/factory-defaults/src/agent-scaffold.ts:56` |
| 2 | `readSystemPromptTemplateForRole` | yes | `framework/factory-defaults/src/system-prompt-templates.ts:95` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AgentScaffoldRequest` (interface, public) `framework/factory-defaults/src/agent-scaffold.ts:29` — members: `trigger`, `teamName`, `functions`, `role`, `name`, `ownerUserId`, `ownerUserName`
- `AgentScaffoldSpec` (interface, public) `framework/factory-defaults/src/agent-scaffold.ts:39` — members: `role`, `name`, `agentCategory`, `systemPrompt`, `idHint`
- `FactoryFacilitatorSpec` (interface, public) `framework/factory-defaults/src/factory-roster.ts:40` — members: `community`, `role`, `idHint`, `templateRole`
- `FactorySystemAssistantSpec` (interface, public) `framework/factory-defaults/src/factory-roster.ts:55` — members: `role`, `idHint`
- `FactoryRosterSpec` (interface, public) `framework/factory-defaults/src/factory-roster.ts:75` — members: `facilitators`, `systemAssistant`
- `FactoryAgentRef` (interface, public) `framework/factory-defaults/src/factory-roster.ts:129` — members: `id`, `role`

## D. Const / enum exports

- `COMMUNITY_DISPLAY_NAMES` (const, public) `framework/factory-defaults/src/factory-roster.ts:114`
- `defaultFactoryRoster` (const, public) `framework/factory-defaults/src/factory-roster.ts:134`
- `SYSTEM_PROMPT_TEMPLATE_FILES` (const, public) `framework/factory-defaults/src/system-prompt-templates.ts:32`
