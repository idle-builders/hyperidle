# H3 Simplification Scan

Read-only scan of H3 observability code for over-abstraction, dead code, and unused exports. No behavior changes proposed.

## Summary (< 200 words)

H3 is largely lean, but there are a handful of real dead / redundant exports worth trimming. The standout items are: (1) `_testToIngestionEvents` is exported but never imported anywhere; it should be inlined into the test that needs it or removed. (2) The `ObservabilityAdapter.close?` hook in `types.ts` is declared and the dispatcher dutifully calls it on dispose, but no shipped adapter (`console`, `langfuse`) implements it — YAGNI, drop the hook and the branch. (3) `shared/src/index.ts` re-exports seven per-variant observability interfaces + `ObservabilityEventKind` / `ObservabilityEventBase` / `CostLevel` / `CostCapLevel` that have zero external consumers — only the `ObservabilityEvent` union and `SessionOutcome` are used. (4) `readObservabilityConfig` + `loadObservabilityConfig` are two API entry points around the same call with a trivial null-when-disabled wrapper that could fold into the caller. (5) `SanitizeResult` is defined three times across the tree (notifications/config, observability/config, shared/net/ssrf). Other flagged items are smaller: `ConsoleObservabilityAdapterOptions`, the `PATCH_SANITIZERS` table for three static rows, and the empty `flushBodySchema`.

## Findings

### 1. `_testToIngestionEvents` export is unreferenced
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:262`

```ts
export { toIngestionEvents as _testToIngestionEvents };
```

No other file imports this alias (`grep` across the repo returns only the declaration line). Either the integration test was supposed to use it and ended up going via the public `record()` path, or the aliased export was speculative. Either way: delete the line, or inline-call `toIngestionEvents` from the test file and drop the export.

### 2. `ObservabilityAdapter.close?` hook is dead
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/types.ts:18`
**Consumer site:** `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts:199`

Neither `createConsoleObservabilityAdapter` nor `createLangfuseObservabilityAdapter` implements `close`. The dispatcher's `dispose()` calls `if (deps.adapter.close) deps.adapter.close();` — guard that will never fire in production. This mirrors the notifications adapter shape but observability has no pooled-connection adapter today. Remove the hook and the conditional until an adapter that needs it arrives.

### 3. Named event-variant interfaces + helper types are exported but unused
**File:** `/workspace/.worktrees/H3/packages/shared/src/observability/events.ts`
**Export site:** `/workspace/.worktrees/H3/packages/shared/src/index.ts:86-97`

The following are re-exported from the shared barrel and have **no consumers** outside `events.ts` itself:
- `ObservabilityEventKind` (line 13)
- `ObservabilityEventBase` (line 22)
- `SessionStartedObservabilityEvent` ... `KnowledgeWriteObservabilityEvent` (lines 32–85, seven named variants)
- `CostLevel` (line 55), `CostCapLevel` (line 56)
- `SessionOutcome` re-exported as `ObservabilitySessionOutcome` at `shared/src/index.ts:94` (the name collides with `SessionOutcome` already exported at line 39 from `events.ts`, which is the one callers actually use).

Only `ObservabilityEvent` (the union) and `SessionOutcome` are consumed. Either drop the named exports from `index.ts` (keep them file-local for the discriminated union to work) or remove the duplicate `SessionOutcome` declaration in `observability/events.ts:38` and import from `events.ts` instead.

### 4. `readObservabilityConfig` + `loadObservabilityConfig` are two doors to the same room
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/config.ts:106-115`

```ts
export function readObservabilityConfig(db) { return buildConfig(readAllSettings(db)); }
export function loadObservabilityConfig(db) {
  const cfg = buildConfig(readAllSettings(db));
  if (!cfg.enabled) return null;
  return cfg;
}
```

The "returns null when disabled" path is used once (in `app.ts:189`). Inline the one-line null check at the call site and keep a single public reader. This also eliminates the per-function doc-comment that exists to explain why there are two.

### 5. `SanitizeResult` is re-declared three times
**Files:**
- `/workspace/.worktrees/H3/packages/shared/src/net/ssrf.ts:25`
- `/workspace/.worktrees/H3/packages/server/src/services/observability/config.ts:190`
- `/workspace/.worktrees/H3/packages/server/src/services/notifications/config.ts:334`

Same shape, same semantics. The shared module already exports it; the two server-side declarations should `import type { SanitizeResult } from "@hyperidle/shared"`. (H2 simplification-scan already deferred the notifications one, but the observability copy is new and easy to fix now.)

### 6. `ConsoleObservabilityAdapterOptions` is a single-field options bag
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/console-adapter.ts:4-6`

```ts
export interface ConsoleObservabilityAdapterOptions { readonly logger?: Logger; }
export function createConsoleObservabilityAdapter(opts: ConsoleObservabilityAdapterOptions = {}) { ... }
```

