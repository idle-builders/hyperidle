# X3 Architecture Critique — Agent Configuration (DB + UI)

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:9 N:8 MD:8 FMC:7 S:8 V:8

## Scores by Dimension

### 1. Spec Alignment — 8/10

The spec lists 6 acceptance criteria; the plan expands to 18 verifiable ACs with clear traceability. Every spec criterion maps:

| Spec AC | Plan ACs |
|---------|----------|
| `users` table gains columns | AC-1 |
| Default soul prompt templates seeded | AC-2, AC-3 |
| Settings UI "Agents" section | AC-9, AC-10, AC-11, AC-12 |
| New agent pre-fills soul prompt | AC-11 (template pre-fill) |
| Config changes take effect on next session | AC-17 |
| `validateSoulPromptPath` replaced | AC-13, AC-16 |

The plan also adds derived ACs for the API CRUD layer (AC-4 through AC-8), adapter pool type filtering (AC-15, AC-18), and model tier preference (AC-14). These are legitimate forced dependencies from the spec's requirement that `harnessType` maps to adapter selection and that config changes take effect on next session.

One spec/plan gap worth noting: The spec says templates should be seeded for "builder, product_manager, practice_facilitator, growth, ops." The plan correctly identifies that `ops` is not in `USER_ROLES` and that no `docs/souls/builder.md` or `docs/souls/growth.md` exist. The plan resolves this cleanly: seed only for roles that have soul files (product_manager, practice_facilitator, chief_of_staff). The validation scenario "Given the user creates a new agent with role `builder`, when the form opens, then the soul prompt textarea is pre-filled with the builder template" will fail in the spec's terms because no builder template exists. The plan's AC-11 tests with `product_manager` instead. This is a spec bug, not a plan bug, but the plan should note it explicitly as a spec deviation.

### 2. Layer Integrity — 9/10

Clean layer separation throughout:
- `packages/db` (schema, migration, seed) stays in its lane. The `stripFrontmatter` duplication is correctly chosen over an import from `@hyperidle/fabric` (wrong dependency direction). The `@lore` comment requirement is noted.
- `packages/server` (routes, session-provisioning, adapter-pool) handles all API logic.
- `packages/web` (SettingsAgents component) uses `apiFetch` to talk to the server -- no direct DB access.
- `packages/fabric` (prompt-composition) changes its interface but stays within its responsibility.
- `packages/shared` (types, worker-protocol) provides shared contracts.

No cross-layer violations detected. The plan correctly routes the template fetch through `GET /api/agents/templates/:role` rather than having the web client read factory settings directly.

### 3. API Contracts — 8/10

All five endpoints under `/api/agents` are fully specified:

| Method | Path | Request Body | Response | Status Codes |
|--------|------|-------------|----------|-------------|
| GET | /api/agents | - | `AgentConfig[]` | 200 |
| POST | /api/agents | `createAgentSchema` (Zod) | `AgentConfig` | 201, 400 |
| PATCH | /api/agents/:id | `patchAgentSchema` (Zod) | `AgentConfig` | 200, 400, 403, 404 |
| DELETE | /api/agents/:id | - | `{ id, status }` | 200, 403, 404, 409 |
| GET | /api/agents/templates/:role | - | `{ role, content }` | 200, 404 |

The Zod schemas are inline with constraints: string lengths, integer ranges, enum validation. Error shapes include status codes and body structures (e.g., `{ error: "No template for role", code: "NOT_FOUND" }`).

One gap: The plan does not specify a 404 status code for `PATCH /api/agents/:id` when the agent ID does not exist. The validation says "target is `kind = ai` and `role != system`" but does not mention the case where the ID is simply not found. Inferred as 404, but should be explicit.

### 4. Data Model Alignment — 9/10

The migration is well-specified:
- Three new nullable `text` columns on `users`: `soul_prompt`, `harness_type`, `model_tier_preference`.
- Additive-only: no drops, no renames, no data transformations in SQL.
- Null semantics are clearly defined for each column.
- `soulPromptPath` is NOT dropped (backward compat). Marked deprecated in JSDoc.
- `factorySettings` rows for templates use existing table shape (`key: text, value: text`).
- Migration numbering (`0021`) is confirmed correct (latest is `0020_T5_block_id_column.sql`).

The `AdapterMeta` and `AdapterInfo` interfaces gain `type?: string` (optional). `SelectRequirements` gains `harnessType?: string`. Both are backward-compatible additions with optional fields.

