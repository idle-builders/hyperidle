# AN2 — Architecture: Connection provisioning

**Workpackage.** Authenticate a service once (AN1); from then on every spawned session has those tools present and authenticated, gate-free, re-applied per spawn. Backend/runtime only — no UI surface (design phase skipped).

**Fixed inputs (LOCKED — not re-litigated):** `plans/AN2/concept.md` (central noun *Connection provisioning*; satellites *provisioned connection*, *outbound MCP client*; 7 hard rules), `plans/AN2/research-mcp-auth.md` (injection seam grounded against shipping code; per-harness carrier table; live-proof matrix), `docs/architecture/connection-model.md` (AN1 Connection primitive), `docs/architecture/run-unit-model.md` (AQ1 — host working dir, real `$HOME`, no isolation).

---

## 1. Context — what problem, why now

AN1 made "I connected GitHub" a durable, encrypted, per-user fact (`service_connections` rows + `ServiceConnectionResolver`). Nothing re-applies that fact to a spawning session. AN2 is the seam that turns the Connection into capability: at spawn, before the harness starts, read the owning human's active **held** connections, resolve each, and write the materialized form into the session working dir / child env so the agent's tools authenticate directly.

Two seams AN1 left explicitly for AN2 (`routes/connections.ts:48`, `:357`): DNS-rebinding SSRF hardening on outbound reach, and a live MCP reachability probe in `/validate`.

**AQ1 simplification (already reconciled in concept):** one provisioning target — a host working dir with the real `$HOME` (`LocalSandboxAdapter`). Inherited tools work for free (harness reads `$HOME`); held connections are the entire AN2 job. Provisioning into an isolated run-unit is AQ2, out of scope.

---

## 2. Constraints

From the concept's 7 hard rules + AN1 + the TS ruleset:

1. **No gate.** Provisioning installs tools; never interposes review/approval/reversibility. No new policy engine. Review rides AL7 only where already chosen.
2. **Re-apply every spawn.** No durable provisioned state; re-derived from `service_connections` each spawn. Idempotent across respawns.
3. **Secret may live in the working dir / child env the agent controls — NEVER in real `$HOME`, never logged, never shown.** Resolved only via `ServiceConnectionResolver` — the single plaintext path. No secret in a route response, log line, or `HarnessEvent`.
4. **Per-user isolation.** One user's connection never provisions into another user's session. The resolver enforces `AND(id, userId)`; AN2 must pass the correct `userId`.
5. **Never extract inherited auth.** Held (`token`, `mcp`) only. `inherited` is present via `$HOME` — zero work.
6. **Ride the MCP standard outbound.** A new service is a `service_connections` row + config, never per-service client code.
7. **Live-proof per harness, real CLI, real deployed session.** A stub of our own client is not proof. Local-lane only, never a GitHub Actions job. Where a harness has no carrier for a connection kind, "scoped out with reason" is a legitimate outcome.

Plus ruleset constraints: TS strict (no `any`/`as`), explicit return types, Drizzle only, no `console.log` (use observability adapter or the existing `console.warn` graceful-degradation pattern already in Phase 8b — which carries a `biome-ignore lint/suspicious/noConsole`), workspace imports.

---

## 3. Plan reconciliation — every named symbol verified against the codebase

