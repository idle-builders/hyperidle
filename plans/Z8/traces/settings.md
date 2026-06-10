# Settings — Deep Trace Audit (Z8)

Audited 2026-06-10. Every interactive + display element in the Settings domain, traced DOM → handler → hook → fetch → route → service → Drizzle → table.

**Page mount:** `packages/web/src/pages/SettingsPage.tsx:34-138` — stacked single-page layout (no sidebar nav, W3 AC-47), max-width 680px. Renders, in order: Profile (:54), Org chart (:64), Models (:74), Assistant (:84, only when `useCurrentUser()` resolves), Appearance (:96), Credentials (:106), Notifications (:116), Backend (:126). **That is 8 sections, not 11.** `SettingsWorker`, `SettingsAgents` exist as components but are mounted nowhere; a `SettingsTeams` component does not exist at all (see FLAGS 1–3).

All client fetches go through `apiFetch` (`packages/web/src/services/api-fetch.ts`) which injects `X-API-Key` on `/api/*` (Electron bridge key → `VITE_HYPERIDLE_API_KEY` → dev fallback `"hyperidle-dev-local"`).

---

## Section-by-Section Inventory

### 1. Profile — `packages/web/src/settings/SettingsProfile.tsx`

| Element | File:Line | Chain | DB |
|---|---|---|---|
| "Display name" Input | SettingsProfile.tsx:79-86 | `onChange → setName` (local state) | — |
| "Email" Input (type=email) | :88-96 | `onChange → setEmail` | — |
| "Save profile" Button (disabled unless dirty) | :99-102 | `handleSave` (:41-62) → `PATCH /api/users/:id` body `{name, email}` → `packages/server/src/routes/users.ts:192-238` (self-only guard :197, zod `patchUserSchema` :39-42 — `email` validated `.email()`) → `db.update(users).set({name,email})` users.ts:233 → returns full updated row | `users` UPDATE (schema.ts:35) |
| Loading skeleton / error text | :64-75 | from `useCurrentUser()` → `GET /api/auth/me` (hooks/useCurrentUser.ts:40) | `users` SELECT (auth) |
| Toast "Profile saved"/"Failed to save profile" | :56,:58 | `useToast` (shell/ToastRegion) | — |

Dirty tracking present (AC-25): `isDirty = name !== savedName || email !== savedEmail` (:39); saved values updated only on 2xx.

### 2. Org chart — `packages/web/src/settings/SettingsOrgChart.tsx`

Data load: `loadOrg` (:88-99) → `GET /api/org` → `packages/server/src/routes/org.ts:39-51` → `db.select().from(orgEdges)` (org.ts:40) + `db.select(...).from(users)` (:41-48) → `{edges, users}`.

| Element | File:Line | Chain | DB |
|---|---|---|---|
| Solo-mode message (exactly 1 human) | :188-195 | derived from GET /api/org users (kind="human") | — |
| Edge table rows (From/Mechanism/Target) | :206-237 | display of `edges`; names resolved client-side via `userName()` :198 | `org_edges` SELECT |
| Per-row "Delete" button | :224-232 | `handleDelete` (:105-126) → `DELETE /api/org/edges/:id` → org.ts:152-162: SELECT existence (404 if missing, :155-158) → `db.delete(orgEdges).where(eq(id))` org.ts:160 → 204. UI removes row optimistically from state, toast | `org_edges` DELETE (schema.ts:483) |
| "+ Add Edge" button | :242-249 | `setShowAddForm(true)` — reveals inline `AddEdgeForm` | — |
| From `<select>` (users) | :341-355 | local state `fromUserId` | — |
| Mechanism `<select>` (direct/function/team) | :366-379 | local state; changing mechanism clears target (:260-263) | — |
| Target — context-aware: user select (direct) / team select (team) / free-text input (function) | :390-436 | local state `target`; team options derived from existing edges' targets via `deriveTeams` :303-311 | — |
| "Add" submit | :460-468 | `handleAdd` (:128-164) → `PUT /api/org/edges` body `{fromUserId, mechanism, target}` → org.ts:54-149: zod :26-30, fromUser existence check :73 (SELECT users), mechanism-dependent target validation — direct → users SELECT :86; function → non-empty string :96; team → **`teamMembers` SELECT by id** :107-111; duplicate check against composite unique index :124-134 → 200 existing or `db.insert(orgEdges)` :145 + re-SELECT → 201 | `org_edges` INSERT; `users`, `team_members` SELECT |
| Inline form error (`role="alert"`) | :441-449 | server `error` string surfaced (:157-160) — also toasted | — |
| "Cancel" | :452-459 | resets form state | — |

