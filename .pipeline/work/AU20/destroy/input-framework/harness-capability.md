# Destroyer input — `harness-capability` (framework)

Package: `framework/harness-capability`
Surface: 1 exported functions, 0 classes (0 member methods), 13 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `derivePrimaryHarness` | yes | `framework/harness-capability/src/harness/derive-primary-harness.ts:19` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ReturnEnforcementChannel` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:28`
- `HarnessOptionControlKind` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:38`
- `HarnessAccessMode` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:40`
- `HarnessReadinessState` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:42`
- `HarnessAuthActionKind` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:49`
- `HarnessAuthActionDescriptor` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:51` — members: `kind`, `label`, `description`, `command`, `credentialNames`
- `HarnessOptionChoice` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:59` — members: `value`, `label`
- `HarnessModelOptionControl` (type, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:64`
- `HarnessModelOptionDescriptor` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:75` — members: `key`, `label`, `helpText`, `control`, `required`, `scope`, `defaultValue`
- `HarnessModelDescriptor` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:85` — members: `id`, `label`, `provider`, `contextWindow`, `selectable`, `inheritedFromGateway`, `options`
- `HarnessRuntimeCapabilities` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:95` — members: `preCompactionTrigger`, `subAgents`, `mcpSupport`, `modelProviders`, `fileEditing`, `toolUse`
- `HarnessDiscoveryStatus` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:104` — members: `state`, `version`, `reason`, `disabled`
- `HarnessCapabilityDescriptor` (interface, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:124` — members: `type`, `name`, `kind`, `accessMode`, `authAction`, `discovery`, `models`, `runtime`, `returnEnforcement`, `modelProviders`

## D. Const / enum exports

- `HARNESS_OPTION_CONTROL_KINDS` (const, public) `framework/harness-capability/src/harness/harness-capability-descriptor.ts:37`
