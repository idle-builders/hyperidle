DESIGN-CLASS: routine  ref=Sidebar.knowledgeTriageCount-badge  pattern=none-needed

# AD5 Design Brief

## Classification

Routine. All four UI surfaces are behavioral wiring or deletion, not new shapes:
1. Conversations badge — reuses Y4 Knowledge triage badge pattern verbatim
2. Notification toggle wiring — no visual change, only hook connection
3. Cost display — no UI change, backend data fix
4. Bet pause/resume buttons — deletion

## User Task

A founder glances at the sidebar and sees how many threads need their attention (blocking count badge). They toggle notification preferences and those preferences persist. Cost numbers on the team page show real spend. Buttons that don't work are gone.

## Existing Patterns Referenced

- Y4 Knowledge triage badge: `Sidebar.tsx` lines 292-299
- Toggle component: `@hyperidle/design-system` Toggle
- useSettings hook: `packages/web/src/hooks/useSettings.ts` with `save()` method
- useConversationsThreads: already provides `hasUnresolvedReview` per thread
