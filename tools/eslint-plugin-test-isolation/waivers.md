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

- `layers/core-api/src/__tests__/AC1-bet-outcome.integration.test.ts`
- `layers/core-api/src/__tests__/AC1-session-effectiveness.integration.test.ts`
- `layers/core-api/src/__tests__/AC1-task-outcome.integration.test.ts`
- `layers/core-api/src/__tests__/AC2-retro.integration.test.ts`
- `layers/core-api/src/__tests__/AD4-policy-engine.integration.test.ts`
- `layers/core-api/src/__tests__/AD5-dep-unblock-event.integration.test.ts`
- `layers/core-api/src/__tests__/AD8b-new-tools.integration.test.ts`
- `layers/core-api/src/__tests__/AE6-artifact-normalization.integration.test.ts`
- `layers/core-api/src/__tests__/AF11-idor-regression.integration.test.ts`
- `layers/core-api/src/__tests__/AF12-activate-capacity.integration.test.ts`
- `layers/core-api/src/__tests__/AF12-bet-cascade.integration.test.ts`
- `layers/core-api/src/__tests__/AF12-task-cas.integration.test.ts`
- `layers/core-api/src/__tests__/AF15-model-gateway-partial.integration.test.ts`
- `layers/core-api/src/__tests__/AF15-org-teams.integration.test.ts`
- `layers/core-api/src/__tests__/AF17-propagation-bootstrap.integration.test.ts`
- `layers/core-api/src/__tests__/AL7-reviews-loader-redo.integration.test.ts`
- `layers/core-api/src/__tests__/AL7-two-session-loop.integration.test.ts`
- `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`
- `layers/core-api/src/__tests__/M3-auth-middleware.integration.test.ts`
- `layers/core-api/src/__tests__/M3-lifecycle-propagation-auth.integration.test.ts`
- `layers/core-api/src/__tests__/M3-settings-routes.integration.test.ts`
- `layers/core-api/src/__tests__/M3-threads-coach-auth.integration.test.ts`
- `layers/core-api/src/__tests__/P2-auth-resolution.integration.test.ts`
- `layers/core-api/src/__tests__/P2-org-routes.integration.test.ts`
- `layers/core-api/src/__tests__/P2-user-routes.integration.test.ts`
- `layers/core-api/src/__tests__/P3-health-auth.integration.test.ts`
- `layers/core-api/src/__tests__/P3-settings-config.integration.test.ts`
- `layers/core-api/src/__tests__/R5-agent-work-loop.integration.test.ts`
- `layers/core-api/src/__tests__/R7-bet-lifecycle.integration.test.ts`
- `layers/core-api/src/__tests__/R7-knowledge-e2e.integration.test.ts`
- `layers/core-api/src/__tests__/S1-auth-routes.integration.test.ts`
- `layers/core-api/src/__tests__/S1-e2e-flow.integration.test.ts`
- `layers/core-api/src/__tests__/U2-api-teams-bets.integration.test.ts`
- `layers/core-api/src/__tests__/af9-attention-population.integration.test.ts`
- `layers/core-api/src/__tests__/af9-promotion-routine.integration.test.ts`
- `layers/core-api/src/__tests__/agent-layer-boot-recovery.integration.test.ts`
- `layers/core-api/src/__tests__/agent-lifecycle-projection.integration.test.ts`
- `layers/core-api/src/__tests__/agent-orchestration-run-reads.integration.test.ts`
- `layers/core-api/src/__tests__/agent-request-custody.integration.test.ts`
- `layers/core-api/src/__tests__/agent-work-intent-production.integration.test.ts`
- `layers/core-api/src/__tests__/agent-work-intent-recovery.integration.test.ts`
- `layers/core-api/src/__tests__/agent-work-intent-retention.integration.test.ts`
- `layers/core-api/src/__tests__/api-e2e.integration.test.ts`
- `layers/core-api/src/__tests__/app-runtime-domain-observability.integration.test.ts`
- `layers/core-api/src/__tests__/artifacts-route.integration.test.ts`
- `layers/core-api/src/__tests__/bet-decomposition-removal.integration.test.ts`
- `layers/core-api/src/__tests__/bets.integration.test.ts`
- `layers/core-api/src/__tests__/bets.q3.integration.test.ts`
- `layers/core-api/src/__tests__/builtin-routines.integration.test.ts`
- `layers/core-api/src/__tests__/configuration-projection-boot.integration.test.ts`
- `layers/core-api/src/__tests__/conversations.integration.test.ts`
- `layers/core-api/src/__tests__/core-api-serves-no-agent-run-decorations.integration.test.ts`
- `layers/core-api/src/__tests__/create-item.integration.test.ts`
- `layers/core-api/src/__tests__/create-task.integration.test.ts`
- `layers/core-api/src/__tests__/daily-digest.integration.test.ts`
- `layers/core-api/src/__tests__/dependency-watcher.integration.test.ts`
- `layers/core-api/src/__tests__/dependency-watcher.perf.integration.test.ts`
- `layers/core-api/src/__tests__/explicit-session-start.production.integration.test.ts`
- `layers/core-api/src/__tests__/handoff-protocol.integration.test.ts`
- `layers/core-api/src/__tests__/handoff-to.integration.test.ts`
- `layers/core-api/src/__tests__/knowledge-signals.integration.test.ts`
- `layers/core-api/src/__tests__/lifecycle-propagation.integration.test.ts`
- `layers/core-api/src/__tests__/log-task.integration.test.ts`
- `layers/core-api/src/__tests__/notifications/AF8-notification-delivery.integration.test.ts`
- `layers/core-api/src/__tests__/notifications/R8-signal-to-noise.integration.test.ts`
- `layers/core-api/src/__tests__/notifications/dispatcher.integration.test.ts`
- `layers/core-api/src/__tests__/policy-engine.integration.test.ts`
- `layers/core-api/src/__tests__/promote-knowledge.integration.test.ts`
- `layers/core-api/src/__tests__/read-inbox.integration.test.ts`
- `layers/core-api/src/__tests__/reply-tool.integration.test.ts`
- `layers/core-api/src/__tests__/routines-aa1.integration.test.ts`
- `layers/core-api/src/__tests__/routines.integration.test.ts`
- `layers/core-api/src/__tests__/score-attention.integration.test.ts`
- `layers/core-api/src/__tests__/send-message.integration.test.ts`
- `layers/core-api/src/__tests__/session-review-creator.integration.test.ts`
- `layers/core-api/src/__tests__/sessions.integration.test.ts`
- `layers/core-api/src/__tests__/silence-policy.integration.test.ts`
- `layers/core-api/src/__tests__/status.integration.test.ts`
- `layers/core-api/src/__tests__/submit-review.integration.test.ts`
- `layers/core-api/src/__tests__/task-state-machine.integration.test.ts`
- `layers/core-api/src/__tests__/tasks.integration.test.ts`
- `layers/core-api/src/__tests__/two-app-mount-session-routes.integration.test.ts`
- `layers/core-api/src/__tests__/users.integration.test.ts`
- `layers/core-api/src/__tests__/work-service.integration.test.ts`
- `layers/core-api/src/__tests__/write-memory.integration.test.ts`
- `layers/core-api/src/__tests__/write-session-notes.integration.test.ts`
- `layers/core-api/src/__tests__/ws-subscribe-authz.integration.test.ts`
- `layers/core-api/src/routes/__tests__/knowledge.q2.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-orchestration-port-writes.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-knowledge-action-migration.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-reengagement-migration.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-routine-run-migration.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-task-run-migration.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-session-request-sources.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-work-intent-baked-payload.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-work-intent-supersede.integration.test.ts`
- `layers/core-api/src/services/__tests__/assistant-turn-b3-coherence-trigger.integration.test.ts`
- `layers/core-api/src/services/__tests__/connections-added-after-emit.integration.test.ts`
- `layers/core-api/src/services/__tests__/context-bundle-sandbox-byte-parity.integration.test.ts`
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

