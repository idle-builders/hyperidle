# AR4 — Code Review (Phase 4)

**Reviewer:** single evaluator persona (carried from Phase-2 critique, 8/10 APPROVE).
**Round:** 1.
**Verdict: NOT DONE.** One CRITICAL (the CLI-lane `crashed`-acceptance re-opens CC-004 — the exact failure the AR track exists to kill) + supporting findings.

The dispatcher/builtin half is strong and honest. The 3 CLI lanes on AD2-real + R1-real were weakened below the sanctioned AR2 floor, which is the load-bearing seam proof for AC2/AC4. That weakening is the failure mode the whole track exists to prevent.

---

## CRITICAL

### C-1. AD2-real + R1-real CLI lanes accept `crashed` — a startup crash mints green with zero real agent work (CC-004, the seam stubbed in disguise).

**Files / lines:**
- `packages/server/src/__tests__/AD2-task-dispatcher-real.integration.test.ts:341,358` (claude), `:450,460` (codex), `:567,579` (opencode)
- `packages/server/src/__tests__/R1-wire-agent-execution-real.integration.test.ts:326,337` (claude), `:432,440` (codex), `:542,550` (opencode)

All three CLI lanes in both files assert:
```ts
expect(["done", "crashed"]).toContain(s?.state);
expect(["completed", "not_returned", "crashed"]).toContain(s?.outcome);
```

**Why this is a false green.** The session row is inserted at Phase 5 of `provisionSession` (`session-provisioning.ts:519`, `state:"active"`) **before the harness runs** (Phase 9 `harness.startSession` at `:1035`). Any failure in `startSession` is caught and routed to `crashSession` (`:1036-1038`), which sets `state="crashed", outcome="crashed"` (`session-lifecycle.ts:379-380,395`). So a CLI binary that fails to spawn, hits a bad MCP config, fails keychain auth, or crashes at startup — having done **zero real LLM work** — produces exactly `state=crashed, outcome=crashed` with a session row present. The test's `vi.waitFor` finds the row, and both assertions pass.

The only unconditional assertions are "session row exists" + "terminal state reached." The builder's lore (AD2-real `:347-357`, R1-real `:332-335`) argues this is "the unconditional load-bearing seam-existence proof." **It is not.** It proves the orchestrator created a row and the harness *terminated* — not that a real agent *ran*. The artifact check (`if (answerContent !== undefined)`) is conditional and therefore proves nothing on its own. Sanity-break: a claude binary that crashed at startup on every run would mint green forever on this lane.

**This is the precise weakening the AR track exists to kill.** The sanctioned AR2 reference is explicit and was the established contract:
- `AR2-provision-real-session.integration.test.ts:499,606`: `expect(["completed","not_returned"]).toContain(result.outcome)` — **FAIL on crashed.**
- AR2 lore (`:69`): *"a stub/echo adapter yields cost=0, outcome=**crashed**, no files. A real codex run ends **non-crash** AND writes a file."* — `crashed` is precisely the value AR2 uses to distinguish a real run from a stub/startup-crash.

**The plan also mandates FAIL-on-crashed** (it was carried forward from Phase 2, not invented here):
- architecture.md §"Key design decisions" #4: *"FAIL on `crashed`/`error`."*
- architecture.md per-file triage, AC4 crashed-path row: crash path is a **demoted** service-integration concern, never a pass condition on the real lane.

The attestation per-harness floor (`assertPerHarnessFloor`) does **not** save this: it only requires each harness to have ≥1 *executed* assertion, and a passing assertion over a crashed-at-startup session counts as executed. So claude/codex/opencode can crash at startup on every run and still satisfy the floor.

**Fix.** Restore the AR2 floor on all six CLI lanes: `expect(["completed","not_returned"]).toContain(outcome)` — **remove `"crashed"`** and remove `"crashed"` from the `state` waitFor (wait for `"done"` only, as AR2 does; if the CLI genuinely cannot reach `done`, that is a real bug to surface, not to accept). For the codex/opencode `not_returned` posture (real billable work, no MCP return call) keep `not_returned` — that is the honest AR2 floor and is non-crash. The artifact check should stay best-effort, but it is no longer the load-bearing proof: the non-crash outcome is. If a CLI lane genuinely cannot run green in this environment, that is a binary/auth problem to fix or surface via `requireHarness`, not to paper over by accepting `crashed`.

---

## WARNING

