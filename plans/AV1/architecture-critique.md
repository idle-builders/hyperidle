# AV1 — Architecture Critique (reviewer, independent)

Verified against real code in the worktree. All file:line anchors below were confirmed by reading the cited file, not trusting the plan.

---

## a) Refine-critique — "primary harness" noun

**Coherent and correctly pinned.** Verified against the landed seam:
- `CreateTeamRequest.primaryHarness: PrimaryHarnessConfig{harnessType,modelId,modelProvider}` — real at `packages/shared/src/team.ts:123-127,143`. ✔
- `POST /api/teams` destructures `primaryHarness` from the body and threads it into `persistScaffoldedAgents(db, teamMembersId, specs, primaryHarness)` — real at `teams-routes.ts:372,444-449`. ✔
- Fallback `builtin`/`claude-sonnet-4-6`/`anthropic` applied per-agent — real at `scaffold-agents.ts:112-114`. ✔
- Add-agent path calls `persistScaffoldedAgents(db, memberGroup.id, specs)` with **no** primary harness — real at `teams-routes.ts:663`. ✔ Confirms the "setup-time stamp, not inherited by later agents" framing is faithful to the code.
- No `teams.primaryHarness` column exists; only per-agent `users.harnessType`. Plan's ISN'T list is accurate.

DOC-CLASS=incremental is right: no schema change, no new primitive, reuses a landed request field.

**NOTE.** The guide-draft paragraph is accurate but does not tell the user the choice is one-time (later agents silently revert to builtin). That is a product-truth the first-run user can't see. Not a blocker for AV1 (matches the pinned ISN'T), but flag it for the human concept review — a user who picks "Codex" at setup and later adds an agent will get a builtin agent with no explanation. The plan already lists this under open questions, so this is a NOTE, not a finding to fix.

**Refine verdict: PASS.**

---

## b) Design-critique — single-variant SetupFlow extension

**Genuinely extracts, does not invent.** Verified the reuse anchors are real:
- SetupFlow card shell / field-group rhythm — real at `SetupFlow.tsx:221-426`, `mb-[18px]` groups confirmed. ✔
- Existing project-folder input + browse button — real at `SetupFlow.tsx:281-334`, gated on `window.__HYPERIDLE__?.shell?.selectFolder`. ✔
- `handleFolderPick` via `window.__HYPERIDLE__?.shell.selectFolder()` — real at `SetupFlow.tsx:136-139`. ✔
- SettingsHarnesses fetches `GET /api/harnesses` → `HarnessCapabilityDescriptor[]` via `apiFetch` — real at `SettingsHarnesses.tsx:54-56`. The picker reuses this exact source. ✔

DESIGN-CLASS=routine is defensible: two field groups inlined into an existing form, reusing two established row patterns. No new component family.

**WARNING — zero-harnesses / builtin-unauthenticated state under-specified.** The design says "populated only" and defers empty/error to build, which is the standing rule. But AC5 (graceful degrade) and the *most common real first-run state* collide here: on a fresh machine `probeBuiltinGateway` returns `state:"unauthenticated"` until the key is entered (`harness-discovery.ts:329-381`), and every CLI harness returns `state:"missing"`. So the *default real first-run render* is "builtin row only, and it's unauthenticated." The design names built-in as "always present and default-selected" but never says how an `unauthenticated`/`missing` builtin row reads, nor whether the just-entered API key (collected in the same form, not yet persisted) flips it to ready in the UI. This is not a loading/error variant — it is the populated default state for a brand-new user, and the "populated only" rule does not excuse it. The builder will hit this on line one. Pin the builtin-row copy for the unauthenticated case before build, or explicitly state the row is always selectable regardless of discovery state.

**NOTE.** Design says missing/unavailable descriptors are "shown greyed or omitted" — pick one. "Greyed or omitted" is two different components; leaving it open invites the builder to guess. Given AV2 owns the Settings harness-list redesign, omitting non-installed harnesses from the *picker* is the simpler consolidation.

**Design verdict: PASS with one WARNING to resolve at build.**

---

## c) Architecture-critique

### C1 — Server-side git probe (the riskiest call)

**Placement (server, not desktop bridge): SOUND.** The justification holds against real code:
- `discoverLocalHarnesses` genuinely runs server-side execFile of local CLIs (`harness-discovery.ts:99-126,645-683`) and is the sanctioned "inspect the user's machine at onboarding" pattern. Git detection is the same shape. ✔
- In desktop-local mode the server is co-located with the disk, so `git rev-parse` sees the folder. The reasoning that a local-path code filesystem is only usable when server==machine is consistent with `isLocalRepoPath` + `GitWorktreeAdapter` selection (`mounter-registry.ts:57-109`). ✔

