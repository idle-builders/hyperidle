/**
 * AU21 §9 Increment 11 (Decision H2 "Coherence — reconciled via Decision B‴")
 * — Wave B, RED phase.
 *
 * architecture.md §6 Decision H's H2 subsection: "Baking the full transcript
 * at emit is stale for the concurrent-message case: msg2 emitted while turn1
 * is still running bakes a transcript missing turn1's not-yet-written reply
 * ... The fix is the machinery AU21 already designs — Decision B‴'s
 * continued-push/supersede: when turn1's reply lands while an `assistant_turn`
 * for that thread is still pending, core re-emits (re-bakes) the pending
 * intent with the current transcript ... This wires B‴ to a new trigger (a
 * thread reply superseding a pending same-thread `assistant_turn`)." §9
 * Increment 11: "(a) coherence — msg2 emitted while turn1 runs, turn1 posts
 * its reply; assert the queued `assistant_turn` is re-baked (B‴ supersede) so
 * turn2 runs with a transcript INCLUDING turn1's reply, with zero
 * orchestration read."
 *
 * This test reuses the EXISTING B‴ supersede machinery verbatim (the
 * `superseded` status + `findNewerPendingSiblingInternal`'s drain check,
 * already proven by the sibling file
 * `agent-work-intent-supersede.integration.test.ts`) — it does not re-test
 * that mechanism. What it proves is the NEW TRIGGER this wave adds: posting a
 * reply into a thread (`thread_message_appended`) must, when a same-thread
 * `assistant_turn` intent is still pending, cause core-api to RE-BAKE + RE-
 * EMIT that pending intent (a second row for the same `(kind, sourceId)`
 * identity with a fresher `idempotencyKey` and a transcript that now includes
 * the just-posted reply) — exactly the same emit-time resolver
 * (`resolveAssistantTurnRequest`) the real `POST /threads/:id/messages` route
 * already calls at emit time (§9 Increment 3 / `routes/threads.ts:1365`).
 *
 * Scenario (the exact one named in §9 Increment 11):
 *   1. Human posts msg1 → bakes+records `assistant_turn` intent1 (sourceId =
 *      msg1.id). The drain hands it off (`handed_off`) — this represents
 *      "turn1 is running."
 *   2. Human posts msg2 WHILE turn1 is still in flight → bakes+records
 *      `assistant_turn` intent2 (sourceId = msg2.id, status `pending`) with a
 *      transcript that does NOT yet include any assistant reply (none has
 *      been posted).
 *   3. The assistant agent posts its reply (msg3, `senderId = ast-<founderId>`)
 *      — the real `insertMessage` route used by both `dispatch`'s
 *      `runTurnInternal` and `persistTurnFailureInternal` today. This does
 *      NOT record a NEW `assistant_turn` intent (the route's own
 *      `recordsAssistantIntent` guard excludes `ast-`-prefixed senders) — it
 *      only emits `thread_message_appended`.
 *   4. RED today: nothing reacts to that event to re-bake intent2. GREEN
 *      target: a core-api handler for `thread_message_appended` finds
 *      intent2 (still `pending`, same thread) and re-bakes+re-emits it — a
 *      THIRD row for `(assistant_turn, msg2.id)` with a fresher
 *      `idempotencyKey` whose baked transcript now includes msg3.
 *   5. Draining afterward supersedes the stale intent2-v1 and hands off the
 *      fresh intent2-v2 — exactly one session request for msg2's identity,
 *      and ITS transcript includes turn1's reply.
 *
 * Zero orchestration read: this test never imports or exercises
 * `@hyperidle/dispatch` (or any other `agent-orchestration` package) at all —
 * every step is a real core-api route call (`POST /threads/:id/messages`) or
 * a call into `@hyperidle/session-requests`'s OWN drain over ALREADY-BAKED
 * rows (the same `drainIntents`/`queueDeps` machinery
 * `agent-work-intent-supersede.integration.test.ts` already exercises) — no
 * domain read back into core-api of any kind.
 *
 * Currently RED: after step 3 + a settle tick, querying
 * `agent_work_intents` for `(kind='assistant_turn', sourceId=msg2.id)`
 * returns exactly 1 row (only intent2-v1) — no re-bake trigger exists yet.
 * The `toHaveLength(2)` assertion below fails for that reason. GREEN phase
 * adds the new core-api subscriber described in `architecture.md` §9
 * Increment 11 / §6 Decision H2.
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import {
	agentSessionRequests,
	agentWorkIntents,
	filesystemInjections,
	filesystems,
	serviceConnections,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
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

interface BakedTranscriptRowView {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

function parseTranscript(bakedRequestJson: string | null): readonly BakedTranscriptRowView[] {
	if (!bakedRequestJson) return [];
	const parsed = JSON.parse(bakedRequestJson) as { transcript?: readonly BakedTranscriptRowView[] };
	return parsed.transcript ?? [];
}

describe("assistant_turn B‴ coherence trigger — a thread reply re-bakes a pending same-thread intent (Increment 11, RED)", () => {
	test("msg2's pending assistant_turn is re-baked+superseded once turn1's reply lands, and the transcript that eventually runs includes turn1's reply", async ({
		db,
		app,
		eventBus,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc11-b3-coherence-key");

		const founderId = ids("founder-inc11-b3-coherence");
		const threadId = ids("thread-inc11-b3-coherence");
		const assistantAgentId = `ast-${founderId}`;
		const teamId = ids("team-inc11-b3-coherence");
		const teamMembersId = ids("team-inc11-b3-coherence-members");
		const fsId = ids("fs-inc11-b3-coherence");
		const scId = ids("sc-inc11-b3-coherence");

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

		// AU21 review fix (non-blocking finding): the assistant agent has an
		// injected filesystem — `rebakePendingSiblingsForThread`'s re-bake must
		// carry it forward too (same class of gap as the granted-reengagement
		// blocking finding, on this race-only rebake path).
		await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
		// The owner writes the membership row alongside the team.
		await db.insert(teamMembers).values({
			id: teamMembersId,
			teamId,
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(filesystems).values({
			id: fsId,
			teamId,
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "doc_set", folder: "/docs" }),
			writeback: "file",
			state: "attached",
			createdAt: NOW,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: assistantAgentId,
			filesystemId: fsId,
			createdAt: NOW,
		});

		// @lore AU26 E3: this held connection backed K1's assertion that both
		// `assistant_turn` emit sites baked the owning human's connections onto
		// the intent. The bake is deleted — connections are read live at spawn —
		// so the row now only proves the emit path is unaffected by one
		// existing.
		await db.insert(serviceConnections).values({
			id: scId,
			userId: founderId,
			service: "github",
			authSource: "token",
			encryptedToken: "inc11-b3-coherence-encrypted-placeholder",
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const founderPort = seamPortForActor(founderId, app);
		const assistantPort = seamPortForActor(assistantAgentId, app);
		const deps = { ...queueDeps(db), eventBus };

		// --- Step 1: msg1, turn1 dispatched (drained → handed_off = "running") ---
		const msg1 = await founderPort.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "first question" },
			clientKey: `ck-inc11-b3-msg1-${crypto.randomUUID()}`,
		});
		await drainIntents(deps);
		const [intent1] = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(eq(agentWorkIntents.kind, "assistant_turn"), eq(agentWorkIntents.sourceId, msg1.id)),
			);
		expect(intent1?.status).toBe("handed_off");
		expect(intent1?.bakedRequestJson ?? "").not.toContain("injectedConnections");

		// --- Step 2: msg2 queues behind the in-flight turn1 ---
		const msg2 = await founderPort.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "second question, queued behind turn1" },
			clientKey: `ck-inc11-b3-msg2-${crypto.randomUUID()}`,
		});
		const [intent2Original] = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(eq(agentWorkIntents.kind, "assistant_turn"), eq(agentWorkIntents.sourceId, msg2.id)),
			);
		expect(intent2Original?.status).toBe("pending");
		// Sanity: at bake time, msg2's transcript does not yet contain any
		// assistant reply (turn1 has not posted one yet).
		const originalTranscript = parseTranscript(intent2Original?.bakedRequestJson ?? null);
		expect(originalTranscript.some((row) => row.senderId === assistantAgentId)).toBe(false);
		// Force this row unambiguously OLDER so the eventual supersede-ordering
		// assertion below can never be a coin-flip between same-millisecond
		// inserts (same technique as `agent-work-intent-supersede.integration.test.ts`).
		const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		if (intent2Original) {
			await db
				.update(agentWorkIntents)
				.set({ createdAt: anHourAgo, updatedAt: anHourAgo })
				.where(eq(agentWorkIntents.id, intent2Original.id));
		}

		// --- Step 3: turn1 posts its reply (the real `dispatch` insertMessage path) ---
		const replyText = "turn1's reply — must be visible to msg2's eventual turn";
		await assistantPort.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: replyText },
			clientKey: `ck-inc11-b3-reply-${crypto.randomUUID()}`,
		});

		// Give a fire-and-forget async subscriber a tick to complete (same
		// idiom `core-api-port-increment2-dispatch-assistant-turn.integration.test.ts`'s
		// pin test already uses for its own event-reaction assertion).
		await new Promise((resolve) => setTimeout(resolve, 50));

		// --- RED assertion: a fresh re-baked version of msg2's intent must exist ---
		const msg2IntentRows = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(eq(agentWorkIntents.kind, "assistant_turn"), eq(agentWorkIntents.sourceId, msg2.id)),
			)
			.orderBy(agentWorkIntents.createdAt);
		expect(msg2IntentRows).toHaveLength(2);

		const freshIntent = msg2IntentRows[msg2IntentRows.length - 1] as
			| (typeof msg2IntentRows)[number]
			| undefined;
		expect(freshIntent?.idempotencyKey).not.toBe(intent2Original?.idempotencyKey);
		const freshTranscript = parseTranscript(freshIntent?.bakedRequestJson ?? null);
		expect(
			freshTranscript.some(
				(row) => row.senderId === assistantAgentId && row.payload.includes(replyText),
			),
		).toBe(true);
		// @lore AU26 F2: this used to assert the re-baked intent still carried the
		// assistant agent's injected filesystems. That bake is deleted — the spawn
		// reads the injection record live and in-layer — so the rebake path must
		// carry nothing about filesystems either.
		expect(freshIntent?.bakedRequestJson ?? "").not.toContain("injectedFilesystems");
		// @lore AU26 E3: K1's connection assertion here is gone with the bake.
		// The rebake path must still carry nothing about connections.
		expect(freshIntent?.bakedRequestJson ?? "").not.toContain("injectedConnections");

		// --- Step 5: drain — old superseded, fresh handed off, ONE session, coherent ---
		await drainIntents(deps);

		const drainedRows = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(eq(agentWorkIntents.kind, "assistant_turn"), eq(agentWorkIntents.sourceId, msg2.id)),
			);
		expect(drainedRows).toHaveLength(2);
		const statuses = drainedRows.map((row) => row.status).sort();
		expect(statuses).toEqual(["handed_off", "superseded"]);

		const dispatchedForMsg2 = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, msg2.id));
		expect(dispatchedForMsg2).toHaveLength(1);

		const finalTranscript = (
			JSON.parse(dispatchedForMsg2[0]?.payloadJson ?? "{}") as {
				transcript?: readonly BakedTranscriptRowView[];
			}
		).transcript;
		expect(
			finalTranscript?.some(
				(row) => row.senderId === assistantAgentId && row.payload.includes(replyText),
			),
		).toBe(true);
	});
});
