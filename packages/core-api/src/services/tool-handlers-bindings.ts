/**
 * `@hyperidle/tool-handlers`'s `ToolHandlersPorts` (Mechanism C), wired here
 * at the `packages/server` composition point — all targets (`work`, `users`,
 * `conversation`, `org`, `agent-selection`, `routine`, `dispatch`,
 * `knowledge`, `policy`) are real, already-migrated packages. Two call
 * shapes COLLAPSE (see `@hyperidle/tool-handlers`'s `ports.ts` top `@lore`):
 * `resolveReviewRecipientsForItem`/`persistScaffoldedAgents` (org),
 * `recomputeAttentionScoreForItem` (knowledge) — same idiom
 * `dispatch-bindings.ts`'s own `recomputeAttentionForCandidates` collapse
 * already established.
 *
 * @lore AU19 Increment 4: this module builds each bound singleton ONCE, at
 * the composition root, so every real call site (`session-lifecycle-bindings.ts`
 * via `tool-provider-bindings.ts`, `dispatch-bindings.ts`'s own `toolHandlers`
 * accessor) imports the already-wired result — same factory-curry idiom as
 * every other `*-bindings.ts` file in this directory.
 */

import type { ScaffoldRequest } from "@hyperidle/agent-selection";
import {
	findOrCreateDirectThread,
	getFirstThreadByHost,
	getThreadById,
	insertMessage,
	insertThread,
	listInboxBySenderExclusion,
	updateThread,
} from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { nextCronMatch, parseCron } from "@hyperidle/dispatch";
import {
	buildAttentionService,
	createKnowledgeConflict,
	create as createKnowledgeItem,
	findKnowledgeItemStatusById,
	findKnowledgeItemVersionById,
	findOpenConflictByItemAndProposer,
	promoteKnowledgeItem,
	search as searchKnowledge,
	upsertKnowledgeAppProjectionAttentionScore,
} from "@hyperidle/knowledge";
import {
	createTeam,
	createTeamMembersGroup,
	getTeamById,
	getTeamMembersById,
	getTeamMembersByTeamId,
	persistScaffoldedAgents as orgPersistScaffoldedAgents,
	resolveReviewRecipients,
	setTeamMembersLeadAgent,
} from "@hyperidle/org";
import {
	attentionReviewReasoningMarker,
	buildCreateReviewItemForKnowledge,
} from "@hyperidle/review";
import { getRoutineById, insertRoutine, updateRoutineById } from "@hyperidle/routine";
import type { EventBus } from "@hyperidle/shared";
import type { ToolHandlersPorts } from "@hyperidle/tool-handlers";
import { buildAllToolDefinitions } from "@hyperidle/tool-handlers";
import { getUserById, insertUser, listUsersByKind, listUsersByTeam } from "@hyperidle/users";
import {
	appendTaskNote,
	createArtifact,
	createBet,
	createTask,
	createItem as createWorkItem,
	findItemByReasoningMarker,
	getBetById,
	getItemById,
	getTaskById,
	routeItem,
	updateBetById,
	updateItemById,
	updateTaskById,
} from "@hyperidle/work";
import { agentSelectionService } from "./agent-selection-bindings.js";
import { provisionTeamRoutines as provisionTeamRoutinesBound } from "./dispatch-bindings.js";
import { handoff } from "./policy-bindings.js";

const orgUsersForScaffold = { getUserById, insertUser };

/**
 * @lore AU19 Increment 4: `dispatch-bindings.ts` imports `toolHandlersPorts`
 * from THIS module (to wire `dispatchPorts.toolHandlers`), so a direct
 * top-level read of `provisionTeamRoutinesBound` here would hit the ESM
 * temporal-dead-zone on whichever of these two composition-root modules
 * gets evaluated second. Deferring the read into a call-time closure (same
 * idiom `dispatch-bindings.ts`'s own `toolHandlers` port closures already
 * use for their own read of `toolHandlersPorts`) breaks the cycle: the
 * binding only needs to be initialized by the time `provisionTeamRoutines`
 * is actually CALLED, not at module-evaluation time.
 */
function provisionTeamRoutines(
	db: HyperIdleDb,
	opts: {
		readonly teamId: string;
		readonly ownerByRole: Partial<Record<string, string>>;
		readonly leadAgentId: string;
	},
): Promise<unknown> {
	return provisionTeamRoutinesBound(db, opts);
}

/**
 * `agentSelection`'s real `resolveAgentScaffoldSpecs` returns
 * `AgentScaffoldSpec[]` (concrete fields), but `ports.ts` declares this
 * port's return element as the opaque `Record<string, unknown>` (`specs`
 * is only ever piped opaquely through `persistScaffoldedAgents` — see this
 * file's own `@lore` on that function). Same "fresh object literal"
 * boundary-crossing as {@link searchKnowledgeForTool} below.
 */
