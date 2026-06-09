## Architecture Critique: AE3

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:7 DM:8 N:9 MD:9 FMC:7 S:9 V:8

### CRITICAL

None.

### WARNING

- [plan "Implementation details: create_team handler" step 3] The plan says `functions: JSON.stringify(functions)` — the `teams.functions` column is `text("functions")` (nullable, no NOT NULL). This is correct storage-wise (JSON string in a text column), but the plan does not specify what happens when the LLM passes an empty array. The Zod schema requires `.min(1)` so this is guarded at input, but the plan should explicitly note that the column is nullable in the schema while the tool always writes a non-null value. Minor: the existing POST /teams route does NOT write `functions` at all (it is not included in its `db.insert(teams).values(...)` call at teams-routes.ts:332-338). The plan's reconciliation table says the column "exists" — true — but does not note that no existing code writes to it. The tool will be the first writer. Not a blocker, but the builder should be aware.

- [plan "Implementation details: create_routine handler" step 4] The plan says `parseCron(JSON.parse(triggerConfig).cron)` but does not specify error handling for `JSON.parse` failure. The Zod schema accepts `triggerConfig: z.string().min(1)` — it does not validate that the string is valid JSON. The routines-routes.ts:150-161 explicitly handles the JSON parse failure as a separate error case. The tool must do the same. The plan's pseudocode conflates parse + validate into one step without specifying the `JSON.parse` try-catch. The builder will likely get this right by following the route pattern, but the plan should specify both failure modes: (1) invalid JSON, (2) valid JSON but invalid/missing cron.

- [plan "Security and abuse cases: Cross-team privilege escalation"] The plan says "No cross-team restriction needed; the authorization boundary is 'only individual-category agents can use management tools.'" This is architecturally correct for the founder-operator model, but the plan does not address what happens when the `create_bet` or `create_routine` tool is called with a `teamId` belonging to a team the Assistant is not associated with. Today there is only one Assistant, so this is moot. But the plan should at minimum note this as a known open scope item for multi-tenant scenarios, rather than asserting "no restriction needed" without qualification. The spec says "personal-category agents" which implies factory-wide scope, but future multi-workspace support could invalidate this assumption.

### SUGGESTION

- [plan "Type signatures: create_routine"] The `triggerConfig` field is typed as `z.string().min(1)` but semantically it is always JSON with a `cron` field. Consider defining this as `z.object({ cron: z.string().min(1) })` at the Zod level, which eliminates the need for runtime JSON.parse and moves the structural contract into the type system. The routines-routes.ts accepts a raw string because it was written before the tool-use pattern existed, but the tool has the opportunity to do better. Trade-off: the LLM would need to pass `{ cron: "0 9 * * 1-5" }` as a nested object rather than a JSON string, which is actually more natural for tool-use.

- [plan "Implementation details: create_team handler" step 7] Setting `leadAgentId` to "the first agent (product_manager if present, else first by sort order)" is reasonable, but the plan does not specify what `leadAgentId` means operationally or who consumes it. If it is purely cosmetic (used in the team list UI), this is fine. If it gates any behavior (e.g., who receives escalations), the plan should document the downstream consumers.

- [plan "Task ordering"] Tasks 4 and 5 (role-authorization test and test-count updates) are listed as separate tasks, but they modify the same file (`tool-registry-role.integration.test.ts`). Merging them into Task 3 or consolidating into a single "update existing tests" task would reduce context-switching for the builder.

- [plan "AC-6: Audit trail"] The plan correctly identifies that the existing harness covers audit. However, the verification method says "No new test needed" and then "Static verification: confirm the 5 new tools are registered in ALL_TOOL_DEFINITIONS." This static check is already covered by Task 5 (updating tool-schemas.integration.test.ts with the new tool names). The plan should explicitly cross-reference: "AC-6 is verified by the updated tool-schemas.integration.test.ts assertion in Task 5."

### What's Working Well

- The Phase 0 interrogation is genuinely useful. All three questions address real architectural decisions (role filtering mechanism, audit trail reuse, confirmation message pattern) with well-reasoned conclusions. The decision to reuse existing `tool_call_recorded` events rather than inventing a new audit mechanism is the right call.

- The plan reconciliation table is thorough — it catches the critical gap that `team-management.ts:createTeam()` only creates the teamMembers row, not the teams row, and correctly decides to inline the full creation logic rather than trying to use a partial service function. The design-it-twice section on Option A vs Option B is honest, not theatre: Option B is rejected with a concrete forward-looking argument (the route is legacy, AE2 will change it).

- Protected tests are explicitly enumerated with line-number references for the exact assertions that must change. This is the strongest protected-tests section I have seen in this codebase.
