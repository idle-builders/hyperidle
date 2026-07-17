# observability — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** none · **Current public exports:** 23
**Verdict:** STANDALONE (keep the boundary) — but collapse 23 → ~7. Most of the surface is internal dispatcher machinery leaking out.

---

## 1. Existence / Consolidation Verdict — STANDALONE (infra platform)

observability is a genuine platform product: **the single EventBus → structured-sink pathway**, plus a config/status control surface for the operator. It subscribes to the bus exactly once (wildcard), translates `DomainEvent → ObservabilityEvent`, buffers them in an O(1) ring, and drains on a background timer to a pluggable adapter (console/noop today, OTEL later). It owns zero tables; its one downward edge (`settings`, `server_config.observability`) is a DI port.

**Who is the customer?** Not end users, not a sibling domain service. Its customers are:
- **The composition root** (`packages/core-api/src/app.ts` + `routes/observability-routes.ts`) — the operator surface that starts it, mounts `/config`/`/status`/`/flush`, and rewires it on config change.
- **Every event-emitting service, passively, through the bus** — a decoupled platform relationship: they emit; observability subscribes. They do not import it.

`isInfraPlatform: true`.

**Candidate cluster: none** (frame gave `[]`). Correct. It does not belong to `durable-agent-queue`, `session-runtime`, or `harness-execution-platform` — it shares no flow with them; it is orthogonal, bus-coupled, and stateless-but-for-config. It is exactly the "cross-cutting sink" that would otherwise degenerate into a grab-bag module. Boundary earns its keep.

**Challenge to AU19's claim.** AU19 justified the boundary ("avoid recreating the old grab-bag, orthogonal to any domain") — that part holds. But AU19 stops there and ships **23 exports**. The real smell is not the boundary; it is that the service **exposes its internal machinery as public API**: the dispatcher factory, the trace-id resolver, the console-adapter factory, two DI-port types that structurally duplicate the config types, an identity-alias `SafeObservabilityConfig`, and a no-op `redactObservabilityConfig`. The platform value is *one runtime + a config control surface*; it publishes *a kit of parts* the composition root hand-assembles.

**Demand signal (the data package, confirmed against source).**
- Data package lists **1 cross-service consumer**: `session-lifecycle` requesting exactly **1 method — `summarizeToolArgs`**.
- Everything else is consumed only by the **composition root** (`app.ts` wires the dispatcher; `observability-routes.ts` reads/updates config + introspects the dispatcher). That is start-up glue mounting the service, not downstream service demand.
- `summarizeToolArgs` touches **no observability state** — it is `scrubInlineTokens(JSON.stringify(args))` truncated to 512 chars. `scrubInlineTokens` already lives in `@hyperidle/shared`. **Relocate `summarizeToolArgs` to `@hyperidle/shared`** beside it. That removes observability's *only* cross-service export and makes it a pure platform runtime with a single operator (the composition root).

---

## 2. Deliberate Target Public API (23 → 7)

The whole point: the composition root should call **one factory** and get back **one lifecycle handle**, plus a thin config read/write pair for the routes. Adapter choice, trace resolution, bus subscription, and buffering are INSIDE.

**Target interfaces:**

1. **`startObservability(deps: ObservabilityDeps): ObservabilityRuntime`** — the single composition entry point.
   - Reads config (via the injected settings port), selects the adapter from the `adapter` enum (`console`/`noop`), builds the resolver, constructs the ring dispatcher, subscribes to the bus. Returns the handle.
   - Subsumes: `createConsoleObservabilityAdapter`, `createDbTraceIdResolver`, `createObservabilityDispatcher`, `registerObservabilityDispatcher`, `DispatcherDeps`, `RegisterObservabilityDispatcherDeps`, `TraceIdResolver`, `ObservabilityAdapter`, `ObservabilityChannel`.

2. **`ObservabilityRuntime`** (type) — the operator handle: `status(): ObservabilityStatus`, `flush(): Promise<FlushOutcome>`, `reconfigure(cfg): void`, `dispose(): Promise<void>`.
   - Subsumes: `ObservabilityDispatcher`, `ObservabilityDispatcherStatus` (→ nested `ObservabilityStatus`), `FlushOutcome` (nested method-return). `app.ts`'s `buildObservabilityAdapter` + `buildDispatcher` + `wireObservability` + resolver + unsubscribe bookkeeping (~50 lines) collapse into `start` + `reconfigure`.

3. **`readObservabilityConfig(db, deps)` / `updateObservabilityConfig(db, patch, deps)`** — the config control surface the routes need.
   - Subsumes: `redactObservabilityConfig` (a `{...cfg}` no-op — inline at the route or fold into read) and `SafeObservabilityConfig` (identity alias of `ObservabilityConfig` — delete). The `@lore` "keep for a future OTEL bearer-token redaction" is exactly the keep-just-in-case the MVP tier forbids; re-introduce it *when* OTEL lands.

