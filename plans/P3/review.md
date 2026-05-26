# P3 Code Review: BackendMode, AppConfig, and Credential

**Verdict: NOT DONE**

Four acceptance criteria are unimplemented (AC-3, AC-4, AC-5, AC-12), one is partially implemented (AC-15), and one has no code change (AC-14). The implemented portions (AC-1, AC-2, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-13, AC-16, AC-17) are solid.

---

## AC Completeness Table

| AC | Description | Implemented? | Tested? | Test Verifies Criterion? | Notes |
|----|-------------|:---:|:---:|:---:|-------|
| AC-1 | Client-local config file (BackendMode) | YES | YES | YES | `client-config.ts` + 10 tests covering all specified paths |
| AC-2 | Window state migration | YES | YES | YES | `migrateWindowState()` + 4 tests including corrupt/no-op cases |
| AC-3 | BackendMode boot sequence (local) | **NO** | NO | N/A | `main.ts` not modified. No boot sequence changes. |
| AC-4 | BackendMode boot sequence (shared) | **NO** | NO | N/A | `main.ts` not modified. No shared-mode connect path. |
| AC-5 | BackendMode boot sequence (unset) | **NO** | NO | N/A | `main.ts` not modified. No null-to-local fallback. |
| AC-6 | Health check for shared mode | YES | YES | YES | `/api/health/auth` endpoint + 7 tests |
| AC-7 | Credential catalog in shared types | YES | YES | YES | `credential.ts` + 13 tests |
| AC-8 | Server-side credential table and encryption | YES | YES | YES | AES-256-GCM encryption + 13 tests |
| AC-9 | Server credential CRUD endpoints | YES | YES | YES | 4 routes + 13 tests. No value leaks confirmed. |
| AC-10 | Server-persisted config table | YES | YES | YES | `server-config.ts` + settings migration + 15 tests |
| AC-11 | Desktop credential manager refactor | YES | YES | YES | Catalog enforcement + status + validate handlers + 15 tests |
| AC-12 | Desktop sets ANTHROPIC_API_KEY from safeStorage | **NO** | NO | N/A | `main.ts` not modified. |
| AC-13 | CredentialsTab uses fixed catalog | YES | YES | YES | Catalog UI with state indicators + 12 tests + stories file |
| AC-14 | VITE_HYPERIDLE_API_KEY elimination from user-facing paths | **NO** | NO | N/A | `api-fetch.ts` not modified. No dev-only comment added. |
| AC-15 | CredentialResolver interface | PARTIAL | PARTIAL | PARTIAL | Interface + 2 implementations exist and are tested. But `claude-agent-sdk-adapter.ts` was NOT modified -- the optional `credentialResolver` constructor param is missing. |
| AC-16 | Migration runs without error | YES | YES | YES | Migration 0019 runs. Tables confirmed in schema. |
| AC-17 | Existing functionality preserved | YES | YES | YES | `bun run verify` passes 7/7. |

---

## Lens 1: Architecture

### CRITICAL

**F-ARCH-1: Tasks 12 entirely missing -- boot sequence not updated (AC-3, AC-4, AC-5, AC-12).**

The architecture plan Task 12 specifies modifying `packages/desktop/src/main.ts` to read `config.json`, resolve BackendMode, and branch between local/shared/unset boot paths. The file has zero changes. This means:
- The desktop app does not read `config.json` at all during boot.
- BackendMode is not consulted. The app always boots in local mode by hardcoded behavior.
- `ANTHROPIC_API_KEY` is never set from safeStorage before server boot (AC-12).
- The window state migration (`migrateWindowState()`) is never called during actual boot (only unit-tested in isolation).

This is 4 missing ACs (AC-3, AC-4, AC-5, AC-12).

**F-ARCH-2: Task 13 missing -- adapter not modified (AC-15 partial).**

The plan Task 13 specifies adding an optional `credentialResolver` param to `ClaudeAgentSdkAdapter`. The file `packages/server/src/harness/claude-agent-sdk-adapter.ts` has zero changes. The `CredentialResolver` interface and both implementations exist and are tested, but the adapter integration point is absent.

**F-ARCH-3: Task 15 missing -- api-fetch.ts not modified (AC-14).**

The plan Task 15 specifies adding a dev-only comment to `packages/web/src/services/api-fetch.ts` to document that `VITE_HYPERIDLE_API_KEY` is a developer convenience only. The file has zero changes.

### WARNING

**F-ARCH-4: Server-side `/api/credentials/:name/validate` is a stub that always returns `{ valid: false }` (AC-9).**

