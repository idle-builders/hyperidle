# AE2 Architecture Critique -- Team Creation & Onboarding Journey

ARCHITECTURE-SCORE: 7/10 rounds=1 score-line: SA:7 LI:9 AC:7 DM:9 N:9 MD:9 FMC:7 S:8 V:6

---

## Scoring Breakdown

### 1. Spec Alignment (7/10)

All 5 ACs map to plan tasks or are explicitly marked as already-satisfied (AC-2, AC-3). No scope-creep tasks -- each task traces to an AC or a forced dependency of an AC. The plan correctly identifies AC-2 (AgentAddDialog) and AC-3 (assistant dispatcher) as already implemented.

CRITICAL: The plan's test assertions contain incorrect roster expectations that do not match `defaultRoster()` output. This means the verification method for AC-1 is wrong:
- Plan says `["development", "marketing"]` produces `builder, growth, product_manager, qa_engineer` (4 roles). Actual output: `brand_voice, builder, content, growth, qa_engineer` (5 roles). The plan includes `product_manager` which requires the "product" function (not present), and omits `brand_voice` and `content` which both have `teamFunctions: ["marketing"]`.
- Plan says no `functions` defaults to `["development", "product"]` producing `builder, product_manager` (2 roles). Actual output: `builder, product_manager, qa_engineer` (3 roles). The plan omits `qa_engineer` which has `teamFunctions: ["development"]`.

The builder writing tests from these wrong assertions will either write failing tests and have to debug the mismatch, or will end up with tests that assert the wrong thing.

### 2. Layer Integrity (9/10)

Clean. All tasks respect the three-layer boundary:
- Task 1 (shared types) is pure type extension in `packages/shared`.
- Task 2 (API handler) is `packages/server`.
- Task 3 (UI) is `packages/web`.
- Task 4 (auto-open) is `packages/web`.
- Task 5 (welcome message) is `packages/server`.
- Task 6 (E2E) is `packages/web/e2e`.

No cross-layer violations. The frontend sends `functions` to the API; the API calls `defaultRoster()` from `@hyperidle/shared`. The shared package is correctly used as the bridge.

### 3. API Contracts (7/10)

The plan specifies the extended request body shape (name, repoPath, functions, buildingContext, userId) and unchanged response shape. Error shapes are implied ("validation_error" code pattern) but not explicitly specified for new validation cases.

WARNING: The plan adds `userId` to the POST `/api/teams` request body but does not add it to the `CreateTeamRequest` type definition in the "Type signatures" section. The type signature section shows `functions?: string[]` and `buildingContext?: string` but no `userId?: string`. Yet Task 5 and the API endpoint section both reference it. This is an inconsistency in the plan's own contracts.

WARNING: The plan does not specify what happens when `functions` contains no valid catalog entries (e.g., `functions: ["nonexistent"]`). `defaultRoster()` would return an empty array. Should the API return 400 (no agents to create), or proceed with zero agents? The plan's security section says "unknown function strings are allowed" and "harmless no-ops" but does not address the edge case where ALL functions are unknown, resulting in a team with zero agents.

### 4. Data Model Alignment (9/10)

No migration needed -- confirmed via codebase check. The `teams.functions` column exists at `schema.ts:32` as `text("functions")`, which stores JSON-stringified arrays. The plan correctly identifies this as JSON text storage requiring `JSON.stringify()` on write.

The plan correctly uses `teamMembers.id` (not `teams.id`) for the `users.teamId` FK, consistent with the concept doc's contract.

The `soulPrompt` and `agentCategory` columns exist in the schema. The plan correctly uses them.

### 5. Naming (9/10)

Names are honest and consistent:
- `FunctionPreset` for the frontend preset definition -- clear.
- `FUNCTION_PRESETS` as the constant name -- follows SCREAMING_SNAKE_CASE convention.
- `buildingContext` for the "What are you building?" text -- descriptive.
- `selectedPreset` / `customFunctions` for UI state -- unambiguous.

