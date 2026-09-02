import type {
	ConfigurationKind,
	PluginContributionKind,
	PluginState,
} from "@hyperidle/domain-model";
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Core tables ---

// @lore U1: `teams` is the domain entity (formerly `products`). Migration 0021 renamed both
// tables; the companion `team_members` table (formerly `teams`) folded back in per AU44 batch 1.
// @lore AU44 B1: `team_members` is dissolved back into `teams`. The 1:1 invariant enforced by
// app-level 500s was the schema confessing two tables were one entity. Columns `leadAgentId`,
// `capacity`, `activeBets`, `formedAt` move here; `dissolvedAt` is dropped (teams.phase =
// "archive" carries that signal). `users.teamId` now references `teams.id` directly.
export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	phase: text("phase").notNull(),
	briefPath: text("brief_path"),
	architecturePath: text("architecture_path"),
	brandPath: text("brand_path"),
	principlesPath: text("principles_path"),
	factoryDbPath: text("factory_db_path"),
	createdAt: text("created_at").notNull(),
	// AU44 B1: folded from team_members
	leadAgentId: text("lead_agent_id"),
	/**
	 * BB1: the WIP limit — how many tasks this team may have `in_progress` at
	 * once, at any depth in the task tree.
	 *
	 * @lore BB1: the companion `active_bets` counter is GONE. It was a stored
	 * tally maintained by the bet commit/complete/kill paths, and a stored
	 * tally of a derivable fact can drift. The live count is a
	 * `COUNT(*) WHERE state = 'in_progress'` inside the same transaction that
	 * makes the transition, so it cannot be stale by construction.
	 */
	capacity: integer("capacity").notNull().default(5),
	formedAt: text("formed_at"),
});

export const users = pgTable(
	"users",
	{
		id: text("id").primaryKey(),
		/** "human" | "ai" — P2: kind column distinguishes human founders from AI agents. */
		kind: text("kind").notNull().default("ai"),
		name: text("name").notNull(),
		// @lore AU44 B1: users.team_id now references teams.id directly (team_members dissolved).
		// Before AU44: referenced team_members.id; the migration updated all values to teams.id.
		teamId: text("team_id").references(() => teams.id, { onDelete: "restrict" }),
		role: text("role").notNull(),
		status: text("status").notNull(),
		/** P2: human-specific nullable columns. Null for AI users. */
		email: text("email"),
		avatarUrl: text("avatar_url"),
		createdAt: text("created_at").notNull(),
		/**
		 * AB0: Agent category — team | individual.
		 * Null for human users and system users.
		 * @lore AB0: This replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES
		 * split which was about system layer, not agent category.
		 */
		agentCategory: text("agent_category"),
		/**
		 * BA1 D6: who an agent belongs to, as a real column — a team (`teamId`),
		 * a person (`ownerUserId`), or neither. Null for human users (the
		 * `users_belonging_ck` check below is trivially satisfied by them).
		 * Written only through `@hyperidle/users`' `insertUser`; `updateUser`
		 * is deliberately not extended (BA1 has no post-creation belonging
		 * change — see `resolve-scaffold-specs.ts`'s `user_assistant` case).
		 */
		ownerUserId: text("owner_user_id").references((): AnyPgColumn => users.id, {
			onDelete: "set null",
		}),
		/** BA9d: set when this user row was materialised by a plugin install. Used for disable/enable/remove cleanup. */
	},
	(table) => [
		check(
			"users_belonging_ck",
			sql`${table.ownerUserId} IS NULL OR (${table.kind} = 'ai' AND ${table.teamId} IS NULL)`,
		),
	],
);

/**
 * AU26 G1 — one agent's run configuration, keyed on its `users` row.
 *
 * @lore AU26 G1 (architecture §D-L): `users` used to carry agent-execution
 * configuration (`harness_type`,
 * `model_id`, `model_provider`, `max_concurrent_sessions`) on the same row as
 * human identity. Core administers those fields but never operationally
 * consumes them — only an agent's session does — so they relocate here, owned
 * by `layers/agent-orchestration/agent-run-config`. `users` survives intact
 * as the single human+agent identity record: `kind`, `status`, `agent_category`,
 * `role`, `team_id` stay put because core genuinely uses them
 * (`middleware/auth.ts`, `recipients.ts`, `policy-bindings.ts`).
 *
 * @lore The agent's identity is no longer here: it is an `agent_file` knowledge
 * document bound to the agent (scope_kind='user', scope_id=agentId), which is
 * what that role has always meant. Migration 0069 moved every existing prompt.
 *
 * @lore AU26 G1: `system_prompt_path` and `skills` were dropped, not moved —
 * zero production readers repo-wide (seed fixtures only) at the time of the
 * move. Do not resurrect either as a column here.
 *
 * @lore AU26 G1: **absent row ≡ all-null row.** `max_concurrent_sessions` is
 * the one NOT NULL DEFAULT 1 column (matching its pre-move shape on `users`);
 * every other field is nullable with no default, and the effective defaults
 * live in the resolvers, never in the columns. `readAgentRunConfig` therefore
 * returns `DEFAULT_AGENT_RUN_CONFIG` for an agent with no row rather than
 * `undefined` — an agent whose config was never written resolves exactly what
 * an all-null row resolves.
 */