In `packages/server/src/routes/credentials.ts` lines 147-152, the validation endpoint creates a hardcoded `validationResult = { valid: false }` and never decrypts or validates the credential against an external service. The `@lore` comment says "Full validation against external services is a follow-up." However, AC-9 says "POST /api/credentials/:name/validate returns validation result" and the spec says "Each credential is testable: providing a credential triggers a validation call to the service." The desktop-side `credential-validator.ts` does implement the actual external calls, but the server-side validate endpoint is a non-functional stub.

The architecture plan itself (Layer 9) says "The harness adapter gains an optional credentialResolver... In shared mode the resolver reads from the encrypted DB." But the server-side validate endpoint should at minimum decrypt the credential and call the appropriate validation function rather than returning a hardcoded `false`.

**F-ARCH-5: `config` bridge not exposed in preload (plan Layer 8).**

The plan specifies `config: { get, set, getAll }` in the bridge type (`window.d.ts`). The bridge type in `window.d.ts` was NOT updated to include the `config` section. The preload only added `status` and `validate` to credentials. The `config.json` read/write is not exposed to the renderer at all.

---

## Lens 2: Design (skip -- infrastructure workpackage, no design spec)

---

## Lens 3: Security

### WARNING

**F-SEC-1: No rate limiting on credential endpoints.**

The plan's security table explicitly says: "Apply existing rate limiter. Validation endpoint gets a stricter per-name limit (3/min)." The credential routes in `packages/server/src/routes/credentials.ts` have NO rate limiting middleware. The PUT and POST /validate endpoints accept unlimited requests.

**F-SEC-2: `getServerSecret()` returns empty string when no key is set.**

`packages/server/src/services/credential-encryption.ts` line 97: `return process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY ?? "";`. When neither env var is set, `deriveKey("")` produces a deterministic key derived from an empty string. This means credentials would be encrypted with a predictable key. The architecture critique warned about this (Warning 1) and suggested either a startup assertion or a throw on empty input. Neither was implemented.

In practice, the server requires `HYPERIDLE_API_KEY` for the auth middleware, so this empty-key path is unlikely to be reached. But the credential encryption module does not enforce this invariant itself.

**F-SEC-3: No SSRF guard on `serverUrl` in desktop credential validator.**

`packages/desktop/src/credential-validator.ts` line 135: `const url = \`${serverUrl.replace(/\/$/, "")}/api/health/auth\``. The `serverUrl` is user-provided (from config.json). The plan's security table says: "Validate serverUrl against the SSRF sanitizer (sanitizeHttpUrl from @hyperidle/shared/net). Only allow http/https schemes. No private IPs unless explicitly configured." No SSRF validation is applied.

### SUGGESTION

**F-SEC-4: `as Record<string, string>` cast in safe-credentials.ts delete handler.**

Line at the destructured delete path: `saveStore(rest as Record<string, string>)`. This is a type assertion to work around TypeScript narrowing after property deletion. Low risk but violates the "no unsafe as casts" TypeScript rule.

---

## Lens 4: Adversarial

### WARNING

**F-ADV-1: Protected test `safe-credentials.test.ts` had assertions modified (credential names changed).**

The plan's protected tests list includes `packages/desktop/__tests__/safe-credentials.test.ts` with the rule "existing assertions must not be removed or weakened." The diff changes test data from arbitrary names (`MY_API_KEY`, `TOKEN`, `KEY_A`, `KEY_B`, `TO_DELETE`, `MEM_KEY`) to catalog names (`anthropic_api_key`, `openrouter_api_key`). The assertions themselves (`expect(result.stored).toBe(true)`, etc.) were preserved. The change is necessary (the implementation now rejects non-catalog names) but technically the test behavior changed: these tests no longer verify that arbitrary names work. This is a correct adaptation, not a weakening -- the contract changed intentionally.

**F-ADV-2: `buildStatusResponse` uses unsafe `as CredentialState` cast.**

`packages/server/src/routes/credentials.ts` line 36: `state: row.validationState as CredentialState`. The DB column is `text` and could contain any string. If a migration bug or manual DB edit sets `validationState` to a non-CredentialState string, this cast silently produces an invalid value. Should use a runtime guard (e.g., validate against `CREDENTIAL_STATES`).

**F-ADV-3: Server-side validate endpoint always returns `valid: false` regardless of credential.**

The test for this (`P3-credentials.test.ts` line 1598: `expect([200, 422]).toContain(res.status)`) is deliberately loose -- it accepts either 200 or 422. The assertion `expect(typeof body.valid).toBe("boolean")` merely confirms the shape, not the behavior. A stub that returns `false` always passes this test. This means the validate AC is not genuinely tested for correctness.

---

## Lens 5: Simplification

### WARNING

