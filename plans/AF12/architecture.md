# AF12 — Architecture

Completes the bet/task lifecycle. Inputs (fixed, not re-litigated): `plans/AF12/concept.md`, `plans/AF12/design/approved.md`.

## Required reading (builder must read)

- `plans/AF12/concept.md` (cascade + appetite + label decisions)
- `plans/AF12/design/approved.md` (4 surfaces, copy, states)
- `packages/server/src/services/bet-state-machine.ts` (CAS reference at L162-220; `transitionBet`)
- `packages/server/src/services/task-state-machine.ts` (the unguarded `transitionTask` to make CAS-safe)
- `packages/fabric/src/services/lifecycle-propagation.ts` (inlined `transitionTask` copy L90-138; propagation-log helper; label bug L480)
- `packages/server/src/routes/bets.ts` (`/kill` L741, `patchCostAppetite` L294)
- `packages/server/src/routes/tasks.ts` (no sessions endpoint; `/transition` L155)
- `packages/web/src/pages/WorkBet.tsx` (overflow menu L1015, `AppetiteDialog` L477, `ConsequencePreviewDialog` L325, handlers L837-871)
- `packages/web/src/shell/TaskSheet.tsx` (insert sessions section)
- `packages/web/src/pages/WorkTask.tsx` (`SessionRow` L103, `LiveDot` L57, reuse pattern)
- `packages/web/src/hooks/useTaskSessions.ts` (frontend contract already exists — endpoint must match it)

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handles |
|---|---|---|
| "Adjust appetite always fails with a 400" | Server already accepts `cost_appetite: WireMoney` (`bets.ts:77,294`). Frontend sends a duration **string** (`WorkBet.tsx:861`, `APPETITE_OPTIONS:475`). | Fix is **frontend-only**: AppetiteDialog emits `WireMoney`. No server change. |
| "the task sessions endpoint doesn't exist" | Confirmed: `tasks.ts` has no `GET /:id/sessions`. But `useTaskSessions` hook + `TaskSession` shape **already exist** (`hooks/useTaskSessions.ts`) and WorkTask renders the section (starved of data). | Add endpoint returning the **exact** `{ sessions: TaskSession[] }` shape the hook expects. No frontend hook change. |
| "killing a bet halts nothing despite promising to" | `transitionBet(...'killed')` only decrements team capacity (`bet-state-machine.ts:207-217`). Dialog promises "All active tasks will be halted" (`WorkBet.tsx:405`). | Add downward cascade in the kernel kill path. Fix dialog copy. |
| "task transitions lacking CAS" | `transitionTask` does unguarded `UPDATE ... WHERE id=` (`task-state-machine.ts:72-79`); bet has CAS (`bet-state-machine.ts:183`). **Two copies** of transitionTask: kernel + inlined fabric duplicate (`lifecycle-propagation.ts:121`). | Add `WHERE state = fromState` CAS to **both** copies. |
| "missing UI controls for activation" | `POST /bets/:id/commit` (draft→active) exists (`bets.ts:664`); no menu item calls it. | Add "Activate bet" overflow item → `handleAction("activate")`. |
| `LiveDot` is a design-system component | It is a **local fn** in WorkTask.tsx (`WorkTask.tsx:57`), not exported. | Duplicate `LiveDot` + `SessionRow` into TaskSheet (TaskSheet already inlines `KanbanTask`; self-contained is the established pattern). No design-system component added. |
| Propagation-log labels correct | `propagateTaskToBet` logs `"${fromStatus} -> review"` (`lifecycle-propagation.ts:480`) but actually moves bet to `completed` (U1 dropped `review`). Label lies. | Correct to `-> completed`; new cascade rows labelled honestly (AC6). |

## Acceptance criteria + verification

