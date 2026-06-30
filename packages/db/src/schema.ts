import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Core tables ---

// @lore U1: `teams` is the domain entity (formerly `products`). The old agent-membership
// table (formerly `teams`) is now `teamMembers`. Migration 0021_U1_schema_migration.sql
// renames both tables. See architecture U1 §2.3 for the 1:1 Product=Team invariant.
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
	/**
	 * AB0: Team functions as JSON array of strings.
	 * Determines which agent roles appear in the default roster.
	 * @lore AB0: Open vocabulary. Known functions: development, product,
	 * design, marketing, sales, operations, support, research.
	 */
	functions: text("functions"),
});

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	/** "human" | "ai" — P2: kind column distinguishes human founders from AI agents. */
	kind: text("kind").notNull().default("ai"),
	name: text("name").notNull(),
	/** @lore X3: Renamed from old per-agent path column in AK1 (harness-vocab rename). Deprecated — content stored inline in systemPrompt. */
	systemPromptPath: text("system_prompt_path"),
	// @lore U1: users.team_id still references team_members.id (agent membership group).
	// The column name stays `team_id` to avoid a blast-radius rename of every
	// users.teamId reference across the codebase. The FK target table was renamed
	// from `teams` to `team_members` by migration 0021_U1_schema_migration.sql.
	teamId: text("team_id").references(() => teamMembers.id, { onDelete: "restrict" }),
	role: text("role").notNull(),
	skills: text("skills"),
	status: text("status").notNull(),
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	/** @lore L17: costCap renamed to costCapMinor; costActual removed (computed from sessions). Legacy column preserved for migration rollback. */
	costCap: integer("cost_cap"),
	costActual: integer("cost_actual").default(0),
	/** L17: structured money cap — minor units + currency code. */
	costCapMinor: integer("cost_cap_minor"),
	costCapCurrency: text("cost_cap_currency"),
	/** P2: human-specific nullable columns. Null for AI users. */
	email: text("email"),
	avatarUrl: text("avatar_url"),
	createdAt: text("created_at").notNull(),
	/**
	 * X3: Inline system prompt text. Replaces systemPromptPath (per-agent path column).
	 * null = no persona section in assembled context.
	 * @lore X3: The path column is deprecated (not dropped yet — additive migration).
	 * System prompt content is stored inline in the DB, eliminating file-read attack surface.
	 * @lore AK1: Renamed from the old per-agent prompt column (harness-vocab rename rollout).
	 */
	systemPrompt: text("system_prompt"),
	/** X3: Harness type preference. null = any adapter eligible. */
	harnessType: text("harness_type"),
	/** X3: Model tier preference. null = provisioning default ("workhorse"). */
	modelTierPreference: text("model_tier_preference"),
	/**
	 * AH2: Per-agent model ID override.
	 * null = use modelTierPreference fallback.
	 * Must be a valid ID from MODEL_CATALOG in @hyperidle/shared.
	 */
	modelId: text("model_id"),
	/**
	 * AH2: Per-agent provider override.
	 * null = defaults to "anthropic" (the only v1 per-agent provider).
	 * Only meaningful when modelId is non-null.
	 * @lore AH2: Stored separately from modelId so that future multi-provider
	 * catalog expansion can be additive — no column rename needed.
	 */
	modelProvider: text("model_provider"),
	/**
	 * AB0: Agent category — team | strategy | individual.
	 * Null for human users and system users.
	 * @lore AB0: This replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES
	 * split which was about system layer, not agent category.
	 */
	agentCategory: text("agent_category"),
});

