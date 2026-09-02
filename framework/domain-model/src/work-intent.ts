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
 * than a fixed db type: `@hyperidle/work-intent-port` has zero `@hyperidle/db`
 * dependency (a leaf package), so it cannot name `HyperIdleDb`/`WriteExecutor`
 * directly. The composition root (`packages/server`) instantiates this
 * generic with its own concrete `HyperIdleDb` type; the real concrete
 * recorder (`@hyperidle/session-requests`'s `enqueueWorkIntent`) is
 * assigned unchanged — no adapter needed (its `AgentWorkIntentDb` param type
 * is a structural superset of `HyperIdleDb`).
 */

import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";

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
	 * Others instead bake a `contextBundle` (Decision H3, Increment 12).
	 */
	readonly transcript?: ReadonlyArray<{
		readonly senderId: string;
		readonly payload: string;
		readonly type: string;
	}>;
	/**
	 * AU21 §9 Increment 12 (Decision H3): the `task_run`/`knowledge_action`/
	 * `routine_run` families' baked entity content (task/bet/
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
	 * conversation thread), `task_run`/`session_start`/
	 * `knowledge_action` (the
	 * knowledge item's thread). `routine_run` bakes none — a routine has no
	 * thread host — and its `reply` tool call falls back to a direct thread
	 * with the sole human user instead. Carried through onto the created
	 * `AgentSessionRequest.payloadJson` alongside `agentConfig` so `reply`
	 * has somewhere to post with zero orchestration -> core read.
	 */
	readonly callingThreadId?: string;
	// @lore AU26 F2: an `injectedFilesystems` bake used to ride here, frozen at
	// emit time by every per-kind resolver. It is DELETED, exactly as E3 deleted
	// the `injectedConnections` twin: `filesystems` / `filesystem_injections`
	// are agent-orchestration's own tables now, so the spawn reads the record
	// live and in-layer instead of consuming a snapshot that went stale between
	// emit and drain.
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
 * admission-relevant configuration, baked at emit time from the SAME
 * `agent: User` row every per-kind resolver already loads via
 * `requireRunnableAgent` to validate the ast-`<userId>` invariant. Carries the
 * runnability predicate (`kind`/`status`), the `role` prompt assembly needs,
 * and the agent's own home team (`teamId`, distinct from
 * `ProvisionSessionParams.productId`, which is the TASK's team).
 *
 * @lore AU26 G1 (architecture §D-L): the five RUN-CONFIG fields this shape used
 * to carry — `systemPrompt`, `harnessType`,
 * `modelProvider`, `maxConcurrentSessions` — LEFT the bake when the columns
 * left `users`. They are no longer core state, so there is nothing for core to
 * bake: they live in `agent_run_config`, which agent-orchestration owns, and
 * `admitSession` reads them live at drain through
 * `ports.agentRunConfig.readAgentRunConfig`. That is an IN-LAYER read of
 * orchestration's own table, not a reinstatement of the core-state read AU21
 * Increment 12 closed — the four fields left here are all genuinely core's
 * (`middleware/auth.ts`, `recipients.ts`, `policy-bindings.ts` all use them).
 * Do not re-add a run-config field to this shape; add it to `agent_run_config`.
 */
export interface BakedAgentRunnableConfig {
	readonly kind: string;
	readonly status: string;
	readonly role: string;
	readonly teamId: string | null;
	/**
	 * The agent's identity — the body of the `agent_file` knowledge document
	 * bound to it, which becomes the "## Identity" section of the AGENTS.md its
	 * session reads.
	 *
	 * Baked here rather than read at provisioning time because it lives in
	 * `knowledge_items`, which belongs to the knowledge service; the provisioner
	 * reads `agent_run_config`, which is orchestration's own. Every path bakes
	 * this config, including the assistant turn, which bakes no context bundle —
	 * so this is the one carrier that reaches all of them.
	 */
	readonly persona?: string | null;
}

/**
 * Map a resolver's already-loaded `agent: User` row (or any object structurally
 * satisfying `BakedAgentRunnableConfig`'s fields — `@hyperidle/work-intent-port` has zero
 * `@hyperidle/db` dependency, so this stays duck-typed, same idiom as
 * `SessionKnowledgeItemLike`) onto the exact whitelisted `BakedAgentRunnableConfig`
 * shape. A deliberate whitelist pick, not a spread — `User` carries other
 * columns (name, avatar, credentials, etc.) that must never ride onto the
 * baked `AgentSessionRequest.payloadJson`.
 */
export function bakeAgentRunnableConfig(
	agent: BakedAgentRunnableConfig,
	persona?: string | null,
): BakedAgentRunnableConfig {
	return {
		kind: agent.kind,
		status: agent.status,
		role: agent.role,
		teamId: agent.teamId,
		...(persona ? { persona } : {}),
	};
}

/** One ranked+budgeted knowledge item as baked onto a `BakedContextBundle`. */
export interface BakedContextKnowledgeItem {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	/**
	 * @lore nested-knowledge-items §5: the chain of ancestor knowledge items
	 * this item sits under, root first. `writeContextBundle` does zero DB
	 * reads ("every byte comes from `bundle`"), so an ancestor that was not
	 * itself selected still needs its directory-with-index materialised —
	 * this is the only place that obligation can be carried. Empty for a root
	 * item or one whose parent is not a knowledge item (task/thread/routine/
	 * agent — walks never cross that hop).
	 */
	readonly parentChain: ReadonlyArray<{ readonly id: string; readonly title: string }>;
	/**
	 * @lore BA9b: Role determines how context assembly materialises this item.
	 * Defaults to 'ordinary' for all items that pre-date the role column.
	 * - ordinary: knowledge/... files
	 * - skill: .claude/skills/<title>/SKILL.md
	 * - rule: knowledge/rules/<title>
	 * - agent_file: AGENTS.md/CLAUDE.md, bound to the agent named by the parent slot
	 * - prompt: the run's instruction — never materialised as a sandbox file
	 */
	readonly role: string;
	/**
	 * @lore BA9b: For role='agent_file', this is the agentId the file is
	 * bound to. Only the agent whose session matches this id receives the
	 * file.
	 *
	 * @lore knowledge-attachment-slot: the binding moved from a scope reverse
	 * lookup to the parent slot — `parentKind='agent'`, `parentId=<agentId>` —
	 * so this is now derived from the parent, not from `scopeId`.
	 */
	readonly agentBindingId: string | null;
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B — the structural shape
 * `@hyperidle/knowledge`'s `assembleSessionKnowledge` (Wave A) returns
 * (`KnowledgeItemWithProjection`), duck-typed here so `work`/`routine`/
 * `review`'s per-kind resolvers can type their INJECTED `assembleSessionKnowledge`
 * dependency (Mechanism C: none of those packages may import
 * `@hyperidle/knowledge` directly) without needing that Service's own type.
 * `layer` stays optional (matching `KnowledgeItemWithProjection`'s own
 * `role`, `parentKind` and `parentId` are required: all three come from the
 * kernel `knowledgeItems` table, which is always present in a DB row. role is
 * NOT NULL DEFAULT 'ordinary'; `parentKind`/`parentId` are nullable but always
 * present — the same rule this doc comment already stated for `scopeId`,
 * which this interface no longer needs (its only reader was the
 * agentBindingId derivation below). No compat shim — callers provide the real
 * DB values.
 */
export interface SessionKnowledgeItemLike {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	/** @lore nested-knowledge-items §5: see `BakedContextKnowledgeItem.parentChain`. */
	readonly parentChain?: ReadonlyArray<{ readonly id: string; readonly title: string }>;
	/**
	 * @lore BA9b: Kernel table column, NOT NULL DEFAULT 'ordinary'. Required.
	 * Every DB row carries a non-null role after migration 0062.
	 */
	readonly role: string;
	/**
	 * @lore knowledge-attachment-slot: kernel table columns, required,
	 * nullable — the parent slot this item hangs off, if any.
	 * toBakedContextKnowledgeItems derives agentBindingId from these two
	 * fields: `parentKind === "agent"` means `parentId` names the bound
	 * agent.
	 */
	readonly parentKind: string | null;
	readonly parentId: string | null;
}

/**
 * Map `assembleSessionKnowledge`'s ranked+budgeted output onto the
 * `BakedContextKnowledgeItem[]` shape every `contextBundle` variant carries —
 * one shared mapper so `task-run-resolver.ts`/`knowledge-action-resolver.ts`/
 * the routine resolver doesn't reimplement the
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
		parentChain: item.parentChain ?? [],
		role: item.role,
		// @lore knowledge-attachment-slot: the binding is the parent, not the
		// scope — always derived, never set explicitly (no shim path). One
		// semantic flip is deliberate: a team-scoped agent_file (unreachable in
		// production — no writer creates one) used to derive
		// agentBindingId=<teamId>, matching no agent and so silently inert
		// everywhere. It has no parent under this derivation, and null means
		// UNBOUND — delivered to every session in reach, per BA9b's stated
		// intent for an agent file nobody claims.
		agentBindingId: item.parentKind === "agent" ? item.parentId : null,
	}));
}

/**
 * AU21 §9 Increment 12 (Decision H3) — the baked entity content a
 * a `task_run` session needs (`kind:"task"`, matching
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
/**
 * The event that caused an event-triggered routine to fire.
 * Assembled by the scheduler at fire-time; threaded into the baked bundle so
 * the running agent knows what happened and who was involved.
 *
 * @lore BA9c: Lives in domain-model (not event-bus) to avoid a circular
 * dependency — event-bus already imports from domain-model. Uses plain
 * `string` for `type` rather than importing `DomainEvent`.
 */
export interface RoutineTriggerEvent {
	/** The domain event type string (e.g. "task_state_changed"). */
	readonly type: string;
	/** Unix timestamp (ms) of the original domain event. */
	readonly timestamp: number;
	/** State transition when the event carries one (fromState/toState). */
	readonly transition?: {
		readonly from: string;
		readonly to: string;
	};
	/**
	 * The entity the event concerns, assembled as fully as possible.
	 *
	 * - `task`: the task plus its ancestor chain, DB-loaded (task_state_changed /
	 *           dependency_met). BB1 removed the separate `bet` variant — a bet is
	 *           a root task now, so a bet event IS a task event.
	 * - `generic`: for all other event types that carry a named entity id (threadId,
	 *   itemId, sessionId, artifactId, teamId, agentId, userId, routineId, …).
	 *   No DB lookup — carries the id directly from the event.
	 *   `actorId` is set when the event explicitly names who performed the action
	 *   (senderId, accessorId, agentId on thread/knowledge/session events).
	 * Absent only when the event carries genuinely no identifying id.
	 */
	readonly subject?:
		| {
				readonly kind: "task";
				readonly task: {
					readonly id: string;
					readonly title: string;
					readonly description: string | null;
					readonly state: string;
				};
				/**
				 * BB1: the containing work, root first, down to the immediate
				 * parent. Empty for a root task.
				 *
				 * Replaces the single `bet` this carried. A task used to sit
				 * exactly one level under a bet, so one entity was the whole
				 * context above it; a task can now sit at any depth, and an agent
				 * on a leaf needs the goal chain it is serving, not just the step
				 * directly above.
				 */
				readonly ancestors: readonly {
					readonly id: string;
					readonly title: string;
					readonly description: string | null;
					readonly doneCondition: string | null;
				}[];
		  }
		| {
				/**
				 * Generic entity carrier for non-task/bet events.
				 * `entityKind` is a human-readable noun matching the event vocabulary
				 * (e.g. "routine"). `actorId` is the id of the person or agent who
				 * performed the action when the event names one.
				 *
				 * @lore BA9c: routineId stays generic — a routine waking about
				 * another routine is thin by nature; there is no useful payload
				 * beyond what the event already carries. Do not promote it.
				 */
				readonly kind: "generic";
				readonly entityKind: string;
				readonly entityId: string;
				readonly actorId?: string;
		  }
		| {
				/** BA9c: DB-loaded thread subject (thread events). */
				readonly kind: "thread";
				readonly thread: {
					readonly id: string;
					/** Entity type the thread belongs to (e.g. "task", "bet", "user"). */
					readonly hostKind: string;
					readonly hostId: string;
					/** null = open; ISO-8601 string = resolved. */
					readonly resolvedAt: string | null;
				};
				readonly actorId?: string;
		  }
		| {
				/**
				 * BA9c: DB-loaded work-block subject (item_created events — rows from
				 * the `items` table, the founder's "block" concept: action items, reviews,
				 * planning blocks). This is NOT `knowledge_items` — it is the work layer's
				 * block entity, owned by @hyperidle/work, created via work.create("item").
				 * The two nouns name genuinely different entities with different owners.
				 */
				readonly kind: "item";
				readonly item: {
					readonly id: string;
					readonly title: string;
					/** "review", "action", etc. Nullable on the DB row. */
					readonly kind: string | null;
					readonly body: string | null;
				};
				readonly actorId?: string;
		  }
		| {
				/**
				 * BA9c: DB-loaded knowledge-base subject (knowledge_created /
				 * knowledge_updated / knowledge_archived / knowledge_accessed events —
				 * rows from the `knowledge_items` table). This is the knowledge layer:
				 * captured learnings, skills, memory — owned by @hyperidle/knowledge,
				 * written through create() which writes kernel + app-projection together.
				 * NOT the same as `kind:"item"` (work blocks). Different table, different owner.
				 */
				readonly kind: "knowledge-item";
				readonly item: {
					readonly id: string;
					readonly title: string;
					readonly body: string;
					readonly format: string;
					readonly version: number;
				};
				readonly actorId?: string;
		  }
		| {
				/**
				 * BA9c: DB-loaded team subject (team_created, work_selection_requested events).
				 * Reuses BakedContextBundle team shape: {id, name}.
				 */
				readonly kind: "team";
				readonly team: {
					readonly id: string;
					readonly name: string;
				};
				readonly actorId?: string;
		  }
		| {
				/** BA9c: DB-loaded session subject (session_started / session_ended etc. events). */
				readonly kind: "session";
				readonly session: {
					readonly id: string;
					readonly state: string;
					readonly agentId: string;
					readonly outcome: string | null;
				};
				readonly actorId?: string;
		  }
		| {
				/**
				 * BA9c: DB-loaded agent subject (agent_added events when agentId is the
				 * primary entity — priority above teamId so agent_added → kind:"agent",
				 * not kind:"team").
				 * Reuses BakedContextBundle agent shape: {id, name, role}.
				 */
				readonly kind: "agent";
				readonly agent: {
					readonly id: string;
					readonly name: string;
					readonly role: string;
				};
				readonly actorId?: string;
		  }
		| {
				/**
				 * BA9c: DB-loaded user subject (user_created events — a human joining
				 * the workspace). Same {id, name, role} shape as kind:"agent" but the
				 * discriminant carries information: "user" means a person joined,
				 * "agent" means a bot was added to a team. A routine doing onboarding
				 * acts differently on each. Loaded from the `users` table via
				 * @hyperidle/users findUser, the same table that stores agents.
				 */
				readonly kind: "user";
				readonly user: {
					readonly id: string;
					readonly name: string;
					readonly role: string;
				};
				readonly actorId?: string;
		  };
}

export type BakedContextBundle =
	| {
			readonly kind: "task";
			readonly task: {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly state: string;
			};
			/**
			 * BB1: the containing work, root first, down to the immediate
			 * parent. Empty for a root task.
			 *
			 * Replaces the single `bet` this carried. A task used to sit
			 * exactly one level under a bet, so one entity was the whole
			 * context above it; a task can now sit at any depth, and an agent
			 * on a leaf needs the goal chain it is serving, not just the step
			 * directly above.
			 */
			readonly ancestors: readonly {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly doneCondition: string | null;
			}[];
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  }
	| {
			readonly kind: "routine";
			readonly routine: {
				readonly id: string;
				readonly name: string;
				/** BA1 D3: one column, one field — replaces `description`. */
				readonly prompt: string | null;
				readonly lastRunSummary: string | null;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			/** BA1 D4: nullable — the owner agent may belong to no team. */
			readonly team: { readonly id: string; readonly name: string } | null;
			readonly knowledge: readonly BakedContextKnowledgeItem[];
			/**
			 * BA9c: The event that caused this routine to fire. Absent for clock-fired
			 * (heartbeat/calendar) routines — those have no triggering event.
			 */
			readonly triggerEvent?: RoutineTriggerEvent;
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
 * (`framework/db/src/schema.ts`) exactly. `work` (`task_run`) and `review`
 * used to re-declare their own narrower local mirrors of
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
			/**
			 * @lore BA2: a human decided on the review an agent filed, and the agent
			 * that asked has to be brought back to its own session with the answer.
			 *
			 * This kind does NOT start a session, so it bakes no
			 * `BakedWorkIntentRequest` — there is no agent to resolve, no context to
			 * assemble and no prompt to compose. Everything a resume needs is the
			 * session to return to and what to tell it.
			 */
			readonly kind: "session_resume";
			readonly sourceKind: "review_verdict";
			/** The review message the human decided on. */
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			readonly resume: BakedSessionResumeRequest;
	  };

/**
 * What a resume needs, baked when the verdict is recorded.
 *
 * @lore BA2: Baked rather than read at drain time for the same reason every
 * other kind bakes — the drain does zero domain reads. It also means the record
 * of what was approved is fixed at the moment a human decided it, not
 * reconstructed later from rows that may have moved on.
 */
export interface BakedSessionResumeRequest {
	/** The HyperIdle session to bring back. */
	readonly sessionId: string;
	/**
	 * The harness's own id for that session. Absent when the harness never
	 * reported one, which means the session cannot be resumed — the drain surfaces
	 * that to the human rather than silently doing nothing.
	 */
	readonly harnessSessionId?: string | null;
	/** What the human decided. A decline resumes too, carrying the reasoning back. */
	readonly decision: "approve" | "decline";
	/**
	 * The working directory the original session ran in.
	 *
	 * @lore BA2: cursor-agent keys a chat on an md5 of the cwd STRING —
	 * `~/.cursor/chats/<md5(cwd)>/` — so a resume from any other directory exits 0,
	 * echoes back the right session id, and runs with no context at all, silently.
	 * The chat content lives outside the sandbox, so what has to match is the path,
	 * not the directory's contents. claude finds a session by id from anywhere and
	 * does not care.
	 */
	readonly sandboxPath?: string | null;
	/** The thread the review lives in, where a failure has to be reported. */
	readonly threadId: string;
	/** The agent whose session this is. */
	readonly agentId: string;
	/**
	 * The asking agent's runnable-config snapshot. Baked when the human decides,
	 * like every other intent kind — `admitSession` treats an absent bake as a
	 * deactivated agent and refuses the run.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
}

/**
 * Plain function type replacing the former `AgentWorkIntentRecorder<TTx>` interface.
 * The TTx parameter was a lie — the sole implementation ignored it (seam calls
 * never join a caller's transaction). Every caller now holds a direct function.
 */
export type AgentWorkIntentRecorderFn = (
	input: AgentWorkIntentRecorderInput,
) => Promise<{ readonly id: string; readonly idempotencyKey: string }>;

/**
 * What happened when a verdict tried to send an agent back to its work.
 *
 * @lore BA2: A status rather than void, because the acceptance criterion is that
 * a failure REACHES the human who approved. Silent failure is the defect this
 * package exists to fix — a human sees "approved" and assumes the action
 * happened — so reproducing it here would fail the work.
 */
export type ReviewVerdictOutcome =
	/** The resume is queued. The agent will be brought back. */
	| { readonly status: "queued" }
	/** No session filed this review. Nothing to resume, and nothing wrong. */
	| { readonly status: "not_a_review_session" }
	/** A session filed it but cannot be brought back. The human has to be told. */
	| { readonly status: "not_resumable"; readonly reason: string };

/**
 * Records a human's verdict on a review an agent filed, and queues the resume
 * that carries it back to the agent.
 *
 * Injected into the core-api thread route the same way `AgentWorkIntentRecorderFn`
 * is, and for the same reason: `review_sessions` belongs to the agent-orchestration
 * layer, and a core-api route may not read it.
 */
export type ReviewVerdictRecorderFn = (input: {
	/** The review message the verdict resolved. */
	readonly reviewMessageId: string;
	readonly decision: "approve" | "decline";
	/** The human who decided. */
	readonly decidedBy: string;
	/** The thread the review lives in — where a failure has to be reported. */
	readonly threadId: string;
	/** The asking agent's runnable-config snapshot, baked by the caller (core state). */
	readonly agentConfig?: BakedAgentRunnableConfig;
}) => Promise<ReviewVerdictOutcome>;
