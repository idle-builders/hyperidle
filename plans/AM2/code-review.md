# AM2 Code Review

## Scope

Reviewed commit range through `eacbb513` against `.pipeline/work-packages/TRACK-AM.md` § AM2, `plans/AM2/concept.md`, `plans/AM2/architecture.md`, and `docs/agent-layer/harness-capability-descriptor.md`.

Subagent note: reviewer subagent spawn failed with `spawn_agent could not resolve the child model for service tier validation`, so the review was performed in-process using `/review`.

## Findings

### Resolved

- `packages/shared/src/harness/harness-event-normalization.ts`: removed avoidable casts for model tiers/currency and validates currency codes before preserving `cost_update.currency`.
- `packages/server/src/harness/harness-capability-descriptors.ts`: made descriptor runtime conversion return `HarnessRuntimeCapabilities` explicitly.
- `packages/server/src/routes/harnesses.ts`: updated stale comments so route docs match the enriched `HarnessCapabilityDescriptor[]` response.

### Open

No critical or warning findings remain.

## AC Audit

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Each harness exposes a normalized descriptor declaring available models and per-model options, queryable by UI. | PASS | `GET /api/harnesses` returns descriptors via `AdapterPool.listCapabilityDescriptors()`; `AM2-harness-capabilities.integration.test.ts` asserts builtin models/runtime/auth fields. |
| Model options are generic enough for UI rendering without backend-specific code. | PASS | `harness-capability-descriptor.ts` closes control kinds to `select`, `boolean`, `number`, `text`; shared test builds two model descriptors with generic options. |
| Backend-native runtime events normalize into one downstream model. | PASS | `normalizeHarnessEvent()` whitelists the existing `HarnessEvent` union; shared tests cover completion/tool/unknown events and preserved `toolCalls`; CLI adapter now calls the helper. |
| Harness-scope decision is documented and descriptor shape reflects it. | PASS | `plans/AM2/concept.md` and `docs/agent-layer/harness-capability-descriptor.md` lock extension-provided harnesses + autodiscovery; server descriptor builders expose `builtin` as `api-gateway` and known CLI families as `provider-subscription-cli` missing/readiness entries. |

## Verification

- `npm run test -- packages/shared/src/harness/__tests__/harness-capability-descriptor.test.ts packages/shared/src/harness/__tests__/harness-event-normalization.test.ts packages/server/src/harness/__tests__/AM2-harness-capability-descriptors.test.ts` — PASS, 9 tests.
- `npm run test:integration -- packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts` — PASS, 13 tests.
- `npm run check` — PASS.
- `npm run lint` — PASS, warnings only.
- Prior full suites before the review-fix patch: `npm run test` — PASS, 6008 tests; `npm run test:integration` — PASS, 2986 tests.

## Verdict

DONE.