// @lore U1: `teamMembers` is the agent-membership group (formerly `teams`).
// The 1:1 Product=Team invariant means one teamMembers row per teams row.
// See architecture U1 §2.3.
export const teamMembers = pgTable("team_members", {
	id: text("id").primaryKey(),
	teamId: text("team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "restrict" }),
	members: text("members"),
	leadAgentId: text("lead_agent_id"),
	capacity: integer("capacity").notNull(),
	activeBets: integer("active_bets").notNull().default(0),
	/** @lore L17: legacy columns kept for rollback safety. */
	costCap: integer("cost_cap"),
	costActual: integer("cost_actual").default(0),
	/** L17: structured money cap — minor units + currency code. */
	costCapMinor: integer("cost_cap_minor"),
	costCapCurrency: text("cost_cap_currency"),
	formedAt: text("formed_at").notNull(),
	dissolvedAt: text("dissolved_at"),
});

// --- Process primitives ---

export const bets = pgTable(
	"bets",
	{
		id: text("id").primaryKey(),
		// @lore U1: teamId references the new `teams` table (formerly `products`).
		// The old teamId (pointing at team_members) was dropped — the 1:1 invariant
		// means this teamId fully determines the team_members group.
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		// @lore U1: `description` was formerly `pitch`. Renamed in migration 0021.
		description: text("description").notNull(),
		/**
		 * @lore L17: appetite (duration string "1 week"/"2 weeks"/"6 weeks") is
		 * deprecated in favour of costAppetiteMinor + costAppetiteCurrency.
		 * The column is kept for rollback safety but no longer required at the
		 * API boundary (nullable here, route validation rejects it as a 400).
		 */
		appetite: text("appetite"),
		doneCondition: text("done_condition"),
		hypothesis: text("hypothesis"),
		// @lore U1: Status enum simplified to draft | active | completed | killed.
		// Old statuses: shaped->draft, committed|in_progress|behind|blocked|paused|review->active, shipped->completed.
		status: text("status").notNull(),
		revisionLog: text("revision_log"),
		createdAt: text("created_at").notNull(),
		// @lore U1: `completedAt` was formerly `shippedAt`. Renamed in migration 0021.
		completedAt: text("completed_at"),
		// @lore U1: `atRisk` boolean replaces the old `behind` status sub-state.
		atRisk: integer("at_risk").notNull().default(0),
		/** L17: structured cost appetite — minor units + currency code. */
		costAppetiteMinor: integer("cost_appetite_minor"),
		costAppetiteCurrency: text("cost_appetite_currency"),
		/** L17: accumulated actual cost from sessions — minor units + currency. */
		costActualMinor: integer("cost_actual_minor"),
		costActualCurrency: text("cost_actual_currency"),
		/** L17: accumulated tokens as JSON (TokenUsage shape). */
		tokensActualJson: text("tokens_actual_json"),
		/** AC1: Structured outcome verdict. Closed enum: validated|refuted|partial|inconclusive. Null = not evaluated. */
		outcomeVerdict: text("outcome_verdict"),
		/** AC1: Free-text explanation of the outcome (max 2000 chars enforced at API boundary). */
		outcomeSummary: text("outcome_summary"),
		/** AC1: ISO 8601 timestamp when the outcome was last recorded. */
		outcomeRecordedAt: text("outcome_recorded_at"),
		/** AC1: User ID of the actor who last recorded the outcome. */
		outcomeRecordedBy: text("outcome_recorded_by"),
		/**
		 * AK3: Decomposition lifecycle state.
		 * null = never decomposed | 'running' = in-flight | 'done' = tasks created | 'blocked' = failed
		 *
		 * @lore AK3: CAS guard (NULL→'running') prevents concurrent re-fires of the
		 * same decomposition. A boot-time sweep (resolveOrphanedDecompositions) flips
		 * any 'running' bet to 'blocked/failed' on restart — in-process turns die with
		 * the process, so 'running' at boot always means orphaned.
		 */
		decompositionStatus: text("decomposition_status"),
		/**
		 * AK3: Why a decomposition ended in 'blocked'.
		 * null | 'no_eligible_agent' | 'empty' | 'failed'
		 * Only meaningful when decompositionStatus = 'blocked'.
		 */
		decompositionBlockerReason: text("decomposition_blocker_reason"),
		/**
		 * AK5: provenance — the knowledge item this bet was promoted from.
		 * null = hand-typed / assistant-drafted bet (no source). Forward, recoverable,
		 * one-way link. NOT the reverse of knowledge.scopeKind="bet" (that means
		 * "knowledge produced under this bet"). RESTRICT: a source item cannot be
		 * hard-deleted while a bet cites it as provenance — provenance must outlive
		 * convenience deletes (same rationale as knowledge_edit_log I3 HIGH-2).
		 * @lore AK5: knowledge items have no hard-delete endpoint (only soft-delete via
		 * POST /:id/archive → status:"archived"), so RESTRICT has zero live UX downside
		 * but guarantees provenance integrity if a hard-delete is ever added.
		 */
		sourceKnowledgeItemId: text("source_knowledge_item_id").references(() => knowledgeItems.id, {
			onDelete: "restrict",
		}),
	},
	(table) => [
		index("bets_team_id_idx").on(table.teamId),
		index("bets_status_idx").on(table.status),
	],
);

export const tasks = pgTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		betId: text("bet_id")
			.notNull()
			.references(() => bets.id, { onDelete: "restrict" }),
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
		artifacts: text("artifacts"),
		costCap: integer("cost_cap"),
		costActual: integer("cost_actual").default(0),
		threadId: text("thread_id").references(() => threads.id, { onDelete: "restrict" }),
		notes: text("notes"),
		auditTrail: text("audit_trail"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		/** AC1: Task outcome verdict. Closed enum: met|met_with_rework|partially_met|not_met. Null = not evaluated. */
		outcomeVerdict: text("outcome_verdict"),
		/** AC1: ISO 8601 timestamp when the task outcome was last recorded. */
		outcomeRecordedAt: text("outcome_recorded_at"),
		/** AC1: User ID of the actor who last recorded the task outcome. */
		outcomeRecordedBy: text("outcome_recorded_by"),
	},
	(table) => [
		index("tasks_bet_id_idx").on(table.betId),
		index("tasks_team_id_idx").on(table.teamId),
		// @lore I3 review O1: `tasks_state_idx` was dropped — state has too
		// few distinct values to be selective.
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "restrict" }),
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
		index("sessions_agent_id_idx").on(table.agentId),
		index("sessions_state_idx").on(table.state),
		index("sessions_routine_id_idx").on(table.routineId),
	],
);