export const agentRunConfig = pgTable("agent_run_config", {
	agentUserId: text("agent_user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	harnessType: text("harness_type"),
	modelId: text("model_id"),
	modelProvider: text("model_provider"),
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	/**
	 * The harness options this agent's model runs with, as a JSON object of the
	 * option keys the harness declares for that model.
	 *
	 * Nullable with no default: an agent configured before this column existed,
	 * or one whose options were never touched, reads as `{}` and runs exactly as
	 * it did before. Sparse by design — only a value the user moved away from the
	 * harness's own default is stored, so an absent key means "whatever the
	 * harness does", not "unset".
	 */
	modelOptionsJson: text("model_options_json"),
});

// --- Process primitives ---

export const tasks = pgTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		/**
		 * BB1: the task tree. NULL means a root task — the shape a bet used to
		 * have. Replaces the NOT NULL `bet_id`, which hardcoded work to exactly
		 * two levels.
		 *
		 * @lore BB1: a self-FK needs the explicit `AnyPgColumn` return type or
		 * TypeScript cannot infer the circular reference.
		 *
		 * @lore BB1: ON DELETE RESTRICT, not CASCADE. Killing a subtree is a
		 * domain operation with an audit trail (`cascadeTaskKill`), never a
		 * silent row disappearance — the same reason every other FK here
		 * restricts.
		 */
		parentTaskId: text("parent_task_id").references((): AnyPgColumn => tasks.id, {
			onDelete: "restrict",
		}),
		// @lore U1: teamId references the new `teams` table (formerly `products`).
		// The old teamId (pointing at team_members) was dropped — see §2.3.
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		ownerAgentId: text("owner_agent_id").references(() => users.id, { onDelete: "restrict" }),
		title: text("title").notNull(),
		description: text("description"),
		doneCondition: text("done_condition"),
		state: text("state").notNull(),
		dependencies: text("dependencies"),
		threadId: text("thread_id").references(() => threads.id, { onDelete: "restrict" }),
		notes: text("notes"),
		auditTrail: text("audit_trail"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		/** AC1: Task outcome verdict. Closed enum: met|met_with_rework|partially_met|not_met. Null = not evaluated. */
		outcomeVerdict: text("outcome_verdict"),
		/**
		 * BB1: free-text explanation of the outcome (moved from `bets`, where it
		 * was the only half of the outcome pair tasks lacked).
		 */
		outcomeSummary: text("outcome_summary"),
		/** AC1: ISO 8601 timestamp when the task outcome was last recorded. */
		outcomeRecordedAt: text("outcome_recorded_at"),
		/** AC1: User ID of the actor who last recorded the task outcome. */
		outcomeRecordedBy: text("outcome_recorded_by"),
		/**
		 * BB1: accumulated TokenUsage actuals for THIS task's own sessions
		 * (moved from `bets`). Ancestors are never written — a subtree total is
		 * summed at read time, so there is no rollup column to drift.
		 */
		tokensActualJson: text("tokens_actual_json"),
		/**
		 * BB1: provenance — the knowledge item this task was promoted from
		 * (moved from `bets`, AK5). RESTRICT so provenance outlives a
		 * convenience delete.
		 */
		sourceKnowledgeItemId: text("source_knowledge_item_id").references(() => knowledgeItems.id, {
			onDelete: "restrict",
		}),
		/** BB1: set when the task reaches `done` (moved from `bets`). */
		completedAt: text("completed_at"),
		/**
		 * BB1: display order among siblings. Defaults to creation order; ties
		 * break on `createdAt` then `id` so the order is total and stable.
		 *
		 * @lore BB1: deliberately NOT derived from `dependencies`, and
		 * deliberately not recency. `dependencies` says what must FINISH first;
		 * this says what to SHOW first, and two siblings with no dependency
		 * between them still need a defined order. Ordering by recency would
		 * reshuffle the tree whenever someone edits a child, which makes a tree
		 * unbrowsable. Aligned with the nested-knowledge-documents tree, which
		 * chose the same shape for the same reason.
		 */
		position: integer("position").notNull().default(0),
		/**
		 * BB1: does finishing this task need a human verdict?
		 *
		 * `false` (the default) means the task closes straight to `done` when its
		 * work finishes — a session ending, or every child reaching a terminal
		 * state. `true` sends it to `review` instead.
		 *
		 * @lore BB1: before this, EVERY task went to `review` when its session
		 * ended (`lifecycle-propagation.ts`), which made review a queue nobody
		 * could keep up with. Opting in is what makes the queue mean something.
		 *
		 * @lore BB1: deliberately a boolean, not a risk tier. The product used to
		 * carry `riskTier` on `task_planning_signals`, which was deleted; reviving
		 * a three-value scale would mean inventing how risk gets estimated, and
		 * nothing estimates it today. Founder call: start with the flag, add a way
		 * to derive it later. A flag that something sets beats a scale nothing
		 * computes.
		 */
		needsReview: boolean("needs_review").notNull().default(false),
	},
	(table) => [
		index("tasks_parent_task_id_idx").on(table.parentTaskId),
		index("tasks_team_id_idx").on(table.teamId),
		// @lore I3 review O1: `tasks_state_idx` was dropped — state has too
		// few distinct values to be selective.
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		/**
		 * AU1: nullable because assistant/routine/knowledge/decomposition runs are
		 * real sessions without fabricated task rows. Task-backed sessions keep the FK.
		 */
		taskId: text("task_id").references(() => tasks.id, { onDelete: "restrict" }),
		requestId: text("request_id"),
		sourceKind: text("source_kind"),
		sourceId: text("source_id"),
		sourceCorrelationJson: text("source_correlation_json"),
		agentId: text("agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		modelTier: text("model_tier").notNull(),
		startedAt: text("started_at").notNull(),
		endedAt: text("ended_at"),
		state: text("state").notNull(),
		/** @lore AK1: AK1 harness-vocab rename. Old name was the sandbox-as-workspace variant. New column name: sandbox_snapshot. */
		sandboxSnapshot: text("sandbox_snapshot"),
		outcome: text("outcome"),
		notes: text("notes"),
		/**
		 * AA1/AA2-prep: links this session to a routine run. Null until AA2 wires
		 * the scheduler to create sessions with a routine_id.
		 *
		 * @lore AA1: Column added now per "no incremental migrations" constraint.
		 * Will be populated in AA2 when the routine scheduler creates sessions.
		 * ON DELETE SET NULL ensures session records survive if a routine is retired.
		 */
		routineId: text("routine_id"),
		/**
		 * AC1: Session effectiveness score stored as text (float 0-1).
		 *
		 * @lore AC1 S-1: Stored as text (not real/float) because the existing schema
		 * uses text for all non-integer values (timestamps are text, money is split
		 * into integer + text). Use parseFloat() on read and .toString() on write.
		 * Always guard with Number.isNaN() after parseFloat.
		 */
		effectivenessScore: text("effectiveness_score"),
		/** AC1: ISO 8601 timestamp when the effectiveness score was last recorded. */
		effectivenessRecordedAt: text("effectiveness_recorded_at"),
		/** AC1: User ID (or agent ID) of the actor who last recorded the effectiveness score. */
		effectivenessRecordedBy: text("effectiveness_recorded_by"),
	},
	(table) => [
		index("sessions_task_id_idx").on(table.taskId),
		uniqueIndex("sessions_request_id_uq").on(table.requestId),
		index("sessions_source_idx").on(table.sourceKind, table.sourceId),
		index("sessions_agent_id_idx").on(table.agentId),
		index("sessions_state_idx").on(table.state),
		index("sessions_routine_id_idx").on(table.routineId),
	],
);

export const agentSessionRequests = pgTable(
	"agent_session_requests",
	{
		id: text("id").primaryKey(),
		sourceKind: text("source_kind").notNull(),
		sourceId: text("source_id").notNull(),
		streamId: text("stream_id").notNull(),
		taskId: text("task_id").references(() => tasks.id, { onDelete: "restrict" }),
		agentId: text("agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		teamId: text("team_id").references(() => teams.id, { onDelete: "restrict" }),
		userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
		promptMode: text("prompt_mode").notNull(),
		payloadJson: text("payload_json"),
		sourceCorrelationJson: text("source_correlation_json").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		status: text("status").notNull(),
		claimedBy: text("claimed_by"),
		claimedAt: text("claimed_at"),
		claimExpiresAt: text("claim_expires_at"),
		claimToken: text("claim_token"),
		sessionId: text("session_id"),
		terminationReason: text("termination_reason"),
		terminationRequestedAt: text("termination_requested_at"),
		terminationRequestedBy: text("termination_requested_by"),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("agent_session_requests_idempotency_uq").on(
			table.sourceKind,
			table.sourceId,
			table.idempotencyKey,
		),
		index("agent_session_requests_status_created_idx").on(table.status, table.createdAt),
		index("agent_session_requests_source_idx").on(table.sourceKind, table.sourceId),
		index("agent_session_requests_claim_expires_idx").on(table.claimExpiresAt),
		/**
		 * @lore AU9 durable-rows: running requires a session; claimed requires the
		 * token+expiry pair; closed (terminal) statuses forbid a live claim. Pending
		 * is permissive of session/claim absence (covered by the `running`/`claimed`
		 * branches being false — falls through to the closed-status branch is wrong,
		 * so pending is named explicitly).
		 */
		check(
			"agent_session_requests_correlation_ck",
			sql`
				(${table.status} = 'running' and ${table.sessionId} is not null)
				or (${table.status} = 'claimed' and ${table.claimToken} is not null and ${table.claimExpiresAt} is not null)
				or (${table.status} = 'pending')
				or (${table.status} in ('completed', 'failed', 'cancelled') and ${table.claimToken} is null and ${table.claimExpiresAt} is null)
			`,
		),
		check(
			"agent_session_requests_termination_reason_ck",
			sql`${table.terminationReason} is null or ${table.terminationReason} in ('user_done', 'user_crashed', 'handoff', 'shutdown')`,
		),
	],
);

/**
 * Durable neutral handoff between core domain writes and the agent runtime.
 * @lore AU9: EventBus delivery is only a latency hint. This row is mandatory because
 * process death between a domain commit and an in-memory emit must not lose work.
 */
export const agentWorkIntents = pgTable(
	"agent_work_intents",
	{
		id: text("id").primaryKey(),
		kind: text("kind").notNull(),
		sourceKind: text("source_kind").notNull(),
		sourceId: text("source_id").notNull(),
		requestedBy: text("requested_by"),
		idempotencyKey: text("idempotency_key").notNull(),
		status: text("status").notNull().default("pending"),
		claimToken: text("claim_token"),
		claimExpiresAt: text("claim_expires_at"),
		requestId: text("request_id").references(() => agentSessionRequests.id, {
			onDelete: "restrict",
		}),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		lastErrorCode: text("last_error_code"),
		/**
		 * @lore AU21 Increment 3 Wave 0: the emit-time-resolved request
		 * (`resolveIntentInputInternal`'s current per-kind return shape),
		 * populated by a migrated family's emit-side resolver. When present the
		 * drain uses it directly (zero domain reads); when absent (the one
		 * remaining unmigrated case, `routine_run`) the drain falls through to
		 * its existing per-kind resolution branch.
		 */
		bakedRequestJson: text("baked_request_json"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("agent_work_intents_identity_uq").on(
			table.kind,
			table.sourceKind,
			table.sourceId,
			table.idempotencyKey,
		),
		uniqueIndex("agent_work_intents_request_id_uq")
			.on(table.requestId)
			.where(sql`${table.requestId} is not null`),
		index("agent_work_intents_status_created_idx").on(table.status, table.createdAt),
		index("agent_work_intents_claim_expires_idx").on(table.claimExpiresAt),
		check(
			"agent_work_intents_kind_ck",
			sql`${table.kind} in ('assistant_turn','session_start','knowledge_action','routine_run','task_run')`,
		),
		check(
			"agent_work_intents_source_kind_ck",
			sql`${table.sourceKind} in ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt')`,
		),
		check(
			"agent_work_intents_status_ck",
			// @lore AU21 Decision B‴: `superseded` added — a re-emit for the same
			// (kind, sourceId) identity with a fresher idempotencyKey wins; the
			// older pending/claimed intent is retired as `superseded` (never
			// dispatched), not `failed` (it was not an error).
			sql`${table.status} in ('pending','claimed','handed_off','failed','superseded')`,
		),
		/** @lore AU9 durable-rows: kind/source compatibility is a closed pairing map (§Family atomic enqueue). */
		check(
			"agent_work_intents_kind_source_compat_ck",
			sql`
				(${table.kind} = 'assistant_turn' and ${table.sourceKind} = 'thread_message')
				or (${table.kind} = 'session_start' and ${table.sourceKind} = 'explicit_session_start')
				or (${table.kind} = 'knowledge_action' and ${table.sourceKind} = 'knowledge_action')
				or (${table.kind} = 'routine_run' and ${table.sourceKind} = 'routine_run')
				or (${table.kind} = 'task_run' and ${table.sourceKind} = 'task_dispatch_attempt')
			`,
		),
		/**
		 * @lore AU9 durable-rows: one closed per-status correlation check — pending
		 * forbids claim/correlation fields; claimed requires token+expiry and forbids
		 * request correlation; handed_off requires request_id; failed requires a
		 * stable last_error_code.
		 */
		check(
			"agent_work_intents_correlation_ck",
			sql`
				(${table.status} = 'pending' and ${table.claimToken} is null and ${table.claimExpiresAt} is null and ${table.requestId} is null)
				or (${table.status} = 'claimed' and ${table.claimToken} is not null and ${table.claimExpiresAt} is not null and ${table.requestId} is null)
				or (${table.status} = 'handed_off' and ${table.requestId} is not null)
				or (${table.status} = 'failed' and ${table.lastErrorCode} is not null)
				or (${table.status} = 'superseded' and ${table.claimToken} is null and ${table.claimExpiresAt} is null and ${table.requestId} is null)
			`,
		),
	],
);

export const explicitSessionStarts = pgTable(
	"explicit_session_starts",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "restrict" }),
		requestedAgentId: text("requested_agent_id").notNull(),
		requestedModelTier: text("requested_model_tier").notNull(),
		requestedBy: text("requested_by")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		idempotencyKey: text("idempotency_key").notNull(),
		status: text("status").notNull().default("requested"),
		requestId: text("request_id").references(() => agentSessionRequests.id),
		sessionId: text("session_id").references(() => sessions.id),
		failureCode: text("failure_code"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("explicit_session_starts_requester_key_uq").on(
			table.requestedBy,
			table.idempotencyKey,
		),
		index("explicit_session_starts_status_idx").on(table.status, table.createdAt),
		check(
			"explicit_session_starts_model_tier_ck",
			sql`${table.requestedModelTier} in ('reasoning','workhorse','fast')`,
		),
		check(
			"explicit_session_starts_status_ck",
			sql`${table.status} in ('requested','admitted','completed','failed','cancelled')`,
		),
		check(
			"explicit_session_starts_correlation_ck",
			sql`(${table.status} = 'requested' and ${table.requestId} is null and ${table.sessionId} is null and ${table.failureCode} is null) or (${table.status} in ('admitted','completed') and ${table.requestId} is not null and ${table.sessionId} is not null) or (${table.status} = 'failed' and ${table.failureCode} is not null) or (${table.status} = 'cancelled' and ${table.requestId} is not null)`,
		),
	],
);

/** @lore AU9: A task ID cannot identify retries or ownership handoffs; each dispatch
 * occasion is durable so replay can reuse it without suppressing later attempts. */
export const taskDispatchAttempts = pgTable(
	"task_dispatch_attempts",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "restrict" }),
		occasion: text("occasion").notNull(),
		agentId: text("agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		predecessorSessionId: text("predecessor_session_id").references(() => sessions.id, {
			onDelete: "restrict",
		}),
		ordinal: integer("ordinal").notNull(),
		status: text("status").notNull().default("requested"),
		requestId: text("request_id").references(() => agentSessionRequests.id, {
			onDelete: "restrict",
		}),
		sessionId: text("session_id").references(() => sessions.id, { onDelete: "restrict" }),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("task_dispatch_attempts_task_ordinal_uq").on(table.taskId, table.ordinal),
		index("task_dispatch_attempts_status_idx").on(table.status, table.createdAt),
		check(
			"task_dispatch_attempts_occasion_ck",
			sql`${table.occasion} in ('accepted','retry','owner_handoff')`,
		),
		check(
			"task_dispatch_attempts_status_ck",
			sql`${table.status} in ('requested','running','completed','failed','cancelled')`,
		),
	],
);

