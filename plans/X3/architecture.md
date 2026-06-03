# X3 Architecture — Agent Configuration (DB + UI)

## Required reading

- `plans/X3/concept.md` — concept probe, vocabulary, contracts, rejection list
- `plans/X3/design/approved.md` — approved inline-table design variant
- `packages/db/src/schema.ts` lines 28-53 — current `users` table definition
- `packages/db/src/seed.ts` — current seed data with `soulPromptPath` references
- `packages/server/src/routes/settings.ts` — `buildSettingsResponse` and PATCH handler
- `packages/server/src/routes/users.ts` — existing user CRUD (PATCH restricted to self-edit)
- `packages/server/src/services/session-provisioning.ts` lines 40-73 — `validateSoulPromptPath`
- `packages/fabric/src/prompt-composition.ts` — `composePrompt` reads soul file from disk
- `packages/shared/src/types.ts` — `USER_ROLES`, `ModelTier`, `UserRole`
- `packages/shared/src/harness/harness-adapter.ts` — `SessionConfig.soulPromptPath` (deprecated)
- `packages/server/src/harness/adapter-pool.ts` — `AdapterMeta`, `SelectRequirements`, `AdapterPool.select()`
- `packages/web/src/pages/SettingsPage.tsx` — settings page layout (stacked sections)
- `packages/web/src/settings/SettingsOrgChart.tsx` — reference implementation for inline table + form pattern
- `packages/web/src/settings/settings-types.ts` — `SettingsData`, `UserSetting`, `SettingsSectionId`
- `docs/agent-layer/agent-identity.md` — "three files" model (superseded by DB, needs doc update)
- `docs/souls/product-manager.md`, `docs/souls/practice-facilitator.md`, `docs/souls/chief-of-staff.md` — seed template files

---

## Phase 0 — Resolved questions

### Q1: Template storage (design open question 1)

**Decision: `factorySettings` rows, keyed by `soul_template:<role>`.**

The concept doc recommends this. A dedicated `soul_prompt_templates` table adds schema complexity for 3-7 small text blobs. The `factorySettings` table already exists with a `key: text, value: text` shape. Templates are seeded once during migration by reading the three `docs/souls/*.md` files. The migration reads the file content at migration time, not at runtime.

Templates are stored as the raw markdown with frontmatter stripped. Template variable placeholders (`{{product}}`, `{{community}}`) are preserved in the stored text -- they are substituted at prompt-composition time, not at template-fetch time.

**Cost:** Zero new tables, zero schema changes for templates. One migration step that inserts 3 `factorySettings` rows. The trade-off vs a dedicated table: no structured columns (version, role FK). Acceptable because templates are read-only factory defaults per the concept doc rejection list.

### Q2: Template fetch endpoint (design open question 2)

**Decision: Dedicated endpoint `GET /api/agents/templates/:role`.**

Embedding templates in the settings response bloats every settings fetch with multi-KB soul prompt text that is only needed during agent creation (when the role select changes). A dedicated endpoint is fetched on-demand by the UI when the role changes in the add form.

The endpoint reads from `factorySettings` where `key = 'soul_template:<role>'`. Returns `{ role: string, content: string }` on 200, or 404 if no template exists for that role.

### Q3: Agent CRUD API shape (design open question 3)

**Decision: New agent-specific endpoints under `/api/agents`.**

The existing `PATCH /api/users/:id` is restricted to self-edits (founder editing their own profile). X3 needs a founder editing any AI user. Rather than complicating the self-edit guard on `/api/users/:id`, create a parallel set of endpoints scoped to agent management:

- `GET /api/agents` — list AI users (kind = "ai", role != "system") with active session counts
- `POST /api/agents` — create new agent
- `PATCH /api/agents/:id` — update agent config (name, role, soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions)
- `DELETE /api/agents/:id` — soft-delete (status = "retired")

This keeps the existing user routes unchanged (zero migration risk on the existing surface) and creates a clean boundary for agent-specific concerns.

**Why not extend `/api/users/:id`?** The self-edit guard (`authenticatedUserId !== targetId` returns 403) would need a role-based bypass for founders editing agents. This adds conditional logic to a security-sensitive path. A separate route group is safer and simpler.

### Q4: Soul prompt size limit (design open question 4)

**Decision: 50,000 character limit at the API boundary.**

Validated by Zod schema on `POST /api/agents` and `PATCH /api/agents/:id`. The `soulPrompt` column is `text` (unlimited in Postgres). The 50K limit is a sanity guard -- typical soul prompts are 500-2000 characters. The prompt-composition module's 4000-token budget (`PERSONA_TOOLS_TOKEN_BUDGET`) handles the downstream constraint; the API limit is a coarser outer guard.

### Q5: Delete semantics (design open question 5)

**Decision: Soft delete (status = "retired").**

Agents have FK references from `sessions.agentId`, `tasks.ownerAgentId`, `messages.senderId`, `items.sourceAgentId`, and `routines.ownerAgentId` -- all with `ON DELETE RESTRICT`. Hard delete would require cascading or nullifying those references, which violates audit trail integrity. Soft delete sets `status = "retired"`. The agent no longer appears in the settings UI or is eligible for session provisioning, but historical references remain intact.

