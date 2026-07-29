/**
 * L9 — Thread detail fetch hook.
 *
 * Extracts the fetch + decodeThreadDetail + AbortController lifecycle
 * that previously lived inside ConversationsReview.tsx. Exposes a typed
 * status discriminant so callers can branch on "not-found" explicitly
 * (previously was a stringly-compared error message — now a first-class status).
 *
 * @lore L9: "not-found" is a distinct status (not a sub-case of "error")
 * because the page renders a different EmptyState for 404 vs network/5xx.
 * Promoting it to a typed status makes the page's state machine closed and
 * TypeScript-verifiable — you cannot accidentally render the wrong state
 * because the discriminant is exhaustive.
 */

import type { ArtifactRef, Message, Thread } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { getWsClient } from "../services/ws-client.js";

export interface ThreadDetail {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	headMessageId: string | null;
	/** AE5: Extended identities map including isAgent and operationalStatus for AI users. */
	identities: Record<
		string,
		{ name: string; role?: string; isAgent?: boolean; operationalStatus?: string }
	>;
	artifactRef?: ArtifactRef;
	/** AE5: Host entity title for context link. Null when unresolvable. */
	hostTitle?: string | null;
}

export type ThreadDetailStatus = "loading" | "ready" | "error" | "not-found";

export interface ThreadDetailState {
	status: ThreadDetailStatus;
	data: ThreadDetail | null;
	/** Human-readable error message (non-null only when status === "error"). */
	error: string | null;
	retry: () => void;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

class ThreadDetailDecodeError extends Error {
	constructor(reason: string) {
		super(`thread detail decode: ${reason}`);
		this.name = "ThreadDetailDecodeError";
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeThreadDetail(value: unknown): ThreadDetail {
	if (!isObject(value)) {
		throw new ThreadDetailDecodeError("response is not an object");
	}
	if (!isObject(value.thread)) {
		throw new ThreadDetailDecodeError("missing thread");
	}
	if (!Array.isArray(value.messages)) {
		throw new ThreadDetailDecodeError("missing messages array");
	}
	const headMessageId = value.headMessageId;
	if (typeof headMessageId !== "string" && headMessageId !== null) {
		throw new ThreadDetailDecodeError("invalid headMessageId");
	}
	const identitiesRaw = isObject(value.identities) ? value.identities : {};
	const identities: Record<
		string,
		{ name: string; role?: string; isAgent?: boolean; operationalStatus?: string }
	> = {};
	for (const [k, v] of Object.entries(identitiesRaw)) {
		if (!isObject(v) || typeof v.name !== "string") continue;
		identities[k] = {
			name: v.name,
			...(typeof v.role === "string" ? { role: v.role } : {}),
			// AE5: optional extended fields for presence indicators
			...(v.isAgent === true ? { isAgent: true } : {}),
			...(typeof v.operationalStatus === "string"
				? { operationalStatus: v.operationalStatus }
				: {}),
		};
	}
	// AE5: hostTitle for context link in Conversations header.
	const hostTitle =
		typeof value.hostTitle === "string"
			? value.hostTitle
			: value.hostTitle === null
				? null
				: undefined;

	// Server already validates `thread` and each `message` via zod. We trust
	// the shape here and let runtime narrowing in ThreadShell handle per-payload
	// type checks. `value.thread` is narrowed to Record<string,unknown> by the
	// isObject guard; we widen to `object` first (an honest upcast — all objects
	// satisfy `object`) then narrow to Thread (which TS accepts as structurally
	// plausible). No `unknown` intermediary — `unknown` loses ALL type information
	// while `object` retains the non-primitive constraint.
	return {
		thread: value.thread as object as Thread,
		messages: value.messages as ReadonlyArray<Message>,
		headMessageId,
		identities,
		hostTitle,
	};
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useThreadDetail(threadId: string): ThreadDetailState {
	const [status, setStatus] = useState<ThreadDetailStatus>("loading");
	const [data, setData] = useState<ThreadDetail | null>(null);
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
		setData(null);

		(async (): Promise<void> => {
			try {
				const res = await apiFetch(`/api/threads/${threadId}`, { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (res.status === 404) {
					setStatus("not-found");
					return;
				}
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const body = decodeThreadDetail(await res.json());
				if (ac.signal.aborted) return;
				setData(body);
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
	}, [threadId, tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// AF14 AC3: Subscribe to the per-thread WS channel so replies appear
	// without a manual reload. Mirrors `useConversationsThreads.ts:213-225`.
	// The `thread:<id>` channel is already broadcast + participant-authorized
	// server-side (ws-broadcaster.ts:71, :258-268). We bump tick to re-fetch
	// via the existing tick path (same approach as useConversationsThreads).
	// @lore AF14: WS is unavailable in JSDOM — mock ws-client in tests per
	// the global mock in test-setup.ts (`./services/ws-client.js` path).
	// @lore AU21 Decision E / Increment 7: the server now forwards a minimal
	// invalidation envelope on `thread:<id>` (`{ type: "invalidate", topic,
	// kind, id }`) instead of the full domain event — filter on
	// `msg.kind`/`msg.id` instead of `msg.type`/`msg.threadId`.
	useEffect(() => {
		const ws = getWsClient();
		const unsubscribe = ws.subscribe(`thread:${threadId}`, (data) => {
			if (typeof data !== "object" || data === null) return;
			const msg = data as Record<string, unknown>;
			if (
				msg.type === "invalidate" &&
				msg.id === threadId &&
				(msg.kind === "thread_message_appended" ||
					msg.kind === "thread_resolved" ||
					msg.kind === "thread_reopened")
			) {
				setTick((n) => n + 1);
			}
		});
		return unsubscribe;
	}, [threadId]);

	return { status, data, error, retry };
}