| AC | Criterion | Verification |
|---|---|---|
| AC1 | Founder activates a draft bet from UI → active | E2E (`AF12-lifecycle.spec.ts`): draft bet, open overflow, click "Activate bet", assert status badge "Active". + integration: `POST /bets/:id/commit` on draft returns 200 + `status:"active"`. |
| AC2 | Set/adjust appetite from UI persists, no 400 | E2E: open AppetiteDialog, set amount+currency+reason, Save, assert no error + appetite chip updates. + integration: `PATCH /bets/:id {field:"cost_appetite", value:{minor,currency}}` returns 200 (already passes server-side; add a test asserting the **frontend payload shape** via the dialog unit test sends WireMoney not string). |
| AC3 | Killing a bet halts in-flight tasks + sessions | Integration (`bet-cascade.integration.test.ts`): seed bet+active task+active session, kill bet, assert task.state==='killed' AND session.state terminal + outcome==='stopped'; assert a `done` task stays `done`. + unit on dialog copy: asserts the 4 lines match behavior AND (WARNING A) the SAVED line does NOT say "immediately" and the dialog contains the "Running agents finish their current step" qualifier — so the copy can't regress into a false instant-cost-stop claim. |
| AC4 | Task sessions viewable incl. active indicators; not permanently empty | Integration: `GET /tasks/:id/sessions` returns sessions with correct `status`. + component test (`TaskSheet.test.tsx`): given sessions incl. one active, assert a row with the live-dot/"Active" label; given zero, assert "No sessions yet" (not blank). |
| AC5 | Concurrent task transitions don't corrupt state | Unit (`task-state-machine.test.ts`): two `transitionTask(task, 'in_progress' / 'blocked')` racing from `accepted`→ exactly one succeeds, the other throws `InvalidTransitionError`; final state is one of the two, never corrupted; `task_state_changed` emitted exactly once for the winner. Mirror existing bet CAS test (`adversary-M1`). |
| AC6 | Propagation record labels the transition correctly | Integration: after task→bet propagation, assert `propagation_log.targetTransition === 'active -> completed'` (not '-> review'). After kill cascade, query **by `sourceEvent`** (see test-guidance below) and assert the synchronous cascade rows: task `<from> -> killed` and session `active -> stopped`, both `sourceEvent:'bet_killed' status:'applied'`. |

