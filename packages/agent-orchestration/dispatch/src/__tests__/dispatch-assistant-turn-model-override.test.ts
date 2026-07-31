/**
 * AU21 §9 Increment 11 (Decision H2 follow-up) — closes a real Wave A
 * regression.
 *
 * Wave A ("bake assistant_turn transcript, delete dispatch's 3 core reads")
 * deleted `runTurnInternal`'s live `ports.users.getOrCreateUser` +
 * `ports.settings.readServerConfig` reads and, with them, silently collapsed
 * model resolution to the generic tier-based `resolveModelTier` only — the
 * per-agent `modelId`/`modelProvider` override (`users.modelId`/
 * `modelProvider`, configured via Settings → Agents) stopped applying to
 * assistant turns. That is a real regression: `users.modelId`/`modelProvider`
 * are real, founder-configurable columns with a real Settings UI
 * (`packages/web/src/settings/AgentEditor.tsx`) — every other intent kind
 * still respects a per-agent override where relevant, and silently dropping
 * it for the assistant specifically was never authorized.
 *
 * This proves the override is restored, sourced from the BAKED payload (the
 * same `request.payloadJson` pipe Wave A's transcript fix already uses) —
 * never from a live `getOrCreateUser`/`readServerConfig` read:
 *
 *   1. When the baked request carries a `modelId`/`modelProvider` override,
 *      `ports.modelGateway.resolveAgentModel` is called with THAT override
 *      (not the generic tier default), and the harness receives the model it
 *      resolves to — not the tier-only fallback.
 *   2. When the baked request carries no override (`modelId` absent — the
 *      `undefined` case, matching every request created before this fix, or
 *      any non-assistant kind), the override degrades gracefully to the tier
 *      fallback exactly as before — no regression in the no-override path.
 *   3. `ports.users.getOrCreateUser` and `ports.settings.readServerConfig`
 *      are still never called — the fix stays "bake at emit, source from the
 *      baked payload at execution," matching Wave A's own transcript fix.
 */

import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
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

function buildAssistantSessionRequest(opts: {
	readonly id: string;
	readonly userId: string;
	readonly threadId: string;
	readonly messageId: string;
	readonly payload: Record<string, unknown>;
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
		payloadJson: JSON.stringify(opts.payload),
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
		throw new Error(`must not be called in this test: ${label}`);
	};
}

function buildPorts(overrides: {
	readonly resolveAgentModel: DispatchPorts["modelGateway"]["resolveAgentModel"];
	readonly resolveModelTier: DispatchPorts["modelGateway"]["resolveModelTier"];
	readonly executeAgentRunRequest: DispatchPorts["runOrchestration"]["executeAgentRunRequest"];
}): DispatchPorts {
	return {
		conversation: {
			insertMessage: vi.fn(async () => undefined),
			listMessagesByThread: unreachable("conversation.listMessagesByThread"),
			getThreadById: unreachable("conversation.getThreadById"),
			updateThread: unreachable("conversation.updateThread"),
		},
		users: {
			getOrCreateUser: unreachable("users.getOrCreateUser"),
			getUserById: unreachable("users.getUserById"),
		},
		settings: { readServerConfig: unreachable("settings.readServerConfig") },
		modelGateway: {
			resolveAgentModel: overrides.resolveAgentModel,
			resolveModelTier: overrides.resolveModelTier,
		},
		runOrchestration: { executeAgentRunRequest: overrides.executeAgentRunRequest },
		toolHandlers: { buildAssistantDraftRegistry: vi.fn(async () => ({})) },
		workspaceFactory: { create: vi.fn(() => ({})) },
	};
}

