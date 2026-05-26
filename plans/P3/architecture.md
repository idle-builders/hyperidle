# P3 Architecture: BackendMode, AppConfig, and Credential

## Required reading

- `plans/config-setup/concept.md` -- concept definitions for BackendMode, AppConfig, Credential
- `plans/work-packages/TRACK-P.md` -- P3 acceptance criteria and constraints
- `packages/desktop/src/main.ts` -- current desktop boot sequence
- `packages/desktop/src/safe-credentials.ts` -- existing safeStorage credential manager
- `packages/desktop/src/preload.ts` -- existing contextBridge API
- `packages/desktop/src/window-state.ts` -- existing window state persistence (pattern to follow)
- `packages/server/src/server-factory.ts` -- server creation and env var consumption
- `packages/server/src/app.ts` -- Hono app wiring
- `packages/server/src/middleware/auth.ts` -- current auth middleware
- `packages/server/src/routes/settings.ts` -- current factorySettings usage pattern
- `packages/server/src/services/observability/config.ts` -- factorySettings-as-typed-config pattern
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- how the harness reads ANTHROPIC_API_KEY
- `packages/web/src/services/api-fetch.ts` -- current VITE_HYPERIDLE_API_KEY usage
- `packages/web/src/components/CredentialsTab.tsx` -- current credential UI
- `packages/web/src/window.d.ts` -- HyperIdleElectronBridge type
- `packages/db/src/schema.ts` -- factorySettings table

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `factorySettings` is a KV bag to replace | Exists at `packages/db/src/schema.ts` L329. Used by settings routes, observability config, git-export, status, silence-policy, and 15+ test files. | Migrate incrementally: add typed `server_config` table for new structured config. Leave `factorySettings` for notification prefs (migrated to `server_config` in a follow-up) to avoid blast radius. Observability config already has its own typed layer on top of factorySettings. |
| `VITE_HYPERIDLE_API_KEY` exists to eliminate | Used in `packages/web/src/services/api-fetch.ts` (L24-28), `packages/web/src/vite-env.d.ts`, `packages/web/playwright.config.ts`, `packages/web/e2e/N2-auth.spec.ts`, and `packages/web/src/services/__tests__/api-fetch.test.ts`. | Remove from apiFetch resolution chain. Keep in playwright.config.ts and e2e test setup (dev/test tooling, not user-facing). |
| `secrets.json` stores internal server API key | Exists. Used by `packages/desktop/src/main.ts` L215 (`readOrGenerateApiKey`). | Keep as-is. `secrets.json` is the internal server auth key, not a user credential. BackendMode local auto-generates it. BackendMode shared does not need it (the remote server has its own). |
| `credentials.json` + safeStorage exists | Exists at `packages/desktop/src/safe-credentials.ts`. IPC handlers registered in `main.ts` L401. | Refactor to use the fixed credential catalog. Migrate from freeform `{name: value}` to `{anthropic_api_key: ..., openrouter_api_key: ..., shared_backend_key: ...}`. |
| No `config.json` exists | Correct. `window-state.json` exists for window bounds only. | Create new `config.json` module in desktop package. Absorb window state into it (single config file). |
| No server-side credential table exists | Correct. Harness reads `process.env.ANTHROPIC_API_KEY` directly. | Add `credentials` table with encrypted value column for shared mode. Add credential resolution interface for harness. |
| Desktop reads `process.env` for config | `main.ts` L278-291 sets DATABASE_URL, HYPERIDLE_API_KEY, NODE_ENV, HYPERIDLE_STATIC_DIR, PORT as env vars. | The server continues to read these env vars internally. The change is: desktop sets them from config.json instead of hardcoding. No user ever sees or sets them. |
| `CredentialsTab` is a freeform name/value entry | Correct. `packages/web/src/components/CredentialsTab.tsx` allows arbitrary credential names. | Replace with fixed catalog UI showing the three known credentials with validation state. |

---

## Design-it-twice: key decisions

### Decision 1: Client-local config storage

**Option A: Single `config.json` absorbing window state.**
Merge `window-state.json` into `config.json` as a `windowState` key. One file, one read on boot, one Zod schema.
- Trade-off: Breaking change for existing installations (window state "resets" once on upgrade).
- Reject reason: None -- the one-time reset is benign (window re-centers).

**Option B: Separate files (`config.json` + `window-state.json`).**
Keep window-state.json as-is. config.json holds only BackendMode + serverUrl + lastView.
- Trade-off: Two files to manage. Boot reads two files. But no migration concern.
- Reject reason: Complexity without benefit. Two schemas, two read paths, two corruption handlers.

**Decision: Option A.** Single `config.json`. The one-time window position reset is acceptable. All client-local state in one typed file.

### Decision 2: Server-persisted config evolution

**Option A: Replace `factorySettings` with a typed `server_config` table (single JSON column).**
One row, one `config` column holding a typed JSON blob. Zod-validated on read. Schema migrations add keys with defaults.
- Trade-off: Single-row table means no concurrent-write conflicts (SQLite serializes). But the JSON blob is opaque to SQL queries.
- Reject reason for the JSON-blob part: We lose the ability to query individual keys in SQL. But we never do that -- all reads are full-config-then-filter-in-code.

**Option B: Replace `factorySettings` with a typed `server_config` table (one column per setting).**
Each setting gets its own column. Strongly typed at the DB level.
- Trade-off: Every new config key requires a migration. Very rigid.
- Reject reason: Over-engineering. The config changes shape frequently during early development. A validated JSON column is the right level of flexibility.

