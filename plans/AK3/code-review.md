# AK3 — Code Review (Phase 4)

**Verdict: DONE** (all 7 ACs + 3 validation scenarios proven; zero CRITICALs). Two WARNINGs and three NITs below are non-blocking — the builder should address WARNING-1 (design fidelity, binding contract) and WARNING-2 (AC5 has no executable assertion) before/at ship, but neither breaks a contract or an AC's observable behaviour.

Evidence run (this review, live):
- `npm run check` → exit 0 (all 13 packages PASS)
- `npm run lint` → exit 0 (428 warnings / 110 infos — all pre-existing project-wide, zero errors)
- Unit `AK3-bet-decomposition.test.ts` → 6/6 pass
- Component `AK3-WorkBet-task-states.test.tsx` → 16/16 pass
- Integration `AK3-bet-decomposition*.integration.test.ts` (×2) → 20/20 pass

AK3 logical diff is scoped exactly to the plan's named files (16 files; the design-system/AJ1 entries in `origin/main..HEAD` are base-branch drift, not AK3 commits).

---

## AC table

| AC | Status | Evidence |
|---|---|---|
| **AC1** — commit produces a task breakdown w/o manual entry | PASS | `runBetDecomposition` happy path: injected turn → 2 tasks, `decompositionStatus='done'`, ≥1 `tasks` row with `betId` bound from bet. Test `runBetDecomposition — happy path` asserts `done`, owner set, `state='accepted'`. Subscriber wires it off `bet_state_changed(active)`. |
| **AC2** — tasks owned by eligible team agents + flow into dispatch | PASS | `insertProposedBetTasks` resolves owner via role-match→round-robin, inserts `proposed`→`transitionTask(accepted)`. Subscriber→dispatch test asserts every task `state='accepted'` + `ownerAgentId` truthy (dispatcher fires on `task_state_changed(accepted)`). Round-robin fallback test: growth task on builder-only team → builder owner. |
| **AC3** — never silently empty under a false promise; surface reflects real state | PASS | Four-state switch in `WorkBet.tsx` (precedence tasks>0→draft→blocked→decomposing). Component tests: decomposing/draft/blocked/populated all render correct testids; "tasks will appear" string asserted **gone**. Crash-orphan closed: `resolveOrphanedDecompositions` flips `running`→`blocked/failed`, wired at boot **before** subscriber (`server-factory.ts:273`). |
| **AC4** — no eligible agent → explicit blocker | PASS | `runBetDecomposition` no-eligible path → `blocked`/`no_eligible_agent`, zero tasks (integration test). Component test: `bet-tasks-blocked` + "No one can take this work" + "Add an agent" link `href="/work/team/team-1"` (real `WorkTeam` route). |
| **AC5** — User Sovereignty: no irreversible external action bypassing review | PASS (structural) | Decomposition's only writes are `tasks` rows + 2 `bets` columns + event emits; real turn runs `tools:[]` (`bet-decomposition.ts:460`); no MCP/network/outbound. See **WARNING-2** — proven by construction + the no-tool code path, but no test asserts it. |
| **AC6** — decomposing is bounded; hung/failed turn → blocked | PASS | `withTimeout(turn, turnTimeoutMs)`; rejecting turn → `blocked/failed`; empty list → `blocked/empty`. Integration tests with `turnTimeoutMs:50` assert terminal, never stuck on `running`. `DECOMPOSITION_TURN_TIMEOUT_MS=120_000` named + unit-tested. |
| **AC7** — idempotent: duplicate `active` event → one breakdown | PASS | CAS `decompositionStatus NULL→'running'` in `runBetDecomposition`; 0-row CAS → early return. Subscriber test emits event twice → stub called ≤1, ≤1 task. Service-level test pre-sets `running` → stub not called. |

| Validation scenario | Status | Evidence |
|---|---|---|
| Committed bet + builder → ≥1 task owned by team agent, session provisioned/attempted | PASS | Subscriber→dispatch integration test (tasks `accepted` + owner set; dispatcher is the existing path, C4). |
| Founder views bet → real tasks or honest empty/blocked, never permanent placeholder | PASS | Component tests across all four states; false-promise string asserted absent. |
| Team with no eligible agent → explicit blocker | PASS | AC4 integration + component coverage. |

---

## Findings

### CRITICAL
None.

### WARNING

- **W-1 — Blocked state omits the amber alert glyph + iconBg the approved design binds.** `packages/web/src/pages/WorkBet.tsx:1565-1584`. `approved.md` §Component-mapping specifies both blocked rows render `icon` = amber alert glyph (24px, `--accent-secondary`) + `iconBg var(--accent-secondary-dim)`. The decomposing state correctly passes `icon`/`iconBg` (lines 1588-1589); the blocked `EmptyState` passes **neither** — it renders icon-less. `approved.md` is the binding UI contract ("do NOT re-decide … copy or interaction grammar"). Copy, testid and action are correct; only the icon affordance is missing. **Fix:** pass the amber alert glyph + `iconBg="var(--accent-secondary-dim)"` to the blocked `EmptyState` (both reasons). Add a component-test assertion that the blocked state renders an icon so it can't silently regress.

