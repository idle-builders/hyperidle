/**
 * task-threads.ts — re-export shim for the generalised host-threads service.
 *
 * @lore L18 (M6): architecture said this file should be a shim pointing at
 * host-threads.ts. The original implementation has been moved into host-threads.ts.
 * Existing callers (TaskSheet, tests) compile unchanged via these re-exports.
 *
 * @lore L15: shape and lore comments were originally in this file. They are
 * preserved in host-threads.ts and apply equally to the shim callers.
 */

/**
 * @lore M3 D2: The placeholder agent participant id constant was deleted — callers
 * that have no agent yet pass null. Re-export removed so no consumer can accidentally
 * use the placeholder agent sentinel.
 */
export { postPlainHostMessage as postRequestMessage } from "./host-threads.js";

import { resolveOrCreateHostThread } from "./host-threads.js";

export function resolveOrCreateTaskThread(
	taskId: string,
	founderId: string,
	agentParticipantId: string | null,
): Promise<string> {
	return resolveOrCreateHostThread("task", taskId, founderId, agentParticipantId);
}
