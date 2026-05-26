# Q1 Code Review -- Phase 4

**Reviewer:** Phase 4 Reviewer
**Branch:** `feat/Q1-human-conversations`
**Diff:** `git diff 99460ef...HEAD -- ':!plans/'` (21 code files, +4283 / -5 lines)
**Date:** 2026-05-26

---

## Verdict: NOT DONE

The implementation delivers roughly half the architecture plan. Server-side foundations (Tasks 1-4) and standalone frontend components (Tasks 6-7, 10-11) are present and well-built. However, the critical integration layer is entirely missing -- none of the existing pages or layouts were modified to wire the new components into the application. The user cannot reach any Q1 functionality through the running application.

---

## AC Completeness Table

| # | AC | Status | Evidence |
|---|-----|--------|----------|
| 1 | "New thread" action accessible from Conversations view | FAIL | `AppShell.tsx` was not modified. No "New Thread" button exists. `RecipientPicker` component exists but is never mounted. E2E test `q1-new-dm-thread.spec.ts:119` fails. |
| 2 | Recipient picker with search/filter showing users and agents | PARTIAL | `RecipientPicker.tsx` renders recipients with search. `GET /api/recipients` works. But the picker is never mounted in AppShell, so it is unreachable. |
| 3 | Selecting recipient + sending creates DM thread | PARTIAL | `RecipientPicker.handleSend()` POSTs to `/api/threads`. `findOrCreateDirectThread` supports `recipientKind`. But never wired into AppShell. E2E test `q1-new-dm-thread.spec.ts:150` fails. |
| 4 | New thread appears in submenu immediately | FAIL | `useConversationsThreads.ts` was not modified. No `thread_created` WS event refresh (Task 16 missing). |
| 5 | Dial-in affordance visible when recipient agent has active session | FAIL | `Conversations.tsx` was not modified. No `useActiveSessionForTask` hook. No "Dial In" button. E2E test `q1-session-dial-in.spec.ts:132` fails. |
| 6 | Dial-in shows activity stream alongside thread | PARTIAL | `SessionActivityPanel.tsx` renders activity entries with filter-ready layout. `GET /api/sessions/:id/activity` works. `useSessionActivity` hook fetches data. But the component is never mounted in `Conversations.tsx`. |
| 7 | User can interject in dial-in mode | FAIL | Existing `POST /api/threads/:id/messages` is reused (no change needed), but dial-in mode is never activated so the user cannot reach the interjection context. E2E test `q1-session-dial-in.spec.ts:180` fails. |
| 8 | Observe mode is read-only | PASS | `SessionActivityPanel` and `useSessionActivity` perform only GET requests. Unit test (`SessionActivityPanel.test.tsx` "does not make any write requests") confirms. |
| 9 | Session end graceful transition | PARTIAL | `useSessionActivity` detects `state === "done"` and transitions to `ended`. `SessionActivityPanel` shows summary footer. But because dial-in is never wired, this cannot be exercised in the real app. |
| 10 | Vitest tests cover thread creation, recipient filtering, session activity | PASS | 8 test files, all green. `direct-thread.recipientKind.test.ts`, `recipients.test.ts`, `sessions.activity.test.ts`, `session-activity-buffer.test.ts`, `useRecipients.test.tsx`, `useSessionActivity.test.tsx`, `RecipientPicker.test.tsx`, `SessionActivityPanel.test.tsx`. |
| 11 | Playwright E2E tests specified | PARTIAL | Test files exist (`q1-new-dm-thread.spec.ts`, `q1-session-dial-in.spec.ts`). But 5 of the Q1 tests fail because the integration does not exist. Several tests use `.catch(() => {})` to swallow assertion failures, making them pass-by-default. |
| 12 | `bun run check` + `bun run lint` + `bun run test` all green | PASS | check: 0 errors. lint: 0 errors. test: all pass. E2E fails (30 total, ~25 pre-existing, 5 Q1-specific). |

---

## Findings by Lens

### 1. Architecture Lens

**F-ARCH-1: 7 of 19 architecture tasks unimplemented (BLOCKING)**

The architecture plan defines 19 ordered tasks. The following were not delivered:

- **Task 5** (session event forwarding in WsBroadcaster) -- `packages/server/src/services/ws-broadcaster.ts` was not modified. No `session:*` topic forwarding.
- **Task 8** (integrate RecipientPicker into AppShell submenu) -- `packages/web/src/layouts/AppShell.tsx` was not modified.
- **Task 9** (wire thread creation from picker) -- depends on Task 8, not done.
- **Task 12** (dial-in detection via `useActiveSessionForTask`) -- `packages/web/src/pages/Conversations.tsx` was not modified.
- **Task 13** (companion split layout + dial-in toggle) -- not done.
- **Task 15** (keyboard shortcuts N/D/Escape) -- no keyboard shortcut code added. The architecture plan specifies shortcuts N (new thread), D (dial-in), and Escape (cancel).
- **Task 16** (thread list auto-refresh on `thread_created` WS event) -- `useConversationsThreads.ts` was not modified.

Tasks 14 (session end transition) is partially done (the `useSessionActivity` hook handles it, but the container component in Conversations.tsx was never wired).

**F-ARCH-2: WS authorizer not extended for `session:*` topics (BLOCKING, from Phase 2 binding condition)**

The architecture critique (Phase 2) identified this as a blocking issue. The existing `createDbSubscribeAuthorizer` rejects all topics not in `GLOBAL_TOPICS` and not starting with `thread:`. Without extending it, any `session:*` WebSocket subscription returns `forbidden`. This was flagged as "must fix before implementation" and was not addressed.

**F-ARCH-3: `ActivityEntry.data` uses `Record<string, unknown>` instead of discriminated union (from Phase 2 binding condition)**

Architecture critique item 2: replace `Record<string, unknown>` with a proper discriminated union. Both `packages/server/src/services/session-activity-buffer.ts` (line 20) and `packages/web/src/hooks/useSessionActivity.ts` (line 24) still use `Record<string, unknown>`. The server-side `ActivityEntry.type` is hardcoded to `"tool_call"` only, while the client-side hook accepts `"tool_call" | "reasoning" | "cost_tick"`. The `data` field is untyped in both, requiring unsafe property access (`entry.data.toolName`).

**F-ARCH-4: Server buffer only handles `tool_call` events**

`SessionActivityBuffer` subscribes only to `tool_call_recorded` events. The architecture plan (section 3.2) defines three activity types: `tool_call`, `reasoning`, `cost_tick`. The client-side `SessionActivityPanel` renders all three, but the server only produces `tool_call`. The `reasoning` and `cost_tick` rows (lines 62-82 in SessionActivityPanel.tsx) are dead code until the buffer subscribes to those events.

### 2. Design Lens

**F-DES-1: Companion split layout not implemented**

The approved design (Variant C) specifies a horizontal companion split: left = thread (flex-[3]), right = activity panel (flex-[2]). `Conversations.tsx` was not modified. The `SessionActivityPanel` component exists but is never rendered alongside the thread.

**F-DES-2: "New Thread" button not in submenu**

The approved design specifies a "New Thread" button at top of Conversations submenu. `AppShell.tsx` was not modified.

**F-DES-3: Emoji used as icon (AQ-105 violation)**

`SessionActivityPanel.tsx` line 66 uses `💭` (thought bubble emoji) as the reasoning entry icon. This violates aesthetic rule AQ-105: "No emoji as iconography in Button/NavItem/StatusChip text." The tool_call entry correctly uses an SVG icon; reasoning should do the same.

**F-DES-4: Hardcoded pixel font sizes (AQ-004 concern)**

Both components use numerous `text-[Npx]` classes: `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`. AQ-004 states "No `text-[Npx]` outside the allowlist." Whether these sizes are in the allowlist needs verification, but the density and regularity suggest they should use the type scale tokens or `var(--density-text)`.

**F-DES-5: Auto-scroll pause behavior missing (from Phase 2 binding condition 3)**

The approved design condition 3 states: "Activity stream must pause auto-scroll when user scrolls up manually. Resume on scroll-to-bottom." `SessionActivityPanel.tsx` lines 106-110 unconditionally scroll to bottom on every entry update. No scroll-position detection or pause logic exists.

