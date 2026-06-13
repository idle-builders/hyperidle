/**
 * Conversations page — L9: single detail surface, shape-agnostic.
 *
 * Replaces ConversationsReview.tsx (one page, two routes). Mounted on:
 *   - /conversations          → no :threadId → State A (empty, open a thread)
 *   - /conversations/:threadId → has :threadId → States B/C/D/E
 *
 * @lore L9: the page does NOT branch on review-vs-chat. ThreadShell (L1)
 * owns dispatch by message type (review → RichMessageCard, plain →
 * CommentRow, verdict → terminator, etc.). Adding a new message type adds
 * a branch inside ThreadShell — not a new route. This is contract 2 from
 * concept.md §3: "No per-shape page logic."
 *
 * @lore L9: there are exactly five states (A–E). State E ("Thread not
 * found") does NOT mount ThreadShell — no message list, no composer, no
 * fixture content. This is the explicit rejection of the editable-fallback
 * anti-pattern that ConversationsChat.tsx embodied.
 *
 * @lore Q1: Dial-in support added. When viewing a task-hosted thread with an
 * active session, a "Live" badge + "Dial In" button appear in the thread header.
 * Clicking "Dial In" opens the companion split: thread on the left (flex-[3]),
 * SessionActivityPanel on the right (flex-[2]).
 */
