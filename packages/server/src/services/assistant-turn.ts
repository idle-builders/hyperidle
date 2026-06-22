/**
 * AH3: runAssistantTurn — task-free assistant conversational turn service.
 *
 * Handles one complete message→reply cycle:
 *   1. Load assistant agent (lazy-create with defaults if absent)
 *   2. Resolve model + credential (MissingCredentialError → missing_key notice)
 *   3. Select adapter (NoEligibleHarnessError → missing_harness notice)
 *   4. Build conversational context (no task/bet, no sandbox context assembly)
 *   5. Compose persona via composeAssistantPrompt (byte-equal across both adapter paths)
 *   6. Start harness session + drain events under ASSISTANT_TURN_TIMEOUT_MS
 *      - completion → persist plain reply message
 *      - error event → persist provider_error notice
 *      - timeout (hung provider, §1.7a) → abort, persist provider_error notice
 *   7. Emit thread_message_appended so the overlay live-updates via WS
 *
 * NEVER silent: every branch ends in a persisted reply or a persisted notice.
 *
 * @lore AH3: Task-free is the KEY architectural decision (design-it-twice §A).
 * Using provisionSession would pollute tasks/bets with fake rows and couple the
 * chat lifecycle to the task state machine. This service reuses only AdapterPool
 * + harness + streamEvents + model resolution.
 *
 * @lore AH3 §1.7: The in-memory inFlight set prevents concurrent stacked turns
 * within one process lifetime. After a crash it is empty → a user-initiated Retry
 * is correctly unblocked. The §1.7b crash-recovery Retry card is computed on the
 * CLIENT from lastMessage.createdAt + ASSISTANT_TURN_TIMEOUT_MS — no DB column needed.
 */

