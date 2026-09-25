/**
 * Real end-to-end proof that the five session/platform entries — `search_sessions`,
 * `watch_session`, `stop_session`, `search_plugins`, `edit_plugin` — answer the
 * same whether a person calls them over HTTP or an agent calls them through
 * the MCP tool seam. Boots the REAL server
 * (`createServer`), drives `search_sessions`/`watch_session`/`stop_session`/
 * `search_plugins`/`edit_plugin` through BOTH real doors — `POST
 * /api/actions/<name>` with `X-API-Key`, and the registered handler on the
 * joined `ServerHandle.actionTools` — against the same seeded state, and
 * asserts the two answers agree. Modelled line for line on
 * `document-ws-e2e.integration.test.ts` and `thread-ws-e2e.integration.test.ts`
 * in this folder: real `createServer`, a real TCP socket, a real `ws` client.
 *
 * A mutating action (`stop_session`, `edit_plugin`'s `state` branch) cannot
 * be driven twice against the literal SAME row and answer the same thing —
 * the second call would see the first call's write. Where the action reads
 * only (`search_sessions`, `watch_session`, `search_plugins`), one seeded row
 * is queried through both doors and the two payloads are compared whole. For
 * `stop_session`, two rows are seeded with identical fields but a different
 * id (the id is the one axis two rows can never share) and the two answers
 * are compared with `id` stripped. For `edit_plugin`'s `state` branch, ONE
 * plugin is disabled twice — first through one door, then (already disabled)
 * again through the other — so the compared rows are literally the same
 * entity and only the write-time timestamps (`updatedAt`/`disabledAt`) are
 * stripped before comparing. `edit_plugin`'s refused builtin-remove case
 * needs no seed at all: `editPluginInvariants` answers `builtin_locked`
 * before either door touches the database.
 *
 * @lore governance: `CORE_API_ACTOR_OVERRIDE_HEADER` lives in
 * `@hyperidle/api-contract`, whose reach is `["layer"]` — an
 * `applications/*` file (this test included) may not import it directly.
 * Its value is a wire constant, not a logical dependency on the package;
 * inlined below with this citation
 * (`framework/api-contract/src/core-api-port.ts`).
 *
 * @lore the `tool_call_recorded` nudge is emitted by `provisioner.ts`'s live event-stream drain — reachable only
 * from inside a real harness run, which `ServerHandle` exposes no seam for
 * (no `eventBus`, only `actionTools`/`dispose`/`httpServer`). `stop_session`'s
 * CAS path (no live registry entry) emits `session_ended` on the SAME real
 * `eventBus` `registerSessionActivityGateway` subscribes, through the exact
 * same `wsPush` → `wsHub.broadcast` pipeline, producing the byte-identical
 * `{type:"update", topic:"session:<id>", kind:"session.activity",
 * data:{sessionId}}` envelope (`session-activity-gateway.ts`'s `activityNudge`
 * builds one envelope shape for all three subscribed event types — a
 * websocket client cannot tell them apart). This test proves the nudge
 * seam through that emission instead.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
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
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "session-platform-seam-test-secret-32-chars!!");
	const server = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: path.join(os.tmpdir(), `session-platform-seam-${Date.now()}-${Math.random()}`),
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

/** The tool door's own `ToolContext` — same shape `document-ws-e2e`/`thread-ws-e2e` build by hand, never a `@hyperidle/harness-protocol` import (an `applications/*` file has no reach there). */
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

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now }).onConflictDoNothing();
}

async function seedHuman(db: HyperIdleDb, id: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: id,
			role: "founder",
			status: "active",
			...(teamId ? { teamId } : {}),
			createdAt: now,
		})
		.onConflictDoNothing();
}

async function seedAgent(db: HyperIdleDb, id: string, ownerUserId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "ai",
			name: id,
			role: "builder",
			status: "active",
			agentCategory: "individual",
			ownerUserId,
			createdAt: now,
		})
		.onConflictDoNothing();
}

async function seedTaskWithThread(
	db: HyperIdleDb,
	options: {
		readonly taskId: string;
		readonly threadId: string;
		readonly teamId: string;
		readonly agentId: string;
		readonly state: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "team",
		hostId: options.teamId,
		initiatorId: options.agentId,
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: options.taskId,
		threadId: options.threadId,
		parentTaskId: null,
		teamId: options.teamId,
		ownerAgentId: options.agentId,
		title: options.taskId,
		state: options.state,
		createdAt: now,
		updatedAt: now,
	});
}