**CRITICAL — do NOT hand-roll `inspectLocalPath` from scratch; a git runner already exists and must be surveyed first (Track AV frame: "consolidate, do not invent").** `createGitRunner(repoPath)` (`packages/fabric/src/services/git-export-runner.ts:312`) already implements the exact primitives this WP needs:
- `revParseIsInsideWorkTree(): Promise<boolean>` (`:383`) — the is-git-repo check the plan re-derives.
- `rev-parse --verify HEAD` via the `diffCached` path (`:374`).
- Injected-runner/spawn pattern with redaction, timeouts, and test substitution already built.
It is already wired server-side as `gitRunnerFactory` in `server-factory.ts`. The one thing it lacks is a `currentBranch()` / `git rev-parse --abbrev-ref HEAD` method. The correct, frame-honoring move is to **add one `currentBranch()` method to the existing `GitRunner` interface** (or read branch via the runner) and have the onboarding probe call `createGitRunner(path)` — NOT to author a parallel `inspect-local-path.ts` with its own execFile pattern. The plan's architecture.md never mentions `GitRunner` / `createGitRunner` exists. Building a second git-invocation path duplicates the redaction/timeout/env-hardening work (`git-export-runner.ts:203-255` carries a security-reviewed env allowlist) and violates the track's one boundary. **Fix before build: survey `createGitRunner` and reuse it; justify in writing if a new helper is still needed.**

**WARNING — new `POST /api/filesystems/inspect-path` route may be unnecessary surface.** The plan argues a new narrow route keeps `POST /api/filesystems` a pure writer. But the register route already runs a *live reachability probe* on insert (`checkAndPersistState`, `filesystems.ts:214-217`, `resolveFilesystemState`). Branch detection is the same class of "inspect the resource at registration" work that route already does. Two viable consolidations the plan didn't weigh:
  (a) fold branch detection into the existing register probe so the caller passes `repo:path` and the server fills `branch` — but this collides with the zod schema requiring `branch.min(1)` up front (`filesystems.ts:38-42`), so it needs a schema change; OR
  (b) keep a separate inspect endpoint but justify it against the existing live-probe machinery, not against a "pure writer" claim that is already false.
Not a hard blocker (a new read-only route is cheap and reusable), but the stated justification ("keeps POST a pure writer") is factually wrong — that route already probes and mutates state on register. Re-ground the decision.

**CRITICAL — non-git folder → `doc_set` is correct, but the `code`+branch schema constraint must be honored exactly.** Verified: `codeRefSchema` requires BOTH `repo.min(1)` AND `branch.min(1)` (`filesystems.ts:38-42`). So a git repo with a *detached HEAD* or no commits yet (`rev-parse --abbrev-ref HEAD` returns "HEAD" or fails) would produce an empty/invalid branch and the `code` registration would 400. The plan's `inspectLocalPath` returns `branch: string | null`; the submit logic must NOT register `kind:"code"` with a null/empty branch — it must fall back to `doc_set` or a sensible default branch. The plan's Decision 2 does not address the "git repo but branch unresolvable" edge. Pin the fallback (empty-branch git repo → treat as doc_set, or default to "main") before build so the register call can't 400.

### C2 — `derivePrimaryHarness()` helper in `packages/shared`

**Justified, not over-abstraction.** It is pure, DOM-free, unit-testable, and maps the real descriptor shape (`type`, `modelProviders`, `models[].{id,provider,selectable}` — confirmed at `harness-capability-descriptor.ts:52-60,101-111`) to the seam. Living in shared so both the web caller and its test import it is the right call. Keep it.

**NOTE.** `firstSelectableModel` must filter on `model.selectable === true` (`HarnessModelDescriptor.selectable`, `:57`) — a CLI harness can list `inheritedFromGateway`/non-selectable models. The requirements.md derivation says "firstSelectableModel" but architecture.md's inline `{ modelId: firstSelectable?.id ... }` doesn't state the `.selectable` filter. Make the filter explicit in the helper.

### C3 — Notification suppression

**3a (health guard): SOUND and correctly targeted.** Verified: `maybeNotifyAgentError` is called only when `operationalStatus==="error"` (`teams-routes.ts:842-843`); error requires `failureRate7d>0.5 || lastSessionCrashed` (`:827`), both of which need sessions. `sessionsByAgent` bucket is computed at `:785-790` and read at `:794`. Guarding the enqueue on `agentSessions.length > 0` is a real, testable robustness guard. The DoD's sanity-break (a crashed-session agent MUST still enqueue) is the right guard against a blanket mute. ✔

