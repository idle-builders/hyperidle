# X3 Code Review -- Agent Configuration (DB + UI)

**Verdict: DONE -- with 1 CRITICAL, 3 WARNINGs, 5 SUGGESTIONs**

The CRITICAL is a runtime bug that silently drops worker `harnessType` during WebSocket registration. All 18 ACs are implemented and tested. The overall implementation quality is high: clean layer boundaries, proper Zod validation at API boundaries, safe `as` cast elimination in session provisioning, and comprehensive test coverage across unit, integration, and E2E layers.

---

## AC Completeness Audit

| AC | Description | Implemented | Tested | Notes |
|----|-------------|:-----------:|:------:|-------|
| AC-1 | users table gains soulPrompt, harnessType, modelTierPreference columns | Yes | Yes | Migration, schema, 5 tests in X3-agent-config.test.ts |
| AC-2 | Soul prompt templates seeded from docs/souls/ | Yes | Yes | 6 tests including idempotency and frontmatter stripping |
| AC-3 | Existing agents backfilled with soulPrompt from role template | Yes | Yes | 5 tests covering PM, CoS, PF, builder (null), system (null) |
| AC-4 | GET /api/agents returns AI agents with config fields | Yes | Yes | 5 integration tests; system agents excluded; activeSessions verified |
| AC-5 | POST /api/agents creates a new agent | Yes | Yes | 10 tests covering success, validation errors, DB persistence |
| AC-6 | PATCH /api/agents/:id updates agent configuration | Yes | Yes | 7 tests including 403/404, null setting, unchanged field preservation |
| AC-7 | DELETE /api/agents/:id soft-deletes (status = "retired") | Yes | Yes | 5 tests including 403/404/409 |
| AC-8 | GET /api/agents/templates/:role returns template content | Yes | Yes | 5 tests including 404 for builder, 401 without auth |
| AC-9 | Settings UI Agents section renders agent table | Yes | Yes | 9 unit tests + 5 E2E tests |
| AC-10 | Settings UI edit form opens inline and saves | Yes | Yes | 5 unit tests + 4 E2E tests |
| AC-11 | Settings UI add form creates agent with template pre-fill | Yes | Yes | 5 unit tests + 3 E2E tests |
| AC-12 | Settings UI delete with two-click confirmation | Yes | Yes | 4 unit tests + 3 E2E tests |
| AC-13 | Session provisioning reads soulPrompt from DB (not file) | Yes | Yes | 4 tests; validateSoulPromptPath export check; composedPrompt verified |
| AC-14 | Session provisioning uses modelTierPreference as default | Yes | Yes | 3 tests: preference used, explicit override, null fallback |
| AC-15 | Session provisioning filters adapters by harnessType | Yes | Yes | 3 tests: matching adapter selected, null backward compat, no match throws |
| AC-16 | Prompt composition accepts inline text instead of file path | Yes | Yes | 10 tests covering frontmatter, template vars, no fs.readFile |
| AC-17 | Agent configuration changes take effect on next session | Yes | Yes | 1 integration test: provision, update, provision again |
| AC-18 | AdapterPool.select() filters by harnessType | Yes | Yes | 9 tests including backward compat, stacking with modelProviders |

All 18 ACs are **implemented and tested**. Total test count: 110 across 8 test files.

---

## Phase 2 CRITICAL Resolution Check

The architecture critique raised one CRITICAL: **`/api/agents` route path conflicts with P2 protected test** (`P2-user-routes.test.ts` asserted `GET /api/agents returns 404`).

**Resolution:** The builder removed the 404 assertion and added a `@lore` comment at line 108-114 of `P2-user-routes.test.ts` explaining the X3 reintroduction. This is the correct fix per the critique's "Preferred" option. The remaining P2 test assertions are preserved.

---

## Findings by Lens

### Lens 1: Architecture

No layer violations. Clean separation:

- `packages/db` (schema + migration + seed) -- no imports from fabric/server
- `packages/server` (routes + session-provisioning + adapter-pool) -- correct layer
- `packages/web` (SettingsAgents) -- uses `apiFetch`, no direct DB access
- `packages/fabric` (prompt-composition) -- interface changed cleanly
- `packages/shared` (MODEL_TIERS + worker-protocol) -- correct scope

The `stripFrontmatter` duplication in `seed.ts` is correctly justified with a `@lore` comment explaining the dependency direction constraint.

Route registration: `createAgentRoutes(options.db)` at line 376 of `app.ts` is placed in the authenticated section, consistent with the plan. Rate limiting is inherited from the global API rate limiter registered at line 249.

**Deviation from plan:** The plan specified `createAgentRoutes(options.db, eventBus)` as the route factory signature. The implementation uses `createAgentRoutes(options.db)` -- eventBus is not passed. The agent routes do not emit any events, so this is functionally correct. No events are specified in the plan for agent CRUD operations either. This is acceptable.

### Lens 2: Design

**COMPLIANT with approved design:**

