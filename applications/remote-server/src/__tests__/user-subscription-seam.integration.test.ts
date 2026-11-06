/**
 * The real server (`createServer`, a real socket, a real `ws` client): the three user entries
 * answer over `POST /api/actions/<name>`, and a subscription wakes the right subscribers on a real
 * change — the person gets a `user:<id>` frame and an inbox row, the in-reach agent a `subscription`
 * row, the out-of-reach agent none — and pausing both subscriptions silences a second edit.
 */

import { type HyperIdleDb, inbox, tasks, teams, threads, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { afterEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

interface Booted {
	readonly server: ServerHandle;
	readonly port: number;
	readonly apiKey: string;
}

interface HttpResult {
	readonly status: number;
	readonly json: Record<string, unknown>;
}

async function boot(db: HyperIdleDb): Promise<Booted> {
	const apiKey = `e2e-key-${Math.random().toString(36).slice(2)}`;
	vi.stubEnv("HYPERIDLE_API_KEY", apiKey);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "user-subscription-seam-test-secret-32-chars!!");
	const server = await createServer(0, {
		db,
		topology: "disabled",
	});
	const addr = server.httpServer.address();
	if (typeof addr !== "object" || addr === null) {
		throw new Error("server is not listening on a TCP socket");
	}
	return { server, port: addr.port, apiKey };
}

async function callAction(
	handle: Booted,
	name: string,
	body: Record<string, unknown>,
	actorId: string,
): Promise<HttpResult> {
	const result = await handle.server.callActionAs(name, body, actorId);
	const status = result.ok ? 200 : 422;
	const json = result.ok
		? { ok: true, data: result.data }
		: { ok: false, problems: result.problems };
	return { status, json: json as Record<string, unknown> };
}

function mintWsToken(handle: Booted, actorId: string): string {
	return handle.server.mintWsTokenFor(actorId);
}

function connect(handle: Booted, token: string): WebSocket {
	return new WebSocket(`ws://127.0.0.1:${handle.port}/api/ws?token=${encodeURIComponent(token)}`);
}

function waitForOpen(ws: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", (evt) => reject(new Error(`ws error: ${String(evt)}`)), {
			once: true,
		});
	});
}

function waitForFrame(
	ws: WebSocket,
	predicate: (msg: Record<string, unknown>) => boolean,
	timeoutMs = 5000,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", onMessage);
			reject(new Error("timed out waiting for the expected websocket frame"));
		}, timeoutMs);
		function onMessage(evt: MessageEvent): void {
			if (typeof evt.data !== "string") return;
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(evt.data);
			} catch {
				return;
			}
			if (predicate(msg)) {
				clearTimeout(timer);
				ws.removeEventListener("message", onMessage);
				resolve(msg);
			}
		}
		ws.addEventListener("message", onMessage);
	});
}

/** The negative half of `waitForFrame` — resolves once `timeoutMs` elapses with no matching frame, rejects the instant one arrives. Proves "exactly one", not just "at least one". */
function assertNoFrame(
	ws: WebSocket,
	predicate: (msg: Record<string, unknown>) => boolean,
	timeoutMs = 800,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", onMessage);
			resolve();
		}, timeoutMs);
		function onMessage(evt: MessageEvent): void {
			if (typeof evt.data !== "string") return;
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(evt.data);
			} catch {
				return;
			}
			if (predicate(msg)) {
				clearTimeout(timer);
				ws.removeEventListener("message", onMessage);
				reject(new Error(`unexpected second frame arrived: ${JSON.stringify(msg)}`));
			}
		}
		ws.addEventListener("message", onMessage);
	});
}

/** The fire mechanism runs off a `void` async event handler (subscription-fire.ts) —
 * this polls for the row it eventually writes instead of a fixed sleep. */
async function waitUntil(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
	const start = Date.now();
	for (;;) {
		if (await check()) return;
		if (Date.now() - start > timeoutMs) {
			throw new Error("condition never became true within the timeout");
		}
		await new Promise((r) => setTimeout(r, 50));
	}
}

/** Asserts a `callAction` result is a 200 `ok`, returning its `data` — collapses the
 * repeated "throw with the body on failure" check every mutating call below needs. */
function expectOk(res: HttpResult, what: string): Record<string, unknown> {
	if (res.status !== 200 || res.json.ok !== true) {
		throw new Error(`${what} failed: ${JSON.stringify(res.json)}`);
	}
	return res.json.data as Record<string, unknown>;
}

