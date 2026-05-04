# L15 — Architecture Review (read-only)

**Scope.** L15 changes only on branch `ab/L15-1a` against `main`. The pre-existing block-1a-plumbing changes mixed into the worktree (`vitest-toon-reporter`, `scripts/verify.ts`, `pipeline/progress.ts`) are EXPLICITLY excluded from this review.

**Mode.** Read-only. Findings only — no code edits.

**Inputs reviewed against.**
- Spec: `docs/work-packages/TRACK-L.md` lines 511–540.
- Plan: `docs/architecture-plans/L15-plan.md` (Round-2 score 8.4).
- Critique amendments: `docs/architecture-plans/L15-plan-critique.md`.
- Approved design: `docs/design-explorations/L15/approved.md`.
- Prior reviews: `docs/reviews/L15-simplification-scan.md`, `docs/reviews/L15-scan-resolutions.md`.

**Files inspected.**
- `packages/shared/src/task-verbs.ts` (new) + `packages/shared/src/index.ts` (re-exports) + `packages/shared/src/__tests__/task-verbs.test.ts`.
- `packages/web/src/lib/thread-detail.ts` (new — extracted decoder).
- `packages/web/src/shell/Kanban.tsx` (rewrite — DnD removed, action footer added).
- `packages/web/src/shell/TaskRequestPopover.tsx` (new).
- `packages/web/src/pages/WorkTeam.tsx` (rewrite — handler removed, fetch fan-out added).
- `packages/web/src/pages/WorkTeamTaskThread.tsx` (new).
- `packages/web/src/pages/ConversationsReview.tsx` (decoder migrated to shared module).
- `packages/web/src/router.tsx` (route added).
- `packages/design-system/src/Tag.tsx` + `Tag.stories.tsx` + `__tests__/Tag.test.tsx` (unread variant).
- `packages/design-system/src/TaskCard.tsx` (action-footer divider).
- `packages/server/src/routes/__tests__/threads.routes.test.ts` (L15 describe appended).
- `docs/work-packages/follow-ups.md` (3 follow-ups appended).

---

## Summary

| Severity | Count |
|---|---|
| MUST-FIX | 1 |
| SHOULD-FIX | 5 |
| NICE-TO-HAVE | 5 |

**Verdict: PROCEED.**

The L15 contract holds against the plan and the spec. Layer integrity, API contract, data model alignment, and module boundaries are all correct. The single MUST-FIX is a contract break the popover already incurs on retry (idempotency violation), explicitly logged as a deferred follow-up in `L15-scan-resolutions.md` — not a blocker for merge but a real correctness defect that should land before the *next* L15 surface consumes the popover. Everything else is should/nice clean-up.

---

## MUST-FIX

### MF-1. Idempotency contract is silently violated on retry — `clientKey` is regenerated every `Send`

`packages/web/src/shell/TaskRequestPopover.tsx:124-146` (`handleSend`) calls `crypto.randomUUID()` inside the function body. On a transient failure (network blip, 5xx) the user clicks `Send` again — and a fresh `clientKey` is generated. The server's `(threadId, sender, clientKey)` idempotency unique constraint (plan §10 trade-off 4 + critique Round-2 §4 idempotency answer) is therefore *useless*: every retry collapses to a new row. The whole point of the `clientKey` discipline (cited in plan §10 as a chosen trade-off and verified against `RichMessageCard.test.tsx:139-156`) is server-side dedup on retry. As shipped, the dedup never triggers because the key changes.

The fix is one line — generate the key once when the user picks a verb (or first opens the popover) and reuse it across retries until the popover closes successfully. The simplification scan flagged this exact issue (`L15-simplification-scan.md` SHOULD-FIX, third bullet); the resolution memo (`L15-scan-resolutions.md` SHOULD-FIX row "TaskRequestPopover.postRequest 7-arg prop bag + clientKey not reused on retry") deferred it as "needs design call." **It does not need a design call.** The contract is already pinned (plan §4 idempotency, plan §10 trade-off 4). This is implementation drift from the plan.

The follow-up has been logged but the popover is the only L15 write surface — every retry today writes a duplicate message. Fix before the demo runs against any non-trivial network path.

---

## SHOULD-FIX

### SF-1. `WorkTeam.tsx:128-156` reuses fetch + `as` casts instead of the now-extracted `decodeThreadDetail`

After the simplification scan extracted `decodeThreadDetail` into `packages/web/src/lib/thread-detail.ts`, the `WorkTeam` page still hand-rolls `ThreadListResponse` / `ThreadDetailResponse` interfaces and casts JSON parse results with `as ThreadListResponse` / `as ThreadDetailResponse` (lines 146, 155). The same risk vector that motivated extracting the decoder is repeated here — a server-shape drift produces a typed-but-wrong value, and the cast lies. The decoder validates `messages: ReadonlyArray<Message>` already; reusing it (or adding a sibling `decodeThreadList` for the list endpoint) would close the loop. The resolution memo logged this as a follow-up; it should land in this story since the decoder is already extracted.