**Option C: Keep `factorySettings` KV table, add typed read/write layer.**
Like what observability config already does -- typed wrappers over the KV bag.
- Trade-off: No migration at all. But the pattern is scattered (each config domain writes its own prefix-reader).
- Reject reason: Perpetuates the untyped KV bag. Adding more prefix-readers is entropy.

**Decision: Option A.** Single-row `server_config` table with a validated JSON column. The existing `factorySettings` table is not dropped in P3 -- it stays for backward compatibility. The observability config and notification prefs continue reading from it. P3 adds `server_config` as the new pattern; future work migrates existing factorySettings consumers.

### Decision 3: Server-side credential encryption (shared mode)

**Option A: Encrypt with key derived from server API key via HKDF.**
Use `HYPERIDLE_API_KEY` as input key material to HKDF, derive a 256-bit AES-GCM key. Store IV + ciphertext in the DB. The server API key is the root of trust -- if an attacker has it, they already have full API access.
- Trade-off: The encryption key is derived from the same secret that authenticates API calls. This means an attacker who steals the API key can decrypt credentials. But they could already call any API endpoint.
- Reject reason: None. The threat model is correct -- the API key is the root of trust for the entire shared backend.

**Option B: Separate encryption key stored in a file on the server.**
Generate a random encryption key, store in a file next to the DB.
- Trade-off: Another secret to manage. But decouples credential encryption from API auth.
- Reject reason: Over-engineering for the current threat model. Adds operational complexity (key rotation, backup) for a separation that doesn't improve security in practice.

**Decision: Option A.** HKDF from `HYPERIDLE_API_KEY` as key material. `HYPERIDLE_CREDENTIAL_KEY` env var as override for operators who want separation.

### Decision 4: Credential resolution for harness adapter

**Option A: Inject a `resolveCredential(name: string): Promise<string | null>` function into the adapter.**
The adapter calls it at session start. In local mode, the desktop main process sets `process.env.ANTHROPIC_API_KEY` from safeStorage before booting the server, and the resolver reads env. In shared mode, the resolver reads from the encrypted DB table.
- Trade-off: The adapter gets a new constructor dependency. But it already has `apiKeyEnvVar` as an option.
- Reject reason: None.

**Option B: Keep the adapter reading `process.env` and have the boot sequence populate env from credentials.**
Local mode: desktop main reads safeStorage, sets env. Shared mode: server startup reads encrypted DB, sets env.
- Trade-off: Simple -- no adapter changes. But `process.env` mutation is a side-effect-laden pattern. And in shared mode, credentials in env are visible to any code in the process.
- Reject reason: The P3 spec says credentials must never be in logs, error messages, or client state. `process.env` is a global namespace that gets dumped in crash reports and process inspectors.

**Decision: Option A for shared mode (inject resolver). Option B for local mode (desktop sets env before server boot -- existing pattern, contained to the main process).** The harness adapter gains an optional `credentialResolver` that takes priority over env var. In local mode the resolver is not injected and the env var path works as today. In shared mode the resolver reads from the encrypted DB.

---

## Architecture

### Layer 1: Client-local config (`packages/desktop/src/client-config.ts`)

A typed JSON config file in Electron `userData/config.json`. Replaces `window-state.json`.

```typescript
// packages/desktop/src/client-config.ts

import { z } from "zod";

const BackendModeSchema = z.enum(["local", "shared"]);
type BackendMode = z.infer<typeof BackendModeSchema>;

const WindowStateSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().default(1280),
  height: z.number().default(800),
  isMaximized: z.boolean().default(false),
  isFullScreen: z.boolean().default(false),
});

const ClientConfigSchema = z.object({
  /** "local" | "shared" — the backend mode selection. Null = unset (first run). */
  backendMode: BackendModeSchema.nullable().default(null),
  /** Remote server URL for shared mode. Null when local. */
  serverUrl: z.string().url().nullable().default(null),
  /** Last active view path for restoration. */
  lastView: z.string().nullable().default(null),
  /** Window bounds and state. */
  windowState: WindowStateSchema.default({}),
});

type ClientConfig = z.infer<typeof ClientConfigSchema>;

const DEFAULTS: ClientConfig = ClientConfigSchema.parse({});

/** Read config from disk. Returns defaults on missing/corrupt file. */
function loadClientConfig(configPath: string): ClientConfig;
/** Write config to disk. Merges with existing config (partial write). */
function saveClientConfig(configPath: string, patch: Partial<ClientConfig>): void;
```

**Boot sequence change:** `main.ts` reads `config.json` before anything else. If `backendMode` is null, the app knows this is first run (P4 SetupFlow will handle this). If `backendMode` is "local", proceed with current embedded server boot. If "shared", skip server boot and connect to `serverUrl`.

**Migration:** On first boot after P3, if `window-state.json` exists and `config.json` does not, read window state from the old file and write it into the new config.json. Then optionally delete the old file.

### Layer 2: Credential catalog and validation (`packages/shared/src/credential.ts`)

The credential catalog lives in `@hyperidle/shared` so both desktop and server can reference it.

