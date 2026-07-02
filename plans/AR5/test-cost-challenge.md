# AR5 — Test-cost challenge: 7 real-LLM tests across 3 files

Reviewer pass. Read-only. Verdict per `test()`: does the assertion **depend on the real agent's LLM output / real-binary behavior**, or is it deterministic Kernel↔Strategy-port plumbing that runs identically on any harness/model?

**Key structural fact (load-bearing for every AK2 verdict below).** In `session-provisioning.ts`, `strategy.assembleContext(...)` (line 538) and `strategy.beginLearningIngestion(...)` (line 555) are invoked inside **`admitSession` — phases 1-7 — BEFORE `runSession` ever spawns the harness or makes an LLM call.** The ingestion handle's `dispose()` fires at the teardown seam after drain, regardless of session outcome. So every AK2 assertion on `assembleContextCalls`, `ingestionCalls`, `disposeCallCount`, and the captured context-file content is decided **before and independent of any LLM token.** Running those × a real CLI+LLM × 4 lanes pays ~28-min serial cost to prove plumbing that a `provisionSession` service-integration test (or a direct port call) proves in milliseconds, deterministically, on every harness identically.

The one genuinely agent-behavioral assertion in AK2 is the session reaching `state==='done'` with `outcome ∈ {completed, not_returned}` — that requires a real binary to actually run and a real harness lifecycle to drive the row to `done`. That belongs on the matrix. The rest do not.

AK3 is the AR thesis' legitimate core: a real PM agent must emit parseable task JSON for a real bet, and the persisted tasks are asserted *from that output*. Fake/empty output fails closed (`decompositionStatus → blocked`). This genuinely needs the real agent × 4.

---

## Per-test verdict table

| # | File · test | What it actually asserts | Depends on real agent? | Verdict | Rationale |
|---|---|---|---|---|---|
| 1 | **AK2-contributor** · "runs session to completion without modifying Kernel code" | `result.outcome ∈ {completed,not_returned}` + `session.state==='done'` | **YES** — a real binary must run and drive the lifecycle to `done` | **KEEP (real-LLM × 4)** | Session-running-to-completion under a custom Strategy is the integration point; the open-seam proof needs the Strategy to actually carry a real session through. |
| 2 | **AK2-contributor** · "Kernel passes correct assembleContext request fields" | `assembleContextCalls[0]` fields (taskId/agentId/teamId/sandboxPath/sessionId) — captured in `admitSession` **before** the harness runs | **NO** — pure Kernel→port handoff, set pre-LLM, identical on every harness | **DEMOTE → service-integration** | The Kernel's `assembleContext` request shape is harness-agnostic plumbing. Prove once via `provisionSession` (real DB+app) with a single cheap/deterministic lane (builtin) or a direct port-contract assert — not × 4 real LLMs. |
| 3 | **AK2-contributor** · "Kernel calls beginLearningIngestion and disposes the handle" | `ingestionCalls.length===1` + `disposeCallCount===1` | **NO** — both fire in the Kernel lifecycle independent of LLM output; dispose fires at teardown regardless | **DEMOTE → service-integration** | Lifecycle-hook-fired-and-disposed is deterministic Kernel wiring. One `provisionSession` service-integration lane proves it; the LLM's tokens never touch this assertion. |
| 4 | **AK2-contributor** · "contributor's custom context assembly appears in the sandbox" | `capturedContextPath`/`capturedContextContent` — values the **Strategy itself wrote** during `assembleContext`, captured in-memory | **NO** — asserts on what the *test's own Strategy* wrote pre-LLM, not on agent output | **DEMOTE → unit** (or fold into #2's service lane) | This is the in-test `ContributorStrategy` asserting on its own `writeFileSync` side-effect. It proves the Strategy can write to the sandbox — a property of the Strategy object, provable by calling `assembleContext` directly. Zero agent dependency. |
| 5 | **AK2-minimal** · "session runs to completion (state=done) under minimal Strategy" | `result.outcome ∈ {completed,not_returned}` + `session.state==='done'` | **YES** — real binary drives lifecycle to `done` under the real `minimalStrategy` | **KEEP (real-LLM × 4)** | Kernel-feature baseline = minimal strategy (per testing.md). Session-completion under minimal genuinely needs a real session; this is the honest AC1 proof. |
| 6 | **AK2-minimal** · "no new knowledge_items rows (no writeback) when minimal active" | `knowledgeItems` row count unchanged (`after.length === beforeCount`) | **NO** — minimal's `dispose()` is a documented no-op; inertness is a property of the Strategy, not the agent | **DEMOTE → unit** | This is Strategy-inertness (no writeback). The minimal-strategy unit suite already proves `dispose()` is a no-op (`minimal-strategy.test.ts` lines 133-169). The DB-count assertion is redundant with that and the file's own header already says inertness was demoted to the unit — this assertion was left behind. A real LLM × 4 to confirm a no-op writes nothing is pure waste. |
| 7 | **bet-decomposition-real-agent** · "real agent decomposes a real bet — ≥1 persisted task, bet done" | `decompositionStatus==='done'` + `tasks.length≥1` + every title `trim().length≥3`, **from the real agent's JSON output** (fails closed on empty/fake) | **YES** — the agent must produce parseable task JSON; empty output → `blocked` → fail | **KEEP (real-LLM × 4)** | The AR thesis' legitimate core. Drives `runRealPmTurn` (Branch 3), not `provisionSession` — correctly the decomposition seam, not the session seam. This is the one place a real agent decomposes a real bet end-to-end. Per-harness coverage is justified: each harness's prompt-fidelity on JSON emission is a real, harness-specific risk. |

