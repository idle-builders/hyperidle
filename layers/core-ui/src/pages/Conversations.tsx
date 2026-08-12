/**
 * Conversations page — L9 / AM1: single detail surface, shape-agnostic.
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
 * ReviewPage (`/work/bet/:betId/review/:reviewId`); a resolved review echoes as a
 * `resolved` Part. The decision UI lives on the review page (design §5). The
 * verdict SEMANTICS (Message type, payload, verdictDecisionLabel, POST shape) are
 * unchanged — only the decision UI relocated.
 *
 * @lore L9: there are exactly five states (A–E). State E ("Thread not found")
 * does NOT mount ConversationSurface — no message list, no composer.
 *
 * @lore Q1: Dial-in support retained. A task-hosted thread with an active session
 * shows a "Dial In" button; clicking it opens the companion split: the
 * ConversationSurface on the left, SessionActivityPanel on the right.
 */

import type { PartAuthor } from "@hyperidle/conversation-parts";
import { derivePartsFromMessages } from "@hyperidle/conversation-parts";
import {
	Button,
	EmptyState,
	ErrorState,
	PageHeader,
	PageScaffold,
	SkeletonList,
	SplitView,
} from "@hyperidle/design-system";
import { type JSX, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import ConversationSurface, {
	type ConversationSurfaceParticipant,
} from "../components/ConversationSurface";
import { SessionActivityPanel } from "../components/SessionActivityPanel";
import { SessionView } from "../components/SessionView";
import type { ConversationsFilter } from "../components/ThreadSections";
import { ThreadSections } from "../components/ThreadSections";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useHint } from "../hooks/useHints";
import { useSessionActivity } from "../hooks/useSessionActivity";
import type { ThreadDetail } from "../hooks/useThreadDetail";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { useUiPreference } from "../hooks/useUiPreference.js";
import type { AppShellOutletContext } from "../layouts/AppShell";
import { apiFetch } from "../services/api-fetch.js";
import { resolveHostRoute } from "../services/host-route.js";
import { createOpenHandler } from "../services/open-handler.js";
import { ToastContext } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// AF14 AC4: Blocking/Unread chip bar removed from Conversations page — neither chip
// matched real state. The blocking/unread fields remain on ThreadItem for AF7 forward-compat.

/**
 * AM1: map the thread-detail identities into the source-agnostic `PartAuthor[]`
 * the `derivePartsFromMessages` adapter consumes. `isMe` marks the viewer's own
 * messages (the "You" label + own-message styling). No new fetch — the same
 * `data.identities` from `useThreadDetail`.
 */
function identitiesToAuthors(
	identities: ThreadDetail["identities"],
	viewerId: string,
): ReadonlyArray<PartAuthor> {
	return Object.entries(identities).map(([id, identity]) => ({
		id,
		name: identity.name,
		isAgent: identity.isAgent === true || identity.role === "agent",
		isMe: id === viewerId,
	}));
}

/** AM1: header participant chips for the ConversationSurface AvatarGroup. */
function identitiesToParticipants(
	identities: ThreadDetail["identities"],
): ReadonlyArray<ConversationSurfaceParticipant> {
	return Object.entries(identities).map(([id, identity]) => ({
		id,
		name: identity.name,
		isAgent: identity.isAgent === true || identity.role === "agent",
	}));
}

// ---------------------------------------------------------------------------
// useActiveSessionForTask — Q1 §4.6
// Fetches GET /api/sessions?task_id=<taskId>&state=active.
// Returns the first active session for the task, or null.
// ---------------------------------------------------------------------------

interface ActiveSession {
	id: string;
	agentId: string;
	taskId: string;
	state: string;
	startedAt: string;
	modelTier: string;
}

interface UseActiveSessionResult {
	activeSession: ActiveSession | null;
	loading: boolean;
}

async function fetchActiveSession(
	taskId: string,
	signal: AbortSignal,
): Promise<ActiveSession | null> {
	const url = `/api/sessions?task_id=${encodeURIComponent(taskId)}&state=active`;
	const res = await apiFetch(url, { signal });
	if (signal.aborted || !res.ok) return null;
	const body = (await res.json()) as unknown;
	if (signal.aborted) return null;
	const sessions = Array.isArray(body) ? (body as ActiveSession[]) : [];
	return sessions.length > 0 ? (sessions[0] ?? null) : null;
}

function useActiveSessionForTask(taskId: string | null): UseActiveSessionResult {
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!taskId) {
			setActiveSession(null);
			return;
		}

		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setLoading(true);

		fetchActiveSession(taskId, ac.signal)
			.then((session) => {
				if (ac.signal.aborted) return;
				setActiveSession(session);
				setLoading(false);
			})
			.catch((cause) => {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setActiveSession(null);
				setLoading(false);
			});

		return () => {
			ac.abort();
		};
	}, [taskId]);

	return { activeSession, loading };
}

