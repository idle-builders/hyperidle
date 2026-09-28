/**
 * Conversations page — single detail surface, shape-agnostic.
 *
 * Mounted on:
 *   - /conversations          → no :threadId → State A (empty, open a thread)
 *   - /conversations/:threadId → has :threadId → States B/C/D/E
 *
 * @lore AM1: the populated `ready` state renders the Part-based
 * `<ConversationSurface>` (header · author-grouped Part column · unified-"+"
 * composer). `ThreadShell`/`RichMessageCard`/inline-verdict are GONE from the
 * conversation — HyperIdle ships as versioned desktop releases, so the new
 * surface BECOMES the conversation (no flag, no live cutover). The page derives
 * `Part[]` via `derivePartsFromMessages` (the only Message-aware seam) and routes
 * references through `createOpenHandler` (the OpenTarget → navigate seam).
 *
 * @lore AM1: the conversation no longer TAKES a verdict. An unresolved review
 * renders as a `review` Part with a single "Open review" hook → the real
 * ReviewPage (`/reviews/:reviewId` — flattened from
 * `/work/bet/:betId/review/:reviewId`); a resolved review echoes as a
 * `resolved` Part. The decision UI lives on the review page (design §5). The
 * verdict SEMANTICS (Message type, payload, verdictDecisionLabel, POST shape) are
 * unchanged — only the decision UI relocated.
 *
 * @lore L9: there are exactly five states (A–E). State E ("Thread not found")
 * does NOT mount ConversationSurface — no message list, no composer.
 *
 * @lore BC3: Dial-in (the "Dial In" button opening a session-activity split)
 * is gone. It was reachable only for task-hosted threads, and that host kind
 * no longer exists (a task's own thread is `team`-hosted — architecture.md
 * §3.9). The task page shows a task's own active sessions directly; nothing
 * replaces this affordance here.
 */

import { TASK_STATE_LABEL, type TaskListItem, type ThreadView } from "@hyperidle/domain-model";
import { type JSX, useCallback, useContext, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ChildDocumentsSection } from "../components/ChildDocumentsSection";
import ConversationSurface, {
	type ConversationSurfaceParticipant,
} from "../components/ConversationSurface";
import type { PartAuthor } from "../components/parts";
import { derivePartsFromMessages } from "../components/parts";
import { SessionView } from "../components/SessionView";
import type { ConversationsFilter } from "../components/ThreadSections";
import { ThreadSections } from "../components/ThreadSections";
import {
	Breadcrumb,
	Button,
	EmptyState,
	ErrorState,
	PageHeader,
	PageScaffold,
	SkeletonList,
	SplitView,
} from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { type SessionSummary, useSessionActivity } from "../hooks/useSessionActivity";
import { useThread } from "../hooks/useThread.js";
import { useThreadTasks } from "../hooks/useThreadTasks.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import type { AppShellOutletContext } from "../layouts/AppShell";
import { call } from "../services/call.js";
import { resolveHostRoute } from "../services/host-route.js";
import { createOpenHandler } from "../services/open-handler.js";
import { ToastContext } from "../shell/ToastRegion";
import { DocumentDetail } from "./DocumentDetail.js";
import { ReviewPage } from "./review/ReviewPage.js";

// ---------------------------------------------------------------------------
// Blocking/Unread chip bar removed from Conversations page — neither chip
// matched real state. The blocking/unread fields remain on ThreadItem.

/**
 * Map `open_thread`'s `members` (an Identity[]) into the source-agnostic
 * `PartAuthor[]` the `derivePartsFromMessages` adapter consumes. `isMe` marks
 * the viewer's own messages (the "You" label + own-message styling).
 */
function identitiesToAuthors(
	members: ThreadView["members"],
	viewerId: string,
): ReadonlyArray<PartAuthor> {
	return members.map((identity) => ({
		id: identity.id,
		name: identity.name,
		isAgent: identity.isAgent,
		isMe: identity.id === viewerId,
	}));
}

/** Header participant chips for the ConversationSurface AvatarGroup. */
function identitiesToParticipants(
	members: ThreadView["members"],
): ReadonlyArray<ConversationSurfaceParticipant> {
	return members.map((identity) => ({
		id: identity.id,
		name: identity.name,
		isAgent: identity.isAgent,
	}));
}

// ---------------------------------------------------------------------------
// SessionViewPanel — wraps useSessionActivity + SessionView.
// Opened by the `session` OpenTarget (session-reference Embed or sub-agent row).
// Placement: right-panel split. The page owns the placement; the session view
// has no route of its own (architecture §entry).
// ---------------------------------------------------------------------------