---

## Why the demotions are honest (not re-stubbing)

- **#2, #3 → service-integration.** The target is real `provisionSession` over real PGlite+app fixtures, exercising the **real Kernel lifecycle** — `assembleContext` and `beginLearningIngestion`/`dispose` are invoked by the actual production code path. The only thing dropped is the *real LLM × 4*: the session does not need a real harness turn for these hooks to fire (they fire in `admitSession`, pre-harness). If the session-run step is unwanted, a single deterministic adapter is acceptable **only because the harness is not the thing under test here** — the testing.md two-archetype rule explicitly routes "is the harness the thing under test? No → service integration." For #2/#3 the answer is genuinely No.
- **#4, #6 → unit.** Both assert on a **Strategy object's own behavior** (the in-test `ContributorStrategy`'s file write; `minimalStrategy`'s no-op dispose). Calling the port method directly is the honest archetype. No harness, no false integration claim. #6 is already partially covered by the existing minimal unit suite.
- **No genuinely agent-behavioral test is demoted.** #1, #5, #7 stay on the real matrix.

---

## Net session-count reduction

Current: **28 real sessions** (AK2-contributor 4×4=16 + AK2-minimal 2×4=8 + AK3 1×4=4).

After recommendations:

| File | KEEP on real matrix | Real sessions |
|---|---|---|
| AK2-contributor | #1 only (×4) | 4 |
| AK2-minimal | #5 only (×4) | 4 |
| AK3 | #7 (×4) | 4 |
| **Total real sessions** | | **12** |

Demoted off the real-LLM matrix: #2, #3 → service-integration (deterministic, ms); #4, #6 → unit (deterministic, sub-ms).

**Reduction: 28 → 12 real sessions = 16 fewer (−57%).** The two AK2 files drop from 24 sessions to 8. At 10-240s serial each with `retry:2`, this removes the bulk of the worst-case multi-minute, real-$ tail (the timeout that triggered this review came from the AK2-contributor 16-session file).

---

## Real-harness coverage that REMAINS (AR thesis honored)

After the cuts, every one of the four supported harnesses (`builtin`/`claude`/`codex`/`opencode`) still runs a **real binary + real LLM, zero stubs, hard-fail-on-absence** lane for:

1. **A real session running to completion under a contributor-supplied custom Strategy** (AK2-contributor #1) — proves the open Strategy-Port seam carries a real session on every harness.
2. **A real session running to completion under the real `minimalStrategy`** (AK2-minimal #5) — the Kernel-feature baseline (minimal strategy) on every harness.
3. **A real strategy agent decomposing a real bet into persisted tasks** (AK3 #7) — the decomposition seam (`runRealPmTurn`), proven per-harness, fail-closed on empty output.

So the matrix still proves, per harness: *can this real binary run a session to completion*, and *can this real agent decompose a bet*. What it stops doing is paying 4× real-LLM cost to re-assert Kernel→port wiring (request fields, hook firing, dispose) and Strategy-object side-effects (a file the test wrote, a no-op that writes nothing) — none of which depend on a single LLM token. The honest-harness-guard coverage rule is still satisfied for the three KEEP files (each declares all four `requireHarness` lanes); the two demoted files leave the harness-facing set entirely and come off `coverage-debt.allowlist.json`.

---

## Bottom line

- **KEEP × 4 (agent behavior is the point):** AK2-contributor #1, AK2-minimal #5, AK3 #7.
- **DEMOTE → service-integration (harness-agnostic Kernel plumbing):** AK2-contributor #2, #3.
- **DEMOTE → unit (Strategy-object property, no agent):** AK2-contributor #4, AK2-minimal #6 (#6 also redundant with the existing minimal unit suite — collapse, don't duplicate).
- **REMOVE outright:** none required, but #6's DB-count assertion is effectively redundant with `minimal-strategy.test.ts` and could be dropped rather than re-homed if the unit suite is deemed sufficient.

Net: **28 → 12 real sessions (−57%)**, with full real-binary × 4-harness coverage of the two things that genuinely depend on a real agent (session-to-completion and bet-decomposition) fully intact.