| Symbol | Where it lives today | AN2 action |
|---|---|---|
| `serviceConnections` pgTable | `packages/db/src/schema.ts:1278` (`userId`→`users.id`, `service`, `authSource`, `encryptedToken`, `serverUrl`, `health`) | **Reuse unchanged. No new durable table** (provisioning holds no state). |
| `ServiceConnectionResolver` | `services/service-connection-resolver.ts:21` — constructed at `app.ts:416` as `new ServiceConnectionResolver(options.db, getServerSecret())`; `.resolve(userId, connectionId)` (`:39`) is the **sole plaintext path**, `AND(id,userId)`, returns `null` for non-token/cross-user/missing-secret | **Consume the already-constructed instance. Do not fork, do not re-pass `serverSecret`.** Active-held list is a *sibling reader* in the new module, not a new resolver method (keeps the resolver token-only — see §5 T1, N4). |
| `getServerSecret()` | invoked once at `app.ts:416` to build the resolver | **Not threaded into AN2.** The secret stays encapsulated inside the one resolver instance (hard-rule 3). AN2 never holds the raw secret. |
| `HELD_AUTH_SOURCES = ["token","mcp"]` | `packages/shared/src/connection.ts:27` | Keys the closed materialization set. |
| `ProvisionSessionDeps` | `services/session-provisioning.ts:178` (`db, eventBus, adapterPool, workspace, mcpBridgeRegistry?, mcpBaseUrl?`) | **Add ONLY** `serviceConnectionResolver?` (optional → graceful no-op when unconfigured, mirroring `mcpBridgeRegistry?`). **No `serverSecret?` field** — that would open a second decryption path against hard-rule 3 (W2). The resolver already encapsulates the secret. |
| Phase 8b spawn seam | `session-provisioning.ts:731–794` — writes `.mcp.json` (claude), calls `writeCliMcpConfig` (codex/opencode), threads `mcpTokenEnv` | **Hook here, parallel to the inbound bridge** (never inside it). AN2 writes its own server entries + token env. |
| `writeCliMcpConfig({dialect, sandboxPath, mcpUrl, token})` | `harness/cli-mcp-config.ts:66` — emits a single `hyperidle` entry per dialect | **Generalize** to N named servers (see §6) — additive, does not break the inbound caller. |
| claude `.mcp.json` writer | inline in Phase 8b (`session-provisioning.ts:753`, `mcpServers.hyperidle`) — **not** in `writeCliMcpConfig` | claude's writer is inline; AN2 must add held entries to the same `mcpServers` object. **#374 tension — see §7.** |
| `selectedAdapter.meta.type` | `session-provisioning.ts:427`/`:672`/`:967` — the harness identity in `runSession` scope; value `"claude-code"` for claude, `"builtin"` for builtin (`adapter-pool.ts:158`) | **The discriminator.** claude = `selectedAdapter.meta.type === "claude-code"`. There is **no** `harnessType` local in `runSession` (W4). |
| `SessionConfig.mcpTokenEnv?: Record<string,string>` | `shared/src/harness/harness-adapter.ts:150`; injected outside allowlist at `cli-harness-adapter.ts:399` | **Reuse verbatim** for CLI-key env injection (`GH_TOKEN`) and codex per-server `bearer_token_env_var`. CLI-only — builtin never reads it (`:399` lives in `cli-harness-adapter`, not builtin). |
| `buildSandboxedEnv` | `cli-harness-adapter.ts:278` — allowlist + `resolvedEnvMap`; injected vars not from `process.env` | The existing carrier for "secret in child env, not `$HOME`". AN2 rides it. **CLI harnesses only.** |
| `resolveUrlForSSRF(url, opts)` | `shared/src/net/ssrf.ts:193` — full DNS-resolution gate; **returns the resolved public `addresses[]` so a caller can pin one for the subsequent connect** (`:182-192`, "prevents DNS rebinding between this check and the outbound connect") | **The AN2 outbound SSRF gate.** Pinning is only possible where AN2 owns the connect (`/validate`). For written harness config the harness owns the connect — check-only, no pin (see W3 honesty in §6/§7). |
| `isPrivateHostLiteral` | `shared/src/net/ssrf.ts:97` — used by AN1 POST literal check | Already in place; AN2 adds the async resolution layer via `resolveUrlForSSRF`. |
| Owning human user | `auth.ts:202` — local-trust single-founder: one `users` row `kind="human"`; AN1 routes set `userId` = that human | **Connections belong to the human, not the agent.** See §4. |
| `@modelcontextprotocol/sdk` (`McpServer`, `WebStandardStreamableHTTPServerTransport`) | `mcp/mcp-bridge.ts:2-4` | The in-repo standard MCP server for the live-proof test rides this SDK. |
| `BuiltinHarnessAdapter` | `builtin-harness-adapter.ts` — `mcpSupport: false` (`:352`); runs an **in-process** loop via `callLlm()` (`:34`) executing tools through `ToolRegistry` (`:32`). **Zero references to `mcpTokenEnv`; never spawns a child; never execs a CLI.** | **Scoped OUT of BOTH carriers** (no MCP config file, no child-env path). Builtin's external reach is the inbound MCP bridge (HyperIdle's own registry tools), which AN2 does not own. See §6 builtin row, §7.4, C1 in critique. |
| Real-CLI test lane | `*.real-harness.test.ts` run via `npm run test:real-harness` (`vitest.real-harness.config.ts`); **excluded** from both `test` and `test:integration` (`packages/server/vitest.config.ts:13`). Precedents: `cli-adapter-real-binary.real-harness.test.ts`, `AL6-real-harness-return-enforcement.real-harness.test.ts`, `AL7-two-session-trust-first.real-harness.test.ts` | **The home for the per-harness live-proof matrix** (W1). Not `*.integration.test.ts`. |

---

## 4. The ownership decision (the one load-bearing ambiguity, resolved)

`service_connections.userId` → `users.id`. AN1 routes set `userId = c.get("userId")`, which `auth.ts:202` resolves to **the single `kind="human"` user** (local-trust single-founder). A session's `params.agentId` is a **different** `users` row (`kind="ai"`).

**Decision: provisioning resolves connections for the owning human user, not the agent's user id.** Concept Phase 1(d) "per-user scoped (the spawning session's owner's connections)" + connection-model.md "the user's agents". The agent acts on behalf of its owning human.

