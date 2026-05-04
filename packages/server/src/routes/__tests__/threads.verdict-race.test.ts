/**
 * L15 regression-pin — VerdictRaceConflict semantic must survive the L15
 * `appendPlainMessage` extraction.
 *
 * Source: docs/work-packages/L15-plan.md §5.4 + §12 row
 * `threads.verdict-race.test.ts`. The plain-type extraction must NOT pull
 * verdict-handling logic — the rowcount check at threads.ts:510–524 stays.
 *
 * Two concurrent verdict messages targeting the same review:
 *   first → 201 + thread_resolved event
 *   second → 409 verdict_race
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

const TEST_API_KEY = "test-key-verdict-race";

function authHeaders(): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		"X-Identity": "u-founder",
	};
}

interface Ctx {
	app: Hono;
	db: HyperIdleDb;
	events: DomainEvent[];
}

function setup(): Ctx {
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
	// Seed a non-founder agent so the review's initial sender is not the
	// same identity as the verdict sender — `readInitialSenderId` picks the
	// first non-founder participant for review/questionnaire types.
	db.insert(agents)
		.values({
			id: "agent-1",
			name: "A",
			role: "developer",
			teamId: "t1",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(bets)
		.values({
			id: "bet-1",
			productId: "p1",
			teamId: "t1",
			pitch: "p",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-1",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	return { app, db, events };
}

describe("Verdict race regression — first wins, second 409 verdict_race", () => {
	let ctx: Ctx;
	let threadId: string;
	let reviewId: string;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setup();
		// Create a thread with an initial review message.
		const create = await ctx.app.request("/api/threads", {
			method: "POST",
			headers: {
				"X-API-Key": TEST_API_KEY,
				"Content-Type": "application/json",
				"X-Identity": "agent-1",
			},
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: {
						title: "Pricing",
						reasoning: ["a"],
						artifactRef: { id: "art-1", kind: "text_diff" },
					},
					clientKey: "ck-vr-init-001",
				},
			}),
		});
		expect(create.status).toBe(201);
		const body = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string; type: string }>;
		};
		threadId = body.thread.id;
		reviewId = body.messages[0].id;
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("first verdict resolves; second verdict on the same review returns 409 verdict_race", async () => {
		const fire = (ck: string): Promise<Response> =>
			ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					type: "verdict",
					payload: { decision: "approve", resolvesMessageId: reviewId },
					clientKey: ck,
				}),
			});
		const [r1, r2] = await Promise.all([fire("ck-vr-001"), fire("ck-vr-002")]);
		const codes = [r1.status, r2.status].sort();
		expect(codes).toEqual([201, 409]);

		// The 409 carries the verdict_race code.
		const racing = r1.status === 409 ? r1 : r2;
		const racingBody = (await racing.json()) as { code?: string };
		expect(racingBody.code).toBe("verdict_race");

		// thread_resolved event emitted exactly once.
		const resolved = ctx.events.filter((e) => e.type === "thread_resolved");
		expect(resolved).toHaveLength(1);
	});
});
