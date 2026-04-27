/**
 * L3 — Conversations data source.
 *
 * Wraps `GET /api/conversations` (enriched server-side per L3) and coerces
 * the response into `ThreadListEntry[]`. Owns loading/error state and a
 * `refresh()` trigger.
 */
import type { ThreadListEntry } from "@hyperidle/shared";
import { useEffect, useState } from "react";

interface UseConversationsResult {
	loading: boolean;
	error: Error | null;
	threads: ThreadListEntry[];
	refresh: () => void;
}

// @lore L3 review (slop-scan #16/#17): validate the network response shape at
// the trust boundary instead of unsafe-casting. Hand-rolled type guard rather
// than zod so the web package keeps zero new runtime deps.
interface RawThread {
	id: string;
	kind: string;
	pinned: number | boolean;
	participants: string[];
	routedToActorId: string | null;
	routedToActorRole: "CEO" | "CPO" | null;
	domainTag: string | null;
	createdAt: string;
	lastActivityAt?: string;
	blocking?: boolean;
	resolvedAt?: string | null;
}

function isRawThread(v: unknown): v is RawThread {
	if (!v || typeof v !== "object") return false;
	const r = v as Record<string, unknown>;
	if (typeof r.id !== "string") return false;
	if (typeof r.kind !== "string") return false;
	if (typeof r.pinned !== "number" && typeof r.pinned !== "boolean") return false;
	if (!Array.isArray(r.participants) || !r.participants.every((p) => typeof p === "string"))
		return false;
	if (r.routedToActorId !== null && typeof r.routedToActorId !== "string") return false;
	if (r.routedToActorRole !== null && r.routedToActorRole !== "CEO" && r.routedToActorRole !== "CPO")
		return false;
	if (r.domainTag !== null && typeof r.domainTag !== "string") return false;
	if (typeof r.createdAt !== "string") return false;
	return true;
}

function parseConversationsResponse(json: unknown): { threads: RawThread[] } {
	if (!json || typeof json !== "object") throw new Error("Invalid conversations response");
	const root = json as Record<string, unknown>;
	if (!Array.isArray(root.threads)) throw new Error("Invalid conversations response: threads");
	const threads: RawThread[] = [];
	for (const t of root.threads) {
		if (!isRawThread(t)) throw new Error("Invalid thread row in conversations response");
		threads.push(t);
	}
	return { threads };
}

function coerce(raw: RawThread): ThreadListEntry {
	// @lore L3 review (slop-scan #1): kind is intentionally narrowed to the
	// closed union; an unrecognised value falls back to "chat" so a server
	// migration that adds a new kind doesn't blank the row. Server is the
	// source of truth for the union — drift here is a known follow-up
	// (server should reject before reaching the wire).
	const kind: ThreadListEntry["kind"] =
		raw.kind === "review" || raw.kind === "chat" || raw.kind === "coach" ? raw.kind : "chat";
	return {
		id: raw.id,
		kind,
		pinned: Boolean(raw.pinned),
		participants: raw.participants,
		routedToActorId: raw.routedToActorId,
		routedToActorRole: raw.routedToActorRole,
		domainTag: raw.domainTag,
		createdAt: raw.createdAt,
		lastActivityAt: raw.lastActivityAt ?? raw.createdAt,
		blocking: Boolean(raw.blocking),
		resolvedAt: raw.resolvedAt ?? null,
		title: raw.id,
		snippet: "",
		unread: false,
	};
}

export function useConversations(): UseConversationsResult {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [threads, setThreads] = useState<ThreadListEntry[]>([]);
	const [tick, setTick] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the manual refresh trigger and intentionally drives the effect.
	useEffect(() => {
		let aborted = false;
		setLoading(true);
		setError(null);
		fetch("/api/conversations")
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json: unknown = await res.json();
				const body = parseConversationsResponse(json);
				if (aborted) return;
				setThreads(body.threads.map(coerce));
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
	}, [tick]);

	// @lore L3 review (adversary C1): without a real-time subscription, the
	// queue would go stale after every verdict commit elsewhere in the app.
	// Lighter-weight gap-filler: refetch when the tab/window regains focus
	// or visibility. A WS subscription on the existing thread/response
	// topics is the right long-term fix; tracked as a follow-up. This
	// covers the 90% case (user comes back to the tab after acting in
	// another surface) without growing the L3 footprint.
	useEffect(() => {
		const refetch = (): void => setTick((t) => t + 1);
		const onVisibility = (): void => {
			if (document.visibilityState === "visible") refetch();
		};
		window.addEventListener("focus", refetch);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("focus", refetch);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return {
		loading,
		error,
		threads,
		refresh: () => setTick((t) => t + 1),
	};
}