No conflicts with existing closed vocabularies. No generic names.

### 6. Module Depth (9/10)

The plan keeps the surface minimal:
- One type extension (additive, no new exports).
- One handler rewrite (same endpoint, same response shape).
- One component extension (same file, new form sections).
- One `useEffect` addition (4 lines in AppShell).
- No new services, no new modules, no new abstractions.

The preset definitions are correctly scoped as page-level constants in SetupFlow, not exported. `defaultRoster()` is reused from shared, not re-implemented.

### 7. Failure-Mode Coverage (7/10)

The security block is thorough: rate-limiting (existing), input-trust for functions (max length 20, each max 100 chars), input-trust for buildingContext (max 2000 chars), path traversal (existing), userId validation (FK constraint), SSRF (N/A), secret handling (unchanged).

WARNING: The plan does not address what happens if the assistant thread creation fails during welcome message seeding (Task 5). The welcome message is seeded at the end of POST `/api/teams`. If the thread INSERT or message INSERT fails (e.g., duplicate threadId race, FK constraint), does the entire team creation fail and roll back? Or is the welcome message best-effort? The plan says to insert directly into messages and threads tables, but the existing POST `/api/teams` handler does not use a transaction. A failure in welcome message seeding would leave a created team with agents but no welcome message -- which is acceptable, but the plan should state this explicitly.

SUGGESTION: Risk 3 about the event bus is well-analyzed but the plan chose option (b) -- setting `pinned: true` directly. This is simpler but creates a divergence from how thread pinning normally works (via event-driven dispatcher). If the pinning mechanism changes in the future, this direct-set will be orphaned. The plan acknowledges this tradeoff, which is fine.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is lean. No feature flags, no abstract base classes, no plugin points. The backward compatibility default (`["development", "product"]` when no functions provided) is the only shim, and it serves a real caller (the existing POST `/api/teams` endpoint used by tests and potentially other consumers).

The `buildingContext` field is added to the type but its only use is inclusion in the welcome message text. This is proportionate -- no new table column, no separate storage, just threaded through to the message body.

No over-engineering detected.

### 9. Verifiability (6/10)

CRITICAL: Three of the four integration test assertions in Task 2 are factually wrong (see Dimension 1). The builder writing tests from these will produce either:
- Tests that fail because they assert the wrong roster, requiring debugging time.
- Tests that the builder "fixes" by weakening the assertion, losing coverage.

WARNING: The protected-tests list names `teams-routes.integration.test.ts` and `SetupFlow.test.tsx`, which is correct. However, the plan does not name `U2-api-teams-bets.integration.test.ts` which also tests POST `/api/teams` (line 77-90). While this test is simple enough to survive the change (it only checks status 201 and team ID prefix), it should be listed as a protected test for completeness.

WARNING: The E2E test (Task 6) verifies the assistant overlay opens but does not verify the welcome message content is visible. It says "Verify assistant overlay opens (dialog with 'Assistant' title visible)" but not "Verify welcome message text is present." This means AC-4 ("guided to a first meaningful action through conversation") has weak E2E verification -- the integration test covers message existence but the E2E doesn't verify the user actually sees it.

The plan does not specify a test for the "Custom" preset path in the SetupFlow component test. Task 3 lists "Clicking 'Custom' reveals individual function chips" and "Toggling chips updates roster preview text" as test assertions, which is good, but the plan does not specify what happens when the user selects Custom with zero chips selected (submit should be disabled) -- this edge case is described in the design but not in the test list.

---

## Findings

### CRITICAL

