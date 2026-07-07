# Usability Requirements

Behavioral UX requirements for the human interface. Shell structure and page layouts live in [information-architecture](../information-architecture/index.md); primitive semantics live in [human-interface-layer](../human-interface-layer/index.md). Requirements here are testable outcome statements.

## UX-1: One App, One Door

**UX-1.1** The desktop app is a single Electron window with two persistent zones: a Sidebar (left, 200px fixed width, three labeled sections — Conversations, Work, Knowledge — `packages/web/src/shell/Sidebar.tsx`) and a Main pane showing the active view. Exactly three views exist: `conversations | work | knowledge` (`shell-types.ts:4`). Shell layout detail: [app-shell](../information-architecture/app-shell-always-present.md).

**UX-1.2** Ambient state is embedded within each view — filter chips, health indicators, badges. Notification inbox is a Sidebar-anchored popover (`packages/web/src/shell/NotificationPopover.tsx`: unseen dots clear on open, per-type mute, dismiss); there is no top-bar bell or global toast stream. Ambient indicators may change color, count, or animate — they cannot demand attention. Anything that needs attention routes to Conversations.

**UX-1.3** First run: the SetupFlow page guides profile creation and setup (`packages/web/src/pages/SetupFlow.tsx`, `FirstRunRedirect.tsx`); contextual hints (`packages/shared/src/hint.ts`) appear at key first-time moments.

**UX-1.4** Delivery posture (desktop-first, no native mobile, no offline): see [architecture/system-overview](../architecture/system-overview.md).

## UX-2: One Interaction Grammar

**UX-2.1** The threading UI is built once and reused across every host — review items, chat items, the assistant thread, agent-to-agent threads the human is copied on (`packages/web/src/components/ConversationSurface.tsx`).

**UX-2.2** Review verdicts use the five-decision grammar — approve, approve-with-comments, request-changes, edit, reject (`packages/shared/src/thread.ts:34-40`). Full grammar: [thread-primitive](../human-interface-layer/thread-primitive.md).

**UX-2.3** The assistant is just another agent — communicated with through normal threads, no special UI surface beyond the overlay entry point.

**UX-2.4** Every thread item can carry visible `reasoning` — why the agent surfaced this (`packages/db/src/schema.ts:504`). Non-negotiable for trust.

## UX-3: Notification Discipline

Primitive semantics: [notification-primitive](../human-interface-layer/notification-primitive.md).

**UX-3.1** Push notifications fire for high-risk items (`riskTier === "high"`) or any `skill_change` item regardless of risk tier (`packages/fabric/src/services/policy-engine.ts:97-100`). Everything else is silent.

**UX-3.2** Non-urgent items batch into a daily digest (`packages/fabric/src/services/daily-digest.ts`).

**UX-3.3** Notification mute is per-type, global per factory (`packages/fabric/src/services/notifications/mute.ts`). Per-human / per-product quiet hours are not built (future AF15).

## UX-4: Work View

**UX-4.1** The Work view drills down: Work Overview (portfolio) → Team → Bet Detail → Task → session jump-out with outcome, cost, and token chips (`WorkOverview.tsx` → `WorkTeam.tsx` → `WorkBet.tsx` → `WorkTask.tsx`; TaskSheet session section). Breadcrumbs navigate back up.

**UX-4.2** Bet statuses are `draft | active | completed | killed` (`packages/shared/src/types.ts:92`; `at_risk` boolean replaces the old behind sub-state). Lifecycle semantics: [bets-shape-commit-change-ship](../process-layer/bets-shape-commit-change-ship.md).

**UX-4.3** Bet creation is a page (`packages/web/src/pages/WorkBetCreate.tsx`).

**UX-4.4** Team burn is visible in the Team view: cost actual vs. cap and active bets vs. capacity (`WorkTeam.tsx:329`). Cap grammar: [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md).

**UX-4.5** No backlog. Work is a continuous flow — no backlog surface or table exists anywhere.

**UX-4.6** The task view is list-only. Canvas and Kanban surfaces are removed and will not be added (`packages/web/src/shell/TaskSheet.tsx:39-40` — `@lore` U9: Canvas and Kanban components removed).

## UX-5: Knowledge View

**UX-5.1** The Knowledge view has two main surfaces: Curated (active items) and Triage (needs attention, sorted by attention score — [relevance-and-attention](../knowledge-architecture/relevance-and-attention.md)). Items are scoped; the scope enum is owned by [the-canonical-store](../knowledge-architecture/the-canonical-store.md).

**UX-5.2** Supported curation actions: merge, split, archive, inline edit. Merge combines bodies, archives the source, and logs the edit (`packages/server/src/routes/knowledge.ts:684+`, `knowledge_edit_log`). Split promotes a section to a new item.

**UX-5.3** Every knowledge item shows provenance and confidence on its detail page (KnowledgeDetail metadata).

## UX-6: Trust & Cost Transparency

**UX-6.1** Reasoning is visible by default on every surfaced item (UX-2.4).

**UX-6.2** Trust is earned, not assigned: routing uses approval-rate from verdict history × riskTier (AD4, `packages/fabric/src/services/policy-engine.ts`). Surface: [review-primitive](../human-interface-layer/review-primitive.md).

**UX-6.3** Cost transparency: per-routine cost (`costMinor`), per-session cost and token chips, team burn, and cost-sentinel warning/breach events keep spend visible at every level.

## UX-7: App Shell & Navigation

**UX-7.1** Global search (⌘K) with results grouped by type — Threads, Bets, Knowledge (`packages/web/src/hooks/useCommandK.ts`, `GlobalSearchPanel.tsx`).

**UX-7.2** Keyboard shortcuts: ⌘K (search), ⌘[ / ⌘] (history back/forward), ⌘1/2/3 pinned to Conversations/Work/Knowledge. None fire while focus is in an input, textarea, or contentEditable element (`packages/web/src/hooks/useNavShortcuts.ts`).

**UX-7.3** Settings is a stacked single page — all sections visible in one scrollable page, no section sidebar (`packages/web/src/pages/SettingsPage.tsx`). Section inventory: [app-shell](../information-architecture/app-shell-always-present.md).
