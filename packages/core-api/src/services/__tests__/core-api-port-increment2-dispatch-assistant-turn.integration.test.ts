/**
 * AU21 §9 Increment 2 (conversation wave) — RED phase.
 *
 * Proves the WIRING half of `dispatch`'s assistant-turn migration named in
 * `edge-disposition.md`'s `dispatch` table row `conversation.{insertMessage,
 * updateThread} (assistant-turn) | §4 seam | assistant-turn writes = UI's
 * door (agent-as-user, genuine agent session involved)`. The sibling file
 * `core-api-port-increment2-conversation.integration.test.ts` already
 * contract-tests the two `CoreApiConversationPort` methods this migration
 * reuses (`insertMessage`, `updateThread`) against their real backing
 * routes — this file proves `dispatch`'s OWN real functions
 * (`persistTurnFailureInternal`/`runTurnInternal`'s `insertMessage`,
 * `registerAssistantTriggerInternal`'s pin-after-first-response
 * `updateThread`, `dispatch/src/service.ts:236,437,574`) actually reach that
 * seam once `DispatchPorts.conversation.{insertMessage,updateThread}` are
 * rewired from raw `@hyperidle/conversation` DI (today's
 * `dispatch-bindings.ts`) onto it.
 *
 * `DispatchPorts.conversation.insertMessage`/`updateThread` do not exist as
 * seam-backed methods yet — the composition below wires them directly to
 * `buildCoreApiPort(...).conversation.{insertMessage,updateThread}`, which
 * does not exist yet either (Increment 2's conversation wave hasn't landed
 * GREEN). Every test fails at RUNTIME (`TypeError: Cannot read properties of
 * undefined (reading 'insertMessage'/'updateThread')`), not at
 * import-resolution time — RED for the right reason. GREEN phase:
 *  (a) lands the `CoreApiConversationPort` family (see the sibling file);
 *  (b) deletes `insertMessage`/`updateThread` from `DispatchPorts.conversation`
 *      (`dispatch/src/ports.ts:63-74`) and adds a `coreApi` accessor
 *      (mirroring `tool-handlers`'s `ToolHandlersCoreApiAccessor`);
 *  (c) rewires `dispatch-bindings.ts` so the two calls route through the
 *      seam, threading the ASSISTANT AGENT's own identity (`ast-<userId>`,
 *      never the human sender) as the route actor per architecture.md §12.
 *
 * Every OTHER `DispatchPorts.conversation` port
 * (`getThreadById`/`insertThread`/`getThreadIdsByHost`/`listMessagesByThread`)
 * is untouched this wave (Increment 3/5's scope, per `edge-disposition.md`'s
 * `§1/§2`/`§2 baked` rows) — this test wires them to their REAL
 * `@hyperidle/conversation` implementations exactly as `dispatch-bindings.ts`
 * does today, not stubs, so `registerAssistantTriggerInternal`'s untouched
 * `getThreadById` read keeps working unchanged.
 *
 * Every `DispatchPorts` capability NOT reached by either scenario below
 * (`work`, `routine`, `settings`, `modelGateway`, `agentSelection`,
 * `runOrchestration`, `sessionRequests`, `cost`, `review`, `knowledge`,
 * `toolHandlers`, `workspaceFactory` — verified by reading
 * `runTurnInternal`'s control flow: the missing-credential branch calls
 * `persistTurnFailureInternal` and returns BEFORE `loadRawTranscript`/
 * `agentSelection.resolveScaffoldSpecs`/`runOrchestration.executeAgentRunRequest`
 * are ever reached, `service.ts:342-361`) is wired to a throwing stub — if
 * one of these were unexpectedly invoked, the test fails loudly rather than
 * silently mocking behavior this test does not claim to exercise.
 */

