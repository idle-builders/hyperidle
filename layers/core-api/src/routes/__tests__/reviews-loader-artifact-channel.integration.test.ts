/**
 * BA2 T4d (RED) — the reviews loader layers a resolved stored-artifact
 * reference over the persisted review payload instead of replacing anything.
 * `.pipeline/work/BA2/architecture.md` §2.8.1 A1 (BLK-1 — layer, never
 * replace), §2.8.2 B4 (the loader resolves the reference via the
 * `work.get(db,"artifact",id)` call `routes/reviews.ts` already makes on its
 * proposed-call branch).
 *
 * Every assertion here is against the REAL Hono app, the REAL PGlite
 * database and the REAL `GET /api/reviews/:reviewMessageId` route — nothing
 * is stubbed. Today the early-return branch (`routes/reviews.ts:117-119`,
 * reached whenever a review carries no proposed call — every review this
 * package produces) does `c.json({ ...reviewPayload })` and never looks at
 * `artifactRef` at all, so every test below is red for the same underlying
 * reason: nothing resolves the reference yet.
 *
 * @lore BA2 T4d: scoped deliberately narrow to the `artifacts`/`artifactRef`
 * fields only — the wider "composed fallback for every missing field"
 * (tokens, tools, taskId, betId, ...) is T4b's `§2.8.1 A1` `composedDefaults`
 * layer, a different task, and is not exercised here. `architecture.md`'s own
 * field table draws this exact line: "T4d appends any resolved `artifactRef`
 * to that [artifacts] list rather than to an empty one."
 */

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
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface World {
	readonly taskId: string;
	readonly threadId: string;
	readonly agentId: string;
}

/** Seed a team/bet/task/task-hosted-thread world with one agent sender. */
async function seedWorld(db: HyperIdleDb, idPrefix: string): Promise<World> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
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
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	return { taskId, threadId, agentId };
}

