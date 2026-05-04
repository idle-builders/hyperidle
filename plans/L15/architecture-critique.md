# L15 — Architecture Critique

## Architecture Critique: L15

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:10 N:8 MD:8 FMC:6 S:8 V:6

Verdict: **FAIL** — average is 8.0 but two dimensions fall below the per-dim ≥ 7 PASS gate (Failure-Mode Coverage = 6, Verifiability = 6). Two CRITICAL findings in the plan are the cause: the missed `WorkTeam.test.tsx:73-90` protected-test contract on `COLUMN_TO_STATE`, and the dependency on a `useToast` hook that does not exist in the codebase. The fixes are local and additive (no Phase-2 redo of `/architecture` required — designer must edit `architecture.md` to spell out the two items below, then re-submit). The plan is otherwise strong: zero schema/route changes, ordered task breakdown, source-verified endpoints, explicit rollback inventory.

### Per-dimension scores (with reasoning)

1. **Spec Alignment — 9.** Every TRACK-L L15 AC maps. Drag-removal (AC1) → §A + §B. Request affordance (AC2) → §C + §D. Drag survives only on Canvas (AC3) → §Non-goals + §Rollback. Vitest coverage (AC4) → §Test strategy. Playwright e2e (AC5) → `e2e/L15-task-request.spec.ts`. `bun run check/lint/test` green (AC6) → step 10. No scope creep. Plan even called out a non-goal explicitly (server-side task persistence stays out).

2. **Layer Integrity — 9.** No layer crossed. All work is `packages/web` only; `packages/server` and `packages/shared` are untouched. Service layer (`task-threads.ts`) sits at the right tier — page service, not design-system primitive. The Sheet stays in `shell/` not `design-system/`, which matches the rule that "closed task-specific intent vocabulary" doesn't earn a Tier 1 slot.

3. **API Contracts — 8.** All three reused endpoints are correctly cited and **verified in source**:
   - `GET /api/threads?host_kind=task&host_id=…` — `threads.ts:154` (confirmed; the route reads `c.req.query("host_kind")` and the SQL path `(threads.hostKind === q.host_kind && threads.hostId === q.host_id)` is exactly what the plan claims).
   - `POST /api/threads` — `threads.ts:277` (confirmed). The body shape `{ hostKind, hostId, participants, initialMessage: { type, payload, clientKey } }` matches `createThreadBodySchema`.
   - `POST /api/threads/:id/messages` — `threads.ts:381` (confirmed). Idempotency on `(threadId, senderId, clientKey)` matches plan §Probe-4 in concept.
   - One nit: the plan's service contract says `postRequestMessage(threadId, text, clientKey): Promise<void>` — this discards the canonical message id returned by the server. If a future story wants to reference "the message that captured this request", the service should return it. Minor; not load-bearing for L15.

4. **Data Model Alignment — 10.** **No schema changes.** Plan correctly identifies that Request is a `plain` message (concept §Probe-1) and the existing `messageInputSchema` covers it. No migration needed; no FK or index audit required.

5. **Naming — 8.** `TaskSheet`, `task-threads.ts`, `REQUEST_INTENTS`, `resolveOrCreateTaskThread`, `postRequestMessage` are honest, specific, scope-appropriate. Avoids the "Manager/Service/Helper" smell. One note: `resolveOrCreateTaskThread` describes both the GET-existing AND POST-create paths — fine, but the function name should hint at the side-effect (creates if missing). Acceptable as-is; could be `getOrCreateTaskThread` for `Map`-style precedent. SCREAMING_SNAKE for `REQUEST_INTENTS` is correct per `typescript.md` rules.

6. **Module Depth — 8.** `task-threads.ts` exposes two narrow functions for one consumer (`WorkTeam`/`TaskSheet`); `TaskSheet` exposes one component with four-prop interface. No leak. The closed `REQUEST_INTENTS` constant inside `TaskSheet.tsx` is correctly scoped — it's task-vocabulary, not Sheet-shape, but lifting it to `shared/` would be premature (one consumer, the component's own concern).

