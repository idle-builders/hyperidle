/**
 * The explicit-session-start wire projection, in its new home:
 * `@hyperidle/shared/http`.
 *
 * `POST /api/sessions` (core-hosted) and `GET /api/sessions/starts/:startId`
 * (orchestration-hosted) both render this projection. One implementation, or the
 * two apps would answer the same wire contract differently and nothing would catch
 * it — `tsc` sees an omission, never a divergence.
 *
 * The 202-with-a-session branch returns the row the caller passed in, whole. A
 * narrowing here silently drops columns from the `POST /api/sessions` body.
 */
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import {
	type ExplicitStartRow,
	type HyperIdleEnv,
	projectExplicitStartOutcome,
	sendStartProjection,
} from "../http/index.js";

const baseStart: ExplicitStartRow = {
	id: "start-1",
	taskId: "task-1",
	requestedAgentId: "agent-1",
	requestedModelTier: "workhorse",
	idempotencyKey: "idem-1",
	status: "requested",
	sessionId: null,
	failureCode: null,
};

/** Deliberately wider than any narrowed session projection. */
const sessionRow = {
	id: "s-1",
	agentId: "agent-1",
	taskId: "task-1",
	state: "active",
	outcome: null,
	startedAt: "2026-08-04T00:00:00.000Z",
	endedAt: null,
	notes: null,
	routineId: null,
	effectivenessScore: null,
};

describe("projectExplicitStartOutcome", () => {
	test("a requested start is a 202 pending projection with its poll URL", () => {
		const projection = projectExplicitStartOutcome(baseStart, null);

		expect(projection).toEqual({
			status: 202,
			body: {
				status: "requested",
				startId: "start-1",
				taskId: "task-1",
				requestedAgentId: "agent-1",
				requestedModelTier: "workhorse",
				idempotencyKey: "idem-1",
				pollUrl: "/api/sessions/starts/start-1",
			},
		});
	});

	test("an admitted start with its session row is a 202 carrying the WHOLE row", () => {
		const projection = projectExplicitStartOutcome(
			{ ...baseStart, status: "admitted", sessionId: "s-1" },
			sessionRow,
		);

		expect(projection.status).toBe(202);
		expect(projection.body).toBe(sessionRow);
		expect(Object.keys(projection.body as object)).toEqual(Object.keys(sessionRow));
	});

	test("an admitted start whose session row is missing falls back to the pending projection", () => {
		const projection = projectExplicitStartOutcome(
			{ ...baseStart, status: "admitted", sessionId: "s-1" },
			null,
		);

		expect(projection.status).toBe(202);
		expect(projection.body).toMatchObject({ status: "requested", startId: "start-1" });
	});

	test("NO_ELIGIBLE_HARNESS is 422", () => {
		const projection = projectExplicitStartOutcome(
			{ ...baseStart, status: "failed", failureCode: "NO_ELIGIBLE_HARNESS" },
			null,
		);

		expect(projection).toEqual({
			status: 422,
			body: { error: "NO_ELIGIBLE_HARNESS", code: "NO_ELIGIBLE_HARNESS" },
		});
	});

	test("CONCURRENCY_LIMIT is 429", () => {
		const projection = projectExplicitStartOutcome(
			{ ...baseStart, status: "failed", failureCode: "CONCURRENCY_LIMIT" },
			null,
		);

		expect(projection).toEqual({
			status: 429,
			body: { error: "CONCURRENCY_LIMIT", code: "CONCURRENCY_LIMIT" },
		});
	});

	test("an unmapped failure code is a 500 with the generic message", () => {
		const projection = projectExplicitStartOutcome(
			{ ...baseStart, status: "failed", failureCode: "SOMETHING_ELSE" },
			null,
		);

		expect(projection).toEqual({
			status: 500,
			body: { error: "SOMETHING_ELSE", code: "SOMETHING_ELSE" },
		});
	});

	test("a failed start with no failure code is INTERNAL_ERROR, 500, generic message", () => {
		const projection = projectExplicitStartOutcome({ ...baseStart, status: "failed" }, null);

		expect(projection).toEqual({
			status: 500,
			body: { error: "Session provisioning failed", code: "INTERNAL_ERROR" },
		});
	});
});

describe("sendStartProjection", () => {
	async function respond(start: ExplicitStartRow, session: object | null): Promise<Response> {
		const app = new Hono<HyperIdleEnv>();
		app.get("/starts", (c) => sendStartProjection(c, projectExplicitStartOutcome(start, session)));
		return app.request("/starts");
	}

	test("renders the pending projection as 202 JSON", async () => {
		const res = await respond(baseStart, null);

		expect(res.status).toBe(202);
		expect(await res.json()).toMatchObject({
			status: "requested",
			pollUrl: "/api/sessions/starts/start-1",
		});
	});

	test("renders the admitted session row as 202 JSON with every column", async () => {
		const res = await respond({ ...baseStart, status: "admitted", sessionId: "s-1" }, sessionRow);

		expect(res.status).toBe(202);
		expect(await res.json()).toEqual(sessionRow);
	});

	test("renders 422, 429 and 500 failures at their own statuses", async () => {
		const codes: ReadonlyArray<readonly [string, number]> = [
			["NO_ELIGIBLE_HARNESS", 422],
			["CONCURRENCY_LIMIT", 429],
			["INTERNAL_ERROR", 500],
		];

		for (const [failureCode, status] of codes) {
			const res = await respond({ ...baseStart, status: "failed", failureCode }, null);
			expect(res.status).toBe(status);
			expect(await res.json()).toMatchObject({ code: failureCode });
		}
	});
});
