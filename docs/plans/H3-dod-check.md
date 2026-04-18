# H3 — Observability Adapter — Definition of Done Audit

**Result:** READY TO SHIP

## Evidence per AC

| AC | Proof (file:line) | Assertion strength |
|---|---|---|
| AC1 Console JSON to stdout | `packages/server/src/__tests__/observability/console-adapter.test.ts:33-62`, `:91-158` | Asserts `msg`, `level=info`, `traceId`, `kind` and all 7 event shapes round-trip through a captured `Logger`. Adapter in `console-adapter.ts:11-25` routes through shared `createLogger` (no raw `console.log`). |
| AC2 Langfuse traces (integration) | `langfuse-adapter.integration.test.ts:63-105` — 127.0.0.1 HTTP fixture asserts POST path `/api/public/ingestion`, Basic auth base64, batch[] shape, `trace-create`+`observation-create` types. Also `:107-253` covers 207 Multi-Status, 5xx, SSRF literal block, key scrubbing, in-flight flush. |
| AC3 Trace correlation | `trace-correlation.test.ts:40-95` (DB resolver reads `sessions.trace_id`), `:97-136` (session_started + cost_cap_breached both resolve to `trace-X`). `h3-review-fixes.test.ts:687-740` proves ordered fan-out across session lifecycle. |
| AC4 Events logged (session start/end, tool calls, cost, state, knowledge) | `h3-review-fixes.test.ts:195-237` translates session_started + tool_call_recorded + knowledge_updated; `dispatcher.ts:327-486` switch covers all 7 kinds with exhaustiveness `never` check. Real emit sites: `session-provisioning.ts:106,259,338` and `session-lifecycle.ts`, `cost-cap.ts`, `task-state-machine.ts`, `bet-state-machine.ts`, `routes/knowledge.ts`. |
| AC5 1000 events <100ms | `performance.bench.test.ts:35-61` (1000 realistic 400-byte events asserted <100ms); `:63-91` proves drop-oldest stays O(1) at cap (10k enqueues / cap=100 <100ms, 9,900 dropped). |
| AC6 Configurable via factory_settings | `config.ts:65-176` reads/writes `observability.*` rows; `routes.test.ts:71-181` covers GET/PATCH/redaction/SSRF/CR-LF; `h3-review-fixes.test.ts:389-510` proves live rebuild on PATCH without restart. |

## Production wiring

- Dispatcher attached to bus in `app.ts:213-234` via `registerObservabilityDispatcher` (wildcard subscription). Teardown on dispose at `:256-264`.
- `tool_call_recorded` emitted at real site `session-provisioning.ts:338-345` with `summarizeToolArgs` scrubbing.
- PATCH `/config` live-reload: `app.ts:243` hands `wireObservability` to routes as `onConfigChange`; `:213-234` tears down prior subscription + dispatcher before rebuilding. Regression test `h3-review-fixes.test.ts:390-486`.
- DNS rebinding guard: `langfuse-adapter.ts:240-255` performs two `resolveUrlForSSRF` calls; verified by `h3-review-fixes.test.ts:326-357` (first public / second private => blocked, 0 fetches).

## Gates

- `bun run check`: clean (tsc exit 0).
- `bun run lint`: 0 errors (69 biome warnings + 1 eslint warning, none new to H3).
- Observability suite: 7 files / 62 tests pass (3.37s).
- Shared SSRF suite: 24 tests pass.
- Full suite: 1477 passed / 1 skipped (112s).

## No findings — zero blockers, zero gaps.
