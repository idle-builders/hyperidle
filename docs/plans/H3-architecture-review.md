# H3 — Architecture Review (read-only)

Reviewer: architect
Branch: `feat/H3-observability-adapter`
Scope: user-specified files (see task).

## Summary (<250 words)

H3 adds a buffered, non-blocking observability dispatcher (console + Langfuse)
wired to the in-process `EventBus`. The implementation respects the three-layer
architecture: the adapter lives in the Meta Layer (`packages/server`), is fed by
the bus rather than reaching into call sites, and the Human Interface only talks
to it via `/api/observability/*`. Event types, SSRF defenses, and the redact
regexes are correctly promoted into `packages/shared`, matching the pattern used
by H2. Sibling consistency with `registerNotificationDispatcher`,
`registerPolicyEngine`, and `registerGitExportHandler` is good: single
subscriber per event, explicit unsubscribe function, wiring in `createApp` with
a disposer bag. `sessions.trace_id` is added as a **nullable** column on both
drivers with a plain `ALTER TABLE ADD COLUMN` migration — safe for both SQLite
and Postgres and backward-compat for existing rows and test fixtures that do
not set `traceId`. The non-blocking contract on `enqueue` is honoured
(array push + O(1) cap check, no awaits, no DB I/O). Langfuse adapter URL
building, batching, Basic auth, and 207 multi-status handling look reasonable;
SSRF via `assertUrlNotSSRF` runs pre-fetch.

Three material issues: (1) the dispatcher built at `createApp` does **not**
rebuild when `PATCH /api/observability/config` changes `adapter`/keys, so
config edits are only honoured after a restart — diverges from H2's
`getCachedAdapter` pattern; (2) per-type subscription misses any future
`DomainEvent` kind (plan §3.9 said wildcard); (3) the performance test measures
only `enqueue`, not "logged".

---

## CRITICAL

### C1. PATCH /api/observability/config does not rebuild the live dispatcher
File: `packages/server/src/app.ts` lines 188–227, in comparison with
`packages/server/src/services/notifications/dispatcher.ts` lines 432–452
(`getCachedAdapter`).

The observability dispatcher + adapter are constructed **once** in `createApp`
from `readObservabilityConfig(db)`. `PATCH /api/observability/config` persists
the new values via `updateObservabilityConfig` and returns them, but nothing
notifies the live dispatcher. Consequences:

- Switching `adapter` from `console` → `langfuse` at runtime: `/status` reports
  the new adapter name (because the status route reads the persisted config
  directly, see `observability-routes.ts` line 119) but events continue to be
  delivered through the original console adapter.
- Rotating `langfuse_secret_key` / `langfuse_public_key`: the running Langfuse
  adapter keeps using the old Basic-auth header indefinitely.
- Toggling `enabled: false → true` at runtime: no dispatcher is ever attached;
  the bus subscriber is registered only inside the `if (obsCfg.enabled && …)`
  branch at `app.ts:193`.

H2's notifications dispatcher solved this with `getCachedAdapter` keyed on
a config hash (`dispatcher.ts:432`). H3 should either (a) rebuild the adapter
on every config read inside the dispatcher, or (b) expose a `rebuild(config)`
method the routes call after PATCH. Flag this as a spec-vs-behavior gap against
H3 AC6 ("Adapter configurable via factory_settings") — configurable at process
start, but not at runtime.

---

### C2. Bus subscription uses per-type handlers instead of the planned wildcard
File: `packages/server/src/services/observability/dispatcher.ts` lines 237–345.

H3-plan.md §3.9 (and ARCHITECTURE.md §2.6 "wildcard subscriber" convention)
states "We subscribe to the EventBus exactly once (wildcard)." The current
`registerObservabilityDispatcher` subscribes to **seven specific types** and
ignores the remainder of `DomainEvent` (`item_created`, `response_recorded`,
`routine_fired`, `dependency_met`, `bet_committed`, `bet_revised`,
`notification`). Concrete consequences:

