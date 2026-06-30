/**
 * AR4a: runAssistantTurn — harness-agnostic conversational turn service.
 *
 * Handles one complete message→reply cycle by delegating to the shared
 * `provisionSession` path in CONVERSATIONAL MODE (the third assembly branch,
 * beside task and routine). This replaces the builtin-only path (AH3) that
 * hardwired harnessType:"builtin" and bypassed the harness machinery.
 *
 * AR4a changes:
 *   - Removed: `setSessionToolRegistry` coupling (builtin-only concrete class method)
 *   - Removed: `sandboxPath:""` no-mode SessionConfig
 *   - Removed: parallel adapter selection + drain logic (now in runSession)
 *   - Added: provisionSession(conversational mode) — real sandbox, MCP bridge, 4 harnesses
 *   - Added: conversationalReply field on result → persisted reply row
 *   - Kept: persistTurnFailure, never-silent, lazy-create, inFlight guard
 *
 * NEVER silent: every branch ends in a persisted reply or a persisted notice.
 *
 * @lore AR4a: The stub `taskId` (sessions.taskId NOT NULL FK) is meaningless in
 * conversational mode — this caller ignores it. Mirror the routine path (@lore AA2).
 *
 * @lore AH3 §1.7: The in-memory inFlight set prevents concurrent stacked turns
 * within one process lifetime. After a crash it is empty → a user-initiated Retry
 * is correctly unblocked. The §1.7b crash-recovery Retry card is computed on the
 * CLIENT from lastMessage.createdAt + ASSISTANT_TURN_TIMEOUT_MS — no DB column needed.
 */

import { bets, type HyperIdleDb, messages, tasks, teams, users } from "@hyperidle/db";
import {
	type ConversationMessage,
	createLogger,
	type EventBus,
	MissingCredentialError,
	NoEligibleHarnessError,
	type PlainPayload,
	ProviderTimeoutError,
	type ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import { asc, eq } from "drizzle-orm";
import type { AdapterPool } from "../harness/adapter-pool.js";
// AH6 WARNING-2: CassetteMissError must be explicitly mapped to provider_error so it
// doesn't trip the "unmapped error class" logger.error on every cassette miss in tests.
// Only imported when LLM_CASSETTE_MODE is set (test lane); production is unaffected.
import { CassetteMissError } from "../harness/llm-cassette.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import {
	BUILT_IN_GATEWAY_CONFIG,
	resolveAgentModel,
	resolveModelTier,
} from "../services/model-gateway.js";
import { readServerConfig } from "../services/server-config.js";
import type { ProvisionSessionDeps } from "../services/session-provisioning.js";
import { provisionSession } from "../services/session-provisioning.js";
import {
	buildAssistantDraftRegistry,
	resolveCurrentDraftBetId,
	resolveDraftTeamId,
} from "../tools/assistant-draft-registry.js";
import type { ToolContext } from "../tools/tool-registry.js";

const logger = createLogger({ pkg: "server.assistant-turn" });

/**
 * Builtin system prompt for new assistant agents.
 * Used when an assistant agent is lazy-created with no existing systemPrompt.
 */
const BUILTIN_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

/**
 * Dependencies for the assistant turn service.
 *
 * @lore AH3: runTurn is a test-injectable override that replaces the full turn
 * logic with a stub. When present, the trigger fires but no real LLM call is made.
 * This satisfies the integration test's need to assert the trigger fires without
 * a real provider. turnTimeoutMs overrides the constant for fast-timeout hung-provider tests.
 *
 * @lore AR4a: mcpBridgeRegistry + mcpBaseUrl are required for CLI harnesses (claude/codex/opencode)
 * to receive the draft tool surface via the MCP bridge. Production callers (assistant-dispatcher.ts)
 * supply these when CLI harnesses are expected. When absent, CLI harnesses run without tool access
 * (no bridge = no MCP tool delivery; builtin still works via the in-process registry).
 *
 * @lore AR4a: sandboxBasePath is the base directory for the conversational turn's sandbox.
 * The shared path provisions a real sandbox (required for CLI harnesses to start).
 * Defaults to os.tmpdir() when absent (production convenience; the sandbox is torn down at
 * the end of the turn regardless).
 */