One optional field, no production override (`app.ts:75,78` calls `createConsoleObservabilityAdapter()` with no args). Replace with a single optional parameter `logger?: Logger`. The exported options interface adds type surface without benefit.

### 7. `PATCH_SANITIZERS` table for three static entries
**File:** `/workspace/.worktrees/H3/packages/server/src/routes/observability-routes.ts:34-54`

A `ReadonlyArray<{ field, sanitize }>` with three entries + a `for…of` walker. Three explicit `if (body.langfuseUrl !== undefined) { ... }` blocks would be shorter, more greppable, and remove the `SanitizeFn` type alias. This is the same pattern the notifications route uses — duplication is a process choice, not a requirement. Not critical; flag for discussion.

### 8. `flushBodySchema = z.object({}).strict()` gate for an empty body
**File:** `/workspace/.worktrees/H3/packages/server/src/routes/observability-routes.ts:32`

The schema exists solely so `validateBody(flushBodySchema)` rejects non-empty bodies. POST `/flush` takes no arguments. Unless there's a plan to add fields, drop the middleware and accept any body (or use `c.req.raw` directly). Minor.

### 9. `envelopeId` called twice per body in Langfuse adapter
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:125-170`

`tool_call`, `task_state_changed`, `bet_state_changed`, `knowledge_write` all compute `envelopeId(ev.traceId, ts, ev.kind, idx)` twice — once for the envelope `id` and once for the body `id`. Hoist into a `const id = envelopeId(...)` local. Micro, but the doc comment on `envelopeId` (line 80) says "low collision risk" — computing the same value twice makes it look like two ids when it's one.

### 10. `toIngestionEvents` always produces exactly one envelope per event — the `forEach` accumulator is over-general
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:86-176`

Every `case` pushes exactly one envelope. `events.map((ev, idx) => { switch … return envelope })` is the natural shape; the `out` accumulator + `forEach` leaves room for "zero or many envelopes per event" that isn't used. Switching to `map` also lets the function return a tuple-typed array without the mutable intermediate. Minor.

### 11. `ObservabilityChannel` includes "noop" but `buildObservabilityAdapter` returns `null` for it
**File:** `/workspace/.worktrees/H3/packages/server/src/app.ts:87-89`; type at `/workspace/.worktrees/H3/packages/server/src/services/observability/types.ts:4`

The `"noop"` enum value exists purely to let the operator disable observability from the config UI without flipping `enabled=false`. Downstream (`app.ts`) this collapses to `adapter = null`, which is identical to `enabled=false` from the dispatcher's perspective. Either drop `"noop"` and let `enabled` be the single switch, or supply an actual no-op adapter that records `delivered` correctly so `/status` is honest. Today a user selecting `adapter=noop, enabled=true` gets the "disabled" branch in `GET /status` (`observability-routes.ts:119-130`) — the UI will claim it's disabled. Borderline between simplification and a bug.

### 12. `scrubInline` and `scrubLangfuseError` overlap on `sk-`/`pk-`
**Files:**
- `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts:376-382` (`scrubInline`)
- `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:44-47` (`scrubLangfuseError` → `scrubErrorMessage`)
- `/workspace/.worktrees/H3/packages/server/src/services/notifications/redact.ts` (authoritative `scrubErrorMessage`)

Three places scrub bearer / `sk-` / `pk-` tokens with slightly different regexes. The dispatcher's inline scrubber is specifically for tool-arg summaries; the Langfuse and notifications versions are for error bodies. If the token regexes diverge further, one of them will miss a leaked secret. Consolidate on `scrubErrorMessage` (or a shared `redact.ts` module) and have `summarizeToolArgs` call into it. Worth discussing.

### 13. `DispatcherDeps.setInterval` / `clearInterval` overrides
**File:** `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts:53-55`

Injected solely for tests. The tests I sampled (`dispatcher.test.ts`) don't appear to use them; they rely on explicit `dispatcher.flush()`. Verify by search — if unused, drop the options to shrink the `DispatcherDeps` surface. (The `now` override IS used.)

## Items NOT flagged (for completeness)

- `shared/src/net/ssrf.ts` — extraction from H2 `notifications/config.ts` is correct and the new helpers have dedicated tests. The old `notifications/config.ts` still duplicates `isPrivateIPv4`/`isPrivateIPv6`/etc. — out of scope for H3 simplification, but a follow-up to delete the duplicates lives there.
- `schema.ts:118` `traceId` column — minimal, nullable, documented with `@lore`. Nothing to simplify.
- Dispatcher's ring-buffer (`Array.push` + `shift` while over cap) — simple enough; doc-comment explains why not a linked list. Keep.
- `maybeFlushSoon` + `queueMicrotask` dance — documented rationale, single purpose, appropriate.
