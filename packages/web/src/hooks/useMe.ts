/**
 * L3 — Wrapper around `GET /api/me` (L2). Provides the current actor's
 * identity for routing-aware UI (e.g. Mine/CEO/CPO filter chips).
 *
 * Returns `null` while loading or when the call fails so consumers can
 * gate UI behind real identity.
 */
import type { Actor } from "@hyperidle/shared";
import { useEffect, useState } from "react";

interface UseMeResult {
	me: Actor | null;
	loading: boolean;
	error: Error | null;
}

export function useMe(): UseMeResult {
	const [me, setMe] = useState<Actor | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let aborted = false;
		setLoading(true);
		setError(null);
		fetch("/api/me")
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as Actor;
				if (aborted) return;
				setMe(body);
				setLoading(false);
			})
			.catch((err: unknown) => {
				if (aborted) return;
				setError(err instanceof Error ? err : new Error(String(err)));
				setLoading(false);
			});
		return () => {
			aborted = true;
		};
	}, []);

	return { me, loading, error };
}
