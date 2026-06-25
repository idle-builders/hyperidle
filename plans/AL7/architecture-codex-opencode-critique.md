# Architecture critique — AL7 delta: codex + opencode MCP wiring + real-harness lanes

**Reviewer:** single-persona reviewer (Phase 2). **Target:** `plans/AL7/architecture-codex-opencode.md`. **Scope:** delta only — the locked AL7 trust-first loop, router-at-`registry.invoke`, tailored_grant/CAS, two-session model are NOT re-litigated. Verified every load-bearing claim against the actual code (template lane, AL6 recipes, adapter config, Phase 8b, bridge transport, live-proof probe).

**Verdict: score 8/10. No CRITICAL. Approved for build** — conditional on the builder honoring WARNING-1 (R1 founder-acceptance must be explicit, not buried) and WARNING-2 (AC8 control-spawn must actually be written, not described).

---

## Code-grounded verification (what I checked, not what the plan claimed)

| Plan claim | Code reality | Verdict |
|---|---|---|
| `{{mcpUrl}}` TemplateVar + `mcpConnectionInfo.url` resolution already exist | `cli-harness-adapter.ts:49` (union), `:306` (resolves from `config.mcpConnectionInfo?.url`) | TRUE |
| Production bridge is stateless | `mcp-bridge.ts:110` `sessionIdGenerator: undefined` + `@lore X2 D1` | TRUE |
| Production `mcpConnectionInfo.url` = `${mcpBaseUrl}/api/mcp/${token}` | `session-provisioning.ts:837` | TRUE |
| Template lane uses a STATEFUL test server at `/mcp/:token`, NOT the prod `/api/mcp/:token` bridge | `AL7-...real-harness.test.ts:266-378` (`buildStatefulMcpServer` + `app.all("/mcp/:token")` override) | TRUE |
| CODEX_HOME injected OUTSIDE the allowlist (per-session, not forwarded) | `cli-harness-adapter.ts:331-338` + `@lore AL6 codex-codex-home` | TRUE — plan's "mirror CODEX_HOME for the token env" is sound |
| AL6 codex recipe: `exec <prompt> --json --dangerously-bypass-hook-trust`, git-init'd sandbox, copy only auth.json+config.toml | `AL6-...real-harness.test.ts:889-956` | TRUE verbatim |
| AL6 opencode recipe: `run <msg> --format json --pure --model openrouter/~anthropic/claude-haiku-latest` | `AL6-...real-harness.test.ts:1035-1051, 1208-1242` | TRUE verbatim |
| `CLI_TOOL_CONFIGS.opencode.args` is currently `["--dir","{{sandbox}}"]`, eventFormat `"text"` | `adapter-pool.ts:376, 380` | TRUE — the plan's claim it "never completes a headless turn" is correct: `--dir` alone launches the TUI |
| `per-harness matrix` block asserts `hasMcpUrlSlot === false` and will become false | `AL7-...real-harness.test.ts:885-921` | TRUE — must be deleted, not inverted (plan says delete; correct) |
| live-proof codex/opencode hardcoded `wiring-needed`; probe throws | `live-proof-lanes.ts:59-62, 97-110` | TRUE |

The plan's reconciliation table is honest. No fabricated capability claims; the binary-research block matches the proven AL6 spawn recipes. The "don't assume external tool capabilities" rule is satisfied — every config dialect is backed by a real `--help`/`mcp get --json` capture against the installed binaries.

---

## R1 — the false-green vector (adversarial focus, as instructed)

**This is the one finding that matters.** I went after it hard.

**The gap, stated plainly:** Production routes a CLI through `mcpConnectionInfo.url = ${mcpBaseUrl}/api/mcp/${token}` → the **stateless** bridge (`createMcpBridge`, `sessionIdGenerator: undefined`). The real-harness lanes route the CLI through a **stateful** test server at `/mcp/:token` (`buildStatefulMcpServer`, `sessionIdGenerator: () => randomUUID()`). These are different transports. The new codex/opencode lanes inherit this — §2a explicitly points `writeCliMcpConfig` at `<stateful>/mcp/<token>`, NOT `/api/mcp/<token>`.

