/**
 * L8 — Conversations thread list hook.
 *
 * Fetches `GET /api/threads?participant_id=<id>&limit=50` and maps the
 * `ThreadListRow[]` server payload into `ThreadItem[]` (the shape consumed
 * by `ThreadSections`). Exposes loading/ready/error status + retry.
 *
 * @lore L8 §3.6: blocking is derived client-side as `false` for L8 — the
 * agent-session-state plumbing that drives true blocking lands later. The
 * classifier already keys off `?? false` so this is forwards-compatible.
 */
import type { HostKind } from "@hyperidle/shared";
import { relativeShort } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadItem } from "../components/ThreadSections";
import { apiFetch } from "../services/api-fetch.js";
import { getWsClient } from "../services/ws-client.js";

interface ThreadListRow {
	id: string;
	hostKind: HostKind;
	hostId: string;
	initiatorId: string;
	participants: ReadonlyArray<string>;
	pinned: boolean;
	resolvedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
	hasUnresolvedReview: boolean;
	/**
	 * @lore L10 §6 / T11a: optional wire field. Today's server schema does
	 * NOT emit `blocking`; tomorrow's might (when the agent-runtime plumbing
	 * for true blocking lands). The client guard accepts it as a backwards-
	 * compatible additive — when present, the hook trusts it; when absent,
	 * `false` is the safe default. Playwright fixtures use this to drive
	 * `blocking=true` rows without a server change.
	 */
	blocking?: boolean;
	/**
	 * AF14 AC1: Server-resolved human-readable title (batched, no N+1).
	 * Required after AF14 — the server always returns a title string.
	 * Optional guard for backward-compat with pre-AF14 snapshots.
	 */
	title?: string;
}

export interface UseConversationsThreadsResult {
	status: "loading" | "ready" | "error";
	threads: ReadonlyArray<ThreadItem>;
	error: string | null;
	retry: () => void;
}

// @lore M3 E1: The avatar fallback constant was deleted. rowToItem now passes null so ThreadRow
// renders an initials chip instead of a data: URI SVG fallback.

const HOST_KIND_SET: ReadonlySet<string> = new Set<string>([
	"bet",
	"task",
	"knowledge_item",
	"artifact",
	"agent",
	"user",
	"team",
	"factory",
] satisfies HostKind[]);

// @lore L8 review (Architecture M4): the canonical wire-row schema lives in
// `packages/server/src/routes/threads-schema.ts` (`threadListRowSchema` /
// `listThreadsResponseSchema`). The web package intentionally does not pull
// in `zod` for one fetch path, so this guard mirrors the exported schema's
// required fields. Fields are kept in lock-step with the server schema; the
// guard is the single client validation site.
function isThreadListRow(value: unknown): value is ThreadListRow {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.hostKind === "string" &&
		HOST_KIND_SET.has(v.hostKind) &&
		typeof v.hostId === "string" &&
		typeof v.initiatorId === "string" &&
		Array.isArray(v.participants) &&
		v.participants.every((p) => typeof p === "string") &&
		typeof v.pinned === "boolean" &&
		(v.resolvedAt === null || typeof v.resolvedAt === "string") &&
		typeof v.lastActiveAt === "string" &&
		typeof v.createdAt === "string" &&
		typeof v.hasUnresolvedReview === "boolean" &&
		(v.blocking === undefined || typeof v.blocking === "boolean") &&
		// AF14 AC1: server-resolved title — optional for backward-compat
		(v.title === undefined || typeof v.title === "string")
	);
}

function capitalize(s: string): string {
	if (s.length === 0) return s;
	// Guard: s.length > 0 proves s[0] is defined (noUncheckedIndexedAccess).
	const first = s[0];
	return first !== undefined ? first.toUpperCase() + s.slice(1) : s;
}

