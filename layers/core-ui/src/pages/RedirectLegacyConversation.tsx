/**
 * RedirectLegacyConversation — L9.
 *
 * Tiny redirect helper for the two legacy URL shapes:
 *   /conversations/review?id=X    → /conversations/X
 *   /conversations/chat?thread=X  → /conversations/X
 *   /conversations/review          → /conversations  (no id)
 *   /conversations/chat            → /conversations  (no id)
 *
 * Accepts `paramName` to distinguish the two query-param name conventions
 * ("id" for /review, "thread" for /chat).
 *
 * @lore L9 CRITICAL (arch-critique): empty-string and whitespace-only ids
 * are treated as "no id" — both redirect to the queue (/conversations).
 * Without the `.trim() || null` guard, `?id=%20%20` would produce a navigate
 * to /conversations/%20%20%20, which `useThread` resolves to `"not-found"`,
 * landing on the not-found EmptyState instead of the queue. The spec says
 * "legacy URLs redirect, never 404."
 *
 * @lore L9: `replace: true` on <Navigate> is the spec's "preserving history"
 * requirement. With replace, the legacy URL is overwritten in browser history
 * at the moment of redirect; pressing back from /conversations/X goes to
 * whatever was before the legacy URL — not back into the legacy URL that
 * would re-redirect. This prevents the bounce-loop the spec explicitly calls
 * out.
 */
import type { JSX } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

export interface RedirectLegacyConversationProps {
	/** The legacy query parameter name carrying the thread id ("id" or "thread"). */
	paramName: "id" | "thread";
}

// JSDoc example for clarity at the call site (arch-critique SUGGESTION #2):
// <RedirectLegacyConversation paramName="id" /> redirects:
//   /conversations/review?id=abc → /conversations/abc
//   /conversations/review?id=    → /conversations
// <RedirectLegacyConversation paramName="thread" /> redirects:
//   /conversations/chat?thread=xyz → /conversations/xyz
//   /conversations/chat            → /conversations

export function RedirectLegacyConversation({
	paramName,
}: RedirectLegacyConversationProps): JSX.Element {
	const [params] = useSearchParams();

	// @lore L9 CRITICAL: trim() before the || null guard. An empty or
	// whitespace-only id (e.g. ?id=%20%20) is semantically absent — treat
	// it as no id and redirect to the queue, not to /conversations/   .
	const id = params.get(paramName)?.trim() || null;

	// Carry all other query params except the legacy id param forward so that
	// real query params (e.g. ?settings=open) survive the redirect.
	const carry = new URLSearchParams(params);
	carry.delete(paramName);
	const suffix = carry.toString();

	const target = id
		? `/conversations/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ""}`
		: `/conversations${suffix ? `?${suffix}` : ""}`;

	return <Navigate to={target} replace />;
}