### W-1. R1-real builtin test title claims `real cost > 0` but never asserts it (Auditor: claim ≠ diff).
`R1-wire-agent-execution-real.integration.test.ts:158` — `test("POST /api/sessions → real builtin provisionSession → session done, real cost > 0", ...)`. There is **no cost assertion in the test body** (grep for `cost` in the test finds only the seed `costCap: null` and the title). The plan's AC1 verification row explicitly names cost as the builtin real-work proof. `cost > 0` is exactly the unconditional "a real model ran" assertion the builtin lane should carry (and would partly compensate C-1 for builtin). **Fix:** either assert `row.totalCostCents` / cost > 0 on the builtin lane, or correct the misleading title. Asserting it is strongly preferred — it is the cheapest unconditional real-work proof available on the builtin lane.

### W-2. AH6 lane-gate "verdict" tests a test-local function — tautology, proves nothing about production.
`AH6-lane-gate-verdict.test.ts:27-29` and `AH6-lane-gates-broken-turn-real.integration.test.ts:39-41` both **define `s1DistinctReplyPredicate` locally inside the test file** and then assert on it. There is **no production `s1DistinctReplyPredicate` / lane-gate function** — confirmed by grep across `packages/server/src` (only a stray comment in `builtin-harness-adapter.ts:558` mentions "S1 predicate"). So the verdict unit (`length>0 && reply !== welcome`) is asserting a function written two lines above it — a pure tautology that violates testing.md ("never write tests that assert on a function defined in the test"). The broken-lane "proof" of AC3 therefore proves nothing about the system.

The **valid-lane** leg in AH6-real has independent value (it asserts a real builtin turn persisted a non-empty, non-welcome reply over **real** output), but the predicate being trivially-true and test-local means AC3's lane-gate claim is thin. **Fix:** if a production lane-gate predicate exists (or should), import it and assert against it; if AC3's "lane gate" is really just "a real turn produced a distinct non-empty reply," state that plainly and drop the `s1DistinctReplyPredicate` ceremony — it dresses a `length>0` check up as a gate. Either way the verdict unit as written is not a test of production behavior. (This is partly inherited from the pre-AR4 AH6, but AR4 is the conversion that was supposed to make AC3 honest, and it carried the tautology forward.)

### W-3. AH3 service-integration remainder keeps two inline fake adapters in a mislabeled `.integration.test.ts`, dodging the guard by anonymization.
`AH3-assistant-turn.integration.test.ts:868` (capturingAdapter) and `:978` (validatingAdapter) are hand-rolled fake `HarnessAdapter` objects inside a file named `*.integration.test.ts`. The path-only guard does not flag them because (a) the file is deliberately **not** in `EXPLICIT_HARNESS_INTEGRATION`, and (b) the fakes are anonymous object literals, not `class … implements HarnessAdapter` or `new XHarnessAdapter`, so the stub-content regex misses them even if the file were selected.

**Acceptable in substance, flag the mechanism.** The real "user message reaches the model" proof (H3) genuinely landed in `AH3-assistant-turn-real.integration.test.ts` (the PONG turn over a real builtin model), and these remnants test `SessionConfig.messages` transcript assembly — a pre-harness service concern. Per the plan's single-archetype split that is the intended home. **But** the block's own docstring still claims "user message reaches the model" with a fake terminal adapter, and the file is `.integration.test.ts` carrying harness fakes that only escape the guard via anonymization. **Fix (low cost):** rename/relabel this H3 block to name its true subject (transcript assembly), and note in `honest-harness-predicate.ts` that the stub regex does not catch anonymous inline fakes — a mechanism gap the next track should close (e.g. flag inline objects with `startSession`+`streamEvents`+`stopSession` shape). Not a blocker on its own.

---

## NIT

- **N-1.** `AH3-assistant-turn-real.integration.test.ts:69-76,126-138`: the PONG/text assertions are wrapped in `if (astReply) {…}` after an unconditional `expect(astReply).toBeDefined()`. The `if` is redundant defensive slop (if undefined, `toBeDefined` already failed). Inline the assertions. Harmless but it reads like the PONG check is optional when it is not.
- **N-2.** `AH3-assistant-turn-real.integration.test.ts:85-141` (H3): dead `SENTINEL = "PONG-AR4-H3"` constant + `void SENTINEL`, plus a multi-line comment block (`:109-114`) explaining the test "cannot update the seeded message" — but the seed **does** ask for PONG (`seedAssistantTurnDomain` payload `:670`), so the assertion is real. The confused comment and dead sentinel are AI slop; delete them. The test is sound; the narration around it is not.
- **N-3.** `AD2-task-dispatcher-real.integration.test.ts:206,208,250` builtin lane builds `laneParams` then `void laneParams` (only used to "structurally confirm we built real params"). Dead — the builtin lane passes `resolveModel` inline (`:218-223`) and never uses `laneParams`. Remove it.
- **N-4.** `AH3-assistant-turn-real.integration.test.ts:93-94`: empty `beforeEach(async () => {})` / `afterEach(() => {})`. Delete.
- **N-5.** The `crashed`-acceptance lore comments (AD2-real `:339-357`, `:456-459`, `:564-578`; R1-real `:322-335`, `:438-439`, `:548-549`) are long, confident, and wrong (see C-1). When C-1 is fixed, delete them — they actively argue for the weakened floor.

