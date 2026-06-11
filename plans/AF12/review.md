# AF12 — Code Review (Phase 4)

**Target:** `feat/AF12-bet-task-lifecycle` @ `6adced7b` vs `origin/main`
**Reviewer:** reviewer-AF12 (carried Phase-2 critique context forward)
**Verdict: DONE.** All 6 ACs met with evidence. Zero CRITICAL findings. `check` PASS, `lint` exit 0 (warnings are pre-existing baseline), 31 AF12 tests green (14 web component + 17 integration).

---

## AC table

| AC | Status | Evidence |
|----|--------|----------|
| AC1 — activate draft bet from UI; capacity→400 | **PASS** | T8 overflow item draft-only (`WorkBet.tsx:1090-1101`), `handleActivate` POST `/commit` (`WorkBet.tsx:792-810`). T5 `CapacityExceededError`→400 (`bets.ts:711-714`). Tests: `WorkBet.AF12.test.tsx` activate suite (3) green; `AF12-activate-capacity.integration.test.ts` asserts 400 VALIDATION_ERROR + bet stays draft. E2E `AF12-lifecycle.spec.ts` activate flow. |
| AC2 — adjust appetite from UI persists, no 400 | **PASS** | T7 AppetiteDialog → money input (`WorkBet.tsx:475-541`), caller emits raw `WireMoney` (`WorkBet.tsx:916-920`), active-only gate (`WorkBet.tsx:1103`). Tests: `WorkBet.AF12.test.tsx` asserts payload `{minor:25000,currency:"USD"}`, no duration string; L14 spec migrated to WireMoney. |
| AC3 — kill cascade (state-truth) + cost-honest copy | **PASS** | T4 `cascadeBetKill` kills non-terminal tasks via CAS `transitionTask`, stops active sessions `state/outcome='stopped'+endedAt` (`bet-kill-cascade.ts:51-92`); T5 wired after `transitionBet(killed)` (`bets.ts:766-769`). Copy: SAVED drops "immediately", NOTE adds "finish their current step" (`WorkBet.tsx:401-424`). Tests: `AF12-bet-cascade.integration.test.ts` (task→killed, session→stopped+outcome, done untouched, idempotent); copy unit tests assert no "immediately" + "finish their current step". |
| AC4 — sessions viewable w/ active/completed/stopped, not permanently empty | **PASS** | T6 `GET /tasks/:id/sessions` (`tasks.ts:115-147`), `status: s.state` (state-based contract). T9 `TaskSheetSessions` 4 states + `SessionRow` raw-status fallback `{isActive?"Active":isDone?"Done":status}` (`TaskSheet.tsx:147-159,201-211`). Tests: endpoint integration (active/stopped/404/empty); `TaskSheet.AF12-sessions.test.tsx` asserts stopped→"stopped" non-blank, loading line, empty line. |
| AC5 — concurrent task transitions don't corrupt | **PASS** | T1 kernel + T2 fabric `transitionTask` both wrap SELECT-validate + audit read+append + CAS-UPDATE in one `db.transaction`, emit post-commit (`task-state-machine.ts:61-116`; `lifecycle-propagation.ts:97-161`). Test `AF12-task-cas.integration.test.ts`: race → exactly one wins, loser throws InvalidTransitionError, audit count == committed count (no clobber), single emit. |
| AC6 — propagation record labels correct | **PASS** | T3 `-> review`→`-> completed` (`lifecycle-propagation.ts:503`). T4 cascade rows `sourceEvent:'bet_killed' status:'applied'`, task `'<from> -> killed'`, session `'active -> stopped'` (`bet-kill-cascade.ts:113-126`). Test asserts label honesty + `not.toContain("review")`. |

---

## Phase-2 contract verification (verified in the diff)