```typescript
// packages/shared/src/credential.ts

/** The fixed set of credential names. Not user-extensible. */
export const CREDENTIAL_NAMES = [
  "anthropic_api_key",
  "openrouter_api_key",
  "shared_backend_key",
] as const;

export type CredentialName = (typeof CREDENTIAL_NAMES)[number];

/** Validation state for a credential. */
export const CREDENTIAL_STATES = [
  "absent",
  "present_untested",
  "valid",
  "invalid",
] as const;

export type CredentialState = (typeof CREDENTIAL_STATES)[number];

/** Metadata about each credential in the catalog. */
export interface CredentialCatalogEntry {
  name: CredentialName;
  label: string;
  description: string;
  required: boolean;
  testable: boolean;
}

export const CREDENTIAL_CATALOG: readonly CredentialCatalogEntry[] = [
  {
    name: "anthropic_api_key",
    label: "Anthropic API Key",
    description: "Required for AI agents to run. Starts with 'sk-ant-'.",
    required: false,  // System works without it, agents are just inert
    testable: true,
  },
  {
    name: "openrouter_api_key",
    label: "OpenRouter API Key",
    description: "Alternative model provider. Optional.",
    required: false,
    testable: true,
  },
  {
    name: "shared_backend_key",
    label: "Shared Backend API Key",
    description: "Authenticates this client to a shared HyperIdle server.",
    required: false,  // Only required when backendMode = "shared"
    testable: true,   // Test via health check to remote server
  },
] as const;

/** Check if a string is a valid credential name. */
export function isCredentialName(name: string): name is CredentialName;
```

### Layer 3: Desktop credential manager refactor (`packages/desktop/src/safe-credentials.ts`)

Refactor the existing safeStorage credential manager to use the fixed catalog.

**Changes:**
- `credentials:list` returns `CredentialName[]` (the catalog names), not arbitrary stored names.
- `credentials:get` only accepts `CredentialName` values.
- `credentials:set` only accepts `CredentialName` values.
- `credentials:delete` only accepts `CredentialName` values.
- Add `credentials:validate` IPC handler that triggers a validation call for a given credential.
- Add `credentials:status` IPC handler that returns `Record<CredentialName, CredentialState>`.

**Validation protocol:**

```typescript
// packages/desktop/src/credential-validator.ts

/** Validate a credential by calling the target service. */
async function validateCredential(
  name: CredentialName, 
  value: string
): Promise<{ valid: boolean; error?: string }>;
```

For `anthropic_api_key`: call `GET https://api.anthropic.com/v1/messages` with the key in `x-api-key` header and an empty/minimal request. A 401 = invalid, any non-401 = valid (even 400 means the key authenticated).

For `openrouter_api_key`: call the OpenRouter auth check endpoint with the key.

For `shared_backend_key`: call `GET {serverUrl}/api/health` with the key in `X-API-Key` header. A 200 = valid, 401 = invalid.

### Layer 4: Server-side credential storage (`packages/db/src/schema.ts` + `packages/server/`)

New table for shared-mode credential storage:

```typescript
// Addition to packages/db/src/schema.ts

export const serverCredentials = sqliteTable("server_credentials", {
  name: text("name").primaryKey(),  // CredentialName from catalog
  /** AES-256-GCM encrypted value. Format: base64(iv + ciphertext + authTag). */
  encryptedValue: text("encrypted_value").notNull(),
  /** Validation state: "present_untested" | "valid" | "invalid". */
  validationState: text("validation_state").notNull().default("present_untested"),
  /** When the credential was last validated. */
  lastValidatedAt: text("last_validated_at"),
  updatedAt: text("updated_at").notNull(),
});
```

**Encryption module** (`packages/server/src/services/credential-encryption.ts`):

```typescript
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";

/** Derive AES-256-GCM key from server secret via HKDF. */
function deriveKey(serverSecret: string): Buffer;

/** Encrypt a credential value. Returns base64(iv + ciphertext + authTag). */
function encryptCredentialValue(plaintext: string, serverSecret: string): string;

/** Decrypt a credential value. Returns plaintext or null on failure. */
function decryptCredentialValue(encrypted: string, serverSecret: string): string | null;
```

The `serverSecret` is:
1. `HYPERIDLE_CREDENTIAL_KEY` env var if set (operator override).
2. `HYPERIDLE_API_KEY` env var otherwise (default -- the root of trust).

**Server credential routes** (`packages/server/src/routes/credentials.ts`):

```
GET    /api/credentials          -> CredentialStatusResponse[]
PUT    /api/credentials/:name    -> CredentialStatusResponse  (set/update)
DELETE /api/credentials/:name    -> 204
POST   /api/credentials/:name/validate -> ValidationResult
```

Response shape (NEVER includes the value):
```typescript
interface CredentialStatusResponse {
  name: CredentialName;
  state: CredentialState;  // "absent" | "present_untested" | "valid" | "invalid"
  lastValidatedAt: string | null;
}
```

The `PUT` body:
```typescript
interface SetCredentialBody {
  value: string;  // The raw credential value -- encrypted before storage
}
```

**Security:** The `PUT` endpoint accepts the raw value in the request body (over the auth-protected API). The server encrypts it immediately and stores only the encrypted form. The raw value is never logged, never stored in memory beyond the request handler scope, and never included in any response.

### Layer 5: Server-persisted config (`packages/db/src/schema.ts` + `packages/server/`)

New typed config table:

```typescript
// Addition to packages/db/src/schema.ts

export const serverConfig = sqliteTable("server_config", {
  /** Singleton row. Always "default". */
  id: text("id").primaryKey().default("default"),
  /** JSON blob validated by Zod on read/write. */
  config: text("config").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
});
```

**Config schema** (`packages/server/src/services/server-config.ts`):

```typescript
import { z } from "zod";

const ServerConfigSchema = z.object({
  /** Notification preferences (migrated from factorySettings). */
  notifications: z.object({
    reviewAlerts: z.boolean().default(true),
    costAlerts: z.boolean().default(true),
    blockerAlerts: z.boolean().default(true),
    quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
    quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
    mutedProducts: z.array(z.string()).default([]),
  }).default({}),
});

type ServerConfig = z.infer<typeof ServerConfigSchema>;

/** Read config from DB. Returns defaults if table is empty or JSON is corrupt. */
function readServerConfig(db: HyperIdleDb): ServerConfig;

/** Patch config in DB. Deep-merges with existing config. */
function updateServerConfig(db: HyperIdleDb, patch: DeepPartial<ServerConfig>): ServerConfig;
```

