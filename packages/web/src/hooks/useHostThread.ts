/**
 * useHostThread — L18 hook for fetching the thread attached to any host.
 *
 * Composes two useFetch calls:
 *  1. GET /api/threads?host_kind=…&host_id=… — resolve the thread id
 *  2. GET /api/threads/:id — fetch thread + messages
 *
 * @lore L18: refresh() bumps an internal version counter that is appended to
 * the fetch URL as a fragment (#v=N). Browsers don't send fragments to servers,
 * so the server sees the same URL. useFetch re-fetches on url change, giving us
 * a manual invalidation surface without a global cache layer.
 *
 * @lore L18: Follows the same useFetch-based pattern as useBet / useArtifact.
 * No React Query in this codebase; this is a deliberate v1 choice.
 */

import type { HostKind, Message, Thread } from "@hyperidle/shared";
import { useCallback, useMemo, useState } from "react";
import { useFetch } from "./useFetch.js";

interface HostThreadData {
	thread: Thread;
	messages: ReadonlyArray<Message>;
}

interface ThreadListResponse {
	threads: Array<{ id: string }>;
}

interface ThreadDetailResponse {
	thread: Thread;
	messages: Message[];
	headMessageId: string | null;
	identities: Record<string, { name: string; role: string }>;
}

export interface UseHostThreadResult {
	data: HostThreadData | null;
	error: string | null;
	isLoading: boolean;
	refresh: () => void;
}

/**
 * Fetches (or resolves) the thread attached to the given host.
 * Returns null data when no thread exists for the host yet.
 */
export function useHostThread(hostKind: HostKind, hostId: string): UseHostThreadResult {
	const [version, setVersion] = useState(0);

	const refresh = useCallback(() => {
		setVersion((v) => v + 1);
	}, []);

	// Step 1: resolve thread id via the list endpoint.
	// Skip when hostId is empty.
	const listUrl = useMemo(() => {
		if (!hostId) return null;
		const base = `/api/threads?host_kind=${hostKind}&host_id=${encodeURIComponent(hostId)}`;
		return version > 0 ? `${base}#v=${version}` : base;
	}, [hostKind, hostId, version]);

	const listState = useFetch<ThreadListResponse>(listUrl);

	// Step 2: fetch thread detail once we have the thread id.
	const threadId = listState.data?.threads[0]?.id ?? null;
	const detailUrl = useMemo(() => {
		if (!threadId) return null;
		const base = `/api/threads/${encodeURIComponent(threadId)}`;
		return version > 0 ? `${base}#v=${version}` : base;
	}, [threadId, version]);

	const detailState = useFetch<ThreadDetailResponse>(detailUrl);

	const isLoading = listState.isLoading || (!!threadId && detailState.isLoading);
	const error = listState.error ?? detailState.error;

	const data: HostThreadData | null = useMemo(() => {
		if (!detailState.data) return null;
		return {
			thread: detailState.data.thread,
			messages: detailState.data.messages,
		};
	}, [detailState.data]);

	return { data, error, isLoading, refresh };
}
