/**
 * A minimal stub `ToolHandlersPorts` for tests that only need the tool
 * NAME/shape catalogue (`buildAllToolDefinitions(ports).map((d) => d.name)`)
 * and never actually invoke a port method. Every method throws if called —
 * a real behavior test must inject real (or per-test fake) ports instead.
 *
 * @lore BC3 architecture.md §5 B4: `gate`/`getItemById`/`updateItemById`/
 * `createItem`/`findSoleHumanUser`/`getThreadById`/`insertThread`/
 * `updateThread`/`insertMessage`/`findOrCreateDirectThread`/
 * `getFirstThreadByHost`/`resolveReviewRecipientsForItem` DELETED with
 * `send_message`/`reply`/`create_item`/`submit_review`.
 */
import type { ToolHandlersPorts } from "../ports.js";

function notImplemented(): never {
	throw new Error("stub-ports: this port method is not implemented for name-catalogue tests");
}

export const STUB_TOOL_HANDLERS_PORTS: ToolHandlersPorts = {
	coreApi: {
		openTask: notImplemented,
		getUserById: notImplemented,
		listUsersByTeam: notImplemented,
		getTeamById: notImplemented,
		getTeamMembersByTeamId: notImplemented,
		createTeam: notImplemented,
		updateTeam: notImplemented,
		scaffoldFromRequest: notImplemented,
		insertRoutine: notImplemented,
		getRoutineById: notImplemented,
		updateRoutineById: notImplemented,
		create: notImplemented,
		findKnowledgeItemVersionById: notImplemented,
		findKnowledgeItemStatusById: notImplemented,
		findKnowledgeItemParentById: notImplemented,
		findOpenConflictByItemAndProposer: notImplemented,
		createKnowledgeConflict: notImplemented,
		promoteKnowledgeItem: notImplemented,
		mergeKnowledgeItem: notImplemented,
		splitKnowledgeItem: notImplemented,
	},
};