**Migration path:** P3 creates the `server_config` table. The `PATCH /api/settings` endpoint is updated to write to `server_config` instead of `factorySettings` for notification prefs. The `GET /api/settings` endpoint reads from `server_config`. Existing `factorySettings` notification rows become orphaned (harmless). The `factorySettings` table is NOT dropped -- it's still used by observability, git-export, and other consumers.

### Layer 6: Health check enhancement (`packages/server/src/routes/health.ts`)

The existing `/api/health` returns `{ status: "ok", timestamp: "..." }`. For shared-mode clients, this is the connectivity and auth test.

**Enhanced health response (add authenticated variant):**

```
GET /api/health          -> { status: "ok", timestamp: "..." }  (unauthenticated, for liveness)
GET /api/health/auth     -> { status: "ok", timestamp: "...", userId: "..." }  (authenticated, for shared-mode connect test)
```

The `/api/health/auth` endpoint sits behind the auth middleware and confirms both connectivity AND authentication. The shared-mode client calls this to validate the `shared_backend_key`.

### Layer 7: Desktop boot sequence update (`packages/desktop/src/main.ts`)

The boot sequence changes from:

```
app.whenReady() -> paths -> API key from secrets.json -> log rotation ->
migrations -> set env vars -> startServer() -> health check -> BrowserWindow
```

To:

```
app.whenReady() -> paths -> read config.json -> resolve BackendMode ->
  [local]: API key from secrets.json -> log rotation -> migrations ->
           set env vars (incl ANTHROPIC_API_KEY from safeStorage) ->
           startServer() -> health check -> BrowserWindow
  [shared]: log rotation -> connect to serverUrl ->
            health check (with shared_backend_key) -> BrowserWindow
  [unset]: BrowserWindow with SetupFlow (P4 -- for now, treat as local)
```

**Key change:** In local mode, after reading credentials from safeStorage, set `process.env.ANTHROPIC_API_KEY` before booting the server. This way the harness adapter picks it up without any adapter changes in P3. The `credentialResolver` injection (Decision 4) is deferred to a follow-up when shared mode actually needs it.

### Layer 8: Web frontend changes

**`packages/web/src/services/api-fetch.ts`:**
Remove the `VITE_HYPERIDLE_API_KEY` fallback from the resolution chain. The API key comes from:
1. `window.__HYPERIDLE__.apiKey` (Electron preload -- local and shared mode).
2. Dev mode: keep `VITE_HYPERIDLE_API_KEY` in the resolution chain for `bun dev` (developer convenience only). Add a comment marking it as dev-only.

Actually, re-reading the spec: "In dev mode, a single `.env` file still works (developer convenience, not user requirement)." So the VITE_ env var stays for dev mode but is clearly documented as dev-only. The spec says "eliminate the pattern" -- meaning no user should ever need to set it. But developers running `bun dev` still use it.

**`packages/web/src/components/CredentialsTab.tsx`:**
Replace freeform credential entry with fixed catalog display:

```typescript
// Renders the three catalog entries with:
// - Name and description
// - State indicator: absent (gray), present (yellow), valid (green), invalid (red)
// - Set/Update button (opens password input)
// - Validate button (triggers validation call)
// - Remove button
```

**`packages/web/src/window.d.ts`:**
Update `HyperIdleElectronBridge` to include the new credential methods:

```typescript
interface HyperIdleElectronBridge {
  apiKey: string;
  platform: "electron";
  credentials: {
    /** Returns status for all catalog credentials. */
    status(): Promise<Record<CredentialName, CredentialState>>;
    /** Set a credential value. Returns validation result if testable. */
    set(name: CredentialName, value: string): Promise<{ stored: boolean; warning?: string }>;
    /** Delete a credential. */
    delete(name: CredentialName): Promise<void>;
    /** Validate a credential against its service. */
    validate(name: CredentialName): Promise<{ valid: boolean; error?: string }>;
    /** Check if OS keychain encryption is available. */
    isEncryptionAvailable(): Promise<boolean>;
  };
  config: {
    /** Read a config value. */
    get<K extends keyof ClientConfig>(key: K): Promise<ClientConfig[K]>;
    /** Write a config value. */
    set<K extends keyof ClientConfig>(key: K, value: ClientConfig[K]): Promise<void>;
    /** Read entire config. */
    getAll(): Promise<ClientConfig>;
  };
  shell: {
    openLogs(): Promise<void>;
    openData(): Promise<void>;
    selectFolder(): Promise<string | null>;
  };
  onOpenSettings(callback: () => void): () => void;
}
```

### Layer 9: Credential resolver for harness (deferred shared-mode support)

For P3, local mode continues using `process.env.ANTHROPIC_API_KEY` (set by the desktop main process from safeStorage before server boot). No adapter changes needed.

For shared mode readiness (minimal prep in P3):

```typescript
// packages/server/src/services/credential-resolver.ts

/** Resolves a credential value by name. */
export interface CredentialResolver {
  resolve(name: CredentialName): Promise<string | null>;
}

/** Reads from process.env (local mode default). */
export class EnvCredentialResolver implements CredentialResolver {
  private readonly envVarMap: Record<CredentialName, string> = {
    anthropic_api_key: "ANTHROPIC_API_KEY",
    openrouter_api_key: "OPENROUTER_API_KEY",
    shared_backend_key: "HYPERIDLE_API_KEY",
  };
  
  async resolve(name: CredentialName): Promise<string | null> {
    return process.env[this.envVarMap[name]] ?? null;
  }
}

/** Reads from encrypted server_credentials table (shared mode). */
export class DbCredentialResolver implements CredentialResolver {
  constructor(
    private readonly db: HyperIdleDb,
    private readonly serverSecret: string,
  ) {}
  
  async resolve(name: CredentialName): Promise<string | null> {
    const row = db.select().from(serverCredentials).where(eq(serverCredentials.name, name)).get();
    if (!row) return null;
    return decryptCredentialValue(row.encryptedValue, this.serverSecret);
  }
}
```

