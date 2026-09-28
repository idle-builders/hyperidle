// @lore: kept live by thread:<id> nudge — re-runs search_tasks on any frame, no payload merging; same shape as useThread

import type { Problem, TaskListItem } from "@hyperidle/domain-model";
import { useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export interface UseThreadTasksResult {
	tasks: readonly TaskListItem[];
	problems: readonly Problem[];
}

export function useThreadTasks(threadId: string | undefined | null): UseThreadTasksResult {
	const [tasks, setTasks] = useState<readonly TaskListItem[]>([]);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [tick, setTick] = useState(0);
	const cancelledRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — the ws nudge below bumps it to re-run the call.
	useEffect(() => {
		if (!threadId) {
			setTasks([]);
			setProblems([]);
			return;
		}
		let cancelled = false;

		call("search_tasks", { threadId })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setTasks([]);
					setProblems(result.problems);
					return;
				}
				setTasks(result.data);
				setProblems([]);
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setTasks([]);
				setProblems([
					{
						code: "network_error",
						message: cause instanceof Error ? cause.message : "Network error",
					},
				]);
			});

		return () => {
			cancelled = true;
		};
	}, [threadId, tick]);

	// Nudge subscription — a frame on `thread:<id>` means "something in this thread changed"; re-run search rather than applying the change row.
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

	return { tasks, problems };
}
