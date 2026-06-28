# AN2 — Architecture critique (reviewer, Phase 2)

**Verdict: PROCEED TO BUILD WITH CORRECTIONS.** The plan is well-grounded — every cited symbol/line was verified against shipping code and is real. The injection seam, ownership decision, SSRF reuse, and gate-free posture all honor the locked concept. No CRITICAL blocks the build. But two findings must be fixed before/early in build: (1) the **builtin CLI-key carrier is architecturally non-functional as claimed** — builtin runs an in-process loop, never execs `gh`, never reads `mcpTokenEnv`; the plan over-claims its coverage; (2) the **live-proof matrix targets the wrong test lane** — it should ride the established `*.real-harness.test.ts` lane, not `*.integration.test.ts`. Both are correctable without reshaping the design.

## Rubric (9 dimensions)

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Concept fidelity (no gate, re-apply/spawn, secret never in `$HOME`/log, per-user, closed set, inherited untouched) | 5/5 | Every hard rule mapped. Gate-free; pure read-projection; `$HOME` avoidance explicit; closure keyed to `HELD_AUTH_SOURCES`. |
| 2 | Code-claim accuracy (cited files/lines real) | 5/5 | All verified: resolver `:39`, ssrf `:193`/`:97`, connections `:51`/`:357`, cli-harness `:399`/`:278`, Phase 8b inline `.mcp.json` `:753` + `writeCliMcpConfig` `:774`, builtin `mcpSupport:false` `:352`, claude config `:457-463`, auth owning-human `:199-204`. |
| 3 | #374 dual-write-site handling | 4/5 | Tension correctly identified and real (claude inline, no `cliMcpDialect`; codex/opencode via `writeCliMcpConfig`). Discriminator value correct but referenced by a non-existent variable name — see C2. |
| 4 | Ownership / per-user isolation | 5/5 | `resolveOwningHumanUserId` mirrors `auth.ts:199-204` exactly; one change point; resolver `AND(userId)` is durable enforcement. Sound. |
| 5 | SSRF coverage | 4/5 | `resolveUrlForSSRF` reused on every outbound write + `/validate`; IP-pin available. Gap: pinned-IP not threaded into the actual outbound connect — see W3. |
| 6 | Genericity (2nd service = config) | 4/5 | Generic plan-builder + `SERVICE_CLI_ENV` map; codex `bearer_token_env_var` already per-server. AC5 enforcement leans on a review lens — acceptable but see N2. |
| 7 | Builtin scoping | 2/5 | MCP scope-out is legitimate (`mcpSupport:false`, no config file). But the **CLI-key claim for builtin is false** — see C1. |
| 8 | Validation rigor (per-harness live proof, no stub) | 3/5 | Matrix intent is right and honors [[mock-validation-trap]]/[[no-stubs-from-memory]]. But wrong lane (W1) + one carrier (builtin CLI-key) cannot be proven because it doesn't exist (C1). |
| 9 | ETHOS / no re-introduced gate | 5/5 | No broker, no classifier, no approval. Graceful-degradation try/catch, not a gate. Clean. |

---

## CRITICAL

### C1 — Builtin CLI-key carrier is non-functional; the plan claims it works
**Evidence:** `builtin-harness-adapter.ts` has **zero** references to `mcpTokenEnv` (grep confirmed). Builtin runs an in-process loop via `callLlm()` and executes tools through `ToolRegistry` (`:32`, `:500`) — it **never spawns a child process** and **never execs `gh`**. Its "tools" are HyperIdle's own registry tools, not external CLIs.
The plan asserts (§6 builtin row, §7.4): *"CLI-key env injection works (env reaches the in-process child path)"* and *"CLI-key path proven for builtin."* There is no child path and no env carrier. A `GH_TOKEN` placed in `mcpTokenEnv` for a builtin session goes nowhere.
**Why it matters:** AC3 names builtin as a carrier to prove. The plan's own §6/§7 mark only the MCP path scoped-out and assert the CLI-key path *works* — so AC3 would be marked satisfied for builtin on a false basis. This is exactly the [[mock-validation-trap]] shape: a claim that passes review prose but no real path backs it.
**Fix:** Scope builtin out of **both** carriers (it has neither). Builtin's real external-tool story is the **inbound MCP bridge** (HyperIdle's own tools), which is a separate path AN2 does not own. Record builtin as "no held-connection carrier — external reach is via the inbound registry, out of AN2 scope," and have AC3's builtin cell read *scoped out with reason*, not *proven*. Do not inject `mcpTokenEnv` for builtin sessions (dead write).

