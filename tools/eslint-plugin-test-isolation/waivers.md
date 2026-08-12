# Test-isolation lint waivers (AU38)

Ratchet for the AU38 migration: every fixture-based `*.integration.test.ts`
file that still violates a rule is listed under that rule's section, and the
plugin suppresses exactly the listed files. The list only shrinks — each
migration batch (increments 2–7) removes the files it migrates, the R1
section must be EMPTY at increment 8, and R2 keeps at most a handful of
permanent reasoned waivers. Adding an entry is a diff review challenges.

Shape: one `## <rule-name>` heading per rule; entries are
`- \`repo/relative/path\`` lines (parsed by `src/waivers.ts`). Generated full at
increment 1 by running both rules over the whole lane.

## no-literal-entity-ids
- `layers/core-api/src/__tests__/AD4-policy-engine.integration.test.ts` — P10: `policy_engine` is a production-fixed system user id (policy engine uses it as sender for auto-verdicts); cannot scope without changing production
- `layers/core-api/src/__tests__/AF15-model-gateway-partial.integration.test.ts` — P10: serverConfig.id="default" is a production singleton (only one config row exists); cannot scope without changing production
- `layers/core-api/src/__tests__/AF17-propagation-bootstrap.integration.test.ts` — P10: `system:propagation` is a production-fixed bootstrap user id (applyFactoryCoreState seeds it); cannot scope without changing production
- `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`
- `layers/core-api/src/__tests__/bets.integration.test.ts` — createTestDb test at line 515 uses its own isolated DB; literal id is safe within that isolated scope
- `layers/core-api/src/__tests__/configuration-projection-boot.integration.test.ts` — `modelId: "claude-sonnet-4-6"` is a configuration value (model identifier), not an entity id; scoping would break the test
- `layers/core-api/src/__tests__/notifications/R8-signal-to-noise.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-reengagement-migration.integration.test.ts` — `toolId: "commit_file"` is a tool identifier (configuration value), not an entity id
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts` — `toolId: "commit_file"` and `approvedToolId: "commit_file"` are tool identifiers (configuration values), not entity ids
- `layers/core-api/src/services/__tests__/context-bundle-sandbox-byte-parity.integration.test.ts` — `scopeId: "building"` is a community name (configuration value), not an entity id
- `layers/core-api/src/services/__tests__/core-api-port-increment2-conversation.integration.test.ts`
- `layers/core-api/src/services/__tests__/core-api-port-increment2-knowledge.integration.test.ts`
- `layers/core-api/src/services/__tests__/core-api-port-increment2-org-routine-handoff.integration.test.ts`
- `layers/core-api/src/services/__tests__/core-api-port-increment2-work-users.integration.test.ts`
- `layers/core-api/src/services/__tests__/core-api-port.integration.test.ts`
- `layers/core-api/src/services/__tests__/direct-thread.recipientKind.integration.test.ts`
- `layers/core-api/src/services/__tests__/routine-scheduler-relocation.integration.test.ts`
- `layers/core-api/src/services/__tests__/routine-scheduler.au15.integration.test.ts`
- `layers/core-api/src/services/__tests__/run-orchestration-connections-provisioning-edge-closed.integration.test.ts`
- `layers/core-api/src/services/__tests__/session-knowledge-assembler-ranking-parity.integration.test.ts`
- `layers/core-api/src/services/__tests__/session-review-creator.reengagement-liveness-baked-emit.integration.test.ts`
- `layers/core-api/users/src/__tests__/runnable-agent.integration.test.ts`

## no-unscoped-table-read
- `layers/core-api/src/__tests__/AO1-filesystems.integration.test.ts` — AC4 before/after comparison reads of knowledgeItems and serverConfig to prove filesystem registration didn't touch other tables; legitimate negative-proof pattern
- `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`

- `layers/core-api/src/__tests__/attention-service.integration.test.ts`
- `layers/core-api/src/__tests__/create-routine.integration.test.ts`
- `layers/core-api/src/__tests__/knowledge-access.integration.test.ts`
- `layers/core-api/src/__tests__/knowledge.integration.test.ts`
- `layers/core-api/src/__tests__/users.integration.test.ts`
- `layers/core-api/src/__tests__/write-memory.integration.test.ts`
- `layers/core-api/src/bootstrap/__tests__/factory-state.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-knowledge-action-migration.integration.test.ts` — reads all `items` to find one containing a specific marker; legitimate search pattern
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts` — reads all `items` to find one containing a specific marker; legitimate search pattern
- `layers/core-api/src/services/__tests__/agent-session-request-sources.integration.test.ts` — reads all `agentSessionRequests` to verify all 3 have status "completed"; legitimate bulk verification
- `layers/core-api/src/services/__tests__/connections-added-after-emit.integration.test.ts` — reads all `serviceConnections` to verify none exist before adding one; legitimate negative-proof pattern
- `layers/core-api/src/services/__tests__/direct-thread.recipientKind.integration.test.ts`
- `layers/core-api/src/services/__tests__/filesystems-added-after-emit.integration.test.ts`
- `layers/core-api/src/services/__tests__/routine-scheduler-relocation.integration.test.ts`
