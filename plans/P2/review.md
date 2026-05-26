# P2 Code Review: Unified User Primitive and OrgChart

**Verdict: DONE**

All 11 acceptance criteria are satisfied. The implementation faithfully follows the architecture plan, addresses both critical findings from the Phase 2 architecture critique, and passes `bun run verify`. Findings below are improvement opportunities, not blockers.

---

## AC Completeness Audit

| # | Acceptance Criterion | Status | Evidence |
|---|---------------------|--------|----------|
| AC1 | `agents` table renamed to `users`. `kind` column added ("human"\|"ai", default "ai", backfilled). | DONE | Migration `0017_P2_rename_agents_to_users.sql` (SQLite) and `0012_P2_rename_agents_to_users.sql` (PG) execute `ALTER TABLE agents RENAME TO users` + `ADD COLUMN kind text NOT NULL DEFAULT 'ai'`. Schema files (`schema.ts:24`, `schema.pg.ts:25`) export `users` with `kind` column. `P2-user-schema.test.ts` verifies table exists, `agents` table absent, kind defaults to "ai". |
| AC2 | Human-specific nullable columns: `email`, `avatarUrl`. | DONE | Both migrations add `email text` and `avatar_url text` (nullable). Schema files declare them as nullable `text()`. `P2-user-schema.test.ts` verifies `notnull: 0` for both columns and successful insert with populated values. |
| AC3 | Hardcoded `u-founder` and factorySettings `founder_name`/`founder_email` eliminated. Human user is a row in `users`. | DONE | `seed.ts` and `seed-pg.ts` no longer insert `founder_id`, `founder_name`, `founder_email` into `factorySettings`. Instead they insert a human user row (`id: "u-founder"`, `kind: "human"`). Auth middleware (`auth.ts:89`) resolves from `users WHERE kind = 'human' LIMIT 1`. `lifecycle-propagation.ts:489` reads founder from users table. `P2-auth-resolution.test.ts` verifies auth reads from users table and `/api/settings` profile comes from users table. The string "u-founder" persists as a user ID (not a hardcoded bypass) and as a fallback sentinel for unseeded DBs. |
| AC4 | All code references updated. API `/api/agents` -> `/api/users`. | DONE | `routes/agents.ts` renamed to `routes/users.ts`. `app.ts:258` mounts `createUserRoutes` at `/users`. All imports across server (14 route/service files), fabric (9 files), shared (types.ts, index.ts), api-contract, and web updated. `grep` confirms zero `from(agents)` or `.agents.` references in production code. `P2-user-routes.test.ts` verifies `/api/agents` returns 404 and `/api/users` returns 200. Types renamed: `AgentRole` -> `UserRole`, `AgentStatus` -> `UserStatus`, `AGENT_ROLES` -> `USER_ROLES`, etc. Backward-compat aliases kept with `@deprecated`. |
| AC5 | New `org_edges` table: `fromUserId`, `mechanism`, `target`, composite unique constraint. | DONE | Both migration files create `org_edges` with `id`, `from_user_id`, `mechanism`, `target`, `created_at`. Composite unique index `org_edges_unique` on `(from_user_id, mechanism, target)`. Index `org_edges_from_user_idx` on `from_user_id`. Schema files (`schema.ts:310`, `schema.pg.ts:283`) match. `P2-org-edges.test.ts` verifies table exists, CRUD works, unique constraint rejects duplicates, CASCADE delete works. |
| AC6 | API: `GET /api/org`, `PUT /api/org/edges`, `DELETE /api/org/edges/:id`. | DONE | `routes/org.ts` implements all three endpoints. `app.ts:259` mounts at `/org`. GET returns `{edges, users}`. PUT validates with Zod (mechanism enum from `ORG_EDGE_MECHANISMS`), checks FK existence, returns 201 on create or 200 on upsert. DELETE returns 204 or 404. `P2-org-routes.test.ts` covers all endpoints including auth, validation errors, upsert behavior, and deletion verification. |
| AC7 | Auth middleware resolves user from `users` table. | DONE | `auth.ts:89`: `db.select().from(users).where(eq(users.kind, "human")).limit(1).get()`. Falls back to `"u-founder"` when no human user exists. `P2-auth-resolution.test.ts` verifies resolution from users table, fallback behavior, and that factorySettings is not consulted. |
| AC8 | Fallback: no org edges -> all human users get all reviews. | DONE | `services/org-routing.ts` implements `resolveReviewRecipients` with the 5-step algorithm: query direct edges, function edges, team edges, union + deduplicate, fallback to all human users. `P2-fallback-routing.test.ts` covers: no edges -> all humans, matching edges -> only matched humans, non-matching edges -> fallback to all humans, deduplication across multiple edge matches, empty context -> fallback. |
| AC9 | Drizzle schemas for SQLite and PG updated. | DONE | `schema.ts` and `schema.pg.ts` both updated with `users`, `userSkills`, `orgEdges` tables. Both migration files exist. Migration journal files updated with correct entries. `P2-user-schema.test.ts` verifies `createTestDb()` runs all migrations successfully. |
| AC10 | All existing tests pass. New tests cover user CRUD, org edge CRUD, auth resolution, fallback routing. | DONE | 6 new test files: `P2-user-schema.test.ts`, `P2-org-edges.test.ts`, `P2-user-routes.test.ts`, `P2-org-routes.test.ts`, `P2-auth-resolution.test.ts`, `P2-fallback-routing.test.ts`. All existing tests updated (123 files changed from merge base). `bun run verify` passes. |
| AC11 | `bun run verify` passes. | DONE | Attestation file (`.verify-attestation.json`) shows `sha: 3a6271c`, `status: passed`, all 7 tools green. |

