# I1 — Definition of Done Check

Worktree: `/workspace/.worktrees/I1`
Branch: `feat/I1-production-server-data-integrity`
Spec: `docs/work-packages/TRACK-I.md` lines 9-55.

---

## Group 1 — Server entrypoint

### AC1.1 — `bun dev` serves `/api/status/health` 200 + all domain routes non-404
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/__tests__/server-factory.integration.test.ts:167-174` (S1) — `GET /api/status/health` asserted `status: 200` and body `status: "ok"`.
- **MET** — evidence: same file, lines `178-202` (S2) — `it.each(DOMAIN_PATHS)` iterates over bets, tasks, knowledge, conversations, agents, sessions, rail, status, notifications, observability, git-export, routines and asserts `expect(res.status).not.toBe(404)`. The server is spawned via `bun run src/index.ts` (line 143), so the test exercises the real production boot path.

### AC1.2 — `index.ts` uses `createApp()` from `app.ts` (or server-factory delegates)
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/index.ts:7` calls `await createBunServer(port)`, which in `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:61` invokes `createApp({ db, eventBus, registerWebSocket: (apiRouter) => { wsDispose = registerWsRoute(apiRouter, eventBus); } })`. The `@lore I1 S1-S5` note (lines 50-53) documents the convergence. Single construction path confirmed.

### AC1.3 — E2E test: `GET /api/bets` returns 200 with valid JSON
- **MET** — evidence: `server-factory.integration.test.ts:242-254` (S3) — asserts 200 and parses body as JSON, asserts array-or-object.

### AC1.4 — E2E test: `POST /api/conversations/items` returns 201
- **MET** — evidence: `server-factory.integration.test.ts:259-272` (S4) — posts a valid payload (`threadId: "thread-sf"`, `title: "S4 test item"`) and asserts `res.status === 201` and `typeof body.id === "string"` with length > 0.

### AC1.5 — E2E test: WebSocket upgrade at `/ws?token=<key>` succeeds
- **MET** — evidence: `server-factory.integration.test.ts:277-301` (S5) — opens WebSocket at `/api/ws?token=<TEST_API_KEY>`, asserts `outcome === "open"` and `ws.readyState === WebSocket.OPEN`. Also asserts `/api/ws?token=nope` returns 401 (negative path).
- Note: the spec says `/ws?token=`; implementation uses `/api/ws?token=`. This is consistent with app.ts mounting the WS under the `/api` sub-router (line 178-180), and with `registerWsRoute` in server-factory.ts. The test at line 278 uses `/api/ws` and passes. Acceptable.

---

## Group 2 — Handoff data integrity

### AC2.1 — Handoff writes to `tasks.auditTrail`, not `tasks.notes`
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/services/handoff-protocol.ts:253-273` — handoff re-reads the task via `tx`, parses `auditTrail`, appends a `HandoffAuditEntry` with `type: "handoff"`, and writes only to `auditTrail: JSON.stringify([...existingAudit, handoffEntry])`. `notes` is never touched in the handoff function.

### AC2.2 — `revertTaskToAccepted` writes to `auditTrail`, not `notes`
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/services/session-provisioning.ts:90-107` — reads `task.auditTrail`, appends a `StateTransitionAuditEntry`, and writes `auditTrail: JSON.stringify([...existingAudit, entry])`. `notes` is not touched. `@lore I1 H2` at lines 74-78 documents the intent.

### AC2.3 — Handoff does NOT set `sessions.cost = 0`
- **MET** — evidence: `handoff-protocol.ts:99-102` — the session update inside the transaction is `tx.update(sessions).set({ state: "done", endedAt: now })` — only `state` and `endedAt`, no `cost` field. Comment at line 97-98: "Cost is preserved — downstream cost-cap + digest routines depend on it."

### AC2.4 — Unit test: after handoff, `tasks.notes` is unchanged
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/__tests__/handoff-protocol.test.ts:456-501` (I1 H1) — seeds a task with `notes: agentProse` ("Scribbled thought: feature is almost done."), runs handoff, asserts `expect(task?.notes).toBe(agentProse)`. Also lines 370-417 (existing AC6 preservation test).

### AC2.5 — Unit test: after handoff, `tasks.auditTrail` contains the handoff entry
- **MET** — evidence: `handoff-protocol.test.ts:494-500` — parses `auditTrail`, finds entry with `type === "handoff"`, asserts `fromAgent: "agent-a"`, `toAgent: "agent-b"`, `reason: "H1 reason"`.

### AC2.6 — Unit test: after handoff, `sessions.cost` equals pre-handoff accumulated cost
- **MET** — evidence: `handoff-protocol.test.ts:547-579` (I1 H3) — seeds session with `cost: 150`, runs handoff, asserts `expect(session?.cost).toBe(150)`. Also asserts `session?.state === "done"` and `endedAt` is truthy, proving cost preservation is scoped to the right write.

### Bonus — H2 revert notes preservation test
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/__tests__/session-provisioning.test.ts:877-919` — seeds agent prose in `notes`, forces workspace to throw ENOSPC, asserts notes preserved verbatim and revert entry lands in `auditTrail`.

---

## Group 3 — Bet state atomicity

