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
