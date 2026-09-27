/**
 * @lore a human `send_message` into a direct thread wakes the agent, whose own `send_message` is the only way its turn ends.
 *
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 *
 * @lore builds composition through the shared `setUpLiveHarnessRun` — `layers/core-api` may not import `@hyperidle/agent-execution` directly.
 */

import { randomUUID } from "node:crypto";
import {
	type AgentSessionRequest,
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type {
	OpenThreadInput,
	SendMessageInput,
	SendMessageOutput,
	ThreadView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import {
	assertRunOutcomeCompleted,
	assertSessionRowDone,
	HARNESS_TYPE,
	runnerFor,
	setUpLiveHarnessRun,
} from "../__testing__/live-harness-test-support.js";
import type { Action } from "../actions/action.js";
import { SESSION_NOT_RETURNED_NOTICE_TEXT } from "../services/session-not-returned-notice.js";

const NOW = "2026-09-18T00:00:00.000Z";

// @lore a vitest timeout skips `runThreadTurnProof`'s own finally cleanup — this afterEach sweeps every live session's process group as the backstop.
afterEach(() => {
	stopAllLiveHarnessSessions();
});
const PROMPT = "Reply with exactly: THREAD_TURN_OK";

async function seedFounderAndAgent(
	db: HyperIdleDb,
	opts: {
		readonly founderId: string;
		readonly agentId: string;
		readonly harnessType: string;
		readonly modelId: string;
	},
): Promise<void> {
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Live Harness Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "Live Harness Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// @lore the run-config selector (`harnessType`) lives in `agent_run_config`, read live — not on the `users` identity row.
	await db.insert(agentRunConfig).values({
		agentUserId: opts.agentId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
}

/**
 * The human's door: a direct `send_message` with `recipients:[agentId]`
 * (no existing thread) — opens the thread, bakes the real `thread_turn` work
 * intent (`sendMessageRun`'s wake step, `thread-actions.ts`), drains it into a
 * real `agent_session_requests` row (the same drain the poller calls on a
 * timer — invoked once here), and returns that claimable row plus the
 * thread it opened.
 */
async function postAndDrainThreadTurnRequest(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	opts: { readonly founderId: string; readonly agentId: string; readonly text: string },
): Promise<{ readonly request: AgentSessionRequest; readonly threadId: string }> {
	const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");
	const result = await sendMessage(
		{ actor: opts.founderId, db, eventBus, now: new Date().toISOString() },
		{
			recipients: [opts.agentId],
			text: opts.text,
			clientKey: `live-harness-${randomUUID()}`,
		},
	);
	if (!result.ok) {
		throw new Error(`send_message failed: ${JSON.stringify(result.problems)}`);
	}
	const messageId = result.data.message.id;
	const threadId = result.data.thread.id;

	// The intent's own `sourceId` is `${messageId}:${agentId}` — one intent
	// per woken agent (`thread-actions.ts`'s wake loop), not the bare
	// message id.
	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.sourceId, `${messageId}:${opts.agentId}`));
	if (!intent) {
		throw new Error(
			`No agent_work_intents row recorded for message ${messageId}, agent ${opts.agentId}`,
		);
	}
	expect(intent.kind).toBe("thread_turn");

	await drainIntents({ ...queueDeps(db), eventBus });

	// The drained `agent_session_requests` row keeps the BAKED `sourceId`
	// (`BakedThreadTurnRequest.sourceId` = the bare message id), unlike the
	// intent row above.
	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, messageId));
	if (!request) {
		throw new Error(`drainIntents did not produce an agent_session_requests row for ${messageId}`);
	}
	return { request, threadId };
}

describe("a human's send_message wakes an agent, whose own send_message ends the turn (real harness)", () => {
	/**
	 * Shared proof body — every harness runs the identical real path. Each
	 * caller below wraps this in its OWN `describe` with a LITERAL
	 * `requireHarness("<name>")` call, one per harness — kept ungreppable-proof
	 * by not collapsing these into a loop.
	 */
	async function runThreadTurnProof(harness: SupportedHarnessName, db: HyperIdleDb): Promise<void> {
		const founderId = `founder-thread-turn-${harness}`;
		const agentId = `agent-thread-turn-${harness}`;
		const harnessType = HARNESS_TYPE[harness];

		await seedFounderAndAgent(db, {
			founderId,
			agentId,
			harnessType,
			// The locked test model, seeded where production puts it — on the
			// agent's own run config. It reaches the harness as `selectedModel`.
			modelId: HARNESS_TEST_MODELS[harness].model,
		});

		const run = await setUpLiveHarnessRun(db, `thread-turn-${harness}`);

		try {
			const { request, threadId } = await postAndDrainThreadTurnRequest(
				db,
				run.eventBus,
				run.actions,
				{ founderId, agentId, text: PROMPT },
			);

			const adapterPool = run.adapterPool;
			const workspace = run.workspace;
			const result = await run.composition.runSession(
				{ db, eventBus: run.eventBus, adapterPool, workspace },
				{ mode: "durable", request, sandboxBasePath: run.sandboxBasePath, completion: "await" },
			);

			expect(result.mode).toBe("completed");
			if (result.mode !== "completed") return;
			await assertRunOutcomeCompleted(db, request, result, harness);

			const openThread = runnerFor<OpenThreadInput, ThreadView>(run.actions, "open_thread");
			const view = await openThread(
				{ actor: founderId, db, eventBus: run.eventBus, now: new Date().toISOString() },
				{ id: threadId },
			);
			if (!view.ok) {
				throw new Error(`open_thread failed: ${JSON.stringify(view.problems)}`);
			}

			const agentReply = view.data.messages.find((m) => m.senderId === agentId);
			expect(agentReply, `no reply message from ${agentId} on ${harness}`).toBeDefined();

			// A message merely EXISTING from `agentId` is not proof of a real
			// reply — assert the actual reply TEXT, and explicitly rule out the
			// never-silent net's fixed notice (unwired in this fixture, so this
			// guards against a coincidental match rather than that specific
			// reaction).
			const payload = agentReply?.payload as { text?: string } | undefined;
			expect(
				payload?.text,
				`agent reply on ${harness} had no text payload: ${JSON.stringify(agentReply)}`,
			).toBeDefined();
			expect(
				payload?.text,
				`agent reply on ${harness} was the never-silent notice, not a real reply — the agent never called send_message`,
			).not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);
			expect(
				payload?.text,
				`agent reply on ${harness} did not contain the required text: ${payload?.text}`,
			).toContain("THREAD_TURN_OK");

			// The in-memory result above proves the provisioner's own view of the
			// run; the persisted row is the independent proof that teardown wrote
			// the same verdict — the bug this test guards against (opencode's own
			// return persisted as state/outcome "stopped" while the in-memory
			// result said "completed") passed on the in-memory assertions alone.
			await assertSessionRowDone(db, result.sessionId, harness);
		} finally {
			await run.teardown();
		}
	}

	describe("[harness:claude]", () => {
		requireHarness("claude");
		dbTest(
			"a thread turn on claude-code ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("claude", db),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		dbTest(
			"a thread turn on codex ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("codex", db),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		dbTest(
			"a thread turn on opencode ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("opencode", db),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		dbTest(
			"a thread turn on cursor-agent ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("cursor-agent", db),
			180_000,
		);
	});
});
