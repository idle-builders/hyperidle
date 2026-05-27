# Architecture Critique: P3

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:7 N:9 MD:8 FMC:7 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (8/10)

The plan maps 17 acceptance criteria to 16 ordered tasks with clear traceability. Every spec AC (BackendMode, AppConfig, Credential, Integration) has at least one task and verification method.

One gap: the spec at TRACK-P.md line 144 states "existing desktop installations (with `secrets.json`) are migrated on first launch to the new credential system." The plan explicitly keeps `secrets.json` as-is (reconciliation table row 3: "Keep as-is. `secrets.json` is the internal server auth key, not a user credential."). This is a reasonable interpretation -- `secrets.json` holds the internal server API key, not a user credential -- but the plan should explicitly acknowledge and justify the deviation from the spec's literal wording, rather than leaving it as an implicit redefinition.

No scope creep detected. The plan defers `credentialResolver` injection to shared-mode follow-up and does not invent new requirements.

### 2. Layer Integrity (9/10)

Layer discipline is clean. The credential catalog lives in `@hyperidle/shared` (correct -- both desktop and server need it). Client config stays in the desktop package. Server config stays in the server package. The bridge types in `window.d.ts` correctly mediate between Human Interface and Meta Layer.

The `CredentialResolver` interface in the server package with `EnvCredentialResolver` and `DbCredentialResolver` is properly scoped. The desktop's `credential-validator.ts` making outbound HTTP calls to external services (Anthropic, OpenRouter) is correctly placed in the desktop layer -- it's a client-side concern.

No cross-layer violations found.

### 3. API Contracts (8/10)

All four credential routes are fully specified with HTTP method, path, request shape, response shape, and status codes. The `CredentialStatusResponse` type is explicit and correctly excludes credential values.

The health auth endpoint is specified with both success and failure status codes.

Minor gap: the credential `PUT` endpoint does not specify what happens when `value` is an empty string. Should it reject with 400? Treat as delete? The plan should specify this edge case.

The settings route migration (Task 9) does not respecify the `PATCH /api/settings` and `GET /api/settings` response shapes. Since the migration changes the backing store but not the API contract, this is acceptable -- but the plan should explicitly state "API contract unchanged; only backing store changes."

### 4. Data Model Alignment (7/10)

The two new tables (`server_credentials`, `server_config`) are fully specified with column types, constraints, and defaults. The migration SQL is provided.

Issues:

- The plan references migration file `0019_P3_config_credentials.sql` but the latest existing migration is `0018_P2_rename_agents_to_users.sql`. The numbering is correct (sequential), but the plan should verify that no other workpackage is racing for the 0019 slot. This is a coordination concern, not a plan defect.

- The `server_config` table uses `id TEXT PRIMARY KEY DEFAULT 'default'` as a singleton pattern. This works but the plan does not specify what happens if a second row is inserted (e.g., by a future bug). A CHECK constraint or application-level guard would be more defensive. This is a SUGGESTION, not a defect.

- The PostgreSQL schema equivalent is mentioned ("Same schema in `packages/db/src/schema.pg.ts`") but not spelled out. Both tables use `TEXT` columns only, so SQLite-to-PG portability is trivially correct. However, the plan should confirm that the PG schema uses `text()` not `varchar()` to match the SQLite schema.

- The `server_credentials.validationState` column has a default of `'present_untested'` but the `CredentialState` type includes `'absent'`. A credential row only exists when a value has been stored, so `'absent'` would never be a valid DB row state -- it's inferred from the absence of a row. The plan correctly handles this distinction in the API layer (AC-9 verification: "GET /api/credentials returns all catalog entries with 'absent' state") but does not explicitly document this inference rule in the data model section.

### 5. Naming (9/10)

Names are honest and precise. `ClientConfig`, `ServerConfig`, `CredentialName`, `CredentialState`, `CredentialCatalogEntry`, `CredentialResolver` -- all describe exactly what they are.

`BackendModeSchema` with `z.enum(["local", "shared"])` matches the concept doc's vocabulary lock. `CREDENTIAL_NAMES`, `CREDENTIAL_CATALOG`, `CREDENTIAL_STATES` use SCREAMING_SNAKE_CASE for constants per the TypeScript rules.

