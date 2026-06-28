# Architecture Critique: AR1

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 LI:9 AC:9 DM:9 N:9 MD:8 FMC:9 S:9 V:9

Critique target: `plans/AR1/architecture.md` against `.pipeline/work-packages/TRACK-AR.md` (AR1 §23–68 + preamble). Every claim below was verified against the real codebase, not the plan's prose.

---

## ROUND 2 VERDICT — BUILD-READY (9/10)

Re-reviewed the revised `architecture.md` against the round-1 findings. **Both CRITICAL resolved, all five WARNINGs resolved, no new drift introduced.** Verifications below are against the real tree (vitest 4.1.5 json reporter source, the real AM2/session-provisioning gates, the real verify-attest/check-attestation pair), not the plan's prose.

### C1 — RESOLVED (verified, not hand-waved).
The json-wiring is now fully designed and every load-bearing claim checks out against the real vitest 4 source:
- **JSON reporter shape — verified EXACTLY.** `node_modules/vitest/dist/chunks/index.UpGiHP7g.js:3551–3595`: top-level `testResults[]`, one per file, each carrying `assertionResults[]` and the file path as `name` (= `file.filepath`, line 3594). Each assertion's `status` comes from `StatusMap` (line 3513): `fail→"failed"`, `pass→"passed"`, `skip→"skipped"`, `todo→"todo"`, `only/run/queued→"pending"`. The plan's claimed `passed|failed|skipped|pending|todo` set and the "pending/todo count as skipped" @lore (§313) are correct. *One builder note: the parent file-path field is named `name`, not `filePath` — the plan says "file path on the parent" without naming it; harmless, but the builder reads `entry.name`.*
- **Path is outside the tree — verified.** json writes to `os.tmpdir()` (absolute). The reporter resolves `outputFile` via `resolve(config.root, outputFile)` (line 3623); `resolve(root, absolutePath)` returns the absolute path unchanged (confirmed by node). So the file lands in tmp, `git status --porcelain` (verify-attest.ts:89-90, run *before* the test leg) never sees it, `dirty` cannot flip. The C1 self-contradiction (temp-file vs reuse-test:all-output) is gone — the plan now commits to `os.tmpdir()` unambiguously (§280).
- **No double real-LLM run — verified.** §296 replaces `execSync("npm run test:all")` with `execSync("npm run test")` + `execSync("npx vitest run --config vitest.integration.config.ts --reporter=dot --reporter=json --outputFile=$TMP")`. Since `test:all = test && test:integration` and `test:integration = vitest run --config vitest.integration.config.ts`, this is behaviorally identical to the old single run, with reporter flags added to the second leg. The integration suite runs **once**. R3 closed.
- **Dot reporter preserved — verified.** Config sets `reporters: ["dot"]` (vitest.integration.config.ts:25). Plan passes BOTH `--reporter=dot --reporter=json` (§274, §303), so console output is not lost. Correct.
- **Fail-closed on missing json — verified.** §324-332: `if (!existsSync(INTEGRATION_RESULTS_PATH)) { status=failed; process.exit(1) }`. A green can't be minted without counts. C1.d satisfied.
- **Counts inside the HMAC payload — verified.** §336 embeds `agenticExecuted`/`agenticSkipped` in `payload` before `createHmac` (verify-attest.ts:113 signs `JSON.stringify(payload)`). Tamper-proof. `ATTESTED_TOOLS = ["test","test:integration"]` already exists (verify-attest.ts:63), so the two-leg framing aligns with the declared tools — no drift.

**The contradiction is gone. C1 is real, designed, and correct.**

### C2 — RESOLVED.
The non-existent-precedent claim is removed everywhere. Required-reading §23 now reads "**NOT an allowlist precedent** — none of these has allowlist machinery; the allowlist is net-new." Decision 1 §54, Decision 3 §80-82 all state "**This is new code, not a copied pattern**" and cite the verified `grep allowlist|baseline|--write|known.*debt` returning nothing in ah5/ah6/mock-inventory. ah5 is now cited only for the **fail-closed-on-zero** discipline. The monotonic-shrink rule (dirty+allowlisted→PASS, dirty+not→FAIL, clean+allowlisted→FAIL, stale-path→FAIL) is coherent and each branch is covered by the guard self-test (task 12). Resolved.