The UI displays `status = "retired"` agents in a muted style (grayed out) with a note, or filters them out entirely. The design spec's "Delete" button triggers the soft-delete. Since the concept doc says the "system:propagation" user should never be editable/deletable, the API excludes `role = "system"` from all agent management endpoints.

### Q6: System-role filtering (discovered during plan reconciliation)

**Discovery:** The current `buildSettingsResponse` returns all `kind = "ai"` users, including `system:propagation` (role = "system"). The X3 agents list should exclude system-role agents -- they are internal infrastructure, not configurable agents.

**Decision:** Both `GET /api/agents` and the updated settings response filter out `role = 'system'` agents. The `DELETE /api/agents/:id` endpoint rejects deletion of system-role agents with 403.

### Q7: Harness type — `AdapterMeta.type` field

**Discovery:** The current `AdapterMeta` interface has no `type` field. It has `name`, `kind` (local/remote), `modelProviders`, and `maxConcurrent`. The concept doc says harness type is validated at session-provision time against adapter pool registered types, and that `AdapterMeta` needs a `type` field.

**Decision: Add `type: string` to `AdapterMeta` and `AdapterInfo`.**

The local adapter registers with `type: "claude-code"`. Remote workers send their type in the `register` message (add `type` to `WorkerToServerRegisterMessage`). `AdapterPool.select()` gains an optional `harnessType?: string` in `SelectRequirements`. When set, only adapters with matching `type` are eligible. When null/undefined, all adapters are eligible (backward compatible).

This is a minimal change to a well-isolated interface. The `WorkerToServerRegisterMessage` schema in `@hyperidle/shared` needs one new optional field.

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `users.soulPromptPath` exists | Yes -- `packages/db/src/schema.ts` line 33 | Plan adds `soulPrompt` column; deprecates `soulPromptPath` |
| `factorySettings` table exists | Yes -- `packages/db/src/schema.ts` line 343 | Used for soul prompt template storage |
| `USER_ROLES` includes builder, product_manager, growth, ops, practice_facilitator, chief_of_staff | `USER_ROLES` is `["builder", "growth", "product_manager", "practice_facilitator", "chief_of_staff", "brand_voice"]`. No `ops` role exists. | The spec says "seeded per role (builder, product_manager, practice_facilitator, growth, ops)." But `ops` is not in `USER_ROLES` and no `docs/souls/ops.md` exists. Templates are seeded only for roles that have a `docs/souls/*.md` file: `product_manager`, `practice_facilitator`, `chief_of_staff`. Roles without a template file (builder, growth, brand_voice) get no factory template -- the soul prompt textarea starts empty for those roles. |
| Settings page uses stacked sections | Yes -- `SettingsPage.tsx` renders `<section>` blocks vertically | New Agents section follows the same pattern |
| `PATCH /api/users/:id` can be extended for agent edits | No -- self-edit guard returns 403 for founder editing another user | New `/api/agents` routes handle agent CRUD separately |
| Session provisioning reads `agent.soulPromptPath` | Yes -- `session-provisioning.ts` line 247 | Changed to read `agent.soulPrompt` (inline text). `validateSoulPromptPath` removed. |
| `composePrompt` reads soul file from disk via `soulPromptPath` | Yes -- `prompt-composition.ts` line 205 reads `fs.readFile(soulPromptPath)` | Changed to accept inline text. `soulPromptPath` parameter becomes `soulPromptText`. |
| `AdapterMeta` has a `type` field | No -- only `name`, `kind`, `modelProviders`, `maxConcurrent` | Added `type` field to `AdapterMeta`, `AdapterInfo`, `SelectRequirements` |
| `SessionConfig.soulPromptPath` is used by harness | Yes -- `harness-adapter.ts` line 9 (marked `@deprecated`) | Left as-is (already deprecated). Session provisioning stops passing a meaningful path. |
| Settings response includes agent config fields | No -- current `users` array in settings response only includes `id, name, autonomyLevel, paused` | The Agents section uses its own `GET /api/agents` endpoint, not the settings response. The settings response `users` array is unchanged. |
| `buildSettingsResponse` filters system agents | No -- returns all `kind = "ai"` rows | `GET /api/agents` filters `role != "system"`. Settings response is untouched for backward compat. |
| Migration numbering | Latest is `0020_T5_block_id_column.sql` | New migration is `0021_X3_agent_config.sql` |

---

## 1. DB migration

### Migration file: `packages/db/drizzle/0021_X3_agent_config.sql`

```sql
-- X3: Agent Configuration — add soulPrompt, harnessType, modelTierPreference to users

ALTER TABLE "users" ADD COLUMN "soul_prompt" text;
ALTER TABLE "users" ADD COLUMN "harness_type" text;
ALTER TABLE "users" ADD COLUMN "model_tier_preference" text;

-- Backfill soulPrompt from role-based templates for existing agents.
-- Templates are inserted into factorySettings first (by the seed step),
-- then backfill reads from there. Since migration SQL cannot read files,
-- the backfill is done in the seed function, not here.
-- This migration only adds the columns with NULL defaults.

-- Seed soul prompt templates into factorySettings.
-- Content is inserted by the updated seed.ts, not by raw SQL.
```

### Schema change: `packages/db/src/schema.ts`

Add three new columns to the `users` table:

