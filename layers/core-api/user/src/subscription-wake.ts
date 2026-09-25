/**
 * `resolveSubscriptionWakeRequest` — bake the `BakedWorkIntentRequest` a
 * subscription's wake carries, for an agent subscriber. Architecture.md §4:
 * three reused pieces (`bakeAgentRunnableConfig`, `toBakedContextDocuments`,
 * an injected `assembleSessionDocuments`), same optional-contextBundle
 * shape, but no run row to load: the
 * subscription row and the change that woke it are already in the caller's
 * hand (`subscription-fire.ts`'s own `listSubscriptions` read), so this
 * function does no DB read of its own beyond the agent row
 * `requireRunnableAgent` reloads (never trust the caller's cached row) and
 * the owner/team rows the effective-team rule needs.
 *
 * Every cross-Service capability this needs (`@hyperidle/document`'s
 * `assembleSessionDocuments`, `@hyperidle/settings`'s `readServerConfig`) is
 * injected (Mechanism C) — `@hyperidle/user` may depend on nothing but
 * `@hyperidle/db`/framework packages. `requireRunnableAgent`/`findUser`/
 * `getTeam` are THIS package's own siblings, so they are plain imports, not
 * deps.
 */
import type { HyperIdleDb, User } from "@hyperidle/db";
import {
	type BakedContextBundle,
	type BakedWorkIntentRequest,
	bakeAgentRunnableConfig,
	type ChangeRow,
	type SessionDocumentLike,
	toBakedContextDocuments,
} from "@hyperidle/domain-model";
import type { ActionContext, SearchDocumentsRunFn } from "./action-types.js";
import { requireRunnableAgent } from "./runnable-agent.js";
import { getTeam } from "./team-lookup.js";
import { findUser } from "./user-store.js";

/** Injected, cross-Service capabilities this resolver cannot own directly. */
export interface SubscriptionWakeDeps {
	/** Reads the agent's identity document and the subscription's prompt document. */
	readonly searchDocuments: SearchDocumentsRunFn;
	/**
	 * `@hyperidle/document`'s `assembleSessionDocuments`, injected. Absent →
	 * no `contextBundle` is baked, matching `resolveRoutineRunRequest`'s own
	 * degrade.
	 */
	readonly assembleSessionDocuments?: (
		db: HyperIdleDb,
		input: {
			readonly teamId?: string;
			readonly taskDescription: string;
			readonly agentId: string;
		},
	) => Promise<readonly SessionDocumentLike[]>;
	/** `@hyperidle/settings`'s `readServerConfig`, injected, for the `harnessDisabled` bake. */
	readonly readServerConfig?: (
		db: HyperIdleDb,
	) => Promise<{ readonly harnessDisabled: readonly string[] }>;
}

/** The agent's identity document body — `search_documents({parent:{kind:"agent",id},slot:"agent_file"})[0]?.body`. */
async function readAgentIdentity(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	agentId: string,
): Promise<string | null> {
	const result = await searchDocuments(ctx, {
		parent: { kind: "agent", id: agentId },
		slot: "agent_file",
		status: "active",
	});
	return result.ok ? (result.data[0]?.body ?? null) : null;
}

/** The subscription's own instruction — `search_documents({parent:{kind:"subscription",id},slot:"prompt"})[0]?.body`. */
async function readSubscriptionPrompt(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	subscriptionId: string,
): Promise<string | null> {
	const result = await searchDocuments(ctx, {
		parent: { kind: "subscription", id: subscriptionId },
		slot: "prompt",
	});
	return result.ok ? (result.data[0]?.body ?? null) : null;
}

/** The subscriber's effective team — own, else its owner's, else `null` (a factory-wide agent). */
async function effectiveTeam(
	db: HyperIdleDb,
	agent: User,
): Promise<{ readonly id: string; readonly name: string } | null> {
	if (agent.teamId) {
		const row = await getTeam(db, { id: agent.teamId });
		return row ? { id: row.id, name: row.name } : null;
	}
	if (agent.ownerUserId) {
		const owner = await findUser(db, { id: agent.ownerUserId });
		if (owner?.teamId) {
			const row = await getTeam(db, { id: owner.teamId });
			return row ? { id: row.id, name: row.name } : null;
		}
	}
	return null;
}

export interface ResolveSubscriptionWakeInput {
	readonly subscription: {
		readonly id: string;
		readonly event: string | null;
		readonly schedule: string | null;
	};
	readonly agentId: string;
	/** The change that fired this wake, or `null` for a schedule tick. */
	readonly change: ChangeRow | null;
	/** `"<subId>:<changeId>"` or `"<subId>:<dueAt>"` — built by the caller, who already knows which. */
	readonly sourceId: string;
}

/**
 * Bake a subscription's wake into the exact `BakedWorkIntentRequest` shape
 * `subscriptionSessionRequestInputSchema`'s `sourceCorrelation` expects
 * (`{ subscriptionId, changeId?, teamId? }`). Throws `AgentNotRunnableError`
 * (via `requireRunnableAgent`) when the agent is not eligible — the caller
 * (`subscription-fire.ts`) catches this and drops that one wake, logged, the
 * same idiom `thread-actions.ts`'s mention wake already uses.
 */
export async function resolveSubscriptionWakeRequest(
	ctx: ActionContext,
	input: ResolveSubscriptionWakeInput,
	deps: SubscriptionWakeDeps,
): Promise<BakedWorkIntentRequest> {
	const agent = await requireRunnableAgent(ctx.db, input.agentId);
	const team = await effectiveTeam(ctx.db, agent);
	const teamId = team?.id ?? agent.teamId ?? undefined;
	const userId = agent.ownerUserId ?? undefined;

	const agentPersona = await readAgentIdentity(ctx, deps.searchDocuments, agent.id);
	const prompt = await readSubscriptionPrompt(ctx, deps.searchDocuments, input.subscription.id);

	let contextBundle: BakedContextBundle | undefined;
	if (deps.assembleSessionDocuments) {
		const knowledge = await deps.assembleSessionDocuments(ctx.db, {
			...(team ? { teamId: team.id } : {}),
			taskDescription: prompt ?? input.subscription.event ?? input.subscription.schedule ?? "",
			agentId: agent.id,
		});
		contextBundle = {
			kind: "subscription",
			subscription: input.subscription,
			prompt,
			change: input.change,
			agent: { id: agent.id, name: agent.name, role: agent.role },
			team,
			documents: toBakedContextDocuments(knowledge),
		};
	}

	const harnessDisabled = deps.readServerConfig
		? (await deps.readServerConfig(ctx.db)).harnessDisabled
		: undefined;

	return {
		defaultAgentId: agent.id,
		sourceKind: "subscription",
		sourceId: input.sourceId,
		streamId: `subscription:${input.subscription.id}`,
		...(teamId !== undefined ? { teamId } : {}),
		...(userId !== undefined ? { userId } : {}),
		taskId: null,
		sourceCorrelation: {
			subscriptionId: input.subscription.id,
			...(input.change ? { changeId: input.change.id } : {}),
			...(teamId !== undefined ? { teamId } : {}),
		},
		...(contextBundle ? { contextBundle } : {}),
		agentConfig: bakeAgentRunnableConfig(agent, agentPersona),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
	};
}