**WARNING — 3a is arguably a no-op that the DoD papers over.** As the plan itself admits (`architecture.md:124-126`), a zero-session agent is ALREADY `idle`, never `error`, so `maybeNotifyAgentError` is already never called for it. The AC4a test ("assert zero degraded rows for a fresh team") will pass **today, without any code change** — it does not prove the guard does anything. This is a mock-validation-trap risk (see `feedback_mock_validation_trap`): the test is green whether or not the guard exists. The only honest test is the sanity-break the DoD names (revert guard → still green for zero-session; crashed agent → still enqueues), which proves the guard is *targeted* but NOT that it fixes the reported bug. If the founder's "needs attention burst" actually came from somewhere else (see 3b), 3a fixes nothing. **Confirm the real source of the reported notification before shipping 3a as the fix.**

**CRITICAL — dropping the `?onboarding=true` auto-open breaks existing green tests the plan doesn't account for.** Verified the effect is real at `AppShell.tsx:278-294` (param `onboarding`, not the `?n=true` seen in a mangled grep). Removing it will turn RED two existing, currently-passing tests:
- `packages/web/src/__tests__/AE2-onboarding-autoopen.test.tsx` — two positive assertions ("opens the overlay when ?onboarding=true", "removes the param after opening") at `:70,:93`.
- `packages/web/src/__tests__/AE2-SetupFlow.test.tsx` — asserts SetupFlow navigates to `/work?onboarding=true` (the nav target the plan changes at `SetupFlow.tsx:212`).
Neither the architecture.md task list nor the dod.md mentions updating/deleting these. CLAUDE.md's "only NEW errors block, don't drain a baseline you didn't cause" does not apply — this change *causes* the failure. The plan must explicitly delete/rewrite these two AE2 tests (they encode the exact behavior being removed) or the build lands red. Add that to Group C tasks.

**WARNING — removing the auto-open reverses AE2's intended onboarding UX with no replacement.** The plan flags this as an open question for human review (good), but architecturally the "guide the user to first action" behavior simply vanishes; nothing replaces it. If the human review keeps "no burst but still guide," the builder has no spec for the replacement. Get the founder decision *before* build, not during — this is a concept-review gate item, and the WP is marked "Human concept review: YES."

### C4 — DoD → real runtime verification mapping

Mostly honest (integration tests through imports, real DB/app, real git in temp dir). Gaps:
- **AC2**: integration test runs "the onboarding request sequence" and asserts agents report the chosen `harnessType` via the real `persistScaffoldedAgents` seam. Genuine. ✔
- **AC3**: real `git init`/temp-dir + assert `GET /api/filesystems?teamId=` returns `code`+branch. Genuine runtime verification. ✔
- **AC4a**: **weak** — see C3 WARNING; test is green with or without the change. The sanity-break rescues it partially but the AC-as-written ("fresh team enqueues no notifications") is trivially true today.
- **AC4b**: component test asserting no auto-open + nav target `/work`. Genuine, but must REPLACE the existing AE2 tests, not sit alongside them (see C3 CRITICAL).
- **AC5**: component test, mock `GET /api/harnesses` reject/builtin-only, assert Start enabled + body omits `primaryHarness`. Genuine. ✔
No readFileSync/lint dodges found. Good.

### C5 — `WRITEBACK_MODES` default (the plan's own flagged unknown)

**CRITICAL — resolved here so the builder doesn't invent.** The plan flags "⚠️ UNVERIFIED default writeback — confirm WRITEBACK_MODES[0]." Verified: `WRITEBACK_MODES = ["git", "file", "none"]` (`packages/shared/src/filesystem.ts:12`). So `WRITEBACK_MODES[0]` is **`"git"`, NOT a neutral/off value.** The plan's assumption that `[0]` is "first/neutral" is wrong — `"git"` means auto-push-back, the most consequential writeback mode, on a freshly-onboarded repo the user hasn't consented to write to. Onboarding must default to **`"none"`** (or whatever Settings' add-flow actually defaults to — verify `SettingsFilesystems`' create default, which this WP should match), NOT `WRITEBACK_MODES[0]`. Pin `writeback:"none"` for onboarding registration; do not use index-0.

### C6 — Graceful degrade end-to-end

Planned and traceable: discovery fetch wrapped (fetch fail → builtin-only, omit primaryHarness); folder inspect/register is best-effort after team create and never rolls back (`architecture.md:110-111`); Start never gated on discovery. The one gap is the empty-branch git repo (C1 CRITICAL) which is a degrade path the plan doesn't cover.

### C7 — Split decision

One WP is defensible — all three parts live in `SetupFlow.tsx` + its submit sequence; splitting strands half-flows in main. Agree.

---

