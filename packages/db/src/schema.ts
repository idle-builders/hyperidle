import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 1. products
export const products = sqliteTable("products", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	phase: text("phase").notNull(), // ProductPhase
	briefPath: text("brief_path"),
	architecturePath: text("architecture_path"),
	brandPath: text("brand_path"),
	principlesPath: text("principles_path"),
	factoryDbPath: text("factory_db_path"),
	createdAt: text("created_at").notNull(),
});

// 2. factorySettings (kept as-is)
export const factorySettings = sqliteTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// 3. threads
export const threads = sqliteTable("threads", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(), // ThreadKind
	pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
	participants: text("participants").notNull(), // JSON text
	createdAt: text("created_at").notNull(),
});

// 4. agents (no FK to teams due to circular)
export const agents = sqliteTable("agents", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	soulPromptPath: text("soul_prompt_path"),
	teamId: text("team_id"), // nullable, no FK due to circular
	role: text("role").notNull(),
	skills: text("skills").notNull(), // JSON text
	status: text("status").notNull(), // AgentStatus
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	createdAt: text("created_at").notNull(),
});

// 5. teams
export const teams = sqliteTable("teams", {
	id: text("id").primaryKey(),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	members: text("members").notNull(), // JSON text
	leadAgentId: text("lead_agent_id"), // nullable, no FK due to circular
	capacity: integer("capacity").notNull().default(3),
	activeBets: integer("active_bets").notNull().default(0),
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	formedAt: text("formed_at").notNull(),
	dissolvedAt: text("dissolved_at"),
});

// 6. bets
export const bets = sqliteTable("bets", {
	id: text("id").primaryKey(),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	teamId: text("team_id")
		.notNull()
		.references(() => teams.id),
	pitch: text("pitch").notNull(),
	appetite: text("appetite").notNull(),
	doneCondition: text("done_condition").notNull(),
	hypothesis: text("hypothesis").notNull(),
	status: text("status").notNull(), // BetStatus
	revisionLog: text("revision_log").notNull(), // JSON text
	createdAt: text("created_at").notNull(),
	shippedAt: text("shipped_at"),
});

// 7. tasks
export const tasks = sqliteTable("tasks", {
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
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id),
	title: text("title").notNull(),
	description: text("description").notNull(),
	doneCondition: text("done_condition").notNull(),
	state: text("state").notNull(), // TaskState
	dependencies: text("dependencies").notNull(), // JSON text
	artifacts: text("artifacts").notNull(), // JSON text
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	durability: text("durability").notNull(),
	riskTier: text("risk_tier").notNull(), // RiskTier
	attentionScore: real("attention_score").notNull().default(0),
	crossTeam: integer("cross_team", { mode: "boolean" }).notNull().default(false),
	threadId: text("thread_id").references(() => threads.id),
	notes: text("notes"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// 8. sessions
export const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	taskId: text("task_id")
		.notNull()
		.references(() => tasks.id),
	agentId: text("agent_id")
		.notNull()
		.references(() => agents.id),
	modelTier: text("model_tier").notNull(), // ModelTier
	startedAt: text("started_at").notNull(),
	endedAt: text("ended_at"),
	state: text("state").notNull(), // SessionState
	workspaceSnapshot: text("workspace_snapshot").notNull(),
	cost: real("cost").notNull().default(0),
	outcome: text("outcome"), // SessionOutcome, nullable
	notes: text("notes"),
});