- `layers/core-api/src/__tests__/AC2-retro.integration.test.ts`
- `layers/core-api/src/__tests__/AF15-teams-idempotency.integration.test.ts`
- `layers/core-api/src/__tests__/AL7-proposed-call-capture.integration.test.ts`
- `layers/core-api/src/__tests__/AO1-filesystems.integration.test.ts`
- `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts`
- `layers/core-api/src/__tests__/R7-knowledge-e2e.integration.test.ts`
- `layers/core-api/src/__tests__/S1-invite-code.integration.test.ts`
- `layers/core-api/src/__tests__/agent-lifecycle-projection.integration.test.ts`
- `layers/core-api/src/__tests__/agent-request-custody.integration.test.ts`
- `layers/core-api/src/__tests__/agent-work-intent-production.integration.test.ts`
- `layers/core-api/src/__tests__/app-runtime-domain-observability.integration.test.ts`
- `layers/core-api/src/__tests__/attention-service.integration.test.ts`
- `layers/core-api/src/__tests__/bets.integration.test.ts`
- `layers/core-api/src/__tests__/builtin-routines.integration.test.ts`
- `layers/core-api/src/__tests__/create-routine.integration.test.ts`
- `layers/core-api/src/__tests__/explicit-session-start.production.integration.test.ts`
- `layers/core-api/src/__tests__/handoff-protocol.integration.test.ts`
- `layers/core-api/src/__tests__/handoff-to.integration.test.ts`
- `layers/core-api/src/__tests__/knowledge-access.integration.test.ts`
- `layers/core-api/src/__tests__/knowledge.integration.test.ts`
- `layers/core-api/src/__tests__/lifecycle-propagation.integration.test.ts`
- `layers/core-api/src/__tests__/policy-engine.integration.test.ts`
- `layers/core-api/src/__tests__/routines.integration.test.ts`
- `layers/core-api/src/__tests__/session-review-creator.integration.test.ts`
- `layers/core-api/src/__tests__/users.integration.test.ts`
- `layers/core-api/src/__tests__/write-memory.integration.test.ts`
- `layers/core-api/src/bootstrap/__tests__/factory-state.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-knowledge-action-migration.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-run-admission-failed-subscribers.integration.test.ts`
- `layers/core-api/src/services/__tests__/agent-session-request-sources.integration.test.ts`
- `layers/core-api/src/services/__tests__/connections-added-after-emit.integration.test.ts`
- `layers/core-api/src/services/__tests__/direct-thread.recipientKind.integration.test.ts`
- `layers/core-api/src/services/__tests__/filesystems-added-after-emit.integration.test.ts`
- `layers/core-api/src/services/__tests__/routine-scheduler-relocation.integration.test.ts`