---

## Findings by Lens

### Lens 1: Architecture (Positive)

**Overall: STRONG.** The implementation faithfully follows the architecture plan. Schema shapes match the spec field-by-field. Layer integrity is preserved (org-routing.ts lives in server/services, not fabric). The migration strategy (hand-written SQL with Drizzle journal entries) is sound and both dialects are covered.

**NOTE-A1: Backward-compat aliases retained in shared/types.ts and zod-schemas.ts.** The plan (section 2.4) said "we do the full rename and skip the aliases" but the implementation keeps `AgentRole`, `AgentStatus`, `AGENT_ROLES`, `KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES` as deprecated re-exports in `types.ts:122-131`, and `selectAgentSchema`/`insertAgentSchema`/`selectAgentSkillSchema` as aliases in `zod-schemas.ts:68-70`. These are re-exported from `shared/index.ts:204-205,221-225`. The plan was explicit about not having aliases. While the aliases are harmless (they are `@deprecated`), they deviate from the plan's stated decision and will accumulate tech debt if not cleaned up. Also, the `KNOWN_AGENT_ROLES` local variable in `fabric/src/relevance-scoring.ts:69` was not renamed to `KNOWN_USER_ROLES` -- it is only a local constant but naming is inconsistent.

**Cite:** Plan section 2.4: "given the AC says 'all code references updated,' we do the full rename and skip the aliases."

**Severity: NOTE**

---

**NOTE-A2: Architecture critique CRITICAL #2 ("founder" role not in USER_ROLES) was acknowledged but not structurally resolved.** The builder made the correct pragmatic decision: `role` is a `text` column in the schema, not constrained to `UserRole` at the DB level. The tests correctly note that `"founder"` is a valid text value (e.g., `P2-user-schema.test.ts:11-13`). However, no `@lore` comment exists in `threads.ts` at lines 89 and 494 where `role === "founder"` is the authorization check. A future agent renaming roles would not know this is load-bearing for verdict authorization.

**Cite:** Architecture critique CRITICAL #2; `threads.ts:89,494`.

**Severity: NOTE**

---

### Lens 2: Design (Skipped)

No UI surface in P2. The SettingsPanel rename (`agents` -> `users` in SettingsData) is a data model change, not a visual change. The "Agents" tab label intentionally stays as "Agents" per the plan -- this is a UI display label for the AI user category.

---

### Lens 3: Security (Positive)

**Overall: ADEQUATE for v1 single-user desktop mode.**

