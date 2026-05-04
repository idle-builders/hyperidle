/**
 * actor-fetch — sibling actor-aware fetch wrapper.
 *
 * @lore L15: created to satisfy `design/no-raw-actor-fetch`. The web client
 * has no auth context yet; until that lands (auth-middleware story), every
 * outbound call uses the same `DEFAULT_ACTOR_ID` the server falls back to.
 * The wrapper is the single seam where the cross-cutting `X-Identity` header
 * is applied — when real per-user identity arrives, only this file changes.
 *
 * The lint rule's allowlist includes `packages/web/src/hooks/`, so this file
 * is the legitimate place to issue raw `fetch()` calls.
 */

/**
 * The header convention is `X-Identity` (server: `routes/threads.ts:47`).
 * The recurring `no-raw-actor-fetch` rule message says `X-Actor-Id` for
 * historical reasons, but the server reads `X-Identity`. Both names are
 * documented in the rule's docs.md.
 */
export const IDENTITY_HEADER = "X-Identity";

/**
 * Default founder actor — mirrors the server's `DEFAULT_FOUNDER_ID` so the
 * pre-auth client and the server agree on the implicit sender for L15.
 */
export const DEFAULT_ACTOR_ID = "u-founder";

export interface ActorFetchOptions {
	readonly actorId?: string;
	readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * Returns a `fetch`-shaped function that injects the `X-Identity` header on
 * every outbound request. Existing headers on the call site are preserved
 * (and may override the actor id if explicitly set).
 */
export function createActorFetch(options: ActorFetchOptions = {}): typeof globalThis.fetch {
	const actorId = options.actorId ?? DEFAULT_ACTOR_ID;
	const baseFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
	return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const merged: RequestInit = { ...init };
		const headers = new Headers(init?.headers);
		if (!headers.has(IDENTITY_HEADER)) {
			headers.set(IDENTITY_HEADER, actorId);
		}
		merged.headers = headers;
		return baseFetch(input, merged);
	}) as typeof globalThis.fetch;
}
