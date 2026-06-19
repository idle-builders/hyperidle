# AM2 Retro

Date: 2026-06-19
Branch: `feat/AM2-harness-capability-descriptor`

## Observations

- AM2 took about 5h35 wall-clock from start to docs completion. The work touched shared contracts, server descriptor builders, the harness registry route, CLI event parsing, integration tests, docs, and lint-driven SVG title fixes.
- TDD sequencing held: concept and architecture landed first, red tests committed in `18baab89`, green implementation in `2fdf6b4a`, review fix in `eacbb513`.
- Reviewer subagent spawning failed with `spawn_agent could not resolve the child model for service tier validation`, so code review ran in-process. The Explore subagent later succeeded for retro.
- Review found real cleanup: avoidable casts in normalization, stale route comments, and a missing explicit runtime return type.
- AM2 surfaces missing known CLI harness families as descriptor/readiness entries, but it does not perform binary/version/auth probes yet. AM4 must treat missing/readiness descriptors as onboarding state, not proof of installed/authenticated CLIs.
- `fileEditing` and `toolUse` default to true for legacy adapters that do not declare richer descriptor fields. That preserves compatibility, but future adapters should declare explicit values.
- Normalization tests cover completion, tool call, unknown events, and `toolCalls` preservation. Cost, token, and pre-compaction paths are typechecked and covered by full suites, but not by dedicated AM2 test cases.

## Verification Notes

- Targeted AM2 unit tests passed.
- Targeted AM2 integration tests passed.
- `npm run check` passed.
- `npm run lint` passed with warnings only.
- Full `npm run test` and `npm run test:integration` passed before the review-fix patch; targeted tests, check, and lint passed after the patch. Full `npm run verify` remains the ship gate.