The `server_credentials` and `server_config` table names are distinct from `factory_settings` and communicate that they are the P3-era replacements.

`EnvCredentialResolver` and `DbCredentialResolver` honestly describe their resolution source.

No naming conflicts with existing primitives (Bet, Task, Session, Thread, Block, Artifact).

### 6. Module Depth (8/10)

The plan creates focused modules with small interfaces. `client-config.ts` exports two functions (`loadClientConfig`, `saveClientConfig`). `credential-encryption.ts` exports three functions. `credential-resolver.ts` exports one interface and two implementations.

The `CREDENTIAL_CATALOG` constant in shared types is a nice depth pattern -- it hides the catalog definition behind a simple array, and consumers just iterate.

One concern: the `credentials:status` IPC handler and the `GET /api/credentials` endpoint both need to compose "catalog + stored state" into a response. This composition logic will likely be duplicated. The plan could note that the composition helper should live in `@hyperidle/shared` alongside the catalog. This is minor.

### 7. Failure-Mode Coverage (7/10)

The security and abuse cases table is thorough with 10 vectors assessed. SSRF on `serverUrl` is covered with the existing `sanitizeHttpUrl` utility. Rate limiting on credential endpoints is specified with a per-name limit (3/min on validate).

Gaps:

- **Missing: what happens if HKDF key derivation fails?** The `deriveKey` function could receive an empty string if `HYPERIDLE_API_KEY` is somehow unset when the credential routes are called. The plan should specify: fail-fast with a startup check (the server should not boot if neither `HYPERIDLE_CREDENTIAL_KEY` nor `HYPERIDLE_API_KEY` is set) or return a clear error at the route level.

- **Missing: credential validation timeout.** The `validateCredential` function calls external APIs. What's the timeout? If Anthropic's API is slow, does the validate endpoint hang indefinitely? The plan should specify a timeout (e.g., 10s) and the error shape on timeout.

- **Missing: `config.json` write atomicity.** The `saveClientConfig` function does a partial merge and write. If the process crashes mid-write, the file is corrupt. The plan should specify write-then-rename (atomic file write) -- the same pattern used by `window-state.ts` today (actually, `window-state.ts` uses `writeFileSync` directly too, so this is a pre-existing gap, but P3 should not inherit it for the new config file).

- The plan correctly identifies that changing `HYPERIDLE_API_KEY` invalidates encrypted credentials and documents the consequence. Good.

### 8. Simplicity / Over-Engineering Risk (8/10)

The design-it-twice sections are genuine. Decision 1 (single vs separate config files) is a real trade-off with a clear winner. Decision 2 (JSON column vs typed columns vs KV wrapper) has three options with honest reject reasons. Decision 3 (HKDF from API key vs separate file) correctly identifies the threat model equivalence. Decision 4 (inject resolver vs env mutation) has a nuanced split decision (Option A for shared, Option B for local).

The `credentialResolver` abstraction could be seen as premature (no shared mode exists yet), but the plan explicitly defers injection to a follow-up while establishing the interface now. This is reasonable prep -- the interface is 4 lines; the two implementations are simple.

The `ServerConfig` schema starts with only `notifications` and does not over-engineer for future config domains. Good.

One mild over-engineering concern: the plan creates both `EnvCredentialResolver` and `DbCredentialResolver` in P3, but `DbCredentialResolver` has no caller until shared mode ships. However, since the credential encryption module and the `server_credentials` table are already being created for the server-side credential routes, testing the resolver against that table is natural. Acceptable.

### 9. Verifiability (8/10)

Every AC has a named test file, specific assertion descriptions, and the verification method aligns with what the codebase can test (Vitest unit tests for pure functions, integration tests against real DB for routes).

The protected-tests list is populated with 10 entries covering existing test contracts that must not drift. Good.

The task ordering correctly places tests before implementation within each task (each task lists Test before Files in the description). The parallelization guide is useful.