export const routines = pgTable(
	"routines",
	{
		id: text("id").primaryKey(),
		/** AA1: human-readable name for the routine. */
		name: text("name").notNull().default(""),
		/**
		 * BA1 D1: the instruction given to the owner agent when this routine
		 * fires. Renamed from `description` — the prompt never had a home of
		 * its own; this column IS it. Nullable: a routine with no prompt runs
		 * the owner agent on its own persona (AC3).
		 *
		 * @lore knowledge-attachment-slot: `prompt_knowledge_id` (the FK that
		 * used to live here) is dropped by migration 0077. The routine's prompt
		 * is now the knowledge document parented to this routine
		 * (`parentKind='routine', parentId=<this row's id>, role='prompt'`) —
		 * read through `getParentedItem` in `@hyperidle/knowledge`, never a
		 * column on this table. This closes a table-ownership violation BA9g
		 * named but did not fix: a column here describing a knowledge
		 * relationship, in a table the knowledge service does not own.
		 */
		ownerAgentId: text("owner_agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		triggerType: text("trigger_type").notNull(),
		triggerConfig: text("trigger_config"),
		/**
		 * BA1 D2: the event name for a `triggerType:"event"` routine, as a real
		 * indexable column — `trigger_config` (a JSON text blob) cannot carry an
		 * equality index. Null for non-event routines. See
		 * `routines_event_type_idx` below — the partial index this column exists
		 * to serve.
		 */
		eventType: text("event_type"),
		stateKey: text("state_key"),
		/**
		 * @lore O2: `humanReview` marks routines that must pause for human approval
		 * before completing. Kernel-only: determines the execution handoff path,
		 * not a strategy metric.
		 */
		humanReview: boolean("human_review").default(false),
		autonomyLevel: integer("autonomy_level"),
		silent: boolean("silent").default(false),
		/**
		 * @deprecated Use `state` instead. Kept for backward compat until AA2.
		 * @lore AA1: `active` boolean is preserved so existing code that reads it
		 * continues to work. New code reads `state`. AA2 will drop `active`.
		 * When `state` is set via PATCH, `active` is synced for backward compat.
		 */
		active: boolean("active").notNull().default(true),
		/**
		 * AA1: Routine lifecycle state: 'active' | 'paused' | 'error'. Replaces boolean `active`.
		 * Default 'active' matches the old boolean default (active=true).
		 */
		state: text("state").notNull().default("active"),
		lastRunAt: text("last_run_at"),
		nextRunAt: text("next_run_at"),
		/** AA2: Soft delete timestamp. When set, routine is archived. */
		deletedAt: text("deleted_at"),
		/** BA9d: set when this routine was materialised by a plugin install. Used for disable/enable/remove cleanup. */
		/** AA2: Last successful run's summary. Single-slot overwrite per concept doc. */
		lastRunSummary: text("last_run_summary"),
		/** AA2: Creation timestamp. Backfilled for pre-existing routines. */
		createdAt: text("created_at"),
		/**
		 * AA2 legacy: optional stub task link retained for older routine rows.
		 *
		 * @lore AU1: New routine creation must not fabricate tasks. Routine sessions are
		 * task-optional and correlate through agent_session_requests.sourceKind/sourceId
		 * plus routine_runs.id. This column remains nullable for compatibility with AA2 rows.
		 */
		stubTaskId: text("stub_task_id").references(() => tasks.id, { onDelete: "set null" }),
	},
	(table) => [
		index("routines_deleted_at_idx").on(table.deletedAt),
		/**
		 * BA1 D2: serves the per-event matcher's lookup
		 * (`trigger_type = 'event' AND event_type = $1`). The partial predicate
		 * deliberately excludes `active` — pausing a routine would otherwise
		 * churn the index on every toggle.
		 */
		index("routines_event_type_idx")
			.on(table.eventType)
			.where(sql`${table.triggerType} = 'event' AND ${table.deletedAt} IS NULL`),
	],
);

/**
 * AA1: Append-only log of routine execution runs. One row per trigger (manual or scheduled).
 *
 * @lore AA1: routine_runs is the lightweight audit log for execution history.
 * AA2 linked sessions.routine_id to these rows via the scheduler; `outcome` gained
 * a "running" state and is updated on session end.
 *
 * @lore AU21 Decision B″ (Increment 0 ruling, recorded 2026-07-27; COLLAPSED —
 * Increment 4, this is now the shipped state, not a target): this table STAYS
 * core-api-owned — `layers/core-api/routine/src/routine-service.ts` remains the
 * only module permitted to read or write it (AU13's boundary, unchanged) — it did
 * NOT become an orchestration-owned projection. What changed is WHO writes it.
 * Pre-Increment-3/4, three agent-orchestration modules wrote it directly via
 * composition-bundle DI (`dispatch`'s fire-time `insertRoutineRun`;
 * `session-requests`'s `failOrRelease` `updateRoutineRunIfRunning`;
 * `run-orchestration`'s `transition-run.ts`/`runtime-reapers.ts`
 * `updateRoutineRunById`). All three are now DISSOLVED: the insert is a
 * same-transaction core-api write inside the routine scheduler (relocated
 * core-side, Increment 4 Wave A, `routine-scheduler.ts`); the two update paths
 * re-homed onto core-api's own reactions to `agent_run_admission_failed`
 * (pre-handoff, `agent-run-admission-reactions.ts`, Increment 3) and
 * `session_ended`/`agent_run_lifecycle_changed` (post-session,
 * `routine-run-session-end-reactions.ts`, Increment 4). End state reached: a
 * "definition-only audit derived from events" — ZERO direct writes from
 * `agent-orchestration` into `routineRuns` anywhere in the tree (verified via
 * the anti-regrowth guard); every mutation now originates inside core-api
 * itself, either synchronously in the fire transaction or as an event-
 * subscriber reaction to orchestration's own lifecycle events. See
 * `.pipeline/work/AU21/architecture.md` Decision B″.
 */
export const routineRuns = pgTable(
	"routine_runs",
	{
		id: text("id").primaryKey(),
		routineId: text("routine_id")
			.notNull()
			.references(() => routines.id, { onDelete: "restrict" }),
		startedAt: text("started_at").notNull(),
		endedAt: text("ended_at"),
		/** 'success' | 'error' | 'skipped' | 'running' | 'timeout' */
		outcome: text("outcome").notNull(),
		errorMessage: text("error_message"),
		/**
		 * AA2: Link to the session that executed this run. NULL for pre-AA2 runs.
		 * ON DELETE SET NULL: deleting a session preserves the run history record.
		 */
		sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
		/** AA2: Agent-produced summary of this run's outcome. */
		summary: text("summary"),
	},
	(table) => [
		index("routine_runs_routine_id_idx").on(table.routineId, table.startedAt),
		index("routine_runs_session_id_idx").on(table.sessionId),
	],
);

// --- Messaging (L1a Thread primitive) ---

export const threads = pgTable(
	"threads",
	{
		id: text("id").primaryKey(),
		hostKind: text("host_kind").notNull(),
		hostId: text("host_id").notNull(),
		initiatorId: text("initiator_id").notNull(),
		participants: text("participants").notNull(),
		pinned: boolean("pinned").notNull().default(false),
		resolvedAt: text("resolved_at"),
		lastActiveAt: text("last_active_at").notNull(),
		createdAt: text("created_at").notNull(),
		/**
		 * AF14 AC6 / C2: Dedup key for direct (2-participant) threads only.
		 * Format: `${hostKind}:${hostId}:${sortedParticipants.join(",")}`
		 * NULL for group/feed/host-scoped threads — they are never deduped.
		 * The partial unique index (WHERE direct_key IS NOT NULL) enforces
		 * one row per direct identity under concurrency.
		 *
		 * @lore AF14: directKey is nullable and NOT backfilled for pre-AF14 threads.
		 * Historical duplicates (if any) are not retroactively merged.
		 * The assistant thread (host=user, hostId===senderId, participant=ast-<userId>)
		 * is exempt (directKey=null) to avoid overlap with assistant.ts.
		 */
		directKey: text("direct_key"),
	},
	(table) => [
		index("threads_host_idx").on(table.hostKind, table.hostId, table.lastActiveAt),
		index("threads_initiator_idx").on(table.initiatorId, table.lastActiveAt),
		// AF14 C2: partial unique index — only for direct (DM) threads.
		// WHERE clause prevents group/host-scoped threads from colliding.
		uniqueIndex("threads_direct_key_uq")
			.on(table.directKey)
			.where(sql`${table.directKey} IS NOT NULL`),
	],
);

export const messages = pgTable(
	"messages",
	{
		id: text("id").primaryKey(),
		senderId: text("sender_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		type: text("type").notNull(),
		payload: text("payload").notNull(),
		clientKey: text("client_key").notNull(),
		deletedAt: text("deleted_at"),
		redactedAt: text("redacted_at"),
		resolvedAt: text("resolved_at"),
		createdAt: text("created_at").notNull(),
		legacyItemId: text("legacy_item_id"),
		/** T5: Structured, queryable block anchor. Dual-written alongside payload.blockId. */
		blockId: text("block_id"),
	},
	(table) => [
		index("messages_thread_id_idx").on(table.threadId, table.createdAt),
		uniqueIndex("messages_idempotency_uq").on(table.threadId, table.senderId, table.clientKey),
		index("messages_unresolved_idx").on(table.threadId, table.resolvedAt),
		index("messages_block_id_idx").on(table.blockId),
	],
);

// --- Items & Responses (human interface contract) ---

export const items = pgTable(
	"items",
	{
		id: text("id").primaryKey(),
		sourceAgentId: text("source_agent_id").references(() => users.id, { onDelete: "restrict" }),
		layer: text("layer"),
		verb: text("verb"),
		kind: text("kind"),
		title: text("title").notNull(),
		body: text("body"),
		attachments: text("attachments"),
		proposedAction: text("proposed_action"),
		options: text("options"),
		riskTier: text("risk_tier"),
		blocking: boolean("blocking").default(false),
		reasoning: text("reasoning"),
		auditTrail: text("audit_trail"),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("items_thread_id_idx").on(table.threadId)],
);

// L1a: `responses` table dropped — verdicts now project as `verdict`-typed
// `messages` rows. See plan §5.2 + §5.3.

// --- Org chart edges (P2) ---

/**
 * OrgChart edges: defines review-routing relationships between human users and
 * AI users / roles / teams.
 *
 * @lore P2: Option A (single table, polymorphic target). The `mechanism`
 * discriminator determines how `target` is interpreted: "direct" → userId,
 * "function" → role string, "team" → teamId. No FK constraint on target
 * because it points to different tables. Validation is at the API boundary.
 * The composite UNIQUE prevents duplicate edges; the UUID `id` is for REST
 * addressing.
 */
export const orgEdges = pgTable(
	"org_edges",
	{
		id: text("id").primaryKey(),
		fromUserId: text("from_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		mechanism: text("mechanism").notNull(),
		target: text("target").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("org_edges_unique").on(table.fromUserId, table.mechanism, table.target),
		index("org_edges_from_user_idx").on(table.fromUserId),
	],
);

// --- Knowledge ---

/**
 * @lore O2: kernel/strategy separation. Strategy fields (layer, scopeId, kind,
 * attentionScore, relevanceScore, citationCount, lastCitedAt, confidence, meta)
 * moved to knowledgeAppProjection extension table.
 */
export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: text("id").primaryKey(),
		/**
		 * @lore Q2: scope_kind + scope_id added to the kernel table so every item
		 * knows where it belongs. The 7-value closed enum mirrors ScopeKind in
		 * @hyperidle/domain-model. Default "factory" preserves existing rows.
		 */
		scopeKind: text("scope_kind").notNull().default("factory"),
		scopeId: text("scope_id"),
		topic: text("topic"),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(),
		status: text("status").notNull(),
		version: integer("version").notNull().default(1),
		/**
		 * @lore BA9b: Knowledge item role. Determines where context assembly
		 * materialises this item in the session sandbox — widened by the
		 * knowledge-attachment-slot item to mean *where the item lands in the
		 * session*.
		 *
		 * - ordinary: knowledge/... files, exactly as before (default).
		 * - skill: a SKILL.md in the harness skills directory (e.g. .claude/skills/<title>/SKILL.md).
		 * - rule: knowledge/rules/ — always-present rules for the agent.
		 * - agent_file: AGENTS.md-shaped content, only for the bound agent.
		 *   Binding: parentKind='agent', parentId=agentId (see below).
		 * - prompt: the run's instruction — never materialised as a sandbox file.
		 *
		 * Default 'ordinary' — all existing rows keep their current behaviour.
		 */
		role: text("role").notNull().default("ordinary"),
		/**
		 * @lore knowledge-attachment-slot: the entity this item hangs off, or
		 * NULL for unparented knowledge (most rows). Nullable, both — a half
		 * parent is not a parent (`ki_parent_pair_ck`). No FK: the column points
		 * at five tables (`ki_parent_kind_ck`), so nothing at the database level
		 * keeps a parent id honest and nothing cascades a delete — application
		 * code archives a parent's children instead (see the knowledge route
		 * composition roots).
		 */
		parentKind: text("parent_kind"),
		parentId: text("parent_id"),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("ki_scope_idx").on(table.scopeKind, table.scopeId),
		index("ki_topic_idx").on(table.topic),
		index("ki_status_idx").on(table.status),
		index("ki_updated_desc_idx").on(table.updatedAt),
		index("ki_role_idx").on(table.role),
		check(
			"ki_role_ck",
			sql`${table.role} IN ('ordinary', 'skill', 'rule', 'agent_file', 'prompt')`,
		),
		index("ki_parent_idx").on(table.parentKind, table.parentId),
		// One item per named role per parent — a routine's prompt, an agent's
		// identity. `role <> 'ordinary'` leaves a parent free to hold many
		// ordinary children (the nested-knowledge tree, phase 2), and Postgres
		// treats NULLs as distinct by default, so unparented rows never collide.
		uniqueIndex("ki_parent_slot_uq")
			.on(table.parentKind, table.parentId, table.role)
			.where(sql`${table.role} <> 'ordinary'`),
		check(
			"ki_parent_kind_ck",
			sql`${table.parentKind} IS NULL OR ${table.parentKind} IN ('knowledge_item', 'task', 'thread', 'routine', 'agent')`,
		),
		check(
			"ki_parent_pair_ck",
			sql`(${table.parentKind} IS NULL AND ${table.parentId} IS NULL) OR (${table.parentKind} IS NOT NULL AND ${table.parentId} IS NOT NULL)`,
		),
	],
);

export const knowledgeEditLog = pgTable("knowledge_edit_log", {
	id: text("id").primaryKey(),
	// @lore I3 review sec HIGH-2: edit log MUST outlive its subject. Cascade
	// would let any agent with delete-on-knowledge_items wipe their own
	// authored history. RESTRICT forces explicit handling — soft-delete the
	// item or archive its log first. See I3-security-review.md HIGH.
	itemId: text("item_id")
		.notNull()
		.references(() => knowledgeItems.id, { onDelete: "restrict" }),
	editor: text("editor").notNull(),
	field: text("field").notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	editType: text("edit_type").notNull(),
	createdAt: text("created_at").notNull(),
});

// --- Knowledge access log (L22) ---

/**
 * Append-only log of knowledge item detail-view fetches. One row per
 * GET /api/knowledge/:layer/:id 200 response.
 *
 * @lore L22: the composite index (item_id, accessed_at) serves both
 * recency (MAX) and frequency (COUNT with range filter) queries without
 * a second index. ON DELETE RESTRICT matches knowledge_edit_log — the
 * access log MUST outlive its subject (same audit rationale as I3 HIGH-2).
 *
 * @lore L22: accessorKind defaults to "human" when the auth context is
 * not wired into the knowledge routes. The real accessor comes from the
 * auth middleware — wiring it is out of L22 scope.
 */
export const knowledgeAccessLog = pgTable(
	"knowledge_access_log",
	{
		id: text("id").primaryKey(),
		itemId: text("item_id")
			.notNull()
			.references(() => knowledgeItems.id, { onDelete: "restrict" }),
		/** "human" | "agent" — closed vocabulary per KnowledgeAccessorKind. */
		accessorKind: text("accessor_kind").notNull(),
		accessorId: text("accessor_id").notNull(),
		/** ISO 8601 timestamp. */
		accessedAt: text("accessed_at").notNull(),
	},
	(table) => [index("kal_item_accessed_idx").on(table.itemId, table.accessedAt)],
);

// --- Knowledge conflicts ---

export const knowledgeConflicts = pgTable("knowledge_conflicts", {
	id: text("id").primaryKey(),
	// @lore I3 review sec HIGH-2: conflict resolution evidence MUST outlive
	// its subject — same reasoning as knowledge_edit_log above.
	itemId: text("item_id")
		.notNull()
		.references(() => knowledgeItems.id, { onDelete: "restrict" }),
	versionBase: integer("version_base").notNull(),
	versionCurrent: integer("version_current").notNull(),
	proposedBody: text("proposed_body").notNull(),
	proposedMeta: text("proposed_meta"),
	proposedBy: text("proposed_by").notNull(),
	status: text("status").notNull().default("open"),
	resolvedBy: text("resolved_by"),
	resolvedAt: text("resolved_at"),
	createdAt: text("created_at").notNull(),
});

// --- Extension tables (O2) ---

/**
 * Stores strategy-layer data for knowledge items. Each row maps 1:1 to a
 * knowledge_items row (knowledge_item_id UNIQUE). Cascade DELETE keeps
 * orphan rows impossible.
 *
 * @lore O2: kernel/strategy separation. All strategy signals that were inline
 * on knowledge_items (layer, scopeId, kind, attentionScore, relevanceScore,
 * citationCount, lastCitedAt, confidence, meta) are moved here. The kernel
 * table retains only identity + content columns. No `strategy` discriminator
 * column: multiple strategies can coexist in the same row.
 *
 * @lore AU19 Increment 1k: this table/export was formerly named
 * `knowledgeStrategyFabric` (physical SQL name `knowledge_strategy_fabric`).
 * AU3's Kernel/Strategy runtime retirement was supposed to rename it to the
 * app-owned vocabulary but only bolted on a JS alias export, leaving the real
 * `pgTable` declaration under the legacy name — which silently evaded
 * `table-ownership-guard.ts`'s AST scan (it only recognizes
 * `export const X = pgTable(...)`, not alias assignments). This increment
 * finishes the rename for real: `knowledgeAppProjection` is now the only
 * exported name, and the physical table is renamed via a non-destructive
 * `ALTER TABLE ... RENAME TO` migration (`drizzle/0050_*.sql`).
 */
export const knowledgeAppProjection = pgTable(
	"knowledge_app_projection",
	{
		id: text("id").primaryKey(),
		knowledgeItemId: text("knowledge_item_id")
			.notNull()
			.unique()
			.references(() => knowledgeItems.id, { onDelete: "cascade" }),
		layer: text("layer"),
		scopeId: text("scope_id"),
		kind: text("kind"),
		attentionScore: text("attention_score"),
		relevanceScore: text("relevance_score"),
		confidence: text("confidence"),
		citationCount: integer("citation_count"),
		lastCitedAt: text("last_cited_at"),
		meta: text("meta"),
	},
	(table) => [
		index("ksf_knowledge_item_id_idx").on(table.knowledgeItemId),
		index("ksf_layer_idx").on(table.layer),
		index("ksf_kind_idx").on(table.kind),
	],
);

// --- Notification queue (H2) ---

export const notificationQueue = pgTable(
	"notification_queue",
	{
		id: text("id").primaryKey(),
		eventType: text("event_type").notNull(),
		subjectId: text("subject_id"),
		severity: text("severity").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		reason: text("reason").notNull(),
		channel: text("channel"),
		/**
		 * Lifecycle: pending → sending → {sent|failed|dropped}.
		 * `sending` is a lease: the row is claimed before the adapter call
		 * so a crash after send-before-DB-update requeues instead of
		 * silently marking sent.
		 */
		status: text("status").notNull(),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: text("created_at").notNull(),
		sentAt: text("sent_at"),
		/** ISO timestamp when the row entered the `sending` state. */
		claimedAt: text("claimed_at"),
		// AF8: in-app notification model (popover). severity/channel stay for egress.
		/**
		 * Concept type key: "review_request" | "blocker_alert". Nullable for
		 * back-compat. @lore AU21 Increment 14a: "cost_alert" deleted along
		 * with the cost-cap feature that produced it — no replacement.
		 */
		typeKey: text("type_key"),
		/** "immediate" | "ambient" — from type registry default, adjusted per-instance. Nullable for back-compat. */
		urgency: text("urgency"),
		/**
		 * Persisted route. Thread-keyed `/conversations/${threadId}` for review/blocker.
		 * NEVER reconstructed at render (concept hard rule #2).
		 * Nullable for back-compat with existing egress rows.
		 *
		 * @lore AF8: The original dispatcher.ts:178 deepLink used `/conversations/item/<id>`
		 * which 404s — the router only defines `/conversations/:threadId`. This column stores
		 * the CORRECTED shape built by notification-listener.ts at enqueue time.
		 */
		sourceLink: text("source_link"),
		/** ISO timestamp when the popover was opened (clears unread dot). */
		seenAt: text("seen_at"),
		/** ISO timestamp when the notification was jumped-to or dismissed. */
		readAt: text("read_at"),
	},
	(table) => [
		index("nq_status_created_idx").on(table.status, table.createdAt),
		index("nq_severity_idx").on(table.severity),
		// AF8: popover query — list unread notifications newest-first
		index("nq_inapp_idx").on(table.readAt, table.createdAt),
	],
);

// The `artifacts` table is DELETED (migration 0078). Produced content is a
// knowledge item whose parent is the task or the conversation that produced it —
// the same row a human writes, with a body, a status, a version, a scope and an
// edit history, none of which an artifact row had. The word survives as the name
// for produced content; nothing stores one.

// --- AO1: Filesystem registry + per-bot injection ---

/**
 * Registered, team-scoped file source. NOT owned by a single agent.
 * Per-bot wiring lives in the filesystemInjections mapping below.
 *
 * @lore AO1 Q6: `source` is stored (not computed) so the registry can display
 * it without resolving a possibly-absent Connection (service_connections was
 * reverted in 0038). `connection_id` is a plain text column, not a FK, for the
 * same reason — AO1 ⟂ AN; AN may add the FK in its own migration.
 * @lore AO1 AC3: `kind` is stored as open-vocab text; SoR kinds are rejected
 * at the Zod boundary on POST.
 */
export const filesystems = pgTable(
	"filesystems",
	{
		id: text("id").primaryKey(),
		// Registry scope. Always present. The Team that owns this registered filesystem.
		// NOT single-owner — per-bot wiring is the separate filesystemInjections table.
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		// The SOURCE TYPE — 'local' | 'github' | 'gdrive' | … OPEN vocabulary; derived from the
		// Connection at register-time (or 'local'). Stored (queryable in the registry without
		// resolving a possibly-absent Connection). Surfaced prominently in the UI.
		source: text("source").notNull(),
		// OPEN vocabulary. 'code' | 'doc_set' initially. SoRs excluded at the app layer (Zod).
		kind: text("kind").notNull(),
		// Reference to a Connection (Track AN). NOT a DB FK — service_connections was merged
		// (0036) then reverted (0038, AN reset); absent now, re-merged shape unsettled.
		// An unresolvable id → needs_attention (AC5).
		// @lore AO1: plain text by design — AO1 ⟂ AN; AN may add the FK in its own migration.
		connectionId: text("connection_id"),
		// JSON-encoded ResourceRef, discriminated by kind.
		resourceRef: text("resource_ref").notNull(),
		// Capability axis: how authored changes leave the sandbox.
		writeback: text("writeback").notNull(),
		// Reachability lifecycle. Stored; the inspect/list route may transition + persist it.
		state: text("state").notNull().default("attached"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("filesystems_team_idx").on(table.teamId)],
);

/**
 * Per-bot INJECTION: which registered filesystems are injected into a given bot's sessions.
 *
 * @lore AO1 Q1: The agent FK is users.id (the runtime agent identity = sessions.agentId,
 * schema.ts:252-254), NOT team_members.id (one row per team, U1 1:1, no per-agent identity).
 * AO2's per-bot mount resolves sessions.agentId → filesystem_injections → filesystems.
 * Replaces the removed single-owner column. Parallel to connector/tool injection.
 */
export const filesystemInjections = pgTable(
	"filesystem_injections",
	{
		agentUserId: text("agent_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		filesystemId: text("filesystem_id")
			.notNull()
			.references(() => filesystems.id, { onDelete: "cascade" }),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.agentUserId, table.filesystemId] }), // UNIQUE (agentUserId, filesystemId)
		index("filesystem_injections_agent_user_idx").on(table.agentUserId),
		index("filesystem_injections_filesystem_idx").on(table.filesystemId),
	],
);

