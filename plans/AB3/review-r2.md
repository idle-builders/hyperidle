# AB3 Code Review -- Round 2 (Re-review)

**Workpackage:** AB3 -- Agent Configuration & Customization
**Reviewer:** Phase 4 (re-review of fix commit `74f2bc7d`)
**Verdict:** DONE

---

## Finding Disposition

### CRITICAL-1: Nested `<button>` inside `<button>` in AgentCard -- RESOLVED

The outer `<button>` is now `<div role="button" tabIndex={0}>` with an `onKeyDown` handler that fires `onCustomize()` on Enter/Space. The inner "Customize" `<Button>` remains a real `<button>`. This eliminates the invalid HTML nesting while preserving keyboard accessibility. The biome-ignore comment (`lint/a11y/useSemanticElements`) is properly justified. `cursor-pointer` was added to compensate for the loss of the native button cursor.

### CRITICAL-2: Dialog stories crash in design system viewer -- RESOLVED

Both `AgentEditDialog.stories.tsx` and `AgentAddDialog.stories.tsx` now wrap every story in a local `<WithToast>` component that renders `<ToastRegion>`. All four edit dialog stories (TeamAgent, StrategyAgent, NoSoul, Closed) and both add dialog stories (Open, Closed) are wrapped. Lore comments explain why.

### WARNING-1: AgentEditDialog always mounted -- RESOLVED

`WorkTeam.tsx` now conditionally mounts `AgentEditDialog` with `{editingAgentId !== null && <AgentEditDialog ... />}`, matching the `AgentAddDialog` pattern. The lore comment in `WorkProduct.test.tsx` was updated to reflect that dialogs are now conditionally mounted, while keeping the `useToast` mock as a safety net.

### WARNING-2: Test fixtures missing `agentCategory` -- RESOLVED

Both roster members in `MOCK_PRODUCT_DETAIL` in `WorkProduct.test.tsx` now include `agentCategory: "team"`. The fixture is structurally consistent with the `RosterMember` type.

### WARNING-3: No AbortController on edit dialog template fetch -- RESOLVED

`AgentEditDialog.tsx` now uses a `templateFetchAbortRef` (useRef) pattern. Before each template fetch, any in-flight request is aborted. The `AbortError` is caught and silently returned. The ref is cleaned up in the `finally` block when the controller matches the current ref.

### WARNING-4: Motion tokens -- RESOLVED

Both `AgentCard` and `BetRow` now use `duration-[var(--motion-fast)]` alongside `transition-colors`, satisfying AQ-013.

---

## New Issues Introduced by Fixes

None. The fix commit is clean and surgical. No new files, no new patterns, no regressions.

---

## Verification

| Check | Result |
|-------|--------|
| `npm run check` | Zero type errors |
| `npm run lint` | Zero lint errors (pre-existing warnings only) |
| AB3 tests (23) | All pass |
| WorkProduct tests (12) | All pass |
| Server agent tests (35) | All pass |

---

## AC Status (unchanged from R1)

| AC | Status |
|----|--------|
| AC-1: Agent cards with name, description, category tags | PASS |
| AC-2: Soul edit through guided flow | PASS |
| AC-3: Edit flow respects categories | PASS |
| AC-4: Harness and model tier adjustable | PASS |
| AC-5: Add fully custom agent | PASS |
| AC-6: First-time hint | PASS |

---

## Verdict: DONE

All critical findings resolved. All warnings addressed. No regressions. Tests green.
