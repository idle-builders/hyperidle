# Delete batch — `fw-diagnostics`

20 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `createConsoleObservabilityAdapter` | function · BOOTSTRAP — sole caller core-api/observability-runtime.ts, itself part of the dead pipeline | Sink of a telemetry pipeline with no reader, no operator route (AU26 deleted them for zero requesters), no reachable off switch; dies with the whole pipeline. |
| 2 | `redactDbUrl` | function · TEST/TOOLING-ONLY — tools/setup/setup-cli.ts (tooling world) + framework/db/__testing__/pg-test-runner.ts (dev world); zero production callers | No production reach; move into tools/setup, give the test runner its own 20-line copy, delete from framework. |
| 3 | `ObservabilityEvent` | type · INTERNAL to dead pipeline — outside this package only core-api dispatcher.ts + its tests | Six-way discriminated union describing telemetry records nobody reads; dies with the pipeline. |
| 4 | `ObservabilityChannel` | type · core-api dispatcher.ts + tests only | "noop" enum — an off switch spelled as a channel; dies with the pipeline. |
| 5 | `ObservabilityAdapter` | interface · core-api dispatcher.ts, observability-runtime.ts + tests | One real implementation (console) — not an abstraction, indirection; batch signature serves a network adapter that was never built. |
| 6 | `ObservabilityDispatcherStatus` | interface · core-api dispatcher.ts only; sole production reader of status() deleted in AU26 (its own @lore says so) | Operator snapshot with no operator; test-only seam = dead code plus tests that die with it. |
| 7 | `FlushOutcome` | interface · core-api dispatcher.ts only | Partial-drain accounting for flushes to console.log; nobody branches on it. |
| 8 | `ObservabilityDispatcher` | interface · core-api dispatcher.ts + tests | Port with one implementation, wired at one site, feeding one unread sink. |
| 9 | `GITHUB_TOKEN_RE` | const · DEAD as export — zero external references; used inside redact.ts only | Un-export; private detail of the scrub functions. |
| 10 | `BEARER_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 11 | `SK_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 12 | `PK_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 13 | `TK_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 14 | `HEX_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 15 | `AWS_AKIA_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 16 | `SLACK_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 17 | `GOOGLE_API_KEY_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 18 | `JWT_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 19 | `STRIPE_TOKEN_RE` | const · DEAD as export — zero external references | Un-export; same. |
| 20 | `PEM_BLOCK_RE` | const · DEAD as export — zero external references | Un-export; same. |