The `ClaudeAgentSdkAdapter` gains an optional `credentialResolver` in its constructor options. When present, it calls `resolver.resolve("anthropic_api_key")` instead of reading `process.env[this.apiKeyEnvVar]`. Default behavior (no resolver) is unchanged.

---

## Migration plan (DB)

**New migration file:** `0019_P3_config_credentials.sql`

```sql
-- P3: Server-side credential storage (shared mode)
CREATE TABLE IF NOT EXISTS server_credentials (
  name TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  validation_state TEXT NOT NULL DEFAULT 'present_untested',
  last_validated_at TEXT,
  updated_at TEXT NOT NULL
);

-- P3: Typed server config (replaces factorySettings for new config)
CREATE TABLE IF NOT EXISTS server_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

-- Seed the default config row
INSERT OR IGNORE INTO server_config (id, config, updated_at)
VALUES ('default', '{}', datetime('now'));
```

**PostgreSQL equivalent:** Same schema in `packages/db/src/schema.pg.ts`. Generated via `bun run db:generate`.

---

## File inventory

### New files

| File | Purpose |
|---|---|
| `packages/desktop/src/client-config.ts` | Client-local config: load, save, Zod schema, defaults |
| `packages/desktop/src/credential-validator.ts` | Credential validation calls (Anthropic, OpenRouter, shared backend) |
| `packages/shared/src/credential.ts` | Credential catalog, types, constants |
| `packages/server/src/services/credential-encryption.ts` | AES-256-GCM encrypt/decrypt with HKDF key derivation |
| `packages/server/src/services/credential-resolver.ts` | CredentialResolver interface + EnvCredentialResolver + DbCredentialResolver |
| `packages/server/src/services/server-config.ts` | ServerConfig Zod schema, read/write from server_config table |
| `packages/server/src/routes/credentials.ts` | CRUD + validate endpoints for server-side credentials |
| `packages/db/drizzle/0019_P3_config_credentials.sql` | Migration for server_credentials and server_config tables |

### Modified files

| File | Changes |
|---|---|
| `packages/db/src/schema.ts` | Add `serverCredentials` and `serverConfig` table definitions + inferred types |
| `packages/db/src/schema.pg.ts` | PostgreSQL equivalents of new tables |
| `packages/db/src/index.ts` | Export new table symbols and types |
| `packages/desktop/src/main.ts` | New boot sequence: read config.json, resolve BackendMode, set ANTHROPIC_API_KEY from safeStorage, migrate window-state.json |
| `packages/desktop/src/safe-credentials.ts` | Enforce fixed credential catalog, add `credentials:validate` and `credentials:status` handlers |
| `packages/desktop/src/preload.ts` | Expose `config` bridge + updated `credentials` bridge |
| `packages/desktop/src/window-state.ts` | Keep for backward compat, but primary storage moves to config.json |
| `packages/server/src/app.ts` | Mount `/api/credentials` route |
| `packages/server/src/routes/health.ts` | Add `/api/health/auth` authenticated endpoint |
| `packages/server/src/routes/settings.ts` | Read/write notifications via server_config instead of factorySettings |
| `packages/server/src/harness/claude-agent-sdk-adapter.ts` | Add optional `credentialResolver` constructor param |
| `packages/web/src/services/api-fetch.ts` | Document VITE_ env var as dev-only convenience |
| `packages/web/src/components/CredentialsTab.tsx` | Fixed catalog UI with validation state |
| `packages/web/src/window.d.ts` | Updated HyperIdleElectronBridge type |
| `packages/shared/src/index.ts` | Export credential types and constants |
| `packages/shared/src/types.ts` | (No changes needed -- credential types go in their own file) |

---

## Acceptance criteria with verification methods

### AC-1: Client-local config file (BackendMode)

**Criterion:** A `config.json` file in userData holds `backendMode` ("local" | "shared" | null), `serverUrl`, `lastView`, and `windowState`. Validated by Zod on read. Corrupt files fall back to defaults.

**Verification:**
- Unit test: `packages/desktop/__tests__/client-config.test.ts`
  - `loadClientConfig` with missing file returns DEFAULTS
  - `loadClientConfig` with corrupt JSON returns DEFAULTS
  - `loadClientConfig` with valid JSON returns parsed config
  - `saveClientConfig` merges partial updates without losing other keys
  - Zod rejects invalid backendMode values ("invalid_mode")
  - Zod accepts null backendMode (first run state)

### AC-2: Window state migration

**Criterion:** On first boot after P3, if `window-state.json` exists and `config.json` does not, window state is migrated into config.json.

**Verification:**
- Unit test: `packages/desktop/__tests__/client-config.test.ts`
  - Given old window-state.json exists and config.json does not, `migrateWindowState()` creates config.json with windowState populated from old file
  - Given config.json already exists, migration is a no-op

### AC-3: BackendMode boot sequence (local)

**Criterion:** When `backendMode` is "local", the desktop app boots the embedded server (current behavior, formalized).

**Verification:**
- Unit test: `packages/desktop/__tests__/main.test.ts` (extend existing)
  - Mock `loadClientConfig` to return `{ backendMode: "local", ... }`
  - Assert `startServer()` is called
  - Assert `waitForHealth()` is called with the local port

