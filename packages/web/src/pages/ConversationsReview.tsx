/**
 * Conversations/Review page — L1a: mounts <ThreadShell> with the new
 * fetch-based render path. Replaces the legacy MockReviewItem fixture.
 *
 * @lore L1a T13: the page reads `GET /api/threads/:id` (id from URL params)
 * and mounts the design-system ThreadShell. The MockReviewItem +
 * MOCK_REVIEWS literals + PREFILL_KEYS map are removed; verdict-grammar
 * shortcuts are deferred to a follow-up.
 *
 * @lore L1 step5 (slop W): the previous draft hardcoded `FALLBACK_THREAD_ID`
 * and laundered the network response through `as ThreadDetail`. We render
 * an `EmptyState` when the URL does not carry an id — no demo fixture leaks
 * into production. The fetched JSON is decoded by `decodeThreadDetail`,
 * which fails loudly on a malformed payload at the parse site instead of
 * crashing somewhere downstream.
 *
 * @lore L7 §4.5: the previous `onAppend` handler swallowed network errors
 * silently. The new implementation throws classified errors on failure so
 * ThreadShell's internal cardState catches and surfaces them. The
 * "committed" signal is the refreshed thread arriving from
 * `GET /api/threads/:id`. On 4xx/5xx/network/timeout the thrown string is
 * the human-readable copy shown in the card error state. On a non-resolving
 * thread commit (plain reply or agent-async verdict) we fire the async-ack
 * toast.
 *
 * @lore L7 reconciliation: L7's original design passed verdictPending /
 * verdictError / onRetryCommit through to ThreadShell as props. L11 rewrote
 * ThreadShell to own cardState internally — it catches from onAppendMessage
 * and handles retry via lastVerdictInput ref. The page therefore throws
 * on failure (ThreadShell catches) and does NOT pass commit-state props.
 */
import { EmptyState, ErrorState, SkeletonList, ThreadShell } from "@hyperidle/design-system";
import type { ArtifactRef, ArtifactViewShape, Message, Thread } from "@hyperidle/shared";
import {
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellOutletContext } from "../layouts/AppShell";
import {
	type ActionSummaryData,
	ArtifactView,
	type ContentPreviewData,
	type DataMetricsData,
	type TextDiffData,
	type VisualComparisonData,
} from "../shell/ArtifactView";
import { ToastContext } from "../shell/ToastRegion";

interface ThreadDetail {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	headMessageId: string | null;
	identities: Record<string, { name: string; role?: string }>;
}

