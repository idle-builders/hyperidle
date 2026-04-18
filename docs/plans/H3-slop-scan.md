# H3 Slop Scan

Read-only findings. No code changed.

## Summary

H3 is tight. Comments are mostly load-bearing `@lore` or rationale, not filler. The main smells are a few unnecessary `async` keywords, a defensive double-resolve in `assertUrlNotSSRF`, one dead export alias, and a couple of test-only adapter wrappers that add noise. No AI tell-tales ("for now", "simplified", "TODO: implement"). No fake `any`/`as` casts. One `⚠️ UNVERIFIED` marker is present and justified by CLAUDE.md rules.

## Findings

### Unnecessary `async`
- `packages/server/src/services/observability/console-adapter.ts:21,26` — `record()` and `flush()` are `async` but never `await`. `record` only calls `logger.info` in a for-loop; `flush` is explicitly a no-op. The interface requires `Promise<void>`, so `async` is the cheapest way to satisfy it — acceptable, but a one-line `return Promise.resolve()` would be more honest.
- `packages/server/src/__tests__/observability/routes.test.ts:24-26` — `record: async () => Promise.resolve()` returns a promise of a promise. Use either `async () => {}` or `() => Promise.resolve()`, not both.
- `packages/server/src/__tests__/observability/performance.bench.test.ts:16-18` — same double-promise pattern.

### Defensive over-engineering
- `packages/shared/src/net/ssrf.ts:144-151` — `assertUrlNotSSRF` calls `sanitizeHttpUrl(input)` then re-parses `new URL(input)` inside its own try/catch. `sanitizeHttpUrl` already succeeded, so the URL is parseable; the second try/catch is dead defense. Reuse the first parse or factor the parse into the sync helper.
- `packages/server/src/services/observability/config.ts:210-212` — `sanitizeLangfuseKey` runtime-checks `typeof input !== "string"` on a parameter typed `string`. TypeScript strict mode already guarantees this; the check is dead unless the function is called from untyped code. If it must exist, the signature should be `unknown`.

### Dead / redundant exports
- `packages/server/src/services/observability/langfuse-adapter.ts:262` — `export { toIngestionEvents as _testToIngestionEvents };` The underscore-prefix + re-export suggests a test hook, but nothing in `__tests__/observability/*` imports it. Delete or use it.

### Naming / shape
- `packages/server/src/services/observability/dispatcher.ts:183-184` — `const t = state.timer as unknown as { unref?: () => void };` is the right escape hatch for cross-runtime `unref`, but the variable name `t` is unclear. `timerHandle` or inline the cast.
- `packages/server/src/services/observability/config.ts:34-41` — `SafeObservabilityConfig` redefines `publicKey` as `typeof REDACTED | null` while also adding `publicKeySet: boolean`. The two fields encode the same bit. Either field alone is sufficient; both together is over-specified API surface.

### Comments restating code
- `packages/server/src/services/observability/dispatcher.ts:181-182` — `// Prevent the timer from keeping the process alive in tests/CLIs.` is borderline filler next to the immediately-following `unref` call; the `@lore` below it carries the real insight.
- `packages/server/src/services/observability/console-adapter.ts:28` — `// Console is fire-and-forget; nothing to drain.` is fine, but paired with an empty async function the comment is the only payload — just return `Promise.resolve()` with no body comment.

### Test quality
- `packages/server/src/__tests__/observability/dispatcher.test.ts:55-67` — `makeInMemResolver` duplicates the public `TraceIdResolver` shape; tests could just inline `{ resolve: () => null, seed: () => {} }` where used (trace-correlation.test.ts:104-107 already does this).
- `packages/server/src/__tests__/observability/routes.test.ts:21-27` — `quietAdapter` is a two-line object literal wrapped in a factory used twice. Inline or keep, but the factory adds no value.

### Positive observations
- All exported functions have explicit return types (matches `.claude/rules/typescript.md`).
- No `any`, no `@ts-ignore`, no `!` assertions in scope.
- `@lore` comments are genuinely non-obvious (ring-buffer rationale, 207 multi-status, DNS rebinding gate, key scrubber depth-in-defense).
- The `⚠️ UNVERIFIED` marker on Langfuse ingestion types (`langfuse-adapter.ts:17-25`) matches the project rule for unverified third-party API shapes.
- `sanitizeHttpUrl` and `assertUrlNotSSRF` return tagged unions, not throws — correct per project convention.

## Verdict

**PROCEED** — findings are small-surface cleanups, not structural issues. The dead `_testToIngestionEvents` export and the double-parse in `assertUrlNotSSRF` are worth fixing before merge; the rest is taste.