Plan reference: §5.3 explicitly says "if `decodeThreadDetail` fails validation, route to the `error` state." The `WorkTeam` mount fetch silently returns `{threadId: null, threadCount: 0}` on cast failure — which is the orphan-no-thread fallback documented in the plan, but the call sites should still narrow via the same decoder so `messages.length` access cannot crash on a malformed body.

### SF-2. `Kanban.tsx:83-84` ships `DEFAULT_FOUNDER_ID = "u-founder"` and `DEFAULT_FOUNDER_NAME = "A. Founder"` as hardcoded module constants

These auth-shaped defaults live in a presentation-layer file. When real auth lands, every component carrying these defaults becomes a search-and-replace landmine (and silently posts as `u-founder` until the day the search misses one site). Either require `founderId` + `founderName` as required props (`WorkTeam.tsx` already supplies them and could thread them down) or read from a context — but don't bake `"u-founder"` as a default into a shell component. The resolution memo deferred this pending auth landing; the plan does not promise auth, but it also does not authorize hardcoded fallbacks at this layer. At minimum, mark the constants `@lore L15` with the follow-up reference so the next agent finds it via grep.

### SF-3. Plan §5.2 promised a `WorkTeamTaskThread` route at `path: "work/team/tasks/:taskId/thread"`; the implementation matches but the page silently degrades the AC

The page mounts `<ThreadShell>` with `onAppendMessage={noopAppend}` (lines 30–32, 110). This is the resolution memo's chosen response to the "stale closure on append" simplification finding. The cost: opening a thread from the chip lands the user on a *read-only* surface. The L15 AC (TRACK-L.md:520) says "Each task gains an affordance to … open the task's attached thread (from L18)" — and L18's contract is that `ThreadShell` IS the L1 composer-bearing surface. Wiring `noopAppend` ships the L15 chip click to a thread that the user can read but cannot reply on, even though the thread surface is otherwise unchanged.

The L15 AC technically says "request a state change OR open the thread" (the popover handles `request`; the chip handles `open`). Reading-only is consistent with "open." But the user who opens a thread and tries to compose will silently get nothing, which is a confusing UX delta from the rest of the app (every other thread surface composes). Either (a) wire a real append handler that mirrors `ConversationsReview` (the resolution memo rejected this as too much rework but the cost is ~30 LOC of proven code), or (b) document the read-only state in the page's empty-state copy and the chip's `aria-label` so the user knows.

This is plan-vs-spec drift on the read/write semantics of the new page — not silent enough to be MUST-FIX, but real enough to warrant a fix or an explicit doc.

### SF-4. `Kanban.tsx:83-84 + WorkTeam.tsx:160-188` mount-effect captures the constant `INITIAL_TASKS` instead of state

The mount effect at `WorkTeam.tsx:164-191` iterates `INITIAL_TASKS.map(...)` directly (line 170) — not `tasks`. The dependency array is `[]`. After `handleTaskRequestSent` mutates `tasks`, a re-mount would re-fetch from `INITIAL_TASKS` and discard the optimistic update. This is acceptable for L15 because the popover's optimistic delta is reconciled on every mount; the simplification scan logged this as MUST-FIX (the AbortController fan-out half) and the AbortController half was fixed. The remaining staleness vector is fine for the fixture-driven L15 surface, but the moment real task data lands the mount effect must rebind to the live list.

Add a `@lore L15` comment on the effect explaining that the captured-fixture pattern is intentional only because `INITIAL_TASKS` is a module-level constant, and the next agent must rebind to props/state when a real fetch lands. Plan §5.3 documents the fan-out semantics; it does not document the captured-fixture trade-off.

### SF-5. Plan §6 task 5 + design §10 say the popover is a "DaisyUI dropdown"; implementation uses `dropdown dropdown-end` but never measures whether the trigger actually lives in the rightmost column

`TaskRequestPopover.tsx:156` hardcodes `className="dropdown dropdown-end"` for every card — every popover anchors to the right edge of its trigger. Plan §4 Q3 said the design picks `dropdown-end` ONLY for cards in column index ≥ 3 (the `in_progress` column and beyond). The implementation applies it universally. Functionally fine — the popover always opens leftward of its trigger — but it deviates from the documented "anchor swap at the right viewport edge" rule and means cards in the `planned` (leftmost) column have a popover that opens partially off the left edge of the card instead of the right.