### 3. Models — `packages/web/src/settings/SettingsModels.tsx`

Data load: `loadConfig` (:257-273) → `GET /api/model-gateway` → `packages/server/src/routes/model-gateway.ts:103-106` → `readServerConfig(db)` (`services/server-config.ts:146-165`: SELECT `server_config` row id="default", JSON.parse, Zod `ServerConfigSchema`, fall back to `BUILT_IN_GATEWAY_CONFIG` from `services/model-gateway.ts:34-38`) → `sanitizeConfig` strips `apiKey`, adds `hasApiKey: Boolean(apiKey)` (model-gateway.ts:75-90, A-SEC-2).

3 tier rows (reasoning/workhorse/fast), always expanded (`ALL_TIERS` :62, `TierRow` :112-233):

| Element | File:Line | Chain | DB |
|---|---|---|---|
| Provider `<select>` per tier (anthropic/openrouter/openai-compatible from `MODEL_PROVIDERS`, shared/model-gateway.ts:22) | :128-141 | `handleChange(tier,"provider",v)` :330-350 → **debounced 500ms** (`saveTimerRef`, setTimeout :340-344) → `saveConfig` :283-324 | see below |
| Model: `<select>` of `KNOWN_ANTHROPIC_MODELS` (:64-68) when anthropic, free-text `<input>` otherwise | :148-172 | same debounced chain | see below |
| Credential status dot + label ("Credential set"/"No credential") for anthropic/openrouter | :176-186 | rendered from `hasApiKeyMap[tier]` (GET/PATCH response `hasApiKey`) — see FLAG 7 | — |
| Base URL input (openai-compatible only) | :196-204 | debounced chain | see below |
| API Key input (type=password, openai-compatible only) + green stored-dot | :212-227 | debounced chain; placeholder "Key stored — enter to replace" | see below |
| "Saving…" indicator | :383 | `saving` state | — |

**Persist chain:** `saveConfig` builds full 3-tier body, includes `baseUrl`/`apiKey` only when openai-compatible AND non-empty (:288-301) → `PATCH /api/model-gateway` → model-gateway.ts:112-117: `validateBody(PatchModelGatewaySchema)` (superRefine :45-65 — rejects apiKey on non-openai-compatible, requires baseUrl for openai-compatible) → `updateServerConfig(db, {modelGateway: body})` (server-config.ts:171-206: read-merge — **modelGateway is full replacement, not deep merge** :183 — then UPSERT `server_config` row id="default" with JSON blob :196-203) → response re-sanitized.

**Config persists in `server_config` (singleton JSON blob, schema.ts:812-818), NOT `factory_settings`** — confirmed by @lore X4 A-SPEC-2 in model-gateway.ts:18-21. The openai-compatible `apiKey` is stored **plaintext** inside that JSON (see FLAGS 5, 6).

### 4. Assistant (AD8b) — `packages/web/src/settings/SettingsAssistant.tsx`

Load: useEffect :41-74 → `GET /api/users/:userId/assistant` (header `X-Identity: userId`) → mounted `users.ts:397` → `routes/assistant.ts:244-295`: self-only check via `readSenderId` (X-Identity header wins over auth context, assistant.ts:40-45), user SELECT, assistant agent lazily created as `users` INSERT with id `ast-{userId}`, kind="ai", role="assistant", agentCategory="individual" (:268-281) → returns `{id, name, soulPrompt}`.

| Element | File:Line | Chain | DB |
|---|---|---|---|
| Soul prompt `<textarea id="soul-prompt">` (10 rows, mono) | :135-154 | `onChange → setSoulPrompt`; dirty = `soulPrompt !== savedPrompt` (:76) | — |
| "Save" button (Save/Saving.../Saved; disabled when clean) | :170-178 | `handleSave` :78-110 → `PATCH /api/users/:userId/assistant` body `{soulPrompt}` → assistant.ts:298-383: 403 cross-user, zod max 50,000 chars (:36-38) + explicit re-check :331, lazy agent create, `db.update(users).set({soulPrompt}).where(eq(users.id, "ast-"+userId))` assistant.ts:373-376 | `users` UPDATE (`soul_prompt` column, schema.ts:67) |
| Inline error `role="alert"` / "Saved" confirmation (2s auto-reset :105) | :157-167 | save state machine idle/saving/saved/error | — |

