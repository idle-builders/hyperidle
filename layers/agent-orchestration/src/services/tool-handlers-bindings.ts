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
 * the composition root, so every real call site (AU31 §2.5: the relocated
 * `run-orchestration-composition.ts`'s tool-provider composition, formerly
 * `tool-provider-bindings.ts`, now dissolved) imports the already-wired
 * result — same factory-curry idiom as every other `*-bindings.ts` file in
 * this directory.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): the
 * standalone `routine: { provisionTeamRoutines }` same-process DI field is
 * GONE — `provisionTeamRoutines` moved onto `coreApi` (routes through the
 * seam like every other `create_team` step now), closing what the guard
 * flagged as a hidden `tool-handlers -> routine` composition-bundle edge
 * (a regression this same wave's `dispatch::routine` fix introduced by
 * relocating the underlying wiring here — see `ports.ts`'s `@lore` for the
 * full story).
 *
 * @lore AU31 §3.2 clause 7 / B2: `toolHandlersPorts` and `allToolDefinitions`
 * were module-level constants closing over the `CoreApiPort` ambient global
 * (`getRegisteredCoreApiTransport()`, read lazily inside each field's
 * closure at call time). Once the ambient global is deleted (§3.2), the
 * `CoreApiTransport` value has to be threaded in from outside — so both
 * become factories, `buildToolHandlersPorts(transport)` /
 * `buildToolDefinitions(transport)`, each closing over the ONE transport
 * value the caller hands in. A composition root builds it once per
 * composition (§3.2 clause 1); a test builds it once per test off that
 * test's own `app` (§3.2 clause 6's fixture shape, mirrored per-file here
 * since this factory has no shared fixture of its own).
 *
 * @lore AU31 §2.5/§5: relocated from `layers/core-api/src/services/
 * tool-handlers-bindings.ts` — `@hyperidle/tool-handlers`/
 * `@hyperidle/run-orchestration` are agent-orchestration's own Services, so
 * this composition of an orchestration Service's ports is in-layer here,
 * closing the crossing the file's old home had. The tool implementations
 * already reach core exclusively through the `CoreApiPort` seam below, so
 * the move changes no conversation, only which layer hosts the wiring.
 */

import type {
	CoreApiPort,
	CoreApiTransport,
	InsertRoutineRequest,
	UpdateRoutineRequest,
} from "@hyperidle/api-contract";
import type { ToolHandlersPorts } from "@hyperidle/tool-handlers";
import { buildToolDefinitions as buildToolDefinitionsFromPorts } from "@hyperidle/tool-handlers";
import { buildCoreApiPort, withActorTransport } from "./core-api-port-composition.js";

// There is no `widenCreateItemInput` — `create_item` is gone.

/**
 * Same audited-widen idiom — `ports.ts`'s
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

/**
 * §8 B1 — the three surviving tools (`write_memory`, `submit_review`,
 * `create_artifact`) read a task through `open_task`, bound directly to the
 * action's own `run` — in-process, never a second HTTP hop. Structural
 * mirror of `ToolHandlersCoreApiAccessor.openTask`'s return shape.
 */
export type ToolHandlersOpenTask = (
	id: string,
	actorId: string,
) => Promise<
	{ readonly task: { readonly parentTaskId: string | null; readonly teamId: string } } | undefined
>;

/**
 * Builds a fresh `ToolHandlersPorts`, every `coreApi` field closing over the
 * ONE `CoreApiTransport` value passed in — never an ambient lookup. Per-call
 * actor attribution (§12) still happens per call: `seamPortForActor` wraps
 * THIS transport with the calling agent's identity fresh on every
 * invocation, since a different tool call may come from a different agent.
 */
