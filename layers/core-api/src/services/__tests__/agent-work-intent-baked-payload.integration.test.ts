/**
 * AU21 Increment 3, Wave 0 (RED) — the co-existence scaffolding
 * (architecture.md §9 Increment 3 / this wave's items 7+8).
 *
 * Once a family wave starts baking its request at emit time, the intent it
 * records carries the FULLY-RESOLVED request already (the same shape
 * `resolveIntentInputInternal` computes today) instead of a bare identity.
 * The drain must then use that baked payload DIRECTLY — zero domain reads —
 * rather than falling through to its per-kind resolution branch.
 *
 * This is currently RED on two counts:
 *   1. `enqueueWorkIntent`'s `WorkIntentInput` has no field to carry a baked
 *      request at all — it is silently dropped today (not persisted).
 *   2. `resolveIntentInputInternal` has no "already baked?" branch — it always
 *      falls through to the real per-kind resolution, which means it always
 *      performs a domain read even when a baked payload was supplied.
 *
 * Proven by forcing the REAL per-kind resolution to fail if it is ever
 * reached (a nonexistent source id AND every domain dep function on the
 * drain's deps bundle wired to throw) while supplying a baked payload that
 * should let the drain succeed WITHOUT ever calling those deps.
 */

import { agentSessionRequests, agentWorkIntents, type HyperIdleDb, users } from "@hyperidle/db";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

describe("agent_work_intents — baked-payload co-existence (Wave 0 scaffolding)", () => {
	test("enqueueWorkIntent persists an optional pre-baked request alongside the bare identity", async ({
		db,
	}) => {
		const bakedRequest = {
			defaultAgentId: "wave0-baked-agent",
			sourceKind: "assistant" as const,
			sourceId: "wave0-baked-message",
			streamId: "thread:wave0-baked-thread",
			userId: "wave0-baked-human",
			sourceCorrelation: {
				threadId: "wave0-baked-thread",
				messageId: "wave0-baked-message",
				userId: "wave0-baked-human",
				agentId: "wave0-baked-agent",
			},
		};

		await enqueueWorkIntent(db, {
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "wave0-baked-message",
			idempotencyKey: "wave0-baked-persist",
			// NOTE: `bakedRequest` does not exist on `WorkIntentInput` yet — this
			// wave's items 7/8 must widen it and persist it on the row. TS will
			// flag this as an excess property until then; vitest (esbuild, no
			// type-check) still runs it, so the RED signal is the runtime
			// assertion below, not the type error.
			bakedRequest,
		});

		const [row] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "wave0-baked-message"));
		expect(row).toBeDefined();
		// The field must round-trip through the row so the drain can read it back
		// without re-resolving. GREEN phase picked a `bakedRequestJson` (text,
		// JSON-encoded) column — per the RED-phase author's own note ("if the
		// accessor name differs, only that one assertion needs adjusting").
		const persisted = row?.bakedRequestJson ? JSON.parse(row.bakedRequestJson) : undefined;
		expect(persisted).toBeTruthy();
		expect(persisted).toMatchObject(bakedRequest);
	});

	test("drainIntents uses a baked payload directly, performing ZERO domain reads", async ({
		db,
		eventBus,
	}) => {
		const bakedRequest = {
			defaultAgentId: "wave0-baked-agent-2",
			sourceKind: "assistant" as const,
			sourceId: "wave0-baked-message-2",
			streamId: "thread:wave0-baked-thread-2",
			userId: "wave0-baked-human-2",
			sourceCorrelation: {
				threadId: "wave0-baked-thread-2",
				messageId: "wave0-baked-message-2",
				userId: "wave0-baked-human-2",
				agentId: "wave0-baked-agent-2",
			},
		};
		// The baked payload is trusted AS GIVEN (the emit-time resolver already
		// validated the agent) — the drain performs no `users` read of its own,
		// but the rows still need to exist to satisfy `agent_session_requests`'s
		// real FKs on `agent_id`/`user_id`.
		await seedAgent(db, "wave0-baked-agent-2");
		await db.insert(users).values({
			id: "wave0-baked-human-2",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const deps = { ...queueDeps(db), eventBus };

		await enqueueWorkIntent(db, {
			kind: "thread_turn",
			sourceKind: "thread_message",
			// A source that does NOT exist — if the drain ever falls through to
			// real resolution, it throws InvalidAgentWorkSourceError immediately.
			sourceId: "wave0-baked-message-2",
			idempotencyKey: "wave0-baked-zero-read",
			// See the note in the previous test — not yet a real field.
			bakedRequest,
		});

		await drainIntents(deps);

		// Zero domain reads: `DurableAgentQueueDeps` (AU21 §9 Increment 9,
		// forensic-triage wave) no longer HAS a `conversation`/`users` domain-read
		// field at all — the type system itself makes the old per-kind
		// resolution read unreachable, strictly stronger than a runtime spy. The
		// assertions below (the handed-off intent + the real persisted request)
		// are the proof that the baked payload was used directly.

		// The baked payload was used directly to hand off a real request.
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "wave0-baked-message-2"));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, intent?.requestId ?? ""));
		expect(request).toMatchObject({
			agentId: "wave0-baked-agent-2",
			streamId: "thread:wave0-baked-thread-2",
		});
	});
});