**Note:** the prompt brief said "PATCH /api/threads/assistant" — that endpoint does not exist; `GET /api/threads/assistant` (assistant.ts:149-226) only resolves/creates the assistant *thread* (`threads` INSERT, id `thr-ast-{userId}`). The soul prompt lives on the assistant agent's `users.soul_prompt`, edited via `/api/users/:userId/assistant`.

### 5. Appearance — `packages/web/src/settings/SettingsAppearance.tsx`

| Element | File:Line | Chain | Persistence |
|---|---|---|---|
| Theme swatch cards ×3 (Light/Dark/System), `aria-pressed`, `data-theme-option` | :74-104 | `onClick → handleThemeChange` :59-65 → `setTheme` from `useTheme` (hooks/useTheme.ts:107-117): `localStorage.setItem("hyperidle-theme", next)` :109, resolve via `matchMedia("(prefers-color-scheme: dark)")` :39-44, apply `data-theme="hearth-dark"/"hearth-light"` on `<html>` :50-56; toast "Appearance saved" | **localStorage only — no server call, no DB** |
| Swatch preview strips (fixed hex by design, @lore W3 AC-50) | :41-53,:92-97 | display only | — |

useTheme extras: OS media-query subscription while in `system` mode (useTheme.ts:82-93); **cross-tab sync** via `window storage` event on key `hyperidle-theme` (:96-105); boot script in index.html paints initial theme pre-React (lore :10-13). Invalid stored values coerced to `"system"` (:25-37). Theme is **never persisted server-side**; `GET /api/settings` deliberately excludes appearance (settings.ts route, lore :96-98) and `useSettings` composes it client-side (useSettings.ts:62-68).

### 6. Credentials — `packages/web/src/components/CredentialsTab.tsx`

Gate: `window.__HYPERIDLE__` bridge required (:362-372) — browser shows "desktop app only" message. Two modes: catalog (bridge has `credentials.status`, :376-378) or legacy list (N4 compat, :380).

**Catalog mode** (`CatalogModeCredentials` :72-238) — fixed 3-entry catalog (anthropic_api_key / openrouter_api_key / shared_backend_key, :26-42):

| Element | File:Line | Chain | Storage |
|---|---|---|---|
| State label per entry (Absent / Present (untested) / Valid / Invalid) | :148-155 | `loadStatus` :80-83 → `bridge.credentials.status()` → IPC `credentials:status` → `packages/desktop/src/safe-credentials.ts:197-210` (catalog presence + in-memory validationState map) | credentials.json file |
| "Validate" button (shown for present_untested/invalid) | :157-170 | `handleValidate` :118-133 → IPC `credentials:validate` → safe-credentials.ts:213-241 → decrypt + `validateCredential` (desktop credential-validator.js, live service call) | — |
| "Set"/"Update" button → password input + Save/Cancel | :171-231 | `handleSave` :89-108 → IPC `credentials:set` → safe-credentials.ts:108-136: `safeStorage.encryptString` (:45-51) → base64 blob written to `credentials.json` **mode 0o600** (:92-97); if encryption unavailable → in-memory only + warning surfaced in UI (:203-205) | OS keychain-backed safeStorage |
| "Remove" button | :182-190 | `handleDelete` :110-116 → IPC `credentials:delete` → safe-credentials.ts:175-186 (removes from file + memory) | credentials.json |

**Legacy mode** (:252-355): `bridge.credentials.list()` rows with static `••••••••` mask, freeform name/value add (rejected with warning unless catalog name), Remove per row.

