/**
 * AU21 §9 Increment 11 (H2 re-derived) — RED phase.
 *
 * architecture.md §6 Decision H's H2 subsection + §9's Increment 11
 * paragraph: "Delete `runTurnInternal`'s three core reads
 * (`listMessagesByThread`, `getOrCreateUser`, `readServerConfig`) — NOT
 * seam-route them... Orchestration constructs the harness input from the
 * baked transcript, written into the prompt/AGENTS.md exactly as today's
 * conversational branch (`provisioner.ts:883-903`) already does... only the
 * transcript's SOURCE moves from a live read to the baked payload."
 *
 * This proves BOTH halves of Increment 11's AC (b) directly against the real
 * `dispatch` package (`createDispatchOps`), using fully injected
 * `DispatchPorts` spies — the standard idiom for this package (see the
 * sibling `dispatch-completeness-contract.test.ts`, and
 * `core-api-port-increment2-dispatch-assistant-turn.integration.test.ts` for
 * the same `unreachable`-stub pattern applied against the real seam):
 *
 *   1. ZERO calls reach `ports.conversation.listMessagesByThread`,
 *      `ports.users.getOrCreateUser`, or `ports.settings.readServerConfig`
 *      during a real (non-early-return) assistant turn.
 *   2. The conversational messages handed to
 *      `ports.runOrchestration.executeAgentRunRequest` are built from the
 *      REQUEST's own baked transcript (`request.payloadJson`), not from
 *      `ports.conversation.listMessagesByThread`'s (decoy) return value.
 *
 * Currently RED: `runTurnInternal` unconditionally calls
 * `ports.users.getOrCreateUser` first (`service.ts:173`), then — because this
 * test supplies a `credentialResolver` (no pre-resolved `deps.resolvedModel`,
 * matching the branch that resolves models today) — calls
 * `ports.settings.readServerConfig` (`service.ts:204`), and unconditionally
 * calls `ports.conversation.listMessagesByThread` via `loadRawTranscript`
 * (`service.ts:244,358`), ignoring `request.payloadJson` entirely. All three
 * `not.toHaveBeenCalled()` assertions fail, and the captured conversational
 * messages equal the DECOY live-read content, not the baked transcript.
 *
 * @lore naming: this test reads the baked transcript from
 * `request.payloadJson` (`JSON.parse(payloadJson).transcript`) — the
 * `AgentSessionRequest` row's existing generic pass-through column, already
 * real on the schema and currently unused by any real call site (confirmed
 * by source read: `session-requests/src/service.ts`'s
 * `createFromBakedRequestInternal` never sets it, and no `dispatch` code
 * reads it). This is this wave's best-guess interpretation of how the baked
 * transcript reaches `dispatch` through the existing
 * `agent_work_intents.bakedRequestJson` → `agentSessionRequests` hand-off
 * pipeline, without widening the strict per-kind `sourceCorrelation` zod
 * schemas (`@hyperidle/shared`'s `assistantSessionRequestInputSchema`) —
 * flagged for reviewer confirmation; only this test's `payloadJson`
 * construction needs to change if the real implementation picks a different
 * transport field.
 *
 * @lore a real (heavyweight, PGlite-backed) `db` fixture is deliberately
 * NOT used here — every `DispatchPorts` method is fully faked, `db` is only
 * ever threaded through opaquely, and when a `not.toHaveBeenCalled()`
 * assertion on a spy that captured the real fixture db as an argument fails,
 * vitest's pretty-printer tries to serialize that huge/circular object and
 * blows the heap (`RangeError: Invalid string length` / OOM — reproduced
 * while writing this test). Uses the same `inertDb()` idiom
 * `dispatch-completeness-contract.test.ts` already ships.
 */

import type { AgentSessionRequest, HyperIdleDb, Message, User } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { describe, expect, test, vi } from "vitest";
import type { DispatchOps, DispatchPorts } from "../index.js";
import { createDispatchOps } from "../index.js";

const NOW = "2026-07-31T00:00:00.000Z";

function inertDb(): HyperIdleDb {
	const query = {
		from: () => query,
		where: async () => [],
	};
	return { select: () => query } as unknown as HyperIdleDb;
}

type RunAssistantTurnDeps = Parameters<DispatchOps["runAssistantTurn"]>[0];

interface TranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

function decoyAgentRow(assistantAgentId: string): User {
	return {
		id: assistantAgentId,
		kind: "ai",
		name: "Assistant",
		systemPromptPath: null,
		teamId: null,
		role: "assistant",
		skills: null,
		status: "active",
		maxConcurrentSessions: 1,
		costCap: null,
		costActual: 0,
		costCapMinor: null,
		costCapCurrency: null,
		email: null,
		avatarUrl: null,
		createdAt: NOW,
		systemPrompt: "You are a helpful assistant.",
		harnessType: "builtin",
		modelTierPreference: null,
		modelId: "decoy-model-should-never-be-used",
		modelProvider: "anthropic",
		agentCategory: "individual",
	};
}

