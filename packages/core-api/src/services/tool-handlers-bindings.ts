/**
 * `@hyperidle/tool-handlers`'s `ToolHandlersPorts` (Mechanism C), wired here
 * at the `packages/server` composition point — all remaining targets (`org`,
 * `agent-selection`, `routine`, `dispatch`, `knowledge`, `policy`) are real,
 * already-migrated packages. `work`/`users`/`conversation` all cross the
 * `CoreApiPort` seam instead (see `coreApi`'s own inline `@lore` below). Two
 * call shapes COLLAPSE (see `@hyperidle/tool-handlers`'s `ports.ts` top `@lore`):
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

import type { CreateItemRequest } from "@hyperidle/api-contract";
import { insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import {
	create as createKnowledgeItem,
	findOpenConflict as findOpenKnowledgeConflict,
	get as getKnowledgeItem,
	transition as knowledgeTransition,
	recomputeAttention,
	recordConflict as recordKnowledgeConflict,
	search as searchKnowledge,
} from "@hyperidle/knowledge";
import {
	createTeam,
	getTeam,
	getTeamMembers,
	persistScaffoldedAgents as orgPersistScaffoldedAgents,
	resolveReviewRecipients,
	updateTeam,
} from "@hyperidle/org";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import { getRoutine, insertRoutine, updateRoutine } from "@hyperidle/routine";
import type { EventBus } from "@hyperidle/shared";
import type { ToolHandlersPorts } from "@hyperidle/tool-handlers";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { routeItem } from "@hyperidle/work";
import { agentSelectionService } from "./agent-selection-bindings.js";
import {
	buildCoreApiPort,
	getRegisteredCoreApiTransport,
	withActorTransport,
} from "./core-api-port-composition.js";
import { dispatchOps } from "./dispatch-bindings.js";
import { handoff } from "./policy-bindings.js";

const orgUsersForScaffold = {
	getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }),
	insertUser,
};

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
	return dispatchOps.provisionTeamRoutines(db, opts);
}

/**
 * `agentSelection`'s real `resolveScaffoldSpecs` returns
 * `AgentScaffoldSpec[]` (concrete fields), but `ports.ts` declares this
 * port's return element as the opaque `Record<string, unknown>` (`specs`
 * is only ever piped opaquely through `persistScaffoldedAgents` — see this
 * file's own `@lore` on that function). Same "fresh object literal"
 * boundary-crossing as {@link searchKnowledgeForTool} below.
 */
/**
 * AU21 §9 Increment 1/2: builds a fresh in-process `CoreApiPort` per call,
 * wrapped with the CALLING agent's own identity as the route actor (§12) —
 * never a fixed actor, since a different tool call may come from a
 * different agent. `getRegisteredCoreApiTransport()` reads the transport
 * registered once at boot (`server-factory.ts`) or per-test (integration
 * test fixtures). Every `ToolHandlersCoreApiAccessor` binding below builds
 * its own port from this one factory — the seam never caches a port across
 * calls (§12's actor-per-call requirement).
 */
function seamPortForActor(actorId: string): ReturnType<typeof buildCoreApiPort> {
	const transport = withActorTransport(getRegisteredCoreApiTransport(), { userId: actorId });
	return buildCoreApiPort(transport);
}

/**
 * The ONE audited cast recovering `CreateItemRequest` from `create_item`'s
 * Mechanism-C-narrowed `Record<string, unknown>` input — the SAME real
 * object `tool-definitions.ts` built, only its TYPE was narrowed crossing
 * the `ToolHandlersCoreApiAccessor` boundary. `input`'s parameter type is
 * `unknown` (not a cast expression) so this is a single, contained
 * assertion — `design/no-unknown-cast` bans the `X as unknown as T`
 * double-assertion shape, not an audited single cast inside a named helper
 * (same idiom as `run-orchestration-composition.ts`'s `widenWorkerRegistration`).
 */
function widenCreateItemInput(input: unknown): CreateItemRequest {
	return input as CreateItemRequest;
}

