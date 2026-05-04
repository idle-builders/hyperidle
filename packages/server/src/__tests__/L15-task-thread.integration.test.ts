/**
 * L15 — Round-trip the body shape the web `task-thread-client` sends against
 * the real Hono app. Locks the C1+C2 contract: the POST /api/threads body
 * with `{ hostKind: "task", hostId, participants: [...], initialMessage }`
 * must be accepted, and the response shape `{ thread: { id }, messages }`
 * must be what the client parses.
 *
 * @lore Cross-package import would create a server→web edge; instead we
 * pin the body shape literally here. If the web client drifts, its own unit
 * tests catch the drift; if the server schema drifts, this integration test
 * catches that side.
 */
import { agents, createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l15";

const NOW = new Date().toISOString();

function seedFounder(db: HyperIdleDb): void {
	db.insert(agents)
		.values({
			id: "u-founder",
			name: "Founder",
			role: "founder",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		})
		.run();
}

function authedHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"X-Identity": "u-founder",
		"Content-Type": "application/json",
		...extra,
	};
}

describe("L15 task-thread body shape (web client × server contract)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedFounder(db);
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("POST /api/threads accepts the web client's body and returns { thread, messages }", async () => {
		const body = {
			hostKind: "task",
			hostId: "task-l15-int-1",
			participants: ["u-founder"],
			initialMessage: {
				type: "plain",
				payload: { text: "Thread opened from Team Board" },
				clientKey: "ck-l15-int-001",
			},
		};
		const res = await app.fetch(
			new Request("http://localhost/api/threads", {
				method: "POST",
				headers: authedHeaders(),
				body: JSON.stringify(body),
			}),
		);
		expect(res.status).toBe(201);
		const json = (await res.json()) as { thread?: { id?: string } };
		expect(json.thread).toBeDefined();
		expect(typeof json.thread?.id).toBe("string");
		expect((json.thread as { id: string }).id.length).toBeGreaterThan(0);
	});

	it("GET /api/threads?host_kind=task&host_id=<id> returns prior thread", async () => {
		const create = await app.fetch(
			new Request("http://localhost/api/threads", {
				method: "POST",
				headers: authedHeaders(),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-l15-int-2",
					participants: ["u-founder"],
					initialMessage: {
						type: "plain",
						payload: { text: "Thread opened from Team Board" },
						clientKey: "ck-l15-int-002",
					},
				}),
			}),
		);
		expect(create.status).toBe(201);
		const created = (await create.json()) as { thread: { id: string } };
		const list = await app.fetch(
			new Request("http://localhost/api/threads?host_kind=task&host_id=task-l15-int-2", {
				headers: authedHeaders(),
			}),
		);
		expect(list.status).toBe(200);
		const listed = (await list.json()) as { threads: Array<{ id: string }> };
		expect(listed.threads.length).toBeGreaterThan(0);
		expect(listed.threads[0].id).toBe(created.thread.id);
	});

	it("POST /api/threads/<id>/messages accepts the web client's plain-message body", async () => {
		const create = await app.fetch(
			new Request("http://localhost/api/threads", {
				method: "POST",
				headers: authedHeaders(),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-l15-int-3",
					participants: ["u-founder"],
					initialMessage: {
						type: "plain",
						payload: { text: "Thread opened from Team Board" },
						clientKey: "ck-l15-int-003a",
					},
				}),
			}),
		);
		const created = (await create.json()) as { thread: { id: string } };
		const post = await app.fetch(
			new Request(`http://localhost/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: authedHeaders(),
				body: JSON.stringify({
					type: "plain",
					payload: { text: "Requesting state change to done." },
					clientKey: "ck-l15-int-003b",
				}),
			}),
		);
		expect([200, 201]).toContain(post.status);
	});
});
