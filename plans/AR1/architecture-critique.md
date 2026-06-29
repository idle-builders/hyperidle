# Architecture Critique — AR1: Honest Harness Integration Testing

**Reviewer:** fresh evaluator (did not write the plan). **Critiqued file:** `plans/AR1/architecture.md`. **Conformance targets:** `plans/AR/concept.md` (LOCKED strict harness model), `.pipeline/work-packages/TRACK-AR.md` §AR1 (7 ACs + scenarios + constraints).

All load-bearing plan claims were verified against the real codebase (not plan prose). Verification notes inline.

---

## Correctness-gate audit (this WP was reverted once — ruthless pass)

### Strict harness model conformance — PASS
- `HarnessName = "claude" | "codex" | "opencode" | "gh" | "builtin"` (plan §Type contracts, line 86/169) is exactly the concept's vocabulary. **No surviving `anthropic-key` / `openai-key` / `any-gateway-key` token in the plan.** The plan explicitly names the reverted bug (line 7) and replaces the vocabulary.
- CLIs = binary-on-PATH (`which`), never a key (line 91). Builtin's only key = `OPENROUTER_API_KEY` (line 92). Matches concept table exactly.
- `modelProviders:["anthropic"]` retained as a *label* (line 26) — **verified correct**: real `session-provisioning.integration.test.ts:126` passes `modelProviders:["anthropic"]` to `adapterPool.register`, which is harness-config metadata, not a key gate. The plan correctly distinguishes the label from the forbidden `ANTHROPIC_API_KEY` env gate at line 117. No false purge.
- **Verified against source:** `session-provisioning.integration.test.ts:117` is `test.skipIf(!process.env.ANTHROPIC_API_KEY)` driving `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (keychain). Plan's phantom-gate diagnosis (line 26, 99) is accurate. `→ requireHarness("claude")` is the correct honest gate.

### Guard cannot break main (allowlist split) — PASS
- Plan splits the three checks correctly (line 109–113): **lane checks** (`.real-harness.test.ts` / `vitest.real-harness.config.ts` / `test:real-harness`) and **skipIf checks** enforce immediately and are never allowlisted; **stub-content check** is allowlist-gated, monotonic-shrink. This is exactly what TRACK-AR.md:62 requires ("content check may start as a report with a known-debt allowlist… lane/skipIf/filename checks enforce immediately").
- Allowlist semantics are sound: dirty+allowlisted⇒PASS, dirty+not⇒FAIL, clean+allowlisted⇒FAIL (debt-paid), stale⇒FAIL (line 111). The monotonic-shrink rule ("never grows") is correctly stated.

### CI teeth — PASS (and the trap was actively avoided)
- **Verified:** `.github/workflows/ci.yml` re-runs only `check`, `lint`, `knip`, `mock-inventory:check`, builds, `check-attestation`. The verify-chain guards (`harness-vocab-guard:check`, `ah5-mock-guard:check`, `ah6-mock-guard:check`) are in `verify` but **NOT in CI** — confirmed by reading `package.json:38` (verify) vs `ci.yml`.
- The plan correctly rides the new guard on **`npm run lint`** (line 29, 41) — precedent verified: `package.json:29` `lint` already chains `npx tsx scripts/ag7-no-divergent-classes.ts`. CI runs `lint`, so the guard gets real CI teeth. **This is the single most important correctness decision and the plan gets it right**, explicitly noting (line 196) that placing it only in `verify` would lose CI teeth.
- Floor rides `check-attestation` (CI step, verified). Correct placement.

### No false positives — PASS
- Path predicate (Decision 2, line 45–52): `harness/__tests__/*.integration.test.ts` OR explicit `session-provisioning`. The `.integration.test.ts` suffix excludes `.test.ts` units in the harness dir (so units that legitimately stub are never selected); web/db `*.integration.test.ts` elsewhere never match. **Sound.** Verified the harness dir contains both `.test.ts` units and `.integration.test.ts` files, so the suffix discriminator is real.
- Path-only predicate is single-sourced (`scripts/lib/honest-harness-predicate.ts`) and shared by guard + floor (line 53) — correctly motivated by the fact that `verify-attest` only has file *paths* from the JSON reporter, not source (line 44). Good.

### Attestation floor is additive — PASS
- `agenticExecuted?`/`agenticSkipped?` are **optional** (line 122, 172), matching the `srcHash?` back-compat precedent — **verified** `check-attestation.ts:60` has `srcHash?: string` and legacy attestations validate. Floor gate added *after* the existing status/partial/dirty/srcHash gates, no existing gate weakened (line 122).
- Fields inside the HMAC payload, not appended post-sign (line 188) — correct, can't be forged independently.
- Genuinely fails a 100%-skipped run: `assertAgenticFloor` returns a violation when the agentic set is empty OR `agenticExecuted===0` (line 118). Correct.

### Cursor skipIf (skip-when-present) — PASS
- **Verified:** `AM2-real-harness-discovery.integration.test.ts:64` is `test.skipIf(cursorInstalled)` — a skip-WHEN-PRESENT assertion (cursor inert/not-spawnable). The plan (line 101, 110) correctly flags that this must NOT be misread as an availability gate, and converts it to an unconditional "cursor absent from discovery" assertion. The guard's skipIf regex (line 110) targets skip-when-*absent* patterns only and documents the narrow inverse shape. Sound.

### Decision 4 — AM2-builtin token purge as AR1 scope — JUSTIFIED, not scope creep
- **Verified:** `AM2-builtin-gateway.integration.test.ts` is OpenAI-coded — source has `OPENAI_API_KEY` (line 28), `ANTHROPIC_API_KEY` (line 29), `gpt-4o-mini` (line 5), `hasGatewayKey = OPENAI ?? ANTHROPIC ?? OPENROUTER` (line 32). All three tokens are forbidden by the strict model.
- The Hard Prohibition in the concept ("`ANTHROPIC_API_KEY` does not exist in any scenario… no test… may reference it"; "no `openai-key` gate for the builtin path") is **absolute** and unscoped — it is not "AR2–AR6 territory." A surviving `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` in a harness test directly violates AC4 ("**no `anthropic-key`/`openai-key`/`ANTHROPIC_API_KEY` token anywhere**"). Therefore purging it is AR1's job by AC4's own wording, even though it crosses into a test body. **This is correct scoping, not creep.** The plan caps the risk well (line 66, 194): worst case the test gates `requireHarness("builtin")` and any residual OpenAI reference is a blocking violation, never shipped.

### AC completeness — every AC1–AC7 has a credible verification method — PASS
Mapped (plan §138–148): AC1 guard-lane-check + prose read; AC2 prose edit + reviewer confirm; AC3 guard + `test:integration` discovery; AC4 `ar1-require-harness.test.ts` + type-exhaustiveness via `check` + token-purge grep/guard; AC5 `ar1-honest-harness-guard.test.ts` covering all branches incl. allowlisted-skipIf-still-fails; AC6 `ar1-attestation-floor.test.ts` (executed/skipped/empty-set/legacy branches); AC7 unit throw-path + real `npm run verify` on founder machine. All concrete and credible. No AC left unenforced.

---

## Nine-dimension score

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec conformance (ACs covered) | 9 | All 7 ACs have concrete verification; correctness gates all pass. |
| 2 | Concept/model fidelity | 10 | Strict harness vocabulary exact; the reverted bug is named and fixed; no forbidden token survives in the plan. |
| 3 | Layer/structure integrity | 9 | Single-source predicate shared by guard+floor; pure logic in `scripts/lib/`, tests in `packages/` (cross-boundary import risk noted with fallback, risk #3). |
| 4 | Interface/contract clarity | 8 | Type contracts explicit. One real wiring ambiguity in the verify-attest JSON-capture path (see WARNING-1). |
| 5 | Data/enforcement-point correctness | 9 | Guard→lint (CI teeth), floor→check-attestation (CI teeth), allowlist split correct. Best decision in the plan. |
| 6 | Failure modes / robustness | 8 | requireHarness-throws-not-skips reasoning is correct; floor is the regression backstop. Vitest-4 serial field unverified (flagged, with fallback). |
| 7 | Testability | 9 | Pure fns exported for unit test; red-phase-first task order; predicate regression net. Solid. |
| 8 | Scope discipline | 8 | AR2–AR6 conversions correctly OUT; Decision-4 token purge correctly judged IN by AC4 wording. One undercount (WARNING-2). |
| 9 | Migration/rollout safety | 8 | git-mv history preservation, allowlist coordination flagged for concurrent AR2+, additive attestation. Counting gap on the un-excluded set. |

---

## Findings

### CRITICAL
None. All seven correctness gates pass against verified source. The plan is conformant to the strict model and the reverted-bug vocabulary error does not recur.

### WARNING

**WARNING-1 — verify-attest JSON-capture wiring is under-specified and may not match the real `ATTESTED_COMMAND`.**
Mechanism 4 (line 120) says "run the integration suite with a JSON reporter… single integration invocation produces both the human output and the JSON." But **verified**: `verify-attest.ts:63-64` runs `ATTESTED_TOOLS = ["test","test:integration"]` via `ATTESTED_COMMAND = "npm run test:all"` as one `execSync(..., {stdio:"inherit"})`, and `test:all = "npm run test && npm run test:integration"` (`package.json:21`). So the integration run is *inside* the combined `test:all` shell chain, not a standalone invocation verify-attest controls. To capture per-file JSON for the integration suite the builder must either (a) split `test:integration` out of `test:all` in verify-attest and invoke it separately with `--reporter=json --outputFile`, or (b) make `test:integration`'s own config emit JSON to a fixed path that verify-attest reads after. The plan asserts the capture is free ("do not double-run") but does not specify which. *Fix:* the plan should name the concrete invocation change to `verify-attest.ts` (split the integration sub-run with multi-reporter, derive combined status from both exit codes — the plan already says this at line 120 but contradicts itself by implying a single combined run yields the JSON). Resolve the ambiguity before build so the floor doesn't silently read an empty/missing JSON (which `assertAgenticFloor` would treat as undefined⇒null⇒**no enforcement**).

**WARNING-2 — the un-excluded real-harness file set is undercounted (3 vs 4) and the existing AL6 `.integration` file's disposition is unstated.**
Plan reconciliation (line 25, 28) says "**3** mis-named `*real-harness*.integration.test.ts`" and "remove the exclude so the 3 mis-named ones actually run." **Verified**: the exclude glob `**/harness/__tests__/*real-harness*.integration.test.{ts,tsx}` matches **4** files: `AM2-real-harness-discovery`, `AN1-real-harness-inherited`, `AM2-real-harness-session-probe`, **and `AL6-real-harness-return-enforcement.integration.test.ts`** (the pre-existing file the plan elsewhere — line 31, 76 — describes as the *collision target* the suffix file renames into as `-realbinary`). So removing the exclude un-gates 4 files, and one of them is the scripted/duplicate AL6 `.integration` that AR6 is meant to consolidate/demote. The plan is silent on whether that existing AL6 `.integration` file (a) starts running now (and is therefore a stubbed harness-facing integration test the guard's stub-content check must allowlist) or (b) is left excluded. *Fix:* reconcile the count to 4; explicitly state the existing `AL6-real-harness-return-enforcement.integration.test.ts` either lands in the allowlist as known AR6 debt or stays out — don't let "remove the exclude" silently surface a stubbed file the floor counts as executed and the guard hasn't allowlisted (would fail `lint` on a not-allowlisted dirty file). This also touches risk #5's "currently-stubbed AL6 files satisfy the floor" — make the AL6 disposition explicit there.

### NIT
- **NIT-1** (line 55) — the "agentic set selected today" list is a useful artifact but will go stale; mark it as illustrative-at-plan-time, not a contract (the predicate is the contract).
- **NIT-2** (line 113) — "~12–17" allowlist size is a wide range; the builder should pin the exact count from the real `--write-allowlist` scan and the reviewer should diff it against the known stubbed-harness inventory (TRACK-AR.md cites 30 across the track; AR1's subset is the harness-dir `.integration` files only).
- **NIT-3** (line 195, risk #3) — the `packages/ → scripts/lib/` import boundary risk is real under TS strict project refs; the `packages/scripts/` shim fallback is sound but the plan should pick the default at build-start (try direct, fall back) rather than leaving it open, to keep task 1's commit boundary clean.
- **NIT-4** (line 129) — the testing.md "purge SDK / future→shipped" prose edits should be enumerated as exact line anchors (like the other §5 rows) so the reviewer can diff them; "confirm" is softer than the rest of the table.

---

## Verdict

**Overall: 8.5 / 10. READY FOR BUILDER.** Score ≥7 with **zero CRITICAL** findings.

The plan is conformant to the LOCKED strict harness model — the exact vocabulary bug that got the prior attempt reverted (`anthropic-key`/`openai-key` tokens) does **not** recur, and every Hard Prohibition is honored. The four highest-risk correctness gates — strict vocabulary, guard-can't-break-main (allowlist split), CI teeth (guard→lint, floor→check-attestation), and additive attestation floor — are all designed correctly and verified against real source. The Decision-4 builtin token purge is correctly judged in-scope by AC4's own wording, not scope creep.

The two WARNINGs are build-time clarifications, not redesigns: (1) pin the verify-attest JSON-capture invocation so the floor reads a real JSON, and (2) reconcile the un-excluded set to 4 and state the existing AL6 `.integration` file's allowlist disposition. Both are resolvable by the builder against the real files without a designer round. No revision round required.
