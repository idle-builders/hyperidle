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

**Held connections** (`token`, `mcp`) are DB rows. The user creates and removes them. HyperIdle resolves and injects them into the session working directory at spawn (AN2).

**Inherited connections** are not DB rows. They are live projections from the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md), reflecting what the harness or PATH-level environment is already configured with. The user does not create or remove them in HyperIdle — that is managed in the harness. HyperIdle holds no auth material for them; the token stays in the OS keychain, never extracted.

This is the concrete meaning of "ride the harness": OAuth-protected services arrive inherited because the harness already holds the auth. HyperIdle never runs a 3-legged OAuth dance and registers no per-service OAuth app.

---

## Connection properties

The view shape and its closed sets live in `framework/domain-model/src/connection.ts` (`ServiceConnectionView`, `CONNECTION_AUTH_SOURCES`, `CONNECTION_HEALTH`). The semantics:

- **id** — `sc-<uuid>` for held rows; `inherited:<harness>:<name>` for projections.
- **authSource** — closed set `token | mcp | inherited`.
- **health** — closed 2-set `working | needs-attention`. Starts as `needs-attention` on create (unvalidated); the validate endpoint updates it. A token that stops working becomes `needs-attention` — there is no "expired" state.
- **removable** — `true` for held, `false` for inherited.
- **via** — always server-constructed, never a raw URL or secret echo: `token` → `"API key · stored encrypted"`, `mcp` → hostname of the MCP server URL, `inherited` → `"<harness> · <name>"`.

There is no `trustTier` field. ETHOS §2 — security is earned from real learnings, never a preemptive wall.

---

## The descriptor seam — where inherited connections come from

Inherited connections project from `HarnessCapabilityDescriptor.inheritedTools?` (optional, default `[]`). Each `InheritedToolDescriptor` carries identity only — `name`, `kind` (`mcp-server | cli`), `harness` (`claude-code | codex | opencode | environment`), `health | "unknown"`. The type has no secret field: no code path can copy an env var, command, keychain value, or token into it — the invariant is enforced at the type level.

`discoverLocalHarnesses()` populates it via four probes — claude-code, codex, **opencode**, and the `gh`-CLI environment. Probe mechanics are owned by the [Harness Capability Descriptor](../agent-layer/harness-capability-descriptor.md) doc.

---

## API surface

```
GET    /api/connections        → ServiceConnectionView[]   (held ∪ inherited)
POST   /api/connections        → 201 ServiceConnectionView  (token or mcp)
DELETE /api/connections/:id    → 204 | 404
POST   /api/connections/:id/validate → { health }
```

`GET` returns inherited projections first, then held rows. It reads **cached** descriptors (`pool.describe()`) — never re-probes per request. Inherited connections have `removable: false`; DELETE of an `inherited:*` id returns 404.

POST accepts a discriminated union — `authSource: "token"` or `authSource: "mcp"`. A unique-constraint violation on (user × service × authSource) returns 409. Inherited connections are never created via the API; they appear automatically from harness discovery.

Rate limits: POST/DELETE 20 req/min; validate 3 req/min.

---

## Storage

`service_connections` pgTable in `framework/db/src/schema.ts:1735` — one row per (userId, service, authSource), enforced by a unique index. Two storage invariants:

1. `inherited` is never a DB row — the column accepts only `token | mcp`.
2. The token column is ciphertext (AES-GCM), nullable, present only for `token` rows; `mcp` rows store a server URL only.

Column details belong to the schema file, not this doc.

---

## Resolver (`ServiceConnectionResolver`)

`layers/agent-orchestration/connections/src/service-connection-resolver.ts` — the only path that returns a decrypted token. Two consumers: session provisioning injection (AN2) and filesystem reachability probes (AO1, via `ServiceConnectionResolverAdapter` in `filesystem-reachability.ts`). Both consume the plaintext internally; **the invariant is that plaintext never reaches a route response or a log line** — not that the resolver has a single caller.

- Queries scoped on `AND(id, userId)` — cross-user lookup returns `null`, never leaks existence.
- Returns `null` for: cross-user, non-existent, mcp rows (no stored token), missing server secret, decryption failure. Never throws.
- Reuses `decryptCredentialValue` from `credential-encryption.ts` — no forked crypto.

---

## Projection (`ServiceConnectionProjection`)

`layers/agent-orchestration/connections/src/service-connection-projection.ts` — projects `descriptors[].inheritedTools` into `ServiceConnectionView[]` at GET time. Pure function over the cached descriptors: no DB access, no child-process spawn. Deduplicates by service name across harnesses (first wins). Descriptor health `unknown` displays as `working` (`service-connection-projection.ts:50-51`) — inherited tools are auto-detected and expected-healthy; `needs-attention` is reserved for explicit probe failures.

---

## Hard rules

1. **Plaintext never reaches a route response, UI field, or log line.** A stored secret is resolvable server-side for injection and probes, but any appearance in a display or log surface is a defect.
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

See also: [Credential model](./credential-model.md) — infra-secret catalog, shared AES-GCM primitive. [Harness Capability Descriptor](../agent-layer/harness-capability-descriptor.md) — descriptor shape, `inheritedTools`, discovery probes. [Authorization model](./authorization-model.md) — access boundary, Managed secret definition.