---

## WARNING

### W1 — Live-proof matrix targets the wrong test lane
**Evidence:** An established lane exists for real-CLI tests: `*.real-harness.test.ts`, run via `npm run test:real-harness` (`vitest.real-harness.config.ts`), **excluded** from both `test` and `test:integration` (`vitest.config.ts:11-13`). Precedents: `cli-adapter-real-binary.real-harness.test.ts`, `AL6-real-harness-return-enforcement.real-harness.test.ts`, `AL7-two-session-trust-first.real-harness.test.ts`.
The plan (§8, §9 T6) names its live-proof files `connection-provisioning-claude.integration.test.ts` (etc.) and routes them through `test:integration`. `test:integration` is the DB/API fixture lane (`{db, app, eventBus}`) that runs in the normal `test:all` suite — spawning real `claude`/`codex`/`gh` there breaks the [[e2e_local_only]] separation and will hang/fail where binaries are absent without the lane's skip discipline.
**Fix:** Put the per-carrier real-CLI proofs in `*.real-harness.test.ts` files under `harness/__tests__/`, run via `test:real-harness`. Keep the *config-shape* assertions (server entry written, env returned) as `*.integration.test.ts` (no real binary). The plan already separates "wrote-a-file" from "tool-actually-called" — map that split onto the existing two lanes instead of inventing a third placement.

### W2 — `serverSecret?` added to `ProvisionSessionDeps` is redundant
**Evidence:** `ServiceConnectionResolver` constructor already takes `serverSecret` (`service-connection-resolver.ts:22-25`) and `app.ts:416` already builds `new ServiceConnectionResolver(options.db, getServerSecret())`. The resolver is the sole plaintext path and encapsulates the secret. The plan (§3 table, T4) adds a parallel `serverSecret?` to `ProvisionSessionDeps`.
**Why it matters:** A second secret-bearing field invites a second decryption path — directly against concept hard-rule 3 ("resolved only via `ServiceConnectionResolver`"). Threading the secret raw also widens the surface where it could be logged.
**Fix:** Drop `serverSecret?` from the deps. Thread only `serviceConnectionResolver?` (already constructible at `app.ts:416`, exactly where `mcpBridgeRegistry`/`credentialResolver` are wired). All token resolution goes through `resolver.resolve()`.

### W3 — SSRF pins an IP but the outbound write doesn't use it (rebinding still open)
**Evidence:** `resolveUrlForSSRF` returns `addresses[]` *so callers can pin one for the subsequent fetch* (ssrf.ts `:182-192` — explicitly "prevents DNS rebinding between this check and the outbound connect"). The plan SSRF-checks the URL in `buildProvisioningPlan`, then writes the **hostname URL** into the harness config (§5/§6). The harness later re-resolves that hostname at connect time — the check and the connect are decoupled, so a rebind between provisioning and the harness's MCP connect is unguarded. For `/validate` (T5) the plan does its own connect and *can* pin; for the written config it structurally cannot (the harness owns the connect).
**Why it matters:** This is the exact DNS-rebinding hardening AN1 deferred to AN2 (`connections.ts:47-49`). Writing a checked-but-not-pinned hostname is weaker than AN1's literal block in one sense — it gives a false sense of "AN2 hardened SSRF."
**Fix:** Be explicit about the residual: the spawn-time check catches a host that resolves private *at provisioning time*; it cannot pin the harness's later connect. Either (a) document this as the honest boundary (rebinding against an external held MCP server the user themselves configured is low-value to an attacker — the user owns the URL), or (b) for token-MCP-bearer, note that pinning is impossible without proxying (which the concept forbids). Do not claim "DNS-rebinding-guarded" on the written-config path; claim it only on `/validate`.

