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
 */
import { EmptyState, ErrorState, SkeletonList, ThreadShell } from "@hyperidle/design-system";
import type { ArtifactRef, ArtifactViewShape } from "@hyperidle/shared";
import { type JSX, type ReactNode, useCallback, useContext } from "react";
import { Link, useParams } from "react-router-dom";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { apiFetch } from "../services/api-fetch.js";
import {
	type ActionSummaryData,
	ArtifactView,
	type ContentPreviewData,
	type DataMetricsData,
	type TextDiffData,
	type VisualComparisonData,
} from "../shell/ArtifactView";
import { ToastContext } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// Artifact slot resolver (carried from ConversationsReview.tsx unchanged)
// @lore L11 plan §5.6.1 (decision A): there is no /api/artifacts/:id
// endpoint. ArtifactView gets an empty body so the metadata strip and
// discriminator render. Follow-up story wires real fetch.
// ---------------------------------------------------------------------------

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
	// @lore L9: read ToastContext directly (not useToast) so the page renders
	// in unit tests / Storybook without a <ToastRegion> ancestor. Production
	// always has the provider via AppShell. When absent, async-ack falls back
	// silently — the response still commits, the toast just doesn't fire.
	const toast = useContext(ToastContext);

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

	return (
		<div className="flex flex-col h-full" data-testid="conversations-page">
			<ThreadShell
				thread={data.thread}
				messages={data.messages}
				identities={data.identities}
				artifactSlot={resolveArtifactSlot}
				onAppendMessage={onAppend}
			/>
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

	if (!threadId) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-page">
				<EmptyState
					title="Open a thread to see it here"
					description="Pick a thread from the list to read it."
					dataTestId="conversations-empty"
				/>
			</div>
		);
	}

	return <ConversationsDetail threadId={threadId} />;
}
