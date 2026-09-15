/**
 * A review with nothing attached is still a review.
 *
 * BA2: an agent asks a human for agreement BEFORE it does the consequential
 * thing, so at the moment it asks there is usually nothing built to attach.
 * `submit_review` used to write a plain `"Review requested: …"` message in
 * exactly that case and reserve the `review` type for calls carrying evidence.
 * Only a `review` message renders the card that carries the verdict buttons, so
 * the ordinary ask produced something no human could approve or decline — and
 * the session that filed it was never resumed, silently. The link row was still
 * written, pointing at a message no verdict could ever reach.
 *
 * These assertions read the PERSISTED message row. A `result.success` check
 * would have passed against the broken behaviour too.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-09-02T00:00:00.000Z";
const HUMAN_ID = "human-founder-1";
const TEAM_ID = "team-no-evidence";
const TASK_ID = "task-no-evidence";

let sharedDb: HyperIdleDb;
let linkedReviewMessageIds: string[] = [];

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	gate: {
		linkReviewToSession: async (_sessionId: string, reviewMessageId: string) => {
			linkedReviewMessageIds.push(reviewMessageId);
		},
	},
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		openTask: async (id: string) => {
			const [row] = await sharedDb.select().from(tasks).where(eq(tasks.id, id));
			return row ? { task: { parentTaskId: row.parentTaskId ?? null, teamId: row.teamId } } : undefined;
		},
		resolveReviewRecipientsForItem: async () => [HUMAN_ID],
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

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-no-evidence",
		taskId: TASK_ID,
		sandboxPath: path.join(os.tmpdir(), `hi-review-no-evidence-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("submit_review with no artifacts", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();
		linkedReviewMessageIds = [];
		await db.insert(teams).values({ id: TEAM_ID, name: TEAM_ID, phase: "build", createdAt: NOW });
		await db.insert(users).values([
			{
				id: "agent-builder",
				kind: "ai",
				name: "Builder",
				role: "builder",
				status: "active",
				teamId: TEAM_ID,
				createdAt: NOW,
			},
			{
				id: HUMAN_ID,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				teamId: TEAM_ID,
				createdAt: NOW,
			},
		]);
		await db.insert(tasks).values({
			id: TASK_ID,
			parentTaskId: null,
			teamId: TEAM_ID,
			title: "Do the consequential thing",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	it("writes a review message, so a human has something to approve or decline", async () => {
		const result = await submitReviewTool.handler(
			{
				title: "May I delete NOTES.md?",
				reasoning: ["it looks obsolete", "the change is not reversible"],
			},
			makeContext(db, eventBus),
		);
		expect(result.success).toBe(true);

		const written = await db.select().from(messages);
		expect(written).toHaveLength(1);
		expect(
			written[0]?.type,
			"a plain message renders no verdict buttons, so the human can never answer and the session is never resumed",
		).toBe("review");

		const payload = JSON.parse(written[0]?.payload ?? "{}") as {
			title?: string;
			reasoning?: ReadonlyArray<string>;
		};
		expect(payload.title).toBe("May I delete NOTES.md?");
		expect(payload.reasoning).toEqual(["it looks obsolete", "the change is not reversible"]);
	});

	it("links that review to the session that filed it", async () => {
		const result = await submitReviewTool.handler(
			{ title: "May I?", reasoning: ["asking first"] },
			makeContext(db, eventBus),
		);
		expect(result.success).toBe(true);

		const [written] = await db.select().from(messages);
		expect(linkedReviewMessageIds).toEqual([written?.id]);
	});
});
