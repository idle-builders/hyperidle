# AV1 — Code Review (Phase 4)

Reviewed live diff `origin/main...HEAD` against `.pipeline/plans/AV1.md` + `plans/AV1/{architecture,dod,requirements}.md` + design/approved.md (Rev-2, founder-approved Round 3). Ran db:generate, typecheck, lint, and the AV1 unit + integration tests.

## Green-state verification (ran myself)
- `npm run db:generate` → "No schema changes, nothing to migrate" — migration in sync with schema.ts, no new diff.
- `npm run check` → PASS (12/12 packages).
- `npm run lint` → exit 0 (502 warnings / 164 infos are pre-existing baseline; honest-harness-guard + test-naming-guard clean).
- AV1 unit + component tests: 26/26 pass (derive-primary-harness, team-default-harness, inspect-local-path, setup-flow-harness-picker).
- AV1 integration tests: 12/12 pass (team-harness-default-propagation, filesystem-path-inspection, team-agent-health-idle-invariant).

---

## Findings

### CRITICAL

**C1 — AC4a "Assistant opens READY" has NO runtime proof + NO sanity-break.** dod AC4a mandates an integration test (`AV1-assistant-ready.integration.test.ts`) that runs the onboarding sequence, fires the Assistant's FIRST TURN, asserts NO `missing_key`/`missing_harness` notice is persisted, and includes a REQUIRED sanity-break (clear the stub's harnessType → a `missing_harness` notice IS persisted). This file does not exist anywhere in the diff (`rg` across `packages/**` finds no AV1 test firing `runAssistantTurn` / asserting `payload.notice`). What ships instead is `team-harness-default-propagation.integration.test.ts:148-191`, which only asserts the stub *row* carries `harnessType:"claude-code"` — a DB-state check, not the turn behavior. The founder's headline deliverable (the notice-card burst is gone because the turn no longer fails on misconfiguration) is therefore UNPROVEN. A regression that reintroduced the burst (e.g. the turn resolving harness/key differently) would keep every AV1 test green. The stub-carries-harness assertion also has no sanity-break, so it cannot catch a silently-trivial pass. This is the exact class of gap CLAUDE.md's proof rule and the mock-validation-trap memory warn against. Fix: add the AC4a integration test with the mandated missing_harness sanity-break (builtin-only path → `requireHarness("builtin")`, register in `BUILTIN_ONLY_INTEGRATION` per testing.md — `runAssistantTurn` is a builtin-only path).

### WARNING

**W1 — AC3 client-side degrade logic (`isCode` → code vs doc_set) is unproven; the integration test hand-crafts the register body.** `filesystem-path-inspection.integration.test.ts:188-235` ("empty-branch git repo → doc_set, never 400") posts a hand-written `{kind:"doc_set", writeback:"none"}` body directly. The route already accepted that body before AV1 — so the test proves the ROUTE, not SetupFlow's decision. The actual AV1 code lives in `SetupFlow.tsx:388-394` (`const isCode = info?.isGitRepo === true && branch != null && branch !== ""`) and chooses `code`+branch vs `doc_set`. Reverting that branch selection (e.g. always sending `code` with a null branch → the 400 the fix exists to prevent) would NOT turn any test red. The inspect-path ROUTE itself is honestly tested with real git (committed→"main", no-commit→null, non-git→null at :38-130), so the branch-detection half is proven; the degrade-decision half is not. Fix: assert SetupFlow's submit path (with a mocked inspect-path response returning isGitRepo:true/branch:null) sends `kind:"doc_set"` — or a full onboarding integration that drives the client register through the real no-commit repo.

**W2 — dod AC3 claims a `git-export-runner` unit for `currentBranch()` (committed→branch; no-commit→null) that does not exist as an isolated unit.** The only added fake-runner stubs return `null` (`git-export.integration.test.ts:183`, `git-export.routes.integration.test.ts:154`, `inspect-local-path.test.ts:47`). The REAL `createGitRunner().currentBranch()` (git-export-runner.ts:546) is exercised only transitively through `filesystem-path-inspection.integration.test.ts` (real git via inspect-path). That transitive coverage is genuine and adequate for the behavior, so this is a documentation-vs-code drift, not a coverage hole — but the dod overstates the isolated coverage. Downgrade the dod claim or add the direct unit.

### NOTE

**N1 — Typo `isChooosable` (triple-o).** `SetupFlow.tsx:91,501`. Cosmetic slop; harmless but should be `isChoosable`.

**N2 — Unrelated scope creep in `require-harness.ts`.** The diff renames `_SupportedHarness`→`SupportedHarness` etc. (strips `_` prefixes) in `packages/server/src/harness/__tests__/require-harness.ts` — an AR7 test-harness file with zero relation to AV1. Not harmful (typecheck green) but pollutes the AV1 diff. Revert or move to its own change.