- **W-2 — AC5 has no executable assertion; it is proven only by construction.** `packages/server/src/__tests__/AK3-bet-decomposition.test.ts:8` lists "User Sovereignty: no-tool execution surface (AC5)" in the header but **no test asserts it** — there is no test that the turn registers `tools:[]` or that decomposition takes no outbound action. The plan's own SUGGESTION (critique r2 §Remaining) asked AC5 to become a concrete negative ("`tools:[]` + only `tasks` rows + 2 `bets` columns + emits"). The behaviour is correct in code (`runRealPmTurn` sets `tools:[]`, `bet-decomposition.ts:460`), but the AC is currently unverifiable from the suite. **Fix:** add a unit/integration assertion — e.g. the `SessionConfig` passed to the adapter carries `tools: []` (spy the adapter in a real-turn test with a stub adapter), or assert decomposition's only DB writes are `tasks` + the two `bets` columns. Cheap to add; closes the one AC proven only by reading code.

### NIT

- **N-1 — Double timeout on the real-turn path.** `bet-decomposition.ts:364-367` wraps `runRealPmTurn(...)` in `withTimeout(..., timeoutMs)`, but `runRealPmTurn` already races its own `setTimeout(timeoutMs)` (lines 469-479). Two timers for the same bound. Harmless (outer fires only if the inner leaks), but redundant — drop the inner race or the outer wrap. The override path needs the outer `withTimeout`; the real path does not.

- **N-2 — Scratch dir is `mkdirSync`'d even on the override (test) path.** `bet-decomposition.ts:314-321` runs before the `if (!deps.runDecompositionTurn)` guard, so every override-path test creates a real `/tmp/decomp-test/decomp-<betId>` dir (cleaned in `finally`). Harmless but wasteful — the mkdir/assembleContext block could move inside the `!runDecompositionTurn` branch since the scratch dir only exists to satisfy the Strategy port, which the override skips.

- **N-3 — `runRealPmTurn` is entirely untested.** It is the real-LLM path (override always present in tests; evals are local-only, out of AK3 AC scope per plan). Acceptable per the plan, but flagged: ~90 lines of unexercised logic (adapter select, model resolve, stream drain, JSON parse). The `@lore` correctly documents this. No action required for AK3; note for the future evals workpackage.

---

## Lens notes (what was checked, no finding)

- **Architecture:** Boundary clean — subscriber is kernel-side (`packages/server/src/services/`), not bolted onto fabric's `lifecycle-propagation`. Task creation is server-side, never behind the Strategy port. PM context routed through `getActiveStrategy().assembleContext(...)` with the exact synthetic request the plan specified (`isRoutine:true`, scratch sandbox, synthetic ids). `checkCostCap` imported direct from `@hyperidle/fabric` (cost stays kernel-side, not banned by the AK2 ESLint guard). Dispatch reuse is real (C4) — accepted owner-assigned tasks are what the existing dispatcher consumes; no second provisioning route. Boot wiring order correct: sweep → register subscriber, dispose on shutdown.
- **Data model:** Migration `0034` adds two nullable `text` columns, no default — safe on SQLite+Postgres. `selectBetSchema` marks both `.optional()` to keep pre-existing fixtures valid. GET `/bets/:id` returns them via `...restBet` spread of the full `select().from(bets)` row (also carries `teamId` for the recovery link). Schema ↔ shared types ↔ `BetDetail` aligned field-for-field.
- **Security:** `betId` bound from the bet, never task input (cross-bet injection prevented; test asserts). Task title/description/doneCondition length-capped (512/65536/512) — matches `create-task`. Scratch path = `sandboxBasePath + decomp-${betId}` where betId is server-generated UUID → no path traversal. No new outbound URL, no secret logging. Decomposition is event-driven off the human-gated `commit` POST + CAS dedup → no public POST to rate-limit (correctly N/A). `ownerRole` resolved server-side to an eligible agent, never trusted as an FK.
- **Adversarial:** CAS double-fire closed (test). Crash-orphan closed (boot sweep, test). Timeout path closed (test). Concurrent `runBetDecomposition` serializes on the single-conn CAS UPDATE → one winner. `as` casts are confined to test files (documented red-phase column casts); production service has none beyond typed `import(...)` annotations. No `any` in production code. `crypto.randomUUID()` is a Node global (typechecks).
- **Simplification / Slop:** No dead exports, no commented-out code, no banned vocab in new surfaces (`sandbox` not `workspace` on the new interface field; service comments use "context assembly" / "harness" correctly). `@lore` comments are load-bearing (CAS placement, isRoutine rationale, orphan-sweep reasoning), not filler. Empty catch blocks are all best-effort cleanup with a comment (rm scratch dir, stop session) — justified.