/** Insert a real, stored artifact row — the thing `artifactRef` points at. */
async function seedArtifact(
	db: HyperIdleDb,
	id: string,
	producingTaskId: string,
	kind: string,
): Promise<void> {
	await db.insert(artifacts).values({
		id,
		producingTaskId,
		kind,
		label: null,
		previewJson: null,
		createdAt: NOW,
	});
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

describe("BA2 T4d — GET /api/reviews/:id — the loader layers a resolved artifactRef (BLK-1/B4)", () => {
	test("a demo-shaped review keeps every field it carries today, AND gains the resolved artifactRef appended to its existing artifacts", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "t4d-superset");
		// The stored artifact's REAL kind is "text" — deliberately different
		// from the value the payload's artifactRef itself carries ("html"), so
		// a resolution that merely echoes the client-supplied kind (rather than
		// reading the real row) is caught.
		await seedArtifact(db, "t4d-superset-stored-art", world.taskId, "text");

		const preExistingArtifact = {
			id: "t4d-superset-existing-art",
			tool: "figma",
			app: "Figma",
			sourceHref: "https://figma.example/x",
			title: "Existing canvas",
			kind: "outcome_summary",
			payload: { agentName: "Atlas" },
		};

		await insertReviewMessage(db, world, "t4d-superset-review", {
			title: "Ship the pricing page",
			reasoning: ["done"],
			artifactRef: { id: "t4d-superset-stored-art", kind: "html" },
			// Demo-review-shaped superset — every one of these must survive.
			tokens: "9.2k",
			tools: ["vite", "figma"],
			resultKpis: [{ label: "Page length", value: "-38%", good: true }],
			artifacts: [preExistingArtifact],
		});

		const res = await app.request("/api/reviews/t4d-superset-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// Nothing the payload already carried is lost (BLK-1).
		expect(body.tokens).toBe("9.2k");
		expect(body.tools).toEqual(["vite", "figma"]);
		expect(body.resultKpis).toEqual([{ label: "Page length", value: "-38%", good: true }]);

		// RED today: the early-return branch never resolves `artifactRef`, so
		// `artifacts` is still exactly the one pre-existing entry.
		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>>;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(2);
		expect(responseArtifacts.some((a) => a.id === "t4d-superset-existing-art")).toBe(true);

		const resolved = responseArtifacts.find((a) => a.id === "t4d-superset-stored-art");
		expect(resolved, "resolved artifactRef appended to artifacts").toBeDefined();
		// The resolved entry's kind must come from the REAL stored row ("text"),
		// never from the client-supplied artifactRef.kind ("html") — proving
		// this reads the artifact, not the reference.
		expect(resolved?.kind).toBe("text");
	});

	test("a sparse agent review with only an artifactRef still gets a usable, non-invented artifacts list", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "t4d-sparse");
		await seedArtifact(db, "t4d-sparse-stored-art", world.taskId, "code");

		// No `artifacts` key at all — an agent's minimal review.
		await insertReviewMessage(db, world, "t4d-sparse-review", {
			title: "Fix the flaky test",
			reasoning: ["it was a timing bug"],
			artifactRef: { id: "t4d-sparse-stored-art", kind: "code" },
		});

		const res = await app.request("/api/reviews/t4d-sparse-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// RED today: `artifacts` is `undefined` (the payload never had the key
		// and nothing resolves the reference), not the coherent one-entry list
		// a human can actually open.
		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>> | undefined;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(1);
		expect(responseArtifacts?.[0]?.id).toBe("t4d-sparse-stored-art");

		// Ruling 14 — no invented values: fields T4d does not own (tokens/tools/
		// resultKpis) stay absent rather than defaulted into something
		// plausible. Capable of going red the moment a future change adds a
		// `?? "0"`/`?? []` convenience default here instead of leaving it out.
		expect(body.tokens).toBeUndefined();
		expect(body.tools).toBeUndefined();
		expect(body.resultKpis).toBeUndefined();
	});

	test("an inline canvas artifacts array and a resolved artifactRef both survive to the loader's output (BLK-2 + BLK-1 together)", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "t4d-both-channels");
		await seedArtifact(db, "t4d-both-channels-stored-art", world.taskId, "code");

		const inlineCanvas = {
			id: "t4d-both-channels-inline-art",
			tool: "github",
			app: "GitHub",
			sourceHref: "https://github.example/pr/9",
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

		// One review carrying BOTH channels at once: an agent-supplied inline
		// canvas payload (the primary channel — no producer/proof needed) and a
		// reference to a stored artifact (the secondary channel).
		await insertReviewMessage(db, world, "t4d-both-channels-review", {
			title: "Ship it",
			reasoning: ["done"],
			artifactRef: { id: "t4d-both-channels-stored-art", kind: "code" },
			artifacts: [inlineCanvas],
		});

		const res = await app.request("/api/reviews/t4d-both-channels-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// RED today: the inline entry alone would already be there (the loader
		// spreads the payload verbatim), but the resolved-ref entry is missing —
		// so the count is short by one and the resolved entry can't be found.
		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>>;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(2);
		expect(responseArtifacts.some((a) => a.id === "t4d-both-channels-inline-art")).toBe(true);
		const resolved = responseArtifacts.find((a) => a.id === "t4d-both-channels-stored-art");
		expect(resolved, "resolved artifactRef appended alongside the inline canvas").toBeDefined();
		expect(resolved?.kind).toBe("code");
	});
});

// @lore BA2 T4d: a third case — an artifactRef pointing at a nonexistent
// artifact must never surface a fabricated stand-in — was deliberately left
// out of this file. Today's code doesn't resolve `artifactRef` at all, so
// that property already, trivially holds (nothing is ever added), which
// would make the assertion pass on arrival rather than prove anything. It
// belongs with whichever test first makes resolution real (T4e-a's
// no-fabrication pass, or a follow-up here once the loader change lands),
// where "resolve, but not into an invention" is an actual choice a broken
// implementation could get wrong.