### AC-4: BackendMode boot sequence (shared)

**Criterion:** When `backendMode` is "shared", the desktop app connects to a remote URL with the shared_backend_key credential. No embedded server is started.

**Verification:**
- Unit test: `packages/desktop/__tests__/main.test.ts` (extend existing)
  - Mock `loadClientConfig` to return `{ backendMode: "shared", serverUrl: "http://remote:3001" }`
  - Assert `startServer()` is NOT called
  - Assert health check is called against the remote URL
  - Assert BrowserWindow loads the remote URL

### AC-5: BackendMode boot sequence (unset / first run)

**Criterion:** When `backendMode` is null, the app treats it as "local" (P4 SetupFlow will handle the UI for mode selection -- out of scope for P3).

**Verification:**
- Unit test: `packages/desktop/__tests__/main.test.ts`
  - Mock `loadClientConfig` to return `{ backendMode: null, ... }`
  - Assert `startServer()` is called (defaults to local)

### AC-6: Health check for shared mode

**Criterion:** `GET /api/health/auth` returns 200 with userId when authenticated, 401 when not.

**Verification:**
- Integration test: `packages/server/src/__tests__/P3-health-auth.test.ts`
  - `GET /api/health/auth` with valid API key returns 200 + `{ status: "ok", userId: "..." }`
  - `GET /api/health/auth` without API key returns 401
  - `GET /api/health` (existing) still returns 200 without auth

### AC-7: Credential catalog in shared types

**Criterion:** `CREDENTIAL_NAMES`, `CredentialName`, `CREDENTIAL_CATALOG`, `CredentialState` are exported from `@hyperidle/shared`.

**Verification:**
- `bun run check` passes with zero type errors
- Unit test: `packages/shared/src/__tests__/credential.test.ts`
  - `CREDENTIAL_NAMES` has exactly 3 entries
  - `isCredentialName("anthropic_api_key")` returns true
  - `isCredentialName("arbitrary_key")` returns false
  - `CREDENTIAL_CATALOG` entries have required fields

### AC-8: Server-side credential table and encryption

**Criterion:** `server_credentials` table exists. Values are AES-256-GCM encrypted. Encryption key derived from server secret via HKDF.

**Verification:**
- Unit test: `packages/server/src/services/__tests__/credential-encryption.test.ts`
  - `encryptCredentialValue` + `decryptCredentialValue` round-trips correctly
  - `decryptCredentialValue` with wrong key returns null
  - `decryptCredentialValue` with tampered ciphertext returns null (GCM auth tag check)
  - `deriveKey` produces different keys from different secrets
  - `deriveKey` produces the same key from the same secret (deterministic)

### AC-9: Server credential CRUD endpoints

**Criterion:** `GET /api/credentials`, `PUT /api/credentials/:name`, `DELETE /api/credentials/:name`, `POST /api/credentials/:name/validate` all work correctly. Responses never include credential values.

**Verification:**
- Integration test: `packages/server/src/__tests__/P3-credentials.test.ts`
  - `GET /api/credentials` returns all catalog entries with "absent" state
  - `PUT /api/credentials/anthropic_api_key` with `{ value: "sk-ant-..." }` returns 200 + status (not value)
  - `GET /api/credentials` after PUT shows "present_untested" for anthropic_api_key
  - `PUT /api/credentials/unknown_key` returns 400 (not in catalog)
  - `DELETE /api/credentials/anthropic_api_key` returns 204, subsequent GET shows "absent"
  - `POST /api/credentials/anthropic_api_key/validate` returns validation result
  - No response body from any endpoint contains the raw credential value (assert with JSON.stringify search)

### AC-10: Server-persisted config table

**Criterion:** `server_config` table exists with a typed JSON column. Zod-validated on read. Settings route reads/writes from it for notification preferences.

**Verification:**
- Unit test: `packages/server/src/services/__tests__/server-config.test.ts`
  - `readServerConfig` on empty table returns defaults
  - `updateServerConfig` merges partial updates
  - `readServerConfig` after update returns merged config
  - Corrupt JSON in DB falls back to defaults
- Integration test: `packages/server/src/__tests__/P3-settings-config.test.ts`
  - `PATCH /api/settings` with notification prefs writes to server_config
  - `GET /api/settings` reads notification prefs from server_config

### AC-11: Desktop credential manager refactor

**Criterion:** `credentials:set`, `credentials:get`, `credentials:delete` only accept catalog names. `credentials:status` returns state for all catalog entries. `credentials:validate` triggers validation.

**Verification:**
- Unit test: `packages/desktop/__tests__/safe-credentials.test.ts` (extend existing)
  - `credentials:set` with catalog name succeeds
  - `credentials:set` with non-catalog name is rejected
  - `credentials:status` returns all three catalog entries
  - `credentials:validate` calls the validation function

### AC-12: Desktop sets ANTHROPIC_API_KEY from safeStorage

**Criterion:** Before booting the embedded server, the desktop main process reads `anthropic_api_key` from safeStorage and sets `process.env.ANTHROPIC_API_KEY`.

**Verification:**
- Unit test: `packages/desktop/__tests__/main.test.ts` (extend existing)
  - After config load and before `startServer()`, `process.env.ANTHROPIC_API_KEY` is set from the credential store

### AC-13: CredentialsTab uses fixed catalog

**Criterion:** The CredentialsTab shows the three catalog credentials with state indicators, not a freeform name/value entry.

