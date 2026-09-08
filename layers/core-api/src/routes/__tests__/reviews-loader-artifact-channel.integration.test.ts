/**
 * The reviews loader layers a resolved stored-artifact reference over the
 * persisted review payload instead of replacing anything.
 *
 * Every assertion here is against the REAL Hono app, the REAL PGlite
 * database and the REAL `GET /api/reviews/:reviewMessageId` route — nothing
 * is stubbed. The no-proposed-call branch (`routes/reviews.ts`, reached
 * whenever a review carries no proposed call — every review this package
 * produces) resolves `artifactRef` via `work.get(db, "artifact", id)` and
 * appends the resolved entry to whatever `artifacts` the payload already
 * carries.
 *
 * The resolved entry must carry every field the review UI's `ArtifactRow`
 * unconditionally renders (`tool`/`app`/`kind`/`sourceHref`/`title`/
 * `payload` — see `layers/core-ui/src/pages/review/review-artifact.ts`'s
 * `ReviewArtifact`), not just an `id`: a `ToolLogo` rendered with an
 * `undefined` `tool` throws, taking the whole review page down. Assertions
 * below check for the full shape, not merely that an id came back.
 *
 * @lore BA2 REVERSED the narrowness this file's original @lore records. Scoping
 * the loader to `artifacts`/`artifactRef` alone was refuted by running a real
 * agent review through the surface: it iterates five lists with no guard, so a
 * review carrying only a title and reasoning crashed the page and no human could
 * answer it. What survives is the principle, not the scope — an empty list where
 * we have nothing, never an invented value. Original note follows.
 *
 * @lore scoped deliberately narrow to the `artifacts`/`artifactRef` fields
 * only — a wider "composed fallback for every missing field" (tokens,
 * tools, taskId, rootTaskId, ...) belongs to a separate, unrelated loader
 * concern and is not exercised here.
 */

