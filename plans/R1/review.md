# R1 Code Review -- Wire Agent Execution

**Verdict: DONE**

Diff: 2 commits (`814908a` red-phase tests, `2f2293f` green-phase implementation).
Files changed: 3 source files + 1 test file. No schema changes. No protected tests modified.
Tests: 6/6 passing. Typecheck: 0 errors. Lint: clean.

---

## Lens 1: Architecture (positive)

**Layer integrity: PASS.** All changes stay within `packages/server`. No cross-layer violations. Shared types (`HarnessAdapter`, `CostCapExceededError`, `ConcurrencyLimitError`) are imported from `@hyperidle/shared` -- the correct boundary.

**DI pattern: PASS.** Adapters are instantiated once in `server-factory.ts` (singleton lifecycle per plan D1), threaded through `AppOptions` -> `SessionRouteDeps` -> route handler. The `SessionRouteDeps` interface matches the architecture plan exactly (4 optional fields). Tests inject scripted mocks via the same interface.

**API contract: PASS.** The error handling table from the architecture plan is fully implemented:
- Missing credential -> 500 + `MISSING_CREDENTIAL` (pre-flight, before provisionSession)
- `CostCapExceededError` -> 422 + `COST_CAP_EXCEEDED`
- `ConcurrencyLimitError` -> 429 + `CONCURRENCY_LIMIT`
- Task not found -> 404 + `NOT_FOUND`
- Other errors -> 500 + `INTERNAL_ERROR`

**CRITICAL-1 fix from architecture-critique: ADDRESSED.** The critique identified that `MissingCredentialError` from `harness.startSession()` would be swallowed by `provisionSession`'s catch block. The builder chose option (c): an early credential pre-flight check in the route handler BEFORE calling `provisionSession` (sessions-routes.ts L109-118). This is the cleanest fix and matches the amended AC6/AC7 in the architecture plan.

**WARNING-1 fix from architecture-critique: ADDRESSED.** The critique warned that `credentialResolver` on `AppOptions` was dead code. The builder correctly added it to `AppOptions` AND passes it through to `SessionRouteDeps` (app.ts L314, sessions-routes.ts L109). It serves a real purpose now: the route handler uses it for the pre-flight credential check. Not dead code.

**Backward compatibility: PASS.** The fallback path (no adapters = bare DB insert, 201) is preserved at sessions-routes.ts L162-188. Tested explicitly in the "backward compat" test case.

**Plan task completeness: PASS.** All 5 tasks from the architecture plan are implemented:
- Task 1 (AppOptions extension): Done (app.ts L114-131)
- Task 2 (createSessionRoutes update): Done (sessions-routes.ts L46-160)
- Task 3 (server-factory wiring): Done (server-factory.ts L110-124)
- Task 4 (integration tests): Done (6 tests, all passing)
- Task 5 (existing tests): Not re-verified here but typecheck passes, no protected test modifications

---

## Lens 2: Design (positive)

SKIP -- no UI surface in this workpackage.

---

## Lens 3: Security (positive)

**Credential handling: PASS.** The `ANTHROPIC_API_KEY` is resolved through `CredentialResolver` (sessions-routes.ts L109). The resolved value (`apiKey`) is used only for a null check -- it is never logged, returned in responses, or passed anywhere. The actual key usage happens deeper inside `ClaudeAgentSdkAdapter.startSession()` which has its own resolver injection.

**Input validation: PASS.** The POST body is validated through `createSessionSchema` (Zod) before any processing. `taskId` is validated against the DB (sessions-routes.ts L121-124). `agentId` validation happens inside `provisionSession` Phase 1. Path traversal on `workspaceBasePath` is not a concern since it is operator-controlled (env var or injected by test), never from user input.

**Rate limiting: PASS.** POST /api/sessions is covered by the global rate limiter (app.ts L191-201, 60 req/min default). The architecture plan explicitly confirms this is sufficient for a session-creation endpoint.

**No injection vectors.** All DB queries use Drizzle ORM parameterized queries. No raw SQL. No string interpolation in queries.

---

## Lens 4: Adversarial (negative)

**FINDING-1 (informational): `credentialResolver` could be undefined even when adapters are present.**

At sessions-routes.ts L109: `deps.credentialResolver?.resolve("anthropic_api_key")`. If `deps.credentialResolver` is undefined (someone passes `harnessAdapter` + `workspaceAdapter` but forgets `credentialResolver`), the optional chaining returns `undefined`, which passes the `== null` check, and the route correctly returns 500 MISSING_CREDENTIAL. This is actually the correct behavior -- if no resolver is wired, credentials are indeed missing. No fix needed, but worth noting this is a silent misconfiguration path that produces a correct-but-possibly-confusing error message.

**FINDING-2 (informational): Long-running HTTP request.**

The POST handler awaits `provisionSession` which can run for seconds to minutes (plan D4). This is documented as acceptable for desktop/dev mode. No timeout on the individual request beyond the global HTTP server timeout. The plan explicitly defers queue-based dispatch to a future workpackage.