**Verification:**
- Unit test: `packages/web/src/components/__tests__/CredentialsTab.test.tsx`
  - Renders three credential entries (Anthropic, OpenRouter, Shared Backend)
  - Each shows correct state indicator (absent/present/valid/invalid)
  - Set button opens password input
  - Validate button triggers validation
  - No freeform name input exists

### AC-14: VITE_HYPERIDLE_API_KEY elimination from user-facing paths

**Criterion:** The web frontend never requires users to set `VITE_HYPERIDLE_API_KEY`. The env var remains as a dev-mode convenience only, clearly documented.

**Verification:**
- Code inspection: `api-fetch.ts` has a comment marking the VITE_ path as dev-only
- Existing test: `packages/web/src/services/__tests__/api-fetch.test.ts` continues to pass
- No user-facing documentation references VITE_HYPERIDLE_API_KEY

### AC-15: CredentialResolver interface

**Criterion:** `CredentialResolver` interface exists with `EnvCredentialResolver` and `DbCredentialResolver` implementations. `ClaudeAgentSdkAdapter` accepts optional resolver.

**Verification:**
- Unit test: `packages/server/src/services/__tests__/credential-resolver.test.ts`
  - `EnvCredentialResolver.resolve("anthropic_api_key")` reads from `process.env.ANTHROPIC_API_KEY`
  - `DbCredentialResolver.resolve("anthropic_api_key")` reads and decrypts from server_credentials table
  - `DbCredentialResolver.resolve("absent_key")` returns null
- Unit test: `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts` (extend)
  - Adapter with resolver calls `resolver.resolve()` instead of reading env
  - Adapter without resolver reads env (backward compat)

### AC-16: Migration runs without error

**Criterion:** `bun run db:generate` produces the migration. `bun run db:migrate` applies it. Both SQLite and PostgreSQL.

**Verification:**
- `bun run db:generate` succeeds
- `bun run db:migrate` succeeds on fresh and existing databases
- Schema inspection confirms `server_credentials` and `server_config` tables exist

### AC-17: Existing functionality preserved

**Criterion:** `bun run verify` passes. `bun dev` starts and the app works.

**Verification:**
- `bun run check` -- zero type errors
- `bun run lint` -- zero lint errors
- `bun run test` -- all existing tests pass
- `bun dev` -- server starts on 3001, web starts on 5173, app renders in browser

---

## Security and abuse cases

| Vector | Applicable? | Mitigation |
|---|---|---|
| **Rate limit on credential endpoints** | Yes. `PUT /api/credentials/:name` and `POST /api/credentials/:name/validate` are targets. | Apply existing rate limiter. Validation endpoint gets a stricter per-name limit (3/min) to prevent API key brute-force via HyperIdle as a proxy. |
| **Credential value in logs/errors** | Yes. Core security requirement. | Credential values never logged. `PUT` handler encrypts immediately. Error messages reference credential name, never value. Response bodies never include `encryptedValue`. |
| **Credential value in API responses** | Yes. | `GET /api/credentials` returns `{ name, state, lastValidatedAt }` only. No value field. |
| **Credential value in client state** | Yes. | The web frontend never receives or stores credential values. The bridge shows status only. When the user enters a value, it goes directly to the IPC/API handler and is never stored in React state beyond the input field. |
| **Path traversal on config.json** | No. The config path is hardcoded from `app.getPath("userData")` -- not user-controlled. |
| **SSRF via credential validation** | Partially. The `shared_backend_key` validation calls a user-provided `serverUrl`. | Validate `serverUrl` against the SSRF sanitizer (`sanitizeHttpUrl` from `@hyperidle/shared/net`). Only allow http/https schemes. No private IPs unless explicitly configured. |
| **Server encryption key rotation** | Edge case. If `HYPERIDLE_API_KEY` changes, all encrypted credentials become unreadable. | Document: changing the server API key requires re-entering all credentials. This is acceptable for the current scale. Future work: key rotation protocol. |
| **Corrupt config.json denial of service** | Edge case. A corrupt file could prevent boot. | Zod validation with fallback to defaults. The app always boots. |
| **Memory-only credential exposure** | Edge case. safeStorage unavailable = credentials in memory only. | Existing behavior: warn the user. P3 preserves this. |
| **Credential validation as oracle** | Low risk. Attacker with API key could use `POST /api/credentials/:name/validate` to test stolen keys. | The attacker already has the server API key (auth required). They could call the services directly. No additional risk. |

---

## Protected tests

Tests that must not have their assertions weakened during P3:

```
protectedTests:
  - packages/desktop/__tests__/main.test.ts
  - packages/desktop/__tests__/safe-credentials.test.ts
  - packages/desktop/__tests__/window-state.test.ts
  - packages/server/src/__tests__/M3-settings-routes.test.ts
  - packages/server/src/__tests__/M3-auth-middleware.test.ts
  - packages/server/src/__tests__/P2-auth-resolution.test.ts
  - packages/web/src/services/__tests__/api-fetch.test.ts
  - packages/web/src/components/__tests__/SettingsPanel-credentials.test.ts
  - packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts
  - packages/server/src/harness/__tests__/claude-agent-sdk-adapter.security.test.ts
```

These tests verify existing behavior that P3 must preserve. New assertions can be added, but existing assertions must not be removed or weakened.

---

## Ordered task list

### Task 1: Credential catalog in shared types
**Files:** `packages/shared/src/credential.ts`, `packages/shared/src/index.ts`
**Test:** `packages/shared/src/__tests__/credential.test.ts`
**Depends on:** Nothing
**AC:** AC-7

### Task 2: Client-local config module
**Files:** `packages/desktop/src/client-config.ts`
**Test:** `packages/desktop/__tests__/client-config.test.ts`
**Depends on:** Nothing
**AC:** AC-1, AC-2

