# Credential model

How a provider credential is stored, encrypted, read by the runtime, and shown to the user. The **configuration-and-lifecycle** companion to [authorization-model.md](authorization-model.md) — that doc owns *how a secret is protected* (Principal, access boundary, Hard Rule 4 "no plaintext"); this doc owns *where the credential lives, who reads it, and whether the user sees the truth*. On any conflict, `authorization-model.md` wins.

## The noun

A **Credential** is a named, provider-scoped secret value (ciphertext at rest) plus its non-secret validation state — the durable record of "the user gave us the key for provider P." Every Credential value is a Managed secret; not every Managed secret is a Credential. A Credential whose value is plaintext anywhere is a defect, not a Credential.

- **Name** — from a closed, non-user-extensible catalog (`packages/shared/src/credential.ts:11-17`): `anthropic_api_key`, `openrouter_api_key`, `shared_backend_key`, `openai_compatible_api_key` (AH1 promoted it from a `server_config` field to a catalog credential).
- **Provider** — closed set `{anthropic, openrouter, openai-compatible}` (`packages/shared/src/model-gateway.ts:22`).
- **Value** — AES-256-GCM ciphertext at rest; never persisted, logged, or returned in plaintext.
- **Validation state** — `absent | present_untested | valid | invalid` (`credential.ts:21`).

## One store

There is **exactly one canonical credential store**: the encrypted `server_credentials` table (`packages/db/src/schema.ts:988`) — server-side, env-independent, addressed by credential name. It is the single source of truth for credential *values* the runtime uses.

- Not the `server_config` JSON blob — AH1 removed keys from it; stripping from GET is not protection.
- Not process env. Env may still hold the *Root-of-trust secret* — a different noun.
- Not desktop safeStorage as the runtime's truth. safeStorage holds the Root-of-trust secret and a local UI mirror only (`packages/desktop/src/safe-credentials.ts`).

Legacy plaintext (env-sourced values, `server_config` blob keys) is migrated to ciphertext in this store by `migrateCredentialsToStore` (`packages/server/src/services/server-config.ts:280-341`) — idempotent, strips legacy tier `apiKey` fields from the blob, seeds absent slots only, never overwrites, never seeds empty strings.

## Encryption

Values are AES-256-GCM encrypted with a key derived from the Root-of-trust secret (`HYPERIDLE_API_KEY`) via HKDF-SHA256 with a fixed application salt (`packages/server/src/services/credential-encryption.ts`). Stored format: `base64(iv[12] + ciphertext + authTag[16])`; every encrypt call uses a fresh random IV. The API key is the root of trust — an attacker who has it already has full API access, so no separate file-stored key exists.

Two access levels: `getServerSecret()` is nullable and non-fatal (boot path); `requireServerSecret()` throws `MISSING_ROOT_SECRET` (write/validate boundaries).

## One resolver

There is **exactly one production Credential resolver** wired into `server-factory`: `DbCredentialResolver` (`packages/server/src/services/credential-resolver.ts`), `resolve(name) → plaintext | null`, reading the one store. The LLM client obtains keys only through it.

- No second read path (`resolveTierApiKey` is removed — zero matches in the repo).
- No fallback chain that masks absence. `null` ⇒ a surfaced `MissingCredentialError` (`packages/shared/src/errors.ts:53`), never a silent dead call.
- `EnvCredentialResolver` survives for the eval lane only (CI-secret env var, no DB); no production code path instantiates it (AH1 §3).
- `ServerHandle` exposes `credentialResolver` so integration tests assert the production wiring is `instanceof DbCredentialResolver` (`server-factory.ts`).

## Onboarding ↔ Settings parity

The providers offered at onboarding are exactly the providers manageable in Settings — both surfaces read the one shared `CREDENTIAL_CATALOG` (`credential.ts:35`), so no orphaned or contradictory slots. A key set once at onboarding is afterward shown as set/valid in Settings (same record, no re-entry) and is the key the runtime resolves. `routes/credentials.ts` returns `{name, state, lastValidatedAt}` per catalog name, synthesizing `absent` for unset slots.

## Fail loud on no root secret

A credential write with no Root-of-trust secret available is **rejected** with a clear startup/runtime error — never silently written as plaintext. `migrateCredentialsToStore` never writes a row when `getServerSecret()` is null; write/validate routes go through `requireServerSecret()`.

## Hard rules

1. **No plaintext credential** persisted or logged anywhere — DB row, config row, file — except the OS-protected Root-of-trust secret (authorization-model Hard Rule 4, inherited).
2. **Fail loud on no root secret** — no silent plaintext write.
3. **One store, one resolver** — the credential the user set is the credential the runtime resolves.
4. **Bridge-independent** — store and resolver work without the desktop bridge; the web/E2E test servers reach a real key end-to-end (`packages/web/scripts/ah5-test-server.ts`, `ah6-test-server.ts`).
5. **Onboarding↔Settings parity** — offered providers = manageable providers; set-once shows as set, no re-entry.
6. **State only in responses** — never return a credential value; expose `hasApiKey`/`validationState` only (`routes/credentials.ts`).

## Credentials ≠ Connections

`server_credentials` is the **closed infra-secret catalog**. User service connections are an open, user-driven set stored in `service_connections`, which reuses only the encryption primitive (`schema.ts:1309` @lore). Writing one into the other violates the connection-model hard rule. See [connection-model.md](connection-model.md).

## Recorded answers (formerly open questions)

- **The concrete store** — settled: the encrypted `server_credentials` table (`schema.ts:988`).
- **openai-compatible keying** — settled: a single global catalog slot, `openai_compatible_api_key` (`credential.ts:16`), not composite by endpoint/baseUrl. Invariant held either way: ciphertext in the one store, never in `server_config`.
- **Migration + resolver rewiring** — shipped: `migrateCredentialsToStore` (`server-config.ts:280-341`) plus exclusive `DbCredentialResolver` wiring in `server-factory.ts`.

See also: [authorization-model.md](authorization-model.md) (Secrets, Hard Rule 4), [connection-model.md](connection-model.md) (held/inherited Connections). `MissingCredentialError` is defined in `packages/shared/src/errors.ts`.
