# P1 Architecture Plan -- Purge Langfuse and Dead Observability Code

**Workpackage:** P1 (Track P)
**Type:** Pure deletion -- no new code beyond tightening the adapter enum type.
**Branch:** `feat/P1-purge-langfuse`

---

## Required reading

The builder should read these before implementing:

- `plans/work-packages/TRACK-P.md` (section P1) -- the spec
- `packages/server/src/services/observability/types.ts` -- the surviving adapter interface
- `packages/server/src/services/observability/config.ts` -- config module being trimmed
- `packages/server/src/routes/observability-routes.ts` -- route module being trimmed
- `packages/server/src/app.ts` (lines 109-127) -- `buildObservabilityAdapter` switch

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `langfuse-adapter.ts` exists | Yes: `packages/server/src/services/observability/langfuse-adapter.ts` (310 lines) | Delete entire file |
| Integration test exists for the adapter | Yes: `packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts` | Delete entire file |
| `observability.langfuse_*` config keys exist | Yes: 3 keys in `config.ts` KEYS object (`langfuse_url`, `langfuse_public_key`, `langfuse_secret_key`) | Remove from KEYS, DEFAULTS, `buildConfig`, `ObservabilityConfig`, `SafeObservabilityConfig`, `ObservabilityConfigPatch`, `updateObservabilityConfig`, `redactObservabilityConfig` |
| `sanitizeLangfuseUrl` and `sanitizeLangfuseKey` exist | Yes: both in `config.ts` (lines 185-211) | Delete both functions |
| `LangfuseConfig` type exists | No standalone `LangfuseConfig` type. The Langfuse config is the `langfuse` property on `ObservabilityConfig`. | Remove the `langfuse` property from `ObservabilityConfig` and `SafeObservabilityConfig` |
| `ObservabilityChannel` includes `"langfuse"` | Yes: `"console" \| "langfuse" \| "noop"` in `types.ts` line 4 | Remove `"langfuse"` from the union |
| `ADAPTERS` set includes `"langfuse"` | Yes: `config.ts` line 50 | Remove `"langfuse"` from the set |
| `langfuse` npm dependency exists in `package.json` | No. The adapter uses raw `fetch` against the Langfuse Ingestion API. No npm package to remove. | No action needed -- AC satisfied by absence |
| Observability config API exposes Langfuse fields | Yes: `observability-routes.ts` has `langfuseUrl`, `langfusePublicKey`, `langfuseSecretKey` in the Zod schema and `validatePatchBody` | Remove all Langfuse fields from the Zod schema, validation, and audit diff |
| Doc references exist | Yes: 7 files across `docs/` (listed below) | Update each |
| `.claude/settings.local.json` references `langfuse` | Yes: `enabledMcpjsonServers: ["langfuse"]` at line 54 | Remove the entry |

---

## Acceptance criteria and verification

| # | Criterion | Verification |
|---|---|---|
| AC1 | `langfuse-adapter.ts` and its integration test are deleted | `ls` confirms files absent; `bun run check` passes (no dangling imports) |
| AC2 | All `observability.langfuse_*` config keys, `sanitizeLangfuseUrl`, `sanitizeLangfuseKey`, and the `langfuse` property on `ObservabilityConfig`/`SafeObservabilityConfig` are removed | `grep -r "langfuse" packages/` returns zero results (excluding `node_modules`); `bun run check` passes |
| AC3 | `PATCH /api/observability/config` with `{ "adapter": "langfuse" }` returns 400 | Integration test asserts this |
| AC4 | `ObservabilityChannel` type is `"console" \| "noop"` | `bun run check` passes; any code referencing `"langfuse"` as a channel fails type check |
| AC5 | `ADAPTERS` set contains only `"console"` and `"noop"` | Existing config tests pass with narrowed set |
| AC6 | All Langfuse references in non-archive docs are removed or updated | `grep -ri "langfuse" docs/ \| grep -v archive/` returns zero results |
| AC7 | No `langfuse` npm dependency in any `package.json` | Already absent -- confirmed by grep |
| AC8 | `bun run check`, `bun run lint`, `bun run test` all pass | CI verification |
| AC9 | `bun dev` starts and the app works | Manual or E2E verification |
| AC10 | `grep -ri "langfuse" packages/ docs/` returns zero results (excluding `plans/`, `node_modules/`, `docs/archive/`) | Final validation grep |

