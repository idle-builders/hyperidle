/**
 * `@hyperidle/tool-handlers`'s `ToolHandlersPorts` (Mechanism C), wired here
 * at the `packages/server` composition point. There is no longer a
 * standalone same-process `work` DI capability — AU21 §6 Decision L3
 * deleted `routeItem` (the last one) outright as vestigial, not relocated.
 * `work`/`users`/`conversation`/`org`/`routine`/`policy.handoff`/`knowledge`
 * all cross the `CoreApiPort` seam instead (see `coreApi`'s own inline
 * `@lore` below).
 *
 * @lore AU19 Increment 4: this module builds each bound singleton ONCE, at
 * the composition root, so every real call site (`session-lifecycle-bindings.ts`
 * via `tool-provider-bindings.ts`, `dispatch-bindings.ts`'s own `toolHandlers`
 * accessor) imports the already-wired result — same factory-curry idiom as
 * every other `*-bindings.ts` file in this directory.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): the
 * standalone `routine: { provisionTeamRoutines }` same-process DI field is
 * GONE — `provisionTeamRoutines` moved onto `coreApi` (routes through the
 * seam like every other `create_team` step now), closing what the guard
 * flagged as a hidden `tool-handlers -> routine` composition-bundle edge
 * (a regression this same wave's `dispatch::routine` fix introduced by
 * relocating the underlying wiring here — see `ports.ts`'s `@lore` for the
 * full story).
 */

import type {
	CreateItemRequest,
	InsertRoutineRequest,
	UpdateRoutineRequest,
} from "@hyperidle/api-contract";
import { writeSessionNotes } from "@hyperidle/run-orchestration";
import type { ToolHandlersPorts } from "@hyperidle/tool-handlers";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import {
	buildCoreApiPort,
	getRegisteredCoreApiTransport,
	withActorTransport,
} from "./core-api-port-composition.js";

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

/**
 * Same audited-widen idiom as {@link widenCreateItemInput} — `ports.ts`'s
 * `ToolHandlersCoreApiAccessor.insertRoutine`/`updateRoutineById` keep the
 * opaque `Record<string, unknown>` shape (Mechanism C: `tool-handlers` never
 * imports `@hyperidle/api-contract`'s concrete request types), widened here
 * at the composition boundary to the seam's real wire types.
 */
function widenInsertRoutineInput(input: unknown): InsertRoutineRequest {
	return input as InsertRoutineRequest;
}

function widenUpdateRoutineInput(input: unknown): UpdateRoutineRequest {
	return input as UpdateRoutineRequest;
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

const toolHandlersPorts: ToolHandlersPorts = {
	// AU21 §6 Decision L3: `work.routeItem` (the last standalone same-process
	// `work` DI capability) is DELETED outright as vestigial — every `work`
	// read/write now crosses the `coreApi` seam below.
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
		findSoleHumanUser: (actorId) => seamPortForActor(actorId).users.findSoleHumanUser(),
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
		// AU21 §9 Increment 2 (org/routine/handoff wave): every former
		// `ToolHandlersOrgAccessor`/`ToolHandlersRoutineAccessor`/
		// `ToolHandlersPolicyAccessor.handoff` capability moved onto this seam —
		// see `ports.ts`'s `ToolHandlersCoreApiAccessor` doc comment.
		getTeamById: (teamId, actorId) => seamPortForActor(actorId).org.getTeamById(teamId),
		getTeamMembersByTeamId: (teamId, actorId) =>
			seamPortForActor(actorId).org.getTeamMembersByTeamId(teamId),
		getTeamMembersById: (teamMembersId, actorId) =>
			seamPortForActor(actorId).org.getTeamMembersById(teamMembersId),
		createTeam: (input, actorId) => seamPortForActor(actorId).org.createTeam(input),
		updateTeam: (teamId, patch, actorId) => seamPortForActor(actorId).org.updateTeam(teamId, patch),
		resolveReviewRecipientsForItem: (ctx, actorId) =>
			seamPortForActor(actorId).org.resolveReviewRecipientsForItem(ctx),
		persistScaffoldedAgents: (teamMembersId, specs, actorId) =>
			seamPortForActor(actorId).org.persistScaffoldedAgents(teamMembersId, specs),
		// AU21 §9 Increment 9 (forensic-triage wave, second pass): was an opaque
		// same-process `ToolHandlersRoutineAccessor`/`dispatch` pass-through —
		// now routes through the seam like every other `create_team` step
		// (backed by `POST /org/team-routines`, see `core-api-port.ts`'s
		// `CoreApiOrgPort.provisionTeamRoutines` doc comment).
		provisionTeamRoutines: (input, actorId) =>
			seamPortForActor(actorId).org.provisionTeamRoutines(input),
		insertRoutine: (input: Record<string, unknown>, actorId: string) =>
			seamPortForActor(actorId).routine.insertRoutine(widenInsertRoutineInput(input)),
		getRoutineById: (id, actorId) => seamPortForActor(actorId).routine.getRoutineById(id),
		updateRoutineById: (id: string, updates: Record<string, unknown>, actorId: string) =>
			seamPortForActor(actorId).routine.updateRoutineById(id, widenUpdateRoutineInput(updates)),
		handoffTask: (taskId, input, actorId) =>
			seamPortForActor(actorId).work.handoffTask(taskId, input),
		// AU21 §9 Increment 2 (knowledge wave): every former
		// `ToolHandlersKnowledgeAccessor` capability moved onto this seam —
		// see `ports.ts`'s `ToolHandlersCoreApiAccessor` doc comment.
		search: (query, opts, actorId) => seamPortForActor(actorId).knowledge.search(query, opts),
		create: (input, actorId) => seamPortForActor(actorId).knowledge.create(input),
		findKnowledgeItemVersionById: (id, actorId) =>
			seamPortForActor(actorId).knowledge.findKnowledgeItemVersionById(id),
		findKnowledgeItemStatusById: (id, actorId) =>
			seamPortForActor(actorId).knowledge.findKnowledgeItemStatusById(id),
		findOpenConflictByItemAndProposer: (itemId, proposedBy, actorId) =>
			seamPortForActor(actorId).knowledge.findOpenConflictByItemAndProposer(itemId, proposedBy),
		createKnowledgeConflict: (input, actorId) =>
			seamPortForActor(actorId).knowledge.createKnowledgeConflict(input),
		promoteKnowledgeItem: (input, actorId) =>
			seamPortForActor(actorId).knowledge.promoteKnowledgeItem(input),
		upsertKnowledgeAppProjectionAttentionScore: (knowledgeItemId, attentionScore, actorId) =>
			seamPortForActor(actorId).knowledge.upsertKnowledgeAppProjectionAttentionScore(
				knowledgeItemId,
				attentionScore,
			),
		recomputeAttentionScoreForItem: (knowledgeItemId, actorId) =>
			seamPortForActor(actorId).knowledge.recomputeAttentionScoreForItem(knowledgeItemId),
	},
	// Ruling 5: `run-orchestration` owns `sessions`, and this composition root
	// is where the tool's notes write meets its owner. Reaching a Service in
	// the other Layer from here is a known crossing; it is carried
	// deliberately and resolves with the layer-composition work package.
	sessions: { writeNotes: writeSessionNotes },
};

/** Production-wired tool definitions — every real call site imports this. */
export const allToolDefinitions = buildToolDefinitions(toolHandlersPorts);

export { toolHandlersPorts };
