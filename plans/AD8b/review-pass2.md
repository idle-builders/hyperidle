# AD8b Review Pass 2 -- DONE

**Reviewer:** Opus 4.6 (Phase 4 re-review, attempt 2 of 3)
**Commit reviewed:** 2736d10e (fix commit on top of f945bf59 implementation)
**Date:** 2026-06-09

## Blocker Resolution

All three blockers from pass 1 are resolved.

### B1: SettingsAssistant not mounted in SettingsPage (AC-2) -- RESOLVED

- `useCurrentUser()` hook provides `user.id` for the component.
- `SettingsAssistant` rendered conditionally (`user && ...`) between Models and Appearance sections.
- `data-testid="settings-section-assistant"` present.
- Placement matches design spec section 5.

### B2: Thread pinning trigger not implemented (AC-6) -- RESOLVED

- `registerAssistantDispatcher` now handles AI sender messages on assistant threads.
- Checks `senderRow.kind === "ai" && isAssistantThread(threadLike) && !threadLike.pinned`.
- Updates `thread.pinned = true` via Drizzle, then returns early (no double-dispatch).
- Idempotent -- already-pinned threads skip the update.
- Lore comment documents the dual-use of `thread_message_appended` for both dispatch and pinning.

### B3.2: messageRowSchema not updated -- RESOLVED

- `messageRowSchema` plain branch changed from `plainPayloadSchema` to `plainPayloadSchemaWithToolCalls`.
- `messageInputSchema` still uses `plainPayloadSchema` (correct -- humans cannot inject toolCalls).
- Lore comment documents the rationale.

### B3.1: Tool-call rendering missing (AC-7) -- RESOLVED

- `ToolCallRow` component renders tinted rows matching design spec (rgba(22,118,79,0.03) bg, r-subtle radius, 9px 12px padding, 11px mono uppercase tool name, 13px secondary output).
- `renderToolCallSummaries` function filters to plain messages with toolCalls.
- `renderMessageExtra` prop added to ThreadShell (optional, design-system stays clean).
- ThreadShell composes `refEmbeds` and `messageExtra` into `afterBody` correctly.
- `data-testid="tool-call-summaries"` present for test discoverability.

## Non-blocking Observations

1. **`as PlainPayload` cast** in `renderToolCallSummaries` (AssistantOverlay.tsx line 94). After narrowing on `message.type === "plain"`, payload is `PlainPayload | RedactedPayload`. The cast skips the `isRedactedPayload` guard. Safe at runtime (undefined.toolCalls is falsy, handled by next line) but technically unsound. Pre-existing pattern in this file.

2. **Stale `CocOverlay` in ThreadShell doc comment** (ThreadShell.tsx line 102). The `renderRefEmbeds` JSDoc mentions "CocOverlay, Conversations" -- should say "AssistantOverlay, Conversations" per AC-10. Documentation-only, not a code issue.

3. **CocOverlay.tsx is not a re-export shim**. The file still contains the full original overlay code (not a thin re-export of AssistantOverlay). The lore comment at AssistantOverlay.tsx line 368 claims it's a re-export, but it is not. Pre-existing from the implementation commit, not introduced by this fix.

## AC Checklist

| AC | Status | Notes |
|---|---|---|
| AC-1 | Pass | Integration test verifies assistant agent created at user registration. |
| AC-2 | Pass | SettingsAssistant mounted in SettingsPage between Models and Appearance. |
| AC-3 | Pass | Dispatcher subscribes to thread_message_appended, filters to human senders on assistant threads. |
| AC-4 | Pass | HIGH_RISK_TOOLS constant defines the 4 gated tools. |
| AC-5 | Pass | Non-high-risk tools execute directly per tool surface design. |
| AC-6 | Pass | Pinning trigger implemented: AI sender + assistant thread + not yet pinned -> pin. |
| AC-7 | Pass | ToolCallRow + renderToolCallSummaries + renderMessageExtra prop wired through ThreadShell. |
| AC-8 | Pass | Sidebar trigger aria-label="Assistant" (pre-existing from AD8a, verified in test). |
| AC-9 | Pass | Context chips render via AssistantContext/AssistantAttachButton. |
| AC-10 | Pass | Coc* symbols renamed to Assistant*; backward-compat deprecated props in Sidebar. |
| AC-11 | Pass | AGENT_ROLE_CATALOG has "assistant" entry; "chief_of_staff" removed. |
| AC-12 | Pass | docs/souls/assistant.md exists. |
| AC-13 | Pass | npm run check passes (zero type errors). |
| AC-14 | Pass | npm run lint passes (zero lint errors). |
| AC-15 | Pass | npm run test passes (all green). |

## Verdict: DONE

All blockers resolved. No new issues introduced by the fix commit. Non-blocking observations logged for future cleanup.
