/**
 * L15 — REGRESSION PIN for the L1-step9 `VerdictRaceConflict` semantic.
 *
 * Source: L15-plan.md § 12 protected row `threads.verdict-race.test.ts`.
 *
 * Two concurrent verdict messages targeting the same review must produce:
 *   - first  → 201 (review.resolvedAt set, thread_resolved emitted)
 *   - second → 409 with code `verdict_race`
 *
 * This test EXISTS to ensure the L15 `appendPlainMessage` extraction does
 * NOT regress the verdict-only race guard at `threads.ts:488–524`. Verdict
 * branches stay at the threads route; the helper extraction touches plain
 * branches only. If this test goes red after the green phase, the
 * extraction took too much.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-verdict-race-pin";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
}

function setupApp(): AppCtx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const events: DomainEvent[] = [];
	eventBus.on("*", (e) => {
		events.push(e);
	});
	const app = createTestApp({ db, eventBus });

	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "u-founder-2",
			name: "F2",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({ id: "agent-1", name: "A", role: "builder", status: "active", createdAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-x",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	return { app, db, eventBus, events };
}

describe("threads.verdict-race — L1 invariant survives the L15 helper extraction", () => {
	let ctx: AppCtx;
	let threadId: string;
	let reviewId: string;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();

		// Create a thread initialised with a review by agent-1.
		const create = await ctx.app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-1" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "u-founder-2", "agent-1"],
				initialMessage: {
					type: "review",
					payload: {
						title: "race review",
						reasoning: ["needs decision"],
						artifactRef: { id: "art-1", kind: "text_diff" },
					},
					clientKey: "race-review-init",
				},
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		threadId = created.thread.id;
		reviewId = created.messages[0].id;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("two concurrent verdicts on the same review → first 201, second 409 verdict_race", async () => {
		const post = (xId: string, clientKey: string): Promise<Response> =>
			ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": xId }),
				body: JSON.stringify({
					type: "verdict",
					payload: { decision: "approve", resolvesMessageId: reviewId },
					clientKey,
				}),
			});

		const [resA, resB] = await Promise.all([
			post("u-founder", "race-vk-A"),
			post("u-founder-2", "race-vk-B"),
		]);
		const statuses = [resA.status, resB.status].sort();
		expect(statuses).toEqual([201, 409]);

		const losing = resA.status === 409 ? resA : resB;
		const losingBody = (await losing.json()) as { code?: string };
		expect(losingBody.code).toBe("verdict_race");
	});

	it("the winning verdict still emits `thread_resolved`", async () => {
		const post = (xId: string, clientKey: string): Promise<Response> =>
			ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": xId }),
				body: JSON.stringify({
					type: "verdict",
					payload: { decision: "approve", resolvesMessageId: reviewId },
					clientKey,
				}),
			});
		await Promise.all([post("u-founder", "race-evt-A"), post("u-founder-2", "race-evt-B")]);

		const resolved = ctx.events.find((e) => e.type === "thread_resolved");
		expect(resolved).toBeDefined();
	});
});
