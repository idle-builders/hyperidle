# Credential model

How a provider credential is stored, read by the runtime, and shown to the user. The **configuration-and-lifecycle** companion to `authorization-model.md` — that doc owns *how a secret is protected* (Principal, access boundary, Managed secret = AES-256-GCM/HKDF, Hard Rule 4 "no plaintext"); this doc owns *where the credential lives, who reads it, and whether the user sees the truth*. Locked by `/concept` for AH1 (`plans/AH1/concept.md`). On any conflict, `authorization-model.md` wins.

## The noun

A **Credential** is a named, provider-scoped secret value (ciphertext at rest) plus its non-secret validation state — the durable record of "the user gave us the key for provider P." Every Credential value *is* a Managed secret (AF11); not every Managed secret is a Credential. A Credential whose value is plaintext anywhere is a defect, not a Credential.

- **Name** — from a closed catalog (`anthropic_api_key`, `openrouter_api_key`, `shared_backend_key`, and the openai-compatible key, which AH1 promotes from a config field to a catalog credential).
- **Provider** — closed set `{anthropic, openrouter, openai-compatible}`.
- **Value** — AES-256-GCM ciphertext at rest; never persisted, logged, or returned in plaintext.
- **Validation state** — `absent | present_untested | valid | invalid`.

## One store

There is **exactly one canonical credential store**: encrypted, server-side, env-independent, addressed by credential name. It is the single source of truth for credential *values* the runtime uses.

- Not the `server_config` JSON blob (the rejected plaintext location for the openai-compatible key — AF11 Hard Rule 4; stripping from GET is not protection).
- Not process env (unset in web/E2E, never written by onboarding, invisible in Settings). Env may still hold the *Root-of-trust secret* — a different noun.
- Not desktop safeStorage as the runtime's truth (the web/E2E proof lane has no bridge). safeStorage may hold the Root-of-trust secret and a local UI mirror only.

Legacy plaintext (env-sourced values, `server_config` blob keys) migrates to ciphertext in this store; the plaintext paths are then removed.

## One resolver

There is **exactly one Credential resolver** wired into `server-factory`: `resolve(name) → plaintext | null`, reading the one store. The LLM client obtains keys only through it.

- No second read path (no separate `resolveTierApiKey` for openai-compatible).
- No fallback chain that masks absence (no "env, then DB, then empty"). `null` ⇒ a surfaced `MissingCredentialError`, never a silent dead call.

## Onboarding ↔ Settings parity

The providers offered at onboarding are exactly the providers manageable in Settings — no orphaned or contradictory slots. A key set once at onboarding is afterward shown as set/valid in Settings (same record, no re-entry) and is the key the runtime resolves.

## Fail loud on no root secret

A credential write with no Root-of-trust secret available is **rejected** with a clear startup/runtime error — never silently written as plaintext. (Closes `getServerSecret()`'s empty-string fallback.)

## Hard rules

1. **No plaintext credential** persisted or logged anywhere — DB row, config row, file — except the OS-protected Root-of-trust secret (AF11 Hard Rule 4, inherited).
2. **Fail loud on no root secret** — no silent plaintext write.
3. **One store, one resolver** — the credential the user set is the credential the runtime resolves.
4. **Bridge-independent** — store and resolver work without the desktop bridge, so the AH5 live-agent lane reaches a real key end-to-end in web/E2E.
5. **Onboarding↔Settings parity** — offered providers = manageable providers; set-once shows as set, no re-entry.
6. **State only in responses** — never return a credential value; expose `hasApiKey`/`validationState` only (A-SEC-2).

## Open for `/architecture`

- The concrete store (the encrypted `server_credentials` table is the obvious fit).
- openai-compatible keying — single global slot vs. composite by endpoint/baseUrl (a tier carries its own `baseUrl`). Invariant either way: ciphertext in the one store, never in `server_config`.
- Migration mechanics and the resolver-rewiring in `server-factory`.

See also: `authorization-model.md` (Secrets, Hard Rule 4), `agent-layer/harness-error-taxonomy.md` (`MissingCredentialError`).
