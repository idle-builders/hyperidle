/** AU20 Stage 1: consumer-demand completeness contract for the work service. */
import { bets, type HyperIdleDb, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { describe, expect, type ScopedIds, test } from "@hyperidle/db/test-fixtures";
import { create, get, list } from "../work-service.js";

async function seedWork(
	db: HyperIdleDb,
	ids: ScopedIds,
	suffix: string,
): Promise<{ betId: string; taskId: string }> {
	const now = "2026-07-21T00:00:00.000Z";
	const teamId = ids(`work-team-${suffix}`);
	const betId = ids(`work-bet-${suffix}`);
	const taskId = ids(`work-task-${suffix}`);
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${suffix}`, phase: "build", createdAt: now });
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `${teamId}-members`,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Completeness bet",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "Completeness task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
	return { betId, taskId };
}

async function seedItemDeps(
	db: HyperIdleDb,
	ids: ScopedIds,
	suffix: string,
): Promise<{ agentId: string; threadId: string }> {
	const now = "2026-07-21T00:00:00.000Z";
	const agentId = ids(`work-agent-${suffix}`);
	const threadId = ids(`work-thread-${suffix}`);
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "agent",
		hostId: agentId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
	return { agentId, threadId };
}

describe("work completeness contract", () => {
	test("source-agent item listing returns only matching item IDs", async ({ db, ids }) => {
		const first = await seedItemDeps(db, ids, "items-a");
		const second = await seedItemDeps(db, ids, "items-b");
		for (const [id, sourceAgentId, threadId] of [
			[ids("source-item-1"), first.agentId, first.threadId],
			[ids("source-item-2"), first.agentId, first.threadId],
			[ids("source-item-other"), second.agentId, second.threadId],
		] as const) {
			await create(db, "item", {
				id,
				sourceAgentId,
				threadId,
				title: id,
				createdAt: "2026-07-21T00:00:00.000Z",
			});
		}
		// @lore AU38: derived UUIDs don't sort in label order — sort both sides
		// with the same comparator.
		expect(
			(await list(db, "item", { sourceAgentId: first.agentId })).map((item) => item.id).sort(),
		).toEqual([ids("source-item-1"), ids("source-item-2")].sort());
		expect(
			(await list(db, "item", { ids: [ids("source-item-2"), ids("source-item-other")] }))
				.map((item) => item.id)
				.sort(),
		).toEqual([ids("source-item-2"), ids("source-item-other")].sort());
		expect(await list(db, "item", { ids: [] })).toEqual([]);
	});

	test("artifact create and direct get preserve the complete row", async ({ db, ids }) => {
		const { taskId } = await seedWork(db, ids, "artifact");
		const artifact = {
			id: ids("work-artifact-1"),
			producingTaskId: taskId,
			kind: "document",
			label: "Result",
			previewJson: '{"summary":"done"}',
			createdAt: "2026-07-21T00:00:00.000Z",
		};
		await create(db, "artifact", artifact);
		expect(await get(db, "artifact", artifact.id)).toEqual(artifact);
	});
});
