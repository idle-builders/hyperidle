/**
 * L14 — Bet-level human actions: pause, resume, GET enrichment, actor field,
 * appetite enum guard.
 *
 * AC-1: POST /bets/:id/pause — transitions in_progress → paused, returns 200.
 * AC-1: POST /bets/:id/pause — transitions behind → paused, returns 200.
 * AC-1: POST /bets/:id/pause — invalid transition returns 409.
 * AC-2: POST /bets/:id/resume — transitions paused → in_progress, returns 200.
 * AC-2: POST /bets/:id/resume — invalid transition returns 409.
 * AC-3: POST /bets/:id/pause with empty reason returns 400.
 * AC-4: PATCH /bets/:id appetite enum — valid values accepted, invalid rejected with 400.
 * AC-5: Every action writes RevisionLogEntry with actor: "u-founder".
 * AC-6: GET /bets/:id returns enriched title, product, team, progress fields.
 * AC-13: PATCH /bets with appetite "small" → 400 (POST create schema enforces enum).
 */

import { bets, createTestDb, type HyperIdleDb, products, tasks, teams } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RevisionLogEntry } from "../../services/bet-state-machine.js";
import { transitionBet } from "../../services/bet-state-machine.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-L14";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function parseRevisionLog(raw: string | null): RevisionLogEntry[] {
	if (!raw) return [];
	return JSON.parse(raw) as RevisionLogEntry[];
}

