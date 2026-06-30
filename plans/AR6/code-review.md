# AR6 — Code Review (Phase 4)

Reviewer persona, carrying Phase-2 architecture-critique context (the 2 CRITICALs + R1–R4 rulings). Read the full diff once, then applied the 6 lenses + AC-completeness. AR6 has no UI surface — design lens skipped.

Branch `feat/AR6-mcp-enforcement-consolidation` @ `17cc2f87`. Diff: `git diff origin/main...HEAD`.

**Verdict: DONE** — all 5 ACs met, the two Phase-2 CRITICALs corrected, the dishonest credit-skip-guard fully reverted, coverage-debt floor honestly tightened, real-seam keepers genuine. CRITICAL: 0. WARNING: 2. NIT: 2. (verify-green is a known load-induced ship-gate item, not an AR6 code defect — see note.)

---

## AC completeness

| AC | Requirement | Result | Evidence |
|---|---|---|---|
| **AC1** | `mcp-route`/`mcp-bridge`/`mcp-bridge-registry`/`AM2-harness-capabilities` proven against a real harness through the production bridge; no wrapper/fake adapter remains in those `.integration.test.ts` | **MET** | `mcp-route.integration.test.ts` (702 lines, 5 hand-rolled `implements HarnessAdapter` classes) **deleted**; `mcp-bridge`/`mcp-bridge-registry` demoted to `mcp/__tests__/*.test.ts` units. Real-bridge tool-call proof = **#13 AL7-two-session** (real `claude`/`codex`/`opencode` binaries → production `createMcpBridge`/`createMcpRoute` → `capturingRouter.captured>=1`) + **T0b** (`mcp-bridge-stateful.integration`, untouched). Capabilities real-harness proof = pre-existing `AM2-real-harness-discovery.integration.test.ts` — **untouched, not duplicated** (CRITICAL-1 honored: no new sibling created). `routes/__tests__/AM2-harness-capabilities.integration.test.ts` static-map serialization service test untouched. `grep 'implements HarnessAdapter\|Scripted\|Capturing'` over surviving AR6 `*.integration.test.ts` = **zero**. |
| **AC2** | `cli-mcp-config` is a `*.test.ts` unit; `.integration` label removed | **MET** | Renamed `cli-mcp-config.integration.test.ts` → `mcp/__tests__/cli-mcp-config.test.ts` (rename-only, 0 content diff). Uses only `fs/os/path` — no db/app/real-service. |
| **AC3** | Each enforcement behavior → exactly one honest proof; scripted `.integration` duplicate removed or demoted to a pure-logic unit | **MET** | return-enforcement real fire = **#11 AL6-realbinary** (single keeper); pure-logic gates demoted to units (`AL6-return-gate-scripted.test.ts`, `AL6-reprompt-loop.test.ts`, `AL6-uniform-forcing.test.ts`, `AL6-builtin-enforcement.test.ts`, `ah5-gates-on-broken-stream.test.ts`); builtin-live-session demoted to `src/__tests__/AL7-builtin-live-session.test.ts`; tailored-grant stays service-keep. Each enforcement behavior now has exactly one integration-fidelity keeper + (where applicable) one demoted unit asserting the pure transform. See WARNING-2 for one residual redundancy. |
| **AC4** | No `*.integration.test.ts` in this set constructs a scripted/fake adapter; converted tests hard-fail on missing harness (`requireHarness`, no `skipIf`, no in-body skip) | **MET** | `grep -n 'skip()'` on #11 and #13 = **0**. `grep -c '.skipIf'` = 0. Both converted files: 4 `[harness:X]` describe lanes each gated `requireHarness(<name>)`. `honest-harness-guard --check` exit 0 ("clean"). No `vi.mock()` call in either converted file (the two `vi.mock` grep hits are comment lines documenting their *absence*). |
| **AC5** | Each harness-facing `*.integration.test.ts` covers full SUPPORTED_HARNESSES matrix (builtin+claude+codex+opencode), one `requireHarness` lane each; each converted file removed from `coverage-debt.allowlist.json` once full matrix | **MET** | #11 + #13 each declare all four `[harness:X]` lanes (verified `grep -o '\[harness:'` → 4 distinct). `coverage-debt.allowlist.json`: 7 AR6 entries removed (5 demoted AL6/ah5 + #11 realbinary + #13 AL7-two-session); 6 non-AR6 entries (session-provisioning, AM2-builtin-gateway, AM2-session-probe, AN1, AN2, cli-adapter) left intact. `honest-harness-guard.allowlist.json` → `[]`. The floor now strictly enforces all four harnesses execute for #11/#13. |