/**
 * @lore resolve the `PartAuthor` for the agent that ran a session
 * from the session's OWN data only — never from the hosting thread's
 * `hostId`. A thread's host can be a team, a document, a user or an
 * agent; only in the agent case would `hostId` even happen to name an agent,
 * and it is not necessarily the agent that ran THIS session (e.g. a
 * team-hosted task thread, or sub-agent recursion). `useSessionActivity`'s
 * `summary.agentId` is the one place the session's own agent id surfaces —
 * but by the hook's own contract it stays `null` while the session is still
 * streaming, so there genuinely is no id to show yet. A generic, role-only
 * placeholder is used rather than inventing or reusing an unrelated id.
 */
export function resolveSessionAgentAuthor(
	summary: Pick<SessionSummary, "agentId"> | null,
	identities: Record<string, ThreadView["members"][number]>,
): PartAuthor {
	if (!summary?.agentId) {
		return { id: "", name: "Agent", isAgent: true, isMe: false };
	}
	return {
		id: summary.agentId,
		name: identities[summary.agentId]?.name ?? summary.agentId,
		isAgent: true,
		isMe: false,
	};
}

interface SessionViewPanelProps {
	sessionId: string;
	identities: Record<string, ThreadView["members"][number]>;
	threadTitle: string;
	hostTitle: string;
	viewerId: string;
	viewerName: string;
	onClose: () => void;
	onOpen: import("../components/parts").OpenHandler;
}