function buildAssistantSessionRequest(opts: {
	readonly id: string;
	readonly userId: string;
	readonly threadId: string;
	readonly messageId: string;
	readonly bakedTranscript: readonly TranscriptRow[];
}): AgentSessionRequest {
	return {
		id: opts.id,
		sourceKind: "thread_message",
		sourceId: opts.messageId,
		streamId: opts.threadId,
		taskId: null,
		agentId: `ast-${opts.userId}`,
		teamId: null,
		userId: opts.userId,
		promptMode: "conversation",
		payloadJson: JSON.stringify({ transcript: opts.bakedTranscript }),
		sourceCorrelationJson: JSON.stringify({
			userId: opts.userId,
			threadId: opts.threadId,
			messageId: opts.messageId,
		}),
		idempotencyKey: `assistant:${opts.messageId}`,
		status: "claimed",
		claimedBy: null,
		claimedAt: null,
		claimExpiresAt: null,
		claimToken: null,
		sessionId: null,
		terminationReason: null,
		terminationRequestedAt: null,
		terminationRequestedBy: null,
		errorCode: null,
		errorMessage: null,
		costCents: null,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function unreachable(label: string): () => never {
	return () => {
		throw new Error(`unreachable in this RED-phase test: ${label}`);
	};
}

describe("dispatch's assistant turn sources the transcript from the baked payload, zero core reads (Increment 11)", () => {
	test("zero conversation/users/settings reads reach dispatch, and the harness messages come from the baked transcript — not the (decoy) live read", async () => {
		const db = inertDb();
		const eventBus = new EventBus();
		const founderId = "founder-inc11-transcript";
		const threadId = "thread-inc11-transcript";
		const assistantAgentId = `ast-${founderId}`;

		const bakedTranscript: TranscriptRow[] = [
			{
				senderId: founderId,
				payload: JSON.stringify({ text: "hello from the baked transcript" }),
				type: "plain",
			},
			{
				senderId: assistantAgentId,
				payload: JSON.stringify({ text: "baked assistant reply" }),
				type: "plain",
			},
			{
				senderId: founderId,
				payload: JSON.stringify({ text: "baked follow-up question" }),
				type: "plain",
			},
		];

		const decoyMessageRow: Message = {
			id: "msg-decoy-live-read",
			createdAt: NOW,
			senderId: founderId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text: "DECOY-LIVE-READ-CONTENT" }),
			clientKey: "decoy-client-key",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			legacyItemId: null,
			blockId: null,
		};
		const listMessagesByThreadSpy = vi.fn(async () => [decoyMessageRow]);
		const getOrCreateUserSpy = vi.fn(async () => decoyAgentRow(assistantAgentId));
		const readServerConfigSpy = vi.fn(async () => ({
			cost: { capMinor: 0 },
			modelGateway: {} as never,
		}));
		const resolveAgentModelSpy = vi.fn(async () => ({
			provider: "anthropic" as const,
			model: "decoy-resolved-model",
			apiKey: "decoy-key",
			baseUrl: "https://api.anthropic.com",
		}));
		const resolveModelTierSpy = vi.fn(async () => ({
			provider: "anthropic" as const,
			model: "decoy-fast-model",
			apiKey: "decoy-key",
			baseUrl: "https://api.anthropic.com",
		}));
		const insertMessageSpy = vi.fn(async () => undefined);
		const executeAgentRunRequestSpy = vi.fn(
			async (
				_runDeps: unknown,
				_request: AgentSessionRequest,
				options: Parameters<DispatchPorts["runOrchestration"]["executeAgentRunRequest"]>[2],
			) => {
				void options;
				return {
					sessionId: "sess-inc11-transcript",
					outcome: "completed" as const,
					totalCostCents: 0,
					taskId: null,
					forceReturnCount: 0,
					conversationalReply: "ok",
				};
			},
		);

		const ports: DispatchPorts = {
			conversation: {
				insertMessage: insertMessageSpy,
				listMessagesByThread: listMessagesByThreadSpy,
				getThreadById: unreachable("conversation.getThreadById"),
				updateThread: unreachable("conversation.updateThread"),
			},
			users: {
				getOrCreateUser: getOrCreateUserSpy,
				getUserById: unreachable("users.getUserById"),
			},
			settings: { readServerConfig: readServerConfigSpy },
			modelGateway: {
				resolveAgentModel: resolveAgentModelSpy,
				resolveModelTier: resolveModelTierSpy,
			},
			runOrchestration: { executeAgentRunRequest: executeAgentRunRequestSpy },
			toolHandlers: { buildAssistantDraftRegistry: vi.fn(async () => ({})) },
			workspaceFactory: { create: vi.fn(() => ({})) },
		};

		const dispatchOps = createDispatchOps(ports);
		const request = buildAssistantSessionRequest({
			id: "asr-inc11-transcript",
			userId: founderId,
			threadId,
			messageId: "msg-inc11-transcript-trigger",
			bakedTranscript,
		});
		const deps: RunAssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: {},
			credentialResolver: { resolve: async () => "decoy-credential" },
		};

		await dispatchOps.runAssistantTurn(deps, request);

		expect(listMessagesByThreadSpy).not.toHaveBeenCalled();
		expect(getOrCreateUserSpy).not.toHaveBeenCalled();
		expect(readServerConfigSpy).not.toHaveBeenCalled();

		expect(executeAgentRunRequestSpy).toHaveBeenCalledTimes(1);
		const call = executeAgentRunRequestSpy.mock.calls[0];
		if (!call) throw new Error("executeAgentRunRequest was never called");
		const [, , options] = call;
		expect(options.conversational?.messages).toEqual([
			{ role: "user", content: "hello from the baked transcript" },
			{ role: "assistant", content: "baked assistant reply" },
			{ role: "user", content: "baked follow-up question" },
		]);
		expect(JSON.stringify(options.conversational?.messages)).not.toContain(
			"DECOY-LIVE-READ-CONTENT",
		);
	});
});