**Resolution rule (T1):** `resolveOwningHumanUserId(db)` returns the single `kind="human"` user id (mirrors `auth.ts:202-204`, fallback `"u-founder"` for unseeded DBs/tests). This is the `userId` passed to the resolver and the active-held query.

> **@lore AN2 ownership:** Single-founder is the locked deployment (authorization-model.md:32). A multi-tenant model (agent→explicit-owner FK) is a future change gated by the same trigger as RLS; not built now. The seam (`resolveOwningHumanUserId`) is the one place a future per-agent-owner lookup would slot in. Hard-rule 4 (per-user isolation) holds today because there is exactly one human; the resolver's `AND(userId)` is the durable enforcement when that stops being true.

---

## 5. Provisioning design (the central act)

A new module `services/connection-provisioning.ts` exporting one pure-ish function called from Phase 8b, parallel to the inbound bridge block.

### Types (new — all in the new module unless noted)

```ts
// One held connection resolved into its in-sandbox form. Discriminated on authSource.
// Closed set keyed by HELD_AUTH_SOURCES (concept Phase 4 closure).
type ProvisionedConnection =
  | { authSource: "token"; service: string; carrier: TokenCarrier }
  | { authSource: "mcp";   service: string; serverUrl: string };  // outbound MCP pointer

// How a resolved token reaches the agent's tools. Decided per connection from service config.
type TokenCarrier =
  | { kind: "mcp-bearer"; serverUrl: string; token: string }   // external MCP server + Bearer
  | { kind: "cli-env";    envVar: string;   token: string };   // e.g. GH_TOKEN → real gh

// The full set written for one spawn (input to the per-harness carrier writers).
interface ProvisioningPlan {
  readonly mcpServers: readonly ResolvedMcpServer[];   // claude/codex/opencode config entries
  readonly envInjections: Readonly<Record<string, string>>; // merged into SessionConfig.mcpTokenEnv
}

interface ResolvedMcpServer {
  readonly name: string;       // service slug, e.g. "github" — server entry key
  readonly url: string;        // external MCP server URL (SSRF-checked at provisioning time)
  readonly bearerToken?: string; // present for token-MCP; absent for plain mcp (server holds its own auth)
}
```

> **Held→carrier decision (the `token` fork).** A held `token` connection is either an MCP-server bearer or a CLI key. AN1 stores no `kind` discriminator. **Decision:** carry it as a **CLI-env injection keyed by a closed service→envVar map** when the service slug matches a known CLI consumer (`github → {GH_TOKEN, GITHUB_TOKEN}`); otherwise carry it as an **MCP bearer** if the connection also has a `serverUrl`. A bare `token` with no `serverUrl` and no known CLI mapping is provisioned as a CLI-env injection under a conventional `<SERVICE>_TOKEN` var **and logged (no secret) as "carrier-by-convention"** so the gap is visible, never silent (research §4 — "inject ≠ used"). The map is config (`SERVICE_CLI_ENV: Record<string, readonly string[]>`), never per-service code (hard-rule 6). `git` is documented as needing a credential helper, not a bare env var (research §4) — out of scope to auto-wire; documented.

### Function signatures

```ts
// services/connection-provisioning.ts
export async function buildProvisioningPlan(deps: {
  readonly db: HyperIdleDb;
  readonly resolver: ServiceConnectionResolver; // already secret-bearing; AN2 never sees the raw secret
  readonly userId: string;          // owning human (from resolveOwningHumanUserId)
}): Promise<ProvisioningPlan>;

// Reads active held connections for userId, resolves each (token: decrypt via resolver;
// mcp: serverUrl), SSRF-checks every outbound URL via resolveUrlForSSRF (drops + logs
// any that fail to resolve to a public IP — never throws, never blocks the spawn),
// returns the plan. NOTE: SSRF is a provisioning-TIME check; it cannot pin the harness's
// later connect (W3) — the written URL is a hostname the harness re-resolves.

export async function applyProvisioningPlan(args: {
  readonly plan: ProvisioningPlan;
  readonly sandboxPath: string;
  readonly cliMcpDialect?: "codex-toml" | "opencode-json"; // from adapterCapabilities
  readonly claudeNative: boolean;   // true when harness writes .mcp.json (claude-code)
}): Promise<{ readonly mcpTokenEnv: Record<string, string> }>;

// Writes the per-harness carrier (see §6) into sandboxPath, returns env to merge into
// SessionConfig.mcpTokenEnv. Pure filesystem + return; no DB, no network.

// services/connection-provisioning.ts (sibling reader — NOT a resolver method, N4)
export async function listActiveHeld(
  db: HyperIdleDb,
  userId: string,
): Promise<readonly { id: string; service: string; authSource: "token" | "mcp"; serverUrl: string | null }[]>;

export async function resolveOwningHumanUserId(db: HyperIdleDb): Promise<string>;
```