---

## What is correct (verified, not assumed)

- **No `vi.mock` of harness/llm-client and no named fake adapter in any AR4 harness-facing `*.integration.test.ts`** (grep clean across the five `-real` files; only doc-comment mentions of the word). AC1's "no vi.mock remains" holds for the selected set. The `vi.mock` in `assistant-turn-per-agent-seam.test.ts` and `AK4-assistant-draft-registry.test.ts` is legitimate — both are demoted `.test.ts` units, not selected by the guard.
- **`requireHarness` hard-fails, never skips** (`require-harness.ts:74-83` throws; no `skipIf` anywhere in the AR4 set). AC4 mechanism is sound.
- **Guard wiring is correct.** `--check` runs clean. The five `-real` files are in `EXPLICIT_HARNESS_INTEGRATION`; the three assistant-turn files are additionally in `BUILTIN_ONLY_INTEGRATION`; the carve-out in `ruleFor` (`honest-harness-guard.ts:358-374`) runs **after** the stub + skipIf checks and still requires `requireHarness("builtin")`, exactly as the Phase-2 carry-forward demanded. `routes/__tests__` added to `SCAN_DIRS` for lint only.
- **Attestation per-harness floor holds** (`attestation-floor.ts` `assertPerHarnessFloor`): claude/codex/opencode each get ≥1 executed assertion from AD2-real + R1-real; builtin from all five. No floor change needed. (Caveat: the floor counts *executed*, not *non-crashed* — which is why C-1 slips past it.)
- **The dispatch→provision seam IS exercised, not bypassed.** AD2-real drives `transitionTask(...,"accepted")` → real `drainQueue` → real `provisionSession` (registry-wired at `:61`); `vi.waitFor` for the session row would time out if the wiring were reverted. No `state:"in_progress"` seed inside the AC2 assertion. The `onBeforeTeardown` production touch (`task-dispatcher.ts:104-115,386`) is additive-optional and threaded correctly; teardown still deletes the sandbox (observe-not-disable).
- **Builtin lanes are strict** — AD2-real `:247`, R1-real `:220`, and all three assistant-turn-real files assert non-empty real replies / `[completed,not_returned]` with **no** `crashed`. The builtin proofs are genuine real-work proofs.
- **Demotions preserved their assertions.** AK4 registry unit carries AC3a/AC4/AC4-loop with real handler logic. AD2 service remainder keeps all 13 queue/cost/concurrency/sweep tests (the `in_progress` seeds there are legitimate queue fixtures, correctly out of `EXPLICIT_HARNESS_INTEGRATION`). Per-agent-seam test-2 ("message persisted") migrated to AH3-real H1.
- **Security:** N/A confirmed — tests only; the one production touch is an optional test-callback dep. No new route/input/secret surface.

---

## AC completeness

| AC | Status | Evidence |
|---|---|---|
| AC1 — real model turn, no vi.mock/echo remains; pure-logic demoted to units | **PARTIAL** | No vi.mock/fake adapter in any selected `-real` file (grep clean). AH3-real H1/H3 + AK4-real AC1 + AH6-real assert real non-empty `ast-*` replies via real OpenRouter model. Demotions honest. **Gap:** R1-real builtin claims `cost>0` but never asserts it (W-1); AH6 verdict is a test-local tautology (W-2). Substantively met for the builtin assistant-turn surface; weakened proofs noted. |
| AC2 — dispatch→provision seam with a real agent (not seeded in_progress) | **NOT MET** | Seam genuinely exercised via real trigger + real `provisionSession` (builtin lane is a sound proof). **But** the 3 CLI lanes accept `crashed` (C-1) → a startup crash with zero real agent work mints green. The keystone AC2 proof is exactly the seam-stubbed-in-disguise the track exists to kill, for 3 of 4 harnesses. |
| AC3 — lane-gate on broken/real turn vs real harness output | **NOT MET** | Valid-lane leg runs over real builtin output (real reply persisted) — has value. But the gate predicate is a test-local tautology with no production counterpart (W-2); the broken-lane "verdict unit" proves nothing about the system. AC3's "lane gate" claim is not honestly proven. |
| AC4 — all converted tests hard-fail on missing harness; none skip | **MET** | `requireHarness` throws (never skips); no `skipIf` in the AR4 set; guard skipIf-check clean. |
| Matrix / per-harness floor / coverage-debt | **MET (mechanically)** | AD2-real + R1-real declare all four lanes; AH3/AK4/AH6-real declare builtin via the carve-out; floor satisfied; no coverage-debt entries (atomic). Caveat: floor counts executed-not-crashed, so C-1's crashed-acceptance is invisible to it. |

