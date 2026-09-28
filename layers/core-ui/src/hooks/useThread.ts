/**
 * useThread. Replaces `useThreadDetail`/`useAssistantThread`/
 * `useHostThread`'s detail half. One door: `call("open_thread", { id })`,
 * kept live by the `thread:<id>` websocket nudge.
 *
 *
 */

import type { ThreadView } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export type UseThreadStatus = "idle" | "loading" | "ready" | "error" | "not-found";

export interface UseThreadResult {
	status: UseThreadStatus;
	data: ThreadView | null;
	error: string | null;
	refresh: () => void;
}

export function useThread(threadId: string | undefined | null): UseThreadResult {
	const [status, setStatus] = useState<UseThreadStatus>(threadId ? "loading" : "idle");
	const [data, setData] = useState<ThreadView | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const cancelledRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — bumping it via refresh() re-runs the call.
	useEffect(() => {
		if (!threadId) {
			// @lore: "idle" is terminal for no id given — setting "loading" here never resolves (no call fires), causing a permanent skeleton on the caller
			setStatus("idle");
			setError(null);
			setData(null);
			return;
		}
		let cancelled = false;
		setStatus("loading");
		setError(null);

		call("open_thread", { id: threadId })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					const notFound = result.problems.some((p) => p.code === "not_found");
					setData(null);
					setStatus(notFound ? "not-found" : "error");
					setError(notFound ? null : (result.problems[0]?.message ?? "Failed to load thread"));
					return;
				}
				setData(result.data);
				setStatus("ready");
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setData(null);
				setStatus("error");
				setError(cause instanceof Error ? cause.message : "Network error");
			});

		return () => {
			cancelled = true;
		};
	}, [threadId, tick]);

	const refresh = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// Nudge subscription — a frame on `thread:<id>` means "something in this
	// thread changed"; the hook re-runs its own `open_thread` rather than
	// applying the change row itself.
	useEffect(() => {
		if (!threadId) return;
		cancelledRef.current = false;
		const ws = getWsClient();
		const topic = `thread:${threadId}`;
		const unsubscribe = ws.subscribe(topic, (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== topic) return;
			if (!cancelledRef.current) setTick((n) => n + 1);
		});
		return (): void => {
			cancelledRef.current = true;
			unsubscribe();
		};
	}, [threadId]);

	return { status, data, error, refresh };
}
