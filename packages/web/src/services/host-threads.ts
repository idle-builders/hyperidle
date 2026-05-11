/**
 * host-threads.ts — L18 generalised host-thread service.
 *
 * Replaces / supersedes task-threads.ts. Exposes
 *  - resolveOrCreateHostThread(hostKind, hostId, founderId, agentParticipantId)
 *  - postPlainHostMessage(threadId, text, clientKey, blockId?)
 *
 * @lore L18: task-threads.ts is now a re-export shim pointing here. The old
 * postRequestMessage name was misleading (the message type is "plain", not
 * "request"); the L18 generalisation drops the misnomer. Existing TaskSheet
 * callers compile unchanged via the shim in task-threads.ts.
 *
 * @lore L18: The blockId field rides inside the plain-message payload (opaque
 * string to the server). Thread re-fetch picks up the new message;
 * messagesByBlockId recomputes; the Block re-renders the anchored slot.
 */

import type { HostKind } from "@hyperidle/shared";
import { apiFetch } from "./api-fetch.js";

/**
 * Resolves the host-attached thread. If one exists, returns its id.
 * If none exists, creates one (with an initial "Thread started." plain message)
 * and returns the new id.
 *
 * @lore M3 D1: agentParticipantId changed from `string` to `string | null`.
 * When null, the thread is created with only the founder as participant
 * (no "agent-unassigned" sentinel). PLACEHOLDER_AGENT_PARTICIPANT_ID is
 * deleted — callers that have no agent yet pass null.
 *
 * @lore URL construction uses encodeURIComponent(hostId) to protect against
 * ids ever containing & or #. UUIDs are safe today but the encoding is the
 * right habit.
 */
export async function resolveOrCreateHostThread(
	hostKind: HostKind,
	hostId: string,
	founderId: string,
	agentParticipantId: string | null,
): Promise<string> {
	const listUrl = `/api/threads?host_kind=${hostKind}&host_id=${encodeURIComponent(hostId)}`;
	const listResp = await apiFetch(listUrl);
	if (!listResp.ok) {
		throw new Error(`Failed to list threads for ${hostKind} ${hostId}: ${listResp.status}`);
	}
	const listData = (await listResp.json()) as { threads: Array<{ id: string }> };
	if (listData.threads.length > 0) {
		return listData.threads[0].id;
	}

	// Build participant list: always include the founder; include the agent only
	// when a real agent id is provided (null means "no agent assigned yet").
	const participants = agentParticipantId !== null ? [founderId, agentParticipantId] : [founderId];

	// No thread exists — create one.
	const createResp = await apiFetch("/api/threads", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			hostKind,
			hostId,
			participants,
			initialMessage: {
				type: "plain",
				payload: { text: "Thread started." },
				clientKey: crypto.randomUUID(),
			},
		}),
	});
	if (!createResp.ok) {
		throw new Error(`Failed to create thread for ${hostKind} ${hostId}: ${createResp.status}`);
	}
	const createData = (await createResp.json()) as { thread: { id: string } };
	return createData.thread.id;
}

/**
 * Posts a plain message on the given thread, optionally anchored to a block.
 *
 * @param blockId Optional block id for block-anchored discussions. Opaque to
 *   the server — forwarded verbatim in the payload. The rendering layer uses it
 *   to display the message inline after the anchored block.
 */
export async function postPlainHostMessage(
	threadId: string,
	text: string,
	clientKey: string,
	blockId?: string,
): Promise<void> {
	const payload: { text: string; blockId?: string } = { text };
	if (blockId !== undefined) {
		payload.blockId = blockId;
	}
	const resp = await apiFetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			type: "plain",
			payload,
			clientKey,
		}),
	});
	if (!resp.ok) {
		throw new Error(`Failed to post message to thread ${threadId}: ${resp.status}`);
	}
}
