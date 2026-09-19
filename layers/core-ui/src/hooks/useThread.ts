/**
 * useThread — BC3. Replaces `useThreadDetail`/`useAssistantThread`/
 * `useHostThread`'s detail half. One door: `call("open_thread", { id })`,
 * kept live by the `thread:<id>` websocket nudge.
 *
 * @lore architecture.md §3.12 (nudge, founder-locked): the push carries the
 * `changes` row, never the assembled view. On any frame for this thread's
 * topic the hook re-runs `open_thread` itself — no payload merging, no
 * client-side reducer over `kind`. That is what "hooks are replaced by
 * `call()` + the same subscription" means literally.
 *
 * @lore re-review: this hook never takes a `blockId`. `open_thread`'s
 * server-side `blockId` filter exists for agents (a narrower fetch than the
 * UI needs), not for a page that renders a block-scoped view of a thread it
 * already has in full — `HostThreadSection`'s own block filter is a
 * client-side slice over the one `ThreadView` this hook loads, so every
 * block's messages stay available to whatever else on the page reads the
 * same data (e.g. `KnowledgeDetail`'s inline anchored comments).
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
			// @lore BC3 review: "idle" is terminal for "no id given, nothing to
			// open" — this used to set "loading" here, which never resolved
			// (no call, no subscription fires from the other effect either),
			// so a caller with no id yet (e.g. HostThreadSection resolving a
			// host before any thread exists) showed a permanent skeleton.
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
	// applying the change row itself (architecture.md §3.12).
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
