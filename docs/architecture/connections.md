# Connections

A **Connection** is a per-(user × service) record that an external service is reachable by that user's agents. It is not a credential and not a tool — it is the fact of availability plus a pointer to where the auth for it lives.

## Held vs inherited

Every connection has one of three auth sources:

| Auth source | Who holds the auth | HyperIdle stores |
|---|---|---|
| `token` | HyperIdle | AES-256-GCM ciphertext in `service_connections` |
| `mcp` | The MCP server | Server URL only |
| `inherited` | The harness / environment | Nothing |

**Held connections** (`token`, `mcp`) are database rows. HyperIdle resolves and injects them into the session working directory at spawn time.

**Inherited connections** are not database rows. They are live projections from the connections domain's own reach cache (`InheritedConnectionFact[]`, probed at boot and on `edit_user({ id: me, redetectHarnesses: true })`), reflecting what the harness configs or PATH-level environment are already configured with. HyperIdle holds no auth material for them — the token stays in the OS keychain.

This is what "ride the harness" means: OAuth-protected services arrive inherited because the harness already holds the auth. HyperIdle never runs a 3-legged OAuth dance and registers no per-service OAuth app.

## Connection properties

View shape and closed sets: `framework/domain-model/src/connection.ts` (`ServiceConnectionView`, `CONNECTION_AUTH_SOURCES`, `CONNECTION_HEALTH`).

- **id** — `sc-<uuid>` for held rows; `inherited:<source>:<name>` for projections.
- **authSource** — closed: `token | mcp | inherited`.
- **health** — closed: `working | needs-attention`. A new connection starts `needs-attention` — there is no validate action. A token that stops working becomes `needs-attention`.
- **removable** — `true` for held, `false` for inherited.

## API surface

Connections are a user attribute, read and written through the user actions:

```
open_user({})                                        → { connections: { connections: …, inherited: … } }
edit_user({ id: me, connections: { add: […] } })     → adds a token or mcp connection
edit_user({ id: me, connections: { remove: [id] } }) → removes a held connection
```

`open_user`'s `connections` field is `null` for anyone but the caller. Inherited connections are never created through `connections.add`; they appear from the reach probes.

## Storage

`service_connections` in `framework/db/src/schema.ts` — one row per (userId, service, authSource), enforced by a unique index. `inherited` is never a DB row; the column accepts only `token | mcp`. The token column is AES-GCM ciphertext, present only for `token` rows; `mcp` rows store a server URL only.

## Resolver

`layers/agent-orchestration/connections/src/service-connection-resolver.ts` — the only path that returns a decrypted token. Queries scoped on `AND(id, userId)` — cross-user lookup returns `null`. Returns `null` for: cross-user, non-existent, mcp rows, decryption failure. Never throws.

## Inherited reach

`createInheritedReach()` (`layers/agent-orchestration/connections/src/inherited-reach.ts`) probes four sources — claude-code, codex, opencode, and the `gh`-CLI environment — at boot and on redetect. The fact type carries identity only; no code path copies a token into it.

## Hard rules

1. **Plaintext never reaches a route response, UI field, or log line.**
2. **HyperIdle runs no 3-legged OAuth and registers no per-service OAuth app.**
3. **Per-user isolation.** One user's connection is never resolvable or listable from another user's session.
4. **Inherited connections store no auth material.**
5. **Connections and the deployment credential (`shared_backend_key`) are unrelated.** See [security.md](./security.md).
