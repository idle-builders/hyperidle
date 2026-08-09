/**
 * AU21 §9 Increment 11 (Decision H2 / F4) — Wave B, RED phase.
 *
 * architecture.md §9 Increment 11: "Move the pin into a core-api
 * `thread_message_appended` subscriber reading sender `kind` via same-layer
 * DI to `users` (F4); delete `registerAssistantTriggerInternal`." Per the
 * task's own framing: the "pin thread after first AI reply" decision
 * currently lives in `dispatch/src/service.ts`'s
 * `registerAssistantTriggerInternal` (reading `ports.conversation.getThreadById`
 * + `ports.users.getUserById` — an `agent-orchestration -> core-api` READ).
 * This wave moves the decision ENTIRELY into core-api, reacting to core-api's
 * OWN `thread_message_appended` event, obtaining the sender's `kind` via an
 * ordinary same-layer core-api DI call to `users` — the `cost-cap.ts`
 * precedent (`CostDeps`), not a cross-layer edge.
 *
 * This test proves the OBSERVABLE CONTRACT — a real assistant-thread's
 * `pinned` column flips to `true` after the first AI-authored reply — using
 * ONLY core-api's own composition root (`createApp`, the `{ db, app,
 * eventBus }` fixture). It deliberately never imports or touches
 * `@hyperidle/dispatch` (or `dispatchOps.start`) at all: today, `createApp`
 * wires ZERO pin-related subscriber (confirmed by reading `app.ts` +
 * `server-factory.ts` — no "pin"/"Pin" reference in either file), so pinning
 * — for a core-api-only composition — does not yet happen at all. Once the
 * new core-api subscriber lands (GREEN phase), it fires from `createApp`'s
 * own wiring with no `dispatch` involvement, which is exactly the point:
 * `dispatch` should hold zero `-> core-api` edge of any kind after this wave,
 * and the pin behavior must therefore be provable WITHOUT `dispatch` in the
 * picture at all.
 *
 * Currently RED: after the assistant-authored reply + a settle tick, the
 * thread's `pinned` column is still `false` — nothing reacts to
 * `thread_message_appended` inside `createApp`'s own composition. GREEN phase
 * adds the new core-api subscriber (a `@hyperidle/conversation`-owned
 * reaction per Mechanism C, composed in at `app.ts`/`server-factory.ts`).
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-31T00:00:00.000Z";

interface SeamMessageWriteAccessor {
	readonly conversation: {
		insertMessage(input: {
			readonly threadId: string;
			readonly type: "plain";
			readonly payload: Record<string, unknown>;
			readonly clientKey: string;
		}): Promise<{ readonly id: string }>;
	};
}

function seamPortForActor(actorId: string, app: Hono): SeamMessageWriteAccessor {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), { userId: actorId });
	return buildCoreApiPort(transport) as unknown as SeamMessageWriteAccessor;
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("assistant thread pin — core-api-owned subscriber, zero dispatch involvement (Increment 11, RED)", () => {
	test("a human reply does NOT pin the thread, but the first AI-authored reply does — via createApp's own composition alone", async ({
		db,
		app,
		eventBus,
	}) => {
		void eventBus; // the app fixture already shares this bus with `createApp`; no manual wiring needed.
		vi.stubEnv("HYPERIDLE_API_KEY", "inc11-pin-coreapi-key");

		const founderId = "founder-inc11-pin-coreapi";
		const threadId = "thread-inc11-pin-coreapi";
		const assistantAgentId = `ast-${founderId}`;

		await db.insert(users).values({
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: assistantAgentId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: founderId,
			initiatorId: founderId,
			participants: JSON.stringify([founderId, assistantAgentId]),
			pinned: false,
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const founderPort = seamPortForActor(founderId, app);
		const assistantPort = seamPortForActor(assistantAgentId, app);

		// A human-authored message must NOT pin the thread.
		await founderPort.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "a human question" },
			clientKey: `ck-inc11-pin-human-${crypto.randomUUID()}`,
		});
		await settle();

		const [afterHuman] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(afterHuman?.pinned).toBe(false);

		// The first AI-authored reply must pin the thread — via core-api's OWN
		// composition, with zero `@hyperidle/dispatch` involvement.
		await assistantPort.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "the assistant's first reply" },
			clientKey: `ck-inc11-pin-ai-${crypto.randomUUID()}`,
		});
		await settle();

		const [afterAiReply] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(afterAiReply?.pinned).toBe(true);
	});
});