- New domain events added to `packages/shared/src/events.ts` are silently
  dropped — exactly the failure mode the plan's wildcard choice was meant to
  prevent.
- The docstring at line 13 ("We subscribe to the EventBus exactly once
  (wildcard)") is now untrue; naming contract broken.

Options: (a) use `bus.on("*", handler)` + a switch on `event.type`, matching
`EventBus.on` wildcard overload at `packages/shared/src/event-bus.ts:19`, (b)
keep per-type but update the plan + the docstring. Option (a) matches
ARCHITECTURE.md §2.6 ("Event Bus … observability subscribes to the events it
cares about" is a soft constraint; plan §3.9 is explicit).

---

## WARNINGS

### W1. Performance test narrows AC5's "logged" to "enqueued"
File: `packages/server/src/__tests__/observability/performance.bench.test.ts`
lines 22–48. TRACK-H.md AC5: "1000 events logged in <100ms (non-blocking)."

The test only measures `dispatcher.enqueue()` (synchronous, array push) and
uses `batchSize: 10_000` + `flushIntervalMs: 60_000` so the background flush
never fires during measurement. It proves the hot-path contract but does not
prove "logged". For the console adapter (shared logger -> stdout), "logged"
should include the adapter's `record()` on the batched path. Recommend adding a
second assertion that end-to-end 1000 events reach a capturing adapter within a
looser budget (e.g. 500ms), or amending the plan to state AC5 is explicitly
about the enqueue path. Today's test is technically green but an operator
reading AC5 would expect delivery latency.

### W2. cost_incurred event — streamId is trusted as sessionId
File: `packages/server/src/services/observability/dispatcher.ts` lines 303–333.

The handler assumes `ev.streamId` is a session id and uses the resolver to
fetch `traceId`. This is correct today because `cost-cap.ts:218,241` sets
`streamId: params.sessionId`. The assumption is load-bearing and unenforced
(streamId is `string` in the event schema). If a future emitter sets
`streamId` to a team/agent id for factory-scoped cost events, the resolver
will miss and the fallback key `cost:${entityId}` will be used — functionally
OK, but the failure mode is silent. A type guard (e.g. a helper
`sessionIdFromCostEvent(ev)` returning null when not a session id) or a
runtime check (`ev.streamId === sessionId from persisted sessions`) would make
the dependency explicit.

### W3. Schema+migration safety: nullable trace_id column
Files: `packages/db/src/schema.ts:118`, `schema.pg.ts:113`,
`drizzle/0004_flashy_toad.sql`, `drizzle-pg/0002_bitter_gwen_stacy.sql`.

Correctly nullable on both drivers, `ALTER TABLE ... ADD COLUMN` is safe for
both SQLite (fast, no rewrite) and Postgres (metadata-only since no default).
No backfill: existing `sessions` rows get `NULL`, and the dispatcher's
resolver correctly returns `null` → fallback to `sessionId` as traceId at
`dispatcher.ts:240`. Existing callers in tests (`cost-cap.test.ts:97`,
`routine-scheduler.test.ts`, `status.test.ts`, `handoff-protocol.test.ts`,
`team-management.test.ts`) insert without `traceId` — this continues to work
because the column is nullable. **Recommend adding an assertion to the plan
that traceId is intentionally nullable for legacy rows**, and add an index
`CREATE INDEX sessions_trace_id_idx` if `/status` or future Langfuse lookups
ever filter by trace id (today they don't).

### W4. In-flight tracking in Langfuse adapter is single-slot
File: `packages/server/src/services/observability/langfuse-adapter.ts`
lines 241–261.

`inFlight` is overwritten on each `record()` call, so `flush()` only awaits
the most recent call. When `maybeFlushSoon` fires twice in quick succession
(burst bigger than `batchSize`), two `send()` invocations run concurrently and
`flush()` may return before the earlier batch settles. The dispatcher today
drains sequentially in a single `drain()` pass (`dispatcher.ts:121`) so this
is currently unreachable, but the adapter should be robust to concurrent
callers. Suggest tracking an array / Set of in-flight promises and awaiting
all of them in `flush()`. Low severity; note.

### W5. /api/observability/status reads config from DB on every poll
File: `packages/server/src/routes/observability-routes.ts` lines 109–130.

When `dispatcher` is null, `/status` runs `readObservabilityConfig(db)` which
`SELECT`s every `factory_settings` row with prefix `observability.`. Acceptable,
but diverges from the rest of the observability wiring (which reads the config
once at app boot). If the settings UI polls `/status` every few seconds, this
reads-and-maps are cheap but avoidable. Consider caching the config snapshot
on the dispatcher handle or passing a `readCfg: () => ObservabilityConfig`
thunk for consistency with `getDispatcher()`. Low severity.

---

## OBSERVATIONS

### O1. Langfuse adapter: UNVERIFIED nested body shape
File: `packages/server/src/services/observability/langfuse-adapter.ts`
lines 17–26 already flag this explicitly with `⚠️ UNVERIFIED`. The top-level
envelope (`{ batch: [{ id, type, timestamp, body }] }`) matches the public
Ingestion API at `https://api.reference.langfuse.com/` and the cited
OpenAPI spec; the per-type `body` field names (`traceId`, `type: "SPAN"|"EVENT"`,
`userId`, `metadata`) are plausible but not verified against a live Langfuse
instance in this review. The isolation behind `ObservabilityAdapter` keeps
this fixable without touching the rest of H3.

### O2. registerObservabilityDispatcher + dispose semantics match siblings
Sibling pattern check:
- `registerPolicyEngine` (`services/policy-engine.ts:18`): `(db, bus, opts?) => () => void` — returns unsubscribe. Match.
- `registerNotificationDispatcher` (`services/notifications/dispatcher.ts:459`): `(db, bus, deps) => () => void` — match.
- `registerGitExportHandler` (`services/git-export.ts`): same.
- `registerObservabilityDispatcher` (`services/observability/dispatcher.ts:222`): `(bus, deps) => () => void` — match, with the note that the observability variant also takes a TraceIdResolver instead of a db. Acceptable — the db is only needed to resolve traceId, which is now injected.

`createApp` pushes the returned disposer (wrapped with `dispatcher.dispose`) into
`APP_DISPOSERS`, consistent with H1/H2. Sibling consistency: OK.

### O3. session-lifecycle change is backward-compatible
File: `packages/server/src/services/session-lifecycle.ts` lines 87–106.

`createSession` now mints `traceId = crypto.randomUUID()` and passes it into
the `sessions` insert at line 104. Callers either use this API (which always
sets traceId) or insert `sessions` rows directly in tests without `traceId`
(column is nullable). `SessionContext` gains a `traceId` field (line 34);
`endSession` / `crashSession` signatures do not change. The resolver is not
pre-seeded from `createSession` (the docstring at `dispatcher.ts:239` says it
is — **in fact the seed call is missing**). This is harmless because the
resolver falls through to the DB on first call after session_started emit, but
the comment and the resolver's `seed()` member imply a pre-seed step that
isn't wired. Low-severity naming/docs drift; either wire the seed
(`resolver.seed(sessionId, traceId)` after the insert) or remove the
misleading comment.

### O4. Route surface consistent with siblings
`/api/observability/config` (GET/PATCH), `/api/observability/status` (GET),
`/api/observability/flush` (POST) map cleanly to the H2 notifications routes
(`/api/notifications/config|status|flush|test`) and H1 git-export routes
(`/api/git-export/config|run|status`). Validation via `validateBody(zod)`,
`auditDiff` for secret masking in audit logs, and `ApiErrorResponse` shape are
all consistent. One gap: notifications exposes `POST /test` for a dry-run
send; observability does not have an equivalent "probe" that exercises the
Langfuse adapter end-to-end. Not required by AC, but a `POST /probe` returning
the ingestion endpoint reachability would help operators verify keys before
committing them.

### O5. Shared SSRF and redact modules are correctly co-owned
Files: `packages/shared/src/net/ssrf.ts`, `packages/shared/src/redact.ts`.

Promoting the SSRF logic out of `notifications/config.ts` is the right call —
the comment at `ssrf.ts:1–19` attributes origin and enumerates callers. The
shared module is pure (no server-only deps), and the `assertUrlNotSSRF`
entry point matches the ntfy runtime gate one-for-one.
`notifications/config.ts:462` still defines a local `assertNtfyUrlNotSSRF`
duplicating the shared function — not a defect in H3, but worth recording
that H4/future work should collapse this duplication. Noted for retro.

### O6. Event type coverage vs ARCHITECTURE.md §2.6 list
ARCHITECTURE.md §2.6 enumerates these bus events: `task_state_changed`,
`item_created`, `response_recorded`, `session_started`, `session_ended`,
`routine_fired`, `cost_ceiling_breached` (renamed to `cost_cap_breached` /
`cost_cap_warning` in `events.ts`), `bet_committed`, `bet_shipped`,
`bet_revised`. Current `registerObservabilityDispatcher` covers 7 of these.
Missing: `item_created`, `response_recorded`, `routine_fired`,
`dependency_met`, `bet_committed`, `bet_revised`, `notification`. Per TRACK-H
AC4 ("session start/end, tool calls, cost, state transitions, knowledge
writes"), the current set satisfies the story, but wildcard (C2) would
future-proof it.

### O7. tool_call events are defined but no emitter exists in this branch
`ObservabilityEvent.tool_call` is defined, serialised, and unit-tested, but
nothing in `registerObservabilityDispatcher` produces one (tool calls come from
the Harness, not the EventBus). `summarizeToolArgs` is exported from the
dispatcher module. This is fine if D-track (Agent Runtime) will call
`dispatcher.enqueue()` directly at tool-call sites, but there is no call-site
in the current branch. Recommend adding a forward reference in H3-plan (or a
TODO `@lore`) so the next agent knows the wiring is deliberate future work.

---

## Files referenced
- `/workspace/.worktrees/H3/packages/server/src/app.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/config.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/console-adapter.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/types.ts`
- `/workspace/.worktrees/H3/packages/server/src/routes/observability-routes.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/session-lifecycle.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/notifications/dispatcher.ts`
- `/workspace/.worktrees/H3/packages/server/src/services/policy-engine.ts`
- `/workspace/.worktrees/H3/packages/shared/src/observability/events.ts`
- `/workspace/.worktrees/H3/packages/shared/src/net/ssrf.ts`
- `/workspace/.worktrees/H3/packages/shared/src/redact.ts`
- `/workspace/.worktrees/H3/packages/shared/src/event-bus.ts`
- `/workspace/.worktrees/H3/packages/shared/src/events.ts`
- `/workspace/.worktrees/H3/packages/db/src/schema.ts`
- `/workspace/.worktrees/H3/packages/db/src/schema.pg.ts`
- `/workspace/.worktrees/H3/packages/db/drizzle/0004_flashy_toad.sql`
- `/workspace/.worktrees/H3/packages/db/drizzle-pg/0002_bitter_gwen_stacy.sql`
- `/workspace/.worktrees/H3/packages/server/src/__tests__/observability/performance.bench.test.ts`
- `/workspace/.worktrees/H3/packages/server/src/__tests__/observability/routes.test.ts`
- `/workspace/.worktrees/H3/packages/server/src/__tests__/observability/dispatcher.test.ts`
- `/workspace/.worktrees/H3/packages/server/src/__tests__/observability/trace-correlation.test.ts`
- `/workspace/.worktrees/H3/packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts`
