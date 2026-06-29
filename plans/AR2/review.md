# AR2 Code Review (amended scope, round 1) — enforcement gate + 4-harness matrix

**Verdict: DONE** (one MINOR spec-contract deviation on AC4 helper shape; gate is genuinely load-bearing; no blockers)

Reviewed the full diff against `plans/AR2/architecture.md` (amended), the critique's W1–W6, TRACK-AR.md AR2 ACs, and ran the sanity-breaks. The two enforcement layers are real and proven load-bearing. The opencode `tool_use` fix and the MCP-namespace return-action fix are correct, in-scope, deterministically tested. `npm run check` PASS (lockstep type asserts hold), `npm run lint` PASS (guard clean).

---

## AC table

| AC | Covered? | Evidence |
|---|---|---|
| **AC1** real session via prod `provisionSession()`, real adapter+model, asserts on real output | YES | 4 lanes through `provisionSession()`; builtin asserts `totalCostCents>0`, claude asserts captured `answer.txt` bytes, codex/opencode assert outcome floor + best-effort file. No bespoke rig. |
| **AC-coverage (new)** full matrix builtin+claude+codex+opencode, each `requireHarness`-gated, equal coverage, mechanically enforced | YES | All 4 lanes present + gated. Lint coverage rule fires naming the missing harness (sanity-break confirmed). Attestation per-harness floor present + populated (committed attestation: builtin/claude/codex/opencode all `executed:1`). |
| **AC2** capture-before-teardown seam observes real output before deletion | YES | `onBeforeTeardown` on `ProvisionSessionDeps` fires post-drain/pre-teardown (session-provisioning.ts ~1170), swallow-on-throw, no-op for prod callers. Matches plan §5 verbatim. Claude lane's `answer.txt` is the load-bearing proof. |
| **AC3** hard-fail via `requireHarness`, never skip | YES | Every lane calls `requireHarness(<name>)` at describe scope. |
| **AC4** pattern extractable **as a matrix helper (`SUPPORTED_HARNESS_LANES` + `runThroughHarness`)** for AR3–AR6 | **PARTIAL** | The reusable per-harness PREP helpers (`createSandboxCapture`, `startMcpBridgeServer`, `provisionClaudeSandbox`, `provisionCodexHome`, `provisionOpencodeHome`, `initGitRepo`) ARE extracted and shared. But the spec AC (TRACK-AR.md:104) and plan §4 explicitly name `SUPPORTED_HARNESS_LANES` + `runThroughHarness` as the deliverable — **neither is exported.** AR3–AR6 must hand-rebuild the 4 `describe` blocks + per-lane wiring rather than `for (lane of SUPPORTED_HARNESS_LANES)`. See M1. |
| **floor: hard-fails when harness absent** | YES | `requireHarness` throws at collection; lanes can't skip to green. |

---

## Sanity-breaks I actually ran

1. **Lint coverage rule — remove `requireHarness("codex")` from AR2 test** → guard stayed **CLEAN** when only the *gate call* was deleted, because JSDoc lines (`Gate: requireHarness("codex")`) and an error-string literal (`"requireHarness('codex') passed but no auth.json"`) still textually contain the literal, and `declaredHarnesses` is a tolerant regex that cannot distinguish code from comment/string. Only after removing **every** textual `requireHarness("codex")` did the guard fire correctly: `incomplete harness coverage — declares { builtin, claude, opencode } … Add a requireHarness("<name>") lane for: codex`. → **W2 false-negative is real and concrete** (W-FINDING below). The attestation per-harness floor backstops it (un-gated codex → 0 executed → floor fails), so the regression class is still closed by defense-in-depth — but the lint sanity-break as literally specified in the task does NOT pass.

