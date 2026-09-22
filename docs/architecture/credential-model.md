# Credential model

The one credential HyperIdle still holds, and where it lives.

## The noun

A **Credential** is a named secret value. There is exactly one: **`shared_backend_key`** — what a
remote worker presents to reach a shared-mode server. It has no separate validation state and no
catalog of names — the UI shows only whether the key is set, never a tested/valid/invalid status.

> **HyperIdle holds no model credential.** The catalog once carried three more —
> `anthropic_api_key`, `openrouter_api_key`, `openai_compatible_api_key` — so the built-in harness
> could call a provider API, and later so a stored key could be injected into a harness subprocess.
> Neither happens: **a harness is what a person brings, and the key lives in that harness's own
> login.** An injected key is worse than none, because it shadows the auth the person already has
> (codex's ChatGPT login in particular). Setup collects no key at all — a harness arrives logged in
> or it is not choosable. See
> [`docs/agent-layer/model-routing-and-cost.md`](../agent-layer/model-routing-and-cost.md).

## Where it lives

There is no server-side credential store. `shared_backend_key` is entered in the desktop app's
Settings → Backend section (the Worker subsection) and written straight into the desktop's OS
keychain (Electron `safeStorage`, `applications/desktop/src/safe-credentials.ts`) — it is never sent
to a server and never read back into the UI. The desktop's worker client reads the same keychain
entry to authenticate itself to a shared-mode server.

## Credentials ≠ Connections

A **Connection** (a user's own service auth — a GitHub token, an MCP server) is a different noun: an
open, user-driven set stored in `service_connections`, encrypted with its own AES-256-GCM cipher
(`layers/agent-orchestration/connections/src/token-cipher.ts`). It shares no table and no catalog with
the credential above. See [connection-model.md](connection-model.md).

## Hard rules

1. **No plaintext credential** persisted or logged anywhere, except the OS-protected keychain entry
   itself.
2. **No credential is injected into a harness.** A harness authenticates itself.
3. **State only, never the value** — the UI shows whether the key is set, never the key.

See also: [authorization-model.md](authorization-model.md) (Secrets, Hard Rule 4),
[connection-model.md](connection-model.md) (held/inherited Connections).
