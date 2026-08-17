# Destroyer input — `diagnostics` (framework)

Package: `framework/diagnostics`
Surface: 5 exported functions, 0 classes (0 member methods), 7 interface/type declarations, 14 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `createLogger` | yes | `framework/diagnostics/src/logger.ts:34` |
| 2 | `createConsoleObservabilityAdapter` | yes | `framework/diagnostics/src/observability/console-adapter.ts:12` |
| 3 | `scrubInlineTokens` | yes | `framework/diagnostics/src/redact.ts:82` |
| 4 | `summarizeToolArgs` | yes | `framework/diagnostics/src/redact.ts:112` |
| 5 | `redactDbUrl` | yes | `framework/diagnostics/src/redact.ts:137` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `Logger` (interface, public) `framework/diagnostics/src/logger.ts:71` — members: `debug`, `info`, `warn`, `error`
- `ObservabilityEvent` (type, public) `framework/diagnostics/src/observability/events.ts:73`
- `ObservabilityChannel` (type, public) `framework/diagnostics/src/observability/types.ts:4`
- `ObservabilityAdapter` (interface, public) `framework/diagnostics/src/observability/types.ts:11` — members: `name`, `record`, `flush`
- `ObservabilityDispatcherStatus` (interface, public) `framework/diagnostics/src/observability/types.ts:19` — members: `bufferDepth`, `lastFlushAt`, `lastErrorAt`, `lastError`, `dropped`, `delivered`, `adapter`
- `FlushOutcome` (interface, public) `framework/diagnostics/src/observability/types.ts:36` — members: `flushed`, `dropped`, `errors`
- `ObservabilityDispatcher` (interface, public) `framework/diagnostics/src/observability/types.ts:42` — members: `enqueue`, `flush`, `dispose`, `status`

## D. Const / enum exports

- `REDACTED_TAG` (const, public) `framework/diagnostics/src/redact.ts:14`
- `GITHUB_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:17`
- `BEARER_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:20`
- `SK_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:23`
- `PK_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:26`
- `TK_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:29`
- `HEX_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:32`
- `AWS_AKIA_RE` (const, public) `framework/diagnostics/src/redact.ts:35`
- `SLACK_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:38`
- `GOOGLE_API_KEY_RE` (const, public) `framework/diagnostics/src/redact.ts:41`
- `JWT_RE` (const, public) `framework/diagnostics/src/redact.ts:44`
- `STRIPE_TOKEN_RE` (const, public) `framework/diagnostics/src/redact.ts:47`
- `PEM_BLOCK_RE` (const, public) `framework/diagnostics/src/redact.ts:50`
- `ERROR_TOKEN_PATTERNS` (const, public) `framework/diagnostics/src/redact.ts:59`