**AC6 test guidance (non-flaky cascade assertions).** The kill cascade writes its `propagation_log` rows synchronously, but the upward `propagateTaskToBet` skip-row is written on the microtask queue AFTER `/kill` returns (see §4 step 4). A test that asserts on "all propagation_log rows for this task" without filtering is therefore order/timing-dependent. Two rules for the builder:
1. **Query by `sourceEvent`.** Assert only on `sourceEvent === 'bet_killed'` rows for the deterministic synchronous cascade. The async upward `skipped` rows carry `sourceEvent === 'task_state_changed'` and are out of scope for the cascade assertion.
2. If the test also wants to assert the upward skip happened, **flush microtasks first** (`await new Promise(r => setImmediate(r))` or `await Promise.resolve()` chained enough to drain, per the existing propagation integration tests' pattern) before querying `sourceEvent === 'task_state_changed'`. Otherwise assert only on the synchronous cascade rows and leave the async skip to the existing propagation-engine tests.

## Contracts / types / schemas

### 1. Appetite money-shape fix (AC2) — frontend only

`AppetiteDialog` (`WorkBet.tsx:468-607`):
- Prop change: `currentAppetite: string` → `currentAppetite: WireMoney | null`.
- Callback change: `onConfirm: (appetite: string, reason: string)` → `onConfirm: (value: WireMoney, reason: string)`.
- Delete `APPETITE_OPTIONS` and the duration `<select>`. Replace with currency `<select>` (`CURRENCY_CODES`) + amount `<input type="number">` (major units).
- On Save: `const minor = Math.round(amount * 10 ** scaleForCurrency(currency)); onConfirm({ minor, currency }, reason)`. Import `scaleForCurrency`, `CURRENCY_CODES`, type `WireMoney` from `@hyperidle/shared`.
- Caller `handleAppetiteConfirm` (`WorkBet.tsx:855`): body becomes `{ field: "cost_appetite", value, reason }` where `value` is the WireMoney object (currently the bug sends a string). Pass `bet.costAppetite` to the dialog's `currentAppetite` prop (currently passes `formatMoney(bet.costAppetite)` string — change to raw value, L1122).
- Overflow guard (`WorkBet.tsx:1033`): change `(bet.status === "active" || bet.status === "draft")` → `bet.status === "active"` (appetite not mutable in draft — server `patchCostAppetite` allows only `active`).

No server change. (Server `wiremoneySchema` already `{minor:int≥0, currency:enum}`, `bets.ts:35`.)

### 2. Activate control (AC1) — frontend only

WorkBet (`WorkBet.tsx`):
- `BetActionKind` (L301) add `"activate"`.
- `handleAction` (L757) add branch: `activate` → call new `handleActivate`.
- `handleActivate`: `POST /api/bets/${id}/commit` empty body; on `!res.ok` set an activate-error state; on ok `fetched.refresh()`. Error surface: a `role="alert"` line under the bet title (design open-Q3); message from response body or "Couldn't activate."
- Dropdown: add first item, gated `bet.status === 'draft'`, `data-bet-action="activate"`, label "Activate bet", neutral styling (not red).

Server `POST /bets/:id/commit` already maps `CapacityExceededError`? — No: it catches only `InvalidTransitionError` (`bets.ts:705`). `transitionBet` throws `CapacityExceededError` for the `active` transition (`bet-state-machine.ts:176`). **Add a catch** in `/commit`: `if (err instanceof CapacityExceededError) return c.json({error: err.message, code:"VALIDATION_ERROR"}, 400)`. **`CapacityExceededError` is exported from `@hyperidle/shared` but NOT yet imported in `bets.ts` (only `InvalidTransitionError` is, L19) — T5 must add it to the import.** Otherwise capacity-at-limit returns 500 instead of a clean 400 the UI can show.

### 3. Task-transition CAS (AC5)

**Mirror bet CAS exactly — and "mirror" means the same TRANSACTION boundary, not just the WHERE-clause guard predicate.** Bet CAS wraps the SELECT-validate + CAS-UPDATE + capacity write in a single `db.transaction` (`bet-state-machine.ts:162-220`); the event emits only AFTER commit. The current `transitionTask` is doubly unsafe: (1) the UPDATE has no CAS guard, and (2) the audit trail is a non-atomic read-modify-write — it `JSON.parse(task.auditTrail) → push → JSON.stringify` reading the blob in the initial SELECT (L62-70) and writing it back in a *separate* UPDATE (L72-79). Two interleaved transitions both read the same `auditTrail`, both push their own entry, and the second UPDATE clobbers the first → **one audit entry is silently lost (last-writer-wins on the JSON blob)**. A WHERE-only guard does NOT fix this: even if the CAS makes one UPDATE lose the state race, on SQLite/PG the read in the SELECT happened outside any lock, so the audit read is already stale. The fix is to pull the SELECT-validate-UPDATE-audit sequence INSIDE one `db.transaction` so the audit read and the CAS write are serialized together.

**Both** copies get the identical transactional CAS:

**Kernel** `task-state-machine.ts` `transitionTask` (L50-88) — wrap in a transaction:
```ts
const transitioned = await db.transaction(async (tx): Promise<{ fromState: TaskState } | null> => {
  // re-read INSIDE the tx so the audit read and the CAS write serialize together
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const fromState = task.state as TaskState;
  if (!VALID_TRANSITIONS[fromState].includes(toState)) {
    throw new InvalidTransitionError(taskId, fromState, toState);
  }
  const existingAudit: TaskAuditEntry[] = task.auditTrail
    ? (JSON.parse(task.auditTrail) as TaskAuditEntry[]) : [];
  existingAudit.push({ from: fromState, to: toState, timestamp: new Date().toISOString() });
  const updated = await tx.update(tasks)
    .set({ state: toState, auditTrail: JSON.stringify(existingAudit), updatedAt: new Date().toISOString() })
    .where(and(eq(tasks.id, taskId), eq(tasks.state, fromState)))   // ← CAS
    .returning({ id: tasks.id });
  if (updated.length === 0) throw new InvalidTransitionError(taskId, fromState, toState);
  return { fromState };
});
if (!transitioned) return;
eventBus.emit({ type: "task_state_changed", streamId: taskId, taskId,
  fromState: transitioned.fromState, toState, timestamp: Date.now() });
```
Import `and` from drizzle-orm. The `task_state_changed` emit stays AFTER commit (matches bet's post-commit emit, L222-235) so only the winner emits exactly once (mirrors bet `adversary-M1` lore). Losers throw `InvalidTransitionError` inside the tx → the throw rolls the transaction back, so no partial state/audit write survives.

**Fabric duplicate** `lifecycle-propagation.ts` `transitionTask` (L90-138) — apply the identical transactional CAS + post-commit emit. Update its `@lore O3` note. (Duplication is intentional per fabric→server import ban; the lore already says "any future changes to the kernel transitionTask must be mirrored here" — that mirror now explicitly includes the transaction boundary.)

CAS semantics: inside the tx, read `fromState`, validate the transition is in `VALID_TRANSITIONS[fromState]` (keep — gives the precise error), read+append the audit, then `UPDATE ... WHERE id AND state = fromState`. Loser sees 0 rows → `InvalidTransitionError` → tx rolls back. The transaction serializes concurrent transitions on the SQLite/PG write-lock so neither the state nor the audit blob can be corrupted, exactly like bets.

### 4. Kill cascade (AC3, AC6) — kernel, synchronous

**Decision (design-it-twice): cascade in the kernel kill path, NOT the event-driven propagation engine.**

- *Option A (chosen) — synchronous in the kill flow.* Pro: the `/kill` endpoint returns only after tasks/sessions are stopped, so the UI's immediate `refresh()` shows true state; AC3's validation ("task no longer runs" right after kill) passes deterministically. The cascade is **downward** (bet→task→session), the inverse of the existing upward engine — it belongs with the kill action.
- *Option B (rejected) — `eventBus.on('bet_state_changed', killed)` in fabric.* Eventual/async: `/kill` returns before tasks are killed → the same false-empty race AC3 tests against. Splits the cascade from the action. Reject.

**New service** `packages/server/src/services/bet-kill-cascade.ts`:

```ts
export async function cascadeBetKill(
  db: HyperIdleDb, eventBus: EventBus, betId: string,
): Promise<{ tasksKilled: string[]; sessionsStopped: string[] }>
```

Steps:
1. Select tasks where `betId = :betId AND state NOT IN ('done','killed')` (non-terminal).
2. For each, select sessions where `taskId = :taskId AND state = 'active'`.
3. Stop each active session: `UPDATE sessions SET state='stopped', outcome='stopped', endedAt=now WHERE id AND state='active'` (CAS on state to stay idempotent). Emit nothing new for sessions unless a `session_ended` event already has consumers — **do NOT emit `session_ended` with outcome 'stopped'**, because the upward propagation engine only acts on `outcome='completed'` (`lifecycle-propagation.ts:308`), so a stopped session is correctly ignored; but emitting could trigger unrelated handlers. Keep it a silent terminal write. (Lore-worthy: cascade stops sessions WITHOUT emitting session_ended to avoid re-entrant propagation.)
4. Kill each non-terminal task via the **CAS-guarded** `transitionTask(db, eventBus, taskId, 'killed')`. This emits `task_state_changed(killed)`, which the upward engine catches (`lifecycle-propagation.ts:734`) and tries to move the bet to review/completed — but the bet is already `killed`, a terminal state, so `propagateTaskToBet` logs `skipped` ("bet status is 'killed', not propagatable", L441). Correct, harmless.

   **Async-ordering consequence (designed-in, not incidental):** `EventBus.emit()` is synchronous, but the propagation handler wraps its work in `void (async () => …)()`, so the **upward** `propagateTaskToBet` runs on the microtask queue, AFTER `cascadeBetKill`/`/kill` has already returned. The "bet already killed → skips" reasoning holds (the bet was set to `killed` before the cascade ran the task kills, step ordering in Wiring below), but it means **each cascaded task produces TWO `propagation_log` rows**: the synchronous cascade row we write in step 5 (`status:'applied'`), and the deferred async upward row the engine writes (`status:'skipped'`). They MUST be disambiguated by `sourceEvent` so the AC6 test can query deterministically:
   - cascade (downward, synchronous) rows: `sourceEvent:'bet_killed'`
   - upward skip (async, microtask) rows: `sourceEvent:'task_state_changed'` (already the engine's value, L420 — do not change it)

5. Write a `propagation_log` row per cascade hop (AC6). The kernel can't import fabric's `logPropagation`, so **inline an insert into `propagationLog` (exported from `@hyperidle/db` — a shared db table, no layer violation) that matches `logPropagation` field-for-field** (`lifecycle-propagation.ts:239-255`). Pin the exact row object so the builder does not improvise — every NOT-NULL column present, same id strategy, same `createdAt`/`appliedAt` rules:
   ```ts
   const now = new Date().toISOString();
   await db.insert(propagationLog).values({
     id: crypto.randomUUID(),
     sourceLevel,            // 'bet' | 'task'
     sourceId,               // betId | taskId
     sourceEvent: 'bet_killed',
     targetLevel,            // 'task' | 'session'
     targetId,               // taskId | sessionId
     targetTransition,       // '<from> -> killed' | 'active -> stopped'
     status: 'applied',
     failureReason: null,
     attempts: 1,
     createdAt: now,
     appliedAt: now,         // status === 'applied' ⇒ appliedAt = now (mirrors logPropagation:253)
   });
   ```
   Two rows per task killed + one per session stopped:
   - task hop: `{ sourceLevel:'bet', sourceId:betId, sourceEvent:'bet_killed', targetLevel:'task', targetId:taskId, targetTransition:'<from> -> killed', status:'applied' }`
   - session hop: `{ sourceLevel:'task', sourceId:taskId, sourceEvent:'bet_killed', targetLevel:'session', targetId:sessionId, targetTransition:'active -> stopped', status:'applied' }`

**Wiring:** in `bets.ts` `/kill` handler (L741), after `transitionBet(... 'killed')` succeeds, call `await cascadeBetKill(db, eventBus, betId)`. Order matters: bet must be `killed` first so the task-kill's upward propagation sees a terminal bet and skips (no spurious review thread).

**Idempotency:** all writes are CAS/`NOT IN terminal`-guarded, so a re-killed or already-cascaded bet is a clean no-op.

**Three-layer boundary:** cascade lives in the server kernel (Human Interface → Meta), uses `transitionTask` (kernel) and a direct `sessions`/`propagationLog` write (db). It does NOT reach into fabric. ✓

### 5. Propagation-log label fix (AC6)

`lifecycle-propagation.ts:480`: change `targetTransition: \`${fromStatus} -> review\`` → `\`${fromStatus} -> completed\``. (The bet actually goes to `completed`; `review` is dead post-U1.) One-line honesty fix.

### 6. `GET /api/tasks/:id/sessions` (AC4) — new read-only endpoint

In `tasks.ts`. Must return the exact shape `useTaskSessions` expects:

```ts
// response: { sessions: TaskSession[] }
// TaskSession = { id, title, agent, cost: WireMoney|null, tokens: number|null,
//                 status: string, harnessUrl: string|null, effectivenessScore?: number|null }
```

Handler:
```ts
router.get("/:id/sessions", async (c) => {
  const taskId = c.req.param("id");
  const [task] = await db.select({id:tasks.id}).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return c.json({ error:"Task not found", code:"NOT_FOUND" }, 404);
  const rows = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).orderBy(sessions.startedAt);
  const out = rows.map((s, i) => ({
    id: s.id,
    title: `Session ${i + 1}`,                       // sessions have no title column — derive
    agent: s.agentId,
    cost: null,                                       // O2: cost columns stripped from sessions kernel table → null
    tokens: null,
    status: s.state,                                  // 'active' drives the live dot; ended sessions show state
    harnessUrl: null,
    effectivenessScore: s.effectivenessScore != null ? Number.parseFloat(s.effectivenessScore) : null,
  }));
  return c.json({ sessions: out });
});
```

Notes:
- `cost`/`harnessUrl` are `null` because O2 stripped session cost/harness columns from the kernel table (`@lore O2`, confirmed `bets.ts:457`). The hook's `TaskSession` already allows null. WorkTask's `SessionRow` and TaskSheet both render gracefully with null cost.
- **`status` = session `state` (locked, state-based contract).** The frontend keys the live dot off `status === 'active'`. Do NOT collapse to `outcome` or coalesce — `s.outcome ?? s.state` would render a cascade-stopped session (state `stopped`) as its outcome and risks an empty/misleading label. The hook + `SessionRow` contract is purely state-based (`isActive = status === 'active'`). **Use `s.state`.**
- **Label-map requirement (WARNING C — AC4 "not permanently empty").** `SessionRow` (`WorkTask.tsx:147-152`) renders the status as: `isActive ? "Active" : isDone ? "Done" : status`. The final fallback returns the raw `status` string, so a cascade-stopped session (`state==='stopped'`) renders the visible label **"stopped"** — NOT blank. This is the load-bearing behavior for AC4: a cascade-stopped session must never show an empty status cell. The TaskSheet duplicate `SessionRow` (T9) MUST preserve this exact fallback (`{isActive ? "Active" : isDone ? "Done" : status}`) so `stopped`/`crashed` render as a non-blank label. `isDone` matches only `done`/`completed`; everything else (incl. `stopped`) falls through to the raw-string label. Builder: a TaskSheet component test should assert a session with `state:'stopped'` renders a non-empty status label.
- Read-only. No POST/PATCH. AF7 owns dispatch.
- `effectivenessScore`: parse the text column (`@lore AC1 S-1`), guard `Number.isNaN`.

### 7. TaskSheet sessions section (AC4) — frontend

`TaskSheet.tsx`: between artifact preview (L329) and Discussion (L373), insert:
```tsx
<TaskSheetSessions taskId={task.id} />
```
New local component in the same file (TaskSheet is self-contained — already inlines `KanbanTask`):
- `useTaskSessions(taskId)` → `{ data, loading, error }`.
- Loading: `<p className="text-xs text-[var(--text-tertiary)] px-4 py-2">Loading sessions…</p>`.
- Error: `<p role="alert" className="text-sm text-error px-4 py-2">Couldn't load sessions.</p>`.
- Empty (`data.sessions.length === 0`): `<p className="text-[13px] text-[var(--text-tertiary)] px-4 py-2">No sessions yet.</p>` — the AC4 not-permanently-empty guarantee.
- Populated: section label "Sessions" (matching the "Discussion"/"REQUEST" label style) + a `SessionRow` per session.
- Duplicate `LiveDot` (6px pulsing green) + a `SessionRow` (title/agent + optional cost + `LiveDot`+status) into TaskSheet. TaskSheet's variant omits the harness link + effectiveness for density (design §Surface 4). Wrap rows in the same border-bottom row chrome.

Touch target: rows `py-[12px]` ≥44px ✓ (AQ-015).

## Ordered task list (builder)

| # | Task | Files | Proves | Deps |
|---|---|---|---|---|
| T1 | Task-transition CAS (kernel) | `task-state-machine.ts` | AC5 unit (race → one wins, one InvalidTransition, single emit) | — |
| T2 | Task-transition CAS (fabric duplicate) | `lifecycle-propagation.ts` (inlined `transitionTask` L90-138) | AC5 (fabric copy mirrored) | T1 (mirror) |
| T3 | Propagation-log label fix `-> completed` | `lifecycle-propagation.ts:480` | AC6 (task→bet label) | — |
| T4 | `cascadeBetKill` service | new `bet-kill-cascade.ts` | AC3 integration (task→killed, session→stopped, done untouched), AC6 (cascade labels) | T1 |
| T5 | Wire cascade into `/kill`; add `CapacityExceededError` catch to `/commit` | `bets.ts` (L664, L741) | AC1 (capacity 400), AC3 (cascade fires) | T4 |
| T6 | `GET /tasks/:id/sessions` | `tasks.ts` | AC4 integration (shape, status, 404) | — |
| T7 | AppetiteDialog → money input; caller payload `WireMoney`; overflow appetite gate → active-only | `WorkBet.tsx` | AC2 (no 400; dialog emits WireMoney) | — |
| T8 | Activate overflow item + `handleActivate` + error line | `WorkBet.tsx` | AC1 E2E | T5 (clean 400) |
| T9 | TaskSheet sessions section (`TaskSheetSessions` + `LiveDot` + `SessionRow`) | `TaskSheet.tsx` | AC4 component (active dot, empty line) | T6 |
| T10 | Kill dialog copy honesty — 4-line copy incl. `NOTE:` running-agents qualifier; drop "immediately" from SAVED | `WorkBet.tsx:403-415` | AC3 (copy matches cascade; unit asserts no instant-cost-stop claim) | T4 |
| T11 | E2E lifecycle spec (activate→appetite→kill→sessions) | new `e2e/AF12-lifecycle.spec.ts` | AC1,2,3,4 end-to-end | T5-T10 |

## Security & abuse cases

- **Rate-limit POST/PATCH:** `/commit`, `/kill`, `/tasks/:id/transition`, `PATCH /bets/:id` — N/A new surface; these mirror existing bet/task endpoints with the same (absent app-wide) limiter. No new abuse vector introduced. The new `GET /tasks/:id/sessions` is read-only.
- **Input-trust:** appetite `value` is server-validated by `wiremoneySchema` (`minor:int≥0, currency:enum`) — negative/garbage rejected at the boundary. `reason` is human-authored, length-capped client-side (500), stored as audit text (no eval).
- **Path-traversal / SSRF / secrets:** N/A — no path input, no outbound URL, no credential surface. `harnessUrl` in the sessions response is `null` (O2-stripped); if ever populated it is validated by the existing `isValidHarnessUrl` before render (`TaskSheet`/`WorkTask`).
- **Cascade authority:** kill requires a reason (`killBetSchema`, `bets.ts:126`) and the authenticated `userId` actor is logged. The cascade acts only on tasks/sessions belonging to the killed bet (FK-scoped queries) — cannot reach other bets' work.
- **Idempotency / DoS via re-kill:** all cascade writes CAS/terminal-guarded → repeated kills are no-ops, no unbounded work (task/session counts per bet are bounded).

## Route checklist

- `POST /api/bets/:id/commit` — add `CapacityExceededError → 400` catch (T5).
- `POST /api/bets/:id/kill` — call `cascadeBetKill` after transition (T5).
- `GET /api/tasks/:id/sessions` — new, read-only, 404 on missing task (T6).
- No guard/middleware fan-out — these mount on the existing bet/task routers (`app.ts` unchanged).

## Migrations

- **No DB migration.** No schema change: cascade reuses `sessions.state/outcome/endedAt`, `tasks.state`, `propagation_log` (all exist). Appetite reuses `bets.costAppetiteMinor/Currency`.
- **Symbol migrations (call sites):**
  - `AppetiteDialog` signature change (`currentAppetite`, `onConfirm`) — only caller is WorkBet itself (L1120, L855). Update both. No external caller (grep-confirmed: dialog is defined+used in WorkBet only).
  - `APPETITE_OPTIONS` deletion — referenced only inside AppetiteDialog (L475,483,558). Delete with the dialog rewrite.
  - `transitionTask` CAS — no signature change (internal behavior only); all existing callers unaffected.

## protectedTests

- `packages/web/e2e/L14-bet-actions.spec.ts` — existing kill/appetite/action behavior; AF12 changes copy + appetite shape, so assertions referencing the duration picker or old copy WILL change. **NOT protected** — flag for update in T7/T10. (Builder: this spec likely asserts old appetite `<select>` options and old kill copy; update those assertions, don't delete coverage.)
- `packages/web/e2e/lifecycle-propagation.spec.ts` — propagation behavior; the `-> review` label fix (T3) may be asserted here. Update the label assertion if present; keep the propagation coverage.
- Bet/task state-machine unit tests — protected for existing transitions; AC5 CAS test is additive.

## sharedFiles

- `packages/web/src/pages/WorkBet.tsx` (T7, T8, T10 — same file, sequence them)
- `packages/fabric/src/services/lifecycle-propagation.ts` (T2, T3 — same file)
- `packages/server/src/routes/bets.ts`, `tasks.ts`
- No `schema.ts` / `app.ts` / shared-types change → low cross-workpackage overlap risk.

## Risks / ambiguities

1. **Session terminal state value — RESOLVED.** `endSession` writes `state:'done'` (normal, `session-lifecycle.ts:237`) and `state:'crashed'` (crash, L318). The cascade's `state:'stopped'` is therefore distinct from both and honest (a human-initiated halt, not a normal end or a crash). The sessions endpoint returns `state` directly; `SessionRow` treats `done|completed` as "Done", `active` as the live dot, and everything else (incl. `stopped`/`crashed`) by the raw-string label fallback — so a cascade-stopped session renders "stopped", never blank (the load-bearing AC4 guarantee, pinned in §6 label-map note + a TaskSheet component test). ✓
2. **Upward re-entrancy on cascade task-kill.** Killing tasks emits `task_state_changed(killed)` → upward engine fires → sees terminal bet → logs `skipped`. Confirmed safe by `lifecycle-propagation.ts:441`. The AC3/AC6 tests must run with the propagation engine registered to prove no spurious ship-confirmation thread is created on a killed bet.
3. **Kernel writing propagation_log.** The kernel cascade writes to `propagationLog` directly (fabric owns the upward log helper, kernel can't import fabric). This is a downward-log write from the kernel — acceptable (the table is shared db infra), but note it as `@lore`: two writers to `propagation_log` (fabric upward, kernel downward-cascade). Keep the row shape identical.
4. **Appetite on draft via API.** After hiding the draft menu item (T7), a direct `PATCH` on a draft still 400s server-side (`patchCostAppetite` active-only). That's the correct contract — UI just no longer offers the guaranteed-failure path.
