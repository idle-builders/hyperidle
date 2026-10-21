/**
 * Real end-to-end proof that editing a task nudges task:<id> and tasks
 * WebSocket subscribers. Boots the full server (same as thread-ws-e2e),
 * connects a real WS client, subscribes to both topics, then calls
 * edit_task via callActionAs and asserts both nudges arrive.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { afterEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

const FOUNDER_ID = "task-ws-founder";
const TEAM_ID = "task-ws-team";

interface Booted {
	readonly server: ServerHandle;
	readonly port: number;
}

async function boot(db: HyperIdleDb): Promise<Booted> {
	const apiKey = `task-ws-key-${Math.random().toString(36).slice(2)}`;
	vi.stubEnv("HYPERIDLE_API_KEY", apiKey);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "task-ws-e2e-test-secret-32-chars!!!");
	const server = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: path.join(os.tmpdir(), `task-ws-e2e-${Date.now()}-${Math.random()}`),
	});
	const addr = server.httpServer.address();
	if (typeof addr !== "object" || addr === null) {
		throw new Error("server not listening on TCP");
	}
	return { server, port: addr.port };
}

function connect(handle: Booted): WebSocket {
	const token = handle.server.mintWsTokenFor(FOUNDER_ID);
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
			reject(new Error("timed out waiting for expected websocket frame"));
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

async function seedActor(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: TEAM_ID, createdAt: now })
		.onConflictDoNothing();
	await db
		.insert(users)
		.values({
			id: FOUNDER_ID,
			kind: "human",
			name: FOUNDER_ID,
			role: "member",
			status: "active",
			teamId: TEAM_ID,
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("task websocket nudge — real server, both topics", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("editing a task, or writing in its thread, nudges task:<id>; editing also nudges tasks", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedActor(db);

			// First create the task to get its id.
			const created = await handle.server.callActionAs(
				"edit_task",
				{ title: "WS test task", teamId: TEAM_ID },
				FOUNDER_ID,
			);
			expect(created.ok).toBe(true);
			if (!created.ok) return;
			const taskId = (created.data as { task: { id: string } }).task.id;

			const ws = connect(handle);
			try {
				await waitForOpen(ws);

				// Register both ack listeners before sending subscribes (same pattern as thread-ws-e2e).
				const taskAck = waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === `task:${taskId}`,
				);
				const tasksAck = waitForFrame(ws, (m) => m.type === "subscribed" && m.topic === "tasks");
				ws.send(JSON.stringify({ type: "subscribe", topic: `task:${taskId}` }));
				ws.send(JSON.stringify({ type: "subscribe", topic: "tasks" }));
				await taskAck;
				await tasksAck;

				// Register nudge listeners before the write.
				const taskFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === `task:${taskId}`,
				);
				const tasksFrame = waitForFrame(ws, (m) => m.type === "update" && m.topic === "tasks");

				// Edit the task — this is what pushes the nudge.
				const edited = await handle.server.callActionAs(
					"edit_task",
					{ id: taskId, title: "WS test task — updated" },
					FOUNDER_ID,
				);
				expect(edited.ok).toBe(true);

				const taskMsg = await taskFrame;
				expect(taskMsg.kind).toBe("task.changed");

				const tasksMsg = await tasksFrame;
				expect(tasksMsg.kind).toBe("task.changed");
				expect(tasksMsg.topic).toBe("tasks");

				// A message in the task's own thread can change its need, so it nudges the task too.
				const threadId = (created.data as { task: { threadId: string } }).task.threadId;
				const messageFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === `task:${taskId}` && m.kind === "thread.message",
				);
				const sent = await handle.server.callActionAs(
					"send_message",
					{ threadId, text: "Which plan first?" },
					FOUNDER_ID,
				);
				expect(sent.ok).toBe(true);
				expect((await messageFrame).kind).toBe("thread.message");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);
});
