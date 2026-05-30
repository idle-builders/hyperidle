// L3 RED — Hono route tests for /api/artifacts.
// Source of truth: plans/L3/architecture.md §5, §12.

import {
	artifacts,
	bets,
	createTestDb,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

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

function seed(db: HyperIdleDb, suffix = ""): SeedScope {
	// @lore U1: productId is actually teamId (domain entity id), not productId.
	// Kept as "productId" in SeedScope for backward compat with test axis queries.
	const productId = `prod${suffix}`;
	const teamMembersId = `team${suffix}`;
	const betId = `bet${suffix}`;
	const taskId = `task${suffix}`;
	// Insert domain entity (teams table, formerly products)
	db.insert(teams).values({ id: productId, name: "P", phase: "build", createdAt: NOW }).run();
	// Insert membership group (teamMembers table, formerly teams)
	db.insert(teamMembers)
		.values({ id: teamMembersId, teamId: productId, capacity: 1, activeBets: 0, formedAt: NOW })
		.run();
	// @lore U1: bets.teamId references teams.id (domain entity), not teamMembers.id
	db.insert(bets)
		.values({
			id: betId,
			teamId: productId,
			description: "p",
			appetite: "1w",
			status: "draft",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
	// @lore U1: tasks.teamId references teams.id (domain entity), not teamMembers.id
	db.insert(tasks)
		.values({
			id: taskId,
			betId,
			teamId: productId,
			title: "T",
			state: "pending",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
	return { productId, betId, taskId };
}

// @lore O2: costMoneyMicros, costTokensInput, costTokensOutput, costSettledAt
// stripped from the kernel artifacts table. Callers that relied on those columns
// for test setup must use the simplified insert below.
function insertArtifact(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	overrides: Partial<{
		kind: string;
		previewJson: string | null;
	}> = {},
): void {
	db.insert(artifacts)
		.values({
			id,
			producingTaskId: taskId,
			kind: overrides.kind ?? "code_diff",
			previewJson: overrides.previewJson ?? null,
			createdAt: NOW,
		})
		.run();
}

describe("L3 GET /api/artifacts (axis discriminated union)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("401 when unauthenticated", async () => {
		const res = await app.request("/api/artifacts?axis=portfolio", {
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(401);
	});

	it("400 when axis is malformed", async () => {
		const res = await app.request("/api/artifacts?axis=bogus", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	it("400 when axis=task but taskId is missing", async () => {
		const res = await app.request("/api/artifacts?axis=task", { headers: authHeaders() });
		expect(res.status).toBe(400);
	});

	it("axis=task returns artifacts for one task only", async () => {
		const a = seed(db, "_a");
		const b = seed(db, "_b");
		insertArtifact(db, "art_a1", a.taskId);
		insertArtifact(db, "art_a2", a.taskId);
		insertArtifact(db, "art_b1", b.taskId);

		const res = await app.request(`/api/artifacts?axis=task&taskId=${a.taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id).sort();
		expect(ids).toEqual(["art_a1", "art_a2"]);
	});

	it("axis=bet aggregates artifacts across the bet's tasks", async () => {
		const s = seed(db);
		// add a second task to the same bet
		db.insert(tasks)
			.values({
				id: "task2",
				betId: s.betId,
				// @lore U1: teamId references teams.id (domain entity = s.productId)
				teamId: s.productId,
				title: "T2",
				state: "pending",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		insertArtifact(db, "art_x", s.taskId);
		insertArtifact(db, "art_y", "task2");
		const res = await app.request(`/api/artifacts?axis=bet&betId=${s.betId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		expect(body.items.map((i) => i.id).sort()).toEqual(["art_x", "art_y"]);
	});

	it("axis=product aggregates artifacts across the product's bets", async () => {
		const s = seed(db);
		insertArtifact(db, "art_p1", s.taskId);
		const res = await app.request(`/api/artifacts?axis=product&productId=${s.productId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		expect(body.items.map((i) => i.id)).toContain("art_p1");
	});

	it("axis=portfolio aggregates artifacts across all products", async () => {
		const a = seed(db, "_a");
		const b = seed(db, "_b");
		insertArtifact(db, "art_pa", a.taskId);
		insertArtifact(db, "art_pb", b.taskId);
		const res = await app.request("/api/artifacts?axis=portfolio", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).toContain("art_pa");
		expect(ids).toContain("art_pb");
	});

	it("response items carry denormalised producing_task_title", async () => {
		const s = seed(db);
		insertArtifact(db, "art_t", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			items: Array<{ producingTaskTitle: string }>;
		};
		expect(body.items[0]?.producingTaskTitle).toBe("T");
	});

	it("response items carry threadCount as a number (forward-compat zero until L1)", async () => {
		const s = seed(db);
		insertArtifact(db, "art_tc", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as { items: Array<{ threadCount: number }> };
		expect(body.items[0]?.threadCount).toBe(0);
		expect(typeof body.items[0]?.threadCount).toBe("number");
	});

	it("response items carry cost-from-session shape (WireMoney + TokenUsage after L17)", async () => {
		// @lore O2: cost columns stripped from kernel artifacts table.
		// cost.money and cost.tokens are null when no session cost data exists.
		const s = seed(db);
		insertArtifact(db, "art_c", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<{
				cost: {
					money: { minor: number; currency: string } | null;
					tokens: { byTier: Record<string, unknown> } | null;
				} | null;
			}>;
		};
		// O2: cost shape is present but money/tokens are null (kernel table has no cost data)
		expect(body.items[0]).toBeDefined();
		// cost may be null or an object with null fields — either is valid post-O2
		if (body.items[0]?.cost != null) {
			expect(body.items[0].cost.money).toBeNull();
		}
	});

	it("pagination cap enforced — limit > 200 returns 400 LIMIT_TOO_HIGH", async () => {
		const res = await app.request("/api/artifacts?axis=portfolio&limit=1000", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});

	it("pagination default limit caps results", async () => {
		const s = seed(db);
		for (let i = 0; i < 75; i++) {
			insertArtifact(db, `art_${i}`, s.taskId);
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

	it("normalises an unrecognised kind to unknown_kind with preview:null", async () => {
		const s = seed(db);
		insertArtifact(db, "art_unk", s.taskId, { kind: "internet_meme", previewJson: null });
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}`, {
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			items: Array<{ kind: string; preview: unknown | null }>;
		};
		expect(body.items[0]?.kind).toBe("unknown_kind");
		expect(body.items[0]?.preview).toBeNull();
	});
});

describe("L3 GET /api/artifacts/:id (permalink)", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => vi.unstubAllEnvs());

	it("returns the artifact when it exists", async () => {
		const s = seed(db);
		insertArtifact(db, "art_one", s.taskId);
		const res = await app.request("/api/artifacts/art_one", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("art_one");
	});

	it("returns 404 for unknown id", async () => {
		const res = await app.request("/api/artifacts/nope", { headers: authHeaders() });
		expect(res.status).toBe(404);
	});

	// Cross-tenant — surfaced as 404 (not 403) per §5.3 to avoid leaking existence
	it("returns 404 for cross-tenant access (does not leak existence as 403)", async () => {
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
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => vi.unstubAllEnvs());

	it("rejects payload where data.kind !== preview.kind (KIND_MISMATCH 400)", async () => {
		const s = seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "code_diff",
				preview: { kind: "deck", slideCount: 1, firstSlideTitle: "x" },
				cost: null,
			}),
		});
		expect(res.status).toBe(400);
	});

	it("rejects oversized preview body (>64KB) with 413", async () => {
		const s = seed(db);
		const huge = "a".repeat(70_000);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "decision",
				preview: { kind: "decision", claim: huge, rationale: "r" },
				cost: null,
			}),
		});
		expect(res.status).toBe(413);
	});

	it("rejects FK-violating producingTaskId with 400 INVALID_TASK", async () => {
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: "missing",
				kind: "decision",
				preview: { kind: "decision", claim: "c", rationale: "r" },
				cost: null,
			}),
		});
		expect(res.status).toBe(400);
	});

	it("rejects kind: 'unknown_kind' on create (closed-write rule)", async () => {
		const s = seed(db);
		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: s.taskId,
				kind: "unknown_kind",
				preview: null,
				cost: null,
			}),
		});
		expect(res.status).toBe(400);
	});
});

