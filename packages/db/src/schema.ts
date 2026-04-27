import type {
	ActorRole,
	AutonomyLevel,
	RecoveryOutcome,
	RecoveryTargetKind,
	RecoveryVerb,
} from "@hyperidle/shared";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// --- Core tables ---

export const products = sqliteTable("products", {
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

export const agents = sqliteTable("agents", {
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

export const teams = sqliteTable("teams", {
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

export const bets = sqliteTable(
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

export const tasks = sqliteTable(
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
		crossTeam: integer("cross_team").default(0),
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
		// few distinct values to be selective. Migration 0006_drop_tasks_state_idx.
	],
);

export const sessions = sqliteTable(
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
		/**
		 * Correlates every observability event emitted within this session.
		 * Populated on insert by `createSession` (H3). Nullable for rows
		 * inserted before the column was added.
		 */
		traceId: text("trace_id"),
		/**
		 * @lore L7: opaque JSON snapshot stashed when a session is paused so
		 * resume can restore the prior state. Populated by both mid-session
		 * pause (`session_pause` verb) and factory-wide kill (`factory_pause`
		 * verb cascades to every running session). The factory-resume path
		 * uses `pausedByKill: true` here to disambiguate "paused because the
		 * factory was killed" from "paused mid-session by a founder" — only
		 * the former auto-resumes when the factory resumes.
		 *
		 * Shape: `{"priorState":"running","pausedByKill":true,"at":"<iso>"}`.
		 */
		pauseCheckpoint: text("pause_checkpoint"),
	},
	(table) => [
		index("sessions_task_id_idx").on(table.taskId),
		index("sessions_agent_id_idx").on(table.agentId),
		index("sessions_state_idx").on(table.state),
	],
);

export const routines = sqliteTable("routines", {
	id: text("id").primaryKey(),
	ownerAgentId: text("owner_agent_id")
		.notNull()
		.references(() => agents.id, { onDelete: "restrict" }),
	triggerType: text("trigger_type").notNull(),
	triggerConfig: text("trigger_config"),
	skillId: text("skill_id"),
	doneCondition: text("done_condition"),
	stateKey: text("state_key"),
	delegationAllowed: integer("delegation_allowed").default(0),
	humanReview: integer("human_review").default(0),
	// L1 review N4: brand the autonomy column with `AutonomyLevel` so
	// downstream type checks reject plain `number` confusion.
	autonomyLevel: integer("autonomy_level").$type<AutonomyLevel>(),
	silent: integer("silent").default(0),
	active: integer("active").notNull().default(1),
	lastRunAt: text("last_run_at"),
	nextRunAt: text("next_run_at"),
});

// --- Messaging ---

// @lore L2: `routed_to_actor_id` is nullable. NULL means "either founder
// can act" (per AC13). Both founders retain visibility on every thread —
// reassignment is routing, not ownership transfer. `domain_tag` is
// free-form text; canonical values live in
// `packages/shared/src/constants/domains.ts`.
export const threads = sqliteTable("threads", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	pinned: integer("pinned").default(0),
	participants: text("participants"),
	routedToActorId: text("routed_to_actor_id").references(() => actors.id, {
		onDelete: "restrict",
	}),
	domainTag: text("domain_tag"),
	createdAt: text("created_at").notNull(),
});

// --- Actors (L2) ---

// @lore L2: `domain_tags` is JSON-encoded text (matches `agents.skills`,
// `threads.participants`). A join table is rejected because there are
// at most 2 actors and ≤7 canonical tags; full-table scan is constant
// time and consistent with the rest of the schema.
export const actors = sqliteTable("actors", {
	id: text("id").primaryKey(),
	role: text("role").notNull().$type<ActorRole>(),
	domainTags: text("domain_tags").notNull().default("[]"),
	createdAt: text("created_at").notNull(),
});

// --- Thread routing audit (L2) ---

// @lore L2: `thread_routing_audit` is logically append-only. Never
// UPDATE or DELETE rows from this table — its forensic value depends on
// every change being durable. Same convention as
// `agent_skill_autonomy_audit` (L1 review N3).
export const threadRoutingAudit = sqliteTable(
	"thread_routing_audit",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		// Nullable: a thread that was previously "either founder" (NULL)
		// will record `from_actor_id = NULL` on its first reassignment.
		fromActorId: text("from_actor_id").references(() => actors.id, { onDelete: "restrict" }),
		toActorId: text("to_actor_id").references(() => actors.id, { onDelete: "restrict" }),
		reason: text("reason").notNull(),
		changedBy: text("changed_by").notNull(),
		at: text("at").notNull(),
	},
	(table) => [index("tra_thread_idx").on(table.threadId), index("tra_at_idx").on(table.at)],
);

export const messages = sqliteTable(
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

// --- Items & Responses (human interface contract) ---

export const items = sqliteTable(
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
		blocking: integer("blocking").default(0),
		reasoning: text("reasoning"),
		costEstimate: integer("cost_estimate"),
		auditTrail: text("audit_trail"),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		createdAt: text("created_at").notNull(),
		// @lore L4: Set when the agent runtime consumes a committed verdict.
		// Read by the verdict-undo endpoint to gate the 409 agent_already_acted
		// path. The writer ships in the D-track agent runtime; until then the
		// column stays NULL and the undo path treats NULL as "agent has not
		// acted." See .plan-L4.md §3.1 CONFUSION block.
		agentActedAt: text("agent_acted_at"),
	},
	(table) => [index("items_thread_id_idx").on(table.threadId)],
);

// @lore L4: `responses` is logically append-only — every commit AND every
// undo writes a new row. `transition` is enum 'commit' | 'undo'; an undo
// row's `undoes_response_id` points back to the commit it reverses.
//
// Reading "current verdict state" of an item:
//   SELECT * FROM responses
//    WHERE item_id = ? AND transition = 'commit'
//    ORDER BY responded_at DESC LIMIT 1
// The `transition='commit'` filter is REQUIRED — undo rows have
// `decision IS NULL` (post-L4 review fix) and would otherwise be returned
// as the current state. Likewise the commit-side `prior_decision` lookup
// MUST filter `transition='commit'` so a commit→undo→commit sequence
// records the correct prior verdict (not the undo row's NULL).
//
// Static-codebase regression in `append-only-responses.test.ts` enforces no
// UPDATE/DELETE outside migrations. See .plan-L4.md §3.1.
export const responses = sqliteTable("responses", {
	id: text("id").primaryKey(),
	itemId: text("item_id")
		.notNull()
		.references(() => items.id, { onDelete: "cascade" }),
	// @lore L4 review (arch W2): nullable. Undo rows write `decision=NULL`
	// — they do not represent a verdict; the verdict they reverse lives in
	// `prior_decision` and the original commit row at `undoes_response_id`.
	decision: text("decision"),
	inlineAnchor: text("inline_anchor"),
	edits: text("edits"),
	feedback: text("feedback"),
	approverId: text("approver_id"),
	view: text("view"),
	respondedAt: text("responded_at").notNull(),
	// L4: state-transition stamp on every row. Backfilled 'commit' for
	// pre-L4 rows in the migration.
	transition: text("transition").notNull().default("commit"),
	// The verdict before this transition. NULL on first-ever commit.
	priorDecision: text("prior_decision"),
	// FK to responses.id; set only when transition='undo'.
	undoesResponseId: text("undoes_response_id"),
	// Snapshot of the configured window at commit time; NULL for undo rows.
	undoWindowSeconds: integer("undo_window_seconds"),
});

// --- Agent skills ---

export const agentSkills = sqliteTable(
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
		// L1: per-pair audit columns. Default sentinel exists only so the
		// SQLite ALTER TABLE migration can add a NOT NULL column without
		// failing on existing rows; the same migration immediately UPDATEs
		// every row off the sentinel before app code runs.
		updatedAt: text("updated_at").notNull().default("1970-01-01T00:00:00.000Z"),
		updatedBy: text("updated_by"),
	},
	(table) => [primaryKey({ columns: [table.agentId, table.skillId] })],
);

// --- Agent skill autonomy audit (L1) ---

// @lore L1 review N3: `agent_skill_autonomy_audit` is logically
// append-only. Never UPDATE or DELETE rows from this table — its forensic
// value depends on every change being durable. A static-codebase
// regression test in `autonomy-service.test.ts` greps the server source
// for `update(agentSkillAutonomyAudit)` / `delete(agentSkillAutonomyAudit)`
// to pin the invariant.
//
// @lore L1 review B3: `skill_id` deliberately has no FK in this story —
// no `skills` table exists yet (future story). Boundary validation lives
// in `routes/agents.ts` (regex + length cap) and is regression-tested
// there. When the skills catalog lands, add a FK in a dedicated migration.
export const agentSkillAutonomyAudit = sqliteTable(
	"agent_skill_autonomy_audit",
	{
		id: text("id").primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "restrict" }),
		skillId: text("skill_id").notNull(),
		// `from_level` nullable so the first-set audit row (no prior row)
		// can record `null → toLevel`.
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

export const factorySettings = sqliteTable("factory_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// --- Recovery audit (L7) ---

// @lore L7: `recovery_audit` is logically append-only. Never UPDATE or
// DELETE rows from this table — its forensic value depends on every
// kill / resume / rollback / session-pause being durable. Mirrors the
// L1 (`agent_skill_autonomy_audit`) and L2 (`thread_routing_audit`)
// append-only conventions.
export const recoveryAudit = sqliteTable(
	"recovery_audit",
	{
		id: text("id").primaryKey(),
		actorId: text("actor_id")
			.notNull()
			.references(() => actors.id, { onDelete: "restrict" }),
		verb: text("verb").$type<RecoveryVerb>().notNull(),
		reason: text("reason").notNull(),
		targetKind: text("target_kind").$type<RecoveryTargetKind>().notNull(),
		targetId: text("target_id").notNull(),
		at: text("at").notNull(),
		outcome: text("outcome").$type<RecoveryOutcome>().notNull(),
		meta: text("meta"),
	},
	(table) => [
		index("recovery_audit_actor_idx").on(table.actorId),
		index("recovery_audit_target_idx").on(table.targetKind, table.targetId),
		index("recovery_audit_at_desc_idx").on(table.at),
	],
);

// --- Factory state (L7 singleton) ---

// @lore L7: singleton row keyed by `id='factory'`. The PRIMARY KEY
// enforces the singleton invariant — a duplicate insert raises a
// PRIMARY KEY constraint violation. Read by `factory-paused-guard`
// middleware on every mutation, and by `GET /api/factory/state`.
export const factoryState = sqliteTable("factory_state", {
	id: text("id").primaryKey(),
	paused: integer("paused", { mode: "boolean" }).notNull().default(false),
	pausedBy: text("paused_by"),
	pausedAt: text("paused_at"),
	pausedReason: text("paused_reason"),
});

// --- Knowledge ---

export const knowledgeItems = sqliteTable(
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

export const knowledgeEditLog = sqliteTable("knowledge_edit_log", {
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

export const knowledgeConflicts = sqliteTable("knowledge_conflicts", {
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

export const notificationQueue = sqliteTable(
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

export const fileLeases = sqliteTable("file_leases", {
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

export type ActorRow = typeof actors.$inferSelect;
export type NewActorRow = typeof actors.$inferInsert;

export type ThreadRoutingAuditEntry = typeof threadRoutingAudit.$inferSelect;
export type NewThreadRoutingAuditEntry = typeof threadRoutingAudit.$inferInsert;

export type RecoveryAuditEntry = typeof recoveryAudit.$inferSelect;
export type NewRecoveryAuditEntry = typeof recoveryAudit.$inferInsert;

export type FactoryStateRow = typeof factoryState.$inferSelect;
export type NewFactoryStateRow = typeof factoryState.$inferInsert;