The `WorkerRegisterMessage` in worker-protocol gains an optional `type` field. The Zod validation schema in `worker-ws.ts` (`WorkerRegisterSchema`) must be updated to include `type: z.string().optional()` -- the plan specifies this change in the worker-ws section. Verified: the current schema (worker-ws.ts line 26-32) does not have `type`.

### 5. Naming — 8/10

Good naming decisions:
- `soulPrompt` (not `prompt`, not `systemPrompt`) -- matches concept doc vocabulary.
- `harnessType` (not `harnessId`, not `adapterType`) -- distinguishes preference from instance.
- `modelTierPreference` (not `modelTier`) -- the "Preference" suffix distinguishes from session-level `modelTier`.
- `soul_template:<role>` factory settings key convention -- clear and scannable.
- `AgentConfig` interface for the API response type.

One concern: The plan introduces `/api/agents` as the route prefix, which historically was the P2-era name that was explicitly renamed to `/api/users`. The naming is semantically correct (these routes manage agent-specific config), but it reintroduces a path that was specifically deprecated. See CRITICAL finding below.

### 6. Module Depth — 8/10

The plan avoids new abstractions. The `SettingsAgents` component follows the established `SettingsOrgChart` pattern without introducing a shared base or higher-order component. The agent routes file is a single new file with five endpoints -- proportional to the problem.

The `factorySettings` approach for templates avoids a new table entirely. The adapter pool changes are minimal (one new optional field on three interfaces + one filter predicate).

The prompt-composition change replaces a file-read path with a string parameter -- interface becomes simpler, not more complex. The `stripFrontmatter` function is already exported and reusable.

The `createAgentRoutes` factory follows the same pattern as `createSettingsRoutes`, `createUserRoutes`, etc. -- consistent module depth across the route layer.

### 7. Failure-Mode Coverage — 7/10

The security analysis is thorough and correctly identifies path-traversal elimination as a benefit. Rate limiting is specified (uses existing middleware). Input validation at trust boundaries is covered by Zod schemas. The 50K character limit on soul prompts is a reasonable outer guard.

Gaps:
- **Missing failure mode: race condition in template pre-fill.** The design spec mentions rapid role-select changes causing multiple template fetch requests. The architecture plan does not specify a mitigation strategy. The design spec says "the UI should track the latest fetch and discard stale responses" -- the architecture should specify the mechanism (e.g., abort controller, sequence counter).
- **Missing error code specification on DELETE 404.** The plan says "Validates target is `kind = 'ai'` and `role != 'system'` (403)" but does not specify what happens if the ID is simply not found in the database. The plan should distinguish 403 (found but forbidden) from 404 (not found).
- **Missing specification of GET /api/agents auth requirement.** The plan says "All endpoints under `/api/agents`. Registered in `app.ts` alongside existing routes" and "in the authenticated section (after auth middleware)". But it does not specify whether `GET /api/agents` requires `kind = 'human'` or just authentication. Other `GET` endpoints (like `GET /api/users`) are available to any authenticated user. The plan's POST/PATCH/DELETE correctly specify "Founder-only (`kind = 'human'`)" but GET is silent. AI agents should probably be able to read the agent list too (for self-awareness), but this is a design question the plan should resolve.

### 8. Simplicity / Over-Engineering Risk — 8/10

The design-it-twice section (section 12) is genuine, not theatre. Option A (extend `/api/users`) is a real alternative that was rejected for a concrete security reason (self-edit guard complication). The rejection rationale is specific and defensible.

No unnecessary abstractions detected:
- No agent service class (routes handle logic directly, same as other routes).
- No template registry or provider pattern.
- No plugin system for harness types.
- `factorySettings` reuse avoids a new table.
- The `stripFrontmatter` duplication is correctly chosen over a shared utility (dependency direction constraint).

The plan does NOT include: soul prompt versioning, template editing UI, agent creation wizard, live template propagation, agent import/export. All correctly identified as out of scope.

One minor concern: The plan adds `type` to `AdapterMeta` (a server-internal interface) AND to `WorkerRegisterMessage` (a shared protocol type) AND to `AdapterInfo` (a public API response type). Three interfaces for one concept is proportional -- these are the same information at different abstraction layers (internal, wire, public). But the plan should ensure the `type` field appears in the `GET /api/workers` response (which returns `AdapterInfo[]`) so the UI could eventually show which adapters match which harness type. Verified: the plan specifies "Update `list()` to include `type`" which does exactly this.