// 9. routines
export const routines = sqliteTable("routines", {
	id: text("id").primaryKey(),
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id),
	triggerType: text("trigger_type").notNull(), // TriggerType
	triggerConfig: text("trigger_config").notNull(),
	skillId: text("skill_id").notNull(),
	doneCondition: text("done_condition").notNull(),
	stateKey: text("state_key").notNull(),
	delegationAllowed: integer("delegation_allowed", { mode: "boolean" }).notNull().default(false),
	humanReview: integer("human_review", { mode: "boolean" }).notNull().default(false),
	autonomyLevel: text("autonomy_level").notNull(), // AutonomyLevel
	silent: integer("silent", { mode: "boolean" }).notNull().default(false),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

// 10. messages
export const messages = sqliteTable("messages", {
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
	subject: text("subject").notNull(),
	body: text("body").notNull(),
	fileLeases: text("file_leases").notNull(), // JSON text
	createdAt: text("created_at").notNull(),
});

// 11. items
export const items = sqliteTable("items", {
	id: text("id").primaryKey(),
	sourceAgentId: text("source_agent_id")
		.notNull()
		.references(() => agents.id),
	layer: text("layer").notNull(), // KnowledgeLayer
	verb: text("verb").notNull(),
	kind: text("kind").notNull(),
	title: text("title").notNull(),
	body: text("body").notNull(),
	attachments: text("attachments").notNull(), // JSON text
	proposedAction: text("proposed_action").notNull(),
	options: text("options").notNull(), // JSON text
	riskTier: text("risk_tier").notNull(), // RiskTier
	attentionScore: real("attention_score").notNull().default(0),
	blocking: integer("blocking", { mode: "boolean" }).notNull().default(false),
	reasoning: text("reasoning").notNull(),
	costEstimate: real("cost_estimate"),
	auditTrail: text("audit_trail").notNull(), // JSON text
	threadId: text("thread_id").references(() => threads.id),
	createdAt: text("created_at").notNull(),
});

// 12. responses
export const responses = sqliteTable("responses", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => items.id),
	decision: text("decision").notNull(),
	inlineAnchor: text("inline_anchor"),
	edits: text("edits"), // JSON text, nullable
	feedback: text("feedback"),
	approverId: text("approver_id")
		.notNull()
		.references(() => agents.id),
	view: text("view").notNull(),
	respondedAt: text("responded_at").notNull(),
});

// 13. agentSkills
export const agentSkills = sqliteTable(
	"agent_skills",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id),
		skillId: text("skill_id").notNull(),
		autonomyLevel: text("autonomy_level").notNull(), // AutonomyLevel
		successCount: integer("success_count").notNull().default(0),
		failureCount: integer("failure_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		promotedAt: text("promoted_at"),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.skillId] })],
);

// 14. knowledgeItems
export const knowledgeItems = sqliteTable(
	"knowledge_items",
	{
		id: text("id").primaryKey(),
		layer: text("layer").notNull(), // KnowledgeLayer
		scopeId: text("scope_id").notNull(),
		kind: text("kind").notNull(), // KnowledgeKind
		topic: text("topic").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(), // KnowledgeFormat
		status: text("status").notNull(), // KnowledgeStatus
		attentionScore: real("attention_score").notNull().default(0),
		confidence: real("confidence").notNull().default(0.5),
		version: integer("version").notNull().default(1),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		meta: text("meta"), // JSON text, nullable
	},
	(table) => [
		index("idx_ki_layer_scope").on(table.layer, table.scopeId),
		index("idx_ki_kind").on(table.kind),
		index("idx_ki_topic").on(table.topic),
		index("idx_ki_status").on(table.status),
		index("idx_ki_attention").on(table.attentionScore),
	],
);

// 15. knowledgeEditLog
export const knowledgeEditLog = sqliteTable("knowledge_edit_log", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => knowledgeItems.id),
	editor: text("editor").notNull(),
	field: text("field").notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	editType: text("edit_type").notNull(), // EditType
	createdAt: text("created_at").notNull(),
});

// 16. fileLeases
export const fileLeases = sqliteTable("file_leases", {
	id: text("id").primaryKey(),
	agentId: text("agent_id")
		.notNull()
		.references(() => agents.id),
	filePath: text("file_path").notNull(),
	acquiredAt: text("acquired_at").notNull(),
	releasedAt: text("released_at"),
});

// Inferred types
export type FactorySetting = typeof factorySettings.$inferSelect;
export type NewFactorySetting = typeof factorySettings.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

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

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type Response = typeof responses.$inferSelect;
export type NewResponse = typeof responses.$inferInsert;

export type AgentSkill = typeof agentSkills.$inferSelect;
export type NewAgentSkill = typeof agentSkills.$inferInsert;

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type NewKnowledgeItem = typeof knowledgeItems.$inferInsert;

export type KnowledgeEditLogEntry = typeof knowledgeEditLog.$inferSelect;
export type NewKnowledgeEditLogEntry = typeof knowledgeEditLog.$inferInsert;

export type FileLease = typeof fileLeases.$inferSelect;
export type NewFileLease = typeof fileLeases.$inferInsert;