export type FilesystemRow = typeof filesystems.$inferSelect; // DB row (resourceRef: string). NOT named `Filesystem`.
export type NewFilesystem = typeof filesystems.$inferInsert;
export type NewFilesystemInjection = typeof filesystemInjections.$inferInsert;
// The wire types `Filesystem`/`FilesystemInjection` (parsed) live in @hyperidle/domain-model — see §1.

// --- P3: Server-side credential storage (shared mode) ---

/**
 * Encrypted credential storage for shared-mode deployments.
 * Values are AES-256-GCM encrypted with key derived from HYPERIDLE_API_KEY via HKDF.
 *
 * @lore P3: Only used in shared mode. In local mode, credentials live in
 * safeStorage on the desktop. The name column is constrained to the
 * CREDENTIAL_NAMES catalog at the application layer (not the DB layer).
 */
export const serverCredentials = pgTable("server_credentials", {
	/** CredentialName from catalog — anthropic_api_key | openrouter_api_key | shared_backend_key */
	name: text("name").primaryKey(),
	/** AES-256-GCM encrypted value. Format: base64(iv + ciphertext + authTag). */
	encryptedValue: text("encrypted_value").notNull(),
	/** Validation state: "present_untested" | "valid" | "invalid". */
	validationState: text("validation_state").notNull().default("present_untested"),
	/** When the credential was last validated. */
	lastValidatedAt: text("last_validated_at"),
	updatedAt: text("updated_at").notNull(),
});

