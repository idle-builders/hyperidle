/**
 * AU21 §6 Decision B placement ruling — the `knowledge_action` emit-time
 * resolver, paired with its real emit site (`routes/knowledge.ts`'s
 * `POST /:id/flag`). Does exactly what `resolveIntentInputInternal`'s
 * "knowledge_action" case did at drain time
 * (`session-requests/src/service.ts:738-756`, deleted there by this wave),
 * reading only `knowledge`'s own tables, plus the shared ast-`<userId>`
 * runnability invariant (`@hyperidle/users`' `requireRunnableAgent`) — so the
 * emitting route can bake the full request at emit time instead of leaving
 * it for the drain to resolve later.
 *
 * @lore Mechanism C (composition-boundary-guard): `@hyperidle/knowledge`
 * depends ONLY on `@hyperidle/db` + `@hyperidle/shared` (`package.json`) —
 * never on another Service (`@hyperidle/users`) directly, even for the one
 * genuinely cross-cutting invariant §6 Decision B carves out. This resolver
 * therefore takes `requireRunnableAgent` as an INJECTED dependency
 * (`KnowledgeActionResolverDeps`), not a static import; the real emit site
 * (`routes/knowledge.ts`, core-api Layer code — not a nested Service, so it
 * may legitimately import both `@hyperidle/knowledge` and `@hyperidle/users`)
 * wires the real `requireRunnableAgent` in at the call site. Same shape as
 * `assistant-turn-resolver.ts`'s `AssistantTurnResolverDeps` /
 * `task-run-resolver.ts`'s `TaskRunResolverDeps`.
 *
 * @lore AU21 §9 Increment 12 (Decision H3), Wave B: unlike the sibling
 * `task_run`/`routine_run`/`reengagement` resolvers, `assembleSessionKnowledge`
 * is NOT injected here — this file already lives inside `@hyperidle/knowledge`
 * (the Service that owns it), so it's a plain same-package import, no
 * Mechanism C boundary crossed. Consequently `resolveKnowledgeActionRequest`
 * ALWAYS bakes a `contextBundle` (no optional-deps gate like the other three
 * resolvers need) — a genuine capability ADD for `knowledge_action` sessions,
 * which get zero context today (see this file's Wave B test `@lore` for the
 * full trace verifying that). `requireRunnableAgent`'s return type widens to
 * `Promise<User>` (H2 precedent) so `agent.name`/`agent.role` reuse the SAME
 * already-validated row, no second read.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import type { BakedAgentRunnableConfig, BakedContextBundle } from "@hyperidle/work-intent-port";
import { bakeAgentRunnableConfig, toBakedContextKnowledgeItems } from "@hyperidle/work-intent-port";
import { get } from "./knowledge-repository.js";
import { assembleSessionKnowledge } from "./session-knowledge-assembler.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface KnowledgeActionResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C — `@hyperidle/knowledge` cannot
	 * import `@hyperidle/settings` directly) for the `harnessDisabled` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `harnessDisabled` (matches `admitSession`'s "absent = nothing disabled"
	 * degrade).
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
	/**
	 * AU27 — optional: resolve-or-create the knowledge item's
	 * `hostKind:"knowledge_item"` calling thread (`@hyperidle/conversation`'s
	 * `findThread`/`insertThread`, injected — Mechanism C,
	 * `@hyperidle/knowledge` cannot import `@hyperidle/conversation`
	 * directly). Absent at a call site not yet wired — the resolver bakes no
	 * `callingThreadId`, matching every other optional-dep degrade in this
	 * file.
	 */
	resolveOrCreateCallingThread?(
		db: HyperIdleDb,
		knowledgeItemId: string,
		agentId: string,
	): Promise<string>;
}

/** Thrown when the source knowledge item does not exist or is archived. */
export class KnowledgeActionSourceUnavailableError extends Error {}

/** The baked `knowledge_action` request shape, matching `resolveIntentInputInternal`'s former return. */
export interface BakedKnowledgeActionRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "knowledge";
	readonly sourceId: string;
	readonly streamId: string;
	readonly sourceCorrelation: {
		readonly knowledgeItemId: string;
		readonly action: "review";
		readonly scopeId?: string;
	};
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the flagged item's own content
	 * (`kind:"knowledge"`) + ranked knowledge, baked at emit time from the SAME
	 * `item` this resolver already loads to validate. Always present (see the
	 * `@lore` above — no Mechanism C gate needed for this resolver).
	 */
	readonly contextBundle: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-config snapshot, baked from the SAME already-`requireRunnableAgent`
	 * -validated `agent: User` row.
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's
	 * disabled-harness-types list. Present only when `deps.readServerConfig`
	 * was supplied.
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU27 — the knowledge item's calling thread id, baked via the injected
	 * resolve-or-create. Present only when `deps.resolveOrCreateCallingThread`
	 * was supplied.
	 */
	readonly callingThreadId?: string;
}

/**
 * Resolve + validate a `knowledge_action` run at emit time: strip the
 * `knowledge:` prefix from `sourceId` to get the bare item id, load the item
 * (rejecting if missing or archived), resolve the target agent as the item's
 * own `updatedBy` (the reviewer is whoever last touched the item, never the
 * flagging requester), validate that agent's runnability via the shared
 * core-api invariant, and bake the full request (including its
 * `contextBundle` — the flagged item's own content + ranked knowledge).
 */
export async function resolveKnowledgeActionRequest(
	db: HyperIdleDb,
	sourceId: string,
	deps: KnowledgeActionResolverDeps,
): Promise<BakedKnowledgeActionRequest> {
	const itemId = sourceId.replace(/^knowledge:/, "");
	const item = await get(db, itemId);
	if (!item || item.status === "archived") {
		throw new KnowledgeActionSourceUnavailableError("Knowledge item is unavailable");
	}
	const agent = await deps.requireRunnableAgent(db, item.updatedBy);

	// AU21 §9 Increment 12 (Decision H3): no dedicated task/team scope exists
	// for a knowledge-review turn — the item's own team scope (when scoped to
	// one) stands in for `teamId` (an empty string sentinel otherwise, which
	// still surfaces L4/L3 items correctly — only L2 needs a real team scope),
	// and the item's own title stands in for `taskDescription` (flagged for
	// reviewer per this file's Wave B test `@lore`).
	const knowledge = await assembleSessionKnowledge(db, {
		teamId: item.scopeKind === "team" && item.scopeId ? item.scopeId : "",
		agentRole: agent.role,
		taskDescription: item.title,
	});
	const harnessDisabled = deps.readServerConfig
		? (await deps.readServerConfig(db)).harnessDisabled
		: undefined;
	const callingThreadId = deps.resolveOrCreateCallingThread
		? await deps.resolveOrCreateCallingThread(db, item.id, item.updatedBy)
		: undefined;

	return {
		defaultAgentId: item.updatedBy,
		sourceKind: "knowledge",
		sourceId,
		streamId: `knowledge:${item.id}`,
		sourceCorrelation: {
			knowledgeItemId: item.id,
			action: "review",
			...(item.scopeId ? { scopeId: item.scopeId } : {}),
		},
		contextBundle: {
			kind: "knowledge",
			item: {
				id: item.id,
				title: item.title,
				body: item.body,
				format: item.format,
				version: item.version,
			},
			agent: { id: agent.id, name: agent.name, role: agent.role },
			knowledge: toBakedContextKnowledgeItems(knowledge),
		},
		agentConfig: bakeAgentRunnableConfig(agent),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
		...(callingThreadId !== undefined ? { callingThreadId } : {}),
	};
}