- Section container with `data-testid="settings-section-agents"`, `flex flex-col gap-3` -- matches spec
- `<h2>` with `text-[15px] font-semibold text-[var(--text-primary)]` -- matches spec (in SettingsPage.tsx)
- `table table-xs w-full` -- matches spec
- Table headers with `text-[var(--text-tertiary)]` -- matches spec
- Loading: 2x `skeleton h-8 w-full` -- matches spec
- Error: `text-sm text-error` with "Failed to load agents. Please try again." -- matches spec
- Empty: `text-sm text-[var(--text-tertiary)]` with "No agents configured." -- matches spec
- Edit form: `border border-[var(--border-subtle)] rounded-[var(--r-subtle)]` -- matches spec
- Cancel: `btn btn-ghost btn-sm` -- matches spec
- Save: `btn btn-primary btn-sm` with spinner -- matches spec
- Delete: `btn btn-ghost btn-xs text-error` -- matches spec
- Add button: `btn btn-ghost btn-sm self-start` with "+ Add Agent" -- matches spec

**Design deviations (minor):**

- The design spec says role should use `badge badge-sm badge-ghost font-mono`. The implementation uses `text-sm font-mono text-[var(--text-secondary)]` -- a plain `<td>` without badge classes. The role is displayed correctly but without the badge visual treatment.

- Textarea `rows={6}` instead of spec's `rows={8}`. Minor visual difference.

- The design spec says edit form container should use `gap-[12px]`. Implementation uses `gap-2` (8px). Off from the spec by 4px.

- The spec calls for `font-mono` on Harness/tier columns. The implementation only applies `font-mono` to the Role column, not Harness or Model Tier.

These are minor visual discrepancies, not functional issues.

### Lens 3: Security

**CRITICAL: WorkerRegisterSchema missing `harnessType` field**

`/Users/tg/hyperidle/.worktrees/X3/packages/server/src/routes/worker-ws.ts` lines 26-32: The `WorkerRegisterSchema` Zod object does not include `harnessType: z.string().optional()`. Zod's `z.object()` strips unknown keys during parsing. When a remote worker sends `{ type: "register", id: "w1", name: "mac", modelProviders: ["anthropic"], maxConcurrent: 4, harnessType: "aider" }`, Zod parses it and strips `harnessType`. At line 120, `msg.harnessType` evaluates to `undefined`.

TypeScript does not catch this because the Zod-parsed discriminated union type narrows `msg` to the `WorkerRegisterMessage` TypeScript interface from `@hyperidle/shared`, which DOES include `harnessType?: string`. The runtime value and the compile-time type disagree.

**Impact:** Remote workers can never register with a harness type. The adapter pool will always have `type: undefined` for remote workers, making harnessType-based adapter selection nonfunctional for remote workers. Local adapters (registered directly by `createLocalAdapterPool`) are unaffected because they bypass Zod parsing.

**Fix:** Add `harnessType: z.string().optional()` to `WorkerRegisterSchema` in `worker-ws.ts`.

---

**Other security observations (all correct):**

- Zod validation on all POST/PATCH request bodies with explicit limits (name 200 chars, soulPrompt 50K chars, maxConcurrentSessions 1-20, modelTierPreference enum-validated)
- 403 for system-role agents on PATCH/DELETE
- 404 for nonexistent agents
- 409 for already-retired agents on DELETE
- Auth required on all endpoints (inherited from `app.ts` auth middleware)
- Rate limiting inherited from global limiter
- Path traversal attack surface eliminated -- `validateSoulPromptPath` removed, `@lore` comment explaining the elimination
- No raw SQL outside migration file (all Drizzle ORM)
- `encodeURIComponent` used in client-side URL construction

### Lens 4: Adversarial

**WARNING: React Fragment without key in map**

`/Users/tg/hyperidle/.worktrees/X3/packages/web/src/settings/SettingsAgents.tsx` line 273-274: `agents.map((agent) => (<>` uses a shorthand Fragment (`<>`) inside `.map()`. React requires keys on the outermost element in a map. The `key` is placed on the inner `<tr key={agent.id}>` at line 275, not on the Fragment. This produces a React warning: "Each child in a list should have a unique 'key' prop." The fix is `<Fragment key={agent.id}>` instead of `<>`.

**WARNING: Template pre-fill race condition**

`/Users/tg/hyperidle/.worktrees/X3/packages/web/src/settings/SettingsAgents.tsx` lines 510-514: When the user rapidly changes the role select in the add form, `fetchTemplate` is called for each change. The callback uses `setAddValues` to update the soul prompt, but there is no abort controller or sequence counter to discard stale responses. If the user selects role A, then role B quickly, and A's fetch returns after B's, the textarea will show A's template while the select shows B. The architecture critique flagged this (Phase 2 WARNING: "race condition in template pre-fill"). The implementation does not mitigate it.

