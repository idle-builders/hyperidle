# AL6 v4 — Phase 4 Code Review (reviewer, fresh/independent)

**Reviewed:** implemented v4 code on `feat/AL6-review-return-hooks` vs `origin/main`. **Plan:** `architecture.md` v4-final (APPROVED 7.4). **Bar (founder, after 4 rejections):** native hook PROVISIONED per harness; the harness enforces; HyperIdle adjudicates over the per-session bridge; PROVEN by real-harness tests against every spawnable harness; nothing silently `completed`.

## Verdict: NOT DONE

Two CODE blockers (not Phase-5 docs) break the founder's core contract:

1. **The file-provisioned Claude/Codex hooks POST to an endpoint that does not exist.** The production hook→adjudicator link is severed. The "FULL BINARY PROOF" tests pass only because they stand up a fake HTTP server that speaks an invented protocol the real server does not serve.
2. **`SessionConfig.returnHook` is declared but never read or threaded.** The SDK in-process closure and the bridge tool operate on two disconnected force counters; the registry-backed adjudication the plan made load-bearing (§4.2, §5.1) is not wired for the SDK path.

Plus: the opencode `process-reengage` channel is not wired into the adapter (proof lives inline in the test, by the test's own admission), and the headline `forceCount>=1` "hook fired in-process" assertions are satisfied by the **drain fallback**, not by real in-process enforcement — the exact v1 shape WARN-F1 said must FAIL the test, not pass it.

---

## AC audit

| AC | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC1 | Every turn/harness ends only after a return; no-return never accepted as `completed` | **PARTIAL** | Drain-gate floor (`evaluateReturn` → `not_returned`, persisted) is genuine and un-bypassable (`session-provisioning.ts:997-1028`). But the *native hook* never reaches the adjudicator (CRIT-1), so on file-provisioned harnesses ONLY the gate floor runs — the v1 shape. Not "the hook fired a block." |
| AC2 | Closed valid-ending set enumerated | **PASS** | `RETURN_ACTION_NAMES` frozen tuple + `isReturnAction` (`shared/.../return-actions.ts:23-42`); closure test retained. |
| AC3 | No-return detected, surfaced (not silently completed) | **PASS** | `session_not_returned` emitted + `endSession(…, "not_returned")` (`session-provisioning.ts:999-1028`); DB-row + bus-event tests green. |
| AC4 | Enforcement uniform — native-block where available, native via a hook PROVEN per harness | **FAIL** | Codex/Claude file hooks cannot reach the bridge (CRIT-1); SDK closure not registry-wired (CRIT-2); opencode re-engage not in the adapter (CRIT-3). "Uniform native-hook enforcement proven per harness" is not delivered — only the drain floor is uniform. |
| AC5 | Mid-turn non-terminal tools unaffected | **PASS** | Gate observes only `tool_call` return-actions; mid-turn tools → `completed`, zero forcing (`AL6-uniform-forcing` AC5; `AL6-return-gate` AC5). |

---

## CRITICAL findings

### CRIT-1 — File-provisioned Claude/Codex hooks POST to a non-existent endpoint; the production hook→adjudicator link is dead. (the founder's bar, unmet)
The hook scripts POST to `${mcpUrl}/return-status`:
- `provision-return-hook.ts:295` (claude): `curl -s -X POST '${mcpUrl}/return-status' …`
- `provision-return-hook.ts:322` (codex): same.
- `mcpUrl` is built as `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}` (`session-provisioning.ts:737`).
- So the hook POSTs to **`/api/mcp/<token>/return-status`**.

The only MCP route is `router.all("/mcp/:token", …)` (`routes/mcp-route.ts:22`) — it matches `/api/mcp/<token>` EXACTLY; the extra `/return-status` segment does **not** match → **404**. And even on the bare path, `bridgeRegistry.handleRequest` speaks **MCP JSON-RPC** (`tools/call`), not the script's protocol (`POST {}` → empty body = allow / non-empty body = the forcing message). There is no `/return-status` route anywhere (`grep` over `src/routes`, `src/mcp` = nothing) and `hyperidle_return_status` is reachable ONLY as an MCP tool invocation, never as a plain HTTP POST.

**Consequence:** in production, a real claude/codex Stop hook fires, curls a dead endpoint, gets an empty body, and **allows the stop** — the native block never engages. The drain-gate floor then records `not_returned`. That is precisely the founder-rejected "hook decorative, gate quietly does all the work" outcome (v1 regression).

**Why no test caught it:** the "FULL BINARY PROOF" tests start `startBridgeServer()` (`AL6-real-harness-…:186`) — a bespoke HTTP server that implements the script's invented `POST /return-status` → plaintext protocol and asserts `callCount>=1`. It proves the *script can curl A server*, not that the script reaches *HyperIdle's* bridge. The bridge token isn't even validated against a real session; the fake server only checks the bearer substring (`:199`). This is a script-exec-against-a-mock proxy, not end-to-end enforcement.

**Fix (code):** either add a real `POST /api/mcp/:token/return-status` route that resolves token→session→enforcement-registry and returns the forcing message (or empty), OR have the hook speak MCP JSON-RPC `tools/call hyperidle_return_status` to `/api/mcp/:token` and parse the tool result. Then point the real-harness tests at the actual server (fixture `app`), not a hand-rolled mock that matches the script.

### CRIT-2 — `SessionConfig.returnHook` is dead: never threaded, never read; SDK closure + bridge tool use two disconnected counters.
Plan §2/§4.2/§5.1 require the SDK/builtin closures to read `config.returnHook`→enforcement registry so the same `{gate, forceCount}` is the single adjudication source. Reality:
- `returnHook?: ReturnHookConfig` exists on the interface (`shared/.../harness-adapter.ts:99`) but `grep -rn returnHook` finds **zero readers** — not in `claude-agent-sdk-adapter.ts`, not built into `sessionStartConfig` (`session-provisioning.ts:771-783`).
- The SDK Stop closure still reads its OWN local `al6` state (`claude-agent-sdk-adapter.ts:186,202`: `shouldForceReturn({returned: al6.returnSeen}, al6.stopHookCount)`) and reports via `getForceReturnCount()` from `al6.stopHookCount` (`:323`).

**Consequence:** the SDK path's force count and the registry/bridge tool's force count are independent. `hyperidle_return_status` (the bridge adjudicator) would never see the SDK's blocks, and the SDK's gate (`al6.returnSeen`) is fed by `translateMessage` event-translation, NOT the drain `ReturnGate` the registry holds. The "one adjudication source of truth" contract is not implemented; `returnHook` is decorative.

**Fix:** thread `returnHook` into `sessionStartConfig` and have the SDK/builtin closures read the enforcement registry (via `sessionId`) instead of local `al6`/`session.forceCount` — as the plan specified.

### CRIT-3 — opencode `process-reengage` is not wired into the adapter; the production opencode path is gate-only.
- `CliHarnessAdapter` has NO `step_finish`/`session.idle` parsing and NO re-spawn loop (read the full file; `streamEvents` just relays stdout; there is no re-invoke).
- The test states it outright: *"The process-reengage wrapper is implemented in the test itself (not yet in CliHarnessAdapter)"* (`AL6-real-harness-…:1209-1212`, `:1399-1402`).
- The provisioned plugin (`provisionOpencodePlugin`) calls `ctx.sendMessage` on `session.idle` and POSTs to the same dead `/return-status` endpoint — and the test's own `@lore opencode-plugin-limit:1214` admits opencode does **not** auto-load project-local plugins, so the plugin never runs anyway.

**Consequence:** for opencode in production, neither the plugin nor any HyperIdle re-engage fires. Enforcement = drain floor only. The "process-reengage proven" claim rests on a test that spawns opencode twice with hardcoded prompts and greps stdout for `step_finish` — it never invokes `provisionSession`, never re-engages on a real no-return turn, and the re-engage logic exists nowhere in shipped code.

**Fix:** implement the turn-end detection + bounded re-spawn (using `reEngageCarrier:"run-arg"`) inside `CliHarnessAdapter` (or the provisioning drain) and prove it through `provisionSession`, not inline in the test.

### CRIT-4 — The headline `forceCount>=1` "hook fired in-process" assertions are satisfied by the DRAIN FALLBACK, not real enforcement. (WARN-F1 inverted)
`computeForceReturnCount(true)` returns `1` whenever a session ends `not_returned` with registry `forceCount===0` (`session-provisioning.ts:946-948`). The real-harness builtin "anchor" test uses `NoReturnBuiltinStub` (`AL6-real-harness-…:417`) — a hand-rolled adapter that declares `builtin-loop` but has **no forcing loop**; it just yields a non-return event. So its `forceCount>=1` (`:548`) comes ENTIRELY from the drain fallback, NOT from in-process enforcement. The test name ("forceCount>=1 (hook fired in-process)") is false. Same for every `makeV4BlockingStub` in `AL6-reprompt-loop` — none run a real loop.

WARN-F1 explicitly required: *"make §9 assert `forceCount>=1` (hook fired) so a trust-skipped no-op FAILS … Without (c) the test is vacuous: a no-op hook + working drain gate still yields not_returned, which the test would wrongly accept."* The drain fallback makes `forceCount>=1` ALWAYS true for any `not_returned`, defeating the exact discriminator the plan said was "the one thing standing between this design and a decorative hook." The real `BuiltinHarnessAdapter` in-process loop (`builtin-harness-adapter.ts:740-767`, genuine) is never exercised with a fake LLM to prove its loop increments the count — only stubs + the fallback are.

**Fix:** remove the `not_returned`→+1 fallback (or scope it so it does NOT satisfy the "hook fired" assertion), and assert `forceCount` from the REAL adapter's enforcement, with a cassette/fake-LLM `BuiltinHarnessAdapter` for the deterministic anchor.

---

## WARNING findings

- **WARN-1 — CODEX_HOME copy is safe but reads `process.env.HOME` not `os.homedir()`** (`provision-return-hook.ts:230`). Copies ONLY `auth.json`+`config.toml`, never SQLite (`:225-239`), into a per-session `<sandbox>/.codex-home` — does NOT mutate `~/.codex`. Safe and correct. The builder's own NOTICED item stands: prefer `os.homedir()` (already imported elsewhere) for portability; `process.env.HOME` is empty on some spawn envs. NIT-level for correctness, but flagged because the codex auth copy silently no-ops on a bad HOME (catch-swallow `:236`) → codex falls back to env auth, fine, but the hook test would then mask it.
- **WARN-2 — `--dangerously-bypass-hook-trust` is correctly scoped** to the per-session spawn only (`cli-harness-adapter.ts:287`, appended in `startSession` when `.codex-home` exists). Good. But the binary-name coupling `this.config.binary === "codex"` (`:283`) is the builder's NOTICED fragility: a renamed/aliased codex binary silently loses CODEX_HOME injection AND the trust bypass → hook never loads. Acceptable for v1 but should derive from the declared channel (`settings-codex`), not the binary string, to match `deriveCliChannel`'s own channel-first intent.
- **WARN-3 — `deriveCliChannel` couples enforcement to binary string** (`cli-harness-adapter.ts:209-213`). `returnEnforcementChannel` config override exists (`:103`, `:499`) and `CLI_TOOL_CONFIGS` sets neither codex nor opencode's channel explicitly — both rely on the binary-name fallback. One rename breaks enforcement silently. Prefer explicit `returnEnforcementChannel` in `CLI_TOOL_CONFIGS` so the type forces it.
- **WARN-4 — `provisionReturnHook` for `settings-claude`/`settings-codex` is called even when `mcpBridgeToken` is undefined** (`session-provisioning.ts:733-739` passes `bridgeToken: ""`/`mcpUrl: ""`). The hook script then curls `'/return-status'` (empty base) — a malformed URL, silently failing. No guard. Compounds CRIT-1.
- **WARN-5 — claude `claudeAuthed()` shells `claude auth status --json`-less and JSON.parses stdout** (`AL6-real-harness-…:127-135`); if the CLI's `auth status` output format differs, auth is mis-detected and the "FULL BINARY PROOF" silently `skip()`s — a green run that proved nothing. Gating is CI-safe (good) but the local-proof claim hinges on these probes actually returning true; capture the proof artifact (the brief requires a captured local run) — none is in the diff.

---

## Lens findings

- **Architecture:** seam placement (Phase 8b beside `.mcp.json`) is correct (`:733`); single `startSession` + single drain confirmed, v3 `while(true)` deleted (`:800-897`). But the hook→bridge contract is broken (CRIT-1) and `returnHook` is an unused interface member (CRIT-2) — contract drift between plan and code.
- **v3 deletion (lens 5):** CLEAN. `re-engage.ts` is an empty stub (no `rewriteSandboxForcing`); `canReEngage`/`hasNativeReturnHook`/`continueSession` removed (guard tests assert absence, `AL6-reprompt-loop:216-241`); `RETURN_ACTION_NAMES`/`isReturnAction`/`ReturnGate`/`not_returned` retained. The retained `re-engage.ts` stub-file is mild slop (an empty module to satisfy a guard test that checks a deletion) — prefer deleting the file and asserting the deletion differently, but not a blocker.
- **Honest coverage (lens 6):** cursor-agent honestly inert (`:1472`, no-throw assertion only) — fine. But codex/claude/opencode are claimed hook-enforced while actually gate-only in production (CRIT-1/2/3). The coverage claim is NOT honest at the code level.
- **Security:** hook command is server-minted token+url, no agent interpolation; script-path-only in JSON (`:121-148`) keeps shell chars out of settings.json — good. Path joins are server-built (`path.join(sandboxPath,…)`), no traversal. Disable-hook→drain-gate backstop holds (gate reads event stream, outside agent control). The dead endpoint (CRIT-1) is a correctness bug, not a vuln. No STRIDE issues found.
- **Slop/simplification (lens 7):** `provisionCodexHome` writes the `.codex/hooks.json` legacy path AND the `.codex-home/` real path "for backward-compat with unit tests" (`:170-171`, `:197-214`) — tests driving a second on-disk artifact is the tail wagging the dog; the legacy `.codex/` write is dead in production (codex ignores it per the code's own `@lore`). Remove it and fix the tests to assert the real path. `{{prompt}}` carrier (`cli-harness-adapter.ts:248-257`) is real and reasonable. The `as unknown as HarnessCapabilities` casts in test stubs are test-only.
- **Doc drift (lens 8):** `architecture.md` §0.3/§3 still describe codex as project-local `.codex/hooks.json` (pre-CODEX_HOME). Note for Phase 5 — NOT a code blocker.

---

## Did the real-harness tests genuinely prove enforcement against all spawnable harnesses? (the founder's bar)

**No.** Honest assessment:
- **claude:** spawns the real binary headless (clean env strips CLAUDECODE, detached process group) and asserts a POST landed on a **fake** bridge implementing an invented protocol. It proves the binary fires a Stop hook and the hook can curl *some* server — it does NOT prove the hook reaches HyperIdle's adjudicator (CRIT-1: that endpoint 404s). Real-binary, fake-adjudicator.
- **codex:** real binary + per-session CODEX_HOME, asserts `turn.completed` and a POST to the same fake bridge. Same gap as claude — proves the CODEX_HOME hook mechanism fires, not that enforcement reaches HyperIdle.
- **opencode:** spawns the real binary twice with hardcoded prompts and greps stdout for `step_finish`. No `provisionSession`, no real no-return turn, no re-engage logic in shipped code (CRIT-3). Proves opencode runs headless — nothing about return-enforcement.
- **builtin:** uses a no-loop STUB; `forceCount>=1` comes from the drain fallback, not in-process enforcement (CRIT-4). The real `BuiltinHarnessAdapter` loop is never exercised here.

The tests are genuine *binary spawns* (not script-exec proxies for claude/codex turn completion), and they skip-gate cleanly for CI — both real wins over prior revisions. But every one of them validates the harness's hook *mechanism* against a mock, and none of them closes the loop to HyperIdle's actual adjudicator or shipped enforcement code. The founder's bar — "the harness enforces; HyperIdle adjudicates via the per-session MCP bridge, proven per spawnable harness" — is **not met**, because the bridge is never in the proven path.

---

## What must change before DONE (code)

1. (CRIT-1) Make the hook reach HyperIdle's real adjudicator: add the `/return-status` route (token→session→registry) or have the hook speak MCP `tools/call`; re-point the real-harness tests at the fixture `app`, not a mock server.
2. (CRIT-2) Thread `SessionConfig.returnHook` and have the SDK/builtin closures read the enforcement registry — one adjudication source.
3. (CRIT-3) Implement opencode turn-end detect + bounded re-spawn in `CliHarnessAdapter`; prove via `provisionSession`.
4. (CRIT-4) Remove/scope the `not_returned`→`forceCount=1` drain fallback so it can't satisfy a "hook fired" assertion; prove the real `BuiltinHarnessAdapter` loop increments the count via a cassette/fake LLM.
5. (WARN-3/WARN-2) Make `CLI_TOOL_CONFIGS` declare `returnEnforcementChannel` explicitly; derive CODEX_HOME/trust from the channel, not the binary string.

Phase-5 docs (architecture.md codex section) are noted but are NOT the reason for NOT DONE.

---

## round 2 — re-review of the v4 FIX cycle (reviewer, skeptical re-verify against source)

**Reviewed:** `ea195117 AL6 v4 FIX` + follow-up merge/attestation commits on `feat/AL6-review-return-hooks`. Builder claimed all four CRITs wired + verify green + "ready for merge." Verified each against SOURCE, not the report.

### Verdict: NOT DONE

Two of four CRITs genuinely fixed (CRIT-4 fully; CRIT-3 production code real). Two remain blocking — **for the same root reason as round 1**: the hook→HyperIdle-route→registry loop is now *wired in production* but is *still proven only against the bespoke `startBridgeServer` mock*. No test exercises the real `/return-status` route, and the SDK path still adjudicates off local state. This WP's bar (founder, after 4 rejections; MEMORY: live-proof lanes must execute the real path before DONE) is not met.

### Per-CRIT verification

| CRIT | Claim | Source verdict | Evidence |
|---|---|---|---|
| CRIT-1 | real `/return-status` route + tests hit it | **PARTIAL — loop unproven** | Route exists + correct (`mcp-route.ts:55-113`), mounted with the **real singleton** registry (`server-factory.ts:386-391`), and the production hook curls the matching path (`provision-return-hook.ts:295,322` → `/api/mcp/<token>/return-status`). Production link is genuinely wired. BUT the binary-proof tests STILL provision the hook with `mcpUrl = bridge.url` (`AL6-real-harness…:632,632`) where `bridge` = `startBridgeServer` (`:192-247`), a hand-rolled HTTP server speaking the invented protocol, and assert `bridge.callCount>=1` (`:689,968,1171`). **ZERO tests POST to the real route via the fixture `app`** (grep: 0 hits). The end-to-end loop (real binary → real route → real registry → block) is unproven; nothing fails if the route 404s, mis-resolves the token, or the registry is unwired. |
| CRIT-2 | returnHook threaded + single adjudication source | **PARTIAL** | `returnHookConfig` is built (`session-provisioning.ts:775-782`) and threaded into `sessionStartConfig.returnHook` (`:795`). The session IS registered in the shared singleton (`:760`), and the SDK Stop hook now calls `enforcementRegistry.incrementForce(hookSessionId)` (`claude-agent-sdk-adapter.ts:215`). BUT the SDK hook STILL **adjudicates off local `al6` state** — `shouldForceReturn({returned: al6.returnSeen}, al6.stopHookCount)` (`:210`), not the registry's `gate`/`forceCount`. The registry is write-only on the SDK path; it is never READ to decide. And `config.returnHook` is threaded but **read by no adapter** (grep: the field has zero readers — same as round 1). The "single adjudication source both paths use" contract is still not implemented; the registry mirrors the SDK count but does not drive it. |
| CRIT-3 | opencode re-engage in the production adapter | **CODE REAL, PROOF ABSENT** | `CliHarnessAdapter.streamEvents` now has a genuine turn-end re-engage loop (`cli-harness-adapter.ts:513-599`): on `session.done`, for `process-reengage` channel, reads the registry, `shouldForceReturn`, `incrementForce`, re-spawns via `spawnFn`, bounded by `reEngageCount < AL6_MAX_FORCE_RETURNS`. This is real production code, not a stub. BUT no test drives it: the opencode "FULL BINARY PROOF" (`AL6-real-harness…:1213-1265`) spawns opencode ONCE with a hardcoded prompt and greps stdout for `step_finish` — it never calls `provisionSession` or `streamEvents`, never re-engages on a real no-return turn. The `@lore` at `:1198-1201` still asserts *"implemented in the test itself (not yet in CliHarnessAdapter)"* — now factually wrong, and the proof it points to does not exercise the adapter. The adapter loop could be deleted and every opencode test would still pass. |
| CRIT-4 | discriminator real (drain sentinel gone) | **FIXED** | `computeForceReturnCount()` returns `registryForceCount + adapterForceCount` only (`session-provisioning.ts:961-966`) — the `not_returned`→+1 sentinel is removed. AC3 (`AL6-reprompt-loop…:320-367`) now uses the **real** `BuiltinHarnessAdapter` (`:341`) with a mocked-never-returning `callLlm` (`:58,327`); the real in-process loop fires and increments `session.forceCount` (`builtin-harness-adapter.ts:746-748`), surfaced via `getForceReturnCount`. A decorative/no-op adapter would yield `forceCount=0` and FAIL `expect(forceCount).toBeGreaterThanOrEqual(1)`. The discriminator is real for the builtin anchor. Stale comment at `:945-948` still describes the removed fallback — clean it (NIT). |

### The decisive question — answered explicitly

**Do the real-harness tests prove the full loop per spawnable harness — real binary → real provisioned hook → real HyperIdle route → real registry → real block → forceCount from a real fire, with no mock standing in, failing if any link breaks?**

**No — for claude, codex, and opencode.**

- **builtin:** YES (in-process, not a spawnable binary). Real adapter + fake LLM → real loop → real increment, no fallback, no mock. Would fail if the loop were decorative. This is the one genuinely-proven harness.
- **claude:** NO. Real binary spawns and the Stop hook fires, but it POSTs to the `startBridgeServer` **mock**, not the real `/return-status` route. The proven assertion is "binary fires a Stop hook that can curl *some* server" — identical to round 1. The real route + registry are wired in production but never in the proven path.
- **codex:** NO. Same as claude — real CODEX_HOME hook fires against the mock bridge.
- **opencode:** NO. The production re-engage code is now real, but the test spawns the binary once and greps stdout; it never drives `CliHarnessAdapter.streamEvents`. The forcing loop is unexercised by any test.

The real route + registry are reachable in production, but **no automated proof** covers: Hono matching `/return-status` before the catch-all; token→session→entry resolution; the hook's parse of a real `forceMessage` body (claude exit-2+stderr / codex decision:block); the opencode adapter re-spawn round-trip. Given the founder's "looks enforced but isn't" rejection history, unproven == not done.

### Adversarial: `completed`-without-return escape

No new escape. The drain-gate floor (`evaluateReturn` → `not_returned`, persisted + `session_not_returned` bus event) remains un-bypassable (`session-provisioning.ts:1015-1031`) and is exercised by passing tests. But with CRIT-1/2/3 unproven, on claude/codex/opencode the floor is STILL the only link actually proven to run — the native hook / re-engage that is supposed to do the primary work is unproven against the real adjudicator. That is the precise shape the founder rejected: gate quietly does the work, hook decorative-until-proven.

### Residual findings

- **CRIT-1 (blocking)** `AL6-real-harness…:625,632,903,1114` — binary-proof tests assert against the `startBridgeServer` mock (`:192-247`), not the real route. Add a test that POSTs to `/api/mcp/:token/return-status` via the fixture `app` with a registered session, asserting forceMessage body + `incrementForce`; and point at least one binary-proof test at the real server (fixture `app` on a real port) so callCount lands on the real registry. Must fail if the route is removed.
- **CRIT-2 (blocking)** `claude-agent-sdk-adapter.ts:210` — SDK Stop hook adjudicates off local `al6`, not the registry it increments; `config.returnHook` has zero readers (`session-provisioning.ts:795` threaded, never consumed). Make the registry the read source (or delete `returnHook` from `SessionConfig` if the singleton-import is the intended single source — then the "threaded" claim is just dead config).
- **CRIT-3 (blocking)** `cli-harness-adapter.ts:513-599` real but untested — drive the re-engage loop through `streamEvents` with an injected `spawnFn` (deterministic, no binary) asserting: second spawn occurs, args carry `forceMsg`, registry `incrementForce` called, bounded at budget. Fix the false `@lore` at `AL6-real-harness…:1198-1201`.
- **NIT** `session-provisioning.ts:945-948` — stale comment describes the removed drain fallback; delete to match `:952-960`.
- **WARN (carried from round 1, unaddressed):** `CLI_TOOL_CONFIGS` still derives codex/opencode channel + CODEX_HOME/trust from the binary string, not an explicit `returnEnforcementChannel` (`cli-harness-adapter.ts:209-213,283`). One rename silently disables enforcement.
- **Phase-5 (note only, NOT a blocker):** `plans/AL6/architecture.md` §0.3/§3 still describe codex as project-local `.codex/hooks.json` (pre-CODEX_HOME).

### What is now genuinely proven end-to-end vs still mock/floor

- **Genuinely proven:** builtin in-process forcing (real adapter + fake LLM, real increment, no fallback — CRIT-4); the drain-gate floor (`not_returned` persisted + emitted); the registry-backed adjudication *logic* in isolation (`returnStatusTool.handler` unit tests); production *wiring* of the route + singleton registry (by inspection, `check` green).
- **Still mock / unproven:** the hook→real-route→registry HTTP round-trip (claude, codex); the opencode adapter re-engage loop; the SDK path reading the registry. These are wired but rest on a mock (`startBridgeServer`) or a test that bypasses the adapter — exactly the round-1 gap, narrowed but not closed.

### AC table (round 2)

| AC | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC1 | Turn ends only after a return; no-return never silently `completed` | PASS (floor) | Drain floor un-bypassable + proven (`session-provisioning.ts:1015-1031`). |
| AC2 | Closed valid-ending set enumerated | PASS | `RETURN_ACTION_NAMES` + `isReturnAction`; closure test green. |
| AC3 | No-return detected + surfaced | PASS | `session_not_returned` + `endSession(…, "not_returned")`; AC3 builtin test green with real loop. |
| AC4 | Enforcement uniform — native hook PROVEN per harness | **FAIL** | builtin proven; claude/codex hook→adjudicator proven only vs mock (CRIT-1); SDK reads local not registry (CRIT-2); opencode re-engage untested (CRIT-3). |
| AC5 | Mid-turn non-terminal tools unaffected | PASS | Gate observes only return-action tool_calls; uniform-forcing AC5 green. |

**Bottom line:** CRIT-4 fixed; CRIT-3 production code now real; CRIT-1/CRIT-2 narrowed to a proof + single-source gap but still block. The full hook→adjudicator loop is wired but not proven against the real server for any spawnable binary harness. NOT DONE.

---

## round 3

**Reviewed:** round-2 fix (commits `31273abe`, `cb0c5478`) vs round-2 findings. Verified every claim against source; ran the AL6 suites; performed two decisive sanity-breaks (nullify route registry read; disable adapter re-engage loop).

### Verdict: NOT DONE

CRIT-1, CRIT-2, CRIT-4 are genuinely closed. CRIT-3 is **half-closed**: the *abstract* adapter re-engage loop is now real and test-driven, but it is proven against a **fabricated config shape that is not what production ships**. The production opencode re-engage spawns a malformed command. This is the same "tests validate a shape that isn't what ships" failure mode that got prior AL6 rounds rejected.

### What round 2 genuinely fixed (verified at source + by sanity-break)

- **CRIT-1 — mock deleted, real route proven.** `startBridgeServer` no longer exists (grep: only in comments). `startRealServer` (`AL6-real-harness-...integration.test.ts:222`) mounts the REAL `createMcpRoute(bridgeRegistry, enforcementReg)` via `@hono/node-server`. The claude FULL BINARY PROOF (`:726-740`) and codex CODEX_HOME proof (`:1223-1235`) assert the REAL `enforcementReg.get(sessionId).forceCount >= 1` — not a mock callCount. `AL6-return-status-route.test.ts` (8 tests) drives the real route via `app.request()`. **Sanity-break performed:** replacing `const entry = enforcementRegistry.get(sessionId)` with `undefined` in `mcp-route.ts:82` drops exactly 2/8 (forceMessage-body + forceCount-increment); the other 6 are allow-stop paths that correctly stay green. Not vacuous. Production wiring confirmed: `server-factory.ts:389` passes the real `enforcementRegistry` to `createMcpRoute`.
- **CRIT-2 — SDK closure reads the registry.** `claude-agent-sdk-adapter.ts:222-237`: the Stop hook adjudicates from `enforcementRegistry.get(hookSessionId)` via `shouldForceReturn(entry.gate, entry.forceCount)`; it does NOT read `al6.returnSeen`/`al6.stopHookCount` for the decision (`al6.stopHookCount++` at `:229` is a secondary counter for `getForceReturnCount`). `al6.returnSeen` is set at `:379` but never read by the hook — dead for the decision (builder's flag is correct). SDK T7 tests register a real registry entry and assert block/approve transitions + a `testGate.returned=true` approve path — binding to the registry's gate, not local state. The registry is the single source consulted by both the curl-hook (route) and the SDK closure.
- **CRIT-4 — no drain-floor sentinel.** `computeForceReturnCount()` (`session-provisioning.ts:949-954`) is pure `registryForceCount + adapterForceCount`; no `+1`. The builtin CI anchor uses the real `BuiltinHarnessAdapter` + mocked `callLlm`; the no-return test asserts `forceCount>=1` from a real in-process fire. A decorative/no-op hook yields 0 and FAILS. Genuinely fixed.

### CRIT-3 — production opencode re-engage is malformed; test masks it (BLOCKER)

The adapter re-engage loop (`cli-harness-adapter.ts:513-599`) is real and registry-driven. **Sanity-break performed:** disabling it (`if (forceMsg !== null && false)`) drops 4/6 `AL6-cli-reengage-adapter.test.ts` tests — it exercises production code, not test-local logic. Good.

**But the test config is not the production config:**
- `AL6-cli-reengage-adapter.test.ts:44-55` builds `makeProcessReEngageConfig()` with `args: ["run", "--format", "json"]`.
- Production opencode (`adapter-pool.ts:372-391`) ships `args: ["--dir", "{{sandbox}}"]` — **no `run` subcommand.**

The re-engage path (`cli-harness-adapter.ts:545-551`) template-strips the base args and appends the forcing message:
```
resolvedBaseArgs = ["--dir", "{{sandbox}}"].map(a => a.replace(/\{\{[a-z]+\}\}/g, ""))  // → ["--dir", ""]
finalReEngageArgs = ["--dir", "", "<forceMsg>"]
```
So production re-engage spawns `opencode --dir "" "<forceMsg>"`:
- `--dir ""` — empty working directory (the sandbox path is lost; the comment at `:546-548` admits "we can't re-resolve here … use empty fallbacks").
- No `run` subcommand — the forcing message is a stray positional to bare `opencode`, NOT the `opencode run <msg>` prompt the code's own comments (`:529,533,543`) and lore (`:388`) assume.

The forcing message is **not delivered as a prompt** to a re-engaged opencode turn in production. The whole `reEngageCarrier:"run-arg"` mechanism is built for `opencode run <msg>`, but the shipped config never invokes `run`. The integration "process-reengage PROOF" (`:1438-1522`) doesn't catch this either: it spawns `opencode run <msg>` directly via test-local `spawnDetached` and stdout-greps for `step_finish` — it never routes through `CliHarnessAdapter.streamEvents`, the route, or the registry.

**Net:** opencode is the one spawnable harness whose production enforcement path is NOT proven end-to-end and is in fact broken. Per MEMORY (`feedback_tests_must_not_drive_behavior`, `feedback_agent_behavior_needs_live_eval_and_forcing`): a test that substitutes a working config for the shipped-but-broken one is not proof.

### Per-harness end-to-end proof status (the decisive question)

| Harness | real binary | real provisioned hook | real route | real registry | force from real fire | Status |
|---|---|---|---|---|---|---|
| claude-code | yes (`claude -p`, 16.3s) | yes (settings Stop hook) | yes (`/api/mcp/:token/return-status`) | yes | `forceCount>=1` (`:740`) | **PROVEN** |
| codex | yes (`codex exec`+CODEX_HOME, 11.5s) | yes (hooks.json Stop) | yes | yes | `forceCount>=1` (`:1235`) | **PROVEN** |
| builtin | n/a (in-process) | n/a (in-process loop) | n/a | yes | `forceCount>=1` real loop, no floor | **PROVEN** |
| opencode | spawned, but NOT via adapter re-engage | re-engage spawn is malformed (`--dir ""`, no `run`) | not touched | adapter test uses **fabricated** config | greenwashed | **NOT PROVEN — broken in prod** |
| cursor-agent | honestly inert | — | — | — | — | n/a (declared inert) |

### Adversarial / NOTICED items adjudicated

- **No `completed`-without-return escape:** confirmed. `session-provisioning.ts:1003-1019` emits `session_not_returned` and persists `outcome="not_returned"` (never `"completed"`). Gate stays the backstop, not the only proven link for claude/codex/builtin.
- **Re-engage arg template-stripping (`cli-harness-adapter.ts:545-550`):** **REAL issue**, and it is the heart of CRIT-3. `["--dir","{{sandbox}}"]` → `["--dir",""]` — empty sandbox dir + no `run` subcommand. Not harmless.
- **Dead `session.al6.returnSeen` (`claude-agent-sdk-adapter.ts:379`):** **harmless** to the decision (hook reads the registry, not `returnSeen`). NIT — remove or document; not a blocker.
- **Stale comment `session-provisioning.ts:1022`** ("forNotReturned=true: drain fallback adds 1") — false; `notReturnedForceCount` just calls the same fallback-free `computeForceReturnCount()`. **NIT** (carries the round-2 NIT family; the `:945-948` comment was fixed, this sibling at `:1022` was missed).

### Suite status

- `AL6-return-status-route.test.ts` (8) + `AL6-cli-reengage-adapter.test.ts` (6) + `claude-agent-sdk-adapter.test.ts` (34) = **48 pass**.
- `AL6-real-harness-...integration.test.ts` = **15 pass** (binaries present + authed on this host; claude/codex/opencode tests RAN, not skipped — verified via `--reporter=verbose`).

### Residual findings

- **CRITICAL** `cli-harness-adapter.ts:545-551` + `adapter-pool.ts:376` — production opencode re-engage produces `opencode --dir "" "<forceMsg>"`: empty working dir + no `run` subcommand → forcing message not delivered. The `AL6-cli-reengage-adapter.test.ts` config (`["run","--format","json"]`) diverges from the shipped config (`["--dir","{{sandbox}}"]`), so the defect is unproven/masked. Fix: re-resolve `{{sandbox}}` against the live session in the re-engage path (the session already holds `sandboxPath`/`spawnEnv`), and construct the actual production invocation (verify whether opencode prompts via `run <msg>`, stdin, or `--prompt`); then drive `streamEvents` with the **real** `CLI_TOOL_CONFIGS.opencode` config in the test.
- **NIT** `session-provisioning.ts:1022` — stale "drain fallback adds 1" comment; no fallback exists.
- **NIT** `claude-agent-sdk-adapter.ts:379` — `al6.returnSeen` write is dead for adjudication; remove or annotate.
- **Phase-5 (note only):** `architecture.md` codex CODEX_HOME doc drift — not a code blocker.

### AC table (round 3)

| AC | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC1 | No-return never silently `completed` | PASS | `session-provisioning.ts:1003-1019` persists+emits `not_returned`. |
| AC2 | Closed valid-ending set | PASS | `isReturnAction` + closure test green. |
| AC3 | No-return detected + surfaced | PASS | `session_not_returned` emit; builtin AC3 green w/ real loop. |
| AC4 | Native hook PROVEN per spawnable harness | **FAIL** | claude/codex/builtin proven end-to-end vs real route+registry; **opencode production re-engage malformed + proven only against a fabricated config** (CRIT-3 residual). |
| AC5 | Mid-turn non-terminal tools unaffected | PASS | Gate observes only return-action tool_calls. |

**Bottom line:** Three of four spawnable harnesses (claude, codex, builtin) now prove the full hook→adjudicator→registry→real-fire loop against the shipped server — a real, verified improvement over rounds 1–2. One harness (opencode) ships a broken re-engage invocation that its test masks by substituting a different arg shape. AC4 ("enforcement uniform across every spawnable harness") is not met. NOT DONE.

---

## round 4 (final)

**Reviewed:** `2d6e9c74 fix(AL6): fix opencode re-engage invocation` vs the round-3 CRIT-3 residual. Verified every claim against SOURCE and by running (incl. a revert-the-fix sanity-break + the full integration suite with real binaries).

### Verdict: DONE

The round-3 blocker is genuinely closed. opencode production re-engage now builds the REAL headless invocation; the test drives the REAL shipped config and FAILS on the old broken shape; the integration proof spawns the real binary with the exact production-shaped args. No regression to the proven three (claude, codex, builtin). All four spawnable harnesses are proven end-to-end. Nothing silently completes.

### CRIT-3 — closed (verified at source + by sanity-break)

**1. Production re-engage is correct.** `cli-harness-adapter.ts:551-560`: for `reEngageCarrier:"run-arg"` the adapter builds `["run", forceMsg, "--format", "json", "--pure", (+ "--model", reEngageResolvedModel)]` from scratch — `run` subcommand present, forcing message carried as the run-arg, model from the LIVE session (`CliSession.reEngageResolvedModel`, stored at `startSession` from `config.resolvedModel.model`, `:374`). The malformed strip-`{{sandbox}}`→`""` logic is GONE from the run-arg path; cwd is `session.sandboxPath` so `--dir` is unnecessary on re-engage. No empty-string args. The template-strip survives ONLY on the non-run-arg `else` fallback (`:566-569`), now correctly `.filter((arg) => arg.length > 0)` to drop empty strings. Correct.

**2. The test drives the REAL shipped config.** `AL6-cli-reengage-adapter.test.ts:65` imports `CLI_TOOL_CONFIGS.opencode` (verified `["--dir", "{{sandbox}}"]` at `adapter-pool.ts:376`) — NOT a fabricated `["run","--format","json"]`. Asserts `reEngageArgs[0]==="run"`, `.toContain(AL6_FORCE_RETURN_MESSAGE)`, `.not.toContain("")`, `--format`+`json` present. **DECISIVE CHECK — performed:** reverted the production fix to the old template-strip (`[...resolvedBaseArgs, forceMsg]`) → exactly **2/6 tests FAIL** with `AssertionError: expected '--dir' to be 'run'` (lines 203, 320). Restored; 6/6 pass. The test genuinely discriminates the broken invocation against the real config — not a greenwash.

**3. Real-binary opencode proof.** `AL6-real-harness-...integration.test.ts:1438-1522` ("LIVE process-reengage PROOF") spawns the REAL opencode binary twice via `spawnDetached` + `buildCleanEnv` (not stub, not stdout-grep-only): first `opencode run <noReturnPrompt> --format json --pure --model <model>` → asserts `step_finish`; re-engage `opencode run <FORCING_MESSAGE> --format json --pure --model <model>` → asserts `step_finish` + both `exitCode===0`. The re-engage args are the SAME shape production builds — the round-3 divergence (prod `--dir ""` vs test `run`) is closed; the two halves connect on one arg shape. Skip-gated for CI (`skipIf(!opencodeInstalled)` + `opencodeAuthed()` → `skip()`). Ran here (real binary, 7.7s, not skipped).

Honest split (acceptable, same model as builtin): the adapter-loop + registry round-trip is proven by the unit test (real config, injected spawnFn, registry increment, budget bound); the real-binary acceptance of that exact invocation is proven by the integration test. Both now agree on the invocation shape — neither masks the other.

### No regression to the proven three (verified)

- **CRIT-2 intact.** SDK Stop hook (`claude-agent-sdk-adapter.ts:221-223`) still reads `enforcementRegistry.get(hookSessionId)` and adjudicates via `shouldForceReturn(entry.gate, entry.forceCount)` — registry is the single decision source. The removed dead `al6.returnSeen=true` write (`:375`, was in the `tool_use` loop) is NOT on this path; `al6.stopHookCount++` retained as the secondary counter for `getForceReturnCount`. `isReturnAction` import dropped from the SDK adapter only — still imported+used in `cli-harness-adapter.ts:33,719`. `npm run check` PASS (13/13 packages) — the import/field removal compiles clean.
- **CRIT-4 intact.** `computeForceReturnCount()` (`session-provisioning.ts:949-954`) = `registryForceCount + adapterForceCount`, no `+1` drain sentinel.
- builtin/claude/codex integration tests all green with real binaries.

### NITs — both resolved

- `session-provisioning.ts:1022` stale "drain fallback adds 1" comment — REMOVED (confirmed; line is now `const notReturnedForceCount = computeForceReturnCount();` with no stale comment).
- `claude-agent-sdk-adapter.ts` dead `al6.returnSeen=true` write — REMOVED, replaced with an accurate `@lore` explaining the registry is the adjudicator. Clean.

### Suite status

- Unit: `AL6-cli-reengage-adapter.test.ts` (6) + `AL6-return-status-route.test.ts` (8) + `claude-agent-sdk-adapter.test.ts` (34) = **48 pass**.
- Integration: `AL6-real-harness-...integration.test.ts` = **15 pass** — claude (22.5s), codex CODEX_HOME (27.4s), opencode FULL BINARY (3.9s) + LIVE re-engage PROOF (7.7s), builtin anchors, cursor inert — all RAN on this host, none skipped (`--reporter=verbose` confirmed). No flake observed this run (builder-flagged claude binary-proof flake under parallel load did not reproduce; it is a real-LLM/timing flake, not a logic defect — note for ship-time retry, not a blocker).
- `npm run check`: PASS, 13/13 packages.

### `completed`-without-return escape

No escape. `session-provisioning.ts:1019` persists `outcome="not_returned"` (never `"completed"`) + emits `session_not_returned`; the drain-gate floor remains the un-bypassable backstop. With CRIT-1/2/3/4 all closed, the floor is no longer the ONLY proven link for any harness — the native hook / re-engage is proven primary for all four.

### The decisive question — answered per harness

Is the FULL loop proven end-to-end for ALL FOUR spawnable harnesses — real binary → real hook/re-engage → real route/registry → real block/force, NO mock, NO fabricated config, failing if any link breaks?

**Yes.** cursor-agent honestly inert (n/a).

### Per-harness AC4 proof table (round 4 — final)

| Harness | real binary | real hook / re-engage | real route / registry | force from real fire | proof fails if link breaks | Status |
|---|---|---|---|---|---|---|
| claude-code | yes (`claude -p`, 22.5s) | yes (settings.json Stop hook) | yes (`/api/mcp/:token/return-status` → singleton registry) | `enforcementReg.forceCount>=1` (`:740`) | yes (nullify registry read → 2/8 route tests fail, verified round 3) | **PROVEN** |
| codex | yes (`codex exec`+per-session CODEX_HOME, 27.4s) | yes (hooks.json Stop) | yes | `forceCount>=1` (`:1235`) | yes | **PROVEN** |
| builtin | n/a (in-process) | n/a (real in-process forcing loop) | yes (registry) | `forceCount>=1` real loop, no drain floor | yes (no-op adapter → forceCount=0 fails) | **PROVEN** |
| opencode | yes (`opencode run <msg>` headless, real spawn) | yes (run-arg re-engage, production-shaped args) | yes (registry incrementForce in adapter loop; route n/a for process-reengage channel) | `forceCount>=1` (unit, real config) + real binary completes forced turn (integration) | **yes (revert fix → 2/6 unit tests fail `--dir`≠`run`, verified this round)** | **PROVEN** |
| cursor-agent | honestly inert | — | — | — | — | n/a (declared inert) |

### Residual (non-blocking)

- **Phase-5 doc drift (note only):** `plans/AL6/architecture.md` codex CODEX_HOME section — not a code blocker.
- **Real-LLM flake (ship-time note):** the claude FULL BINARY PROOF is a live-LLM/timing test; may flake under parallel load. It is e2e/live-local-lane (MEMORY: e2e is local-only), skip-gated for CI. Re-run on a transient red; not a logic defect.

**Bottom line:** All four spawnable harnesses (claude, codex, opencode, builtin) now prove the full real-binary → real-hook/re-engage → real-registry → real-force loop, with no mock and no fabricated config, each failing if any link breaks. The round-3 opencode malformed-invocation blocker is fixed at source and the masking test is replaced with one that discriminates the defect. Nothing silently completes. **DONE.**
