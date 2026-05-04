# Architecture Critique: L15

**Round 1 — Score: 8.0/10** (SA:9 LI:9 AC:9 DM:8 N:8 MD:7 FMC:8 S:7 V:9)

### Per-dimension scores

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Spec alignment | 9 | Every AC from TRACK-L § L15 maps to a concrete artifact + verification method. Open questions §11 of approved.md are explicitly answered (table at §"Open questions answered"). The Canvas-drag-survives AC is covered (existing test green + e2e). |
| 2 | Layer integrity | 9 | HIL + existing server-API only. No agent-runtime touch. Shared package gets pure helpers (no runtime dep). DB unchanged. |
| 3 | API contracts | 9 | Both POST endpoints have request body shapes (typed JSON), success shape (201 + body fields), and a complete error-status table (400/403/404/409). Closed `TaskRequestVerb` union with 7 members + `requestMessageText` mapping table makes the wire copy verifiable. |
| 4 | Data model | 8 | No schema change documented and verified against `packages/db/src/schema.ts:175-222`. PG mirror called out. **Minor gap:** the plan says `participants: ["u-founder", "<task.ownerAgentId>"]` but `KanbanTask` (and the `INITIAL_TASKS` fixture) does NOT carry `ownerAgentId` — `owner` is a display string ("Dev Agent 1"). Either add `ownerAgentId?: string` to `KanbanTask` (preferred) or make the lazy-bootstrap participants list `["u-founder"]` only. Plan needs to pick. |
| 5 | Naming | 8 | `task-request.ts`, `getRequestableVerbs`, `requestMessageText` — all honest, file-name matches export. `useTaskRequestVerb` (camelCase). One quibble: `RequestableVerb` reads as adjective-noun but the type is a render row — `RequestableVerbRow` would be more honest, since instances with `disabled: true` are NOT requestable. SUGGESTION not CRITICAL. |
| 6 | Module depth | 7 | Public surface is small (5 exports from `task-request.ts`, 4 prop additions to TaskCard). The `useTaskRequestVerb` hook is justified-but-marginal — and the plan acknowledges this with the "if simplification scan flags it, fold into WorkTeam" escape hatch. The escape hatch is a tell that the hook's depth is borderline. WARNING below. |
| 7 | Failure-mode coverage | 8 | 11 failure scenarios enumerated with disposition + test. Security & abuse cases block is complete (rate-limit, input-trust, secrets, path-traversal, SSRF, authz, verb-tampering, idempotency replay) — each marked applicable+addressed or N/A with reason. Route checklist confirms two routes touched as consumer only. **Minor gap:** the "Network drops mid-request" row points at `useTaskRequestVerb.test.tsx` but that test file isn't in the §6 change list. Either add it or fold the assertion into `WorkTeam.request-post.test.tsx`. |
| 8 | Simplicity | 7 | Net add ~120 LOC, 80 LOC deleted — credible. The hook (#15) is the only borderline call; explicit fallback baked in. The HTML reference update (#6) and `bun run ds:sync` (task #22) are required by visual-parity rules — not over-engineering. **Watch:** task #20 says "EXTEND or NEW" for the canvas-drag-still-works e2e — should pick one to avoid the architect deferring the call to the developer. |
| 9 | Verifiability | 9 | Every AC has a concrete test file + test name + assertion. Protected tests block is populated (2 entries, both load-bearing: drag-removal source guard + optimistic-update prohibition). TDD ordering is explicit (test before code in §12). Type-level guard via `@ts-expect-error` documented. |

### CRITICAL

(none)

### WARNING

- **[plan §3.1, §4.1, §13]** `participants` shape mismatch. The lazy-bootstrap body includes `"<task.ownerAgentId>"` but `KanbanTask` (current and post-extension) carries only an `owner` display string. Pick: either (a) extend `KanbanTask` with `ownerAgentId?: string` and reflect it in the §13 reconciliation table, or (b) document that L15 sends only `participants: ["u-founder"]` and the agent is added when the agent first replies. Option (b) is simpler and matches the "founder bootstraps the thread" pattern but means the task agent won't see the message until it's added. Architect must pick — leaving it ambiguous is a write-tests blocker.

- **[plan §6 task #15 + §8]** The "optional, recommended" hook is a hedge. Make a binary decision: include `useTaskRequestVerb.ts` (and write a test for it — currently missing from §6) OR fold into WorkTeam.tsx and remove task #15. The current "optional" framing puts the call on the developer agent, which is exactly the kind of ambiguity that produces inconsistent implementation. Recommend folding into WorkTeam.tsx for L15 because there's exactly one caller; if a second caller appears (L18 thread-from-anywhere?), extract then.

### SUGGESTION

- **[plan §3.1]** Rename `RequestableVerb` → `RequestableVerbRow` or `VerbMenuRow`. The current name implies "this is a verb that is requestable" but instances with `disabled: true` are NOT requestable — they're row-render hints. The honest name describes what it is (a menu row).

- **[plan §6 task #6 + §6 task #5]** Order swap: update `TaskCard.html` (§6 task #5 in §12 ordering) BEFORE editing `TaskCard.tsx` (§6 task #4) per visual-parity.md ("HTML is the design source of truth"). Currently §12 ordering is 4 then 5 — invert.

- **[plan §6 task #20]** Pick "EXTEND" or "NEW" for `canvas-drag-still-works.spec.ts` now. A 30-second `find` on existing e2e specs at plan-time avoids developer-time ambiguity. (Searchable hint: drag tests in `packages/web/e2e/work-surface.spec.ts` may already cover this.)

- **[plan §3.4]** Note that `crypto.randomUUID()` is unavailable on `http://` (non-localhost) origins in some browsers (Secure Context API). Dev/CI uses localhost so this is non-blocking — but a one-line callout in §7 failure-modes is cheap insurance.

### What's Working Well

1. **Open questions answered with rationale, not vibes.** The 6 questions from approved.md §11 are each answered with a "Decision + rejected alternative + why" pattern. The lazy-bootstrap §4.1 specifically articulates why server-side create-on-write is rejected (semantic overload of the messages route). That's the kind of plan that survives review.

2. **Protected tests are well-chosen.** Drag-removal source-text guard + optimistic-update prohibition are exactly the two contracts where regression would be silent. Both are populated in the protected-tests block before write-tests runs.

---

## Round 2 — Score: 8.7/10 (SA:9 LI:9 AC:9 DM:9 N:9 MD:9 FMC:9 S:8 V:9)

Architect applied:
- WARNING #1 (participants list mismatch) → §4.1 + §4.2 now specify `participants: ["u-founder"]` only and document the agent-self-add follow-up.
- WARNING #2 (optional-hook hedge) → §6 task #15 removed; logic folded inline in WorkTeam.tsx (§6 task #13 in updated change list). Module depth (MD) now scores 9 — single seam, single caller.
- SUGGESTION #1 (rename) → applied throughout: `RequestableVerb` → `RequestableVerbRow`. Naming (N) now 9.
- SUGGESTION #2 (HTML-first ordering) → §12 task order now updates `TaskCard.html` before `TaskCard.tsx`.
- SUGGESTION #3 (Canvas e2e EXTEND/NEW choice) → §12 task #19 now resolves the choice: search `work-surface.spec.ts` first; fallback is NEW.
- SUGGESTION #4 (`crypto.randomUUID` insecure-context note) → added to §7 failure-modes.

**Decision: SHIP at 8.7/10.** All 9 dimensions ≥ 8. No CRITICAL findings. Plan ready for `/write-tests`.

## Round-2 dimension table

| # | Dimension | Score | Δ |
|---|---|---|---|
| 1 | Spec alignment | 9 | — |
| 2 | Layer integrity | 9 | — |
| 3 | API contracts | 9 | — |
| 4 | Data model | 9 | +1 (participants ambiguity resolved) |
| 5 | Naming | 9 | +1 (RequestableVerbRow) |
| 6 | Module depth | 9 | +2 (hook removed; single inline seam) |
| 7 | Failure-mode coverage | 9 | +1 (network-drop test relocated; secure-context note added) |
| 8 | Simplicity | 8 | +1 (one fewer file in the change list) |
| 9 | Verifiability | 9 | — |