async function seedSession(
	db: HyperIdleDb,
	options: {
		readonly id: string;
		readonly agentId: string;
		readonly taskId?: string;
		readonly state: string;
		readonly startedAt: string;
	},
): Promise<void> {
	await db.insert(sessions).values({
		id: options.id,
		agentId: options.agentId,
		taskId: options.taskId ?? null,
		modelTier: "workhorse",
		startedAt: options.startedAt,
		state: options.state,
	});
}

/** A minimal plugin: one agent, one subscription, one skill document, one `tool`-kind
 * configuration contribution — the same shape `platform-actions.integration.test.ts`'s
 * own `makePlugin` uses, so `search_plugins`/`edit_plugin` exercise every
 * contribution kind. */
function makePlugin(pluginId: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-platform-seam-plugin-"));
	fs.mkdirSync(path.join(dir, "skills", "sweep"), { recursive: true });
	fs.writeFileSync(path.join(dir, "skills", "sweep", "SKILL.md"), "# Sweep\n\nDo the sweep.");
	fs.writeFileSync(path.join(dir, "identity.md"), "# You are Builder\n\nYou build things.");
	fs.writeFileSync(
		path.join(dir, "plugin.json"),
		JSON.stringify({
			$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
			name: pluginId,
			version: "1.0.0",
			extensions: {
				"io.hyperidle": {
					agents: [
						{
							id: "builder",
							name: "Builder",
							role: "builder",
							agentCategory: "team",
							identity: "identity.md",
						},
					],
					subscriptions: [
						{
							id: "sweep-subscription",
							name: "Sweep Subscription",
							agentId: "builder",
							event: "task.changed",
							prompt: "Sweep the stale items.",
						},
					],
					contributions: [{ kind: "tool", key: "max-items", value: { limit: 10 } }],
				},
			},
		}),
	);
	return dir;
}

