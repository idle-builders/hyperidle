import { index, integer, pgTable, primaryKey, real, text } from "drizzle-orm/pg-core";

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
	teamId: text("team_id").references(() => teams.id),
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
		.references(() => products.id),
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

export const bets = pgTable("bets", {
	id: text("id").primaryKey(),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	teamId: text("team_id")
		.notNull()
		.references(() => teams.id),
	pitch: text("pitch").notNull(),
	appetite: text("appetite").notNull(),
	doneCondition: text("done_condition"),
	hypothesis: text("hypothesis"),
	status: text("status").notNull(),
	revisionLog: text("revision_log"),
	createdAt: text("created_at").notNull(),
	shippedAt: text("shipped_at"),
});

export const tasks = pgTable("tasks", {
	id: text("id").primaryKey(),
	betId: text("bet_id")
		.notNull()
		.references(() => bets.id),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	teamId: text("team_id")
		.notNull()
		.references(() => teams.id),
	ownerAgentId: text("owner_agent_id").references(() => agents.id),
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
	crossTeam: integer("cross_team").default(0),
	threadId: text("thread_id").references(() => threads.id),
	notes: text("notes"),
	auditTrail: text("audit_trail"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	taskId: text("task_id")
		.notNull()
		.references(() => tasks.id),
	agentId: text("agent_id")
		.notNull()
		.references(() => agents.id),
	modelTier: text("model_tier").notNull(),
	startedAt: text("started_at").notNull(),
	endedAt: text("ended_at"),
	state: text("state").notNull(),
	workspaceSnapshot: text("workspace_snapshot"),
	cost: integer("cost").default(0),
	outcome: text("outcome"),
	notes: text("notes"),
});

export const routines = pgTable("routines", {
	id: text("id").primaryKey(),
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id),
	triggerType: text("trigger_type").notNull(),
	triggerConfig: text("trigger_config"),
	skillId: text("skill_id"),
	doneCondition: text("done_condition"),
	stateKey: text("state_key"),
	delegationAllowed: integer("delegation_allowed").default(0),
	humanReview: integer("human_review").default(0),
	autonomyLevel: integer("autonomy_level"),
	silent: integer("silent").default(0),
	active: integer("active").notNull().default(1),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

// --- Messaging ---

export const threads = pgTable("threads", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	pinned: integer("pinned").default(0),
	participants: text("participants"),
	createdAt: text("created_at").notNull(),
});

export const messages = pgTable("messages", {
	id: text("id").primaryKey(),
	senderId: text("sender_id")
		.notNull()
		.references(() => agents.id),
	recipientId: text("recipient_id")
		.notNull()
		.references(() => agents.id),
	threadId: text("thread_id")
		.notNull()
		.references(() => threads.id),
	subject: text("subject"),
	body: text("body").notNull(),
	fileLeaseIds: text("file_leases"),
	createdAt: text("created_at").notNull(),
});

// --- Items & Responses ---

export const items = pgTable("items", {
	id: text("id").primaryKey(),
	sourceAgentId: text("source_agent_id").references(() => agents.id),
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
	blocking: integer("blocking").default(0),
	reasoning: text("reasoning"),
	costEstimate: integer("cost_estimate"),
	auditTrail: text("audit_trail"),
	threadId: text("thread_id")
		.notNull()
		.references(() => threads.id),
	createdAt: text("created_at").notNull(),
});

export const responses = pgTable("responses", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => items.id),
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
			.references(() => agents.id),
		skillId: text("skill_id").notNull(),
		autonomyLevel: integer("autonomy_level").notNull(),
		successCount: integer("success_count").notNull().default(0),
		failureCount: integer("failure_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		promotedAt: text("promoted_at"),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.skillId] })],
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
	itemId: text("item_id")
		.notNull()
		.references(() => knowledgeItems.id),
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
	itemId: text("item_id")
		.notNull()
		.references(() => knowledgeItems.id),
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
		.references(() => agents.id),
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