## Finding summary
- CRITICAL (4): (C1) survey/reuse `createGitRunner` instead of authoring `inspectLocalPath` from scratch; (C1) handle git-repo-with-unresolvable-branch so `code`+`branch.min(1)` can't 400; (C3) delete/rewrite the two existing AE2 tests the auto-open removal turns red; (C5) default onboarding writeback to `"none"`, NOT `WRITEBACK_MODES[0]` (= "git").
- WARNING (5): (b) pin the unauthenticated/missing builtin-row state — it's the real first-run default, not a deferred variant; (C1) re-ground the new-route justification (register route already probes+mutates, not a pure writer); (C3) confirm the real source of the reported "burst" before shipping 3a as the fix; (C3) get the founder decision on replacing AE2 auto-open before build; (C4) AC4a is trivially green — lean on the sanity-break.
- NOTE (4): guide-draft should hint the choice is one-time (human review); design "greyed or omitted" — pick one; `derivePrimaryHarness` must filter `.selectable`; commit-back copy for empty-branch case.

## VERDICT: REVISE
Must address before build: (1) reuse `createGitRunner`/`GitRunner` for git+branch detection rather than a from-scratch `inspectLocalPath` [C1]; (2) specify the git-repo-with-no-resolvable-branch fallback so `code` registration can't 400 [C1]; (3) plan the deletion/rewrite of `AE2-onboarding-autoopen.test.tsx` + `AE2-SetupFlow.test.tsx` in Group C so the branch doesn't land red [C3]; (4) default onboarding `writeback` to `"none"`, not `WRITEBACK_MODES[0]` which is `"git"` [C5]; (5) pin the unauthenticated/missing builtin-row render — the real first-run default state [design WARNING].

---

# Round 2 — Re-critique of the revised plan (reviewer, independent)

Verified against real code in the worktree. Every file:line below was re-read, not trusted from the plan's prose.

## C1 — reuse `createGitRunner` (was CRITICAL) → **RESOLVED**
- `GitRunner` interface real at `git-export-runner.ts:34`; `revParseIsInsideWorkTree()` at `:383`; `createGitRunner` at `:312`; `FakeGitRunner`/`createFakeGitRunner` at `:563`/`:570`. All cited anchors correct. ✔
- The interface genuinely **lacks** any branch verb (confirmed by reading `:34-70` and the `createGitRunner` return object `:335-398`) — so adding one `currentBranch(): Promise<string|null>` is the minimal honest change, not a rewrite. ✔
- Plan pins the redaction/timeout/env-hardened spawn as the reuse rationale (`run()`→`spawnGit` at `:317-322`, `runExpectOk` redaction at `:328-330`) — accurate; a parallel execFile path would duplicate that audited surface. ✔
- Constraints section (`architecture.md:15`) + requirements Boundary (`requirements.md:22-24`) now name `GitRunner`/`createGitRunner` as the mandated git path. Task 3 (`architecture.md:242-247`) adds the verb to interface + `createGitRunner` + `createFakeGitRunner` with a real-git integration test. Grounded and complete.
- **New-route justification re-grounded (was WARNING):** the plan no longer claims "keep POST a pure writer"; it correctly states the register route already probes+mutates via `checkAndPersistState` and justifies the separate `inspect-path` route by the schema's up-front `branch.min(1)` (`filesystems.ts:38-42`, re-confirmed) — the caller must know the branch before it can register `code`. Honest and correct. ✔

## C1b — empty/unresolvable-branch fallback (was CRITICAL) → **RESOLVED**
- `codeRefSchema` requires BOTH `repo.min(1)` and `branch.min(1)` — real at `filesystems.ts:40-41`. A null/empty branch on a `code` register would 400. ✔
- Plan's submit logic (`architecture.md:130-148`, mirrored in `.pipeline/plans/AV1.md:90-96`) routes **git-repo-with-no-resolvable-branch → `doc_set`**, never `code`+empty-branch. `currentBranch()` is specified to return `null` on failure/empty/`"HEAD"` (detached / no-commit), and the register branch keys on that. Avoids the 400. ✔
- DoD AC3 (`dod.md:36-41`) has a **real integration test** for the no-commit repo (`real git init`, zero commits → asserts `kind:"doc_set"`, `GET /api/filesystems` returns it, no 400), backed by `inspect-local-path.integration.test.ts` + extended `git-export-runner` coverage (committed → branch; no-commit → `null`). Honest runtime verification through imports. ✔

