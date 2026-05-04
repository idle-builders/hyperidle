/**
 * L15 — Thin client wrapper around the existing /api/threads endpoints.
 *
 * @lore L15: no new server route. The server already supports
 * `host_kind=task` on GET /api/threads (routes/threads.ts:154) and
 * accepts arbitrary string `host_id` (no FK constraint, see L15-plan §12 A5).
 *
 * @lore L15 review C1+C2: the POST /api/threads body MUST include
 * `participants` (≥1) and `initialMessage` per createThreadBodySchema
 * (packages/server/src/routes/threads-schema.ts:115-121). The 201 response
 * shape is `{ thread: { id }, messages }`, NOT `{ id }`.
 *
 * @lore L15 review C3: outbound requests must carry `X-Identity` so the
 * server attributes the message to the right actor. We accept a
 * `fetchImpl` that the caller pre-wraps with `createActorFetch` from
 * `hooks/actor-fetch.ts` — this client is identity-agnostic by design.
 *
 * @lore L15 review C5: `findOrCreateTaskThread` is a read-then-write race.
 * Two concurrent clicks would both POST and create duplicate threads
 * (server has no `(host_kind, host_id)` uniqueness constraint — see
 * follow-ups.md `task-thread-uniqueness`). We coalesce concurrent calls
 * per-task with an in-flight Promise cache so a single client doesn't
 * race itself; cross-tab races remain a server-side gap.
 */
import type { TaskState } from "@hyperidle/shared";

const THREAD_ID_PATTERN = /^[A-Za-z0-9_:.-]{4,128}$/;

export interface TaskThreadHandle {
	readonly threadId: string;
}

export interface TaskThreadClient {
	findOrCreateTaskThread(taskId: string): Promise<TaskThreadHandle>;
	postPlainMessage(threadId: string, text: string, clientKey: string): Promise<void>;
}

interface ThreadListResponse {
	readonly threads: ReadonlyArray<{ readonly id: string }>;
}

interface ThreadCreateResponse {
	readonly thread: { readonly id: string };
}

/**
 * Returns the locked prose for a state-change request. Centralised so the
 * test and the menu agree on a single string per state.
 */
export function buildRequestStateText(targetState: TaskState): string {
	return `Requesting state change to ${targetState}.`;
}

/**
 * Maps known HTTP statuses to user-facing strings (W5: don't surface raw
 * server messages verbatim).
 */
function userMessageFor(status: number, fallback: string): string {
	if (status === 400) return "The request was rejected by the server.";
	if (status === 401 || status === 403) return "You are not allowed to perform this action.";
	if (status === 404) return "The task thread is no longer available.";
	if (status === 409) return "Conflict — please refresh and try again.";
	if (status === 429) return "Too many requests — please wait a moment.";
	if (status >= 500) return "The server is unavailable. Please retry shortly.";
	return fallback;
}

export class TaskThreadHttpError extends Error {
	readonly status: number;
	readonly userMessage: string;
	constructor(status: number, userMessage: string) {
		super(`HTTP ${status}: ${userMessage}`);
		this.status = status;
		this.userMessage = userMessage;
		this.name = "TaskThreadHttpError";
	}
}

/**
 * The default actor id used as the initiator for find-or-create. Must agree
 * with the X-Identity header sent by the wrapped fetch impl.
 */
const DEFAULT_INITIATOR_ID = "u-founder";

export interface TaskThreadClientOptions {
	/**
	 * The actor id stamped into the `participants` array on first thread
	 * creation. Should match the X-Identity header sent by `fetchImpl`.
	 * Defaults to `"u-founder"` (matches the server fallback).
	 */
	readonly initiatorId?: string;
}

export function createTaskThreadClient(
	fetchImpl: typeof globalThis.fetch,
	options: TaskThreadClientOptions = {},
): TaskThreadClient {
	const initiatorId = options.initiatorId ?? DEFAULT_INITIATOR_ID;

	// L15 review C5: per-task in-flight coalescing. Two concurrent calls for
	// the same task share a single Promise so we don't double-POST.
	const inFlight = new Map<string, Promise<TaskThreadHandle>>();

	function newClientKey(): string {
		return globalThis.crypto.randomUUID();
	}

	async function fetchOrThrow(
		input: RequestInfo | URL,
		init: RequestInit | undefined,
		fallback: string,
	): Promise<Response> {
		const res = await fetchImpl(input, init);
		if (!res.ok) {
			throw new TaskThreadHttpError(res.status, userMessageFor(res.status, fallback));
		}
		return res;
	}

	async function doFindOrCreate(taskId: string): Promise<TaskThreadHandle> {
		const listUrl = `/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`;
		const listRes = await fetchOrThrow(listUrl, undefined, "Failed to list task threads");
		const listBody = (await listRes.json()) as ThreadListResponse;
		if (listBody.threads.length > 0) {
			const id = listBody.threads[0].id;
			if (!THREAD_ID_PATTERN.test(id)) {
				throw new TaskThreadHttpError(502, "Server returned a malformed thread id.");
			}
			return { threadId: id };
		}
		const createRes = await fetchOrThrow(
			"/api/threads",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					hostKind: "task",
					hostId: taskId,
					participants: [initiatorId],
					initialMessage: {
						type: "plain",
						payload: { text: "Thread opened from Team Board" },
						clientKey: newClientKey(),
					},
				}),
			},
			"Failed to create task thread",
		);
		const createBody = (await createRes.json()) as ThreadCreateResponse;
		const newId = createBody?.thread?.id;
		if (!(newId && THREAD_ID_PATTERN.test(newId))) {
			throw new TaskThreadHttpError(502, "Server returned a malformed thread id.");
		}
		return { threadId: newId };
	}

	return {
		async findOrCreateTaskThread(taskId: string): Promise<TaskThreadHandle> {
			const cached = inFlight.get(taskId);
			if (cached) return cached;
			const promise = doFindOrCreate(taskId).finally(() => {
				inFlight.delete(taskId);
			});
			inFlight.set(taskId, promise);
			return promise;
		},

		async postPlainMessage(threadId: string, text: string, clientKey: string): Promise<void> {
			if (!THREAD_ID_PATTERN.test(threadId)) {
				throw new TaskThreadHttpError(400, "The task thread is no longer available.");
			}
			await fetchOrThrow(
				`/api/threads/${encodeURIComponent(threadId)}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "plain", payload: { text }, clientKey }),
				},
				"Failed to post message",
			);
		},
	};
}
