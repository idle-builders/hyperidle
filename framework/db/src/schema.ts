import type { PluginState, StoredPluginContributionKind } from "@hyperidle/domain-model";
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

export const teams = pgTable("teams", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: text("created_at").notNull(),
});

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	/** "human" | "ai" */
	kind: text("kind").notNull().default("ai"),
	name: text("name").notNull(),
	role: text("role").notNull(),
	status: text("status").notNull(),
	/** Null for AI users. */
	avatarUrl: text("avatar_url"),
	createdAt: text("created_at").notNull(),
	/** Agent category — team | individual. Null for human users and system users. */
	agentCategory: text("agent_category"),
	/** The person an agent works for. Null for a person and for an agent no one owns. */
	ownerUserId: text("owner_user_id").references((): AnyPgColumn => users.id, {
		onDelete: "set null",
	}),
	health: text("health"),
	// @lore: discipline — an open craft string on a human or agent, matched case-insensitively; it clusters a context bundle, never gates access (`role` does).
	discipline: text("discipline"),
});

/**
 * Which teams a user is in. A person may be in several; an agent in exactly
 * one, and an owned agent's team is one of its owner's (`edit_user` keeps
 * both rules). A team is a name only — see `teams`.
 */
export const userTeams = pgTable(
	"user_teams",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.teamId] }),
		index("user_teams_team_idx").on(table.teamId),
	],
);