### Active-held read (T1)

A **sibling reader** `listActiveHeld(db, userId)` in `connection-provisioning.ts` (NOT a method on the resolver — N4: the resolver's docstring says it is "the ONLY path that returns a decrypted token"; adding a non-token list method muddies that single responsibility). Returns `{id, service, authSource, serverUrl}` (NOT the token; the token is resolved per-row via `resolver.resolve()`). Scoped `eq(userId)`, `authSource in ("token","mcp")`. "Active" = exists (AN1 has no disabled state; disconnect = row deleted, so absence is disconnect — satisfies "disconnect reflected next spawn" by construction).

### Phase 8b hook (T3)

Inside the existing `if (mcpBridgeRegistry && mcpBaseUrl)` is the **inbound** path. AN2 adds a **sibling** block (runs regardless of the inbound bridge, gated only on `serviceConnectionResolver` being configured):

```
// ── Phase 8b-connections: AN2 Connection provisioning (parallel to inbound bridge).
if (serviceConnectionResolver) {
  try {
    const userId = await resolveOwningHumanUserId(db);
    const plan = await buildProvisioningPlan({ db, resolver: serviceConnectionResolver, userId });
    const { mcpTokenEnv: connEnv } = await applyProvisioningPlan({
      plan, sandboxPath,
      cliMcpDialect: adapterCapabilities.cliMcpDialect,
      claudeNative: !adapterCapabilities.cliMcpDialect && selectedAdapter.meta.type === "claude-code",
    });
    mcpTokenEnv = { ...(mcpTokenEnv ?? {}), ...connEnv };  // merge with inbound codex token
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge :789
    console.warn(`[connection-provisioning] failed for session ${sessionId}; continuing without external tools:`, err);
  }
}
```

The discriminator is `selectedAdapter.meta.type === "claude-code"` (W4 — there is no `harnessType` local in `runSession`; `selectedAdapter.meta.type` is the real identity, confirmed at `session-provisioning.ts:427`/`:672`).

This block runs **only for CLI harnesses** in practice: `applyProvisioningPlan` writes config files + returns env, and that env only reaches a child via `cli-harness-adapter.ts:399`. For a builtin session there is no child and no MCP config file — see the builtin scope-out (§6, §7.4). The merged `mcpTokenEnv` flows into `sessionStartConfig.mcpTokenEnv` (already wired, `:878`) → injected outside the allowlist at `cli-harness-adapter.ts:399`.

Graceful degradation matches the inbound-bridge try/catch (`:785`): a provisioning failure must never abort the spawn (concept — installs tools, steps out of the way; a missing tool is not a session-killer). The `console.warn` carries the same `biome-ignore lint/suspicious/noConsole` as the inbound pattern (N1), else lint fails.

**Idempotence/respawn:** the function is a pure read-projection of `service_connections` + a fresh `sandboxPath` each spawn. Respawn re-runs it from scratch; teardown (`rm -rf` working dir) destroys all provisioned connections. No deprovision step.

---

## 6. Per-harness carrier table (the materialization fan-out)

| Harness | `token` (MCP bearer) | `token` (CLI key) | `mcp` (pointer) | Writer | Live-proof (lane: `*.real-harness.test.ts`) |
|---|---|---|---|---|---|
| **claude-code** | add `mcpServers.<svc> = {type:"http", url, headers:{Authorization:"Bearer <tok>"}}` to the inline `.mcp.json` | env injection via `mcpTokenEnv` | `mcpServers.<svc> = {type:"http", url}` | extend inline `.mcp.json` writer in Phase 8b to merge AN2 entries into `mcpServers` | held external MCP server connects without trust prompt + tool call returns real data |
| **codex** | append `[mcp_servers.<svc>]` `url` + `bearer_token_env_var="<SVC>_MCP_TOKEN"` to `.codex-home/config.toml`; token via `mcpTokenEnv["<SVC>_MCP_TOKEN"]` (outside allowlist, `CODEX_HOME`) | env injection via `mcpTokenEnv` | `[mcp_servers.<svc>]` `url` only | generalize `writeCodexToml` to N named blocks + return N tokenEnv entries | external server authenticates with per-session token + tool call succeeds |
| **opencode** | add `mcp.<svc> = {type:"remote", url, headers:{Authorization:"Bearer <tok>"}, enabled:true}` to `opencode.json` | env injection via `mcpTokenEnv` | `mcp.<svc> = {type:"remote", url, enabled:true}` | generalize `writeOpencodeJson` to N named blocks (token inline) | external server authenticates + tool call succeeds |
| **CLI-key sub-case** | n/a | inject `GH_TOKEN`/`GITHUB_TOKEN` (service→env map) into child env via `mcpTokenEnv` → real `gh` | n/a | env map in plan; no config file | real `gh` op succeeds; `git` documented as needing a helper |
| **builtin** | **scoped out (reasoned):** `mcpSupport:false` (`:352`), no MCP config file path | **scoped out (reasoned):** builtin runs an **in-process** `callLlm()` loop (`:34`) executing `ToolRegistry` tools — it **never spawns a child and never reads `mcpTokenEnv`** (zero references). A `GH_TOKEN` in `mcpTokenEnv` for a builtin session goes nowhere (dead write). | **scoped out:** no carrier | none — AN2 writes nothing for builtin | **NOT a carrier to prove.** Builtin's external reach is the inbound MCP bridge (HyperIdle's own registry tools), a separate path AN2 does not own. AC3's builtin cell = *scoped out with reason* (hard-rule 7), never *proven*. |

