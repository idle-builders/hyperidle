import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Run tables (no FK to server tables: users/tasks/teams/threads live on the server) ---

/**
 * Active and completed agent sessions. Owned by run-orchestration.
 * Plain-text ids — no FK to server tables.
 */
export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		taskId: text("task_id"),
		requestId: text("request_id"),
		sourceKind: text("source_kind"),
		sourceId: text("source_id"),
		sourceCorrelationJson: text("source_correlation_json"),
		agentId: text("agent_id").notNull(),
		modelTier: text("model_tier").notNull(),
		startedAt: text("started_at").notNull(),
		endedAt: text("ended_at"),
		state: text("state").notNull(),
		sandboxSnapshot: text("sandbox_snapshot"),
		outcome: text("outcome"),
		notes: text("notes"),
		harnessSessionId: text("harness_session_id"),
	},
	(table) => [
		index("sessions_task_id_idx").on(table.taskId),
		uniqueIndex("sessions_request_id_uq").on(table.requestId),
		index("sessions_source_idx").on(table.sourceKind, table.sourceId),
		index("sessions_agent_id_idx").on(table.agentId),
		index("sessions_state_idx").on(table.state),
	],
);

/**
 * Queued and running agent session requests. Owned by session-requests.
 * Plain-text ids — no FK to server tables.
 */
export const agentSessionRequests = pgTable(
	"agent_session_requests",
	{
		id: text("id").primaryKey(),
		sourceKind: text("source_kind").notNull(),
		sourceId: text("source_id").notNull(),
		streamId: text("stream_id").notNull(),
		taskId: text("task_id"),
		agentId: text("agent_id").notNull(),
		teamId: text("team_id"),
		userId: text("user_id"),
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
 * The reviews a gate actually caused. Owned by run-orchestration.
 * Plain-text ids — no FK to server tables.
 *
 * @lore: reviewSessions — review-to-gate-denial link prevents forged clearances; toolName keys the clearance to the action, not "the next tool call"
 */
export const reviewSessions = pgTable(
	"review_sessions",
	{
		id: text("id").primaryKey(),
		reviewMessageId: text("review_message_id").notNull(),
		sessionId: text("session_id").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("review_sessions_review_message_id_uq").on(table.reviewMessageId),
		index("review_sessions_session_id_idx").on(table.sessionId),
	],
);

/**
 * One agent's run configuration, keyed on the agent's user id.
 * Plain-text agentUserId — no FK to server users table.
 */
export const agentRunConfig = pgTable(
	"agent_run_config",
	{
		agentUserId: text("agent_user_id").primaryKey(),
		harnessType: text("harness_type"),
		modelId: text("model_id"),
		modelProvider: text("model_provider"),
		maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
		modelOptionsJson: text("model_options_json"),
		spacePath: text("space_path"),
		login: text("login").notNull().default("owner"),
	},
	(table) => [check("agent_run_config_login_ck", sql`${table.login} in ('own', 'owner')`)],
);

// --- Connections tables (moved from server DB) ---

/**
 * Per-(user × service × authSource) connection record.
 * Plain-text userId — no FK to server users table.
 */
export const serviceConnections = pgTable(
	"service_connections",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		service: text("service").notNull(),
		authSource: text("auth_source").notNull(),
		encryptedToken: text("encrypted_token"),
		serverUrl: text("server_url"),
		health: text("health").notNull().default("needs-attention"),
		lastValidatedAt: text("last_validated_at"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("service_connections_user_service_source_idx").on(
			t.userId,
			t.service,
			t.authSource,
		),
		index("service_connections_user_idx").on(t.userId),
	],
);

/** A service reaches every agent of its owner; a row here keeps it from one of them. */
export const serviceConnectionWithholds = pgTable(
	"service_connection_withholds",
	{
		connectionId: text("connection_id")
			.notNull()
			.references(() => serviceConnections.id, { onDelete: "cascade" }),
		agentUserId: text("agent_user_id").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.connectionId, t.agentUserId] })],
);

/**
 * The plaintext agent keys this runner holds.
 * The server stores only key_hash; the runner stores the plaintext key
 * so it can reuse it across restarts without calling edit_user{key:"new"} again.
 */
export const agentRunnerKeys = pgTable("agent_runner_keys", {
	agentId: text("agent_id").primaryKey(),
	agentKey: text("agent_key").notNull(),
	/** Set to 1 when the server returns 401, meaning the agent was claimed by another runner. */
	movedAway: integer("moved_away").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// --- Inferred types ---

export type Session = typeof sessions.$inferSelect;

export type AgentSessionRequest = typeof agentSessionRequests.$inferSelect;

export type ReviewSessionRow = typeof reviewSessions.$inferSelect;
export type NewReviewSessionRow = typeof reviewSessions.$inferInsert;

export type NewAgentRunConfigRow = typeof agentRunConfig.$inferInsert;

export type ServiceConnectionRow = typeof serviceConnections.$inferSelect;
export type NewServiceConnectionRow = typeof serviceConnections.$inferInsert;

export type AgentRunnerKey = typeof agentRunnerKeys.$inferSelect;