function SessionViewPanel({
	sessionId,
	identities,
	threadTitle,
	hostTitle,
	viewerId,
	viewerName,
	onClose,
	onOpen,
}: SessionViewPanelProps): JSX.Element {
	const { entries, status, summary } = useSessionActivity(sessionId);

	const agent: PartAuthor = resolveSessionAgentAuthor(summary, identities);
	const viewer: PartAuthor = {
		id: viewerId,
		name: viewerName,
		isAgent: false,
		isMe: true,
	};

	return (
		<div className="flex flex-col h-full relative">
			<Button
				variant="ghost"
				tone="neutral"
				size="icon"
				onClick={onClose}
				aria-label="Close session view"
				className="absolute top-[9px] right-[12px] z-[1]"
			>
				<svg
					viewBox="0 0 12 12"
					className="h-[11px] w-[11px]"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<path d="M2 2 L10 10 M10 2 L2 10" strokeLinecap="round" />
				</svg>
			</Button>
			<SessionView
				sessionId={sessionId}
				entries={[...entries]}
				identity={{
					agent,
					viewer,
					title: threadTitle,
					host: hostTitle,
				}}
				status={
					status === "connecting"
						? "connecting"
						: status === "streaming"
							? "streaming"
							: status === "error"
								? "error"
								: "ended"
				}
				onOpen={onOpen}
				onSend={() => {
					// Session-from-conversation view: sending is not supported here;
					// use the conversation composer to interact with the agent.
				}}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Detail sub-component (fetches + renders States B–E)
// ---------------------------------------------------------------------------

// L7 contract carried forward into L9: classified failure messages so
// RichMessageCard's error row shows actionable copy; async-ack toast on
// non-resolving commits. See @lore on onAppend below.
const ASYNC_ACK_COPY = "Response recorded — agent will pick it up on next session.";

function InspectDestination({ path }: { path: string }): JSX.Element {
	const [beforeHash, hash = ""] = path.split("#");
	const [pathname, query = ""] = (beforeHash ?? "").split("?");
	const documentMatch = pathname?.match(/^\/documents\/([^/]+)$/);
	if (documentMatch?.[1]) {
		return (
			<DocumentDetail
				overrideDocumentId={documentMatch[1]}
				overrideHash={hash ? `#${hash}` : ""}
				presentation="pane"
			/>
		);
	}
	const review = pathname?.match(/^\/reviews\/([^/]+)$/);
	if (review?.[1]) {
		// The review's threadId rides the query string (part.ts's
		// `ReviewTarget`/open-handler.ts) — `open_thread` needs it directly.
		const threadId = new URLSearchParams(query).get("threadId") ?? undefined;
		return (
			<ReviewPage overrideReviewId={review[1]} overrideThreadId={threadId} presentation="pane" />
		);
	}
	return <EmptyState title="Unavailable" description="This reference cannot be inspected here." />;
}

/**
 * A thread's own tasks, rendered where the old single host-context link
 * to a task used to sit — a thread's `hostKind` is never `task`, so there
 * is no single link, there can be several. Same element (`Link` +
 * `resolveHostRoute`) and same classes as the surviving host-context link
 * (`ConversationSurface.tsx`'s `ConversationHeader`), repeated once per
 * task. Zero tasks renders nothing.
 */
function ThreadTaskLinks({ tasks }: { tasks: readonly TaskListItem[] }): JSX.Element | null {
	if (tasks.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-[9px] mt-[3px]">
			{tasks.map((task) => {
				const route = resolveHostRoute("task", task.id);
				if (!route) return null;
				return (
					<Link
						key={task.id}
						to={route}
						className="type-control truncate text-[var(--text-primary)] hover:text-[var(--accent-deep)] hover:underline"
					>
						{task.title} · {TASK_STATE_LABEL[task.state]}
					</Link>
				);
			})}
		</div>
	);
}

function ConversationsDetail({ threadId }: { threadId: string }): JSX.Element {
	const { status, data, error, refresh: retry } = useThread(threadId);
	const { tasks: threadTasks } = useThreadTasks(threadId);
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	// Viewer identity for own-message ("You") styling in the Part column.
	const { user } = useCurrentUser();
	const viewerId = user?.id ?? "";
	// @lore L9: read ToastContext directly (not useToast) so the page renders
	// in unit tests / Storybook without a <ToastRegion> ancestor. Production
	// always has the provider via AppShell. When absent, async-ack falls back
	// silently — the response still commits, the toast just doesn't fire.
	const toast = useContext(ToastContext);

	// SplitView ratio persistence per surface (hooks must be unconditional)
	const [inspectRatio, setInspectRatio] = useUiPreference("conversation.inspect", 0.6);
	const [inspection, setInspection] = useState<
		{ kind: "session"; sessionId: string } | { kind: "path"; path: string } | null
	>(null);

	// The conversation send path. Sends a `plain` message via
	// `send_message`, then refreshes. The conversation no longer emits a
	// verdict — no verdict send is reachable from here (the decision UI
	// lives on ReviewPage), so the old verdict /
	// head-resolving branch is gone; a plain reply always async-acks.
	const onSend = useCallback(
		async (text: string): Promise<void> => {
			if (!data) return;
			const res = await call("send_message", {
				threadId: data.thread.id,
				text,
				clientKey: crypto.randomUUID(),
			});
			if (!res.ok) {
				throw new Error(res.problems[0]?.message ?? "Failed to send message");
			}
			retry();
			// A plain reply is never a head-resolving event — async-ack the response.
			toast?.showToast(ASYNC_ACK_COPY);
		},
		[data, retry, toast],
	);

	if (status === "loading") {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Conversation" />}
				data-testid="conversations-page"
			>
				<div className="flex flex-col gap-3">
					<SkeletonList rows={3} ariaLabel="Loading thread" />
				</div>
			</PageScaffold>
		);
	}

	if (status === "not-found") {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Conversation" />}
				data-testid="conversations-page"
			>
				<EmptyState
					title="Thread not found"
					description="This thread may have been resolved, archived, or the link is incorrect."
					action={<Link to="/conversations">Back to inbox</Link>}
					dataTestId="thread-not-found"
				/>
			</PageScaffold>
		);
	}

	if (status === "error") {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Conversation" />}
				data-testid="conversations-page"
			>
				<div className="flex flex-col gap-3">
					<ErrorState
						title="Failed to load thread"
						description={error ?? "Unknown error"}
						onRetry={retry}
						dataTestId="thread-error"
					/>
				</div>
			</PageScaffold>
		);
	}

	if (!data) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Conversation" />}
				data-testid="conversations-page"
			>
				{null}
			</PageScaffold>
		);
	}

	// `open_thread`'s `members` replaces the old `identities` map — build the
	// same lookup shape once so the rest of this component reads unchanged.
	const identities: Record<string, ThreadView["members"][number]> = Object.fromEntries(
		data.members.map((m) => [m.id, m]),
	);

	// Derive the render units + header/participants ONCE for both layouts.
	// The conversation column comes from the Part adapter (the only Message-aware
	// seam); the header/participants come from the values the page already has.
	// @lore UI-003: API returns messages DESC (newest-first, dir:"desc"). Reverse
	// to ASC (oldest-first) before the adapter so PartList renders oldest → newest
	// top-to-bottom as expected.
	const parts = derivePartsFromMessages(
		[...data.messages].reverse(),
		viewerId,
		identitiesToAuthors(data.members, viewerId),
	);
	const participants = identitiesToParticipants(data.members);
	// The OpenTarget routing seam. Reference/host navigation flows through the
	// one `OpenHandler` — the same descriptor-driven seam the PartList renderer uses.
	// host targets resolve through resolveHostRoute (total over BlockHostKind);
	// user/factory are documented no-ops. The review route no longer needs a
	// page-sourced betId — `/reviews/:reviewId` resolves for every host, bet or
	// task.
	// OnOpenSession fills the `case "session"` no-op — fires when a
	// `session-reference` Embed or a sub-agent tool row is clicked.
	const openTarget = createOpenHandler(navigate, {
		onInspectPath: (path) => setInspection({ kind: "path", path }),
		onOpenSession: (sessionId) => setInspection({ kind: "session", sessionId }),
	});
	// The thread's OWN title (page heading + breadcrumb leaf): the stored
	// override, else the server's viewer-relative ladder answer
	// (`computedTitle`, never empty). `hostTitle` below is a different thing —
	// the linked HOST object's own title (e.g. a document's), not the
	// thread's — and must not stand in here: it is `null` for every host kind
	// the server doesn't special-case (team included), which is what fell
	// through to the raw host id.
	const threadTitle: string = data.thread.title ?? data.thread.computedTitle;
	const hostRoute = resolveHostRoute(data.thread.hostKind, data.thread.hostId);
	const hostTitle = data.hostTitle ?? identities[data.thread.hostId]?.name ?? data.thread.hostId;
	const header = {
		title: threadTitle,
		hostKind: data.thread.hostKind,
		hostTitle,
		hostRoute,
	};

	const viewerName = identities[viewerId]?.name ?? viewerId;
	const inspectionDestination =
		inspection?.kind === "session" ? (
			<div data-testid="session-view-panel">
				<SessionViewPanel
					sessionId={inspection.sessionId}
					identities={identities}
					threadTitle={header.title}
					hostTitle={header.hostTitle}
					viewerId={viewerId}
					viewerName={viewerName}
					onClose={() => setInspection(null)}
					onOpen={openTarget}
				/>
			</div>
		) : inspection?.kind === "path" ? (
			<InspectDestination path={inspection.path} />
		) : (
			<div />
		);

	return (
		<PageScaffold
			data-testid="conversations-page"
			header={
				// @lore NEW-28: on mobile (sidebarMobile) the breadcrumb is suppressed
				// and the title is hidden md:block, so the <header> would be a 37px
				// empty container if rendered with no visible content. Skip it entirely
				// on mobile. Desktop always renders the full header.
				inspection || sidebarMobile ? undefined : (
					<PageHeader
						title={threadTitle}
						leading={
							<>
								<Breadcrumb
									segments={[
										{ label: "Conversations", to: "/conversations" },
										{ label: threadTitle },
									]}
									LinkComponent={Link}
								/>
								<ThreadTaskLinks tasks={threadTasks} />
							</>
						}
					/>
				)
			}
			body="managed"
		>
			<SplitView
				compact={sidebarMobile}
				originLabel="conversation"
				surfaceKey="conversation.inspect"
				mode={inspection ? "split" : "fold-back"}
				dividerRatio={inspectRatio}
				onRatioChange={setInspectRatio}
				onModeChange={(mode) => {
					if (mode === "fold-back") setInspection(null);
				}}
				origin={
					<ConversationSurface
						parts={parts}
						onOpen={openTarget}
						header={header}
						participants={participants}
						onSend={onSend}
						scroll
						headerPresentation={inspection ? "pane" : "read"}
						produced={
							/*
							 * What was produced in this conversation. A human and an agent
							 * put things here the same way, and this is where they land.
							 *
							 * It goes in the surface's own slot, not after it: rendered as a
							 * sibling it landed BELOW the composer, which reads as though the
							 * conversation carries on past the place you type.
							 *
							 * `onOpen` rather than the section's own split — this page already
							 * owns a SplitView, and opening through its existing `path`
							 * inspection reuses it instead of nesting a second one.
							 */
							<ChildDocumentsSection
								parentKind="thread"
								parentId={threadId}
								heading="Documents"
								emptyDescription="Documents produced in this conversation appear here."
								onOpen={(itemId) => setInspection({ kind: "path", path: `/documents/${itemId}` })}
							/>
						}
					/>
				}
				destination={inspectionDestination}
			/>
		</PageScaffold>
	);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function Conversations(): JSX.Element {
	// @lore L9 WARNING (arch-critique): useParams() inside AppShell's child
	// route receives merged params from the matched child route via React
	// Router v7's param-merge behavior. When mounted at /conversations
	// (no :threadId segment matched), threadId is undefined → State A.
	// When mounted at /conversations/:threadId, threadId is the path segment.
	const { threadId } = useParams<{ threadId?: string }>();

	// @lore U6 AC-16: filter state lives in AppShell and is passed via OutletContext.
	// useOutletContext may return undefined when Conversations is rendered outside
	// AppShell (e.g., tests that mount Conversations directly). Fallback to "all".
	const ctx = useOutletContext<AppShellOutletContext | undefined>();
	const conversationsFilter: ConversationsFilter = ctx?.conversationsFilter ?? "all";
	const onClearFilter = ctx?.onClearFilter ?? (() => undefined);
	// @lore U9 AC-1: onNewThread opens RecipientPicker via AppShell context.
	// Undefined when Conversations is rendered outside AppShell (tests/stories).
	const onNewThread = ctx?.onNewThread;

	// @lore U6 review V1: Thread data is sourced from AppShell's OutletContext
	// (AppShell's single `useThreads` call) — Conversations.tsx never fetches
	// its own copy. Fallback values handle the case where Conversations is
	// rendered outside AppShell (tests that provide a partial context or no
	// context at all).
	const conversationsThreads = {
		threads: ctx?.threads ?? [],
		status: ctx?.threadsStatus ?? ("loading" as const),
		error: ctx?.threadsError ?? null,
		retry: ctx?.onRetryThreads ?? (() => undefined),
	};
	const navigate = useNavigate();

	// ToggleFilter state removed — Blocking/Unread chips never matched
	// real state (neither has a backing concept yet).
	// The header now shows title + New-thread button only.

	const handleSelectThread = useCallback(
		(id: string): void => {
			navigate(`/conversations/${encodeURIComponent(id)}`);
		},
		[navigate],
	);

	if (!threadId) {
		const isEmpty =
			conversationsThreads.threads.length === 0 &&
			conversationsThreads.status !== "loading" &&
			conversationsThreads.status !== "error";

		return (
			<PageScaffold
				frame="page"
				data-testid="conversations-page"
				header={
					/* PageHeader — Conversations title + New thread button in actions.
					 * Button sits in the PageFrame right edge aligned with the content header.
					 * data-conversations-header wrapper preserved for e2e + unit test selectors. */
					<div data-conversations-header>
						<PageHeader
							data-testid="conversations-filter-bar"
							title="Conversations"
							actions={
								isEmpty ? undefined : (
									<Button
										variant="primary"
										size="sm"
										onClick={onNewThread ?? (() => undefined)}
										data-testid="new-thread-btn"
									>
										New thread
									</Button>
								)
							}
						/>
					</div>
				}
			>
				{isEmpty ? (
					// Empty state: centered card matching mockup's .empty-center wrapper.
					// The "New thread" action is inside the EmptyState card (not the header).
					// @lore AZ2: h-full (not flex-1) — this div is now the scroll body's
					// direct child, not a flex item of a flex-col root; h-full resolves
					// against the scroll body's own definite height (same pattern as
					// DocumentList.tsx's systemEmpty branch).
					<div className="flex items-center justify-center p-[48px_24px] h-full">
						<EmptyState
							title="No conversations yet"
							description="Start a thread to coordinate with your team and agents. Conversations are where decisions happen — every message can carry context, artifacts, and actions."
							icon={
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
								</svg>
							}
							action={
								/* Shared Button primitive. */
								<Button
									variant="primary"
									onClick={onNewThread ?? (() => undefined)}
									data-testid="empty-new-thread-btn"
								>
									Start a thread
								</Button>
							}
							dataTestId="thread-sections-empty"
						/>
					</div>
				) : (
					<ThreadSections
						threads={conversationsThreads.threads}
						selectedId={ctx?.selectedThreadId ?? null}
						onSelect={handleSelectThread}
						loading={conversationsThreads.status === "loading"}
						errorMessage={
							conversationsThreads.status === "error"
								? (conversationsThreads.error ?? "Network error")
								: null
						}
						onRetry={conversationsThreads.retry}
						activeFilter={conversationsFilter}
						onClearFilter={onClearFilter}
						groupBySection={false}
					/>
				)}
			</PageScaffold>
		);
	}

	return (
		<div className="flex flex-col h-full" data-testid="conversations-page">
			<ConversationsDetail threadId={threadId} />
		</div>
	);
}