### Task 3: DB migration -- server_credentials + server_config tables
**Files:** `packages/db/src/schema.ts`, `packages/db/src/schema.pg.ts`, `packages/db/src/index.ts`, migration SQL
**Test:** Migration runs, schema inspection
**Depends on:** Nothing
**AC:** AC-16

### Task 4: Credential encryption module
**Files:** `packages/server/src/services/credential-encryption.ts`
**Test:** `packages/server/src/services/__tests__/credential-encryption.test.ts`
**Depends on:** Nothing
**AC:** AC-8

### Task 5: Server config read/write module
**Files:** `packages/server/src/services/server-config.ts`
**Test:** `packages/server/src/services/__tests__/server-config.test.ts`
**Depends on:** Task 3 (table must exist)
**AC:** AC-10

### Task 6: Credential resolver interface + implementations
**Files:** `packages/server/src/services/credential-resolver.ts`
**Test:** `packages/server/src/services/__tests__/credential-resolver.test.ts`
**Depends on:** Task 1 (types), Task 3 (table), Task 4 (encryption)
**AC:** AC-15

### Task 7: Server credential routes
**Files:** `packages/server/src/routes/credentials.ts`, `packages/server/src/app.ts`
**Test:** `packages/server/src/__tests__/P3-credentials.test.ts`
**Depends on:** Task 3, Task 4, Task 6
**AC:** AC-9

### Task 8: Health check auth endpoint
**Files:** `packages/server/src/routes/health.ts`, `packages/server/src/app.ts`
**Test:** `packages/server/src/__tests__/P3-health-auth.test.ts`
**Depends on:** Nothing
**AC:** AC-6

### Task 9: Settings route migration to server_config
**Files:** `packages/server/src/routes/settings.ts`
**Test:** `packages/server/src/__tests__/P3-settings-config.test.ts` + existing `M3-settings-routes.test.ts` must still pass
**Depends on:** Task 5
**AC:** AC-10

### Task 10: Desktop credential manager refactor
**Files:** `packages/desktop/src/safe-credentials.ts`, `packages/desktop/src/credential-validator.ts`
**Test:** `packages/desktop/__tests__/safe-credentials.test.ts` (extend)
**Depends on:** Task 1 (types)
**AC:** AC-11

### Task 11: Desktop preload and bridge update
**Files:** `packages/desktop/src/preload.ts`, `packages/web/src/window.d.ts`
**Test:** Type-check passes
**Depends on:** Task 2 (config module), Task 10 (credential manager)
**AC:** Part of AC-11, AC-13

### Task 12: Desktop boot sequence update
**Files:** `packages/desktop/src/main.ts`
**Test:** `packages/desktop/__tests__/main.test.ts` (extend)
**Depends on:** Task 2, Task 10, Task 11
**AC:** AC-3, AC-4, AC-5, AC-12

### Task 13: Harness adapter credential resolver integration
**Files:** `packages/server/src/harness/claude-agent-sdk-adapter.ts`
**Test:** `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts` (extend)
**Depends on:** Task 6
**AC:** AC-15

### Task 14: CredentialsTab refactor
**Files:** `packages/web/src/components/CredentialsTab.tsx`
**Test:** `packages/web/src/components/__tests__/CredentialsTab.test.tsx`
**Depends on:** Task 1 (types), Task 11 (bridge)
**AC:** AC-13

### Task 15: VITE_HYPERIDLE_API_KEY documentation update
**Files:** `packages/web/src/services/api-fetch.ts`
**Test:** Existing tests pass
**Depends on:** Nothing
**AC:** AC-14

### Task 16: Full verification
**Action:** `bun run verify`, `bun dev`, visual confirmation
**Depends on:** All tasks
**AC:** AC-17

---

## Parallelization guide

Tasks 1, 2, 3, 4, 8, 15 have no dependencies and can be done in parallel.

Tasks 5, 6 depend on Task 3 (schema).

Tasks 7, 9 depend on Tasks 5, 6.

Tasks 10, 11 depend on Tasks 1, 2.

Task 12 depends on Tasks 2, 10, 11.

Tasks 13, 14 can proceed once their dependencies are met.

**Critical path:** Task 3 -> Task 5 -> Task 9 (settings migration) and Task 3 -> Task 4 -> Task 6 -> Task 7 (credential endpoints).

---

## Risks and ambiguities

1. **Credential validation endpoints calling external services.** Tests for `POST /api/credentials/:name/validate` need to mock the external HTTP calls. The test should verify the handler dispatches correctly, not that the Anthropic API works.

2. **Desktop test environment.** `packages/desktop/__tests__` mock Electron APIs. The new config and credential tests need the same mocking pattern. Read existing test files for the established pattern before writing new ones.

3. **safeStorage availability.** On some Linux desktops, safeStorage may not be available (no keychain). The existing fallback (memory-only + warning) is preserved. P3 does not change this behavior.

4. **Backward compatibility.** Existing installations have `credentials.json` with arbitrary key names (not from the catalog). The refactored credential manager should handle old-format files gracefully: read any existing keys, warn if they don't match the catalog, preserve them as-is until the user re-enters them via the new UI.

5. **Settings migration from factorySettings to server_config.** When the user first hits `GET /api/settings` after P3, we need to bootstrap server_config from existing factorySettings notification rows. This is a one-time migration in the settings read path: if server_config is empty, read factorySettings notification keys and write them to server_config.

6. **PostgreSQL dual-driver.** New tables need PG schema equivalents. The credential encryption module uses Node.js `crypto` which works in both SQLite and PG code paths (encryption happens in the application layer, not the DB).