### W4 — `applyProvisioningPlan` claude discriminator references a non-existent variable
**Evidence:** §5 Phase 8b hook passes `claudeNative: !adapterCapabilities.cliMcpDialect && harnessType === "claude-code"`. There is no `harnessType` string in scope in `runSession` — the harness identity is `selectedAdapter.meta.type` (value `"claude-code"`, confirmed at `adapter-pool.ts:553`). `cliMcpDialect` type is exactly `"codex-toml" | "opencode-json"` (`harness-adapter.ts:251`), so its absence + `meta.type === "claude-code"` is the correct test.
**Fix:** Use `selectedAdapter.meta.type === "claude-code"`. Trivial, but flagged because the plan presents it as drop-in pseudocode a builder will copy.

---

## NIT

- **N1 — `console.warn` for graceful degradation.** §5 hook uses `console.warn`, matching the existing Phase 8b inbound pattern (`:789`) which carries a `biome-ignore`. Fine, but the builder must carry the same `biome-ignore lint/suspicious/noConsole` or lint fails. Note it in the task.
- **N2 — AC5 "no new per-service code" is review-lens-enforced, not statically.** Acceptable per CLAUDE.md (static property → not a test). But the `SERVICE_CLI_ENV` map is the one place per-service knowledge concentrates; ensure the second-service test (T4/AC5) adds *only* a row + at most a map line, and that the assertion proves both entries materialize from one generic path.
- **N3 — server-entry key collision (open question §10).** The plan resolves `(github token)` vs `(github mcp)` by suffixing `-mcp`. Sound and deterministic. Just ensure the suffix is asserted in T3 so two builders can't diverge.
- **N4 — `listActiveHeld` placement.** Plan offers "method on resolver OR sibling reader." Prefer the **sibling reader** in `connection-provisioning.ts` — the resolver's docstring says it is "the ONLY path that returns a decrypted token"; adding a non-token list method muddies that single-responsibility. Keep the resolver token-only.

---

## Does the validation plan genuinely prove injection per-harness?