/**
 * One agent's run configuration, keyed on its `users` row.
 *
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
	 * Nullable with no default — reads as `{}` when not set. Sparse by design — only a value the user moved away from the
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
		 * The task tree. NULL means a root task.
		 * Self-FK needs the explicit `AnyPgColumn` return type or TypeScript cannot infer the circular reference.
		 * ON DELETE RESTRICT — killing a subtree is a domain operation with an audit trail, never a silent row disappearance.
		 */
		parentTaskId: text("parent_task_id").references((): AnyPgColumn => tasks.id, {
			onDelete: "restrict",
		}),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "restrict" }),
		ownerAgentId: text("owner_agent_id").references(() => users.id, { onDelete: "restrict" }),
		title: text("title").notNull(),
		description: text("description"),
		/** JSON array of DoneWhenLine objects. */
		doneWhen: text("done_when").notNull().default("[]"),
		state: text("state").notNull(),
		dependencies: text("dependencies"),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "restrict" }),
		notes: text("notes"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		/** Task outcome verdict. Closed enum: met|met_with_rework|partially_met|not_met. Null = not evaluated. */
		outcomeVerdict: text("outcome_verdict"),
		/** Free-text explanation of the task outcome. */
		outcomeSummary: text("outcome_summary"),
		/** ISO 8601 timestamp when the task outcome was last recorded. */
		outcomeRecordedAt: text("outcome_recorded_at"),
		/** User ID of the actor who last recorded the task outcome. */
		outcomeRecordedBy: text("outcome_recorded_by"),
		/**
		 * Accumulated TokenUsage actuals for THIS task's own sessions.
		 * Ancestors are never written — a subtree total is summed at read time, so there is no rollup column to drift.
		 */
		tokensActualJson: text("tokens_actual_json"),
		/** Provenance — the document this task was promoted from. RESTRICT so provenance outlives a convenience delete. */
		sourceDocumentId: text("source_document_id").references(() => documents.id, {
			onDelete: "restrict",
		}),
		/** Set when the task reaches `done`. */
		completedAt: text("completed_at"),
		/**
		 * Display order among siblings. Defaults to creation order; ties break on `createdAt` then `id`.
		 *
		 */
		position: integer("position").notNull().default(0),
		/** JSON array of Reason objects (decisions and assumptions). */
		reasons: text("reasons").notNull().default("[]"),
		/** A person paused it, and every part not done with it: "hold" or "stopped". The state stays as it was. */
		paused: text("paused"),
	},
	(table) => [
		check("tasks_paused_ck", sql`${table.paused} IS NULL OR ${table.paused} IN ('hold','stopped')`),
		index("tasks_parent_task_id_idx").on(table.parentTaskId),
		index("tasks_team_id_idx").on(table.teamId),
		// no index on state — too few distinct values to be selective
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		/**
		 * Nullable because assistant/subscription/knowledge/decomposition runs are
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
		sandboxSnapshot: text("sandbox_snapshot"),
		outcome: text("outcome"),
		notes: text("notes"),
		// Harness-assigned id for this session; null means the session cannot be resumed.
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
		// running requires a session; claimed requires the token+expiry pair; closed statuses forbid a live claim; pending is named explicitly (not a fallthrough)
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

// @lore: agentWorkIntents — durable handoff; EventBus is a latency hint only; process death between a domain commit and an in-memory emit must not lose work
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
			sql`${table.kind} in ('thread_turn','task_run','session_resume','subscription_run')`,
		),
		check(
			"agent_work_intents_source_kind_ck",
			sql`${table.sourceKind} in ('thread_message','task_dispatch_attempt','review_verdict','subscription')`,
		),
		check(
			"agent_work_intents_status_ck",
			// `superseded` — a re-emit for the same (kind, sourceId) with a fresher idempotencyKey wins; older intent is retired as superseded (never dispatched), not failed (it was not an error)
			sql`${table.status} in ('pending','claimed','handed_off','failed','superseded')`,
		),
		// kind/source compatibility is a closed pairing map
		check(
			"agent_work_intents_kind_source_compat_ck",
			sql`
				(${table.kind} = 'thread_turn' and ${table.sourceKind} = 'thread_message')
				or (${table.kind} = 'task_run' and ${table.sourceKind} = 'task_dispatch_attempt')
				or (${table.kind} = 'session_resume' and ${table.sourceKind} = 'review_verdict')
				or (${table.kind} = 'subscription_run' and ${table.sourceKind} = 'subscription')
			`,
		),
		// One closed per-status correlation check: pending forbids claim fields; claimed requires token+expiry; handed_off requires request_id; failed requires last_error_code
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

// @lore: taskDispatchAttempts — task ID alone can't identify retries or handoffs; each dispatch is durable so replay reuses it without suppressing later attempts
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
			sql`${table.occasion} in ('accepted','retry','owner_handoff','restart')`,
		),
		check(
			"task_dispatch_attempts_status_ck",
			sql`${table.status} in ('requested','running','completed','failed','cancelled')`,
		),
	],
);

/**
 * the event log the action mechanism writes to, once per touched
 * object, in the same transaction as the write. Not an audit control and
 * adds no gate — the source for subscriptions and the UI stream. `before`/`after` hold only the fields that
 * differ (plus `id`), not the whole row.
 */
export const changes = pgTable(
	"changes",
	{
		id: text("id").primaryKey(),
		object: text("object").notNull(),
		objectId: text("object_id").notNull(),
		kind: text("kind").notNull(),
		actor: text("actor")
			.notNull()
			.references(() => users.id, { onDelete: "restrict" }),
		before: text("before"),
		after: text("after").notNull(),
		at: text("at").notNull(),
	},
	(table) => [
		index("changes_object_idx").on(table.object, table.objectId, table.at),
		index("changes_at_idx").on(table.at),
		check("changes_object_ck", sql`${table.object} in ('task','thread','document','user')`),
		// `message` is its own kind of change — a post is not a rename, and `objectId` stays the THREAD id (never a message id), so a thread's history reads with one `listChanges({object:'thread', objectId})`
		check("changes_kind_ck", sql`${table.kind} in ('created','changed','message')`),
	],
);

// --- Messaging (Thread primitive) ---

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
		 * Dedup key for direct (2-participant) threads only.
		 * Format: `${hostKind}:${hostId}:${sortedParticipants.join(",")}`
		 * NULL for group/feed/host-scoped threads — they are never deduped.
		 * The partial unique index (WHERE direct_key IS NOT NULL) enforces
		 * one row per direct identity under concurrency.
		 *
		 * directKey is nullable and not backfilled; existing duplicate threads are not merged.
		 * The assistant thread (host=user, hostId===senderId, participant=ast-<userId>) is exempt (directKey=null).
		 */
		directKey: text("direct_key"),
		/**
		 * The stored title; `null` means "use the computed ladder's answer".
		 */
		title: text("title"),
		/** Soft delete. Hidden from search/open; never `DELETE`d. */
		deletedAt: text("deleted_at"),
	},
	(table) => [
		index("threads_host_idx").on(table.hostKind, table.hostId, table.lastActiveAt),
		index("threads_initiator_idx").on(table.initiatorId, table.lastActiveAt),
		// Partial unique index — only for direct (DM) threads.
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
	},
	(table) => [
		index("messages_thread_id_idx").on(table.threadId, table.createdAt),
		uniqueIndex("messages_idempotency_uq").on(table.threadId, table.senderId, table.clientKey),
		index("messages_unresolved_idx").on(table.threadId, table.resolvedAt),
	],
);

