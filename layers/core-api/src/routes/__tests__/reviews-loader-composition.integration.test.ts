/**
 * The reviews loader composes the review page's subject over the persisted
 * review payload instead of replacing anything.
 *
 * Every assertion here is against the REAL Hono app, the REAL PGlite database
 * and the REAL `GET /api/reviews/:reviewMessageId` route — nothing is stubbed.
 *
 * @lore BA2: the page iterates five lists (`artifacts`, `conversation`,
 * `intent`, `needs`, `resultKpis`) with no guard, so a review carrying only a
 * title and reasoning crashed it and no human could answer. The loader composes
 * those now. The rule that composition must obey: an empty list where we have
 * nothing, never an invented value.
 *
 * @lore artifacts-become-knowledge: this file replaces
 * `reviews-loader-artifact-channel.integration.test.ts`, whose subject was the
 * loader resolving an `artifactRef` against the `artifacts` table and appending
 * the row it found. That table is gone, and so is that channel — `artifacts` is
 * now exactly the canvas list the payload carries. What survives from that file
 * is the part that still has a subject: the payload's own values must reach the
 * page intact, and what the payload lacks must come back empty rather than
 * invented.
 */

import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface World {
	readonly taskId: string;
	readonly threadId: string;
	readonly agentId: string;
}

/** Seed a team/root-task/task/task-hosted-thread world with one agent sender. */
async function seedWorld(db: HyperIdleDb, idPrefix: string): Promise<World> {
	const teamId = `${idPrefix}-team`;
	const rootTaskId = `${idPrefix}-root`;
	const taskId = `${idPrefix}-task`;
	const threadId = `${idPrefix}-thread`;
	const agentId = `${idPrefix}-agent`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: rootTaskId,
		parentTaskId: null,
		teamId: teamId,
		title: "d",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: rootTaskId,
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
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	return { taskId, threadId, agentId };
}

async function insertReviewMessage(
	db: HyperIdleDb,
	world: World,
	messageId: string,
	payload: Record<string, unknown>,
): Promise<void> {
	await db.insert(messages).values({
		id: messageId,
		senderId: world.agentId,
		threadId: world.threadId,
		type: "review",
		payload: JSON.stringify(payload),
		clientKey: messageId,
		createdAt: NOW,
	});
}

/**
 * Assert an entry carries every field the review UI's `ArtifactRow`/`ToolLogo`
 * unconditionally render — not merely an `id`. A regression that drops
 * `tool`/`app`/`payload` still satisfies an id-and-length-only assertion but
 * crashes the page.
 */
function expectRenderableArtifact(entry: Record<string, unknown> | undefined): void {
	expect(entry).toBeDefined();
	const row = entry as Record<string, unknown>;
	expect(typeof row.tool).toBe("string");
	expect((row.tool as string).length).toBeGreaterThan(0);
	expect(typeof row.app).toBe("string");
	expect(typeof row.title).toBe("string");
	expect((row.title as string).length).toBeGreaterThan(0);
	expect(typeof row.sourceHref).toBe("string");
	expect(row.payload).toBeDefined();
}

describe("GET /api/reviews/:id — the loader composes under the payload, never over it", () => {
	test("a review that carries its own values keeps every one of them", async ({ db, app }) => {
		const world = await seedWorld(db, "superset");

		const carriedArtifact = {
			id: "superset-existing-art",
			tool: "figma",
			app: "Figma",
			sourceHref: "https://figma.example/x",
			title: "Existing canvas",
			kind: "outcome_summary",
			payload: { agentName: "Atlas" },
		};

		await insertReviewMessage(db, world, "superset-review", {
			title: "Ship the pricing page",
			reasoning: ["done"],
			tokens: "9.2k",
			tools: ["vite", "figma"],
			resultKpis: [{ label: "Page length", value: "-38%", good: true }],
			artifacts: [carriedArtifact],
		});

		const res = await app.request("/api/reviews/superset-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// Nothing the payload already carried is blanked by the composed defaults.
		expect(body.tokens).toBe("9.2k");
		expect(body.tools).toEqual(["vite", "figma"]);
		expect(body.resultKpis).toEqual([{ label: "Page length", value: "-38%", good: true }]);

		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>>;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(1);
		expect(responseArtifacts[0]?.id).toBe("superset-existing-art");
		expectRenderableArtifact(responseArtifacts[0]);
	});

	test("a sparse agent review comes back renderable, with nothing invented", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "sparse");

		// Title and reasoning and nothing else — what an agent files when it
		// wants agreement before it acts.
		await insertReviewMessage(db, world, "sparse-review", {
			title: "Fix the flaky test",
			reasoning: ["it was a timing bug"],
		});

		const res = await app.request("/api/reviews/sparse-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// Every list the page iterates is present and empty — absence is what
		// crashed it, and a stand-in entry would be a lie.
		expect(body.artifacts, "the page calls .find on this unconditionally").toEqual([]);
		expect(body.tools).toEqual([]);
		expect(body.resultKpis).toEqual([]);
		expect(body.intent).toEqual([]);
		expect(body.needs).toEqual([]);
		expect(body.conversation).toEqual([]);

		// We do not meter a session's spend onto a review, so we claim no number.
		expect(body.tokens).toBe("");
		expect(body.producedAgo).toBe("");

		// The agent's reasoning is the substance, and the only place the surface
		// shows it.
		expect(body.outcome).toBe("it was a timing bug");
	});

	test("a producedItemId travels through without being dressed up as evidence", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "produced");

		await insertReviewMessage(db, world, "produced-review", {
			title: "Here is the dashboard",
			reasoning: ["built it"],
			producedItemId: "ki-produced",
		});

		const res = await app.request("/api/reviews/produced-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// The id reaches the client so a caller can link to the item.
		expect(body.producedItemId).toBe("ki-produced");
		// But a knowledge item is not a review canvas: it never appears as a
		// fabricated artifacts entry with a made-up kind and an empty payload.
		expect(body.artifacts).toEqual([]);
	});
});