```typescript
soulPrompt: text("soul_prompt"),
harnessType: text("harness_type"),
modelTierPreference: text("model_tier_preference"),
```

All nullable with no default. Null semantics per concept doc:
- `soulPrompt = null` -- no persona section in composed prompt
- `harnessType = null` -- no adapter preference; pool selects any eligible
- `modelTierPreference = null` -- use provisioning default ("workhorse")

The existing `soulPromptPath` column is NOT dropped in this migration (additive only). It is marked `@deprecated` in the schema with a code comment. A future migration (out of X3 scope) drops it after all consumers are updated.

### Seed update: `packages/db/src/seed.ts`

After the existing user inserts, add template seeding:

1. Read `docs/souls/product-manager.md`, `docs/souls/practice-facilitator.md`, `docs/souls/chief-of-staff.md` content at seed time using `fs.readFileSync`.
2. Strip frontmatter (reuse the `stripFrontmatter` pattern from `prompt-composition.ts`).
3. Insert into `factorySettings` with keys `soul_template:product_manager`, `soul_template:practice_facilitator`, `soul_template:chief_of_staff`.
4. Backfill `soulPrompt` on existing agent rows from the matching template:
   - `seed-agent-pm-nimmly` (role: product_manager) gets the product_manager template
   - `seed-agent-cos` (role: chief_of_staff) gets the chief_of_staff template
   - `seed-agent-pf-*` (role: practice_facilitator) get the practice_facilitator template
   - `seed-agent-builder` (role: builder) -- no template, `soulPrompt` stays null
   - `system:propagation` (role: system) -- no template, `soulPrompt` stays null

**Implementation note:** `@hyperidle/db` must NOT import from `@hyperidle/fabric` (wrong dependency direction). The `stripFrontmatter` function is a 3-line regex. Duplicate it as a local helper in `seed.ts` (or in `seed-fixtures.ts`) rather than importing from fabric. Add a `@lore` comment explaining the duplication.

---

## 2. Shared types

### `packages/shared/src/types.ts`

Add:

```typescript
/**
 * X3: Model tier preference values for agent configuration.
 * Same vocabulary as ModelTier but includes null semantics.
 * null = "use provisioning default (workhorse)".
 */
export const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;
// ModelTier already exists as: "reasoning" | "workhorse" | "fast"
// No new type needed -- reuse ModelTier.
```

No new types needed in `@hyperidle/shared` beyond `ModelTier` which already exists. The agent config fields are plain strings stored on the `users` table and typed via Drizzle inference (`User` type auto-updates when schema changes).

### `packages/shared/src/harness/harness-adapter.ts`

No changes. `SessionConfig.soulPromptPath` stays deprecated. `composedPrompt` is already the primary delivery mechanism.

### `packages/shared/src/harness/worker-protocol.ts`

Add optional `type` field to `WorkerToServerRegisterMessage`:

```typescript
// In the register message schema:
type: z.string().optional(),
```

### `packages/web/src/settings/settings-types.ts`

Add `SettingsSectionId` variant:

```typescript
export type SettingsSectionId =
  | "profile"
  | "orgchart"
  | "credentials"
  | "notifications"
  | "appearance"
  | "teams"
  | "backend"
  | "worker"
  | "agents";  // X3
```

Add agent config type for the UI:

```typescript
/** X3: Agent configuration as returned by GET /api/agents. */
export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  soulPrompt: string | null;
  harnessType: string | null;
  modelTierPreference: string | null;
  maxConcurrentSessions: number;
  status: string;
  activeSessions: number;
}
```

---

## 3. API endpoints

All endpoints under `/api/agents`. Registered in `app.ts` alongside existing routes.

### `packages/server/src/routes/agents.ts` (new file)

#### `GET /api/agents`

Returns all AI users (excluding system role) with active session counts.

```typescript
// Response shape:
AgentConfig[] // Same as the UI type above
```

Query: `SELECT * FROM users WHERE kind = 'ai' AND role != 'system'`. Join with sessions to get active count.

#### `POST /api/agents`

Create a new agent. Founder-only (auth middleware provides userId; check `kind = 'human'`).

```typescript
// Request body (Zod schema):
const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(USER_ROLES),
  soulPrompt: z.string().max(50_000).nullable().optional(),
  harnessType: z.string().max(100).nullable().optional(),
  modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
  maxConcurrentSessions: z.number().int().min(1).max(20).default(1),
  teamId: z.string().nullable().optional(),
});
```

- Generates UUID for `id`
- Sets `kind = "ai"`, `status = "active"`
- Returns 201 with the created agent row (plus `activeSessions: 0`)

#### `PATCH /api/agents/:id`

Update agent configuration. Founder-only.

```typescript
const patchAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(USER_ROLES).optional(),
  soulPrompt: z.string().max(50_000).nullable().optional(),
  harnessType: z.string().max(100).nullable().optional(),
  modelTierPreference: z.enum(MODEL_TIERS).nullable().optional(),
  maxConcurrentSessions: z.number().int().min(1).max(20).optional(),
});
```

- Validates target is `kind = "ai"` and `role != "system"` (403 otherwise)
- Returns 200 with updated agent

#### `DELETE /api/agents/:id`

Soft-delete: sets `status = "retired"`.

