/**
 * `submit_review` — producedItemId invariant.
 *
 * A review may not claim proof it does not have: the named item must exist AND
 * be parented to the calling task (parentKind === "task" && parentId ===
 * ctx.taskId). This is the direct analogue of the old `artifactRef` invariant
 * that was silently dropped when the artifacts table was deleted.
 *
 * Three cases:
 *   1. Happy path: producedItemId present, item exists, parented to calling task.
 *      Payload written to DB includes `producedItemId`.
 *   2. Refusal: item does not exist (findKnowledgeItemParentById returns undefined).
 *   3. Refusal: item exists but is parented to a DIFFERENT task.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-09-08T00:00:00.000Z";
const TASK_ID = "task-submit-review-pi";
const OTHER_TASK_ID = "task-submit-review-pi-other";
const ITEM_ID = "ki-produced-item";

// ---------------------------------------------------------------------------
// Per-test state: what findKnowledgeItemParentById returns
// ---------------------------------------------------------------------------

type ParentLookupResult = { parentKind: string | null; parentId: string | null } | undefined;
let parentLookupResult: ParentLookupResult | "missing" = "missing";

let sharedDb: HyperIdleDb;

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	// This session was never denied anything, so there is no gate review to
	// record. That is the ordinary case these tests exercise.
	gate: { linkReviewToSession: async () => {} },
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		openTask: async (id: string) => {
			const [row] = await sharedDb.select().from(tasks).where(eq(tasks.id, id));
			return row
				? { task: { parentTaskId: row.parentTaskId ?? null, teamId: row.teamId } }
				: undefined;
		},
		resolveReviewRecipientsForItem: async () => ["human-pi"],
		getFirstThreadByHost: async () => undefined,
		insertThread: async (input) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(threads).values({
				id,
				hostKind: input.hostKind as never,
				hostId: input.hostId,
				initiatorId: input.participants[0] ?? "agent-pi",
				participants: JSON.stringify(input.participants),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			return { id, participants: input.participants };
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
		findKnowledgeItemParentById: async (_id: string) => {
			if (parentLookupResult === "missing") return undefined;
			return parentLookupResult;
		},
	},
};

const submitReviewTool = buildToolDefinitions(ports).find((t) => t.name === "submit_review")!;

function makeCtx(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-pi",
		sessionId: "session-pi",
		taskId: TASK_ID,
		sandboxPath: path.join(os.tmpdir(), `hi-pi-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("submit_review — producedItemId invariant", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();

		await db
			.insert(teams)
			.values({ id: "team-pi", name: "PI Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "human-pi",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			teamId: "team-pi",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: "agent-pi",
			kind: "ai",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${TASK_ID}`,
			hostKind: "team",
			hostId: "team-pi",
			initiatorId: "agent-pi",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: TASK_ID,
			threadId: `thr-${TASK_ID}`,
			parentTaskId: null,
			teamId: "team-pi",
			title: "Task under review",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${OTHER_TASK_ID}`,
			hostKind: "team",
			hostId: "team-pi",
			initiatorId: "agent-pi",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: OTHER_TASK_ID,
			threadId: `thr-${OTHER_TASK_ID}`,
			parentTaskId: null,
			teamId: "team-pi",
			title: "Different task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	it("writes producedItemId into the review payload when the item belongs to the calling task", async () => {
		parentLookupResult = { parentKind: "task", parentId: TASK_ID };

		const result = await submitReviewTool.handler(
			{
				title: "Implementation ready for review",
				reasoning: ["All tests pass", "Code is well documented"],
				producedItemId: ITEM_ID,
			},
			makeCtx(db, eventBus),
		);

		expect(result.success).toBe(true);

		const rows = await db.select().from(messages).where(eq(messages.senderId, "agent-pi"));
		const msg = rows[0];
		if (!msg) throw new Error("Expected a message to be persisted");
		expect(msg.type).toBe("review");
		const payload = JSON.parse(msg.payload) as Record<string, unknown>;
		expect(payload.producedItemId).toBe(ITEM_ID);
		expect(payload.title).toBe("Implementation ready for review");
	});

	it("refuses when the named item does not exist", async () => {
		parentLookupResult = "missing";

		const result = await submitReviewTool.handler(
			{
				title: "Ready for review",
				reasoning: ["Done"],
				producedItemId: "ki-does-not-exist",
			},
			makeCtx(db, eventBus),
		);

		expect(result.success).toBe(false);
		expect((result as { success: false; code: string }).code).toBe("NOT_FOUND");

		const rows = await db.select().from(messages);
		expect(rows).toHaveLength(0);
	});

	it("refuses when the named item is parented to a different task", async () => {
		parentLookupResult = { parentKind: "task", parentId: OTHER_TASK_ID };

		const result = await submitReviewTool.handler(
			{
				title: "Ready for review",
				reasoning: ["Done"],
				producedItemId: ITEM_ID,
			},
			makeCtx(db, eventBus),
		);

		expect(result.success).toBe(false);
		expect((result as { success: false; code: string }).code).toBe("FORBIDDEN");

		const rows = await db.select().from(messages);
		expect(rows).toHaveLength(0);
	});
});
