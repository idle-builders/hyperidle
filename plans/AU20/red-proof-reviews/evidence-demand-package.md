# AU20 F1 nested-port red-proof review

Date: 2026-07-24  
Reviewer: independent pipeline-reviewer, nested-port round 2  
Scope: read-only review of final expanded red proof

## Frozen inputs

| Input | SHA-256 |
|---|---|
| Expanded validator | `8cfaf4d8b4c1cf6c55b6941a7d2f6b16985603a68dd08c5ae63e5d8654db1758` |
| Expanded proof | `fe50ae191154ce1bed20facff969ad7e061c3974a33bfbf071fc0dafd8aefe63` |
| Frozen rejected generator | `aa97fb3ea89f97aa3a9ecb0bf778c291eeee544f32dda4618ee2c809b46b6385` |
| Frozen rejected package | `6143da860cbbf91bd130905366bab26cec19cc4f5b00e64b60b2a0b50b3b2450` |

## Findings

No critical or warning finding remains.

### Architecture

Nested composition groups now resolve only by exact normalized live-service
identity. Generic method-name voting is absent from nested-group resolution.
Non-service groups such as `workspaceFactory` are excluded unless future
explicit composition-root lineage maps them.

The canonical valid package has exact separated receiver groups for all named
`DispatchPorts` providers. Representative source truths:

- `agent-selection / DispatchPorts.agentSelection / resolveScaffoldSpecs`;
- `conversation / DispatchPorts.conversation / getThreadById,
  getThreadIdsByHost, insertMessage, insertThread, listMessagesByThread,
  updateThread`;
- `cost / DispatchPorts.cost / getFactoryCostActual`;
- `run-orchestration / DispatchPorts.runOrchestration /
  executeAgentRunRequest`;
- `tool-handlers / DispatchPorts.toolHandlers /
  buildAssistantDraftRegistry`.

No dispatch receiver has port `DispatchPorts.workspaceFactory`; no knowledge
receiver contains request `create`; no request is the group label
`runOrchestration` or `toolHandlers`.

### Adversarial

Two fixture generations produced identical manifests and byte-identical
directories. `valid.json` exits 0. All 17 adversarial fixtures are rejected,
including nested method omission, group-as-method, provider broadcast,
workspace-adapter false edge, and collapsed groups.

The frozen rejected implementation candidate exits 1 with exact diagnostic
`agent-selection.diReceivers diverges from authoritative source`.

### Simplification / slop

No product/service, census, ownership-guard, generator-candidate, or generated
candidate bytes changed during this write-tests revision. The census remains
23 services / 231 methods / 181 types.

## Acceptance audit

| Criterion | Result | Evidence |
|---|---|---|
| Exact nested provider method mapping | PASS | All named groups are provider-qualified and carry their own source methods. |
| No generic voting for unresolved nested groups | PASS | Nested path uses normalized live-service identity only. |
| `workspaceFactory` creates no receiver or knowledge edge | PASS | Zero matching receiver/false edge; dedicated adversarial fixture rejected. |
| Group keys are not emitted as requests | PASS | Zero `runOrchestration`/`toolHandlers` request labels. |
| No provider broadcast or group collapse | PASS | Dedicated mutations rejected; each nested port has one owner. |
| Deterministic valid fixture | PASS | Double generation hash/byte equality; valid exit 0; source hash `b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc`. |
| Seventeen adversarial fixtures | PASS | 17/17 rejected; hashes exactly match proof metadata. |
| Frozen rejected candidate remains red | PASS | Exact frozen hashes; exit 1 for nested DI divergence. |
| Scope and preservation | PASS | Only authorized red-proof paths changed semantically; candidate paths frozen; census and finding ledger green. |

The corrective-map review gate remains deliberately locked to the prior proof
until the coordinator binds this accepted review hash; this is correct
write-tests-stage behavior, not an implementation failure.

VERDICT: accept