import { findThread } from "@hyperidle/conversation";
import type { AgentSessionRequest } from "@hyperidle/db";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { DispatchOps, DispatchPorts } from "@hyperidle/dispatch";
import { createDispatchOps } from "@hyperidle/dispatch";
import type { ThreadMessageAppendedEvent } from "@hyperidle/shared";
import { findUser, getOrCreateUser } from "@hyperidle/users";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../../test-fixtures.js";
import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "../core-api-port-composition.js";

const NOW = "2026-07-28T00:00:00.000Z";

type RunAssistantTurnDeps = Parameters<DispatchOps["runAssistantTurn"]>[0];

/**
 * Local mirror of the two `CoreApiConversationPort` methods this migration
 * reuses — same idiom as the sibling contract-test file's
 * `SeamCoreApiPortIncrement2Conversation` (a hand-typed mirror, not `any`;
 * the property doesn't exist yet, so accessing it is the RED signal).
 */
interface SeamConversationWriteAccessor {
	readonly conversation: {
		insertMessage(input: {
			readonly threadId: string;
			readonly type: "plain";
			readonly payload: Record<string, unknown>;
			readonly clientKey: string;
		}): Promise<{ readonly id: string }>;
		updateThread(
			id: string,
			updates: Partial<{
				participants: readonly string[];
				lastActiveAt: string;
				pinned: boolean;
			}>,
		): Promise<void>;
	};
}

/** Always throws — a `DispatchPorts` capability this test's scenarios never reach. */
function unreachable(label: string): () => never {
	return () => {
		throw new Error(`unreachable in this RED-phase test: ${label}`);
	};
}

/**
 * Builds a `DispatchPorts` where ONLY `conversation.insertMessage` and
 * `conversation.updateThread` are wired through the `CoreApiPort` seam;
 * `conversation.getThreadById` is wired to the REAL untouched read
 * (`findThread`); every other capability is a throwing stub (see this
 * file's top `@lore`). When `actorId` is omitted, the transport carries NO
 * actor/API-key wrapping at all — the real auth/boundary middleware must
 * reject the write (used by the no-auth test below).
 */