---

## Ordered task list

### Task 1: Delete the Langfuse adapter and its test

**Files to delete:**
- `packages/server/src/services/observability/langfuse-adapter.ts`
- `packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts`

**Proves:** AC1

---

### Task 2: Narrow `ObservabilityChannel` type

**File:** `packages/server/src/services/observability/types.ts`

**Change:** Line 4 -- remove `"langfuse"` from the union:
```typescript
// Before:
export type ObservabilityChannel = "console" | "langfuse" | "noop";
// After:
export type ObservabilityChannel = "console" | "noop";
```

**Proves:** AC4

---

### Task 3: Purge Langfuse from `config.ts`

**File:** `packages/server/src/services/observability/config.ts`

**Changes:**

1. **KEYS object** -- remove `langfuseUrl`, `langfusePublicKey`, `langfuseSecretKey` (lines 12-14).

2. **ObservabilityConfig interface** -- remove the `langfuse` property (lines 25-29):
   ```typescript
   // Remove entirely:
   readonly langfuse: {
       readonly url: string;
       readonly publicKey: string | null;
       readonly secretKey: string | null;
   };
   ```

3. **SafeObservabilityConfig type** -- simplify. With `langfuse` gone from `ObservabilityConfig`, this type alias simplifies to just `ObservabilityConfig` (since the only difference was the redacted langfuse keys). However, retaining a distinct type name preserves the semantic intent for the API response. Change to:
   ```typescript
   export type SafeObservabilityConfig = ObservabilityConfig;
   ```

4. **DEFAULTS** -- remove `langfuseUrl` (line 44).

5. **ADAPTERS set** -- remove `"langfuse"` (line 50):
   ```typescript
   const ADAPTERS: ReadonlySet<ObservabilityChannel> = new Set(["console", "noop"]);
   ```

6. **`buildConfig` function** -- remove `langfuseUrl`, `publicKey`, `secretKey` reads (lines 79-81) and the `langfuse` property from the returned object (lines 93-97).

7. **`redactObservabilityConfig` function** -- remove the `langfuse` property from the returned object (lines 117-120). The function becomes a simple passthrough but is kept for API contract stability:
   ```typescript
   export function redactObservabilityConfig(cfg: ObservabilityConfig): SafeObservabilityConfig {
       return { ...cfg };
   }
   ```

8. **`ObservabilityConfigPatch` interface** -- remove `langfuseUrl`, `langfusePublicKey`, `langfuseSecretKey` (lines 131-133).

9. **`updateObservabilityConfig` function** -- remove the `langfuseUrl` upsert (line 170) and the two `clearOrSet` calls for langfuse keys (lines 175-176).

10. **Delete `sanitizeLangfuseUrl` function** (lines 185-187).

11. **Delete `sanitizeLangfuseKey` function** (lines 201-211).

12. **Remove the import of `SanitizeResult`** from `@hyperidle/shared` (line 2) -- only if no other function in the file uses it. After removing both sanitizers, nothing in this file uses `SanitizeResult`, so remove the import.

13. **Remove the import of `sanitizeHttpUrl`** (line 3) -- the shared SSRF sanitizer was only imported here for `sanitizeLangfuseUrl`. After deletion, the import is dead.

**Proves:** AC2, AC5

---

### Task 4: Purge Langfuse from `observability-routes.ts`

**File:** `packages/server/src/routes/observability-routes.ts`

**Changes:**

1. **Remove imports** of `sanitizeLangfuseKey` and `sanitizeLangfuseUrl` from `../services/observability/config.js` (lines 12-13).

2. **Narrow `adapterEnum`** (line 41):
   ```typescript
   const adapterEnum = z.enum(["console", "noop"]);
   ```