function createBetThroughCoreApiPort(
	input: {
		readonly teamId: string;
		readonly description: string;
		readonly doneCondition: string | null;
		readonly hypothesis: string | null;
	},
	actorId: string,
): Promise<{ readonly id: string; readonly teamId: string; readonly status: string }> {
	return seamPortForActor(actorId).work.createBet({
		teamId: input.teamId,
		description: input.description,
		doneCondition: input.doneCondition ?? undefined,
		hypothesis: input.hypothesis ?? undefined,
	});
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
	return resolveReviewRecipients(db, ctx, {
		listUsersByKind: (db2, kind) => listUsers(db2, { kind }),
	});
}

/** Collapses `persistScaffoldedAgents(db, {getUserById,insertUser}, teamMembersId, specs)`. */
async function persistScaffoldedAgents(
	db: HyperIdleDb,
	teamMembersId: string | null,
	specs: readonly Record<string, unknown>[],
): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }> {
	// biome-ignore lint/suspicious/noExplicitAny: `specs` is opaquely piped through from `resolveScaffoldSpecs`'s own real return type at this composition boundary — Mechanism C forbids tool-handlers from importing that type.
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
	const createReviewItemForKnowledge = createReviewItem({
		conversation: { insertThread },
		work: { createItem: (exec, values) => work.create(exec, "item", values) },
	});
	const result = await recomputeAttention(
		{
			db,
			eventBus,
			work: {
				findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
					const rows = await work.list(exec, "item", { marker });
					return rows[0] ? { id: rows[0].id } : undefined;
				},
			},
			review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
		},
		{ itemId: knowledgeItemId },
	);
	if (Array.isArray(result) || !("current" in result))
		throw new Error("unexpected attention result");
	return result;
}