// --- Org chart edges ---

/**
 * OrgChart edges: defines review-routing relationships between human users and
 * AI users / roles / teams.
 *
 * @lore: mechanism — open vocabulary like `users.discipline`; an edge keyed on a stale value breaks, the accepted cost of free text.
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

// --- Subscriptions and inbox ---

export const subscriptions = pgTable(
	"subscriptions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		event: text("event"),
		/** The one task, thread or document this follows; null hears the event about anything it reaches. */
		objectId: text("object_id"),
		schedule: text("schedule"),
		paused: boolean("paused").notNull().default(false),
		nextRunAt: text("next_run_at"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("subscriptions_user_idx").on(table.userId),
		index("subscriptions_event_idx").on(table.event).where(sql`${table.event} IS NOT NULL`),
		check("subscriptions_trigger_ck", sql`(${table.event} IS NULL) <> (${table.schedule} IS NULL)`),
		check("subscriptions_object_ck", sql`${table.objectId} IS NULL OR ${table.event} IS NOT NULL`),
		check(
			"subscriptions_event_ck",
			sql`${table.event} IS NULL OR ${table.event} IN (
				'task.created', 'task.changed',
				'thread.created', 'thread.message', 'thread.changed',
				'document.created', 'document.changed',
				'user.created', 'user.changed'
			)`,
		),
		check(
			"subscriptions_next_run_ck",
			sql`${table.nextRunAt} IS NULL OR ${table.schedule} IS NOT NULL`,
		),
	],
);

export const inbox = pgTable(
	"inbox",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		changeId: text("change_id")
			.notNull()
			.references(() => changes.id, { onDelete: "cascade" }),
		seenAt: text("seen_at"),
		readAt: text("read_at"),
	},
	(table) => [primaryKey({ columns: [table.userId, table.changeId] })],
);

// --- Documents ---

