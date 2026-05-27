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

export const products = pgTable("products", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	phase: text("phase").notNull(),
	briefPath: text("brief_path"),
	architecturePath: text("architecture_path"),
	brandPath: text("brand_path"),
	principlesPath: text("principles_path"),
	factoryDbPath: text("factory_db_path"),
	createdAt: text("created_at").notNull(),
});

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	/** "human" | "ai" — P2: kind column distinguishes human founders from AI agents. */
	kind: text("kind").notNull().default("ai"),
	name: text("name").notNull(),
	soulPromptPath: text("soul_prompt_path"),
	teamId: text("team_id").references(() => teams.id, { onDelete: "restrict" }),
	role: text("role").notNull(),
	skills: text("skills"),
	status: text("status").notNull(),
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	costCap: integer("cost_cap"),
	costActual: integer("cost_actual").default(0),
	/** L17: structured money cap — minor units + currency code. */
	costCapMinor: integer("cost_cap_minor"),
	costCapCurrency: text("cost_cap_currency"),
	/** P2: human-specific nullable columns. Null for AI users. */
	email: text("email"),
	avatarUrl: text("avatar_url"),
	createdAt: text("created_at").notNull(),
});

export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	productId: text("product_id")
		.notNull()
		.references(() => products.id, { onDelete: "restrict" }),
	members: text("members"),
	leadAgentId: text("lead_agent_id"),
	capacity: integer("capacity").notNull(),
	activeBets: integer("active_bets").notNull().default(0),
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
		productId: text("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "restrict" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		pitch: text("pitch").notNull(),
		appetite: text("appetite"),
		doneCondition: text("done_condition"),
		hypothesis: text("hypothesis"),
		status: text("status").notNull(),
		revisionLog: text("revision_log"),
		createdAt: text("created_at").notNull(),
		shippedAt: text("shipped_at"),
		/** L17: structured cost appetite — minor units + currency code. */
		costAppetiteMinor: integer("cost_appetite_minor"),
		costAppetiteCurrency: text("cost_appetite_currency"),
		/** L17: accumulated actual cost from sessions — minor units + currency. */
		costActualMinor: integer("cost_actual_minor"),
		costActualCurrency: text("cost_actual_currency"),
		/** L17: accumulated tokens as JSON (TokenUsage shape). */
		tokensActualJson: text("tokens_actual_json"),
	},
	(table) => [
		index("bets_product_id_idx").on(table.productId),
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
		productId: text("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "restrict" }),
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
	},
	(table) => [
		index("tasks_bet_id_idx").on(table.betId),
		index("tasks_team_id_idx").on(table.teamId),
		index("tasks_product_id_idx").on(table.productId),
		// @lore I3 review O1: `tasks_state_idx` was dropped — state has too
		// few distinct values to be selective. Migration drizzle-pg/0005_drop_tasks_state_idx.
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
		workspaceSnapshot: text("workspace_snapshot"),
		outcome: text("outcome"),
		notes: text("notes"),
	},
	(table) => [
		index("sessions_task_id_idx").on(table.taskId),
		index("sessions_agent_id_idx").on(table.agentId),
		index("sessions_state_idx").on(table.state),
	],
);

export const routines = pgTable("routines", {
	id: text("id").primaryKey(),
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => users.id, { onDelete: "restrict" }),
	triggerType: text("trigger_type").notNull(),
	triggerConfig: text("trigger_config"),
	skillId: text("skill_id"),
	doneCondition: text("done_condition"),
	stateKey: text("state_key"),
	delegationAllowed: boolean("delegation_allowed").default(false),
	humanReview: boolean("human_review").default(false),
	autonomyLevel: integer("autonomy_level"),
	silent: boolean("silent").default(false),
	active: boolean("active").notNull().default(true),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

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
	},
	(table) => [
		index("threads_host_idx").on(table.hostKind, table.hostId, table.lastActiveAt),
		index("threads_initiator_idx").on(table.initiatorId, table.lastActiveAt),
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
	},
	(table) => [
		index("messages_thread_id_idx").on(table.threadId, table.createdAt),
		uniqueIndex("messages_idempotency_uq").on(table.threadId, table.senderId, table.clientKey),
		index("messages_unresolved_idx").on(table.threadId, table.resolvedAt),
	],
);