import {
	Button,
	EmptyState,
	ErrorState,
	SkeletonList,
	Tag,
	ThreadShell,
} from "@hyperidle/design-system";
import type { ArtifactRef, ArtifactViewShape, BlockRef, InlineRef } from "@hyperidle/shared";
import {
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { BlockRefEmbed } from "../components/BlockRefEmbed.js";
import { SessionActivityPanel } from "../components/SessionActivityPanel";
import type { ConversationsFilter } from "../components/ThreadSections";
import { ThreadSections } from "../components/ThreadSections";
import { useHint } from "../hooks/useHints";
import { useThreadDetail } from "../hooks/useThreadDetail";
import type { AppShellOutletContext } from "../layouts/AppShell";
import { apiFetch } from "../services/api-fetch.js";
import { resolveHostRoute } from "../services/host-route.js";
import { ArtifactView } from "../shell/ArtifactView";
import { ToastContext } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// AF14 AC4: Blocking/Unread chip bar removed from Conversations page — neither chip
// matched real state. The blocking/unread fields remain on ThreadItem for AF7 forward-compat.

/**
 * T4: renderRefEmbeds for Conversations — builds BlockRefEmbed cards for block refs.
 *
 * @lore T4: Wired in Conversations.tsx (not HostThreadSection) per reviewer critique.
 * Conversations is a ThreadShell consumer and the right place to inject the
 * web-layer BlockRefEmbed component.
 */
function renderRefEmbedsForConversations(refs: ReadonlyArray<InlineRef>): ReactNode {
	const blockRefs = refs.filter((r): r is BlockRef => r.kind === "block");
	if (blockRefs.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 mt-1">
			{blockRefs.map((r) => (
				<BlockRefEmbed
					key={`${r.blockId}-${r.hostId}`}
					blockId={r.blockId}
					hostKind={r.hostKind}
					hostId={r.hostId}
				/>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Artifact slot resolver (AE6 updated)
// @lore L11 plan §5.6.1 (decision A): there is no /api/artifacts/:id
// endpoint. ArtifactView gets a null preview so the metadata strip and
// discriminator render. Follow-up story wires real fetch.
// @lore AE6: ArtifactRef.kind still uses the old ArtifactViewShape enum
// (5 shapes) since thread.ts is not in scope for AE6. We map shapes to
// their equivalent fundamental kinds for the new ArtifactView API.
// ---------------------------------------------------------------------------

/** Map old ArtifactViewShape → fundamental kind string. */
const SHAPE_TO_KIND: Record<ArtifactViewShape, string> = {
	text_diff: "code",
	content_preview: "text",
	visual_comparison: "image",
	action_summary: "text",
	data_metrics: "data",
};

function resolveArtifactSlot(ref: ArtifactRef): ReactNode {
	const kind = SHAPE_TO_KIND[ref.kind] ?? ref.kind;
	return <ArtifactView kind={kind} preview={null} />;
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
	const hintReviewVerdict = useHint("review-verdict");
	// @lore L9: read ToastContext directly (not useToast) so the page renders
	// in unit tests / Storybook without a <ToastRegion> ancestor. Production
	// always has the provider via AppShell. When absent, async-ack falls back
	// silently — the response still commits, the toast just doesn't fire.
	const toast = useContext(ToastContext);

	// Q1 §4.6: dial-in state
	const [dialInSessionId, setDialInSessionId] = useState<string | null>(null);

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

	const onAppend = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!data) return;
			const priorResolvedAt = data.thread.resolvedAt ?? null;
			const res = await apiFetch(`/api/threads/${data.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				// @lore L9: throw so ThreadShell's RichMessageCard surfaces the error
				// (phase: "error") with a Retry control. The L7 thread-response e2e
				// asserts on this exact text via classifyHttpError — keep them in sync.
				throw new Error(classifyHttpError(res.status));
			}
			// Inspect commit response to decide async-ack toast (L7 plan §4.5).
			let nextResolvedAt: string | null = null;
			let committedType: string | undefined;
			try {
				const body = (await res.clone().json()) as {
					thread?: { resolvedAt?: string | null };
					message?: { type?: string };
				};
				nextResolvedAt = body?.thread?.resolvedAt ?? null;
				committedType = body?.message?.type;
			} catch {
				// no body — treat as sync; refresh fetches the truth.
			}
			retry();
			// Async-ack: fire toast when commit was NOT a head-resolving event.
			const flippedResolved = priorResolvedAt === null && typeof nextResolvedAt === "string";
			const isHeadResolving = flippedResolved || committedType === "verdict";
			if (!isHeadResolving) {
				toast?.showToast(ASYNC_ACK_COPY);
			}
		},
		[data, retry, toast],
	);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-page">
				<SkeletonList rows={3} ariaLabel="Loading thread" />
			</div>
		);
	}

	if (status === "not-found") {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-page">
				<EmptyState
					title="Thread not found"
					description="This thread may have been resolved, archived, or the link is incorrect."
					action={<Link to="/conversations">Back to inbox</Link>}
					dataTestId="thread-not-found"
				/>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-page">
				<ErrorState
					title="Failed to load thread"
					description={error ?? "Unknown error"}
					onRetry={retry}
					dataTestId="thread-error"
				/>
			</div>
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
					className="w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)] animate-pulse shrink-0"
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

	// Q1 §4.6: companion split layout when dialed in
	if (dialInSessionId) {
		const agentId = activeSession?.agentId ?? data.thread.hostId;
		const agentIdentity = data.identities[agentId];
		const agentName = agentIdentity?.name ?? agentId;

		return (
			<div className="flex flex-row h-full gap-0" data-testid="conversations-page">
				<div className="flex-[3] min-w-0 flex flex-col border-r border-[var(--border-subtle)]">
					<ThreadShell
						thread={data.thread}
						messages={data.messages}
						identities={data.identities}
						artifactSlot={resolveArtifactSlot}
						onAppendMessage={onAppend}
						renderRefEmbeds={renderRefEmbedsForConversations}
						hideHostBanner={true}
					/>
				</div>
				<div className="flex-[2] min-w-0 flex flex-col">
					<SessionActivityPanel
						sessionId={dialInSessionId}
						agentName={agentName}
						taskTitle={data.thread.hostId}
						onClose={() => setDialInSessionId(null)}
					/>
				</div>
			</div>
		);
	}

	// P5: Hint #4 — review-verdict. Trigger: thread is loaded with review messages.
	const hasReviewMessages = data.messages.some((m) => m.type === "review");

	// Thread title for the detail header. Priority:
	// 1. Identity name lookup by hostId (resolves user/agent names)
	// 2. Fallback to hostId only (not hostKind/hostId format)
	const threadTitle: string = data.identities[data.thread.hostId]?.name ?? data.thread.hostId;

	// AE5: Resolve host context link for navigation.
	const hostRoute = resolveHostRoute(data.thread.hostKind, data.thread.hostId);
	const hostTitle =
		data.hostTitle ?? data.identities[data.thread.hostId]?.name ?? data.thread.hostId;

	return (
		<div className="flex flex-col h-full" data-testid="conversations-page">
			{/* Visual parity: main-header with thread title (20px/600) + dial-in button */}
			<header className="shrink-0 flex items-center justify-between gap-[12px] px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				<div className="min-w-0">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] truncate">
						{threadTitle}
					</h2>
					{/* AE5: Thread context link — shows host entity with tag + title */}
					{hostRoute && (
						<div className="flex items-center gap-[6px] text-[13px] mt-[3px]">
							<Tag label={data.thread.hostKind} />
							<Link
								to={hostRoute}
								className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline truncate"
							>
								{hostTitle}
							</Link>
						</div>
					)}
				</div>
				{dialInButton}
			</header>
			{hintReviewVerdict.visible && hasReviewMessages && (
				<div
					role="status"
					data-testid={hintReviewVerdict.testId}
					className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px] flex flex-col gap-[6px] flex-shrink-0 mx-[24px] mt-[12px]"
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
			{/* ThreadShell takes flex-1 overflow-hidden; it manages its own internal scroll */}
			<div className="flex-1 overflow-hidden">
				<ThreadShell
					thread={data.thread}
					messages={data.messages}
					identities={data.identities}
					artifactSlot={resolveArtifactSlot}
					onAppendMessage={onAppend}
					renderRefEmbeds={renderRefEmbedsForConversations}
					hideHostBanner={true}
				/>
			</div>
		</div>
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
			<div className="flex flex-col h-full" data-testid="conversations-page">
				{/* Visual parity: header bar — 20px/600 title, border-bottom.
				    When empty: just the title (no filter chips, no "New thread" button).
				    When populated: filter chips inline + "New thread" button on the right. */}
				<header
					data-conversations-header
					data-testid="conversations-filter-bar"
					className="shrink-0 flex items-center justify-between gap-[12px] px-[24px] py-[18px] border-b border-[var(--border-subtle)]"
				>
					<div className="flex items-center gap-[12px] min-w-0">
						<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] shrink-0">
							Conversations
						</h2>
						{/* AF14 AC4: Blocking/Unread filter chips removed — never matched real state.
						    Header: title (left) + New-thread button (right) only. */}
					</div>
					{/* W3 AC-8: New thread button in header — only shown when threads exist.
					    In empty state the action lives inside the EmptyState card. */}
					{!isEmpty && (
						/* AI5: shared Button primitive. */
						<Button
							variant="primary"
							size="sm"
							className="shrink-0"
							onClick={onNewThread ?? (() => undefined)}
							data-testid="new-thread-btn"
						>
							New thread
						</Button>
					)}
				</header>
				{isEmpty ? (
					// Empty state: centered card matching mockup's .empty-center wrapper.
					// The "New thread" action is inside the EmptyState card (not the header).
					<div className="flex flex-1 items-center justify-center p-[48px_24px]">
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
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full" data-testid="conversations-page">
			<ConversationsDetail threadId={threadId} />
		</div>
	);
}
