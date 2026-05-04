/**
 * task-threads.ts — Pure helpers for the task ↔ thread API calls.
 *
 * Centralised here so TaskSheet stays presentation-focused and tests can
 * exercise the helpers directly without mounting the component tree.
 *
 * @lore `founderId` / `agentParticipantId` are pulled from the page's identity
 * context (or `'u-founder'` fallback used elsewhere — see `threads.ts:48`
 * `DEFAULT_FOUNDER_ID`). The agent participant is a placeholder until the
 * task→agent assignment lands; for L15 we accept a static fallback so the
 * request flow works end-to-end without blocking on the agent-assignment story.
 *
 * @lore Task ↔ thread resolution is N+1 for now — every Sheet open issues a
 * fresh GET. The list endpoint already supports `(host_kind=task, host_id=<id>)`
 * filtering and there is no caching layer in v1 beyond browser HTTP cache.
 * A bet-detail-style preload could come in L18, but for L15 the Sheet is
 * opened on demand and one round-trip is acceptable.
 */

/**
 * Static placeholder until task→agent assignment is wired (a separate
 * workpackage). Exported so tests and production code share the literal.
 */
export const PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned" as const;

/**
 * Resolves the task-attached thread. If one exists, returns its id.
 * If none exist, creates one (with an initial "Thread started." plain message)
 * and returns the new id.
 *
 * @lore URL construction uses `encodeURIComponent(taskId)` to protect against
 * task ids ever containing `&` or `#`. UUIDs are safe today but the encoding
 * is the right habit.
 */
export async function resolveOrCreateTaskThread(
	taskId: string,
	founderId: string,
	agentParticipantId: string,
): Promise<string> {
	const listUrl = `/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`;
	const listResp = await fetch(listUrl);
	if (!listResp.ok) {
		throw new Error(`Failed to list threads for task ${taskId}: ${listResp.status}`);
	}
	const listData = (await listResp.json()) as { threads: Array<{ id: string }> };
	if (listData.threads.length > 0) {
		return listData.threads[0].id;
	}

	// No thread exists — create one.
	const createResp = await fetch("/api/threads", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			hostKind: "task",
			hostId: taskId,
			participants: [founderId, agentParticipantId],
			initialMessage: {
				type: "plain",
				payload: { text: "Thread started." },
				clientKey: crypto.randomUUID(),
			},
		}),
	});
	if (!createResp.ok) {
		throw new Error(`Failed to create thread for task ${taskId}: ${createResp.status}`);
	}
	const createData = (await createResp.json()) as { thread: { id: string } };
	return createData.thread.id;
}

/**
 * Posts a plain request message on the given thread.
 * The `clientKey` is forwarded verbatim — the server's idempotency contract
 * deduplicates on `(threadId, senderId, clientKey)`.
 *
 * The `text` is sent as-is; the rendering layer owns HTML escaping.
 * (See architecture §Security: input trust boundary.)
 */
export async function postRequestMessage(
	threadId: string,
	text: string,
	clientKey: string,
): Promise<void> {
	const resp = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			type: "plain",
			payload: { text },
			clientKey,
		}),
	});
	if (!resp.ok) {
		throw new Error(`Failed to post message to thread ${threadId}: ${resp.status}`);
	}
}
