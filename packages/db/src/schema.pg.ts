import { index, integer, pgTable, primaryKey, real, text } from "drizzle-orm/pg-core";

// 1. products
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

// 2. factorySettings
export const factorySettings = pgTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// 3. threads
export const threads = pgTable("threads", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	pinned: integer("pinned").notNull().default(0),
	participants: text("participants").notNull(),
	createdAt: text("created_at").notNull(),
});

// 4. agents
export const agents = pgTable("agents", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	soulPromptPath: text("soul_prompt_path"),
	teamId: text("team_id"),
	role: text("role").notNull(),
	skills: text("skills").notNull(),
	status: text("status").notNull(),
	maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	createdAt: text("created_at").notNull(),
});

// 5. teams
export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	members: text("members").notNull(),
	leadAgentId: text("lead_agent_id"),
	capacity: integer("capacity").notNull().default(3),
	activeBets: integer("active_bets").notNull().default(0),
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	formedAt: text("formed_at").notNull(),
	dissolvedAt: text("dissolved_at"),
});

// 6. bets
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
	doneCondition: text("done_condition").notNull(),
	hypothesis: text("hypothesis").notNull(),
	status: text("status").notNull(),
	revisionLog: text("revision_log").notNull(),
	createdAt: text("created_at").notNull(),
	shippedAt: text("shipped_at"),
});

// 7. tasks
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
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id),
	title: text("title").notNull(),
	description: text("description").notNull(),
	doneCondition: text("done_condition").notNull(),
	state: text("state").notNull(),
	dependencies: text("dependencies").notNull(),
	artifacts: text("artifacts").notNull(),
	costCap: real("cost_cap").notNull().default(0),
	costActual: real("cost_actual").notNull().default(0),
	durability: text("durability").notNull(),
	riskTier: text("risk_tier").notNull(),
	attentionScore: real("attention_score").notNull().default(0),
	crossTeam: integer("cross_team").notNull().default(0),
	threadId: text("thread_id").references(() => threads.id),
	notes: text("notes"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// 8. sessions
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
	workspaceSnapshot: text("workspace_snapshot").notNull(),
	cost: real("cost").notNull().default(0),
	outcome: text("outcome"),
	notes: text("notes"),
});

// 9. routines
export const routines = pgTable("routines", {
	id: text("id").primaryKey(),
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id),
	triggerType: text("trigger_type").notNull(),
	triggerConfig: text("trigger_config").notNull(),
	skillId: text("skill_id").notNull(),
	doneCondition: text("done_condition").notNull(),
	stateKey: text("state_key").notNull(),
	delegationAllowed: integer("delegation_allowed").notNull().default(0),
	humanReview: integer("human_review").notNull().default(0),
	autonomyLevel: text("autonomy_level").notNull(),
	silent: integer("silent").notNull().default(0),
	active: integer("active").notNull().default(1),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

// 10. messages
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
	subject: text("subject").notNull(),
	body: text("body").notNull(),
	fileLeases: text("file_leases").notNull(),
	createdAt: text("created_at").notNull(),
});

// 11. items
export const items = pgTable("items", {
	id: text("id").primaryKey(),
	sourceAgentId: text("source_agent_id")
		.notNull()
		.references(() => agents.id),
	layer: text("layer").notNull(),
	verb: text("verb").notNull(),
	kind: text("kind").notNull(),
	title: text("title").notNull(),
	body: text("body").notNull(),
	attachments: text("attachments").notNull(),
	proposedAction: text("proposed_action").notNull(),
	options: text("options").notNull(),
	riskTier: text("risk_tier").notNull(),
	attentionScore: real("attention_score").notNull().default(0),
	blocking: integer("blocking").notNull().default(0),
	reasoning: text("reasoning").notNull(),
	costEstimate: real("cost_estimate"),
	auditTrail: text("audit_trail").notNull(),
	threadId: text("thread_id").references(() => threads.id),
	createdAt: text("created_at").notNull(),
});

// 12. responses
export const responses = pgTable("responses", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => items.id),
	decision: text("decision").notNull(),
	inlineAnchor: text("inline_anchor"),
	edits: text("edits"),
	feedback: text("feedback"),
	approverId: text("approver_id")
		.notNull()
		.references(() => agents.id),
	view: text("view").notNull(),
	respondedAt: text("responded_at").notNull(),
});

// 13. agentSkills
export const agentSkills = pgTable(
	"agent_skills",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id),
		skillId: text("skill_id").notNull(),
		autonomyLevel: text("autonomy_level").notNull(),
		successCount: integer("success_count").notNull().default(0),
		failureCount: integer("failure_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		promotedAt: text("promoted_at"),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.skillId] })],
);

// 14. knowledgeItems
export const knowledgeItems = pgTable(
	"knowledge_items",
	{
		id: text("id").primaryKey(),
		layer: text("layer").notNull(),
		scopeId: text("scope_id").notNull(),
		kind: text("kind").notNull(),
		topic: text("topic").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(),
		status: text("status").notNull(),
		attentionScore: real("attention_score").notNull().default(0),
		confidence: real("confidence").notNull().default(0.5),
		version: integer("version").notNull().default(1),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		meta: text("meta"),
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

// 16. fileLeases
export const fileLeases = pgTable("file_leases", {
	id: text("id").primaryKey(),
	agentId: text("agent_id")
		.notNull()
		.references(() => agents.id),
	filePath: text("file_path").notNull(),
	acquiredAt: text("acquired_at").notNull(),
	releasedAt: text("released_at"),
});