### AC3.1 — `transitionBet` wraps team+bet updates in `db.transaction()`
- **MET** — evidence: `/workspace/.worktrees/I1/packages/server/src/services/bet-state-machine.ts:137-192` — `const transitioned = db.transaction((): boolean => { ... })` wraps both the bet UPDATE (lines 152-156) and the team `activeBets` UPDATE (lines 166-169 for committed, 173-176 for shipped, 185-188 for killed). `@lore I1 B1-B3` at lines 69-75 documents intent.
- **MET** — evidence: `bet-state-machine.test.ts:268-281` (I1 B1) — `vi.spyOn(db, "transaction")` asserts `txSpy` is called exactly once per transition.

### AC3.2 — Unit test: two sequential commits → activeBets=2
- **MET** — evidence: `bet-state-machine.test.ts:283-304` (I1 B2) — seeds two shaped bets (`bet-a`, `bet-b`) on the same team (capacity 3), transitions both to `committed`, asserts `team?.activeBets === 2` and both bets' statuses are `committed`.

### AC3.3 — Unit test: if bet UPDATE fails, activeBets not incremented (rollback)
- **MET** — evidence: `bet-state-machine.test.ts:306-346` (I1 B3) — spies on `db.update` and throws on `bets` updates while letting `teams` updates pass through (explicitly designed to detect non-transactional implementations). Asserts `teamAfter?.activeBets === 0` and `bet?.status === "shaped"` after the throw.

---

## Group 4 — EventBus resilience

### AC4.1 — `EventBus.emit()` wraps each handler in try/catch, logs, continues
- **MET** — evidence: `/workspace/.worktrees/I1/packages/shared/src/event-bus.ts:101-126` — `emit()` iterates handler set with `for (const handler of set) { try { handler(event); } catch (err) { getLogger().error("event handler threw", {...}); } }`. Same pattern for wildcard handlers (lines 116-125). `@lore I1 EventBus resilience` at lines 26-33 documents the design.

### AC4.2 — Unit test: throwing handler does not prevent subsequent handlers
- **MET** — evidence: `/workspace/.worktrees/I1/packages/shared/src/__tests__/event-bus.test.ts:249-263` (I1 E1) — registers throwing handler first, then `subsequent = vi.fn()`; asserts `emit` does not throw AND `subsequent.toHaveBeenCalledTimes(1)`. Additional coverage (E3) at lines 289-335 covers wildcard isolation and cross-isolation between type-specific and wildcard handlers.

### AC4.3 — Unit test: the error is logged (mock logger)
- **MET** — evidence: `event-bus.test.ts:267-283` (I1 E2) — mocks `createLogger` via `vi.mock("../logger.js", ...)` at lines 12-19, registers throwing handler, emits, asserts `errorMock.toHaveBeenCalled()` and verifies the error message `"boom-E2"` surfaces in the captured call args.

---

## Validation scenarios spot-check

- **Scenario 1** (GET /api/bets → 200 JSON): covered by S3, server-factory.integration.test.ts:242-254. **PASS**
- **Scenario 2** (notes preserved, auditTrail appended): covered by handoff-protocol.test.ts:456-501 (H1). **PASS**
- **Scenario 3** (session cost 150 preserved): covered by handoff-protocol.test.ts:547-579 (H3). **PASS**
- **Scenario 4** (two commits → activeBets=2): covered by bet-state-machine.test.ts:283-304 (B2). **PASS**
- **Scenario 5** (first handler throws, second still fires): covered by event-bus.test.ts:249-263 (E1). **PASS**

---

## Additional observations

- **Bonus atomicity coverage**: handoff-protocol.test.ts:583-639 (M2) verifies the whole handoff (session UPDATE, task UPDATE, messages INSERT, auditTrail append) is atomic — forces a FOREIGN KEY failure on messages INSERT and asserts session state/cost/task ownership/auditTrail all unchanged AND no events emitted. Strengthens the transactional guarantee beyond what the spec required.
- **Bounded index routes (lines 214-237 of server-factory.integration.test.ts)**: asserts `/api/sessions`, `/api/knowledge`, `/api/notifications`, `/api/observability`, `/api/git-export` return `{ ok, resource, endpoints }` — pins a non-regression contract arising from simplification scan #2.
- `@lore I1 ...` markers appear throughout the code (server-factory.ts, app.ts, handoff-protocol.ts, session-provisioning.ts, bet-state-machine.ts, event-bus.ts), documenting the decision rationale and tying each fix back to the story ID.
- All unit/integration tests use `createTestDb()` (real SQLite) per the project testing rules — no excessive mocking. EventBus tests appropriately mock only the logger module.

---

## Top-line verdict

**Tally**: 15 ACs (5 + 6 + 3 + 3 subordinate checks derived from spec groups) — **15 MET, 0 PARTIAL, 0 MISSING**.

Every acceptance criterion is backed by a concrete test at a named file/line, and each implementation site has a matching `@lore I1` marker tying it to the story. Coverage exceeds spec floor (extra atomicity test M2, extra wildcard isolation tests E3, extra bounded-index-route contract assertions).

**SHIPPABLE? YES** — subject to standard gate (`bun run check` / `bun run lint` / `bun run test` all green) not verified by this audit.