1. **[plan SS Task 2, test assertions] Roster expectations are wrong for 3 of 4 test cases.** The plan says `functions: ["development", "marketing"]` yields `builder, growth, product_manager, qa_engineer`. The actual `defaultRoster()` output is `brand_voice, builder, content, growth, qa_engineer`. The plan says the default (no functions = `["development", "product"]`) yields `builder, product_manager`. The actual output is `builder, product_manager, qa_engineer`. The builder must use the real `defaultRoster()` function to derive expected values, not the plan's tables. Fix: correct the assertions in the plan or instruct the builder to derive expectations from `defaultRoster()` directly.

### WARNING

2. **[plan SS Type signatures] `userId` missing from `CreateTeamRequest` type.** The type signature section defines `functions?: string[]` and `buildingContext?: string` but omits `userId?: string`. Task 5 and the API endpoint section both reference `userId` in the request body. This inconsistency will cause the builder to either add it to the type (correct) or pass it untyped (wrong). Fix: add `userId?: string` to the `CreateTeamRequest` interface in the plan's type signatures section.

3. **[plan SS Task 2] Backward compatibility claim is misleading.** The plan says "no functions = default to ['development', 'product']" implying the behavior is unchanged. But the existing handler creates 2 agents (builder + PM); `defaultRoster(["development", "product"])` creates 3 agents (builder, product_manager, qa_engineer). The qa_engineer is new. This is a behavioral change. The protected test at U2 line 77-90 will still pass (it only checks status + ID prefix), but any code relying on exactly 2 agents being created will break. Fix: document this as a known behavioral change, not backward compatibility.

4. **[plan SS Task 5] Welcome message seeding error handling unspecified.** If the thread or message INSERT fails after agents are already created, is this a rollback or best-effort? The plan should state explicitly that welcome message seeding is best-effort -- a failure should not prevent team creation from succeeding. The existing handler does not use a transaction.

5. **[plan SS Task 5] Zero-agent edge case not addressed.** If `functions: ["nonexistent"]` is passed, `defaultRoster()` returns `[]`. The welcome message would say "Your team is set up with 0 agents:" which is a poor user experience. The plan should specify validation: reject the request if `defaultRoster()` returns an empty array, or fall back to the default functions.

6. **[plan SS Protected tests] `U2-api-teams-bets.integration.test.ts` not listed.** This file tests POST `/api/teams` at line 77-90 and should be listed as a protected test.

### SUGGESTION

7. **[plan SS Task 6] E2E test should verify welcome message visibility.** The current E2E spec verifies the overlay opens but not that the welcome message content appears. Adding an assertion like `expect(page.getByText(/Your team is set up/)).toBeVisible()` would strengthen AC-4 verification.

8. **[plan SS Task 3, test list] Add test for Custom with zero chips selected.** The design specifies that submit is disabled when Custom is selected with no chips toggled. The plan's test list for Task 3 does not include this edge case. It should.

---

## What is Working Well

1. **The plan reconciliation table is excellent.** Every assumption is checked against the codebase with file:line references. This prevents the most common architecture-critique failure mode (CC-007: spec/codebase drift). The plan caught that the SetupFlow does not capture user ID, that the CocOverlay has different naming than expected, and that the teams.functions column already exists.

2. **Risk 3 analysis is thorough.** The plan traces the welcome message insertion through the event bus and assistant dispatcher, identifies that `shouldDispatchForAssistant()` prevents unwanted session provisioning, and correctly predicts the net effect (thread pinned, no session). This kind of second-order effect analysis prevents surprises during implementation.

---

## Verdict

Score 7/10 -- passes the >= 7 threshold. The CRITICAL finding on incorrect roster expectations is a documentation error that would cost the builder debugging time but would not produce incorrect code (the builder would discover the mismatch when tests fail against `defaultRoster()`). The WARNING on missing `userId` in the type signature is a plan inconsistency that needs to be communicated to the builder. The other warnings are edge cases and completeness items that should be addressed during implementation.

The plan is sound in structure and proportionate in scope. The task ordering is correct. The security analysis is adequate. The main risk is that the builder trusts the plan's roster tables instead of deriving expectations from `defaultRoster()` directly.
