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

// @lore L3 review (slop-scan #16): validate the /api/me response at the trust
// boundary instead of unsafe-casting the JSON body. Hand-rolled type guard
// keeps the web package free of a new runtime dep.
function parseActor(json: unknown): Actor {
	if (!json || typeof json !== "object") throw new Error("Invalid actor response");
	const r = json as Record<string, unknown>;
	if (typeof r.id !== "string") throw new Error("Invalid actor response: id");
	if (r.role !== "CEO" && r.role !== "CPO") throw new Error("Invalid actor response: role");
	if (!(Array.isArray(r.domain_tags) && r.domain_tags.every((d) => typeof d === "string"))) {
		throw new Error("Invalid actor response: domain_tags");
	}
	return { id: r.id, role: r.role, domain_tags: r.domain_tags };
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
				const json: unknown = await res.json();
				const body = parseActor(json);
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
