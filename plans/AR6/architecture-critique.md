# AR6 — Architecture Critique

Reviewer (Phase 2). Plan evaluated: `plans/AR6/architecture.md` + `concept.md`, scored against the 9-dimension architectural rubric and verified claim-by-claim against the real code in this worktree. AR6 has no UI surface — no design-critique.

**Verdict line: APPROVED WITH REQUIRED FIXES — overall 7.0/10. The triage strategy is sound and well-grounded, but two factual grounding errors (an existing real-harness capabilities file the plan never discovered, and a misread allowlist starting-state) must be corrected before the builder executes §2.2 and §6, or AR6 will create the exact duplicate proof it exists to eliminate.** Because the score is ≥7 the builder may proceed, but MUST act on CRITICAL-1 and CRITICAL-2 first.

---

## Bottom line up front

The plan's spine is correct and verified: file selection is path-only (`isHarnessIntegrationPath`), so the triage's convert/demote/service/keep taxonomy is the right lever; the keeper choices (T0b + AL7-two-session for the real-bridge tool-call; #11 realbinary for return-enforcement) are genuinely real-harness through the production bridge — I read the bodies and confirmed `createMcpBridge`/`createMcpRoute`/`registry.invoke`. The consolidation logic ("demote pure predicates, keep one real proof") matches the spec verbatim and is the correct reading of CC-004.

But the plan rests on two false premises about the current tree that it would have caught with one `ls` + one `grep`:

1. **It never found `AM2-real-harness-discovery.integration.test.ts`** — an already-shipped (AM2 PR #339), clean, full-matrix, `requireHarness`-gated real-harness capabilities proof living in `harness/__tests__/`. The plan's §2.2 proposes *creating a new* `harness/__tests__/AM2-harness-capabilities.integration.test.ts` real-probe sibling and marks its entry point `⚠️ UNVERIFIED` (R4). That file already exists and already proves AC1's "capabilities against a real harness" gap. Building the proposed sibling would create a second proof = the duplicate AR6 is chartered to remove.
2. **It misreads the coverage-debt allowlist starting-state** for #13 AL7-two-session ("absent today — keep absent"). It is present today (`coverage-debt: YES`). The end-state (removed once full-matrix) is right; the stated current-state is wrong, which will confuse the builder's reconciliation in §6/§9.

Neither sinks the plan — both are correctable in a focused revision and the rest of the plan stands. But the AM2 error is material because it directly defeats the WP's mandate.

---

## Per-dimension scores (9-dimension rubric)

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | **Problem framing & spec fidelity** | 8/10 | Concept correctly states "no new noun"; the three-shape triage (harness-integration / service-integration / pure-unit) is the exact right framing and maps cleanly to the spec's AC1–AC4. The "one honest proof per behavior" keeper table (§3) is faithful to the spec. −2: missed that one behavior (AM2 capabilities) already HAS its single honest proof on disk, so the framing over-scopes new work. |
| 2 | **Layer integrity & boundaries** | 8/10 | Respects the path-only guard boundary; correctly distinguishes guard-selected (`harness/__tests__/*.integration`) from non-selected dirs; correctly refuses to route AL7's bridge proof through `provisionSession` (would conflate the bridge seam with the provisioning seam — good judgment, §0 last para). |
| 3 | **Data model / contract correctness** | 7/10 | Allowlist edits (§6) are mostly right but contain the #13 starting-state error and an over-broad claim about which entries are AR6's to remove. The `[harness:X]` tag + `assertPerHarnessFloor` mechanics are described accurately (verified against `attestation-floor.ts`). |
| 4 | **Interface / seam reuse** | 8/10 | Correctly reuses AR2's `requireHarness` / `SUPPORTED_HARNESS_LANES` / `describeTag` and correctly declines `runThroughHarness` for the bridge proof (it captures sandbox files, not MCP calls — §0 "runThroughHarness is for sandbox-artifact proofs" is a sharp, correct distinction). |
| 5 | **Failure modes & honesty** | 6/10 | The plan's own central risk — a test that *looks* honest but doesn't exercise the seam — is well-guarded for the convert targets. But the AM2 miss means the plan would ADD a redundant proof (the opposite failure: still-two, not one). −4. |
| 6 | **Complexity / proportionality** | 7/10 | Mostly proportional. The proposed new AM2 sibling is unnecessary work (an existing file covers it). The R1 hand-wringing about relocation is over-thought (see R1 ruling — `.test.ts` units get `{db}` fine). |
| 7 | **Testability / verifiability** | 7/10 | §8 per-AC validation is concrete and correct (grep for `implements HarnessAdapter` in surviving `.integration`; guard `--check` clean; per-harness floor non-zero). The verification is genuinely falsifiable. −3 because R3 (in-body `skip()`) is left to "reviewer eyeballs" when it is mechanically fixable. |
| 8 | **Risk surfacing & open questions** | 7/10 | R1–R4 are surfaced honestly and the plan flags its own UNVERIFIED points — good discipline. But R4's "UNVERIFIED entry point" was answerable by reading one existing file, and the plan shipped it unverified instead. Surfacing a risk you could have closed in 30s is a partial miss. |
| 9 | **Migration / blast radius** | 7/10 | The monotonic-shrink allowlist discipline is respected; AR6 correctly scopes to its own files and leaves AR3/AR4/AR5 debt untouched. The end-state (stub allowlist → `[]`, coverage-debt minus AR6's entries) is correct. −3 for the #13 starting-state misread that muddies the reconciliation step. |

**Overall: 7.0/10** — approved threshold met; two CRITICAL corrections required before execution.

---

## Findings

### CRITICAL

**CRITICAL-1 — §2.2 / R4: the proposed AM2 real-probe sibling already exists; building it creates a duplicate proof.**
`packages/server/src/harness/__tests__/AM2-real-harness-discovery.integration.test.ts` (shipped AM2 PR #339, present in this worktree) already: lives in the guard-selected harness dir, calls the real production probe `discoverLocalHarnesses()`, gates each harness with `requireHarness("codex"|"claude"|"opencode"|"builtin")` (full matrix — all four declared, verified), asserts real installed/authed state + real versions, and is on neither allowlist (clean + covered). This IS AC1's "capabilities proven against a real harness." The plan's §2.2 proposal to create a *new* `harness/__tests__/AM2-harness-capabilities.integration.test.ts` iterating `SUPPORTED_HARNESS_LANES` would produce a second real-harness capabilities proof — exactly the "two proofs" AR6 is chartered to eliminate. **Required fix:** revise §2.2 to (a) recognize `AM2-real-harness-discovery.integration.test.ts` as the existing single honest keeper for capabilities, (b) keep the `routes/__tests__/AM2-harness-capabilities.integration.test.ts` service test as-is for the static-map serialization/no-secrets assertions (it is non-harness service integration — correct), and (c) DROP the "create a new real-probe sibling" task entirely. R4's "UNVERIFIED entry point" is resolved: the probe is `discoverLocalHarnesses()`, confirmed working.

**CRITICAL-2 — §6: #13 AL7-two-session-trust-first coverage-debt starting-state is misread.**
The plan §6 states: *"`AL7-two-session-trust-first.integration.test.ts` (#13) — must NOT be added if it currently is absent... It is absent today — keep absent."* Verified false: #13 is on `scripts/coverage-debt.allowlist.json` today (`coverage-debt: YES`). It is staged debt because it declares only claude/codex/opencode (no builtin lane — verified, 3 `requireHarness` calls). The correct end-state the plan intends (remove once full-matrix) is right, but the builder following the stated current-state will look for an absent entry, not find it, and mis-reconcile. **Required fix:** correct §6 to read "#13 IS on coverage-debt today; add its builtin lane, then REMOVE it from coverage-debt." This aligns with §9 step 6 which already implies removal.

### WARNING

**WARNING-1 — R3: in-body `if(!authed){skip()}` is mechanically removable; do not leave it to eyeballing.**
Verified: the guard's `hasAbsentSkipIf` matches only `.skipIf(...)` (regex `ABSENT_SKIPIF_PATTERNS`), NOT in-body `skip()`. Both keepers carry many such blocks — #11 realbinary (~14 `skip()` sites) and #13 AL7-two-session (~7 sites), each behind `const authed = await claudeAuthed(); if(!authed){skip();return;}`. The plan correctly says delete them and rely on `requireHarness` (binaries are installed+authed per MEMORY). But §10/R3 frames this as "the reviewer must eyeball." That is fragile for a 14-site file. **Recommendation:** the builder must mechanically delete every `if(!authed){skip()}` block AND the now-orphaned `claudeAuthed()`/`authed` helper, and the Phase-4 review must `grep -n 'skip()' ` both files to confirm zero residuals. This is a verifiable check, not an eyeball — make it one.

**WARNING-2 — §2.1 mcp-route split: the "demote to `mcp-route-provisioning.test.ts`" half risks preserving a low-value scripted-orchestration test.**
`mcp-route.integration.test.ts` confirmed: 5 hand-rolled `implements HarnessAdapter` classes (`ScriptedHarnessAdapter`, `CapturingHarness`, `McpJsonCapturingHarness`, `TokenValidatingHarness`, `WorkspaceCapturingHarness`) driving `provisionSession`. The plan demotes the `.mcp.json`/registry-size assertions to a `.test.ts` unit. Caution: a `.test.ts` that still drives `provisionSession` with a fake adapter to assert "`.mcp.json` was written / registry size went 1→0" proves orchestration plumbing, not the bridge, and AR2's real claude lane already proves the real `.mcp.json` write. The plan acknowledges this ("Remove the rest as duplicated by AR2's real claude lane") but the boundary between "demote" and "remove" is left soft. **Recommendation:** the builder should prefer testing the orchestration unit (`startMcpBridgeServer` / `.mcp.json` writer function) directly where one exists, and REMOVE the `provisionSession`-over-scripted-adapter assertions whose real proof is AR2's claude lane, rather than relabel them `.test.ts`. Phase-4 review will check that any surviving demoted unit asserts a real function's output, not scripted-adapter plumbing.

**WARNING-3 — demote targets #2/#3 call `createTestDb()` directly (testing-rule violation), pre-existing but inherited on demotion.**
`mcp-bridge.integration.test.ts` and `mcp-bridge-registry.integration.test.ts` call `createTestDb()` directly and use `it()` (verified). The testing rules forbid direct `createTestDb()` (use fixtures). The plan's demote is correct (these are pure bridge/registry logic — clean targets), but the demotion is a good moment to note these will land as `.test.ts` units still calling `createTestDb()` directly. Not blocking (pre-existing), but the builder should be aware Biome/the testing-rule reviewer may flag it; if the demoted units don't actually need a DB, drop the call.

### NIT

**NIT-1 — §0 references `AM2-real-harness-session-probe` as context but the actual capabilities file is `AM2-real-harness-discovery`.** The plan conflates two different existing AM2 files (a session-probe and a discovery probe). `AM2-real-harness-session-probe.integration.test.ts` is on coverage-debt and is genuinely another WP's concern (it spawns real turns, AM2's). `AM2-real-harness-discovery.integration.test.ts` is the capabilities keeper. Tighten the naming so the builder touches the right file.

**NIT-2 — §5 over-specifies "do not import scripts from packages."** Correct, but `require-harness.ts` already mirrors `SUPPORTED_HARNESSES` as a compile-checked literal (verified in the predicate-lib JSDoc) — the plan can just say "use the existing mirror" rather than re-deriving the constraint.

---

## Explicit rulings on the four open risks

**R1 — can demoted `*.test.ts` units take `{db}` PGlite fixtures, or must they relocate out of `harness/__tests__/`?**
**RULING: They CAN take `{db}` in `.test.ts` — no relocation needed for fixtures.** Empirically proven: ran `vitest run --project server packages/server/src/__tests__/server-factory.resolver.test.ts` (a `.test.ts` unit-project file importing `../test-fixtures.js` and destructuring `{ db }`) → 4 passed with real PGlite queries. The unit project's setup (`packages/server/vitest.config.ts` → `src/vitest-setup.ts` → `warmPool()`) provides the same globalThis PGlite pool. `AK4-assistant-draft-registry.test.ts` already does this in production. The plan's R1 (and the §3.1 step-5 "⚠️ UNVERIFIED... if integration-project-only, relocate") is over-pessimistic and partly wrong. A demoted file can stay `.test.ts` *inside* `harness/__tests__/` and still get `{db}` — the guard only selects `.integration.test.ts` there (verified: `HARNESS_DIR_INTEGRATION` requires the `.integration` suffix). **Relocation is required ONLY if a file must keep the `.integration` suffix** (i.e. it is genuine service integration, not demotable to a unit) — in that single case, move it out of `harness/__tests__/` so `isHarnessIntegrationPath` returns false. Builder: default to `.test.ts` in place; relocate only the genuine-service-integration remnants.

**R2 — is "full SUPPORTED_HARNESSES matrix" satisfied for a bridge test by proving builtin's in-process enforcement equivalent rather than the literal HTTP path?**
**RULING: ACCEPTABLE — no guard carve-out needed.** The guard and floor demand only that each of the four harnesses has a `requireHarness("<name>")` lane (source check) AND ≥1 executed `[harness:<name>]`-tagged assertion (attestation floor) — verified in `honest-harness-guard.ts` `missingHarnesses()` and `attestation-floor.ts` `assertPerHarnessFloor()`. Neither demands a specific code path. builtin is genuinely in-process (no MCP-over-HTTP) — proving builtin's tool-call enforcement through the real `BuiltinHarnessAdapter` + a real model is honest and satisfies both mechanisms. This is NOT a false green: builtin really runs, really enforces, just over a different transport because builtin has no HTTP MCP. The reviewer (me) explicitly accepts "full matrix" for a bridge test = builtin's in-process equivalent. **Caveat (binding):** the plan's §4 correctly flags that a `vi.mock("llm-client")` builtin lane would trip `isStubDirty` in a selected `.integration` file (verified — STUB_PATTERNS includes `vi.mock(.*llm-client)`). So the builtin lane on #13 MUST use a REAL model (`requireHarness("builtin")` = `OPENROUTER_API_KEY`), not a mocked `callLlm`. Do NOT pursue the carve-out option.

**R3 — guard catches `.skipIf` but not in-body `if(!authed){skip()}`. Is eyeballing acceptable, or remove mechanically?**
**RULING: Remove mechanically — eyeballing is NOT acceptable as the only safeguard.** Confirmed the guard blind spot. With ~14 sites in #11 and ~7 in #13, an eyeball is unreliable. The builder must delete every in-body `skip()`/`if(!authed)` block and the orphaned `claudeAuthed()` helper, relying solely on the describe-scope `requireHarness`. The Phase-4 review converts the eyeball into a check: `grep -n 'skip()' ` on the two converted files must return zero. (This is also an AR1-spirit requirement — "never skip to green" — and the in-body skip silently produces 0 executed assertions, which, if AR2's lanes ever stop covering a harness, would erode the floor.)

**R4 — the AM2 real-probe entry point is UNVERIFIED; is the builder being sent in blind?**
**RULING: MOOT — and the plan was sent in blind on a question it could have closed.** The production discovery entry point is `discoverLocalHarnesses()` (verified: imported and called in the existing `AM2-real-harness-discovery.integration.test.ts`, returns a `Record<harness, {state, version, authAction, runtime, reason}>`). There is no blindness because the proof already exists and works. Per CRITICAL-1, the builder must NOT build a new real-probe sibling — the existing file is the keeper. R4 dissolves into CRITICAL-1.

---

## What the plan got right (so the builder keeps it)

- Path-only triage spine (§0) — correct and load-bearing; verified against `isHarnessIntegrationPath`.
- Keeper selection: T0b (`mcp-bridge-stateful`, production bridge via SDK Client → `registry.invoke`) + #13 AL7-two-session (real binaries → production `createMcpBridge`/`createMcpRoute` → captured `registry.invoke`) for the bridge tool-call; #11 realbinary for return-enforcement. All verified genuinely real through production code.
- Demote #4 `cli-mcp-config` → unit (uses only `fs/os/path`, zero db/app/harness — verified). Trivially correct.
- Demote #7/#8/#9/#12 (pure predicates/transforms over scripted streams — `evaluateReturn`, `provisionReturnHook` dispatch, `probeSucceeds`) with the "a real harness cannot deterministically produce a no-return / zero-event turn" justification. Correct and matches AR2 lore.
- Correctly NOT routing AL7's bridge proof through `provisionSession` (§0) — sharp seam discipline.
- Correctly leaving omitted AL7 files (`AL7-two-session-loop`, `AL7-proposed-call-capture`, `AL7-reviews-loader-redo`) out of scope — verified zero stub adapters, all CAS/DB service integration in `src/__tests__/`, not guard-selected.
- End-state allowlist target (stub → `[]`; coverage-debt minus AR6's entries) — correct shape.

---

## Required actions before/during build (recap for Phase 4 review)

1. **CRITICAL-1:** drop the new-AM2-sibling task; adopt the existing `AM2-real-harness-discovery.integration.test.ts` as the capabilities keeper. (Phase-4: confirm no new duplicate capabilities file was added.)
2. **CRITICAL-2:** fix §6 — #13 IS on coverage-debt today; add builtin lane then remove. (Phase-4: confirm #13 off both allowlists, full matrix.)
3. **WARNING-1 / R3:** mechanically delete all in-body `skip()` in #11 and #13. (Phase-4: `grep -n 'skip()'` → zero.)
4. **R2 binding caveat:** #13 builtin lane uses a REAL model, never `vi.mock(llm-client)`. (Phase-4: guard `--check` clean, builtin lane present.)
5. **WARNING-2:** prefer removing scripted-`provisionSession` mcp-route assertions over relabeling them `.test.ts`. (Phase-4: any surviving demoted unit asserts a real function's output.)
6. **Final:** `npm run lint` (honest-harness-guard `--check`) clean with empty stub allowlist; attestation `agenticExecutedByHarness` non-zero for all four harnesses; `grep 'implements HarnessAdapter\|Scripted\|Capturing'` returns nothing in any surviving AR6-set `*.integration.test.ts`.

**Disposition: APPROVED (7.0 ≥ 7) — builder may proceed, conditioned on CRITICAL-1 and CRITICAL-2 being corrected in the build. I will re-review in Phase 4 against this checklist.**
