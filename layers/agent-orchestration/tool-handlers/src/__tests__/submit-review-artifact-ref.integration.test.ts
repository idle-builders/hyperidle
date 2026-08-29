/**
 * BA2 T4d (RED) — `submit_review`'s stored-artifact reference channel.
 * `.pipeline/work/BA2/architecture.md` §2.8.2 B3 (the `artifactRef.kind`
 * vocabulary respell — BLK-4) and §2.8.2 B4 (the ownership check: a review
 * may not reference an artifact it did not produce).
 *
 * Unit-level test of `submit_review`'s own handler logic against a real test
 * db — same shape as `create-artifact.integration.test.ts`'s own `@lore`:
 * only `ports.coreApi.{getTaskById,getFirstThreadByHost,insertThread,
 * updateThread,insertMessage,getArtifactById}` are exercised, wired to real
 * `@hyperidle/work`/raw-table operations against the real test db; everything
 * else stays the unused stub.
 *
 * Today `submit_review`'s `artifactRefSchema` is `z.enum(ARTIFACT_VIEW_SHAPES)`
 * — five pre-consolidation values with zero overlap with the six kinds
 * `create_artifact` emits — and the handler never checks that a referenced
 * artifact belongs to the calling task at all. Both tests below are red for
 * that combined reason; closing either gap alone is not what the acceptance
 * criterion asks for ("a stored artifact reference resolves, and a reference
 * to an artifact belonging to another task is refused").
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
		// BA2 T4 — the handler's create-thread branch now seeds the human via
		// this seam (see `submit-review-task-anchor.integration.test.ts`); this
		// file's own tests are about the artifactRef channel, not participants,
		// so `undefined` (no human found) keeps the create branch deterministic
		// without pulling in a scenario this file doesn't otherwise seed.
		findSoleHumanUser: async () => undefined,
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

describe("submit_review — the stored artifactRef channel (BA2 T4d, BLK-3/BLK-4)", () => {
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
		const { taskId } = await seedTeamBetTask(db, "t4d-own");
		const artifactId = "t4d-own-artifact";
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "text",
			label: null,
			previewJson: null,
			createdAt: NOW,
		});

		// RED today: `artifactRefSchema` only accepts the five pre-consolidation
		// ARTIFACT_VIEW_SHAPES values — "text" (one of the six kinds
		// `create_artifact` actually emits) fails validation with INVALID_INPUT
		// before ownership is ever considered.
		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifactRef: { id: artifactId, kind: "text" },
			},
			makeContext(db, eventBus, taskId),
		);

		expect(result.success).toBe(true);
	});

	it("refuses a reference to an artifact produced by a DIFFERENT task", async () => {
		const owner = await seedTeamBetTask(db, "t4d-owner");
		const stranger = await seedTeamBetTask(db, "t4d-stranger");
		const artifactId = "t4d-owner-artifact";
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: owner.taskId,
			kind: "text_diff",
			label: null,
			previewJson: null,
			createdAt: NOW,
		});

		// `kind` here is a value that VALIDATES under today's schema
		// (pre-consolidation ARTIFACT_VIEW_SHAPES) — deliberately, so this test
		// isolates the missing ownership check from the parallel BLK-3 kind
		// respell landing in the same task, rather than failing for the wrong
		// reason. RED today: nothing in `submit_review` checks the artifact's
		// `producingTaskId` against `ctx.taskId` at all, so the call succeeds
		// and a review is created referencing proof the calling task does not
		// own.
		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifactRef: { id: artifactId, kind: "text_diff" },
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
