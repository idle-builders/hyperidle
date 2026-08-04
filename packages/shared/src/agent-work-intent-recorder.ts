/**
 * AU19 §11 (AC-9) — the cross-Layer `AgentWorkIntentRecorder`/`AgentWorkIntentReader`
 * seam. `agent_work_intents` is owned by the `agent-orchestration` Layer's
 * `session-requests` Service; `routes/threads.ts` and `routes/sessions-routes.ts`
 * are core-api-Layer code (still physically in `packages/server` pending
 * Increment 5's route relocation, but logically core-api). A core-api route
 * must not import an orchestration Service directly — the Application
 * (`createApp(deps)`) obtains the concrete recorder/reader from the
 * `agent-orchestration` Layer and injects it, matching §11's design exactly.
 *
 * `threads.ts`'s AC-9 accessor needs the write to stay atomic with its own
 * message insert (`tx`-carrying) — hence the generic `TTx` type param rather
 * than a fixed db type: `@hyperidle/shared` has zero `@hyperidle/db`
 * dependency (a leaf package), so it cannot name `HyperIdleDb`/`WriteExecutor`
 * directly. The composition root (`packages/server`) instantiates this
 * generic with its own concrete `HyperIdleDb` type; the real concrete
 * recorder (`@hyperidle/session-requests`'s `enqueueWorkIntent`) is
 * assigned unchanged — no adapter needed (its `AgentWorkIntentDb` param type
 * is a structural superset of `HyperIdleDb`).
 */

import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";
import type { UserRole } from "./types.js";

/**
 * AU21 §6 Decision B / §10 — the emit-time-resolved request a migrated
 * family's core-api resolver produces (the exact shape
 * `resolveIntentInputInternal` used to return per kind, minus the fields
 * trivially re-derivable from the intent row at drain time). Carried on the
 * `AgentWorkIntentRecorder` payload (Decision G: payload growth, not a new
 * edge) so the drain can dispatch it directly with ZERO domain reads.
 */