**NOTE-S1: PUT /api/org/edges does not validate mechanism-dependent target values.** The Zod schema validates `mechanism: z.enum(ORG_EDGE_MECHANISMS)` and `target: z.string().min(1)` but does not enforce that: (a) when mechanism="direct", target is a valid userId, (b) when mechanism="function", target is a valid role from USER_ROLES, (c) when mechanism="team", target is a valid teamId. The handler validates that `fromUserId` exists in the users table (`org.ts:72-78`) but applies no validation to `target`. This means you can create an edge with `mechanism: "direct", target: "garbage"` and it will succeed. The architecture plan (section 2.3) explicitly called for this validation: "if mechanism=direct, target must be a valid userId." The critique (WARNING #5) also flagged this.

**Cite:** Plan section 2.3, critique WARNING #5, `org.ts:69`.

**Severity: WARNING**

---

**NOTE-S2: PUT /api/org/edges does not restrict fromUserId to human users.** The critique (WARNING #6) flagged that the plan does not specify whether `fromUserId` must be `kind = "human"`. The implementation allows any user (AI or human) as `fromUserId`. This is arguably fine for flexibility, but the OrgChart concept doc describes edges as human-user review responsibilities. An AI user creating org edges for itself would be semantically wrong. For v1 this is low risk since the API is only called by the human founder.

**Cite:** Critique WARNING #6, `org.ts:72-78`.

**Severity: NOTE**

---

**NOTE-S3: All org endpoints are covered by the existing global rate limiter.** The plan's security table identifies rate limiting as applicable and covered. Auth is required on all three endpoints (verified in tests). No secrets are logged. No path traversal or SSRF vectors introduced.

**Severity: (Positive confirmation, no finding)**

---

### Lens 4: Adversarial (Negative)

**WARNING-ADV1: The existing-edge lookup in PUT /api/org/edges uses a full table scan + JS filter instead of a WHERE clause.** At `org.ts:81-86`, the code does:

```typescript
const existing = db
  .select()
  .from(orgEdges)
  .where(eq(orgEdges.fromUserId, fromUserId))
  .all()
  .find((e) => e.mechanism === mechanism && e.target === target);
```

This fetches ALL edges for a given `fromUserId` and then filters in JavaScript. With many edges per user, this is O(n) in JS when it could be a single indexed query using the composite unique index. The correct approach is:

```typescript
const existing = db
  .select()
  .from(orgEdges)
  .where(
    and(
      eq(orgEdges.fromUserId, fromUserId),
      eq(orgEdges.mechanism, mechanism),
      eq(orgEdges.target, target),
    ),
  )
  .get();
```

This is not just a performance issue -- it bypasses the database's unique index for the lookup, doing in JS what the DB is optimized to do. The unique constraint `org_edges_unique` on `(from_user_id, mechanism, target)` means a 3-column WHERE would hit the index directly.

**Cite:** `org.ts:81-86`, plan section 2.3 (unique index exists for this query).

**Severity: WARNING**

---

**NOTE-ADV2: Two `as` casts in `routes/users.ts:72,185`.** Both are `c.req.valid("json" as never) as z.infer<typeof schema>` -- this is the established pattern in the codebase (inherited from Hono's typing limitations with the validator middleware). Counted: 2 `as` casts in new P2 route code, 1 `as` cast in auth middleware (env typing at line 49). All are necessary for Hono framework integration, not type safety violations.

**Severity: NOTE (accepted pattern)**

---

**NOTE-ADV3: The `authMiddleware` stateless export (auth.ts:103-123) does not set `userId` on context.** The architecture critique (WARNING #4) flagged this. The stateless middleware is used for routes that don't need DB access (health checks, etc.). After P2, routes that call `c.get("userId")` without going through `createAuthMiddleware(db)` would get `undefined`. The code at `auth.ts:103` does not call `c.set("userId", ...)`. This is unchanged behavior from before P2, but the plan should have documented which routes use which middleware variant. Since no P2 code introduces new routes that use the stateless middleware, this is not a regression.

**Cite:** Critique WARNING #4, `auth.ts:103-123`.

**Severity: NOTE**

---

### Lens 5: Simplification (Negative)

**NOTE-SIM1: Deprecated aliases add 16 lines of dead-on-arrival code.** The backward-compat aliases in `shared/types.ts:117-131` (`AgentRole`, `AgentStatus`, `KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES`, `AGENT_ROLES`) plus `shared/index.ts:204-205,221-225` re-exports and `zod-schemas.ts:64-70` aliases are not consumed by any production code path (all production code was renamed). They exist "so existing tests compiled before the rename continue to pass" (zod-schemas.ts comment) but the builder already updated ALL test files in the same commit. These aliases serve no purpose and should be removed.

**Severity: NOTE**

---

**NOTE-SIM2: `SettingsPanel.tsx` keeps `AgentSetting` as the primary interface and adds `UserSetting` as an alias.** At line 21-32, `AgentSetting` is the interface definition and `UserSetting = AgentSetting` is the alias. The plan (section "Frontend renames") said `AgentSetting` -> `UserSetting`. The implementation inverts this: `UserSetting` is the alias, `AgentSetting` is canonical. This is backwards -- the new name should be the definition and the old name should be the deprecated alias. `SettingsData.users` correctly uses `UserSetting[]` though.

**Cite:** Plan section "Frontend renames", `SettingsPanel.tsx:21-32`.

**Severity: NOTE**

---

### Lens 6: AI Slop (Negative)

**NOTE-SLOP1: Over-documentation in @lore comments.** Some `@lore` comments explain decisions that are self-evident from the code. For example, `seed.ts:55-56`: "P2: Seed the human founder user row. This is the authenticated identity for the auth middleware (users WHERE kind = 'human' LIMIT 1)." The seed row itself makes this clear -- the comment restates what the code does rather than explaining WHY. However, the `@lore` comments on non-obvious decisions (e.g., the auth fallback, the column rename critique finding) are valuable. This is marginal.

**Severity: NOTE**

---

**NOTE-SLOP2: JSDoc comment in auth-route.ts is stale.** The file-level JSDoc at `routes/auth.ts:1` still says "returns the authenticated user's identity from factorySettings" but the implementation now reads from the users table. The in-line comment at line 48 correctly says "reads from users table instead of factorySettings" but the file-level description is misleading.

**Cite:** `routes/auth.ts:1-5`.

**Severity: NOTE**

---

**NOTE-SLOP3: Comments referencing factorySettings remain in several files.** `threads.ts:56` ("auth context userId (set from factorySettings.founder_id)"), `coach.ts:36` ("auth context userId (set from factorySettings.founder_id)"), `bet-state-machine.ts:16` ("(set by createAuthMiddleware from factorySettings.founder_id)"), `api-contract/auth.ts:9` ("id is stored in factorySettings"). These are now inaccurate -- the identity is resolved from the users table, not factorySettings. Stale comments in production code mislead future agents.

**Cite:** `threads.ts:56`, `coach.ts:36`, `bet-state-machine.ts:16`, `api-contract/auth.ts:9`.

**Severity: NOTE**

---

## Summary

The P2 implementation is solid. The core rename (agents -> users) is thorough across ~120 files. The new org_edges table and API are clean. The migration handles both dialects correctly, including the column rename (`agent_id` -> `user_id` in user_skills) that the architecture critique flagged as missing. The `resolveReviewRecipients` function implements the 5-step algorithm that was underspecified in the plan but specified in the critique.

**Actionable findings for a follow-up (none blocking merge):**
1. WARNING-S1: Add mechanism-dependent target validation in PUT /api/org/edges.
2. WARNING-ADV1: Replace the JS filter with a 3-column WHERE clause in the upsert check.
3. NOTE-SIM1: Remove the backward-compat aliases that are not consumed.
4. NOTE-SLOP3: Update stale factorySettings comments in threads.ts, coach.ts, bet-state-machine.ts, api-contract/auth.ts.
5. NOTE-A2: Add `@lore` comments at threads.ts:89 and :494 documenting the "founder" role dependency.
6. NOTE-SIM2: Invert AgentSetting/UserSetting so UserSetting is the definition and AgentSetting is the alias.

**Branch status:** The P2 branch is 2 commits behind `origin/main` (Q1, Q2 landed after fork). It must rebase or merge main before PR merge. This may introduce conflicts in files touched by both P2 and Q1/Q2 (knowledge routes, schema files, app.ts).