import { type HyperIdleDb, messages, users } from "@hyperidle/db";
import { composeAssistantPrompt } from "@hyperidle/fabric";
import {
	ASSISTANT_TURN_TIMEOUT_MS,
	type ConversationMessage,
	createLogger,
	type EventBus,
	MissingCredentialError,
	NoEligibleHarnessError,
	type PlainPayload,
	ProviderTimeoutError,
	type SessionConfig,
	type ThreadMessageAppendedEvent,
	type ToolCallSummary,
} from "@hyperidle/shared";
import { asc, eq } from "drizzle-orm";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
// AH6 WARNING-2: CassetteMissError must be explicitly mapped to provider_error so it
// doesn't trip the "unmapped error class" logger.error on every cassette miss in tests.
// Only imported when LLM_CASSETTE_MODE is set (test lane); production is unaffected.
import { CassetteMissError } from "../harness/llm-cassette.js";
import {
	BUILT_IN_GATEWAY_CONFIG,
	resolveAgentModel,
	resolveModelTier,
} from "../services/model-gateway.js";
import { readServerConfig } from "../services/server-config.js";
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
	const timeoutMs = deps.turnTimeoutMs ?? ASSISTANT_TURN_TIMEOUT_MS;

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
			timeoutMs,
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
	timeoutMs: number,
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

	const harnessType = agentRow.harnessType ?? "builtin";
	const modelProvider = agentRow.modelProvider ?? "anthropic";
	// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
	const systemPromptText = agentRow.systemPrompt ?? BUILTIN_SYSTEM_PROMPT;

	// --- Step 2: Resolve model + credential ---
	// resolveAgentModel handles both credential resolution and per-agent model selection.
	// When credentialResolver is absent (local env-based mode), we skip resolution and
	// let the adapter read from process.env directly — builtin adapter still requires
	// resolvedModel, so we fall back to BUILT_IN_GATEWAY_CONFIG without a key.
	//
	// @lore AH3 H1: resolveAgentModel MUST be called here. The builtin adapter's
	// startSession throws "resolvedModel is required" when it is missing. The
	// `as unknown` cast that shipped before masked this type error at compile time.
	// resolvedModel is optional in SessionConfig but the builtin adapter validates it
	// at runtime — this is the canonical fix.
	//
	// @lore AH3 M3: CredentialResolver.resolve() returns null (not throw) for missing
	// keys in local mode. resolveAgentModel already throws MissingCredentialError when
	// resolve() returns null (see model-gateway.ts resolveProvider). So calling
	// resolveAgentModel is the correct way to detect missing_key — do NOT check
	// resolve() directly and fall through to null.
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
		// The builtin adapter will fail at startSession if the key is absent from env.
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

	// --- Step 3: Select adapter ---
	const selected = adapterPool.select({
		harnessType,
		modelProviders: [modelProvider],
	});

	if (!selected) {
		await persistTurnFailure(
			db,
			eventBus,
			userId,
			threadId,
			new NoEligibleHarnessError(harnessType),
		);
		return;
	}

	// --- Step 4: Build conversational message history from thread transcript ---
	// @lore AH3 H3: This is the core fix for "user's message never reaches the model."
	// We load the thread's plain messages in chronological order and map them to
	// ConversationMessage[]. The triggering user message was just inserted before
	// runAssistantTurn was called, so loading the full thread up to now includes it.
	// The builtin adapter branches on config.messages: when non-empty it runs a single
	// chat completion seeded with these messages instead of the task-planning loop.
	const transcriptRows = await loadRawTranscript(db, threadId);
	const conversationMessages = mapTranscriptToMessages(transcriptRows, `ast-${userId}`);

	// --- Step 4a: Resolve tool registry params (AK4) ---
	// @lore AK4: resolve team + draft binding BEFORE startSession so the registry
	// is ready for injection. Both resolutions are cheap single-row DB lookups.
	// Task-free ToolContext: synthetic sessionId, empty taskId/sandboxPath.
	// teamId is NOT set on ctx — it is hard-injected by the create_bet wrapper.
	const sessionId = crypto.randomUUID();
	const resolvedTeamId = await resolveDraftTeamId(db, userId);
	const currentDraftBetId = await resolveCurrentDraftBetId(db, transcriptRows, `ast-${userId}`);

	const toolContext: ToolContext = {
		db,
		eventBus,
		agentId: assistantAgentId,
		sessionId,
		taskId: "", // task-free conversational turn
		sandboxPath: "", // no sandbox IO
		ingestion: { dispose: () => {} }, // no-op — bet tools don't use ingestion
	};

	// Build a 2-tool-only registry and inject via setSessionToolRegistry BEFORE startSession.
	// @lore AK4 CRITICAL-2: NEVER inject buildToolRegistry(ctx,{role:'assistant'}) here —
	// it yields the full assistant role surface (create_team, add_agent, submit_review, ...).
	// The dedicated 2-tool builder is the authority boundary (AC3b).
	const draftRegistry = buildAssistantDraftRegistry(toolContext, {
		resolvedTeamId,
		currentDraftBetId,
	});

	// Inject registry into the adapter BEFORE startSession.
	// @lore AK4: Only BuiltinHarnessAdapter has setSessionToolRegistry (on the concrete
	// class, not on HarnessAdapter interface). Narrow via meta.type === "builtin" and cast.
	// This follows the same X6 provisioning pattern in session-provisioning.ts ~L586.
	if (selected.meta.type === "builtin" && selected.adapter instanceof BuiltinHarnessAdapter) {
		selected.adapter.setSessionToolRegistry(sessionId, draftRegistry);
	}

	// When a draft exists, nudge the model toward edit_bet; else toward create_bet.
	// @lore AK4 Task 4: system nudge prevents the model from creating a second draft
	// when one already exists. The server FORCES betId regardless (edit_bet wrapper),
	// but the nudge reduces unnecessary create_bet calls.
	const { composedPrompt: basePrompt } = composeAssistantPrompt(systemPromptText);
	const nudge = currentDraftBetId
		? `\n\n[CONTEXT: You previously drafted bet ${currentDraftBetId}. Use edit_bet to refine it; do not create a new bet unless the user explicitly asks for one.]`
		: `\n\n[CONTEXT: No draft bet exists yet. If the user wants to shape a bet, use create_bet to draft one.]`;
	const composedPrompt = basePrompt + nudge;

	// --- Step 5: (persona composed above) ---

	// --- Step 6: Start session + drain under timeout ---
	let sessionHandle: import("@hyperidle/shared").SessionHandle | null = null;

	try {
		// @lore AH3: SessionConfig sandboxPath/systemPromptPath are required by the interface
		// but not used by the builtin adapter during a conversational turn (no task sandbox).
		// We pass empty strings — the adapter uses assembledPrompt + messages instead.
		// resolvedModel is REQUIRED by the builtin adapter (throws if missing — H1 fix).
		// No `as unknown` cast: the type system now guards all required fields.
		// messages carries the thread transcript so the adapter delivers the user's question.
		// @lore AK1: assembledPrompt/sandboxPath/systemPromptPath are the post-rename session config fields (harness-vocab rename).
		// @lore AK4: SessionConfig.tools stays [] — the builtin adapter ignores it and uses
		// session.toolDefs (populated by setSessionToolRegistry). Dead field; documented.
		const sessionConfig: SessionConfig = {
			sessionId,
			assembledPrompt: composedPrompt,
			sandboxPath: "",
			systemPromptPath: "",
			modelTier: "workhorse",
			tools: [], // dead field — adapter uses session.toolDefs from setSessionToolRegistry
			resolvedModel,
			resolvedFastModel,
			messages: conversationMessages,
		};

		const rawResult = await selected.adapter.startSession(sessionConfig);
		sessionHandle = rawResult;

		// Drain stream events under the timeout
		const drainRace = await Promise.race([
			drainStreamEvents(selected.adapter, rawResult),
			timeoutPromise(timeoutMs),
		]);

		if (drainRace === TIMEOUT_SENTINEL) {
			// Hung provider — abort and persist provider_error
			try {
				await selected.adapter.stopSession(rawResult);
			} catch {
				// best-effort stop
			}
			await persistTurnFailure(db, eventBus, userId, threadId, new ProviderTimeoutError());
			return;
		}

		const drainResult = drainRace;

		if (drainResult.type === "error") {
			await persistTurnFailure(
				db,
				eventBus,
				userId,
				threadId,
				new Error(drainResult.message ?? "Provider returned an error"),
			);
			return;
		}

		// completion — persist the assistant reply
		const replyText = drainResult.text;
		const messageId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Map CapturedToolCall[] → ToolCallSummary[] for the persisted payload
		const toolCallSummaries: ToolCallSummary[] | undefined =
			drainResult.toolCalls && drainResult.toolCalls.length > 0
				? drainResult.toolCalls.map((tc) => ({
						name: tc.name,
						input: tc.input,
						output: tc.output,
						status: tc.status,
					}))
				: undefined;

		const replyPayload: PlainPayload = {
			text: replyText,
			...(toolCallSummaries ? { toolCalls: toolCallSummaries } : {}),
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
	} catch (err) {
		await persistTurnFailure(db, eventBus, userId, threadId, err);
	} finally {
		if (sessionHandle) {
			try {
				await selected.adapter.stopSession(sessionHandle);
			} catch {
				// best-effort
			}
		}
		adapterPool.release(selected.id);
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

// ---------------------------------------------------------------------------
// Stream drain helpers
// ---------------------------------------------------------------------------

const TIMEOUT_SENTINEL = Symbol("TIMEOUT_SENTINEL");

type DrainResult =
	| {
			type: "completion";
			text: string;
			toolCalls?: import("@hyperidle/shared").CapturedToolCall[];
	  }
	| { type: "error"; message: string };

/**
 * Drain stream events from the adapter's streamEvents method.
 *
 * @lore AH3 S7: The prior implementation duck-typed the startSession result to
 * support test stubs that embedded streamEvents on the handle. That coupling masked
 * H1 (missing resolvedModel went unnoticed because stub adapters bypassed startSession
 * validation). Test stubs must now implement the real HarnessAdapter interface —
 * implement `streamEvents` on the adapter object, not on the session handle.
 *
 * @lore AK4: Returns CapturedToolCall[] from CompletionEvent.toolCalls when present
 * (populated by runChatTurn's bounded loop). Maps them to payload.toolCalls on the
 * persisted reply. No change for task-session completions (toolCalls is undefined there).
 */
async function drainStreamEvents(
	adapter: import("@hyperidle/shared").HarnessAdapter,
	handle: import("@hyperidle/shared").SessionHandle,
): Promise<DrainResult> {
	const stream = adapter.streamEvents(handle);
	let completionText = "";

	try {
		for await (const event of stream) {
			if (event.type === "completion") {
				completionText = event.text;
				return {
					type: "completion",
					text: completionText,
					...(event.toolCalls ? { toolCalls: [...event.toolCalls] } : {}),
				};
			}
			if (event.type === "error") {
				return {
					type: "error",
					message: event.message,
				};
			}
		}
	} catch {
		return { type: "error", message: "Stream error" };
	}

	// Generator exhausted without explicit completion — treat as empty completion
	return { type: "completion", text: completionText };
}

function timeoutPromise(ms: number): Promise<typeof TIMEOUT_SENTINEL> {
	return new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
		setTimeout(() => resolve(TIMEOUT_SENTINEL), ms);
	});
}
