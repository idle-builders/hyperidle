# H3 — Observability Adapter — Plan

## 1. Context

Operators need observability into agent sessions. Today, sessions emit
`session_started`, `session_ended`, `cost_*`, `knowledge_updated`,
`task_state_changed`, `bet_*` on the in-process `EventBus`, and the
harness streams `tool_call`, `token_usage`, `cost_update` events. Nothing
persists or correlates these. Debugging a session means grepping
`console.log` across three subsystems.

H3 adds a **pluggable observability adapter** that subscribes to the bus,
correlates events into **traces** (one per session), and forwards them to
a sink — either the existing `@hyperidle/shared` structured logger
(dev/laptop) or a Langfuse project (production/remote).

## 2. Constraints

- **Architecture.** Meta-layer service only. The Human Interface never
  calls the adapter. The adapter is fed by the shared `EventBus` (it does
  not reach into call-sites).
- **Event bus.** Synchronous, in-process, at-least-once. `emit()` must
  remain non-blocking — the adapter must buffer, never flush inline.
- **Performance.** 1000 events in <100ms end-to-end (enqueue path only).
  The flush path is async.
- **Tech.** Drizzle (new column + migration), Hono (routes + validate
  middleware), Vitest. `bun run test` for the Vitest runner.
- **Component budget.** No UI work.
- **Keys.** Langfuse public + secret keys must be redacted on
  `GET /api/observability/config`, scrubbed from error messages, and
  never logged in plaintext.
- **SSRF.** Langfuse URL goes to arbitrary remote — must be validated
  through the same private-range blocklist the H2 ntfy adapter uses.
- **Existing H2 pattern.** Adapter interface (`name`, `send/record`,
  `close?`), dispatcher registration, config in `factory_settings`,
  admin-audit logs on PATCH, and zod-validated routes are reused.

## 3. Design

### 3.1 Boundary — shared types

Add a tiny type module in `packages/shared/src/observability` so that
event types are reused by the web layer later (for the settings UI). The
adapter runtime stays in `packages/server`.

```
// packages/shared/src/observability/events.ts
export type ObservabilityEventKind =
  | "session_started"
  | "session_ended"
  | "tool_call"
  | "cost_incurred"
  | "task_state_changed"
  | "bet_state_changed"
  | "knowledge_write";

export interface ObservabilityEventBase {
  /** Correlates all events within a session. UUID v4. */
  readonly traceId: string;
  /** Session id when the event originates from a session. Null for bus-only events. */
  readonly sessionId: string | null;
  /** ISO 8601 timestamp. */
  readonly ts: string;
  readonly kind: ObservabilityEventKind;
}

export interface SessionStartedObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "session_started";
  readonly agentId: string;
  readonly taskId: string;
}

export interface SessionEndedObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "session_ended";
  readonly agentId: string;
  readonly taskId: string;
  readonly outcome: "completed" | "crashed" | "stopped";
  readonly costDelta: number;
}

export interface ToolCallObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "tool_call";
  readonly toolName: string;
  readonly argsSummary: string; // bounded preview, never the full args
}

export interface CostIncurredObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "cost_incurred";
  readonly level: "warning" | "critical" | "hard" | "soft";
  readonly capLevel: "agent" | "team" | "factory";
  readonly entityId: string;
  readonly spend: number;
  readonly cap: number;
}

export interface TaskStateChangedObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "task_state_changed";
  readonly taskId: string;
  readonly fromState: string;
  readonly toState: string;
}

export interface BetStateChangedObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "bet_state_changed";
  readonly betId: string;
  readonly fromState: string;
  readonly toState: string;
}

export interface KnowledgeWriteObservabilityEvent extends ObservabilityEventBase {
  readonly kind: "knowledge_write";
  readonly itemId: string;
  readonly action: string;
}

export type ObservabilityEvent =
  | SessionStartedObservabilityEvent
  | SessionEndedObservabilityEvent
  | ToolCallObservabilityEvent
  | CostIncurredObservabilityEvent
  | TaskStateChangedObservabilityEvent
  | BetStateChangedObservabilityEvent
  | KnowledgeWriteObservabilityEvent;
```

### 3.2 Adapter interface