2. **Allowlist computed, not hand-copied (W1)** → `--write-coverage-allowlist` recompute is **byte-identical** to the committed `scripts/coverage-debt.allowlist.json`. 13 entries (not the plan's estimated 5 — plan under-counted; the writer correctly derives the real set from `missingHarnesses`). AR2's own test is **ABSENT** from it (good). Every one of the 13 is a genuine harness-facing `.integration.test.ts` that covers a subset (verified each declares < the full matrix — e.g. AL6-* declare none, AM2-builtin declares only builtin, cli-adapter-real-binary declares claude/codex/opencode but not builtin). No smuggled exemptions.

3. **Per-harness floor unit test load-bearing** → reverting `assertPerHarnessFloor` to always-`null` (in the resolved `.js`) turns the test **RED (5 failures)**. With the compiled `.js` artifacts stashed (fresh-clone simulation), both AR2 unit suites pass (24) resolving `.js`→`.ts`. NOT theater. (Note: gitignored compiled `scripts/lib/*.js` shadow the `.ts` in this dev worktree — irrelevant to CI, see S1.)

4. **opencode `tool_use` fix load-bearing** → reverting the `case "tool_use"` branch turns `harness-event-normalization.test.ts` **RED (2 failures)**. The fix matches real opencode `--format json` output (`{type:"tool_use", part:{tool, state:{input}}}`), lore-cited as live-verified 2026-06-29. Correct in-scope fix surfaced by the honest opencode lane — not a guess.

5. **MCP-namespace return-action fix load-bearing** → closure test asserts `isReturnAction("mcp__hyperidle__send_message") === true` and the non-greedy server-name edge cases. AR1's deferred latent-bug comment correctly removed.

---

## Findings

### WARNING

**W-1 — Lint coverage gate has a real false-negative: a comment/string mention of `requireHarness("X")` counts as coverage.** `declaredHarnesses` (honest-harness-guard.ts:104) regexes raw source, cannot tell code from comment/string. In the shipped AR2 test, removing the actual `requireHarness("codex")` *gate* leaves the guard green because JSDoc + error-string literals keep "codex" declared. The author already lore'd this (W2 comment, l.91-95) and the per-harness attestation floor is the genuine backstop (un-gated → 0 executed → floor fails). **Not blocking** — defense-in-depth holds, and tightening the regex risks brittleness as the lore warns. But: the lint layer alone cannot be trusted to catch a removed gate when the name survives in prose; the gate's load-bearing-ness rests on the attestation floor for that case. Worth one sentence in the lore making explicit that "the lint check proves the NAME appears, the floor proves the lane RAN."

**W-2 — codex/opencode W6 floor admits `not_returned`, which is weaker than the plan mandated.** Lanes 3/4 assert `expect(["completed","not_returned"]).toContain(result.outcome)`. The plan's W6 mandate was "`outcome==="completed"` + a real cost/tokens signal." `not_returned` is unconditional and a stub cannot produce it (stub → `crashed`), so it still distinguishes real-run from stub and contributes ≥1 executed assertion to the bucket (floor passes loud). **Defensible, not blocking** — but it is a softer floor than claude (which asserts real cost>0 AND captured bytes). The lore (codex-outcome l.513-517) justifies it: a "create file then stop" task legitimately yields `not_returned` under the AL6 return gate. Accept, but note the codex/opencode lanes prove "the harness RAN through provisionSession" more than "the harness produced verifiable output" — the AC2 file-capture proof is carried solely by claude.

### MINOR

**M-1 — AC4 helper shape deviates from the spec contract.** Spec AC (TRACK-AR.md:104) and plan §4 explicitly require `SUPPORTED_HARNESS_LANES` + `runThroughHarness` exported from `provision-real-session.ts` so AR3–AR6 import "run through all supported harnesses" via a loop. **Neither is exported** — only the per-harness prep helpers. AR3–AR6 will re-hand-write 4 `describe` blocks + per-lane adapter wiring. The prep helpers being shared (one source with `cli-adapter-real-binary`) delivers *part* of AC4's intent (no duplication of prep), but not the "loop over the matrix" reusability the spec names by identifier. The plan even noted (§4) the loop form "is what AR3–AR6 adopt." Either export the lane table + runner, or amend the spec AC to match the shipped shape (explicit-lanes-with-shared-prep). As-is this is a documented-contract miss, low blast radius (AR3–AR6 not yet built).

**M-2 — `[harness:X]` tag is hand-typed in AR2's describes, not derived.** Critique N1: a typo (`[harness:codx]`) buckets to a phantom harness → that harness reads 0 → floor fails *safe* (good), but a mis-credit (`[harness:claude]` on a codex lane) would pass. The would-be mitigation (`describeTag` derived from `lane.harness` via the lane table) doesn't exist because M-1's lane table doesn't exist. Low risk for AR2 (4 hand-checked describes), but the mechanical-tag safety the plan promised for consumers rides on the un-shipped `SUPPORTED_HARNESS_LANES`.

### SLOP / HYGIENE (non-blocking)

**S-1 — gitignored compiled `scripts/lib/*.js` / `*.d.ts` shadow the `.ts` source in the worktree.** `attestation-floor.js` (etc.) sit on disk next to the `.ts`; the unit tests import `…/attestation-floor.js` and resolve the physical `.js`, so an edit to the `.ts` has no effect locally until rebuilt. Verified CI-safe (with `.js` stashed, vitest resolves `.js`→`.ts` and all 24 pass). Cosmetic dev-ergonomics trap only — not a gate weakness. Consider a `scripts/lib/*.js` clean step or building to a `dist/` to avoid the shadow.

**S-2 — `console.warn` in the seam's catch** (session-provisioning.ts, the `onBeforeTeardown` observer-throw branch). typescript.md bans `console.*` in production; there's a justified `biome-ignore` ("observability adapter not yet stood up") matching the existing pattern in the file. Acceptable; flagged for consistency.

### Production-surface note (in-scope, well-justified — NOT a finding)

The amendment ships **more production change than plan §5's "this is the entire production surface of AR2" implied** — but all of it is correct and necessary, surfaced by the honest 4-harness lanes:
- `harness-event-normalization.ts`: opencode `tool_use` / `step_start` / `text` branches (without them `provisionSession` crashed on real opencode). Tested.
- `return-actions.ts`: `stripMcpNamespace` — fixes AR1's explicitly-deferred latent bug (CLI+MCP sessions could never verdict "completed"). One fix at `isReturnAction` covers both return-gate and CLI-adapter `returnSeen` paths. Thoroughly tested.
- `adapter-pool.ts` / `cli-harness-adapter.ts`: `stderrIgnorePatterns` (codex+opencode set to `[/.*/]`). Justified — real failures surface via non-zero exit or stdout JSONL error; benign informational stderr was falsely crashing sessions. `[/.*/]` is blunt (swallows ALL stderr) but defensible given the failure channels; AR3+ cost/diagnostic work should revisit if stderr ever carries signal.

These are exactly the real-behavior fixes the honest harness test is designed to expose. Good.

---

## Lockstep prose / filename drift (§6) — VERIFIED CLEAN

- Plan named `honest-harness-guard.coverage-debt.allowlist.json`; shipped `scripts/coverage-debt.allowlist.json`. testing.md, CLAUDE.md, TRACK-AR.md all name the **actual** shipped filename, the **actual** payload field (`agenticExecutedByHarness`), and the **actual** export (`SUPPORTED_HARNESSES` from `scripts/lib/honest-harness-predicate.ts`). No drift.
- W3 confirmed: coverage rule selects via `isHarnessIntegrationPath` verbatim (ruleFor l.201) — cannot false-positive on `*.test.ts` units or service `*.integration.test.ts` outside `harness/__tests__/`.
- W4 confirmed: `require-harness.ts` lockstep is **bidirectional** (`_AssertSupportedInHarness` → AND `_AssertHarnessCoversSupported` ←, l.41-45), `gh` correctly in `HarnessName` but excluded from the mirror/matrix. `npm run check` proves drift either direction goes red.
- W5 confirmed: fresh `verify-attest` always writes all four keys (`byHarnessWithDefaults`, verify-attest.ts:165-168); back-compat `undefined→null` only covers genuinely-legacy attestations. Committed attestation carries all four `executed:1`.

## Adversarial: can both gates be defeated to merge a subset-covered harness test?

To ship a real subset-covered lane an author must (a) defeat the lint coverage rule AND (b) defeat the per-harness floor. The lint rule can be fooled by a comment/string mention (W-1) — but then the floor catches it (the un-gated harness runs 0 executed assertions → `check-attestation` fails). To defeat BOTH an author would need a textual `requireHarness("codex")` AND a *real executing* codex assertion tagged `[harness:codex]` — i.e. an actually-covered lane. The regression class (AR2's original bug) is genuinely closed. The only residual is mis-CREDIT via a mistagged describe (M-2), which requires the author to actively mislabel a real lane — caught at review, not silently green.

---

## Round 3 — re-review of W-1 / M-1 / W-2 fixes + codex-lane judgment

**Verdict: DONE.** All three round-1 non-blockers are resolved and load-bearing. The codex lane is acceptable as-is — strengthening to `tokens > 0` is NOT recommended (see judgment). Cost-bug deferral to AR3 is correct.

### W-1 — RESOLVED (sanity-break run for real)
`declaredHarnesses` now pre-strips comments + blanks in-string `requireHarness` via `stripCodeSoOnlyRealCallsRemain` (honest-harness-guard.ts:116-188); only genuine call expressions count.
- **Sanity-break (re-run round 3):** baseline `--check` clean → removed ONLY the `requireHarness("codex")` call at line 420 (JSDoc mention at line 40 left intact, `grep -c` confirms 1 textual occurrence remained) → guard **FAILED**: `incomplete harness coverage — declares { builtin, claude, opencode } … Add a requireHarness("<name>") lane for: codex`. Restored → clean, zero diff. The round-1 false-negative is closed.
- **Unit fixture proves it:** `packages/db/src/__tests__/ar2-coverage-guard.test.ts` — 17 tests pass, including line-comment (l.133), block/JSDoc (l.144), string-literal (l.151), and the exact reviewer sanity-break scenario (l.159: 3 gated + 4th only in comment+string → `missingHarnesses` reports the 4th). Comment-only mention provably does NOT count.

### M-1 — RESOLVED
`SUPPORTED_HARNESS_LANES` (provision-real-session.ts:395) + `runThroughHarness` (l.562) both exported. The AR2 integration test is the reference usage: lanes 2/3/4 call `runThroughHarness(lane, ctx)`; all four bind `SUPPORTED_HARNESS_LANES[0..3]` and derive `describeTag` from the lane (l.201-204, 208/329/419/521). `describeTag` is now DERIVED from `harnessName` (closes round-1 M-2's hand-typed-tag risk). AR3–AR6 iterate the table for free.
- *Note (non-blocking):* lane 1 (builtin) does not call `runThroughHarness` — it inline-rebuilds adapter+deps for the candidate-model retry loop (l.251-316). Defensible (candidate retry is a test-level concern the lane table intentionally doesn't model), and it still binds `BUILTIN_LANE.describeTag`. Lanes 2/3/4 are the true reference for the loop runner.

### W-2 — RESOLVED, honest (not green-theater)
The round-2 over-tightening to `completed`-only was correctly REVERTED in `a4a6cfc1`. Root cause is real and now lore'd in 3 places (provision-real-session.ts:381-393, test l.62-71, per-lane l.485-498/608-616): builtin+claude fire the MCP return tool → `completed`; codex+opencode do real billable work on a file-write task but don't call the return tool → reliably `not_returned`; forcing `completed` re-prompts to the 240s ceiling.
- (a) **Honest:** the floor is `expect(["completed","not_returned"]).toContain(outcome)` — FAILs on `crashed`/`error`. A stub/crashed run yields `crashed` + no sandbox → seam can't fire → no file. Not loosened-to-green.
- (b) **`@lore`'d** against re-tightening — explicit "round-3 REVERT of over-tightening" + "don't do it" notes.
- (c) **builtin + claude still assert `completed`** via `totalCostCents > 0` (the unconditional cost signal; builtin l.312, claude l.405) AND claude additionally asserts the captured `answer.txt` bytes (l.411-413, the load-bearing AC2 proof).

### Codex-lane judgment — KEEP AS-IS, do NOT add `tokens > 0` (non-blocking)
The proposed `tokens > 0` strengthening is **not implementable on `result`**: `ProvisionSessionResult` (session-provisioning.ts:295-324) exposes only `sessionId`/`outcome`/`totalCostCents`/`returnVerdict`/`forceReturnCount` — **no token field**. Codex's `usage`-block tokens are merged into `bets.tokensActualJson` (l.1089-1090), never surfaced on the result. So asserting `tokens > 0` would require either (i) widening `ProvisionSessionResult` — a production-surface change AR2's "lightest production change" mandate rules out, and arguably AR3's cost/billing turf — or (ii) reading `bets.tokensActualJson` back from the DB, which is exactly the real-cost assertion AR3 owns (AC: "cost is captured from a real harness").

The codex lane is **not** theater without it: the structure is real (`requireHarness("codex")` → real binary, real `provisionSession`, honest-harness-guard bans stubs) and the assertion is `outcome ∈ {completed, not_returned}` (FAIL on crashed) + best-effort `answer.txt` capture. A stub cannot reach a non-crash outcome through the real provision path, and the seam only fires on a real sandbox. That distinguishes a real codex turn from a stub/echo at the structural level. The honest gap — codex's *produced output* is proven only "best-effort" (file may not be written) — is real but is the same gap AR3 closes properly by surfacing real cost/tokens from the codex `usage` block. Forcing a weak token assertion into AR2 by widening production surface would be the wrong fix. **Recommendation: keep as-is; AR3 surfaces real codex output (cost/tokens) when it fixes the vestigial `costField`.**

### Cost-bug scoping (vestigial `codex.costField`) — CORRECTLY DEFERRED TO AR3, surfaced honestly
`CLI_TOOL_CONFIGS.codex.costField: "total_cost_usd"` never fires (codex emits `turn.completed`+`usage`, not a `result` event), so `totalCostCents` is always 0 for codex. This is **not swept**: documented in 3 `@lore` blocks (codex-cost-zero at provision-real-session.ts:389-393 and test l.491-498). AR2's own AC1 cost claim does **not** depend on it — AC1 is carried by the **builtin lane's `totalCostCents > 0`** (the reliable cost signal) and claude's cost+bytes. AR3 explicitly owns "Provisioning, adapter pool, and cost … cost is captured from a real harness" (TRACK-AR.md:127-154), so the codex cost-extraction fix is its turf by charter. Deferral is correct and honest.

**Status line:**
- W-1: RESOLVED — comment/string strip works; sanity-break re-run fails naming codex; 17-test fixture proves comment-only ≠ declared.
- M-1: RESOLVED — `SUPPORTED_HARNESS_LANES` + `runThroughHarness` exported; AR2 test is reference usage; tag derived.
- W-2: RESOLVED — honest `completed|not_returned` floor (FAIL on crashed), `@lore`'d against re-tightening, builtin+claude still assert `completed`+cost.
- Codex lane: KEEP AS-IS — `tokens > 0` not surfaced on `result`; structure + non-crash + best-effort capture is enough; AR3 closes the produced-output gap. NOT blocking.
- Cost bug: CORRECTLY deferred to AR3, surfaced in 3 `@lore` blocks; AR2's cost claim rides builtin, not codex.