### 9. Verifiability — 8/10

All 18 ACs have concrete verification methods:
- AC-1 through AC-3: seed/migration tests with specific DB queries and assertions.
- AC-4 through AC-8: integration tests against real DB with request/response shapes.
- AC-9 through AC-12: Playwright E2E tests with specific selector assertions.
- AC-13 through AC-18: unit tests with mock DB and adapter pool.

The protected-tests list (section 9) names 9 test files whose existing assertions must not change. This is correct -- it includes `P2-user-routes.test.ts` (which is the file with the problematic `GET /api/agents returns 404` assertion) and `adapter-pool.test.ts` / `adapter-pool-s4.test.ts` (existing pool tests).

The task ordering correctly places test writing before implementation in each task block (tests listed first, then files). Tasks 1-3 can run in parallel, Task 4 depends on 1+2+3, Task 5 depends on 1, Task 6 depends on 5, Task 7 depends on 5+6.

---

## Findings

### CRITICAL

- [plan section 3, route registration] **`/api/agents` route path conflicts with P2 protected test.** The plan proposes registering new routes under `/api/agents`. However, `P2-user-routes.test.ts` line 108-110 explicitly asserts `GET /api/agents returns 404 (route renamed to /api/users)`. This test is in the plan's own protected-tests list (section 9). Registering a new `/api/agents` route will break this assertion.

  **Fix options:**
  1. **Preferred:** Update the P2 test to remove the 404 assertion for `GET /api/agents`. Since X3 legitimately reintroduces this path for a different purpose (agent configuration, not user listing), the P2 "renamed" assertion is no longer valid. Add a `@lore` comment explaining that X3 reintroduces `/api/agents` for agent-specific management, distinct from the general `/api/users` listing route. Note: this IS a change to a protected test, but the plan explicitly calls out that protected tests can have NEW assertions added. The P2 test should REMOVE the 404 assertion (a behavioral change), which the plan must acknowledge.
  2. **Alternative:** Use a different path, e.g., `/api/agent-config` or `/api/settings/agents`. But `/api/agents` is the semantically correct name and the plan's design-it-twice section already defended it.

  The plan must explicitly address this conflict in its reconciliation table and remove `P2-user-routes.test.ts` from the protected-tests list OR specify which assertion changes.

### WARNING

- [plan section 3, PATCH endpoint] **Missing 404 status code for nonexistent agent ID.** The plan specifies 403 (wrong kind/role) and 200 (success) but does not specify what happens when the `:id` does not match any user in the database. The builder would likely infer 404, but the contract should be explicit. Same applies to GET `/api/agents/templates/:role` for invalid role strings that are not in `USER_ROLES` -- should that be 400 (bad request, invalid role) or 404 (no template)?

- [plan section 4, model tier resolution] **Unsafe `as` cast on `modelTierPreference`.** The plan specifies:
  ```typescript
  const modelTier: ModelTier = params.modelTier
    ?? (agent.modelTierPreference as ModelTier | null)
    ?? "workhorse";
  ```
  The `as ModelTier | null` cast is unsafe -- the DB column is `text` and could contain any string. The `.claude/rules/typescript.md` says "No unsafe `as` casts." The `modelTierPreference` should be validated at write time (the Zod schema `z.enum(MODEL_TIERS)` on POST/PATCH handles this) AND at read time in session provisioning (a guard like `if (isModelTier(agent.modelTierPreference))` with a type guard function). The plan should note that the cast requires a runtime guard, or the Zod schema at the API boundary should be considered sufficient (it is, for data written through the API -- but seed data and direct DB manipulation bypass the API).

- [plan section 2, shared types] **`MODEL_TIERS` constant does not exist yet.** The plan says `const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;` and notes "ModelTier already exists... No new type needed -- reuse ModelTier." But the plan also uses `z.enum(MODEL_TIERS)` in the Zod schemas (section 3). Currently, `ModelTier` is defined as a literal type union (`"reasoning" | "workhorse" | "fast"`) with no corresponding `MODEL_TIERS` const tuple. The plan should add `MODEL_TIERS` as a const tuple (alongside the existing `ModelTier` type) so the Zod schema can reference it. This is a real implementation detail the builder needs -- without it, the Zod enum will fail to compile.

