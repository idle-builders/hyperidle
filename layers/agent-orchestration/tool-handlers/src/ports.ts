/**
 * `tool-handlers` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (the
 * merged `tools` census row, §7.5's C1 split). The one remaining real
 * outbound edge (`routine`, renamed from `dispatch` in AU21 §9 Increment 9 —
 * `dispatch` no longer offers `provisionTeamRoutines` at all) is ordinary
 * composition-root DI, wired by the composition root
 * (`layers/core-api/src/services/tool-handlers-bindings.ts`) directly to
 * `@hyperidle/routine`'s real exported function. `coreApi` (AU21 §9 Increment 1, `work`; Increment
 * 2, `users`+`conversation`, then `org`+`routine`+`handoffTask`, then
 * `knowledge`) is DIFFERENT in kind — it crosses the `CoreApiPort` write seam
 * (a real route call), not same-process DI; see `ToolHandlersCoreApiAccessor`'s
 * own doc comment below. There is no longer a standalone `conversation`/`org`/
 * `routine`/`policy`/`knowledge` port — every former
 * `ToolHandlersConversationAccessor`/`ToolHandlersOrgAccessor`/
 * `ToolHandlersRoutineAccessor`/`ToolHandlersPolicyAccessor.handoff`/
 * `ToolHandlersKnowledgeAccessor` capability moved onto `coreApi` (Increment
 * 2's conversation wave, then org/routine/handoff wave, then knowledge wave).
 *
 * Several call shapes COLLAPSE (not a 1:1 port-per-function mirror) because
 * Mechanism C forbids `tool-handlers` from importing the Services a tool
 * used to wire together itself — same shape `dispatch`'s own (historical)
 * `DispatchKnowledgeAccessor.recomputeAttentionForCandidates` collapse
 * already established:
 *  - `create-item.ts`'s `resolveReviewRecipients(db, ctx, orgUsers)` —
 *    collapsed into ONE `ToolHandlersCoreApiAccessor.resolveReviewRecipientsForItem`.
 *  - `add-agent.ts`/`create-team.ts`'s `persistScaffoldedAgents(db, orgUsers,
 *    teamMembersId, specs)` — collapsed into ONE
 *    `ToolHandlersCoreApiAccessor.persistScaffoldedAgents` (the composition root
 *    still wires the same `{getUserById, insertUser}` `orgUsers` object
 *    internally, just one level up).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or a narrow generic `TDb`) rather than imported from the target
 * package — a Service NEVER imports another Service, even for a type-only
 * reference (`dispatch`'s `ports.ts` top `@lore` established this precedent
 * first). Pipeline values a handler only ever spreads/forwards (never reads
 * a specific field of) are typed `Record<string, unknown>` rather than
 * mirrored field-by-field.
 *
 * The one import below is `@hyperidle/db`, which is a framework leaf rather
 * than a Service — the rule above forbids importing another SERVICE's types,
 * and the db handle is the one type both sides of every port already name.
 *
 * @lore AU20 Stage 2: All 16 sub-interface type exports removed — they are
 * now structurally internal under `ToolHandlersPorts`. External code that
 * holds a `ToolHandlersPorts` accesses each sub-port structurally
 * without needing to import the named interface. `parseCron`/`nextCronMatch`
 * removed from `ToolHandlersDispatchAccessor` — relocated to
 * `@hyperidle/cron` so tool implementations import them directly (2 of 3
 * dispatch back-edges deleted; only `provisionTeamRoutines` remains).
 *
 * @lore AU21 §6 Decision F1: the `agentSelection` port
 * (`resolveScaffoldSpecs`) is REMOVED — traced to be pure (never reads its
 * own injected deps, never reads `db`/`teamId`/`teamMembersId`), it folded
 * into `@hyperidle/db`'s `resolveAgentScaffoldSpecs`, a leaf function this
 * Service now imports directly (Mechanism C: `@hyperidle/db` is a leaf every
 * Service may import).
 */

