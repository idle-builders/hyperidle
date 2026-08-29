/**
 * BA2 T4d (RED) — the canvas-envelope channel: `submit_review` gains
 * `artifacts?: ReviewArtifact[]`, written straight onto the review message
 * payload in the same shape the demo world already persists and the loader
 * already serves. `.pipeline/work/BA2/architecture.md` §2.8.2 B1 (the write
 * path, traced end to end) and B2 (the envelope), T4d's row in §5.
 *
 * This is the PRIMARY channel — how an agent attaches the payloads the nine
 * canvases actually render, with no stored artifact/producer required. The
 * `artifactRef` channel (`reviews-loader-artifact-channel.integration.test.ts`,
 * `submit-review-artifact-ref.integration.test.ts`) is the secondary one.
 *
 * Traced (architecture.md F65, executed): `messageInputSchema.safeParse`
 * SUCCEEDS today and returns `["title","reasoning","artifactRef"]` —
 * `artifacts` is silently dropped because `reviewPayloadSchema` never
 * declares it, and a bare `z.object` strips unknown keys by default. This
 * file proves that specific silent drop by going through the REAL write
 * route the array is dropped at (`POST /api/threads/:id/messages`) and the
 * REAL read route that would otherwise (wrongly) look fine
 * (`GET /api/reviews/:id` never validates on read at all — it round-trips
 * `JSON.parse` verbatim — so the only place this can be lost is the write).
 */

import { bets, type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface World {
	readonly taskId: string;
	readonly threadId: string;
}

async function seedWorld(db: HyperIdleDb, idPrefix: string): Promise<World> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	const threadId = `${idPrefix}-thread`;
	const agentId = `${idPrefix}-agent`;
	const founderId = `${idPrefix}-founder`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// Same reason as `review-artifact-kind-write-arm.integration.test.ts`: the
	// fixture's API-key auth resolves the sender as the sole `kind:"human"`
	// user, falling back to a literal "u-founder" this db never seeds.
	await db.insert(users).values({
		id: founderId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
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
		ownerAgentId: agentId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId, founderId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	return { taskId, threadId };
}

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

describe("BA2 T4d — submit_review's canvas-envelope channel survives the write (BLK-2)", () => {
	test("a canvas-only review (no artifactRef) survives write and is served back by GET /api/reviews/:id", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "t4d-envelope-write");
		const inlineCanvas = {
			id: "t4d-envelope-write-canvas-1",
			tool: "github",
			app: "GitHub",
			sourceHref: "https://github.example/pr/1",
			title: "The diff",
			kind: "code_diff",
			payload: {
				prTitle: "Fix the bug",
				description: "d",
				checks: [],
				files: [],
				triviaSummary: "",
			},
		};

		// RED today for two combined reasons, both part of the same B1 schema
		// edit: `artifactRef` is required on the write arm (a canvas-only
		// review has none to give), AND `artifacts` isn't declared at all (so
		// even once optional, the array would still be silently stripped).
		const create = await app.request(`/api/threads/${world.threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "review",
				payload: {
					title: "Please approve",
					reasoning: ["done"],
					artifacts: [inlineCanvas],
				},
				clientKey: "t4d-envelope-write-key",
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as { message: { id: string } };

		const res = await app.request(`/api/reviews/${created.message.id}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// A weak assertion (e.g. just checking `artifacts` is an array) would
		// pass even if the array were silently emptied or re-shaped — assert
		// the exact payload the agent sent survives, deep-equal.
		expect(body.artifacts).toEqual([inlineCanvas]);
	});
});