**Partly — after W1 and C1 are fixed, yes for claude/codex/opencode/gh; no for builtin (and that's correct).**
- claude / codex / opencode: real-CLI proof against an in-repo `@modelcontextprotocol/sdk` server over a real transport is the right shape and honors "no stub of our own client." Must move to the `*.real-harness.test.ts` lane (W1).
- CLI-key (`gh`): real `gh` against a real token is genuine end-to-end proof. Good.
- builtin: **cannot** be proven because the carrier doesn't exist (C1) — the honest outcome is *scoped out with reason*, which the concept's hard-rule 7 explicitly permits. The plan currently claims it *works*; that must change to scoped-out, or AC3 ships on a false claim.
- The R1 claude-trust-prompt risk (§7.2/§10) is correctly held as UNVERIFIED and gated on the real run with "fix the carrier, never weaken the test" — exactly right per [[tests_must_not_drive_behavior]].

**Bottom line:** No re-introduced gate, ownership/isolation sound, every code claim real. Fix C1 (builtin honesty), W1 (lane), W2 (redundant secret), and tighten W3/W4 before the live-proof phase. Cleared to build.

---

## Round 2 verification (reviewer, after planner revision)

Re-checked each prior finding against the revised `architecture.md` + shipping code. Verdict per finding:

| Finding | Status | Evidence |
|---|---|---|
| **C1** — builtin scoped out of BOTH carriers; AC3 builtin cell = *scoped out with reason*, not *proven* | **PASS** | §6 builtin row now reads "scoped out (reasoned)" for token-MCP **and** CLI-key; §7.4 + R5 state both carriers absent; AC3 (§8) explicitly: *"builtin: no carrier exists (C1) → cell reads scoped out with reason, not proven; AC3 does not require a builtin live run."* No builtin live-proof claimed (T6: "No builtin file"). Code confirms: `builtin-harness-adapter.ts` has **zero** `mcpTokenEnv`/`spawn`/`exec`/child references; `mcpSupport:false` (`:352`); in-process `callLlm()` loop (`:34`) via `ToolRegistry` (`:32`). The over-claim is gone. |
| **W1** — live-proof rides `*.real-harness.test.ts` / `npm run test:real-harness`, excluded from normal suites | **PASS** | §3 table row + §8 + T6 now route the per-carrier proof to `*.real-harness.test.ts` via `npm run test:real-harness`. Lane is real: `package.json:22` (`test:real-harness`), `vitest.real-harness.config.ts` (`include: packages/**/*.real-harness.test.ts`), excluded from unit lane (`vitest.config.ts:13` excludes `**/*.real-harness.test.ts`) and from integration lane. Cited precedents exist: `AL6-…`, `AL7-…`, `cli-adapter-real-binary.real-harness.test.ts`. Config-shape assertions correctly kept in `*.integration.test.ts`. |
| **W2** — only `serviceConnectionResolver?` threaded; no `serverSecret?` second decryption path | **PASS** | §3 table, §5 types, T4 all add **only** `serviceConnectionResolver?` to `ProvisionSessionDeps`, explicitly "**No `serverSecret?` field**" with the hard-rule-3 rationale. Current code: `ProvisionSessionDeps` (`session-provisioning.ts:178-187`) has neither field today; AN2's single addition mirrors `mcpBridgeRegistry?`. Resolver is sole plaintext path; AN2 never holds the raw secret. |
| **W3** — written-config path NOT DNS-rebinding-guarded; guard claimed only on `/validate` | **PASS** | §6 "SSRF residual (W3)", §7 tension, R6, and AC table (Outbound SSRF + `/validate` rows) all state the written path is a provisioning-time **check only** (private-now dropped+logged), explicitly "NOT DNS-rebinding-guarded," with pinning claimed **only** on `/validate` (T5, AN2-owned connect). Honest boundary documented (user-configured URL, pinning needs proxying forbidden by hard-rule 6). `resolveUrlForSSRF` returning `addresses[]` for pinning confirmed real (`ssrf.ts:182-193`). |
| **W4** — claude discriminator = `selectedAdapter.meta.type === "claude-code"`; no phantom `harnessType` | **PASS** | §3 table, §5 hook, §7.1 all use `selectedAdapter.meta.type === "claude-code"`; §3 + §5 explicitly note "there is **no** `harnessType` local in `runSession`." Code: `meta.type` value `"claude-code"` real at `adapter-pool.ts:553`; `selectedAdapter.meta.type` used as the harness discriminator at `session-provisioning.ts` (`:427`, `:672` — both `=== "builtin"`). Note: a `harnessType` identifier does exist at `:377-401`, but it is `agent.harnessType` (the agent's *selection preference*, nullable) in a different scope — NOT the resolved-adapter identity, and the plan does not reference it. The drop-in pseudocode is now correct. |

**Nits (N1–N4):** all carried into tasks — `biome-ignore noConsole` (N1, §5/T4), AC5 review-lens + single map line (N2, AC5/N2), `github`/`github-mcp` suffix asserted in T3 (N3, §10 open-question resolved), `listActiveHeld` as sibling reader not resolver method (N4, §3/§5/T1). No regressions introduced by the revision.

### Round 2 verdict

**APPROVED — clears the bar to proceed to build (Phase 3).** All five findings (1 CRITICAL + 4 WARNING) are genuinely resolved, not cosmetically reworded: each fix is grounded in a real code line I re-verified, and the over-claims that triggered C1/W1 are removed rather than hedged. The builtin honesty fix is the load-bearing one and it is complete — both carriers scoped out with reason, no false "proven," no dead `mcpTokenEnv` write claimed to carry. No new blockers surfaced in the revised text. The remaining open risk (R1 claude trust-prompt) is correctly held UNVERIFIED and gated on the real-harness run with "fix the carrier, never weaken the test" — the right posture, not a blocker. Proceed to build.