export interface BakedWorkIntentRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId?: string | null;
	readonly teamId?: string;
	readonly userId?: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
	/**
	 * AU21 §9 Increment 11 (Decision H2): the `assistant_turn` family's baked
	 * thread transcript (`@hyperidle/conversation`'s `resolveAssistantTurnRequest`).
	 * Absent for every other kind — `task_run`/`knowledge_action`/`routine_run`/
	 * `reengagement` instead bake a `contextBundle` (Decision H3, Increment 12).
	 */
	readonly transcript?: ReadonlyArray<{
		readonly senderId: string;
		readonly payload: string;
		readonly type: string;
	}>;
	/**
	 * AU21 §9 Increment 11 (Decision H2 follow-up): the `assistant_turn`
	 * family's baked per-agent model override (`@hyperidle/conversation`'s
	 * `resolveAssistantTurnRequest`, sourced from the target agent's `users`
	 * row — `modelId`/`modelProvider`, configured via Settings → Agents).
	 * Absent for every other kind. Carried through onto the created
	 * `AgentSessionRequest.payloadJson` alongside `transcript` so `dispatch`
	 * can resolve the harness model from the baked payload instead of a live
	 * `getOrCreateUser` read.
	 */
	readonly modelId?: string | null;
	readonly modelProvider?: string | null;
	/**
	 * AU21 §9 Increment 12 (Decision H3): the `task_run`/`knowledge_action`/
	 * `routine_run`/`reengagement` families' baked entity content (task/bet/
	 * agent/team, or routine/agent/team) plus the ranked+budgeted knowledge
	 * items `@hyperidle/knowledge`'s `assembleSessionKnowledge` produces —
	 * `context.ts`'s `SessionContextData`/`RoutineSessionContextData` content,
	 * assembled at emit time by each per-kind resolver (the entity it already
	 * loads to validate + resolve the target agent) instead of
	 * `run-orchestration` reading it back at session-launch time. Absent for
	 * `assistant_turn` (bakes `transcript` instead — a thread-reply turn needs
	 * conversation history, not ranked L2/L3/L4 knowledge).
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-config snapshot, baked at emit time by EVERY per-kind resolver
	 * (all six kinds — `admitSession`'s Phase 1 applies uniformly, not just to
	 * the four `contextBundle`-baking families) from the SAME `agent: User` row
	 * `requireRunnableAgent` already loaded + validated there. Replaces
	 * `admitSession`'s former live `ports.users.getUserById` read — a snapshot
	 * check, not a live one (the emit→deactivate→drain race stays open exactly
	 * as architecture.md §12's founder-resolved note accepts), but the
	 * runnability GATE itself is never dropped, only its data source changes.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's
	 * disabled-harness-types list (`server_config.harnessDisabled`), baked at
	 * emit time (global config, not per-agent) so `admitSession`'s Phase 3
	 * adapter-selection filter no longer needs a live
	 * `ports.settings.readServerConfig` read. Absent means "nothing disabled"
	 * (matches the settings row's own empty-array default), not a live-read
	 * fallback — `ports.settings` is deleted from `run-orchestration` entirely.
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU27 — the session's calling thread id, baked at emit time by every
	 * resolver whose kind has a real thread host: `assistant_turn` (the
	 * conversation thread), `task_run`/`session_start`/`reengagement`/
	 * `proposed_call` (the task's thread), and `knowledge_action` (the
	 * knowledge item's thread). `routine_run` bakes none — a routine has no
	 * thread host — and its `reply` tool call falls back to a direct thread
	 * with the sole human user instead. Carried through onto the created
	 * `AgentSessionRequest.payloadJson` alongside `agentConfig` so `reply`
	 * has somewhere to post with zero orchestration -> core read.
	 */
	readonly callingThreadId?: string;
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — the target agent's
	 * injected-filesystems list, baked at emit time by EVERY per-kind resolver
	 * (all six kinds — mirrors `agentConfig`/`harnessDisabled`'s uniform Wave E
	 * bake, not just the four `contextBundle`-baking families) from
	 * `@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent(db,
	 * agentId)`, reusing the SAME `agentId` each resolver already resolves via
	 * `requireRunnableAgent`. Replaces `mountFilesystemsForAgent`'s former live
	 * `CoreApiPort.filesystems.listFilesystemsByAgent` seam read (Decision F2,
	 * Increment 8) — a genuine gap H3's later, more complete principle should
	 * have closed but never revisited. Absent/empty means "no injected
	 * filesystems", matching the seam-based lookup's own empty-list behavior
	 * unchanged.
	 */
	readonly injectedFilesystems?: readonly BakedFilesystemForProvisioning[];
	/**
	 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections) —
	 * the owning human's held-connection list, baked at emit time by EVERY
	 * per-kind resolver (same uniform-bake precedent as `injectedFilesystems`)
	 * from `@hyperidle/connections`'s `resolveInjectedConnectionsForAgent(db,
	 * agentId)`. Replaces `buildProvisioningPlan`'s former live
	 * `CoreApiPort.connections.listHeldConnectionsForProvisioning()` seam read
	 * (Decision F2, Increment 8) — the SAME class of gap `injectedFilesystems`
	 * closed, left standing here until this pass. `agentId` is accepted for
	 * signature uniformity but unused internally — a held connection is scoped
	 * to the single owning human, not per-agent (AN2: "Single-founder is the
	 * locked deployment"). Absent means "no held connections", matching the
	 * seam-based lookup's own empty-list behavior unchanged. NEVER carries
	 * `encryptedToken` or any decrypted secret — the decrypt step
	 * (`ServiceConnectionResolver`) stays an Application-composed direct
	 * dependency, decrypting live at spawn time from the baked `connectionId`
	 * (AN1 hard-rule 1), never baked onto this event payload.
	 */
	readonly injectedConnections?: BakedConnectionsForProvisioning;
}

/**
 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections) — one
 * held connection's provisioning-relevant fields, baked onto
 * `BakedWorkIntentRequest`/`RunContextBundle`/`ProvisionSessionParams` at
 * emit time. Mirrors the former `CoreApiPort.connections
 * .listHeldConnectionsForProvisioning()` seam response element exactly.
 * NEVER includes `encryptedToken` (AN1 hard-rule 1).
 */
export interface BakedConnectionForProvisioning {
	readonly id: string;
	readonly service: string;
	readonly authSource: "token" | "mcp";
	readonly serverUrl: string | null;
}

/**
 * AU21 §9 Increment 12 follow-up part 2 (F2 gap closure — connections) — the
 * owning human's held-connection list, mirroring the former seam's
 * `ListHeldConnectionsForProvisioningResponse` body exactly.
 */
export interface BakedConnectionsForProvisioning {
	readonly userId: string;
	readonly connections: readonly BakedConnectionForProvisioning[];
}

/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure) — one injected filesystem's
 * provisioning-relevant fields, baked onto `BakedWorkIntentRequest`/
 * `RunContextBundle`/`ProvisionSessionParams` at emit time. Mirrors
 * `@hyperidle/run-orchestration`'s `FilesystemForProvisioning` shape
 * (`filesystem-provisioning.ts`) exactly — duck-typed here (same idiom as
 * `SessionKnowledgeItemLike`) since `@hyperidle/shared` has zero
 * `@hyperidle/db` dependency. `resourceRef` arrives ALREADY PARSED (the bake
 * helper's own mapping mirrors the former seam route's `rowToFilesystem`).
 */