---

## Verdict: NOT DONE

Blocking: **C-1** (CRITICAL). AC2 and AC3 are not honestly proven; AC1 carries two weakened proofs (W-1, W-2).

**Required before re-review:**
1. **C-1:** remove `"crashed"` from the state + outcome assertions on all six CLI lanes (AD2-real + R1-real, claude/codex/opencode). Restore the AR2 floor: wait for `"done"`, assert `outcome ∈ {completed, not_returned}`, FAIL on crashed. Delete the lore that argues for accepting crashed (N-5).
2. **W-1:** assert real cost > 0 on the R1-real builtin lane (or, at minimum, correct the title — but asserting is the right fix and the cheapest unconditional real-work proof).
3. **W-2:** make AH6 AC3 honest — either assert a real production lane-gate predicate, or drop the `s1DistinctReplyPredicate` ceremony and state plainly that the real leg proves "a real builtin turn persists a distinct non-empty reply." The current verdict unit is a tautology.
4. **W-3 / NITs:** relabel the AH3 H3 transcript-assembly remnant; clean the slop (dead sentinel, empty hooks, `void laneParams`, redundant `if (astReply)`).

---

# AR4 — Code Review · Round 2

**Reviewer:** single evaluator persona (carried from Round 1).
**Verdict: DONE.** The Round-1 CRITICAL (C-1) is genuinely resolved at the code level, not papered over; W-1 and W-2 are addressed; the founder-directed model change is honest and does not break the shared AR2 lane table. All 5 ACs evidenced. No CRITICAL remains.

## C-1 (was CRITICAL) — RESOLVED. CLI lanes now assert the strict AR2 floor; the opencode root cause was actually fixed.

Re-read both files line-by-line, not the report.

- **AD2-real** (`AD2-task-dispatcher-real.integration.test.ts`): all 3 CLI lanes now `expect(s?.state).toBe("done")` in the waitFor and `expect(["completed","not_returned"]).toContain(s?.outcome)` (claude :336/:346, codex :440/:450, opencode :560/:570). `crashed` is **gone** from every state+outcome assertion. The artifact check stays best-effort (`if (answerContent !== undefined)`); the non-crash outcome is the load-bearing proof, matching AR2.
- **R1-real** (`R1-wire-agent-execution-real.integration.test.ts`): all 3 CLI lanes wait for `"done"` only and assert `["completed","not_returned"]` (claude :341/:349, codex :445/:451, opencode :559/:566). The **one** remaining `crashed` token (`:223`) is the **builtin** lane's fail-fast waitFor — `expect(["done","crashed"]).toContain(row?.state)` — whose only purpose is to break out of the 240 s wait fast; the strict outcome assertion at `:234` then FAILS if it crashed. That is the correct fail-fast pattern, not crashed-acceptance. Verified: grep for `crashed` in any `toContain` across both files returns exactly that one fail-fast line.
- **Sanity-break (mental):** a CLI binary that crashes at startup now sets `state=crashed, outcome=crashed` → `expect(state).toBe("done")` fails (or for builtin, the `:234` outcome assertion fails). Green can no longer be minted by a startup crash. Correct.
- **Real wiring gap closed, not papered.** The opencode model-prefix root cause is fixed at its source: `R1-real :511-516` seeds `workhorseModel: "openrouter/moonshotai/kimi-k2.7-code"` with lore explaining that opencode's `--model` flag (`adapter-pool.ts:401-402`, which DOES carry `{{model}}`) requires the `openrouter/` provider prefix or the CLI crashes at startup. The lanes pass strict **because** the agents now genuinely reach `done`/non-crash — proven by the passing runs (builder evidence + my AR2 Lane-2 re-run below).
- **N-5 lore cleaned.** No lore arguing FOR accepting crashed remains; the surviving `crashed` comments now argue the strict direction (AD2-real :345 "crashed is NOT acceptable…mints false green", :435 "FAIL on crashed").

## W-1 — RESOLVED. The misleading "real cost > 0" title is corrected; no false proof claimed.

`R1-real :166` test title is now `"…→ non-crash outcome (AC1)"` — the `cost > 0` claim is gone. Lore at `:231-233` honestly states the sessions DB row has no cost column (cost lives in `ProvisionSessionResult`, not persisted), so a route-based test that polls the row cannot assert cost; the non-crash outcome is the honest load-bearing proof here, same as AR2's codex/opencode lanes. The test no longer claims a proof it doesn't make. Acceptable resolution (the builtin real-work proof is carried independently by AH3-real/AK4-real/AH6-real asserting real non-empty model output).