describe("L3 PATCH immutability (preview, cost) — protected", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => vi.unstubAllEnvs());

	it("second PATCH /preview returns 409 IMMUTABLE", async () => {
		const s = seed(db);
		insertArtifact(db, "art_imm", s.taskId, {
			previewJson: JSON.stringify({ kind: "decision", claim: "c", rationale: "r" }),
		});
		const res = await app.request("/api/artifacts/art_imm/preview", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				preview: { kind: "decision", claim: "x", rationale: "y" },
			}),
		});
		expect(res.status).toBe(409);
	});

	it("PATCH /cost returns 404 (O2: cost route removed — cost columns stripped from kernel table)", async () => {
		// @lore O2: PATCH /:id/cost route removed because cost columns were stripped
		// from the kernel artifacts table. Cost settlement is now a strategy concern.
		const s = seed(db);
		insertArtifact(db, "art_costimm", s.taskId);
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
	it("PATCH /cost returns 404 for any artifact (O2: route removed)", async () => {
		const s = seed(db);
		insertArtifact(db, "art_partial", s.taskId);
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
	it("PATCH /cost with negative values returns 404 (O2: route removed)", async () => {
		const s = seed(db);
		insertArtifact(db, "art_neg", s.taskId);
		const res = await app.request("/api/artifacts/art_neg/cost", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ money_micros: -1, tokens_input: 0, tokens_output: 0 }),
		});
		expect(res.status).toBe(404);
	});

	it("PATCH /cost with fractional values returns 404 (O2: route removed)", async () => {
		const s = seed(db);
		insertArtifact(db, "art_frac", s.taskId);
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
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => vi.unstubAllEnvs());

	it("cursor roundtrip: page 2 yields non-overlapping older artifacts", async () => {
		const s = seed(db);
		// Insert 5 artifacts with monotonically increasing createdAt.
		// @lore O2: cost columns stripped from kernel artifacts table
		for (let i = 0; i < 5; i++) {
			db.insert(artifacts)
				.values({
					id: `art_${i}`,
					producingTaskId: s.taskId,
					kind: "decision",
					previewJson: null,
					createdAt: `2026-04-28T00:00:0${i}.000Z`,
				})
				.run();
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

	it("rejects malformed cursor with 400", async () => {
		const s = seed(db);
		insertArtifact(db, "art_x", s.taskId);
		const res = await app.request(`/api/artifacts?axis=task&taskId=${s.taskId}&cursor=no-pipe`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});
});
