/**
 * Real end-to-end proof that the three user entries — `search_users`,
 * `open_user`, `edit_user` — answer the same whether a person calls them
 * over HTTP or an agent calls them through the MCP tool seam, and that a
 * subscription actually wakes the right subscribers on a real change. Boots
 * the REAL server (`createServer`), drives every action through BOTH real
 * doors — `POST /api/actions/<name>` with `X-API-Key`, and the registered
 * handler on the joined `ServerHandle.actionTools` — against the same
 * seeded state. Modelled line for line on
 * `session-platform-seam.integration.test.ts` in this folder: real
 * `createServer`, a real TCP socket, a real `ws` client.
 *
 * `edit_user` cannot be driven twice against the literal SAME row and prove
 * anything — the second call would see the first call's write. It is driven
 * the same way `edit_plugin`'s `state` branch is in the model file: ONE
 * user's `status` is set to `"idle"` first through one door, then
 * (already idle — idempotent) again through the other, so the compared
 * views are literally the same entity and the doors are proven interchangeable.
 *
 * The subscription half proves architecture.md §4's fire mechanism end to
 * end: a person and an agent both subscribe to `task.changed`; a third,
 * out-of-reach agent subscribes too; a fourth user (neither subscriber) edits
 * a task the subscribed team can see — the person's `user:<id>` frame
 * arrives over the one websocket and `open_user` shows the inbox row, a
 * `subscription_run` row lands in `agent_work_intents` for the in-reach
 * agent, the out-of-reach agent gets none, and pausing both subscriptions
 * silences a second edit for both.
 */

import * as os from "node:os";
import * as path from "node:path";
import { agentWorkIntents, type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

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
		sandboxBasePath: path.join(
			os.tmpdir(),
			`user-subscription-seam-${Date.now()}-${Math.random()}`,
		),
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
	actorOverride: string,
): Promise<HttpResult> {
	const res = await fetch(`http://127.0.0.1:${handle.port}/api/actions/${name}`, {
		method: "POST",
		headers: {
			"X-API-Key": handle.apiKey,
			"Content-Type": "application/json",
			[ACTOR_OVERRIDE_HEADER]: actorOverride,
		},
		body: JSON.stringify(body),
	});
	const json = (await res.json()) as Record<string, unknown>;
	return { status: res.status, json };
}

/** The registered MCP tool for `name` on the joined list — throws with a clear message if the join dropped it. */
function toolFor(handle: Booted, name: string): ServerHandle["actionTools"][number] {
	const tool = handle.server.actionTools.find((t) => t.name === name);
	if (!tool) throw new Error(`"${name}" is not on the joined ServerHandle.actionTools`);
	return tool;
}

/** The tool door's own `ToolContext` — same shape `session-platform-seam` builds by hand, never a `@hyperidle/harness-protocol` import (an `applications/*` file has no reach there). */
function agentToolCtx(db: HyperIdleDb, agentId: string, sessionId: string) {
	return {
		db,
		eventBus: new EventBus(),
		agentId,
		sessionId,
		taskId: "",
		sandboxPath: os.tmpdir(),
		ingestion: { dispose: () => {} },
	};
}

async function mintWsToken(handle: Booted, actorOverride: string): Promise<string> {
	const res = await fetch(`http://127.0.0.1:${handle.port}/api/auth/ws-token`, {
		method: "POST",
		headers: {
			"X-API-Key": handle.apiKey,
			"Content-Type": "application/json",
			[ACTOR_OVERRIDE_HEADER]: actorOverride,
		},
		body: JSON.stringify({}),
	});
	const json = (await res.json()) as Record<string, unknown>;
	const token = json.token;
	if (typeof token !== "string") {
		throw new Error(`ws-token mint failed: ${JSON.stringify(json)}`);
	}
	return token;
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
			teamId,
			createdAt: now,
		})
		.onConflictDoNothing();
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
			teamId,
			createdAt: now,
		})
		.onConflictDoNothing();
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

