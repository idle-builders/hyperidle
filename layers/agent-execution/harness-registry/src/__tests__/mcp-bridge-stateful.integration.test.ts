/**
 * T0b — Production MCP bridge session-capability (stateful) gate.
 *
 * AC9: The production `createMcpBridge` + `createMcpRoute` handle a full
 * multi-request MCP session: initialize → list_tools → call_tool, threading
 * the `mcp-session-id` response header across requests.
 *
 * This test MUST BE RED against the current stateless bridge:
 *   `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })`
 * throws `Stateless transport cannot be reused across requests` on request 2.
 *
 * After T0 (the stateful flip), it turns GREEN.
 *
 * IN CI / test:all — deterministic, no external binary.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { err, ok, type RegisteredTool, type ToolRegistry } from "@hyperidle/harness-protocol";
import { toClaudeToolSpec, toRegistered } from "@hyperidle/tool-handlers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import z from "zod";
import type { EnforcementRegistry } from "../enforcement-registry.js";
import { createMcpToolBridge, type McpToolBridge } from "../mcp-tool-bridge.js";
import { createReturnEnforcement } from "../return-enforcement.js";

const createEnforcementRegistry = () => createReturnEnforcement();

/**
 * Inline commit_file proof-vehicle tool.
 */
const commitFileTool = toRegistered({
	name: "commit_file",
	description:
		"Write content to a file in the session sandbox. Overwrites the file if it already exists.",
	inputSchema: z.object({
		path: z.string().min(1),
		content: z.string(),
	}),
	handler: async (args: { path: string; content: string }, ctx) => {
		const resolved = path.resolve(
			path.isAbsolute(args.path) ? args.path : path.join(ctx.sandboxPath, args.path),
		);
		const sandboxResolved = path.resolve(ctx.sandboxPath);
		if (!resolved.startsWith(sandboxResolved + path.sep) && resolved !== sandboxResolved) {
			return err("OUTSIDE_SANDBOX", `commit_file: path outside sandbox ${sandboxResolved}`);
		}
		try {
			fs.mkdirSync(path.dirname(resolved), { recursive: true });
			fs.writeFileSync(resolved, args.content, "utf-8");
		} catch (e) {
			return err("WRITE_FAILED", `commit_file: could not write: ${String(e)}`);
		}
		return ok({ written: resolved, bytes: Buffer.byteLength(args.content, "utf-8") });
	},
});

// ── Minimal one-tool registry for the proof vehicle ──────────────────────────
// Avoids a full buildToolRegistry (which needs a DB). commit_file is a pure
// disk-write tool with no DB dependency.

function buildMinimalRegistry(sandboxPath: string): ToolRegistry {
	const commitFileDef = commitFileTool;

	const definitions: readonly RegisteredTool[] = [commitFileDef];

	return {
		definitions,
		invoke: async (name: string, rawArgs: unknown) => {
			if (name !== "commit_file") {
				return err("NOT_FOUND", `Unknown tool: ${name}`);
			}
			const parsed = commitFileDef.inputSchema.safeParse(rawArgs ?? {});
			if (!parsed.success) {
				return err("INVALID_INPUT", parsed.error.message);
			}
			return commitFileDef.handler(parsed.data, {
				db: undefined!,
				eventBus: undefined!,
				agentId: "t0b-test",
				sessionId: "t0b-session",
				taskId: "t0b-task",
				sandboxPath,
				ingestion: undefined!,
			});
		},
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};
}

// ── Test server helpers ───────────────────────────────────────────────────────

interface T0bTestServer {
	readonly url: string;
	readonly bridgeRegistry: McpToolBridge;
	readonly enforcementReg: EnforcementRegistry;
	readonly bridge: { readonly token: string };
	close(): Promise<void>;
}

