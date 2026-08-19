# Destroyer input — `connections` (agent-orchestration)

Package: `layers/agent-orchestration/connections`
Surface: 7 exported functions, 1 classes (1 member methods), 3 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `listHeldConnectionsForProvisioning` | yes | `layers/agent-orchestration/connections/src/held-connections-for-provisioning.ts:81` |
| 2 | `createInheritedReach` | yes | `layers/agent-orchestration/connections/src/inherited-reach.ts:433` |
| 3 | `projectInheritedConnections` | yes | `layers/agent-orchestration/connections/src/service-connection-projection.ts:38` |
| 4 | `listConnections` | yes | `layers/agent-orchestration/connections/src/service-connection-store.ts:39` |
| 5 | `insertConnection` | yes | `layers/agent-orchestration/connections/src/service-connection-store.ts:66` |
| 6 | `updateConnection` | yes | `layers/agent-orchestration/connections/src/service-connection-store.ts:77` |
| 7 | `deleteConnection` | yes | `layers/agent-orchestration/connections/src/service-connection-store.ts:103` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `ServiceConnectionResolver` — `layers/agent-orchestration/connections/src/service-connection-resolver.ts:24` (public)
- `ServiceConnectionResolver.resolve`

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `HeldConnectionForProvisioning` (interface, public) `layers/agent-orchestration/connections/src/held-connections-for-provisioning.ts:61` — members: `id`, `userId`, `service`, `authSource`, `serverUrl`
- `InheritedProbeDeps` (interface, public) `layers/agent-orchestration/connections/src/inherited-reach.ts:43` — members: `run`, `env`, `cwd`
- `InheritedReach` (interface, public) `layers/agent-orchestration/connections/src/inherited-reach.ts:422` — members: `refresh`, `list`
