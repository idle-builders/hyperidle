/**
 * L6 — Request-Changes Composer + Inline Anchor (server red phase).
 *
 * Pins the API contract from `docs/work-packages/TRACK-L.md` L6:
 *
 *   "Submit posts a `request_changes` verdict with `summary` and
 *    `inline_comments[]` to POST /api/threads/:id/verdict (extended via
 *    POST /api/conversations/responses per .plan-L6 § 3.6). Server stores
 *    both and emits an event the agent's runtime consumes."
 *
 * Storage contract (`.plan-L6.md` § 3.6 option B):
 *   - `summary` → responses.feedback (text)
 *   - `inline_comments[]` → JSON.stringify into responses.inlineAnchor (text)
 *
 * Event contract (`.plan-L6.md` § 3.6):
 *   - `ResponseRecordedEvent` extended with optional `summary` and
 *     `inlineComments` fields (only present when decision === "request-changes").
 *
 * These tests MUST fail today: the createResponseSchema does not accept
 * `summary` or `inline_comments`, the handler does not write structured
 * inlineAnchor, and the emitted event omits the new fields.
 */
import {
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	responses,
	teams,
	threads,
} from "@hyperidle/db";
import {
	EventBus,
	REQUEST_CHANGES_INLINE_COMMENTS_MAX,
	REQUEST_CHANGES_SUMMARY_MAX,
	type ResponseRecordedEvent,
} from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-l6";
const NOW = "2026-04-26T12:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

function seedActor(db: HyperIdleDb): void {
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:ceo','CEO','["market"]','${NOW}')`,
		),
	);
}

function seedReviewItem(db: HyperIdleDb): void {
	db.insert(products).values({ id: "p-l6", name: "P", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({ id: "team-l6", productId: "p-l6", capacity: 1, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(threads).values({ id: "thread-l6", kind: "review", createdAt: NOW }).run();
	db.insert(items)
		.values({ id: "item-l6", title: "L6 review", threadId: "thread-l6", createdAt: NOW })
		.run();
}

describe("L6 — POST /api/conversations/responses with request_changes payload", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	let captured: ResponseRecordedEvent[] = [];

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		seedActor(db);
		eventBus = new EventBus();
		captured = [];
		eventBus.on("response_recorded", (event) => {
			captured.push(event as ResponseRecordedEvent);
		});
		app = createTestApp({ db, eventBus });
		seedReviewItem(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("accepts summary + inline_comments[] for request-changes and returns 201", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "tighten the wording",
				inline_comments: [
					{ line_index: 2, body: "rename this var" },
					{ line_index: 5, body: "missing null check" },
				],
			}),
		});
		expect(res.status).toBe(201);
	});

	it("rejects request-changes without summary with 400 VALIDATION_ERROR", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				inline_comments: [{ line_index: 0, body: "x" }],
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	it("rejects summary above the cap with 400 VALIDATION_ERROR", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "a".repeat(REQUEST_CHANGES_SUMMARY_MAX + 1),
			}),
		});
		expect(res.status).toBe(400);
	});

	it("stores summary in responses.feedback and inline_comments[] JSON in responses.inlineAnchor", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "tighten the wording",
				inline_comments: [
					{ line_index: 2, body: "rename this var" },
					{ line_index: 5, body: "missing null check" },
				],
			}),
		});
		expect(res.status).toBe(201);

		const row = db.select().from(responses).where(eq(responses.itemId, "item-l6")).get();
		expect(row).toBeDefined();
		expect(row?.feedback).toBe("tighten the wording");
		expect(row?.inlineAnchor).toBeDefined();
		const decoded = JSON.parse(row?.inlineAnchor ?? "[]") as Array<{
			line_index: number;
			body: string;
		}>;
		expect(decoded).toHaveLength(2);
		expect(decoded[0]).toEqual({ line_index: 2, body: "rename this var" });
		expect(decoded[1]).toEqual({ line_index: 5, body: "missing null check" });
	});

	it("emits ResponseRecordedEvent with summary and inlineComments populated", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "tighten the wording",
				inline_comments: [{ line_index: 4, body: "naming nit" }],
			}),
		});
		expect(res.status).toBe(201);
		expect(captured).toHaveLength(1);
		const event = captured[0];
		expect(event.type).toBe("response_recorded");
		expect(event.decision).toBe("request-changes");
		expect(event.summary).toBe("tighten the wording");
		expect(event.inlineComments).toEqual([{ lineIndex: 4, body: "naming nit" }]);
	});

	it("omits summary/inlineComments from event for non-request-changes decisions", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "approve",
			}),
		});
		expect(res.status).toBe(201);
		expect(captured).toHaveLength(1);
		expect(captured[0].summary).toBeUndefined();
		expect(captured[0].inlineComments).toBeUndefined();
	});

	it("rejects inline_comments[] entries with empty body", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "fix",
				inline_comments: [{ line_index: 0, body: "" }],
			}),
		});
		expect(res.status).toBe(400);
	});

	/**
	 * @lore L6 review (sec must-fix / adv CRIT-3): cap on inline_comments[]
	 * length. 51 entries must hit the schema's `.max(REQUEST_CHANGES_INLINE_COMMENTS_MAX)`
	 * and return 400 VALIDATION_ERROR before the storage path runs.
	 */
	it("rejects inline_comments[] above the count cap with 400 VALIDATION_ERROR", async () => {
		const overCap = REQUEST_CHANGES_INLINE_COMMENTS_MAX + 1;
		const tooMany = Array.from({ length: overCap }, (_, i) => ({
			line_index: i,
			body: `c${i}`,
		}));
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "many comments",
				inline_comments: tooMany,
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	it("rejects inline_comments[] entries with negative line_index", async () => {
		const res = await app.request("/api/conversations/responses", {
			method: "POST",
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
			body: JSON.stringify({
				itemId: "item-l6",
				decision: "request-changes",
				summary: "fix",
				inline_comments: [{ line_index: -1, body: "x" }],
			}),
		});
		expect(res.status).toBe(400);
	});
});