```
// packages/server/src/services/observability/types.ts
export type ObservabilityChannel = "console" | "langfuse" | "noop";

export interface ObservabilityAdapter {
  readonly name: ObservabilityChannel;
  /** Deliver a batch. Adapter MAY accept or reject the entire batch. */
  record(events: readonly ObservabilityEvent[]): Promise<void>;
  /** Force in-flight work to complete. Called on shutdown and tests. */
  flush(): Promise<void>;
  /** Optional teardown hook (release pooled connections). */
  close?(): void;
}
```

`record()` is **batch-shaped** so the Langfuse adapter can send an
N-event HTTP POST in one go. The Console adapter still iterates — it
wraps the existing `createLogger` and emits one JSON log per event.

### 3.3 Buffered dispatcher (non-blocking enqueue)

```
export interface ObservabilityDispatcher {
  /** Non-blocking enqueue. Safe to call from the event bus hot path. */
  enqueue(event: ObservabilityEvent): void;
  /** Force the current buffer to the adapter. */
  flush(): Promise<void>;
  /** Stop the background timer + unsubscribe from the bus. */
  dispose(): Promise<void>;
  /** Operator-visible status (for /status route). */
  status(): ObservabilityDispatcherStatus;
}

interface ObservabilityDispatcherStatus {
  readonly bufferDepth: number;
  readonly lastFlushAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastError: string | null;
  readonly dropped: number;
  readonly delivered: number;
  readonly adapter: ObservabilityChannel;
}
```

Behaviour:

- In-memory ring buffer with a hard cap (default `buffer_cap = 10000`).
- `enqueue()` is **synchronous, O(1)**. It never awaits. When the buffer
  is at cap, the oldest event is dropped and the `dropped` counter
  increments (drop-oldest policy — newest events are the interesting
  ones when a burst happens, but a policy knob can be added later).
- A single background `setInterval` timer fires every
  `flush_interval_ms` (default 2000ms) and forwards up to `batch_size`
  (default 100) events to `adapter.record`. If the buffer reaches
  `batch_size` before the interval, we flush early via `queueMicrotask`.
- Adapter failures record `lastError` + `lastErrorAt`, events stay in
  the buffer for one more retry; after 3 consecutive failures the
  affected batch is dropped (Console-safe fallback: the console adapter
  never fails in practice). Failure mode is telemetry, not durability —
  observability data is disposable by design.

Dispatcher lifetime is tied to `createApp` disposers (same mechanism
H1/H2 use).

### 3.4 Trace correlation

**New column** `sessions.trace_id TEXT` (nullable for backfill, populated
on insert for new rows). Drizzle migration in both SQLite + Postgres.

`createSession` generates a trace id (`crypto.randomUUID()`) and writes
it alongside the row. Harness events (`tool_call`, `cost_update`) go
through the session-lifecycle layer, which already knows the session
id — we do the trace lookup there once and cache it on the
`SessionContext`.

The bus subscriber resolves `trace_id` per event:

- session events: directly from `context.traceId` (passed through).
- cost/state/knowledge events keyed by session: `SELECT trace_id FROM
  sessions WHERE id = ?`.
- non-session events (bet state, knowledge promotions outside a session):
  synthesize a `traceId = "bg:<streamId>"` so the Langfuse UI groups them.

Every `ObservabilityEvent` carries `traceId`. The performance budget
covers the enqueue path only; the session→trace lookup is amortised by a
tiny per-session cache and never touches the DB on the hot path when
cache-hit.

### 3.5 Adapters

**ConsoleObservabilityAdapter** (packages/server/src/services/observability/console-adapter.ts)

- Wraps `createLogger({ pkg: "observability" })`.
- `record(events)`: iterates, emits one `logger.info` per event with
  structured `extra` — JSON to stdout via the existing logger's
  formatter.
- `flush()`: resolves immediately.

**LangfuseObservabilityAdapter**
(packages/server/src/services/observability/langfuse-adapter.ts)

- Configured with `{ url, publicKey, secretKey, fetch? }`.
- `record(events)`: POST `{url}/api/public/ingestion` with JSON body
  `{batch: IngestionEvent[]}`. Each `ObservabilityEvent` maps to one
  ingestion event:
  - `session_started` → `trace-create` + `span-create` (trace id = our
    `traceId`).
  - `session_ended` → `span-update` via `observation-create` terminating
    the root span + `trace-update` for final outcome.
  - `tool_call` → `span-create` (nested under session span).
  - `cost_incurred` → `score-create` with `name = "cost"`.
  - `task_state_changed`, `bet_state_changed`, `knowledge_write` →
    `event-create`.