- Validates target is `kind = "ai"` and `role != "system"` (403 otherwise)
- Validates target is not already retired (409 if so)
- Returns 200 with `{ id, status: "retired" }`

#### `GET /api/agents/templates/:role`

Fetch soul prompt template for a role.

```typescript
// Response shape:
{ role: string; content: string }
```

- Reads from `factorySettings` where `key = 'soul_template:<role>'`
- Returns 404 with `{ error: "No template for role", code: "NOT_FOUND" }` if no template exists

### Route registration: `packages/server/src/app.ts`

```typescript
import { createAgentRoutes } from "./routes/agents.js";
// ...
api.route("/agents", createAgentRoutes(options.db, eventBus));
```

Registered in the authenticated section (after auth middleware).

---

## 4. Session provisioning changes

### `packages/server/src/services/session-provisioning.ts`

#### Remove `validateSoulPromptPath`

Delete the `SOUL_PROMPT_DIR_RELATIVE` constant, the `validateSoulPromptPath` function, and the call site in Phase 1.

#### Change Phase 1: load agent

Replace:
```typescript
const rawSoulPromptPath = agent.soulPromptPath ?? "";
const soulPromptPath = validateSoulPromptPath(rawSoulPromptPath);
```

With:
```typescript
const soulPromptText = agent.soulPrompt ?? "";
```

#### Change Phase 3: adapter selection

Add harness type filtering:
```typescript
const selectedAdapter = adapterPool.select({
  harnessType: agent.harnessType ?? undefined,
});
```

#### Change model tier resolution

Replace:
```typescript
const modelTier: ModelTier = params.modelTier ?? "workhorse";
```

With:
```typescript
const modelTier: ModelTier = params.modelTier
  ?? (agent.modelTierPreference as ModelTier | null)
  ?? "workhorse";
```

Priority: explicit param > agent preference > default. This preserves the existing behavior where `params.modelTier` overrides per-session.

#### Change Phase 8.5: compose prompt

Replace:
```typescript
const { composedPrompt } = await composePrompt({
  soulPromptPath,
  context: sessionContextData,
  tools: toolSummaries,
  workspacePath,
});
```

With:
```typescript
const { composedPrompt } = await composePrompt({
  soulPromptText,
  context: sessionContextData,
  tools: toolSummaries,
  workspacePath,
});
```

And pass empty string for `soulPromptPath` in the `SessionConfig`:
```typescript
harnessHandle = await harness.startSession({
  workspacePath,
  soulPromptPath: "", // deprecated; soul prompt now composed from inline text
  composedPrompt,
  modelTier,
  tools: allowedToolNames,
});
```

### `packages/fabric/src/prompt-composition.ts`

#### Change `PromptCompositionInput`

Replace `soulPromptPath: string` with `soulPromptText: string`:

```typescript
export interface PromptCompositionInput {
  /** Inline soul prompt text. Empty string = no persona. */
  readonly soulPromptText: string;
  readonly context: SessionContextData;
  readonly tools: readonly ToolSummary[];
  readonly workspacePath: string;
}
```

#### Change `composePrompt` persona section

Replace the file-read logic:
```typescript
// OLD: read from file
let rawContent: string;
try {
  rawContent = await fs.promises.readFile(soulPromptPath, "utf8");
} catch { ... }
```

With inline text processing:
```typescript
// NEW: use inline text directly
let personaSection = "";
if (soulPromptText.length > 0) {
  const stripped = stripFrontmatter(soulPromptText);
  const vars = buildTemplateVariables(context);
  personaSection = substituteTemplateVars(stripped, vars);
}
```

The `stripFrontmatter` call is retained because the soul prompt text in the DB may still contain frontmatter (it was seeded from the markdown files). Template variable substitution continues to work identically.

### `packages/server/src/harness/adapter-pool.ts`

#### Add `type` to `AdapterMeta` and `AdapterInfo`

```typescript
export interface AdapterMeta {
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly type?: string;  // X3: harness type for agent preference matching
  readonly modelProviders: readonly string[];
  readonly maxConcurrent: number;
}

export interface AdapterInfo {
  // ... existing fields ...
  readonly type?: string;  // X3
}
```

#### Add `harnessType` to `SelectRequirements`

```typescript
export interface SelectRequirements {
  readonly modelProviders?: readonly string[];
  /** X3: If set, only adapters with matching type are eligible. */
  readonly harnessType?: string;
}
```

#### Update `select()` filter

Add harness type filter after the modelProviders filter:
```typescript
// harnessType filter — adapter type must match
if (requirements?.harnessType) {
  if (entry.meta.type !== requirements.harnessType) continue;
}
```

#### Update `createLocalAdapterPool()`

```typescript
pool.register("local", adapter, {
  name: "local",
  kind: "local",
  type: "claude-code",  // X3: local adapter type
  modelProviders: ["anthropic"],
  maxConcurrent: Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10),
});
```

#### Update `list()` to include `type`

```typescript
type: entry.meta.type,
```

#### Update worker-ws registration

In `packages/server/src/routes/worker-ws.ts`, pass `type` from the register message:
```typescript
this.pool.register(msg.id, this.adapter, {
  name: msg.name,
  kind: "remote",
  type: msg.type,  // X3: worker-specified harness type
  modelProviders: msg.modelProviders,
  maxConcurrent: msg.maxConcurrent,
});
```