---

## Adversarial verification (this track exists to kill stub-the-seam / false-green)

**Reverted credit-skip-guard — CONFIRMED CLEAN.** `openrouter-credit-guard.ts` does not exist anywhere (`find` → nothing). `grep -rn 'openrouterHasCredits\|requireOpenRouterCredits\|credit-balance\|credit-guard'` across `packages/server/src` = **zero**. The three reverts (`bdab94c2`, `bc600888`, `7f266513`) fully removed the `skipIf`-to-green-on-low-credits anti-pattern. The builtin/opencode lanes hard-fail via `requireHarness`, never skip-on-credits.

**Out-of-scope files — ZERO diff from origin/main.** `git diff origin/main -- <file>` empty for `AM2-builtin-gateway.integration.test.ts`, `AN2-connection-provisioning.integration.test.ts`, `cli-adapter-real-binary.integration.test.ts`, `AM2-real-harness-session-probe.integration.test.ts`. No out-of-scope weakening survived the revert.

**Coverage-debt floor — honestly tightened, not dodged.** The 7 AR6 entries are gone from `coverage-debt.allowlist.json`; the per-harness attestation floor (`agenticExecutedByHarness`) now demands ≥1 executed assertion per harness for #11/#13. The floor was not bypassed — under the known integration-leg crash it fails-closed to 0/0 (refuses to mint green), which is the correct, honest behavior, not a defect.

**Real seam, not theater — CONFIRMED for the CLI lanes.** #13's claude/codex/opencode lanes spawn the real binary (`spawnDetached("claude", ["-p", prompt, "--mcp-config", …, "--allowedTools", "mcp__hyperidle__commit_file", …])`) and assert `testServer.capturingRouter.captured.length >= 1` through the production `createMcpBridge`/`createMcpRoute` mounted by `startAl7TestServer`. #11's CLI lanes fire the real Stop hook against the real `/api/mcp/:token/return-status` route and assert `forceCount>=1`. Both carry sanity-break `@lore` notes. Ran #13's `[harness:builtin]` lane live: 1 passed / 7 filter-skipped / 3.02s — the production bridge stands up, real MCP `initialize` returns 200, registry wiring asserted.

**Demotions are honest.** The demoted `.test.ts` units (`AL6-return-gate-scripted`, `AL6-reprompt-loop`, `AL6-uniform-forcing`, `AL6-builtin-enforcement`, `ah5-gates`) DO use `provisionSession`/`implements HarnessAdapter`/`vi.mock` — **permitted in a `.test.ts`** (the guard only selects `.integration.test.ts`; stubs belong in units per testing.md). None claims `.integration`. `mcp-bridge.test.ts`/`mcp-bridge-registry.test.ts` correctly switched to the `{ db }` fixture + `test()` (WARNING-3 from Phase 2 resolved — zero real `createTestDb()` calls, zero `it()`).

**Per-harness model config — coherent.** `provision-real-session.ts` `SUPPORTED_HARNESS_LANES`: builtin=`deepseek/deepseek-v4-flash` (OpenRouter, cheap/billed), claude=`claude-sonnet-4-6` (keychain/subscription, no API cost), codex=`gpt-5.4-mini` (inherited OpenAI login, bare form → api.openai.com), opencode=`openrouter/z-ai/glm-5-turbo` (OpenRouter prefix). Billed lanes use cheap OpenRouter models; subscription CLIs use their native auth. No `vi.mock(llm-client)` on the builtin path. `@lore AR6 canonical-models` documents each. Coherent.

---

## Findings

### CRITICAL
None.

### WARNING