// --- Items & Responses ---

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

// L1a: `responses` table dropped — see schema.ts.

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
 * @lore P2: Option A (single table, polymorphic target). See schema.ts for full rationale.
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
		 * @lore Q2: scope_kind + scope_id added to the kernel table (mirrors SQLite schema).
		 * Default "factory" preserves existing rows.
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
 * Append-only log of knowledge item detail-view fetches.
 * @lore L22: mirrors SQLite schema. See schema.ts for rationale.
 */
export const knowledgeAccessLog = pgTable(
	"knowledge_access_log",
	{
		id: text("id").primaryKey(),
		itemId: text("item_id")
			.notNull()
			.references(() => knowledgeItems.id, { onDelete: "restrict" }),
		accessorKind: text("accessor_kind").notNull(),
		accessorId: text("accessor_id").notNull(),
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
	},
	(table) => [
		index("nq_status_created_idx").on(table.status, table.createdAt),
		index("nq_severity_idx").on(table.severity),
	],
);

// --- Propagation log (L20) ---

export const propagationLog = pgTable(
	"propagation_log",
	{
		id: text("id").primaryKey(),
		sourceLevel: text("source_level").notNull(),
		sourceId: text("source_id").notNull(),
		sourceEvent: text("source_event").notNull(),
		targetLevel: text("target_level").notNull(),
		targetId: text("target_id").notNull(),
		targetTransition: text("target_transition"),
		status: text("status").notNull(),
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

/**
 * @lore O2: cost columns (costMoneyMicros, costTokensInput, costTokensOutput,
 * costSettledAt) stripped from the kernel artifacts table. Cost is a strategy concern.
 */
export const artifacts = pgTable(
	"artifacts",
	{
		id: text("id").primaryKey(),
		producingTaskId: text("producing_task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "restrict" }),
		kind: text("kind").notNull(),
		previewJson: text("preview_json"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("artifacts_producing_task_id_idx").on(table.producingTaskId),
		index("artifacts_created_at_idx").on(table.createdAt),
	],
);

// --- Extension tables (O2) ---

/**
 * Stores strategy-layer data for knowledge items (PG mirror of SQLite knowledgeStrategyFabric).
 *
 * @lore O2: kernel/strategy separation. Strategy signals moved from knowledge_items.
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
 * Stores strategy-layer data for tasks (PG mirror of SQLite taskStrategyFabric).
 *
 * @lore O2: kernel/strategy separation. Strategy signals moved from tasks.
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

// --- Inferred types ---

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;

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

// --- P3: Server-side credential storage (shared mode) ---

export const serverCredentials = pgTable("server_credentials", {
	name: text("name").primaryKey(),
	encryptedValue: text("encrypted_value").notNull(),
	validationState: text("validation_state").notNull().default("present_untested"),
	lastValidatedAt: text("last_validated_at"),
	updatedAt: text("updated_at").notNull(),
});

// --- P3: Typed server config ---

export const serverConfig = pgTable("server_config", {
	id: text("id").primaryKey().default("default"),
	config: text("config").notNull().default("{}"),
	updatedAt: text("updated_at").notNull(),
});

export type ServerCredential = typeof serverCredentials.$inferSelect;
export type NewServerCredential = typeof serverCredentials.$inferInsert;

export type ServerConfigRow = typeof serverConfig.$inferSelect;
export type NewServerConfigRow = typeof serverConfig.$inferInsert;

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

export type HintProgressRow = typeof hintProgress.$inferSelect;
export type NewHintProgressRow = typeof hintProgress.$inferInsert;