// --- P3: Typed server config ---

/**
 * Singleton-row typed config table. Replaces factorySettings for new structured
 * config. The config column holds a Zod-validated JSON blob.
 *
 * @lore P3: Single-row table (id = "default") holds all server config as a
 * JSON blob. Zod validation on read/write provides type safety.
 */
export const serverConfig = pgTable("server_config", {
	/** Singleton row. Always "default". */
	id: text("id").primaryKey().default("default"),
	/** JSON blob validated by Zod on read/write. */
	config: text("config").notNull().default("{}"),
	updatedAt: text("updated_at").notNull(),
});

// --- AU2: Plugin-seeded editable configuration ---

export const plugins = pgTable(
	"plugins",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		version: text("version").notNull(),
		state: text("state").$type<PluginState>().notNull(),
		scopeKind: text("scope_kind").$type<"factory" | "team">().notNull().default("factory"),
		scopeTeamId: text("scope_team_id"),
		/**
		 * @lore BA9b: Absolute path to the plugin's persistent install directory.
		 * Null for plugins with only URL-based MCP servers (no local files needed).
		 * When present, used to expand ${PLUGIN_ROOT} in MCP server args/env/cwd
		 * at session materialisation time.
		 */
		installPath: text("install_path"),
		installedAt: text("installed_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		disabledAt: text("disabled_at"),
		removedAt: text("removed_at"),
	},
	(table) => [
		check("plugins_state_ck", sql`${table.state} IN ('enabled', 'disabled', 'removed')`),
		check("plugins_scope_kind_ck", sql`${table.scopeKind} IN ('factory', 'team')`),
	],
);