**F-DES-6: Filter tabs not implemented**

Architecture plan section 4.5 specifies "Filter tabs: DaisyUI `tabs tabs-bordered tabs-xs`. Four tabs: All, Tools, Reasoning, Cost." `SessionActivityPanel.tsx` renders no tabs. All entries are shown unfiltered.

### 3. Security Lens

**F-SEC-1: `getActivity` returns mutable internal reference**

`SessionActivityBuffer.getActivity()` (line 74) returns the internal `bucket` array directly:
```typescript
return this.entries.get(sessionId) ?? [];
```
A caller could `.push()` or `.splice()` the returned array and corrupt the buffer's internal state. The return type is `ActivityEntry[]` (mutable). The architecture plan specified a `ReadonlyArray<ActivityEntry>` return type. Should return `[...bucket]` or change the return type to `ReadonlyArray`.

**F-SEC-2: No rate-limiting on `GET /api/recipients`**

Every POST/PATCH should have rate-limiting per the security lens. While this is a GET endpoint, it performs two database queries on every call (agents + sessions). No caching or rate-limiting is applied. An attacker or misbehaving client could DoS the DB.

**F-SEC-3: `kind` query parameter not validated**

`recipients.ts` line 36-40 checks `if (kind === "user")` but does not reject invalid values. Passing `?kind=invalid` falls through to the agent query. While not exploitable, it silently treats invalid input as "no filter" -- a trust boundary violation.

### 4. Adversarial Lens

**F-ADV-1: E2E tests swallow assertion failures**

Multiple E2E tests use `.catch(() => { /* OK if shortcut isn't implemented yet */ })` patterns:
- `q1-new-dm-thread.spec.ts:225` -- keyboard shortcut test catches and swallows failure
- `q1-session-dial-in.spec.ts:149,164,284` -- dial-in tests catch visibility checks

These tests pass even when the feature they test is completely absent. An E2E test that always passes regardless of implementation proves nothing. This violates the testing rules: "Tests are evidence."

**F-ADV-2: Redundant DB fetch in recipients route**

`recipients.ts` lines 45-55: when `q` is empty, `allAgents` is fetched via `.all()`. When `q` has content, it is fetched again with the LIKE filter, discarding the first result. The first `db.select().from(agents).all()` is wasted when `q` is provided.

**F-ADV-3: No cleanup of stale session buffers**

`SessionActivityBuffer` keeps entries in memory indefinitely for completed sessions. The architecture plan (section 6.1) specifies: "On session_ended: keep buffer for 5 minutes, then evict." The implementation has no eviction logic -- the buffer grows monotonically until server restart.

**F-ADV-4: `useSessionActivity` labels status "streaming" without WebSocket**

The hook transitions to `status: "streaming"` after the initial REST fetch. But the `@lore` comment on line 13-16 acknowledges: "WebSocket subscription for session:<id> is not implemented in Q1." Status "streaming" is misleading when the hook does a single fetch and never receives updates. The status should be "ready" or the WS subscription should be implemented.

### 5. Simplification Lens

**F-SIMP-1: Stories use complex fetch-mocking pattern**

Both `.stories.tsx` files (`RecipientPicker.stories.tsx` lines 58-81, `SessionActivityPanel.stories.tsx` lines 57-78) implement manual `window.fetch` replacement with cleanup. This pattern is repeated and fragile. A shared `useMockFetch` utility or MSW integration would be simpler.

**F-SIMP-2: `createRecipientRoutes` has unnecessary overloads**

`recipients.ts` lines 29-31 declare two overload signatures (`(db, eventBus)` and `(db)`) plus the implementation signature. The `_eventBus` parameter is never used in the function body. A single signature `(db: HyperIdleDb)` would suffice, or the eventBus should be used (perhaps for future WebSocket notifications on recipient status changes).

### 6. AI Slop Lens

**F-SLOP-1: Defensive `.catch(() => {})` in E2E tests is "for now" thinking**

The comment "OK if shortcut isn't implemented yet -- test still documents intent" (q1-new-dm-thread.spec.ts:226) is the textbook "for now" anti-pattern. Tests that document intent but never fail are comments, not tests.