**Server-side counterpart** (shared mode; not called by this UI): `packages/server/src/routes/credentials.ts` —
- `GET /api/credentials` :179-188 → SELECT `server_credentials`, returns only `{name, state, lastValidatedAt}` per `CREDENTIAL_CATALOG`.
- `PUT /api/credentials/:name` :191-251, **rate-limited 20/min** (:172) → zod `{value: min(1)}` → `encryptCredentialValue` (`services/credential-encryption.ts:45-57`: **AES-256-GCM**, key = **HKDF-SHA256 of `HYPERIDLE_CREDENTIAL_KEY` ?? `HYPERIDLE_API_KEY`** (:96-98), fixed salt `hyperidle-credential-encryption-v1`, format `base64(iv12 + ct + tag16)`) → UPSERT `server_credentials` (SELECT :219-222, UPDATE :225-233 or INSERT :235-241), state reset to `present_untested`.
- `DELETE /api/credentials/:name` :254-263 → DELETE row → 204.
- `POST /api/credentials/:name/validate` :266-331, **rate-limited 3/min** (:173, F-SEC-1) → SELECT row → decrypt → dispatch validator (Anthropic `/v1/models` :33-60; OpenRouter `/auth/key` :65-91; shared key self-call `/api/health/auth` :98-127; all 10s timeout) → UPDATE `validationState` valid/invalid + `lastValidatedAt` (:320-323). Response never includes the value (:325-330).

DB: `server_credentials` (schema.ts:791-801) — name PK, encrypted_value, validation_state, last_validated_at, updated_at.

### 7. Notifications — `packages/web/src/settings/SettingsNotifications.tsx`

Load: `useSettings()` (hooks/useSettings.ts:41-110) → `GET /api/settings` → `routes/settings.ts:62-64 → buildSettingsResponse` :105-157: `users` SELECT (human profile :120, ai users :128), `teams` SELECT :126, notifications via `readServerConfig` :123 → `server_config` SELECT. Effect :101-110 syncs three server-backed toggles into local state. Solo gating: `useHumanCount` (hooks/useHumanCount.ts → `GET /api/org`) hides blocker + email-digest toggles when humanCount ≤ 1 (fail-open on null, :83-92).

| Element | File:Line | Chain | DB |
|---|---|---|---|
| "Review requests" Toggle | :131-138 (key `review-requests`) | `handleChange` :112-127 → maps to `notifications.reviewAlerts` via `SERVER_KEY_MAP` :45-49 → `void save(updated)` → `PATCH /api/settings` body `{notifications}` (useSettings.ts:83-95) → settings.ts:66-90: zod :36-55 → `updateServerConfig(db, {notifications})` → deep-merge + UPSERT `server_config` | `server_config` UPSERT |
| "Cost alerts" Toggle | same | → `notifications.costAlerts` | `server_config` |
| "Blocker notifications" Toggle (team mode only) | same | → `notifications.blockerAlerts` | `server_config` |
| "Email digests" Toggle (team mode only) | :131-138 (key `email-digests`) | **local state only** — no `SERVER_KEY_MAP` entry, `handleChange` returns at :116 | **none** |

QW-3 verification: the gap is **partially closed** — review/cost/blocker toggles DO persist now (AD5). Email digests remains local-only and silently resets on refresh (FLAG 8). Error handling regression: see FLAG 9.

### 8. Backend — `packages/web/src/settings/SettingsBackend.tsx`

| Element | File:Line | Chain |
|---|---|---|
| Mode label ("Local (laptop)" / "Shared (remote)") + hint | :30-36 | display only — `window.__HYPERIDLE__?.platform` (:23) compared to `"shared"` (:24) |

No interactive elements; no API/DB. **Bug:** `platform` is hard-coded `"electron"` in the preload (desktop/src/preload.ts:15, window.d.ts:24); the local/shared discriminator is `backendMode` (preload.ts:17, window.d.ts:26). `platform !== "shared"` is always true → label always "Local (laptop)" even on a shared backend (FLAG 4).

### 9. Worker (S4) — `packages/web/src/settings/SettingsWorker.tsx` — **NOT MOUNTED**

Component exists + tested, but no production import (only `__tests__/SettingsWorker.test.tsx`, `SettingsWorker.stories.tsx`). Its own @lore (:9-13) references nav filtering in AppShell that no longer exists. If it were mounted:

| Element | File:Line | Chain |
|---|---|---|
| Gating | :102-127 | non-Electron → "requires desktop app"; Electron + `window.__HYPERIDLE__.backendMode !== "shared"` (:31-33) → "requires shared backend mode" — **correctly uses `backendMode`**, unlike SettingsBackend |
| "Register this device as a worker" checkbox toggle | :158-169 | `handleToggle` :131-140 → `bridge.worker.enable(maxConcurrent)` / `disable()` → IPC `worker:enable/disable` (preload.ts:41-47) → `DesktopWorkerClient` (desktop/src/desktop-worker-client.ts): POST `/api/auth/worker-token` → WS `/api/ws/worker?token=…` → register ack |
| "Max concurrent sessions" number input (1-8) | :175-183 | local state passed to `enable()` |
| ConnectionBadge (connected/connecting/disconnected) | :51-65,:190-197 | initial `bridge.worker.status()` + `onStatusChange` subscription :88-98 |
| Active sessions `n / max` | :200-205 | display from status |
| Pause / Resume buttons | :208-228 | `bridge.worker.pause()/resume()` → IPC → worker client |

