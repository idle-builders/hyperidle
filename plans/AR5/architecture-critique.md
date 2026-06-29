# AR5 — Architecture Critique

**WP:** AR5 — Strategy and bet decomposition: real agent or honest demotion. Complexity M, backend, no UI (`/architecture-critique` only; `/design-critique` skipped).
**Plan under review:** `plans/AR5/concept.md` + `plans/AR5/architecture.md`.
**Reviewer stance:** cold read; every triage claim re-verified against the real code (not taken on faith).

---

## Verification log (claims checked against real code, not the plan's prose)

| Plan claim | Verified? | Evidence |
|---|---|---|
| `runBetDecomposition` has 3-branch turn-source precedence (plan.tasks → override → real) | ✅ | `bet-decomposition.ts:433–472`, `@lore AK8:430` |
| Branch 3 = `runRealPmTurn`, drives `adapterPool.select() → startSession → drainForCompletion → stopSession` directly | ✅ | `bet-decomposition.ts:522–600` |
| `runRealPmTurn` does **NOT** call `provisionSession` | ✅ | No `provisionSession` reference anywhere in `runRealPmTurn`; it builds its own `SessionConfig` (`:563`) and calls the adapter directly |
| The decomposition turn ships `tools:[]` | ✅ | `bet-decomposition.ts:570` |
| AK2-contributor + AK2-minimal use `EchoHarnessAdapter` + real `provisionSession` + `eventBus … as never` | ✅ | contributor `:160,282,287`; minimal `:60,197,202` |
| AK3-bet-decomposition uses Branch-2 `runDecompositionTurn` override + `makeFabricLikeStrategy` (no harness adapter) **except** AC5 | ✅ | `:66,203,397` |
| AK3 AC5 `tools:[]` test uses a config-capturing **mock `HarnessAdapter`** inside the `.integration.test.ts` | ✅ | `:640 mockAdapter`, `:704–707` |
| AK3-subscriber + AK8 use only override + fake strategies over real `db`/`eventBus` — zero harness adapter | ✅ | subscriber `:104,176`; AK8 `:136,307` |
| AR2 exports `SUPPORTED_HARNESS_LANES`, `runThroughHarness`, prep helpers, `createSandboxCapture` | ✅ | `provision-real-session.ts:87,151–223,395,562` |
| `HarnessLane.prepFn` returns `{ pool, params: ProvisionSessionParams }` — NOT `BetDecompositionDeps` | ✅ | `:361–367` (confirms the plan's "~80–120 LOC helper" cost) |
| `isHarnessIntegrationPath` is **path-only**: harness-dir suffix OR explicit list | ✅ | `honest-harness-predicate.ts:57–62` |
| `EXPLICIT_HARNESS_INTEGRATION` = `["__tests__/session-provisioning.integration.test.ts"]` (none of the 5 listed) | ✅ | `:45–47` |
| `HARNESS_INCLUDE` in vitest = harness dir glob + session-provisioning only | ✅ | `vitest.integration.config.ts:20–23` |

**Every load-bearing factual claim in the plan is true.** The plan did its own ground-truth read (§0) and it holds. This is the foundation the critique rests on.

---

## 9-Dimension Rubric

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec fidelity / AC coverage | 7 | Covers all four ACs, but the AC-by-AC mapping is implicit — see W-1. The "AK8/subscriber = confirm honest, no change" outcome needs an explicit AC-satisfaction argument, which it mostly gives (Risk 3) but should pin to AC text. |
| 2 | Layer integrity / contract respect | 9 | Production contracts frozen, correctly. The plan never reshapes `runBetDecomposition`/`insertProposedBetTasks`/the subscriber. The one production-adjacent decision (don't add a tool surface for the agent test, A3 rejected) correctly defers to MEMORY "tests must not drive behavior." |
| 3 | Data model / type fidelity | 9 | No schema change. `DecompositionTaskInput`/`DecompositionStatus` consumed at current shape. Tasks asserted as DB rows (correct — not sandbox files), which the plan calls out (§4 task 1). |
| 4 | Decomposition / module depth | 8 | New `provision-real-decomposition.ts` sibling helper is proportional and on the AR6-dedup trajectory. Three converted files carry the matrix; demotions are relabels. Good separation of "convert" vs "demote." |
| 5 | Correctness of the central architectural call (provisionSession vs Branch 3) | 9 | **This is the crux and the plan gets it right.** See R-2 ruling below. |
| 6 | Assertion robustness (agent-driven proof) | 7 | Direction is right (≥1 non-trivial task + `done`, lean on `retry:2`); but the assertion is specified in prose, not pinned. See W-2. |
| 7 | Enforcement wiring (predicate + vitest + floor) | 8 | Correctly identifies `EXPLICIT_HARNESS_INTEGRATION` + `HARNESS_INCLUDE` as the load-bearing step the builder must not skip (§0.3). Names the per-file guard vs global floor distinction accurately. |
| 8 | Risk surfacing / honesty | 9 | Six risks flagged, each the genuine crux. The plan does not hide the awkward parts (path-only blind spot, no allowlist shrink, AK8-isn't-really-a-conversion). |
| 9 | Builder actionability | 8 | Ordered task list (foundation-first: wiring before tests), explicit delete-EchoHarnessAdapter steps, per-file end-state map. One ambiguity left to the reviewer (the AK2-minimal split granularity) — resolved below. |

**Weighted score: 8.2 / 10.**

---

## Ruling on the six flagged risks

### R-1 — Assertion robustness (Risk 1). **ACCEPTED with a sharpening (W-2).**
The proposed agent-driven assertion ("≥1 persisted task with non-trivial title AND bet `done`") is sound in shape: a fake/empty output yields `taskList=[]` → `blocked/empty`, never `done`, so it fails closed. `runRealPmTurn` confirms this: malformed/non-array JSON → `return []` (`:606`) → Branch's empty-guard → `blocked/empty`. The assertion therefore **cannot pass on fake/empty output**, satisfying the AC validation scenario. "Non-trivial title" survives phrasing variance. **Sharpening required before build (W-2):** the plan must pin the exact predicate (e.g. `title.trim().length >= 3`) and state the retry posture as a code-level fact, not prose, so the builder cannot weaken it into `tasks.length >= 0`.

### R-2 — provisionSession vs runRealPmTurn divergence (Risk 2, highest stakes). **ACCEPTED. The plan's reading is correct and the chosen path satisfies the AC.**
Verified in code: `runRealPmTurn` (`:522`) never calls `provisionSession`; it drives the adapter pool directly. The AR5 spec phrase "through the production `provisionSession()` path (AR2 pattern)" is, read literally, **unsatisfiable for the decomposition turn** — production decomposition does not flow through `provisionSession`. The plan resolves this honestly:
- AK2 session-completion files → `runThroughHarness` (→ `provisionSession`) — correct, because there the thing under test genuinely is "a session runs to completion under a Strategy."
- AK3-real-decomposition → Branch 3 via `decompositionDepsForLane` (→ `runRealPmTurn`) — correct, because **that is the real production decomposition seam.**

Driving `provisionSession` for the decomposition proof (Option A2) would prove "a real agent ran a session," not "a real agent decomposed a bet" — the exact false-adjacency Track AR exists to kill. The AC's *intent* (spec: "a real strategy agent produces the decomposition and the resulting tasks/edges are asserted from that real output"; validation scenario: "the persisted tasks reflect the agent's actual decomposition") is satisfied by Branch 3, **not** by `provisionSession`. **The plan's choice exercises the true production contract; A2 would not.** This is the right call. The "AR2 pattern" the spec invokes is satisfied in spirit by reusing the lane table data + per-harness prep + `requireHarness` gating + `[harness:X]` tags — which the plan does — even though it cannot reuse `runThroughHarness` verbatim. **No CRITICAL here.** One documentation obligation (W-3): the divergence must be captured as `@lore` at the helper so the next agent doesn't "fix" it back to `provisionSession`.

### R-3 — AK8 / subscriber "demote = confirm honest" (Risk 3). **ACCEPTED. Satisfies the AC; not a dodge.**
Verified: neither AK8 nor the subscriber constructs a harness adapter — only the `runDecompositionTurn` override (a supplied-decomposition seam) and fake strategies (a Strategy-port stub) over real `db`/`eventBus`. By the two-archetypes rule these are **service integrations with legitimate non-harness stubs.** The AC says each file is "either converted… or demoted to a unit whose stubs are honest (testing pure logic over a supplied decomposition)." AK8/subscriber are the demotion case, and their stubs *are* honest. **The one place this is NOT a clean pass:** the AC also says "Demoted units no longer carry the `.integration` suffix." A service-integration file that legitimately needs the `db`/`eventBus` fixtures **keeps** `.integration` — so "leave as-is" technically conflicts with the literal "no longer carry `.integration`." The plan must reconcile this: either (a) argue these were never *harness*-integration so the demotion clause doesn't bind them (they were mislabeled-by-proximity, never claiming harness), or (b) note that the suffix clause targets harness-faced demotions only. The spirit is clearly satisfied (no false harness claim remains), but the literal AC text needs an explicit reconciliation sentence. **This is W-4, not a CRITICAL** — the underlying call is correct.

### R-4 — Path-only guard blind spot deferred to AR6 (Risk 4). **ACCEPTED. Deferral is correct.**
The general gap (any `server/src/__tests__/*.integration.test.ts` instantiating a `HarnessAdapter` is invisible to the path-only predicate) is real and verified (`:57–62`). But AR5 **closes its own exposure** by adding its three converted files to `EXPLICIT_HARNESS_INTEGRATION`. Generalizing the predicate to content-sniff for adapter construction is out-of-scope (AR5 is "convert or demote five files," not "harden the guard"), is explicitly AR6 territory ("MCP/enforcement consolidation"), and per ETHOS security/guards are earned from learnings not built preemptively. **Flag, don't fix** is the right posture. One caveat (W-5): the plan should ensure the AC5-demotion lands the config-capturing mock in a `.test.ts`, because if it were left in any `.integration.test.ts` outside the explicit list, the blind spot would be actively *exercised*, not merely theoretical. The plan does route it to a `.test.ts` unit (§2.3 task 6) — good — but make that non-negotiable.

### R-5 — No allowlist shrink (Risk 5). **ACCEPTED. Correct and must be stated in the PR.**
Verified: the five files are on neither `coverage-debt.allowlist.json` nor `honest-harness-guard.allowlist.json` (the path-only predicate never classified them as harness-facing, so nothing put them there). AR5's three converts are born at full 4-lane coverage → never enter the allowlist. So there is genuinely **no allowlist shrink to perform.** This is a real deviation from the naive expectation ("a conversion WP shrinks the debt allowlist") and the plan correctly pre-empts the reviewer surprise (§5). **Approved** — but the PR body must state this explicitly or a Phase-4 reviewer will read the unchanged allowlist as missing work.

### R-6 — Over-demotion risk (Risk 6). **ACCEPTED with a build-time obligation.**
The spec constraint is hard: "Demotions preserve the assertion; they change the lane." The plan commits to assertion-verbatim demotion (§2.3, §6). I cannot fully verify preservation at plan-time (no code exists yet) — this becomes a **Phase-4 review obligation**: diff every demoted assertion against its origin and confirm nothing weakened or dropped. The plan correctly assigns this to the reviewer (§6.5). The one over-demotion *judgment* the plan makes — AK8 AC4's runtime-swap is *better* as a unit than as a real-agent test (a real agent injects model randomness that destroys the "difference came from the swap, not the model" inference) — is **correct reasoning** and well-argued.

---

## Findings

### CRITICAL
**None.** The central architectural call (R-2) is right; no finding blocks the build.

### WARNING (resolve in the plan before build; none are blocking-CRITICAL)

- **W-1 — AC-by-AC traceability is implicit.** The plan triages by file and by risk, but never lays out a flat "AC → where it's proven" table. Add one: AC1 (convert-or-demote, no scripted adapter in `.integration`) → which files; AC2 (real agent produces decomposition, tasks asserted from real output) → `AK3-real-decomposition`; AC3 (demoted units drop `.integration`, no fake-adapter `provisionSession`) → the unit demotions; AC4 (converted tests hard-fail on missing harness) → `requireHarness` lanes. Without it, Phase-4 AC completeness is harder to audit.

- **W-2 — Pin the agent-driven assertion as code, not prose.** State the exact predicate (`title.trim().length` threshold, `decompositionStatus === "done"`) and the retry posture (inherited from the `harness` project's `retry:2`) as a concrete contract the builder cannot soften. The fail-closed property is verified (empty → `blocked/empty`), but "non-trivial" must be a literal.

- **W-3 — `@lore` the provisionSession-divergence at the new helper.** The decision "decomposition rides Branch 3, NOT `provisionSession` — driving `provisionSession` would prove the wrong thing" must be captured at `provision-real-decomposition.ts` so a future agent does not "unify" it back into `runThroughHarness` and silently weaken the proof. The plan mentions `@lore AR5` (§4 task 1) but not *this specific rationale* — make it the lore content.

- **W-4 — Reconcile "demoted units no longer carry `.integration`" with keeping AK8/subscriber as service-integration.** The AC text literally says demoted units drop `.integration`; AK8/subscriber keep it (they need `db`/`eventBus`). Add one sentence arguing these are service-integrations that were never *harness*-integration, so the suffix-drop clause (which targets the fake-adapter `provisionSession` demotion path) does not bind them. The call is correct; the AC reconciliation is missing.

- **W-5 — Make the AC5 mock-adapter relocation non-negotiable.** The config-capturing `mockAdapter` (AK3 `:640`) is a scripted harness adapter inside a `.integration.test.ts` — it is one of the actual violations the AC targets ("no scripted/echo harness adapter remains in a `*.integration.test.ts`"). The plan routes it to a `.test.ts` unit (correct), but this must be stated as mandatory, not "or keep as service-integration." A config-capturing adapter is still a constructed `HarnessAdapter`; it cannot stay in any `.integration.test.ts`.

### NOTE (non-blocking)
- **N-1** — `AK2-fabric-parity.integration.test.ts` exists in the same dir and is NOT in AR5's five. Confirm it's intentionally out of scope (it likely has the same `EchoHarnessAdapter` smell). If it does, AR5 leaves a sibling violation un-addressed — acceptable if the WP boundary is the named five, but worth a one-line "out of scope, tracked separately" so it isn't silently forgotten.
- **N-2** — The plan's AK2-minimal split recommendation (DEMOTE the two inertness assertions to a `minimal-strategy.test.ts` unit + CONVERT only the completion assertion) is the cleaner choice. **Reviewer concurs — adopt the split.** Inertness (no knowledge files, zero `knowledge_items`) is a property of the Strategy object, harness-independent; proving it four times across real LLM lanes is wasteful and slower with no added signal.

---

## Verdict

**APPROVED for build.** Score **8.2/10**, no CRITICAL findings. The highest-stakes call — that the real-decomposition proof rides `runBetDecomposition` Branch 3 (`runRealPmTurn`) and **not** `provisionSession`, because the production decomposition turn genuinely does not flow through `provisionSession` — is **correct and verified against the real code**; driving `provisionSession` would prove a session ran, not a bet decomposed, which is the exact false-adjacency Track AR exists to kill. The AK8/subscriber "confirm-honest service-integration" outcome satisfies the AC's demotion clause (their stubs are honest non-harness stubs). The no-allowlist-shrink and path-only-blind-spot deferrals are correct.

Five WARNINGs (W-1…W-5) are plan-tightening, not redesign: add an AC-traceability table, pin the agent assertion as code, `@lore` the divergence, reconcile the `.integration`-suffix AC clause, and make the AC5 mock relocation mandatory. The builder may proceed; these get verified in Phase 4 against the code.

**Phase-4 carry-forward obligations for the reviewer (me):**
1. Diff every demoted assertion against its origin — confirm verbatim preservation (R-6).
2. Confirm **zero** constructed `HarnessAdapter` (scripted/echo/mock-capture) remains in any `.integration.test.ts` in the five-file set — including the AC5 mock (W-5).
3. Confirm the three converts are in `EXPLICIT_HARNESS_INTEGRATION` + `HARNESS_INCLUDE` and emit all four `[harness:X]` lanes (the load-bearing wiring step, §0.3).
4. Confirm the agent-driven assertion fails closed on empty output and is not softened (W-2).
5. Confirm `@lore` captures the provisionSession-vs-Branch-3 divergence (W-3).
