# observability — Service-as-Product Re-Architecture (AU20, both lenses)

**Layer:** core-api · **Owned tables:** none · **Consumers (cross-service):** none
**Now:** 7 methods / 13 types (barrel exports 6 public types). **Target:** 7 methods / 6 types.
**Verdict:** already at floor. The Ab3 collapse (parts-kit → lifecycle handle) landed the inside-out shape; this design confirms it against the substrate floor and proves outside-in completeness. Nothing to delete beyond what Ab3 already deleted.

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

**Substrate: EXTERNAL-API (adapter).** observability owns zero tables and no domain algorithm. It is a bridge that ADAPTS two external capabilities into one pathway:
- the **EventBus** (`@hyperidle/shared`) — a wildcard subscription it drives (subscribe / unsubscribe / receive).
- a **pluggable telemetry sink** — `console`/`noop` today, OTEL/HTTP/file later. The sink is the "backend" of the adapter; it is selected by config, not by a method-per-backend.

The service is therefore an **adapter over a sink, fed by the bus**, with a thin config control surface backed by the injected `settings` port. It is NOT internal-logic (the buffering ring is an implementation detail, not the product) and NOT owned-tables.

**The unified adapter floor (a handful of ops, NOT one per sink):**
One `ObservabilityRuntime` handle, minted by one factory, driving the bus→sink pathway:

| Floor op | Role (unified across every sink) |
|---|---|
| `startObservability(deps)` | mint the runtime: read config, select sink from the `adapter` enum, subscribe to the bus, build the ring buffer |
| `runtime.status()` | operator snapshot (buffer depth, delivered, dropped, last error) |
| `runtime.flush()` | force-drain the buffer to the sink; partial-drain report |
| `runtime.reconfigure(cfg)` | hot-rewire: tear down + rebuild the pathway on config change, no restart |
| `runtime.dispose()` | graceful stop: unsubscribe + drain + stop timer |

That is **5 ops** — one coherent adapter surface. A second sink (OTEL) is a new internal module + one value in the `adapter` enum; it adds **zero** ops. This is the whole point of "unified, not one-per-backend": the enum-selected runtime scales flat where a `createOtelObservabilityAdapter` public factory would have grown a method per sink.

**Genuine owned capability beyond the adapter floor:** the **config control surface**. observability owns the *shape and semantics* of its config (`ObservabilityConfig`: enabled / adapter / batchSize / flushIntervalMs / bufferCap, default-on-unless-explicitly-false). The routes need to read and patch it:
- `readObservabilityConfig(db, deps)`
- `updateObservabilityConfig(db, patch, deps)`

These are 2 genuine ops (not adapter lifecycle) — they own the config contract and validation, delegating persistence to the injected settings port. `update` also drives `reconfigure` at the composition root so a PATCH takes effect live.

**Internal — zero API:** bus→ObservabilityEvent translation (single exhaustive `switch(event.type)`; a new observable event = one `case`, zero exports), the O(1) ring buffer, the trace-id resolver, the console adapter, and the sink `ObservabilityAdapter` interface. All private behind the handle.

Floor (unified adapter) = **5**. + 2 genuine config-ownership ops = **7**.

---

## 2. OUTSIDE-IN — the real demand

**Cross-service consumers: none** (confirmed — data package `consumers: []`; the former lone `summarizeToolArgs` demand was relocated to `@hyperidle/shared` in Ab3). Every event-emitting service relates to observability *passively through the bus* — they emit, it subscribes. That coupling needs **zero methods**: the bus IS the general interface.

**The one real operator/customer is the composition root + its 4 routes:**
- `POST` start at boot → `startObservability(deps)`
- `GET /api/observability/config` → `readObservabilityConfig`
- `PATCH /api/observability/config` → `updateObservabilityConfig` (+ `reconfigure`)
- `GET /api/observability/status` → `runtime.status()`
- `POST /api/observability/flush` → `runtime.flush()`
- shutdown → `runtime.dispose()`

Demand maps 1:1 onto the 7 ops. No consumer asks for anything outside them.

---

## 3. THE COHERENT PRODUCT API (both lenses fused)

Two shapes: **one lifecycle handle** (the adapter) + **one config pair** (the owned contract).