async function resolveAgentScaffoldSpecsForTool(
	input: ScaffoldRequest,
): Promise<readonly Record<string, unknown>[]> {
	const specs = await agentSelectionService.resolveScaffoldSpecs(input);
	return specs.map((spec) => ({ ...spec }));
}

/**
 * Collapses `resolveReviewRecipients(db, ctx, {listUsersByKind})` — see
 * `@hyperidle/tool-handlers`'s `ports.ts` top `@lore`. `org`'s real
 * `resolveReviewRecipients` needs `OrgUserDirectory`'s `listUsersByKind`
 * (not `getUserById`) — matches `org`'s own `org-routing.ts` real usage.
 */
async function resolveReviewRecipientsForItem(
	db: HyperIdleDb,
	ctx: {
		readonly userId: string;
		readonly agentRole: string | undefined;
		readonly teamId: string | undefined;
	},
): Promise<readonly string[]> {
	return resolveReviewRecipients(db, ctx, { listUsersByKind });
}

/** Collapses `persistScaffoldedAgents(db, {getUserById,insertUser}, teamMembersId, specs)`. */
async function persistScaffoldedAgents(
	db: HyperIdleDb,
	teamMembersId: string | null,
	specs: readonly Record<string, unknown>[],
): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }> {
	// biome-ignore lint/suspicious/noExplicitAny: `specs` is opaquely piped through from `resolveAgentScaffoldSpecs`'s own real return type at this composition boundary — Mechanism C forbids tool-handlers from importing that type.
	return orgPersistScaffoldedAgents(db, orgUsersForScaffold, teamMembersId, specs as any);
}

/**
 * `tool-handlers`'s `ports.ts`'s `search` return element type is
 * `Record<string, unknown> & {layer?}` (opaque, since callers only ever
 * forward the whole item back to their own caller — see `ports.ts`'s own
 * `@lore`). `knowledge`'s real `search` returns concrete
 * `KnowledgeItemWithProjection[]` values, which do NOT structurally satisfy
 * an index-signature return type directly (`Record<string, unknown>` demands
 * an index signature the concrete interface lacks) — re-spreading each item
 * into a fresh object literal is the honest fix (a fresh literal DOES satisfy
 * an index-signature target; returning the typed value directly does not).
 */
async function searchKnowledgeForTool(
	db: HyperIdleDb,
	query: string,
	opts: { readonly limit: number },
): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>> {
	const results = await searchKnowledge(db, query, opts);
	return results.map((item) => ({ ...item }));
}

/**
 * Collapses `buildCreateReviewItemForKnowledge({conversation,work})` +
 * `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` — the
 * exact composition `dispatch-bindings.ts`'s own
 * `recomputeAttentionForCandidates` already performs (with `.recomputeScope`
 * instead of `.recomputeOne`).
 */
async function recomputeAttentionScoreForItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	knowledgeItemId: string,
): Promise<{ readonly current: number }> {
	const createReviewItemForKnowledge = buildCreateReviewItemForKnowledge({
		conversation: { insertThread },
		work: { createItem: createWorkItem },
	});
	return buildAttentionService({
		db,
		eventBus,
		work: { findItemByReasoningMarker },
		review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
	}).recomputeOne(knowledgeItemId);
}

const toolHandlersPorts: ToolHandlersPorts<HyperIdleDb> = {
	work: {
		getTaskById,
		getBetById,
		createBet,
		updateBetById,
		createTask,
		updateTaskById,
		appendTaskNote,
		getItemById,
		updateItemById,
		createItem: createWorkItem,
		routeItem,
		findItemByReasoningMarker,
		createArtifact,
	},
	users: { getUserById, listUsersByTeam },
	conversation: {
		getThreadById,
		insertThread,
		updateThread,
		insertMessage,
		listInboxBySenderExclusion,
		findOrCreateDirectThread,
		getFirstThreadByHost,
	},
	org: {
		getTeamById,
		getTeamMembersByTeamId,
		getTeamMembersById,
		createTeam,
		createTeamMembersGroup,
		setTeamMembersLeadAgent,
		resolveReviewRecipientsForItem,
		persistScaffoldedAgents,
	},
	agentSelection: { resolveAgentScaffoldSpecs: resolveAgentScaffoldSpecsForTool },
	routine: { insertRoutine, getRoutineById, updateRoutineById },
	dispatch: { nextCronMatch, parseCron, provisionTeamRoutines },
	knowledge: {
		search: searchKnowledgeForTool,
		create: createKnowledgeItem,
		findKnowledgeItemVersionById,
		findKnowledgeItemStatusById,
		findOpenConflictByItemAndProposer,
		createKnowledgeConflict,
		promoteKnowledgeItem,
		upsertKnowledgeAppProjectionAttentionScore,
		recomputeAttentionScoreForItem,
	},
	policy: { handoff },
};

/** Production-wired `ALL_TOOL_DEFINITIONS` — every real call site imports this. */
export const allToolDefinitions = buildAllToolDefinitions(toolHandlersPorts);

export { toolHandlersPorts };
