# t3code Source Map — Agent Backend / Provider / Model Layer

Scope: how t3code discovers, launches, persists, and routes AI providers/models, and how that surface compares with HyperIdle's needs. Repository root inspected: `/tmp/t3code-explore`.

---

## 1. High-level architecture

t3code is a *generic multi-provider chat shell*. Its server owns a **registry of configured provider instances**; each instance maps to a concrete **driver** that knows how to talk to one agent backend (OpenAI Codex, Anthropic Claude, Cursor, xAI Grok, OpenCode). The wire protocol is JSON-RPC over a local loopback server; the web client consumes a `ServerProvider[]` snapshot atom.

Key layers:

- **Contracts** — shared schemas / branded types (`ProviderDriverKind`, `ProviderInstanceId`, `ServerProvider`, settings forms, model metadata).
- **Drivers** — per-kind factory implementing `ProviderDriver` (`metadata`, `configSchema`, `create`).
- **Provider layer** — per-kind discovery, installation checks, auth, version probing, and snapshot emission.
- **Adapter / runtime layer** — child-process or SDK session runtime and turn/event mapping.
- **Text generation layer** — `TextGenerator` abstraction used by chat threads to send turns.
- **Settings / persistence layer** — server-side settings store that hydrates the instance registry.
- **Web client layer** — instance-aware projection of `ServerProvider[]`, provider/model pickers, settings forms.

### Dependency direction
```
Web client ← JSON-RPC → Server
Server
  ├── ProviderInstanceRegistry (settings-driven
  ├── ProviderDriver factory (per kind)
  │     ├── Provider (discovery/auth/version/snapshot)
  │     ├── Adapter (session launch + event mapping)
  │     └── TextGenerator (turn execution)
  └── Chat threads dispatch to a TextGenerator
```

---

## 2. Type / schema contracts

### `ProviderDriverKind`
Branded string identifying a driver implementation. Built-ins live in contract (`@t3tools/contracts`) plus a registry in `apps/server/src/provider/builtInDrivers.ts`.

```ts
// packages/contracts/src/providerInstance.ts
export type ProviderDriverKind = string & Brand<"ProviderDriverKind">;
export const ProviderDriverKinds = {
  claude: "claude" as ProviderDriverKind,
  codex: "codex" as ProviderDriverKind,
  cursor: "cursor" as ProviderDriverKind,
  grok: "grok" as ProviderDriverKind,
  opencode: "opencode" as ProviderDriverKind,
};
```

### `ProviderInstanceId`
Branded string used as routing key for settings and thread selections. Defaults are `defaultInstanceIdForDriver(driverKind)`.

```ts
// packages/contracts/src/providerInstance.ts
export type ProviderInstanceId = string & Brand<"ProviderInstanceId">;
export function defaultInstanceIdForDriver(kind: ProviderDriverKind): ProviderInstanceId;
```

### `ServerProvider` (wire snapshot)
```ts
// packages/contracts/src/server.ts
export const ServerProvider = Schema.Struct({
  id: ProviderInstanceId,                // wire id = instance id
  driver: ProviderDriverKind,
  displayName: Schema.String,
  shortDescription: Schema.optionalWith(Schema.String, { as: "Option" }),
  installed: Schema.Boolean,
  enabled: Schema.Boolean,
  availability: Schema.optionalWith(Schema.Literal("available", "unavailable"), { as: "Option" }),
  unavailableReason: Schema.optionalWith(Schema.String, { as: "Option" }),
  authStatus: ProviderAuthenticationStatus, // "authenticated" | "unauthenticated" | "expired" | "unknown"
  models: ServerProviderModels,
  skills: Schema.optionalWith(Schema.Array(ServerProviderSkill), { as: "Option" }),
  continuation: Schema.optionalWith(ProviderContinuationConfig, { as: "Option" }),
  accentColor: Schema.optionalWith(Schema.String, { as: "Option" }),
  // plus server-internal driver metadata, update state, etc.
});
```

### `ProviderInstanceConfig`
The user-authored part of settings that survives restarts:
```ts
// packages/contracts/src/settings.ts
export const ProviderInstanceConfig = Schema.Struct({
  driver: ProviderDriverKind,
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  model: Schema.optionalWith(Schema.String),
  options: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});
```

Settings schemas are annotated with `providerSettingsForm` to drive the UI form renderer (`apps/web/src/components/settings/ProviderSettingsForm.tsx`).

### `Model` helpers
`packages/shared/src/model.ts` contains model parsing/normalization utilities (`parseModelSlug`, `formatModelName`, default model slugs) plus the continuation-group helpers used to decide whether two turns can reuse the same model backend.