async function startT0bServer(sandboxPath: string): Promise<T0bTestServer> {
	const enforcementReg = createEnforcementRegistry();
	const bridgeRegistry = createMcpToolBridge({ enforcement: enforcementReg });
	const testSessionId = `t0b-session-${Math.random().toString(36).slice(2, 10)}`;

	const registry = buildMinimalRegistry(sandboxPath);
	// Production factory — this is the line under test.
	// RED: sessionIdGenerator: undefined → throws on request 2.
	// GREEN (after T0): sessionIdGenerator: () => crypto.randomUUID() → multi-request works.
	const bridge = await bridgeRegistry.open({ sessionId: testSessionId, registry });

	// Mount the production route (createMcpRoute) — no test-only overrides.
	const app = new Hono();
	const api = new Hono();
	const mcpRouter = bridgeRegistry.router;
	api.route("/", mcpRouter);
	app.route("/api", api);

	let resolvePort: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});
	const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
		resolvePort(info.port);
	});
	const port = await portPromise;
	const url = `http://127.0.0.1:${port}`;

	return {
		url,
		bridgeRegistry,
		enforcementReg,
		bridge,
		close: async () => {
			await bridgeRegistry.close(bridge.token);
			await new Promise<void>((resolve, reject) => {
				server.close((e) => (e ? reject(e) : resolve()));
			});
		},
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("production MCP bridge stateful session-capability", () => {
	let sandboxPath: string;
	let testServer: T0bTestServer;

	beforeEach(async () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "t0b-mcp-"));
		testServer = await startT0bServer(sandboxPath);
	});

	afterEach(async () => {
		await testServer.close();
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	test("multi-request session: initialize → list_tools → call_tool succeeds via mcp-session-id", async () => {
		// Use the SDK Client + StreamableHTTPClientTransport pointed at the
		// PRODUCTION server. This avoids the mcp-protocol-version foot-gun (N11)
		// and naturally carries the mcp-session-id header on requests 2+.
		//
		// RED reason: the production bridge is stateless — the SDK transport
		// issues initialize (req 1) then immediately makes a follow-up request
		// (req 2). The stateless bridge throws on req 2:
		//   "Stateless transport cannot be reused across requests."
		//
		// GREEN (after T0): stateful bridge assigns a session id and routes all
		// subsequent requests via the mcp-session-id header.

		const mcpUrl = `${testServer.url}/api/mcp/${testServer.bridge.token}`;

		const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
		const client = new Client({ name: "t0b-test-client", version: "1.0" }, { capabilities: {} });

		// connect() drives the initialize handshake (request 1 + server response).
		// On a stateless bridge, any subsequent client call that issues a request
		// will hit the stateless guard and throw.
		await client.connect(transport);

		try {
			// listTools() issues a tools/list request (request 2).
			// RED: stateless bridge throws "Stateless transport cannot be reused across requests."
			// GREEN: stateful bridge returns the registered tools list.
			const toolsList = await client.listTools();

			// Assert: the production bridge is session-capable and returned the tool list.
			expect(toolsList.tools).toBeDefined();
			const toolNames = toolsList.tools.map((t) => t.name);

			// The minimal registry exposes commit_file.
			expect(toolNames).toContain("commit_file");

			// callTool() issues a tools/call request (request 3).
			// RED: would also fail on stateless bridge.
			// GREEN: stateful bridge routes to registry.invoke.
			const callResult = await client.callTool({
				name: "commit_file",
				arguments: { path: "t0b-proof.txt", content: "t0b-stateful-proof" },
			});

			// Assert: registry.invoke was called and returned a result.
			// The tool writes to sandboxPath/t0b-proof.txt.
			expect(callResult).toBeDefined();
			expect(callResult.content).toBeDefined();

			// Verify the file was written (proves the full call routed to registry.invoke).
			const proofFile = path.join(sandboxPath, "t0b-proof.txt");
			expect(fs.existsSync(proofFile)).toBe(true);
			expect(fs.readFileSync(proofFile, "utf-8")).toBe("t0b-stateful-proof");
		} finally {
			await client.close();
		}
	}, 30_000);

	test("POST without mcp-session-id header after initialize is rejected with 400 or 404", async () => {
		// This sanity-break proves the session gate is real, not a no-op.
		//
		// Protocol:
		//   1. Initialize via SDK Client → server returns mcp-session-id header.
		//   2. Issue a raw tools/list request WITHOUT the mcp-session-id header.
		//   3. The SDK's validateSession() must return 400 "Mcp-Session-Id header is required"
		//      or 404 "Session not found".
		//
		// This proves the session gate enforces the mcp-session-id contract.
		// Without this check, the test could vacuously green against a no-op transport.
		//
		// NOTE: This sanity-break only applies AFTER T0 (stateful bridge).
		// Against the current stateless bridge (RED phase), the initialize itself
		// may succeed but the second request throws for a different reason.
		// We assert the response is NOT 200 (either 400 or 404).

		const mcpUrl = `${testServer.url}/api/mcp/${testServer.bridge.token}`;

		// Step 1: Initialize to get a valid session id.
		const initResponse = await fetch(mcpUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "t0b-sanity-break", version: "1.0" },
				},
			}),
		});

		// The initialize request may or may not succeed on the stateless bridge.
		// We don't assert on this — the RED assertion is on request 2.

		// Step 2: Issue a tools/list WITHOUT the mcp-session-id header.
		// On a stateful bridge (GREEN): SDK validates session → 400 "Mcp-Session-Id header is required".
		// On a stateless bridge (RED): the first request may have been fine, but
		//   this is NOT mcp-session-id-gated, meaning the session gate is absent.
		// We assert the response is NOT 200 to prove the gate is real.
		const listWithoutSessionId = await fetch(mcpUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				// Intentionally NO mcp-session-id header.
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			}),
		});

		// The session gate must reject this request.
		// 400 = "Server not initialized" or "Mcp-Session-Id header is required"
		// 404 = "Session not found"
		// 200 = NOT acceptable (means the gate is absent — vacuous green)
		expect([400, 404]).toContain(listWithoutSessionId.status);

		// Consume the init response body to avoid resource leaks.
		await initResponse.body?.cancel();
	}, 30_000);
});
