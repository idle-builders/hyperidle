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
import { type JSX, type ReactNode, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useThreadDetail } from "../hooks/useThreadDetail";
import {
	type ActionSummaryData,
	ArtifactView,
	type ContentPreviewData,
	type DataMetricsData,
	type TextDiffData,
	type VisualComparisonData,
} from "../shell/ArtifactView";

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

function ConversationsDetail({ threadId }: { threadId: string }): JSX.Element {
	const { status, data, error, retry } = useThreadDetail(threadId);

	const onAppend = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!data) return;
			const res = await fetch(`/api/threads/${data.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (res.ok) {
				// Retry to refresh thread state after append.
				retry();
			}
		},
		[data, retry],
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