**Builtin: do not inject `mcpTokenEnv` for a builtin session** — it is a dead write with no carrier. The Phase 8b-connections block runs for builtin only to the extent it writes nothing it can carry; in practice the plan for a held connection has no builtin destination.

**Carrier generalization is mechanical (research §3, 1→N):** all three CLI writers already emit exactly one `hyperidle` entry; AN2 emits one per held connection. codex's `bearer_token_env_var` is already per-server. Per-server token env var name = `<UPPER_SERVICE>_MCP_TOKEN` to avoid collision with the inbound `HYPERIDLE_MCP_TOKEN`.

### Outbound MCP client path (satellite noun)

For every `mcp` connection and every token-MCP-bearer connection, the materialized form is a **server entry the harness's own MCP client reads** — HyperIdle does not proxy. The harness connects out to the service's MCP server directly (inverse of the inbound bridge). **HyperIdle writes no per-service code** — a new service is a new `service_connections` row + (optionally) one line in the `SERVICE_CLI_ENV` map.

**SSRF residual (W3 — honest boundary).** The outbound URL is SSRF-checked via `resolveUrlForSSRF` in `buildProvisioningPlan` before it is written; a URL that resolves to a private IP **at provisioning time** is dropped with a logged reason (never blocks the spawn, never written). But the written config carries the **hostname**, and the harness owns the later MCP connect — AN2 cannot pin the resolved IP into the harness's client. **So the written-config path is NOT DNS-rebinding-guarded.** The provisioning-time check catches a host that is private *now*; a rebind between provisioning and the harness's connect is unguarded. This is acceptable as the honest boundary: the held MCP server URL is one the user themselves configured (AN1), so rebinding it is low-value to an attacker, and pinning is impossible without proxying — which the concept forbids (hard-rule 6). DNS-rebinding *guarding* is claimed ONLY on the `/validate` probe (T5), where AN2 owns the connect and pins the resolved IP.

---

## 7. Plan-vs-reality tensions (#374 and others)

1. **#374 made claude a real CLI subprocess, but claude's `.mcp.json` is NOT written by `writeCliMcpConfig`.** It is written inline in Phase 8b (`:753`), because claude reads its own native `mcpServers` format and its `cliMcpDialect` is absent (`CLAUDE_CLI_CONFIG` sets no `mcpConfig`; `getCapabilities` only sets `cliMcpDialect` when `mcpConfig` exists). **Consequence:** AN2 must extend the **inline claude writer** for the claude path AND `writeCliMcpConfig` for codex/opencode — two write sites, not one. The `claudeNative` flag in `applyProvisioningPlan` (set from `selectedAdapter.meta.type === "claude-code"`) discriminates. Cleaner alternative considered: route claude through `writeCliMcpConfig` with a new `"claude-json"` dialect — **rejected for AN2 scope** (refactors a shipping inbound path; AN2 should extend, not restructure). Flagged for a future consolidation.