function rowToItem(row: ThreadListRow): ThreadItem {
	// AF14 AC1: use server-resolved title. Falls back to a typed stub if the
	// server predates AF14 (pre-AF14 responses omit `title`).
	// @lore L8: The L8 stub `${capitalize(hostKind)} thread ${id.slice(0,8)}`
	// is replaced by the server-resolved title from AF14 onwards.
	const title = row.title ?? `${capitalize(row.hostKind)} thread ${row.id.slice(0, 8)}`;
	const relative = relativeShort(row.lastActiveAt);
	return {
		id: row.id,
		title,
		snippet: "",
		timestamp: relative,
		// AF14 AC1: carry lastActiveAt as the ISO sort key for flat-list comparator.
		lastActiveAt: row.lastActiveAt,
		avatarUrl: null,
		hostKind: row.hostKind,
		hasUnresolvedReview: row.hasUnresolvedReview,
		blocking: row.blocking ?? false,
		pinned: row.pinned,
		resolvedAt: row.resolvedAt ?? undefined,
	};
}

/**
 * @lore N5: participantId is typed as `string | null | undefined` so callers
 * that hold `user?.id` (which is `string | undefined` when `user` is null) do
 * not need to coerce to an empty string. When participantId is falsy the hook
 * short-circuits to `{ status: "ready", threads: [] }` instead of sending
 * `?participant_id=` to the server — which would return a 400 "Missing scope"
 * error and display "Couldn't load threads" on a fresh install with no users.
 */
export function useConversationsThreads(
	participantId: string | null | undefined,
): UseConversationsThreadsResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">(
		participantId ? "loading" : "ready",
	);
	const [threads, setThreads] = useState<ReadonlyArray<ThreadItem>>([]);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — bumping it via retry() re-runs the fetch.
	useEffect(() => {
		// When there is no participant id (fresh install, user not yet set up),
		// return an empty ready state without hitting the API — which would return
		// a 400 "Missing scope" error and show "Couldn't load threads".
		if (!participantId) {
			setThreads([]);
			setStatus("ready");
			setError(null);
			return;
		}

		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const url = `/api/threads?participant_id=${encodeURIComponent(participantId)}&limit=50`;
				const res = await apiFetch(url, { signal: ac.signal });
				// @lore L8 review (Adversary B2): every state setter after an
				// `await` is guarded by `ac.signal.aborted`. The fetch's signal
				// is still respected by the runtime but a resolved-then-aborted
				// chain (rapid retry: prior fetch resolves, new fetch starts)
				// would otherwise stomp the latest cycle's `loading` state.
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const body = (await res.json()) as { threads?: unknown };
				if (ac.signal.aborted) return;
				if (!Array.isArray(body.threads)) {
					setError("Malformed response");
					setStatus("error");
					return;
				}
				const valid = body.threads.filter(isThreadListRow);
				setThreads(valid.map(rowToItem));
				setStatus("ready");
			} catch (cause) {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			}
		})();

		return () => {
			ac.abort();
		};
	}, [participantId, tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// Q1 review issue #6 / Task 16: subscribe to `thread_created` WS events so
	// the thread list auto-refreshes when a new thread is created.
	// @lore Q1: We bump the tick counter to trigger a re-fetch rather than
	// appending the event directly. This is simpler and guarantees the list
	// uses the same data transformation path (rowToItem) as the initial fetch.
	// A brief flash of the old list during the re-fetch is acceptable.
	// @lore AU21 Decision E / Increment 7: the server now forwards a minimal
	// invalidation envelope on "conversations" (`{ type: "invalidate", topic,
	// kind }`) instead of the full domain event — filter on `msg.kind`
	// instead of `msg.type`.
	useEffect(() => {
		const wsClient = getWsClient();
		const unsubscribe = wsClient.subscribe("conversations", (data) => {
			if (typeof data !== "object" || data === null) return;
			const msg = data as Record<string, unknown>;
			if (msg.type === "invalidate" && msg.kind === "thread_created") {
				setTick((n) => n + 1);
			}
		});
		return () => {
			unsubscribe();
		};
	}, []);

	return { status, threads, error, retry };
}
