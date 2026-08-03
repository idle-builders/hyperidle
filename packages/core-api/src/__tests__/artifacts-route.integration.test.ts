// L3 RED — Hono route tests for /api/artifacts.
// Source of truth: plans/L3/architecture.md §5, §12.

import { artifacts, bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-artifacts";
const NOW = "2026-04-28T00:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

interface SeedScope {
	productId: string;
	betId: string;
	taskId: string;
}

async function seed(db: HyperIdleDb, suffix = ""): Promise<SeedScope> {
	// @lore U1: productId is actually teamId (domain entity id), not productId.
	// Kept as "productId" in SeedScope for backward compat with test axis queries.
	const productId = `prod${suffix}`;
	const teamMembersId = `team${suffix}`;
	const betId = `bet${suffix}`;
	const taskId = `task${suffix}`;
	// Insert domain entity (teams table, formerly products)
	await db.insert(teams).values({ id: productId, name: "P", phase: "build", createdAt: NOW });
	// Insert membership group (teamMembers table, formerly teams)
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId: productId, capacity: 1, activeBets: 0, formedAt: NOW });

	// @lore U1: bets.teamId references teams.id (domain entity), not teamMembers.id
	await db.insert(bets).values({
		id: betId,
		teamId: productId,
		description: "p",
		appetite: "1w",
		status: "draft",
		createdAt: NOW,
	});

	// @lore U1: tasks.teamId references teams.id (domain entity), not teamMembers.id
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId: productId,
		title: "T",
		state: "pending",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { productId, betId, taskId };
}

// @lore O2: costMoneyMicros, costTokensInput, costTokensOutput, costSettledAt
// stripped from the kernel artifacts table. Callers that relied on those columns
// for test setup must use the simplified insert below.
async function insertArtifact(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	overrides: Partial<{
		kind: string;
		previewJson: string | null;
	}> = {},
): Promise<void> {
	await db.insert(artifacts).values({
		id,
		producingTaskId: taskId,
		kind: overrides.kind ?? "code_diff",
		previewJson: overrides.previewJson ?? null,
		createdAt: NOW,
	});
}