export function buildToolHandlersPorts(
	transport: CoreApiTransport,
	openTask: ToolHandlersOpenTask,
): ToolHandlersPorts {
	function seamPortForActor(actorId: string): CoreApiPort {
		return buildCoreApiPort(withActorTransport(transport, { userId: actorId }));
	}

	// @lore BB1: createBetThroughCoreApiPort DELETED — bet is now a root task;
	// use createTask with parentTaskId=null for root tasks.

	return {
		// There is no `gate` — `submit_review` is gone.
		// AU21 §6 Decision L3: `work.routeItem` (the last standalone same-process
		// `work` DI capability) is DELETED outright as vestigial — every `work`
		// read/write now crosses the `coreApi` seam below.
		// @lore BB1: createBet, getBetById, updateBetById removed — bet is now a root task.
		coreApi: {
			openTask,
			// There is no `getItemById`/`updateItemById`/`createItem`/
			// `findSoleHumanUser`/`getThreadById`/`insertThread`/`updateThread`/
			// `insertMessage`/`findOrCreateDirectThread`/`getFirstThreadByHost` —
			// `create_item`/`reply`/`send_message`/`submit_review` are gone.
			getUserById: (id, actorId) => seamPortForActor(actorId).users.getUserById(id),
			listUsersByTeam: (teamMembersId, actorId) =>
				seamPortForActor(actorId).users.listUsersByTeam(teamMembersId),
			// AU21 §9 Increment 2 (org/routine/handoff wave): every former
			// `ToolHandlersOrgAccessor`/`ToolHandlersRoutineAccessor`/
			// `ToolHandlersPolicyAccessor.handoff` capability moved onto this seam —
			// see `ports.ts`'s `ToolHandlersCoreApiAccessor` doc comment.
			getTeamById: (teamId, actorId) => seamPortForActor(actorId).org.getTeamById(teamId),
			getTeamMembersByTeamId: (teamId, actorId) =>
				seamPortForActor(actorId).org.getTeamMembersByTeamId(teamId),
			createTeam: (input, actorId) => seamPortForActor(actorId).org.createTeam(input),
			updateTeam: (teamId, patch, actorId) =>
				seamPortForActor(actorId).org.updateTeam(teamId, patch),
			// There is no `resolveReviewRecipientsForItem` — `create_item`/
			// `submit_review` are gone.
			scaffoldFromRequest: (
				teamMembersId,
				trigger,
				teamName,
				role,
				name,
				ownerUserId,
				ownerUserName,
				systemPromptOverride,
				actorId,
			) =>
				seamPortForActor(actorId).org.scaffoldFromRequest({
					teamMembersId,
					trigger,
					teamName,
					role,
					name,
					ownerUserId,
					ownerUserName,
					systemPromptOverride,
				}),
			insertRoutine: (input: Record<string, unknown>, actorId: string) =>
				seamPortForActor(actorId).routine.insertRoutine(widenInsertRoutineInput(input)),
			getRoutineById: (id, actorId) => seamPortForActor(actorId).routine.getRoutineById(id),
			updateRoutineById: (id: string, updates: Record<string, unknown>, actorId: string) =>
				seamPortForActor(actorId).routine.updateRoutineById(id, widenUpdateRoutineInput(updates)),
			// AU21 §9 Increment 2 (knowledge wave): every former
			// `ToolHandlersKnowledgeAccessor` capability moved onto this seam —
			// see `ports.ts`'s `ToolHandlersCoreApiAccessor` doc comment.
			// @lore nested-knowledge-items: `search` is DELETED with `query_practice`.
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
			mergeKnowledgeItem: (targetId, sourceId, updatedBy, actorId) =>
				seamPortForActor(actorId).knowledge.mergeKnowledgeItem(targetId, sourceId, updatedBy),
			splitKnowledgeItem: (itemId, newItems, updatedBy, actorId) =>
				seamPortForActor(actorId).knowledge.splitKnowledgeItem(itemId, newItems, updatedBy),
		},
	};
}

/** Production-wired tool definitions, fresh per `CoreApiTransport` value — every real call site builds through this. */
export function buildToolDefinitions(
	transport: CoreApiTransport,
	openTask: ToolHandlersOpenTask,
): ReturnType<typeof buildToolDefinitionsFromPorts> {
	return buildToolDefinitionsFromPorts(buildToolHandlersPorts(transport, openTask));
}
