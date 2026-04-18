# H3 Adversary Review

## CRITICAL

- **AC4 regression — `tool_call` observability events are never produced.** `packages/server/src/harness/claude-agent-sdk-adapter.ts:132` yields a `tool_call` HarnessEvent; `packages/server/src/services/session-provisioning.ts:332` consumes it (routes to registry) but never emits an `ObservabilityEvent` or a DomainEvent for it. `registerObservabilityDispatcher` in `dispatcher.ts:222` has no `tool_call` subscriber. The Console/Langfuse encoders switch on `"tool_call"` but that branch is unreachable in production — every run will log zero tool calls. The acceptance criterion ("Events logged: session start/end, tool calls, cost, state transitions, knowledge writes") is not met.

- **Buffer-cap drop policy is O(n²) on burst.** `dispatcher.ts:160` uses `state.buffer.shift()` inside a `while` loop. When a burst of 1000 events arrives at `bufferCap=100`, each `shift()` is O(n) and the loop runs ~900 times → up to 450k element moves. Combined with the `maybeFlushSoon` short-circuit that only fires on batch-full, a pathological burst pins the event-loop for tens of ms. The performance test at `performance.bench.test.ts:22` sets `bufferCap: 10_000` so it never exercises drop-oldest. Measurement is dishonest for the realistic case.

- **Langfuse `flush()` races against `record()` (AC5 data loss).** `langfuse-adapter.ts:254` assigns `inFlight` AFTER `await task`, meaning `flush()` called between two `record()` calls will observe `inFlight=null` and return immediately while the next POST is still mid-flight. The dispatcher's `dispose()` path will falsely believe all traffic has drained. Buffered events can be dropped on shutdown.

## WARNINGS

- **`drain()` eats its own buffer on adapter error.** `dispatcher.ts:122` uses `buffer.splice(0, batchSize)` BEFORE awaiting `adapter.record`. If record throws (e.g. Langfuse 503), the batch is permanently gone. The lore comment claims this is intentional ("observability is disposable"), but there is no retry, no bounded backoff, no 4xx-vs-5xx distinction. Ingress costs money and CPU — silently throwing away data on a transient 503 contradicts the task description's "Retries on 5xx? Drop on 4xx?" expectation. There is no retry logic at all.

- **PATCH /config has no live-reload.** `app.ts:188-227` constructs the dispatcher + adapter once at app boot from `readObservabilityConfig`. `observability-routes.ts:88` only updates `factory_settings`. A flipping `enabled`, switching adapters, or rotating Langfuse keys requires a process restart. The adversary questions from the architect review are unresolved.

- **`flush()` post-error lies.** `dispatcher.ts:188` calls `drain()` then `adapter.flush()` unconditionally. If `drain()` breaks on the adapter error path (line 139), the remaining buffered events sit there, but the route at `observability-routes.ts:138-144` subtracts `delivered` counts and happily reports success. Callers cannot distinguish "drained cleanly" from "dropped after partial error."

- **Trace correlation for cross-session tool calls is not proven.** `dispatcher.ts:267-276` hardcodes `traceId: \`task:${taskId}\`` for `task_state_changed`. If the harness reuses a session across multiple tool invocations spanning different tasks, the tool_call (when it eventually gets wired) will carry the session traceId while task_state_changed carries a task traceId — Langfuse will split them. No test exercises a session that spans >1 task or a task that spans >1 session.

- **Empty `sessionId` is silently accepted.** `dispatcher.ts:240` falls back to `ev.sessionId` as traceId when resolver misses. If the harness ever emits a `session_started` with `sessionId: ""`, traceId becomes `""` — a valid string, but all events collapse onto a single empty trace in Langfuse. No guard.

- **No disk spill / crash loss undocumented.** In-flight events are in-memory only. A SIGKILL / OOM between `enqueue` and `drain` loses every buffered event silently. Acceptable trade-off, but it is not called out in the plan or README; operators will assume observability data is durable because it goes through a "dispatcher."

- **Ordering is NOT guaranteed within a session.** `maybeFlushSoon()` (line 147) fires `queueMicrotask` whenever buffer ≥ batchSize. If drain() is already running, a second batch-full trigger queues another drain that returns immediately (`flushing=true`). Combined with async `adapter.record` for Langfuse, multiple `record()` calls can interleave across fetches (one `inFlight` slot exists but the dispatcher doesn't await it). Strict per-session event order is not enforced.

- **`envelopeId` collisions on same-ts events.** `langfuse-adapter.ts:82` uses `${traceId}:${kind}:${index}:${ts}`. `index` is the position inside one batch — two separate batches with the same traceId/kind at the same `ts` (e.g. a re-emit after retry logic is added later, or a burst of state transitions in one tick) produce identical ids. "Deterministic id so Langfuse dedupes on retry" is exactly the wrong behavior — next retry will dedupe with the original and lose it.

- **`summarizeToolArgs` truncates BEFORE scrubbing.** `dispatcher.ts:363`: truncation to 512 then `scrubInlineTokens`. A secret straddling the 512 boundary has its tail cut off before regex can match the full pattern — the regex `sk-[A-Za-z0-9._\-]{8,}` requires 8+ chars after `sk-`. If the truncation falls inside those 8 chars, the scrubber fails and a partial `sk-xxxxxx...` leaks.

- **`Basic` auth base64 does not hide keys from `fetch` stack traces.** If `globalThis.fetch` throws synchronously with the request options captured (e.g. undici's `ConnectionError`), the stack frame holds the `headers.Authorization` string. `scrubLangfuseError` only scrubs `err.message`, not nested cause/options. Low probability but present.

## OBSERVATIONS

- Performance test is unrealistic (OBS on top of the CRITICAL): 1000 empty `tool_call` events with `argsSummary: "{}"` never exercises `safeStringify`, `scrubInlineTokens`, or the drop-oldest loop. A realistic tool call argSummary is 200–512 chars. Budget passes because the measurement is generous.
- `fakeAdapter` in `dispatcher.test.ts:33` uses a getter to return `flushed` counter — harmless but obscures what is mutated. Tests are mostly honest; no `toBeDefined`-only tautologies detected.
- `trace-correlation.test.ts:104` constructs a resolver inline with no seed map — the test proves the pre-seeded happy path but not the DB read path (that is covered separately at line 40).
- `routes.test.ts` does not test that PATCH with an invalid `adapter` enum returns 400 via the Zod path (only SSRF + CR/LF). Coverage hole.
- SSRF test does not assert rejection for `::ffff:169.254.169.254` (embedded metadata IP) — `isPrivateIPv6` handles it but no test pins the behavior.
- `config.ts:174` always rewrites public/secret keys even when undefined-after-JSON-parse vs. explicit-null semantics confuse the `clearOrSet` helper for downstream refactors.
- `console-adapter.ts:17` emits one `log.info` per event. At 1000 events/burst this is 1000 synchronous JSON.stringify + write calls. Fine in practice; worth noting if console ever becomes the production adapter.

## VERDICT

**STOP.** AC4 ("tool calls" logged) fails in production — no code path enqueues a `tool_call` ObservabilityEvent. Langfuse `flush()` race loses events on shutdown. Drop-oldest is O(n²). Fix the tool_call wiring, fix the flush race, change drop-oldest to a head-cursor (as the module lore already claims it does but doesn't), and honestly benchmark the burst path before proceeding.