export interface AssistantTurnDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: AdapterPool;
	readonly credentialResolver?: import("../services/credential-resolver.js").CredentialResolver;
	/** Test-injectable: when present, called INSTEAD of the real turn logic. */
	readonly runTurn?: (params: AssistantTurnParams) => Promise<void>;
	/** Override the turn timeout (ms). Defaults to ASSISTANT_TURN_TIMEOUT_MS. Used in tests. */
	readonly turnTimeoutMs?: number;
	/**
	 * AR4a: MCP bridge registry for CLI harness tool delivery. Absent → no bridge → CLI harnesses
	 * run without tool access (builtin still uses in-process registry).
	 */
	readonly mcpBridgeRegistry?: McpBridgeRegistry;
	/**
	 * AR4a: Base URL for the MCP bridge server (e.g., "http://localhost:3001").
	 * Required when mcpBridgeRegistry is set.
	 */
	readonly mcpBaseUrl?: string;
	/**
	 * AR4a: Base directory for the conversational turn sandbox.
	 * Defaults to os.tmpdir() when absent.
	 */
	readonly sandboxBasePath?: string;
}

export interface AssistantTurnParams {
	/** Human user ID. The assistant agent is derived as `ast-${userId}`. */
	readonly userId: string;
	/** The assistant thread to reply in. */
	readonly threadId: string;
	/** The human message that triggered this turn (for context). */
	readonly triggerMessageId: string;
}

/** Error class → notice kind mapping */
type NoticeKind = "missing_key" | "missing_harness" | "provider_error";

/** In-flight turn guard: prevents concurrent stacked turns within one process lifetime. */
const inFlightTurns = new Set<string>();

/**
 * Map an error to a notice kind and user-facing copy.
 * Never echoes error.message, env var names, or key material.
 *
 * @lore AH3 N3: unmapped causes are console.error'd before defaulting to provider_error
 * so an internal bug (e.g. context-building throw) doesn't masquerade as a provider
 * error and send the founder clicking Retry forever.
 */
function mapErrorToNotice(err: unknown): {
	kind: NoticeKind;
	text: string;
	code?: string;
} {
	if (err instanceof MissingCredentialError) {
		return {
			kind: "missing_key",
			text: "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials.",
		};
	}
	if (err instanceof NoEligibleHarnessError) {
		return {
			kind: "missing_harness",
			text: "My runtime isn't set up. Choose a harness for this assistant in Settings → Agents.",
		};
	}
	if (err instanceof ProviderTimeoutError) {
		// Explicitly mapped — does NOT trip the unmapped-cause console.error
		return {
			kind: "provider_error",
			text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
		};
	}

	if (err instanceof CassetteMissError) {
		// AH6 WARNING-2: Explicitly mapped so cassette misses in the replay lane don't
		// log a spurious "unmapped error class" error. A missing cassette is a test
		// configuration issue (not a production code bug), persisted as provider_error.
		return {
			kind: "provider_error",
			text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
		};
	}

	// N3: unmapped cause — log the raw error for debugging, surface generic copy to user
	logger.error("[assistant-turn] unmapped error class — defaulting to provider_error", {
		errorName: err instanceof Error ? err.name : typeof err,
		errorMessage: err instanceof Error ? err.message : String(err),
	});

	return {
		kind: "provider_error",
		text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
	};
}

/**
 * Persist a turn failure as a notice message on the assistant thread.
 * Maps any error to one of the three notice classes; never leaks secrets.
 *
 * Called both from runAssistantTurn's internal error branches and from the
 * fire-and-forget .catch() in threads.ts.
 */
export async function persistTurnFailure(
	db: HyperIdleDb,
	eventBus: EventBus,
	userId: string,
	threadId: string,
	err: unknown,
): Promise<void> {
	const { kind, text, code } = mapErrorToNotice(err);
	const assistantAgentId = `ast-${userId}`;
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();

	const notice: PlainPayload["notice"] = code ? { kind, code } : { kind };
	const payload: PlainPayload = { text, notice };

	await db.insert(messages).values({
		id: messageId,
		senderId: assistantAgentId,
		threadId,
		type: "plain",
		payload: JSON.stringify(payload),
		clientKey: `ast-notice-${messageId}`,
		createdAt: now,
	});

	const appendedEvent: ThreadMessageAppendedEvent = {
		type: "thread_message_appended",
		streamId: threadId,
		threadId,
		messageId,
		messageType: "plain",
		senderId: assistantAgentId,
		timestamp: Date.now(),
	};
	eventBus.emit(appendedEvent);
}

