/**
 * Real end-to-end proof that the websocket nudge reaches a connected client.
 * Boots the REAL server (`createServer` — the exact composition
 * `desktop`/`remote-server` run in production: real `bootCoreApi`, real
 * `WsConnectionHub`, real `@hono/node-server` + `ws` upgrade wiring), connects
 * a REAL `ws`-protocol client authenticated as a human over a REAL TCP
 * socket, subscribes over that socket, then writes through BOTH real doors —
 * the HTTP action route (`POST /api/actions/send_message`) and the MCP tool
 * door (`actionTools`'s registered `send_message` handler: the exact
 * registry `bootAgentOrchestration`'s runtime threads a live agent session's
 * tool calls through, `actionsAsTools` in `actions/actions-as-tools.ts`) —
 * and asserts the nudge actually reaches the client.
 *
 * No fakes on the path under test: this is the seam
 * `layers/core-api/src/__tests__/thread-ws-nudge.integration.test.ts` (fake
 * `wsPush` sink) and `layers/core-ui/src/hooks/__tests__/useThread.test.tsx`
 * (fake ws client) each stop short of — neither proves the two ends meet.
 *
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";
const FOUNDER_ID = "e2e-founder";

interface Booted {
	readonly server: ServerHandle;
	readonly port: number;
	readonly apiKey: string;
}

async function boot(db: HyperIdleDb): Promise<Booted> {
	const apiKey = `e2e-key-${Math.random().toString(36).slice(2)}`;
	vi.stubEnv("HYPERIDLE_API_KEY", apiKey);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "thread-ws-e2e-test-secret-32-chars!!");
	const server = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: path.join(os.tmpdir(), `thread-ws-e2e-${Date.now()}-${Math.random()}`),
	});
	const addr = server.httpServer.address();
	if (typeof addr !== "object" || addr === null) {
		throw new Error("server is not listening on a TCP socket");
	}
	return { server, port: addr.port, apiKey };
}

async function callAction(
	handle: Booted,
	actionPath: string,
	body: Record<string, unknown>,
	actorOverride?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
	const res = await fetch(`http://127.0.0.1:${handle.port}${actionPath}`, {
		method: "POST",
		headers: {
			"X-API-Key": handle.apiKey,
			"Content-Type": "application/json",
			...(actorOverride ? { [ACTOR_OVERRIDE_HEADER]: actorOverride } : {}),
		},
		body: JSON.stringify(body),
	});
	const json = (await res.json()) as Record<string, unknown>;
	return { status: res.status, json };
}

async function wsTokenFor(handle: Booted, actorOverride?: string): Promise<string> {
	const res = await callAction(handle, "/api/auth/ws-token", {}, actorOverride);
	const token = res.json.token;
	if (typeof token !== "string") {
		throw new Error(`ws-token mint failed: ${JSON.stringify(res.json)}`);
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
			role: "member",
			status: "active",
			teamId,
			createdAt: now,
		})
		.onConflictDoNothing();
}

/** `messages.sender_id` FKs into `users` — an agent's own row, `kind:"ai"`. */
async function seedAgent(db: HyperIdleDb, id: string, ownerUserId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "ai",
			name: id,
			role: "assistant",
			status: "active",
			agentCategory: "individual",
			ownerUserId,
			createdAt: now,
		})
		.onConflictDoNothing();
}