**N3 — Assistant stub resolver is slightly convoluted but correct.** `teams-routes.ts:543-550` builds a synthetic `TeamDefaultCols` object from `primaryHarness` just to pass it back through `resolveTeamAgentHarness(primaryHarness, {...primaryHarness})`. Since `explicit` always wins, the team-cols argument is dead when primaryHarness is present and `{null,null,null}` when absent → `stubHarness` is always just `primaryHarness` (or undefined). The `?? "builtin"/"claude-sonnet-4-6"/"anthropic"` inline fallback at :565-567 is what does the real work and is byte-identical to scaffold-agents.ts:112-114 (verified — single fallback source honored). Works correctly; could be simplified to `const stubHarness = primaryHarness;`. Slop, not a bug.

**N4 — `derivePrimaryHarness` earns its place.** Not over-abstraction: called from SetupFlow, unit-tested (5 cases incl. the load-bearing `.selectable` filter that excludes inheritedFromGateway models), single clear responsibility. Keep.

---

## Contract verification (positive)

- **Migration integrity (task 1): PASS.** 0042 SQL = 3 additive nullable `ADD COLUMN` (`default_harness_type`/`default_model_id`/`default_model_provider`), all `text` (nullable). `_journal.json` timestamp `1785200000000` is NOT corrupt — it follows the project's established synthetic-round-number convention used by every migration from 0004 onward (0040=…5000000000, 0041=…5100000000, 0042=…5200000000), strictly monotonic, correct ordering. db:generate produces no new diff → schema.ts and migration in sync. snapshot chain intact (check passes).
- **Primary harness consumed at all 3 paths (task 3): PASS.** `resolveTeamAgentHarness` called at scaffold (via persisted write + explicit pass), add-agent-later (teams-routes.ts:697, passing the real `team` row fetched at :666 which carries the new columns), and assistant stub (:543). propagation integration test proves add-agent-later inherits `claude-code` not builtin, and unset→builtin at both scaffold and add-agent. Fallback literals single-sourced (scaffold-agents:112-114) except the disclosed assistant-stub inline (identical).
- **Assistant stub gets harness + key-before-nav (task 2 a,b): PASS in code.** Stub UPDATE/insert sets harnessType from resolver (teams-routes.ts:562-583). SetupFlow awaits the credentials PUT before `navigate()` (SetupFlow.tsx:333-342 then :393); picker test asserts credIndex>teamsIndex and nav→`/work?onboarding=true`.
- **AE2 tests KEPT (task 2c): PASS.** `AE2-onboarding-autoopen.test.tsx` + `AE2-SetupFlow.test.tsx` present and untouched by AV1 (no diff). No auto-open deletion.
- **Git/filesystem path (task 4): PASS.** `currentBranch()` added to `GitRunner` interface + `createGitRunner` (real `git rev-parse --abbrev-ref HEAD`, null on HEAD/empty/failure) + `createFakeGitRunner`. No parallel git-spawn path — reuses the audited `run()`/redaction surface. `inspect-path` route + register use literal `writeback:"none"` (never WRITEBACK_MODES[0]). No-resolvable-branch → doc_set (never 400) — the route/inspect half is proven with real no-commit git (see W1 for the client-decision gap).
- **Greyed picker (task 5): PASS.** SetupFlow renders every descriptor; non-installed rows greyed (`aria-disabled`, opacity-60, install-hint from authAction), not omitted; builtin default-selected; choosability gated on `discovery.state==="ready"`. Component test asserts all of this (6 AC1 cases + graceful-degrade + omit-primaryHarness-on-builtin).
- **AC completeness:** AC1 ✔ AC2 ✔ AC3 ✔ (route half; client-decision half = W1) AC4 ✖ 4a runtime proof missing (C1) / 4b ✔ AC5 ✔ AC6 ✔ (invariant + crashed-session sanity-break honest).
- **Security:** additive nullable columns, no new trust boundary. inspect-path route is read-only, boundary-guarded (`public-data`), body-limited, zod-validated. No secrets logged. writeback:"none" avoids unintended push-back. No injection surface introduced (path passed to createGitRunner's audited redaction/env-allowlist path). Clean.

---

## VERDICT: NOT DONE

Must fix before ship:
- **C1** — add the AC4a assistant-opens-ready integration test (fires the first turn; asserts no missing_key/missing_harness notice; REQUIRED missing_harness sanity-break). This is the founder's headline; it currently has zero runtime proof.

Should fix:
- **W1** — prove SetupFlow's code-vs-doc_set degrade decision (not just the route accepting a hand-written doc_set body).
- **W2** — reconcile the dod's isolated-currentBranch-unit claim with reality (or add the unit).

Nits (optional): N1 typo, N2 unrelated require-harness rename, N3 stub-resolver simplification.
