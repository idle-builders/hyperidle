/**
 * Real end-to-end proof that the document websocket nudge reaches a
 * connected client — architecture.md §15.3. Boots the REAL server
 * (`createServer`), connects a REAL `ws`-protocol client authenticated as a
 * human over a REAL TCP socket, subscribes over that socket, then writes
 * through BOTH real doors — the HTTP action route
 * (`POST /api/actions/edit_document`) and the MCP tool door
 * (`actionTools`'s registered `edit_document` handler) — and asserts the
 * nudge actually reaches the client, exactly as
 * `thread-ws-e2e.integration.test.ts` does for `send_message`.
 *
 * No fakes on the path under test: the document module's own
 * `document-actions.integration.test.ts` and `document-cascade.integration.test.ts`
 * prove `pushChanges`'s shape against a fake `wsPush` sink; this is the one
 * place that proves the two ends — the real hub's authorizer and a real
 * socket — actually meet.
 *
 * @lore governance: `CORE_API_ACTOR_OVERRIDE_HEADER` lives in
 * `@hyperidle/api-contract`, whose reach is `["layer"]` — an
 * `applications/*` file (this test included) may not import it directly.
 * Its value is a wire constant, not a logical dependency on the package;
 * inlined below with this citation
 * (`framework/api-contract/src/core-api-port.ts`).
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, vi } from "vitest";
import { createServer, type ServerHandle } from "../create-server.js";

const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";
const FOUNDER_ID = "doc-e2e-founder";

interface Booted {
	readonly server: ServerHandle;
	readonly port: number;
	readonly apiKey: string;
}

async function boot(db: HyperIdleDb): Promise<Booted> {
	const apiKey = `e2e-key-${Math.random().toString(36).slice(2)}`;
	vi.stubEnv("HYPERIDLE_API_KEY", apiKey);
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "document-ws-e2e-test-secret-32-chars!!");
	const server = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: path.join(os.tmpdir(), `document-ws-e2e-${Date.now()}-${Math.random()}`),
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

async function editDocument(
	handle: Booted,
	body: Record<string, unknown>,
	actorOverride?: string,
): Promise<{ id: string; version: number }> {
	const res = await callAction(handle, "/api/actions/edit_document", body, actorOverride);
	if (res.status !== 200 || res.json.ok !== true) {
		throw new Error(`edit_document failed: ${JSON.stringify(res.json)}`);
	}
	const data = res.json.data as { document: { id: string; version: number } };
	return data.document;
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

/** The negative half of `waitForFrame` — resolves once `timeoutMs` elapses
 * with no matching frame, rejects the instant one arrives. Proves (c)'s
 * "receives nothing", not just that the subscribe ack was refused. */
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
				reject(new Error(`unexpected frame arrived: ${JSON.stringify(msg)}`));
			}
		}
		ws.addEventListener("message", onMessage);
	});
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: teamId, name: teamId, phase: "build", createdAt: now })
		.onConflictDoNothing();
}

