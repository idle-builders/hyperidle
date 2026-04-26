import type { AutonomyLevel } from "@hyperidle/shared";
import { boolean, index, integer, pgTable, primaryKey, real, text } from "drizzle-orm/pg-core";

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

export const agents = pgTable("agents", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	soulPromptPath: text("soul_prompt_path"),
	teamId: text("team_id").references(() => teams.id, { onDelete: "restrict" }),
	role: text("role").notNull(),
	skills: text("skills"),
	status: text("status").notNull(),
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	costCap: integer("cost_cap"),
	costActual: integer("cost_actual").default(0),
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
		appetite: text("appetite").notNull(),
		doneCondition: text("done_condition"),
		hypothesis: text("hypothesis"),
		status: text("status").notNull(),
		revisionLog: text("revision_log"),
		createdAt: text("created_at").notNull(),
		shippedAt: text("shipped_at"),
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
		ownerAgentId: text("owner_agent_id").references(() => agents.id, { onDelete: "restrict" }),
		title: text("title").notNull(),
		description: text("description"),
		doneCondition: text("done_condition"),
		state: text("state").notNull(),
		dependencies: text("dependencies"),
		artifacts: text("artifacts"),
		costCap: integer("cost_cap"),
		costActual: integer("cost_actual").default(0),
		durability: text("durability"),
		riskTier: text("risk_tier"),
		attentionScore: integer("attention_score"),
		crossTeam: boolean("cross_team").default(false),
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
			.references(() => agents.id, { onDelete: "restrict" }),
		modelTier: text("model_tier").notNull(),
		startedAt: text("started_at").notNull(),
		endedAt: text("ended_at"),
		state: text("state").notNull(),
		workspaceSnapshot: text("workspace_snapshot"),
		cost: integer("cost").default(0),
		outcome: text("outcome"),
		notes: text("notes"),
		traceId: text("trace_id"),
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
		.references(() => agents.id, { onDelete: "restrict" }),
	triggerType: text("trigger_type").notNull(),
	triggerConfig: text("trigger_config"),
	skillId: text("skill_id"),
	doneCondition: text("done_condition"),
	stateKey: text("state_key"),
	delegationAllowed: boolean("delegation_allowed").default(false),
	humanReview: boolean("human_review").default(false),
	// L1 review N4: brand the autonomy column with `AutonomyLevel` so
	// downstream type checks reject plain `number` confusion.
	autonomyLevel: integer("autonomy_level").$type<AutonomyLevel>(),
	silent: boolean("silent").default(false),
	active: boolean("active").notNull().default(true),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

// --- Messaging ---

export const threads = pgTable("threads", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	pinned: boolean("pinned").default(false),
	participants: text("participants"),
	createdAt: text("created_at").notNull(),
});

export const messages = pgTable(
	"messages",
	{
		id: text("id").primaryKey(),
		senderId: text("sender_id")
			.notNull()
			.references(() => agents.id, { onDelete: "restrict" }),
		recipientId: text("recipient_id")
			.notNull()
			.references(() => agents.id, { onDelete: "restrict" }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		subject: text("subject"),
		body: text("body").notNull(),
		fileLeaseIds: text("file_leases"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("messages_thread_id_idx").on(table.threadId)],
);

// --- Items & Responses ---

export const items = pgTable(
	"items",
	{
		id: text("id").primaryKey(),
		sourceAgentId: text("source_agent_id").references(() => agents.id, { onDelete: "restrict" }),
		layer: text("layer"),
		verb: text("verb"),
		kind: text("kind"),
		title: text("title").notNull(),
		body: text("body"),
		attachments: text("attachments"),
		proposedAction: text("proposed_action"),
		options: text("options"),
		riskTier: text("risk_tier"),
		attentionScore: integer("attention_score"),
		blocking: boolean("blocking").default(false),
		reasoning: text("reasoning"),
		costEstimate: integer("cost_estimate"),
		auditTrail: text("audit_trail"),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("items_thread_id_idx").on(table.threadId)],
);

export const responses = pgTable("responses", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => items.id, { onDelete: "cascade" }),
	decision: text("decision").notNull(),
	inlineAnchor: text("inline_anchor"),
	edits: text("edits"),
	feedback: text("feedback"),
	approverId: text("approver_id"),
	view: text("view"),
	respondedAt: text("responded_at").notNull(),
});

// --- Agent skills ---

