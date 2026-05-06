/**
 * L21 — useCocThread hook
 *
 * Fetches (or creates) the current user's coach thread via GET /api/threads/coach.
 * Exposes status/data/error/retry/refresh for rendering in CocOverlay.
 *
 * @lore L21: The coach thread is fetched LAZILY — only when CocOverlay mounts
 * (i.e., when the overlay is opened for the first time). No polling: messages
 * are fetched once on open. Real-time updates via WebSocket are out of scope
 * for L21 (follow-up story).
 */

import type { Message, Thread } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CocThreadData {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	identities: Record<string, { name: string; role?: string }>;
}

export type CocThreadStatus = "loading" | "ready" | "error";

export interface CocThreadState {
	status: CocThreadStatus;
	data: CocThreadData | null;
	error: string | null;
	retry: () => void;
	/** Refreshes messages without full reload (bumps tick). */
	refresh: () => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeCocThreadResponse(value: unknown): CocThreadData {
	if (!isObject(value)) {
		throw new Error("Response is not an object");
	}
	if (!isObject(value.thread)) {
		throw new Error("Missing thread");
	}
	if (!Array.isArray(value.messages)) {
		throw new Error("Missing messages array");
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
	return {
		thread: value.thread as unknown as Thread,
		messages: value.messages as unknown as ReadonlyArray<Message>,
		identities,
	};
}

export function useCocThread(): CocThreadState {
	const [status, setStatus] = useState<CocThreadStatus>("loading");
	const [data, setData] = useState<CocThreadData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentional — bumping it via retry/refresh re-runs the fetch.
	useEffect(() => {
		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);
		setData(null);

		(async (): Promise<void> => {
			try {
				const res = await fetch("/api/threads/coach", { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const body = decodeCocThreadResponse(await res.json());
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
	}, [tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	const refresh = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	return { status, data, error, retry, refresh };
}