describe("session-platform seam — the five entries answer the same to a person and an agent", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("search_sessions", () => {
		test("HTTP door and TOOL door see the identical list", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-search");
				await seedHuman(db, "seam-founder-search", "seam-team-search");
				await seedAgent(db, "seam-agent-search", "seam-founder-search");
				await seedSession(db, {
					id: "seam-sess-search-a",
					agentId: "seam-agent-search",
					state: "active",
					startedAt: "2026-01-01T00:00:00.000Z",
				});
				await seedSession(db, {
					id: "seam-sess-search-b",
					agentId: "seam-agent-search",
					state: "done",
					startedAt: "2026-01-02T00:00:00.000Z",
				});

				const httpRes = await callAction(handle, "search_sessions", {}, "seam-founder-search");
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "search_sessions");
				const toolResult = await tool.handler(
					{},
					agentToolCtx(db, "seam-agent-search", "seam-tool-session-search"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				expect(toolResult.data).toEqual(httpRes.json.data);
				const ids = (httpRes.json.data as Array<{ id: string }>).map((r) => r.id);
				expect(ids).toEqual(["seam-sess-search-b", "seam-sess-search-a"]);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("watch_session", () => {
		test("HTTP door and TOOL door see the identical row and activity buffer", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-watch");
				await seedHuman(db, "seam-founder-watch", "seam-team-watch");
				await seedAgent(db, "seam-agent-watch", "seam-founder-watch");
				await seedSession(db, {
					id: "seam-sess-watch",
					agentId: "seam-agent-watch",
					state: "active",
					startedAt: "2026-01-01T00:00:00.000Z",
				});

				const httpRes = await callAction(
					handle,
					"watch_session",
					{ id: "seam-sess-watch" },
					"seam-founder-watch",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "watch_session");
				const toolResult = await tool.handler(
					{ id: "seam-sess-watch" },
					agentToolCtx(db, "seam-agent-watch", "seam-tool-session-watch"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				expect(toolResult.data).toEqual(httpRes.json.data);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("stop_session — the CAS path (no live registry entry)", () => {
		test("both doors answer the same shape; both rows read stopped/stopped; the task is untouched", async ({
			db,
		}) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-stop");
				await seedHuman(db, "seam-founder-stop", "seam-team-stop");
				await seedAgent(db, "seam-agent-stop", "seam-founder-stop");
				await seedTaskWithThread(db, {
					taskId: "seam-task-stop",
					threadId: "seam-thread-stop",
					teamId: "seam-team-stop",
					agentId: "seam-agent-stop",
					state: "in_progress",
				});
				const STARTED_AT = "2026-01-01T00:00:00.000Z";
				await seedSession(db, {
					id: "seam-sess-stop-http",
					agentId: "seam-agent-stop",
					taskId: "seam-task-stop",
					state: "active",
					startedAt: STARTED_AT,
				});
				await seedSession(db, {
					id: "seam-sess-stop-tool",
					agentId: "seam-agent-stop",
					taskId: "seam-task-stop",
					state: "active",
					startedAt: STARTED_AT,
				});

				const httpRes = await callAction(
					handle,
					"stop_session",
					{ id: "seam-sess-stop-http" },
					"seam-founder-stop",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "stop_session");
				const toolResult = await tool.handler(
					{ id: "seam-sess-stop-tool" },
					agentToolCtx(db, "seam-agent-stop", "seam-tool-session-stop"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				// Two seeded rows, identical but for `id` — the one field a
				// mutating action's twin seeds can never share. Strip it before
				// comparing everything else, "modulo nothing" else.
				const httpData = httpRes.json.data as {
					stopped: boolean;
					session: Record<string, unknown>;
				};
				const toolData = toolResult.data as { stopped: boolean; session: Record<string, unknown> };
				expect(httpData.stopped).toBe(true);
				expect(toolData.stopped).toBe(true);
				const { id: _httpId, ...httpSessionRest } = httpData.session;
				const { id: _toolId, ...toolSessionRest } = toolData.session;
				expect(httpSessionRest).toEqual(toolSessionRest);
				// stop_session answers with the row as it stood the moment it was
				// asked — the PRE-stop row, not the terminal state teardown writes after.
				expect(httpSessionRest.state).toBe("active");

				// Plain JS filtering, not `drizzle-orm`'s `eq` — an `applications/*`
				// package declares no direct dependency on it (it only ever reaches
				// the ORM through `@hyperidle/db`).
				const allSessions = await db.select().from(sessions);
				const httpRow = allSessions.find((r) => r.id === "seam-sess-stop-http");
				const toolRow = allSessions.find((r) => r.id === "seam-sess-stop-tool");
				expect(httpRow?.state).toBe("stopped");
				expect(httpRow?.outcome).toBe("stopped");
				expect(toolRow?.state).toBe("stopped");
				expect(toolRow?.outcome).toBe("stopped");

				const allTasks = await db.select().from(tasks);
				const taskRow = allTasks.find((r) => r.id === "seam-task-stop");
				expect(taskRow?.state).toBe("in_progress");
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("search_plugins", () => {
		test("HTTP door and TOOL door see the identical installed plugin", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedHuman(db, "seam-founder-search-plugins");
				await seedAgent(db, "seam-agent-search-plugins", "seam-founder-search-plugins");
				const dir = makePlugin("seam-search-plugin");
				const install = await callAction(
					handle,
					"edit_plugin",
					{ source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } } },
					"seam-founder-search-plugins",
				);
				if (install.status !== 200 || install.json.ok !== true) {
					throw new Error(`install failed: ${JSON.stringify(install.json)}`);
				}

				const httpRes = await callAction(
					handle,
					"search_plugins",
					{},
					"seam-founder-search-plugins",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "search_plugins");
				const toolResult = await tool.handler(
					{},
					agentToolCtx(db, "seam-agent-search-plugins", "seam-tool-session-search-plugins"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				expect(toolResult.data).toEqual(httpRes.json.data);
				// The plugins that ship with the server list beside it as available.
				const installed = (httpRes.json.data as Array<{ id: string; state: string }>).filter(
					(p) => p.state !== "available",
				);
				expect(installed.map((p) => p.id)).toEqual(["seam-search-plugin"]);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("edit_plugin", () => {
		test("state disabled — both doors agree", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedHuman(db, "seam-founder-disable");
				await seedAgent(db, "seam-agent-disable", "seam-founder-disable");
				const dir = makePlugin("seam-disable-plugin");
				const install = await callAction(
					handle,
					"edit_plugin",
					{ source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } } },
					"seam-founder-disable",
				);
				if (install.status !== 200 || install.json.ok !== true) {
					throw new Error(`install failed: ${JSON.stringify(install.json)}`);
				}

				// The SAME plugin, disabled first through the HTTP door, then again
				// (already disabled — idempotent) through the TOOL door. The only
				// fields that can legitimately differ are the write-time timestamps.
				const httpRes = await callAction(
					handle,
					"edit_plugin",
					{ id: "seam-disable-plugin", state: "disabled" },
					"seam-founder-disable",
				);
				expect(httpRes.status).toBe(200);
				expect(httpRes.json.ok).toBe(true);

				const tool = toolFor(handle, "edit_plugin");
				const toolResult = await tool.handler(
					{ id: "seam-disable-plugin", state: "disabled" },
					agentToolCtx(db, "seam-agent-disable", "seam-tool-session-disable"),
				);
				if (!toolResult.success)
					throw new Error(`tool door refused: ${JSON.stringify(toolResult)}`);

				const httpData = httpRes.json.data as Record<string, unknown>;
				const toolData = toolResult.data as Record<string, unknown>;
				expect(httpData.state).toBe("disabled");
				expect(toolData.state).toBe("disabled");
				const { updatedAt: _u1, disabledAt: _d1, ...httpRest } = httpData;
				const { updatedAt: _u2, disabledAt: _d2, ...toolRest } = toolData;
				expect(httpRest).toEqual(toolRest);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);

		test("a refused edit (builtin remove) — both doors return the same problem", async ({ db }) => {
			const handle = await boot(db);
			try {
				await seedHuman(db, "seam-founder-builtin");
				await seedAgent(db, "seam-agent-builtin", "seam-founder-builtin");

				const httpRes = await callAction(
					handle,
					"edit_plugin",
					{ id: "builtin", remove: true },
					"seam-founder-builtin",
				);
				expect(httpRes.status).toBe(422);
				const problems = httpRes.json.problems as Array<{ code: string; message: string }>;
				expect(problems).toHaveLength(1);
				expect(problems[0]?.code).toBe("builtin_locked");

				const tool = toolFor(handle, "edit_plugin");
				const toolResult = await tool.handler(
					{ id: "builtin", remove: true },
					agentToolCtx(db, "seam-agent-builtin", "seam-tool-session-builtin"),
				);
				if (toolResult.success) throw new Error("expected the tool door to refuse too");
				expect(toolResult.code).toBe("builtin_locked");
				expect(toolResult.error).toBe(problems[0]?.message);
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("one websocket — the session activity nudge", () => {
		test("a stop_session session_ended event produces exactly one session:<id> frame on the subscribed socket", async ({
			db,
		}) => {
			const handle = await boot(db);
			try {
				await seedTeam(db, "seam-team-nudge");
				await seedHuman(db, "seam-founder-nudge", "seam-team-nudge");
				await seedAgent(db, "seam-agent-nudge", "seam-founder-nudge");
				await seedSession(db, {
					id: "seam-sess-nudge",
					agentId: "seam-agent-nudge",
					state: "active",
					startedAt: "2026-01-01T00:00:00.000Z",
				});

				const token = await mintWsToken(handle, "seam-founder-nudge");
				const ws = connect(handle, token);
				try {
					await waitForOpen(ws);
					ws.send(JSON.stringify({ type: "subscribe", topic: "session:seam-sess-nudge" }));
					await waitForFrame(
						ws,
						(m) => m.type === "subscribed" && m.topic === "session:seam-sess-nudge",
					);

					const nudge = waitForFrame(
						ws,
						(m) => m.type === "update" && m.topic === "session:seam-sess-nudge",
					);

					const stopRes = await callAction(
						handle,
						"stop_session",
						{ id: "seam-sess-nudge" },
						"seam-founder-nudge",
					);
					expect(stopRes.status).toBe(200);

					const frame = await nudge;
					expect(frame.kind).toBe("session.activity");
					expect(frame.data).toEqual({ sessionId: "seam-sess-nudge" });

					await assertNoFrame(
						ws,
						(m) => m.type === "update" && m.topic === "session:seam-sess-nudge",
					);
				} finally {
					ws.close();
				}
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});

	describe("the second websocket is gone", () => {
		test("GET /api/agent-orchestration/ws is refused with the canonical 404", async ({ db }) => {
			const handle = await boot(db);
			try {
				const res = await fetch(`http://127.0.0.1:${handle.port}/api/agent-orchestration/ws`, {
					headers: { "X-API-Key": handle.apiKey },
				});
				expect(res.status).toBe(404);
				const json = (await res.json()) as { code: string };
				expect(json.code).toBe("NOT_FOUND");
			} finally {
				await handle.server.dispose();
			}
		}, 30_000);
	});
});