describe("L14 — Bet actions: pause / resume / enrichment / actor", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		db.insert(products).values({ id: "p1", name: "Alpha", phase: "build", createdAt: now }).run();
		db.insert(teams)
			.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
			.run();
		db.insert(bets)
			.values({
				id: "bet1",
				productId: "p1",
				teamId: "t1",
				pitch: "# Hello\nBody text",
				appetite: "2 weeks",
				status: "shaped",
				createdAt: now,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ─── AC-1: Pause route ───────────────────────────────────────────────────

	describe("AC-1 — POST /bets/:id/pause", () => {
		it("transitions in_progress → paused and returns 200 with status=paused", async () => {
			// Arrange: walk bet to in_progress
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");

			// Act
			const res = await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Team is overloaded" }),
			});

			// Assert
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("paused");
		});

		it("transitions behind → paused and returns 200", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "behind");

			const res = await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Behind schedule, pausing" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("paused");
		});

		it("returns 409 when transition is invalid (shaped → paused)", async () => {
			// Bet is still in 'shaped' — pausing is not a valid transition
			const res = await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Pause it" }),
			});

			expect(res.status).toBe(409);
		});

		it("returns 404 for unknown betId", async () => {
			const res = await app.request("/api/bets/nonexistent/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "reason" }),
			});

			expect(res.status).toBe(404);
		});
	});

	// ─── AC-2: Resume route ──────────────────────────────────────────────────

	describe("AC-2 — POST /bets/:id/resume", () => {
		it("transitions paused → in_progress and returns 200", async () => {
			// Arrange: walk bet to paused
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "paused");

			const res = await app.request("/api/bets/bet1/resume", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Capacity freed up" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("in_progress");
		});

		it("allows resume without a reason (reason is optional)", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "paused");

			const res = await app.request("/api/bets/bet1/resume", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(200);
		});

		it("returns 409 when transition is invalid (shaped → resume)", async () => {
			const res = await app.request("/api/bets/bet1/resume", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(409);
		});

		it("returns 404 for unknown betId", async () => {
			const res = await app.request("/api/bets/nonexistent/resume", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(404);
		});
	});

	// ─── AC-3: Empty reason → 400 ─────────────────────────────────────────────

	describe("AC-3 — Pause requires non-empty reason", () => {
		it("returns 400 when reason is empty string", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");

			const res = await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when reason is missing", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");

			const res = await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});
	});

	// ─── AC-4: Appetite enum validation ─────────────────────────────────────

	describe("AC-4 — Appetite enum guard on PATCH", () => {
		beforeEach(async () => {
			// Walk to in_progress so updateBetField doesn't reject on status
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
		});

		it("accepts appetite '1 week'", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "1 week", reason: "Changed timeline" }),
			});
			expect(res.status).toBe(200);
		});

		it("accepts appetite '2 weeks'", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "2 weeks", reason: "Changed timeline" }),
			});
			expect(res.status).toBe(200);
		});

		it("accepts appetite '6 weeks'", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "6 weeks", reason: "Changed timeline" }),
			});
			expect(res.status).toBe(200);
		});

		it("rejects appetite 'small' with 400", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "small", reason: "test" }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects appetite 'big' with 400", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "big", reason: "test" }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects arbitrary duration string with 400", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "3 months", reason: "test" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// ─── AC-4: Appetite update allowed from paused / behind / blocked states ─

	describe("AC-4 — Appetite update from non-in_progress mutable states", () => {
		it("allows appetite update when bet is paused", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "paused");

			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "6 weeks", reason: "Paused, extended" }),
			});
			expect(res.status).toBe(200);
		});

		it("allows appetite update when bet is behind", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "behind");

			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "6 weeks", reason: "Running behind" }),
			});
			expect(res.status).toBe(200);
		});

		it("allows appetite update when bet is blocked", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "blocked");

			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field: "appetite", value: "6 weeks", reason: "Blocked" }),
			});
			expect(res.status).toBe(200);
		});
	});

	// ─── AC-5: Actor field in revision log ───────────────────────────────────

	describe("AC-5 — RevisionLogEntry actor field", () => {
		it("pause action writes actor='u-founder' in revision log", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");

			await app.request("/api/bets/bet1/pause", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Pausing for review" }),
			});

			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { revisionLog: string | null };
			const log = parseRevisionLog(body.revisionLog);
			const pauseEntry = log.find((e) => e.field === "status" && e.new_value === "paused");
			expect(pauseEntry).toBeDefined();
			expect(pauseEntry?.actor).toBe("u-founder");
		});

		it("resume action writes actor='u-founder' in revision log", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");
			await transitionBet(db, eventBus, "bet1", "paused");

			await app.request("/api/bets/bet1/resume", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});

			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { revisionLog: string | null };
			const log = parseRevisionLog(body.revisionLog);
			const resumeEntry = log.find(
				(e) => e.field === "status" && e.new_value === "in_progress" && e.actor === "u-founder",
			);
			expect(resumeEntry).toBeDefined();
		});

		it("kill action via existing route also writes actor (kill route must pass actor)", async () => {
			await transitionBet(db, eventBus, "bet1", "committed");
			await transitionBet(db, eventBus, "bet1", "in_progress");

			await app.request("/api/bets/bet1/kill", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "No longer viable" }),
			});

			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { revisionLog: string | null };
			const log = parseRevisionLog(body.revisionLog);
			const killEntry = log.find((e) => e.new_value === "killed");
			expect(killEntry).toBeDefined();
			expect(killEntry?.actor).toBe("u-founder");
		});
	});

	// ─── AC-6: GET /bets/:id enrichment ─────────────────────────────────────

	describe("AC-6 — GET /bets/:id enrichment", () => {
		it("returns title derived from first heading line of pitch", async () => {
			// pitch starts with "# Hello"
			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { title?: string };
			expect(body.title).toBe("Hello");
		});

		it("returns product name joined from products table", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { product?: string };
			expect(body.product).toBe("Alpha");
		});

		it("returns team identifier joined from teams table", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { team?: string };
			// team field is team id (t1) — a string
			expect(body.team).toBeDefined();
			expect(typeof body.team).toBe("string");
		});

		it("returns progress with done and total computed from tasks", async () => {
			const now = new Date().toISOString();
			// Seed two tasks: one done, one in_progress
			db.insert(tasks)
				.values({
					id: "task-done",
					betId: "bet1",
					productId: "p1",
					teamId: "t1",
					title: "Done task",
					state: "done",
					priority: 0,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-wip",
					betId: "bet1",
					productId: "p1",
					teamId: "t1",
					title: "WIP task",
					state: "in_progress",
					priority: 1,
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { progress?: { done: number; total: number } };
			expect(body.progress).toEqual({ done: 1, total: 2 });
		});

		it("returns progress { done: 0, total: 0 } when no tasks", async () => {
			const res = await app.request("/api/bets/bet1", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { progress?: { done: number; total: number } };
			expect(body.progress).toEqual({ done: 0, total: 0 });
		});

		it("falls back to bet id when pitch has no heading", async () => {
			// Create a bet with no heading
			const now = new Date().toISOString();
			db.insert(bets)
				.values({
					id: "bet-noheading",
					productId: "p1",
					teamId: "t1",
					pitch: "Just some prose with no heading",
					appetite: "1 week",
					status: "shaped",
					createdAt: now,
				})
				.run();

			const res = await app.request("/api/bets/bet-noheading", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { title?: string };
			// Falls back to bet id or a non-empty string
			expect(body.title).toBeTruthy();
		});
	});

	// ─── AC-13: POST /bets create schema rejects invalid appetite ────────────

	describe("AC-13 — Create bet schema rejects invalid appetite enum", () => {
		it("returns 400 when creating bet with appetite 'small'", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "p1",
					teamId: "t1",
					pitch: "# Feature",
					appetite: "small",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when creating bet with appetite 'big'", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					productId: "p1",
					teamId: "t1",
					pitch: "# Feature",
					appetite: "big",
				}),
			});
			expect(res.status).toBe(400);
		});
	});
});
