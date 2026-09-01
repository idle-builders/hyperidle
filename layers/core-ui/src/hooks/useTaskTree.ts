/**
 * useTaskTree — fetches GET /api/tasks/:id/tree.
 *
 * Returns { task, ancestors, children, tokensActualRollup }.
 * The `ancestors` array is root-first for breadcrumb rendering.
 * The `children` array is a recursive TaskNode tree.
 *
 * @lore BB1: replaces useBet. A root task (parentTaskId === null) is the new
 * primitive for what a bet used to be.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { TaskTreeResponse } from "../types/task.js";

export interface UseTaskTreeResult {
	data: TaskTreeResponse | null;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

export function useTaskTree(taskId: string | undefined): UseTaskTreeResult {
	const [refreshCounter, setRefreshCounter] = useState(0);
	const [state, setState] = useState<Omit<UseTaskTreeResult, "refresh">>({
		data: null,
		loading: taskId !== undefined,
		error: null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter triggers re-fetches on demand via refresh()
	useEffect(() => {
		if (!taskId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/tree`)
			.then((res) => {
				if (!res.ok) throw new Error(`Task tree fetch failed: ${res.status}`);
				return res.json() as Promise<TaskTreeResponse>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [taskId, refreshCounter]);

	const refresh = useCallback((): void => {
		setRefreshCounter((c) => c + 1);
	}, []);

	return { ...state, refresh };
}
