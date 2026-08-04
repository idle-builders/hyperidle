/**
 * AU21 §6 Decision B placement ruling — the `assistant_turn` emit-time
 * resolver, paired with its real emit site (`routes/threads.ts`). Does
 * exactly what `resolveIntentInputInternal`'s "assistant_turn" case does
 * today (`session-requests/src/service.ts`), reading only `conversation`'s
 * own tables, plus the shared ast-`<userId>` runnability invariant
 * (`@hyperidle/users`' `requireRunnableAgent`) — so the emitting route can
 * bake the full request at emit time instead of leaving it for the drain to
 * resolve later.
 *
 * @lore Mechanism C (composition-boundary-guard): a nested Service package
 * (`conversation`) may depend ONLY on `@hyperidle/db` + `@hyperidle/shared` —
 * never on another Service (`@hyperidle/users`) directly, even for the one
 * genuinely cross-cutting invariant §6 Decision B carves out. This resolver
 * therefore takes `requireRunnableAgent` as an INJECTED dependency
 * (`AssistantTurnResolverDeps`), not a static import; the real emit site
 * (`routes/threads.ts`, core-api Layer code — not a nested Service, so it may
 * legitimately import both `@hyperidle/conversation` and `@hyperidle/users`)
 * wires the real `requireRunnableAgent` in at the call site — the same
 * ordinary-DI shape used elsewhere in this codebase for injected
 * cross-Service reads.
 *
 * @lore naming: no export name is pinned in the architecture doc for this
 * resolver; `resolveAssistantTurnRequest` matches the RED-phase test's
 * best-guess interpretation.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedConnectionsForProvisioning,
	BakedFilesystemForProvisioning,
} from "@hyperidle/shared";
import { bakeAgentRunnableConfig } from "@hyperidle/shared";
import { findMessage, listMessages } from "./conversation-store.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface AssistantTurnResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C — `@hyperidle/conversation`
	 * cannot import `@hyperidle/settings` directly) for the `harnessDisabled`
	 * bake. Absent at a call site not yet wired — the resolver bakes no
	 * `harnessDisabled` (matches `admitSession`'s "absent = nothing disabled"
	 * degrade).
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — optional:
	 * `@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`, injected
	 * (Mechanism C — `@hyperidle/conversation` cannot import
	 * `@hyperidle/filesystems` directly) for the `injectedFilesystems` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `injectedFilesystems`.
	 */
	resolveInjectedFilesystemsForAgent?(
		db: HyperIdleDb,
		agentId: string,
	): Promise<readonly BakedFilesystemForProvisioning[]>;
	/**
	 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections) —
	 * optional: `@hyperidle/connections`'s `resolveInjectedConnectionsForAgent`,
	 * injected (Mechanism C — `@hyperidle/conversation` cannot import
	 * `@hyperidle/connections` directly) for the `injectedConnections` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `injectedConnections`.
	 */
	resolveInjectedConnectionsForAgent?(
		db: HyperIdleDb,
		agentId: string,
	): Promise<BakedConnectionsForProvisioning>;
}

/** Thrown when the source message does not exist, is deleted, or is redacted. */
export class AssistantTurnSourceUnavailableError extends Error {}

/** One raw transcript row. */
export interface BakedTranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

/**
 * The baked `assistant_turn` request shape, matching `resolveIntentInputInternal`'s
 * current return, PLUS (AU21 §9 Increment 11, Decision H2) the thread's full
 * conversation transcript. Baking it here (core-api's own `conversation`
 * state, at emit time) lets `run-orchestration`'s generic drain build the
 * harness input from this payload with ZERO reads back into core.
 *
 * @lore AU21 §9 Increment 11 (Decision H2 follow-up, closing a Wave A
 * regression): `modelId`/`modelProvider` ride alongside `transcript` here,
 * sourced from the SAME `requireRunnableAgent` row this resolver already
 * reads to validate runnability — no extra read. Wave A deleted `dispatch`'s
 * live `getOrCreateUser`/`readServerConfig` reads and, with them, silently
 * dropped the per-agent model override (`users.modelId`/`modelProvider`,
 * configured via Settings → Agents) instead of baking it forward. That was a
 * real regression, not an acceptable trade-off — "bake everything a run
 * needs at emit" (Decision H2) means bake the override, not drop it.
 */