The severity is low because rapid role switching in an admin settings page is uncommon, and the result is a cosmetic mismatch that the user can observe and correct. But the plan identified it and the implementation did not address it.

**WARNING: `as ModelTier` cast in session provisioning still exists, but is now guarded**

`/Users/tg/hyperidle/.worktrees/X3/packages/server/src/services/session-provisioning.ts` lines 219-226: The architecture critique flagged an unsafe `as ModelTier` cast. The builder addressed this with a runtime validation guard:
```typescript
const MODEL_TIER_VALUES = ["reasoning", "workhorse", "fast"] as const;
const rawPreference = agent.modelTierPreference;
const agentPreference = 
  rawPreference !== null && rawPreference !== undefined &&
  (MODEL_TIER_VALUES as readonly string[]).includes(rawPreference)
    ? (rawPreference as ModelTier) : null;
```

The `as ModelTier` on line 225 is now safe because the `includes` check on line 224 confirms the value is one of the valid options. However, `MODEL_TIER_VALUES` is a local constant duplicating `MODEL_TIERS` from `@hyperidle/shared`. The import already exists at the top of the file (via `@hyperidle/shared`). Using the shared constant would be cleaner and prevent drift, but there is no functional bug.

### Lens 5: Simplification

**SUGGESTION: `buildPatchUpdateSet` helper in agents.ts**

`/Users/tg/hyperidle/.worktrees/X3/packages/server/src/routes/agents.ts` lines 57-68: This helper converts Zod-validated PATCH data into an update set. It uses mixed patterns: `data.name !== undefined` for some fields and `"soulPrompt" in data` for others. The `in` check is needed because `soulPrompt` can be explicitly `null` (remove persona) vs absent (do not change), while `name` cannot be null. This is functionally correct but the inconsistency is confusing. A comment explaining the distinction between "optional" fields (name, role) and "nullable-optional" fields (soulPrompt, harnessType, modelTierPreference) would clarify intent.

**SUGGESTION: Local USER_ROLES / MODEL_TIERS in SettingsAgents.tsx**

`/Users/tg/hyperidle/.worktrees/X3/packages/web/src/settings/SettingsAgents.tsx` lines 25-34: `USER_ROLES` and `MODEL_TIERS` are redeclared locally as `const` arrays. These already exist in `@hyperidle/shared` and are imported in the server routes file. The web package already imports from `@hyperidle/shared` elsewhere. Local copies risk drift if roles or tiers change.

### Lens 6: AI Slop

**No significant slop detected.** The implementation is clean:

- No unnecessary comments explaining obvious code
- No `TODO: implement` on implemented code
- No verbose helper names
- No defensive over-engineering (null checks are present only where null is a real possibility from the DB)
- No `console.log` in production code
- No dead code or commented-out code
- `@lore` comments are substantive and reference specific workpackages/architectural decisions

One minor observation: the `// hearth-internal-padding` comment on line 19 of SettingsAgents.tsx appears to be a file-level directive for the AQ-001 spacing exemption. This is appropriate since the component uses `p-3` (12px padding) which is on the Hearth grid.

---

## What's Working Well

1. **Phase 2 CRITICAL fully addressed.** The P2 protected test 404 assertion was removed with a thorough `@lore` comment explaining the X3 reintroduction. This is exactly what the critique asked for.

2. **Safe `as` cast elimination in session provisioning.** The architecture critique warned about the unsafe `as ModelTier` cast. The builder added a runtime validation guard with `includes()` before the cast, making it safe. This addresses the critique's concern about seed data or direct DB manipulation bypassing the API Zod validation.

3. **Attack surface elimination documented.** The `validateSoulPromptPath` removal is documented with a `@lore` comment at the top of session-provisioning.ts explaining that the path traversal attack surface is eliminated by X3. This is the kind of security improvement that should be documented.

4. **Comprehensive test coverage.** 110 tests across 8 files covering all 18 ACs. The tests exercise success paths, error paths, boundary values (50K chars, 201 chars, maxConcurrentSessions 21), and edge cases (system agent exclusion, already-retired deletion, null semantics). The session provisioning tests use real DB instances via `createTestDb()` rather than mocks.

5. **Seed idempotency.** The template seeding uses `onConflictDoUpdate` (not `onConflictDoNothing`), which means re-running the seed updates templates to match the current file content. The backfill uses `UPDATE WHERE role = X` which is also idempotent. An explicit idempotency test verifies this.

6. **Hono route ordering.** The `@lore` comment at line 81-83 of agents.ts explains why `/templates/:role` is registered before `/:id` -- Hono matches routes in registration order, so the static prefix must come first to avoid "templates" being captured as an ID parameter. This is a real gotcha that is correctly documented.

7. **Clean `soulPromptPath` deprecation path.** The column is marked `@deprecated` in the schema JSDoc but NOT dropped. The session provisioning passes `soulPromptPath: ""` to `SessionConfig` (deprecated field), and the composed prompt is delivered via `composedPrompt`. The rollback path is preserved.