## W-2 — ADDRESSED (downgraded to NIT). AC3 now has two genuine real proofs; the tautology no longer carries AC3's weight.

The `s1DistinctReplyPredicate` test-local function is **gone**. AC3 is now proven by two real, system-level legs:
1. **Valid lane (`AH6-lane-gates-broken-turn-real.integration.test.ts`):** runs a real builtin turn via `runAssistantTurnThroughHarness`, reads the persisted reply, asserts `length > 0` and `!== WELCOME_TEXT` over **real** model output (:75,:83,:84). I ran it: green, real deepseek turn in ~4.4 s. Genuine real-harness proof.
2. **Broken-trigger lane (`AH6-lane-gates-broken-turn.integration.test.ts` Term-1):** POSTs a human message through the real route WITHOUT `assistantTurnDeps`, asserts **no** assistant reply appears (:187) — a real system-level negative proof that the trigger is load-bearing. Green.

**Residual NIT (was W-2):** `AH6-lane-gate-verdict.test.ts` still inlines the literal expression `lastReply.length > 0 && lastReply !== WELCOME_TEXT` against literal inputs (`""`, `WELCOME_TEXT`, `"Hello…"`, `" "`). With no production lane-gate predicate to import (confirmed by grep — only a doc-comment at `builtin-harness-adapter.ts:558`; `teams-routes.ts:580` is the unrelated onboarding welcome text), this file proves JS `&&`/`.length` semantics, not HyperIdle behavior. It is now harmless — the file's own header and lore honestly state the real proof is the harness leg, and it no longer carries AC3 — but it remains test-theater. **Not blocking** (AC3 has two real proofs); a future cleanup could delete it or fold its 4 crafted cases into a documented note. Flagged, not gating.

## Model change (founder directive) — HONEST, and does not break the shared AR2 lane table.

Commit `49dc8c64` touches only test files + the shared `provision-real-session.ts` lane helper — no production model-resolution code, no production seed. Per-harness models:
- **builtin** → `deepseek/deepseek-v4-pro` (OpenRouter slug); seed default `modelId` also → `deepseek/deepseek-v4-pro` (`:615,:628`), and AK4-real seed `:126`. Proven real: AH6-real, AK4-real (12 s), AH3-real all ran green with it.
- **opencode** → `openrouter/moonshotai/kimi-k2.7-code` (provider-prefixed OpenRouter slug, passed via the real `--model` flag). Real run proven via the passing R1-real/AD2-real opencode lanes (builder evidence).
- **claude** → `claude-opus-4-8` (passed via the claude CLI `--model`). **I re-ran AR2 Lane 2 myself** — green in ~14 s, opus resolves on the installed binary. The AR4 model change to the shared table did NOT break AR2's claude lane.
- **codex** → `gpt-4o` is **metadata-only and honest**: codex's args template is `["exec","{{prompt}}","--json"]` (`adapter-pool.ts:351`) with **no `{{model}}` placeholder**, so the field is never passed to the CLI; codex genuinely runs its native default gpt model from `~/.codex/auth.json`. This is NOT a silent no-op that means codex isn't running a model — codex IS running its real default model; the lane just can't pin it via flag. Lore at `:491` states this plainly.