- **T1/T2 transaction boundary** — VERIFIED. Both copies are true structural mirrors: same `db.transaction` wrapping re-read-inside-tx, audit read+append, `UPDATE ... WHERE id AND state=fromState`, 0-row→throw→rollback, emit AFTER commit. Fabric copy is not a weaker WHERE-only guard. `@lore` notes on both explicitly pin the transaction-boundary mirror requirement.
- **Cascade propagation_log insert** — VERIFIED field-for-field against `logPropagation` (`lifecycle-propagation.ts:262-279`): `crypto.randomUUID()`, all NOT-NULL cols, `failureReason:null`, `attempts:1`, `createdAt=appliedAt=now` (status always 'applied'). `writeCascadeRow` (`bet-kill-cascade.ts:102-127`).
- **Phantom-row guard** — VERIFIED. `if (stopped.length === 0) continue;` before `writeCascadeRow` (`bet-kill-cascade.ts:68`). Idempotency test asserts exactly 1 session row + 1 task row after double-cascade.
- **Session terminal write w/o `session_ended`** — VERIFIED. Direct `UPDATE sessions` set stopped; no emit. Upward engine only acts on `outcome==='completed'` (`lifecycle-propagation.ts:331`) — stopped correctly ignored. Nothing downstream depends on a `session_ended` for stopped sessions.
- **Kill copy** — VERIFIED. SAVED line = "Team capacity is freed." (no "immediately"); NOTE = "Running agents finish their current step…". Enforced by unit + E2E `not.toMatch(/immediately/i)` + `toContainText(/finish their current step/i)`.
- **`status: s.state` collapse** — VERIFIED. Endpoint returns `s.state` (not `outcome`); `SessionRow` fallback renders `stopped` non-blank. Component test asserts it.

---

## Security lens

- **`GET /tasks/:id/sessions`** — read-only, mounted under app-wide `api.use("*", authMiddleware)` (`app.ts:336-338`), same posture as siblings (`GET /tasks`, `/transition`). 404 on missing task; no PII/secret leak (`cost/harnessUrl/tokens` null). No new IDOR hole relative to neighbors — broader team-scoping is AF11's retrofit, out of scope here. OK.
- **`/commit` + `/kill` cascade** — both under the same auth middleware; `/kill` requires reason (`killBetSchema`) + `assertBetReadable` + logs actor `c.get("userId")` (`bets.ts:748-759`). Cascade is FK-scoped to the killed bet's tasks/sessions — cannot reach other bets. Matches existing route guards. OK.
- **Input trust** — appetite validated server-side by `wiremoneySchema`; amount parsed client-side with `Number.isFinite && >=0` guard. No path/SSRF/eval surface introduced.

---

## Out-of-scope discipline

- No drift into AF7 (dispatch) — endpoint is read-only, no session creation. ✓
- No drift into AF10 (cost accounting) — `cost` returns null (O2-stripped); kill copy explicitly defers cost-stop semantics rather than computing them. ✓

---

## Docs (write-docs rubric)

`getting-started.md` + `handling-common-situations.md` updated. Cost-honesty VERIFIED: kill section states "Running agents finish their current step first, so cost may tick up briefly before they halt — killing is not an instant cost cut-off" — matches the dialog truth, does NOT over-promise an instant stop. Appetite section correctly frames appetite as money (budget, not duration). Sessions section documents active/Done/stopped/crashed + "No sessions yet." empty state. Accurate, scannable, task-oriented, matches shipped behavior. Score ≥35, all dims ≥3. PASS.

---

## Findings

### WARNINGS — none blocking

- **W1 (Adversarial / test coverage gap).** `AF12-lifecycle.spec.ts` E2E covers AC1–AC3 but NOT AC4 (sessions visible on the task surface end-to-end). Plan T11 scoped "AC1,2,3,4 end-to-end." AC4 is otherwise well-covered (endpoint integration + TaskSheet component tests across all 4 states), so this is a thoroughness gap, not a correctness gap. Non-blocking.

### OBSERVATIONS

- **O1 (Slop / dead-ish branch).** `SessionRow` in TaskSheet renders cost via `((cost.minor ?? 0) / 100).toFixed(2)` — a hardcoded /100 instead of `scaleForCurrency`, and `cost` is always `null` from the endpoint (O2-stripped). Branch never executes today. If session cost is ever wired (AF10), this scale assumption is wrong for non-2-scale currencies. Harmless now; flag for whoever populates cost.
- **O2 (Naming honesty).** Fabric `transitionTask` throws a hand-rolled `Error` with `name="InvalidTransitionError"` rather than the real class (correct — fabric can't import the kernel class), disambiguated by `isInvalidTransitionError`. Consistent with existing `@lore O3` duplication pattern. No action.

---

## Verdict: DONE

All 6 ACs proven (31 green tests + typecheck + lint). Every Phase-2 contract verified in the code, not just the plan. Zero CRITICAL/blocking findings. W1 (AC4 E2E) and O1/O2 are optional polish, not gates.