3. **Remove Langfuse fields from `patchConfigSchema`** (lines 47-49): delete `langfuseUrl`, `langfusePublicKey`, `langfuseSecretKey`.

4. **Simplify `validatePatchBody`** (lines 56-69): remove all three Langfuse field checks. If no other validations remain, the function body becomes `return null;` (always valid after Zod parsing). Actually, after removing all Langfuse checks, the function body is empty -- it always returns `null`. Keep the function signature for structural clarity but simplify the body.

5. **Remove Langfuse fields from `auditDiff` SECRET_FIELDS** (lines 74-76): remove `"langfusePublicKey"` and `"langfuseSecretKey"` from the array. If the array becomes empty, remove the `SECRET_FIELDS` constant and the masking logic entirely -- the function becomes a simple object spread.

**Proves:** AC3 (submitting `adapter: "langfuse"` will fail Zod validation with 400)

---

### Task 5: Purge Langfuse from `app.ts`

**File:** `packages/server/src/app.ts`

**Changes:**

1. **Remove import** of `createLangfuseObservabilityAdapter` (line 41).

2. **Remove the `"langfuse"` case** from `buildObservabilityAdapter` switch (lines 113-123). The switch becomes:
   ```typescript
   function buildObservabilityAdapter(cfg: ObservabilityConfig): ObservabilityAdapter | null {
       switch (cfg.adapter) {
           case "console":
               return createConsoleObservabilityAdapter();
           case "noop":
               return null;
       }
   }
   ```

3. **Update the JSDoc comment** on the `observabilityAdapter` option (line 84-85): remove "or langfuse" from the comment about production wiring.

**Proves:** AC2 (no remaining Langfuse import or switch case in app.ts)

---

### Task 6: Purge Langfuse from `status.ts`

**File:** `packages/server/src/routes/status.ts`

**Changes:**

1. **Remove Langfuse keys from `SECRET_SETTING_KEYS`** (lines 34-35):
   ```typescript
   // Remove:
   "observability.langfuse_secret_key",
   "observability.langfuse_public_key",
   ```

2. **Update the `@lore` comment** (line 26): remove "and Langfuse secret keys" from the comment.

**Proves:** AC2

---

### Task 7: Purge Langfuse from comment-only references in server code

These files contain Langfuse only in comments. Update or remove the comment text.

| File | Line | Change |
|---|---|---|
| `packages/server/src/services/observability/dispatcher.ts` | 11 | Change "a Langfuse outage must never stall" to "an adapter outage must never stall" |
| `packages/server/src/services/observability/dispatcher.ts` | 375 | Change "task-scoped Langfuse traces" to "task-scoped traces" |
| `packages/server/src/services/session-provisioning.ts` | 360 | Change "safe to ship to Langfuse" to "safe to ship to the observability adapter" |
| `packages/server/src/harness/claude-agent-sdk-adapter.ts` | 21 | Change "Langfuse keys, etc" to "observability keys, etc" |
| `packages/server/src/app.ts` | 329 | Check if line 329 comment references Langfuse ("not block the PATCH route on an outbound Langfuse flush") -- change to "outbound adapter flush" |

**Proves:** AC10

---

### Task 8: Update test files

#### 8a. Delete the Langfuse-specific test sections in `h3-review-fixes.test.ts`

**File:** `packages/server/src/__tests__/observability/h3-review-fixes.test.ts`

**Changes:**

1. **Remove import** of `createLangfuseObservabilityAdapter` (line 51).

2. **Remove `"langfuse"` from `captureAdapter` signature** (line 58): change `name: "console" | "langfuse" = "console"` to `name: "console" = "console"`. Actually, the `name` parameter's type will be `ObservabilityChannel` which is now `"console" | "noop"`, so change the default and type accordingly.

3. **Delete the entire `describe("H3 review fixes -- (3) Langfuse flush race")` block** (lines 240-323). This test creates a real HTTP server and exercises `createLangfuseObservabilityAdapter` -- the adapter no longer exists.

