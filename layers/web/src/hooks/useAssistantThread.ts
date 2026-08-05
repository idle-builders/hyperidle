/**
 * AD8b — useAssistantThread hook
 *
 * Fetches (or creates) the current user's assistant thread via
 * GET /api/threads/assistant.
 * Exposes status/data/error/retry/refresh for rendering in AssistantOverlay.
 *
 * @lore AD8b: Renamed from useCocThread → useAssistantThread.
 * Fetch path changed from /api/threads/coach → /api/threads/assistant.
 */

import type { Message, Thread } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { getWsClient } from "../services/ws-client.js";

export interface AssistantThreadData {
	thread: Thread;
	messages: ReadonlyArray<Message>;
	identities: Record<string, { name: string; role?: string; isAgent?: boolean }>;
}

export type AssistantThreadStatus = "loading" | "ready" | "error";

export interface AssistantThreadState {
	status: AssistantThreadStatus;
	data: AssistantThreadData | null;
	error: string | null;
	retry: () => void;
	/** Refreshes messages without full reload (bumps tick). */
	refresh: () => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeAssistantThreadResponse(value: unknown): AssistantThreadData {
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
	const identities: Record<string, { name: string; role?: string; isAgent?: boolean }> = {};
	for (const [k, v] of Object.entries(identitiesRaw)) {
		if (!isObject(v) || typeof v.name !== "string") continue;
		identities[k] = {
			name: v.name,
			...(typeof v.role === "string" ? { role: v.role } : {}),
			...(v.isAgent === true ? { isAgent: true } : {}),
		};
	}
	// `value.thread` is narrowed to Record<string,unknown> by the isObject guard.
	// We widen to `object` (an honest upcast — all objects satisfy `object`) then
	// narrow to Thread (structurally plausible to TS). No `unknown` intermediary:
	// `unknown` loses all type information while `object` retains the non-primitive
	// constraint. Server validates via zod so the runtime shape is correct.
	return {
		thread: value.thread as object as Thread,
		messages: value.messages as ReadonlyArray<Message>,
		identities,
	};
}

/**
 * Apply a pushed CHANGED RECORD directly onto `AssistantThreadData` state —
 * never a refetch (AU21 §6 Decision L4 / §9 Increment 14d). Pulled out of
 * the WS subscribe callback (a module-level pure function, not a nested
 * closure) to keep the callback itself simple.
 */
function applyAssistantThreadPush(
	prev: AssistantThreadData | null,
	kind: unknown,
	data: Record<string, unknown>,
): AssistantThreadData | null {
	if (!prev) return prev;
	if (kind === "thread_message_appended") {
		const message = data.message as Message | undefined;
		if (!message) return prev;
		// Idempotent: a reconnect/duplicate frame must not double-append.
		if (prev.messages.some((m) => m.id === message.id)) return prev;
		const senderIdentity = data.senderIdentity as
			| { name: string; role?: string; isAgent?: boolean }
			| undefined;
		return {
			...prev,
			messages: [...prev.messages, message],
			identities: senderIdentity
				? { ...prev.identities, [message.senderId]: senderIdentity }
				: prev.identities,
		};
	}
	if (kind === "thread_resolved" || kind === "thread_reopened") {
		const resolvedAt = data.resolvedAt;
		if (typeof resolvedAt !== "string" && resolvedAt !== null) return prev;
		return { ...prev, thread: { ...prev.thread, resolvedAt } };
	}
	return prev;
}

export function useAssistantThread(): AssistantThreadState {
	const [status, setStatus] = useState<AssistantThreadStatus>("loading");
	const [data, setData] = useState<AssistantThreadData | null>(null);
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
				const res = await apiFetch("/api/threads/assistant", { signal: ac.signal });
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const body = decodeAssistantThreadResponse(await res.json());
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

	// AH3: Subscribe to per-thread WS channel so assistant replies appear
	// without manual reload. Mirrors useThreadDetail.ts WS subscription pattern.
	// @lore AH3: WS is unavailable in JSDOM — mocked in test-setup.ts.
	// Thread ID is available only after the first fetch succeeds (data?.thread.id).
	// @lore AU21 §6 Decision L4 / §9 Increment 14d: the server now pushes the
	// CHANGED RECORD (`{ type: "update", topic, kind, data }`), not an
	// invalidate ping — the founder: "there is no refetch … core submits the
	// changed version." This effect applies the pushed data directly instead
	// of bumping `tick` to trigger a second fetch.
	useEffect(() => {
		const threadId = data?.thread.id;
		if (!threadId) return;
		const ws = getWsClient();
		const topic = `thread:${threadId}`;
		const unsubscribe = ws.subscribe(topic, (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== topic) return;
			const payload = msg.data;
			if (typeof payload !== "object" || payload === null) return;
			setData((prev) =>
				applyAssistantThreadPush(prev, msg.kind, payload as Record<string, unknown>),
			);
		});
		return unsubscribe;
	}, [data?.thread.id]);

	return { status, data, error, retry, refresh };
}

// ---------------------------------------------------------------------------
// Backward-compat: old tests and stories may import useCocThread.
// ---------------------------------------------------------------------------
// @lore AD8b: Old Coc* aliases removed. Old CocOverlay.tsx/CocContext.tsx re-export
// from this module via their own files.
// ---------------------------------------------------------------------------