No server DB writes from this UI; worker state lives in the desktop main process / server WS registry.

### 10. Agents (X3) — `packages/web/src/settings/SettingsAgents.tsx` — **NOT MOUNTED**

Component exists + fully tested, but mounted nowhere in production code. Traced anyway:

Load: `loadAgents` :75-86 → `GET /api/agents` → `routes/agents.ts:117-147`: `users` SELECT kind="ai" ∧ role≠"system" ∧ status≠"retired" (:119-122) + `sessions` active-count GROUP BY (:125-129) → AgentConfig[] incl. `activeSessions`.

| Element | File:Line | Chain | DB |
|---|---|---|---|
| Agent table (Name/Role/Harness/Model Tier/Sessions/Actions) | :271-492 | display | `users`, `sessions` SELECT |
| "Edit" per row → inline expand form (name input, role select from `AGENT_ROLE_CATALOG`, harness input, tier select from `MODEL_TIERS`, max-sessions number 1-20, soul prompt textarea 8 rows) | :299-305, :328-487 | `handleEditSave` :148-175 → `PATCH /api/agents/:id` → agents.ts:207-266: 404, 403 for kind≠ai/system role (:214-216), zod `patchAgentSchema` :44-51, partial update-set `buildPatchUpdateSet` :60-71 → `db.update(users).set(...)` agents.ts:240 → re-SELECT + active count | `users` UPDATE |
| "Delete" → "Confirm?" two-click, **3s auto-revert** | :307-324 | `handleDeleteFirstClick` :212-222 (setTimeout 3000 → reset `confirmingDeleteId`); `handleDeleteConfirm` :224-243 → `DELETE /api/agents/:id` → agents.ts:269-286: 404 / 403 system / **409 only when already retired** (:279-281) → soft-delete `db.update(users).set({status:"retired"})` :283 | `users` UPDATE |
| "+ Add Agent" → add form | :496-648 | `handleAddSave` :177-210 → `POST /api/agents` → agents.ts:150-204: zod `createAgentSchema` :33-42, category derived role-catalog→"team" (:171-172) → `db.insert(users)` :174-187 → 201 | `users` INSERT |
| Role select in add form pre-fills soul prompt | :518-535 | `fetchTemplate` :110-135 (AbortController dedupe) → `GET /api/agents/templates/:role` → agents.ts:99-114 → SELECT `factory_settings` key `soul_template:{role}` | `factory_settings` SELECT |
| Escape key closes edit/add forms | :93-103 | window keydown listener | — |

**The expected 409-on-active-sessions delete guard does not exist** — see FLAG 10.

### 11. Teams — **DOES NOT EXIST**

`SETTINGS_SECTIONS` (settings/settings-types.ts:33-43) still lists `{id:"teams", label:"Teams"}` with lore "Retained as sidebar nav item (no page section)", but `SETTINGS_SECTIONS` itself is referenced by zero production components (only a stale comment in SettingsWorker.tsx:10). No `SettingsTeams.tsx`. Team data appears read-only inside `GET /api/settings` (`teams` array) but no Settings UI consumes it.

---

## Persistence Map