import { artifacts, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
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
	const rootTaskId = `${idPrefix}-bet`;
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

/**
 * Assert the resolved entry carries every field the review UI's
 * `ArtifactRow`/`ToolLogo` unconditionally render — not merely an `id`. A
 * regression that drops `tool`/`app`/`payload` (the pre-fix shape) still
 * satisfies an id-and-length-only assertion but crashes the page.
 */
function expectRenderableArtifact(entry: Record<string, unknown> | undefined): void {
	expect(entry).toBeDefined();
	const row = entry!;
	expect(typeof row.tool).toBe("string");
	expect((row.tool as string).length).toBeGreaterThan(0);
	expect(typeof row.app).toBe("string");
	expect(typeof row.title).toBe("string");
	expect((row.title as string).length).toBeGreaterThan(0);
	expect(typeof row.sourceHref).toBe("string");
	expect(row.payload).toBeDefined();
}

describe("GET /api/reviews/:id — the loader layers a resolved artifactRef onto the payload's artifacts", () => {
	test("a demo-shaped review keeps every field it carries, AND gains the resolved artifactRef appended to its existing artifacts", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "superset");
		// The stored artifact's REAL kind is "text" — deliberately different
		// from the value the payload's artifactRef itself carries ("html"), so
		// a resolution that merely echoes the client-supplied kind (rather than
		// reading the real row) is caught.
		await seedArtifact(db, "superset-stored-art", world.taskId, "text");

		const preExistingArtifact = {
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
			artifactRef: { id: "superset-stored-art", kind: "html" },
			// Demo-review-shaped superset — every one of these must survive.
			tokens: "9.2k",
			tools: ["vite", "figma"],
			resultKpis: [{ label: "Page length", value: "-38%", good: true }],
			artifacts: [preExistingArtifact],
		});

		const res = await app.request("/api/reviews/superset-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// Nothing the payload already carried is lost.
		expect(body.tokens).toBe("9.2k");
		expect(body.tools).toEqual(["vite", "figma"]);
		expect(body.resultKpis).toEqual([{ label: "Page length", value: "-38%", good: true }]);

		// The resolved entry is APPENDED — the pre-existing entry survives too.
		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>>;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(2);
		expect(responseArtifacts.some((a) => a.id === "superset-existing-art")).toBe(true);

		const resolved = responseArtifacts.find((a) => a.id === "superset-stored-art");
		expectRenderableArtifact(resolved);
		// The resolved entry's kind must come from the REAL stored row ("text"),
		// never from the client-supplied artifactRef.kind ("html") — proving
		// this reads the artifact, not the reference.
		expect(resolved?.kind).toBe("text");
	});

	test("a sparse agent review with only an artifactRef gets a usable artifacts list the review page can actually render", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "sparse");
		await seedArtifact(db, "sparse-stored-art", world.taskId, "code");

		// No `artifacts` key at all — an agent's minimal review.
		await insertReviewMessage(db, world, "sparse-review", {
			title: "Fix the flaky test",
			reasoning: ["it was a timing bug"],
			artifactRef: { id: "sparse-stored-art", kind: "code" },
		});

		const res = await app.request("/api/reviews/sparse-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>> | undefined;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(1);
		expect(responseArtifacts?.[0]?.id).toBe("sparse-stored-art");
		// Not just an id: every field the review UI's ArtifactRow/ToolLogo
		// unconditionally render must be present, or the page crashes.
		expectRenderableArtifact(responseArtifacts?.[0]);

		// @lore BA2: this used to assert `tokens`/`tools`/`resultKpis` were
		// ABSENT — the loader was deliberately scoped to the artifact fields and
		// nothing else. Running a real agent review through the surface refuted
		// that: it calls `.map` on `tools` and `resultKpis` with no guard, so a
		// sparse review crashed the page and no human could answer it. They are
		// composed now, and the rule the old assertion was protecting still
		// holds: nothing plausible is invented. An empty list says "we have
		// none", a blank string renders as nothing, and neither claims a number
		// we did not measure.
		expect(body.tokens).toBe("");
		expect(body.tools).toEqual([]);
		expect(body.resultKpis).toEqual([]);
	});

	test("an inline canvas artifacts array and a resolved artifactRef both survive to the loader's output", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "both-channels");
		await seedArtifact(db, "both-channels-stored-art", world.taskId, "code");

		const inlineCanvas = {
			id: "both-channels-inline-art",
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
		await insertReviewMessage(db, world, "both-channels-review", {
			title: "Ship it",
			reasoning: ["done"],
			artifactRef: { id: "both-channels-stored-art", kind: "code" },
			artifacts: [inlineCanvas],
		});

		const res = await app.request("/api/reviews/both-channels-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		const responseArtifacts = body.artifacts as ReadonlyArray<Record<string, unknown>>;
		expect(Array.isArray(responseArtifacts)).toBe(true);
		expect(responseArtifacts).toHaveLength(2);
		expect(responseArtifacts.some((a) => a.id === "both-channels-inline-art")).toBe(true);
		const resolved = responseArtifacts.find((a) => a.id === "both-channels-stored-art");
		expectRenderableArtifact(resolved);
		expect(resolved?.kind).toBe("code");
	});

	test("an artifactRef pointing at a nonexistent artifact never surfaces a fabricated stand-in", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "dangling");
		// No `seedArtifact` call — "dangling-nonexistent-art" is never inserted.

		await insertReviewMessage(db, world, "dangling-review", {
			title: "Orphaned reference",
			reasoning: ["the artifact row was deleted after this review was written"],
			artifactRef: { id: "dangling-nonexistent-art", kind: "text" },
		});

		const res = await app.request("/api/reviews/dangling-review");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// `work.get` returns nothing for a row that doesn't exist — the loader
		// must not invent a stand-in entry for it. `artifacts` stays exactly
		// what the payload already carried, which here is nothing.
		//
		// @lore BA2: an EMPTY LIST, not an absent key. The review surface calls
		// `.find` on it unconditionally, so absence crashed the page. Empty is
		// the honest answer to "what evidence is attached" when a referenced
		// artifact no longer exists — what must never appear is an entry
		// standing in for it.
		expect(body.artifacts).toEqual([]);
	});
});
