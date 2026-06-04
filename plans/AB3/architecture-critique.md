# AB3 -- Agent Setup Wizard: Architecture Critique

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:8 LI:9 AC:8 DM:9 N:8 MD:8 FMC:7 S:8 V:8

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Spec alignment | 8 | All 6 ACs from the spec map to plan tasks and verification methods. Plan ACs 1-11 expand the spec's 6 ACs into testable units -- good. No scope creep: all tasks trace back to ACs or direct dependencies. One gap: AC-4b (Custom role leaves soul prompt empty) is tested but the "custom" role mapping to a real USER_ROLES value is deferred to an implementation note rather than being a first-class AC with its own verification. |
| Layer integrity | 9 | Clean separation. All UI code stays in `packages/web`. All API contracts use existing `packages/server` routes. No new server code needed. The wizard fetches via `apiFetch` (the standard boundary). No cross-package private imports. The `AgentConfig` type import from `settings-types.ts` stays within `packages/web`. |
| API contracts | 8 | All 4 API endpoints are documented with HTTP method, path, request/response shapes, and status codes. The `POST /api/agents` body shape is specified with all fields. The `GET /api/workers` response shape references `AdapterInfo[]` with field list. One weakness: the plan says `AdapterInfo` has `id, name, kind, type, currentLoad, maxConcurrent, paused` but the actual `AdapterInfo` also has `modelProviders` and `connectedSince` -- these are unused by the wizard but the plan should not claim an exhaustive field list that isn't exhaustive, or should note "relevant fields" explicitly. |
| Data model | 9 | No schema changes required. The plan correctly identifies: `users.teamId` FK references `team_members.id`, `createAgentSchema` already accepts all needed fields, no new tables or columns. The reconciliation table is thorough -- every spec assumption verified against reality. |
| Naming | 8 | `AgentSetupDialog` is honest and descriptive. `WizardStep`, `WizardState`, `RolePreset`, `HarnessOption`, `TierValidation` are clear local types. `teamMembersId` prop name disambiguates from `team.id`. No generic names. One concern: `ROLE_PRESETS` contains `id: "custom"` which is not a valid `UserRole` -- the type says `id: string` but the plan notes this requires mapping. The naming of `id` as `string` rather than `UserRole | "custom"` loses type safety. |
| Module depth | 8 | Single new component (`AgentSetupDialog`) with a small public interface (5 props). Internal state is complex (WizardState with 12+ fields) but hidden behind the simple prop contract. The dialog manages its own data fetching (design-it-twice Option A selected, with good justification). No leaking of internal wizard state to the parent. |
| Failure-mode coverage | 7 | Three risks documented with mitigations (empty workers, template fetch fail, race condition on role changes). Security table covers 7 STRIDE vectors, all N/A with reasoning. Missing: (1) what happens if `POST /api/agents` returns 400 (validation error from server) -- the plan says error state but doesn't specify the UI treatment; (2) what happens if `GET /api/model-gateway` fails entirely (network error, 500) -- the plan only covers "tier unconfigured", not "gateway unreachable"; (3) no timeout specified for any fetch (template, workers, gateway). |
| Simplicity | 8 | No over-engineering. No feature flags, no abstract base classes, no plugin points. The design-it-twice on dialog lifecycle is genuine (Option A: dialog fetches own data vs Option B: parent pre-fetches). The rejection of Option B is well-reasoned. Local types instead of exported shared types. One minor concern: the `WizardState` interface has 12 fields including 3 loading booleans and 3 data fields for parallel fetches -- this could be simplified with a single `fetchStatus` discriminated union, but the flat approach is pragmatically fine for a local component. |
| Verifiability | 8 | All 11 ACs have concrete test structures with assertion names. The test file structure shows `describe/it` blocks with descriptive names. Protected tests correctly lists `WorkProduct.test.tsx`. The task ordering is correct: Task 1 (component) before Task 2 (integration) before Task 3 (tests). However, the plan's task ordering violates the "failing-test-first" principle -- Task 3 (tests) comes AFTER Task 1 (component) and Task 2 (integration). In TDD, tests should be Task 1. |

**Average: 8.1 -- PASS (>=7)**

## CRITICAL

(None)

## WARNING

