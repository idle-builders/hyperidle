# AR5 — Phase 4 Code Review (re-review round 3 — final confirmation)

> **Round 3 (2026-06-30):** BLOCK-3 RESOLVED by commit `3f08b7d9`. The false `@lore AR5 opencode-context-gap` comment is gone; replaced by a corrected comment stating opencode reads `AGENTS.md`/`CLAUDE.md` by traversing up from the spawn cwd (cites https://opencode.ai/docs/rules/ verified 2026-06-30 + `cli-harness-adapter.ts:426`). Verified comment-only: the `writeFileSync` calls and `assembledPrompt` are byte-identical pre/post fix; no code path changed (`git show 3f08b7d9`). Citation accuracy confirmed: `cli-harness-adapter.ts:425–429` is the single generic CLI spawn with `cwd: config.sandboxPath` covering all CLI harnesses including opencode, exactly where AGENTS.md/CLAUDE.md are written. **All 4 ACs PASS. Verdict flips to DONE.** Runtime green across all 4 lanes remains pending OpenRouter credits (account-level, same ship-blocker as AR3/#386); the ruling never depended on a green run.

**WP:** AR5 — Strategy and bet decomposition: real agent or honest demotion. Complexity M, backend, no UI.
**Reviewer:** same persona that critiqued the plan (`architecture-critique.md`, APPROVED 8.2/10) and ran round-1 review. Phase-2 + round-1 context carried forward.
**Reviewed:** `git diff origin/main..HEAD` after the builder applied BLOCK-1 + BLOCK-2 fixes (commits `e3ea1ce0`, `3a6b129a`).
**Build state:** ship-blocked on OpenRouter 0-credits (account-level, same blocker as AR3/PR #386). Judging CODE honesty + AC completeness, not a green run. `check`/`lint`/`test` (unit) green per builder.

---

## Round-1 blocking findings — verification

### BLOCK-1 (opencode bet truncation) — FIX CONFIRMED ✅
`bet-decomposition.ts:614–615`. The `harnessType === "opencode"` branch and `opencodePrompt = ...${bet.description.slice(0, 80)}...` are **gone**. There is now a single `assembledPrompt` for all harnesses:
```
"Return ONLY a JSON array of tasks for this bet. Each task: {title, description?, doneCondition?, ownerRole?}. No other text."
```
(124 chars — fits the adapter's 200-char `{{prompt}}` slot without truncation). No `bet.description.slice` remains anywhere in the file (grep-confirmed). No per-harness prompt gating remains. Bet context reaches builtin via `messages:[{role:"user",content:betContext}]` (`:626`) and codex/claude via `AGENTS.md`/`CLAUDE.md` written to `scratchSandboxPath` (`:600–601`). The 200-char adapter cap is untouched (correctly out of scope). **The round-1 production-degrading, test-driven truncation is removed. Resolved.**

### BLOCK-2 (AC5 relocation) — FIX CONFIRMED ✅
The entire AC5 `tools:[]` describe block moved verbatim to the unit file `bet-decomposition.test.ts:228–332` (`configCapturer` + `mockAdapterPool` + fixtures + the `SessionConfig`/`SessionHandle`/`HarnessCapabilities`/`AdapterPool` imports). The assertion is byte-identical: `expect(cfg.tools).toEqual([])` over every captured config (`:328–330`).
`bet-decomposition-service.integration.test.ts` now contains **ZERO** constructed harness adapters — grep for `startSession|streamEvents|stopSession|getCapabilities|HarnessAdapter` returns nothing; the only `as unknown as` is the legitimate non-harness `sandbox` stub in `makeTestDeps` (`:196`), and the harness-type imports are gone from its import block. It is a clean service-integration file (real DB/eventBus + `runDecompositionTurn` override). **Resolved.**

---

## THE CRUX — RULING: NOT the terminal state. New blocking finding (BLOCK-3).

The fix exposed a tension, and I was asked to rule on whether keeping opencode as a hard-fail matrix lane while documenting an "opencode-context-gap" is honest. **The premise of that gap is factually false**, which changes the answer entirely.

### The claim under review
`bet-decomposition.ts:607–613`, `@lore AR5 opencode-context-gap`:
> "opencode does NOT read AGENTS.md/CLAUDE.md automatically from the sandbox cwd (unlike codex/claude), so it receives only this trigger prompt without the full bet goal. This is a known constraint of the opencode harness…"

This is presented as a **known constraint** justifying shipping a content-free trigger to opencode and documenting a permanent gap.

### What is actually true (verified against opencode's own docs, 2026-06-30)
opencode **DOES** read `AGENTS.md` and `CLAUDE.md` automatically. Per the official rules doc (https://opencode.ai/docs/rules/): *"When opencode starts, it looks for rule files by traversing up from the current directory (`AGENTS.md`, `CLAUDE.md`)… the first matching file wins in each category."* This is the **same cwd-traversal mechanism codex and claude use** — opencode is not special here.

And the production wiring delivers it: the decomposition turn writes `AGENTS.md` + `CLAUDE.md` into `scratchSandboxPath` (`bet-decomposition.ts:600–601`), and the CLI adapter spawns opencode with `cwd: config.sandboxPath` (= `scratchSandboxPath`) — `cli-harness-adapter.ts:425–426`, with `--dir {{sandbox}}` reinforcing the same cwd. So opencode's startup cwd is exactly the directory the two context files live in. **opencode receives the full bet goal via AGENTS.md, identically to codex.**

### Consequences
1. **There is no gap.** The opencode lane is NOT structurally unable to pass — it gets the bet context through AGENTS.md just like codex/claude. The premise that it "receives only the trigger prompt without the full bet goal" is wrong. (This is consistent with the earlier "AK3 passed 4/4 including opencode" run: the AGENTS.md/CLAUDE.md write predates the truncation hack and was present then; opencode passing did **not** depend on the 80-char hack — it depended on AGENTS.md, which still works.)
2. **The documentation is itself dishonest** — not maliciously, but it is an **unverified assumption presented as a known fact**, and AR5's whole mandate is honesty over false-green. This is a direct hit on MEMORY *"don't assume external tool capabilities — never infer a third-party CLI's current API from training knowledge; do real web research vs authoritative sources, cite version/date."* The `@lore` records a fabricated constraint that will mislead the next agent (e.g. someone "fixing the gap" via MCP, per the comment's own suggestion, for a gap that does not exist).

### Ruling — answering the three options posed
- **(a) Fix the production path so opencode receives the bet context** — already done, by the existing AGENTS.md write. No new mechanism needed. opencode reads it from cwd.
- **(b) Demote/exclude opencode** — NOT warranted and would be the wrong call: it would record coverage debt for a lane that is fully capable. Demoting on a false premise is the opposite of honest.
- **(c) something else** — **YES, this is the fix:** correct the false `@lore` comment to reflect that opencode DOES read AGENTS.md/CLAUDE.md from cwd (cite the docs), and drop the "context-gap"/"out of scope to research" framing. The opencode lane stays a required, hard-fail matrix member — which it can satisfy — preserving the full `SUPPORTED_HARNESSES` matrix constraint with no debt entry.

**This is the correct terminal state: opencode IN the matrix, fed via AGENTS.md, comment corrected.** The current code's *runtime* is very likely fine (opencode will read AGENTS.md and decompose the real bet); what is NOT acceptable to ship is the **false constraint baked into a `@lore` comment**, because it (i) misstates third-party behavior against MEMORY, (ii) would steer future work toward a non-problem, and (iii) leaves the AR5 record claiming opencode is degraded when it is not. **BLOCK-3.**

> Caveat I cannot close without credits: I cannot execute the opencode lane to confirm it goes green via AGENTS.md (0-credits). But the ruling does not depend on a green run — it depends on the comment asserting a false capability claim. The comment must be corrected regardless of the run; if a real run later shows opencode genuinely ignores cwd AGENTS.md under `run --dir` (contra its docs), THAT would be a real, verified gap to document with a citation and a coverage-debt entry — but it cannot be assumed into existence now.

---

## Other production changes — re-confirmed from round 1 (unchanged, still ✅)

- **drainForCompletion → last non-empty** (`:696–717`) — honest read of the real CLI multi-completion stream; no-op for builtin's single completion. ✅
- **markdown-fence stripping before JSON.parse** (`:657–660`) — robustness, fail-closed preserved (garbage → `[]` → blocked/empty). ✅
- **AGENTS.md + CLAUDE.md write** (`:600–601`) — the genuine "CLI harnesses never got bet context" fix; and (per BLOCK-3) it is *also* opencode's context channel. ✅
- **`harness-event-normalization.ts` opencode `part.text`** — correct event-shape fix surfaced by the real run; test preserves legacy + adds real shape. ✅
- **`prepSandbox` hook** (`:84–95`, `:433–443`) — legitimate per-cwd CLI-config seam; failure → blocked/failed; production callers omit it. N-1 (sole consumer is the helper) stands as a non-blocking NOTE. ✅

---

## Test-honesty audit — updated

### AC1 — no scripted/echo harness adapter in any `.integration.test.ts`
- custom-strategy-session / minimal-strategy-session — Echo deleted, real 4-lane. ✅
- bet-decomposition-real-agent — no adapter constructed; drives Branch 3 via `decompositionDepsForLane` over a real `AdapterPool`. ✅
- bet-decomposition-service.integration — **NOW CLEAN** (BLOCK-2 resolved; config-capturer relocated to unit). ✅
- AK3-subscriber, AK8 — unchanged, never had an adapter. ✅
**AC1 PASS.**

### AC2 — real agent produces decomposition; tasks asserted from real output
Pinned assertion verbatim from W-2 (`bet-decomposition-real-agent:236–243`): `decompositionStatus==="done"` + `tasks.length>=1` + `tasks.every(t=>t.title.trim().length>=3)`. Fail-closed verified: empty/non-array → `runRealPmTurn` returns `[]` → `markTerminal("blocked","empty")` → `done` assert fails. Tasks asserted as DB rows. The round-1 compromise (opencode asserting on a truncated bet) is **gone** — opencode now decomposes the full bet via AGENTS.md. **AC2 PASS in code** (runtime green pending credits; the assertion cannot pass on fake/empty output). The only residue is the false comment (BLOCK-3), which does not weaken the assertion but misdocuments the path.

### AC3 — demoted units drop `.integration`; no fake-adapter `provisionSession`
- Inertness → `minimal-strategy.test.ts` (no `.integration`, direct Strategy calls). ✅
- AC5 `tools:[]` → now in `bet-decomposition.test.ts` unit (BLOCK-2 resolved). ✅
- AK8/subscriber/AK3-DB asserts kept as honest service-integration (need `db`). ✅
**AC3 PASS.**

### AC4 — converted tests hard-fail on missing harness; none skip
All three converts iterate the 4 lanes with literal `requireHarness("builtin"|"claude"|"codex"|"opencode")` at describe scope; zero `skipIf`/`.skip`. `bet-decomposition-real-agent` declares all four lanes as explicit `describe` blocks (`:253–271`) so the coverage guard finds the literal call expressions. Wired into `EXPLICIT_HARNESS_INTEGRATION` (predicate `:50`) + `HARNESS_INCLUDE` (vitest). Not in `coverage-debt.allowlist.json` → opencode is a hard-required lane (no excused subset). **AC4 PASS.**

### Over-demotion
No assertion weakened or dropped. AC5 text byte-identical, only relocated. ✅

---

## Adversarial / Simplification / Slop (delta from round 1)

- **Adversarial — Auditor:** the round-1 rationalizing comment on the AC5 double is gone (the test moved, comment rewritten to record the W-5 mandate). The NEW auditor finding is BLOCK-3: a `@lore` comment claims a third-party capability constraint that the vendor docs contradict — a claim that does not match reality, the exact thing the Auditor lens exists to catch.
- **Simplification / Slop:** the single shared `assembledPrompt` is simpler than the round-1 two-branch form. `@lore` density is load-bearing except the false opencode-gap block, which is worse than filler — it is misinformation (BLOCK-3).
- **Type safety:** the relocated unit test's `as unknown as AdapterPool` / `as unknown as BetDecompositionDeps["sandbox"]` are now in a `.test.ts` unit — acceptable stub-shaping casts in their correct home. The integration file's lone `as unknown as` is the non-harness sandbox stub. No new `any`.
- **Security:** test-support + decomposition internals only; no routes/inputs/secrets/auth boundary. STRIDE n/a.

---

## Findings

### BLOCKING
- **BLOCK-3 — `@lore AR5 opencode-context-gap` (`bet-decomposition.ts:607–613`) states a false third-party capability constraint.** It claims opencode "does NOT read AGENTS.md/CLAUDE.md automatically from the sandbox cwd," but opencode's official docs (https://opencode.ai/docs/rules/, verified 2026-06-30) state opencode reads `AGENTS.md`/`CLAUDE.md` by traversing up from the current directory on startup, and the adapter spawns opencode with `cwd = scratchSandboxPath` (`cli-harness-adapter.ts:426`) where both files are written (`bet-decomposition.ts:600–601`). There is no gap; opencode gets the bet context via AGENTS.md exactly like codex. Violates MEMORY *"don't assume external tool capabilities."*
  **Fix (concrete, no credits needed):** rewrite the `:607–613` comment to state that opencode reads `AGENTS.md`/`CLAUDE.md` from the sandbox cwd (cite the docs URL + date), so the bet context reaches opencode the same way it reaches codex; remove the "context-gap" / "honest fix is to document the gap" / "out of scope to research opencode's project-context mechanism" framing. Keep the opencode lane as a required matrix member (it can pass). Do NOT add a coverage-debt entry.
  **If, when credits return, a real opencode run proves it genuinely ignores cwd AGENTS.md under `run --dir`** (contradicting its docs), THEN — and only then — document that as a verified gap with the run evidence + citation and a `coverage-debt.allowlist.json` entry. It must not be assumed now.

### NOTE (non-blocking)
- **N-1** — `prepSandbox`'s only current consumer is the test helper; `@lore` justifies the seam. Keep.
- **N-2** — override-driven `runBetDecomposition` asserts in `bet-decomposition-service.integration.test.ts` stay service-integration rather than demoted to units. Acceptable (need `db`).

---

## AC Completeness Table

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC1 | no scripted/echo harness adapter in any `.integration.test.ts` | **PASS** | custom-strategy-session + minimal-strategy-session + bet-decomposition-real-agent clean; bet-decomposition-service double relocated to unit (BLOCK-2 fixed) |
| AC2 | real agent produces decomposition; tasks asserted from real output | **PASS** | Pinned fail-closed assertion intact (`bet-decomposition-real-agent:236–243`); truncation removed → opencode decomposes the real bet via AGENTS.md (comment now matches verified vendor behavior). Runtime green across all 4 lanes pending OpenRouter credits (same ship-blocker as AR3/#386) |
| AC3 | demoted units drop `.integration`; no fake-adapter `provisionSession` | **PASS** | inertness + AC5 `tools:[]` both demoted to units; service-integration asserts honest |
| AC4 | converted tests hard-fail on missing harness; none skip | **PASS** | 4-lane `requireHarness`, zero `skipIf`; predicate + vitest wired; not in coverage-debt allowlist |

All four ACs PASS at the code/honesty level. BLOCK-3 (the false opencode-context-gap `@lore`) is RESOLVED by `3f08b7d9` — comment corrected to verified vendor behavior, no code path changed. Runtime green across all 4 lanes is the only remaining gate, blocked solely on OpenRouter credits (account-level, identical to AR3/#386) — not an AR5 code defect.

---

## Verdict: **DONE**

All three blocking findings across the review rounds are resolved:
- **BLOCK-1** (opencode 80-char bet truncation) — removed; single content-free trigger for all harnesses, bet context flows via `messages[]` (builtin) and `AGENTS.md`/`CLAUDE.md` (CLI harnesses). ✅
- **BLOCK-2** (AC5 config-capturing harness double in a `.integration` file) — relocated verbatim into the `.test.ts` unit; `.integration` file clean. ✅
- **BLOCK-3** (false `@lore AR5 opencode-context-gap`) — RESOLVED by `3f08b7d9`. The comment now correctly states opencode reads `AGENTS.md`/`CLAUDE.md` by traversing up from the spawn cwd — the same mechanism codex/claude use — citing the vendor docs (https://opencode.ai/docs/rules/, verified 2026-06-30) and the adapter spawn (`cli-harness-adapter.ts:426`, `cwd: config.sandboxPath`). Verified comment-only: `writeFileSync` calls + `assembledPrompt` byte-identical pre/post; no code path changed. The fabricated constraint and MCP/"out of scope to research" framing are gone. ✅

All four ACs PASS at the code/honesty level; the pinned fail-closed assertion is intact; no assertion was weakened; the Phase-2 architectural call (decomposition rides Branch 3, not `provisionSession`) is implemented exactly as approved. The opencode lane stays a required, hard-fail matrix member fed via AGENTS.md — no coverage-debt entry, matching verified vendor behavior.

**Remaining ship gate (not an AR5 defect):** a green run across all 4 harness lanes is blocked solely on OpenRouter 0-credits at the account level — the identical ship-blocker as AR3/#386. The DONE ruling never depended on a green run; it depends on code honesty + AC completeness, both satisfied. When credits return, a real opencode run should confirm green via AGENTS.md (per its docs); if it instead proves opencode genuinely ignores cwd `AGENTS.md` under `run --dir`, that would be a verified gap to document then with run evidence + a coverage-debt entry — but it cannot be assumed into existence now.