/**
 * Create an ephemeral conversational stub task to satisfy sessions.taskId NOT NULL FK.
 *
 * sessions.taskId → tasks.betId → bets.teamId must all reference real rows.
 * This mirrors the create-routine.ts AA2 pattern exactly: find any existing bet,
 * fall back to any bet in the DB, fall back to creating a system team+bet.
 *
 * @lore AR4a: Mirrors create-routine.ts AA2 pattern (stubTaskId). The stub task is
 * invisible in task lists (title prefix "conv-stub-" identifies system-generated tasks).
 * The per-turn unique task id prevents session FK collisions across concurrent turns.
 * Finding an existing bet (rather than always creating a system one) avoids polluting
 * the bets table in environments where bets already exist (e.g. test fixtures that
 * assert on bets.length).
 */
async function createConversationalStubTask(
	db: HyperIdleDb,
	opts: {
		taskId: string;
		agentId: string;
		now: string;
	},
): Promise<void> {
	const { taskId, agentId, now } = opts;
	const SYSTEM_TEAM_ID = "conv-stub-team";
	const SYSTEM_BET_ID = "conv-stub-bet";

	// Find any existing bet (same pattern as create-routine.ts:90-92)
	const [anyBet] = await db.select({ id: bets.id, teamId: bets.teamId }).from(bets).limit(1);

	let stubBetId: string;
	let stubTeamId: string;

	if (anyBet) {
		// Reuse an existing bet — the stub task is invisible in task lists so this is safe.
		// @lore AR4a: Reusing an existing bet avoids polluting the bets table (same as routine path).
		stubBetId = anyBet.id;
		stubTeamId = anyBet.teamId;
	} else {
		// No bet exists at all — create a system team + bet (same as create-routine.ts:94-115).
		// @lore AR4a: "conv-stub-team" / "conv-stub-bet" are created once and reused across all
		// conversational turns. They are system rows invisible in team/bet lists.
		const [existingTeam] = await db
			.select({ id: teams.id })
			.from(teams)
			.where(eq(teams.id, SYSTEM_TEAM_ID))
			.limit(1);
		if (!existingTeam) {
			try {
				await db.insert(teams).values({
					id: SYSTEM_TEAM_ID,
					name: "Conversational Sessions (system)",
					phase: "discovery",
					createdAt: now,
				});
			} catch {
				// Concurrent insert race — team was created by another turn, continue
			}
		}

		const [existingBet] = await db
			.select({ id: bets.id })
			.from(bets)
			.where(eq(bets.id, SYSTEM_BET_ID))
			.limit(1);
		if (!existingBet) {
			try {
				await db.insert(bets).values({
					id: SYSTEM_BET_ID,
					teamId: SYSTEM_TEAM_ID,
					description: "Conversational Sessions (system)",
					status: "active",
					createdAt: now,
				});
			} catch {
				// Concurrent insert race — bet was created by another turn, continue
			}
		}

		stubBetId = SYSTEM_BET_ID;
		stubTeamId = SYSTEM_TEAM_ID;
	}

	// Insert the per-turn stub task (unique task id per turn)
	await db.insert(tasks).values({
		id: taskId,
		betId: stubBetId,
		teamId: stubTeamId,
		title: "Conversational turn (stub)",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * Run one assistant conversational turn.
 *
 * Resolves without throwing — all errors are mapped to persisted notices.
 * Never returns silently (every branch emits thread_message_appended).
 *
 * @lore AH3 §1.5: Called fire-and-forget from threads.ts POST messages handler.
 * `void runAssistantTurn(deps, params).catch(e => persistTurnFailure(..., e))`
 * The .catch covers the case where runAssistantTurn itself throws before persisting.
 */
export async function runAssistantTurn(
	deps: AssistantTurnDeps,
	params: AssistantTurnParams,
): Promise<void> {
	const { db, eventBus, adapterPool } = deps;
	const { userId, threadId } = params;

	// Re-entrancy guard: skip if a turn is already in-flight for this thread
	const inFlightKey = `${userId}:${threadId}`;
	if (inFlightTurns.has(inFlightKey)) {
		logger.warn("[assistant-turn] skipped: turn already in-flight", { userId, threadId });
		return;
	}

	// Test-injectable override: skip the real LLM path
	if (deps.runTurn) {
		await deps.runTurn(params);
		return;
	}

	inFlightTurns.add(inFlightKey);
	try {
		await runTurnInternal(
			db,
			eventBus,
			adapterPool,
			userId,
			threadId,
			params.triggerMessageId,
			deps,
		);
	} finally {
		inFlightTurns.delete(inFlightKey);
	}
}

async function runTurnInternal(
	db: HyperIdleDb,
	eventBus: EventBus,
	adapterPool: AdapterPool,
	userId: string,
	threadId: string,
	_triggerMessageId: string,
	deps: AssistantTurnDeps,
): Promise<void> {
	const assistantAgentId = `ast-${userId}`;

	// --- Step 1: Load or lazy-create the assistant agent ---
	let [agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);

	if (!agentRow) {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: assistantAgentId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
			systemPrompt: BUILTIN_SYSTEM_PROMPT,
			maxConcurrentSessions: 1,
			createdAt: now,
		});
		[agentRow] = await db.select().from(users).where(eq(users.id, assistantAgentId)).limit(1);
	}

	if (!agentRow) {
		await persistTurnFailure(
			db,
			eventBus,
			userId,
			threadId,
			new Error("Failed to load assistant agent"),
		);
		return;
	}

	// --- Step 2: Resolve model + credential ---
	// @lore AH3 H1: resolveAgentModel MUST be called. The builtin adapter throws
	// "resolvedModel is required" when it is missing.
	// @lore AH3 M3: CredentialResolver.resolve() returns null (not throw) for missing
	// keys. resolveAgentModel throws MissingCredentialError when resolve() returns null.
	let resolvedModel: import("@hyperidle/shared").ResolvedModel | undefined;
	let resolvedFastModel: import("@hyperidle/shared").ResolvedModel | undefined;

	if (deps.credentialResolver) {
		try {
			const serverCfg = await readServerConfig(db);
			resolvedModel = await resolveAgentModel(
				{ modelId: agentRow.modelId ?? null, modelProvider: agentRow.modelProvider ?? null },
				"workhorse",
				serverCfg.modelGateway,
				deps.credentialResolver,
			);
			// Non-fatal: fast tier failure is graceful (builtin falls back to primary)
			try {
				resolvedFastModel = await resolveModelTier(
					"fast",
					serverCfg.modelGateway,
					deps.credentialResolver,
				);
			} catch {
				// fast tier optional — builtin harness will use resolvedModel
			}
		} catch (err) {
			if (err instanceof MissingCredentialError) {
				await persistTurnFailure(db, eventBus, userId, threadId, err);
				return;
			}
			throw err;
		}
	} else {
		// No resolver: attempt to use env-based ANTHROPIC_API_KEY directly.
		// This path only exists in test environments and local-no-DB mode.
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			await persistTurnFailure(
				db,
				eventBus,
				userId,
				threadId,
				new MissingCredentialError("anthropic_api_key (required; not in env)"),
			);
			return;
		}
		resolvedModel = {
			provider: "anthropic",
			model: agentRow.modelId ?? BUILT_IN_GATEWAY_CONFIG.workhorse.model,
			apiKey,
			baseUrl: "https://api.anthropic.com",
		};
	}

	// --- Step 3: Build conversational context from thread transcript ---
	// @lore AH3 H3: Load the thread's plain messages in chronological order.
	// The triggering user message was just inserted before runAssistantTurn was called.
	const transcriptRows = await loadRawTranscript(db, threadId);
	const conversationMessages = mapTranscriptToMessages(transcriptRows, assistantAgentId);

	// --- Step 4: Resolve draft tool binding ---
	// @lore AK4: resolve team + draft binding BEFORE the session. Both are cheap single-row DB lookups.
	// @lore AR4a §3b seam: buildAssistantDraftRegistry is the provisional source here (AR4b reroutes
	// this one call site to the strategy formation answer).
	const resolvedTeamId = await resolveDraftTeamId(db, userId);
	const currentDraftBetId = await resolveCurrentDraftBetId(db, transcriptRows, assistantAgentId);

	// Synthetic tool context for building the draft registry — sessionId/taskId/sandboxPath
	// are placeholders (the shared path provisions real values; the draft registry only needs
	// db/eventBus/agentId for its handlers).
	const syntheticSessionId = crypto.randomUUID();
	const toolCtx: ToolContext = {
		db,
		eventBus,
		agentId: assistantAgentId,
		sessionId: syntheticSessionId,
		taskId: "", // placeholder — shared path creates real task via stub
		sandboxPath: "", // placeholder — shared path creates real sandbox
		ingestion: { dispose: () => {} }, // no-op — bet tools don't use ingestion
	};

	// @lore AK4 CRITICAL-2: NEVER inject buildToolRegistry(ctx,{role:'assistant'}) here —
	// the dedicated 2-tool builder is the authority boundary (AC3b).
	const draftRegistry = buildAssistantDraftRegistry(toolCtx, {
		resolvedTeamId,
		currentDraftBetId,
	});

	// --- Step 5: Delegate to provisionSession (conversational mode) ---
	//
	// AR4a: This is the key change — replace the builtin-only parallel path with a
	// real provisionSession run. The conversational mode:
	//   - Provisions a real sandbox (CLI harnesses need cwd + .mcp.json)
	//   - Builds the MCP bridge (CLI harnesses receive tools via MCP)
	//   - Assembles the transcript into AGENTS.md (every harness reads it)
	//   - Returns the reply via conversationalReply on the result
	//
	// The stub taskId ("conv-stub-<time>") satisfies the sessions.taskId NOT NULL FK.
	// This caller ignores the result's taskId (AR4a @lore stub-taskId).
	//
	// @lore AR4a: Coupling #1 (setSessionToolRegistry on BuiltinHarnessAdapter) is
	// removed — the shared path's Phase 8.5a does this for the builtin lane.
	// Coupling #2 (config.messages builtin branch) is preserved in sessionStartConfig
	// via params.conversational.messages (NIT-4: load-bearing for builtin correctness).
	// Coupling #3 (sandboxPath:"" no-mode) is removed — the shared path provides a real sandbox.

	const sandboxBasePath = deps.sandboxBasePath ?? (await import("node:os")).default.tmpdir();

	const convStubTaskId = `conv-stub-task-${crypto.randomUUID()}`;
	const now = new Date().toISOString();

	// Create an ephemeral stub task to satisfy the sessions.taskId NOT NULL FK.
	// sessions.taskId → tasks.betId → bets.teamId must all reference real rows.
	// @lore AR4a: Mirrors the routine stub-task pattern (create-routine.ts, AA2 lore).
	// createConversationalStubTask reuses any existing bet (avoiding bets table pollution).
	await createConversationalStubTask(db, {
		taskId: convStubTaskId,
		agentId: assistantAgentId,
		now,
	});

	const CONV_STUB_TASK_ID = convStubTaskId;
	// productId is used as teamId in session row — use a sentinel since conversational
	// turns are not team-scoped. The stub task's teamId (from createConversationalStubTask)
	// is the actual FK target; productId is metadata only.
	const CONV_STUB_PRODUCT_ID = "conv-stub-product";

	const sessionDeps: ProvisionSessionDeps = {
		db,
		eventBus,
		adapterPool,
		workspace: new LocalSandboxAdapter(),
		...(deps.mcpBridgeRegistry ? { mcpBridgeRegistry: deps.mcpBridgeRegistry } : {}),
		...(deps.mcpBaseUrl ? { mcpBaseUrl: deps.mcpBaseUrl } : {}),
	};

	try {
		const result = await provisionSession(sessionDeps, {
			taskId: CONV_STUB_TASK_ID,
			agentId: assistantAgentId,
			productId: CONV_STUB_PRODUCT_ID,
			sandboxBasePath,
			resolvedModel,
			resolvedFastModel,
			conversational: {
				threadId,
				assistantAgentId,
				draftRegistry,
				messages: conversationMessages,
			},
		});

		// Map result to persisted reply or notice
		if (result.outcome === "completed" && result.conversationalReply !== undefined) {
			// Normal completion — persist the reply
			const replyText = result.conversationalReply;
			const messageId = crypto.randomUUID();
			const now = new Date().toISOString();
			// @lore AR4a: persist toolCalls on the reply message so resolveCurrentDraftBetId
			// can rebind the draft betId on subsequent turns (transcript-based binding, AK4 §C).
			// ToolCallSummary and CapturedToolCall are structurally identical; map directly.
			const replyPayload: PlainPayload = {
				text: replyText,
				...(result.conversationalToolCalls && result.conversationalToolCalls.length > 0
					? {
							toolCalls: result.conversationalToolCalls.map((tc) => ({
								name: tc.name,
								input: tc.input,
								output: tc.output,
								status: tc.status,
							})),
						}
					: {}),
			};
			await db.insert(messages).values({
				id: messageId,
				senderId: assistantAgentId,
				threadId,
				type: "plain",
				payload: JSON.stringify(replyPayload),
				clientKey: `ast-reply-${messageId}`,
				createdAt: now,
			});
			const appendedEvent: ThreadMessageAppendedEvent = {
				type: "thread_message_appended",
				streamId: threadId,
				threadId,
				messageId,
				messageType: "plain",
				senderId: assistantAgentId,
				timestamp: Date.now(),
			};
			eventBus.emit(appendedEvent);
		} else if (result.outcome === "completed" && !result.conversationalReply) {
			// Completed but no reply captured (empty response from model) — treat as provider_error
			await persistTurnFailure(
				db,
				eventBus,
				userId,
				threadId,
				new ProviderTimeoutError(), // best-fit notice class for empty/missing reply
			);
		} else {
			// crashed / budget_exhausted / not_returned — map to notice
			await persistTurnFailure(
				db,
				eventBus,
				userId,
				threadId,
				new Error(`Conversational turn ended with outcome: ${result.outcome}`),
			);
		}
	} catch (err) {
		await persistTurnFailure(db, eventBus, userId, threadId, err);
	}
}

