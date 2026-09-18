/**
 * useThreads — BC3. Replaces `useConversationsThreads`. One door:
 * `call("search_threads", filter)`, kept live by the global `conversations`
 * websocket nudge (architecture.md §3.12).
 *
 * The filter is a stable value the caller controls — pass a `useMemo`'d
 * object (or a primitive-only shape) so the effect doesn't refire every
 * render.
 */

import type { SearchThreadsInput, ThreadListRow } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export type UseThreadsStatus = "loading" | "ready" | "error";

export interface UseThreadsResult {
	status: UseThreadsStatus;
	threads: ReadonlyArray<ThreadListRow>;
	error: string | null;
	retry: () => void;
}

/** `undefined` skips the call entirely — e.g. no viewer id resolved yet. */
export function useThreads(filter: SearchThreadsInput | undefined): UseThreadsResult {
	const [status, setStatus] = useState<UseThreadsStatus>(filter ? "loading" : "ready");
	const [threads, setThreads] = useState<ReadonlyArray<ThreadListRow>>([]);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const filterKey = filter ? JSON.stringify(filter) : null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `filterKey` stands in for `filter` (referential stability); `tick` drives retry().
	useEffect(() => {
		if (!filter) {
			setThreads([]);
			setStatus("ready");
			setError(null);
			return;
		}
		let cancelled = false;
		setStatus("loading");
		setError(null);

		call("search_threads", filter)
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setThreads([]);
					setStatus("error");
					setError(result.problems[0]?.message ?? "Failed to load conversations");
					return;
				}
				setThreads(result.data);
				setStatus("ready");
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setThreads([]);
				setStatus("error");
				setError(cause instanceof Error ? cause.message : "Network error");
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterKey, tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// Nudge subscription — the global `conversations` topic. Any frame means
	// "some thread this viewer might see changed"; re-run search_threads
	// rather than reconciling the row locally (architecture.md §3.12).
	const cancelledRef = useRef(false);
	useEffect(() => {
		if (!filter) return;
		cancelledRef.current = false;
		const ws = getWsClient();
		const unsubscribe = ws.subscribe("conversations", (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== "conversations") return;
			if (!cancelledRef.current) setTick((n) => n + 1);
		});
		return (): void => {
			cancelledRef.current = true;
			unsubscribe();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterKey]);

	return { status, threads, error, retry };
}
