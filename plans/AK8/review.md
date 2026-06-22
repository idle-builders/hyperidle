# AK8 — Code Review (Phase 4, reviewer)

Plan: `plans/AK8/architecture.md` (passed critique round 2, 8.5/10). Reviewed the live code against the 4 ACs + 6 lenses. Design lens skipped (no UI files; AK8 reuses AK3's bet surface).

**Verification run:**
- `npm run check` — PASS (all 13 packages).
- `npm run test:integration` — 265 files / 3031 tests PASS, 6 skipped. AK8 + all protected AK3/AK7 integration tests green.
- `npm run lint` — PASS (0 errors; 488 pre-existing warnings, none introduced by AK8). ESLint guards (import-ban, round-robin) intact.

---

## Verdict: **DONE**

All four ACs are evidenced by genuine runtime tests + live code. The §2a boundary is clean. Zero CRITICAL, zero WARNING. Two NICE-TO-HAVE polish items below. The two Phase-2 CRITICALs (override precedence, AC4 vacuity) are both correctly resolved in the built code.

---

## AC table

| AC | Status | Evidenced by |
|---|---|---|
| **AC1** — commit emits Kernel-owned `work_decompose_requested`; Kernel does NOT decide the breakdown (decision from Strategy's `decomposeBet`) | ✅ EVIDENCED | `bet-decomposition.ts:343-349` emits the event post-CAS/post-eligible; decision routed through `getActiveStrategy().decomposeBet(...)` (`358-365`). Tests: AK8 `work_decompose_requested emitted` (emit + betId/teamId), `Strategy.decomposeBet called with betId` spy (`333` — would fail if Kernel hard-coded), `duplicate → exactly one emit + one decomposeBet call` (`367-369`). `work_decompose_requested` in `KernelEvent` union (`events.ts:411-414`), exhaustiveness compiles (`AK6-scaffold-types.test.ts`, `dispatcher.ts:491`). |
| **AC2** — active Strategy produces breakdown; Minimal=AK3 default; Fabric=knowledge-matched, no regression vs AK3 observable outcome | ✅ EVIDENCED | `minimalStrategy.decomposeBet` + `fabricStrategy.decomposeBet` both role-match PM, return `tasks:[]` → Kernel turn (branch 2/3). Tests: AK8 AC2 Minimal (`≥1 task, eligible owner, accepted, status=done`) + Fabric-like (parity, NOT knowledge breakdown — correctly asserts AK3 oracle per plan §Fabric/W5). Owners flow through `insertProposedBetTasks`→`selectOwner`(`bet_task`)→`transitionTask(accepted)`→existing dispatcher, untouched. |
| **AC3** — every AK3 guarantee holds under any Strategy (no false promise; no-eligible → blocker; real task state; CAS idempotency; crash recovery; User Sovereignty); AK3 protected tests pass | ✅ EVIDENCED | `runBetDecomposition` NEVER throws — every exit calls `markTerminal`. Tests: no-eligible→`blocked/no_eligible_agent` (`478`, decomposeBet NOT called `482`); invalid off-team decomposerId→`blocked/no_eligible_agent` via inline `candidates.some` guard (`518`); `decomposeBet` throws→`blocked/failed`, no throw out (`548-552`); duplicate via subscriber→one decomposition+one task (`590-594`, CAS). `resolveOrphanedDecompositions` untouched. `tools:[]` real turn untouched (`runRealPmTurn` SessionConfig `tools:[]`). All 4 protected AK3/AK7 files pass byte-identical assertions (diff = comments + `decomposeBet` fixture only). |
| **AC4** — selecting a different Strategy changes decomposition with NO Kernel code change; runtime divergent-decomposer swap (not vacuous) | ✅ EVIDENCED | AK8 AC4 test: same committed bet under `minimalStrategy` (picks `pm-ac4` via role-match) vs `makeDivergentDecomposerStrategy` (picks `candidates[0]`=`builder-ac4` by `users.id` order) — asserts `minPlan.decomposerAgentId !== divPlan.decomposerAgentId` AND the override turn received the respective `pmAgentId` (`664-667`). No `bet-decomposition.ts` edit between runs. NON-vacuous (divergent ≠ role-match PM). Secondary static guard: ESLint import-ban (`eslint.config.ts:600`) prevents Kernel naming a concrete Strategy; round-robin guard (`932`) intact. Plan correctly leads AC4 on the runtime test, not ESLint. |

---

## §2a boundary cleanliness — CLEAN

Verified row-by-row against the §2a cut (Trigger=Kernel / Selection=Strategy / Execution=Kernel):
- **Kernel owns mechanism**: CAS NULL→running (`314-318`), event emit (`343`), `enumerateTeamCandidates` (`355`), inline decomposer validation (`387`), `checkCostCap` (`403`), scratch sandbox (`413`), real PM turn / `runRealPmTurn` (`522`), `insertProposedBetTasks`→dispatch, `markTerminal`, crash sweep. None leaked into Strategy packages.
- **Strategy owns decision**: `decomposeBet` returns `{decomposerAgentId, tasks}` only — `DecomposeBetRequest` carries `db`/ids/description/candidates, NO harness/cost/sandbox. No session spawned, no cost enforced in either Strategy impl. Hard rule (strategy-port.ts:294) respected.
- **No leak**: `runRealPmTurn`, `adapterPool`, `resolveModel`, `checkCostCap`, sandbox path all stay in `bet-decomposition.ts`. The `tasks:[]`→Kernel-turn path is the documented §4 Minimal-fallback, not a boundary violation (the Kernel runs the turn as *mechanism* on the Strategy-chosen agent).

## 3-way turn-source precedence — CORRECT, AK3 byte-identical

`bet-decomposition.ts:433-479` implements exactly the plan's order: (1) `plan.tasks.length>0`→persist & skip turn; (2) `deps.runDecompositionTurn` override→run with `pm.id`; (3) real PM turn. All v1 Strategies return `tasks:[]`→every protected AK3 test deterministically lands on branch 2, override injected, assertions frozen. Confirmed: AK3 integration test diff is comments + fixture `decomposeBet` only — zero assertion change. The override correctly receives `pm.id` (the Strategy-chosen, validated decomposer), so AC4's "which agent decomposes" assertion is real.

## Inline decomposerAgentId validation — REAL GUARD

`candidates.some(c => c.agentId === plan.decomposerAgentId)` (`387`). `candidates` = `enumerateTeamCandidates` output = active-AI + status=active + category=team + on-team membership. So the single `.some` proves membership + active-AI eligibility in one check — an off-team, inactive, or non-existent id cannot pass. Test `bet-invalid-decomposer` (off-team id) → `blocked/no_eligible_agent` confirms it at runtime. This correctly replaces the removed `selectOwner(bet_decomposer)` internal guard.

## Adversarial lens — all hostile cases handled

- Strategy throws mid-decompose → `try/catch` (`366-370`) → `blocked/failed`, never throws out. ✅ tested.
- Strategy returns valid-looking but ineligible decomposer → inline `candidates.some` rejects → `blocked/no_eligible_agent`. ✅ tested.
- Duplicate events → CAS is first statement (`314`); only winner emits + calls `decomposeBet`. ✅ tested at both `runBetDecomposition`-direct and subscriber level.
- Strategy switched mid-flight → exactly-one-active-Strategy invariant; swap only at boot/test setup; a 'running' bet across a swap is swept by `resolveOrphanedDecompositions`. No new risk.
- Fabric knowledge unavailable → `decomposeBet` returns synchronously (`tasks:[]`); only `assembleContext` can throw in branch 3 → caught (`464-467`) → `blocked/failed`. ✅
- Type safety: zero `any`/`as any` in production diff (the earlier `as any` casts were removed in commit `8a1b9608` once schema columns landed — verified clean). `import("@hyperidle/shared").DecompositionPlan` inline type import is honest, not a cast.

## Security (STRIDE) — N/A surfaces correctly N/A

No new POST/PATCH route, no outbound URL (SSRF), no new path input (scratch path Kernel-derived from `betId`, unchanged), no secret surface. Tampering: Strategy-authored `tasks` (future third-party path) flow through the same `insertProposedBetTasks` truncation + `betId`-bound-from-bet guard (`180-191`, betId never from task input — cross-bet injection prevented). Elevation: unattachable-session guard covered above. Cost DoS: `checkCostCap` pre-flight retained Kernel-side on the validated decomposer (`403`).

## Simplification / Slop lens

- **Dead code — `select-agent.ts` `bet_decomposer` surface**: `selectOwner`'s `surface` union still lists `"bet_decomposer"` and `SelectionRequest`/`agent-selection.ts:107` still has the `bet_decomposer` case, but the only production caller is gone (production now passes only `"bet_task"`). Exercised by AK7 unit tests only. **Judgment: acceptable to defer** — pruning churns the AK7 closed union + AK7 protected tests for zero functional gain, and the plan documented this "retain surface, remove caller" decision explicitly (Plan reconciliation §). Not a finding; flagging so a future reviewer's dead-code lens isn't surprised. Recommend a `@lore` on the `bet_decomposer` union member noting it's production-dead post-AK8 (NICE, below).
- No single-use wrapper, no premature generic, no commented-out code, no impossible error handling beyond the one noted redundancy (NICE-2). `@lore` comments are load-bearing (the `[]`-asymmetry, precedence, inline-guard rationale) — not filler.

## Test quality — genuine, not theatre

Every AK8 test imports `runBetDecomposition`/`registerBetDecomposition` and asserts on DB state + spy calls + emitted events. AC4 swap test is non-vacuous (verified ID ordering: `builder-ac4` < `pm-ac4` by `users.id`, so `candidates[0]`=builder ≠ role-match PM). AC1 spy (`toHaveBeenCalledWith(objectContaining({betId}))`) would fail if the Kernel ignored the Strategy. No `toBeDefined`-only or `not.toThrow`-only assertions.

---

## Findings

**CRITICAL:** none.

**WARNING:** none.

**NICE-TO-HAVE:**
- **N1 — AC4 test name is misleading.** `bet-decomposition`/AK8 test title says *"divergent Strategy picks last candidate"* but `makeDivergentDecomposerStrategy.decomposeBet` returns `candidates[0]` (the **first** candidate). The assertion (`divPlan.decomposerAgentId === builderAgentId`) is correct because `builder-ac4` sorts first by `users.id`, so the proof holds — only the prose "last" is wrong (one `@lore` comment also says "picks last candidate" at line ~205 while the code picks first). Rename to "picks first candidate" for accuracy. Non-blocking; the runtime proof is sound.
- **N2 — Minor defensive redundancy in `runBetDecomposition` (steps 5→6).** After `candidates.some(...)` validates the decomposer (`387`), the subsequent `db.select().from(users)...` + `if (!pm)` re-guard (`394-398`) is structurally unreachable (the id provably exists in `users` since `candidates` derives from the same table in the same request). The `db.select` itself is *needed* (loads `pm.harnessType`/`role`/`modelProvider` for branch 3 + `pm.id` for cost-cap), so this is not dead code — only the `if (!pm)` branch is unreachable. Acceptable defensive coding; could drop the re-guard, but harmless. Optionally add `@lore` noting the load is for the real-turn row, not re-validation.
- **N3** — add a `@lore` on the `bet_decomposer` union member in `select-agent.ts`/`shared` noting it is production-dead post-AK8 (retained for AK7 union/test stability), so the next dead-code scan doesn't mistake it for an unwired seam.

None of the NICE items block ship. AK8 is **DONE**.
