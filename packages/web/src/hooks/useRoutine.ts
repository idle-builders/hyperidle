/**
 * AA1 — useRoutine: thin one-shot fetch hook for GET /api/routines/:id.
 *
 * Returns RoutineDetail (routine info + run history) for the WorkRoutine page.
 */

import type { RoutineDetail } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseRoutineResult {
	data: RoutineDetail | null;
	loading: boolean;
	error: Error | null;
}

export function useRoutine(routineId: string | undefined): UseRoutineResult {
	const [state, setState] = useState<UseRoutineResult>({
		data: null,
		loading: routineId !== undefined,
		error: null,
	});

	useEffect(() => {
		if (!routineId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/routines/${encodeURIComponent(routineId)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`Routine fetch failed: ${res.status}`);
				return res.json() as Promise<RoutineDetail>;
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
	}, [routineId]);

	return state;
}