2. **claude `bypassPermissions` + `--strict-mcp-config` (research risk "project-MCP trust").** `CLAUDE_CLI_CONFIG` already runs `--permission-mode bypassPermissions` and `--strict-mcp-config .mcp.json` (`adapter-pool.ts:457-463`). This is the exact condition under which an external project-scoped MCP server connects **without** a trust prompt in a headless spawn. ⚠️ **UNVERIFIED against an external held server** — the live-proof claude run (real-harness lane) must confirm no prompt blocks the connection (research §4 cites claude-code #38972 / claude-ai-mcp #112 where static Bearer HTTP MCP was flagged "needs authentication"). If a prompt does block it, the carrier is the bug, not the test — escalate, do not weaken the test.

3. **codex `--dangerously-bypass-hook-trust` is appended only when `.codex-home/` exists** (`cli-harness-adapter.ts:382`). AN2's codex carrier writes into the same `.codex-home/config.toml` (via generalized `writeCodexToml`), so it must run after / coexist with the existing `provisionCodexHome` + inbound write. The append-based writer (`fs.appendFileSync`) already composes; AN2's N blocks append to the same file. Verify ordering: AN2's codex write must land before `startSession` reads `CODEX_HOME` — it does, since both are in Phase 8b before Phase 9.

4. **builtin can't carry ANY held connection (C1).** `mcpSupport:false`, no config file, **and** an in-process loop with no child and no `mcpTokenEnv` read — so neither the MCP carrier nor the CLI-key carrier exists for builtin. Both are documented scope-outs (concept hard-rule 7 allows "scoped out with reason"). Builtin's external-tool story is the **inbound** MCP bridge (HyperIdle's own registry tools), which AN2 does not own. AC3's builtin cell is *scoped out with reason*, never *proven* — claiming the CLI-key path "works" for builtin would be a false claim with no real path behind it ([[mock-validation-trap]] shape).

5. **`mcpTokenEnv` merge order.** The inbound bridge sets `mcpTokenEnv = {HYPERIDLE_MCP_TOKEN}` for codex (`:782`). AN2 merges its per-service tokens into the same object. Distinct var names (`<SVC>_MCP_TOKEN`) prevent collision. The merge in the Phase 8b-connections block must spread the inbound value first.

---

## 8. Acceptance criteria → verification method

AC text from `TRACK-AN.md:89-96`. Each maps to a concrete test. Two lanes carry the proof:

- **Config-shape** assertions (server entry written, env returned, idempotence, cross-user isolation, disconnect) — `*.integration.test.ts` (DB fixture, **no real binary**), in `npm run test:integration` / `test:all`.
- **Per-harness live proof** (real `claude`/`codex`/`opencode`/`gh` actually call a real MCP server / real CLI) — `*.real-harness.test.ts` via `npm run test:real-harness` (W1). This lane is **excluded** from `test` and `test:integration` (`packages/server/vitest.config.ts:13`), local-only, skip-loud where a binary is absent. Precedents: `AL6-…real-harness.test.ts`, `AL7-…real-harness.test.ts`, `cli-adapter-real-binary.real-harness.test.ts`.

| # | AC | Verification |
|---|---|---|
| AC1 | After connecting once, every spawned session has the service's tools present + authenticated; no per-session re-auth | **integration** `connection-provisioning.integration.test.ts`: seed a held `token`+`serverUrl` connection for the human user; call the real `provisionSession` path (or `buildProvisioningPlan`+`applyProvisioningPlan` against a real `sandboxPath`); assert the harness config file in `sandboxPath` contains the server entry + the bearer/env carrier. |
| AC2 | Agent performs a real op against a real connected service end-to-end, gate-free | **real-harness** lane (≥1 carrier, real CLI): spawn a real deployed session through a real harness, point it at an in-repo standard MCP server (built on `@modelcontextprotocol/sdk`) over a real transport; assert the agent retrieved real data. No AL7/gate in the path. |
| AC3 | **Injection proven per harness** (claude / codex / opencode / CLI-key; **builtin scoped out**) against a real deployed session | **real-harness live-proof matrix** (§6 last column): one `*.real-harness.test.ts` per carrier, each spawning the real binary where present, hitting a real MCP server / real `gh`. Missing binary → **skip loud, logged reason**; WP not `done` until each *carrier-bearing* harness has a real run where its binary exists. **builtin: no carrier exists (C1) → cell reads *scoped out with reason*, not *proven*; AC3 does not require a builtin live run.** A stub of our own client is NOT proof. |
| AC4 | Survives respawn: destroy sandbox, spawn fresh, same tools work | **integration**: run `applyProvisioningPlan` into sandbox A, `rm -rf` A, run into fresh sandbox B with the same seeded connections; assert B's config is byte-equivalent (idempotent re-projection) and contains the entries. |
| AC5 | Works for >1 service; a second service reachable by **configuration, not new code** | **integration**: seed two distinct held connections; assert both server entries present after provisioning; the test adds the second purely by inserting a row (+ at most a `SERVICE_CLI_ENV` map line) — the assertion proves both entries materialize from one generic plan-builder path; the "no new per-service module/branch" static property is a `/review` simplification lens (N2), not a filesystem grep. |
| AC6 | Connect/disconnect changes the next spawn's tools; after disconnect the tool is gone | **integration**: provision with connection present → entry exists; `DELETE` the row (or omit it); re-provision into a fresh sandbox → entry absent. Proves spawn-time read + absence-is-disconnect. |
| AC7 | One user's tools never present in another user's sandbox | **integration**: seed connection for human user H; provision a session whose owner resolves to H → present. Add a second human row H2 with its own connection; assert provisioning for H's session contains only H's entries (resolver `AND(userId)` + `resolveOwningHumanUserId`). |
| HR3 | Secret never logged / never in a route response / never in an event; resolved only via the resolver | **unit** `connection-provisioning.test.ts`: assert `buildProvisioningPlan`/`applyProvisioningPlan` write the token only into the config file / env return, never into any logged string; assert the `console.warn` graceful-degradation path receives no token. Assert AN2 holds no `serverSecret` and never decrypts except through `resolver.resolve()` (no second decryption path — W2). The existing AN1 route tests already prove routes never echo the secret (unchanged). |
| Outbound SSRF | Outbound reach SSRF-checked at provisioning time (NOT rebinding-guarded on the written path — W3) | **unit**: feed `buildProvisioningPlan` a connection whose `serverUrl` host resolves to a private IP (injected `lookup`); assert the entry is dropped + logged, never written. Reuses `resolveUrlForSSRF`. The written-config path is documented as check-only (no pin); rebinding-guard is asserted only on `/validate`. |
| `/validate` probe | mcp connection health from a live reachability probe (AN1 seam `:357`); **DNS-rebinding-guarded (pins resolved IP)** | **integration**: stand up the in-repo MCP server; `POST /:id/validate` for an `mcp` connection → `working`; point at an unreachable/SSRF host → `needs-attention`. AN2 owns this connect, so it pins the `resolveUrlForSSRF` address — the one path where rebinding is genuinely guarded. |

All runtime ACs are tests that import and assert on behavior (per CLAUDE.md). AC5's "not new per-service code" static property is enforced by the generic plan builder + a `/review` simplification lens, not a filesystem grep dressed as a test.

---

## 9. Ordered tasks

Each task names files + the test that proves it. Red (failing test) before green, per CLAUDE.md.

**T1 — Active-held read + owner resolution.**
Files: new `services/connection-provisioning.ts` — sibling reader `listActiveHeld(db, userId)` (NOT a resolver method — N4) + `resolveOwningHumanUserId(db)`.
Proves: `connection-provisioning.test.ts` — returns the human user id; lists only that user's held rows; cross-user excluded.

**T2 — `buildProvisioningPlan` (resolve + SSRF + carrier decision).**
Files: `services/connection-provisioning.ts`, consume the already-constructed `ServiceConnectionResolver.resolve` (no `serverSecret` threaded — W2), `resolveUrlForSSRF`, `SERVICE_CLI_ENV` const + `HELD_AUTH_SOURCES`.
Proves: unit — token→cli-env for github; token+serverUrl→mcp-bearer; mcp→pointer; private-IP serverUrl dropped+logged; secret never in a logged string; no decryption path other than `resolver.resolve()`.

**T3 — `applyProvisioningPlan` + per-harness writers.**
Files: `services/connection-provisioning.ts`; generalize `harness/cli-mcp-config.ts` `writeCodexToml`/`writeOpencodeJson` to N named servers (additive — inbound `hyperidle` entry unchanged); extend the inline claude `.mcp.json` writer (factor it into a small `writeClaudeMcpJson(sandboxPath, servers)` helper in `cli-mcp-config.ts` so claude + codex + opencode share one module).
Proves: unit per dialect — N server entries written; codex returns N `<SVC>_MCP_TOKEN` env entries; opencode inline headers; claude `mcpServers` merged; the `(github token)` vs `(github mcp)` key-collision suffix (`github` / `github-mcp`) is asserted deterministically (N3); **never writes into `$HOME`** (assert paths are under `sandboxPath`).

**T4 — Phase 8b-connections hook + deps wiring.**
Files: `services/session-provisioning.ts` (add ONLY `serviceConnectionResolver?` to `ProvisionSessionDeps` — **no `serverSecret?`**, W2; add the sibling block §5 using `selectedAdapter.meta.type === "claude-code"`, W4; merge into `mcpTokenEnv`; carry the `biome-ignore noConsole`, N1); wire the **already-constructed** resolver from `app.ts:416` into the deps at the server-factory / route call site (mirroring `mcpBridgeRegistry`/`credentialResolver`).
Proves: `connection-provisioning.integration.test.ts` (AC1, AC4, AC6, AC7) — real `provisionSession` path writes the carrier; respawn idempotent; disconnect removes; cross-user isolation. Config-shape only — no real binary.

**T5 — Outbound `/validate` live MCP reachability probe (AN1 seam).**
Files: `routes/connections.ts` `:357` — replace the AN1 `mcp → needs-attention` stub with a real reachability probe: `resolveUrlForSSRF` → **pin the resolved IP** → MCP `initialize`/list over the real transport → `working`/`needs-attention`. Reuse the SDK client. This is the one path that is genuinely DNS-rebinding-guarded (W3).
Proves: integration (`/validate` row in §8) — reachable→working, SSRF/unreachable→needs-attention.

**T6 — Live-proof matrix (per carrier, real CLI) — `*.real-harness.test.ts` lane (W1).**
Files: `harness/__tests__/connection-provisioning-claude.real-harness.test.ts`, `-codex`, `-opencode`, `-cli-gh` (or one `connection-provisioning.real-harness.test.ts` with per-carrier `describe`s + skip-loud guards). Run via `npm run test:real-harness` (excluded from `test`/`test:integration`, local-only). In-repo standard MCP server fixture built on `@modelcontextprotocol/sdk` (`McpServer` + `WebStandardStreamableHTTPServerTransport`) exposing one read tool returning known data; real `gh` for the CLI-key case. **No builtin file** — builtin is scoped out (C1); its absence is the correct, documented outcome.
Proves: AC2, AC3 — each carrier-bearing harness authenticates + calls real data end-to-end; missing binary skips loud; builtin scoped out with logged reason (no live run required).

**T7 — DNS-rebinding SSRF hardening on POST (AN1 seam `:48`).**
Files: `routes/connections.ts` `:51` `isBlockedUrl` — AN1 only blocks IP literals; the load-bearing async resolution guard runs at **provisioning (check-only) + `/validate` (pinned)** since create is a one-shot and DNS can change between create and spawn. **Decision: gate at provisioning + validate**, keep the literal check at POST for fast rejection. Note the honest residual: the written provisioning config is check-only, not rebinding-pinned (W3) — only `/validate` pins.
Proves: covered by T2 (provisioning drop) + T5 (validate, pinned) SSRF assertions.

**T8 — Verify + lore.**
`npm run check` + `npm run lint` + `npm run test` green; `npm run test:integration` green; live-proof run locally per carrier via `npm run test:real-harness`; `@lore` comments at: the ownership seam, the claude-two-write-sites tension, the `<SVC>_MCP_TOKEN` naming, the builtin scope-out (both carriers), the SSRF check-only-vs-pinned residual.

Dependency order: T1→T2→T3→T4 (core path), T5/T7 (outbound hardening, parallel after T2), T6 (live-proof real-harness lane, after T3+T4), T8 last.

---

## 10. Risks & open questions

- **R1 (claude trust prompt).** External Bearer MCP may be flagged "needs authentication" in headless claude despite `bypassPermissions` (#7.2). Mitigation: the live-proof claude run (real-harness lane) is the gate; if it blocks, the carrier is wrong — fix the carrier, never weaken the test. ⚠️ UNVERIFIED until the real run.
- **R2 (token carrier ambiguity).** AN1 stores no `kind` on a `token` connection, so "is this an MCP bearer or a CLI key?" is inferred (service→env map + presence of `serverUrl`). A token meant for an unknown CLI falls back to `<SERVICE>_TOKEN` by convention and is logged. If real usage shows this guesses wrong often, AN3/AN-future adds an explicit `tokenKind` column (AN1 concept-doc update first, per closure rule). Not built now.
- **R3 (`git` over a bare env var).** `git` needs a credential helper, not `GH_TOKEN` (research §4). Out of AN2 scope; documented. `gh` is the proven CLI-key target.
- **R4 (multi-tenant).** Ownership resolves to the single human today. The `resolveOwningHumanUserId` seam is the one change point when per-agent ownership lands; the resolver's `AND(userId)` already enforces isolation. Gated by the same trigger as RLS (authorization-model.md:62).
- **R5 (builtin coverage).** Builtin has NO held-connection carrier (C1) — both MCP and CLI-key are scoped out (in-process loop, no child, no `mcpTokenEnv`, no MCP config file). Its external reach is the inbound MCP bridge (HyperIdle's own registry tools), out of AN2 scope. Recorded as a known capability boundary, not a gap; if a future builtin gains a real child/MCP-client path, the carriers extend there.
- **R6 (SSRF rebinding residual — W3).** The written harness config carries a hostname the harness re-resolves at connect time; AN2 cannot pin the resolved IP into a config it doesn't own the connect for. The written-config path is check-only (private-at-provisioning-time rejected), NOT rebinding-guarded. Only `/validate` (AN2-owned connect) pins. Accepted as the honest boundary: the held MCP URL is user-configured, pinning needs proxying (forbidden by hard-rule 6). Documented, not silently claimed as guarded.

**Open question (non-blocking):** server-entry `name` collision if two connections derive the same service slug — AN1's unique index is `(userId, service, authSource)`, so `(github token)` and `(github mcp)` can coexist and would both want server key `github`. **Decision:** suffix the entry key by authSource when both exist (`github`, `github-mcp`) — deterministic, asserted in T3 (N3). Resolved here; no need to escalate.
