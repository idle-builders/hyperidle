# harness-protocol — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — 4 of its 6 modules have exactly one real owner; only `harness-adapter.ts` + `harness-events.ts` + `return-actions.ts` earn shared status.**

The package poses as one protocol. Measured, it is six modules with different consumer sets:

1. **`harness-capability-read-model.ts`** — every namer is core-api (`app.ts` + 8 routes). **DISSOLVE → core-api.** The 6 exported functions are one-line forwarders over an injected reader and die outright.
2. **`harness-event-normalization.ts`** — every caller is harness-registry (`cli-harness-adapter.ts`, `adapter-pool.ts`). This is claude/codex/opencode stdout-dialect parsing — adapter *implementation*, not protocol. **DISSOLVE → harness-registry.** `isHarnessEvent` is fully dead.
3. **`enforcement-registry.ts`** — its own doc says it lives here because `mcp-provider` was a sibling Service of `harness-registry`. `mcp-provider` no longer exists — the MCP route lives at `layers/agent-execution/harness-registry/src/mcp/`. Every consumer (`return-enforcement.ts`, `return-status-tool.ts`, `mcp/*`, `agent-execution/src/boot.ts`) is agent-execution. The stated reason for framework placement evaporated. **DISSOLVE → harness-registry.**
4. **`worker-protocol.ts`** — every importer is agent-execution (`remote-worker-client.ts`, `remote-harness-adapter.ts`, `harness-adapter-factory.ts`) plus `agent-orchestration/src/boot.ts` (composition root, which already depends on `@hyperidle/agent-execution`). The server-side parser — `worker-ingress.ts` — **never imports these types at all**: it re-declares the whole wire union as a hand-rolled Zod schema (`WorkerToServerMessageSchema`, worker-ingress.ts:83). The "shared wire protocol" is not shared with the one file that parses the wire. **DISSOLVE → harness-registry.**
5. **`harness-port.ts`** — its doc claims "the one genuine cross-process seam both Services depend on." Measured: only `run-orchestration` names `HarnessPort` (contracts.ts + runtime.ts + composition comment). The implementation (`session-lifecycle-bindings.ts`) satisfies it structurally without importing it. One consumer = not a seam, it's indirection. **DISSOLVE → run-orchestration/contracts.ts.**
6. **`harness-adapter.ts` + `harness-events.ts` + `return-actions.ts`** — genuinely two-sided: harness-registry (agent-execution) implements, `provisioner.ts`/`session-run-registry.ts`/`worker-ingress.ts` (agent-orchestration) drive, core-api reads `HarnessCapabilities`. Machine-enforced boundaries forbid these importing each other. **STAYS SHARED** — this residue (~1 adapter-contract file + return-actions) is the honest `harness-protocol`.

**Are harness-protocol / harness-capability / tool-protocol one thing? No — but the boundary leaks.** `harness-capability` is the UI-visible vocabulary (core-ui imports it in 7 files; core-ui must never see `SessionConfig`) — the AU34 audience split is real, keep it. `tool-protocol` imports exactly one symbol from here (`SessionWorkflow`) — a different seam, keep it. The leak: `HarnessCapabilities` (here) duplicates `HarnessRuntimeCapabilities` (harness-capability) field-by-field, held apart only by history — `harnessCapabilitiesForType` literally rebuilds one from the other (`{...descriptor.runtime, returnEnforcement}`). harness-protocol already imports harness-capability, so declare `HarnessCapabilities = HarnessRuntimeCapabilities & { returnEnforcement }` and delete the duplicate field list.

Also: `framework/event-bus` declares `@hyperidle/harness-protocol` as a production dependency; its only import is a test file (`AL7-proposed-call-types.test.ts`). Respell to devDependency.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/harness-protocol"` — production files only (tests/comments excluded):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-execution/harness-registry` (11 files) | HarnessAdapter family, SessionConfig family, events, all return-action fns/consts, EnforcementRegistry/Entry, WorkerRegisterMessage, normalization fns | Owns: normalization, enforcement-registry, worker-protocol, AdapterMeta |
| `layers/agent-execution/src` (boot, remote-worker-client) | EnforcementRegistry, HarnessAdapter, worker-protocol messages | Same layer as harness-registry — yes, via it |
| `layers/agent-orchestration/run-orchestration` (4 files) | HarnessPort family, SessionConfig family, HarnessEvent, isReturnAction, isInternalExtractionDrain, literalToolNamerForAdapterType, MAX_FORCE_RETURNS, HarnessAdapter | Owns: HarnessPort family. Cannot own adapter contract (boundary) |
| `layers/agent-orchestration/src/boot.ts` | HarnessAdapter, WorkerRegisterMessage | Composition root — already depends on agent-execution |
| `layers/agent-orchestration/session-requests` | HarnessAdapter, SessionHandle | No (boundary) |
| `layers/core-api` (app.ts + 8 routes) | HarnessCapabilityReader + the 6 forwarder fns + HarnessCapabilities | Owns: reader type. Forwarders die |
| `framework/tool-protocol` | `SessionWorkflow` (type, 1 symbol) | No — legitimate cross-import |
| `framework/event-bus` | **test-only** (prod dep declared anyway) | Dep is a lie — devDependency |
| `applications/desktop`, `applications/remote-server`, `tools/governance`, `tools/eval` | comments / lint-fixture strings only, zero imports | n/a |