Minor gap: AC-13 (CredentialsTab) should reference a `.stories.tsx` file per the frontend rules ("Every custom component must have a `.stories.tsx` file"). The plan's verification for AC-13 mentions only a test file, not a stories file. Since CredentialsTab is an existing component being refactored (not a new custom component), this may not apply -- but the plan should be explicit about whether stories are needed.

---

## CRITICAL

None.

## WARNING

- [plan, Layer 4 / Security table] The plan does not specify a startup guard ensuring the encryption key is available before the credential routes are mounted. If `HYPERIDLE_API_KEY` is somehow empty, `deriveKey("")` would produce a deterministic key from empty input -- effectively unencrypted. The plan should require either (a) a startup assertion that the key is non-empty, or (b) the `deriveKey` function throws on empty input. The server already reads `HYPERIDLE_API_KEY` for auth middleware, so this is likely handled implicitly, but the plan should be explicit about the credential encryption path.

- [plan, Layer 3 / credential-validator.ts] Credential validation calls to external services (Anthropic, OpenRouter) have no specified timeout or error handling. The `validateCredential` function signature returns `Promise<{ valid: boolean; error?: string }>` but the plan does not specify: (a) request timeout, (b) how to handle network errors vs auth errors, (c) whether DNS resolution failures count as "invalid" or "error." Specify a timeout (10s suggested) and distinguish "invalid credential" (401) from "service unreachable" (network error) in the return type.

- [plan, reconciliation table row 5 / TRACK-P.md L144] The spec says "existing desktop installations (with `secrets.json`) are migrated on first launch to the new credential system." The plan keeps `secrets.json` as-is and does not migrate it. The plan's reasoning is sound (`secrets.json` holds the internal server API key, not a user credential), but this is a spec deviation that should be called out explicitly in the reconciliation table with a note like: "Spec says 'migrated' but secrets.json is not a user credential -- it stays as the internal server auth mechanism. No user-facing migration needed."

## SUGGESTION

- [plan, Layer 5 / server_config table] Consider adding a CHECK constraint or application-level singleton guard on the `server_config` table to prevent multiple rows. The current design relies on convention (always use id = "default"), which could be violated by a bug in future code.

- [plan, Layer 1 / client-config.ts] Specify atomic file write (write to temp file, then rename) for `saveClientConfig` to prevent corruption on crash. This is a one-line implementation detail but worth noting in the plan since corrupt config prevents boot.

- [plan, AC-13 / CredentialsTab] Clarify whether the refactored CredentialsTab needs a `.stories.tsx` file. The frontend rules require stories for every custom component. If CredentialsTab is considered part of the SettingsPanel (not a standalone custom component), state that explicitly.

- [plan, Layer 9 / credential-resolver.ts] The `EnvCredentialResolver` maps `shared_backend_key` to `HYPERIDLE_API_KEY` env var. This mapping is semantically confusing -- `HYPERIDLE_API_KEY` is the server's own auth key, not the "shared backend key" from the credential catalog (which is a client-side concept for authenticating to a remote server). In local mode this mapping is never exercised (no one calls `resolve("shared_backend_key")` locally), so it's harmless but misleading. Consider documenting this as "placeholder mapping; shared_backend_key resolution is only meaningful in shared mode via DbCredentialResolver."

- [plan, Data Model] Explicitly document that `CredentialState = "absent"` is never stored in the DB -- it's inferred from the absence of a `server_credentials` row. This inference rule is load-bearing for the API layer and should be stated once clearly.

## What's Working Well

- The reconciliation table (plan vs reality) is excellent. Every assumption is checked against the actual codebase with file paths and line numbers. This is the single best practice in the plan -- it prevents spec/codebase drift (CC-007) before implementation starts.

- The design-it-twice sections are genuine explorations with honest trade-offs, not theatre. Decision 4 (hybrid resolver approach -- env for local, injected for shared) is a particularly well-reasoned split that avoids both over-engineering and under-engineering.

- The security and abuse cases table is comprehensive, covering 10 vectors with specific mitigations. The SSRF guard on `serverUrl` via the existing `sanitizeHttpUrl` utility shows awareness of the codebase's existing security infrastructure.