- [plan section 10, Task 1] **Seed backfill uses `onConflictDoNothing` which skips updates.** The current seed uses `.onConflictDoNothing()` for user inserts (e.g., `seed-agent-cos`). The plan says "Backfill `soulPrompt` on existing agents from the matching template." But the existing seed already does `.update(users).set(...)` in a separate statement for the CoS agent (line 110-118 in seed.ts). The plan's backfill should follow this same pattern (separate update statements after insert), which the plan does describe. But the plan's wording "After the existing user inserts, add template seeding" is ambiguous -- it could be read as modifying the insert statements. The plan should clarify: the backfill is via UPDATE statements, not by modifying existing INSERT values (which would be ignored by `onConflictDoNothing` on re-seed).

### SUGGESTION

- [plan section 7, security] **Soul prompt injection surface.** The plan correctly notes "soul prompt is founder-authored (trusted)" and "no script injection risk because the prompt is consumed server-side by the harness, never rendered as HTML." This is correct today. However, the prompt IS passed to the LLM as system instructions. A compromised or malicious soul prompt could instruct the agent to exfiltrate data, ignore safety constraints, or act against the founder's interests. This is a trust model decision (founder is trusted), not a code vulnerability, but the security section should note it as a deliberate trust boundary rather than treating it as "N/A."

- [plan section 10, Task 8] **Doc update is logically last but has no dependencies.** The plan says Task 8 "can run in parallel, but logically last." Since the doc update (`docs/agent-layer/agent-identity.md`) has zero code dependencies and zero test dependencies, it should be done earlier (perhaps in Task 1 alongside the schema changes) to prevent the common failure mode where doc updates are forgotten when they are pushed to the end.

- [plan section 5, UI component] **No `.stories.tsx` mentioned for SettingsAgents.** The `.claude/rules/frontend.md` says "Every custom component must have a `.stories.tsx` file next to it rendering key states at `/designsystem`." `SettingsAgents` is NOT a custom design-system component (it's a page section in `packages/web/src/settings/`), and the existing `SettingsOrgChart` does not have stories either. So this is consistent with the current codebase. But the rule is ambiguous about whether Settings section components count as "custom components." The builder should follow the OrgChart precedent (no stories for settings sections).

- [plan section 11, Risk 1] **Seed file-read graceful degradation could mask problems.** The plan says "If the files are missing, seed inserts empty templates (graceful degradation with a warning log)." This means a silent failure in CI or deployment where `docs/` is not available would result in agents with no soul prompts, which is a functional regression. Consider making the file-read failure throw in development/CI environments and degrade gracefully only in production. Or: make it a hard failure always, since the seed is a setup-time operation and the files are part of the repo.

---

## What's Working Well

1. **Plan reconciliation table is excellent.** Section "Phase 0 -- Plan reconciliation: spec vs reality" is the single most valuable part of the plan. It cross-references every spec assumption against the actual codebase (with line numbers) and documents the resolution. This catches CC-007 (spec/codebase drift) proactively. The discovery that `AdapterMeta` lacks a `type` field, that the self-edit guard on `/api/users` prevents agent management, and that `ops` is not a valid role -- all found through reconciliation, not by accident during implementation.

2. **Design-it-twice is genuine.** The `/api/agents` vs "extend `/api/users`" analysis in section 12 is a real trade-off evaluation, not theatre. The security argument (self-edit guard is a security boundary; conditional bypasses create audit surface) is specific and defensible. The acceptance that "two route files touch the `users` table" is an honest cost acknowledgment.

3. **Migration safety is correctly prioritized.** Additive-only columns with null defaults, no drops in this migration, existing `soulPromptPath` kept for rollback safety, seed backfill in separate UPDATE statements (not in migration SQL). The migration SQL is minimal (3 ALTER TABLE ADD COLUMN statements). This is the correct approach for a production migration.

---

## Verdict

Score 8/10 -- advances with one CRITICAL and four WARNINGs. The CRITICAL (route path conflict with P2 protected test) must be addressed in the plan before the builder starts. The WARNINGs are addressable during implementation but should be noted in the plan to prevent builder confusion.

The plan is thorough, well-reconciled against the codebase, and proportional to the problem. The 8 tasks with clear dependencies are buildable. The 18 ACs are verifiable. The security analysis eliminates a real attack surface (path traversal) rather than adding one.