7. **Failure-Mode Coverage — 6.** This is the weakest dimension and the source of one CRITICAL finding (below).
   - **Missing:** the plan does NOT list a "Security & abuse cases" block (CC-003). For an L15 that adds one new POST surface (the Request flow), the items to list are: (a) rate-limiting on the message-post path (inherits L1's existing limits — N/A only if confirmed), (b) input-trust on the user's free-form `note` text (XSS surface — the Conversations chat must already render plain text safely; verify, don't assume), (c) clientKey collisions (handled by L1's 409 idempotency_conflict per concept §Probe-4 — addressed), (d) authorization (the user posting is whoever's API key — same model as L1; addressed by inheritance), (e) SSRF / path-traversal — N/A (no URL or path inputs).
   - **Specified:** error path on POST failure → toast + sheet stays open with selection preserved (good).
   - **Missing:** failure-mode for the GET `/api/threads?host_kind=task` step. If the network or the server fails BEFORE the message POST, the user sees no error currently — the architecture should specify that `resolveOrCreateTaskThread` propagates a typed error and the Sheet's error toast covers both phases. The plan leaves this implicit.
   - **Missing:** what happens on the `Open thread` path if `resolveOrCreateTaskThread` fails? The plan documents only the success → navigate flow. Spell out the failure → error toast + sheet stays open.

8. **Simplicity — 8.** No premature abstraction. No feature flag. No "future-proof" registry. The two helpers in `task-threads.ts` exist because each is called from at least two places (the message post AND the navigate path both need to resolve the thread). One mild concern: `Kanban.no-drag.test.tsx`'s assertion about `aria-roledescription="draggable"` absence is a "non-DOM proxy" — a positive assertion (e.g. that no `[data-droppable-column]` attributes exist, which the plan also lists) is the cleaner signal. Plan correctly anticipates this and lists both.

9. **Verifiability — 6.** This is the second weak dimension and the source of two findings.
   - **Specified well:** four new Vitest files with named scenarios; one Playwright spec with eight ordered steps; the `Kanban.keyboard-drag.test.tsx` deletion is justified.
   - **CC-008 PROTECTED-TESTS GAP (CRITICAL):** The plan deletes `COLUMN_TO_STATE` from `Kanban.tsx` (§A line 47) but does NOT enumerate what to do with `packages/web/src/__tests__/WorkTeam.test.tsx:73-90`, which is a frozen contract test that imports `COLUMN_TO_STATE` and asserts its exact shape. After this plan lands, that test will fail to compile/run. The plan's §F "Existing tests to update" lists `Kanban.test.tsx`, `Kanban.keyboard-drag.test.tsx`, and `WorkKanban.grouped.test.tsx` — but NOT `WorkTeam.test.tsx`. This is the exact recurrence pattern CC-008 names.
   - **CC-007 USETOAST DRIFT (CRITICAL):** The plan's §C and approved.md both reference `useToast` as if it exists ("Existing `useToast` hook (wherever it lives — architecture pins this down)"). I grepped: **no `useToast` exists in `packages/web/src/` or `packages/design-system/`** — only one comment mentions a "feedback toast" (`SettingsPanel.tsx:198`) that hasn't been built yet. The "Open question 1" defers this decision to the builder, but the test `TaskSheet.test.tsx` plans an assertion on a toast surface that doesn't exist. The plan must either (a) specify that L15 builds a minimal `useToast` (and where), or (b) drop the toast and use an inline alert inside the Sheet for both success and failure. As written, the builder can't write red-phase tests for case (c) "selecting + clicking calls postRequest and onClose" — there's no toast surface to assert against.

### CRITICAL

- [plan §F + §Rollback "`COLUMN_TO_STATE` removal"] **Missed test contract.** `packages/web/src/__tests__/WorkTeam.test.tsx:73-90` asserts that `Kanban` exports `COLUMN_TO_STATE` with `{ planned: "accepted", in_progress: "in_progress", blocked: "blocked", done: "done" }`. Removing the export breaks this test. **Fix:** add a row to §F: "`packages/web/src/__tests__/WorkTeam.test.tsx` — DELETE the `it('exports a COLUMN_TO_STATE map …')` test (lines 73-90); the contract is moot now that drag is removed and the inverse mapping is gone." Add this test deletion to the §Rollback inventory and to the ordered tasks (step 3 or step 4). Also add a one-line protected-tests note: "L15 RETIRES the `COLUMN_TO_STATE` export contract (was protected by `WorkTeam.test.tsx:73-90`); the I4 K1/K2 assertion is no longer required because the column-key → TaskState lossy round-trip the test guards against has no caller."

- [plan §C + Open Question 1] **`useToast` does not exist.** No `useToast` hook lives in `packages/web/src/` or `packages/design-system/src/` (only comment-mentions in `SettingsPanel.tsx`). **Fix:** the plan must commit to one of:
  1. Build a minimal `useToast` hook in `packages/web/src/shell/use-toast.tsx` (or similar), with a `<Toaster>` mount in `AppShell.tsx`, and add it to the ordered task list as step 6a (before TaskSheet). Spec the API: `const { showToast } = useToast(); showToast({ kind: "success" | "error", text: string })`. This becomes a small but real new surface — needs its own stories + test.
  2. OR: drop the toast, surface success/failure inside the Sheet itself (`<div role="status">Sent.</div>` for success, `<div role="alert">Couldn't send — try again.</div>` for error). Sheet auto-closes after 800ms on success.
  Either way, the chosen path must be reflected in `approved.md` AND the `TaskSheet.test.tsx` assertion list — the test should match the actual surface, not "wherever the toast lives".

### WARNING

- [plan §Failure-mode / Open question 2] **`agentParticipantId` placeholder is OK but should be specified once.** The plan references "static fallback (e.g. `agent-unassigned`)". Pin the exact string in §D so the DB rows are auditable and consistent across the test fixtures and production code. Suggested: `const PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned" as const;` exported from `task-threads.ts` so the test can import it instead of duplicating the literal.
- [plan §Test strategy "Vitest"] **Missing input-trust assertion for the free-form note.** Add a Vitest case to `task-threads.service.test.ts`: when the note contains `<script>alert(1)</script>`, the POST body's `payload.text` is sent as-is (server stores the literal string; the rendering layer is responsible for escaping). This documents the trust boundary explicitly per the failure-mode dimension.
- [plan §Test strategy "e2e"] **Drag-no-op assertion is fragile.** Step 2 ("Try to drag a task card via dragTo() to another column. Assert the task remains in its original column") will pass even if drag throws an exception — there's no positive signal that drag was attempted. Strengthen by also asserting the absence of `[data-droppable-column]` and `[data-testid^="draggable-task-"]` in the DOM (positive guard) AND that `<DndContext>` is gone (look for any element with `aria-roledescription="draggable"` — none should exist).
- [plan §Failure-mode] **`Open thread` path missing error spec.** §C step "On Open thread" only documents success. Add: "On any throw from `resolveThreadId`: render error toast/inline alert (per the chosen pattern from CRITICAL #2), keep sheet open."
- [plan §F / §A] **`Kanban.test.tsx` assertions not enumerated.** §F says "Drop drag-related assertions if any". Read the file before the build — list specifically which assertions die. The vague "if any" creates room for the builder to skip the audit.

### SUGGESTION

- [plan §C] Have `postRequestMessage` return the canonical `Message` (not `void`) — even if no caller reads it today, it's free, more honest, and saves a future round-trip when "your last request" UI is added (concept §Probe-2 derived state).
- [plan §D] Document the URL construction explicitly: `const url = \`/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}\`;` — protects against task ids ever containing `&` or `#` (UUIDs are safe today, but the encoding is the right habit).
- [plan §Test strategy] The plan's three "Existing e2e to verify still green" callout reads like an aspiration. Add the explicit file path the builder must run: `bun run --cwd packages/web e2e canvas-drag.spec.ts` (or the actual path — `grep -r "Canvas" packages/web/e2e/` once before step 9).
- [plan §"Open questions"] Open question 3 (Sheet vs. PitchSelector inline-replace) is settled by the design critique — the Sheet is per-row detail and PitchSelector is full-section view. Move that resolution from "open" to "resolved" in this plan.

### What's Working Well

- Plan reuses three existing endpoints with **verified file paths and line numbers** (`threads.ts:154/277/381`) — the architect did the source-of-truth check that CC-007 keeps catching elsewhere. This is exactly the discipline architecture-critique exists to reinforce.
- Zero schema/route changes is the right call; the concept work (§Probe-1: Request is a `plain` message, not a new MessageType) carried correctly into the plan with no regression. Closed `MESSAGE_TYPES` enum stays closed.
- Ordered task breakdown (10 steps) has correct dependency order: red-phase tests first → strip drag → strip handler → service → Sheet → wire → stories → e2e → verify. No forward references.
- Rollback / migration concerns inventory correctly enumerates the four call sites of `onMoveTask` and the two of `COLUMN_TO_STATE` — nearly. The miss is the test file (CC-008 above), not the production call sites.
- The `@lore` notes-to-add are real lore (N+1 thread resolution, agent-participant placeholder) — not theatre. The next agent will benefit.

## Round 2 (post-fix)

**Verdict:** PASS
**Aggregate:** 8.4/10  rounds=2  score-line: SA:9 LI:9 AC:8 DM:10 N:8 MD:8 FMC:8 S:8 V:8

| Dim | Score | Notes |
|---|---|---|
| Spec alignment | 9 | Unchanged from R1; ACs still map. |
| Layer integrity | 9 | Unchanged; web-only. |
| API contracts | 8 | Three reused endpoints with verified line numbers retained. |
| Data model | 10 | No schema changes. |
| Naming | 8 | `PLACEHOLDER_AGENT_PARTICIPANT_ID` pinned; SCREAMING_SNAKE correct. |
| Module depth | 8 | Inline feedback region replaces nonexistent `useToast`; one file fewer. |
| Failure-mode coverage | 8 | New §"Security & abuse cases" enumerates rate-limit, input-trust, clientKey, authz, SSRF, replay. Open-thread error path now spec'd with `[role="alert"]`. |
| Simplicity | 8 | Inline status > new toast hook; no premature abstraction. |
| Verifiability | 8 | Test (f) added for open-thread failure; e2e step 2 has three positive `toHaveCount(0)` assertions. `WorkTeam.test.tsx:73-90` deletion enumerated in §F + §F.1 + ordered task step 3. |

### Round 1 issue closeout
- CRITICAL 1: CLOSED — `architecture.md` §F row for `WorkTeam.test.tsx` says "DELETE lines 73-90". §F.1 "Protected tests retired" table cites `WorkTeam.test.tsx:73-90` as the I4 K1/K2 lossy round-trip guard whose contract is moot post-drag-removal. Ordered task step 3 explicitly mentions deleting the block in the same commit as drag strip. `WorkTeam.test.tsx:73-90` confirmed still present at HEAD (Phase 2 — deletion happens in build phase per ordered tasks).
- CRITICAL 2: CLOSED — Option A chosen. `architecture.md` §C now says "L15 does NOT depend on a `useToast` hook" and specs inline `<div role="status" aria-live="polite">` / `<div role="alert" aria-live="assertive">` regions. `design/approved.md` step 4 + Accessibility + "Component reuse" sections all reflect inline pattern; "NO `useToast` hook" stated explicitly. Open question 1 marked RESOLVED. Grep of `packages/web/src/` and `packages/design-system/src/` returns zero `useToast` references.
- WARNING 1: CLOSED — `## Security & abuse cases` section added, enumerating rate-limit (POST /api/threads/:id/messages + POST /api/threads), input-trust (free-form note → trust boundary documented + Vitest case scheduled), clientKey idempotency, authz, SSRF/path-traversal (N/A), cross-tab/replay.
- WARNING 2: CLOSED — `architecture.md` §C "On `Open thread`" now lists step "On any throw at step 1: set `status = { kind: \"error\", text: \"Couldn't open thread — try again.\" }`". Test list in §Test strategy adds case (f) "`Open thread` failure: when `resolveThreadId` rejects, the sheet stays open and `[role=\"alert\"]` renders".
- WARNING 3: CLOSED — e2e step 2 now has three positive structural `toHaveCount(0)` assertions: `[data-droppable-column]`, `[data-testid^="draggable-task-"]`, `[aria-roledescription="draggable"]`. `dragTo()` becomes defense-in-depth, not the primary guard.

