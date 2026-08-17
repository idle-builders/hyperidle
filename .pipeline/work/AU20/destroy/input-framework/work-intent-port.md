# Destroyer input — `work-intent-port` (framework)

Package: `framework/work-intent-port`
Surface: 2 exported functions, 0 classes (0 member methods), 8 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `bakeAgentRunnableConfig` | yes | `framework/work-intent-port/src/agent-work-intent-recorder.ts:148` |
| 2 | `toBakedContextKnowledgeItems` | yes | `framework/work-intent-port/src/agent-work-intent-recorder.ts:194` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `BakedWorkIntentRequest` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:36` — members: `defaultAgentId`, `sourceKind`, `sourceId`, `streamId`, `taskId`, `teamId`, `userId`, `sourceCorrelation`, `transcript`, `contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`
- `BakedAgentRunnableConfig` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:132` — members: `kind`, `status`, `role`, `teamId`
- `BakedContextKnowledgeItem` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:158` — members: `id`, `title`, `body`, `format`, `version`, `layer`
- `SessionKnowledgeItemLike` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:178` — members: `id`, `title`, `body`, `format`, `version`, `layer`
- `BakedContextBundle` (type, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:230`
- `AgentWorkIntentRecorderInput` (type, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:289`
- `AgentWorkIntentRecorder` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:346` — members: `record`
- `AgentWorkIntentReader` (interface, public) `framework/work-intent-port/src/agent-work-intent-recorder.ts:354` — members: `findByKindAndSource`
