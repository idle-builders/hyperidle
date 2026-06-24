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
