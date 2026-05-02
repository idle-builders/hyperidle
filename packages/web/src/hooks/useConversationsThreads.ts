/**
 * L8 — Conversations Submenu thread list hook.
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
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadItem } from "../components/ThreadSections";

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
}

export interface UseConversationsThreadsResult {
	status: "loading" | "ready" | "error";
	threads: ReadonlyArray<ThreadItem>;
	error: string | null;
	retry: () => void;
}

const FALLBACK_AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

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
		// L10 T11a: blocking is an optional additive — accept undefined OR a boolean.
		(v.blocking === undefined || typeof v.blocking === "boolean")
	);
}

function formatRelative(iso: string): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "";
	const diff = Date.now() - t;
	const m = Math.floor(diff / 60_000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	return `${d}d`;
}

function capitalize(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function rowToItem(row: ThreadListRow): ThreadItem {
	// @lore L8: title and snippet are placeholders. The /api/threads list
	// endpoint does not yet return a thread title or last-message preview;
	// follow-up story will surface real values. Until then the title is a
	// host-kind-derived stub and snippet is intentionally left blank so it
	// does not duplicate the timestamp on the right of the row.
	const relative = formatRelative(row.lastActiveAt);
	return {
		id: row.id,
		title: `${capitalize(row.hostKind)} thread ${row.id.slice(0, 8)}`,
		snippet: "",
		timestamp: relative,
		avatarUrl: FALLBACK_AVATAR,
		hostKind: row.hostKind,
		hasUnresolvedReview: row.hasUnresolvedReview,
		// @lore L10 §6 / T11a: forwards-compatible — when the wire row carries
		// `blocking`, trust it; otherwise default to false (preserves L8
		// behavior). Server schema unchanged in L10.
		blocking: typeof row.blocking === "boolean" ? row.blocking : false,
		pinned: row.pinned,
		resolvedAt: row.resolvedAt ?? undefined,
	};
}

export function useConversationsThreads(participantId: string): UseConversationsThreadsResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [threads, setThreads] = useState<ReadonlyArray<ThreadItem>>([]);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — bumping it via retry() re-runs the fetch.
	useEffect(() => {
		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const url = `/api/threads?participant_id=${encodeURIComponent(participantId)}&limit=50`;
				const res = await fetch(url, { signal: ac.signal });
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

	return { status, threads, error, retry };
}