- Auth: HTTP Basic header built from `publicKey:secretKey`, never logged.
- URL sanitized with the SSRF blocklist (see §3.6).
- Transient/5xx → retry once; non-retriable → log-and-drop.
- `flush()`: awaits the in-flight HTTP if any.
- `close()`: no-op (global fetch, no pooled socket).

### 3.6 Shared SSRF module

Extract `isPrivateIPv4`, `isPrivateIPv6`, `isPrivateHostLiteral`,
`sanitizeHttpUrl`, `assertUrlNotSSRF` from
`services/notifications/config.ts` to
`packages/shared/src/net/ssrf.ts`. Notifications config re-exports the
pre-existing names to keep H2 callers untouched.

Rationale: the same blocklist is now needed for ntfy (H2) and Langfuse
(H3); future adapters (H4 cloud, git-export webhooks) will want it too.

### 3.7 HTTP routes

`packages/server/src/routes/observability-routes.ts`

- `GET /api/observability/config` — `SafeObservabilityConfig` (keys
  redacted, `*Set` booleans).
- `PATCH /api/observability/config` — zod-validated patch; runs through
  sanitizers (`sanitizeHttpUrl`, `sanitizeLangfuseKey`). Emits an
  admin-audit log entry on success.
- `GET /api/observability/status` — returns `status()` snapshot.
- `POST /api/observability/flush` — forces `dispatcher.flush()`.
- `POST /api/observability/test` — emits a synthetic event through the
  configured adapter and returns `SendResult`. Rate-limited (same bucket
  strategy as H2).

### 3.8 Configuration keys (factory_settings)

All keys prefixed `observability.`:

| key | type | default |
| --- | --- | --- |
| `enabled` | bool | `false` |
| `adapter` | `console` \| `langfuse` \| `noop` | `console` |
| `langfuse_url` | string | `https://cloud.langfuse.com` |
| `langfuse_public_key` | string (secret-ish) | `null` |
| `langfuse_secret_key` | string (secret) | `null` |
| `batch_size` | int [1, 1000] | `100` |
| `flush_interval_ms` | int [100, 60000] | `2000` |
| `buffer_cap` | int [100, 100000] | `10000` |

### 3.9 Instrumentation — one subscriber, no call-site changes

A single `registerObservabilityDispatcher(db, bus, adapter, deps)` binds
wildcard subscriptions on the `EventBus`. Handlers translate the
`DomainEvent` into `ObservabilityEvent` and call `dispatcher.enqueue`.
This is the **one subscribe-once** requirement.

Events we tap:
- `session_started`, `session_ended` → direct.
- `cost_cap_warning`, `cost_cap_breached` → `cost_incurred`.
- `task_state_changed` → direct.
- `bet_state_changed`, `bet_shipped` → `bet_state_changed`.
- `knowledge_updated` → `knowledge_write`.

Harness-level events (`tool_call`, `token_usage`) don't currently hit
the bus. We add a thin observer hook on
`ClaudeAgentSdkAdapter.streamEvents` so every yielded `tool_call`
enqueues directly. The hook is optional — the adapter is constructed
with an optional `onEvent(sessionId, event)` callback.

### 3.10 Wiring

`createApp` instantiates the dispatcher once the config resolves, reuses
the same `AppDisposer` pattern, and wires the ingress hook into
`ClaudeAgentSdkAdapter` when constructed.

## 4. Trade-offs

- **Trace id backfill.** We add `trace_id` nullable, not notnull. Old
  rows stay null; old sessions resurfaced after upgrade will generate a
  synthetic trace id at first event. Alternative (backfill UUIDs in the
  migration) trades deterministic schema for wasted identifiers on
  sessions that will never emit again.
- **Drop-oldest vs drop-newest.** Drop-oldest keeps the latest signal
  during a burst (usually what operators want). Drop-newest preserves
  original order. We pick drop-oldest and expose the counter — observers
  can compare `delivered + dropped` to infer pressure.