export const pluginConfigurationDefaults = pgTable(
	"plugin_configuration_defaults",
	{
		id: text("id").primaryKey(),
		pluginId: text("plugin_id")
			.notNull()
			.references(() => plugins.id, { onDelete: "restrict" }),
		kind: text("kind").$type<ConfigurationKind>().notNull(),
		key: text("key").notNull(),
		defaultValueJson: text("default_value_json").notNull(),
		defaultVersionHash: text("default_version_hash").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("plugin_config_defaults_plugin_kind_key_uq").on(
			table.pluginId,
			table.kind,
			table.key,
		),
		index("plugin_config_defaults_kind_key_idx").on(table.kind, table.key),
		check(
			"plugin_configuration_defaults_kind_ck",
			sql`${table.kind} IN ('agent', 'skill', 'routine', 'tool', 'mcp_server', 'harness_descriptor')`,
		),
	],
);

/**
 * What a plugin contributed, and whether the person has since taken it over.
 *
 * @lore BA9g: provenance used to be recorded SEVEN different ways —
 * `users.plugin_id`, `routines.plugin_id`,
 * `plugin_configuration_defaults.plugin_id`, `knowledge_items.topic =
 * 'plugin:<id>'`, `knowledge_items.updated_by = 'plugin:<id>'`, a `<pluginId>/`
 * prefix inside a configuration key, and one-way hashed row ids. Each covered a
 * different subset, so no surface could answer "what did this plugin
 * contribute" and the lifecycle operations disagreed with each other. Two of
 * the seven were never read at all.
 *
 * Two of those were also table-ownership violations wearing a column: a
 * `plugin_id` on `users` and on `routines` is provenance the PLUGIN service
 * owns, sitting in tables it does not, which is why the write had to live in the
 * users package. This table belongs to the plugin service, and it is the only
 * answer to who contributed what.
 *
 * `detachedAt` replaces the `updated_by = 'plugin:<id>'` sentinel: a person
 * edited this contribution, so a reinstall must not overwrite their version.
 */