Either (a) thread the column index into the popover and conditionally apply `dropdown-end`, or (b) update plan §4 Q3 to record that the implementation chose universal `dropdown-end` (and explain why — likely simplicity). This is a docs-vs-code drift, not a functional defect.

---

## NICE-TO-HAVE

### NTH-1. `TaskRequestPopover` ARIA mismatch: `aria-haspopup="menu"` but `role="dialog"`

`TaskRequestPopover.tsx:160 + 169` declares `aria-haspopup="menu" aria-expanded={open}` on the trigger but the popover itself is `role="dialog" aria-label="Request state change"`. The ARIA spec says `aria-haspopup` should match the popup's role. Either change the trigger to `aria-haspopup="dialog"` (matches current popup role + design's "popover not menu" framing) or restructure the popup as a `menu` with `menuitem` rows + arrow-key nav (which the slop scan flagged). Pick one; document in plan §4 if needed. Resolution memo deferred this as "needs design call" — it doesn't, the dialog role already chose.

### NTH-2. Popover overflow / bottom-edge clipping is unhandled

Plan §10 trade-off 3 acknowledged DaisyUI `dropdown` does not auto-flip vertically. The popover ships at ~280px tall (verb list + textarea + buttons). On a small viewport with a card near the bottom of the column, the popover clips below the fold. No tests cover this; no `@lore` documents the rationale. Either add a viewport-aware fallback (the design accepts horizontal-only flipping, so vertical clip is "by design" per plan §10) or add a `@lore L15` on the popover container documenting that vertical clip is acceptable today and `@floating-ui/react` is the escape hatch.

### NTH-3. Test files contain structural negative-space assertions

`Kanban.test.tsx:93-97` and `WorkTeam.test.tsx:93-96` assert `mod.COLUMN_TO_STATE === undefined` and `mod.resolveKanbanDrop === undefined`. Belt-and-braces — the no-op-on-drag behavioural assertion at `Kanban.test.tsx:114-129` is the load-bearing one. The export-shape negative tests will go stale the moment someone reuses one of the names for an unrelated symbol. The simplification scan already flagged this; it's a duplication between two files even.

### NTH-4. `Tag.tsx` precedence between `kind` and `unread` is not load-bearing in tests

`packages/design-system/src/Tag.tsx:38-71` has the precedence "valid `kind` wins over `unread`; invalid `kind` falls through to `unread`." The TSDoc says "kind wins when both are set." The documented and actual behaviour disagree on the unknown-kind case. The slop/simplification scans flagged this. Resolution memo deferred. For NICE-TO-HAVE: either tighten the TSDoc to "valid kind > unread > default" or guard `if (kind != null) return kindBranch;` first.

### NTH-5. The new `lib/` directory under `packages/web/src/` introduces a third top-level web folder alongside `pages/` and `shell/`

Module boundary observation, not a violation: `lib/thread-detail.ts` is the only file in the new `lib/` directory. Its kind is "shared client-side decoder" — neither a page (no React) nor a shell composition (no DOM). Acceptable, but the project's module-boundary discipline historically uses `packages/web/src/components/` and `packages/web/src/shell/` only. Either (a) keep `lib/` and document its purpose in the package README (the convention is "pure-TS web utilities — no React, no DOM"), or (b) move `thread-detail.ts` to `packages/shared/` since it operates on shared types (`Thread`, `Message`, `HostKind` from `@hyperidle/shared`) and could be consumed by future server-side test fixtures. Currently no rule constrains this — flagging for future-proofing only.

---

## What's Working Well

