// Minimal fetch-then-set hook used by /api/* GET endpoints.
// Cancels in-flight responses when the URL changes or the consumer unmounts.

import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface FetchState<T> {
	data: T | null;
	error: string | null;
	isLoading: boolean;
}

export function useFetch<T>(url: string | null): FetchState<T> {
	const [state, setState] = useState<FetchState<T>>({
		data: null,
		error: null,
		isLoading: url !== null,
	});

	useEffect(() => {
		if (url === null) {
			setState({ data: null, error: null, isLoading: false });
			return;
		}
		let cancelled = false;
		setState({ data: null, error: null, isLoading: true });
		// @lore T3: Promise.resolve() wraps the apiFetch result to handle the
		// case where a test mock returns undefined instead of a Promise<Response>.
		// In production, apiFetch always returns Promise<Response> so this is a
		// no-op. In tests that mock apiFetch to vi.fn() (returns undefined),
		// Promise.resolve(undefined) gives a resolved Promise<undefined> which is
		// caught by the error handler below (res?.ok fails the ok check).
		Promise.resolve(apiFetch(url))
			.then((res) => {
				if (!res?.ok) throw new Error(`HTTP ${res?.status ?? "unknown"}`);
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
	}, [url]);

	return state;
}
