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
 */
import { EmptyState, ErrorState, SkeletonList, ThreadShell } from "@hyperidle/design-system";
import type { ArtifactRef, ArtifactViewShape, Message, Thread } from "@hyperidle/shared";
import { type JSX, type ReactNode, useCallback, useEffect, useState } from "react";
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

export function ConversationsReview(): JSX.Element {
	const [detail, setDetail] = useState<ThreadDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [threadId, setThreadId] = useState<string | null>(null);

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

	const onAppend = useCallback(
		async (input: { type: string; payload: unknown; clientKey: string }): Promise<void> => {
			if (!detail) return;
			const res = await fetch(`/api/threads/${detail.thread.id}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (res.ok) {
				const refresh = await fetch(`/api/threads/${detail.thread.id}`);
				if (refresh.ok) {
					setDetail(decodeThreadDetail(await refresh.json()));
				}
			}
		},
		[detail],
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