/**
 * @lore AU21 §6 Decision L3: `ToolHandlersWorkAccessor`/`routeItem` — the
 * last standalone same-process `work` DI capability — is DELETED, not
 * relocated. Traced to be vestigial: its `view` output was consumed by
 * nothing (no persisted column, no display reader, no downstream tool),
 * and core-api itself already abandoned inline routing at item creation
 * (`@lore O2` in `routes/conversations.ts`). Every `work` read/write now
 * crosses the `CoreApiPort` seam (`ToolHandlersCoreApiAccessor` below) —
 * there is no longer a standalone `work` accessor at all.
 */

/**
 * Structural mirror of `org`'s own `CreateTeamInput` (`team-lookup.ts`) —
 * `org`'s `createTeam` atomically inserts both the `teams` row and its
 * `teamMembers` companion (1:1 invariant). `teamMembersId` replaced the
 * old separate `CreateTeamMembersGroupInput.id` (AU20 Am7).
 */
interface ToolHandlersCreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	/** The `teamMembers.id` for the companion row (1:1 invariant). */
	readonly teamMembersId: string;
	readonly capacity?: number;
	// @lore BB1: activeBets removed — WIP limit is capacity counted live.
	readonly formedAt?: string;
}

/**
 * Structural mirror of `knowledge`'s own `CreateKnowledgeItemInput`
 * (`knowledge-repository.ts`) — same reasoning as
 * `ToolHandlersCreateTeamInput`: `knowledge.create` reads these
 * specific fields, so this cannot stay the opaque `Record<string, unknown>`
 * shape. `KnowledgeStatus` literal union widens to `string` (Mechanism C:
 * never importing `knowledge`'s own types).
 *
 * @lore nested-knowledge-items: `layer`/`kind`/`topic` are DELETED — a
 * knowledge item's place in the tree says what it is about now, not a flat
 * layer/kind/topic vocabulary.
 */
interface ToolHandlersCreateKnowledgeItemInput {
	readonly scopeKind?: string | null;
	readonly scopeId?: string | null;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly status: string;
	readonly updatedBy: string;
	/**
	 * @lore rebase-onto-#547: `create_artifact`'s rewrite (a produced item is a
	 * knowledge item parented to the task or thread that produced it) needs
	 * these — `write_memory`, the accessor's other caller, never sets them.
	 */
	readonly parentKind?: "task" | "thread";
	readonly parentId?: string;
	readonly attentionScore?: number | null;
	readonly confidence?: number | null;
	readonly meta?: string | null;
}

/** Structural mirror of `knowledge`'s own `CreateKnowledgeConflictInput` (`conflict-review-store.ts`). */
interface ToolHandlersCreateKnowledgeConflictInput {
	readonly id: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedMeta: string | null;
	readonly proposedBy: string;
	readonly createdAt: string;
}

/**
 * `CoreApiPort` write-seam accessor (AU21 §9 Increment 1). Unlike every
 * other accessor in this file, this one takes NO `TDb` — the write crosses
 * via the seam's transport (a real route call through the SAME door core-ui
 * uses, architecture.md §6 Decision A/C), not a same-process DB handle.
 * `actorId` carries the calling agent's own identity as the route actor (§12)
 * the composition root threads it onto the request, never a hardcoded/
 * founder constant.
 *
 * @lore `getTaskById`/`createTask`/`updateTaskById`/`appendTaskNote`/
 * `handoffTask` — the whole task-shaped slice of this accessor — are gone.
 * `create_task`/`edit_task`/`handoff_to`/`log_task` are deleted (the task
 * action list replaces them); the three tools that survive and only ever
 * READ a task (`write_memory`, `submit_review`, `create_artifact`) call
 * `openTask` instead, bound at the composition root directly to the
 * `open_task` action's `run` — in-process, never a second HTTP hop
 * (the architecture doc §8 B1).
 */