- **Flush failure never blocks enqueue.** Observability is disposable
  telemetry. If Langfuse is down, we log once and move on. The
  alternative (persist to a DB queue) is H4-scale concern; we keep the
  contract "non-blocking best-effort" for v1.
- **Langfuse mapping ambiguity.** Langfuse's data model is
  trace → span → observation. Our `session_ended` doesn't cleanly
  become a single verb. We pick `span-update` (the session root span
  ends) + a metadata `outcome` on the trace. ⚠️ UNVERIFIED for exact
  field names on `span-update` — we rely on the Ingestion API allowing
  partial updates via subsequent `span-create` with the same `id`. A
  stub wrapper isolates the mapping so it can be corrected cheaply when
  we observe the Langfuse UI.

## 5. Open questions

- **Langfuse OTLP.** Langfuse now recommends OpenTelemetry over the
  legacy Ingestion API. We use Ingestion in v1 because adding an OTLP
  dependency would violate "boring tech". Flag as follow-up for H4.
- **Token usage on `cost_incurred`.** We only include cost_cap events.
  Raw token usage from the harness is higher-volume and would need
  sampling; deferred.
- **PII on `args`.** Tool call args may contain secrets. We truncate to
  512 chars and strip obvious patterns (email, Bearer tokens) via the
  shared `scrubErrorMessage` helper.

## 6. Tests (TDD)

Red phase — written before any implementation:

- `packages/server/src/__tests__/observability/console-adapter.test.ts`
  — structured JSON, all 7 event kinds, flush is no-op.
- `packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts`
  — local HTTP fixture captures batched POST with correct headers/body.
  Proves Basic auth, batch shape, 5xx retriable, 4xx non-retriable.
- `packages/server/src/__tests__/observability/dispatcher.test.ts` —
  buffer cap + drop counter, interval flush, early flush on batch full,
  trace propagation across all 7 event kinds, subscribe-once + unsubscribe
  on dispose.
- `packages/server/src/__tests__/observability/trace-correlation.test.ts`
  — sessions insert with a `trace_id`; follow-up events keyed to that
  session carry the same id.
- `packages/server/src/__tests__/observability/performance.bench.test.ts`
  — 1000 enqueues in <100ms; asserts `dispatcher.status().bufferDepth`
  reaches 1000 within the budget. Uses `performance.now()`.
- `packages/server/src/__tests__/observability/routes.test.ts` —
  `GET /config` redacts keys, `PATCH /config` rejects SSRF + writes,
  `GET /status` + `POST /flush` + `POST /test`.
- `packages/shared/src/__tests__/observability-events.test.ts` — type
  exports + discriminant narrowing.
- `packages/shared/src/__tests__/ssrf.test.ts` — extracted module
  preserves all H2 cases.

Adversary checks covered:
- Keys redacted on GET + PATCH responses.
- `smtpIgnoreTls`-equivalent guard for Langfuse URL in production
  (reject `http://` except loopback; reject private/link-local).
- Non-blocking property asserted by timing.
- Dispatcher disposed on `disposeApp`.

## 7. Files to create

- `packages/shared/src/observability/events.ts` + test
- `packages/shared/src/observability/index.ts`
- `packages/shared/src/net/ssrf.ts` + test
- `packages/server/src/services/observability/types.ts`
- `packages/server/src/services/observability/config.ts`
- `packages/server/src/services/observability/console-adapter.ts`
- `packages/server/src/services/observability/langfuse-adapter.ts`
- `packages/server/src/services/observability/dispatcher.ts`
- `packages/server/src/routes/observability-routes.ts`
- `packages/server/src/__tests__/observability/*.test.ts` (6 files)
- `packages/db/drizzle/0004_observability_trace_id.sql`
- `packages/db/drizzle-pg/0002_observability_trace_id.sql`
- `docs/plans/H3-plan.md` (this file)

## 8. Files to modify

- `packages/db/src/schema.ts` — add `traceId` column on `sessions`.
- `packages/db/src/schema.pg.ts` — same.
- `packages/server/src/app.ts` — wire dispatcher + routes.
- `packages/server/src/services/session-lifecycle.ts` — write trace id
  on insert; thread through `SessionContext`.
- `packages/shared/src/index.ts` — export the new types.
- `packages/server/src/services/notifications/config.ts` — re-export
  extracted SSRF helpers from shared.