**Consequence:** The real-binary lanes prove `real codex/opencode → MCP HTTP → registry.invoke → capture → grant → file written` against a **stateful** transport. They do NOT prove that a real CLI can talk to the **production stateless** bridge. The template lane's own `@lore` (line 254-264) admits stateless mode throws `Stateless transport cannot be reused across requests` on the second request — which is exactly what a real multi-request CLI client does. So there is positive evidence in the codebase that the production stateless bridge would FAIL against any real HTTP-MCP CLI client (claude included).

**Is the compensating test adequate?** No — and the plan is honest that it isn't end-to-end. `cli-mcp-config.integration.test.ts` (AC5) only asserts the **config-file shape** (toml block present, json parses, token placement). It proves "we wrote the right URL into the right file in the right dialect." It does NOT prove "a real CLI pointed at the production stateless bridge completes a tool call." Those are different claims. The config-shape test would stay green even if the production stateless bridge is 100% broken for HTTP-MCP CLI clients.

**Is scoping it out honest or a punt?** It is **honest** (R1 surfaces it, names it shared-with-claude, names it pre-existing, points to the compensating test's limits) — but the framing under-sells the severity. The plan says "if the founder wants the production stateless bridge proven against a real CLI, that's a separate finding." The codebase evidence is stronger than "if the founder wants": the stateless transport **demonstrably cannot serve a multi-request CLI client** (the template lane was forced to swap it out for exactly this reason). So the production HTTP-MCP path for *all three CLIs* is, by the code's own admission, **unproven and likely broken** — and this delta ships two more lanes that paper over it with a stateful test double.

This is not a CRITICAL for *this delta* because: (a) it is genuinely pre-existing and shared with the already-accepted claude lane, (b) the delta's stated scope is "mirror claude," and mirroring claude faithfully includes mirroring its transport workaround, (c) the production CLI HTTP-MCP path may not even be the shipping path (the SDK adapter uses the SDK directly per `mcp-bridge.ts:264` lore — though codex/opencode have **no** SDK adapter, so for them the HTTP bridge IS the only path, which sharpens the gap for codex/opencode specifically vs claude).

**WARNING-1 (must-fix-in-plan-framing, not in-code):** The R1 callout must be elevated from a buried risk bullet to an **explicit founder-acceptance gate** in the plan, with the sharper statement: *"For codex and opencode there is no SDK adapter — the HTTP MCP bridge is the ONLY production transport. The production bridge is stateless and the codebase has direct evidence (template-lane lore) that stateless mode throws on the second request from a real CLI client. Therefore this delta does NOT prove codex/opencode can reach the bridge in production; it proves they can reach a stateful stand-in. Shipping this delta as-is leaves the production codex/opencode MCP path unproven (and probably broken). Accept explicitly, or fold a stateful-bridge-mode (or per-CLI stateful bridge) into AL7 scope."* The builder must not let "approved for build" be read as "production codex/opencode MCP is proven." It is not.

---

## Findings

### CRITICAL
None.

### WARNING

**W1 — R1 founder-acceptance must be explicit + sharpened for codex/opencode.** See above. The gap is real coverage, the framing under-states it, and codex/opencode are *worse off than claude* because they have no SDK fallback path. Elevate to an explicit accept-or-fold decision. (Dim: Honesty / Risk.)

**W2 — AC8 (at-most-once / non-approval-holds) is described but the verification is hand-wavy.** AC8 row says "assert in lane: a control spawn with mode still `capture` writes no file." That control spawn is the ONLY thing in the delta that proves non-approval-holds for the real binary — but §2b/§2c assertion lists do not include it; only §2e's deterministic config test and the happy-path session-1/session-2 are spelled out. The plan must make the control-spawn (spawn in `capture` mode, assert `!fs.existsSync(proof.txt)`) a **named assertion** in both the codex and opencode lanes, not a parenthetical in the AC table. Without it, the lanes prove "approval lets the op through" but not "absence of approval holds it" — which is half the trust-first contract. (Dim: AC coverage / Adversarial.)

**W3 — opencode `args`/`eventFormat` production change rides in on a test-lane delta.** Changing `CLI_TOOL_CONFIGS.opencode.args` from `["--dir","{{sandbox}}"]` to the headless `run` form and `eventFormat` `"text"→"ndjson"` is a real production behavior change (the plan admits it in self-critique). It is correctly justified (the current value never completes a turn, so codex/opencode could not be proven without it) and the migration note + protected-test callout for AL6 WARN-F3 (`reEngageCarrier`) are present and accurate (`AL6-...test.ts:1133` reads `reEngageCarrier`, preserved). BUT: R3 flags that opencode JSONL normalization via `normalizeNativeHarnessEvent` is *unconfirmed* for the new `--format json` output. If the parser doesn't recognize opencode's `step_finish` JSONL, the production opencode adapter silently degrades (events wrapped as completion). The plan defers this to "verify in T6" — acceptable, but the builder MUST run a real opencode spawn through `normalizeNativeHarnessEvent` and assert at least one structured event is recognized, else the eventFormat change is cosmetic. Add this as an explicit T6 sub-assertion. (Dim: Adversarial / API contract.)

**W4 — `--model` for opencode is appended "at spawn time from `config.resolvedModel`" but the mechanism is unspecified.** §1a NOTE says `--model` is appended at spawn time; but `CLI_TOOL_CONFIGS.opencode.args` in §1a does NOT contain `{{model}}`, and `startSession` only resolves templates that are present in `args`. The current claude/codex configs never needed a model arg. The plan must specify: either add `"--model","{{model}}"` to the opencode args (and confirm `config.resolvedModel.model` is provider-prefixed per R2/R4), or document where the append happens. As written, "appended at spawn time" has no code home. The real-harness lane hardcodes the model (fine for the lane) but production opencode would spawn with no `--model` and fail (R2 says a bare/missing model id fails). (Dim: API contract / completeness.)

### NOTE

**N1 — Transport-agnostic invariant is preserved. Confirmed.** §1c is correct: the router (`registry.invoke`) is untouched, no `binary === "codex"` branch, the only per-binary difference lives in `CLI_TOOL_CONFIGS` (slot) + `writeCliMcpConfig` (dialect writer). AC6 correctly classifies this as a static property enforced by `check` + review, not a runtime test. The `mcpConfig` discriminated union (`"codex-toml" | "opencode-json"`) keeps the dialect knowledge in one writer. Good. This is the single most important structural promise of the delta and the plan keeps it cleanly.

**N2 — live-proof probe truthing is correct and complete.** §3 flips both codex/opencode from hardcoded `wiring-needed` to real `which` probes (`green-now`/`absent-fail`), removes `wiring-needed` from both return sites (keeps it in the union for other call sites — correct, don't break the type), removes the `throw "...wiring-needed..."` branches in `probeLiveProofHarnessAvailability`, adds `isCodexAvailable`/`isOpencodeAvailable` mirroring `isClaudeCodeAvailable` (which probes the binary, not the SDK — the right call per the existing `@lore AL7 probe-fix`). AC7 maps to a unit test stubbing `which` failure. Absent binary → FAIL not skip. This fully satisfies probe requirement #4. Note for builder: `isCodexAvailable`/`isOpencodeAvailable` should use `execFileSync("which", [...])` like the existing helper, NOT `binaryOnPath` — consistency with `isClaudeCodeAvailable`.

**N3 — "delete don't invert" the per-harness matrix block is the right call.** The two `hasMcpUrlSlot === false` tests assert the hole still exists; after wiring they'd be false. Inverting them to `=== true` would be a weak tautology (asserting the config has a field). Deleting them and replacing with the real codex/opencode lanes is correct (the real lanes ARE the assertion that the slot now works). Protected-test list correctly carves out the claude lane assertions as immutable.

**N4 — TDD order is sound; one ordering nit.** T1/T2/T3 red before T4-T7 green is correct. But T3 (the real-harness lanes) is marked "red→green coupled, local-only" — those go red only on a machine with authed binaries, and they are NOT in `test:all`. So the *only* CI-gating red→green proof for this delta is T1 (config shape) + T2 (probe). That's fine and honest (matches the e2e-local-only rule), but the plan should state plainly: **the in-CI red phase for this delta is T1+T2 only; T3 is a local DoD artifact, not a CI gate.** Otherwise a reader assumes the lanes gate the merge. They don't and can't (auth-gated, local-only).

**N5 — Q3 token boundary is consistent with the trust model.** codex token via `bearer_token_env_var` → `HYPERIDLE_MCP_TOKEN` env (injected outside allowlist, mirroring CODEX_HOME — verified that pattern exists at `cli-harness-adapter.ts:331-338`); opencode token inline in `opencode.json` headers; claude inline in URL path. All per-session, sandbox-scoped. §6 security block correctly classifies path-traversal/SSRF/rate-limit as N/A (fixed filenames, server-constructed URL, pre-existing route) and flags the one real new surface (the per-session token) as addressed. Aligns with the "design for power not paranoia" memory — these are creds the tool needs, not withheld. Sound.

**N6 — `mcpTokenEnv` threading is the cleanest of the two options offered.** §1b offers "add HYPERIDLE_MCP_TOKEN to codex's envAllowlist OR inject it like CODEX_HOME (outside allowlist)." The plan correctly prefers the latter. Confirm: the allowlist route would be WRONG (it forwards from `process.env`, but the token is per-session-generated and not in `process.env`), so "prefer inject" is not just style — the allowlist route would not work. Make this non-optional in the build, not a preference. The new `SessionConfig.mcpTokenEnv` field + merge into `resolvedEnvMap` in `startSession` is the right shape.

**N7 — Extend-not-split the test file is justified.** ~250 lines of shared stateful-server + capturing-router scaffolding; three `describe`s in one file avoids triplicate drift. The design-it-twice note (separate files = cleaner skipIf isolation at 3× scaffold cost) is a real tradeoff honestly weighed. Agree with extend.

**N8 — R5 (codex needs git repo) is correctly noted.** The lane git-inits the sandbox (AL6 recipe); production sandboxes are git-backed per the git-host-boundary memory. The `--skip-git-repo-check` fallback note for non-git sandboxes is a reasonable builder hedge. No action needed unless a non-git production sandbox is in scope (it isn't for this delta).

---

## 9-dimension scoring

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec/AC fidelity | 8 | All ACs mapped; AC8 verification under-specified (W2). |
| 2 | Architecture integrity (transport-agnostic invariant) | 10 | One router, no per-backend branch, dialect isolated to writer+config (N1). |
| 3 | Data/contract correctness | 7 | `mcpConfig` union + `mcpTokenEnv` clean; opencode `--model` mechanism unspecified (W4), JSONL normalization unconfirmed (W3). |
| 4 | Proof realness (anti-tautology) | 7 | Real binary → real MCP → real router → real file write is genuine; BUT against a stateful stand-in, not the prod transport (R1/W1). Not a tautology, but not the production path. |
| 5 | Honesty / risk surfacing | 8 | R1 surfaced honestly but under-framed; codex/opencode-have-no-SDK-fallback sharpening missing (W1). |
| 6 | TDD order | 9 | Correct; clarify CI red phase is T1+T2 only (N4). |
| 7 | Simplicity / no over-engineering | 9 | One helper, one config field, reuses `{{mcpUrl}}` plumbing. Self-critique is candid. |
| 8 | Security | 9 | New token surface correctly handled; per-session, sandbox-scoped, inject-not-allowlist (N5/N6). |
| 9 | Docs as-built | 8 | staged-operation.md matrix + agent-layer harness docs + code-doc matrix all scheduled (T8). |

**Weighted: 8/10.**

---

## Decision

**Approved for build.** No CRITICAL. Score ≥7.

Build-time conditions (the reviewer will check these in Phase 4):
1. **W1** — R1 reframed as an explicit founder-acceptance line, sharpened for codex/opencode (no SDK fallback → HTTP bridge is the only prod path → stateless bridge unproven/likely-broken against real CLIs). "Approved" ≠ "production codex/opencode MCP proven."
2. **W2** — control-spawn (capture-mode, assert no file written) is a NAMED assertion in BOTH lanes, not a parenthetical.
3. **W3** — T6 includes a real opencode spawn through `normalizeNativeHarnessEvent` asserting ≥1 structured event recognized (else eventFormat change is cosmetic).
4. **W4** — opencode `--model` mechanism specified in code (add `"--model","{{model}}"` to args + confirm provider-prefixed `resolvedModel.model`, or document the append site).
5. **N6** — codex token injection is inject-outside-allowlist (non-optional; the allowlist route does not work for per-session tokens).

---

# v2 critique — RE-CRITIQUE of the revised plan (commit `38f06aa4`)

**Reviewer:** single-persona reviewer (Phase 2). **Target:** revised `plans/AL7/architecture-codex-opencode.md`. **Trigger:** designer revised v1 to CLOSE R1 (was WARNING-1) by flipping the PRODUCTION bridge to stateful + re-pointing all three real-harness lanes at the production bridge + adding a CI-gating integration test (T0b). I verified every load-bearing SDK claim against the installed source — I did not trust the plan's quotes.

**Verdict: score 9/10. No CRITICAL. R1 is genuinely closed. Approved for build.**

---

## What I verified against source (not the plan's quotes)

| Claim in revised plan | Source checked | Verdict |
|---|---|---|
| SDK is `@modelcontextprotocol/sdk@1.29.0`, transport class `WebStandardStreamableHTTPServerTransport` | `node_modules/.../package.json` + `dist/esm/server/webStandardStreamableHttp.js` present | TRUE |
| Reuse-throw is **stateless-only** (gated on `!sessionIdGenerator`) | `webStandardStreamableHttp.js:139-142` — `if (!this.sessionIdGenerator && this._hasHandledRequest) throw ...` | TRUE — with a generator the guard never fires; one transport serves unlimited requests |
| Stateful = pass `sessionIdGenerator: () => crypto.randomUUID()` | Docstring `.js:18-27, 42-52` (canonical example verbatim) + constructor reads `options.sessionIdGenerator` at `.js:63` | TRUE — this is the SDK's own documented stateful pattern |
| Init assigns the session id; SDK echoes `mcp-session-id` on responses | `.js:433-434` (`this.sessionId = this.sessionIdGenerator?.(); this._initialized = true`) + header set `.js:511-513` | TRUE |
| Subsequent requests validated against header (400 if missing/uninit, 404 if mismatch) | `.js:584-607` `validateSession` — stateless skips; else require `_initialized` (400), require header (400), require `=== this.sessionId` (404) | TRUE — exactly as plan states; sanity-break (omit header → 400) is real |
| Re-init rejected (400 "Server already initialized") | `.js:425-428` | TRUE — harmless (one CLI session = one transport = one init) |
| `enableJsonResponse` defaults false → SSE | `.js:61, 64` | TRUE — plan's "leave default; T0b must parse SSE or use SDK client" note is correct |
| Registry needs NO change — keeps one transport per token alive across requests | `mcp-bridge-registry.ts:37,43-45,73-79` — `Map<token,instance>`, `handleRequest` delegates to live `instance.transport.handleRequest`, never reconstructs | TRUE |
| Route needs NO change — catch-all forwards raw Request + returns transport Response verbatim | `mcp-route.ts:116-120` — `ALL /mcp/:token` → `bridgeRegistry.handleRequest(token, c.req.raw)` → returns response | TRUE — `mcp-session-id` is request/response-transparent to our code |
| The flip is literally one line in `createMcpBridge` | `mcp-bridge.ts:108-111` — `sessionIdGenerator: undefined` is the only thing to change; `McpBridgeInstance`/options/registry interface untouched | TRUE — one line + lore |
| Test-only `buildStatefulMcpServer` + `app.all("/mcp/:token")` override exist and are deletable | `AL7-...real-harness.test.ts:266-311` + `:372-378` | TRUE — and the override mounts at `/mcp/:token` w/ a closure var, exactly the production divergence the plan deletes |

Every quote in the plan's "Verified SDK API" section matches the installed source line-for-line (line numbers off by ≤4 vs the plan's citations — immaterial). The "don't assume external tool capabilities" rule is satisfied: this is read-from-source, not training-knowledge.

---

## R1 — is it genuinely closed? YES.

**The fix is correct, minimal, and proven.** The production transport (`createMcpBridge`) was the demonstrated false-green vector in v1: codex/opencode have no SDK adapter, so the stateless HTTP bridge — which the SDK source proves throws on request 2 of a real CLI client — was their ONLY production path, papered over by a stateful test stand-in. The revision:
- flips the ONE production line to stateful (source-verified the guard then never fires);
- DELETES the test-only stateful server + route override, re-pointing all three lanes at `createMcpBridge` + the real `createMcpRoute` catch-all at `/api/mcp/:token`;
- adds **T0b** (`mcp-bridge-stateful.integration.test.ts`, in `test:all`) driving the PRODUCTION bridge through init→list→call with the `mcp-session-id` header + a sanity-break (omit header → 400/404).

This converts the false-green into a deterministic, CI-gating, in-process proof that the production transport is session-capable on Linux — and the local-only real-binary lanes now also run through it. The gap is not deferred; it is closed in CI. **WARNING-1 from v1 is resolved.**

---

## Lifecycle / leak (the question I was told to break)

**No new leak. The teardown path already frees a stateful transport identically to a stateless one.** I traced it:
- The registry's `unregister(token)` (`mcp-bridge-registry.ts:47-71`) deletes the Map entry and calls `instance.mcpServer.close()`, which (per the X2 D-lore at `:54-58`) transitively closes the transport via `Server.close() → transport.close()`. The SDK's `transport.close()` (`webStandardStreamableHttp.js:630-639`) clears `_streamMapping`/`_requestResponseMap` and fires `onclose`.
- This path is unchanged by the flip. A stateful transport holds the SAME in-memory maps a stateless one does (per-request stream mapping); the only added per-session state is a single `sessionId` string + `_initialized` boolean — both GC'd with the instance.
- The X2 registry lore (`:27-35`) already mandates `unregister()` on BOTH `endSession` and `crashSession` paths, "the crash-path cleanup requirement comes from the architecture critique." So orphan-on-crash is already covered. Stateful adds no new orphan surface.

**Verdict:** the lifecycle concern is genuinely pre-addressed by existing code. The plan does not need to add cleanup (and correctly does not claim to). The one thing the plan *should* state (NOTE N9 below) is that this teardown coverage was confirmed, so a Phase-4 reviewer doesn't re-flag it.

---

## Back-compat (does flipping production break anything?)

**No. Confirmed by reading every existing bridge test.**
- `mcp-bridge.integration.test.ts` (the X2 suite): I read all 296 lines. Every test exercises either `toolResultToCallToolResult` (pure mapping — transport-independent) or `createMcpBridge`'s **return shape** (token regex, uniqueness, tool count 22/12, role filtering via `registry.invoke` called DIRECTLY). **Not one test issues an HTTP request through `transport.handleRequest`.** So none relies on single-request stateless behavior. The flip cannot break them.
- Token uniqueness test (`:159-170`): the bridge `token` is `crypto.randomBytes(32)` at `:106` — independent of `sessionIdGenerator`. Unaffected.
- The plan's caution at T0 ("update `mcp-bridge.integration.test.ts` to a multi-request handshake if it relied on single-request stateless behavior — read the diff, do not blind-bless") is **over-cautious but harmless**: those tests will stay green untouched. Builder should confirm (cheap) and NOT manufacture a handshake test there (T0b already owns that). Minor: the protected-tests list flags this file as possibly-needing-update; in fact it needs no change. (NOTE N10.)
- claude SDK adapter: unaffected — it drives the SDK in-process, not the HTTP transport's session mode. Where claude uses the HTTP bridge via provisioned `.mcp.json`, stateful is strictly more correct (stateless was already broken for multi-request HTTP-MCP). No call site reads `transport.sessionId` or assumes "no session header" (grep-confirmed: the only `transport` consumers are the registry delegate + test `.close()`).

---

## Is the proof now real? YES.

- The three lanes build the bridge via the production factory (`createMcpBridge({ sessionId, registry: capturingRouter.registry })`) and route through the real `createMcpRoute` catch-all at the PRODUCTION URL `${server.url}/api/mcp/${token}` (§2a-prereq). No test-only transport remains.
- The claude lane re-point keeps assertions intact: the plan correctly classifies claude's session-1-capture + session-2-file-write as protected/immutable; only plumbing swaps. Feasible and cheap (the lane already builds `createMcpBridgeRegistry` + `createMcpRoute` from production modules — the stand-in was the only divergence).
- No stand-in could now green a broken production path: the stateful stand-in is deleted, and the only transport in the lanes is `createMcpBridge`'s.

**T0b adequacy as the CI-gating R1 anchor:** sufficient. It runs in `test:all` (the real-binary lanes are local-only, so T0b is the only in-CI R1 proof — correctly identified). It drives the production factory + production route over a real listener through init→list→call via the real `mcp-session-id` flow, and the sanity-break (omit header → 400/404) defeats the vacuous-green failure mode (mock-validation-trap rule). It is RED against the current stateless bridge (request 2 throws the exact SDK error) and GREEN after the flip — a genuine red→green gate. Adequate.

One builder note I'm adding (NOTE N11): T0b's requests 2+ pass `validateProtocolVersion` (`webStandardStreamableHttp.js:621-628`) — a `mcp-protocol-version` header that is non-null AND not in `SUPPORTED_PROTOCOL_VERSIONS` → 400. Omitting the header is fine (defaults to the negotiated version). If the builder hand-rolls fetch and copies a stale protocol version, request 2 could 400 for the WRONG reason and mask a real regression. The plan's offered fallback (use the SDK's `Client` + `StreamableHTTPClientTransport` against the listener) sidesteps this entirely and is the safer path — recommend it.

---

## v1 minor WARNINGs — closure check

- **W2 (AC8 control-spawn)** — CLOSED. §2b/§2c now make the capture-mode `fs.existsSync(proof.txt) === false` a NAMED, standalone `expect` in BOTH lanes (not parenthetical); AC8 row (`:351`) states "its own `expect`." Correct.
- **W3 (opencode normalization)** — CLOSED + corrected. Plan now names the real normalizer `normalizeHarnessEvent` (`packages/shared/src/harness/harness-event-normalization.ts`), corrects the v1-wrong `normalizeNativeHarnessEvent`, identifies the fixed canonical `input.type` set (`completion|tool_call|error|cost_update|token_usage|pre_compaction`) and that opencode's `step_finish`/`tool` fall through to `unknown`, and makes T6 a must-verify with a concrete pre-map fallback. I did not independently re-read the normalizer source this round (W3 is a builder-verify obligation, not an R1 claim) — the plan's framing is internally consistent and the obligation is explicit. Acceptable.
- **W4 (opencode `--model`)** — CLOSED. `args` now include `"--model","{{model}}"` (§1a); `{{model}}` resolves from `config.resolvedModel?.model` (`cli-harness-adapter.ts:303`); builder must confirm provider-prefixed form (T6 sub-assertion). Has a code home now.
- **N6 (codex token inject-outside-allowlist)** — CLOSED. §1b/§6/T5 make it non-optional inject-outside-allowlist.

---

## Findings (v2)

### CRITICAL
None.

### WARNING
None. (v1 WARNING-1 closed by the stateful flip; v1 W2/W3/W4 closed.)

### NOTE

**N9 — Stateful teardown coverage is pre-existing; state it so Phase-4 doesn't re-flag.** The R1-closure section's "Does stateful break the claude SDK-adapter assumption?" para should add one line: "Per-session transport teardown is already handled — `mcpBridgeRegistry.unregister()` (called on endSession AND crashSession per X2 lore) closes `mcpServer` → transitively `transport.close()`; stateful adds only a `sessionId` string + `_initialized` flag to the instance, GC'd with it. No new leak." Closes the leak question on paper so the build-reviewer (me, Phase 4) sees it was considered. (Dim: Honesty / lifecycle.)

**N10 — `mcp-bridge.integration.test.ts` needs NO change; soften the protected-test note.** The protected-tests entry and T0 both hedge that this file "may need a multi-request handshake update." I read all 296 lines: every test is transport-independent (pure mapping or `registry.invoke`-direct); none issues `transport.handleRequest`. It will stay green untouched. The builder should confirm-and-leave-alone, NOT add a handshake here (T0b owns that proof). Keep the file protected, drop the "may need update" hedge to avoid an accidental test rewrite. (Dim: Adversarial / test quality.)

**N11 — T0b protocol-version header foot-gun.** Requests 2+ pass `validateProtocolVersion` (SDK `.js:621-628`): a non-null `mcp-protocol-version` NOT in `SUPPORTED_PROTOCOL_VERSIONS` → 400. A hand-rolled fetch test that hardcodes a stale version could 400 for the wrong reason and mask a regression. Builder should either omit the header (defaults) or use the SDK `Client` + `StreamableHTTPClientTransport` against the production listener (still proves the production server transport; only the client is the SDK helper). The plan already offers the SDK-client fallback — make it the recommended path for T0b. (Dim: Adversarial / proof realness.)

**N12 — TDD order is correct: T0b(red)→T0(green) gates everything.** §4 leads with the R1 tasks; T0b fails RED against the stateless bridge (request 2 throws the verbatim SDK error), goes GREEN after the one-line flip; the lanes (T3) depend on T0. In-CI red phase = T0b + T1 + T2 (config-shape + probe); T3 lanes are local-only DoD artifacts. Honest and correct. (Carries forward v1 N4 — now even cleaner with T0b as the CI R1 gate.)

**N13 — AC coverage is complete for the delta.** AC1–AC10 each map to a concrete verification; AC9/AC10 are the new R1 anchors (T0b in-CI; lanes local-only). AC6 (transport-agnostic, no per-backend branch) correctly stays a static `check`+review property. Docs (§5, T8) updated to include the stateful-bridge note. No orphan AC, no unmapped task.

---

## 9-dimension scoring (v2)

| # | Dimension | v1 | v2 | Notes |
|---|---|---|---|---|
| 1 | Spec/AC fidelity | 8 | 9 | AC8 now a named assertion; AC9/AC10 added for R1. |
| 2 | Architecture integrity (transport-agnostic) | 10 | 10 | Router untouched; one-line transport flip; dialect isolated to writer+config. |
| 3 | Data/contract correctness | 7 | 9 | `--model` has a code home (W4); normalization surfaced (W3); SDK API source-verified. |
| 4 | Proof realness (anti-tautology) | 7 | 10 | Now PRODUCTION transport end-to-end + deterministic in-CI T0b w/ sanity-break. False-green eliminated. |
| 5 | Honesty / risk surfacing | 8 | 9 | R1 elevated from buried risk to closed-with-proof; could state teardown-coverage (N9). |
| 6 | TDD order | 9 | 9 | T0b(red)→T0(green) gates all; CI red phase honestly = T0b+T1+T2. |
| 7 | Simplicity / no over-engineering | 9 | 9 | Net code REDUCTION (deletes stand-in); one line + one helper + one field. |
| 8 | Security | 9 | 9 | `mcp-session-id` correctly NOT an auth credential (path token still the only key; unknown token 401s before transport). No widened surface. |
| 9 | Docs as-built | 8 | 8 | staged-operation matrix + harness docs + code-doc matrix scheduled incl. stateful note. |

**Weighted: 9/10.** (+1 vs v1: R1 false-green closed with source-verified one-line fix + deterministic CI proof; proof-realness 7→10.)

---

## Decision (v2)

**APPROVED FOR BUILD.** R1 is genuinely closed: the stateful flip is a source-verified one-line production change, the reuse-throw is provably stateless-only, the registry/route need no change (already hold one live transport per token), per-session teardown already frees the transport (no new leak), no existing test relies on stateless single-request behavior (back-compat clean), the claude lane re-point keeps assertions protected, and T0b is a real red→green CI gate with a sanity-break. Score 9/10, no CRITICAL, no open WARNING.

Build-time NOTES the Phase-4 reviewer (me) will check:
- **N9** — add the one-line teardown-coverage statement to the R1 section (paper trail; no code).
- **N10** — `mcp-bridge.integration.test.ts` stays green untouched; do NOT add a handshake there (T0b owns it); drop the "may need update" hedge.
- **N11** — T0b: omit `mcp-protocol-version` or use the SDK `Client`+`StreamableHTTPClientTransport` against the production listener; don't hardcode a stale protocol version.
- Carry-forward from v1: **W3** T6 must run a real `opencode run --format json` spawn through `normalizeHarnessEvent` and assert ≥1 structured (non-`unknown`) event, else add the opencode pre-map; **W4** confirm `resolvedModel.model` provider-prefixed for opencode; **N6** codex token inject-outside-allowlist (non-optional).
