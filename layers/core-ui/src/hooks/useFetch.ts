// Minimal fetch-then-set hook used by /api/* GET endpoints.
// Cancels in-flight responses when the URL changes or the consumer unmounts.

import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface FetchState<T> {
	data: T | null;
	error: string | null;
	isLoading: boolean;
}

/**
 * UI-010/UI-015: FetchResult extends FetchState with a refetch callback so
 * callers can offer a retry that re-issues the request without a navigation.
 * FetchState is kept unchanged so hooks that use it as an internal state type
 * (useTaskSessions) are unaffected.
 */
export interface FetchResult<T> extends FetchState<T> {
	refetch: () => void;
}

export function useFetch<T>(url: string | null): FetchResult<T> {
	// Incrementing this triggers a re-fetch without changing the URL.
	const [refetchKey, setRefetchKey] = useState(0);
	const [state, setState] = useState<FetchState<T>>({
		data: null,
		error: null,
		isLoading: url !== null,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: refetchKey is intentionally listed to trigger a re-fetch — it is not read inside the effect body but its change IS the mechanism that re-runs the request (UI-010/UI-015 retry).
	useEffect(() => {
		if (url === null) {
			setState({ data: null, error: null, isLoading: false });
			return;
		}
		let cancelled = false;
		setState({ data: null, error: null, isLoading: true });
		apiFetch(url)
			.then((res) => {
				// @lore NEW-22: user-facing message — no raw HTTP status code shown to users.
				if (!res.ok) throw new Error("Something went wrong. Please try again.");
				return res.json() as Promise<T>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, error: null, isLoading: false });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						error: err instanceof Error ? err.message : String(err),
						isLoading: false,
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [url, refetchKey]);

	return {
		...state,
		refetch: () => setRefetchKey((k) => k + 1),
	};
}
