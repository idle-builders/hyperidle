# Destroyer input — `agent-run-config` (agent-orchestration)

Package: `layers/agent-orchestration/agent-run-config`
Surface: 5 exported functions, 0 classes (0 member methods), 3 interface/type declarations, 2 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `readAgentRunConfig` | yes | `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:75` |
| 2 | `readAgentRunConfigs` | yes | `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:94` |
| 3 | `writeAgentRunConfig` | yes | `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:121` |
| 4 | `readTeamRunConfigDefaults` | yes | `layers/agent-orchestration/agent-run-config/src/team-run-config-defaults-store.ts:41` |
| 5 | `writeTeamRunConfigDefaults` | yes | `layers/agent-orchestration/agent-run-config/src/team-run-config-defaults-store.ts:54` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `AgentRunConfig` (interface, public) `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:30` — members: `systemPrompt`, `harnessType`, `modelTierPreference`, `modelId`, `modelProvider`, `maxConcurrentSessions`
- `AgentRunConfigPatch` (type, public) `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:61`
- `TeamRunConfigDefaults` (interface, public) `layers/agent-orchestration/agent-run-config/src/team-run-config-defaults-store.ts:21` — members: `defaultHarnessType`, `defaultModelId`, `defaultModelProvider`

## D. Const / enum exports

- `DEFAULT_AGENT_RUN_CONFIG` (const, public) `layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:44`
- `EMPTY_TEAM_RUN_CONFIG_DEFAULTS` (const, public) `layers/agent-orchestration/agent-run-config/src/team-run-config-defaults-store.ts:28`
