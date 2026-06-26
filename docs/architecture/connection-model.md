# Connection model

A **Connection** is a per-(user × service) record that an external service is reachable by that user's agents. It is not a credential and not a tool — it is the **fact of availability** plus a pointer to where the auth for it lives.

Connections are distinct from the [Credential model](./credential-model.md). That doc covers the closed infra-secret catalog (LLM API keys) and its AES-GCM encryption primitive. Connections **reuse** that encryption primitive and resolver pattern but live in a separate open table (`service_connections`) — they never add entries to the infra catalog.

---

## The held-vs-inherited split

Every Connection has one of three auth sources. This is the load-bearing distinction:

| Auth source | Who holds the auth | Example | HyperIdle stores |
|---|---|---|---|
| `token` | HyperIdle | GitHub PAT, Stripe restricted key | AES-256-GCM ciphertext |
| `mcp` | The MCP server | Figma MCP, a self-hosted server | Server URL only |
| `inherited` | The harness / environment | Claude Code's GitHub connector, `gh` CLI login | Nothing |

**Held connections** (`token`, `mcp`) are DB rows. The user creates and removes them. HyperIdle resolves and injects them into the agent's sandbox at spawn (AN2).

**Inherited connections** are not DB rows. They are live projections from the [harness capability descriptor](#am2-descriptor-extension-inheritedtools), reflecting what the harness or PATH-level environment is already configured with. The user does not create or remove them in HyperIdle — that is managed in the harness. HyperIdle holds no auth material for them; the token stays in the OS keychain, never extracted.

This is the concrete meaning of "ride the harness": OAuth-protected services arrive inherited because the harness already holds the auth. HyperIdle never runs a 3-legged OAuth dance and registers no per-service OAuth app.

---

## Connection properties

```
Connection {
  id:         sc-<uuid>          (held)  |  inherited:<harness>:<name>  (projected)
  service:    display name of the service, e.g. "Stripe", "GitHub"
  via:        server-constructed description of where tools come from
  authSource: "token" | "mcp" | "inherited"    — closed set
  health:     "working" | "needs-attention"     — closed set
  removable:  true (held) | false (inherited)
}
```

`via` is always server-constructed — never a raw URL or secret echo:

- `token` → `"API key · stored encrypted"`
- `mcp` → hostname of the MCP server URL
- `inherited` → `"<harness> · <name>"`

`health` starts as `needs-attention` on create (unvalidated). The validate endpoint updates it. A token that stops working becomes `needs-attention` — there is no "expired" state; the 2-set is closed.

---

## AM2 descriptor extension — `inheritedTools`

The [harness capability descriptor](../agent-layer/harness-capability-descriptor.md) (AM2) now carries:

```ts
interface HarnessCapabilityDescriptor {
  // … existing fields …
  inheritedTools: readonly InheritedToolDescriptor[];
}

interface InheritedToolDescriptor {
  name:    string;                             // e.g. "github", "linear"
  kind:    "mcp-server" | "cli";
  harness: string;                             // "claude-code" | "codex" | "environment"
  health:  ConnectionHealth | "unknown";
}
```

`inheritedTools` is populated by `discoverLocalHarnesses()` at probe time:

- **claude-code**: `claude mcp list` — parses `<name>: <rest> - <status>`, maps `✓ Connected` → `working`, anything else → `needs-attention`/`unknown`.
- **codex**: `codex mcp list`; falls back to reading `[mcp_servers.<name>]` keys in `~/.codex/config.toml`. Health is `unknown` (list shows config, not live status).
- **environment**: `gh auth status --json hosts` (never `--show-token`) — if any host has an account, emits `{ name: "github", kind: "cli", harness: "environment", health: "working" }`.

**Evidence-first contract**: probes read only names and liveness. No code path copies an env var, command, keychain value, or token into an `InheritedToolDescriptor` — the type has no secret field.

---

## API surface

```
GET    /api/connections        → ServiceConnectionView[]   (held ∪ inherited)
POST   /api/connections        → 201 ServiceConnectionView  (token or mcp)
DELETE /api/connections/:id    → 204 | 404
POST   /api/connections/:id/validate → { health }
```

`GET` returns inherited projections first, then held rows. Inherited connections have `removable: false`; DELETE of an `inherited:*` id returns 404.

POST accepts a discriminated union — `authSource: "token"` or `authSource: "mcp"`. Inherited connections are never created via the API; they appear automatically from harness discovery.

Rate limits: POST/DELETE 20 req/min; validate 3 req/min.

---

## Shared types (`packages/shared/src/connection.ts`)

```ts
export const CONNECTION_AUTH_SOURCES = ["token", "mcp", "inherited"] as const;
export type ConnectionAuthSource = (typeof CONNECTION_AUTH_SOURCES)[number];

export const CONNECTION_HEALTH = ["working", "needs-attention"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

export const HELD_AUTH_SOURCES = ["token", "mcp"] as const;
export type HeldAuthSource = (typeof HELD_AUTH_SOURCES)[number];

export interface ServiceConnectionView {
  id: string;
  service: string;
  via: string;
  authSource: ConnectionAuthSource;
  health: ConnectionHealth;
  removable: boolean;
}
```

No `trustTier` field exists. ETHOS §2 — security is earned from real learnings, never a preemptive wall.

---

## DB schema (`packages/db/src/schema.ts`)

`service_connections` pgTable — one row per (userId, service, authSource). `inherited` is never a DB row.

Key columns: `id` (sc-\<uuid\>), `userId` (FK → users.id, cascade), `service`, `authSource` ("token" | "mcp" — never "inherited"), `encryptedToken` (nullable, AES-GCM), `serverUrl` (nullable, mcp only), `health`, `lastValidatedAt`.

Unique index on (userId, service, authSource). Per-user index on userId.

---

## Resolver (`ServiceConnectionResolver`)

`packages/server/src/services/service-connection-resolver.ts` — the only path that returns a decrypted token. Wired exclusively to sandbox injection (AN2); never to a route response or logger.

- Queries scoped on `AND(id, userId)` — cross-user lookup returns `null`, never leaks existence.
- Returns `null` for: cross-user, non-existent, mcp rows (no stored token), missing server secret, decryption failure.
- Reuses `decryptCredentialValue` from `credential-encryption.ts` — no forked crypto.

---

## Projection (`ServiceConnectionProjection`)

`packages/server/src/services/service-connection-projection.ts` — projects `descriptors[].inheritedTools` into `ServiceConnectionView[]` at GET time. No DB access, no child-process spawn. Deduplicates by service name across harnesses (first wins).

---

## Hard rules

1. **A stored secret is never returned to a display or log surface** — but it is resolvable server-side for injection into the agent sandbox. A secret appearing in any GET response, UI field, or log line is a defect.
2. **HyperIdle runs no 3-legged OAuth and registers no per-service OAuth app.** Held auth is only a simple secret or an MCP pointer. OAuth services arrive inherited.
3. **Per-user isolation.** One user's connection (held or inherited) is never resolvable, listable, or usable from another user's session. Cross-user reads return 404/null — never 403, never leaking existence.
4. **Inherited connections store no auth material.** A token or keychain value copied into a HyperIdle record is a defect.
5. **The closed infra-credential catalog stays closed.** Connections never add a name to it. `CREDENTIAL_NAMES` and `serverCredentials` are unchanged by this feature.

---

## Vocabulary

| Term | Code prefix | Not |
|---|---|---|
| Connection | `ServiceConnection*` (avoids collision with db-connection noun) | `integration`, `connector`, `account`, `credential` |
| Held connection | auth source `token` or `mcp` | stored connection, managed credential |
| Inherited connection | auth source `inherited`; reflected from harness | native tool (informal only, not in types) |
| Auth source | closed `{token, mcp, inherited}` | auth type, kind, provider |
| Connection health | closed `{working, needs-attention}` | status, validation state |

---

See also: [Credential model](./credential-model.md) — infra-secret catalog, shared AES-GCM primitive. [Harness Capability Descriptor](../agent-layer/harness-capability-descriptor.md) — AM2 descriptor, `inheritedTools` source. [Authorization model](./authorization-model.md) — access boundary, Managed secret definition.