4. **Delete the entire `describe("H3 review fixes -- (4) DNS rebinding TOCTOU")` block** (lines 325-387). Both tests create `createLangfuseObservabilityAdapter` instances.

5. **Update `describe("H3 review fixes -- (5) PATCH /config live rebuild")` block** (lines 389-510): remove Langfuse comments and Langfuse key fields from the test that patches config with `langfusePublicKey` / `langfuseSecretKey` (lines 456-469). The test can still exercise the enable/disable/re-enable cycle without Langfuse keys -- just patch `enabled: true` without the key fields.

6. **Delete the entire `describe("H3 review fixes -- (7) stable envelopeId")` block** (lines 537-end of that describe). This test exercises `createLangfuseObservabilityAdapter` to verify envelope ID stability.

7. **Update the file-level docstring** (lines 1-28): remove items 3, 4, 7 from the list (Langfuse flush race, DNS rebinding, stable envelopeId). Renumber remaining items.

#### 8b. Rewrite Langfuse-specific tests in `routes.test.ts`

**File:** `packages/server/src/__tests__/observability/routes.test.ts`

**Changes:**

1. **GET /config tests** (lines 71-101): The "redacts keys when set" test seeds `observability.adapter: "langfuse"` and Langfuse keys, then asserts `body.langfuse.publicKey === "***"`. After the purge, the config response has no `langfuse` property. Rewrite this test to seed `adapter: "console"` and verify the config shape has `enabled`, `adapter`, `batchSize`, `flushIntervalMs`, `bufferCap` -- no `langfuse` property. The "reports null when keys are unset" test similarly needs rewriting.

2. **PATCH /config tests** (lines 103-180): The "persists valid patch + emits admin audit" test sends `adapter: "langfuse"` with Langfuse keys. Rewrite to send `adapter: "console"` with only the surviving fields. The SSRF and CR/LF injection tests (`langfuseUrl`, `langfusePublicKey`) are deleted entirely -- those validation paths no longer exist.

3. **Add a new test:** "rejects adapter: langfuse as invalid" -- `PATCH /config` with `{ adapter: "langfuse" }` returns 400. This proves AC3.

#### 8c. Update `status.test.ts`

**File:** `packages/server/src/__tests__/status.test.ts`

**Changes:** Remove the two Langfuse-keyed rows from `SECRET_ROWS` (lines 242-243). The test still exercises redaction for the remaining notification secrets.

#### 8d. Update `status-settings-write.test.ts`

**File:** `packages/server/src/routes/__tests__/status-settings-write.test.ts`

**Changes:** Remove `"observability.langfuse_secret_key"` and `"observability.langfuse_public_key"` from the `BLOCKED_KEYS` array (lines 45-46). The test still exercises blocking for notification and git-export keys.

#### 8e. Update `dispatcher.test.ts`

**File:** `packages/server/src/__tests__/observability/dispatcher.test.ts`

**Changes:** The "status reflects adapter name" test (lines 216-224) creates `fakeAdapter("langfuse")` and asserts `status().adapter === "langfuse"`. Change to use `"noop"` (or `"console"`) and assert accordingly.

#### 8f. Update `O3-service-move-bootstrap.test.ts`

**File:** `packages/server/src/__tests__/O3-service-move-bootstrap.test.ts`

**Changes:** Remove `"langfuse-adapter.ts"` from the `observabilityFiles` array (line 282). The test verifies that observability files remain in `server/src/services/observability/` -- the list must match the surviving files.

**Proves:** AC8 (all tests pass), AC10

---

### Task 9: Update comment-only references in shared packages