| Setting | Mechanism | Table / file | Op site |
|---|---|---|---|
| Profile name/email | PATCH /api/users/:id | `users` (name, email) | routes/users.ts:233 |
| Org edges | PUT/DELETE /api/org/edges | `org_edges` | routes/org.ts:145 (INSERT), :160 (DELETE) |
| Model tiers (provider/model/baseUrl/apiKey) | PATCH /api/model-gateway | `server_config` row id="default", JSON key `modelGateway` (**not** factory_settings) | services/server-config.ts:196-203 |
| Assistant soul prompt | PATCH /api/users/:userId/assistant | `users.soul_prompt` of agent `ast-{userId}` | routes/assistant.ts:373-376 |
| Assistant thread (lazy) | GET /api/threads/assistant | `threads` (id `thr-ast-{userId}`) | routes/assistant.ts:195-205 |
| Theme | localStorage `"hyperidle-theme"` + `data-theme` attr; cross-tab via storage event | browser only — never server | hooks/useTheme.ts:109 |
| Notifications review/cost/blocker (+quiet hours fields via API) | PATCH /api/settings | `server_config` JSON key `notifications` | services/server-config.ts:196-203 |
| Notifications email-digests | none | none (component state) | — |
| Credentials (desktop/local mode) | IPC credentials:set | `credentials.json` (safeStorage-encrypted blobs, mode 0o600) | desktop/src/safe-credentials.ts:130-134 |
| Credentials (shared mode API) | PUT /api/credentials/:name | `server_credentials.encrypted_value` (AES-256-GCM) | routes/credentials.ts:224-242 |
| Credential validation state | POST /api/credentials/:name/validate | `server_credentials.validation_state` | routes/credentials.ts:320-323 |
| Agent CRUD | POST/PATCH/DELETE /api/agents | `users` (kind="ai"; delete = status→"retired") | routes/agents.ts:174, :240, :283 |
| Soul prompt templates | GET only | `factory_settings` key `soul_template:{role}` | routes/agents.ts:103-107 |
| Worker enable/pause | IPC → desktop main process state + server WS | no settings table | desktop-worker-client.ts |

---

## Security Notes (credential handling)

1. **Server encryption at rest:** AES-256-GCM, 12-byte random IV, 16-byte auth tag, key = HKDF-SHA256(`HYPERIDLE_CREDENTIAL_KEY` ?? `HYPERIDLE_API_KEY`, fixed salt) — services/credential-encryption.ts. There is **no key file**; the API key is the root of trust (documented Decision 3). `getServerSecret()` silently returns `""` if neither env var is set (:96-98) — encryption then runs with a key derived from the empty string (works, but worthless against anyone who reads the code).
2. **No credential echo:** GET /api/credentials returns only name/state/lastValidatedAt; GET/PATCH /api/model-gateway strip `apiKey` and return `hasApiKey` (A-SEC-2); validate responses never include the value; PATCH /api/users/:id echoes the full user row but users carry no secrets. ✓
3. **Plaintext exception:** the openai-compatible `apiKey` in the model-gateway config is stored **unencrypted** in `server_config.config` JSON — inconsistent with `server_credentials` (FLAG 6).
4. **Desktop:** safeStorage (OS keychain) encryption; file mode 0o600; in-memory fallback with visible warning when keychain unavailable. However the preload exposes `credentials.get(name)` returning **plaintext** to any renderer code (preload.ts:21, window.d.ts:30) — wider surface than the UI needs (UI never calls get()).
5. **Rate limits:** PUT/DELETE credentials 20/min; POST validate 3/min (anti-oracle) — routes/credentials.ts:172-173. Model-gateway PATCH (which can carry an apiKey) only has the global 60/min limiter (acknowledged in lore X4 A-SEC-1).
6. **Identity spoofing:** assistant soul-prompt routes resolve identity from the `X-Identity` request header *before* the authenticated context (assistant.ts:40-45). The "self-only" 403 compares header-supplied id to the URL param, so any caller holding the shared API key can read/write **any** user's assistant by setting `X-Identity` (FLAG 12).

---

## FLAGS

