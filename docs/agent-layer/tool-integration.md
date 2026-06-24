# Tool Integration — Connections and the External Tool Path

An agent reaches an external service through a **Connection** the user has made available. The Connection tells HyperIdle which tool source to use; the agent never holds the credential.

This document covers the AN1 foundation: the Connection primitive, the three auth sources, credential containment, and the `ServiceConnectionResolver` seam. Brokered call routing (AN2), sandbox tool provisioning (AN3), and the Connector manifest / ecosystem registry (AN4) are downstream work that builds on this foundation.

---

## What a Connection is

A **Connection** is a per-(user × service) record that says: "this user has made service S available to HyperIdle." The record captures where the agent's authority to use that service comes from. It never contains a live secret the agent can read.

Three auth sources exist, in priority order:

| Source | Stored row? | What HyperIdle holds |
|--------|-------------|----------------------|
| **1. Harness / environment (default)** | No | Nothing — auth lives in the user's harness (Claude Code, Codex, OpenCode) or their CLI logins. Derived live from the harness capability descriptor. |
| **2. User-supplied token (PAT / API key)** | Yes | AES-256-GCM ciphertext of the token, resolved server-side only. |
| **3. MCP server OAuth** | Yes | The MCP server URL and trust tier. The service is the OAuth provider; HyperIdle registers no OAuth app. |

Source 1 is the design default — HyperIdle inherits whatever the user's harness already has authenticated. No paste, no form. Sources 2 and 3 are the add-a-connection paths.

**HyperIdle is never an OAuth provider and registers no per-service OAuth app.** Auth flows go: user → service directly (sources 1/3) or user → HyperIdle as a secure vault (source 2). The user's environment and the service's own OAuth mechanism carry the authority.

---

## Credential containment (hard contract)

A Connection's secret is held by the server and resolved server-side only. It is never:

- Returned by any API endpoint
- Written into the agent's sandbox, environment, or `.mcp.json`
- Logged or placed in any agent-visible surface

The `ServiceConnectionView` type (`packages/shared/src/connection.ts`) enforces this at the type level — it has no token or encrypted-token field. The response builder in `packages/server/src/routes/connections.ts` constructs the `via` display string from `{authSource, serverUrl}` — the raw URL is never echoed.

A token is stored encrypted with the same AES-256-GCM primitive used by the closed infra credential catalog (`credential-encryption.ts`). Write fails loud if no root secret is configured.

---

## Two resolvers, one encryption primitive

AN1 extends the one-store/one-resolver model from `docs/architecture/credential-model.md`:

| Resolver | Table | Purpose |
|----------|-------|---------|
| `CredentialResolver` | `serverCredentials` | Closed catalog: LLM provider keys (Anthropic, OpenRouter, OpenAI-compatible). Keyed by name. No userId. |
| `ServiceConnectionResolver` | `serviceConnections` | Open set: per-(user × service) connections. Keyed by (userId, connectionId). |

Both use `decryptCredentialValue` from `credential-encryption.ts`. The closed catalog is untouched; the open set runs alongside it.

`ServiceConnectionResolver.resolve(userId, connectionId)` returns the plaintext token or `null`. Null means: row absent, deleted, cross-user access, wrong auth source, or no server secret. The AN2 broker calls this seam — a `null` means no credential to attach, so the tool call is refused. This is the AN1-proven seam; the "agent refuses" enforcement is an AN2 acceptance test.

---

## Per-user isolation

Every query is scoped by `userId` extracted from the auth middleware (`c.get("userId")`). No endpoint accepts a userId from the request body.

- `GET /api/connections` — `WHERE userId = ?`
- `DELETE /api/connections/:id` — `WHERE id = ? AND userId = ?` — a row owned by another user returns 404, not 403 (avoids leaking existence)
- A unique index on `(userId, service, authSource)` enforces one connection per user per service per source

---

## The open/closed distinction

Connections are an **open, user-driven set** — any service, any MCP server URL, any user-supplied token. This is distinct from the **closed infra credential catalog** (`serverCredentials`), which holds a fixed set of LLM provider keys managed by the system operator.