// Four real usage columns (readCount, lastReadAt, sessionUseCount, lastUsedAt) are never written by edit_document and never in a changes row.
export const documents = pgTable(
	"documents",
	{
		id: text("id").primaryKey(),
		// scope_kind + scope_id: every document knows where it belongs; default "factory" preserves existing rows
		scopeKind: text("scope_kind").notNull().default("factory"),
		scopeId: text("scope_id"),
		title: text("title").notNull(),
		body: text("body").notNull(),
		format: text("format").notNull(),
		status: text("status").notNull(),
		version: integer("version").notNull().default(1),
		/**
		 * Determines where context assembly materialises this document in the session sandbox.
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
		slot: text("slot").notNull().default("ordinary"),
		parentKind: text("parent_kind"),
		parentId: text("parent_id"),
		position: integer("position").notNull().default(0),
		/** Ranking signal, read only by `session-documents.ts`. */
		confidence: text("confidence"),
		/** `{tags:[…]}` — read only by `session-documents.ts`'s tag match. */
		meta: text("meta"),
		// Usage counters. Never written by `edit_document`, never in a `changes` row.
		readCount: integer("read_count").notNull().default(0),
		lastReadAt: text("last_read_at"),
		sessionUseCount: integer("session_use_count").notNull().default(0),
		lastUsedAt: text("last_used_at"),
		updatedBy: text("updated_by").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		// @lore: discipline — who a document is for; clusters a context bundle only, never hides it in the document view. `agent_file` never carries one.
		discipline: text("discipline"),
		/** One emoji, shown in the tree and before the title. */
		icon: text("icon"),
	},
	(table) => [
		index("doc_scope_idx").on(table.scopeKind, table.scopeId),
		index("doc_status_idx").on(table.status),
		index("doc_updated_desc_idx").on(table.updatedAt),
		index("doc_slot_idx").on(table.slot),
		check(
			"doc_slot_ck",
			sql`${table.slot} IN ('ordinary', 'skill', 'rule', 'agent_file', 'prompt')`,
		),
		index("doc_parent_idx").on(table.parentKind, table.parentId),
		// The ordered-children read: every ordinary child of one parent, by
		// position. Non-partial (unlike doc_parent_slot_uq below) — the tree
		// read walks ordinary children just as often as it resolves a named slot.
		index("doc_parent_position_idx").on(table.parentKind, table.parentId, table.position),
		// One document per named slot per parent — a subscription's prompt, an
		// agent's identity. `slot <> 'ordinary'` leaves a parent free to hold
		// many ordinary children (the nested-document tree), and Postgres
		// treats NULLs as distinct by default, so unparented rows never collide.
		uniqueIndex("doc_parent_slot_uq")
			.on(table.parentKind, table.parentId, table.slot)
			.where(sql`${table.slot} <> 'ordinary'`),
		// The decay search: `unusedSince` + `sort:"least_used"` both lead with this.
		index("doc_last_used_idx").on(table.lastUsedAt),
		check(
			"doc_parent_kind_ck",
			sql`${table.parentKind} IS NULL OR ${table.parentKind} IN ('document', 'task', 'thread', 'agent', 'subscription')`,
		),
		check(
			"doc_parent_pair_ck",
			sql`(${table.parentKind} IS NULL AND ${table.parentId} IS NULL) OR (${table.parentKind} IS NOT NULL AND ${table.parentId} IS NOT NULL)`,
		),
		// `SCOPES_REQUIRING_ID` (`@hyperidle/domain-model`) is exactly {team};
		// `user` legitimately carries a scope_id too (the bound agent's id), but
		// `factory` never does. Made unrepresentable, not just true today —
		// migration 0080 broke this silently for months by rewriting scope_kind
		// to 'factory' on every practice row without clearing scope_id, and the
		// factory fetch (`scope_kind='factory' AND scope_id IS NULL`) skipped
		// every one of them.
		check(
			"doc_factory_scope_id_ck",
			sql`${table.scopeKind} <> 'factory' OR ${table.scopeId} IS NULL`,
		),
		// @lore: doc_agent_file_parent_ck — `parent_kind = 'agent'` alone passes a NULL row under three-valued logic; the explicit `IS NOT NULL` forces it to FALSE.
		check(
			"doc_agent_file_parent_ck",
			sql`${table.slot} <> 'agent_file' OR (${table.parentKind} IS NOT NULL AND ${table.parentKind} = 'agent')`,
		),
	],
);

// Produced content ("artifacts") is a document whose parent is the task or the
// conversation that produced it — no separate artifact table.

// --- Filesystem registry + per-bot injection ---

