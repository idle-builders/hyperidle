// @lore: replace: true — overwrites legacy URL in history; pressing back skips the legacy URL; prevents bounce-loop
import type { JSX } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

export interface RedirectLegacyConversationProps {
	/** The legacy query parameter name carrying the thread id ("id" or "thread"). */
	paramName: "id" | "thread";
}

export function RedirectLegacyConversation({
	paramName,
}: RedirectLegacyConversationProps): JSX.Element {
	const [params] = useSearchParams();

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