| File | Line | Change |
|---|---|---|
| `packages/shared/src/redact.ts` | 5 | Change "langfuse-adapter" to remove the Langfuse reference: "scrubbers (notifications/redact.scrubErrorMessage)" |
| `packages/shared/src/redact.ts` | 22 | Change "OpenAI / Langfuse / generic" to "OpenAI / generic" |
| `packages/shared/src/redact.ts` | 25 | Change "Langfuse / generic" to "Generic" |
| `packages/shared/src/observability/events.ts` | 7 | Change "shipped to Console/Langfuse" to "shipped to the configured adapter (Console, etc.)" |
| `packages/shared/src/net/ssrf.ts` | 5 | Change "can guard Langfuse, future webhook adapters" to "can guard webhook adapters" |
| `packages/shared/src/net/ssrf.ts` | 39 | Change "Matches ntfy + Langfuse" to "Matches ntfy" |
| `packages/shared/src/net/ssrf.ts` | 44 | Change example `"langfuse url"` to `"webhook url"` |
| `packages/fabric/src/services/notifications/redact.ts` | 5 | Change "Langfuse adapter, notifications" to "notifications" |
| `packages/fabric/src/services/notifications/redact.ts` | 28-34 | Remove "Langfuse keys" references from the `@lore` comment; update to reference only SMTP/ntfy credentials. Remove the `sanitizeLangfuseKey` reference. |

**Proves:** AC10

---

### Task 10: Update SSRF test file (comment-only, test data)

**File:** `packages/shared/src/__tests__/ssrf.test.ts`

The test uses `"langfuse.com"` and `"cloud.langfuse.com"` as test URLs. These are just example domain strings used to test the SSRF sanitizer -- they are not Langfuse-specific code. However, the AC says `grep -ri "langfuse" packages/` must return zero. Replace:

| Line | Before | After |
|---|---|---|
| 56 | `isPrivateHostLiteral("langfuse.com")` | `isPrivateHostLiteral("example.com")` |
| 62 | `sanitizeHttpUrl("https://cloud.langfuse.com")` | `sanitizeHttpUrl("https://api.example.com")` |
| 69 | `{ label: "langfuse url" }` | `{ label: "webhook url" }` |
| 78 | `"https://user:pass@cloud.langfuse.com"` | `"https://user:pass@api.example.com"` |
| 112 | `"https://langfuse.example.com"` | `"https://traces.example.com"` |

**Proves:** AC10

---

### Task 11: Update documentation

#### 11a. `docs/architecture/system-overview.md` (line 51)

Replace ASCII art cell:
```
// Before:
│  │ Langfuse/LangSmith/  │
│  │ no-op                │
// After:
│  │ Console / no-op /    │
│  │ OpenTelemetry (planned) │
```

#### 11b. `docs/architecture/technology-summary.md` (line 18)

```
// Before:
| Observability | No-op / local file | Langfuse, LangSmith |
// After:
| Observability | Console / no-op | OpenTelemetry (planned) |
```

#### 11c. `docs/architecture/components.md` (lines 335-337)

Replace the Langfuse bullet:
```
// Before:
- **Langfuse** (self-hosted) -- one `docker compose up` for traces, evals, cost tracking.
- **LangSmith / Helicone** (managed) -- zero-ops, paid.
// After:
- **OpenTelemetry** (planned) -- future integration for traces, evals, cost tracking.
```

#### 11d. `docs/requirements/system-requirements.md` (line 69)

```
// Before:
**S-7.2** Default adapter is no-op for minimal installs. Supported backends: Langfuse (self-hosted), LangSmith, Helicone (managed).
// After:
**S-7.2** Default adapter is console for minimal installs. OpenTelemetry integration is planned for production backends.
```

#### 11e. `docs/architecture/deployment-architecture.md` (lines 28, 35)

Line 28: Change "Optional: Langfuse container for observability." to "Optional: OpenTelemetry collector for observability (planned)."

Line 35: Remove `Langfuse (docker compose, optional)` from the directory tree.

#### 11f. `docs/human-interface-layer/what-this-layer-is-not.md` (line 8)

```
// Before:
- **Observability backends.** We emit traces to Langfuse / LangSmith / whatever; we don't run them.
// After:
- **Observability backends.** We emit traces to the configured adapter (console, OpenTelemetry planned); we don't run them.
```

**Proves:** AC6

---