async function seedThread(
	db: HyperIdleDb,
	id: string,
	opts: { hostKind: string; hostId: string; initiatorId: string; members: readonly string[] },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: opts.hostKind,
		hostId: opts.hostId,
		initiatorId: opts.initiatorId,
		participants: JSON.stringify(opts.members),
		pinned: false,
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("thread websocket nudge — real server, real socket, both doors", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("HTTP door: a send from a different identity reaches an already-subscribed thread:<id> and conversations, redacted on conversations", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "e2e-team-1");
			await seedHuman(db, FOUNDER_ID, "e2e-team-1");
			await seedHuman(db, "e2e-other-1", "e2e-team-1");
			await seedThread(db, "e2e-thr-1", {
				hostKind: "user",
				hostId: FOUNDER_ID,
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID, "e2e-other-1"],
			});

			const token = await wsTokenFor(handle, FOUNDER_ID);
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				// Both ack listeners are registered (synchronously, inside
				// `waitForFrame`'s promise executor) BEFORE either `send` — the two
				// acks can arrive back-to-back, and a listener attached only after
				// `await`-ing the first would miss the second.
				const conversationsAck = waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === "conversations",
				);
				const threadAck = waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === "thread:e2e-thr-1",
				);
				ws.send(JSON.stringify({ type: "subscribe", topic: "conversations" }));
				ws.send(JSON.stringify({ type: "subscribe", topic: "thread:e2e-thr-1" }));
				await conversationsAck;
				await threadAck;

				const threadFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === "thread:e2e-thr-1",
				);
				const conversationsFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === "conversations",
				);

				// The window's OWN identity never sends this — a DIFFERENT member does.
				const sendRes = await callAction(
					handle,
					"/api/actions/send_message",
					{ threadId: "e2e-thr-1", text: "secret e2e http-door text" },
					"e2e-other-1",
				);
				expect(sendRes.status).toBe(200);

				const threadMsg = await threadFrame;
				expect(threadMsg.kind).toBe("thread.message");
				const threadData = threadMsg.data as { after: Record<string, unknown> };
				expect(JSON.stringify(threadData.after)).toContain("secret e2e http-door text");

				const conversationsMsg = await conversationsFrame;
				expect(conversationsMsg.kind).toBe("thread.message");
				const conversationsData = conversationsMsg.data as { after: Record<string, unknown> };
				expect(conversationsData.after.payload).toBeUndefined();
				expect(JSON.stringify(conversationsData.after)).not.toContain("secret e2e http-door text");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("TOOL door: the registered send_message MCP tool handler nudges the same subscriber", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "e2e-team-2");
			await seedHuman(db, FOUNDER_ID, "e2e-team-2");
			await seedAgent(db, "e2e-agent-1", FOUNDER_ID);
			await seedThread(db, "e2e-thr-2", {
				hostKind: "agent",
				hostId: "e2e-agent-1",
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID, "e2e-agent-1"],
			});

			const token = await wsTokenFor(handle, FOUNDER_ID);
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: "thread:e2e-thr-2" }));
				await waitForFrame(ws, (m) => m.type === "subscribed" && m.topic === "thread:e2e-thr-2");

				const threadFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === "thread:e2e-thr-2",
				);

				const sendMessageTool = handle.server.actionTools.find((t) => t.name === "send_message");
				if (!sendMessageTool) throw new Error("send_message tool is not registered");
				// Same shape `actions-as-tools.ts` builds from a real session's
				// `ToolContext` — `eventBus` here is a throwaway instance (this
				// package has no shared eventBus fixture); the nudge under test is
				// `deps.wsPush`, bound to THIS server's own hub, not to `eventBus`.
				const toolResult = await sendMessageTool.handler(
					{ threadId: "e2e-thr-2", text: "secret e2e tool-door text" },
					{
						db,
						eventBus: new EventBus(),
						agentId: "e2e-agent-1",
						sessionId: "e2e-session-1",
						taskId: "",
						sandboxPath: os.tmpdir(),
						ingestion: { dispose: () => {} },
					},
				);
				expect(toolResult.success).toBe(true);

				const threadMsg = await threadFrame;
				expect(threadMsg.kind).toBe("thread.message");
				const threadData = threadMsg.data as { after: Record<string, unknown>; actor: string };
				expect(threadData.actor).toBe("e2e-agent-1");
				expect(JSON.stringify(threadData.after)).toContain("secret e2e tool-door text");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("a signed-in non-member CAN subscribe to a team-hosted thread (host-scoped bypass)", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "e2e-team-3");
			await seedHuman(db, FOUNDER_ID, "e2e-team-3");
			await seedHuman(db, "e2e-stranger-1", "e2e-team-3");
			await seedThread(db, "e2e-thr-3", {
				hostKind: "team",
				hostId: "e2e-team-3",
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID],
			});

			const token = await wsTokenFor(handle, "e2e-stranger-1");
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: "thread:e2e-thr-3" }));
				const ack = await waitForFrame(ws, (m) => m.topic === "thread:e2e-thr-3");
				expect(ack.type).toBe("subscribed");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("a signed-in non-member CANNOT subscribe to a direct thread they are not in", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "e2e-team-4");
			await seedHuman(db, FOUNDER_ID, "e2e-team-4");
			await seedHuman(db, "e2e-other-2", "e2e-team-4");
			await seedHuman(db, "e2e-stranger-2", "e2e-team-4");
			await seedThread(db, "e2e-thr-4", {
				hostKind: "user",
				hostId: FOUNDER_ID,
				initiatorId: FOUNDER_ID,
				members: [FOUNDER_ID, "e2e-other-2"],
			});

			const token = await wsTokenFor(handle, "e2e-stranger-2");
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: "thread:e2e-thr-4" }));
				const ack = await waitForFrame(ws, (m) => m.topic === "thread:e2e-thr-4");
				expect(ack.type).toBe("forbidden");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);
});
