/**
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 *
 */

import { randomUUID } from "node:crypto";
import { agentRunConfig, type HyperIdleDb, users } from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type {
	OpenThreadInput,
	SendMessageInput,
	SendMessageOutput,
	ThreadView,
} from "@hyperidle/domain-model";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { giveUserKey } from "@hyperidle/user";
import { afterEach, describe, expect } from "vitest";
import {
	assertSessionRowDone,
	HARNESS_TYPE,
	runnerFor,
	setUpLiveHarnessRun,
	waitForEffect,
	waitForSessionCompleted,
} from "../__testing__/live-harness-test-support.js";
import { SESSION_NOT_RETURNED_NOTICE_TEXT } from "../services/session-not-returned-notice.js";

const NOW = "2026-09-18T00:00:00.000Z";

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
	await db.insert(agentRunConfig).values({
		agentUserId: opts.agentId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
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
		const personKey = `person-key-thread-turn-${harness}`;
		const harnessType = HARNESS_TYPE[harness];

		await seedFounderAndAgent(db, {
			founderId,
			agentId,
			harnessType,
			// The locked test model, seeded where production puts it — on the
			// agent's own run config. It reaches the harness as `selectedModel`.
			modelId: HARNESS_TEST_MODELS[harness].model,
		});
		await giveUserKey(db, founderId, personKey);

		const run = await setUpLiveHarnessRun(db, `thread-turn-${harness}`, personKey);

		try {
			await run.runner.start();

			const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(
				run.actions,
				"send_message",
			);
			const sendResult = await sendMessage(
				{ actor: founderId, db, eventBus: run.eventBus, now: new Date().toISOString() },
				{
					recipients: [agentId],
					text: PROMPT,
					clientKey: `live-harness-${randomUUID()}`,
				},
			);
			if (!sendResult.ok) {
				throw new Error(`send_message failed: ${JSON.stringify(sendResult.problems)}`);
			}
			const threadId = sendResult.data.thread.id;

			const agentReply = await waitForEffect("agent reply", async () => {
				const openThread = runnerFor<OpenThreadInput, ThreadView>(run.actions, "open_thread");
				const view = await openThread(
					{ actor: founderId, db, eventBus: run.eventBus, now: new Date().toISOString() },
					{ id: threadId },
				);
				if (!view.ok) return undefined;
				const reply = view.data.messages.find((m) => m.senderId === agentId);
				if (!reply) return undefined;
				const payload = reply.payload as { text?: string } | undefined;
				if (!payload?.text) return undefined;
				return reply;
			});

			const payload = agentReply.payload as { text?: string } | undefined;
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

			// The in-memory effect above proves the provisioner's own view of the run;
			// the persisted row is the independent proof that teardown wrote the same
			// verdict — the bug this test guards against (opencode's own return
			// persisted as state/outcome "stopped" while the in-memory result said
			// "completed") passed on the in-memory assertions alone.
			const sessionId = await waitForSessionCompleted(db, agentId, harness);
			await assertSessionRowDone(db, sessionId, harness);
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