| # | Severity | Flag |
|---|---|---|
| 1 | HIGH | **SettingsWorker is unreachable** — component + tests + stories exist (settings/SettingsWorker.tsx) but it is imported by no page/shell. The Worker settings UI (enable device as worker, max concurrency, pause/resume) cannot be reached by any user. Its @lore still references AppShell nav filtering that no longer exists. |
| 2 | HIGH | **SettingsAgents is unreachable** — full agent CRUD UI (settings/SettingsAgents.tsx, X3) is mounted nowhere. Agent configuration is impossible from Settings. |
| 3 | MEDIUM | **Teams section is a ghost** — `SETTINGS_SECTIONS` (settings-types.ts:41) declares a "Teams" nav item, but no component exists and `SETTINGS_SECTIONS` is dead code (zero production references). Either build the section or delete the constant. |
| 4 | HIGH | **SettingsBackend checks the wrong bridge field** (SettingsBackend.tsx:23-24): compares `platform` (always `"electron"`) against `"shared"`; the actual discriminator is `backendMode`. The Backend section reports "Local (laptop)" even when connected to a shared backend. SettingsWorker.tsx:31-33 does it correctly. |
| 5 | HIGH | **Models autosave wipes the stored openai-compatible apiKey** — the UI never holds the stored key (apiKey edit state resets to `""` on load, SettingsModels.tsx:74-95) and only sends `apiKey` when non-empty (:295-298), but the server treats `modelGateway` as a **full replacement** (server-config.ts:111-113, :183). Any debounced edit (e.g. changing the reasoning model) silently erases a previously stored openai-compatible key; `hasApiKey` flips to false after save. |
| 6 | MEDIUM | **openai-compatible apiKey stored in plaintext** in `server_config.config` JSON — bypasses the AES-256-GCM machinery used for `server_credentials`. Anyone with DB read access gets the key. |
| 7 | MEDIUM | **Credential status dot for anthropic/openrouter is always "No credential"** — `hasApiKey` derives solely from the modelGateway config's own `apiKey` field (model-gateway.ts:75-80), which PATCH **rejects** for those providers. Actual credential presence lives in `server_credentials`/safeStorage and is never consulted. The dot is misleading for the two primary providers. |
| 8 | LOW (known) | **"Email digests" toggle does not persist** — local component state only (SettingsNotifications.tsx:45-49, :116); resets on refresh with no hint to the user. QW-3 residue; the other three toggles are now wired. |
| 9 | MEDIUM | **Notification toggle failures are silent unhandled rejections** — `useSettings.save` deliberately throws on non-2xx (useSettings.ts:91-93, lore "errors propagate to the caller") but SettingsNotifications calls `void save(updated)` (:126) with no catch: the toggle stays optimistically flipped, no toast, no revert, and an unhandled promise rejection is emitted. Also, toggles flipped while `settings` is still null (loading/error) are never saved at all (:116). |
| 10 | MEDIUM | **No 409-on-active-sessions guard on agent delete** — DELETE /api/agents/:id (agents.ts:269-286) returns 409 only for already-retired agents; an agent with active sessions is retired without conflict despite `activeSessions` being computed for the list view. (Moot in UI terms while FLAG 2 stands, but the API allows it.) |
| 11 | MEDIUM | **Org chart "team" mechanism is unusable/inconsistent from the UI** — server validates `target` as a `team_members.id` (org.ts:107-111) but the UI's team dropdown offers only values harvested from existing team-edge targets (SettingsOrgChart.tsx:303-311, lore claims "the target field contains the team name"). The first team edge can never be created from the UI (empty dropdown, no free-text path), and any value that did exist would render as a raw id in a name column. |
| 12 | HIGH | **X-Identity header spoofing on assistant routes** — `readSenderId` prefers the client-supplied `X-Identity` header over the authenticated `userId` (assistant.ts:40-45); the self-only 403 is therefore self-defeating: set `X-Identity: <victim>` and read/overwrite anyone's assistant soul prompt with only the shared API key. |
| 13 | MEDIUM | **Live type error in useSettings.ts** — `buildDefaultAppearance` returns `{ density: "auto", theme }` but `AppearanceSettings` only has `theme` (TS2353 confirmed via `tsc --noEmit` in packages/web; also TS2339 in its test at useSettings.test.ts:129). Leftover from the W2 density removal. |
| 14 | LOW | **Error swallowing patterns** — SettingsModels/SettingsOrgChart/SettingsAgents/SettingsProfile catch all save errors into a generic toast with no status/error detail (e.g. SettingsModels.tsx:317-318); SettingsAgents `fetchTemplate` intentionally swallows non-abort errors (:128 comment contradicts the code path above it); CredentialsTab `handleDelete`/`handleValidate` have no catch at all — a rejected IPC promise is an unhandled rejection. |
| 15 | LOW | **Models: transient invalid states 400 during autosave** — selecting provider "openai-compatible" fires the 500ms debounced PATCH before the user can type a baseUrl; PatchModelGatewaySchema requires baseUrl → guaranteed "Failed to save model config" toast on a normal interaction path. Similarly each typing pause mid-model-name persists a half-typed model id. No dirty/confirm step exists for this section. |
| 16 | INFO | **Appearance toast overpromises** — "Appearance saved" is localStorage-only; the theme does not roam across devices/browsers (by documented design, M3 Contract 2). |
| 17 | INFO | **PATCH /api/users/:id echoes the entire users row** (users.ts:237) including ai-oriented columns (soulPrompt, costCap…), more than the UI needs; harmless today but a wide contract. |