interface ToolHandlersCoreApiAccessor {
	/** Structural mirror of the fields `write_memory`/`submit_review`/`create_artifact` read off `TaskView`. */
	openTask(
		id: string,
		actorId: string,
	): Promise<
		| {
				readonly task: { readonly parentTaskId: string | null; readonly teamId: string };
		  }
		| undefined
	>;
	getUserById(
		id: string,
		actorId: string,
	): Promise<
		| {
				readonly id: string;
				readonly role: string | null;
				readonly teamId: string | null;
				readonly name: string;
		  }
		| undefined
	>;
	listUsersByTeam(
		teamMembersId: string,
		actorId: string,
	): Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly role: string | null }>
	>;
	// There is no `findSoleHumanUser`/`getThreadById`/`insertThread`/
	// `updateThread`/`insertMessage`/`findOrCreateDirectThread`/
	// `getFirstThreadByHost` — `reply`/`create_item`/`submit_review` are gone;
	// the thread module's `send_message`/`adjust_thread` actions cover every
	// one of those capabilities.
	/**
	 * @lore AU21 §9 Increment 2 (org/routine/handoff wave): every former
	 * `ToolHandlersOrgAccessor`/`ToolHandlersRoutineAccessor`/
	 * `ToolHandlersPolicyAccessor.handoff` capability moved onto this seam
	 * (`edge-disposition.md`'s `org.{getTeam, getTeamMembers, createTeam,
	 * updateTeam}`, `routine.{getRoutine, insertRoutine, updateRoutine}`, and
	 * `policy.handoff` rows) — the agent acting on core "just like the user
	 * would", same as `work`/`users`/`conversation`'s earlier migrations.
	 */
	getTeamById(
		teamId: string,
		actorId: string,
	): Promise<{ readonly id: string; readonly name: string } | undefined>;
	getTeamMembersByTeamId(
		teamId: string,
		actorId: string,
	): Promise<{ readonly id: string } | undefined>;
	/** Atomically creates a `teams` row + its `teamMembers` companion (1:1 invariant). */
	createTeam(input: ToolHandlersCreateTeamInput, actorId: string): Promise<void>;
	/** Update team-owned columns (phase on `teams`, leadAgentId on `teamMembers`). */
	// @lore BB1: activeBets removed from patch — WIP limit is capacity counted live.
	updateTeam(
		teamId: string,
		patch: { phase?: string; leadAgentId?: string },
		actorId: string,
	): Promise<void>;
	// There is no `resolveReviewRecipientsForItem` — `create_item`/
	// `submit_review` are gone.
	/**
	 * @lore AU44 AU20-fd: replaces `persistScaffoldedAgents` — seam now accepts the scaffold
	 * request; core-api resolves via `resolveAgentScaffoldSpecs` then persists.
	 * Mirrors `POST /org/scaffold-request`.
	 */
	scaffoldFromRequest(
		teamMembersId: string | null,
		trigger: "team_scaffold" | "agent_added" | "user_assistant",
		teamName: string | null,
		role: string | null,
		name: string | null,
		ownerUserId: string | null,
		ownerUserName: string | null,
		systemPromptOverride: string | undefined,
		actorId: string,
	): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }>;
	insertRoutine(input: Record<string, unknown>, actorId: string): Promise<string | null>;
	getRoutineById(
		id: string,
		actorId: string,
	): Promise<
		{ readonly name: string; readonly state: string; readonly deletedAt: string | null } | undefined
	>;
	updateRoutineById(id: string, updates: Record<string, unknown>, actorId: string): Promise<void>;
	/**
	 * @lore AU21 §9 Increment 2 (knowledge wave): every former
	 * `ToolHandlersKnowledgeAccessor` capability moved onto this seam
	 * (`edge-disposition.md`'s `knowledge.{get, create, transition,
	 * findOpenConflict, recordConflict}` row) — the agent acting on core
	 * "just like the user would", same as every other Increment 2 migration.
	 *
	 * @lore nested-knowledge-items: `search` is DELETED — its only consumer,
	 * `query_practice`, is gone (its one filter was `layer === 'L3'`).
	 */
	create(
		input: ToolHandlersCreateKnowledgeItemInput,
		actorId: string,
	): Promise<{ readonly id: string; readonly version: number }>;
	createKnowledgeConflict(
		input: ToolHandlersCreateKnowledgeConflictInput,
		actorId: string,
	): Promise<void>;
}

// There is no `ToolHandlersReviewAccessor`/`gate.linkReviewToSession` —
// `ThreadActionsDeps.linkReviewToSession` (bound to
// `AgentOrchestrationPort.gate.linkReview`) is the seam's own successor;
// core calls it directly rather than a tool dialling back into
// agent-orchestration.

/** Every real outbound port this Service's source files need. */
export interface ToolHandlersPorts {
	readonly coreApi: ToolHandlersCoreApiAccessor;
}