| # | Interface | Lens | Comes from |
|---|---|---|---|
| 1 | `startObservability(deps: ObservabilityDeps): Promise<ObservabilityRuntime>` | both | adapter floor — the single composition entry; boot demand |
| 2 | `ObservabilityRuntime.status(): ObservabilityStatus` | both | adapter floor — `GET /status` demand |
| 3 | `ObservabilityRuntime.flush(): Promise<FlushOutcome>` | both | adapter floor — `POST /flush` demand |
| 4 | `ObservabilityRuntime.reconfigure(cfg: ObservabilityConfig): void` | inside-out | adapter floor — hot-rewire capability; consumed by `update` at root |
| 5 | `ObservabilityRuntime.dispose(): Promise<void>` | inside-out | adapter floor — shutdown lifecycle |
| 6 | `readObservabilityConfig(db, deps): Promise<ObservabilityConfig>` | both | owned config contract — `GET /config` demand |
| 7 | `updateObservabilityConfig(db, patch, deps): Promise<ObservabilityConfig>` | both | owned config contract — `PATCH /config` demand |

**Types the coherent API needs (6):** `ObservabilityConfig`, `ObservabilityConfigPatch`, `ObservabilityDeps` (single DI bundle: db + eventBus + serverConfig port + optional test-seam adapter), `ObservabilityRuntime`, `ObservabilityStatus`, `FlushOutcome`. No per-caller mirror types.

**Parameterization keeps it general, not per-use-case:**
- new observable event kind → one internal `case`, zero API change.
- new sink (OTEL/HTTP/file) → internal module + `adapter` enum value; `start`/`reconfigure` absorb it, zero API change.
- new operator counter → widen the `ObservabilityStatus` snapshot, no new `getX` method.

---

## 4. TARGET NUMBERS + what is deleted

- **floor (unified adapter op-count):** 5
- **targetMethods:** 7 = floor 5 + 2 genuine config-ownership ops (both justified: they own the config contract, not adapter lifecycle).
- **targetTypes:** 6 (the six the API genuinely needs; internal `ObservabilityAdapter` / `ObservabilityChannel` / `ObservabilityDispatcher` / `ObservabilityDispatcherStatus` / `ConfigPort` / `ObservabilityServerConfigPort` stay private).
- **currentMethods 7 → 7, currentTypes 13 → 6** (public). The 7 methods are already exactly the floor; no method is above justification, so none is cut.

**DELETED (already executed by Ab3 — this design ratifies, not re-does):**
- 6 composition primitives DELETED from the public surface (`createConsoleObservabilityAdapter`, `createDbTraceIdResolver`, `createObservabilityDispatcher`, `registerObservabilityDispatcher`, `DispatcherDeps`, `RegisterObservabilityDispatcherDeps`, `TraceIdResolver`) — folded into `startObservability`.
- duplicate config type families DELETED (`ObservabilityConfigSection`, `ObservabilityConfigSectionPatch`, `SafeObservabilityConfig`, `redactObservabilityConfig` no-op, `ObservabilityConfigDeps`, `ObservabilityServerConfigPort` as public) — one `ObservabilityConfig` + one `Patch`.
- adapter/dispatcher internals DELETED from the surface (`ObservabilityAdapter`, `ObservabilityChannel`, `ObservabilityDispatcher`, `ObservabilityDispatcherStatus`) — private behind the handle.
- `summarizeToolArgs` RELOCATED to `@hyperidle/shared` (removes the only cross-service export).

The remaining 13→6 type gap is purely making the already-internal types formally non-exported; no public capability is removed.

---

## 5. Completeness proof — every real feature still deliverable

| Real feature | Delivered by |
|---|---|
| Structured telemetry of every domain event | bus wildcard subscription inside `startObservability` (zero API) |
| Enable/disable observability at runtime | `updateObservabilityConfig({enabled})` → `reconfigure` |
| Switch sink (console → OTEL later) | `updateObservabilityConfig({adapter})` → `reconfigure`; new sink is internal |
| Operator status dashboard | `runtime.status()` |
| Force flush before shutdown / on demand | `runtime.flush()` |
| Tune batching/buffer | `updateObservabilityConfig({batchSize,flushIntervalMs,bufferCap})` |
| Read current config for the settings UI | `readObservabilityConfig` |
| Graceful shutdown | `runtime.dispose()` |
| Test injection of a fake sink | `ObservabilityDeps.adapter` seam |

No real feature is lost; every one routes through a general, parameterized op. Lean (at floor) AND complete.

**Confidence: high** — 0 tables, 0 cross-service consumers, fully-read source; the shipped code already embodies the target shape.