describe("dispatch resolves the harness model from the baked per-agent override", () => {
	test("a baked modelId/modelProvider override is passed to resolveAgentModel and reaches the harness — not the tier default", async () => {
		const db = inertDb();
		const eventBus = new EventBus();
		const founderId = "founder-inc11-model-override";
		const threadId = "thread-inc11-model-override";

		const resolveAgentModelSpy = vi.fn(
			async (agent: {
				readonly modelId: string | null;
				readonly modelProvider: string | null;
			}) => ({
				provider: (agent.modelProvider ?? "anthropic") as "anthropic",
				model: agent.modelId ?? "should-not-happen",
				apiKey: "real-agent-override-key",
				baseUrl: "https://api.anthropic.com",
			}),
		);
		const resolveModelTierSpy = vi.fn(async () => ({
			provider: "anthropic" as const,
			model: "GENERIC-TIER-MODEL-should-not-be-used",
			apiKey: "tier-key",
			baseUrl: "https://api.anthropic.com",
		}));
		const executeAgentRunRequestSpy = vi.fn(
			async (
				_runDeps: unknown,
				_request: AgentSessionRequest,
				options: Parameters<DispatchPorts["runOrchestration"]["executeAgentRunRequest"]>[2],
			) => {
				void options;
				return {
					sessionId: "sess-inc11-model-override",
					outcome: "completed" as const,
					totalCostCents: 0,
					taskId: null,
					forceReturnCount: 0,
					conversationalReply: "ok",
				};
			},
		);

		const ports = buildPorts({
			resolveAgentModel: resolveAgentModelSpy,
			resolveModelTier: resolveModelTierSpy,
			executeAgentRunRequest: executeAgentRunRequestSpy,
		});

		const dispatchOps = createDispatchOps(ports);
		const request = buildAssistantSessionRequest({
			id: "asr-inc11-model-override",
			userId: founderId,
			threadId,
			messageId: "msg-inc11-model-override-trigger",
			payload: {
				transcript: [],
				modelId: "claude-opus-4-6",
				modelProvider: "anthropic",
			},
		});
		const deps: RunAssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: {},
			credentialResolver: { resolve: async () => "decoy-credential" },
		};

		await dispatchOps.runAssistantTurn(deps, request);

		// The override reached resolveAgentModel, not the generic tier path.
		expect(resolveAgentModelSpy).toHaveBeenCalledTimes(1);
		const [agentArg] = resolveAgentModelSpy.mock.calls[0] ?? [];
		expect(agentArg).toEqual({ modelId: "claude-opus-4-6", modelProvider: "anthropic" });

		// The harness receives the per-agent resolved model, not the tier default.
		expect(executeAgentRunRequestSpy).toHaveBeenCalledTimes(1);
		const call = executeAgentRunRequestSpy.mock.calls[0];
		if (!call) throw new Error("executeAgentRunRequest was never called");
		const [, , options] = call;
		expect(options.resolvedModel).toEqual({
			provider: "anthropic",
			model: "claude-opus-4-6",
			apiKey: "real-agent-override-key",
			baseUrl: "https://api.anthropic.com",
		});
		expect(options.resolvedModel?.model).not.toBe("GENERIC-TIER-MODEL-should-not-be-used");
	});

	test("no baked override degrades to the tier default (unchanged behavior for pre-fix / non-overridden requests)", async () => {
		const db = inertDb();
		const eventBus = new EventBus();
		const founderId = "founder-inc11-no-override";
		const threadId = "thread-inc11-no-override";

		const resolveAgentModelSpy = vi.fn(
			async (
				agent: { readonly modelId: string | null; readonly modelProvider: string | null },
				tierFallback: string,
			) => ({
				provider: "anthropic" as const,
				model: agent.modelId ?? `tier:${tierFallback}`,
				apiKey: "tier-fallback-key",
				baseUrl: "https://api.anthropic.com",
			}),
		);
		const resolveModelTierSpy = vi.fn(async () => ({
			provider: "anthropic" as const,
			model: "fast-model",
			apiKey: "tier-key",
			baseUrl: "https://api.anthropic.com",
		}));
		const executeAgentRunRequestSpy = vi.fn(async () => ({
			sessionId: "sess-inc11-no-override",
			outcome: "completed" as const,
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
			conversationalReply: "ok",
		}));

		const ports = buildPorts({
			resolveAgentModel: resolveAgentModelSpy,
			resolveModelTier: resolveModelTierSpy,
			executeAgentRunRequest: executeAgentRunRequestSpy,
		});

		const dispatchOps = createDispatchOps(ports);
		const request = buildAssistantSessionRequest({
			id: "asr-inc11-no-override",
			userId: founderId,
			threadId,
			messageId: "msg-inc11-no-override-trigger",
			payload: { transcript: [] },
		});
		const deps: RunAssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: {},
			credentialResolver: { resolve: async () => "decoy-credential" },
		};

		await dispatchOps.runAssistantTurn(deps, request);

		expect(resolveAgentModelSpy).toHaveBeenCalledTimes(1);
		const [agentArg, tierFallbackArg] = resolveAgentModelSpy.mock.calls[0] ?? [];
		expect(agentArg).toEqual({ modelId: null, modelProvider: null });
		expect(tierFallbackArg).toBe("workhorse");
	});
});
