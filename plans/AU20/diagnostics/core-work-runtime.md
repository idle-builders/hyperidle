# AU20 core/work runtime diagnosis

80/80 identities disposed; 24 were formerly unresolved; 0 remain unresolved. `core-work-runtime.json` contains one explicit object per immutable full map ID.

| Register | IDs | Formerly unresolved | Diagnosis |
|---|---:|---:|---|
| BR-FIXTURES | 7 | 5 | Settings tests target the removed user-profile dialog; Settings is a routed page |
| BR-LIFECYCLE | 7 | 7 | Lifecycle domain passes 26/26 imported integration tests; six browser fixture/selector failures and one real activity-close regression |
| BR-SETUP | 6 | 4 | E2E setup fixtures/redirects lag current harness/filesystem/credential flow and canonical `/work` destination |
| BR-WORK-DETAIL | 14 | 6 | Retired selectors or incomplete endpoint fixture shapes; behavior remains load-bearing |
| BR-WORK-ROUTES | 46 | 2 | Approved `/work` route consolidation; one stale default-view shortcut setup and one explicitly retired skipped PitchSelector flow |

## Runtime boundaries

The lifecycle service itself is healthy: the focused imported integration suite passed 26/26 in 4.84s. Browser lifecycle cases fail earlier at `bet-task-row`, old status/team fixture projections, duplicate broad `conversations-page` locators, and retired task-sheet routes. Q1 line 257 is the exception: activity mode opens, but closing it never restores the full-width thread. Keep that case red and repair the close-state/overlay interaction.

Fixtures M3/M4 reach the current shell but wait for a `user profile` button and Settings dialog. Those concepts were replaced by routed Settings sections. Keep API-derived profile assertions; replace entry mechanics only.

Setup and Work-route identities overwhelmingly encode the superseded portfolio/canvas IA. The current canonical entry is `/work`, with one-team routing to `/work/team/:id`. Correct tests against that contract, preserving create/filter/navigation capability. `work-surface.spec.ts:97` already documents that PitchSelector was deleted and replacement coverage lives in L13.

Work-detail failures occur before their intended behavior: old `bet-task-row`/table selectors, a test-local route override that bypasses its own active-bet fixture, or session fixtures that render as “No sessions yet.” Production/test source is byte-identical across the pre-AU20 boundary, so these are not attributable to an AU20 UI change. Update fixtures/selectors, then retain PATCH, session metadata, task opening, and navigation assertions.

## Evidence

- Source A/B: `git diff --quiet ca6a6b71^..HEAD -- packages/web/src packages/web/e2e` → 0.
- Lifecycle imported runtime: `npx vitest run --config vitest.integration.config.ts --project service packages/core-api/src/__tests__/lifecycle-propagation.integration.test.ts` → 26 passed.
- Focused reporter artifacts are recorded in `core-work-runtime.json`.
- Concurrent-port-contaminated `ERR_CONNECTION_REFUSED` tails were excluded from causal inference.

