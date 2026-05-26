# Architecture Critique: P2

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:7 LI:9 AC:7 DM:7 N:8 MD:8 FMC:6 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (7/10)

Every AC (1-11) maps to at least one task. The plan does not invent requirements outside the spec. However:

- AC3 says "eliminate hardcoded `u-founder` identity." The plan's seed (section 2.8) still creates a user with `id: "u-founder"`. The plan acknowledges this consciously (the ID is now a real user row, not a bypass), which is acceptable. But the plan also seeds `role: "founder"` for the human user, and "founder" is NOT in the `AGENT_ROLES` constant (to be renamed `USER_ROLES`). The plan's section 2.4 defines `USER_ROLES` as `[...KERNEL_USER_ROLES, ...FABRIC_USER_ROLES]` which is `["builder", "growth", "product_manager", "practice_facilitator", "chief_of_staff", "brand_voice"]`. "founder" is absent. This means the human user has a role that falls outside the typed role union, creating a type safety gap.
- AC4 says "all code references updated." The plan lists `threads.ts` under Task 6 as "update `agents` import to `users`" only. But `threads.ts` (lines 89, 494) contains `role === "founder"` checks for verdict authorization. The plan does not address how the `role: "founder"` on the human user interacts with the renamed `UserRole` type (which does not include "founder"). This is load-bearing logic, not just an import rename.

### 2. Layer Integrity (9/10)

Clean. The plan correctly identifies that `org_edges` is kernel data, `founder-router.ts` stays in fabric and is not modified, and the new `org-routing.ts` service lives in `packages/server`. The `resolveReviewRecipients` function in server reads kernel data (org_edges, users) without reaching into fabric. No cross-layer violations detected.

Minor note: The concept doc says "The org chart is read by the strategy layer (routing/escalation) but owned by the kernel. No fabric imports in the org implementation." The plan places `org-routing.ts` in `packages/server/src/services/` which is kernel. Correct.

### 3. API Contracts (7/10)

The plan specifies all routes with HTTP method, path, request body (Zod schema), and response shapes with TypeScript interfaces (section 2.6). Status codes are specified (201, 200, 204, 400, 404).

Issues:
- The PUT /api/org/edges Zod schema (section 2.6) validates `fromUserId: z.string().min(1)` but does NOT validate `target` conditionally based on `mechanism`. The narrative at section 2.3 says "if mechanism=direct, target must be a valid userId; if mechanism=function, target must be a valid role from AGENT_ROLES; if mechanism=team, target must be a valid teamId." But the Zod schema shown is flat: `target: z.string().min(1)`. The plan says this validation "happens in the route handler" but does not show the discriminated union Zod schema or the handler validation code. A builder could implement the flat Zod schema and skip the mechanism-dependent validation entirely.
- The plan references "valid role from AGENT_ROLES" at line 181 when the plan itself renames this to `USER_ROLES`. Internal inconsistency.
- The GET /api/org response includes a `users` convenience array. The plan does not specify whether this includes ALL users or only those involved in edges. The response shape says `Array<{id, kind, name, role}>` but the query is unspecified.

### 4. Data Model Alignment (7/10)

The plan's schema definitions (sections 2.1-2.3) are field-complete with types, constraints, defaults, PKs, FKs, and indexes. The migration SQL (Task 1) is fully specified for both dialects. The dual-dialect coverage is thorough.

Issues:
- The plan says the PG agents table "omits costActual" (section Phase 1 assumption 2: "PG schema for agents omits the `@lore L17` comment on costCap but has the same columns"). I verified: PG schema DOES have `costActual: integer("cost_actual").default(0)` at line 35 of schema.pg.ts. The plan's claim is wrong -- both schemas are structurally identical here. This is a cosmetic error (the plan still handles both schemas the same way), but it indicates the plan author did not verify this claim against the file.
- The migration SQL in Task 1 includes `ALTER TABLE user_skills RENAME COLUMN agent_id TO user_id` in the risks section (section "Risks and ambiguities" item 2) but this line is NOT present in the actual migration SQL shown in Task 1. The migration SQL at lines 507-531 shows `ALTER TABLE agent_skills RENAME TO user_skills` but does NOT include the column rename. This is a gap: the Drizzle schema (section 2.2) defines `userId: text("user_id")` but the migration never renames the physical column from `agent_id` to `user_id`. The snapshot will show `user_id` but the database column will still be `agent_id`. This will cause a runtime mismatch.
- The `user_skills` PK in the Drizzle schema (section 2.2) uses `table.userId` as part of the composite PK. After the table rename but without the column rename, the Drizzle schema says `user_id` but the physical column is still `agent_id`. Drizzle will generate SQL referencing `user_id` which does not exist.

### 5. Naming (8/10)

Names are honest. `users`, `orgEdges`, `UserRole`, `UserKind`, `OrgEdgeMechanism`, `resolveReviewRecipients` all describe what they do. The vocabulary lock from the concept doc is respected.

