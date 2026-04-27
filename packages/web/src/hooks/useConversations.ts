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

function coerce(raw: RawThread): ThreadListEntry {
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
				const body = (await res.json()) as { threads: RawThread[] };
				if (aborted) return;
				setThreads((body.threads ?? []).map(coerce));
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
