// @lore: knownRef gains id only once title resolves — StrictMode abort fires before fetch settles; marking on start loses the title permanently with no retry

import { useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";

export function useTaskLookup(ids: readonly string[]): Readonly<Record<string, string>> {
	const [titles, setTitles] = useState<Readonly<Record<string, string>>>({});
	// Tracks ids already resolved or in flight, outside React state, so the
	// effect can decide what's missing without depending on `titles` itself
	// (which it also writes — a self-referential dependency).
	const knownRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const known = knownRef.current;
		const missing = ids.filter((id) => !known.has(id));
		if (missing.length === 0) return;
		// In flight, not yet known — known only gains an id once its title
		// actually resolves (below), so an aborted/failed attempt can be retried.
		for (const id of missing) known.add(id);
		let settled = false;

		let cancelled = false;
		(async (): Promise<void> => {
			try {
				const result = await call("search_tasks", { ids: missing });
				if (cancelled || !result.ok) return;
				settled = true;
				if (result.data.length === 0) return;
				setTitles((prev) => {
					const next = { ...prev };
					for (const row of result.data) next[row.id] = row.title;
					return next;
				});
			} catch {
				// Best-effort — an unresolved id falls back to itself in the caller,
				// and stays released below so a later run retries it.
			}
		})();

		return () => {
			cancelled = true;
			if (!settled) for (const id of missing) known.delete(id);
		};
	}, [ids]);

	return titles;
}