**Shared-table coupling — noted, not blocking.** AR2's claude/codex/opencode CLI lanes inherit these models via `runThroughHarness(SUPPORTED_HARNESS_LANES[N])`. Changing them in an AR4 commit means AR4 now owns AR2's CLI-lane green. I verified the claude path (re-ran AR2 Lane 2 green); builtin in AR2 uses its own candidate-retry model (`gpt-4o-mini`/`gpt-3.5-turbo`), unaffected. The coupling is a maintenance hazard for future model swaps (one edit moves two tracks' lanes) but the current state is green and proven.

## Independently verified this round

- `npm run check` — PASS (all 12 packages).
- `npx tsx scripts/honest-harness-guard.ts --check` — clean.
- AH6-real (real builtin) — green, 1/1, ~4.4 s.
- AH6-lane-gate-verdict unit — green, 4/4.
- AH6 broken-trigger service-integration (Term-1) — green, 1/1.
- AK4-real (real builtin) — green, 2/2, ~12 s.
- AH3-real (real builtin) — green, 2/2, ~4.2 s.
- AR2 Lane 2 (real claude CLI, opus model) — green, 1/1, ~14 s (confirms model change didn't break AR2).
- Code-read confirmed: NITs N-1..N-4 cleaned (no SENTINEL, no redundant `if (astReply)`, no empty hooks, `void laneParams` gone — `laneParams` is now genuinely used via `resolveModel`).

CLI lanes for AD2-real / R1-real (codex/opencode, 3-4 min each) trusted from builder pass evidence + strict-floor code read + the proven opencode root-cause fix + the proven AR2 claude lane.

## AC completeness — Round 2

| AC | Status | Evidence |
|---|---|---|
| AC1 — real model turn through production path; no `vi.mock`/echo of harness/LLM remains; pure-logic demoted to units | **MET** | No `vi.mock`/named-fake adapter in any selected `-real` file (Round-1 grep + guard clean). AH3-real (PONG/text), AK4-real, AH6-real assert real non-empty model output via real OpenRouter (deepseek). W-1 title fixed (no false cost claim). Demotions honest. |
| AC2 — dispatch→provision seam with a real agent (not seeded `in_progress`) | **MET** | AD2-real drives `transitionTask(…,"accepted")` → real `drainQueue` → real `provisionSession` (registry-wired). All 4 lanes now assert the strict AR2 floor (`done` + `["completed","not_returned"]`, FAIL on crashed). C-1 resolved — a startup crash can no longer mint green. |
| AC3 — lane-gate on broken/real turn vs real harness output | **MET** | Valid lane (AH6-real) asserts real builtin output is non-empty + distinct-from-welcome. Broken-trigger lane (AH6 Term-1 service-integration) asserts no reply when the trigger is removed. The `s1DistinctReplyPredicate` tautology is gone; verdict-unit file downgraded to a harmless residual NIT that no longer carries AC3. |
| AC4 — all converted tests hard-fail on missing harness; none skip | **MET** | `requireHarness` throws (never skips); no `skipIf` in the AR4 set; guard skipIf-check clean. |
| Matrix / per-harness floor / coverage-debt / reuse seam | **MET** | AD2-real + R1-real declare all 4 lanes via `SUPPORTED_HARNESS_LANES` + `runThroughHarness`; AH3/AK4/AH6-real declare builtin via the carve-out; guard coverage check + per-harness attestation floor satisfied; no coverage-debt entries (atomic). Reuses `provisionSession`/AR2 seam — no bespoke rigs. The strict floor now also closes the Round-1 caveat (floor counted executed-not-crashed; the test bodies themselves now FAIL on crashed, so a crashed lane can't satisfy the floor with a passing assertion). |

## Verdict: DONE

C-1 (CRITICAL) genuinely resolved — strict AR2 floor restored on all 6 CLI lanes, opencode root cause fixed at source, sanity-break holds. W-1 and W-2 addressed. Founder model change honest (codex metadata-only is real-default, not a no-op) and verified non-breaking against AR2 (claude lane re-run green). All 5 ACs MET. One residual NIT (the `AH6-lane-gate-verdict.test.ts` literal-expression unit — harmless, no longer load-bearing; optional future cleanup) and one maintenance note (shared lane-table model coupling across AR2/AR4). Neither blocks.

WP proceeds to docs + retro + ship.

---

## Post-DONE delta review (2026-06-30)

Reviewed only the delta since the DONE sign-off `2955dbe8`: `git diff 2955dbe8...HEAD`. Commits in scope: `28845572` (docs), `7bb2b169` (retro), `80f7ec71` (artifacts), `de01d7c6` (minimal-strategy swap), `fdcee66b` (progress), `9d3b3cce` (codex `--model` wiring — production), `ef53c23f` (cost-reduction model swaps). Plans deletions (`architecture.md`/`architecture-critique.md`/`review.md`) are `/write-docs` retirement, not regressions.

### Findings

**WARNING-D1 — codex `--model {{model}}` injects a literal empty `--model ""` arg when `resolvedModel` is absent; codex rejects it (no fallback to CLI default).**
- Production change `9d3b3cce` added `"--model", "{{model}}"` to `CLI_TOOL_CONFIGS.codex.args` (`adapter-pool.ts`). `{{model}}` resolves from `config.resolvedModel?.model ?? ""` (`cli-harness-adapter.ts:365`). `resolveTemplates` is a plain `split(key).join(value)` (`:282`), and `finalArgs` are spawned unfiltered (`:418`, `:425`) — so an absent/empty model yields the literal positional arg `--model ""`, NOT a dropped flag.
- **Verified against the real binary** (`codex exec --skip-git-repo-check --model "" …`): codex does NOT fall back to its CLI default. It sends the empty model to the API → `400 invalid_request_error` ("The '' model is not supported") → `turn.failed`. Before AR4 the template had no `{{model}}`, so an absent `resolvedModel` was harmless and codex used its own default. The change therefore converts a previously-working configuration into a guaranteed per-turn failure.
- **Reachability — narrow, not currently exercised.** The `resolvedModel`-presence guard in `session-provisioning.ts:475` fires only for `meta.type === "builtin"`, so it does NOT protect a CLI/codex session with absent `resolvedModel`. However, the production server (`server-factory.ts:241`) always constructs a `DbCredentialResolver` and threads it into the route, so `resolveAgentModel` always runs and returns a non-empty model for a normally-configured codex agent. The only paths to an empty `--model` are: (a) `deps.credentialResolver` undefined (not the production server wiring — test/embedded only), or (b) a misconfigured agent with `modelId === ""` and an empty tier-config model. Both are off the normal production path.
- **Why WARNING not CRITICAL:** not reachable on the standard production server wiring; the AD2-real/R1-real codex lanes positively prove the happy path (real `--model gpt-5.4-mini` → non-crash outcome). But the guard gap is real and the empty-arg failure mode is silent (a degraded-config codex session would fail every turn with an opaque 400 instead of a clear MISSING_CREDENTIAL). **Recommended (non-blocking):** extend the presence guard beyond `builtin` to any CLI adapter whose args template contains `{{model}}`, OR drop the `--model` flag from `finalArgs` when the resolved value is empty (conditional-arg). Either makes the degraded path fail loud-and-early or behave as pre-AR4.

**No assertion weakened (verified).**
- AD2-real + R1-real: the `de01d7c6` minimal-strategy swap touches only `setActiveStrategy(minimalStrategy)` in `beforeEach`. Every lane's strict AR2 floor is intact: `expect(["completed","not_returned"]).toContain(s?.outcome/row?.outcome)` — crashed still FAILS on all 4 lanes in both files (8 assertions total, grep-confirmed).
- AK4-real: not modified in this delta range.
- Model swaps (`ef53c23f`) change only `resolvedModel.model` literals + the `seedAssistantTurnDomain` default + `@lore` comments. No threshold, count, or outcome assertion was loosened to accommodate a cheaper model.

**Strict CLI floor (fail-on-crashed) intact** — confirmed present and unchanged in AD2-real (lines 244/346/450/570) and R1-real (lines 235/350/453/567).

**Gates green** — `npm run check` PASS (12 packages), `npm run lint` PASS (`honest-harness-guard --check: clean`; ag7-consistency PASS; zero errors).

**NIT-D1 — shared lane-table model coupling.** The model literals in `SUPPORTED_HARNESS_LANES` (`provision-real-session.ts`) are reused by AR2/AR3/AR5. A future cost/model swap there silently re-points those tracks' lanes too. Same maintenance note as the DONE review's lane-table coupling — not introduced by this delta, not blocking.

### Verdict: DELTA-OK

The delta is honest: no assertion weakened, the strict fail-on-crashed floor intact on all CLI lanes, lint/check green, honest-harness-guard clean. The codex `--model` wiring is correct on the production server path (always-present credentialResolver → non-empty model; happy path positively proven by the codex lanes). WARNING-D1 (empty-`--model` on the off-normal degraded-config path, with a `builtin`-only presence guard that doesn't cover CLI adapters) is a real but narrow latent gap that does not block ship — recommend a follow-up to extend the guard to CLI `{{model}}` templates or make `--model` conditional on a non-empty value. Ship can proceed.

---

## AR7 merge review

Scope: `git diff 4cbbadcb...HEAD` — merge `bfdc1d55` (origin/main incl. AR7 #391) + follow-up `92c2f204`. Verifies the locked-model-matrix adoption did not regress AR4 or mis-adopt AR7. Code read + guard + check; slow 4-lane suite NOT re-run (builder already proved all lanes pass on the locked tiny models).

### 1. AR7 matrix adopted, no model literals leaked — CONFIRMED
- Locked matrix in `require-harness.ts` HARNESS_TEST_MODELS matches AR7 exactly: builtin=`deepseek/deepseek-v4-flash`, claude=`haiku`, codex=`gpt-5.4-mini`, opencode=`openrouter/z-ai/glm-4.7-flash` (old `glm-5-turbo` gone). `satisfies Record<…>` makes a missing/extra harness a `check` error.
- AR4 harness-facing real tests obtain models ONLY via the seam:
  - AD2-real: `HARNESS_TEST_MODELS.builtin.{model,baseUrl}` (builtin lane); claude/codex/opencode lanes go through `runThroughHarness`/`SUPPORTED_HARNESS_LANES` → `lockedHarnessAdapter` → `harnessTestResolvedModel`.
  - R1-real: each lane feeds `HARNESS_TEST_MODELS.<h>.model` into `serverConfig.modelGateway.{reasoning,workhorse,fast}`; the production route's `resolveAgentModel`→`resolveModelTier` resolves it through real `provisionSession`. No literal.
  - AH3-real / AK4-real (builtin-only): route via `runAssistantTurnThroughHarness`; AK4 uses `HARNESS_TEST_MODELS.builtin.model` for its seed; AH3 takes the seam default.
- The three `deepseek/deepseek-v4-flash` / `gpt-5.4-mini` string literals remaining in AR4-touched files are all OUT of guard scope and legitimate: `AH6-lane-gates-broken-turn.integration.test.ts` (service-integration only, NOT in EXPLICIT_HARNESS_INTEGRATION — model id is a DB seed field, no harness runs), `assistant-turn-per-agent-seam.test.ts` (demoted `.test.ts` unit, `vi.mock` on llm-client), `X5-cli-harness-adapter.test.ts` (`.test.ts` unit asserting arg passthrough). None run a real harness; none are governed by the AR7 rule.
- `provision-real-session.ts` lane configs carry NO hardcoded model — all derive from `harnessTestResolvedModel`/`HARNESS_TEST_MODELS`.

### 2. AR4 core preserved — CONFIRMED
- 6 conversions present: AD2-real + R1-real (4-harness), AH3-real + AK4-real + AH6-real (builtin-only).
- `minimalStrategy` preserved: `setActiveStrategy(minimalStrategy)` in every lane's beforeEach of AD2-real and R1-real (founder directive `de01d7c6` survived the merge).
- `BUILTIN_ONLY_INTEGRATION` carve-out intact (AH3-real/AK4-real declare `requireHarness("builtin")`, header cites the carve-out).
- Strict fail-on-crashed floor intact on every CLI lane: AD2-real lines 245/346/451/571 and R1-real 241/358/466/581 — `expect(["completed","not_returned"]).toContain(...)`. NO lane accepts `crashed` in a final assertion (the `["done","crashed"]` in waitFor is a fail-fast poll predicate, immediately followed by the strict outcome assert that fails on crashed).
- Dispatcher `onBeforeTeardown` seam present (`task-dispatcher.ts:115` field, `:386` forward).
- Demoted units present (`assistant-turn-per-agent-seam.test.ts`, `AH6-lane-gate-verdict.test.ts`, `AK4-assistant-draft-registry.test.ts`).

### 3. AR7 guard compliance — CONFIRMED
- `npx tsx scripts/honest-harness-guard.ts --check` → `clean` (exit 0). No AR4 `*.integration.test.ts` imports `cli-harness-adapter`/`builtin-harness-adapter`/`llm-client` or constructs `new (Cli|Builtin)HarnessAdapter`.
- `scripts/model-import-debt.allowlist.json` contains only pre-existing AR3-AR6/AM2/X5 debt files — NO AR4 file dumped in.

### 4. adapter-pool.ts codex `--model` — CONFIRMED
- Exactly one codex `--model`: `CLI_TOOL_CONFIGS.codex.args = ["exec","--model","{{model}}","{{prompt}}","--json"]` (line 360, AR7 canonical form). AR4's old `["exec","{{prompt}}","--model",...]` form was correctly dropped in favor of AR7's. Other `--model` hits (410 opencode, 494 claude) are the other harness configs — expected.

### 5. provision-real-session `maxOutputTokens: 512` vs lockedHarnessAdapter 1024 — ACCEPTABLE, non-blocking
The assistant-turn helper's `new BuiltinHarnessAdapter({ maxOutputTokens: 512 })` does NOT pick the model. In this path the model is resolved INTERNALLY by `runAssistantTurn`→`resolveAgentModel` from the seeded `ast-*` agent row's `modelId` (defaulting to `HARNESS_TEST_MODELS.builtin.model`). `maxOutputTokens` is only the response-length cap. So the locked model IS honored; 512-vs-1024 is a per-helper length budget, not model-config drift, and cannot cause a correctness divergence on the locked-model assertion. Seam-helper detail — guard-permitted (seam module, not a test file). Recommend (non-blocking) the two seam builtin adapters share one constant for tidiness.

### Carry-forward (unchanged by this merge)
- NIT: `task-dispatcher.ts:115` `onBeforeTeardown?: (ctx: any)` — `any` is from AR4's original task `4b033390`, justified with a biome-ignore (the `BeforeTeardownContext` type lives in `packages/server`; fabric cannot import upward without a layering violation, so it passes the ctx opaquely). Defensible layering tradeoff, not a merge regression.

### Verdict: MERGE-OK

The merge cleanly adopted AR7's locked matrix and dropped AR4's superseded model-config literals. All four verification points pass: no model literal leaked through the seam, all six conversions + minimalStrategy + the builtin-only carve-out + the strict fail-on-crashed floor + the dispatcher seam survived, the honest-harness-guard is clean, codex `--model` appears exactly once in AR7 canonical form. `npm run check` PASS (12 packages). Point-5 inconsistency is a benign seam-helper length-budget detail, not a model-config or correctness issue. Ship can proceed.
