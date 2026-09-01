/**
 * A review is tied to the block that caused it — and only then.
 *
 * The clearance a human grants is authorised by the `gate_reviews` row, so the
 * question this file settles is which reviews get one. An agent that was blocked
 * gets one; an agent filing an ordinary design review does not, because otherwise
 * approving any review at all would grant a bypass.
 *
 * @lore BA2: That bypass is not hypothetical — an abandoned attempt registered on
 * every `submit_review`. Both directions are asserted against the persisted
 * `gate_reviews` rows, never against a spy call count, because the defect being
 * pinned is about what ends up in the database.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	gateReviews,
	type HyperIdleDb,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-09-01T00:00:00.000Z";

let sharedDb: HyperIdleDb;

/**
 * Stands in for the action gate's in-memory store. The production wiring reads
 * `harnessRuntime.pendingGateDenial`; what matters to this file is only whether
 * a denial is pending for the session, so the fake is a map the test controls.
 */
const pendingDenials = new Map<string, { ruleId: string; toolName: string }>();

/**
 * The row `recordGateReview` writes, written here directly. tool-handlers does
 * not depend on run-orchestration and must not grow that dependency for a test;
 * what this file is about is which reviews get a row, not who inserts it.
 */
async function writeGateReview(link: {
	reviewMessageId: string;
	sessionId: string;
	ruleId: string;
	toolName: string;
}): Promise<void> {
	await sharedDb
		.insert(gateReviews)
		.values({ id: crypto.randomUUID(), ...link, createdAt: NOW })
		.onConflictDoNothing({ target: gateReviews.reviewMessageId });
}

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	gate: {
		linkReviewToPendingDenial: async (sessionId, reviewMessageId) => {
			const denial = pendingDenials.get(sessionId);
			if (!denial) return;
			await writeGateReview({
				reviewMessageId,
				sessionId,
				ruleId: denial.ruleId,
				toolName: denial.toolName,
			});
		},
	},
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		getTaskById: async (id: string) => {
			const [row] = await sharedDb.select().from(tasks).where(eq(tasks.id, id));
			return row
				? { parentTaskId: row.parentTaskId ?? null, teamId: row.teamId, notes: row.notes ?? null }
				: undefined;
		},
		resolveReviewRecipientsForItem: async () => {
			const humans = await sharedDb.select().from(users).where(eq(users.kind, "human"));
			return humans.map((u) => u.id);
		},
		getFirstThreadByHost: async (hostKind: string, hostId: string) => {
			const [row] = await sharedDb
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, hostKind as never), eq(threads.hostId, hostId)));
			return row
				? { id: row.id, participants: JSON.parse(row.participants) as string[] }
				: undefined;
		},
		insertThread: async (input) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(threads).values({
				id,
				hostKind: input.hostKind as never,
				hostId: input.hostId,
				initiatorId: input.participants[0] ?? "agent-builder",
				participants: JSON.stringify(input.participants),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			return { id };
		},
		updateThread: async () => {},
		insertMessage: async (input, actorId) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(messages).values({
				id,
				senderId: actorId,
				threadId: input.threadId,
				type: input.type,
				payload: JSON.stringify(input.payload),
				clientKey: input.clientKey,
				createdAt: NOW,
			});
			return { id };
		},
	},
};

const submitReviewTool = buildToolDefinitions(ports).find((t) => t.name === "submit_review")!;

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	sessionId: string,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId,
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-gate-link-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seed(db: HyperIdleDb, prefix: string): Promise<string> {
	const teamId = `${prefix}-team`;
	const taskId = `${prefix}-task`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values([
		{
			id: "agent-builder",
			name: "Builder",
			kind: "agent",
			role: "member",
			status: "active",
			teamId,
			createdAt: NOW,
		},
		{
			id: "human-founder",
			name: "Founder",
			kind: "human",
			role: "founder",
			status: "active",
			teamId,
			createdAt: NOW,
		},
	]);
	await db.insert(tasks).values({
		id: taskId,
		title: "Ship it",
		teamId,
		parentTaskId: null,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return taskId;
}

const REVIEW_ARGS = {
	title: "Please let me push",
	reasoning: ["The change is reviewed and the branch is green."],
	artifacts: [
		{
			id: "a1",
			tool: "git",
			app: "shell",
			sourceHref: "file:///repo",
			title: "What I want to run",
			kind: "action_operation" as const,
			payload: { command: "git push origin main" },
		},
	],
};

describe("submit_review — tying a review to the block that caused it", () => {
	let handle: TestDbHandle;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		sharedDb = handle.db;
		eventBus = new EventBus();
		pendingDenials.clear();
	});

	afterEach(async () => {
		await handle.close();
	});

	it("records the gate review when the session was actually denied", async () => {
		const taskId = await seed(sharedDb, "blocked");
		pendingDenials.set("session-blocked", { ruleId: "rule-push", toolName: "Bash" });

		const result = await submitReviewTool.handler(
			REVIEW_ARGS,
			makeContext(sharedDb, eventBus, taskId, "session-blocked"),
		);
		expect(result.success).toBe(true);
		const messageId = (result as { data: { messageId: string } }).data.messageId;

		const rows = await sharedDb.select().from(gateReviews);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			reviewMessageId: messageId,
			sessionId: "session-blocked",
			ruleId: "rule-push",
			toolName: "Bash",
		});
	});

	it("records nothing for an ordinary review, so approving it clears nothing", async () => {
		const taskId = await seed(sharedDb, "ordinary");
		// No denial pending: the agent chose to ask for a review of its work.

		const result = await submitReviewTool.handler(
			REVIEW_ARGS,
			makeContext(sharedDb, eventBus, taskId, "session-ordinary"),
		);
		expect(result.success).toBe(true);

		const rows = await sharedDb.select().from(gateReviews);
		expect(rows, "an ordinary review must not become a clearance").toHaveLength(0);
	});

	it("keeps one row per review even if the link is recorded twice", async () => {
		const taskId = await seed(sharedDb, "twice");
		pendingDenials.set("session-twice", { ruleId: "rule-push", toolName: "Bash" });

		const result = await submitReviewTool.handler(
			REVIEW_ARGS,
			makeContext(sharedDb, eventBus, taskId, "session-twice"),
		);
		const messageId = (result as { data: { messageId: string } }).data.messageId;
		await writeGateReview({
			reviewMessageId: messageId,
			sessionId: "session-twice",
			ruleId: "other",
			toolName: "Write",
		});

		const rows = await sharedDb.select().from(gateReviews);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.ruleId, "the first link stands; a second must not overwrite it").toBe(
			"rule-push",
		);
	});
});