// ---------------------------------------------------------------------------
// Thread transcript loader
// ---------------------------------------------------------------------------

/**
 * Load the raw thread rows for this thread, ordered chronologically.
 * Used both for transcript → ConversationMessage mapping AND for draft binding
 * (resolveCurrentDraftBetId needs senderId + payload).
 *
 * @lore AK4: Split from mapTranscriptToMessages so both uses (conversation seed
 * and draft-betId binding) share one DB query instead of two sequential queries.
 */
async function loadRawTranscript(
	db: HyperIdleDb,
	threadId: string,
): Promise<Array<{ senderId: string; payload: string; type: string }>> {
	try {
		return await db
			.select({
				senderId: messages.senderId,
				payload: messages.payload,
				type: messages.type,
			})
			.from(messages)
			.where(eq(messages.threadId, threadId))
			.orderBy(asc(messages.createdAt));
	} catch (err) {
		logger.error("[assistant-turn] loadRawTranscript failed — proceeding with empty history", {
			threadId,
			error: err instanceof Error ? err.message : String(err),
		});
		return [];
	}
}

/**
 * Map raw transcript rows to ConversationMessage[{role, content}].
 * Skips notice messages and non-text content.
 *
 * @lore AH3 H3: Called from runTurnInternal to deliver the thread transcript
 * to the adapter via SessionConfig.messages. Without this, the adapter starts
 * with messages:[] and answers PLANNING_PROMPT, never the user's question.
 */
function mapTranscriptToMessages(
	rows: ReadonlyArray<{ senderId: string; payload: string; type: string }>,
	assistantAgentId: string,
): ConversationMessage[] {
	const result: ConversationMessage[] = [];
	for (const row of rows) {
		if (row.type !== "plain") continue;

		let parsed: { text?: string; notice?: unknown };
		try {
			parsed = JSON.parse(row.payload) as { text?: string; notice?: unknown };
		} catch {
			continue;
		}

		// Skip notice messages (error cards — not conversational turns)
		if (parsed.notice !== undefined) continue;
		// Skip messages without text
		if (typeof parsed.text !== "string" || parsed.text.trim() === "") continue;

		const role: "user" | "assistant" = row.senderId === assistantAgentId ? "assistant" : "user";
		result.push({ role, content: parsed.text });
	}
	return result;
}
