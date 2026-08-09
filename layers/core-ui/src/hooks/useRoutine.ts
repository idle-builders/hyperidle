/**
 * AA1 — useRoutine: thin one-shot fetch hook for GET /api/routines/:id.
 *
 * Returns RoutineDetail (routine info + run history) for the WorkRoutine page.
 */

import type { RoutineDetail } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseRoutineResult {
	data: RoutineDetail | null;
	loading: boolean;
	error: Error | null;
	/** AV4: trigger a re-fetch of the routine — call after a PATCH save to reflect changes. */
	refetch: () => void;
}

export function useRoutine(routineId: string | undefined): UseRoutineResult {
	// @lore AV4: reloadKey mirrors the useTeam pattern — increment to re-trigger the
	// useEffect fetch without unmounting/remounting the component. Called by
	// RoutineDetailPane after a successful PATCH save (AC#2 "reflected on reload").
	const [reloadKey, setReloadKey] = useState(0);
	const [state, setState] = useState<Omit<UseRoutineResult, "refetch">>({
		data: null,
		loading: routineId !== undefined,
		error: null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is a re-trigger sentinel — not read in the effect body but listed to force a re-fetch on each refetch() call
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
	}, [routineId, reloadKey]);

	return { ...state, refetch: () => setReloadKey((k) => k + 1) };
}