export interface BakedFilesystemForProvisioning {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: string;
	readonly connectionId: string | null;
	readonly resourceRef: unknown;
	readonly writeback: string;
	readonly state: string;
	readonly createdAt: string;
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
 * admission-relevant configuration, baked at emit time from the SAME
 * `agent: User` row every per-kind resolver already loads via
 * `requireRunnableAgent` to validate the ast-`<userId>` invariant. Mirrors
 * exactly the set of `users` columns `admitSession`'s former Phase 1/3 live
 * read (`ports.users.getUserById`) consumed: the runnability predicate
 * (`kind`/`status`), the fields `context.ts`/prompt assembly used
 * (`role`/`systemPrompt`/`modelTierPreference`), the fields adapter selection
 * used (`harnessType`/`modelProvider`), the concurrency-check bound
 * (`maxConcurrentSessions`), and the agent's own home team
 * (`teamId` — feeds the Phase 2 cost-cap check's `team` scope, distinct from
 * `ProvisionSessionParams.productId`, which is the TASK's team; verified from
 * `admitSession`'s pre-Wave-E `const teamId = agent.teamId ?? undefined`,
 * consumed by `ports.cost.checkCostCap`/`recordCostAndCheck` — this field was
 * NOT in this wave's originating task field list and would have been a silent
 * drop had it been omitted here).
 */
export interface BakedAgentRunnableConfig {
	readonly kind: string;
	readonly status: string;
	readonly role: UserRole;
	readonly teamId: string | null;
	readonly systemPrompt: string | null;
	readonly modelTierPreference: string | null;
	readonly harnessType: string | null;
	readonly modelProvider: string | null;
	/**
	 * AU27 Increment 6 (Decision 4) — the target agent's per-agent model
	 * override, baked uniformly for all six kinds (the same `users.modelId`
	 * column `assistant-turn-resolver.ts` already baked separately pre-AU27).
	 * Feeds the durable drain's `resolveModel({kind:"agent", …})` call —
	 * `null` falls back to the tier, matching `modelProvider`'s own semantics.
	 */
	readonly modelId: string | null;
	readonly maxConcurrentSessions: number;
}

/**
 * Map a resolver's already-loaded `agent: User` row (or any object structurally
 * satisfying `BakedAgentRunnableConfig`'s fields — `@hyperidle/shared` has zero
 * `@hyperidle/db` dependency, so this stays duck-typed, same idiom as
 * `SessionKnowledgeItemLike`) onto the exact whitelisted `BakedAgentRunnableConfig`
 * shape. A deliberate whitelist pick, not a spread — `User` carries other
 * columns (name, avatar, credentials, etc.) that must never ride onto the
 * baked `AgentSessionRequest.payloadJson`.
 */
export function bakeAgentRunnableConfig(agent: BakedAgentRunnableConfig): BakedAgentRunnableConfig {
	return {
		kind: agent.kind,
		status: agent.status,
		role: agent.role,
		teamId: agent.teamId,
		systemPrompt: agent.systemPrompt,
		modelTierPreference: agent.modelTierPreference,
		harnessType: agent.harnessType,
		modelProvider: agent.modelProvider,
		modelId: agent.modelId,
		maxConcurrentSessions: agent.maxConcurrentSessions,
	};
}

/** One ranked+budgeted knowledge item as baked onto a `BakedContextBundle`. */
export interface BakedContextKnowledgeItem {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	readonly layer: string | null;
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B — the structural shape
 * `@hyperidle/knowledge`'s `assembleSessionKnowledge` (Wave A) returns
 * (`KnowledgeItemWithProjection`), duck-typed here so `work`/`routine`/
 * `review`'s per-kind resolvers can type their INJECTED `assembleSessionKnowledge`
 * dependency (Mechanism C: none of those packages may import
 * `@hyperidle/knowledge` directly) without needing that Service's own type.
 * `layer` stays optional (matching `KnowledgeItemWithProjection`'s own
 * optional `layer?: string | null`) — `toBakedContextKnowledgeItems` below
 * normalizes it to the required-but-nullable `BakedContextKnowledgeItem.layer`.
 */
export interface SessionKnowledgeItemLike {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	readonly layer?: string | null;
}

/**
 * Map `assembleSessionKnowledge`'s ranked+budgeted output onto the
 * `BakedContextKnowledgeItem[]` shape every `contextBundle` variant carries —
 * one shared mapper so `task-run-resolver.ts`/`knowledge-action-resolver.ts`/
 * the routine resolver/`proposed-call-workflow.ts` don't each reimplement the
 * same field-pick.
 */
export function toBakedContextKnowledgeItems(
	items: readonly SessionKnowledgeItemLike[],
): readonly BakedContextKnowledgeItem[] {
	return items.map((item) => ({
		id: item.id,
		title: item.title,
		body: item.body,
		format: item.format,
		version: item.version,
		layer: item.layer ?? null,
	}));
}

/**
 * AU21 §9 Increment 12 (Decision H3) — the baked entity content a
 * `task_run`/`reengagement` session needs (`kind:"task"`, matching
 * `context.ts`'s `SessionContextData`), a `routine_run` session needs
 * (`kind:"routine"`, matching `RoutineSessionContextData`), or a
 * `knowledge_action` session needs (`kind:"knowledge"` — the flagged item
 * itself, since a review turn has no task/bet/routine), plus the shared
 * ranked+budgeted `knowledge` bundle every variant carries.
 *
 * @lore CONFUSION (Increment 12 Wave B, flagged for reviewer): this original
 * doc comment (Wave A) claimed `knowledge_action` used the `kind:"task"`
 * shape — WRONG, verified from source: `resolveKnowledgeActionRequest`
 * (`knowledge-action-resolver.ts`) never resolves a task or bet at all (its
 * `BakedKnowledgeActionRequest` has no `taskId`/`teamId` fields whatsoever),
 * and the resulting session takes `provisioner.ts`'s task-free branch —
 * genuinely zero context/ranked-knowledge today (see the `@lore` on
 * `knowledge-action-resolver.integration.test.ts`'s Wave B contextBundle
 * test for the full trace). The `kind:"knowledge"` variant below (and that
 * resolver's contextBundle) is therefore a capability ADD, not a
 * preserve-behavior migration — same premise-mismatch category as
 * `routine_run`'s (see that resolver test's `@lore`), not an
 * implementation-detail guess. Flagged for architecture reconciliation.
 */
export type BakedContextBundle =
	| {
			readonly kind: "task";
			readonly task: {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly state: string;
			};
			readonly bet: {
				readonly id: string;
				readonly description: string;
				readonly appetite: string;
				readonly doneCondition: string | null;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  }
	| {
			readonly kind: "routine";
			readonly routine: {
				readonly id: string;
				readonly name: string;
				readonly description: string | null;
				readonly lastRunSummary: string | null;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  }
	| {
			readonly kind: "knowledge";
			readonly item: {
				readonly id: string;
				readonly title: string;
				readonly body: string;
				readonly format: string;
				readonly version: number;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  };

/**
 * AU21 §6 Decision G (recorder unification) — widened from the AC-9 2-kind
 * (`assistant_turn`/`session_start`) scope to the FULL six-kind
 * discriminated union (AU21 §9 Increment 10a / Decision I removed
 * `bet_decomposition`, shrinking the union from seven to six), matching
 * `agent_work_intents_kind_ck` + `agent_work_intents_kind_source_compat_ck`
 * (`packages/db/src/schema.ts`) exactly. `work` (`task_run`) and `review`
 * (`reengagement`) used to re-declare their own narrower local mirrors of
 * this exact shape (`WorkAgentWorkIntentInput`/`ReviewAgentWorkIntentInput`)
 * purely because this union hadn't grown to cover their kinds yet — now that
 * it does, every caller imports this ONE type and the mirrors are deleted
 * (`tsc` enforces conformance mechanically, not by convention). See
 * `AGENT_WORK_INTENT_KINDS` below for the runtime-checkable kind list this
 * union's discriminant is built from.
 */
export type AgentWorkIntentRecorderInput =
	| {
			readonly kind: "assistant_turn";
			readonly sourceKind: "thread_message";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `conversation` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "session_start";
			readonly sourceKind: "explicit_session_start";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `work` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "knowledge_action";
			readonly sourceKind: "knowledge_action";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by the `knowledge` resolver (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "routine_run";
			readonly sourceKind: "routine_run";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `routine-service.ts`'s `resolveRoutineRunRequest` (AU21 Increment 4). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "task_run";
			readonly sourceKind: "task_dispatch_attempt";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `task-run-resolver.ts` (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  }
	| {
			readonly kind: "reengagement";
			readonly sourceKind: "proposed_call";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			/** See `BakedWorkIntentRequest`. Populated at emit time by `proposed-call-workflow.ts`'s `resolveReengagementRequest` (AU21 Increment 3). */
			readonly bakedRequest?: BakedWorkIntentRequest;
	  };

/** Application-injected port for `session-requests`' durable `agent_work_intents` writer (Mechanism C, §11). */
export interface AgentWorkIntentRecorder<TTx = unknown> {
	record(
		tx: TTx,
		input: AgentWorkIntentRecorderInput,
	): Promise<{ readonly id: string; readonly idempotencyKey: string }>;
}

/** Application-injected port for `session-requests`' `agent_work_intents` reader (Mechanism C, §11). */
export interface AgentWorkIntentReader<TDb = unknown> {
	findByKindAndSource(
		db: TDb,
		kind: "assistant_turn" | "session_start",
		sourceId: string,
	): Promise<{ readonly id: string; readonly idempotencyKey: string } | undefined>;
}