## C3 — self-caused red AE2 tests (was CRITICAL) → **RESOLVED**
- The auto-open effect is **real** at `packages/web/src/layouts/AppShell.tsx:282-294` (`searchParams.get("onboarding") === "true"` → `setAssistantOverlayOpen(true)` + `next.delete("onboarding")`). The plan abbreviates the path as `AppShell.tsx` but the line range is exact. ✔
- `SetupFlow.tsx:212` navigates to `/work?onboarding=true` — real; dropping the param is the correct trigger-removal. ✔
- `AE2-onboarding-autoopen.test.tsx`: the two auto-open positives are at `:70` and `:93`; the two negatives to keep at `:131` and `:150`. Plan's line refs (`architecture.md:184-185`, `dod.md:82-84`) are **exactly right**. ✔
- `AE2-SetupFlow.test.tsx`: the nav test is at `:326`; it asserts `searchEl.textContent` contains `"onboarding=true"` at `:341` (plan/dod say `:340` — off by one, cosmetic; the assertion is the one at `:341` and the plan describes it correctly). Task 8 + AC4 rewrite it to expect `/work` with no `onboarding` param. Not a silent baseline dodge — the plan explicitly deletes/rewrites the exact assertions that encode the removed behavior. ✔ (NOTE: fix the `:340`→`:341` line ref; the stub's captured element is `current-search` at `:340`, the assertion at `:341`.)

## C5 — writeback default (was CRITICAL) → **RESOLVED**
- `WRITEBACK_MODES = ["git", "file", "none"]` real at `filesystem.ts:12` — index-0 is `"git"` (auto-push-back). ✔
- Plan pins the literal `writeback:"none"` on **every** onboarding registration (`architecture.md:149-154`, `.pipeline/plans/AV1.md:97-99`) and explicitly forbids `WRITEBACK_MODES[0]`. AC3 verifies `writeback:"none"` at runtime via the integration assertions (`dod.md:33,35,48-51`), not by reading source. ✔

## New-risk checks

### Notification "burst" reasoning → **SOUND**
- The burst = the AssistantOverlay auto-open (3b), traced correctly: `SetupFlow.tsx:212` → `AppShell.tsx:282-294` auto-open → `AssistantOverlay` renders `missing_key`/`missing_harness`/`provider_error` notice cards (real at `AssistantOverlay.tsx:277,299,318`) for the un-wired Assistant agent. Dropping the auto-open is the right, minimal fix. ✔
- The health guard (3a) is correctly characterized as a **no-op for this burst**: `maybeNotifyAgentError` is called only at `teams-routes.ts:842-843` under `operationalStatus==="error"`, and error requires `failureRate7d>0.5 || lastSessionCrashed` (`:827`) — both need sessions; a zero-session agent is `idle` (`:828-832`). `sessionsByAgent`/`agentSessions` at `:794`. All Group-C task-7 anchors correct. ✔

### Mock-validation-trap check → **CLEARED**
- AC4a is honestly flagged as trivially-true (`dod.md:64-68`, `architecture.md:198-214`): the plan explicitly states the zero-session assertion passes with OR without the guard and must NOT be represented as proving the burst fixed. The **honest** verification is the paired sanity-break (crashed-session agent DOES enqueue an `agent.health.degraded` row) plus AC4b (the real burst fix — no auto-open). This is the correct disclosure, not a dodge. ✔
- No AC passes with zero code change and is claimed as proof: the burst-fix proof is AC4b (component test: `?onboarding=true` inert + nav to `/work`), which requires the AppShell/SetupFlow change to exist. ✔

### DoD → runtime-verification mapping → **CLEAN**
Every AC maps to a real test through imports: AC1 component + `derivePrimaryHarness` unit (incl. `.selectable` filter, `HarnessModelDescriptor.selectable` real at `harness-capability-descriptor.ts:57`); AC2 integration (real `persistScaffoldedAgents` seam); AC3 integration (real git temp dir, incl. no-commit + non-git); AC4a integration + sanity-break, AC4b component; AC5 component (degrade + omit `primaryHarness`). No `readFileSync`-as-test, no `existsSync`, no grep-as-test. The one static property (writeback literal) is verified at runtime via the AC3 assertions, not by source-reading (`dod.md:48-51`). ✔

### First-run default render (was design WARNING) → **RESOLVED**
`design/approved.md:53-78` pins the built-in-unauthenticated single-row default state (`probeBuiltinGateway` → `unauthenticated` when no key, real at `harness-discovery.ts:329-372`), always-present/always-selectable, calm "add your API key below" copy (not a red notice-card). The "greyed or omitted" ambiguity is resolved to **omit** non-installed/`missing`/`unavailable` (`design/approved.md:42-46`). No conflict with AC1, which mocks `claude-code`/`codex` as **ready** (those render as selectable rows; only `missing`/`unavailable` are omitted).

### New inconsistencies introduced by the revision → **NONE material**
- `.selectable` filter is now stated in **both** requirements (`:71-77`) and architecture (`:47-53`) and the helper spec falls back to `"claude-sonnet-4-6"`/`"anthropic"` when no selectable model exists — consistent with AC1's all-non-selectable case (`dod.md:15-17`) and with the ISN'T note that CLI harnesses often declare empty `modelProviders` (`requirements.md:79-81`). Coherent. ✔
- Omit-non-installed decision does not conflict with any AC — AC1 asserts `ready` CLI rows render; nothing asserts a `missing` row renders. ✔
- No prod-behavior-driven-by-test smell: the AE2 rewrites change the tests to match the deliberately-changed behavior (removed auto-open), which is correct per CLAUDE.md — the change causes the failure, so rewriting is mandatory, not a baseline drain.

## Residual (all non-blocking)
- **NOTE:** `dod.md` / `architecture.md` cite the AE2-SetupFlow nav assertion at `:340`; the actual `.toContain("onboarding=true")` assertion is at `:341` (`:340` is the `current-search` `getByTestId`). Cosmetic; the described rewrite is correct.
- **NOTE (carried, human-review item):** dropping the guided auto-open removes AE2's "guide to first action" with no replacement — correctly parked for the concept review (`requirements.md:114-116`, `.pipeline/plans/AV1.md:138-141`). Not an AV1 build blocker.
- **NOTE (carried):** guide-draft doesn't tell the user the primary-harness choice is one-time — flagged for human review, unchanged from Round 1.

## Round 2 finding summary
- CRITICAL: 0 (all four Round-1 CRITICALs genuinely resolved against real code).
- WARNING: 0 (both load-bearing Round-1 WARNINGs — route justification, first-run render — resolved; the burst source is confirmed and AC4a's triviality is honestly disclosed with a real sanity-break).
- NOTE: 3 (one off-by-one line ref; two carried human-review items). None block build.

## VERDICT: PASS
All four Round-1 CRITICAL findings are resolved and verified against real code (`git-export-runner.ts:34/312/383/570`, `filesystems.ts:40-41`, `filesystem.ts:12`, `AppShell.tsx:282-294`, `AE2-onboarding-autoopen.test.tsx:70/93/131/150`, `AE2-SetupFlow.test.tsx:326/341`, `teams-routes.ts:842`). No new CRITICAL/WARNING introduced. Build may proceed.

---

# Round 3 (post-concept-review) — Re-critique of the expanded plan (reviewer, independent)

Founder overrode 3 shapes: (1) primary harness = a PERSISTED team default consumed at every agent-creation path; (2) keep the Assistant auto-open but make it open READY; (3) greyed (not omitted) non-installed harnesses. Every anchor below was re-read against real code in the worktree, not trusted from prose.

## Delta 1 — Persistence home = 3 nullable columns on `teams`, migration 0042 → **SOUND**
- `teams` table real at `schema.ts:17-34`; ALL existing columns are `text` and every optional one is nullable (`briefPath`, `architecturePath`, `factoryDbPath`, `functions`). Adding `default_harness_type`/`default_model_id`/`default_model_provider` as nullable text is additive and mirrors the existing team-config pattern exactly. ✔ **No `default_harness_*` column exists today** (confirmed by reading `:17-34`) → the migration genuinely adds them.
- **Home choice is correct, not reuse-abuse.** `serviceConnections` real at `schema.ts:1313`, and its own lore (`:1305-1312`) states it is a per-user, open, user-driven set that "reuses the encryption primitive only" and that writing into `serverCredentials` "violates concept hard-rule 5." Harness default is neither per-user external cred nor a secret — it belongs on `teams`, not there. The planner's rejection of `serviceConnections` as the home is grounded in that table's own hard-rule. ✔
- **Existing `teams`-default pattern it mirrors:** `functions` (`schema.ts:33`, nullable text, team-level default read by the roster scaffold) is the precedent — a nullable durable team-config column consumed at agent creation. The new columns are the same shape. ✔
- **Migration number right.** Latest on branch is `0041_wet_photon.sql` (confirmed via `ls drizzle/`) → next generated is `0042_*`. Plan mandates `npm run db:generate` + hand-verify, not a hand-written SQL — correct (no risk of a wrong slug). Additive-nullable → zero backfill, existing teams read `null` → builtin fallback, no behavior change. ✔

## Delta 2 — Single resolver `resolveTeamAgentHarness` at 3 paths + single-sourced fallback → **SOUND**
All four consumption anchors re-read and exact:
- **Onboarding scaffold** `teams-routes.ts:444-449` — passes `primaryHarness` today. Team insert at `:401-409` carries NO default_harness columns today (correct — the write path adds them). ✔
- **Add-agent-later** `teams-routes.ts:663` — `persistScaffoldedAgents(db, memberGroup.id, specs)` with NO primary (confirmed). The `team` row is ALREADY fetched via a full `.select()` at `:635`, so all three new columns are in scope for `resolveTeamAgentHarness(undefined, team)` with zero extra query. ✔ This is the founder's gap #1, genuinely closed.
- **Assistant stub** `teams-routes.ts:543-550` — inserts the `ast-<userId>` user row with NO `harnessType`/`modelId`/`modelProvider` (confirmed `:543-550`). The `users` table HAS those columns (`schema.ts:71,79,87`), so a null `harnessType` → `NoEligibleHarnessError` → `missing_harness`. Setting them from `resolveTeamAgentHarness(primaryHarness, team)` is the correct fix. ✔ (gap #2, the burst source.)
- **Single fallback source stays `persistScaffoldedAgents:112-114`** — confirmed: `harnessType: primaryHarness?.harnessType ?? "builtin"`, `modelId ?? "claude-sonnet-4-6"`, `modelProvider ?? "anthropic"`. The resolver returning `undefined` (both explicit + team-default unset) correctly defers to this single source; the plan explicitly forbids duplicating the literals in the resolver. The ONE deliberate exception is the assistant stub, which is a **direct `db.insert(users)`** — it does NOT route through `persistScaffoldedAgents`, so it must apply the `builtin`/`sonnet`/`anthropic` fallback inline. The plan states this explicitly (`architecture.md:161-164`). Acceptable and correctly disclosed — not a second scattered fallback chain, a leaf that can't reach the shared writer. ✔
- **Lazy assistant-create `assistant-turn.ts:434` staying builtin is acceptable.** Re-read `:427-448`: this path keys off `ast-${userId}` and has ONLY `userId` in scope — no team, no membership lookup (the assistant is per-user, `teamId` not set on the row). There is no team default to read here. Hardcoded `builtin`/`sonnet`/`anthropic` (`:441-443`) is the honest last-resort, and for the onboarding flow it is rarely hit because the stub (path 3) pre-creates the row with the right harness. Correctly scoped as AV2's concern. ✔

## Delta 3 — Assistant opens READY (the founder's headline — scrutinized hardest) → **SOUND & ACHIEVABLE BY AV1**
Full chain re-traced against real code:
- **Notices are turn-failures, server-produced.** `mapErrorToNotice` real at `assistant-turn.ts:161-210`: `MissingCredentialError`→`missing_key` (`:166-171`), `NoEligibleHarnessError`→`missing_harness` (`:172-177`). The fix must prevent the turn from *failing*, not hide the card — the plan's framing is correct. ✔
- **No `missing_harness`:** stub now carries a real harness (Delta 2 path 3). ✔
- **No `missing_key`:** key write `PUT /api/credentials/anthropic_api_key` (`credentials.ts:193`, encrypt+store) is `await`ed at `SetupFlow.tsx:202-208` **before** `navigate("/work?onboarding=true")` at `:212`, same try-block, sequential. `DbCredentialResolver` (`server-factory.ts:247`) reads that same store, so once the awaited PUT lands the turn's credential resolve returns the key → no `MissingCredentialError`. ✔
- **Blank-key hole is closed.** The write is guarded `if (apiKey.trim())` (`:202`), but `canStart` requires `apiKey.trim().length > 0` (`:133-134`) and the submit button is `disabled={!canStart}` (`:421`). So at nav time a key is ALWAYS present and written — the guard can never be false when submit fires. No `missing_key` gap. ✔
- **`provider_error` honestly scoped OUT.** `mapErrorToNotice` maps live upstream 5xx/timeout/CassetteMiss/HttpError to `provider_error` (`:178-213`) — a genuine runtime failure, not a misconfiguration. The plan claims AV1 only guarantees key+harness so `missing_key`/`missing_harness` cannot fire, and does NOT over-claim `provider_error` suppression. That is the correct, honest boundary. ✔
- **Verdict on the headline:** AV1 can genuinely make the Assistant open ready for the two misconfiguration classes it owns, and honestly scopes the live-error class it doesn't. No theater.

## Delta 4 — Greyed picker → **SOUND**
- `GET /api/harnesses` returns ALL descriptors including `discovery.state:"missing"` (state enum real at `harness-capability-descriptor.ts:9-14,72`). The picker renders every one, gates choosability on state. ✔
- **The descriptor carries everything a greyed row needs.** `authAction: HarnessAuthActionDescriptor{ kind, label, description?, command? }` real at `:16-24,106`, where `kind ∈ {enter_api_key, native_cli_login, none}` — a `native_cli_login` action carries the label/description/command for the "install & sign in to use" hint. `discovery.state` gates choosable-vs-greyed. So a greyed row's copy + install hint derive entirely from the descriptor with no new field. ✔ Plan's cite of `:16-24` is exact.

## DoD → real runtime tests for the NEW behaviors → **CLEAN, no traps**
- **Add-agent-later reads persisted default (AC2):** integration test POSTs the real `POST /:teamId/agents` route (real at `teams-routes.ts:613`) with no harness and asserts the new agent reports the persisted `harnessType`, NOT builtin (`dod.md:33-37`). Targets the real seam; would go red without the `:663` change. Genuine. ✔
- **Assistant-opens-ready (AC4a):** integration test runs onboarding + first assistant turn, asserts NO `missing_key`/`missing_harness` notice persisted, PLUS a **required sanity-break**: clear the stub's `harnessType` → `missing_harness` DOES persist (`dod.md:78-83`). This defeats the mock-validation-trap — the assertion is only green because the harness the stub carries suppresses the card, proven by the break. Not trivially green. ✔
- **Greyed-harness render (AC1):** component test mocks a `codex` descriptor with `state:"missing"` and asserts it renders, is greyed/disabled, and is NOT selectable (clicking does not set primary), alongside ready rows selectable (`dod.md:11-19`). Genuine component-render verification. ✔
- **AC6 seam is real:** `maybeNotifyAgentError` (`teams-routes.ts:121`) enqueues `agent.health.degraded` to `notificationQueue` (`:132,142`), called at `:843`; `agentSessions` bucket at `:794`. The zero-session assertion is HONESTLY disclosed as trivially-true (a robustness invariant, not the burst fix — `dod.md:113-116`), with the crashed-session sanity-break carrying the real proof. The burst fix is AC4, not AC6. No dishonest "this proves the fix" claim. ✔
- No `readFileSync`/`existsSync`/grep-as-test anywhere. The one static property (writeback literal `"none"`) is verified at runtime via AC3's assertions (`dod.md:63-65`), not by source-reading. ✔

## New inconsistencies introduced by the expansion vs surviving prior fixes → **NONE**
Re-read every Round-2 fix; the expansion disturbs none:
- **`createGitRunner`+`currentBranch()`:** `GitRunner` interface (`git-export-runner.ts:34`) still lacks any branch verb (`revParseIsInsideWorkTree` at `:48`, no `currentBranch`) — adding the one method remains the minimal change. Untouched by the expansion. ✔
- **Empty-branch→`doc_set`:** `codeRefSchema.branch.min(1)` real at `filesystems.ts:41`; `docSetRefSchema.folder` at `:43`. Fallback still correct. ✔
- **`writeback:"none"`:** `WRITEBACK_MODES = ["git","file","none"]` real at `filesystem.ts:12` — index-0 is `"git"`. Literal `"none"` mandate intact. ✔
- **inspect-path route:** justification (schema forces branch-before-register) unchanged and still holds. ✔
- **`.selectable` filter** on `derivePrimaryHarness` is stated in requirements (`:86-89`) and architecture; consistent with `HarnessModelDescriptor.selectable` at `harness-capability-descriptor.ts:57`. ✔
The Delta-1 write path adds columns to the SAME `db.insert(teams)` call at `:401-409` that already runs in the folder-registration request — no ordering conflict with the best-effort filesystem register (which runs after the team POST response). Coherent. ✔

## Residual (non-blocking)
- **NOTE (carried):** guide-draft NOW correctly tells the user the choice applies to "every agent on your team, including ones you add later" (`requirements.md:102-104`) — the Round-1 NOTE (choice-is-one-time, unexplained) is RESOLVED by the persisted-default shape. No action.
- **NOTE:** the assistant-stub inline fallback (`architecture.md:161-164`) is a second place the `builtin`/`sonnet`/`anthropic` literals appear (the stub can't route through `persistScaffoldedAgents`). This is unavoidable given it's a direct insert, and the plan discloses it — but the builder should keep the two literal-sets identical. Cosmetic; not a finding.

## Round 3 finding summary
- CRITICAL: 0.
- WARNING: 0.
- NOTE: 2 (both non-blocking; one is a resolution of a prior NOTE).

## VERDICT: PASS
All three founder-mandated expansions are architecturally sound and grounded in real code: `teams` is the correct additive-nullable home (mirrors `functions`, rejects `serviceConnections` on its own hard-rule; migration 0042 correct); the single resolver + three consumption paths are exact and keep the fallback single-sourced (assistant-stub inline fallback honestly disclosed); the Assistant-opens-ready chain is real and achievable for the two misconfiguration classes AV1 owns, with `provider_error` honestly scoped out; the greyed picker has every field it needs on the descriptor. The DoD maps each new behavior to a real runtime test through imports, with required sanity-breaks defeating the mock-validation-trap. No new CRITICAL/WARNING; no inconsistency with the surviving Round-2 fixes. Build may proceed.