/**
 * Registered, team-scoped file source. NOT owned by a single agent.
 * Per-bot wiring lives in the filesystemInjections mapping below.
 *
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
		// NOT a DB FK — plain text by design; connection service is separate and may add the FK in its own migration; an unresolvable id → needs_attention
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
 * @lore: filesystemInjections — agent FK is users.id (runtime = sessions.agentId); mount resolves sessions.agentId → filesystem_injections → filesystems
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
// The wire types `Filesystem`/`FilesystemInjection` (parsed) live in @hyperidle/domain-model.

// --- Server config ---

// --- Plugins: one row per install, and what each install contributed ---

export const plugins = pgTable(
	"plugins",
	{
		/**
		 * The install id: one row per install, so two teams each hold their
		 * own install of one plugin. The manifest name for a factory install,
		 * `<name>@<teamId>` for a team install (a manifest name never contains
		 * `@`). Child rows follow a renamed id by `ON UPDATE CASCADE`.
		 */
		id: text("id").primaryKey(),
		/** The manifest name; unique per scope and team (`plugins_name_scope_uq`). */
		name: text("name").notNull(),
		version: text("version").notNull(),
		state: text("state").$type<PluginState>().notNull(),
		scopeKind: text("scope_kind").$type<"factory" | "team">().notNull().default("factory"),
		scopeTeamId: text("scope_team_id"),
		/**
		 * Absolute path to the plugin's persistent install directory.
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
		uniqueIndex("plugins_name_scope_uq").on(table.name, table.scopeKind, table.scopeTeamId),
	],
);

/**
 * What a plugin contributed, and whether the person has since taken it over.
 *
 * `detachedAt` set: a person edited this contribution, so a reinstall must not
 * overwrite their version.
 */
export const pluginContributions = pgTable(
	"plugin_contributions",
	{
		id: text("id").primaryKey(),
		pluginId: text("plugin_id")
			.notNull()
			.references(() => plugins.id, { onDelete: "cascade", onUpdate: "cascade" }),
		/** Which table `entityId` points into. */
		kind: text("kind").$type<StoredPluginContributionKind>().notNull(),
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
		// Matches stored kinds only; mcp_server is synthesised from mcp.json, never persisted.
		check(
			"plugin_contributions_kind_ck",
			sql`${table.kind} IN ('agent', 'subscription', 'document')`,
		),
	],
);

// --- Inferred types ---

export type Team = typeof teams.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type InboxRow = typeof inbox.$inferSelect;
export type NewInboxRow = typeof inbox.$inferInsert;

// `AgentRunConfigRow` is the raw table row (carries `agentUserId`); `@hyperidle/agent-run-config`'s `AgentRunConfig` is the keyless value object callers actually consume.
export type NewAgentRunConfigRow = typeof agentRunConfig.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Change = typeof changes.$inferSelect;
export type NewChange = typeof changes.$inferInsert;

export type Session = typeof sessions.$inferSelect;

export type AgentSessionRequest = typeof agentSessionRequests.$inferSelect;
export type AgentWorkIntent = typeof agentWorkIntents.$inferSelect;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type DocumentRow = typeof documents.$inferSelect;

export type PluginRow = typeof plugins.$inferSelect;

// --- Service connections (per-user external tool connections) ---

/**
 * Per-(user × service × authSource) connection record.
 *
 * Stores ONLY held connections (token | mcp). Inherited connections are
 * projected live from the harness descriptor and NEVER written here.
 *
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
 * The reviews a gate actually caused.
 *
 * A row is written only when an agent files a review while the gate is holding
 * a denial against its session. Approving that review clears the denied action,
 * once; approving any other review clears nothing.
 *
 * @lore: reviewSessions — review-to-gate-denial link prevents forged clearances; toolName keys the clearance to the action, not "the next tool call"
 */
export const reviewSessions = pgTable(
	"review_sessions",
	{
		id: text("id").primaryKey(),
		/** The `messages` row of type "review" that the agent filed. */
		reviewMessageId: text("review_message_id").notNull(),
		/** The session the gate denied, and the one a verdict resumes. */
		sessionId: text("session_id").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("review_sessions_review_message_id_uq").on(table.reviewMessageId),
		index("review_sessions_session_id_idx").on(table.sessionId),
	],
);

export type ReviewSessionRow = typeof reviewSessions.$inferSelect;
export type NewReviewSessionRow = typeof reviewSessions.$inferInsert;