async function seedHuman(db: HyperIdleDb, id: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: id,
			role: "member",
			status: "active",
			...(teamId ? { teamId } : {}),
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

describe("document websocket nudge — real server, real socket, both doors (architecture.md §15.3)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("HTTP door: an edit reaches an already-subscribed document:<id> with the full after, and documents redacted on both before and after", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "doc-e2e-team-1");
			await seedHuman(db, FOUNDER_ID, "doc-e2e-team-1");
			const created = await editDocument(handle, { title: "v1", body: "first body" });

			const token = await wsTokenFor(handle, FOUNDER_ID);
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				const docAck = waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === `document:${created.id}`,
				);
				const listAck = waitForFrame(ws, (m) => m.type === "subscribed" && m.topic === "documents");
				ws.send(JSON.stringify({ type: "subscribe", topic: `document:${created.id}` }));
				ws.send(JSON.stringify({ type: "subscribe", topic: "documents" }));
				await docAck;
				await listAck;

				const docFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === `document:${created.id}`,
				);
				const listFrame = waitForFrame(ws, (m) => m.type === "update" && m.topic === "documents");

				const editRes = await callAction(
					handle,
					"/api/actions/edit_document",
					{ id: created.id, title: "secret e2e http-door title", version: created.version },
					FOUNDER_ID,
				);
				expect(editRes.status).toBe(200);

				const docMsg = await docFrame;
				expect(docMsg.kind).toBe("document.changed");
				const docData = docMsg.data as {
					before: Record<string, unknown>;
					after: Record<string, unknown>;
				};
				expect(docData.after.title).toBe("secret e2e http-door title");
				expect(docData.before.title).toBe("v1");

				const listMsg = await listFrame;
				expect(listMsg.kind).toBe("document.changed");
				const listData = listMsg.data as {
					before: Record<string, unknown> | null;
					after: Record<string, unknown> | null;
				};
				expect(listData.before).toBeNull();
				expect(listData.after).toBeNull();
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("TOOL door: the registered edit_document MCP tool handler nudges the same subscriber", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "doc-e2e-team-2");
			await seedHuman(db, FOUNDER_ID, "doc-e2e-team-2");
			await seedAgent(db, "doc-e2e-agent-1", FOUNDER_ID);
			const created = await editDocument(handle, { title: "tool-door v1" }, "doc-e2e-agent-1");

			const token = await wsTokenFor(handle, FOUNDER_ID);
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: `document:${created.id}` }));
				await waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === `document:${created.id}`,
				);

				const docFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === `document:${created.id}`,
				);

				const editDocumentTool = handle.server.actionTools.find((t) => t.name === "edit_document");
				if (!editDocumentTool) throw new Error("edit_document tool is not registered");
				const toolResult = await editDocumentTool.handler(
					{ id: created.id, title: "secret e2e tool-door title", version: created.version },
					{
						db,
						eventBus: new EventBus(),
						agentId: "doc-e2e-agent-1",
						sessionId: "doc-e2e-session-1",
						taskId: "",
						sandboxPath: os.tmpdir(),
						ingestion: { dispose: () => {} },
					},
				);
				expect(toolResult.success).toBe(true);

				const docMsg = await docFrame;
				const docData = docMsg.data as { after: Record<string, unknown>; actor: string };
				expect(docData.actor).toBe("doc-e2e-agent-1");
				expect(docData.after.title).toBe("secret e2e tool-door title");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("a socket of a user who may not read the document (another person's memory) is refused the subscription and receives nothing", async ({
		db,
	}) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "doc-e2e-team-3");
			await seedHuman(db, "doc-e2e-owner", "doc-e2e-team-3");
			await seedHuman(db, "doc-e2e-stranger", "doc-e2e-team-3");
			const created = await editDocument(
				handle,
				{ title: "a private memory", as: "memory" },
				"doc-e2e-owner",
			);

			const token = await wsTokenFor(handle, "doc-e2e-stranger");
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: `document:${created.id}` }));
				const ack = await waitForFrame(ws, (m) => m.topic === `document:${created.id}`);
				expect(ack.type).toBe("forbidden");

				const noFrame = assertNoFrame(
					ws,
					(m) => m.type === "update" && m.topic === `document:${created.id}`,
				);
				await callAction(
					handle,
					"/api/actions/edit_document",
					{ id: created.id, title: "still private", version: created.version },
					"doc-e2e-owner",
				);
				await noFrame;
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);

	test("the scope cascade sends one websocket envelope per narrowed child", async ({ db }) => {
		const handle = await boot(db);
		try {
			await seedTeam(db, "doc-e2e-team-4");
			await seedHuman(db, FOUNDER_ID, "doc-e2e-team-4");
			// Explicit `scopeKind:"factory"` — a document-actions default (§3.6:
			// "explicit scopeKind → calling task's team → factory") would
			// otherwise default a team member straight to their own team, and the
			// later narrowing edit would be a no-op rather than a real narrow.
			const root = await editDocument(
				handle,
				{ title: "cascade root", scopeKind: "factory" },
				FOUNDER_ID,
			);
			const child = await editDocument(
				handle,
				{
					title: "cascade child",
					parent: { kind: "document", id: root.id },
					scopeKind: "factory",
				},
				FOUNDER_ID,
			);

			const token = await wsTokenFor(handle, FOUNDER_ID);
			const ws = connect(handle, token);
			try {
				await waitForOpen(ws);
				ws.send(JSON.stringify({ type: "subscribe", topic: `document:${child.id}` }));
				await waitForFrame(
					ws,
					(m) => m.type === "subscribed" && m.topic === `document:${child.id}`,
				);

				const childFrame = waitForFrame(
					ws,
					(m) => m.type === "update" && m.topic === `document:${child.id}`,
				);

				// Narrowing the root's scope from `factory` to `team` cascades onto
				// the wider child — architecture.md §6.6 — and each narrowed row
				// gets its own post-commit push (§6.6 rule 5, §7).
				const narrowRes = await callAction(
					handle,
					"/api/actions/edit_document",
					{
						id: root.id,
						scopeKind: "team",
						scopeId: "doc-e2e-team-4",
						version: root.version,
					},
					FOUNDER_ID,
				);
				expect(narrowRes.status).toBe(200);

				const childMsg = await childFrame;
				expect(childMsg.kind).toBe("document.changed");
				const childData = childMsg.data as { after: Record<string, unknown>; objectId: string };
				expect(childData.objectId).toBe(child.id);
				expect(childData.after.scopeKind).toBe("team");
				expect(childData.after.scopeId).toBe("doc-e2e-team-4");
			} finally {
				ws.close();
			}
		} finally {
			await handle.server.dispose();
		}
	}, 30_000);
});
