# Code Review — AR1: Honest Harness Integration Testing (Phase 4)

**Reviewer:** evaluator persona (carried design/arch context from Phase 2 critique).
**Branch:** `feat/AR1-honest-harness-testing` (PR #381). **Diff:** `origin/main..HEAD`, AR1 mechanism commits `45311d4f..b6e4e4c6`.
**Verdict:** **NOT DONE** — one decisive blocker (Item A test is RED → no attestation can be minted, AC7/AC6 fail) plus one real guard-quality gap (AC5).

The *mechanism* is well-built and faithful to the LOCKED strict harness model — the reverted vocabulary bug (`anthropic-key`/`openai-key` tokens) does **not** recur. But AR1 is not in a shippable state: the canonical phantom gate it un-skipped now honestly REDs, and the committed attestation is pre-AR1 (no floor fields, stale `srcHash`). Two blockers must close before DONE.

---

## Decisive adjudications (A, B, C)

### A — session-provisioning MCP-bridge test-setup gap → **fixing it IS in-scope for AR1. Verdict: fix it.**

**Confirmed against source.** `session-provisioning.integration.test.ts:100-101` now runs `requireHarness("claude")` (claude present on the founder machine), so the body executes. Its deps are `{ db, eventBus, adapterPool, workspace }` (line 130) — **no** `mcpBridgeRegistry`/`mcpBaseUrl`. `provisionSession` writes `.mcp.json` only inside `if (mcpBridgeRegistry && mcpBaseUrl)` (`session-provisioning.ts:767`), so no file is written. But `CLAUDE_CLI_CONFIG.args` (`adapter-pool.ts:457-459`) **unconditionally** passes `--mcp-config .mcp.json --strict-mcp-config` → spawned claude crashes "MCP config file not found." Test RUNs and REDs.

Builder's diagnosis is **correct**: not nested-CC, not a production bug (production `server-factory.ts:299-300` always constructs the bridge; the passing `AL7-two-session-trust-first.integration.test.ts:292,302` and `AN2-connection-provisioning` real tests stand up the real `createMcpBridgeRegistry()` + `createMcpBridge`). It is a **test-setup fidelity gap**.

**Ruling — fixing it is in-scope, and required:**
- (i) AR1's mission is honest harness tests; an honestly-running test that REDs on its own missing wiring is an AR1 defect, not out-of-scope product work.
- (ii) AC7 requires `verify` green on a provisioned machine — impossible while this REDs.
- (iii) AC6's floor + the attestation can never mint a green with a RED integration leg; AR2 depends on AR1 and cannot start.
- (iv) The concept's "product bugs out of scope" (`concept.md:49`) refers to **product** bugs honest tests surface; this is a test-harness wiring gap, not a product bug.

**The fix is narrow and correct:** wire `mcpBridgeRegistry: createMcpBridgeRegistry()` + `mcpBaseUrl` into the test's `deps`, mirroring the passing AL7/AN2 tests — **no production change**, preserving the real-completed-session assertion (`outcome === "completed"`, `totalCostCents > 0`, `session.state === "done"`). This is the cleanest correct path; there is no cleaner one (excluding/skipping the test would re-introduce the false-green AR1 exists to kill).

**Latent PRODUCTION bug (separate AR2/product finding — note, do not fix here):** `CLAUDE_CLI_CONFIG.args` passing `--mcp-config .mcp.json --strict-mcp-config` *unconditionally* means claude **cannot run with no MCP configured** — a real session that legitimately has no bridge would crash identically. Production masks it only because `server-factory` always supplies a bridge. Worth a separate finding for AR2 (the `provisionSession`-seam WP): the args should be conditional on a bridge being provisioned, or `provisionSession` should always write a (possibly empty) `.mcp.json`. **Out of scope for AR1.**

### B — opencode body token purge → **CORRECT per the Hard Prohibition. Keep it.**

`cli-adapter-real-binary.integration.test.ts` opencode block (`:460-505`) now gates `requireHarness("opencode")`, keys from `OPENROUTER_API_KEY` (`:466`), and uses `model: "openrouter/openai/gpt-4o-mini"` + `baseUrl: "https://openrouter.ai/api"` (`:497-499`). No forbidden token in the gate or wiring; the only `ANTHROPIC_API_KEY` string in the file is a `@lore` comment (`:456`) *documenting* the purge.

The concept's Hard Prohibition ("no `openai-key` gate for the builtin/openai-compatible path… the key is OpenRouter") and AC4 ("no `anthropic-key`/`openai-key` token anywhere") are **absolute and unscoped**. An Anthropic-keyed opencode body directly violates AC4. Rerouting through OpenRouter is the minimal strict-conformance change — **token purge, which AR1 owns** (same reasoning the Phase-2 critique applied to Decision 4 / AM2-builtin). Not scope creep. Do **not** revert.

### C — adapter-pool.ts production `{{apiKey}}` injection → **genuinely OUT of AR1 scope. Confirmed.**

`adapter-pool.ts:353` (`OPENAI_API_KEY: "{{apiKey}}"` for codex) and `:397` (`ANTHROPIC_API_KEY: "{{apiKey}}"` for claude in `CLI_TOOL_CONFIGS`) are **production** env-template maps — the user-supplied key is interpolated at spawn time, not a *test gate* or a `requireHarness` token. AC4 and the concept Hard Prohibition are about **test gates / `requireHarness` vocabulary / phantom skip gates**, not the production credential-injection path (which is the AN1/AN2/held-connection mechanism). Note: `CLAUDE_CLI_CONFIG` (`:466`) itself uses `envMap: {}` (no key — keychain auth); the `{{apiKey}}` entries live in the *separate* `CLI_TOOL_CONFIGS` registry. This is not a strict-model violation AR1 must address. Builder's flag is correct — leave it.

---

## CRITICAL / blocking findings

1. **[BLOCKER — AC7/AC6] `session-provisioning.integration.test.ts` is RED.** Honestly runs (claude present), crashes on missing `.mcp.json`. See Item A. No green attestation can be minted; AR1 cannot ship; AR2 is deadlocked. **Fix:** wire the MCP bridge into the test deps (Item A).
2. **[BLOCKER — shippability] No valid AR1 attestation exists.** The only committed file `.verify-attestations/41e778b0…json` is **pre-AR1** (timestamp 2026-06-28T20:28, minted from the WIP scaffolding SHA): it has **no `agenticExecuted`/`agenticSkipped` fields** and a `srcHash` that will not match HEAD. `check-attestation` would reject it on `srcHash` mismatch — so it won't false-green, but it proves AR1 was never green-verified end-to-end. A real `npm run verify` (which is blocked by finding 1) must mint a fresh attestation carrying the floor fields. This is downstream of finding 1.
3. **[AC5 GAP — guard false-negative on the canonical pattern] The `honest-harness-guard` misses factory-built stub adapters.** Two pre-existing harness-facing integration files in the guard's own scanned directory stub the seam yet are neither flagged nor allowlisted:
   - `AL6-return-gate.integration.test.ts:136` — `function makeStubAdapter(...): HarnessAdapter`, registered into `provisionSession`'s pool (`:447,470`).
   - `ah5-gates-on-broken-stream.integration.test.ts:64` — `function makeBrokenStreamAdapter(): HarnessAdapter`, injected "AT THE PRODUCTION SEAM" (`:19,202`).
   Both evade `STUB_PATTERNS` because they use a locally-named factory returning `: HarnessAdapter` rather than `new ScriptedAdapter`/`vi.mock`/`implements HarnessAdapter`. AC5 requires the guard to "fail the build when a harness-facing integration test constructs a fake/scripted/echo harness adapter" — it demonstrably does **not** for the dominant in-repo shape (factory returning a hand-built `HarnessAdapter`). The guard reports "clean" while two CC-004 stub-the-seam files (the exact failure the track exists to kill) sit undetected.
   **Fix:** add a pattern that catches a function/arrow whose return type is `HarnessAdapter` (e.g. `/(?:function\s+\w+|=>)\s*[^=]*:\s*HarnessAdapter\b/` or `/:\s*HarnessAdapter\b/` on a non-import line), then `--write-allowlist` to absorb `AL6-return-gate` + `ah5-gates-on-broken-stream` as known AR6 debt (they are AR6 conversion targets). Without this, AC5's "fails the build on a stubbed harness adapter" is only partially true and a new offender using the same idiom would also slip through.

---

## NIT / non-blocking

- **NIT-1** — `extractAgenticCounts`/`isHarnessIntegrationPath`/`assertAgenticFloor` are clean, pure, single-sourced, well-tested (86 AR1 unit tests pass). Floor correctly fails empty-set and zero-executed; legacy `undefined/undefined` → null. No issues.
- **NIT-2 — type safety** — only one structural cast in the new code (`(pkg as { scripts?… }).scripts`, `honest-harness-guard.ts:253`) on parsed `package.json` JSON; acceptable, no `any`/`!`/`@ts-ignore` in production AR1 code. `@ts-expect-error` in `ar1-require-harness.test.ts:141,147` is intentional (proves the reverted key-named tokens can't typecheck) — good.
- **NIT-3 — slop scan** — clean. No dead code, no single-use wrappers, no filler. Comments are load-bearing (`@lore` provenance). The guard's three-rule allowlist split is the right shape, not over-engineering.
- **NIT-4** — `vitest.integration.config.ts` chose `fileParallelism:false` per-project over the plan's `poolOptions.threads.singleThread` (deprecated in v4) — the plan's documented fallback; correct call, `@lore` documents it.
- **NIT-5** — plan §5 referenced `write-tests/references/test-layers.md:22`; that file doesn't exist — the carve-out correctly landed in `.claude/references/testing-patterns.md` (which the plan reconciled as `≡ this row`). No miss.

---

## AC completeness audit

| # | AC | Status | Enforcement / evidence |
|---|----|--------|------------------------|
| AC1 | Two-archetype prose in lockstep; no `.real-harness` lane in any naming surface | **COVERED** | `git grep` finds no `.real-harness`/`test:real-harness`/`CLI/SDK` survivors in `docs/`, `.claude/`, `CLAUDE.md`. Guard lane-check (`laneViolations`) enforces no surviving suffix/config/script. `testing.md`, both CLAUDE.md tables, write-tests/review skills updated to "real installed binary, `requireHarness`". |
| AC2 | write-tests carves harness out of mockable externals; review gains a **blocking** tripwire | **COVERED** | `testing-patterns.md` row changed to "out-of-band external services (email, webhooks) — NOT the harness" + explicit never-mock-the-harness line. `review/SKILL.md:116` tripwire now labeled **"(BLOCKING)"** with `requireHarness` + allowlist references. write-tests SKILL harness-facing bullet purged of "CLI/SDK", gates on `requireHarness`. |
| AC3 | `.real-harness` suffix + config + script gone; tests run as `*.integration.test.ts` serial | **COVERED** | 4 files `git mv`'d to `.integration.test.ts`; `vitest.real-harness.config.ts` deleted; `test:real-harness` removed from package.json; `*real-harness*` exclude removed from `vitest.integration.config.ts`; `packages/server/vitest.config.ts` dead exclude dropped. Serial via `harness` project `fileParallelism:false`. Guard lane-check enforces. |
| AC4 | `requireHarness` exists + replaces every absent-`skipIf`; hard-fails naming the harness; strict 5-name vocab; no forbidden token in harness tests / helper | **COVERED** | `HarnessName = claude\|codex\|opencode\|gh\|builtin`; binary-on-PATH via `which`, builtin via `OPENROUTER_API_KEY` only. Grep: **no forbidden token in any harness-facing integration test gate or `require-harness.ts`.** Surviving `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` strings are all (a) production code (`adapter-pool`, `harness-discovery`, `assistant-turn`, `credential-resolver` — Item C, out of scope), (b) `@lore` comments documenting the purge, (c) `.test.ts` units / non-harness-dir `.integration` tests not in AR1's path-predicate scope (`af7-dispatch-wiring` = AR3/4 target; `AM2-harness-capability-descriptors.test.ts` = unit asserting a discovery reason string), or (d) the AR1 negative-assertion test deliberately proving the tokens are NOT honored. No AC4 violation in scope. |
| AC5 | Guard fails build on stubbed/`vi.mock`/`skipIf` harness-facing integration test; no false positive on units/service-integration | **PARTIAL — gap** | skipIf-on-absent + lane checks + `vi.mock`/`new Scripted…`/`implements HarnessAdapter` detection work; allowlist split (dirty+allowlisted⇒pass, stale⇒fail) verified by `ar1-honest-harness-guard.test.ts` (passes); path predicate correctly excludes `.test.ts` units + web/db `.integration`. **BUT** factory-built stub adapters (`makeStubAdapter(): HarnessAdapter`) evade detection — 2 such files in-scope go unflagged (finding 3). AC5's "constructs a fake/scripted/echo harness adapter" is not fully enforced. |
| AC6 | `verify-attest` records executed/skipped; `check-attestation` fails on zero-executed agentic | **COVERED (logic) / UNPROVEN (live)** | `verify-attest` splits unit/integration legs, integration leg writes `--reporter=json`, `extractAgenticCounts(json, isHarnessIntegrationPath)` writes `agenticExecuted`/`agenticSkipped` into the HMAC payload; missing JSON ⇒ status=failed + 0/0. `check-attestation` calls `assertAgenticFloor` after existing gates; optional fields ⇒ legacy back-compat. `ar1-attestation-floor.test.ts` proves zero-executed⇒violation, empty-set⇒violation, healthy⇒null, legacy⇒null. **Not yet proven on a real run** — no AR1 attestation carrying the fields exists (finding 2); blocked by finding 1. |
| AC7 | `verify` passes with binaries installed; fails with `requireHarness` message without them | **NOT COVERED** | Throw path proven by `ar1-require-harness.test.ts` (86 tests green). But `npm run verify` does **not** pass on the provisioned machine — `session-provisioning.integration.test.ts` REDs (finding 1). AC7 is not met until that test is wired correctly and a fresh green attestation is minted. |

**Summary:** AC1–AC4 covered. AC5 partial (guard false-negative). AC6 logic-complete but unproven live. AC7 fails (RED test). **2 of 7 not fully met → NOT DONE.**

---

## What's needed to reach DONE
1. Wire `mcpBridgeRegistry` + `mcpBaseUrl` into `session-provisioning.integration.test.ts` deps (Item A) — no production change, preserve assertions.
2. Extend the guard's `STUB_PATTERNS` to catch factory functions returning `: HarnessAdapter`; `--write-allowlist` to absorb `AL6-return-gate` + `ah5-gates-on-broken-stream` as AR6 debt (finding 3).
3. Run `npm run verify` on the provisioned machine (claude/codex/opencode/gh + `OPENROUTER_API_KEY`) → mint a fresh attestation carrying `agenticExecuted`/`agenticSkipped`; commit it (proves AC6 + AC7 live).
4. (Separately, for AR2) file the latent `CLAUDE_CLI_CONFIG` unconditional `--mcp-config` production finding.