describe("user-subscription seam — the three entries answer the same to a person and an agent", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("search_users", () => {
		test("HTTP door and TOOL door see the identical list", async ({ db }) => {
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

				const tool = toolFor(handle, "search_users");
				const toolResult = await tool.handler(
					{ ids },
					agentToolCtx(db, "seam-user-b-search", "seam-tool-search-users"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				expect(toolResult.data).toEqual(httpRes.json.data);
				expect((httpRes.json.data as Array<{ id: string }>).map((r) => r.id).sort()).toEqual(
					[...ids].sort(),
				);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("open_user", () => {
		test("HTTP door and TOOL door see the identical row for a third user", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-open-user");
				await seedHuman(db, "seam-founder-open-user", "seam-team-open-user");
				await seedAgent(db, "seam-user-viewer-agent", "seam-team-open-user");
				await seedAgent(db, "seam-user-target-open", "seam-team-open-user");

				const httpRes = await callAction(
					handle,
					"open_user",
					{ id: "seam-user-target-open" },
					"seam-founder-open-user",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "open_user");
				const toolResult = await tool.handler(
					{ id: "seam-user-target-open" },
					agentToolCtx(db, "seam-user-viewer-agent", "seam-tool-open-user"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				expect(toolResult.data).toEqual(httpRes.json.data);
				const data = httpRes.json.data as { user: { id: string } | null };
				expect(data.user?.id).toBe("seam-user-target-open");
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("edit_user", () => {
		test("status set idempotently — both doors agree", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-edit-user");
				await seedHuman(db, "seam-founder-edit-user", "seam-team-edit-user");
				await seedAgent(db, "seam-user-editor-agent", "seam-team-edit-user");
				await seedAgent(db, "seam-user-target-edit", "seam-team-edit-user");

				// First through HTTP — the write.
				const httpRes = await callAction(
					handle,
					"edit_user",
					{ id: "seam-user-target-edit", status: "idle" },
					"seam-founder-edit-user",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				// Same input, again — through the TOOL door. Already idle, so this
				// is a no-op write and the returned view must be byte-identical.
				const tool = toolFor(handle, "edit_user");
				const toolResult = await tool.handler(
					{ id: "seam-user-target-edit", status: "idle" },
					agentToolCtx(db, "seam-user-editor-agent", "seam-tool-edit-user"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				const httpData = httpRes.json.data as { user: { status: string } | null };
				const toolData = toolResult.data as { user: { status: string } | null };
				expect(httpData.user?.status).toBe("idle");
				expect(toolData.user?.status).toBe("idle");
				expect(toolResult.data).toEqual(httpRes.json.data);
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
			const agentOutSubId = firstSubscriptionId(
				expectOk(
					await callAction(
						handle,
						"edit_user",
						{ id: "seam-sub-agent-out", subscriptions: { add: [{ event: "task.changed" }] } },
						"seam-sub-editor",
					),
					"subscribe out-of-reach agent",
				),
				"the out-of-reach agent",
			);

			const token = await mintWsToken(handle, "seam-sub-person");
			ws = connect(handle, token);
			await waitForOpen(ws);
			ws.send(JSON.stringify({ type: "subscribe", topic: "user:seam-sub-person" }));
			await waitForFrame(ws, (m) => m.type === "subscribed" && m.topic === "user:seam-sub-person");

			const nudge = waitForFrame(
				ws,
				(m) => m.type === "update" && m.topic === "user:seam-sub-person",
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
			const changeId = (frame.data as { changeId: string }).changeId;
			expect(typeof changeId).toBe("string");

			// open_user, as the person themself, shows the inbox row.
			const openData = expectOk(
				await callAction(handle, "open_user", {}, "seam-sub-person"),
				"open_user",
			);
			const inbox = openData.inbox as Array<{ change: { id: string } }> | null;
			expect(inbox?.some((row) => row.change.id === changeId)).toBe(true);

			// a subscription_run intent exists for the in-reach agent. Plain JS
			// filtering, not drizzle-orm's eq/like — an `applications/*` package
			// declares no direct dependency on it (it only ever reaches the ORM
			// through `@hyperidle/db`), the same idiom `stop_session`'s own
			// comparison in `session-platform-seam` uses.
			await waitUntil(async () => {
				const rows = await db.select().from(agentWorkIntents);
				return rows.some(
					(r) => r.sourceKind === "subscription" && r.sourceId === `${agentInSubId}:${changeId}`,
				);
			});
			const allIntents = await db.select().from(agentWorkIntents);
			const agentInIntent = allIntents.find(
				(r) => r.sourceKind === "subscription" && r.sourceId === `${agentInSubId}:${changeId}`,
			);
			expect(agentInIntent?.kind).toBe("subscription_run");

			// the out-of-reach agent got none.
			const outReachIntents = allIntents.filter(
				(r) => r.sourceKind === "subscription" && r.sourceId.startsWith(`${agentOutSubId}:`),
			);
			expect(outReachIntents).toHaveLength(0);

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
				(m) => m.type === "update" && m.topic === "user:seam-sub-person",
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

			// give the fire handler its usual window, then confirm no new intent landed.
			await new Promise((r) => setTimeout(r, 300));
			const allIntentsAfterPause = await db.select().from(agentWorkIntents);
			const agentInIntentsAfterPause = allIntentsAfterPause.filter(
				(r) => r.sourceKind === "subscription" && r.sourceId.startsWith(`${agentInSubId}:`),
			);
			expect(agentInIntentsAfterPause).toHaveLength(1); // only the pre-pause one from above
		} finally {
			ws?.close();
			await handle.server.dispose();
		}
	}, 30_000);
});