class ThreadDetailDecodeError extends Error {
	constructor(reason: string) {
		super(`thread detail decode: ${reason}`);
		this.name = "ThreadDetailDecodeError";
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeThreadDetail(value: unknown): ThreadDetail {
	if (!isObject(value)) {
		throw new ThreadDetailDecodeError("response is not an object");
	}
	if (!isObject(value.thread)) {
		throw new ThreadDetailDecodeError("missing thread");
	}
	if (!Array.isArray(value.messages)) {
		throw new ThreadDetailDecodeError("missing messages array");
	}
	const headMessageId = value.headMessageId;
	if (typeof headMessageId !== "string" && headMessageId !== null) {
		throw new ThreadDetailDecodeError("invalid headMessageId");
	}
	const identitiesRaw = isObject(value.identities) ? value.identities : {};
	const identities: Record<string, { name: string; role?: string }> = {};
	for (const [k, v] of Object.entries(identitiesRaw)) {
		if (!isObject(v) || typeof v.name !== "string") continue;
		identities[k] = {
			name: v.name,
			...(typeof v.role === "string" ? { role: v.role } : {}),
		};
	}
	// Server already validates `thread` and each `message` via zod. We trust
	// the shape here and let runtime narrowing in ThreadShell handle the
	// per-payload type checks.
	return {
		thread: value.thread as unknown as Thread,
		messages: value.messages as unknown as ReadonlyArray<Message>,
		headMessageId,
		identities,
	};
}

/**
 * @lore L11 plan §5.6.1 (decision A): there is no `/api/artifacts/:id`
 * endpoint shipped. The page mounts `<ArtifactView>` with the ref's `kind`
 * as the shape and a minimal valid empty body so the metadata strip and
 * discriminator render. A follow-up story wires real fetch.
 */
function emptyDataForShape(
	kind: ArtifactViewShape,
): TextDiffData | ContentPreviewData | VisualComparisonData | ActionSummaryData | DataMetricsData {
	switch (kind) {
		case "text_diff":
			return { hunks: [] };
		case "content_preview":
			return { html: "", metadata: [] };
		case "visual_comparison":
			return {
				before: { label: "before", src: "" },
				after: { label: "after", src: "" },
			};
		case "action_summary":
			return { actions: [] };
		case "data_metrics":
			return { headlines: [], charts: [] };
	}
}

function resolveArtifactSlot(ref: ArtifactRef): ReactNode {
	switch (ref.kind) {
		case "text_diff":
			return (
				<ArtifactView shape="text_diff" data={emptyDataForShape("text_diff") as TextDiffData} />
			);
		case "content_preview":
			return (
				<ArtifactView
					shape="content_preview"
					data={emptyDataForShape("content_preview") as ContentPreviewData}
				/>
			);
		case "visual_comparison":
			return (
				<ArtifactView
					shape="visual_comparison"
					data={emptyDataForShape("visual_comparison") as VisualComparisonData}
				/>
			);
		case "action_summary":
			return (
				<ArtifactView
					shape="action_summary"
					data={emptyDataForShape("action_summary") as ActionSummaryData}
				/>
			);
		case "data_metrics":
			return (
				<ArtifactView
					shape="data_metrics"
					data={emptyDataForShape("data_metrics") as DataMetricsData}
				/>
			);
	}
}

const COMMIT_TIMEOUT_MS = 15_000;
const ASYNC_ACK_COPY = "Response recorded — agent will pick it up on next session.";

function classifyNetworkError(cause: unknown): string {
	if (cause instanceof Error && cause.name === "AbortError") {
		return "Request timed out. Try again?";
	}
	return "No connection. Try again when you're back online.";
}

async function classifyHttpError(res: Response): Promise<string> {
	if (res.status >= 500) {
		return "Server couldn't record this response. Try again?";
	}
	// 4xx — try JSON body, fall back to status copy.
	try {
		const cloned = res.clone();
		const body = (await cloned.json()) as { error?: unknown };
		if (typeof body?.error === "string" && body.error.length > 0) {
			return body.error.slice(0, 120);
		}
	} catch {
		// fall through
	}
	return `Couldn't record response (HTTP ${res.status}).`;
}

/**
 * Bridge to the surrounding `<ToastRegion>` (AppShell mount). When rendered
 * standalone (unit tests, Storybook) we fall back to a local state toast.
 *
 * @lore L7 Adv-C6: the fallback timer is captured in a ref and cleared on
 * unmount, so navigating away within the 4 s window does not setState on
 * an unmounted component.
 */
function useToastBridge(): {
	showToast: (message: string) => void;
	localMessage: string | null;
} {
	const [localMessage, setLocalMessage] = useState<string | null>(null);
	const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const parent = useContext(ToastContext);
	const showToast = useCallback(
		(message: string): void => {
			if (parent) {
				parent.showToast(message);
				return;
			}
			if (localTimerRef.current !== null) {
				clearTimeout(localTimerRef.current);
				localTimerRef.current = null;
			}
			setLocalMessage(message);
			localTimerRef.current = setTimeout(() => {
				setLocalMessage(null);
				localTimerRef.current = null;
			}, 4_000);
		},
		[parent],
	);
	useEffect(() => {
		return (): void => {
			if (localTimerRef.current !== null) {
				clearTimeout(localTimerRef.current);
				localTimerRef.current = null;
			}
		};
	}, []);
	return useMemo(() => ({ showToast, localMessage }), [showToast, localMessage]);
}

export function ConversationsReview(): JSX.Element {
	const [detail, setDetail] = useState<ThreadDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [threadId, setThreadId] = useState<string | null>(null);
	const toast = useToastBridge();

	// @lore L8 review (Architecture C2 / Adversary B1): the lifted selection
	// state reaches us through Outlet context. We prefer it when set, and
	// fall back to the legacy `?id=` URL param for deep-links until L9
	// collapses the duality.
	const outletContext = useOutletContext<AppShellOutletContext | undefined>();
	const liftedThreadId = outletContext?.selectedThreadId ?? null;

	useEffect(() => {
		const urlId = new URLSearchParams(window.location.search).get("id");
		const id = liftedThreadId ?? urlId;
		setThreadId(id);
		if (!id) {
			setDetail(null);
			setError(null);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		const ac = new AbortController();
		(async (): Promise<void> => {
			try {
				const res = await fetch(`/api/threads/${id}`, { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(res.status === 404 ? "Thread not found" : `HTTP ${res.status}`);
					setLoading(false);
					return;
				}
				const body = decodeThreadDetail(await res.json());
				if (ac.signal.aborted) return;
				setDetail(body);
				setLoading(false);
			} catch (cause) {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setLoading(false);
			}
		})();
		return () => ac.abort();
	}, [liftedThreadId]);

	/**
	 * Commit a message to the thread. Throws a human-readable string on failure
	 * so ThreadShell's internal `cardState` machine can catch and surface it.
	 *
	 * On success: refreshes the thread detail. Detects async-ack condition
	 * (non-resolving commit) and fires the toast.
	 */
	const onAppend = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!detail) return;
			const currentThreadId = detail.thread.id;
			const priorResolvedAt = detail.thread.resolvedAt ?? null;

			const ac = new AbortController();
			const timer = setTimeout(() => ac.abort(), COMMIT_TIMEOUT_MS);
			let res: Response;
			try {
				res = await fetch(`/api/threads/${currentThreadId}/messages`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(input),
					signal: ac.signal,
				});
			} catch (cause) {
				clearTimeout(timer);
				throw new Error(classifyNetworkError(cause));
			}
			clearTimeout(timer);

			if (!res.ok) {
				const message = await classifyHttpError(res);
				throw new Error(message);
			}

			// Read commit response to detect async vs sync resolution.
			let nextResolvedAt: string | null | undefined;
			let committedType: string | undefined;
			try {
				const body = (await res.clone().json()) as {
					thread?: { resolvedAt?: string | null };
					message?: { type?: string };
				};
				nextResolvedAt = body?.thread?.resolvedAt ?? null;
				committedType = body?.message?.type;
			} catch {
				// no body — treat as sync, refresh fetches the truth.
			}

			// Refresh detail.
			try {
				const refresh = await fetch(`/api/threads/${currentThreadId}`);
				if (refresh.ok) {
					setDetail(decodeThreadDetail(await refresh.json()));
				}
			} catch {
				// non-fatal — the commit succeeded; UI keeps prior state.
			}

			// Async-ack predicate (plan §4.5, review W3 / Adv-C5):
			// fire when this commit was NOT a head-resolving event. We treat
			// a head-resolving event as either:
			//   (a) thread.resolvedAt flipped from null → non-null on this call
			//       (the canonical sync verdict path), or
			//   (b) the committed message is itself a verdict — even if the
			//       thread row's resolvedAt did not change in the response,
			//       a verdict is by definition a head-resolution event in the
			//       UI's contract and must not show the "agent will pick it
			//       up next session" copy.
			// Plain replies on either resolved or unresolved threads are
			// async by definition — the agent picks them up on next session.
			const threadFlippedResolved = priorResolvedAt === null && typeof nextResolvedAt === "string";
			const isHeadResolvingCommit = threadFlippedResolved || committedType === "verdict";
			if (!isHeadResolvingCommit) {
				toast.showToast(ASYNC_ACK_COPY);
			}
		},
		[detail, toast],
	);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<SkeletonList rows={3} ariaLabel="Loading review" />
			</div>
		);
	}
	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="conversations-review-page">
				<ErrorState title="Failed to load review" description={error} />
			</div>
		);
	}
	if (!threadId) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-review-page">
				<EmptyState
					title="No thread selected"
					description="Open a review from the inbox to see it here."
				/>
			</div>
		);
	}
	if (!detail) {
		return <div className="h-full" data-testid="conversations-review-page" />;
	}
	return (
		<div className="flex flex-col h-full" data-testid="conversations-review-page">
			{toast.localMessage !== null ? (
				<div role="status" className="sr-only" data-testid="async-ack-fallback">
					{toast.localMessage}
				</div>
			) : null}
			<ThreadShell
				thread={detail.thread}
				messages={detail.messages}
				identities={detail.identities}
				artifactSlot={resolveArtifactSlot}
				onAppendMessage={onAppend}
			/>
		</div>
	);
}
