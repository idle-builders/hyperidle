/**
 * L7 — `useRecoveryFetch`. Single source of truth for recovery-verb
 * POSTs (kill switch, session pause/resume, rollback). Reads the actor
 * id from `useMe()` and injects it via the `X-Actor-Id` header so the
 * server's identity-derivation logic (mirrored across the L4/L7 audit
 * paths) cannot be fed a stale or wrong literal.
 *
 * @lore L7 SECURITY (AI8): every recovery POST sends the *current*
 * actor's id, not the hard-coded `actor:ceo` literal. A CPO clicking
 * pause from their session sends the CPO's id; the server's audit row
 * attribution stays correct. Without this helper, five fetch sites
 * pinned `actor:ceo` and silently corrupted audit attribution.
 */
import { useCallback } from "react";
import { useMe } from "./useMe";

export interface RecoveryFetchResult {
	/**
	 * POST helper. Adds `Content-Type: application/json` + the resolved
	 * `X-Actor-Id` header (when available) to every call. Returns the
	 * raw `Response` so callers can branch on `res.ok` and read the body
	 * with their own typed schema.
	 */
	post: (path: string, body: unknown) => Promise<Response>;
	/** Resolved actor id (null while `/api/me` is in flight). */
	actorId: string | null;
}

export function useRecoveryFetch(): RecoveryFetchResult {
	const { me } = useMe();
	const actorId = me?.id ?? null;

	const post = useCallback(
		async (path: string, body: unknown): Promise<Response> => {
			const headers: Record<string, string> = { "Content-Type": "application/json" };
			if (actorId) headers["X-Actor-Id"] = actorId;
			return fetch(path, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
		},
		[actorId],
	);

	return { post, actorId };
}
