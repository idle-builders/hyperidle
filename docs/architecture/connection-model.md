# Connection model

A **Connection** is a per-(user × service) record that an external service is reachable by that user's agents. It is not a credential and not a tool — it is the **fact of availability** plus a pointer to where the auth for it lives.

Connections are distinct from the [Credential model](./credential-model.md), which covers the one credential HyperIdle still holds (`shared_backend_key`, desktop-keychain only). Connections have their own AES-256-GCM cipher (`layers/agent-orchestration/connections/src/token-cipher.ts`) and live in their own open table (`service_connections`) — they never add entries to the credential catalog.

---

## The held-vs-inherited split

Every Connection has one of three auth sources. This is the load-bearing distinction:

| Auth source | Who holds the auth | Example | HyperIdle stores |
|---|---|---|---|
| `token` | HyperIdle | GitHub PAT, Stripe restricted key | AES-256-GCM ciphertext |
| `mcp` | The MCP server | Figma MCP, a self-hosted server | Server URL only |
| `inherited` | The harness / environment | Claude Code's GitHub connector, `gh` CLI login | Nothing |

**Held connections** (`token`, `mcp`) are DB rows. The user creates and removes them. HyperIdle resolves and injects them into the session working directory at spawn (AN2).

**Inherited connections** are not DB rows. They are live projections from the connections domain's own reach cache (`InheritedConnectionFact[]`, probed at boot and on redetect), reflecting what the harness configs or PATH-level environment are already configured with. The user does not create or remove them in HyperIdle — that is managed in the harness. HyperIdle holds no auth material for them; the token stays in the OS keychain, never extracted.

This is the concrete meaning of "ride the harness": OAuth-protected services arrive inherited because the harness already holds the auth. HyperIdle never runs a 3-legged OAuth dance and registers no per-service OAuth app.

---

## Connection properties

The view shape and its closed sets live in `framework/domain-model/src/connection.ts` (`ServiceConnectionView`, `CONNECTION_AUTH_SOURCES`, `CONNECTION_HEALTH`). The semantics:

- **id** — `sc-<uuid>` for held rows; `inherited:<source>:<name>` for projections.
- **authSource** — closed set `token | mcp | inherited`.
- **health** — closed 2-set `working | needs-attention`. Starts as `needs-attention` on create (unvalidated); the validate endpoint updates it. A token that stops working becomes `needs-attention` — there is no "expired" state.
- **removable** — `true` for held, `false` for inherited.
- **via** — always server-constructed, never a raw URL or secret echo: `token` → `"API key · stored encrypted"`, `mcp` → hostname of the MCP server URL, `inherited` → `"<source> · <name>"`.

There is no `trustTier` field. ETHOS §2 — security is earned from real learnings, never a preemptive wall.

---

## The reach seam — where inherited connections come from

Inherited connections project from `InheritedConnectionFact` (`framework/domain-model/src/connection.ts`) — the connections domain's own fact type, probed and cached by `createInheritedReach()` (`layers/agent-orchestration/connections/src/inherited-reach.ts`). Each fact carries identity only — `name`, `kind` (`mcp-server | cli`), `source` (`claude-code | codex | opencode | environment` — which config the auth was found in), `health | "unknown"`. The type has no secret field: no code path can copy an env var, command, keychain value, or token into it — the invariant is enforced at the type level.

`createInheritedReach().refresh()` populates the cache via four probes — claude-code, codex, **opencode**, and the `gh`-CLI environment — at boot and on `POST /api/harnesses/redetect` (composition-root wiring). The harness capability descriptor carries NO reach field — what an agent can reach is answered without reading anything about harnesses.

---

## API surface

```
GET    /api/connections        → ServiceConnectionView[]   (held ∪ inherited)
POST   /api/connections        → 201 ServiceConnectionView  (token or mcp)
DELETE /api/connections/:id    → 204 | 404
POST   /api/connections/:id/validate → { health }
```

`GET` returns inherited projections first, then held rows. It reads the **cached** reach snapshot (`inheritedReach.list()`) — never re-probes per request. Inherited connections have `removable: false`; DELETE of an `inherited:*` id returns 404.

POST accepts a discriminated union — `authSource: "token"` or `authSource: "mcp"`. A unique-constraint violation on (user × service × authSource) returns 409. Inherited connections are never created via the API; they appear automatically from the reach probes.

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
- Decrypts with `decryptCredentialValue`, this package's own cipher (`token-cipher.ts`) — no forked crypto.

---

## Projection (`ServiceConnectionProjection`)

`layers/agent-orchestration/connections/src/service-connection-projection.ts` — projects `InheritedConnectionFact[]` into `ServiceConnectionView[]` at GET time. Pure function over the cached facts: no DB access, no child-process spawn. Flattens in input order (the reach cache assembles the fixed source order `claude-code → environment → codex → opencode`) and deduplicates by service name (first wins). Fact health `unknown` displays as `working` — inherited tools are auto-detected and expected-healthy; `needs-attention` is reserved for explicit probe failures.

---

## Hard rules

1. **Plaintext never reaches a route response, UI field, or log line.** A stored secret is resolvable server-side for injection and probes, but any appearance in a display or log surface is a defect.
2. **HyperIdle runs no 3-legged OAuth and registers no per-service OAuth app.** Held auth is only a simple secret or an MCP pointer. OAuth services arrive inherited.
3. **Per-user isolation.** One user's connection (held or inherited) is never resolvable, listable, or usable from another user's session. Cross-user reads return 404/null — never 403, never leaking existence.
4. **Inherited connections store no auth material.** A token or keychain value copied into a HyperIdle record is a defect.
5. **Connections and the one credential (`shared_backend_key`, see [credential-model.md](credential-model.md)) are unrelated.** There is no catalog of credential names for a connection to add to — a connection's auth lives in `service_connections`, entirely separate from the desktop keychain entry the worker key uses.

---

## Vocabulary

| Term | Code prefix | Not |
|---|---|---|
| Connection | `ServiceConnection*` (avoids collision with db-connection noun) | `integration`, `connector`, `account`, `credential` |
| Held connection | auth source `token` or `mcp` | stored connection, managed credential |
| Inherited connection | auth source `inherited`; reflected from the machine (harness configs / environment) | native tool (informal only, not in types) |
| Auth source | closed `{token, mcp, inherited}` | auth type, kind, provider |
| Connection health | closed `{working, needs-attention}` | status, validation state |

---

See also: [Credential model](./credential-model.md) — the one remaining credential, desktop-keychain only. [Harness Capability Descriptor](../agent-layer/harness-capability-descriptor.md) — harness readiness/models/auth state (describes the harness only; no reach field). [Authorization model](./authorization-model.md) — access boundary, Managed secret definition.