### Task 12: Remove `langfuse` from `.claude/settings.local.json`

**File:** `.claude/settings.local.json`

Remove `"langfuse"` from the `enabledMcpjsonServers` array (line 54). If the array becomes empty, remove the key entirely.

**Proves:** AC10 (no remaining references outside `plans/` and `docs/archive/`)

---

### Task 13: Final validation

Run the following in order:
1. `grep -ri "langfuse" packages/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" | grep -v node_modules | grep -v plans/ | grep -v docs/archive/` -- must return zero lines
2. `bun run check` -- zero type errors
3. `bun run lint` -- zero lint errors
4. `bun run test` -- all green
5. `bun dev` -- app starts, hit `http://localhost:5173` and verify it loads

**Proves:** AC8, AC9, AC10

---

## Type signatures after purge

### `ObservabilityChannel` (types.ts)
```typescript
export type ObservabilityChannel = "console" | "noop";
```

### `ObservabilityConfig` (config.ts)
```typescript
export interface ObservabilityConfig {
    readonly enabled: boolean;
    readonly adapter: ObservabilityChannel;
    readonly batchSize: number;
    readonly flushIntervalMs: number;
    readonly bufferCap: number;
}
```

### `SafeObservabilityConfig` (config.ts)
```typescript
export type SafeObservabilityConfig = ObservabilityConfig;
```

### `ObservabilityConfigPatch` (config.ts)
```typescript
export interface ObservabilityConfigPatch {
    enabled?: boolean;
    adapter?: ObservabilityChannel;
    batchSize?: number;
    flushIntervalMs?: number;
    bufferCap?: number;
}
```

### PATCH `/api/observability/config` Zod schema
```typescript
const adapterEnum = z.enum(["console", "noop"]);

const patchConfigSchema = z.object({
    enabled: z.boolean().optional(),
    adapter: adapterEnum.optional(),
    batchSize: z.number().int().min(1).max(1000).optional(),
    flushIntervalMs: z.number().int().min(100).max(60_000).optional(),
    bufferCap: z.number().int().min(100).max(100_000).optional(),
}).strict();
```

### GET `/api/observability/config` response shape
```typescript
{
    enabled: boolean;
    adapter: "console" | "noop";
    batchSize: number;
    flushIntervalMs: number;
    bufferCap: number;
}
```

---

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A -- no new endpoints; existing rate limits preserved | -- |
| Input-trust boundary | N/A -- no new agent-authored fields | -- |
| Secret handling | Positive -- removing Langfuse key storage reduces secret surface area | Deletion is the fix |
| Path traversal | N/A -- no path inputs | -- |
| SSRF | Positive -- removing `sanitizeLangfuseUrl` and the Langfuse adapter eliminates one outbound URL surface. The shared `sanitizeHttpUrl` stays for other consumers. | Deletion is the fix |
| Regression risk | Low -- `bun run check` will catch any dangling import; `bun run test` catches behavioral regressions | Task 13 verification |

---

## Protected tests

These test files exist today and their non-Langfuse assertions must not change:

```
protectedTests:
  - packages/server/src/__tests__/observability/dispatcher.test.ts
  - packages/server/src/__tests__/observability/console-adapter.test.ts
  - packages/server/src/__tests__/observability/performance.bench.test.ts
  - packages/server/src/__tests__/observability/trace-correlation.test.ts
  - packages/server/src/__tests__/api-e2e.integration.test.ts
  - packages/server/src/__tests__/server-factory.integration.test.ts
  - packages/shared/src/__tests__/ssrf.test.ts
```

These files will be **modified** but their surviving assertions must remain green:

```
modifiedTests:
  - packages/server/src/__tests__/observability/routes.test.ts
  - packages/server/src/__tests__/observability/h3-review-fixes.test.ts
  - packages/server/src/__tests__/status.test.ts
  - packages/server/src/routes/__tests__/status-settings-write.test.ts
  - packages/server/src/__tests__/observability/dispatcher.test.ts
  - packages/server/src/__tests__/O3-service-move-bootstrap.test.ts
```

