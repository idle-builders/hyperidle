/**
 * L3 — Thread List / Queue Rendering.
 *
 * Wire shape returned by `GET /api/conversations` (enriched).
 * `ThreadKind` carries `coach` for forward compatibility, although the seed
 * row is a `chat` thread whose participants include the Coach/CoS agent id.
 *
 * @lore Server returns `participants` already parsed (an array). We choose to
 * carry `lastActivityAt` (not `updatedAt`) since the threads table has no
 * such column — it is a derived field. Documented in conversations route.
 */

export type ThreadKind = "review" | "chat" | "coach";

export type Section = "pinned" | "blocking" | "reviews" | "chats" | "resolved";

export const SECTIONS: readonly Section[] = [
	"pinned",
	"blocking",
	"reviews",
	"chats",
	"resolved",
] as const;

export type RoutingFilter = "all" | "mine" | "ceo" | "cpo";

export const ROUTING_FILTERS: readonly RoutingFilter[] = ["all", "mine", "ceo", "cpo"] as const;

export function parseRoutingFilter(raw: string | null | undefined): RoutingFilter {
	if (raw === "mine" || raw === "ceo" || raw === "cpo") return raw;
	return "all";
}

export interface ThreadListEntry {
	id: string;
	kind: ThreadKind;
	pinned: boolean;
	participants: string[];
	routedToActorId: string | null;
	routedToActorRole: "CEO" | "CPO" | null;
	domainTag: string | null;
	createdAt: string;
	lastActivityAt: string;
	blocking: boolean;
	resolvedAt: string | null;
	title: string;
	snippet: string;
	unread: boolean;
}