### W1 — RESOLVED (verified per-file against the real gates).
- `AM2-builtin-gateway.integration.test.ts:35` — `canProbeOpenAiCompatible = Boolean(OPENAI_API_KEY)`; it has a two-level gate (outer `skipIf(!hasGatewayKey)` :203, inner `skipIf(!canProbeOpenAiCompatible)` :210). Plan maps it to `requireHarness("openai-key")` (= `OPENAI_API_KEY`). Correct — `OPENAI_API_KEY` present ⟹ `hasGatewayKey` true, so the single require collapses both gates soundly.
- `AM2-real-harness-discovery.integration.test.ts:22-23` — any-of-three (`ANTHROPIC ?? OPENAI ?? OPENROUTER`). Plan maps `any-gateway-key` (those exact three). Correct.
- `session-provisioning.integration.test.ts:117` — `skipIf(!process.env.ANTHROPIC_API_KEY)`. Plan maps `anthropic-key`. Correct.
The round-1 hole (helper had no `OPENAI_API_KEY`, mapped builtin-gateway to a wrong any-of set) is fixed: the `HarnessName` vocabulary now carries distinct `openai-key`/`anthropic-key`/`any-gateway-key` names, each documented to its exact gate (§144-157, route checklist §437-445). The old wrong `AI_GATEWAY_API_KEY` name is gone.