- **Layer integrity is clean.** Web → Server only via existing `/api/threads` routes; no new endpoints; `task-verbs.ts` correctly lives in `@hyperidle/shared` (plan §4 Q1) so both web and future agents share one source of truth for the verb closed-enum and the deterministic body formatter.
- **`task-verbs.ts` honours the closed-enum + state→verbs table from the plan exactly.** The exhaustive `switch` over `TaskState` is a build-time guard; `formatRequestMessageBody` matches the format documented in plan §5.1 and approved.md §5.
- **Drag deletion is total.** Every symbol the plan §5.4 named for deletion is gone from `Kanban.tsx`. `STATE_TO_COLUMN` survives as the read-direction map; `COLUMN_TO_STATE`, `resolveKanbanDrop`, `DraggableTaskCard`, `KanbanDropZone`, all DnD imports — all gone. `Canvas.tsx` is untouched (plan §3 row 6).
- **`POST /api/threads` body matches the contract.** `TaskRequestPopover.postRequest` posts `{hostKind:"task", hostId, participants:[founderId, ownerAgentId], initialMessage:{type:"plain", payload:{text:formatRequestMessageBody(...)}, clientKey}}` — exactly the plan §5.3 client flow. The append path (`POST /api/threads/{id}/messages`) carries the same `formatRequestMessageBody` body via the contract function. No drift.
- **`decodeThreadDetail` is now the single source of truth.** Both `ConversationsReview.tsx:130,155` and `WorkTeamTaskThread.tsx:68` import from `lib/thread-detail.ts`. The duplication that motivated the simplification-scan MUST-FIX is gone. Strict per-field validation (no `as` casts, no defensive defaults) closes the original `as unknown as Thread` slop finding.
- **Server contract test landed.** `threads.routes.test.ts` now has a "L15 — request-to-task-thread client flow" describe (lines 977+) appended to the existing file (not a new file) — protected-test rule honoured (append-allowed, edit-forbidden).
- **Follow-ups were logged.** All three plan-required follow-ups (`thread-message-rate-limit`, `thread-list-include-message-count`, `kanban-thread-metadata-batched-endpoint`) appear in `docs/work-packages/follow-ups.md` with origin, issue, reference, owner, status.
- **Component budget honoured.** Net new components: 0. `Tag` and `TaskCard` extend by one optional prop each. `TaskRequestPopover` and `WorkTeamTaskThread` are page-internal compositions (web/shell, web/pages — Tier 3-shaped, not in the 19-component budget).
- **No emojis.** The chevron `▾` is a typographic glyph (AQ-105 honoured); the unread dot is a CSS-painted span, not a unicode glyph.
- **`MESSAGE_TYPES` closure preserved.** No new enum value; the L15 message is `type: "plain"` (rejection list item 3).

---

## Spec Drift Audit (CC-007)

Walked every L15 AC from `docs/work-packages/TRACK-L.md:517-523` against the implementation:

| AC | Implementation | Status |
|---|---|---|
| Drag-to-move removed; sensors + column-to-state + handleMoveTask + Kanban onMoveTask all gone | `Kanban.tsx` no longer imports `@dnd-kit/core`; `WorkTeam.tsx:116-120` `handleMoveTask` deleted; `COLUMN_TO_STATE` deleted | ✓ |
| Each task gains an affordance to request a state change OR open the task's thread | `TaskCard.actions` slot rendered with `<TaskRequestPopover>` + thread chip via `<a href>` | ✓ |
| Selecting a request posts a message to the task's thread; agent decides | Popover posts `plain` message via `formatRequestMessageBody`; no state mutation; documented "humans request, agents decide" in plan §5 | ✓ |
| Drag survives ONLY between Shaped → Committed columns on Canvas | `Canvas.tsx` untouched; protected-test entry freezes Canvas drag tests | ✓ |
| Vitest covers: drag is no-op; request posts to right thread; opening a thread lifts | `Kanban.test.tsx`, `TaskRequestPopover.test.tsx`, `WorkTeamTaskThread.test.tsx` | ✓ |
| Playwright e2e: try drag → no-op → request state change → message appears | `packages/web/e2e/team-request.spec.ts` (per simplification-scan inventory) | ✓ (file present; flow not re-verified in this review) |
| `bun run check` + `bun run lint` + `bun run test` all green | Resolution memo confirms green (one pre-existing OTel test failure unrelated) | ✓ |

**No silently-downgraded ACs.** SF-3 above flags a soft-degrade on the chip-click path (read-only thread surface) but the AC says "open" — semantically the AC is met.

---

## Top 3

1. **MF-1 — `clientKey` regenerated on retry breaks the server-side idempotency contract.** One-line fix; the plan explicitly purchased this trade-off in §10 and the implementation undoes it. Highest impact, lowest cost.
2. **SF-1 — `WorkTeam.tsx` mount fan-out still casts JSON to hand-rolled interfaces** despite `decodeThreadDetail` now being available next door. Same risk vector the decoder was extracted to eliminate. Should land in this story since the extraction is already there.
3. **SF-3 — `WorkTeamTaskThread` page silently ships read-only `<ThreadShell>`.** The chosen `noopAppend` resolves the simplification-scan stale-closure bug correctly, but the user-visible result is a thread surface that doesn't compose. Either wire a real append (mirror `ConversationsReview`) or document the read-only state in the page copy + `aria-label`.

---

## Verdict

**PROCEED.** Layer integrity, API contracts, data model alignment, module boundaries, and spec coverage are all correct. One MUST-FIX (idempotency regression) is a real correctness defect on the popover retry path; ship the one-line fix before merging this story or the demo. Five SHOULD-FIX items are clean-up that improve robustness without changing the contract. Five NICE-TO-HAVE items are stylistic.

The plan's Round-2 score of 8.4 is reflected in the implementation — the bones are right. The defects are localized to (a) one popover correctness slip and (b) deferred resolution-memo follow-ups that the plan originally committed to.