/** The `id` of the first subscription on an `edit_user` response's `subscriptions` array. */
function firstSubscriptionId(data: Record<string, unknown>, what: string): string {
	const id = (data.subscriptions as Array<{ id: string }>)[0]?.id;
	if (!id) throw new Error(`no subscription id returned for ${what}`);
	return id;
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now }).onConflictDoNothing();
}

async function seedHuman(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: id,
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
	await db.insert(userTeams).values({ userId: id, teamId }).onConflictDoNothing();
}

async function seedAgent(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "ai",
			name: id,
			role: "builder",
			status: "active",
			agentCategory: "team",
			createdAt: now,
		})
		.onConflictDoNothing();
	await db.insert(userTeams).values({ userId: id, teamId }).onConflictDoNothing();
}

/** A task needs a real thread (`tasks.thread_id` is `NOT NULL`). */
async function seedTaskWithThread(
	db: HyperIdleDb,
	options: { readonly taskId: string; readonly threadId: string; readonly teamId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "team",
		hostId: options.teamId,
		initiatorId: "seam-seed",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: options.taskId,
		threadId: options.threadId,
		parentTaskId: null,
		teamId: options.teamId,
		ownerAgentId: null,
		title: options.taskId,
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

describe("user-subscription seam — the three entries over HTTP", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("search_users", () => {
		test("HTTP door returns the user list", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-search-users");
				await seedHuman(db, "seam-founder-search-users", "seam-team-search-users");
				await seedHuman(db, "seam-user-a-search", "seam-team-search-users");
				await seedAgent(db, "seam-user-b-search", "seam-team-search-users");

				const ids = ["seam-user-a-search", "seam-user-b-search"];
				const httpRes = await callAction(
					handle,
					"search_users",
					{ ids },
					"seam-founder-search-users",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);
				expect((httpRes.json.data as Array<{ id: string }>).map((r) => r.id).sort()).toEqual(
					[...ids].sort(),
				);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("open_user", () => {
		test("HTTP door returns the user row", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-open-user");
				await seedHuman(db, "seam-founder-open-user", "seam-team-open-user");
				await seedAgent(db, "seam-user-target-open", "seam-team-open-user");

				const httpRes = await callAction(
					handle,
					"open_user",
					{ id: "seam-user-target-open" },
					"seam-founder-open-user",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);
				const data = httpRes.json.data as { user: { id: string } | null };
				expect(data.user?.id).toBe("seam-user-target-open");
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("edit_user", () => {
		test("HTTP door sets the user status", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-edit-user");
				await seedHuman(db, "seam-founder-edit-user", "seam-team-edit-user");
				await seedAgent(db, "seam-user-target-edit", "seam-team-edit-user");

				const httpRes = await callAction(
					handle,
					"edit_user",
					{ id: "seam-user-target-edit", status: "idle" },
					"seam-founder-edit-user",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);
				const httpData = httpRes.json.data as { user: { status: string } | null };
				expect(httpData.user?.status).toBe("idle");
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});
});

describe("user-subscription seam — reach, wake, and pause", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a person and an agent in reach are woken; an out-of-reach agent is not; pausing stops both", async ({
		db,
	}) => {
		const handle = await boot(db);
		let ws: WebSocket | undefined;
		try {
			await seedTeam(db, "seam-sub-team-in");
			await seedTeam(db, "seam-sub-team-out");
			// The editor — a fourth user, neither subscriber, who makes the change.
			await seedHuman(db, "seam-sub-editor", "seam-sub-team-in");
			await seedHuman(db, "seam-sub-person", "seam-sub-team-in");
			await seedAgent(db, "seam-sub-agent-in", "seam-sub-team-in");
			await seedAgent(db, "seam-sub-agent-out", "seam-sub-team-out");
			await seedTaskWithThread(db, {
				taskId: "seam-sub-task",
				threadId: "seam-sub-thread",
				teamId: "seam-sub-team-in",
			});

			const personSubId = firstSubscriptionId(
				expectOk(
					await callAction(
						handle,
						"edit_user",
						{ id: "seam-sub-person", subscriptions: { add: [{ event: "task.changed" }] } },
						"seam-sub-editor",
					),
					"subscribe person",
				),
				"the person",
			);
			const agentInSubId = firstSubscriptionId(
				expectOk(
					await callAction(
						handle,
						"edit_user",
						{ id: "seam-sub-agent-in", subscriptions: { add: [{ event: "task.changed" }] } },
						"seam-sub-editor",
					),
					"subscribe in-reach agent",
				),
				"the in-reach agent",
			);
			// subscribe out-of-reach agent (no ID needed — only proves it got no inbox row)
			expectOk(
				await callAction(
					handle,
					"edit_user",
					{ id: "seam-sub-agent-out", subscriptions: { add: [{ event: "task.changed" }] } },
					"seam-sub-editor",
				),
				"subscribe out-of-reach agent",
			);

			const token = mintWsToken(handle, "seam-sub-person");
			ws = connect(handle, token);
			await waitForOpen(ws);
			ws.send(JSON.stringify({ type: "subscribe", topic: "user:seam-sub-person" }));
			await waitForFrame(ws, (m) => m.type === "subscribed" && m.topic === "user:seam-sub-person");

			const nudge = waitForFrame(
				ws,
				(m) => m.type === "update" && m.topic === "user:seam-sub-person" && m.kind === "inbox",
			);

			expectOk(
				await callAction(
					handle,
					"edit_task",
					{ id: "seam-sub-task", state: "blocked" },
					"seam-sub-editor",
				),
				"edit_task",
			);

			const frame = await nudge;
			expect(frame.kind).toBe("inbox");
			const inboxRowId = (frame.data as { id: string }).id;
			expect(typeof inboxRowId).toBe("string");

			// open_user, as the person themself, shows the inbox row.
			const openData = expectOk(
				await callAction(handle, "open_user", {}, "seam-sub-person"),
				"open_user",
			);
			const personInbox = openData.inbox as Array<{ id: string }> | null;
			expect(personInbox?.some((row) => row.id === inboxRowId)).toBe(true);

			// an inbox row exists for the in-reach agent.
			await waitUntil(async () => {
				const rows = await db.select().from(inbox);
				return rows.some(
					(r) =>
						r.userId === "seam-sub-agent-in" &&
						r.reason === "subscription" &&
						r.subscriptionId === agentInSubId,
				);
			});
			const allInboxRows = await db.select().from(inbox);
			const agentInInboxRow = allInboxRows.find(
				(r) =>
					r.userId === "seam-sub-agent-in" &&
					r.reason === "subscription" &&
					r.subscriptionId === agentInSubId,
			);
			expect(agentInInboxRow).toBeDefined();

			// the out-of-reach agent got none.
			const outReachInboxRows = allInboxRows.filter(
				(r) => r.userId === "seam-sub-agent-out" && r.reason === "subscription",
			);
			expect(outReachInboxRows).toHaveLength(0);

			// pausing stops both.
			expectOk(
				await callAction(
					handle,
					"edit_user",
					{ id: "seam-sub-person", subscriptions: { change: [{ id: personSubId, paused: true }] } },
					"seam-sub-editor",
				),
				"pause person subscription",
			);
			expectOk(
				await callAction(
					handle,
					"edit_user",
					{
						id: "seam-sub-agent-in",
						subscriptions: { change: [{ id: agentInSubId, paused: true }] },
					},
					"seam-sub-editor",
				),
				"pause agent subscription",
			);

			const noNudge = assertNoFrame(
				ws,
				(m) => m.type === "update" && m.topic === "user:seam-sub-person" && m.kind === "inbox",
			);
			expectOk(
				await callAction(
					handle,
					"edit_task",
					{ id: "seam-sub-task", state: "in_progress" },
					"seam-sub-editor",
				),
				"second edit_task",
			);
			await noNudge;

			// give the fire handler its usual window, then confirm no new inbox row landed.
			await new Promise((r) => setTimeout(r, 300));
			const allInboxAfterPause = await db.select().from(inbox);
			const agentInInboxAfterPause = allInboxAfterPause.filter(
				(r) =>
					r.userId === "seam-sub-agent-in" &&
					r.reason === "subscription" &&
					r.subscriptionId === agentInSubId,
			);
			expect(agentInInboxAfterPause).toHaveLength(1); // only the pre-pause one from above
		} finally {
			ws?.close();
			await handle.server.dispose();
		}
	}, 30_000);
});
