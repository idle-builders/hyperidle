# Credential model

How a credential is stored, encrypted, read by the runtime, and shown to the user. The
**configuration-and-lifecycle** companion to [authorization-model.md](authorization-model.md) — that
doc owns *how a secret is protected* (Principal, access boundary, Hard Rule 4 "no plaintext"); this
doc owns *where the credential lives, who reads it, and whether the user sees the truth*. On any
conflict, `authorization-model.md` wins.

## The noun

A **Credential** is a named secret value (ciphertext at rest) plus its non-secret validation state.
Every Credential value is a Managed secret; not every Managed secret is a Credential. A Credential
whose value is plaintext anywhere is a defect, not a Credential.

- **Name** — from a closed, non-user-extensible catalog (`framework/domain-model/src/credential.ts`).
  There is exactly one: **`shared_backend_key`** — what a remote worker presents to reach this
  server.
- **Value** — AES-256-GCM ciphertext at rest; never persisted, logged, or returned in plaintext.
- **Validation state** — `absent | present_untested | valid | invalid` (`CREDENTIAL_STATES`).

> **HyperIdle holds no model credential.** The catalog once carried three more —
> `anthropic_api_key`, `openrouter_api_key`, `openai_compatible_api_key` — so the built-in harness
> could call a provider API, and later so a stored key could be injected into a harness subprocess.
> Neither happens: **a harness is what a person brings, and the key lives in that harness's own
> login.** An injected key is worse than none, because it shadows the auth the person already has
> (codex's ChatGPT login in particular). Setup collects no key at all — a harness arrives logged in
> or it is not choosable. See
> [`docs/agent-layer/model-routing-and-cost.md`](../agent-layer/model-routing-and-cost.md).

## One store

There is **exactly one canonical credential store**: the encrypted `server_credentials` table
(`framework/db/src/schema.ts`) — server-side, env-independent, addressed by credential name.

- Not the `server_config` JSON blob.
- Not process env. Env may still hold the *Root-of-trust secret* — a different noun.
- Not desktop safeStorage as the runtime's truth. safeStorage holds the Root-of-trust secret and a
  local UI mirror only (`applications/desktop/src/safe-credentials.ts`).

## Encryption

Values are AES-256-GCM encrypted with a key derived from the Root-of-trust secret
(`HYPERIDLE_API_KEY`) via HKDF-SHA256 with a fixed application salt
(`layers/core-api/credentials/src/credential-encryption.ts`). Stored format:
`base64(iv[12] + ciphertext + authTag[16])`; every encrypt call uses a fresh random IV. The API key
is the root of trust — an attacker who has it already has full API access, so no separate
file-stored key exists.

Two access levels: `getServerSecret()` is nullable and non-fatal (boot path); `requireServerSecret()`
throws `MISSING_ROOT_SECRET` (write/validate boundaries).

## One resolver

Reads go through one function — `resolveCredential(db, name) → plaintext | null`
(`layers/core-api/credentials/src/credential-store.ts`), wired at the composition root as the
`CredentialResolver` port (`credential-resolver.ts`). The port outlived the model resolution it was
written beside: something still has to fetch that one key.

- No fallback chain that masks absence. `null` is surfaced, never a silent dead call.
- No production path reads a credential from the environment.

## Onboarding ↔ Settings parity

Both surfaces read the one shared `CREDENTIAL_CATALOG`, so no orphaned or contradictory slots.
`routes/credentials.ts` returns `{name, state, lastValidatedAt}` per catalog name, synthesizing
`absent` for unset slots. **Onboarding asks for no credential**, which satisfies the parity rule
trivially: it offers nothing, and everything offered in Settings is manageable there.

## Fail loud on no root secret

A credential write with no Root-of-trust secret available is **rejected** with a clear error — never
silently written as plaintext. Write and validate routes go through `requireServerSecret()`.

## Hard rules

1. **No plaintext credential** persisted or logged anywhere — DB row, config row, file — except the
   OS-protected Root-of-trust secret (authorization-model Hard Rule 4, inherited).
2. **Fail loud on no root secret** — no silent plaintext write.
3. **One store, one resolver** — the credential the user set is the credential the runtime resolves.
4. **No credential is injected into a harness.** A harness authenticates itself.
5. **State only in responses** — never return a credential value; expose the validation state only
   (`routes/credentials.ts`).

## Credentials ≠ Connections

`server_credentials` is the **closed infra-secret catalog**. User service connections are an open,
user-driven set stored in `service_connections`, which reuses only the encryption primitive. Writing
one into the other violates the connection-model hard rule. See [connection-model.md](connection-model.md).

See also: [authorization-model.md](authorization-model.md) (Secrets, Hard Rule 4),
[connection-model.md](connection-model.md) (held/inherited Connections). `MissingCredentialError` is
defined in `framework/domain-model/src/errors.ts`.