---

## 3. Driver factory

### `ProviderDriver` interface
```ts
// apps/server/src/provider/ProviderDriver.ts
export interface ProviderDriver {
  readonly metadata: ProviderDriverMetadata;
  readonly configSchema: Schema.Schema<ProviderInstanceConfig, unknown>;
  create(config: ProviderInstanceConfig, deps: ProviderDependencies): ProviderInstance;
}

export interface ProviderInstance {
  readonly id: ProviderInstanceId;
  readonly snapshot: ProviderSnapshot;     // Effect's SubscriptionRef-like stream
  readonly adapter: ProviderAdapter;        // session launch
  readonly textGeneration: TextGenerator;   // chat turn execution
}
```

### Built-in registry
```ts
// apps/server/src/provider/builtInDrivers.ts
export const builtInProviderDrivers: Record<ProviderDriverKind, () => Promise<ProviderDriver>> = {
  [ProviderDriverKinds.claude]: () => import("./Drivers/ClaudeDriver").then((m) => m.claudeDriver()),
  [ProviderDriverKinds.codex]: () => import("./Drivers/CodexDriver").then((m) => m.codexDriver()),
  [ProviderDriverKinds.cursor]: () => import("./Drivers/CursorDriver").then((m) => m.cursorDriver()),
  [ProviderDriverKinds.grok]: () => import("./Drivers/GrokDriver").then((m) => m.grokDriver()),
  [ProviderDriverKinds.opencode]: () => import("./Drivers/OpenCodeDriver").then((m) => m.opencodeDriver()),
};
```

Notes:
- Drivers are **lazy-loaded** via dynamic imports.
- Fork / custom drivers are treated as unavailable shadows until a matching `ProviderDriver` resolves.

---

## 4. Per-provider implementation details

### 4.1 OpenAI Codex

Files:
- `apps/server/src/provider/Drivers/CodexDriver.ts` — factory wiring.
- `apps/server/src/provider/Layers/CodexProvider.ts` — discovery / auth / version / snapshot.
- `apps/server/src/provider/Layers/CodexAdapter.ts` — session launch.
- `apps/server/src/provider/Layers/CodexSessionRuntime.ts` — child-process session runtime.

**Discovery / launch**
Codex uses OpenAI's `codex` CLI spawned as a child process. The driver runs `codex --version` and `codex` interactive shell. The runtime:
- Spawns `codex` in a headless JSON-RPC-ish mode.
- Speaks the Codex inline agent protocol (tool calls, approval requests, streaming deltas).
- Emits events: `turn.start`, `turn.delta`, `turn.tool_call`, `turn.approval_request`, `turn.complete`, `session.error`.

**Auth**
OpenAI API key via t3code settings; the runtime passes it through env if configured, otherwise relies on Codex CLI's own keychain.

**Models**
Codex hard-codes / introspects available Codex models; the snapshot lists them with capabilities (`tools`, `streaming`, `approval`).

**Relevant functions**
- `codexDriver()` — builds `ProviderDriver`.
- `createCodexProvider(deps)` — returns `{ snapshot, version, supportsModel, refresh() }`.
- `createCodexAdapter(provider)` — returns `{ createSession(context) } → SessionHandle`.
- `CodexSessionRuntime.start(sessionPath, env)` — spawns and wires child process.

---

### 4.2 Anthropic Claude

Files:
- `apps/server/src/provider/Drivers/ClaudeDriver.ts`
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `apps/server/src/provider/Layers/ClaudeAdapter.ts`