**F-SIMP-1: `createHmac` imported but unused, suppressed with `void createHmac`.**

`packages/server/src/services/credential-encryption.ts` line 12 imports `createHmac` and line 102 has `void createHmac;` with a comment "Suppress unused import warning." This is dead code. The comment says "exported for potential use by callers" -- but it is not exported. Remove the import and the void statement.

### SUGGESTION

**F-SIMP-2: Credential upsert in PUT handler uses select-then-update/insert instead of Drizzle's `onConflictDoUpdate`.**

`packages/server/src/routes/credentials.ts` lines 88-114 do a select, check if existing, then either update or insert. This is a two-query upsert pattern. Drizzle supports `insert().onConflictDoUpdate()` which would be a single statement. Same pattern in `server-config.ts` `updateServerConfig()`.

**F-SIMP-3: `CredentialsTab.tsx` duplicates catalog entries rather than importing from `@hyperidle/shared`.**

Lines 21-32 of the new `CredentialsTab.tsx` define `CATALOG_ENTRIES` as a local constant duplicating the catalog from `@hyperidle/shared/credential.ts`. Since the web package can import from `@hyperidle/shared`, this duplication risks drift. The `@hyperidle/shared` catalog already has `label` and `description` fields.

**F-SIMP-4: `LegacyModeCredentials` backward-compat component may be unnecessary.**

The `CredentialsTab.tsx` maintains a full `LegacyModeCredentials` component for "older bridges (N4 compat)." Given that P3 updates both the preload (adding `status` and `validate`) and the `window.d.ts` type, any bridge running P3 code will always have `status`. The legacy path only triggers if someone runs a P3 web build against a pre-P3 desktop build, which is not a supported configuration. Consider removing the legacy path to reduce code size by ~120 lines.

---

## Lens 6: AI Slop

### WARNING

**F-SLOP-1: Stub code disguised as implementation in `/api/credentials/:name/validate`.**

Lines 147-152: The `@lore` comment says "Full validation against external services is a follow-up" but the AC says validation should work. The code creates a hardcoded `{ valid: false }` result with typed casts (`false as boolean`, `undefined as string | undefined`) that serve no purpose other than making the code look like it does something. This is classic AI slop: code that looks like an implementation but is actually a no-op.

**F-SLOP-2: `void createHmac` in credential-encryption.ts.**

An imported-but-unused symbol suppressed with a `void` statement is a pattern that suggests the import was generated and the suppression added reflexively. If `createHmac` is not used, do not import it.

### SUGGESTION

**F-SLOP-3: Excessive `@lore` comments in some files.**

`packages/server/src/services/server-config.ts` has 6 `@lore` comments for a 151-line file. Several of them explain the same Zod v4 behavior (nested `.default({})` not re-parsing). One well-placed `@lore` at the `DEFAULTS` construction explaining the Zod v4 workaround would suffice; the repeated explanations are noise.

**F-SLOP-4: `ClientConfig` type defined manually alongside `ClientConfigSchema`.**

`packages/desktop/src/client-config.ts` lines 39-44 define a manual `ClientConfig` type instead of using `z.infer<typeof ClientConfigSchema>`. The comment explains this is due to Zod v4 behavior, which is valid. But the manual type must be kept in sync with the schema -- a `@lore` already documents why. This is acceptable given the Zod v4 constraint.

---

## Summary of Blockers

The builder must address these before the workpackage can be marked DONE:

1. **AC-3, AC-4, AC-5, AC-12**: Modify `packages/desktop/src/main.ts` to implement the boot sequence: read config.json, resolve BackendMode, call `migrateWindowState()`, set `ANTHROPIC_API_KEY` from safeStorage, and branch local/shared/unset paths. Extend `packages/desktop/__tests__/main.test.ts` per the plan.

2. **AC-14**: Add a dev-only comment to `packages/web/src/services/api-fetch.ts` documenting that `VITE_HYPERIDLE_API_KEY` is a developer convenience, not a user requirement.

3. **AC-15 completion**: Add the optional `credentialResolver` constructor param to `ClaudeAgentSdkAdapter` per plan Task 13. Extend `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts`.

4. **F-ARCH-4**: The server-side `/api/credentials/:name/validate` endpoint must actually decrypt and validate credentials (at minimum delegate to the same validation logic used in `credential-validator.ts`), or the AC and plan must be updated to explicitly defer server-side validation.

5. **F-SEC-1**: Add rate limiting to the credential routes per the plan's security table.

6. **F-SLOP-1 / F-SLOP-2**: Remove the `createHmac` dead import and the `void` suppression. Replace the stub validate handler with actual logic or mark it as explicitly deferred with a `TODO` and adjust the test expectations.