The following test file is **deleted entirely**:

```
deletedTests:
  - packages/server/src/__tests__/observability/langfuse-adapter.integration.test.ts
```

---

## Migration checklist

| Symbol removed | Call sites that reference it | Migration action |
|---|---|---|
| `langfuse-adapter.ts` (file) | `app.ts` import, `h3-review-fixes.test.ts` import, `langfuse-adapter.integration.test.ts` import, `O3-service-move-bootstrap.test.ts` file list | Delete file; remove imports; remove from file list |
| `createLangfuseObservabilityAdapter` (function) | `app.ts` line 41+117, `h3-review-fixes.test.ts` line 51+281+336+364+564, `langfuse-adapter.integration.test.ts` line 13+65+ | Delete function with file; remove all imports and usages |
| `sanitizeLangfuseUrl` (function) | `observability-routes.ts` lines 13, 58 | Delete function; remove import and call |
| `sanitizeLangfuseKey` (function) | `observability-routes.ts` lines 12, 62, 66 | Delete function; remove import and calls |
| `LangfuseAdapterOptions` (interface) | Only in `langfuse-adapter.ts` | Deleted with file |
| `KEYS.langfuseUrl` / `.langfusePublicKey` / `.langfuseSecretKey` | `config.ts` `buildConfig`, `updateObservabilityConfig` | Remove from KEYS object and all read/write sites |
| `ObservabilityConfig.langfuse` (property) | `config.ts` `buildConfig`, `redactObservabilityConfig`; `app.ts` `buildObservabilityAdapter` | Remove property; remove all reads |
| `"langfuse"` adapter enum value | `types.ts`, `config.ts` ADAPTERS set, `observability-routes.ts` adapterEnum, `app.ts` switch case, `dispatcher.test.ts`, `h3-review-fixes.test.ts` `captureAdapter`, `routes.test.ts` multiple tests | Remove from type, set, enum, switch; update tests |
| `SECRET_SETTING_KEYS` entries for `observability.langfuse_*` | `status.ts` lines 34-35, `status.test.ts` lines 242-243, `status-settings-write.test.ts` lines 45-46 | Remove entries from set and test arrays |

---

## Risks and ambiguities

1. **Low risk:** Some tests in `h3-review-fixes.test.ts` test infrastructure patterns (flush race, DNS rebinding TOCTOU, stable envelope IDs) that are Langfuse-specific implementations of general concerns. Once a future OTEL adapter is built, equivalent tests should be written for it. The general SSRF infrastructure (`sanitizeHttpUrl`, `resolveUrlForSSRF`) remains tested in `ssrf.test.ts`.

2. **Low risk:** The `redactObservabilityConfig` function becomes a passthrough after the purge. It is kept rather than inlined because the API route calls it and a future OTEL adapter may re-introduce fields that need redaction. Cost of keeping: one trivial function. Cost of removing: migration when OTEL lands.

3. **No ambiguity:** The spec says to keep the `ObservabilityAdapter` interface, `dispatcher.ts`, and `console-adapter.ts`. These are not touched beyond comment updates.

---

## Task dependency graph

```
Task 1 (delete adapter file) ─┐
Task 2 (narrow type)          ─┤
Task 3 (purge config.ts)      ─┼─> Task 8 (update tests) ─> Task 13 (validate)
Task 4 (purge routes)         ─┤
Task 5 (purge app.ts)         ─┤
Task 6 (purge status.ts)      ─┤
Task 7 (server comments)      ─┘
Task 9 (shared comments)      ─────> Task 13
Task 10 (ssrf test data)      ─────> Task 13
Task 11 (docs)                ─────> Task 13
Task 12 (settings.local.json) ─────> Task 13
```

Tasks 1-7 can be done in any order but must all complete before Task 8 (tests will fail with dangling imports until source changes land). Tasks 9-12 are independent of each other and of Tasks 1-7. Task 13 is the final gate.

In practice, the builder should work through Tasks 1-12 in a single pass, then run Task 13.
