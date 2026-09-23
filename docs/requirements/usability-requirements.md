# Usability Requirements

Behavioral UX requirements for the human interface. Shell structure and page layouts live in [information-architecture](../information-architecture/index.md); primitive semantics live in [human-interface-layer](../human-interface-layer/index.md). Requirements here are testable outcome statements.

## UX-1: One App, One Door

**UX-1.1** The desktop app is a single Electron window with two persistent zones: a Sidebar (left, 276px fixed width) and a Main pane showing the active view. The Sidebar exposes Notifications plus the three selectable domains `conversations | work | knowledge`; on phone the same 300px composition is hidden behind Menu. Shell layout detail: [app-shell](../information-architecture/app-shell-always-present.md).

**UX-1.2** Ambient state is embedded within each view — filter chips, health indicators, badges. The notification inbox is a Sidebar-anchored popover (`layers/core-ui/src/shell/NotificationPopover.tsx`: unseen dots clear on open, dismiss marks a row read); there is no top-bar bell or global toast stream. Ambient indicators may change color, count, or animate — they cannot demand attention. Anything that needs attention routes to Conversations.

**UX-1.3** First run: the SetupFlow page guides profile creation and setup (`layers/core-ui/src/pages/SetupFlow.tsx`, `FirstRunRedirect.tsx`); contextual hints (`framework/domain-model/src/hint.ts`) appear at key first-time moments.

**UX-1.4** Delivery posture (desktop-first, no native mobile, no offline): see [architecture/system-overview](../architecture/system-overview.md).

## UX-2: One Interaction Grammar

**UX-2.1** The threading UI is built once and reused across every host — review items, chat items, the assistant thread, agent-to-agent threads the human is copied on (`layers/core-ui/src/components/ConversationSurface.tsx`).

**UX-2.2** Review verdicts use the five-decision grammar — approve, approve-with-comments, request-changes, edit, reject (`framework/domain-model/src/thread.ts`). Full grammar: [thread-primitive](../human-interface-layer/thread-primitive.md).

**UX-2.3** The assistant is just another agent — communicated with through normal threads, no special UI surface beyond the overlay entry point.

**UX-2.4** Every thread item can carry visible `reasoning` — why the agent surfaced this (`framework/db/src/schema.ts`). Non-negotiable for trust.

## UX-3: Notification Discipline

Primitive semantics: [notification-primitive](../human-interface-layer/notification-primitive.md).

**UX-3.1** A row lands the moment its subscribed event fires — there is no urgency tier and no digest; the popover's unseen dot is the only signal.

**UX-3.2** Rows are cleared two ways: read (click-through or dismiss, per row) or the 30-day retention sweep. There is no batching.

**UX-3.3** Subscribing is per-user and per-event (Settings → Notifications), not a factory-wide mute. Quiet hours are not built.

## UX-4: Work View

**UX-4.1** The Work view drills down: Work Overview (portfolio) → Team → Task Detail, with subtasks nested to any depth on the task page (`WorkOverview.tsx` → `WorkTeam.tsx` → `WorkTask.tsx`). Breadcrumbs navigate back up the full ancestor chain. Layout detail: [information-architecture/work-view.md](../information-architecture/work-view.md).

**UX-4.2** Task states are `proposed | accepted | hold | in_progress | blocked | review | done | killed` (`framework/domain-model/src/types.ts`). One vocabulary at every depth — a root task is `in_progress`, not "active". Lifecycle semantics: [tasks-and-sessions](../process-layer/tasks-and-sessions.md).

**UX-4.3** Task creation is a full page (`layers/core-ui/src/pages/WorkTaskCreate.tsx`). A `parentTaskId` query param pre-selects the parent when creating a subtask.

**UX-4.4** In-progress task count is visible in the Team view (`WorkTeam.tsx`), counted at every depth of the task tree. There is no capacity ceiling to burn against.

**UX-4.5** No backlog. Work is a continuous flow — no backlog surface or table exists anywhere.

**UX-4.6** The task view is list-only. Canvas and Kanban surfaces are removed and will not be added (`layers/core-ui/src/pages/WorkTask.tsx`).

## UX-5: Knowledge View

**UX-5.1** The Knowledge view has two main surfaces: Curated (active documents, a nestable tree) and Triage (`proposed` documents, plain recency order — there is no attention score any more). Documents are scoped; the scope enum is owned by [the-canonical-store](../knowledge-architecture/the-canonical-store.md).

**UX-5.2** Supported curation actions: archive, inline edit (`edit_document`). There is no merge or split action, in the UI or the API — a document is combined or divided by editing its body directly.

**UX-5.3** A document's detail page shows its status, scope, where it sits in the tree, and its usage — how many times it has been opened and when, how many session assemblies have handed it to an agent and when (`DocumentDetail.tsx`).

## UX-6: Trust & Usage Transparency

**UX-6.1** Reasoning is visible by default on every surfaced item (UX-2.4).

**UX-6.2** Trust is earned, not assigned, and shown rather than enforced: approval rate from verdict history (AD4, `layers/core-api/policy/src/approval-rate.ts`) renders on the agent's profile; every review still waits for a human's own verdict. Surface: [review-primitive](../human-interface-layer/review-primitive.md).

**UX-6.3** Usage transparency: per-session token chips and the team's in-progress task count keep work visible at every level.

## UX-7: App Shell & Navigation

**UX-7.1** Global search (⌘K) with results grouped by type — Threads, Tasks, Knowledge (`layers/core-ui/src/hooks/useCommandK.ts`, `GlobalSearchPanel.tsx`).

**UX-7.2** Keyboard shortcuts: ⌘K (search), ⌘[ / ⌘] (history back/forward), ⌘1/2/3 pinned to Conversations/Work/Knowledge. None fire while focus is in an input, textarea, or contentEditable element (`layers/core-ui/src/hooks/useNavShortcuts.ts`).

**UX-7.3** Settings is a stacked single page — all sections visible in one scrollable page, no section sidebar (`layers/core-ui/src/pages/SettingsPage.tsx`). Section inventory: [app-shell](../information-architecture/app-shell-always-present.md).