export const pluginContributions = pgTable(
	"plugin_contributions",
	{
		id: text("id").primaryKey(),
		pluginId: text("plugin_id")
			.notNull()
			.references(() => plugins.id, { onDelete: "cascade" }),
		/** Which table `entityId` points into. */
		kind: text("kind").$type<PluginContributionKind>().notNull(),
		/** The contributed row's primary key, in the table `kind` names. */
		entityId: text("entity_id").notNull(),
		/** Set when a person edited this contribution; a reinstall leaves their version alone. */
		detachedAt: text("detached_at"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		// One plugin cannot contribute the same row twice, and reinstall is an
		// upsert on this key.
		uniqueIndex("plugin_contributions_plugin_kind_entity_uq").on(
			table.pluginId,
			table.kind,
			table.entityId,
		),
		// "Everything this plugin contributed" — the lifecycle's only read.
		index("plugin_contributions_plugin_idx").on(table.pluginId),
		// "Which plugin owns this row" — the provenance badge's read.
		index("plugin_contributions_entity_idx").on(table.kind, table.entityId),
		check(
			"plugin_contributions_kind_ck",
			sql`${table.kind} IN ('agent', 'routine', 'knowledge', 'configuration_default')`,
		),
	],
);

export const configurationOverrides = pgTable(
	"configuration_overrides",
	{
		id: text("id").primaryKey(),
		defaultId: text("default_id").references(() => pluginConfigurationDefaults.id, {
			onDelete: "set null",
		}),
		kind: text("kind").$type<ConfigurationKind>().notNull(),
		key: text("key").notNull(),
		userValueJson: text("user_value_json").notNull(),
		state: text("state").$type<"active" | "deleted">().notNull(),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("configuration_overrides_kind_key_uq").on(table.kind, table.key),
		index("configuration_overrides_default_id_idx").on(table.defaultId),
		check(
			"configuration_overrides_kind_ck",
			sql`${table.kind} IN ('agent', 'skill', 'routine', 'tool', 'mcp_server', 'harness_descriptor')`,
		),
		check("configuration_overrides_state_ck", sql`${table.state} IN ('active', 'deleted')`),
	],
);

// --- P5: First-time hint progress ---

/**
 * Records which first-time hints each user has explicitly dismissed.
 * Composite PK on (userId, hintId) prevents duplicate dismissals.
 * Cascade delete ensures rows are cleaned up when the user is deleted.
 *
 * @lore P5: hint progress is kernel-level CRUD, not strategy logic.
 * The hint catalog lives in @hyperidle/domain-model; this table only stores
 * the userId + hintId + seenAt dismissal record.
 */
export const hintProgress = pgTable(
	"hint_progress",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		hintId: text("hint_id").notNull(),
		seenAt: text("seen_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.hintId] })],
);

// --- S1: Authentication tables ---

/**
 * LoginSession — stores per-user bearer token hashes (SHA-256).
 * Plaintext tokens are NEVER stored; only the hash.
 *
 * @lore S1: tokenHash has both a UNIQUE constraint (for data integrity) and an
 * explicit index (for query planning intent). The unique constraint implies an
 * index in Postgres; the named index makes the auth hot-path explicit.
 * onDelete: cascade — sessions have no audit value beyond the user's lifetime.
 */
export const loginSessions = pgTable(
	"login_sessions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: text("expires_at").notNull(),
		createdAt: text("created_at").notNull(),
		revokedAt: text("revoked_at"),
	},
	(table) => [
		index("login_sessions_user_id_idx").on(table.userId),
		index("login_sessions_token_hash_idx").on(table.tokenHash),
	],
);

/**
 * InviteCode — URL-safe random codes for on-boarding new users.
 *
 * @lore S1: createdBy uses RESTRICT — the creator's record must not be deleted
 * while their invite codes exist (audit trail). claimedBy uses SET NULL — if the
 * claiming user is deleted the invite becomes unclaimed rather than cascading.
 * role defaults to "member"; the role system is minimal in S1 (admin vs member).
 */
export const inviteCodes = pgTable(
	"invite_codes",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull().unique(),
		createdBy: text("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		claimedBy: text("claimed_by").references(() => users.id, { onDelete: "set null" }),
		role: text("role").notNull().default("member"),
		expiresAt: text("expires_at").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [uniqueIndex("invite_codes_code_uq").on(table.code)],
);

// --- Inferred types ---

// @lore U1 / AU44 B1: Team is the single domain entity — team_members dissolved into it.
export type Team = typeof teams.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// @lore AU26 G1: the run-config row types. `AgentRunConfigRow` is the raw
// table row (carries `agentUserId`); `@hyperidle/agent-run-config`'s
// `AgentRunConfig` is the keyless value object callers actually consume.
export type NewAgentRunConfigRow = typeof agentRunConfig.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Session = typeof sessions.$inferSelect;

export type AgentSessionRequest = typeof agentSessionRequests.$inferSelect;
export type AgentWorkIntent = typeof agentWorkIntents.$inferSelect;
export type ExplicitSessionStart = typeof explicitSessionStarts.$inferSelect;

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;

export type NewRoutineRun = typeof routineRuns.$inferInsert;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;

export type NotificationQueueRow = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueRow = typeof notificationQueue.$inferInsert;



export type ServerCredential = typeof serverCredentials.$inferSelect;

export type PluginRow = typeof plugins.$inferSelect;

export type PluginConfigurationDefaultRow = typeof pluginConfigurationDefaults.$inferSelect;

export type ConfigurationOverrideRow = typeof configurationOverrides.$inferSelect;

export type LoginSession = typeof loginSessions.$inferSelect;
export type NewLoginSession = typeof loginSessions.$inferInsert;

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;

// --- AN1: Service connections (per-user external tool connections) ---

/**
 * Per-(user × service × authSource) connection record.
 *
 * Stores ONLY held connections (token | mcp). Inherited connections are
 * projected live from the harness descriptor and NEVER written here.
 * (Concept hard-rule 4 / Phase-0 decision 1.)
 *
 * @lore AN1: No `trust_tier` column — ETHOS §2 kills preemptive security gates.
 * authSource is app-enforced to { token, mcp } on insert (Zod at the route
 * boundary); the `inherited` value never reaches this table.
 *
 * @lore AN1: Separate from `server_credentials` (closed infra-secret catalog).
 * This is an open, user-driven set that reuses the encryption primitive only.
 * Writing a ServiceConnection into serverCredentials violates concept hard-rule 5.
 */
export const serviceConnections = pgTable(
	"service_connections",
	{
		/** sc-<uuid> — stable opaque server-issued id. */
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** Display name: "GitHub", "Stripe", … (open set, user-supplied). */
		service: text("service").notNull(),
		/** "token" | "mcp" — inherited NEVER stored (projected live). */
		authSource: text("auth_source").notNull(),
		/** AES-256-GCM base64(iv+ct+tag) — null for mcp (no stored secret). */
		encryptedToken: text("encrypted_token"),
		/** https:// URL — mcp only; null for token. */
		serverUrl: text("server_url"),
		/** "working" | "needs-attention" — set by validate endpoint. */
		health: text("health").notNull().default("needs-attention"),
		lastValidatedAt: text("last_validated_at"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(t) => [
		/** One (token|mcp) connection per (user × service × authSource). */
		uniqueIndex("service_connections_user_service_source_idx").on(
			t.userId,
			t.service,
			t.authSource,
		),
		index("service_connections_user_idx").on(t.userId),
	],
);

export type ServiceConnectionRow = typeof serviceConnections.$inferSelect;
export type NewServiceConnectionRow = typeof serviceConnections.$inferInsert;

// --- Action rules (scoped items for agent action approval) ---

/**
 * Action rules define which agent actions require human approval before
 * an agent may take them.
 *
 * @lore BA2: The rule list is EMPTY on a fresh install — nothing interrupts
 * an agent until a human adds a rule. Scope is global, team, or agent.
 * Resolution at provisioning is by UNION: global rules + the agent's team's
 * rules + that specific agent's rules. An empty result means no action is
 * ever interrupted.
 *
 * @lore BA2 (ruling 20): No clearance table, no state machine, no risk tiers.
 * The design is deliberately minimal: rules are plain scoped rows, resolution
 * is a SQL union, and session-level enforcement happens in the hook layer.
 *
 * @lore BA2 (ruling 1): No rule is pre-loaded on a fresh install. An empty
 * list is the correct, designed starting state — security is never preemptive.
 */
export const actionRules = pgTable(
	"action_rules",
	{
		id: text("id").primaryKey(),
		/**
		 * A name or pattern identifying the action to gate, e.g. "git push",
		 * "rm -rf", "deploy". Matched by our enforcement code at provisioning time, not by the harness's own hook config.
		 */
		pattern: text("pattern").notNull(),
		/** Human-readable label shown in the settings surface. */
		description: text("description").notNull(),
		/** 'global' | 'team' | 'agent' */
		scope: text("scope").notNull(),
		/**
		 * null when scope='global';
		 * teams.id when scope='team';
		 * users.id (agent row) when scope='agent'.
		 *
		 * No FK constraint — the rule stays if the team or agent is removed,
		 * and the hook simply finds no matching entry when resolving.
		 */
		scopeId: text("scope_id"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		check("action_rules_scope_ck", sql`${table.scope} IN ('global', 'team', 'agent')`),
		check(
			"action_rules_scope_id_ck",
			sql`(${table.scope} = 'global' AND ${table.scopeId} IS NULL) OR (${table.scope} IN ('team', 'agent') AND ${table.scopeId} IS NOT NULL)`,
		),
		index("action_rules_scope_idx").on(table.scope, table.scopeId),
	],
);

export type ActionRuleRow = typeof actionRules.$inferSelect;
export type NewActionRuleRow = typeof actionRules.$inferInsert;