### W2 — RESOLVED, sound.
`maxWorkers:1 + fileParallelism:false` two-project config is promoted to THE mechanism (§217-252). `describe.sequential` (round-1's wrong intra-file primitive) is explicitly rejected as wrong for a cross-file constraint. `projects` is verified as established repo precedent (`vitest.config.ts` uses it). `maxWorkers:1` is the real cross-file serializer; `fileParallelism:false` is correctly flagged as belt-and-braces insurance, and the one genuinely-unverified item (exact `fileParallelism` key name under a project block) is correctly scoped as "engineer confirms; maxWorkers:1 alone is load-bearing." Sound.

### W3 — RESOLVED.
Predicate unit test is now task 11 (`is-harness-facing-integration.test.ts`), importing `isHarnessFacingIntegration` from the guard, running in `npm run test`. It covers **both** directions: positive (seam import→true), false-positive #1 (`.test.ts` unit w/ `mock-harness-adapter`→false by suffix), false-positive #2 (web `.integration` no seam→false), false-negative (transitive-only→false, documented miss), and the `mock-harness-adapter`-in-integration→true offender case (§422-428). Guard self-test (task 12) is wired into `verify` via `honest-harness-guard:selftest` *before* `:check` (§258, §429). The single-sourced predicate now feeds both guard and floor with one real test guarding both blast radii. Resolved.

### W4 — RESOLVED.
Verified repo-local `.claude/skills/write-tests/SKILL.md:19` carves the harness out and contains **no** "mock the LLM" invitation. The plan no longer claims the invitation is "gone": §121, §376, §465 all explicitly state the upstream `test-layers.md:22` line "**remains reachable** via on-demand load … Do **not** claim it is gone." R1 (§465) is reframed precisely: AC met at repo surface, upstream residual filed as out-of-PR follow-up + `@lore`. Resolved.

### W5 — RESOLVED.
`check-attestation.ts` floor (§340-357) asserts the non-empty floor FIRST: `if (total === 0) fail(...)` before the zero-executed check. A predicate that selects zero agentic files now FAILS (not passes vacuously), closing the "mis-scoped predicate silently empties the floor" hole — which the plan correctly identifies (§359) as the *deepest* hole the track exists to close, deeper than "all skipped." Back-compat preserved (legacy `agenticExecuted===undefined` skips the block, matching `srcHash?` precedent at check-attestation.ts:60). Resolved.

### No new drift introduced.
- The two-leg verify-attest run is behaviorally identical to `test:all`; `ATTESTED_TOOLS` unchanged; `check-attestation` only reads payload fields, never re-runs. No CI re-run regression.
- Dirty gate runs before the test leg; tmp json is invisible to it. No ordering trap.
- S1–S4 (round-1 suggestions) are all folded in: AL6 collision rename recorded for AR6 (S1/R4), AN1+AM2×3+session-provisioning added to protectedTests (S2, §483-488), import-safety of the `.ts` export noted (S3, §24), R2/R3 locked into the plan body rather than deferred to the engineer (S4).

**Round-2 score: 9/10. Zero CRITICAL, zero WARNING remaining. BUILD-READY.** The −1 is residual, not blocking: (a) one genuinely-unverified config key (`fileParallelism` under a project block) the engineer confirms at build, with a verified load-bearing fallback (`maxWorkers:1`); (b) the upstream `test-layers.md:22` invitation is a knowingly-accepted out-of-repo residual (R1). Neither gates the build. Proceed to `/write-tests`.

---

## ROUND 1 (historical — all findings resolved in round 2)

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:6 N:8 MD:7 FMC:6 S:8 V:7

---

## CRITICAL

### C1 — [plan §Attestation executed/skipped wiring, R3] The single-run json wiring is asserted, not designed — and as described it cannot work.
Verified reality:
- `package.json:21`: `"test:all": "npm run test && npm run test:integration"` — **two separate vitest invocations**.
- `scripts/verify-attest.ts:96`: `execSync(ATTESTED_COMMAND, { stdio: "inherit" })` where `ATTESTED_COMMAND = "npm run test:all"`. It captures **only the exit code**; it reads no file.

The plan (R3 + §verify-attest.ts step 2) says "make `test:all` itself emit the json … and have verify-attest read that file." But:
- `test:all` runs `test` AND `test:integration`. The harness/agentic tests live under `vitest.integration.config.ts`. To get per-file json for the agentic set you must add `--reporter=json --outputFile=<path>` to the **`test:integration`** script — the plan says "the integration leg of `test:all`" but never names the script edit, the temp-path contract, or how `verify-attest` locates that file deterministically (the path must be agreed between the script that writes it and verify-attest that reads it).
- The json reporter on `vitest run` **replaces** the default reporter unless you pass both; the integration config currently sets `reporters: ["dot"]` (`vitest.integration.config.ts:25`). Emitting json via CLI override needs `--reporter=dot --reporter=json` or you lose console output. Unspecified.
- `outputFile` written into the repo tree would flip the `dirty` flag and **break the attestation's own `dirty` gate** (`verify-attest.ts:89`, `check-attestation.ts:146`) unless written to a tmp/gitignored path. The plan says "temp file" in step 2 but then step R3 says reuse the `test:all` output — the two are inconsistent and neither nails the path-is-outside-the-tree requirement.

**Fix:** Specify exactly: (a) which script gains `--reporter=dot --reporter=json --outputFile=<gitignored path under e.g. `.verify-attestations/` or `os.tmpdir()`>`, (b) the literal path constant shared by the emitting script and verify-attest, (c) confirmation that the path is git-excluded so it cannot flip `dirty`, (d) the failure behavior when the json file is **absent** (e.g. test:all crashed before emitting) — must not silently mint `agenticExecuted: undefined` and pass the floor.

### C2 — [plan §Decision 1, §Decision 3, §Required reading] The "allowlist precedent" the guard copies does not exist in the cited files.
The plan repeatedly grounds the phased-allowlist mechanism on existing precedent: Required-reading line 23 ("the in-repo standalone-guard + allowlist precedent the new guard copies"), Decision 1 ("Matches the established in-repo precedent"), Decision 3 ("the same fail-closed discipline as `ah5-no-mock-guard`'s zero-spec guard"). Verified: `scripts/ah5-no-mock-guard.ts` (read in full, 102 lines) has a **fail-on-zero-specs** guard but **no allowlist whatsoever**. `grep allowlist|baseline|--write|known.*debt|remove from` across `scripts/mock-inventory.ts` and `scripts/ah6-no-mock-guard.ts` returns nothing. The standalone-script precedent is real; the **allowlist + `--write-allowlist` + clean-but-allowlisted-fails** mechanism (Decision 3's core) is **net-new**, not a copy. The plan presents novel machinery as a known pattern, which understates its risk and the test burden.

**Fix:** Drop the "copies the existing allowlist precedent" framing. State plainly that the allowlist + monotonic-shrink + `--write-allowlist` is new machinery, and add explicit unit/self-test coverage for it (currently §Verification handles it only by hand at ship — see W3). Keep the `ah5` citation for the standalone-script + fail-closed-on-zero discipline only.

---

## WARNING

### W1 — [plan §requireHarness, §Route checklist] The `ENV_KEY` map omits `OPENAI_API_KEY`, which is the actual gate for AM2-builtin-gateway.
Verified `AM2-builtin-gateway.integration.test.ts:28–34`: the file gates on **`OPENAI_API_KEY` specifically** ("OPENAI_API_KEY must be present specifically — other keys use different provider paths"), with a top-level skip if no gateway key at all. The plan's helper (§requireHarness lines 114–117) defines `gateway-key: ["AI_GATEWAY_API_KEY","OPENROUTER_API_KEY"]` and `anthropic-key: ["ANTHROPIC_API_KEY"]` — **`OPENAI_API_KEY` appears nowhere**. The route checklist (§290) maps `AM2-builtin-gateway` → `gateway-key`, but `requireHarness("gateway-key")` as specified would pass when only `OPENROUTER_API_KEY` is set, while the test body still needs `OPENAI_API_KEY` and would then fail or mis-gate. The helper's `HarnessName` vocabulary is under-specified against the real gate set.

**Fix:** Audit every `skipIf` env probe in the 8 files + `session-provisioning` and enumerate the exact env var each requires; expand `HarnessName`/`ENV_KEY` to cover them (at minimum add `OPENAI_API_KEY` to the gateway set or add a distinct `openai-key` name). The AM2 case shows the migration is not a uniform `requireHarness("gateway-key")` swap.

### W2 — [plan §Lane-collapse mechanics, R2] The serial-execution mechanism is UNVERIFIED and the chosen primitive is used nowhere in the repo.
Verified: vitest 4.1.7; `grep "describe.sequential"` across `packages/` + configs returns **zero** existing uses. The plan's chosen mechanism (§177: "each real-LLM file opt into serialization with `describe.sequential(...)`") is flagged ⚠️ UNVERIFIED by the plan itself, and its cross-file rate-limit interaction is unconfirmed. `describe.sequential` serializes tests **within** a file, not **across** files — the rate-limit constraint is cross-file (parallel real-LLM calls across 4 workers), so `describe.sequential` likely does **not** satisfy the AC ("real-LLM files run serially to respect rate limits"). The fallback (a `maxWorkers:1` sub-project globbing `**/harness/__tests__/*.integration.test.ts`) is the mechanism that actually addresses cross-file serialization.

**Fix:** Promote the fallback to the primary mechanism, or justify why intra-file serialization is sufficient given the constraint is cross-file rate limits. This is a config shape the engineer must lock before build, not "verify against docs."

### W3 — [plan §Verification method details, Dimension 9] The guard and allowlist mechanism — the riskiest new code — is "proven by hand at ship," not by an automated self-test wired into verify.
§277 explicitly declines to wire the guard self-test into CI-fast-checks ("keep it local; assert manually"). For a guard whose entire false-positive/false-negative contract is load-bearing (Decision 2: must flag offending integration, must NOT flag legit unit-stub or web integration), "T-F/T-G run by hand at ship" is the weakest verification in the plan. There is no automated regression net ensuring the guard stays correct as AR2–AR6 churn the test tree. The `isHarnessFacingIntegration` predicate is now **single-sourced into verify-attest** (§203) — a regression in it silently corrupts the attestation floor too, doubling the blast radius of an un-tested helper.

**Fix:** Wire the guard self-test fixtures (`scripts/__fixtures__/honest-harness-guard/`) into a `--selftest` invocation that runs in `verify` (it is a fast static check, exactly the CI-fast-check shape). At minimum, add a unit test for `isHarnessFacingIntegration(filePath, source)` (a pure function over strings — trivially unit-testable as a `*.test.ts`) covering: harness-seam-importing integration → true; web integration → false; `.test.ts` unit → out-of-set; the `mock-harness-adapter` import case. This is the single-sourced predicate both the guard and the floor depend on; it must have a real test.

### W4 — [plan §Decision 4, R1] Deferring the plugin-cache `test-layers.md:22` fix leaves a real residual hole; the plan should state the AC is met by the repo-local surface but flag the upstream invitation as still-reachable.
Verified: repo-local `.claude/skills/write-tests/SKILL.md:19` **already** carves the harness out correctly. The "mock only nondeterministic externals: LLM/model calls" invitation is at `~/.claude/plugins/cache/agent-pipeline/pipeline/0.1.0/skills/write-tests/references/test-layers.md:22` — outside the repo, loaded **on demand from write-tests** (the file header says "Loaded on demand from `write-tests`"). So a builder who follows the SKILL.md's reference into `test-layers.md` **still reaches the mock-the-LLM line**. The AC ("write-tests carves the harness out … the 'mock the LLM' reading is gone" — TRACK-AR §52 validation scenario) is satisfied for the repo-local surface but **not** for the on-demand reference a builder is directed to. The plan's read ("repo-local SKILL.md overrides") is reasonable but the override is not mechanical — nothing stops the plugin reference from being read. R1 correctly flags this; the verdict should be explicit: **AC is met at the repo surface, with a documented residual upstream gap filed as follow-up.** Acceptable to defer (the file is genuinely out of this PR), but the plan must not claim the invitation is "gone" — only repo-local-overridden.

**Fix:** In §Prose edits item 3 and the AC table row, state precisely: repo-local SKILL.md carves it out (AC met); the plugin `test-layers.md:22` invitation remains reachable via on-demand load and is filed as an upstream follow-up (R1). Add the `@lore` the plan promises. Do not soften to "the invitation is gone."

### W5 — [plan §Data Model / payload, §check-attestation.ts] Floor back-compat + zero-zero guard is sound, but the `agenticSkipped > 0` condition has a gap the plan half-acknowledges.
§218 reasons the floor fires only when `agenticExecuted === 0 && agenticSkipped > 0`, arguing that with `requireHarness` "a real skip can't happen (absence throws → failed, not skipped)." Correct — but that means in the **post-AR1 world the floor can essentially never fire** (no skips exist), so it is pure defense-in-depth, as the plan says. The risk: if `isHarnessFacingIntegration` mis-identifies the agentic set (W3) and selects **zero** files, then `agenticExecuted===0 && agenticSkipped===0` → floor passes vacuously, exactly the "100%-skipped agentic surface mints green" failure the track exists to close (TRACK-AR §15). The floor's correctness is entirely a function of the predicate's correctness — which is un-unit-tested (W3). The defense-in-depth is only as strong as the single-sourced predicate.

**Fix:** Strengthen the floor: when the diff/suite is expected to contain agentic tests, assert `agenticExecuted + agenticSkipped > 0` (the set is non-empty) before the executed-floor — otherwise a predicate that selects nothing is itself a silent bypass. At minimum document this as the floor's known blind spot and tie it to the W3 predicate test.

---

## SUGGESTION

### S1 — [plan §Lane-collapse mechanics #1, R4] AL6 rename collision is correctly identified and resolved; verified both files exist (`AL6-real-harness-return-enforcement.integration.test.ts` AND `.real-harness.test.ts`). Good catch. Ensure the new name `AL6-return-enforcement-realbinary.integration.test.ts` is not itself matched by AR6's later "scripted duplicate" removal — record the mapping in the AR6 spec, not just this plan's R4.

### S2 — [plan §protectedTests] The protected-tests list freezes assertions on the 4 renamed files, good (CC-008 satisfied). But the AN1 + AM2×3 + session-provisioning files also get `skipIf→requireHarness` edits (task 3) and are **not** in protectedTests. If their assertion bodies must also stay frozen (the spec says AR1 "only moves the lane"), add them. If only the 4 renamed ones are frozen, state why the others are exempt.

### S3 — [plan §package.json] `verify` chain wires `honest-harness-guard:check` after `ah6-mock-guard:check` (verified `verify` at `package.json:38` ends `… ah6-mock-guard:check && build && desktop build && verify-attest`). The guard must run **before** `build`/`verify-attest` (it does, as planned) — but note `verify-attest` runs `test:all` which now must emit json (C1); confirm ordering so the guard's `isHarnessFacingIntegration` export is import-safe from verify-attest at the point verify-attest runs. No circular-import or build-order trap, but verify the export is from a `.ts` tsx-runnable module, not a compiled artifact.

### S4 — [plan §Risks] R2/R3 are flagged as engineer-resolves-before-commit. Given C1 and W2 elevate these to blocking design gaps (not "verify against docs" tasks), move the locked decision into the plan rather than deferring to the engineer — the architecture-critique gate exists so the engineer does not discover the json-path and serial-lane shape mid-build.

---

## What's Working Well

- **Plan reconciliation is genuinely grounded.** Every spec assumption in the §Plan reconciliation table was verifiable against the real tree (4 real-harness files, the AL6 collision, the 8 skipIf files, the seam modules, `mock-harness-adapter.ts`, the AN1 mislabel exclude at `vitest.integration.config.ts:23`, the `server vitest.config.ts:13` dual-glob). This is the CC-007 (spec/codebase drift) class the critique most often catches — and AR1 mostly avoids it. The out-of-scope exclusions (migration-l1 `!HAS_PG`, AO1 `SKIP`) are correctly identified as non-harness by the import heuristic.
- **`requireHarness` throw-at-collection-scope reasoning is correct** and the security note (throw message names the harness, never the key value; counts inside the HMAC payload) is exactly the right CC-003 thinking for a tooling WP with one real abuse surface (attestation integrity). Dimension 2 (layer integrity) is clean — this is build/test tooling, no layer crossing.

---

## Verdict

**Score 7/10 — ships to build, but C1 and C2 must be fixed in the plan first; W1–W3 should be addressed before `/write-tests`.**

The plan is well-researched and structurally sound — it correctly reconciles against reality on every checkable claim, identifies the AL6 collision, scopes the skipIf migration precisely, and gets the attestation-integrity security thinking right. It is NOT architecture slop.

But it has two CRITICAL defects: (C1) the attestation json-wiring — the literal mechanism for the executed-count floor — is asserted ("read that file") rather than designed, and as worded conflicts with itself (temp file vs reuse-test:all-output) and would break the `dirty` gate if written into the tree; (C2) it grounds its riskiest new machinery (the phased allowlist) on a precedent that does not exist in the cited files. Plus the helper's env-key vocabulary is provably incomplete (W1: OPENAI_API_KEY), the serial-lane primitive is the wrong one for a cross-file constraint (W2), and the guard's load-bearing predicate has no automated test (W3) while now also feeding the attestation floor (W5).

These are plan-level fixes, not a Phase-2 restart. Round 2: lock the json path/script edit (C1), reframe the allowlist as new machinery + add the predicate unit test (C2/W3), expand the env-key map (W1), promote the maxWorkers:1 sub-project (W2). Re-score expected ≥8.
