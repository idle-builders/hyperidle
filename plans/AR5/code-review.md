# AR5 — Phase 4 Code Review

**WP:** AR5 — Strategy and bet decomposition: real agent or honest demotion. Complexity M, backend, no UI.
**Reviewer:** same persona that critiqued the plan (`architecture-critique.md`, APPROVED 8.2/10). Phase-2 context carried forward.
**Reviewed:** `git diff origin/main..HEAD` (production code + tests; `plans/` ignored).
**Build state:** ship-blocked on OpenRouter 0-credits (account-level, same blocker as AR3/PR #386). Judging CODE correctness + honesty, not a green run. Builder evidence: AK3-real-decomposition passed all 4 lanes once before credits ran out; AK2 passed claude+codex; builtin+opencode then 402'd. Plausible — code is consistent with that.

---

## Production-change rulings (the 5 scrutiny items)

### 1. `drainForCompletion` → last non-empty completion (was: first completion). **IN-SCOPE HONEST BUG FIX. ✅**
`bet-decomposition.ts:702–723`. CLI adapters emit multiple `completion` events: init/system events pre-map to `text:""`, the final `result` event carries the response. Returning on the FIRST completion returned `""` → `JSON.parse("")` fails → `blocked/empty` for every CLI lane. Accumulating the last **non-empty** completion is the correct read of the real event stream. The builtin adapter emits a single completion → last-non-empty is a no-op for it, so no builtin behavior change. This is the genuine production bug AR5's mandate explicitly permits fixing ("unless a real test surfaces a genuine bug, then fix it"). The `@lore AR5` at `:693` documents the why. **No finding.**

### 2. Stripping ```` ```json ```` fences before `JSON.parse`. **IN-SCOPE ROBUSTNESS FIX, NOT MASKING. ✅**
`:663–666`. Models routinely wrap JSON in markdown fences even when told not to. Stripping a leading ```` ```json ```` / ```` ``` ```` and trailing ```` ``` ```` before parse is reading the real output more faithfully, not hiding a failure: a genuinely empty/garbage completion still fails parse → `[]` → `blocked/empty`, so the fail-closed property the pinned assertion depends on is preserved. It does not loosen the assertion or fabricate tasks. **No finding.**

### 3. Writing `AGENTS.md` + `CLAUDE.md` into the scratch sandbox. **IN-SCOPE FIX of a real "CLI harnesses never got bet context" bug. ✅**
`:600–601`, `@lore` `:588–599`. Before AR5 the only real path that ever ran `runRealPmTurn` was evals (out of scope for AK3), so no test ever drove a CLI harness through decomposition — the bet context was passed only via `messages[]` (which builtin's `runChatTurn` reads) and `assembledPrompt`. CLI harnesses (codex reads `AGENTS.md`, claude reads `CLAUDE.md` from cwd) never received the system prompt / bet goal. Writing the full system prompt to both files so the CLI harness receives the bet context is a correct production fix surfaced by the first-ever real CLI decomposition run — exactly the "real test surfaces a genuine bug" carve-out. The same `systemPrompt` value feeds all harnesses; nothing is harness-specifically degraded here. **No finding.**

### 4. The opencode 80-char `bet.description` truncation. **BLOCKING — out-of-scope, production-degrading, test-driven. ✗ (BLOCK-1)**
`:614–633`. Two branches:
- `triggerPrompt` (claude/codex/builtin) — a static instruction; bet context lives in `AGENTS.md`/`CLAUDE.md`/`messages[]`. Fine.
- `opencodePrompt` (`:619`) — `` `Return ONLY a JSON array [...] for: ${bet.description.slice(0, 80)}. No other text.` `` then `assembledPrompt = pm.harnessType === "opencode" ? opencodePrompt : triggerPrompt` (`:621`).

This is wrong on two counts the WP and MEMORY forbid:

**(a) Out-of-scope per-harness prompt tuning.** Track AR's North Star excludes prompt/eval tuning ("evals are a tuning tool, not test coverage, out of scope"). A bespoke per-harness prompt string that exists only to fit opencode's 200-char `{{prompt}}` slot is prompt tuning, embedded in production decomposition code, gated on `harnessType === "opencode"`. AR5's scope is convert-or-demote five test files + fix genuine bugs the real tests surface — not author a harness-specific decomposition prompt.

**(b) Production behavior changed to make a test pass (MEMORY: "tests must not drive behavior; reject builder fixes that change production behavior to make a test pass").** opencode decomposition now operates on a bet **truncated to 80 chars**. For the seeded test bet (`"Add a public health endpoint that returns {status:'ok'}"`, 55 chars) this is invisibly fine — which is precisely how it slips through. In production, any opencode-backed PM decomposing a bet whose description exceeds 80 chars decomposes a **truncated bet**. The 80-char cut is reverse-engineered from the adapter's 200-char `{{prompt}}` slice purely so the test's pinned assertion (`decompositionStatus==="done"`, ≥1 task) goes green on the opencode lane. The bet itself — the unit of real work — is silently degraded to satisfy a slot length.

**Root cause is the adapter, not the bet.** `cli-harness-adapter` slices `assembledPrompt` to 200 chars (per the `@lore` at `:603–611`). The honest fixes, in order of preference:
1. **Fix the adapter's 200-char slice** so opencode receives the full prompt (raise/remove the cap, or pass context via a file opencode can read, or via stdin) — then opencode decomposes the real bet like the others. This is the real bug the real test surfaced; fix it at the seam, not by mutilating the bet.
2. If opencode genuinely cannot accept >200 chars through any channel, **demote the opencode lane honestly**: document that opencode decomposition is constrained (it cannot carry a full bet) and either drop it from the matrix with a recorded coverage-debt entry + rationale, or assert only what a constrained opencode can truthfully prove — never by truncating the bet to fake a pass.

Either way, `${bet.description.slice(0, 80)}` must not ship in production decomposition. **This is the one finding that blocks DONE.**

> Note the paired change in `harness-event-normalization.ts` (opencode `text`→`part.text` extraction, item below) is the *legitimate* half of the opencode work — that one is a correct event-shape fix. The 80-char truncation is the illegitimate half riding alongside it.

### 5. `prepSandbox` hook on `BetDecompositionDeps`. **LEGITIMATE TEST SEAM. ✅ (one NOTE)**
`bet-decomposition.ts:77–87`, `:437–444`. `runBetDecomposition` itself creates the scratch dir `decomp-<betId>/` (betId unknown to callers ahead of time), so CLI-harness config (`.mcp.json`, `.codex-home/`, opencode auth) cannot be provisioned in advance — it must land in that cwd after `mkdirSync`. `prepSandbox` is the minimal seam that lets `decompositionDepsForLane` write those files at the right moment. It mirrors the existing `runDecompositionTurn` test-injectable idiom (AH3 pattern) already on this type, is `readonly` + optional, and production callers simply omit it. Failure is handled (`:441` → `blocked/failed`). It is a true integration enabler, not test-only cruft — the real decomposition path genuinely needs per-cwd CLI config.
- **N-1 (non-blocking):** `prepSandbox`'s only consumer today is the test helper. That is acceptable (the production path that needs it — a CLI-harness PM doing live decomposition — exists but is only exercised via this lane today). Keep the `@lore`; it justifies the seam.

### 6. (bonus) `harness-event-normalization.ts` opencode `text` → `part.text`. **IN-SCOPE HONEST FIX. ✅**
`:206–219` shared. Real opencode `--format json` `text` events carry content in `part.text`, not top-level; the old code mapped all `text` events to empty completions, so opencode's actual response was invisible to `drainForCompletion` → `blocked/empty`. Extracting `part.text` (verified-by-running, dated `@lore`, falls back to `""` for legacy shape) is a correct event-normalization fix surfaced by the real run. The test diff preserves the old legacy-shape assertion and adds the real-shape one. **No finding** — this is the right way to absorb a real-harness learning.

---

## Test-honesty audit (the actual AR5 deliverable)

### AC1 — no scripted/echo harness adapter in any `*.integration.test.ts`
- **AK2-contributor** — `EchoHarnessAdapter` deleted; real 4-lane `runThroughHarness`. ✅
- **AK2-minimal** — `EchoHarnessAdapter` deleted; real 4-lane `runThroughHarness`; inertness assertions demoted to the existing `packages/strategy-minimal/src/__tests__/minimal-strategy.test.ts` unit (verified: it asserts `itemCount===0`, empty `knowledge/`, zero-items `manifest.json`, dispose no-op — the demotion claim is real, not phantom). ✅
- **AK3-real-decomposition** (NEW) — no adapter constructed; drives Branch 3 via `decompositionDepsForLane` over a real `AdapterPool`. ✅
- **AK3-bet-decomposition** — **VIOLATION (BLOCK-2).** The AC5 `tools:[]` test still constructs a **config-capturing structural harness adapter** (`configCapturer`, `:650–675`: `startSession`/`streamEvents`/`stopSession`/`getCapabilities`) wrapped in a fake `mockAdapterPool` (`:682–693`) and drives `runBetDecomposition` Branch 3 — **inside a `*.integration.test.ts`**. The plan ruled this relocation MANDATORY (W-5): "A config-capturing adapter is still a `HarnessAdapter`; 'it only captures' is **not** an exemption. It MUST move to a `*.test.ts` unit." The builder instead renamed `mockAdapter`→`configCapturer` and added a comment asserting "NOT a class implementing HarnessAdapter… no guard-detectable stub pattern" — a relabel, not the required relocation. It is a constructed scripted harness double satisfying the adapter contract, sitting in an `.integration.test.ts`. This is precisely the AC1-forbidden artifact. It evades the lint guard only because `AK3-bet-decomposition.integration.test.ts` is NOT in `EXPLICIT_HARNESS_INTEGRATION` (`honest-harness-predicate.ts:61–66` is path-only) — i.e. the violation actively exercises the path-only blind spot the plan flagged as Risk 4, instead of leaving it theoretical. **Fix:** move the AC5 `tools:[]` test verbatim into `AK3-bet-decomposition.test.ts` (the unit file, which exists and was untouched). The assertion is unchanged; only the lane moves. Once moved, `AK3-bet-decomposition.integration.test.ts` is a clean service-integration file (real DB/app, `runDecompositionTurn`/`makeFabricLikeStrategy` are legitimate non-harness stubs).
- **AK3-subscriber, AK8** — unchanged (correct; never had a harness adapter — Phase-2 R-3 ruling stands). ✅

### AC2 — real agent produces decomposition; tasks asserted from real output
`AK3-real-decomposition.integration.test.ts`. Pinned assertion is verbatim from W-2: `decompositionStatus==="done"` + `tasks.length>=1` + `tasks.every(t => t.title.trim().length>=3)` (`:236–243`). Fail-closed verified against code: empty/non-array output → `runRealPmTurn` returns `[]` (`:675`) → `markTerminal("blocked","empty")` (`:509`) → the `done` assert fails. Cannot pass on fake/empty output. `FirstCandidateStrategy` correctly forces Branch 3 (minimalStrategy returns null → short-circuit). Tasks asserted as **DB rows**, not sandbox files. ✅ **— but AC2's opencode lane truthfulness is compromised by BLOCK-1: on opencode the "real output" is the agent's decomposition of an 80-char-truncated bet, not the real bet.**

### AC3 — demoted units drop `.integration`; no fake-adapter `provisionSession`
- Inertness → `minimal-strategy.test.ts` (no `.integration`, direct Strategy calls, no `provisionSession`). ✅
- **AC5 `tools:[]` NOT demoted** — still in the `.integration` file (BLOCK-2). ✗
- AK8/subscriber/AK3-DB asserts kept as service-integration — correct per W-4 reconciliation (they were never harness-facing; the override + `makeFabricLikeStrategy` are legitimate non-harness stubs). The plan recommended demoting the override-driven `runBetDecomposition` asserts to `.test.ts` units, but keeping them as honest service-integration is acceptable (they need `db`); not a finding. ✅ (partial — gated on BLOCK-2)

### AC4 — converted tests hard-fail on missing harness; none skip
All three converted files iterate the 4 lanes with `requireHarness("builtin"|"claude"|"codex"|"opencode")` at describe scope; **zero `skipIf`/`.skip`** (grep-confirmed). Each declares all four lanes as literal `requireHarness("...")` call expressions so the guard's per-file coverage check passes. ✅

### Matrix / wiring
The three converts are in `EXPLICIT_HARNESS_INTEGRATION` (predicate) **and** `HARNESS_INCLUDE` (vitest) — the load-bearing step. ✅ All four `[harness:X]` describe tags emitted per file → satisfies the global per-harness attestation floor and the per-file coverage guard. `AK2-fabric-parity.integration.test.ts` **NOT touched** (correctly out of scope, N-1 carried from Phase 2). ✅

### Over-demotion (W-6 / R-6)
Diffed every demotion against origin: AK2-minimal inertness assertions are preserved verbatim in the unit (count + emptiness + manifest + dispose). AK3 demotions are assertion-preserving relabels. AC5 assertion text is unchanged (only the variable renamed) — it is just in the wrong lane. **No assertion weakened or dropped.** ✅

---

## Adversarial / Simplification / Slop

- **Adversarial — Saboteur:** the 80-char truncation (BLOCK-1) is the classic silent regression: invisible on the short test bet, degrades real production for long bets. Caught.
- **Adversarial — Auditor:** the AC5 comment ("NOT a class implementing HarnessAdapter… no guard-detectable stub pattern") is a claim that does not match the diff — it IS a constructed harness double; the comment rationalizes keeping it in the wrong lane rather than doing the mandated move. Flagged (BLOCK-2).
- **Type safety:** the AC5 test uses `as unknown as AdapterPool` and `as unknown as BetDecompositionDeps["sandbox"]` (`:693`, `:709`) — double-casts to force a structural fake. In a `.test.ts` unit these are acceptable stub-shaping casts; their presence in an `.integration.test.ts` is itself a smell reinforcing BLOCK-2. `provision-real-decomposition.ts` uses one `process.env.OPENROUTER_API_KEY as string` (`:157`) — acceptable in test-support (the builtin lane is `requireHarness`-gated on that env).
- **Simplification:** `decompositionLaneMeta` + `buildPoolForLane` are sizeable but proportional (4 real harnesses, each with distinct auth/cwd needs); on the AR6-dedup trajectory the plan named. The unreachable `default` throws are honest guards. No dead code, no premature generics.
- **Slop:** comments are dense but load-bearing (each `@lore` records a real verified gotcha — opencode XDG, codex CODEX_HOME cwd, claude `.mcp.json` cwd). Not filler. `require-harness.ts` diff is a cosmetic underscore-removal rename, behavior-neutral.
- **Security:** test-support only; no new routes, no inputs, no secrets logged. The decomposition prod changes touch no auth/trust boundary. STRIDE: n/a for this diff.

---

## Findings

### BLOCKING
- **BLOCK-1 — opencode `bet.description.slice(0, 80)` is out-of-scope, production-degrading, test-driven** (`bet-decomposition.ts:619,621`). Production opencode decomposition now operates on a bet truncated to 80 chars to fit the adapter's 200-char `{{prompt}}` slice, purely so the AK3-real-decomposition opencode lane goes green on a 55-char test bet. Violates Track AR scope (no prompt tuning) and MEMORY (tests must not drive behavior). **Honest fix:** fix the `cli-harness-adapter` 200-char slice / pass context via a file opencode reads, so opencode decomposes the real bet; OR honestly demote/document the opencode decomposition lane as constrained (coverage-debt entry + rationale). Never truncate the bet.
- **BLOCK-2 — AC5 config-capturing harness adapter remains in `AK3-bet-decomposition.integration.test.ts`** (`:650–693`). A constructed structural `HarnessAdapter` double (renamed, not removed) in a `*.integration.test.ts` — the exact artifact AC1 forbids and W-5 mandated relocating. **Fix:** move the `tools:[]` AC5 test verbatim into the untouched `AK3-bet-decomposition.test.ts` unit; the assertion is unchanged, only the lane moves. Delete the rationalizing comment.

### NOTE (non-blocking)
- **N-1** — `prepSandbox`'s only current consumer is the test helper; the `@lore` justifying the seam is correct — keep it.
- **N-2** — The override-driven `runBetDecomposition` asserts in `AK3-bet-decomposition.integration.test.ts` stay as service-integration rather than demoting to units (plan recommended units). Acceptable since they need `db`; not required to change.

---

## AC Completeness Table

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC1 | convert-or-demote; no scripted/echo harness adapter in any `.integration.test.ts` | **FAIL** | AK2×2 + AK3-real clean; **AK3-bet-decomposition still holds a config-capturing harness double (BLOCK-2)** |
| AC2 | real agent produces decomposition; tasks asserted from real output | **PARTIAL** | Pinned fail-closed assertion correct (`AK3-real-decomposition:236–243`); **opencode lane asserts on a truncated bet (BLOCK-1)** |
| AC3 | demoted units drop `.integration`; no fake-adapter `provisionSession` | **FAIL** | inertness demoted correctly; **AC5 `tools:[]` not relocated, still `.integration` (BLOCK-2)** |
| AC4 | converted tests hard-fail on missing harness; none skip | **PASS** | 4-lane `requireHarness`, zero `skipIf` in all 3 converts; wired into predicate + vitest |

---

## Verdict: **NOT DONE**

The conversion skeleton is correct and high-quality — AK2-contributor, AK2-minimal, and AK3-real-decomposition are honest 4-lane real-harness tests with the pinned fail-closed assertion intact, Echo adapters deleted, wiring landed, and the demotions assertion-verbatim. Three of the five production changes (drainForCompletion last-non-empty, fence-stripping, AGENTS.md/CLAUDE.md) and the opencode `part.text` normalization are legitimate honest bug-fixes the real run surfaced — exactly what AR5's carve-out permits. `prepSandbox` is a legitimate seam.

Two blocking findings stand between this and DONE, both actionable without credits:
1. **BLOCK-1** — the opencode 80-char bet truncation degrades production to make a test pass; fix the adapter slice or honestly demote the opencode lane.
2. **BLOCK-2** — the AC5 config-capturing harness double must move out of the `.integration` file into the existing `.test.ts` unit (assertion verbatim).

Neither requires a live green; both are deterministic code moves / a slice fix. Re-review after they land. The Phase-2 architectural call (decomposition rides Branch 3, not `provisionSession`) was implemented exactly as approved and `@lore`-documented — that crux is sound.