export interface BakedAssistantTurnRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "assistant";
	readonly sourceId: string;
	readonly streamId: string;
	readonly userId: string;
	readonly sourceCorrelation: {
		readonly threadId: string;
		readonly messageId: string;
		readonly userId: string;
		readonly assistantAgentId: string;
	};
	/** Every message in the thread, `createdAt` ascending, including the triggering message. */
	readonly transcript: ReadonlyArray<BakedTranscriptRow>;
	/**
	 * AU27 Increment 1 (Decision 1) — the assistant's calling thread, always
	 * present (an `assistant_turn` always has a triggering thread message).
	 * Baked from the SAME `message` this resolver already loaded — no extra
	 * read.
	 */
	readonly callingThreadId: string;
	/** Per-agent model override (`users.modelId`), or `null` when unset — see the `@lore` above. */
	readonly modelId: string | null;
	/** Per-agent model provider override (`users.modelProvider`), or `null` when unset. */
	readonly modelProvider: string | null;
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
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — the target agent's
	 * injected-filesystems list. Present only when
	 * `deps.resolveInjectedFilesystemsForAgent` was supplied.
	 */
	readonly injectedFilesystems?: readonly BakedFilesystemForProvisioning[];
	/**
	 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections) —
	 * the owning human's held-connection list. Present only when
	 * `deps.resolveInjectedConnectionsForAgent` was supplied.
	 */
	readonly injectedConnections?: BakedConnectionsForProvisioning;
}

function resolveAssistantAgentIdForSender(senderId: string): string {
	return `ast-${senderId}`;
}

/**
 * Resolve + validate an `assistant_turn` run at emit time: load the message,
 * reject if unavailable (missing/deleted/redacted), resolve the target
 * `ast-<senderId>` assistant agent, and validate its runnability (never the
 * human sender) via the shared core-api invariant.
 */
export async function resolveAssistantTurnRequest(
	db: HyperIdleDb,
	messageId: string,
	deps: AssistantTurnResolverDeps,
): Promise<BakedAssistantTurnRequest> {
	const message = await findMessage(db, { id: messageId });
	if (!message || message.deletedAt || message.redactedAt) {
		throw new AssistantTurnSourceUnavailableError("Assistant source message is unavailable");
	}
	const targetAgentId = resolveAssistantAgentIdForSender(message.senderId);
	const agent = await deps.requireRunnableAgent(db, targetAgentId);
	const transcriptRows = await listMessages(db, {
		threadId: message.threadId,
		order: "createdAt",
		dir: "asc",
	});
	const transcript: BakedTranscriptRow[] = transcriptRows.map((row) => ({
		senderId: row.senderId,
		payload: row.payload,
		type: row.type,
	}));
	const harnessDisabled = deps.readServerConfig
		? (await deps.readServerConfig(db)).harnessDisabled
		: undefined;
	const injectedFilesystems = deps.resolveInjectedFilesystemsForAgent
		? await deps.resolveInjectedFilesystemsForAgent(db, targetAgentId)
		: undefined;
	const injectedConnections = deps.resolveInjectedConnectionsForAgent
		? await deps.resolveInjectedConnectionsForAgent(db, targetAgentId)
		: undefined;
	return {
		defaultAgentId: targetAgentId,
		sourceKind: "assistant",
		sourceId: message.id,
		streamId: `thread:${message.threadId}`,
		userId: message.senderId,
		sourceCorrelation: {
			threadId: message.threadId,
			messageId: message.id,
			userId: message.senderId,
			assistantAgentId: targetAgentId,
		},
		transcript,
		callingThreadId: message.threadId,
		modelId: agent.modelId ?? null,
		modelProvider: agent.modelProvider ?? null,
		agentConfig: bakeAgentRunnableConfig(agent),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
		...(injectedFilesystems !== undefined ? { injectedFilesystems } : {}),
		...(injectedConnections !== undefined ? { injectedConnections } : {}),
	};
}