export const routines = pgTable(
	"routines",
	{
		id: text("id").primaryKey(),
		/** AA1: human-readable name for the routine. */
		name: text("name").notNull().default(""),
		/** AA1: optional longer description. */
		description: text("description"),
		ownerAgentId: text("owner_agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		/**
		 * AA1: team this routine belongs to. NOT NULL — every routine is team-scoped.
		 * FK constraint added after backfill (see migration 0022_AA1_routine_visibility.sql).
		 *
		 * @lore AA1: team_id is NOT NULL. factory-wide agents (COS, PF) whose routines
		 * have no natural team are backfilled to the first team during migration.
		 * See architecture AA1 §"Design-it-twice: Factory-wide agents".
		 */
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		triggerType: text("trigger_type").notNull(),
		triggerConfig: text("trigger_config"),
		skillId: text("skill_id"),
		doneCondition: text("done_condition"),
		stateKey: text("state_key"),
		/**
		 * @lore O2: `delegationAllowed` governs whether the routine can hand off
		 * execution to a sub-agent. Kernel-only concern (identity of who executes).
		 * Separate from strategy signals like riskTier.
		 */
		delegationAllowed: boolean("delegation_allowed").default(false),
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
		/** AA1: cumulative actual cost across all runs — minor units. */
		costActualMinor: integer("cost_actual_minor"),
		/** AA1: currency code for costActualMinor. */
		costActualCurrency: text("cost_actual_currency"),
		/** AA2: Soft delete timestamp. When set, routine is archived. */
		deletedAt: text("deleted_at"),
		/** AA2: Last successful run's summary. Single-slot overwrite per concept doc. */
		lastRunSummary: text("last_run_summary"),
		/** AA2: Optional per-run cost ceiling in minor units. NULL = no cap. */
		costCapPerRunMinor: integer("cost_cap_per_run_minor"),
		/** AA3: Optional per-month cost ceiling in minor units. NULL = no cap. Factory is single-currency so no currency column needed (matches per-run cap pattern). */
		costCapMonthlyMinor: integer("cost_cap_monthly_minor"),
		/** AA2: Creation timestamp. Backfilled for pre-existing routines. */
		createdAt: text("created_at"),
		/**
		 * AA2: Dedicated stub task for routine sessions. Created at routine creation.
		 *
		 * @lore AA2: stubTaskId satisfies the sessions.taskId NOT NULL FK constraint
		 * while allowing routine sessions to use routine context (not task/bet context).
		 * The stub task is never worked on directly and is invisible in task lists.
		 * When the routine is soft-deleted, the stub task remains (no orphan on delete
		 * since we only soft-delete routines in AA2).
		 * ON DELETE SET NULL: if the stub task is deleted, the routine still exists
		 * but loses its stub task link (no orphan cascade needed).
		 */
		stubTaskId: text("stub_task_id").references(() => tasks.id, { onDelete: "set null" }),
	},
	(table) => [
		index("routines_team_id_idx").on(table.teamId),
		index("routines_deleted_at_idx").on(table.deletedAt),
	],
);

/**
 * AA1: Append-only log of routine execution runs. One row per trigger (manual or scheduled).
 *
 * @lore AA1: routine_runs is the lightweight audit log for execution history.
 * AA2 will link sessions.routine_id to these rows when the scheduler integrates
 * with the session lifecycle. Until then, routine_runs are inserted at trigger
 * time with an initial outcome. The `outcome` column will gain a "running" state
 * in AA2 and be updated on session end.
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
		/** 'success' | 'error' */
		outcome: text("outcome").notNull(),
		costMinor: integer("cost_minor"),
		costCurrency: text("cost_currency"),
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

// --- User skills ---

export const userSkills = pgTable(
	"user_skills",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		skillId: text("skill_id").notNull(),
		autonomyLevel: integer("autonomy_level").notNull(),
		successCount: integer("success_count").notNull().default(0),
		failureCount: integer("failure_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		promotedAt: text("promoted_at"),
	},
	(table) => [primaryKey({ columns: [table.userId, table.skillId] })],
);

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

// --- Factory settings ---

export const factorySettings = pgTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// --- Knowledge ---

/**
 * @lore O2: kernel/strategy separation. Strategy fields (layer, scopeId, kind,
 * attentionScore, relevanceScore, citationCount, lastCitedAt, confidence, meta)
 * moved to knowledgeStrategyFabric extension table.
 */
export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: text("id").primaryKey(),
		/**
		 * @lore Q2: scope_kind + scope_id added to the kernel table so every item
		 * knows where it belongs. The 7-value closed enum mirrors ScopeKind in
		 * @hyperidle/shared. Default "factory" preserves existing rows.
		 */
		scopeKind: text("scope_kind").notNull().default("factory"),
		scopeId: text("scope_id"),
		topic: text("topic"),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(),
		status: text("status").notNull(),
		version: integer("version").notNull().default(1),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("ki_scope_idx").on(table.scopeKind, table.scopeId),
		index("ki_topic_idx").on(table.topic),
		index("ki_status_idx").on(table.status),
		index("ki_updated_desc_idx").on(table.updatedAt),
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
 */
export const knowledgeStrategyFabric = pgTable(
	"knowledge_strategy_fabric",
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

/**
 * Stores strategy-layer data computed for tasks. Each row maps 1:1 to a tasks
 * row (task_id UNIQUE). Cascade DELETE keeps orphan rows impossible.
 *
 * @lore O2: kernel/strategy separation. The strategy signal that was inline
 * on tasks (riskTier) is moved here.
 * The kernel tasks table retains only identity + work columns.
 */
export const taskStrategyFabric = pgTable(
	"task_strategy_fabric",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id")
			.notNull()
			.unique()
			.references(() => tasks.id, { onDelete: "cascade" }),
		/**
		 * @lore O2: riskTier moved from tasks to taskStrategyFabric.
		 * Drives review-item creation in session-review-creator.
		 */
		riskTier: text("risk_tier"),
	},
	(table) => [index("tsf_task_id_idx").on(table.taskId)],
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
		/** Concept type key: "review_request" | "blocker_alert" | "cost_alert". Nullable for back-compat. */
		typeKey: text("type_key"),
		/** "immediate" | "ambient" — from type registry default, adjusted per-instance. Nullable for back-compat. */
		urgency: text("urgency"),
		/**
		 * Persisted route. Thread-keyed `/conversations/${threadId}` for review/blocker;
		 * "/work/portfolio" for cost_alert. NEVER reconstructed at render (concept hard rule #2).
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

// --- Propagation log (L20) ---

/**
 * Audit and retry log for lifecycle propagation events.
 *
 * Every propagation attempt — whether applied, skipped, or failed — gets a
 * row here. The `status` and `attempts` columns drive the retry mechanism.
 *
 * @lore L20: This table has NO retention policy. Every propagation attempt
 * accumulates indefinitely. A follow-up story should add a TTL sweep or
 * archival job (e.g., delete rows older than 90 days with status=applied|skipped).
 * At current expected volumes (~10 propagations/day) a year's worth is ~3,650
 * rows — negligible. Revisit if bet/task throughput increases 100x.
 */
export const propagationLog = pgTable(
	"propagation_log",
	{
		id: text("id").primaryKey(),
		/** "session" | "task" | "bet" */
		sourceLevel: text("source_level").notNull(),
		/** ID of the entity whose transition triggered propagation */
		sourceId: text("source_id").notNull(),
		/** e.g. "session_ended", "task_state_changed" */
		sourceEvent: text("source_event").notNull(),
		/** "task" | "bet" | "team" */
		targetLevel: text("target_level").notNull(),
		/** ID of the entity that should be affected */
		targetId: text("target_id").notNull(),
		/** e.g. "active -> completed" (null if no transition was needed) */
		targetTransition: text("target_transition"),
		/** "applied" | "skipped" | "failed" | "pending_retry" */
		status: text("status").notNull(),
		/** Error message if status=failed or pending_retry */
		failureReason: text("failure_reason"),
		attempts: integer("attempts").notNull().default(1),
		createdAt: text("created_at").notNull(),
		appliedAt: text("applied_at"),
	},
	(table) => [
		index("propagation_log_source_idx").on(table.sourceLevel, table.sourceId),
		index("propagation_log_status_idx").on(table.status),
		index("propagation_log_created_at_idx").on(table.createdAt),
	],
);

// --- Artifacts (L3) ---

// @lore L3 — `kind` is stored as text but normalised to ARTIFACT_KINDS at the
// API boundary (forward-compat for new ingest tokens).
// @lore L3 name-collision: tasks.artifacts (line 92) carries handoff
// filename array; rename deferred to L3-FU-1.
// @lore O2: cost columns (costMoneyMicros, costTokensInput, costTokensOutput,
// costSettledAt) stripped from the kernel artifacts table as part of
// kernel/strategy separation. Cost is a strategy concern.
export const artifacts = pgTable(
	"artifacts",
	{
		id: text("id").primaryKey(),
		producingTaskId: text("producing_task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "restrict" }),
		kind: text("kind").notNull(),
		// AE6: optional business-domain tag (e.g., 'contract', 'email'). Does NOT affect renderer.
		label: text("label"),
		previewJson: text("preview_json"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("artifacts_producing_task_id_idx").on(table.producingTaskId),
		index("artifacts_created_at_idx").on(table.createdAt),
	],
);

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
		// JSON-encoded ResourceRef, discriminated by kind. Mirrors artifacts.previewJson.
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
export type FilesystemInjectionRow = typeof filesystemInjections.$inferSelect;
export type NewFilesystemInjection = typeof filesystemInjections.$inferInsert;
// The wire types `Filesystem`/`FilesystemInjection` (parsed) live in @hyperidle/shared — see §1.

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

// --- P5: First-time hint progress ---

/**
 * Records which first-time hints each user has explicitly dismissed.
 * Composite PK on (userId, hintId) prevents duplicate dismissals.
 * Cascade delete ensures rows are cleaned up when the user is deleted.
 *
 * @lore P5: hint progress is kernel-level CRUD, not strategy logic.
 * The hint catalog lives in @hyperidle/shared; this table only stores
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

// --- AL7 trust-first: Proposed Calls + Tailored Grants + Operation Outcomes ---

/**
 * Proposed Calls — irreversible tool calls captured during session 1, routed to
 * human review. The agent proposes; the human approves; the agent's own session
 * executes in session 2. HyperIdle executes nothing of its own (AC12).
 *
 * @lore AL7 trust-first: replaces staged_operations. Key differences:
 *   - toolId + args (verbatim captured call, not capabilityTool/operation/params)
 *   - originSessionId + identityHash UNIQUE — capture idempotency (WARNING-5.2)
 *   - status: captured | granted | executed | failed | held (not pending/executing)
 *   - No idempotencyKey (replaced by origin_session_id + identity_hash UNIQUE)
 *
 * @lore AL7 WARNING-5.2: UNIQUE constraint on (origin_session_id, identity_hash)
 * is a CONSTRAINT, not a plain index. The capture insert uses
 * ON CONFLICT (origin_session_id, identity_hash) DO NOTHING RETURNING *;
 * firstCapture = rows.length > 0. Only a UNIQUE enforces the dedup — a plain
 * index does not prevent duplicate rows.
 */
export const proposedCalls = pgTable(
	"proposed_calls",
	{
		id: text("id").primaryKey(),
		// C1: THE review dispatch key.
		reviewMessageId: text("review_message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "restrict" }),
		// Loader/index anchor ONLY — never the dispatch key.
		subjectThreadId: text("subject_thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		artifactId: text("artifact_id")
			.notNull()
			.references(() => artifacts.id, { onDelete: "restrict" }),
		originSessionId: text("origin_session_id").notNull(),
		toolId: text("tool_id").notNull(),
		args: text("args").notNull(), // verbatim JSON captured args
		identityHash: text("identity_hash").notNull(), // SHA-256 over canonical {toolId, args}; arg-pin convenience metadata
		reversibility: text("reversibility").notNull(), // "irreversible" | "reversible"
		// captured | granted | executed | failed | held
		status: text("status").notNull().default("captured"),
		stagedByAgentId: text("staged_by_agent_id")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("proposed_calls_review_msg_idx").on(table.reviewMessageId, table.status),
		index("proposed_calls_subject_idx").on(table.subjectThreadId),
		index("proposed_calls_artifact_idx").on(table.artifactId),
		// WARNING-5.2: MUST be a UNIQUE constraint, not a plain index.
		// ON CONFLICT (origin_session_id, identity_hash) DO NOTHING RETURNING *
		uniqueIndex("proposed_calls_capture_uq").on(table.originSessionId, table.identityHash),
	],
);

/**
 * Tailored Grants — scoped permission composed on approve, consumed once by
 * session 2 via a single-statement CAS.
 *
 * @lore AL7 D2: separate table so the grant has its own lifecycle (compose at
 * approve, consume in session 2, re-mint on re-open). CAS consume:
 *   UPDATE tailored_grants SET consumed=true WHERE ... AND consumed=false RETURNING *
 * One non-null return = claimed; null = already consumed (no double-execute).
 *
 * @lore AL7 D3: retryCount is a liveness-net counter only (AC11b). It is NOT
 * a guard — the liveness net fires on crash/no-show, never on re-derivation.
 */
export const tailoredGrants = pgTable(
	"tailored_grants",
	{
		proposedCallId: text("proposed_call_id")
			.primaryKey()
			.references(() => proposedCalls.id, { onDelete: "restrict" }),
		taskScope: text("task_scope").notNull(), // tasks.id
		agentScope: text("agent_scope").notNull(), // agents.id — the same owner resuming
		approvedToolId: text("approved_tool_id").notNull(),
		approvedArgs: text("approved_args").notNull(), // JSON; recorded approved args (arg-pin uses these)
		argPinned: boolean("arg_pinned").notNull().default(false),
		identityHash: text("identity_hash"), // optional, for the arg-pin convenience
		consumed: boolean("consumed").notNull().default(false),
		retryCount: integer("retry_count").notNull().default(0), // liveness net (AC11b), not a guard
		mintedAt: text("minted_at").notNull(),
		consumedAt: text("consumed_at"),
	},
	(t) => [index("grant_match_idx").on(t.taskScope, t.agentScope, t.approvedToolId, t.consumed)],
);

/**
 * Operation Outcomes — immutable terminal result of one executed Proposed Call.
 *
 * @lore AL7 trust-first: proposedCallId IS the PK — enforces 0..1 per call
 * and immutability structurally. FK renamed from staged_operation_id.
 * receipt replaces payload (holds the tool's return identity string or JSON).
 */
export const operationOutcomes = pgTable("operation_outcomes", {
	// 0..1 per Proposed Call — PK enforces immutability.
	proposedCallId: text("proposed_call_id")
		.primaryKey()
		.references(() => proposedCalls.id, { onDelete: "restrict" }),
	status: text("status").notNull(), // "ok" | "failed"
	receipt: text("receipt"), // tool return on ok (serialized)
	error: text("error"), // surfaced verbatim on failed — never null+failed
	executedAt: text("executed_at").notNull(),
});

// --- Inferred types ---

// @lore U1: Team (formerly Product) is the domain entity. TeamMember (formerly Team)
// is the agent-membership group. See architecture U1 §4.2.
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;

export type RoutineRun = typeof routineRuns.$inferSelect;
export type NewRoutineRun = typeof routineRuns.$inferInsert;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;

export type OrgEdge = typeof orgEdges.$inferSelect;
export type NewOrgEdge = typeof orgEdges.$inferInsert;

export type FactorySetting = typeof factorySettings.$inferSelect;
export type NewFactorySetting = typeof factorySettings.$inferInsert;

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type NewKnowledgeItem = typeof knowledgeItems.$inferInsert;

export type KnowledgeEditLogEntry = typeof knowledgeEditLog.$inferSelect;
export type NewKnowledgeEditLogEntry = typeof knowledgeEditLog.$inferInsert;

export type KnowledgeAccessLogEntry = typeof knowledgeAccessLog.$inferSelect;
export type NewKnowledgeAccessLogEntry = typeof knowledgeAccessLog.$inferInsert;

export type KnowledgeConflict = typeof knowledgeConflicts.$inferSelect;
export type NewKnowledgeConflict = typeof knowledgeConflicts.$inferInsert;

export type NotificationQueueRow = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueRow = typeof notificationQueue.$inferInsert;

export type ArtifactRow = typeof artifacts.$inferSelect;
export type NewArtifactRow = typeof artifacts.$inferInsert;

export type PropagationLogRow = typeof propagationLog.$inferSelect;
export type NewPropagationLogRow = typeof propagationLog.$inferInsert;

export type KnowledgeStrategyFabricRow = typeof knowledgeStrategyFabric.$inferSelect;
export type NewKnowledgeStrategyFabricRow = typeof knowledgeStrategyFabric.$inferInsert;

export type TaskStrategyFabricRow = typeof taskStrategyFabric.$inferSelect;
export type NewTaskStrategyFabricRow = typeof taskStrategyFabric.$inferInsert;

export type ServerCredential = typeof serverCredentials.$inferSelect;
export type NewServerCredential = typeof serverCredentials.$inferInsert;

export type ServerConfigRow = typeof serverConfig.$inferSelect;
export type NewServerConfigRow = typeof serverConfig.$inferInsert;

export type HintProgressRow = typeof hintProgress.$inferSelect;
export type NewHintProgressRow = typeof hintProgress.$inferInsert;

export type LoginSession = typeof loginSessions.$inferSelect;
export type NewLoginSession = typeof loginSessions.$inferInsert;

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;

export type ProposedCall = typeof proposedCalls.$inferSelect;
export type NewProposedCall = typeof proposedCalls.$inferInsert;

export type TailoredGrant = typeof tailoredGrants.$inferSelect;
export type NewTailoredGrant = typeof tailoredGrants.$inferInsert;

export type OperationOutcome = typeof operationOutcomes.$inferSelect;
export type NewOperationOutcome = typeof operationOutcomes.$inferInsert;

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