**F-SLOP-2: `waitForFunction(() => true)` as arbitrary delay**

`q1-new-dm-thread.spec.ts:196` and `q1-session-dial-in.spec.ts:224` use `page.waitForFunction(() => true, { timeout: 3000 })` -- a function that immediately resolves to `true`, doing nothing. This is a no-op masquerading as a wait. It should wait for a meaningful condition (e.g., request count > 0) or be removed.

**F-SLOP-3: Verbose JSDoc on internal components**

`RecipientPicker.tsx` line 47-52 has a `@example` JSDoc block for a component that has exactly one call site (AppShell submenu). Single-use internal components do not need usage examples.

---

## Phase 2 Binding Conditions Audit

| Condition | Status | Evidence |
|-----------|--------|----------|
| 1. WebSocket authorizer extended for `session:*` topics | NOT DONE | `ws-broadcaster.ts` not modified. Authorizer not extended. |
| 2. Activity data uses discriminated union | NOT DONE | Both server and client use `Record<string, unknown>`. |
| 3. Landmark roles on companion panes | PARTIAL | `SessionActivityPanel` uses `<aside>` with `aria-label`. But companion panes not wired so left pane has no matching landmark. |
| 4. Auto-scroll pause behavior | NOT DONE | `SessionActivityPanel` scrolls to bottom unconditionally. No pause-on-user-scroll. |
| 5. Keyboard shortcut D must not fire inside text inputs | NOT DONE | No keyboard shortcuts were implemented at all (Task 15 missing). |

---

## Issues the Builder Must Address

### Blocking (must fix for DONE)

1. **Wire RecipientPicker into AppShell.** Modify `packages/web/src/layouts/AppShell.tsx` per Task 8: add "New Thread" button to Conversations submenu, manage `showRecipientPicker` state, render `<RecipientPicker>` replacing `<ThreadSections>` when active. Wire `onSelect` to navigate to new thread (Task 9).

2. **Wire companion split into Conversations.** Modify `packages/web/src/pages/Conversations.tsx` per Tasks 12-14: add `useActiveSessionForTask` detection, "Dial In" button, companion flexbox split with `SessionActivityPanel`.

3. **Add session event forwarding to WsBroadcaster.** Modify `packages/server/src/services/ws-broadcaster.ts` per Task 5: forward `session_started`, `session_ended`, `tool_call_recorded` to `session:<id>` topic.

4. **Extend WS authorizer for `session:*` topics.** The existing `createDbSubscribeAuthorizer` must allow `session:*` subscriptions.

5. **Implement WebSocket subscription in `useSessionActivity`.** The hook claims "streaming" status but only does a single REST fetch. Either implement the WS subscription or change status to "loaded" with a documented follow-up.

6. **Add thread list auto-refresh on `thread_created` WS event.** Modify `packages/web/src/hooks/useConversationsThreads.ts` per Task 16.

7. **Add keyboard shortcuts N, D, Escape.** Per Task 15 and design condition 4. The D shortcut must not fire inside text inputs (event.target check).

8. **Fix Q1 E2E tests.** Remove all `.catch(() => {})` wrappers. Tests must fail when the feature they test is absent. After integration is wired, the tests should pass without catch-swallowing.

### Non-Blocking (should fix)

9. **Replace `Record<string, unknown>` with discriminated union** on `ActivityEntry.data` in both server and client.

10. **Add auto-scroll pause behavior** (design condition 3).

11. **Add filter tabs** (All / Tools / Reasoning / Cost) to `SessionActivityPanel`.

12. **Replace emoji icon** (💭) with SVG icon in `SessionActivityPanel.tsx` line 66.

13. **Fix redundant DB fetch** in `recipients.ts` (remove the unconditional `db.select().from(agents).all()` on line 45 when `q` is provided).

14. **Add session buffer eviction** (5-minute TTL after session ends, per architecture plan section 6.1).

15. **Return defensive copy** from `SessionActivityBuffer.getActivity()` to prevent internal state mutation.

16. **Remove `waitForFunction(() => true)` no-ops** from E2E tests.