- [plan, Implementation notes §3] The "Custom" role mapping is under-specified as a plan contract. The note says the Custom card "should include a role sub-select (builder | growth | brand_voice)" but this is buried in implementation notes, not formalized as an AC or verified by a test. The `ROLE_PRESETS` type uses `id: string` which allows `"custom"` to pass type checking, but `POST /api/agents` uses `z.enum(USER_ROLES)` which will reject `"custom"` as invalid. If the builder sends `role: "custom"`, the server returns 400. This needs either: (a) a dedicated AC "when Custom is selected, a sub-role select appears and the chosen sub-role is sent to the API", or (b) explicit plan guidance that the Custom card defaults to role `"builder"` with no sub-select.

- [plan, Ordered task list] Task ordering violates TDD. The plan orders: Task 1 (build component) -> Task 2 (integrate) -> Task 3 (write tests) -> Task 4 (write stories). The project's "First Principle: Validation Before Implementation" requires tests before implementation. The builder agent will need to reorder to: write tests (red) -> build component (green) -> integrate -> stories. The plan should document this ordering explicitly so the builder doesn't follow the listed sequence literally.

- [plan, AC-2 / Migrations §1] The plan says existing text is "Roster not configured" (line 303-304 of WorkTeam.tsx) but the actual text in WorkTeam.tsx is: `title="Roster not configured"` and `description="No agents are assigned to this team."`. The plan's migration section correctly identifies the text to change, but AC-2's verification test asserts `title="No agents on this team"` without noting that the existing test file (`WorkProduct.test.tsx`) should be checked for assertions on the old text. I verified: no existing test asserts "Roster not configured" directly. However, the plan should still note this explicitly in the protected-tests analysis rather than leaving it to the builder to discover.

## SUGGESTION

- [plan, Type signatures] `ROLE_PRESETS` types `id` as `string`. A more precise type would be `id: UserRole | "custom"` with a type guard or discriminated union to enforce that the "custom" id never reaches the API boundary. This catches the mapping bug at compile time rather than at runtime.

- [plan, Type signatures] The `HarnessOption` type uses `type: string` for the adapter type. Since the wizard filters out paused adapters, the type could note that `type` corresponds to `AdapterInfo.type` which is `string | undefined`. The plan should specify what to show when `type` is `undefined`.

- [plan, AC-6] The plan's reconciliation table says `GET /api/workers` returns `AdapterInfo[]` with fields `id, name, kind, type, currentLoad, maxConcurrent, paused`. The actual `AdapterInfo` interface also includes `modelProviders: readonly string[]` and `connectedSince: string`. The field list should either be exhaustive or prefixed with "relevant fields:" to avoid implying completeness.

- [plan, Risks §1] The plan says "The wizard always registers the builtin adapter" but this is about `createDefaultAdapterPool()` on the server, not about `GET /api/workers`. The workers endpoint returns whatever the pool currently has. If the server just started and `createDefaultAdapterPool()` hasn't run yet, the list could be empty. The mitigation is correct (UI handles empty defensively) but the claim that "in practice, the list is never empty" is slightly misleading.

- [plan, Design-it-twice] The design-it-twice section covers dialog data fetching (dialog-managed vs parent-pre-fetched). This is a genuine decision. However, a second non-trivial decision exists that could benefit from design-it-twice: the wizard state management approach (flat useState fields vs useReducer). For 12+ state fields with inter-dependent transitions (step changes reset some fields, role changes trigger fetches), useReducer would centralize state transitions. The plan's flat approach works but the decision isn't documented.

## What's Working Well

- **Plan reconciliation table is exemplary.** Every spec assumption is verified against reality with a file reference and resolution. This is the pattern all architecture plans should follow. The fact that zero spec/reality gaps were found means the interrogation phase was thorough.

- **Security analysis is proportionate.** Seven STRIDE vectors examined, all correctly marked N/A with specific reasoning. No security theatre (no unnecessary rate-limiting discussion for GET endpoints, no SSRF analysis where there are no outbound URLs). The analysis notes the existing controls (`z.string().max(50_000)`, global rate limiter) rather than proposing new ones.

## Verdict

The plan is structurally sound, well-grounded in codebase reality, and covers all ACs. The main risk is the under-specified "Custom" role mapping, which could cause a 400 error at the API boundary if the builder sends `role: "custom"`. This should be addressed by the builder as a first-class concern, not discovered during testing.

**Status: PASS -- plan advances to build phase.**
