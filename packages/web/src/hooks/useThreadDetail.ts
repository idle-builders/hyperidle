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

export interface ThreadDetail {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	headMessageId: string | null;
	identities: Record<string, { name: string; role?: string }>;
	artifactRef?: ArtifactRef;
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
	const identities: Record<string, { name: string; role?: string }> = {};
	for (const [k, v] of Object.entries(identitiesRaw)) {
		if (!isObject(v) || typeof v.name !== "string") continue;
		identities[k] = {
			name: v.name,
			...(typeof v.role === "string" ? { role: v.role } : {}),
		};
	}
	// Server already validates `thread` and each `message` via zod. We trust
	// the shape here and let runtime narrowing in ThreadShell handle the
	// per-payload type checks.
	return {
		thread: value.thread as unknown as Thread,
		messages: value.messages as unknown as ReadonlyArray<Message>,
		headMessageId,
		identities,
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
				const res = await fetch(`/api/threads/${threadId}`, { signal: ac.signal });
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

	return { status, data, error, retry };
}
