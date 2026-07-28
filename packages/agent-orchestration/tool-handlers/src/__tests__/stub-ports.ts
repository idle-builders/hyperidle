/**
 * A minimal stub `ToolHandlersPorts` for tests that only need the tool
 * NAME/shape catalogue (`buildAllToolDefinitions(ports).map((d) => d.name)`)
 * and never actually invoke a port method. Every method throws if called —
 * a real behavior test must inject real (or per-test fake) ports instead.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { ToolHandlersPorts } from "../ports.js";

function notImplemented(): never {
	throw new Error("stub-ports: this port method is not implemented for name-catalogue tests");
}

export const STUB_TOOL_HANDLERS_PORTS: ToolHandlersPorts<HyperIdleDb> = {
	work: {
		routeItem: notImplemented,
	},
	agentSelection: { resolveScaffoldSpecs: notImplemented },
	dispatch: {
		provisionTeamRoutines: notImplemented,
	},
	knowledge: {
		search: notImplemented,
		create: notImplemented,
		findKnowledgeItemVersionById: notImplemented,
		findKnowledgeItemStatusById: notImplemented,
		findOpenConflictByItemAndProposer: notImplemented,
		createKnowledgeConflict: notImplemented,
		promoteKnowledgeItem: notImplemented,
		upsertKnowledgeAppProjectionAttentionScore: notImplemented,
		recomputeAttentionScoreForItem: notImplemented,
	},
	coreApi: {
		createBet: notImplemented,
		getTaskById: notImplemented,
		getBetById: notImplemented,
		updateBetById: notImplemented,
		createTask: notImplemented,
		appendTaskNote: notImplemented,
		getItemById: notImplemented,
		updateItemById: notImplemented,
		createItem: notImplemented,
		findItemByReasoningMarker: notImplemented,
		createArtifact: notImplemented,
		getUserById: notImplemented,
		listUsersByTeam: notImplemented,
		getThreadById: notImplemented,
		insertThread: notImplemented,
		updateThread: notImplemented,
		insertMessage: notImplemented,
		listInboxBySenderExclusion: notImplemented,
		findOrCreateDirectThread: notImplemented,
		getFirstThreadByHost: notImplemented,
		getTeamById: notImplemented,
		getTeamMembersByTeamId: notImplemented,
		getTeamMembersById: notImplemented,
		createTeam: notImplemented,
		updateTeam: notImplemented,
		resolveReviewRecipientsForItem: notImplemented,
		persistScaffoldedAgents: notImplemented,
		insertRoutine: notImplemented,
		getRoutineById: notImplemented,
		updateRoutineById: notImplemented,
		handoffTask: notImplemented,
	},
};
