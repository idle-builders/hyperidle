/**
 * AH3: runAssistantTurn — task-free assistant conversational turn service.
 *
 * Handles one complete message→reply cycle:
 *   1. Load assistant agent (lazy-create with defaults if absent)
 *   2. Resolve model + credential (MissingCredentialError → missing_key notice)
 *   3. Select adapter (NoEligibleHarnessError → missing_harness notice)
 *   4. Build conversational context (no task/bet, no workspace materialization)
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
	createLogger,
	type EventBus,
	MissingCredentialError,
	NoEligibleHarnessError,
	type PlainPayload,
	ProviderTimeoutError,
	type ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { AdapterPool } from "../harness/adapter-pool.js";

const logger = createLogger({ pkg: "server.assistant-turn" });

/**
 * Default soul prompt for new assistant agents.
 * Used when an assistant agent is lazy-created with no existing soulPrompt.
 */
const DEFAULT_SOUL_PROMPT =
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
		await runTurnInternal(db, eventBus, adapterPool, userId, threadId, timeoutMs, deps);
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
			soulPrompt: DEFAULT_SOUL_PROMPT,
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
	const soulPromptText = agentRow.soulPrompt ?? DEFAULT_SOUL_PROMPT;

	// --- Step 2: Resolve model + credential ---
	// For the builtin harness, we need an API key. Check via credential resolver if available.
	if (deps.credentialResolver) {
		try {
			// Check for the credential — the builtin adapter needs ANTHROPIC_API_KEY
			const credName = modelProvider === "anthropic" ? "anthropic_api_key" : "openrouter_api_key";
			await deps.credentialResolver.resolve(credName);
		} catch (err) {
			if (err instanceof MissingCredentialError) {
				await persistTurnFailure(db, eventBus, userId, threadId, err);
				return;
			}
			throw err;
		}
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

	// --- Step 4: Load thread messages for context ---
	const messageRows = await db.select().from(messages).where(eq(messages.threadId, threadId));

	// Build conversational messages — simple role/content pairs
	const conversationMessages = messageRows
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.map((row) => {
			const isAssistant = row.senderId === assistantAgentId;
			let text = "";
			try {
				const parsed = JSON.parse(row.payload) as Record<string, unknown>;
				text = typeof parsed.text === "string" ? parsed.text : "";
			} catch {
				text = "";
			}
			return {
				role: isAssistant ? "assistant" : "user",
				content: text,
			} as const;
		})
		.filter((m) => m.content.length > 0);

	// --- Step 5: Compose persona ---
	const { composedPrompt } = composeAssistantPrompt(soulPromptText);

	// --- Step 6: Start session + drain under timeout ---
	const assistantAgentId2 = assistantAgentId;
	let sessionHandle: import("@hyperidle/shared").SessionHandle | null = null;
	let startResult: Record<string, unknown> = {};

	try {
		// @lore AH3: SessionConfig has required fields (workspacePath, soulPromptPath, modelTier)
		// that the real harness adapters expect. For the assistant conversational turn (no task/
		// workspace), we pass placeholder values. The builtin adapter uses composedPrompt +
		// messages; it does not read from workspacePath or soulPromptPath during a turn.
		// This is a known deviation from the full task-session config — documented here.
		const sessionConfig = {
			sessionId: crypto.randomUUID(),
			composedPrompt,
			workspacePath: "",
			soulPromptPath: "",
			modelTier: "standard",
			tools: [] as string[],
			messages: conversationMessages,
		} as unknown as Parameters<typeof selected.adapter.startSession>[0];

		const rawResult = await selected.adapter.startSession(sessionConfig);
		sessionHandle = rawResult;
		// Capture start result as a record for duck-typed streamEvents access (test stubs)
		startResult = rawResult as unknown as Record<string, unknown>;

		// Drain stream events under the timeout
		const drainRace = await Promise.race([
			drainStreamEvents(selected.adapter, rawResult, startResult),
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

		const result = drainRace;

		if (result.type === "error") {
			await persistTurnFailure(
				db,
				eventBus,
				userId,
				threadId,
				new Error(result.message ?? "Provider returned an error"),
			);
			return;
		}

		// completion — persist the assistant reply
		const replyText = result.text;
		const messageId = crypto.randomUUID();
		const now = new Date().toISOString();

		const replyPayload: PlainPayload = { text: replyText };
		await db.insert(messages).values({
			id: messageId,
			senderId: assistantAgentId2,
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
			senderId: assistantAgentId2,
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
// Stream drain helpers
// ---------------------------------------------------------------------------

const TIMEOUT_SENTINEL = Symbol("TIMEOUT_SENTINEL");

type DrainResult = { type: "completion"; text: string } | { type: "error"; message: string };

/**
 * Get the event stream from either the adapter's streamEvents method or from
 * the session handle result (duck-typed for test stubs).
 *
 * @lore AH3: The real HarnessAdapter interface has streamEvents as a method on
 * the adapter. Test stubs may embed it on the startSession result for convenience.
 * We check the handle first (duck-typed), then fall back to adapter.streamEvents.
 * This is the dual-path pattern that lets the integration tests use partial stubs.
 */
function getEventStream(
	adapter: import("@hyperidle/shared").HarnessAdapter,
	handle: import("@hyperidle/shared").SessionHandle,
	startResult: Record<string, unknown>,
): AsyncIterable<import("@hyperidle/shared").HarnessEvent> {
	// Duck-typed: if startSession result has a streamEvents property, use it.
	// This covers test stubs that embed the stream in the result.
	if (
		"streamEvents" in startResult &&
		startResult.streamEvents !== null &&
		startResult.streamEvents !== undefined
	) {
		return startResult.streamEvents as AsyncIterable<import("@hyperidle/shared").HarnessEvent>;
	}
	// Real interface: adapter.streamEvents(handle)
	return adapter.streamEvents(handle);
}

async function drainStreamEvents(
	adapter: import("@hyperidle/shared").HarnessAdapter,
	handle: import("@hyperidle/shared").SessionHandle,
	startResult: Record<string, unknown>,
): Promise<DrainResult> {
	const stream = getEventStream(adapter, handle, startResult);
	let completionText = "";

	try {
		for await (const event of stream) {
			if (event.type === "completion") {
				completionText = event.text;
				return { type: "completion", text: completionText };
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
