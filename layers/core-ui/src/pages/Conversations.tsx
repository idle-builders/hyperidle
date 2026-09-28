import { TASK_STATE_LABEL, type TaskListItem, type ThreadView } from "@hyperidle/domain-model";
import { type JSX, useCallback, useContext, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArtifactSection } from "../components/ArtifactSection";
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

function identitiesToParticipants(
	members: ThreadView["members"],
): ReadonlyArray<ConversationSurfaceParticipant> {
	return members.map((identity) => ({
		id: identity.id,
		name: identity.name,
		isAgent: identity.isAgent,
	}));
}

// @lore: resolveSessionAgentAuthor — never uses thread hostId; host can be team/doc/user/agent; summary.agentId null while streaming → generic placeholder
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

// @lore: thread tasks — hostKind is never "task"; a thread can have multiple tasks; renders once per task, zero renders nothing
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
	const { user } = useCurrentUser();
	const viewerId = user?.id ?? "";
	// @lore: ToastContext — read directly (not useToast) so page renders in tests/Storybook without ToastRegion; absent = toast silent, response still commits
	const toast = useContext(ToastContext);

	// hooks must be unconditional — ratio state declared before early returns
	const [inspectRatio, setInspectRatio] = useUiPreference("conversation.inspect", 0.6);
	const [inspection, setInspection] = useState<
		{ kind: "session"; sessionId: string } | { kind: "path"; path: string } | null
	>(null);

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

	const identities: Record<string, ThreadView["members"][number]> = Object.fromEntries(
		data.members.map((m) => [m.id, m]),
	);

	// @lore: messages DESC → ASC — API returns newest-first; reversed before Part adapter so PartList renders oldest→newest top-to-bottom
	const parts = derivePartsFromMessages(
		[...data.messages].reverse(),
		viewerId,
		identitiesToAuthors(data.members, viewerId),
	);
	const participants = identitiesToParticipants(data.members);
	const openTarget = createOpenHandler(navigate, {
		onInspectPath: (path) => setInspection({ kind: "path", path }),
		onOpenSession: (sessionId) => setInspection({ kind: "session", sessionId }),
	});
	// @lore: threadTitle vs hostTitle — thread's own stored/computed title; hostTitle is the linked host object's title, null for unspecial-cased host kinds
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
				// @lore: header skip on mobile — breadcrumb suppressed + title hidden on mobile; <header> would be an empty 37px container; skip entirely
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
							// @lore: produced slot — must go in surface's own slot, not as sibling; sibling renders below the composer which reads as conversation continuing past the input
							<ArtifactSection
								parentKind="thread"
								parentId={threadId}
								heading="Artifacts"
								emptyDescription="Artifacts produced in this conversation appear here."
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
	const { threadId } = useParams<{ threadId?: string }>();

	// @lore: OutletContext — undefined when Conversations renders outside AppShell (tests); filter falls back to "all"
	const ctx = useOutletContext<AppShellOutletContext | undefined>();
	const conversationsFilter: ConversationsFilter = ctx?.conversationsFilter ?? "all";
	const onClearFilter = ctx?.onClearFilter ?? (() => undefined);
	const onNewThread = ctx?.onNewThread;

	// @lore: threads — sourced from AppShell's OutletContext (single useThreads call); never fetched independently; fallback values for tests outside AppShell
	const conversationsThreads = {
		threads: ctx?.threads ?? [],
		status: ctx?.threadsStatus ?? ("loading" as const),
		error: ctx?.threadsError ?? null,
		retry: ctx?.onRetryThreads ?? (() => undefined),
	};
	const navigate = useNavigate();

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
					// @lore: h-full — scroll body's direct child, not flex item; h-full resolves against scroll body's definite height
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