---

## 5. Settings UI

### `packages/web/src/settings/SettingsAgents.tsx` (new file)

Follows the `SettingsOrgChart.tsx` pattern exactly: fetch data, table display, inline expand for editing.

**Data fetching:** Uses `apiFetch("/api/agents")` on mount. No dependency on `useSettings` hook.

**Component structure:**

```
SettingsAgents
  Loading state: 2x skeleton rows
  Error state: error text
  Empty state: "No agents configured."
  Populated state:
    <table class="table table-xs w-full">
      <thead> Name | Role | Harness | Model Tier | Sessions | Actions </thead>
      <tbody>
        {agents.map(agent => (
          <AgentRow key={agent.id} />  // NOT a separate component file
          {editingId === agent.id && <AgentEditRow />}  // inline TR
        ))}
      </tbody>
    </table>
    {addMode ? <AgentAddForm /> : <AddAgentButton />}
```

**Edit form:** Inline `<tr>` with `<td colspan="6">` containing the form (exact copy of the design spec's Edit mode). Fields: name input, role select, harness type select, model tier select, max sessions input, soul prompt textarea.

**Add form:** Below the table. On role change, fetches template via `GET /api/agents/templates/:role` and pre-fills textarea per the design spec's template pre-fill behavior.

**Delete:** Two-click confirmation per design spec. First click changes text to "Confirm?", second click sends `DELETE /api/agents/:id`, third-second timeout reverts.

**All DaisyUI primitives.** Zero new custom components. Zero component-budget impact.

### `packages/web/src/pages/SettingsPage.tsx`

Add the Agents section between Org Chart and Appearance:

```tsx
{/* X3: Agents section */}
<section data-testid="settings-section-agents" className="flex flex-col gap-3">
  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Agents</h2>
  <SettingsAgents />
</section>
```

---

## 6. Deprecation path

### Files modified for soulPromptPath removal

| File | Change |
|---|---|
| `packages/db/src/schema.ts` | Add 3 new columns. Mark `soulPromptPath` with `@deprecated` JSDoc. Do NOT drop. |
| `packages/db/src/seed.ts` | Add template seeding to `factorySettings`. Backfill `soulPrompt` on existing agents. Keep existing `soulPromptPath` writes for rollback safety. |
| `packages/server/src/services/session-provisioning.ts` | Remove `validateSoulPromptPath`. Read `soulPrompt` instead of `soulPromptPath`. |
| `packages/fabric/src/prompt-composition.ts` | Change `soulPromptPath` param to `soulPromptText`. Remove `fs.readFile`. |
| `packages/shared/src/harness/harness-adapter.ts` | No change. `SessionConfig.soulPromptPath` stays deprecated. |

### Files with soulPromptPath references that need test updates

| File | Change needed |
|---|---|
| `packages/server/src/__tests__/session-provisioning.test.ts` | Update to test `soulPrompt` instead of `soulPromptPath`. Remove `validateSoulPromptPath` test cases. Add test for null soulPrompt. |
| `packages/fabric/src/__tests__/prompt-composition.test.ts` | Update to pass `soulPromptText` instead of `soulPromptPath`. Remove file-read mocking. |
| `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts` | Verify `soulPromptPath: ""` in `SessionConfig` still works. |
| `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.security.test.ts` | Path-traversal test for `soulPromptPath` can be removed (attack surface eliminated). |
| `packages/server/src/harness/__tests__/remote-harness-adapter.test.ts` | Verify `soulPromptPath: ""` in `SessionConfig` still works. |
| `packages/server/src/harness/__tests__/isolated-harness-adapter.test.ts` | Same. |
| `packages/shared/src/__tests__/harness-adapter.test.ts` | No change needed (tests the interface shape, not behavior). |
| `packages/shared/src/__tests__/money-harness.test.ts` | No change needed. |
| `packages/db/src/__tests__/seed.test.ts` | Add test for template factorySettings seeding. Add test for soulPrompt backfill. |

---

## 7. Security and abuse cases

| Vector | Applicable? | Resolution |
|---|---|---|
| **Rate limiting on POST/PATCH/DELETE** | Yes | Apply existing rate-limit middleware to `/api/agents` routes. Same limits as other CRUD routes. |
| **Input trust boundary: soul prompt** | Yes | Soul prompt is founder-authored (trusted). The 50K character limit is a sanity guard. No script injection risk because the prompt is consumed server-side by the harness, never rendered as HTML. Template variables (`{{product}}`) are substituted server-side. |
| **Path traversal** | N/A | **Eliminated by X3.** The `soulPromptPath` attack surface (filesystem read) is removed. Soul prompt content is stored inline in the DB. `validateSoulPromptPath` and `SOUL_PROMPT_DIR_RELATIVE` are deleted. |
| **Secret handling** | N/A | No new credential surfaces. |
| **SSRF** | N/A | No outbound URLs. |
| **Unauthorized agent modification** | Yes | All `/api/agents` endpoints require authentication. Only `kind = "human"` users (founders) can modify agents. The route checks the authenticated user's kind. System-role agents are excluded from CRUD (403). |
| **Denial-of-service via maxConcurrentSessions** | Yes | Clamped to 1-20 by Zod schema. The adapter pool's own capacity limits provide the real ceiling. |
| **SQL injection** | N/A | All queries use Drizzle ORM parameterized queries. No raw SQL. |

---

## 8. Acceptance criteria with verification methods

### AC-1: Users table gains soulPrompt, harnessType, modelTierPreference columns

**Verification:** Migration test -- run `db:migrate`, query `information_schema.columns` for the three new columns on `users`. Assert all are nullable text. `npm run check` passes (Drizzle inference updates the `User` type).

### AC-2: Soul prompt templates seeded from docs/souls/ files

**Verification:** Seed test -- call `seed(db)`, query `factorySettings` for keys `soul_template:product_manager`, `soul_template:practice_facilitator`, `soul_template:chief_of_staff`. Assert each value is non-empty text matching the corresponding file content (minus frontmatter).

### AC-3: Existing agents backfilled with soulPrompt from role template

**Verification:** Seed test -- after `seed(db)`, query `users` where `id = 'seed-agent-pm-nimmly'`. Assert `soulPrompt` matches the product_manager template content. Query `seed-agent-cos` -- assert chief_of_staff template. Query `seed-agent-pf-build` -- assert practice_facilitator template. Query `seed-agent-builder` -- assert `soulPrompt IS NULL`.

### AC-4: GET /api/agents returns AI agents with config fields

**Verification:** Integration test -- seed DB, call `GET /api/agents`. Assert response is an array. Assert each element has `id, name, role, soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions, status, activeSessions`. Assert system-role agents are excluded. Assert response includes seed agents.

### AC-5: POST /api/agents creates a new agent

**Verification:** Integration test -- call `POST /api/agents` with `{ name: "Test Builder", role: "builder", maxConcurrentSessions: 2 }`. Assert 201. Assert response has generated id, `kind = "ai"`, `status = "active"`. Query DB to confirm row exists. Call with invalid role -- assert 400. Call with name > 200 chars -- assert 400.

### AC-6: PATCH /api/agents/:id updates agent configuration

**Verification:** Integration test -- create agent, call `PATCH /api/agents/:id` with `{ soulPrompt: "New prompt", modelTierPreference: "reasoning" }`. Assert 200. Assert response reflects updated fields. Assert unchanged fields are preserved. Call with system-role agent id -- assert 403.

### AC-7: DELETE /api/agents/:id soft-deletes (status = "retired")

**Verification:** Integration test -- create agent, call `DELETE /api/agents/:id`. Assert 200. Assert `status = "retired"` in response. Query DB to confirm status. Assert agent no longer appears in `GET /api/agents`. Call DELETE on system agent -- assert 403. Call DELETE on already-retired agent -- assert 409.

### AC-8: GET /api/agents/templates/:role returns template content

**Verification:** Integration test -- seed DB, call `GET /api/agents/templates/product_manager`. Assert 200 with `{ role, content }`. Assert content matches file minus frontmatter. Call `GET /api/agents/templates/builder` -- assert 404 (no template for builder). Call `GET /api/agents/templates/nonexistent` -- assert 404.

### AC-9: Settings UI Agents section renders agent table

**Verification:** Playwright E2E -- navigate to Settings page. Assert `[data-testid="settings-section-agents"]` is visible. Assert table headers: Name, Role, Harness, Model Tier, Sessions, Actions. Assert seed agents are listed (exclude system:propagation).

### AC-10: Settings UI edit form opens inline and saves

**Verification:** Playwright E2E -- click Edit on an agent row. Assert edit form appears with pre-filled fields. Change name. Click Save. Assert toast "Agent saved". Assert table row reflects updated name. Assert Escape closes form without saving.

### AC-11: Settings UI add form creates agent with template pre-fill

**Verification:** Playwright E2E -- click "+ Add Agent". Assert add form appears. Select role "product_manager". Assert soul prompt textarea is pre-filled with template content. Change name to "New PM". Click Save. Assert toast "Agent created". Assert new row appears in table.

### AC-12: Settings UI delete with two-click confirmation

**Verification:** Playwright E2E -- click Delete on an agent. Assert button text changes to "Confirm?". Wait 3 seconds. Assert button reverts to "Delete". Click Delete again, then click "Confirm?" within 3 seconds. Assert agent removed from table. Assert toast "Agent deleted".

### AC-13: Session provisioning reads soulPrompt from DB (not file)

**Verification:** Unit test -- mock DB with agent having `soulPrompt = "Test persona"` and `soulPromptPath = null`. Call `provisionSession`. Assert `composePrompt` received `soulPromptText: "Test persona"`. Assert no filesystem read for soul prompt. Assert `validateSoulPromptPath` is not called (function deleted).

### AC-14: Session provisioning uses modelTierPreference as default

**Verification:** Unit test -- mock DB with agent having `modelTierPreference = "reasoning"`. Call `provisionSession` without explicit `modelTier` param. Assert session row has `modelTier = "reasoning"`. Call with explicit `modelTier = "fast"` -- assert override works (session has "fast").

### AC-15: Session provisioning filters adapters by harnessType

**Verification:** Unit test -- register two adapters: type "claude-code" and type "aider". Mock agent with `harnessType = "aider"`. Call `provisionSession`. Assert the "aider" adapter was selected. Mock agent with `harnessType = null` -- assert either adapter is eligible.

### AC-16: Prompt composition accepts inline text instead of file path

**Verification:** Unit test -- call `composePrompt({ soulPromptText: "# Test Persona\n\nYou are a test agent.", ... })`. Assert composed prompt contains "Test Persona" in the Identity section. Call with empty string -- assert no Identity section. Assert no `fs.readFile` calls.

### AC-17: Agent configuration changes take effect on next session (no restart)

**Verification:** Integration test -- create agent with `modelTierPreference = "workhorse"`. Provision session -- assert workhorse. Update agent to `modelTierPreference = "reasoning"` via PATCH. Provision new session -- assert reasoning. No server restart between operations.

### AC-18: AdapterPool.select() filters by harnessType

**Verification:** Unit test -- register adapters with different types. Call `select({ harnessType: "claude-code" })`. Assert only claude-code adapter returned. Call with undefined harnessType -- assert any adapter eligible.

---

## 9. Protected tests

Tests whose assertions must not change (existing behavior preserved):

```
protectedTests: [
  "packages/server/src/__tests__/P2-user-routes.test.ts",
  "packages/web/src/__tests__/SettingsProfile.test.tsx",
  "packages/web/src/__tests__/AppShell.P4-settings.test.tsx",
  "packages/web/src/pages/__tests__/W3-settings.test.tsx",
  "packages/web/src/settings/__tests__/SettingsWorker.test.tsx",
  "packages/server/src/__tests__/P3-settings-config.test.ts",
  "packages/server/src/harness/__tests__/adapter-pool.test.ts",
  "packages/server/src/harness/__tests__/adapter-pool-s4.test.ts",
  "packages/db/src/__tests__/seed.test.ts"
]
```

Note: `seed.test.ts` is in the protected list but will need NEW assertions added (for template seeding). Existing assertions must not change.

---

## 10. Ordered task list

### Task 1: DB schema + migration + seed

**Files:**
- `packages/db/src/schema.ts` — add 3 columns to `users` table
- `packages/db/drizzle/0021_X3_agent_config.sql` — migration SQL
- `packages/db/src/seed.ts` — template seeding + soulPrompt backfill
- `packages/db/src/seed-fixtures.ts` — add `stripFrontmatter` helper

**Tests:**
- `packages/db/src/__tests__/X3-agent-config.test.ts` (new) — migration runs, columns exist, seed templates populated, backfill correct
- Update `packages/db/src/__tests__/seed.test.ts` — add assertions for template keys and soulPrompt backfill

**Dependencies:** None. Can start immediately.

### Task 2: Shared types + adapter pool changes

**Files:**
- `packages/shared/src/harness/worker-protocol.ts` — add `type` to register message schema
- `packages/server/src/harness/adapter-pool.ts` — add `type` to `AdapterMeta`, `AdapterInfo`, `SelectRequirements`; update `select()` filter; update `list()`; update `createLocalAdapterPool()`
- `packages/server/src/routes/worker-ws.ts` — pass `type` from register message
- `packages/web/src/settings/settings-types.ts` — add `"agents"` to `SettingsSectionId`, add `AgentConfig` interface

**Tests:**
- `packages/server/src/harness/__tests__/X3-adapter-pool-type.test.ts` (new) — test harnessType filtering in `select()`
- Verify existing `adapter-pool.test.ts` and `adapter-pool-s4.test.ts` still pass (no regression)

**Dependencies:** None. Can run in parallel with Task 1.

### Task 3: Prompt composition change (file read to inline text)

**Files:**
- `packages/fabric/src/prompt-composition.ts` — change `soulPromptPath` to `soulPromptText`, remove `fs.readFile`

**Tests:**
- `packages/fabric/src/__tests__/prompt-composition.test.ts` — update all tests to pass `soulPromptText` instead of `soulPromptPath`; remove file-read mocking; add test for inline text with frontmatter

**Dependencies:** None. Can run in parallel with Tasks 1-2.

### Task 4: Session provisioning update

**Files:**
- `packages/server/src/services/session-provisioning.ts` — remove `validateSoulPromptPath`, read `soulPrompt`, use `modelTierPreference`, pass `harnessType` to `select()`

**Tests:**
- `packages/server/src/__tests__/session-provisioning.test.ts` — update to test `soulPrompt` DB column, `modelTierPreference`, `harnessType` filtering. Remove `validateSoulPromptPath` tests. Add path-traversal-eliminated test.
- `packages/server/src/__tests__/session-provisioning.integration.test.ts` — update fixtures

**Dependencies:** Tasks 1, 2, 3 (schema columns must exist, adapter pool must support type filter, prompt composition interface changed).

### Task 5: Agent CRUD API routes

**Files:**
- `packages/server/src/routes/agents.ts` (new) — GET, POST, PATCH, DELETE /api/agents + GET /api/agents/templates/:role
- `packages/server/src/app.ts` — register agent routes

**Tests:**
- `packages/server/src/routes/__tests__/X3-agents.test.ts` (new) — integration tests for all 5 endpoints covering success + error + edge cases per AC-4 through AC-8

**Dependencies:** Task 1 (schema columns must exist for insert/select).

### Task 6: Settings UI — SettingsAgents component

**Files:**
- `packages/web/src/settings/SettingsAgents.tsx` (new) — agent table + inline edit + add form + delete
- `packages/web/src/pages/SettingsPage.tsx` — add Agents section

**Tests:**
- `packages/web/src/settings/__tests__/SettingsAgents.test.tsx` (new) — unit tests for all states (loading, error, empty, populated, edit, add, delete)
- `packages/web/src/pages/__tests__/X3-settings-agents.test.tsx` (new) — verify section appears in SettingsPage

**Dependencies:** Task 5 (API endpoints must exist for the component to fetch from).

### Task 7: Playwright E2E tests

**Files:**
- `e2e/X3-agent-config.spec.ts` (new) — E2E tests for AC-9 through AC-12

**Dependencies:** Tasks 5, 6 (API + UI must be complete).

### Task 8: Doc update + cleanup

**Files:**
- `docs/agent-layer/agent-identity.md` — update "three files" model to reflect DB-centric reality. Note `soulPromptPath` deprecated, `soulPrompt` is the source of truth.

**Dependencies:** None (can run in parallel, but logically last).

---

## 11. Risks and ambiguities

### Risk 1: Seed file reads at seed time

The seed function reads `docs/souls/*.md` files using `fs.readFileSync`. In deployment modes where `docs/` is not available (containerized server without the full repo), the seed will fail on template insertion. **Mitigation:** The seed already runs at setup time (not at runtime). The `docs/` directory is part of the repo and available during `npm run db:seed`. If the files are missing, seed inserts empty templates (graceful degradation with a warning log).

### Risk 2: `stripFrontmatter` duplication

The same regex-based frontmatter stripping exists in `prompt-composition.ts` and will be duplicated in `seed-fixtures.ts`. **Mitigation:** Document with `@lore` comment. The function is 3 lines. Extracting to a shared utility would create a dependency from `@hyperidle/db` to either `@hyperidle/fabric` (wrong direction) or `@hyperidle/shared` (adding a utility function to a package that should only have types/constants). Duplication is the correct choice.

### Risk 3: Large soul prompts in settings response

The `GET /api/agents` response includes full `soulPrompt` text for each agent. With 10 agents and 2000-char prompts each, that is 20KB -- acceptable. With extreme prompts (50K each), it could be 500KB. **Mitigation:** The 50K character limit bounds the worst case. For the typical 5-10 agent fleet, the response is well under 100KB. If this becomes a problem, a future optimization can exclude `soulPrompt` from the list endpoint and fetch it only on edit.

### Risk 4: Adapter pool type field on existing workers

Remote workers that have not been updated to send `type` in their register message will have `type: undefined`. The `harnessType` filter in `select()` will skip them when an agent has a harnessType preference. **Mitigation:** The `type` field is optional on the register message schema. Workers without it register with `type: undefined`. The concept doc says `harnessType = null` on an agent means "any adapter" -- so agents without a preference will still match old workers. Agents with a preference will only match workers that report a matching type.

---

## 12. Design-it-twice: Agent CRUD scope

### Option A: Extend existing `/api/users` routes

Add agent-specific fields to the existing PATCH schema. Add a role-based guard that allows founders to edit AI users.

- **Trade-off:** Complicates the self-edit security guard on PATCH. Every future change to user CRUD must consider both self-edit and founder-edit paths. The route file grows more complex.
- **Reject because:** The self-edit guard is a security boundary. Conditional bypasses on security boundaries create audit surface. The existing `P2-user-routes.test.ts` would need modification (protected test risk).

### Option B: New `/api/agents` routes (chosen)

Separate route file with its own Zod schemas and authorization logic.

- **Trade-off:** Two route files touch the `users` table. A reader must check both `users.ts` and `agents.ts` for user mutations.
- **Accept because:** Clean separation of concerns. Self-edit (users.ts) and agent-management (agents.ts) have different authorization models. Zero changes to existing protected tests. The naming convention (`/api/agents`) aligns with the product mental model (founders manage agents, not users).

---

## Self-critique

1. **Over-engineering check:** The `factorySettings` approach for templates avoids a new table. The adapter pool `type` field is minimal (one string property). The separate `/api/agents` routes avoid complicating existing auth logic. No new abstractions introduced.

2. **Scope creep check:** The plan does NOT include: soul prompt versioning, template editing UI, agent creation wizard, live template propagation, agent import/export. All are out of scope per the spec and concept doc rejection list.

3. **Missing failure modes:**
   - What if `composePrompt` receives frontmatter in `soulPromptText`? Handled -- `stripFrontmatter` is called on the inline text.
   - What if an agent's `harnessType` references a type that no adapter provides? Session provisioning fails with "No available adapter" (the existing pool.select() null return path). The error message could be improved to mention the harness type filter, but that's a polish item.
   - What if the role select in the add form is changed rapidly, triggering multiple template fetches? Standard race-condition mitigation -- the UI should track the latest fetch and discard stale responses. Documented in the component behavior spec.

4. **Migration safety:** The migration is purely additive (3 nullable columns). No column renames, no drops, no data transformations in SQL. Backfill happens in the seed function, not the migration. Rollback is trivial (drop the 3 columns). Existing queries are unaffected because they don't select the new columns.
