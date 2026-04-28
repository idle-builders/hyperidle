/**
 * Conversations/Review page — L1a: mounts <ThreadShell> with the new
 * fetch-based render path. Replaces the legacy MockReviewItem fixture.
 *
 * @lore L1a T13: the page reads `GET /api/threads/:id` (id from URL params)
 * and mounts the design-system ThreadShell. The MockReviewItem +
 * MOCK_REVIEWS literals + PREFILL_KEYS map are removed; verdict-grammar
 * shortcuts are deferred to a follow-up.
 */
import { ErrorState, SkeletonList, ThreadShell } from "@hyperidle/design-system";
import type { Message, Thread } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useState } from "react";

interface ThreadDetail {
	thread: Thread;
	messages: Message[];
	headMessageId: string | null;
	identities: Record<string, { name: string; role?: string }>;
}

const FALLBACK_THREAD_ID = "demo-thread-1";

export function ConversationsReview(): JSX.Element {
	const [detail, setDetail] = useState<ThreadDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const id = new URLSearchParams(window.location.search).get("id") ?? FALLBACK_THREAD_ID;
		const ac = new AbortController();
		(async (): Promise<void> => {
			try {
				const res = await fetch(`/api/threads/${id}`, { signal: ac.signal });
				if (!res.ok) {
					setError(res.status === 404 ? "Thread not found" : `HTTP ${res.status}`);
					setLoading(false);
					return;
				}
				const body = (await res.json()) as ThreadDetail;
				setDetail(body);
				setLoading(false);
			} catch (cause) {
				if ((cause as Error).name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setLoading(false);
			}
		})();
		return () => ac.abort();
	}, []);

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
					setDetail((await refresh.json()) as ThreadDetail);
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
	if (!detail) {
		return <div className="h-full" data-testid="conversations-review-page" />;
	}
	return (
		<div className="flex flex-col h-full" data-testid="conversations-review-page">
			<ThreadShell
				thread={detail.thread}
				messages={detail.messages}
				identities={detail.identities ?? {}}
				onAppendMessage={onAppend}
			/>
		</div>
	);
}