// ---------------------------------------------------------------------------
// AM3: SessionViewPanel — wraps useSessionActivity + SessionView.
// Opened by the `session` OpenTarget (session-reference Embed or sub-agent row).
// Placement: right-panel split (same pattern as dial-in). The page owns the
// placement; the session view has no route of its own (architecture §entry).
// ---------------------------------------------------------------------------

interface SessionViewPanelProps {
	sessionId: string;
	agentName: string;
	agentId: string;
	threadTitle: string;
	hostTitle: string;
	viewerId: string;
	viewerName: string;
	onClose: () => void;
	onOpen: import("@hyperidle/conversation-parts").OpenHandler;
}

function SessionViewPanel({
	sessionId,
	agentName,
	agentId,
	threadTitle,
	hostTitle,
	viewerId,
	viewerName,
	onClose,
	onOpen,
}: SessionViewPanelProps): JSX.Element {
	const { entries, status } = useSessionActivity(sessionId);

	const agent: import("@hyperidle/conversation-parts").PartAuthor = {
		id: agentId,
		name: agentName,
		isAgent: true,
		isMe: false,
	};
	const viewer: import("@hyperidle/conversation-parts").PartAuthor = {
		id: viewerId,
		name: viewerName,
		isAgent: false,
		isMe: true,
	};

	return (
		<div className="flex flex-col h-full relative">
			<button
				type="button"
				onClick={onClose}
				aria-label="Close session view"
				className="absolute top-[9px] right-[12px] z-[1] rounded-[var(--r-subtle)] p-[6px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
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
			</button>
			<SessionView
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

function classifyHttpError(status: number): string {
	if (status >= 500) {
		return "Server couldn't record this response. Try again?";
	}
	return `Couldn't record response (HTTP ${status}).`;
}

function ConversationsDetail({ threadId }: { threadId: string }): JSX.Element {
	const { status, data, error, retry } = useThreadDetail(threadId);
	const navigate = useNavigate();
	// AM1: viewer identity for own-message ("You") styling in the Part column.
	const { user } = useCurrentUser();
	const viewerId = user?.id ?? "";
	const hintReviewVerdict = useHint("review-verdict");
	// @lore L9: read ToastContext directly (not useToast) so the page renders
	// in unit tests / Storybook without a <ToastRegion> ancestor. Production
	// always has the provider via AppShell. When absent, async-ack falls back
	// silently — the response still commits, the toast just doesn't fire.
	const toast = useContext(ToastContext);

	// AM5 T6: SplitView ratio persistence per surface (hooks must be unconditional)
	const [dialInRatio, setDialInRatio] = useUiPreference("conversation.dial-in", 0.6);
	const [sessionRatio, setSessionRatio] = useUiPreference("conversation.session", 0.6);

	// Q1 §4.6: dial-in state
	const [dialInSessionId, setDialInSessionId] = useState<string | null>(null);

	// AM3: session-reference open state — fired by the `session` OpenTarget when a
	// `session-reference` Embed is clicked in the conversation. The page owns the
	// placement (a right-panel split, consistent with dial-in). A sub-agent tool row
	// fires the SAME open seam → the same surface, recursed.
	const [openedSessionId, setOpenedSessionId] = useState<string | null>(null);

	// Q1 §4.6: check for active session when viewing a task-hosted thread
	const taskId = data?.thread.hostKind === "task" ? (data.thread.hostId ?? null) : null;
	const { activeSession } = useActiveSessionForTask(taskId);

	// Q1 Task 15 / review issue #7: keyboard shortcut D toggles dial-in
	// when the active session badge is visible. Must not fire in text inputs.
	useEffect(() => {
		if (!activeSession) return;
		const handler = (e: KeyboardEvent): void => {
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || target.isContentEditable) {
					return;
				}
			}
			if (e.key === "d" || e.key === "D") {
				e.preventDefault();
				setDialInSessionId((prev) => (prev ? null : (activeSession.id ?? null)));
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [activeSession]);

	// AM1: the conversation send path. POSTs a `plain` message via the existing
	// `/api/threads/:id/messages` endpoint (unchanged), then refreshes. The
	// conversation no longer emits a verdict — no verdict POST is reachable from
	// here (the decision UI relocated to ReviewPage, design §5), so the old
	// verdict / head-resolving branch is gone; a plain reply always async-acks.
	const onSend = useCallback(
		async (text: string): Promise<void> => {
			if (!data) return;
			const res = await apiFetch(`/api/threads/${data.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "plain",
					payload: { text, refs: [] },
					clientKey: crypto.randomUUID(),
				}),
			});
			if (!res.ok) {
				throw new Error(classifyHttpError(res.status));
			}
			retry();
			// A plain reply is never a head-resolving event — async-ack the response.
			toast?.showToast(ASYNC_ACK_COPY);
		},
		[data, retry, toast],
	);

	if (status === "loading") {
		return (
			<PageScaffold data-testid="conversations-page">
				<div className="flex flex-col gap-3">
					<SkeletonList rows={3} ariaLabel="Loading thread" />
				</div>
			</PageScaffold>
		);
	}

	if (status === "not-found") {
		return (
			<PageScaffold data-testid="conversations-page">
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
			<PageScaffold data-testid="conversations-page">
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
		return <div className="h-full" data-testid="conversations-page" />;
	}

	// Q1 §4.6: "Dial in" button — secondary style with pulsing live dot.
	// Only shown for task threads with an active session.
	// hearth-internal-padding
	const dialInButton =
		activeSession && !dialInSessionId ? (
			/* AI5: shared Button primitive (secondary). The live-pulse dot is one of
			   the 3 AC3-allowlisted animate-pulse survivors and is preserved. */
			<Button
				variant="secondary"
				size="sm"
				onClick={() => setDialInSessionId(activeSession.id)}
				data-testid="dial-in-btn"
			>
				<span
					aria-hidden="true"
					className="w-[6px] h-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] animate-pulse shrink-0"
				/>
				<span
					className="sr-only"
					role="status"
					aria-label="Live session"
					data-testid="live-session-badge"
				/>
				Dial in
			</Button>
		) : null;

	// AM1: derive the render units + header/participants ONCE for both layouts.
	// The conversation column comes from the Part adapter (the only Message-aware
	// seam); the header/participants come from the values the page already has.
	const parts = derivePartsFromMessages(
		data.messages,
		viewerId,
		identitiesToAuthors(data.identities, viewerId),
	);
	const participants = identitiesToParticipants(data.identities);
	// AM1 ARCH-1: the review route needs a betId the source-agnostic adapter cannot
	// know (a review Message carries none). The PAGE has thread→host context: a
	// bet-hosted thread's host id IS the bet. Source it here and feed it to the
	// OpenTarget→navigate seam. For task/other hosts the bet isn't cheaply available
	// → betId stays null and the review open action no-ops (no dead URL).
	const reviewBetId = data.thread.hostKind === "bet" ? data.thread.hostId : null;
	// AM1: the OpenTarget routing seam. Reference/host navigation flows through the
	// one `OpenHandler` — the same descriptor-driven seam the PartList renderer uses.
	// host targets resolve through resolveHostRoute (total over BlockHostKind);
	// user/factory are documented no-ops; review uses the page-sourced betId.
	// AM3: onOpenSession fills the `case "session"` no-op — fires when a
	// `session-reference` Embed or a sub-agent tool row is clicked (AC1).
	const openTarget = createOpenHandler(navigate, {
		betId: reviewBetId,
		onOpenSession: (sessionId) => setOpenedSessionId(sessionId),
	});
	const threadTitle: string = data.identities[data.thread.hostId]?.name ?? data.thread.hostId;
	const hostRoute = resolveHostRoute(data.thread.hostKind, data.thread.hostId);
	const hostTitle =
		data.hostTitle ?? data.identities[data.thread.hostId]?.name ?? data.thread.hostId;
	const header = {
		title: threadTitle,
		hostKind: data.thread.hostKind,
		hostTitle,
		hostRoute,
	};

	// Q1 §4.6: companion split layout when dialed in
	// AM5 T6: reconciled onto SplitView (surfaceKey="conversation.dial-in")
	if (dialInSessionId) {
		const agentId = activeSession?.agentId ?? data.thread.hostId;
		const agentIdentity = data.identities[agentId];
		const agentName = agentIdentity?.name ?? agentId;

		return (
			<PageScaffold body="managed" data-testid="conversations-page">
				<SplitView
					surfaceKey="conversation.dial-in"
					mode="split"
					dividerRatio={dialInRatio}
					onRatioChange={setDialInRatio}
					onModeChange={(mode) => {
						if (mode === "fold-back") setDialInSessionId(null);
					}}
					origin={
						<ConversationSurface
							parts={parts}
							onOpen={openTarget}
							header={header}
							participants={participants}
							onSend={onSend}
							scroll
						/>
					}
					destination={
						<SessionActivityPanel
							sessionId={dialInSessionId}
							agentName={agentName}
							taskTitle={data.thread.hostId}
							onClose={() => setDialInSessionId(null)}
						/>
					}
				/>
			</PageScaffold>
		);
	}

	// AM3 AC1: companion split layout when a session-reference Embed is opened.
	// Fires when `onOpenSession(sessionId)` is called by the open-handler seam.
	// Consistent placement with dial-in; the page owns placement, SessionView owns
	// rendering. The open-handler `case "session"` is now wired (no longer a no-op).
	// AM5 T6: reconciled onto SplitView (surfaceKey="conversation.session")
	if (openedSessionId) {
		const agentId = activeSession?.agentId ?? data.thread.hostId;
		const agentIdentity = data.identities[agentId];
		const agentName = agentIdentity?.name ?? agentId;
		const viewerName = data.identities[viewerId]?.name ?? viewerId;

		return (
			<PageScaffold body="managed" data-testid="conversations-page">
				<SplitView
					surfaceKey="conversation.session"
					mode="split"
					dividerRatio={sessionRatio}
					onRatioChange={setSessionRatio}
					onModeChange={(mode) => {
						if (mode === "fold-back") setOpenedSessionId(null);
					}}
					origin={
						<ConversationSurface
							parts={parts}
							onOpen={openTarget}
							header={header}
							participants={participants}
							onSend={onSend}
							scroll
						/>
					}
					destination={
						<div data-testid="session-view-panel">
							<SessionViewPanel
								sessionId={openedSessionId}
								agentId={agentId}
								agentName={agentName}
								threadTitle={header.title}
								hostTitle={header.hostTitle}
								viewerId={viewerId}
								viewerName={viewerName}
								onClose={() => setOpenedSessionId(null)}
								onOpen={openTarget}
							/>
						</div>
					}
				/>
			</PageScaffold>
		);
	}

	// P5: Hint #4 — review-verdict. Trigger: thread is loaded with review messages.
	const hasReviewMessages = data.messages.some((m) => m.type === "review");

	return (
		<PageScaffold
			data-testid="conversations-page"
			header={
				/* AM1: ConversationSurface owns the thread header (title + host context
				    link). A thin action bar above it carries the dial-in affordance +
				    the review-verdict hint — chrome the design header does not own. */
				(dialInButton || (hintReviewVerdict.visible && hasReviewMessages)) && (
					<div className="flex flex-col gap-[6px] border-b border-[var(--border-subtle)] px-[18px] py-[9px]">
						{dialInButton && <div className="flex justify-end">{dialInButton}</div>}
						{hintReviewVerdict.visible && hasReviewMessages && (
							<div
								role="status"
								data-testid={hintReviewVerdict.testId}
								className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px] flex flex-col gap-[6px]"
							>
								<p className="text-[15px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
									{hintReviewVerdict.copy}
								</p>
								<div className="flex gap-2">
									<button
										type="button"
										className="btn btn-ghost btn-xs text-[var(--text-tertiary)] min-h-[44px]"
										onClick={hintReviewVerdict.dismiss}
									>
										Got it
									</button>
								</div>
							</div>
						)}
					</div>
				)
			}
			body="managed"
		>
			{/* ConversationSurface takes the managed body; it manages its own
			    internal scroll (scroll prop). */}
			<ConversationSurface
				parts={parts}
				onOpen={openTarget}
				header={header}
				participants={participants}
				onSend={onSend}
				scroll
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
	// (single useConversationsThreads call in AppShell). Conversations.tsx no
	// longer calls useConversationsThreads independently, avoiding the duplicate
	// API fetch that previously occurred on every Conversations page mount.
	// Fallback values handle the case where Conversations is rendered outside
	// AppShell (tests that provide a partial context or no context at all).
	const conversationsThreads = {
		threads: ctx?.threads ?? [],
		status: ctx?.threadsStatus ?? ("loading" as const),
		error: ctx?.threadsError ?? null,
		retry: ctx?.onRetryThreads ?? (() => undefined),
	};
	const navigate = useNavigate();

	// AF14 AC4: toggleFilter state removed — Blocking/Unread chips never matched
	// real state (unread has no backing concept; blocking lands in AF7).
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
				data-testid="conversations-page"
				header={
					/* AI7: PageHeader — Conversations list title + optional "New thread" action.
					    data-conversations-header wrapper preserved for e2e + unit test selectors. */
					<div data-conversations-header>
						<PageHeader
							data-testid="conversations-filter-bar"
							title="Conversations"
							actions={
								/* W3 AC-8: New thread button in header — only shown when threads exist. */
								!isEmpty ? (
									<Button
										variant="primary"
										size="sm"
										onClick={onNewThread ?? (() => undefined)}
										data-testid="new-thread-btn"
									>
										New thread
									</Button>
								) : undefined
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
					// KnowledgeList.tsx's systemEmpty branch).
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
								/* AI5: shared Button primitive. */
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