The concept rejection that grounds this: adding `userId` to `serverCredentials` would break its `name`-primary-key/singleton invariant and pollute the closed catalog. Two tables, one encryption primitive.

Trust tier (`vetted` | `community`) is recorded on Connection rows. `vetted` means first-party or reviewed; `community` means user-supplied / at-your-own-risk. AN4 owns the Connector manifest and registry that produces vetted status; AN1 only records the value.

---

## The harness group and the AN2 seam

Source 1 (harness/env) rows are derived, not stored. `projectHarnessConnections(descriptor)` in `packages/server/src/services/harness-connection-projection.ts` maps a harness capability descriptor to `ServiceConnectionView[]` rows with `authSource: "harness"`, `removable: false`.

At AN1, `GET /api/connections` passes `null` to `projectHarnessConnections` because `HarnessCapabilityDescriptor` currently exposes only `mcpSupport: boolean` — not the per-server `{name, url, health}` list the projection needs. AN2's outbound MCP client enriches the descriptor with real server data. When that lands, the seam returns the correct rows with no AN1 code change — the seam is fully unit-tested (`AN1-harness-projection.test.ts`) against a real fixture including the with-servers case.

The "Inherited from your environment" UI group renders and is discoverable today; it is empty until AN2 fills the descriptor.

---

## Connection health

Health is a stored column (`usable | needs-attention | expired`) on token and mcp-oauth rows, and a derived value for harness rows. Two write paths:

1. **Connect time** — a new connection is inserted with `health = "needs-attention"` (not yet validated). The `POST /api/connections/:id/validate` endpoint lets AN2 write back the result of a live tool call.
2. **Brokered-call time (AN2)** — when AN2's broker makes a call and the service returns 401/expired, AN2 writes `expired` back via the validate endpoint. AN1 owns the column; AN2 owns the trigger.

An expired or invalid token surfaces as `expired` or `needs-attention` — never silent.

---

## What AN2 / AN3 / AN4 add

This doc describes what AN1 ships. The downstream work:

| WP | Adds |
|----|------|
| **AN2** | Outbound MCP client; resolves a Connector; surfaces its tools into the per-session bridge; routes direct vs brokered calls by reversibility; enriches the harness descriptor with real server data; writes health back on 401. |
| **AN3** | The Tool grant: the localhost MCP endpoint exposing internal + permitted external tools to the sandbox. Per-session isolation. No secrets injected into the sandbox. |
| **AN4** | Connector manifest + two-tier registry (vetted / community); discovery, validation, trust-tier consent; builds on `ui://` canvases so a contributed Connector can ship its review canvas. |

---

## API reference

Routes in `packages/server/src/routes/connections.ts`, mounted at `/api/connections`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/connections` | List stored connections + harness-derived rows for the authenticated user. Returns `ServiceConnectionView[]`. No secret. |
| `POST` | `/api/connections` | Add a token or MCP-server connection. Body: `{service, authSource:"token", token}` or `{service?, authSource:"mcp-oauth", serverUrl}`. Returns `ServiceConnectionView` (201). Token encrypted before insert; never echoed. |
| `DELETE` | `/api/connections/:id` | Remove a connection. Cross-user → 404. Returns 204. |
| `POST` | `/api/connections/:id/validate` | Set health on a connection. AN2 write-back seam. |

All routes: `requireBoundary({kind:"enforced"})` + `authorizeRead`/`authorizeWrite` (AF11). Rate-limited: POST/DELETE 20/min, validate 3/min.

---

## See also

- `docs/architecture/credential-model.md` — the one-store/one-resolver model; AN1 extends this to the open Connection set while keeping the closed infra catalog intact
- `packages/shared/src/connection.ts` — `ServiceConnectionView`, `ConnectionAuthSource`, `ConnectionHealth`, `TrustTier`
- `packages/server/src/services/service-connection-resolver.ts` — the AN2 broker seam
- `packages/server/src/services/harness-connection-projection.ts` — the source-1 projection
- `docs/agent-layer/harness-capability-descriptor.md` — the descriptor AN2 enriches
