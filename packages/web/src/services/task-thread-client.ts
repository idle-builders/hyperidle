/**
 * L15 — Thin client wrapper around the existing /api/threads endpoints.
 *
 * @lore L15: no new server route. The server already supports
 * `host_kind=task` on GET /api/threads (routes/threads.ts:154) and
 * accepts arbitrary string `host_id` (no FK constraint, see L15-plan §12 A5).
 * This wrapper exists so TaskActionsMenu can stay framework-thin and
 * unit-tests can inject a mock without touching the global fetch.
 */
import type { TaskState } from "@hyperidle/shared";

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
	readonly id: string;
}

/**
 * Returns the locked prose for a state-change request. Centralised so the
 * test and the menu agree on a single string per state.
 */
export function buildRequestStateText(targetState: TaskState): string {
	return `Requesting state change to ${targetState}.`;
}

export function createTaskThreadClient(fetchImpl: typeof globalThis.fetch): TaskThreadClient {
	return {
		async findOrCreateTaskThread(taskId: string): Promise<TaskThreadHandle> {
			const listUrl = `/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`;
			const listRes = await fetchImpl(listUrl);
			if (!listRes.ok) {
				throw new Error(`Failed to list task threads: HTTP ${listRes.status}`);
			}
			const listBody = (await listRes.json()) as ThreadListResponse;
			if (listBody.threads && listBody.threads.length > 0) {
				return { threadId: listBody.threads[0].id };
			}
			const createRes = await fetchImpl("/api/threads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hostKind: "task", hostId: taskId }),
			});
			if (!createRes.ok) {
				throw new Error(`Failed to create task thread: HTTP ${createRes.status}`);
			}
			const createBody = (await createRes.json()) as ThreadCreateResponse;
			return { threadId: createBody.id };
		},

		async postPlainMessage(threadId: string, text: string, clientKey: string): Promise<void> {
			const res = await fetchImpl(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "plain", payload: { text }, clientKey }),
			});
			if (!res.ok) {
				throw new Error(`Failed to post message: HTTP ${res.status}`);
			}
		},
	};
}