One issue: the plan seeds the human user with `role: "founder"` (section 2.8). The concept doc's vocabulary lock says NOT to use "founder" as an alias for "User." The `role` field is a string that describes function in the system. But "founder" as a role is not in the typed `USER_ROLES` union. It exists in the codebase today (threads.ts uses it for verdict auth), but the plan does not address whether "founder" should be added to `USER_ROLES` or replaced with a different mechanism. This is a naming/typing gap that the plan should acknowledge.

### 6. Module Depth (8/10)

The public surface is small: one table rename, one new table, three new endpoints, one new service function. The org chart API has three endpoints (GET list, PUT upsert, DELETE by id) which is minimal and clean. The `resolveReviewRecipients` function is a single entry point that hides the edge-matching complexity.

No concerns here.

### 7. Failure-Mode Coverage (6/10)

This is the weakest dimension.

- The security table (end of plan) correctly identifies FK validation and mechanism/target consistency as concerns but marks them as handled by "Zod validates format" and "route handler with explicit checks per mechanism." The actual Zod schema shown does NOT do mechanism-dependent validation. The route handler validation is described narratively but not specified as a contract.
- The plan does not specify what happens when `PUT /api/org/edges` receives a `fromUserId` that exists but is `kind = "ai"`. Should AI users be allowed as `fromUserId` in org edges? The concept doc says OrgChart edges are "superior -> subordinate" relationships where the superior is a human user. The plan does not enforce this.
- The plan does not specify what happens when `DELETE /api/org/edges/:id` receives a non-UUID string as `:id`. The plan says the ID is a UUID but the Zod schema for DELETE is not shown.
- The auth middleware fallback (section 2.7) falls back to `"u-founder"` when no human user exists. This means an unseeded database with only AI users would authenticate as a nonexistent user ID. The plan acknowledges this with a `@lore` comment but does not specify the failure behavior downstream (what happens when a route tries to read user `"u-founder"` and it does not exist?).
- The plan's `resolveReviewRecipients` function (section 2.9) is a stub with "implementation details in tasks below" but the implementation is never specified. Task 10 just says "create org-routing service" without specifying the query logic. How does "match the context" work? What SQL query resolves direct vs function vs team edges? This is the core routing logic and it is underspecified.
- The stateless `authMiddleware` export (auth.ts line 102) is used in `app.ts` line 220 as a catch-all. The plan only addresses `createAuthMiddleware(db)` -- it does not mention whether the stateless export also needs updating or whether the code path that uses it (line 220) needs changes.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately scoped. The decision NOT to rename FK columns in dependent tables (Q2) is a good blast-radius reduction. The decision NOT to modify `founder-router.ts` (Q5) avoids scope creep. The single-table polymorphic org_edges design (Option A vs three-table Option B) is the right call and the design-it-twice section is genuine, not theatre.

The deprecation aliases section (end of 2.4) introduces temporary `AgentRole`/`AgentStatus` aliases, then immediately says "given the AC says 'all code references updated,' we do the full rename and skip the aliases." This is fine -- the plan resolves its own indecision. No over-engineering.

### 9. Verifiability (8/10)

Every AC has concrete verification methods (section 2b) with specific test assertions. The protected-tests list (section "Protected tests") correctly identifies 7 test files whose behavioral contracts must not drift. The new test files are named and scoped (6 new test files covering user schema, org edges, user routes, org routes, auth resolution, fallback routing).

Issues:
- AC8 verification (fallback routing) depends on `resolveReviewRecipients` which is underspecified (see Dimension 7). The test assertions name expected behaviors but the function being tested has no implementation contract beyond the stub.
- The E2E test analysis (Task 13, critical note) correctly identifies that "u-founder" as an ID continues to work. But the plan does not verify that E2E tests that exercise verdict authorization (which depends on `role === "founder"`) still pass after the identity model change. If `threads.ts` reads the user from the `users` table and checks `role === "founder"`, and the seed creates a user with `role: "founder"`, this works -- but only if the builder understands the implicit dependency.

---

## CRITICAL

1. **[Task 1, section 2.2, Risks item 2] Missing column rename in migration SQL.** The migration SQL in Task 1 does NOT include `ALTER TABLE user_skills RENAME COLUMN agent_id TO user_id`. The risks section (item 2) acknowledges this is needed and shows the SQL, but the authoritative Task 1 migration SQL omits it. The Drizzle schema (section 2.2) defines `userId: text("user_id")` which will reference a column that does not physically exist after migration. This will cause a runtime error on any query involving `user_skills`. **Fix:** Add `ALTER TABLE user_skills RENAME COLUMN agent_id TO user_id;` to both the SQLite and PG migration SQL in Task 1, immediately after the table rename line.

