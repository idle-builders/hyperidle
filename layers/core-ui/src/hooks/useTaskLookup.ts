/**
 * useTaskLookup — resolve task ids to titles for the dependency chips.
 *
 * A dependency chip must show the task's title, not its id (searching by
 * title and then displaying a raw id is half a fix). Freshly-picked
 * dependencies already carry a title from the search result that picked
 * them; dependencies loaded from the server (the edit surface's existing
 * list) carry only ids. This hook resolves those via `search_tasks`'s
 * `ids` filter — the same batch lookup, now the action door.
 *
 * Best-effort: a lookup failure leaves the id unresolved and the caller
 * falls back to showing the id rather than blocking the chip from rendering.
 *
 * @lore React StrictMode double-invokes effects in dev — mount, cleanup
 * (abort), mount again. If an id were marked "known" the instant its fetch
 * *started*, the cleanup's abort would fire before it resolved and the
 * second mount would see nothing missing — the title lost for good, with
 * nothing left to retry it. So `knownRef` only gains an id once its title
 * actually resolves; the cleanup releases any id whose fetch never settled,
 * so a later effect run (StrictMode's second mount, or a real remount)
 * retries it instead of silently giving up.
 */

import { useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";

/** Maps each id in `ids` to its title, once resolved. Ids never seen resolve on the next id set that includes them. */
export function useTaskLookup(ids: readonly string[]): Readonly<Record<string, string>> {
	const [titles, setTitles] = useState<Readonly<Record<string, string>>>({});
	// Tracks ids already resolved or in flight, outside React state, so the
	// effect can decide what's missing without depending on `titles` itself
	// (which it also writes — a self-referential dependency).
	const knownRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const missing = ids.filter((id) => !knownRef.current.has(id));
		if (missing.length === 0) return;
		// In flight, not yet known — knownRef only gains an id once its title
		// actually resolves (below), so an aborted/failed attempt can be retried.
		for (const id of missing) knownRef.current.add(id);
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
			if (!settled) for (const id of missing) knownRef.current.delete(id);
		};
	}, [ids]);

	return titles;
}
