# AN2 — Outbound tool brokering (hybrid) · Architecture

**Workpackage:** AN2 (`.pipeline/work-packages/TRACK-AN.md`). Depends on **AN1** (Connection store + `ServiceConnectionResolver`, PR #353) and **AL7** (trust-first review loop, PR #351). Concept locked in `plans/AN/concept.md` (Connector, Connection, Brokered/Direct call). No `/design` (backend mechanism, no rendered surface).

---

## Required reading (builder reads ONLY these before implementing)

- `plans/AN/concept.md` — Connector / Connection / Brokered-Direct call; the hard contracts (credential containment, gate inheritance, ride-the-standard, fail-safe-to-brokered).
- `packages/server/src/tools/tool-registry.ts` — **the spine AN2 rides.** `RegisteredTool`, `classifyReversibility`, the `invoke` **workflow router** (capture → gate → CAS-consume grant → execute → record outcome), `BuildToolRegistryOptions.extraTools`, `ToolContext`.
- `packages/server/src/services/service-connection-resolver.ts` — `ServiceConnectionResolver.resolve(userId, connectionId) → token | null`. The credential seam (null ⇒ broker refuses).
- `packages/server/src/mcp/mcp-bridge.ts` — the **inbound** bridge (HyperIdle → harness, SDK server transport). AN2's outbound client is its mirror (SDK *client* transport).
- `packages/server/src/services/session-provisioning.ts` — where the per-session registry is built (`buildToolRegistry`, `extraTools`, `sessionWorkflow`, `ToolContext`). AN2 injects wrapped external tools here.
- `packages/db/src/schema.ts` — `serviceConnections`, `proposedCalls`, `operationOutcomes`, `tailoredGrants` (all already exist; **AN2 adds no table**).
- `docs/architecture/credential-model.md`, `docs/architecture/system-boundary.md`, `docs/agent-layer/harness-capability-descriptor.md`.
- MCP SDK client transports: `@modelcontextprotocol/sdk/client/index.js` (`Client`), `client/streamableHttp.js`, `client/stdio.js` (verify against installed `^1.29.0`).

---

## The load-bearing insight (read first)

AN2 needs **no new execution engine, no new gate, no migration.** An external tool brokered through HyperIdle is just a `RegisteredTool` whose **handler runs in the HyperIdle server process** (not the sandbox) and proxies to an outbound MCP client with the credential attached server-side. Drop those wrapped tools into the per-session registry via the existing `extraTools` seam and **every AL7 guarantee comes for free**:

| Requirement | Provided by (existing) |
|---|---|
| reversible → run direct, no gate | workflow router: reversible tools execute immediately in `invoke` |
| irreversible → stage for review | workflow router: `captureProposedCall` + `AWAITING_REVIEW` + `onAbortSession` |
| executes only on binding approval | session-2 grant-bearing path + tailored grant |
| at-most-once | CAS-consume of `tailoredGrants` (`consumed=false → true`) + capture UNIQUE index |
| outcome surfaced | `recordOutcome` → `operationOutcomes` + status transition |
| reversibility Kernel-owned, fail-closed | `classifyReversibility` (no signal → irreversible) |
| credential never in agent session | handler runs server-side; credential resolved inside handler |

**AN2's actual additions are four narrow things:** (1) an outbound MCP **Client** wrapper, (2) a **connector resolver** that turns a `Connection` into a live client + its tool list, (3) a **brokered-tool wrapper** (external MCP tool → `RegisteredTool` with a credential-attaching handler), (4) wiring the resulting tools into session provisioning + threading `ownerUserId` so the resolver is per-user. The credential is attached **inside the handler at execution** — for a reversible call the handler runs immediately; for an irreversible one the same handler runs only on the grant-bearing session-2 re-attempt.

---

## Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Reality | Plan handles |
|---|---|---|
| "broker through the Kernel; Kernel attaches credential and makes the call" | AL7 is **trust-first, no-kernel-executor** (`AL7-no-kernel-executor.test.ts`): HyperIdle runs nothing of its own; the agent's own session re-executes on approval. | Reconciled: the brokered call **is** a `RegisteredTool` the agent calls; the credential-attach + outbound call happen inside the *tool handler* (server-side, in `registry.invoke`), which is exactly "the agent executes with its own tools." No separate dispatcher (would re-fail the AC12 test). |
| "reversible draft-space work goes direct **from the sandbox**" | Sandbox tool provisioning is **AN3**, out of scope. Credential containment forbids credentials in the sandbox. | AN2 "direct" = **ungated server-side broker execution** (runs immediately, no human gate), credential stays server-side. Sandbox-direct (harness-native `gh`/`git`, source-1 auth) is AN3. Scope this crisply — do not put any credential in a sandbox. |
| reversibility hints come from the tool | `classifyReversibility` reads MCP `annotations.destructiveHint`/`idempotentHint`, fail-closed to irreversible. But the **hint is the external server's self-declaration** — third-party-owned, not Kernel-owned. An unvetted server claiming `idempotentHint:true` on a destructive op would run direct/ungated. | AN2 honors the hint **only for `trustTier="vetted"` sources** (downgrade-to-direct). For **unvetted (`community`) sources the wrapper drops the annotations** → fail-closed → all-brokered. AN2 has no vetted path yet (AN4 builds it), so **every AN2 op is gated** today. Agent never sets hints; unknown ⇒ irreversible. |
| broker resolves "a Connection's credential" | `ServiceConnectionResolver.resolve(userId, connectionId)` exists; needs **userId**. A session has `agentId/taskId/teamId` but **no userId** in `ToolContext`, and **no HTTP request** at provision time (one call site, `routines-routes.ts`, has no `c.get("userId")` at all). | Resolve `ownerUserId` **inside `provisionSession`** via the same single-human-user lookup `auth.ts` already uses — `db.select().from(users).where(eq(users.kind,"human")).limit(1)`, fallback `"u-founder"` — then thread it into `ToolContext` + `resolveConnectorTools`. NOT "mirror AN1 routes" (those read an HTTP auth context provisioning doesn't have). Genuine gap; **Task 5**. |
| external tool input schema | `RegisteredTool.inputSchema` is `z.ZodType`; external MCP tools expose **JSON Schema**. | Minimal `jsonSchemaToZod` converter (object/string/number/integer/boolean/array/enum/required; loose-object fallback). Keeps `toClaudeToolSpec` + `mcp-bridge` presentation paths **untouched**. |
| connector source / manifest | The manifest + registry are **AN4**. | AN2 uses a minimal `resolveConnectorSpec(service) → ConnectorSpec` config seam (transport + url/command). AN4 replaces it. |
| which Connections broker | `serviceConnections` has **no `status`/`active` column** (verified) — only `health` + `authSource ∈ {token, mcp-oauth}`. The resolver returns a token **only for `authSource="token"`** (mcp-oauth rows have `encryptedToken=null`; harness rows aren't stored). | `resolveConnectorTools` enumerates `userId=ownerUserId AND authSource="token"` rows. AN2 brokers the **token** source only; **mcp-oauth and harness are out-of-scope-for-AN2-wiring** (consistent with AN1's own out-of-scope note). "active" was never a schema concept. |

**No schema migration.** AN2 reuses `serviceConnections`, `proposedCalls`, `operationOutcomes`, `tailoredGrants` verbatim.

---

## Types & contracts

### New shared types — `packages/shared/src/connector.ts`

```ts
/** How HyperIdle reaches an external MCP server. CLOSED set. */
export const CONNECTOR_TRANSPORTS = ["http", "stdio"] as const;
export type ConnectorTransport = (typeof CONNECTOR_TRANSPORTS)[number];

/**
 * The config HyperIdle needs to connect OUT to one external service's MCP server.
 * AN2 resolves this from a minimal config seam keyed by Connection.service.
 * AN4 replaces the seam with the manifest/registry; this type stays.
 */
export interface ConnectorSpec {
  readonly service: string;                 // matches serviceConnections.service
  readonly transport: ConnectorTransport;
  readonly url?: string;                     // http transport (the mcp-oauth serverUrl)
  readonly command?: string;                 // stdio transport
  readonly args?: readonly string[];         // stdio transport
  /** How the resolved credential is attached at execution. */
  readonly auth: "bearer-header" | "env" | "none";
  readonly envVar?: string;                  // for auth:"env" + stdio
}

/** One tool as enumerated from an external MCP server (SDK tools/list shape). */
export interface ConnectorToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;       // JSON Schema
  // Deliberate PROJECTION of the SDK's ToolAnnotations (which also carries
  // readOnlyHint/openWorldHint/title) — AN2 only needs these two for classification.
  readonly annotations?: { destructiveHint?: boolean; idempotentHint?: boolean };
}

/** Namespaced tool-name prefix so external tools never shadow internal ones. */
export const CONNECTOR_TOOL_PREFIX = "conn__"; // conn__<service>__<toolName>
```

Exported from `packages/shared/src/index.ts` alongside the AN1 connection types.

### Outbound MCP client — `packages/server/src/mcp/outbound/outbound-mcp-client.ts`

```ts
export interface OutboundConnection {
  readonly listTools: () => Promise<ConnectorToolDescriptor[]>;
  readonly callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  readonly close: () => Promise<void>;
}

/**
 * Connect OUT to an external MCP server using the SDK Client + the transport the
 * ConnectorSpec names. `authToken` (resolved server-side by the caller) is attached
 * per the spec.auth strategy:
 *   - bearer-header (http): StreamableHTTPClientTransport requestInit headers
 *     { Authorization: `Bearer ${authToken}` }
 *   - env (stdio): StdioClientTransport env { [spec.envVar]: authToken }
 *   - none: no credential
 * VERIFIED against installed @modelcontextprotocol/sdk@1.29.0 (critique): streamableHttp.d.ts:77
 *   `StreamableHTTPClientTransportOptions.requestInit?: RequestInit` → header injection works;
 *   stdio.d.ts:19 `StdioServerParameters.env?: Record<string,string>` → env attach works.
 */
export async function connectOutbound(
  spec: ConnectorSpec,
  authToken: string | null,
): Promise<OutboundConnection>;
```

The credential **never** appears in the returned object's surface, in args, or in any thrown error message (redact on failure). Mirrors `mcp-bridge.ts` but with `client/*` transports.

### Connector resolver — `packages/server/src/mcp/outbound/connector-resolver.ts`

```ts
export interface ResolveConnectorsDeps {
  readonly db: HyperIdleDb;
  readonly resolver: ServiceConnectionResolver;
  readonly resolveSpec: (service: string) => ConnectorSpec | null; // config seam; AN4 swaps
}

/**
 * Enumerate exactly the brokerable connections for ownerUserId, connect out,
 * list tools, wrap each as a RegisteredTool. Returns the tools + a disposer the
 * session teardown calls.
 *
 * WHAT IT ENUMERATES (precise — "active Connection" is NOT a schema concept):
 *   db.select().from(serviceConnections)
 *     .where(and(eq(serviceConnections.userId, ownerUserId),
 *                eq(serviceConnections.authSource, "token")))
 * i.e. all of this user's TOKEN-source connection rows. `serviceConnections` has
 * NO status/active column (verified schema) — it has `health ∈ {usable,
 * needs-attention, expired}` and `authSource ∈ {token, mcp-oauth}`. AN2 brokers
 * ONLY `authSource="token"` (see scope note below).
 *
 * Each row's `trustTier` is threaded into wrapBrokeredTool so unvetted (community)
 * sources get their annotations dropped → all-brokered (Finding 4). In AN2 this is
 * every row (trustTier defaults to "community"); AN4 introduces "vetted".
 *
 * A connection whose ConnectorSpec is unknown, or whose resolve()==null,
 * contributes ZERO tools (fail-quiet; logged via observability).
 */
export async function resolveConnectorTools(
  deps: ResolveConnectorsDeps,
  ownerUserId: string,
): Promise<{ tools: RegisteredTool[]; dispose: () => Promise<void> }>;
```

**AN2 brokers the `token` auth source ONLY.** Verified against the AN1 resolver: `ServiceConnectionResolver.resolve` returns a token only for `authSource="token"` with non-null `encryptedToken`; `mcp-oauth` rows have `encryptedToken=null` → `resolve()` returns null → zero tools. `harness`-source connections are never stored in this table at all (live-derived, AN1 lore). So AN2 wires **token** end-to-end and treats **mcp-oauth and harness as out-of-scope-for-AN2-wiring** — consistent with AN1's own out-of-scope note ("Harness-source live enumeration depends on AN2's outbound MCP client … AN1 ships the projection seam + UI group"). Brokering mcp-oauth (the service holds the token; needs OAuth-token attach or DCR) and harness (sandbox-native, AN3) are deferred. The resolver filters on `authSource="token"` so an mcp-oauth row never even attempts a broker.

**Health filter (optional, deferred).** AN2 does not gate on `health`; an `expired`-health token simply resolves and the outbound call fails at the service, surfaced as a normal tool error. Filtering on `health="usable"` is a one-line tightening AN4 can add with the trust tier — not in AN2 scope.

### Brokered-tool wrapper — `packages/server/src/mcp/outbound/brokered-tool.ts`

```ts
/**
 * Wrap one external MCP tool as a server-side RegisteredTool.
 *  - name:         CONNECTOR_TOOL_PREFIX + service + "__" + descriptor.name (collision-proof)
 *  - inputSchema:  jsonSchemaToZod(descriptor.inputSchema)  (loose fallback)
 *  - annotations:  GATED on trust (see below). For an UNVETTED source the annotations
 *                  are DROPPED before classifyReversibility → fail-closed → all-brokered.
 *  - handler:      RESOLVE credential server-side → connectOutbound → callTool → map result.
 *                  The credential is attached HERE, at execution. Never in args, never in the
 *                  session, never in the ProposedCall row, never in logs.
 *
 * On resolver==null (no credential) the handler returns err("NO_CREDENTIAL", …) → the agent is
 * refused (AN1's resolver-null seam; AN1 proved null, AN2 proves the refusal end-to-end).
 */
export function wrapBrokeredTool(args: {
  spec: ConnectorSpec;
  connectionId: string;
  ownerUserId: string;
  descriptor: ConnectorToolDescriptor;
  resolver: ServiceConnectionResolver;
  /** From the Connection's `trustTier`. In AN2 effectively always "community"
   *  (no vetted path exists yet — AN4 builds it). Drives annotation honoring. */
  trustTier: "vetted" | "community";
}): RegisteredTool;
```

**Reversibility classification — the trust boundary (Finding 4).** A `reversible` verdict comes from the external server's self-declared `annotations.idempotentHint`. **That hint is third-party-owned, NOT Kernel-owned** — a malicious or buggy external server could set `idempotentHint:true` on a genuinely destructive op and, if honored, the op would run **direct, ungated**. That is a real gate-bypass at the trust boundary. AN2's posture closes it:

- **Unvetted sources (`trustTier="community"`) → all-brokered.** The wrapper **drops `descriptor.annotations` entirely** before building the `RegisteredTool`, so `classifyReversibility` sees no signal → fail-closed → **irreversible/gated for every op**. An unvetted server's "reversible" hint is **NOT honored.** Today this is **every** AN2 connection (`serviceConnections.trustTier` defaults to `"community"`; no vetted path exists until AN4), so in practice **all brokered ops are gated in AN2.**
- **Trusted sources (`trustTier="vetted"`) → annotations may DOWNGRADE to direct.** Only a vetted source's `idempotentHint` is passed through to `classifyReversibility` (enabling reversible→direct for speed). AN4 builds the vetting/trust-tier mechanism that can mint `vetted`; until then this branch is unreachable and the conservative path holds.

So: annotations can only ever **downgrade** an op to direct, and only for a **trusted** source; an unvetted source can never escape the gate. The agent cannot influence any of it — `trustTier` is read from the stored Connection server-side, annotations from the external server server-side. "Unknown reversibility → gated" stays honest at the trust boundary. Full vetting/trust-tier is **deferred to AN4**; AN2 makes this deferral *safe* by defaulting unvetted to all-brokered rather than trusting the hint.

### JSON-Schema → zod — `packages/server/src/mcp/outbound/json-schema-to-zod.ts`

```ts
/** Minimal converter for the MCP-common subset; anything exotic → z.unknown();
 *  non-object root → z.looseObject({}). No eval, no $ref resolution (safe by construction). */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType;
```

Boring, ~50 lines, no new dependency. Keeps the two existing presentation paths (`toClaudeToolSpec`, `mcp-bridge.registerTool`) unchanged.

### `ToolContext` addition (the only `tool-registry.ts` change)

```ts
export interface ToolContext {
  // …existing…
  /** AN2: the owning human user whose Connections this session may broker against.
   *  Resolved INSIDE `provisionSession` (single-human-user model today). Absent ⇒ no
   *  external tools resolved (safe default). Per-user isolation is enforced here. */
  readonly ownerUserId?: string;
}
```

**Concrete resolution (Task 5).** Neither call site supplies a userId: `sessions-routes.ts` has `c.get("userId")` but `routines-routes.ts` (verified line 662) does not — so `ownerUserId` is resolved **server-side inside `provisionSession`** to keep one mechanism for both call sites. A new helper `resolveOwnerUserId(db)` (`packages/server/src/services/owner-user.ts`) runs the **exact lookup `auth.ts` already uses** for the single-human-user model:

```ts
// owner-user.ts — reuses auth.ts:234's pattern verbatim.
export async function resolveOwnerUserId(db: HyperIdleDb): Promise<string> {
  const [human] = await db.select().from(users).where(eq(users.kind, "human")).limit(1);
  return human?.id ?? "u-founder"; // same fallback constant as auth.ts:235
}
```

`provisionSession` calls it once, stores the result in the local `ownerUserId`, and (a) sets `toolContext.ownerUserId`, (b) passes it to `resolveConnectorTools`. **`ProvisionSessionParams` does NOT gain `ownerUserId`** — the resolution is internal to provisioning, so the two route call sites stay untouched (zero call-site churn; `routines-routes.ts` could not supply it anyway). The field stays on `ToolContext` only. When AN extends to multi-user/team-shared Connections, `resolveOwnerUserId` is the single seam that changes (e.g. task → owning human); the broker never hardcodes the user.

---

## Design-it-twice

**D1 — Execution model.** (A, chosen) Wrap external tools as `RegisteredTool`s in the per-session registry; credential-attach inside the handler. Rides the AL7 workflow router verbatim — classify/capture/grant/outcome/at-most-once all reused. (B, rejected) A separate broker-dispatch service parallel to the registry. Rejected: re-introduces a kernel-executor surface (re-fails `AL7-no-kernel-executor.test.ts`), duplicates capture/grant/outcome, and would need its own at-most-once. Reverse cost of B is high; A is near-zero new machinery.

**D2 — External input schema.** (A, chosen) `jsonSchemaToZod` converter → normal `z.ZodType` → existing presentation paths untouched; loose fallback for exotic schemas. (B, rejected) Add `rawInputJsonSchema` passthrough to `RegisteredTool` and teach `toClaudeToolSpec` + `mcp-bridge` to use it. Rejected: the SDK's `registerTool` wants zod anyway, so B still needs a zod schema for validation; B touches three files for no gain. A's only risk (exotic schema loses precise params) is acceptable — the agent still gets name + description, and MCP-common tools convert cleanly.

---

## Live-proof test strategy (the workpackage is not `done` without it)

### The accepted "real external service" (conscious decision, not a hedge)

The required, gating proof is an **in-repo MCP server fixture** built on the SDK's `McpServer` + a real HTTP server transport, spawned by the integration test on an ephemeral `127.0.0.1` port. This **IS** the WP's permitted "locally-spawned standard MCP server process the test launches" (WP §Plan-calls allows it explicitly). It is a **genuine MCP server speaking the full protocol over a real transport — NOT a stub of our client.** The outbound `Client` really connects, negotiates, runs `tools/list` and `tools/call` over the wire. This is the primary required proof; the workpackage is `done` when it is green. No "optional" qualifier — this fixture is the live-proof.

The fixture (`packages/server/src/mcp/outbound/__tests__/_fixture-mcp-server.ts`, helper not a test) exposes:
- `read_value` — `annotations.idempotentHint:true` → **reversible**.
- `write_value` — `annotations.destructiveHint:true` → **irreversible**.
- `whoami` — `annotations.idempotentHint:true`; the fixture **records the inbound `Authorization` header** so the test asserts the credential was attached server-side and is absent from the agent session.
- `mystery` — **no annotations** → must classify irreversible (fail-safe).

### The credential path is exercised through a REAL token-source Connection row

The fixture's `ConnectorSpec.auth` is **`bearer-header`, not `none`** — `auth:"none"` would bypass the resolver and prove nothing about credential-attach. The integration test seeds a real **`authSource="token"`** connection the way AN1's resolver tests do (verified `AN1-service-connection-resolver.test.ts`): `encryptCredentialValue(TOKEN, TEST_SERVER_SECRET)` → insert `serviceConnections` row `{ userId: ownerUserId, service: "Acme", authSource: "token", encryptedToken, health: "usable" }`. `resolveConnectorTools` runs with a real `ServiceConnectionResolver(db, TEST_SERVER_SECRET)`. So the full chain is live: row → `resolve(ownerUserId, connectionId)` decrypts → handler attaches `Authorization: Bearer <plaintext>` → fixture records it. This is what makes AC3a (credential attached by the system) and AC3c (resolver→null ⇒ refusal) real rather than fixture-faked. Setup steps for both rows (the present token row, and an absent/cross-user row for the null case) are part of the test plan, not deferred.

File: `AN2-broker-live.integration.test.ts`.

### Second service by configuration, not code

A second fixture spawned over **stdio** (`StdioClientTransport`, different `ConnectorSpec.transport`), service `"Beta"`, also a real `authSource="token"` connection, reusing the *same* broker/wrapper code. The only delta between the two services is the `ConnectorSpec` (transport + url/command). Proves "a second reachable by configuration rather than new bespoke code" and exercises both transports. For stdio the credential attaches via `StdioClientTransport` `env` (`spec.envVar`) rather than a header; the stdio fixture records the env var to assert attach. File: `AN2-second-service-config.integration.test.ts`.

### Real public third-party server — local-only lane (NOT a gate, NOT CI)

A `*.real-harness`-tagged test brokers against the official `@modelcontextprotocol/server-everything` reference server (or a real GitHub MCP server when creds present), confirming our client speaks to a *third-party* implementation. Per MEMORY [e2e-local-only] this runs **local-only and is NEVER a CI job or a DONE gate** — it skips cleanly when the binary/creds are absent. It is a confidence lane on top of the in-repo fixture, not the required proof (the in-repo fixture above is). File: `AN2-real-public-server.real-harness.test.ts`.

---

## Acceptance criteria → verification

| # | AC | Verification (exact) |
|---|---|---|
| AC1 | Reversible external op → result, no human gate | `AN2-broker-live.integration.test.ts`: seed the Acme connection as **`trustTier="vetted"`** (the only tier whose annotations are honored, so the reversible-direct path is reachable); build registry with `extraTools=[wrap(read_value, trustTier:"vetted")]` + a session-1 `sessionWorkflow`; `registry.invoke("conn__Acme__read_value", …)`. Assert result success, value from fixture, `select(proposedCalls)` **empty** (no gate). **Companion (Finding 4 posture):** the *same* `read_value` wrapped from a **`community`** source → invoke → `AWAITING_REVIEW` + captured row, fixture NOT called — proving an unvetted source's `idempotentHint` is dropped and everything gates. |
| AC2 | Irreversible → staged not performed; executes once on approval; AL7 at-most-once + outcome | Same suite, three steps: (1) session-1 invoke `write_value` → assert `err.code==="AWAITING_REVIEW"`, one `proposedCalls` row `status="captured"`, **fixture NOT called** (fixture call-counter==0). (2) seed a `tailoredGrants` row (approval) + session-2 `grant-bearing` workflow → invoke → assert fixture called **once**, one `operationOutcomes` row, `proposedCalls.status="executed"`. (3) invoke again → grant consumed → fixture still called **once** total (at-most-once). Reuses the AL7 router unchanged. |
| AC3 | Credential attached at execution, never in agent session | Setup: seed a REAL `authSource="token"` `serviceConnections` row (`encryptCredentialValue(TOKEN, TEST_SERVER_SECRET)`), `ConnectorSpec.auth="bearer-header"`, run with a live `ServiceConnectionResolver(db, TEST_SERVER_SECRET)`. (a) Integration: invoke `conn__Acme__whoami`; assert the fixture recorded `Authorization: Bearer <token>` where `<token>` is non-empty AND **equals the plaintext `resolver.resolve(ownerUserId, connectionId)` returns** (cross-referenced so the negative in (b) can't pass vacuously against a short token). (b) Containment asserts: the wrapped tool's `inputSchema` JSON, the `proposedCalls.args`, and `registry.definitions` contain **no** token substring; the handler sources the token only from the resolver. (c) Integration: a connection whose row is absent/cross-user → `resolve→null` → invoke returns `err("NO_CREDENTIAL")`, `connectOutbound` never called, fixture call-counter==0. Plus a unit: `wrapBrokeredTool` handler with a stub `resolver.resolve→null` returns `err("NO_CREDENTIAL")` without calling `connectOutbound`. |
| AC4 | Works for >1 service; ≥1 real; second by config | `AN2-broker-live` (service Acme, http) + `AN2-second-service-config` (service Beta, stdio) both list+call real fixture tools end-to-end through the **same** broker code; the test diff between them is only the `ConnectorSpec`. |
| AC5 | Unknown/ambiguous reversibility → gated, never direct | Unit `AN2-classify.test.ts`: (i) `wrapBrokeredTool` for `mystery` (no annotations, any tier) → `classifyReversibility(name, def)==="irreversible"`. (ii) **Forged-hint guard:** `wrapBrokeredTool` for a tool with `idempotentHint:true` from a **`community`** source → annotations dropped → `classifyReversibility==="irreversible"` (a vetted source of the same tool → `"reversible"`, proving the trust gate, not a blanket block). Integration: session-1 invoke `conn__Acme__mystery` → `AWAITING_REVIEW` + captured row, fixture NOT called. |

Static properties (enforced by type system / lint, not tests): `ownerUserId` optional additive (TS `check`); no new table (no migration file); external tool names carry `CONNECTOR_TOOL_PREFIX` (asserted in the wrapper unit test).

---

## Ordered task list

1. **Shared types** — add `packages/shared/src/connector.ts` (`ConnectorSpec`, `ConnectorToolDescriptor`, `CONNECTOR_TRANSPORTS`, `CONNECTOR_TOOL_PREFIX`); export from `index.ts`. Proof: `npm run check`; unit imports the types.
2. **`jsonSchemaToZod`** — `mcp/outbound/json-schema-to-zod.ts` + `AN2-json-schema-to-zod.test.ts` (object/required/primitives/array/enum convert; exotic → unknown; non-object → loose). *Red first.*
3. **Outbound MCP client** — `mcp/outbound/outbound-mcp-client.ts` (`connectOutbound`). SDK APIs VERIFIED against installed `1.29.0` (`StreamableHTTPClientTransportOptions.requestInit.headers`, `StdioServerParameters.env`) — use them directly; a quick `import` smoke-confirm at build is enough. Proven via the live fixture in Task 7 (no standalone mock test — that would prove nothing per MEMORY mock-validation-trap).
4. **Brokered-tool wrapper** — `mcp/outbound/brokered-tool.ts` (`wrapBrokeredTool`, with the `trustTier` param) + `AN2-broker-tool.test.ts` + `AN2-classify.test.ts`: name prefix; **trust-gated annotations** — `community` source DROPS `descriptor.annotations` before `classifyReversibility` (forged `idempotentHint:true` still → irreversible = Finding 4), `vetted` passes them through (→ reversible reachable); no-annotation→irreversible (AC5 unit); `resolver→null ⇒ NO_CREDENTIAL` (AC3c); token never in `inputSchema`/`definitions`. *Red first.*
5. **`ownerUserId` resolution** — add `resolveOwnerUserId(db)` (`packages/server/src/services/owner-user.ts`) running `users WHERE kind='human' LIMIT 1`, fallback `"u-founder"` (the exact `auth.ts:234-235` pattern). Add optional `ownerUserId` to `ToolContext` only (`tool-registry.ts`); in `provisionSession` (`session-provisioning.ts`) call `resolveOwnerUserId(db)` once, set `toolContext.ownerUserId`, and pass it to `resolveConnectorTools`. **Do NOT touch `ProvisionSessionParams` or either route call site** — resolution is internal to provisioning so `routines-routes.ts` (no HTTP userId) and `sessions-routes.ts` both work unchanged. Proof: unit test on `resolveOwnerUserId` (seeded human → its id; unseeded → `"u-founder"`) + the live-proof integration asserting the resolved owner's connection credential reaches the handler. *Protected:* must not alter any AL7 test. *Red first* on the unit.
6. **Connector resolver + provisioning wiring** — `mcp/outbound/connector-resolver.ts` (`resolveConnectorTools`, enumerating `userId AND authSource="token"` rows only) + a minimal `resolveConnectorSpec(service)` config seam; in `session-provisioning.ts` append the resolved tools to `extraTools` and call `dispose` on teardown. Fail-quiet on unknown spec / null credential. mcp-oauth + harness sources are skipped (out-of-scope-for-AN2-wiring).
7. **Live-proof (primary)** — `_fixture-mcp-server.ts` (real SDK MCP server over http) + `AN2-broker-live.integration.test.ts` covering AC1, AC2 (full 3-step loop), AC3a/b, AC5 integration. *This is the gate: green here = the brokering really works.*
8. **Second service by config** — stdio `_fixture-mcp-server` variant + `AN2-second-service-config.integration.test.ts` (AC4): same broker code, different `ConnectorSpec`.
9. **Optional local-only real-public proof** — `AN2-real-public-server.real-harness.test.ts` (skips when binary/creds absent; never a CI job).
10. **Docs + lore** — `docs/agent-layer/tool-integration.md` (broker = server-side tool handler; credential-attach-at-execution; rides AL7 unchanged); `@lore AN2` on the wrapper handler (why the handler — not a dispatcher — is the broker; AC12 reconciliation) and on `connectOutbound` (credential-redaction + SSRF note).
11. **Verify** — `npm run check && npm run lint && npm run test:all`; confirm the AL7 + AN1 protected suites stay green untouched.

Dependency order: 1→2→3 then 4 (needs 2,3) → 5 → 6 (needs 4,5) → 7 (needs 6, fixture) → 8 → 9 → 10 → 11.

---

## Security & abuse cases

- **SSRF (outbound URL).** *Applicable + addressed.* The `http` `ConnectorSpec.url` comes from the **`resolveConnectorSpec(service)` config seam** (operator-defined, keyed by `Connection.service`), **not** from an agent and **not** from agent-supplied input. (Precedence note: for AN2's `token` sources the schema's `serverUrl` column is NULL — it's populated only for `mcp-oauth` — so the seam is the sole url source; when mcp-oauth becomes brokerable, `serverUrl` becomes the url for those rows. The two never collide in AN2.) Agents cannot inject a target URL. AN2 connects only to URLs from the resolved `ConnectorSpec`. An explicit egress allowlist is deferred to AN4 (registry/trust-tier) and noted there. Never connect to an agent-authored URL.
- **Credential leakage.** *Applicable + addressed (AC3).* Token resolved server-side inside the handler; never in args, `proposedCalls.args`, `registry.definitions`, `inputSchema`, `ToolResult`, or error text. `connectOutbound` must redact the auth header from any thrown error. Containment asserted by AC3b.
- **Tool-name shadowing / spoofing.** *Applicable + addressed.* External names are namespaced `conn__<service>__<tool>` at wrap time; an external connector can never register a bare internal tool name (`commit_file`, `send_message`). Asserted in the wrapper unit test.
- **Malicious external input schema (community connector).** *Applicable + addressed.* `jsonSchemaToZod` does no `eval`, no `$ref` fetch; unknown constructs degrade to `z.unknown()` / loose object. The external server still validates its own input. Trust-tier vetting is AN4.
- **Forged reversibility hint (`idempotentHint` gate-bypass).** *Applicable + addressed (the trust-boundary decision).* A malicious/buggy external server can declare `idempotentHint:true` on a genuinely destructive op; if honored, `classifyReversibility` returns `reversible` and the op runs **direct, ungated** — a real bypass, because the hint is third-party-owned, not Kernel-owned. **Mitigation:** `wrapBrokeredTool` honors annotations **only for `trustTier="vetted"` sources**; for **unvetted (`community`) sources it drops the annotations** → fail-closed → all-brokered. AN2 has no vetted path (AN4 builds it), so **every brokered op in AN2 is gated** and no forged hint can reach direct execution. This is a *conscious* deferral made safe — not a trust of the hint. Asserted: `AN2-classify.test.ts` proves a `community` source with `idempotentHint:true` still classifies **irreversible**.
- **Unbounded reversible calls (rate-limit).** *N/A for AN2.* No new HTTP route; calls are agent-loop-driven and bounded by the existing per-run/session budget. Irreversible calls are gated by AL7. Revisit if a brokered read becomes a paid/side-effecting hotspot.
- **Path traversal.** *N/A* — no path input introduced by AN2.
- **At-most-once / replay.** *Inherited from AL7* — CAS-consume of `tailoredGrants` + `proposedCalls` capture UNIQUE index; AC2 step 3 proves no double-execute.

---

## Route checklist

No new HTTP routes. AN2 operates entirely inside the per-session tool registry (`registry.invoke`) and session provisioning. The AL7 review/grant routes (`packages/server/src/routes/reviews.ts`, `threads.ts`) are reused unchanged — a brokered irreversible call is captured/granted/executed through the exact same path as an internal one. *No middleware/guard to mount.*

---

## Migrations

None. AN2 renames/removes/moves no existing symbol and adds no table or column. `ToolContext.ownerUserId` is an **additive optional** field; `ProvisionSessionParams` is untouched (owner resolved internally via `resolveOwnerUserId`) — no call site breaks.

---

## protectedTests

```
packages/server/src/__tests__/AL7-no-kernel-executor.test.ts
packages/server/src/__tests__/AL7-classifier.test.ts
packages/server/src/__tests__/AL7-two-session-loop.integration.test.ts
packages/server/src/__tests__/AL7-tailored-grant.integration.test.ts
packages/server/src/services/__tests__/AN1-service-connection-resolver.test.ts
packages/server/src/routes/__tests__/AN1-connections.integration.test.ts
```
AN2 rides AL7 + AN1 **unchanged**; if any of these would need editing, the design is wrong (a new kernel-executor or a weakened resolver) — stop and revisit.

## sharedFiles

```
packages/shared/src/index.ts                       # add connector type exports
packages/server/src/tools/tool-registry.ts         # ToolContext.ownerUserId (additive optional)
packages/server/src/services/session-provisioning.ts  # resolveOwnerUserId() call + extraTools wiring (NOT ProvisionSessionParams)
```
`ProvisionSessionParams` is **not** touched (resolution is internal to `provisionSession`), so neither route call site changes. New file `packages/server/src/services/owner-user.ts` is additive. No `schema.ts`, no `router.tsx`, no seed changes — low overlap surface with concurrent workpackages.

---

## Risks / ambiguities

1. **SDK transport API (VERIFIED).** `StreamableHTTPClientTransport` header injection (`requestInit.headers`, streamableHttp.d.ts:77) and `StdioClientTransport` `env` (stdio.d.ts:19) are confirmed present in installed `@modelcontextprotocol/sdk@1.29.0` (critique verification). No remaining drift risk; if a minor/patch bump changes the shape, re-confirm against the installed `.d.ts` — do not invent an API (MEMORY: don't assume external tool capabilities).
2. **`ownerUserId` resolution.** Resolved inside `provisionSession` via `resolveOwnerUserId(db)` = `users WHERE kind='human' LIMIT 1` (fallback `"u-founder"`) — the same lookup `auth.ts` uses, NOT an HTTP-context read (provisioning has no request; `routines-routes.ts` has no `c.get("userId")`). The broker never hardcodes the user; `resolveOwnerUserId` is the single seam that changes when multi-user/team-shared Connections (out of scope) arrive.
3. **Per-call vs per-connection auth.** For `http`/`bearer-header` the credential attaches per outbound request (clean "at execution"). For `stdio`/`env` it attaches at child-process spawn (connection lifetime). Both keep the credential out of the agent session; the live-proof uses the `http` fixture to demonstrate per-call header attach explicitly (AC3a).
4. **Connection→ConnectorSpec mapping.** AN2's `resolveConnectorSpec` config seam is deliberately minimal; AN4 owns the real manifest/registry. Keep the seam a single function so AN4 swaps it without touching the broker.