const toolHandlersPorts: ToolHandlersPorts<HyperIdleDb> = {
	// AU21 §9 Increment 2: `routeItem` is the ONLY `work` capability left as
	// ordinary same-process DI — every read/write moved onto the `coreApi`
	// seam below (see `ports.ts`'s `ToolHandlersWorkAccessor` doc comment).
	work: { routeItem },
	org: {
		// @lore AU20 Am7: per-WHERE accessors replaced by parameterized API; adapters bridge the port interface.
		getTeamById: (db: HyperIdleDb, teamId: string) => getTeam(db, { id: teamId }),
		getTeamMembersByTeamId: (db: HyperIdleDb, teamId: string) => getTeamMembers(db, { teamId }),
		getTeamMembersById: (db: HyperIdleDb, teamMembersId: string) =>
			getTeamMembers(db, { id: teamMembersId }),
		createTeam,
		updateTeam,
		resolveReviewRecipientsForItem,
		persistScaffoldedAgents,
	},
	agentSelection: {
		resolveScaffoldSpecs: async (input) =>
			(await agentSelectionService.resolveScaffoldSpecs(input)).map((spec) => ({ ...spec })),
	},
	routine: { insertRoutine, getRoutineById: getRoutine, updateRoutineById: updateRoutine },
	dispatch: { provisionTeamRoutines },
	knowledge: {
		search: searchKnowledgeForTool,
		create: createKnowledgeItem,
		// @lore AU20 Ag7a: findKnowledgeItemVersionById and findKnowledgeItemStatusById
		// retired from the knowledge barrel (simple-duplicate functions superseded by
		// findById). Adapted here at the composition boundary — findById returns the
		// full KnowledgeItem (structurally compatible with both port shapes).
		findKnowledgeItemVersionById: async (db, id) => {
			const item = await getKnowledgeItem(db, id);
			return item ?? undefined;
		},
		findKnowledgeItemStatusById: async (db, id) => {
			const item = await getKnowledgeItem(db, id);
			return item ?? undefined;
		},
		// @lore AU20 K2-writes: createKnowledgeConflict/findOpenConflictByItemAndProposer deleted
		// from barrel; wired here via recordConflict/findOpenConflict adapters.
		// findOpenConflict returns null instead of undefined; adapter maps null → undefined
		// to match the port interface (ToolHandlersKnowledgeAccessor) which expects undefined.
		findOpenConflictByItemAndProposer: async (db, itemId, proposedBy) =>
			(await findOpenKnowledgeConflict(db, itemId, proposedBy)) ?? undefined,
		createKnowledgeConflict: (db, input) => recordKnowledgeConflict(db, input),
		// @lore AU20 K2-writes: promoteKnowledgeItem deleted from barrel; wired here
		// via transition({target:"promote",...}) — same transactional gate logic.
		promoteKnowledgeItem: async (db, input) =>
			knowledgeTransition(db, input.knowledgeItemId, {
				target: "promote",
				fromStatus: input.fromStatus,
				toStatus: input.toStatus,
				reason: input.reason,
				editor: input.editor,
			}),
		upsertKnowledgeAppProjectionAttentionScore: (db, knowledgeItemId, attentionScore) =>
			knowledgeTransition(db, knowledgeItemId, {
				target: "recomputeAttention",
				attentionScore: Number(attentionScore),
			}),
		recomputeAttentionScoreForItem,
	},
	policy: { handoff },
	coreApi: {
		createBet: createBetThroughCoreApiPort,
		getTaskById: (id, actorId) => seamPortForActor(actorId).work.getTaskById(id),
		getBetById: (id, actorId) => seamPortForActor(actorId).work.getBetById(id),
		updateBetById: (id, updates, actorId) =>
			seamPortForActor(actorId).work.updateBetById(id, updates),
		createTask: (input, actorId) => seamPortForActor(actorId).work.createTask(input),
		appendTaskNote: (taskId, entry, actorId) =>
			seamPortForActor(actorId).work.appendTaskNote(taskId, entry),
		getItemById: (id, actorId) => seamPortForActor(actorId).work.getItemById(id),
		updateItemById: (id, updates, actorId) =>
			seamPortForActor(actorId).work.updateItemById(id, updates),
		// @lore AU20 Ag5c precedent (now seam-crossed): tool-handlers port uses
		// Record<string,unknown> for createItem — widen to the seam's
		// CreateItemRequest at the composition boundary via `widenCreateItemInput`
		// (Mechanism C: tool-handlers never imports @hyperidle/api-contract's
		// concrete request type; single audited cast inside a named helper,
		// not an `X as unknown as T` double-assertion — `design/no-unknown-cast`).
		createItem: (input: Record<string, unknown>, actorId: string) =>
			seamPortForActor(actorId).work.createItem(widenCreateItemInput(input)),
		findItemByReasoningMarker: (marker, actorId) =>
			seamPortForActor(actorId).work.findItemByReasoningMarker(marker),
		createArtifact: (input, actorId) => seamPortForActor(actorId).work.createArtifact(input),
		getUserById: (id, actorId) => seamPortForActor(actorId).users.getUserById(id),
		listUsersByTeam: (teamMembersId, actorId) =>
			seamPortForActor(actorId).users.listUsersByTeam(teamMembersId),
		// AU21 §9 Increment 2 (conversation wave): every former
		// `ToolHandlersConversationAccessor` capability moved onto this seam —
		// see `ports.ts`'s `ToolHandlersCoreApiAccessor` doc comment.
		getThreadById: (id, actorId) => seamPortForActor(actorId).conversation.getThreadById(id),
		insertThread: (input, actorId) => seamPortForActor(actorId).conversation.insertThread(input),
		updateThread: (id, updates, actorId) =>
			seamPortForActor(actorId).conversation.updateThread(id, updates),
		insertMessage: (input, actorId) => seamPortForActor(actorId).conversation.insertMessage(input),
		listInboxBySenderExclusion: (limit, actorId) =>
			seamPortForActor(actorId).conversation.listInboxBySenderExclusion(limit),
		findOrCreateDirectThread: (recipientId, actorId) =>
			seamPortForActor(actorId).conversation.findOrCreateDirectThread(recipientId),
		getFirstThreadByHost: (hostKind, hostId, actorId) =>
			seamPortForActor(actorId).conversation.getFirstThreadByHost(hostKind, hostId),
	},
};

/** Production-wired tool definitions — every real call site imports this. */
export const allToolDefinitions = buildToolDefinitions(toolHandlersPorts);

export { toolHandlersPorts };