**Discovery / launch**
Uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent` or local `claude` CLI, depending on version). The adapter launches a local Agent Runtime via the SDK and opens a session on it.

**Auth**
Anthropic API key stored in t3code settings; passed to SDK client.

**Models**
Claude model list is fetched from Anthropic `/v1/models` or loaded from a static fallback when offline.

**Relevant functions**
- `claudeDriver()`
- `createClaudeProvider(deps)`
- `createClaudeAdapter(provider)`
- `ClaudeTextGenerator.generate(messages, options)`

---

### 4.3 Cursor

Files:
- `apps/server/src/provider/Drivers/CursorDriver.ts`
- `apps/server/src/provider/Layers/CursorProvider.ts`
- `apps/server/src/provider/Layers/CursorAdapter.ts`

**Discovery / launch**
Cursor integration works through Cursor's **agent CLI** (`cursor agent`) or **ACP (Agent Capability Protocol)** local server when available. The provider probes for the Cursor CLI / running ACP endpoint.

**Auth**
Cursor is a local-first IDE; auth is implicit via the signed-in Cursor IDE. The provider reports `authStatus` from ACP's session identity or falls back to `unknown`.

**Models**
ACP exposes a model catalog; provider queries `/models` or equivalent.

**Relevant functions**
- `cursorDriver()`
- `createCursorProvider(deps)`
- `createCursorAdapter(provider)`

---

### 4.4 xAI Grok

Files:
- `apps/server/src/provider/Drivers/GrokDriver.ts`
- `apps/server/src/provider/Layers/GrokProvider.ts`
- `apps/server/src/provider/Layers/GrokAdapter.ts`

**Discovery / launch**
Grok provider shells out to a local `grok` CLI (xAI's agent CLI) when installed, or uses a direct API client if API key is present.

**Auth**
API key configured in t3code settings; CLI auth is detected through keychain/env.

**Models**
Static/dynamic model list for Grok family (`grok-3`, `grok-2`, etc.).

**Relevant functions**
- `grokDriver()`
- `createGrokProvider(deps)`
- `createGrokAdapter(provider)`

---

### 4.5 OpenCode

Files:
- `apps/server/src/provider/Drivers/OpenCodeDriver.ts`
- `apps/server/src/provider/Layers/OpenCodeProvider.ts`
- `apps/server/src/provider/Layers/OpenCodeAdapter.ts`
- `apps/server/src/provider/opencodeRuntime.ts`

**Discovery / launch**
OpenCode ships a local SDK and a tiny server. `opencodeRuntime.ts` starts the OpenCode server on an ephemeral port, then the adapter creates an SDK client pointing at that local server.

**Auth**
OpenCode server handles its own authentication/authorization; t3code passes through any configured token/options.

**Models**
OpenCode server exposes its supported models via a local metadata endpoint; provider reads and caches.

**Relevant functions**
- `opencodeDriver()`
- `createOpenCodeProvider(deps)`
- `createOpenCodeAdapter(provider, runtime)`
- `startOpenCodeServer(port, config)` / `createOpenCodeClient(baseUrl)` in `opencodeRuntime.ts`

---

## 5. Settings -> instances -> snapshots flow

### 5.1 Settings schema
`packages/contracts/src/settings.ts` defines `ServerSettings` with `providerInstances: Record<ProviderInstanceId, ProviderInstanceConfig>`. Each field schema is decorated with `providerSettingsForm` annotations describing control type, label, placeholder, secret flag, etc.

### 5.2 Server hydration
```ts
// apps/server/src/serverSettings.ts
export function hydrateProviderInstances(
  settings: ServerSettings,
  registry: ProviderInstanceRegistry,
): Effect.Effect<void, ProviderDriverError>;
```
- Settings JSON is the durable source of truth.
- On server start / settings update, the registry rebuilds instances by calling driver factories for each configured `providerInstances` entry.
- Default instances for each built-in driver are synthesized when absent so the UI always has a complete list.

### 5.3 Snapshot maintenance
- `apps/server/src/provider/providerSnapshot.ts` aggregates per-instance snapshots into a single reactive `SubscriptionRef`.
- `apps/server/src/provider/providerMaintenance.ts` periodically refreshes versions, auth status, and availability.

### 5.4 Client consumption
```ts
// apps/web/src/rpc/serverState.ts
export function useServerProviders(): ReadonlyArray<ServerProvider>;
```
This client atom subscribes to server state pushes and exposes `ServerProvider[]`.

The UI then transforms the flat list into `ProviderInstanceEntry[]` in `apps/web/src/providerInstances.ts`, which:
- preserves custom instances (`codex_personal`, `claude_openrouter`, …),
- computes display names (driver label vs humanized instance id),
- resolves availability/selectability.

---

## 6. Web UI surfaces

- **Route**: `/settings/providers` → `ProviderSettingsPanel` (`apps/web/src/routes/settings.providers.tsx`).
- **Add instance dialog**: `AddProviderInstanceDialog.tsx` picks a driver and renders its annotated settings form.
- **Settings form**: `ProviderSettingsForm.tsx` climbs the Effect schema and emits controls (text, secret, select, checkbox, number) based on `providerSettingsForm` annotations.
- **Instance card**: `ProviderInstanceCard.tsx` shows snapshot, live models, auth status, edit form.
- **Model picker** / composer: `ChatComposer.tsx` + `composerProviderState.tsx` select provider instance + model from the `ServerProvider.models` list.

---

## 7. HyperIdle adoption summary

| t3code concept | HyperIdle analogue | Notes |
|---|---|---|
| `ProviderDriverKind` | Agent type / runtime kind | Can reuse branded-slug pattern but HyperIdle needs richer agent identity (domain skills, TOON actor). |
| `ProviderInstanceId` | Token/agent instance routing key | Fits HyperIdle's agent pool; must be scoped per-team or per-bet. |
| `ProviderInstanceConfig` + `ServerSettings` | Org / team settings + agent credentials | Need to encrypt secrets; t3code stores locally. |
| `ProviderDriver` factory + dynamic imports | Agent runtime harness | Closest prior art for pluggable agent runtimes in the repo. |
| `TextGenerator` / adapter | Agent turn execution / session | HyperIdle session protocol is different (bets/tasks/sessions/routines), but event stream mapping is comparable. |
| `ServerProvider` snapshot | `/api/serverState` or equivalent atom feeding shell | Useful reference for how to project configured providers to the UI in one reactive list. |
| `providerSettingsForm` annotations | Dynamic form schema in UI | Pattern can be reused for agent configuration forms. |
| `packages/shared/src/model.ts` | Model normalization | Take the slug-parsing logic as reference if HyperIdle supports multiple LLM backends. |
| `CodexSessionRuntime` child process | Agent harness spawning external agents | Relevant for running local agents (CLA-1); HyperIdle harness may spawn MCP / OpenCode / custom agent servers similarly. |
| `opencodeRuntime.ts` local server | In-process agent server bootstrap | Strong reference for HyperIdle's self-hosted OpenCode agent runtime. |

### Limitations of t3code for HyperIdle
- **No multi-tenancy**: settings are global JSON, not per-team/per-bet.
- **No durable sessions**: sessions are runtime child processes; no persistence across server restarts.
- **No agent identity beyond provider kind**: skills/models are flat; no TOON actor, no permissions graph.
- **No orchestration layer**: chat threads pick one provider instance; there is no multi-agent routing or delegation.
- **Local-first**: credentials live in local JSON; HyperIdle needs encrypted server-side storage.

### Recommendations
1. Borrow the `ProviderDriver` / `ProviderInstanceRegistry` / settings-schema-annotation patterns for HyperIdle's agent runtime harness.
2. Replace the flat `ServerProvider` snapshot with a layered projection: org → team → runtime kind → agent instance.
3. Use `CodexSessionRuntime` and `opencodeRuntime.ts` as examples for spawning and talking to external agent processes over JSON-RPC.
4. Port the `providerSettingsForm` annotation approach to render agent configuration forms dynamically from Effect schemas.
5. Do not reuse t3code's chat-thread / text-generation abstractions directly; HyperIdle's process primitives (Teams/Bets/Tasks/Sessions/Routines) need their own turn model.

---

## 8. Key file index

- `apps/server/src/provider/builtInDrivers.ts` — built-in driver registry.
- `apps/server/src/provider/ProviderDriver.ts` — driver + instance interface.
- `apps/server/src/provider/Drivers/{Codex,Claude,Cursor,Grok,OpenCode}Driver.ts` — per-kind factories.
- `apps/server/src/provider/Layers/{Codex,Claude,Cursor,Grok,OpenCode}Provider.ts` — discovery / auth / snapshot.
- `apps/server/src/provider/Layers/{Codex,Claude,Cursor,Grok,OpenCode}Adapter.ts` — session launch.
- `apps/server/src/provider/Layers/CodexSessionRuntime.ts` — Codex child-process session runtime.
- `apps/server/src/provider/opencodeRuntime.ts` — OpenCode local server + SDK client.
- `apps/server/src/provider/providerSnapshot.ts` — snapshot aggregation.
- `apps/server/src/provider/providerMaintenance.ts` — periodic refresh.
- `apps/server/src/serverSettings.ts` — settings persistence + instance hydration.
- `packages/contracts/src/provider.ts` — provider-related contracts.
- `packages/contracts/src/providerInstance.ts` — driver/instance branded types.
- `packages/contracts/src/server.ts` — `ServerProvider`, `ServerProviderModel`, auth/status schemas.
- `packages/contracts/src/settings.ts` — `ProviderInstanceConfig`, settings form annotations.
- `packages/contracts/src/model.ts` — model contracts.
- `packages/shared/src/model.ts` — model normalization helpers.
- `apps/web/src/rpc/serverState.ts` — client `ServerProvider[]` atom.
- `apps/web/src/providerInstances.ts` — instance-aware projection + selection helpers.
- `apps/web/src/components/settings/ProviderSettingsForm.tsx` — dynamic settings form renderer.
- `apps/web/src/components/settings/AddProviderInstanceDialog.tsx` — add-instance flow.
- `apps/web/src/components/settings/ProviderInstanceCard.tsx` — instance card + edit.
- `apps/web/src/components/chat/ChatComposer.tsx` — composer provider/model selection.