2. **[Section 2.8, section 2.4, threads.ts] The "founder" role is not in the USER_ROLES type.** The plan seeds the human user with `role: "founder"` but `USER_ROLES` (section 2.4) does not include "founder". Meanwhile, `threads.ts` lines 89 and 494 use `role === "founder"` for verdict authorization. The plan lists `threads.ts` only for import renames (Task 6), not for the role-based authorization logic. This creates a situation where: (a) the human user's role is outside the typed union, (b) `as UserRole` casts or type widening would be needed to store it, and (c) the authorization logic is invisible to the plan's task list. **Fix:** Either add "founder" to `USER_ROLES` in section 2.4 (and note it in the task list as a deliberate addition for human users), OR document in Task 6 that `threads.ts` verdict auth logic depends on `role === "founder"` and will continue to work because `role` is typed as `text` in the schema (not constrained to `UserRole`). The plan must make the decision explicit.

## WARNING

3. **[Section 2.9, Task 10] `resolveReviewRecipients` is underspecified.** Section 2.9 shows a stub function with "implementation details in tasks below" but Task 10 says only "create org-routing service" with a file path and a dependency note. The core query logic (how to match direct vs function vs team edges, how to union results, how to fall back to all humans) is not specified. A builder will have to invent the implementation. **Fix:** Add a pseudocode or SQL-level specification of the resolution algorithm in Task 10: (1) query org_edges WHERE mechanism="direct" AND target=context.userId, (2) query WHERE mechanism="function" AND target=context.agentRole, (3) query WHERE mechanism="team" AND target=context.teamId, (4) union the fromUserId values, (5) if empty, return all human user IDs.

4. **[Section 2.7] Stateless `authMiddleware` export not addressed.** `app.ts` line 220 uses `authMiddleware` (the stateless export without db) as a catch-all middleware. The plan only specifies changes to `createAuthMiddleware(db)`. The stateless middleware sets no `userId` on context -- downstream routes that call `c.get("userId")` get `undefined`. This is the existing behavior, but the plan should document that the stateless middleware is unchanged and explain which routes use which middleware variant. **Fix:** Add a note in Task 5 that the stateless `authMiddleware` export is NOT modified (it covers the db-less code path) and list which routes go through which middleware.

5. **[Section 2.6, PUT /api/org/edges] Mechanism-dependent target validation not specified as a contract.** The Zod schema shows `target: z.string().min(1)` but the plan narratively requires mechanism-dependent validation (direct -> valid userId, function -> valid role, team -> valid teamId). The plan should specify this validation as a Zod discriminated union or as explicit handler logic with error codes. **Fix:** Show the discriminated validation in the PUT handler specification: for each mechanism value, specify the validation check and the 400 error response when it fails.

6. **[Section 2.3] No constraint on `fromUserId` being a human user.** The concept doc says OrgChart edges define "who reviews, approves, and escalates to whom" -- these are human-user responsibilities. The plan allows any user (human or AI) as `fromUserId`. This may be intentional (AI users could theoretically be reviewers in future), but the plan does not state the decision. **Fix:** Add a sentence to section 2.3 stating whether `fromUserId` is constrained to `kind = "human"` or intentionally open, with rationale.

## SUGGESTION

7. **[Section 2.6, GET /api/org] Unspecified `users` array content.** The response shape includes `users: Array<{id, kind, name, role}>` but the plan does not specify whether this is ALL users or only users referenced in edges. For an empty org chart, the response shows `{ edges: [], users: [...] }` which implies all users are returned regardless. Clarify this in the response description.

8. **[Section 2.3, line 181] Stale reference to `AGENT_ROLES`.** The validation description says "target must be a valid role from AGENT_ROLES" but by this point in the plan the rename to `USER_ROLES` is established. Update for internal consistency.

9. **[Plan reconciliation, assumption 2] Incorrect claim about PG schema.** The plan says the PG schema "omits costActual" but `schema.pg.ts` line 35 clearly has `costActual: integer("cost_actual").default(0)`. The claim should be corrected or removed to avoid confusing the builder.

10. **[Task 13] Missing coverage of threads.ts `role === "founder"` in test updates.** The plan lists threads.ts test updates only for seed data changes, not for verdict authorization behavior that depends on the human user having `role: "founder"`. Add a note that existing thread verdict tests must verify that a user with `role: "founder"` in the `users` table still passes verdict authorization.

---

## What's Working Well

- **The interrogation phase (Q1-Q5) is excellent.** Each question identifies a real ambiguity, considers alternatives, and makes a clear decision with rationale. Q2 (not renaming FK columns) is a particularly good blast-radius decision. Q5 (not touching founder-router.ts) correctly scopes the work.

- **The migration checklist is comprehensive.** The plan enumerates every renamed symbol, every affected file, and every factorySettings key being removed. The table-format checklists (sections "Migration checklist") make it trivial for the builder to grep-verify completeness. This is the kind of plan detail that prevents "forgot to update file X" regressions.