export const agentSkills = pgTable(
	"agent_skills",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "restrict" }),
		skillId: text("skill_id").notNull(),
		autonomyLevel: integer("autonomy_level").notNull().$type<AutonomyLevel>(),
		successCount: integer("success_count").notNull().default(0),
		failureCount: integer("failure_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		promotedAt: text("promoted_at"),
		// L1: per-pair audit columns. Postgres can take a real ISO default
		// in the migration, so the literal sentinel pattern used by SQLite
		// is unnecessary here.
		updatedAt: text("updated_at").notNull().default("1970-01-01T00:00:00.000Z"),
		updatedBy: text("updated_by"),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.skillId] })],
);

// --- Agent skill autonomy audit (L1) ---

// @lore L1 review N3: `agent_skill_autonomy_audit` is logically
// append-only. Never UPDATE or DELETE rows from this table — its forensic
// value depends on every change being durable. The static-codebase
// regression test in `autonomy-service.test.ts` pins the invariant.
//
// @lore L1 review B3: `skill_id` deliberately has no FK in this story —
// no `skills` table exists yet (future story). Boundary validation lives
// in `routes/agents.ts`.
export const agentSkillAutonomyAudit = pgTable(
	"agent_skill_autonomy_audit",
	{
		id: text("id").primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "restrict" }),
		skillId: text("skill_id").notNull(),
		fromLevel: integer("from_level").$type<AutonomyLevel>(),
		toLevel: integer("to_level").notNull().$type<AutonomyLevel>(),
		rationale: text("rationale"),
		changedBy: text("changed_by").notNull(),
		changedAt: text("changed_at").notNull(),
	},
	(table) => [
		index("asaa_agent_idx").on(table.agentId),
		index("asaa_pair_idx").on(table.agentId, table.skillId),
		index("asaa_changed_at_desc_idx").on(table.changedAt),
	],
);

// --- Factory settings ---

export const factorySettings = pgTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// --- Knowledge ---

export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: text("id").primaryKey(),
		layer: text("layer").notNull(),
		scopeId: text("scope_id"),
		kind: text("kind").notNull(),
		topic: text("topic"),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(),
		status: text("status").notNull(),
		attentionScore: real("attention_score"),
		confidence: real("confidence"),
		version: integer("version").notNull().default(1),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		meta: text("meta"),
	},
	(table) => [
		index("ki_layer_idx").on(table.layer),
		index("ki_scope_id_idx").on(table.scopeId),
		index("ki_kind_idx").on(table.kind),
		index("ki_topic_idx").on(table.topic),
		index("ki_status_idx").on(table.status),
		index("ki_layer_scope_idx").on(table.layer, table.scopeId),
		index("ki_attention_desc_idx").on(table.attentionScore),
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

// --- File leases ---

export const fileLeases = pgTable("file_leases", {
	id: text("id").primaryKey(),
	agentId: text("agent_id")
		.notNull()
		.references(() => agents.id, { onDelete: "restrict" }),
	filePath: text("file_path").notNull(),
	acquiredAt: text("acquired_at").notNull(),
	releasedAt: text("released_at"),
});

// --- Inferred types ---

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

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

export type Response = typeof responses.$inferSelect;
export type NewResponse = typeof responses.$inferInsert;

export type AgentSkill = typeof agentSkills.$inferSelect;
export type NewAgentSkill = typeof agentSkills.$inferInsert;

export type AgentSkillAutonomyAuditEntry = typeof agentSkillAutonomyAudit.$inferSelect;
export type NewAgentSkillAutonomyAuditEntry = typeof agentSkillAutonomyAudit.$inferInsert;

export type FactorySetting = typeof factorySettings.$inferSelect;
export type NewFactorySetting = typeof factorySettings.$inferInsert;

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type NewKnowledgeItem = typeof knowledgeItems.$inferInsert;

export type KnowledgeEditLogEntry = typeof knowledgeEditLog.$inferSelect;
export type NewKnowledgeEditLogEntry = typeof knowledgeEditLog.$inferInsert;

export type FileLease = typeof fileLeases.$inferSelect;
export type NewFileLease = typeof fileLeases.$inferInsert;

export type KnowledgeConflict = typeof knowledgeConflicts.$inferSelect;
export type NewKnowledgeConflict = typeof knowledgeConflicts.$inferInsert;

export type NotificationQueueRow = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueRow = typeof notificationQueue.$inferInsert;