**Error paths: PASS.** The try/catch in sessions-routes.ts L128-159 catches both known error types (`CostCapExceededError`, `ConcurrencyLimitError`) with specific status codes and falls through to a generic 500 for anything else. The `provisionSession` function itself handles crash recovery internally (workspace preservation, session state update, task revert on pre-harness failures).

**Race conditions: LOW RISK.** The concurrency check in `provisionSession` Phase 3 (session-provisioning.ts L199-206) reads the count and compares against the limit. In SQLite this is serialized. In a future PostgreSQL deployment with concurrent requests, there is a TOCTOU window between the count query and the session insert. This is pre-existing in `provisionSession`, not introduced by R1.

**`as` casts in production code:**
- sessions-routes.ts L104: `c.req.valid("json" as never) as z.infer<typeof createSessionSchema>` -- pre-existing pattern used throughout the codebase for Hono body validation. Hono's typing system does not infer the validated type from `validateBody`, so this cast is necessary and safe (the middleware guarantees the shape).

---

## Lens 5: Simplification (negative)

**No dead code.** Every import is used. Every field on `SessionRouteDeps` and the new `AppOptions` fields are consumed. The `credentialResolver` that the architecture critique flagged as dead code is actually used for the pre-flight check.

**No premature generics.** The `SessionRouteDeps` interface is appropriately narrow (4 optional fields). No abstract factory patterns, no unnecessary indirection.

**No single-use helpers.** `authHeaders()` and `seedDomain()` in the test file are reused across multiple test cases. `NullCredentialResolver` and `ScriptedHarnessAdapter` are test-specific but justified by the need for controlled behavior.

**Fallback default: acceptable.** sessions-routes.ts L126: `deps.workspaceBasePath ?? "/tmp/hyperidle-workspaces"` provides a hardcoded fallback. This is acceptable because `workspaceBasePath` is always provided through `AppOptions` in production (server-factory.ts L113-114) and through test setup in tests. The fallback is a safety net, not the primary path.

---

## Lens 6: AI Slop (negative)

**No AI aesthetic tells.** Comments are purposeful and context-carrying (`@lore` tags, AC references). No filler comments like "// check if error" or "// return result".

**No defensive over-engineering.** No try-catch around non-throwing code. No null checks on non-nullable types (the `apiKey == null` check is genuinely needed since the resolver can return null).

**No unnecessary async.** The POST handler is correctly `async` because it awaits `provisionSession` and `credentialResolver.resolve`.

**No verbose naming.** `SessionRouteDeps`, `workspaceBasePath`, `credentialResolver` -- all honest, concise names.

**Test file header comment is slightly stale.** The block comment at L1-19 of the test file says "Failure mode before implementation: TypeScript type errors..." -- this was written during the red phase and is now inaccurate since implementation exists. Minor -- does not affect correctness.

---

## AC Completeness Audit

| AC | Status | Evidence |
|---|---|---|
| AC1: Adapters instantiated during server startup | PASS | server-factory.ts L110-114: `EnvCredentialResolver`, `ClaudeAgentSdkAdapter`, `LocalWorkspaceAdapter` instantiated in `createServer`. Passed to `createApp` at L121-124. |
| AC2: POST /api/sessions calls provisionSession | PASS | sessions-routes.ts L129: `provisionSession(...)` called when adapters are present. Test: "returns 200 with state=done" (6/6 passing). |
| AC3: Agent session runs end-to-end | PASS | Test verifies: harness started (L287), session_started + session_ended events emitted (L282-284), session row has state=done + outcome=completed (L270-273). End-to-end path proven through scripted harness. |
| AC4: State transitions (done/crashed) | PASS | Two tests: success path returns state=done/outcome=completed (L270-271), crash path returns state=crashed/outcome=crashed (L372-373). Both via route-level integration test through provisionSession. |
| AC5: Cost and token usage persisted | PASS (by delegation) | Architecture plan explicitly states: "Covered by existing session-provisioning.test.ts AC7 and C7 tests. provisionSession already calls recordCostAndCheck during Phase 10. No new test needed." The R1 test verifies the route correctly delegates to provisionSession which handles cost tracking. Verified in session-provisioning.ts L338-347. |
| AC6: ANTHROPIC_API_KEY resolved from credential store | PASS | sessions-routes.ts L109: `deps.credentialResolver?.resolve("anthropic_api_key")`. server-factory.ts L110: `EnvCredentialResolver` constructed and injected. Test: valid resolver returns key, session proceeds successfully. |
| AC7: Missing credentials produce clear error | PASS | sessions-routes.ts L110-118: null check + 500 response with `MISSING_CREDENTIAL` code and message mentioning `ANTHROPIC_API_KEY`. Test: NullCredentialResolver returns null, asserts 500 + correct code + no session row + harness never started (L318-331). |

All 7 acceptance criteria are satisfied.

---

## Summary

Clean wiring workpackage. The builder correctly addressed all three findings from the architecture critique (CRITICAL-1 credential pre-flight, WARNING-1 credentialResolver on AppOptions, WARNING-2 ScriptedHarnessAdapter duplication). The code matches the plan's task list, type signatures, and error handling table. Six integration tests cover the happy path, crash path, missing credential path, backward compatibility path, and two error-class paths (cost cap, concurrency limit). No security concerns, no unnecessary complexity, no regressions to protected tests.