4. **`ObservabilityConfig`** (type) — the config value.

5. **`ObservabilityConfigPatch`** (type) — the update input.

6. **`ObservabilityStatus`** (type) — the `/status` response shape the route serializes.

7. **`ObservabilityDeps`** (type) — the single injected DI shape (`{ serverConfig: <settings read/update port>; adapter?: <test seam> }`).
   - Subsumes: `ObservabilityConfigDeps`, `ObservabilityServerConfigPort`, and the two structural-duplicate types `ObservabilityConfigSection` / `ObservabilityConfigSectionPatch` (they clone `ObservabilityConfig`/`Patch` field-for-field — pure duplication).

**Relocated (not counted):** `summarizeToolArgs` → `@hyperidle/shared`.

**Target export count: 7** (from 23). `FlushOutcome` folds into `ObservabilityRuntime.flush`'s return; if the route prefers a named type, 8. Either way sub-third of today.

---

## 3. Inside Lens — how it stays clean/evolvable

All the mechanism stays, now **private behind the runtime handle**:
- **Bus translator** — single wildcard subscription + one exhaustive `switch(event.type)`. New observable event kind = **one `case`** (already the design; the exhaustive `never` default forces the author to decide translate-vs-drop). No export moves.
- **Adapter interface** — `console`/`noop` internal; a future OTEL adapter is a new internal module selected by the `adapter` config enum. Not a new export.
- **Ring dispatcher** — the O(1) fixed-array buffer is an implementation detail; only `status()`/`flush()` shapes are contract.
- **The one seam that stays injected** is the `settings` config port (`ObservabilityDeps`) — the correct place for the boundary, and the only DI edge.

Evolvability is *higher* after the collapse: the surface is a lifecycle handle, not a parts kit, so internal refactors (buffer strategy, resolver caching, adapter set) never ripple to consumers.

---

## 4. Scaling Argument — sub-linear

Apply the test: *dozens more services, hundreds more events — how many new methods?*

- **New service starts emitting `foo_happened`** → it just publishes to the bus; observability adds **one `case`** in the internal translator. **Zero new exports.** The bus is the general interface; the switch is parameterized by `event.type`.
- **New adapter (OTEL, file, HTTP)** → one internal module + one value in the `adapter` enum. Config-parameterized selection (`adapter: "otel"`) absorbs it. **Zero new exports.** Contrast today: `createConsoleObservabilityAdapter` is a *public factory* — the method-per-adapter trap; a second adapter tempts `createOtelObservabilityAdapter`, and the surface grows per adapter. The enum-selected runtime scales flat.
- **New operator view wants live counters** → it calls `runtime.status()` — an existing method returning a general snapshot. No `listDroppedByAdapter` / `getDeliveredSince` sprawl.

The parameterized shape (`start(deps)` + `status()`/`flush()` + `adapter` enum + `event.type` switch) absorbs new use-cases without new methods. The current shape (a factory per building block, an adapter factory per sink) would grow a method per adapter and per composition variant. Target passes; current fails.

---

## 5. Key Collapses

1. **6 composition primitives → 1 factory + 1 handle.** `createConsoleObservabilityAdapter` + `createDbTraceIdResolver` + `createObservabilityDispatcher` + `registerObservabilityDispatcher` + `DispatcherDeps` + `RegisterObservabilityDispatcherDeps` + `TraceIdResolver` collapse into `startObservability(deps) → ObservabilityRuntime`. `app.ts`'s ~50-line hand-assembly becomes one call + a `reconfigure` on config change.
2. **Duplicate config type families → one.** `ObservabilityConfigSection`/`ObservabilityConfigSectionPatch` (structural clones of `ObservabilityConfig`/`Patch`) + `SafeObservabilityConfig` (identity alias) + `redactObservabilityConfig` (no-op `{...cfg}`) all delete/fold. One `ObservabilityConfig` + one `ObservabilityConfigPatch`.
3. **`summarizeToolArgs` relocated to `@hyperidle/shared`.** Removes the service's only cross-service export; it is a stateless secret-scrub utility sitting next to `scrubInlineTokens`, which it already calls. observability becomes a pure platform runtime with a single operator.
4. **Adapter/dispatcher internals go private.** `ObservabilityAdapter`, `ObservabilityChannel`, `ObservabilityDispatcher`, `ObservabilityDispatcherStatus` stop being public contracts and become implementation behind the handle (only `ObservabilityStatus`/`FlushOutcome` return-shapes surface).