function buildDispatchPortsForAssistantTurnMigration(
	app: Hono,
	actorId: string | undefined,
): DispatchPorts {
	const rawTransport = createInProcessCoreApiTransport(app);
	const seamTransport = actorId
		? withActorTransport(rawTransport, { userId: actorId })
		: rawTransport;
	const seamPort = buildCoreApiPort(seamTransport) as unknown as SeamConversationWriteAccessor;

	return {
		work: {
			listTasks: unreachable("work.listTasks"),
			getTaskById: unreachable("work.getTaskById"),
			getBetById: unreachable("work.getBetById"),
			createItem: unreachable("work.createItem"),
			findRetroItemByThreadIds: unreachable("work.findRetroItemByThreadIds"),
		},
		routine: {
			insertRoutine: unreachable("routine.insertRoutine"),
			getRoutineById: unreachable("routine.getRoutineById"),
			insertRoutineRun: unreachable("routine.insertRoutineRun"),
			updateRoutineById: unreachable("routine.updateRoutineById"),
			findRunningRoutineRun: unreachable("routine.findRunningRoutineRun"),
			listActiveRoutines: unreachable("routine.listActiveRoutines"),
			listScheduledRoutinesMissingNextRunAt: unreachable(
				"routine.listScheduledRoutinesMissingNextRunAt",
			),
			sumRoutineRunCostSince: unreachable("routine.sumRoutineRunCostSince"),
		},
		conversation: {
			// AU21 §9 Increment 2 (conversation wave, GREEN target): routed
			// through the seam under the assistant agent's own identity —
			// never the human sender (architecture.md §12). Both real call
			// sites this migration reuses (`persistTurnFailureInternal`,
			// `runTurnInternal`'s reply) always write `type: "plain"` —
			// hardcoded here rather than widening to the full message-type
			// union no dispatch call site actually needs.
			insertMessage: (_exec, values) =>
				seamPort.conversation
					.insertMessage({
						threadId: values.threadId,
						type: "plain",
						payload: JSON.parse(values.payload),
						clientKey: values.clientKey,
					})
					.then(() => undefined),
			listMessagesByThread: unreachable("conversation.listMessagesByThread"),
			// Untouched this wave (Increment 3/5's scope) — wired to the real
			// implementation, not a stub, so the pin scenario's own read works.
			getThreadById: (exec, id) => findThread(exec, { id }),
			updateThread: (_exec, id, patch) =>
				seamPort.conversation.updateThread(id, {
					...(patch.participants !== undefined
						? { participants: JSON.parse(patch.participants) }
						: {}),
					...(patch.lastActiveAt !== undefined ? { lastActiveAt: patch.lastActiveAt } : {}),
					...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
				}),
			getThreadIdsByHost: unreachable("conversation.getThreadIdsByHost"),
			insertThread: unreachable("conversation.insertThread"),
		},
		users: {
			getOrCreateUser,
			getUserById: (db, id) => findUser(db, { id }),
		},
		settings: { readServerConfig: unreachable("settings.readServerConfig") },
		modelGateway: {
			resolveAgentModel: unreachable("modelGateway.resolveAgentModel"),
			resolveModelTier: unreachable("modelGateway.resolveModelTier"),
		},
		agentSelection: { resolveScaffoldSpecs: unreachable("agentSelection.resolveScaffoldSpecs") },
		runOrchestration: {
			executeAgentRunRequest: unreachable("runOrchestration.executeAgentRunRequest"),
		},
		sessionRequests: { enqueueWorkIntent: unreachable("sessionRequests.enqueueWorkIntent") },
		cost: { getFactoryCostActual: unreachable("cost.getFactoryCostActual") },
		review: { createPracticeMeeting: unreachable("review.createPracticeMeeting") },
		knowledge: {
			runAutoPromotionSweep: unreachable("knowledge.runAutoPromotionSweep"),
			runStaleSweep: unreachable("knowledge.runStaleSweep"),
			listRecentByLayers: unreachable("knowledge.listRecentByLayers"),
			recomputeAttentionForCandidates: unreachable("knowledge.recomputeAttentionForCandidates"),
		},
		toolHandlers: {
			buildAssistantDraftRegistry: unreachable("toolHandlers.buildAssistantDraftRegistry"),
		},
		workspaceFactory: { create: unreachable("workspaceFactory.create") },
	};
}

function buildAssistantSessionRequest(opts: {
	readonly id: string;
	readonly userId: string;
	readonly threadId: string;
	readonly messageId: string;
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
		promptMode: "conversational",
		payloadJson: null,
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
		createdAt: NOW,
		updatedAt: NOW,
	};
}

async function seedFounderAndAssistantThread(
	db: HyperIdleDb,
	opts: { readonly founderId: string; readonly threadId: string },
): Promise<void> {
	const assistantAgentId = `ast-${opts.founderId}`;
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "user",
		hostId: opts.founderId,
		initiatorId: opts.founderId,
		participants: JSON.stringify([opts.founderId, assistantAgentId]),
		pinned: false,
		lastActiveAt: NOW,
		createdAt: NOW,
	});
}