describe("L3 GET /api/artifacts (axis discriminated union)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("401 when unauthenticated", async ({ app }) => {
		const res = await app.request("/api/artifacts?axis=portfolio", {
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(401);
	});

	test("400 when axis is malformed", async ({ app }) => {
		const res = await app.request("/api/artifacts?axis=bogus", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	test("400 when axis=task but taskId is missing", async ({ app }) => {
		const res = await app.request("/api/artifacts?axis=task", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	test("axis=task returns artifacts for one task only", async ({ db, app }) => {
		const a = await seed(db, "_a");
		const b = await seed(db, "_b");
		await insertArtifact(db, "art_a1", a.taskId);
		await insertArtifact(db, "art_a2", a.taskId);
		await insertArtifact(db, "art_b1", b.taskId);

		const res = await app.request(`/api/artifacts?axis=task&taskId=${a.taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id).sort();
		expect(ids).toEqual(["art_a1", "art_a2"]);
	});

	test("axis=bet aggregates artifacts across the bet's tasks", async ({ db, app }) => {
		const s = await seed(db);
		// add a second task to the same bet
		await db.insert(tasks).values({
			id: "task2",
			betId: s.betId,
			// @lore U1: teamId references teams.id (domain entity = s.productId)
			teamId: s.productId,
			title: "T2",
			state: "pending",
			createdAt: NOW,
			updatedAt: NOW,
		});

		insertArtifact(db, "art_x", s.taskId);
		insertArtifact(db, "art_y", "task2");
		const res = await app.request(`/api/artifacts?axis=bet&betId=${s.betId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		expect(body.items.map((i) => i.id).sort()).toEqual(["art_x", "art_y"]);
	});

	test("axis=product aggregates artifacts across the product's bets", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_p1", s.taskId);
		const res = await app.request(`/api/artifacts?axis=product&productId=${s.productId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		expect(body.items.map((i) => i.id)).toContain("art_p1");
	});

	test("axis=portfolio aggregates artifacts across all products", async ({ db, app }) => {
		const a = await seed(db, "_a");
		const b = await seed(db, "_b");
		await insertArtifact(db, "art_pa", a.taskId);
		await insertArtifact(db, "art_pb", b.taskId);
		const res = await app.request("/api/artifacts?axis=portfolio", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).toContain("art_pa");
		expect(ids).toContain("art_pb");
	});

	test("response items carry denormalised producing_task_title", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_t", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			items: Array<{ producingTaskTitle: string }>;
		};
		expect(body.items[0]?.producingTaskTitle).toBe("T");
	});

	test("response items carry threadCount as a number (forward-compat zero until L1)", async ({
		db,
		app,
	}) => {
		const s = await seed(db);
		await insertArtifact(db, "art_tc", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as { items: Array<{ threadCount: number }> };
		expect(body.items[0]?.threadCount).toBe(0);
		expect(typeof body.items[0]?.threadCount).toBe("number");
	});

	// @lore AU21 Increment 14a: response items never carry a `cost` field at
	// all (not `cost: null`) — HARD-DELETED along with the rest of the
	// cost-cap feature, no replacement.
	test("response items do not carry a cost field", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_c", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<Record<string, unknown>> };
		expect(body.items[0]).toBeDefined();
		expect(body.items[0]).not.toHaveProperty("cost");
	});

	test("pagination cap enforced — limit > 200 returns 400 LIMIT_TOO_HIGH", async ({ app }) => {
		const res = await app.request("/api/artifacts?axis=portfolio&limit=1000", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});

	test("pagination default limit caps results", async ({ db, app }) => {
		const s = await seed(db);
		for (let i = 0; i < 75; i++) {
			await insertArtifact(db, `art_${i}`, s.taskId);
		}
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			items: unknown[];
			nextCursor: string | null;
		};
		expect(body.items.length).toBeLessThanOrEqual(50);
		expect(body.nextCursor).not.toBeNull();
	});

	test("AE6: returns unrecognised kind as-is (open vocabulary) with preview:null", async ({
		db,
		app,
	}) => {
		// @lore AE6: Artifact.kind is now a string (open vocabulary). Unrecognised kinds
		// are preserved as-is at read time — no normalization to 'unknown_kind'.
		// The old 'unknown_kind' sentinel is gone. Unregistered kinds are forwarded to
		// the fallback renderer in the UI.
		const s = await seed(db);
		await insertArtifact(db, "art_unk", s.taskId, { kind: "internet_meme", previewJson: null });
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			items: Array<{ kind: string; preview: unknown | null }>;
		};
		expect(body.items[0]?.kind).toBe("internet_meme");
		expect(body.items[0]?.preview).toBeNull();
	});
});

describe("L3 GET /api/artifacts/:id (permalink)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns the artifact when it exists", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_one", s.taskId);
		const res = await app.request("/api/artifacts/art_one", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("art_one");
	});

	test("returns 404 for unknown id", async ({ app }) => {
		const res = await app.request("/api/artifacts/nope", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	// Cross-tenant — surfaced as 404 (not 403) per §5.3 to avoid leaking existence
	test("returns 404 for cross-tenant access (does not leak existence as 403)", async ({ app }) => {
		// Without multi-tenant test seam we can't truly cross tenants, but the
		// route must NEVER return 403 for a missing-or-foreign id; assert the
		// status set is exactly {200, 404} for any id lookup.
		const res = await app.request("/api/artifacts/some-other-tenant-id", {
			headers: authHeaders(),
		});
		expect([200, 404]).toContain(res.status);
		expect(res.status).not.toBe(403);
	});
});

describe("L3 POST /api/artifacts (writer endpoint, mutability rules)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("rejects payload where data.kind !== preview.kind (KIND_MISMATCH 400)", async ({
		db,
		app,
	}) => {
		const s = await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "code_diff",
				preview: { kind: "deck", slideCount: 1, firstSlideTitle: "x" },
			}),
		});
		expect(res.status).toBe(400);
	});

	test("rejects oversized preview body (>64KB) with 413", async ({ db, app }) => {
		const s = await seed(db);
		const huge = "a".repeat(70_000);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "decision",
				preview: { kind: "decision", claim: huge, rationale: "r" },
			}),
		});
		expect(res.status).toBe(413);
	});

	test("rejects FK-violating producingTaskId with 400 INVALID_TASK", async ({ app }) => {
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "missing",
				kind: "decision",
				preview: { kind: "decision", claim: "c", rationale: "r" },
			}),
		});
		expect(res.status).toBe(400);
	});

	test("rejects kind: 'unknown_kind' on create (closed-write rule)", async ({ db, app }) => {
		const s = await seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "unknown_kind",
				preview: null,
			}),
		});
		expect(res.status).toBe(400);
	});
});

describe("L3 PATCH immutability (preview, cost) — protected", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("second PATCH /preview returns 409 IMMUTABLE", async ({ db, app }) => {
		// @lore AE6: previewJson is seeded with a valid new-kind preview (text kind).
		// Old-kind previews (kind: "decision") are no longer valid per patchPreviewSchema.
		// The artifact kind in the DB is set to "text" to match the preview discriminant.
		const s = await seed(db);
		await insertArtifact(db, "art_imm", s.taskId, {
			kind: "text",
			previewJson: JSON.stringify({ kind: "text", body: "original decision", format: "plain" }),
		});
		const res = await app.request("/api/artifacts/art_imm/preview", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				preview: { kind: "text", body: "attempted overwrite", format: "plain" },
			}),
		});
		expect(res.status).toBe(409);
	});

	test("PATCH /cost returns 404 (O2: cost route removed — cost columns stripped from kernel table)", async ({
		db,
		app,
	}) => {
		// @lore O2: PATCH /:id/cost route removed because cost columns were stripped
		// from the kernel artifacts table. Cost settlement is now a strategy concern.
		const s = await seed(db);
		await insertArtifact(db, "art_costimm", s.taskId);
		const res = await app.request("/api/artifacts/art_costimm/cost", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ money_micros: 1000, tokens_input: 10, tokens_output: 10 }),
		});
		expect(res.status).toBe(404);
	});

	// L3 review fix Adv-B6 (O2 superseded): the PATCH /cost route was removed in O2.
	// @lore O2: cost columns stripped from kernel artifacts table. PATCH /cost
	// route removed. Cost settlement is now a strategy concern.
	test("PATCH /cost returns 404 for any artifact (O2: route removed)", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_partial", s.taskId);
		const res = await app.request("/api/artifacts/art_partial/cost", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ money_micros: 1000, tokens_input: 10, tokens_output: 10 }),
		});
		expect(res.status).toBe(404);
	});

	// L3 review fix Sec-MED-3 (O2 superseded): PATCH /cost route removed in O2.
	// @lore O2: validation for negative/fractional cost values no longer applies
	// since the route is gone. These tests document the 404 behavior.
	test("PATCH /cost with negative values returns 404 (O2: route removed)", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_neg", s.taskId);
		const res = await app.request("/api/artifacts/art_neg/cost", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ money_micros: -1, tokens_input: 0, tokens_output: 0 }),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /cost with fractional values returns 404 (O2: route removed)", async ({
		db,
		app,
	}) => {
		const s = await seed(db);
		await insertArtifact(db, "art_frac", s.taskId);
		const res = await app.request("/api/artifacts/art_frac/cost", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ money_micros: 1.5, tokens_input: 0, tokens_output: 0 }),
		});
		expect(res.status).toBe(404);
	});
});

// L3 review fix Adv-B5 — cursor roundtrip yields a non-overlapping next page.
describe("L3 GET /api/artifacts pagination cursor", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("cursor roundtrip: page 2 yields non-overlapping older artifacts", async ({ db, app }) => {
		const s = await seed(db);
		// Insert 5 artifacts with monotonically increasing createdAt.
		// @lore O2: cost columns stripped from kernel artifacts table
		for (let i = 0; i < 5; i++) {
			await db.insert(artifacts).values({
				id: `art_${i}`,
				producingTaskId: s.taskId,
				kind: "decision",
				previewJson: null,
				createdAt: `2026-04-28T00:00:0${i}.000Z`,
			});
		}
		const page1 = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}&limit=2`, {
			headers: authHeaders(),
		});
		const body1 = (await page1.json()) as {
			items: Array<{ id: string }>;
			nextCursor: string | null;
		};
		expect(body1.items.length).toBe(2);
		expect(body1.nextCursor).not.toBeNull();
		const ids1 = body1.items.map((i) => i.id);

		const page2 = await app.request(
			`/api/artifacts?axis=task&taskId=${s.taskId}&limit=2&cursor=${encodeURIComponent(body1.nextCursor ?? "")}`,
			{ headers: authHeaders() },
		);
		const body2 = (await page2.json()) as {
			items: Array<{ id: string }>;
			nextCursor: string | null;
		};
		expect(body2.items.length).toBe(2);
		const ids2 = body2.items.map((i) => i.id);
		// No overlap between page 1 and page 2.
		for (const id of ids2) expect(ids1).not.toContain(id);
	});

	test("rejects malformed cursor with 400", async ({ db, app }) => {
		const s = await seed(db);
		await insertArtifact(db, "art_x", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}&cursor=no-pipe`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});
});
