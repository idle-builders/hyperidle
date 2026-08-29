/**
 * `submit_review`'s stored-artifact reference channel: `artifactRef.kind`
 * validates against the consolidated `ARTIFACT_KINDS` vocabulary
 * `create_artifact` actually emits, and the handler confirms a referenced
 * artifact belongs to the calling task before letting a review claim it as
 * proof.
 *
 * Unit-level test of `submit_review`'s own handler logic against a real test
 * db — same shape as `create-artifact.integration.test.ts`'s own `@lore`:
 * only `ports.coreApi.{getTaskById,getFirstThreadByHost,insertThread,
 * updateThread,insertMessage,getArtifactById}` are exercised, wired to real
 * `@hyperidle/work`/raw-table operations against the real test db; everything
 * else stays the unused stub.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
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
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-08-28T00:00:00.000Z";

let sharedDb: HyperIdleDb;

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		getTaskById: async (id: string) => {
			const row = await work.get(sharedDb, "task", id);
			return row ? { betId: row.betId, teamId: row.teamId, notes: row.notes ?? null } : undefined;
		},
		getArtifactById: async (id: string) => {
			const row = await work.get(sharedDb, "artifact", id);
			return row ? { id: row.id, producingTaskId: row.producingTaskId, kind: row.kind } : undefined;
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
		updateThread: async (id, updates) => {
			await sharedDb
				.update(threads)
				.set({
					...(updates.participants ? { participants: JSON.stringify(updates.participants) } : {}),
					...(updates.lastActiveAt ? { lastActiveAt: updates.lastActiveAt } : {}),
				})
				.where(eq(threads.id, id));
		},
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
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-t4d",
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-t4d-submitreview-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedTeamBetTask(
	db: HyperIdleDb,
	idPrefix: string,
): Promise<{ teamId: string; betId: string; taskId: string }> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "d",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamId, betId, taskId };
}

describe("submit_review — the stored artifactRef channel", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();
		// `makeContext`'s `ctx.agentId` ("agent-builder") is the `insertMessage`
		// fake's `senderId` — a real row is required by the FK, independent of
		// whichever task the review is submitted under.
		await db.insert(users).values({
			id: "agent-builder",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	it("resolves a stored artifact reference produced by the calling task", async () => {
		const { taskId } = await seedTeamBetTask(db, "own");
		const artifactId = "own-artifact";
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "text",
			label: null,
			previewJson: null,
			createdAt: NOW,
		});

		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifactRef: { id: artifactId, kind: "text" },
			},
			makeContext(db, eventBus, taskId),
		);

		expect(result.success).toBe(true);

		// The persisted row, not just the return value — `result.success` is
		// `true` on both a real review AND the silent plain-message fallback,
		// so only the row proves the artifactRef actually survived.
		const written = await db.select().from(messages).where(eq(messages.type, "review"));
		expect(written).toHaveLength(1);
		const payload = JSON.parse(written[0]!.payload) as {
			artifactRef?: { id: string; kind?: string };
		};
		expect(payload.artifactRef).toEqual({ id: artifactId, kind: "text" });
	});

	it("refuses a reference to an artifact produced by a DIFFERENT task", async () => {
		const owner = await seedTeamBetTask(db, "owner");
		const stranger = await seedTeamBetTask(db, "stranger");
		const artifactId = "owner-artifact";
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: owner.taskId,
			kind: "text",
			label: null,
			previewJson: null,
			createdAt: NOW,
		});

		// `kind` here is a value the schema accepts — deliberately, so this
		// test isolates the ownership check from the artifact-kind vocabulary,
		// rather than failing for the wrong reason (a schema rejection would
		// also produce `success: false`, but would prove nothing about
		// ownership).
		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifactRef: { id: artifactId, kind: "text" },
			},
			makeContext(db, eventBus, stranger.taskId),
		);

		expect(result.success).toBe(false);

		// No review message should exist referencing artifact ownership it
		// does not have — the observable side effect, not just the return
		// value.
		const written = await db.select().from(messages).where(eq(messages.type, "review"));
		expect(written).toHaveLength(0);
	});
});
