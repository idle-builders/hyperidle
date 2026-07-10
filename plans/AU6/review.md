# AU6 Code Review

## Findings

No blocking findings after rework.

Architecture: PASS. Production task dispatch, routine scheduling, assistant turns, session routes, manual routine trigger, and bet decomposition now execute through `executeAgentRunRequest` instead of resolving a local consumer from `provision-registry`. Server bootstrap no longer registers the legacy `provisionSession` hook or request consumer hook. Fabric legacy copies no longer resolve a global request consumer; if compatibility tests exercise them, they must receive an explicit boundary-shaped executor dependency.

Design: skipped. Backend/runtime boundary only; no UI files changed.

Security: PASS. No new route, credential, filesystem, URL, or prompt/config input surface. Runtime failure state remains persisted through existing request error fields.

Adversarial / Simplification / Slop: PASS. `scripts/au6-agent-boundary-guard.ts` is now part of `npm run lint` and fails on production imports of `agent-session-runtime` outside `agent-run-boundary`, production `getAgentSessionRequestConsumerFn` / `setAgentSessionRequestConsumerFn`, production legacy `setProvisionSessionFn` / `getProvisionSessionFn`, and local `consumeAgentSessionRequest` naming. This is the regression net that would have caught the under-scoped previous pass.

## AC Table

| Acceptance criterion | Result | Evidence |
|---|---|---|
| Every LLM-capable action produces an agent-layer run request before execution begins. | PASS | `agent-run-boundary.test.ts` covers all six source kinds from durable requests; bet decomposition/task/routine focused tests pass; `au6-agent-boundary-guard` blocks production consumer-registry bypasses. |
| Core app domains can observe requested/running/completed/failed/cancelled state without execution internals. | PASS | `getAgentRunLifecycle` and `listAgentRunLifecycleBySource` normalize existing request rows; tests cover all statuses. |
| Agent-layer execution owns harness/admission/context/tool/MCP/capture/writeback/lifecycle. | PASS | `executeAgentRunRequest` is the only new domain-facing executor and delegates to the existing runtime consumer, which owns provisioning internals. |
| Existing task, assistant, routine, knowledge-action, decomposition, and re-engagement behavior remains observable. | PASS | Source-kind boundary tests cover all six kinds; task dispatcher, routine scheduler, AD5 scheduler boot, AL7 re-engagement, and bet decomposition focused suites pass with boundary-shaped execution. |
| Failed agent run is reported through same lifecycle shape for every source. | PASS | Boundary tests cover per-source failed rows and runtime-thrown failure normalization. |
| Runtime tests prove request-to-lifecycle once; domain tests prove request creation/reaction without direct harness execution. | PASS | `agent-run-boundary.test.ts`, `agent-session-runtime.test.ts`, and fast suite all pass. |

Verdict: DONE after boundary-closure rework.