**WARNING-1 — builtin lanes (#11, #13) prove the bridge/route is *reachable* under the builtin key, not that the real `BuiltinHarnessAdapter` drives a tool call.**
#13's `[harness:builtin]` lane POSTs a raw `initialize` to the production bridge and asserts 200 + registry wiring; #11's builtin lane tests `provisionReturnHook` dispatch + the real `/return-status` forcing response via raw `fetch`. Both are gated on `requireHarness("builtin")` (= `OPENROUTER_API_KEY`) and exercise the real production bridge/route — honest, no mock, no skip, and they satisfy the per-harness floor with genuinely executed assertions. **But** neither drives a real-model turn through `BuiltinHarnessAdapter`, so they prove *transport reachability*, not that builtin's in-process adapter actually calls the tool. R2's binding caveat asked for a real-model builtin turn; the §4 fallback narrowed this to "the bridge/enforcement tool-call reached the production handler … still a real-model lane" — the shipped lanes land just short of even that fallback's "real-model" wording (no model is invoked). This is acceptable under R2's accepted "full matrix = requireHarness lane + ≥1 executed [harness:X] assertion" mechanism and is not a false green, but it is the weakest of the four lanes. Not blocking. Recommendation for AR3/follow-up: upgrade the builtin lane to a real `runThroughHarness`/`BuiltinHarnessAdapter` tool-call so builtin's seam is proven at the same fidelity as the CLI lanes.

**WARNING-2 — return-gate now has two demoted units (`AL6-return-gate.test.ts` pre-existing pure unit + `AL6-return-gate-scripted.test.ts` demoted scripted-orchestration unit).**
The scripted file was renamed to `…-scripted.test.ts` to avoid colliding with the pre-existing `AL6-return-gate.test.ts`. Both are honest `.test.ts` units (the suffix collision was handled correctly), and AC3 is satisfied because the single *integration-fidelity* keeper is #11. But the scripted-orchestration unit largely re-asserts `provisionSession`-over-scripted-adapter plumbing whose pure transform (`evaluateReturn`) is already covered by the pre-existing unit and whose real fire is #11 — mild redundancy / slop. Not blocking. Recommendation: collapse `AL6-return-gate-scripted.test.ts`'s value-adding assertions into the pure unit and delete the scripted-adapter plumbing whose only proof-value duplicates #11.

### NIT

**NIT-1 — mcp-route 401/token-routing assertions were dropped, not folded into T0b.**
The plan §2.1 preferred folding the unknown-token/after-unregister 401 assertions into T0b's real-listener describe. T0b is untouched (0 diff); the deleted `mcp-route.integration.test.ts`'s 401 assertions were simply removed. The route's token-gate 401 is exercised by the pre-existing `routes/__tests__/mcp-route.test.ts` unit (`registry.handleRequest` delegation), so coverage is not lost, but a deliberate fold onto the real listener would have been tidier. Cosmetic.

**NIT-2 — doc-comment drift only.** The `vi.mock(llm-client)` mentions in #11/#13 are comment lines asserting the *absence* of the mock; harmless but a future grep-based audit will keep flagging them. Consider rephrasing to avoid the literal token (e.g. "the builtin lane uses no llm-client mock").

---

## Lens summary

- **Architecture:** Respects the path-only guard spine; correctly declines to route AL7's bridge proof through `provisionSession`; allowlist edits monotonic-shrink and scoped to AR6's own files. The two Phase-2 CRITICALs (no duplicate AM2 capabilities file; #13 removed from coverage-debt once full matrix) are both honored.
- **Security:** No new surface. No secrets in test assertions (`requireHarness` error names harnesses, never key values — verified). No skip-on-credit bypass survives.
- **Adversarial:** Saboteur check — the credit-skip-guard (the exact false-green this track exists to kill) is fully reverted; no out-of-scope test weakened. Auditor check — PR claims match the diff (deletions, demotions, full-matrix conversions all present). New-hire check — `AL6-return-gate` vs `AL6-return-gate-scripted` naming is mildly confusing (WARNING-2).
- **Simplification:** WARNING-2 redundancy is the only notable item; the rest is proportional (rename-only demotes, no over-engineering).
- **Slop:** No "TODO: implement" on implemented code, no value-free wrappers. `@lore` comments are load-bearing (cost-zero, builtin-lane rationale, canonical-models).

---

## Note on verify-green

`npm run check` PASS (12/12 packages, exit 0). `honest-harness-guard --check` clean (exit 0). #13 builtin lane ran live green (1 passed / 3.02s). The pending full `npm run verify` green is a known ship-gate item: under heavy concurrent load (3 sibling pipeline verifies) the integration leg crashes producing JSON and the per-harness floor correctly fails-closed to 0/0 rather than minting a false green. The targeted #11 (14/14) and #13 (8/8) runs pass cleanly in isolation under the final models. I find **no failure attributable to AR6 code** — the structural, type, lint, guard, and targeted-execution evidence is consistent and honest. The verify-green must still be obtained on an unloaded machine before merge, but it is not an AR6 defect.

**Verdict: DONE**