describe("dispatch assistant-turn writes — Increment 2 conversation wave wiring (RED)", () => {
	test("runAssistantTurn's missing-credential failure notice reaches the seam's insertMessage (real route, real DB row)", async ({
		db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-dispatch-key-notice");
		// No ANTHROPIC_API_KEY and no credentialResolver forces the deterministic
		// missing-credential branch (`runTurnInternal`, `service.ts:342-354`) —
		// straight to `persistTurnFailureInternal`'s `insertMessage`, before any
		// other port is touched.
		vi.stubEnv("ANTHROPIC_API_KEY", "");

		const founderId = "founder-dispatch-notice";
		const threadId = "thread-dispatch-notice";
		const assistantAgentId = `ast-${founderId}`;
		await seedFounderAndAssistantThread(db, { founderId, threadId });

		const ports = buildDispatchPortsForAssistantTurnMigration(app, assistantAgentId);
		const dispatchOps = createDispatchOps(ports);

		// The seam's `POST /threads/:id/messages` route is the canonical
		// `thread_message_appended` emitter for this write — dispatch must NOT
		// also emit its own copy (that would double-fire with a stale local
		// messageId matching no persisted row). Count emissions on the SAME
		// eventBus the route publishes to.
		const appendedEvents: ThreadMessageAppendedEvent[] = [];
		const unsubscribe = eventBus.on(
			"thread_message_appended",
			(event: ThreadMessageAppendedEvent) => {
				if (event.threadId === threadId) appendedEvents.push(event);
			},
		);

		const deps: RunAssistantTurnDeps = { db, eventBus, adapterPool: {} };
		const request = buildAssistantSessionRequest({
			id: "asr-dispatch-notice",
			userId: founderId,
			threadId,
			messageId: "msg-dispatch-notice-trigger",
		});

		await dispatchOps.runAssistantTurn(deps, request);
		unsubscribe();

		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		const notice = rows.find((r) => r.senderId === assistantAgentId);
		expect(notice).toBeDefined();
		const payload = JSON.parse(notice?.payload ?? "{}") as { notice?: { kind: string } };
		expect(payload.notice?.kind).toBe("missing_key");

		expect(appendedEvents).toHaveLength(1);
		expect(appendedEvents[0]?.messageId).toBe(notice?.id);
	});

	test("runAssistantTurn's failure-notice write is rejected (not silently bypassed) with no seam credentials", async ({
		db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-dispatch-key-notice-noauth");
		vi.stubEnv("ANTHROPIC_API_KEY", "");

		const founderId = "founder-dispatch-noauth";
		const threadId = "thread-dispatch-noauth";
		await seedFounderAndAssistantThread(db, { founderId, threadId });

		// No actorId — the transport carries no actor/API-key wrapping at all.
		// If the seam bypassed real auth, the notice would still land.
		const ports = buildDispatchPortsForAssistantTurnMigration(app, undefined);
		const dispatchOps = createDispatchOps(ports);

		const deps: RunAssistantTurnDeps = { db, eventBus, adapterPool: {} };
		const request = buildAssistantSessionRequest({
			id: "asr-dispatch-noauth",
			userId: founderId,
			threadId,
			messageId: "msg-dispatch-noauth-trigger",
		});

		await expect(dispatchOps.runAssistantTurn(deps, request)).rejects.toThrow();
	});

	test("registerAssistantTriggerInternal's pin-after-first-response reaches the seam's updateThread (real route, real DB row)", async ({
		db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-dispatch-key-pin");

		const founderId = "founder-dispatch-pin";
		const threadId = "thread-dispatch-pin";
		const assistantAgentId = `ast-${founderId}`;
		await seedFounderAndAssistantThread(db, { founderId, threadId });
		// registerAssistantTriggerInternal also loads the SENDER row — the
		// assistant agent itself must exist as a real `kind:"ai"` user.
		await db.insert(users).values({
			id: assistantAgentId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: NOW,
		});

		const ports = buildDispatchPortsForAssistantTurnMigration(app, assistantAgentId);
		const dispatchOps = createDispatchOps(ports);
		const dispose = await dispatchOps.start({ db, eventBus });

		try {
			const event: ThreadMessageAppendedEvent = {
				type: "thread_message_appended",
				streamId: threadId,
				threadId,
				messageId: "msg-dispatch-pin-reply",
				messageType: "plain",
				senderId: assistantAgentId,
				timestamp: Date.now(),
			};
			eventBus.emit(event);

			// The handler is registered as a fire-and-forget async IIFE inside the
			// event listener — give it a tick to complete before asserting.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
			expect(row?.pinned).toBe(true);
		} finally {
			dispose();
		}
	});
});
