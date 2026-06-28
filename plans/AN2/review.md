# AN2 — Code Review (Phase 4)

**Verdict: NOT DONE.** Two CRITICAL blockers. The per-harness live-proof is **theater** — running it confirms zero carriers prove end-to-end auth+retrieval. And the CLI-key / claude / opencode env carrier (`plan.envInjections`) is computed then dropped on the floor — it never reaches a spawned child, so `GH_TOKEN` injection (AC2's named example) cannot work in production. Typecheck green, unit suite green (20/20), but green proves only that files get written.

---

## CRITICAL findings

### C1 — Live-proof is theater; no carrier proves end-to-end auth+retrieval
`packages/server/src/harness/__tests__/AN2-connection-provisioning.real-harness.test.ts`

I ran it (`npm run test:real-harness`, all four binaries present: claude, codex, opencode, gh). Result:

- **claude (`:177-313`)** — real CLI spawned. Agent response: *"I don't see a `ping_test` tool from the `an2-test` MCP server in my available tools."* The MCP connection **FAILED**. The test logs a WARNING (`:290-298`) and **passes anyway** — its only hard assertions are `mcpJson.mcpServers["an2-test"]` is defined (`:307`) and a completion event fired (`:308`). The comment at `:296-298` admits it: *"R1 risk: claude trust-prompt may block external MCP server... For now: log and pass."* This is precisely the R1 trust-prompt the research flagged UNVERIFIED (research §4) — and it **silently degraded**. The MCP server's echo token `AN2_PROBE_OK` appears in **zero** completions.
- **codex (`:322-372`) / opencode (`:381-438`)** — print `"LIVE PROOF"` but **never spawn the binary**. They call `applyProvisioningPlan` (write a file), `mcpServer.close()`, then assert file contents. No CLI spawn, no transport, no tool call. The MCP test server is closed before any client could reach it. Config-shape assertions mislabeled "LIVE PROOF" — identical to the unit/integration tests, [[mock-validation-trap]].
- **gh CLI-key (`:444-501`)** — skipped (no `GH_TOKEN` in env). The sole CLI-key path is unproven on this run.
- **builtin** — correctly scoped out (C1 in arch); not a finding.

**Contract violated:** concept hard-rule 7 + research §5 ("spawning a real session... confirming the agent **actually authenticates to and calls a real MCP server** with the held token... a green test against a stub of our own client proves nothing"). The codebase already has the correct bar: `AL7-two-session-trust-first.real-harness.test.ts:14` asserts `capturedCallCount >= 1` (real binary called the tool via MCP). AN2 falls below its own repo's standard.

**Fix:** (a) claude — investigate `bypassPermissions` + `--strict-mcp-config` (the TODO at `:298`) so the external Bearer MCP connects without a trust prompt; assert `completions.includes("AN2_PROBE_OK")` as a HARD assertion, not a warning. If claude genuinely cannot connect to a project-scoped external Bearer MCP headlessly, that is a **carrier defect** to surface, not paper over. (b) codex/opencode — actually spawn the real binary against the live MCP server and assert the echo token returns, mirroring the claude shape and AL7's `capturedCallCount`. (c) gh — run once with a real token present and record it; WP is not `done` until each carrier-bearing harness has a real green run (hard-rule 7 skip-discipline).

### C2 — `plan.envInjections` is dead: CLI-key + claude/opencode bearer env never reaches the child
`packages/server/src/services/connection-provisioning.ts:270` produces `plan.envInjections` (GH_TOKEN/GITHUB_TOKEN for CLI-key `:209`; `<SVC>_MCP_TOKEN` `:232`; `<SVC>_TOKEN` convention `:237`). **Nothing ever consumes it.**

- `applyProvisioningPlan` returns `mcpTokenEnv` derived **only** from the codex writer (`:388`). Claude-native (`:342`), opencode (`:337`), and no-carrier/CLI-key (`:348`) all return `{}`.
- `session-provisioning.ts:849-860` merges only `connEnv` (the return of `applyProvisioningPlan`) into `mcpTokenEnv`. `plan.envInjections` is never passed, never merged.
- Grep confirms: `.envInjections` is referenced **nowhere** outside `connection-provisioning.ts` and tests.

**Consequence:** for the CLI-key path (AC2's named example "read a repo" via `gh`/`GH_TOKEN`), the token is computed and discarded — `gh` in the spawned session sees no token. For claude/opencode the bearer token rides the inline `.mcp.json`/`opencode.json` header (so those work via the file), making `envInjections` redundant there — but the CLI-key path has **no file carrier**, env is its only carrier, and it is severed.

**Contract violated:** `architecture.md:183` ("inject `GH_TOKEN`/`GITHUB_TOKEN`... into child env via `mcpTokenEnv` → real `gh`") and `:168` ("the merged `mcpTokenEnv` flows into `sessionStartConfig.mcpTokenEnv`"). The arch says envInjections → mcpTokenEnv; the code never does it.

**Fix:** in `applyProvisioningPlan`, fold `plan.envInjections` into the returned `mcpTokenEnv` (all carrier branches), OR merge `plan.envInjections` directly at `session-provisioning.ts:857`. Note the C1 theater is *why* this was never caught: no live run ever spawned a child that read the env.

---

## WARNING findings

### W1 — Integration test sidesteps the real `app`/spawn path on a false pretext
`AN2-connection-provisioning.integration.test.ts:19-21` claims it uses the db-only fixture to avoid "a pre-existing Zod schema error in artifact-preview.ts:41 — unrelated to AN2, present on the base branch." **`npm run check` is green across all 12 packages.** No such error exists. The effect: the integration test never exercises `provisionSession` through the real `app` fixture, so the C2 dead-env path slips through. Use the server `app` fixture and drive a real session-provisioning spawn (the arch's "real deployed session", research §5).

### W2 — `/validate` reachability probe treats ANY HTTP response as "working"
`routes/connections.ts:484` — `if (response.status > 0) return "working"`. A 401/403/404 from the pinned IP marks the connection healthy. AC (AN1) says health reflects "whether it currently works"; a 401 means the held token does **not** work. The MCP-typical-4xx rationale (`:481`) is too broad — it greenlights auth failures. Narrow to: 2xx, or MCP-handshake-shaped responses; treat 401/403 as `needs-attention`.

### W3 — Provisioning-failure swallow can hide a real break behind "graceful degradation"
`session-provisioning.ts:861-869` catches all connection-provisioning errors and continues (correct per hard-rule: a missing tool must not kill the spawn). But combined with C1 (no live proof) and C2 (dead env), a genuine provisioning failure is indistinguishable from success in every automated gate. Acceptable to not abort the spawn; NOT acceptable that no test asserts the success path through this block with a real child. Tie-off lands with the C1 fix (a real spawn that observes the tool actually present).

---

## NIT findings

- **N1** `connection-provisioning.ts:151` — `r.authSource as HeldAuthSource` cast. Justified by the `inArray` filter + comment; acceptable escape hatch (1, documented).
- **N2** `integration.test.ts:380` — `expect(true).toBe(true)` in the AC6 else-branch. Filler assertion ([[testing rule]]: never assert `toBeDefined`/trivially-true). Restructure so the meaningful branch is the only path, or assert the file's absence directly.
- **N3** `real-harness.test.ts:153-169` builtin scope-out test ends `expect(true).toBe(true)` — same filler. The scope-out is legitimately a no-op; consider a doc-only marker rather than a passing assertion that proves nothing.
- **N4** `asMcpShape` cast (`real-harness.test.ts:98-100`) — **NOT a finding.** Verified legitimate: same zod-version-seam bridge as `mcp-bridge.ts:30 asMcpInputSchema` (server zod 4.4.3 vs SDK-deduped zod 3.25.76), behavior-neutral, no wire-shape change. The SDK accepts it at runtime.

---

## Positive lens results (what holds)

- **No gate / no broker** — confirmed. Provisioning installs config + steps out; no approval/reversibility classifier anywhere. Hard-rule 1 holds.
- **`$HOME` hygiene** — confirmed. Every write (`writeCodexTomlEntries:369`, opencode `:406`, claude `:473`) is under `sandboxPath`. codex uses `<sandbox>/.codex-home` not `~/.codex`. HR3 unit + integration assert the path prefix. No write touches real `$HOME`. Hard-rule 3 (location) holds.
- **Secret hygiene** — confirmed. Decrypted token only via `resolver.resolve` (`:198`); never in a route response (`rowToView` excludes it), never in an error/log (warnings interpolate `conn.id`/`reason`, not the token; unit test `:217-238` asserts this). No `console.log` of plaintext.
- **Per-user isolation** — holds for the single-founder model. `listActiveHeld:139` scopes `eq(userId)`; `resolveOwningHumanUserId` is the documented seam for future multi-tenant. AC7 integration test proves user B's plan excludes user A's connections. Hard-rule 4 holds today.
- **Genericity** — confirmed. Second service = one row + (for CLI-key) one `SERVICE_CLI_ENV` entry; no per-service client code. Hard-rule 6 holds. (Caveat: AC4 "second service reachable by configuration" is proven for the MCP path; the CLI-key generic path is undermined by C2.)
- **Idempotent re-apply** — `buildProvisioningPlan` is a pure read-projection; AC4 integration test asserts byte-equal codex config across respawn. Hard-rule 2 holds (for the file carrier).
- **`asMcpShape` cast** — legitimate (see N4).

---

## Acceptance-criteria completeness

| AC | Requirement | Covered? | Evidence / Gap |
|---|---|---|---|
| AC1 | Every spawn has the service's tools present + authenticated, no re-auth | **PARTIAL** | File-carrier (claude/codex/opencode MCP) written + wired (Phase 8b-connections). But "authenticated" is **unproven live** (C1) and the env-carrier (CLI-key) is severed (C2). |
| AC2 | Agent performs a **real op against a real service end-to-end**, no gate | **NOT MET** | This is the live-proof AC. claude live run FAILED (tool not visible); codex/opencode never spawned; gh skipped. Zero end-to-end retrievals (C1). |
| AC3 | Survives respawn — destroy, respawn, tools work again | **PARTIAL** | AC4 integration test proves config is byte-identical across respawn. "tools work" again rides AC2, which is unproven (C1). |
| AC4 | >1 service; second by **configuration not code**; ≥1 real external MCP | **PARTIAL** | Two services materialize from one path (integration `:289`). "real external MCP server" end-to-end unproven (C1). CLI-key second-service path broken (C2). |
| AC5 | Connect/disconnect changes next spawn's toolset; after disconnect tool gone | **MET** | Integration `:330` proves delete → absent in fresh sandbox. Spawn-time read confirmed. |
| AC6 | One user's tools never in another user's sandbox | **MET** | Integration `:389` (AC7 block) proves isolation; query userId-scoped. |

Two of six ACs MET; the two load-bearing live-proof ACs (AC2, AC4's "real external MCP") are NOT met.

---

## Blocking summary

1. **C1** — live-proof is theater (claude silently degraded; codex/opencode never spawn; gh skipped). Make each carrier prove the agent actually calls the MCP tool / `gh` op and retrieves real data, asserted hard.
2. **C2** — `plan.envInjections` never merged into `mcpTokenEnv`; CLI-key (`GH_TOKEN`) and convention carriers reach no child. Wire envInjections → mcpTokenEnv.

Resolve C1 + C2 (and W1 so the integration test runs the real spawn path). The architecture is sound and the file-carrier mechanics are correct; the gap is that nothing proves authentication actually happens, and one whole carrier is disconnected.

---

# Round 2 review

**Verdict: NOT DONE.** One CRITICAL blocker remains (C1 — the claude live-proof is **flaky-red**: it failed on a clean run, passed on the immediate re-run). C2 (dead env) is **genuinely fixed and merged** — verified. The sanity-break proved the codex/opencode live-proofs are **real, not theater**. The product-path headless-trust question resolved **in the builder's favor**: the `.claude/settings.json enableAllProjectMcpServers` mechanism is in the product path, not test-only. Two remaining issues below C1 are WARNING, not blocking.

## (a) Sanity-break result — the test genuinely fails on a broken token (codex/opencode REAL)

I tampered: made `startMcpTestServer` hand out `bearerToken + "-TAMPERED-WRONG"` while the server still checks the real token (every provisioned config now carries a token the server rejects with 401). Reverted after (tree clean — confirmed `git status` empty).

- **codex → RED.** `AN2_PROBE_OK not found` — the 401 blocked the tool call, no sentinel returned.
- **opencode → RED.** Same — `inline Authorization header did NOT authenticate`.

This is the proof round 1 demanded: the live-proof is **not vacuous**. A wrong token makes codex/opencode go red. The sentinel `AN2_PROBE_OK` only appears when the held token actually authenticates to the real MCP server over a real transport via a real spawned binary. C1's codex/opencode theater (round 1: "never spawn the binary") is **fixed** — both now spawn the real CLI, connect to the real stateful streamable-HTTP MCP server, call the tool, and the sentinel returns only on real auth.

## (b) Product-path headless-trust — IN THE PRODUCT PATH, not test-only (builder's favor)

Round-2 crux question: is `enableAllProjectMcpServers:true` only in the test fixture, or does the real claude carrier replicate it? **It is in the product path.** Traced:

- `provision-return-hook.ts:113-155` (`provisionClaudeSettings`) writes `.claude/settings.json` with `enableAllProjectMcpServers: true` for **every** claude session — `returnEnforcementChannel: "settings-claude"` (adapter-pool.ts:479) routes every claude spawn through this writer (session-provisioning.ts:895 Phase 8b-enforce).
- `adapter-pool.ts:449-463` starts claude with `--strict-mcp-config --permission-mode bypassPermissions --settings .claude/settings.json`.

So a real claude session's sandbox cwd gets the same trust marker the test writes — the test's own `.claude/settings.json` write (real-harness.test.ts:333-338) is a **redundant** replication of the product behavior, NOT a test-only crutch. **Not theater at the product level.** Round-1's R1 trust-prompt risk is genuinely closed in production.

Caveat (not blocking): the test does **not** exercise the exact product arg set. Test claude args = `-p … --dangerously-skip-permissions --output-format json --model haiku`; product args = `--strict-mcp-config --permission-mode bypassPermissions --settings .claude/settings.json --output-format stream-json`. The test proves the `.mcp.json` Bearer carrier + `enableAllProjectMcpServers` trust works; it does not prove the product's `--strict-mcp-config` doesn't interfere. Low risk (strict-mcp-config only restricts discovery to the provisioned `.mcp.json`, which is exactly the carrier), but the test arg set drifts from production. Note for the builder.

## CRITICAL (blocking)

### C1-residual — claude live-proof is flaky-red (model refuses the loaded tool)
`real-harness.test.ts:271-397`. Clean run #1 **FAILED**: claude said *"I can see the tool schema is loaded, but I don't have a direct way to invoke MCP tools… The `mcp__an2-test__ping_test` tool is available through the MCP…"* — the MCP server WAS discovered + authenticated (schema loaded ⇒ trust + Bearer auth succeeded), but haiku **declined to invoke it**. Run #2 (immediate, isolated `-t claude`) **PASSED** — sentinel returned.

The carrier mechanism is proven (the tool schema loads consistently = auth + trust works). The flakiness is **haiku model behavior** — it sometimes narrates the tool instead of calling it. But a live-proof gate that is red ~50% of clean runs is not a reliable proof of done, and on my first full-suite run the WP's primary harness was RED. Two acceptable fixes:
- **Pin a more tool-reliable model** for the claude probe (sonnet, not haiku) — haiku's tool-calling reluctance is the root cause, the carrier is fine.
- **Tighten the prompt** to force a single tool call (haiku obeys imperative single-step prompts better), and/or add a bounded retry (≤2) scoped to "model declined to call" — NOT to auth failure (the tamper must still go red on the first attempt).

Until the claude probe is deterministically green on a cold run, AC2 is not provably met for the primary harness. Do not mark done on a coin-flip.

## WARNING

### W-gh — CLI-key live-proof assertion is too loose to prove auth (env-injection IS proven)
`real-harness.test.ts:789` asserts `expect(allOutput).toMatch(/Logged in|github\.com/i)`. I verified live: `gh auth status` with an **invalid** token still prints `github.com` (`X Failed to log in to github.com using token … The token in GH_TOKEN is invalid.`, exit 0). So a bogus token **passes** this assertion — it proves only that `gh` ran with the env var present, not that the token authenticates. Contrast codex/opencode, whose `AN2_PROBE_OK` sentinel only appears on real auth (my tamper proved it). The valuable half (env injection reaches the spawned process) is real; the auth half is unverified. Fix: assert `/✓ Logged in to github\.com account/` (the success-only marker) — that line is absent in the 401 path. Cheap, makes the gh carrier a true live-proof.

### W-C2-merge — the actual `session-provisioning.ts` merge line is not exercised by any test
C2 is **fixed in code** (session-provisioning.ts:864-871 builds `mergedConnEnv = {...plan.envInjections, ...connEnv}` → `mcpTokenEnv`; cli-harness-adapter.ts:399-402 injects every entry into the child env outside the allowlist — traced, correct). But:
- The integration C2 test (integration.test.ts:462) **explicitly states** "the session-provisioning.ts merge itself is not exercised here (no real spawn)" — it only asserts `plan.envInjections` is populated and `applyProvisioningPlan` returns the right shape.
- The real-harness codex/gh tests reproduce the merge **locally in the test** (test:514-516 inject `result2.mcpTokenEnv`; gh test injects `GH_TOKEN` directly) — they never call `provisionSession`, so the merged line 864-871 runs in no test.

So the exact line that was the C2 bug is verified only by code-read. The wiring is present and correct (unlike round 1 where it was absent), so this is regression-exposure, not a current defect — WARNING. Tighten by driving one `provisionSession` integration spawn (server `app` fixture) for a codex/CLI-key session and asserting the child env carries the token, OR accept the code-read + the real-harness local reproduction as sufficient (the merge is two spreads — low regression surface).

### W2 (carried) — `/validate` `status > 0 → working` — RE-ASSESSED, acceptable-with-note
`connections.ts:484`. Round 1 flagged this as marking 401/403 "working". Re-assessed in context: `probeMcpReachability` sends an **unauthenticated** GET (the held token is never attached). An authed MCP server returns 401 to any unauth'd GET regardless of token validity — so narrowing to 2xx would falsely mark every real authenticated MCP `needs-attention`. `status > 0 → working` is the correct verdict **for a reachability probe**. The honest defect is semantic: the health label "working" overclaims — it proves *reachable*, not *the held token authenticates*. Not worth blocking on; the probe genuinely can't prove token validity without sending the token (and sending it on every poll has its own cost). Acceptable as-is; consider renaming the verdict to "reachable" in a future pass. **Downgraded from WARNING to nit.**

## Round-1 findings — disposition
- **C1 (codex/opencode never spawn)** — FIXED. Both spawn the real binary; tamper proves the sentinel is auth-gated.
- **C1 (claude silent degrade)** — PARTIALLY fixed. The silent pass is gone (now a hard `throw` on missing sentinel). But the claude probe is flaky-red on the model layer ⇒ C1-residual above.
- **C2 (dead envInjections)** — FIXED + merged (code-read verified). Test coverage of the merge line is thin ⇒ W-C2-merge.
- **W1 (false Zod pretext in integration test)** — FIXED. The fabricated "artifact-preview.ts:41 Zod error" comment is gone; the db-only fixture is now honestly justified.
- **W3 (provisioning-failure swallow)** — still swallows (session-provisioning.ts:872-880), correct per hard-rule 1; the success path is now observed by the real-harness spawns (tie-off accepted).
- **N2/N3 (filler asserts)** — N3 fixed (builtin scope-out no longer asserts `true`). N2 not re-checked (non-blocking).

## Gates (run independently, not trusted from report)
- `npm run check` — **PASS** (0 errors, all 12 packages).
- `npm run lint` — **PASS** (0 errors; 521 warnings / 158 infos, all pre-existing classes).
- `npm run test:all` — **PASS** (3219 passed, 9 skipped, 285 files).
- `npm run test:real-harness` (AN2) — **claude RED on cold run / GREEN on re-run** (C1-residual); codex GREEN, opencode GREEN, gh GREEN-but-loose (W-gh), builtin scoped-out.

## Blocking summary
1. **C1-residual** — claude live-proof flaky-red (haiku declines the loaded tool). Pin a tool-reliable model or force the call + bounded non-auth retry. Must be deterministically green cold before done.

Then (non-blocking, strongly recommended in the same pass):
2. **W-gh** — tighten the gh assertion to `/✓ Logged in to github\.com account/` so the CLI-key carrier is a true auth proof, not a "gh ran" proof.

The architecture is sound, C2 is genuinely fixed, codex/opencode/gh-env carriers are live-proven (tamper-confirmed), and the claude headless-trust is real product behavior. The single remaining blocker is that the primary harness's proof is non-deterministic.

---

# Round 3 — final

**Verdict: DONE.** The single round-2 blocker (C1-residual: claude live-proof flaky-red on haiku) is resolved. The claude probe is pinned to **sonnet** and is now deterministically green on cold runs; the bounded retry is correctly scoped so it **cannot** rescue an auth/connection failure. The gh assertion is tightened to a success-only marker. No production logic changed in round 3 (the C2 fix from round 2 is byte-identical — only an honest @lore regression-exposure note was added). All gates green. All 6 ACs met; the live-proof is genuine and deterministic.

## (1) Claude determinism + tamper-red — VERIFIED

**(a) Model pinned to sonnet.** `real-harness.test.ts:384` — `"--model", "sonnet"` (was `claude-haiku-4-5`). @lore at `:350-370` documents the haiku tool-decline root cause.

**(b) Retry cannot rescue auth failure — code-verified.** `real-harness.test.ts:406`: `modelDeclined = r.exitCode !== null && out.includes("mcp__an2-test__ping_test")`. The MCP-namespaced tool name only appears in agent output when the tool **schema loaded** (Bearer auth + MCP handshake succeeded). On an auth failure the schema never loads, the namespace never appears, `modelDeclined` is false → the loop breaks at `:408` → the hard assertion at `:424` throws. The retry path (`:413`) is unreachable on auth failure. `MAX_ATTEMPTS = 3` (1 + 2). Success short-circuits at `:395`.

**3× cold green (observed):** ran `claude connects` AN2 probe three times in isolation — GREEN each time, `AN2_PROBE_OK found`, durations 9.9s / 10.8s / 14.2s, **zero "model declined… retrying" lines** (sonnet called the tool first-shot every run). No coin-flip.

**Tamper → RED on attempt 1, no retry rescue (observed):** tampered the **server-side** auth check (`startMcpTestServer:223` → expect `Bearer ${bearerToken}-SERVER-ONLY-TAMPER`) so the provisioned `.mcp.json` still carries the real token (passes the pre-spawn header self-consistency assertion at `:324`) but **every runtime MCP request 401s**. Result: test **RED** after a **real 10.8s claude spawn** (not a 0.7s pre-spawn short-circuit). Claude's own output: *"The `ping_test` tool from the `an2-test` MCP server is not available in my current tool registry… The MCP server may not be connected."* — the 401 blocked schema load exactly as the @lore predicts. **No "model declined… retrying" line printed** — `mcp__an2-test__ping_test` never appeared, so the retry condition was false and the hard assertion threw on the first attempt. The bounded retry provably cannot paper over a broken token. Reverted; tree clean.

> Note on tamper method: tampering the *provisioned* bearer (the plan's `bearerToken`) trips the pre-spawn header assertion at `:324` and fails in <1s before claude spawns — that would NOT exercise the runtime auth path. Tampering the *server's expected* token is the correct tamper: it leaves the written config self-consistent and forces a genuine runtime 401, which is what proved the retry invariant.

## (2) gh assertion — VERIFIED tighter

`real-harness.test.ts:849` now asserts `/✓ Logged in to github\.com account/` (was `/Logged in|github\.com/i`). Verified live against real `gh auth status` in an isolated `GH_CONFIG_DIR` with a bogus `GH_TOKEN`: output is `github.com … X Failed to log in to github.com using token … The token in GH_TOKEN is invalid.` — **no checkmark line**. New regex → **NO MATCH** (correctly rejects the invalid token). Old regex → **MATCH** (confirms the prior assertion passed bogus tokens). The gh carrier is now a true auth-proof, not a "gh ran" proof. (The gh test skips in this env — no `GH_TOKEN` — but the assertion logic is verified against real gh output, and the env-injection half was tamper-confirmed in round 2.)

## (3) No regressions / no weakening — VERIFIED

- Round-3 commit (`ef8d6196`) touched only `real-harness.test.ts` (claude probe + gh assertion) and a comment-only addition in `session-provisioning.ts`. `git show` confirms **no non-comment line** changed in production code — the round-2 C2 merge (`mergedConnEnv = {...plan.envInjections, ...connEnv}`) is byte-identical.
- The C2 @lore note (`session-provisioning.ts:864-875`) is **honest about the gap**: it states the merge is "verified only by code-read + the real-harness tests reproducing the merge locally in-test" and that "no integration test calls provisionSession() through the real `app` fixture." This matches the round-2 W-C2-merge finding — it documents the regression exposure rather than overclaiming coverage. Acceptable: the merge is two spreads of well-typed plain objects (low regression surface), it is code-read-correct, and the carrier behavior is tamper-proven live for codex/opencode/claude.
- Nothing was loosened to get green. The claude assertion is a hard `throw` + `expect(...).toContain("AN2_PROBE_OK")` (unchanged from round 2); only the model and a non-auth retry were added. The gh assertion was *tightened*, not loosened.

## (4) Gates — run independently

- `npm run check` — **PASS** (0 errors, all 12 packages).
- `npm run lint` — **PASS** (0 errors; 521 warnings / 158 infos — all pre-existing classes, unchanged from round 2).
- `npm run test:all` — **PASS** (3219 passed, 9 skipped, 283 files passed / 2 skipped). Unchanged counts from round 2 — no regression.
- `npm run test:real-harness` (AN2 claude) — **GREEN ×3 cold**; tamper → **RED ×1, no retry rescue**. codex/opencode/gh-env tamper-confirmed in round 2.

## Round-2 findings — disposition

- **C1-residual (claude flaky-red)** — **FIXED.** Pinned to sonnet; deterministically green ×3 cold; retry scoped to model-decline only and proven unable to rescue a 401.
- **W-gh (loose gh assertion)** — **FIXED.** `/✓ Logged in to github\.com account/`; verified to reject an invalid token live.
- **W-C2-merge (merge line untested by integration spawn)** — accepted as documented @lore regression-exposure (non-blocking; low surface; code-read + real-harness-local verified). Future hardening pass noted in the @lore.
- **W2 (`/validate status>0`)** — downgraded to nit in round 2; not a blocker.
- Round-2 caveat (test claude arg set drifts from product `--strict-mcp-config`) — non-blocking; `--strict-mcp-config` only restricts discovery to the provisioned `.mcp.json`, which is exactly the carrier. Noted, not gating.

## Acceptance-criteria — final coverage

- **AC1** — every spawn has the service's tools present + authenticated, no re-auth: **MET.** File-carrier written + wired (Phase 8b); "authenticated" now live-proven for claude (sonnet, deterministic) + codex + opencode (tamper-confirmed); env-carrier (CLI-key) wired via the C2 merge.
- **AC2** — real op against a real service end-to-end, no gate: **MET.** claude/codex/opencode each spawn the real binary, connect to a real stateful Bearer MCP server over real transport, call `ping_test`, and the sentinel `AN2_PROBE_OK` returns only on real auth (tamper → red, proven per harness). No gate anywhere in the provisioning path.
- **AC3** — survives respawn, tools work again: **MET.** AC4 integration test proves byte-identical config across respawn; "tools work" rides AC2, now proven.
- **AC4** — >1 service, second by configuration not code, ≥1 real external MCP: **MET.** Two services materialize from one path (integration `:289`); the real external Bearer MCP is end-to-end live-proven; CLI-key second-service path wired via C2.
- **AC5** — connect/disconnect changes next spawn's toolset; after disconnect tool gone: **MET.** Integration `:330` proves delete → absent in a fresh sandbox.
- **AC6** — one user's tools never in another user's sandbox: **MET.** Integration AC7 block proves isolation; query is userId-scoped.

All 6 ACs met. Live-proof genuine (tamper-red per carrier) and deterministic (sonnet cold-green ×3). **Ship-ready.**