## If written today, from scratch

One shared file-pair worth of contract, everything else owned by its one consumer:

- **Shared (`harness-protocol`, shrunk):** `HarnessAdapter`, `SessionConfig` (minus dead fields, satellites unexported), `SessionHandle`, `SessionResult`, `SessionMetrics`, `SessionWorkflow`, `ConversationMessage`, `HarnessCapabilities` (as intersection over harness-capability), `AdapterInfo`, `HarnessEvent` (4 variants, not 5), `return-actions.ts` (6 fns + 3 consts).
- **harness-registry:** event normalization (2 fns), enforcement registry types, worker-protocol wire types, `AdapterMeta`.
- **run-orchestration:** `HarnessPort`, `HarnessPortDeps`, `RunContextBundle`, `AdmittedRun`, `HarnessRunOutput`.
- **core-api:** `HarnessCapabilityReader`, `HarnessCapabilityFilter`; routes call `reader.size` / `.list()` / `.describe()` / `.refresh()` directly.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 17 |
| SIMPLIFY | 3 |
| KEEP | 35 |

Surface: 62 exports → ~20 exports remaining in the shared package (~68% cut of the shared surface; 15 of the KEEPs are relocations to a single owner, not survivals in place).

## Feature-level kills

- **`pre_compaction` as a protocol event.** The builtin adapter emits it (builtin-harness-adapter.ts:679) and the provisioner's drain switch handles `token_usage` / `tool_call` / `error` only (provisioner.ts:1556–1575) — **nothing anywhere parses `pre_compaction`**. The useful side-effect (writing session notes near context limit) happens inside the adapter before emitting. Kill the event variant and the emission; keep the adapter-internal note write. Hole: none — the wire event is noise today.
- **The six read-model forwarder functions.** `registeredHarnessCount(r)` = `r.size`; `workerConnections(r)` = `r.list()`; `refreshHarnessDiscoveries(r)` = `r.refresh()`; `harnessCapabilityDescriptors(r,o)` = `r?.describe(o) ?? []`. Each has exactly one calling file. Pure ceremony over an interface that already IS the narrowing. Hole: none.
- **Flag, not a kill — the remote-worker feature as a whole.** If the founder ever kills remote execution (remote-server + remote-worker apps), the entire worker-protocol module, `remote-worker-client.ts`, `remote-harness-adapter.ts`, `harness-adapter-factory.ts`, and `worker-ingress.ts` die together (~5 files + 11 types). Priced here so the option is visible; not verdicted dead — the shared-backend deployment is a shipped product surface.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `registeredHarnessCount` | UI:GET /api/agent-profile (agent-profile.ts:192) | DELETE | One-line forwarder for `reader.size`; one caller inlines it. |
| 2 | `workerConnections` | UI:GET /api/workers (workers.ts) | DELETE | One-line forwarder for `reader.list()`; one caller inlines it. |
| 3 | `harnessCapabilitiesForType` | UI:GET /api/agent-profile (agent-profile.ts) | MERGE | Single caller; fold the descriptor→capabilities merge into agent-profile.ts. |
| 4 | `harnessRegistrationMeta` | UI:validate-agent-config route | MERGE | Single caller; fold into validate-agent-config.ts (hardcoded `maxConcurrent: 1` is caller detail anyway). |
| 5 | `harnessCapabilityDescriptors` | UI:harnesses routes (harnesses.ts, 4 sites) | DELETE | Forwarder for `reader.describe()`; one calling file. |
| 6 | `refreshHarnessDiscoveries` | UI:harness refresh route (harnesses.ts) | DELETE | Forwarder for `reader.refresh()`; one caller. |
| 7 | `preMapClaudeEvent` | INTERNAL (cli-harness-adapter.ts only) | MERGE | Claude stdout-dialect parsing is cli-adapter implementation; fold into cli-harness-adapter.ts as a private helper. |
| 8 | `normalizeHarnessEvent` | INTERNAL (cli-harness-adapter.ts, adapter-pool.ts) | KEEP | Real work, two callers — both harness-registry. Moves there; stops being a framework export. |
| 9 | `isHarnessEvent` | DEAD (`rg -a` — zero refs, not even a test) | DELETE | Exported, never called anywhere. |
| 10 | `isReturnAction` | AGENT:return-gate (provisioner.ts drain, cli-harness-adapter.ts) | KEEP | The return-gate predicate, both sides of the enforced boundary. Core value: sessions must return work. |
| 11 | `isRequiredReturnAction` | AGENT:return-gate (return-enforcement.ts, builtin + cli adapters) | KEEP | Required-subset binding is live enforcement (assistant must `reply`). Stays with the closed set. |
| 12 | `isInternalExtractionDrain` | AGENT:provisioner exemption (provisioner.ts) | DELETE | One caller, one line (`config.tools.length === 0`). Inline at the call site with a comment. |
| 13 | `mcpNamespacedToolName` | AGENT:mcp-route forcing message (mcp-route.ts) | KEEP | Real per-dialect naming; used externally + by `literalToolNamerForAdapterType`. |
| 14 | `opencodeToolName` | AGENT:cli-adapter forcing (cli-harness-adapter.ts) | KEEP | Same — opencode's dialect verified against the real binary. |
| 15 | `literalToolNamerForAdapterType` | AGENT:provisioner (provisioner.ts) | KEEP | Cross-boundary dispatch of the namers; genuine shared surface. |
| 16 | `buildForceReturnMessage` | INTERNAL (only `shouldForceReturn` calls it) | MERGE | Zero external callers. Unexport; private helper of `shouldForceReturn`. |
| 17 | `shouldForceReturn` | AGENT:forcing hook (builtin, cli, mcp-route, return-status-tool) | KEEP | The force-return decision, four call sites. Core value: agents return work. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `EnforcementEntry` | KEEP → harness-registry | Only namer is return-enforcement.ts; the mcp-provider sibling-seam justification is dead. |
| `EnforcementRegistry` | KEEP → harness-registry | All five namers are agent-execution. Move, delete from framework. |
| `SessionWorkflow` | KEEP (shared) | tool-protocol + provisioner + SessionConfig — three packages, real AL7 surface. |
| `McpConnectionInfo` | MERGE → SessionConfig | Zero external namers; consumers build it structurally. Unexport. |
| `ConversationMessage` | KEEP (shared) | builtin adapter + runtime + provisioner + harness-port — both sides. |
| `SessionConfig` | SIMPLIFY | Live seam, but delete `systemPromptPath` — `@deprecated`, written by provisioner, read by nobody. |
| `SessionHandle` | SIMPLIFY | A one-field wrapper around `sessionId: string`. Pass the string. |
| `SessionMetrics` | KEEP (shared) | provisioner + cli adapter + HarnessRunOutput — token telemetry the founder explicitly kept (AU21). |
| `SessionResult` | KEEP (shared) | All four adapters + provisioner. |
| `ReturnHookConfig` | MERGE → SessionConfig | Zero external namers. Unexport. |
| `HarnessCapabilities` | SIMPLIFY | Two cuts: (1) declare as `HarnessRuntimeCapabilities & { returnEnforcement }` — the field list duplicates harness-capability's shape, and `harnessCapabilitiesForType` already proves they're one shape; (2) delete `preCompactionTrigger` — its event is dead wire, and agent-profile.ts:214 abuses it as a `toolUse` proxy when a real `toolUse` field exists. |
| `AdapterMeta` | KEEP → harness-registry | After row 4 inlines, every namer is harness-registry (adapter-pool, descriptors, index). Move. |
| `AdapterInfo` | KEEP (shared) | Pool-entry view crossing execution → core-api (`reader.list()` return, GET /api/workers). |
| `HarnessAdapter` | KEEP (shared) | THE seam: implemented by 4 adapters (execution), driven by provisioner/session-run-registry/worker-ingress (orchestration). Load-bearing for agents-run-work. |
| `HarnessCapabilityFilter` | KEEP → core-api | Moves with the reader; only named through `describe()`. |
| `HarnessCapabilityReader` | KEEP → core-api | All 9 namers are core-api. The narrowing is real value (routes can't name `select()`/`register()`); the *location* is wrong. Pool satisfies structurally — the drift-guard assertion test already lives in core-api. |
| `TokenUsageEvent` | MERGE → HarnessEvent | Zero external namers; live union member. Unexport. |
| `ToolCallEvent` | MERGE → HarnessEvent | Same (domain-model mention is a comment). |
| `CompletionEvent` | MERGE → HarnessEvent | Same. |
| `ErrorEvent` | MERGE → HarnessEvent | Same. |
| `PreCompactionEvent` | DELETE | Emitted by builtin only, parsed by nobody (provisioner drain has no case). Dead protocol. Kill variant + emission. |
| `HarnessEvent` | KEEP (shared) | The event stream both sides speak. |
| `HarnessEventType` | MERGE → normalization | Zero external namers; internal to the `satisfies` check. Unexport. |
| `ReturnActionName` | MERGE → return-actions | Zero external namers. Unexport. |
| `LiteralToolNamer` | MERGE → return-actions | Zero external namers (callers use inference). Unexport. |
| `HarnessAdapterType` | MERGE → return-actions | Zero external namers. Unexport. |
| `WorkerRegisterMessage` | KEEP → harness-registry | Namers: agent-execution files + both composition roots (which depend on agent-execution). The wire's parse side (worker-ingress) uses its own Zod copy regardless. |
| `WorkerEventMessage` | KEEP → harness-registry | remote-worker-client narrows on it. Moves with the wire module. |
| `WorkerSessionResultMessage` | KEEP → harness-registry | Same. |
| `WorkerErrorMessage` | KEEP → harness-registry | Same. |
| `WorkerPauseMessage` | MERGE → WorkerToServerMessage | Zero external namers; runtime pause is sent as a raw literal (`remote-worker-client.ts:341`) and parsed by worker-ingress's own Zod. Unexport. |
| `WorkerResumeMessage` | MERGE → WorkerToServerMessage | Same (line 348). |
| `WorkerToServerMessage` | KEEP → harness-registry | remote-harness-adapter names it. Moves. |
| `ServerDispatchMessage` | KEEP → harness-registry | remote-worker-client narrows on it. Moves. |
| `ServerStopMessage` | KEEP → harness-registry | Same. |
| `ServerRegisteredMessage` | MERGE → ServerToWorkerMessage | Zero external namers; ack sent as raw literal (worker-ingress.ts:203). Unexport. |
| `ServerToWorkerMessage` | KEEP → harness-registry | Client + adapter name it. Moves. |
| `HarnessPortDeps` | KEEP → run-orchestration | Only runtime.ts names it. |
| `RunContextBundle` | KEEP → run-orchestration | Only contracts.ts + runtime.ts name it. |
| `AdmittedRun` | KEEP → run-orchestration | Only runtime.ts names it. |
| `HarnessRunOutput` | KEEP → run-orchestration | Only contracts.ts names it. |
| `HarnessPort` | KEEP → run-orchestration | "Both Services depend on it" is measured false — one package names it; the impl satisfies it structurally without importing. Single-consumer port = local contract. |

### Consts

| Declaration | Verdict | Reason |
|---|---|---|
| `RETURN_ACTION_NAMES` | KEEP (shared) | The closed return set — builtin adapter reads it, tool-handlers' closure test guards drift against real tools. Core value. |
| `FORCE_RETURN_MESSAGE` | KEEP (shared) | cli adapter + return-status-tool; the canonical forcing text. |
| `MAX_FORCE_RETURNS` | KEEP (shared) | provisioner + 4 harness-registry files — the force budget both sides must agree on. |

## Holes this leaves

- **Worker wire union exists twice and now officially so.** worker-ingress's Zod schema was already a divergent hand copy of `WorkerToServerMessage`; moving the types to harness-registry does not create that drift, but it stops pretending the framework types prevent it. If drift bites, derive the ingress schema from one source — that's a fix the current package never delivered.
- **`HarnessCapabilityReader` moving to core-api** relies on the existing `const reader: HarnessCapabilityReader = pool` assertion test to catch pool/reader drift (it already does — the `Pick` link was severed in AU26). No new hole, but the assertion becomes the only guard, so it must not be deleted.
- **Deleting `pre_compaction`** removes the wire signal that context pressure occurred. Nothing consumes it today, so nothing breaks; if a future surface wants a "context nearly full" indicator, it re-adds a variant then — with a consumer attached.
- **Deleting `systemPromptPath`** removes a deprecated field one writer populates; if some path-validation actually reads it downstream via structural typing, `npm run check` will name the site immediately — that site inherits the delete.
- **Six route inlines** (rows 1–6) put trivial reader calls in route files — 8 core-api routes get a one-line change each. No behavior change; `test:integration:service` covers all these routes.
