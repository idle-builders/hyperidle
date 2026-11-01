/**
 * Proves the in-adapter return gate fires when an opencode session turn ends.
 *
 * OpenCodeServeAdapter checks the bridge after each idle-timer expiry.
 * When the bridge returns a force message, the adapter starts a follow-up
 * turn. When the bridge returns empty (approve), the session ends.
 *
 * HARNESS LANE: real binary, real opencode, requireHarness("opencode").
 */

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { OpenCodeServeAdapter } from "../opencode-serve-adapter.js";
import { provisionHarnessEnvironment } from "../provision-harness-environment.js";
import { createHarnessSandbox, requireHarnessAuthed } from "./harness-sandbox.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

describe("OpenCodeServeAdapter in-adapter return gate (real binary)", () => {
	requireHarness("opencode");

	test("starts a follow-up turn when bridge blocks, ends session when bridge approves", async () => {
		await requireHarnessAuthed("opencode");

		// Bridge: block once (return force message), then approve.
		let bridgeCallCount = 0;
		const bridge = http.createServer((req, res) => {
			if (req.method === "POST" && req.url?.endsWith("/return-status")) {
				bridgeCallCount++;
				res.writeHead(200, { "Content-Type": "text/plain" });
				if (bridgeCallCount === 1) {
					res.end("Summarize what you did in one sentence.");
				} else {
					res.end(""); // approve
				}
				return;
			}
			res.writeHead(404);
			res.end();
		});
		await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
		const bridgePort = (bridge.address() as AddressInfo).port;
		const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
		const bridgeToken = "test-gate-token";

		const sandbox = createHarnessSandbox("opencode-serve-gate");
		try {
			await ensureSandboxGitRepo(sandbox.path);

			// Provision opencode.json for MCP; gate is in-process — no channel file needed.
			await provisionHarnessEnvironment({
				sandboxPath: sandbox.path,
				mcpUrl: bridgeUrl,
				token: bridgeToken,
				dialect: "opencode-json",
			});

			const config: SessionConfig = {
				sessionId: `oc-gate-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: "You are a test assistant. Be brief.",
				instruction: "Reply with exactly: GATE_TEST",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
				mcpConnectionInfo: undefined,
				returnHook: {
					bridgeToken,
					mcpUrl: bridgeUrl,
					forceBudget: 2,
				},
			};

			const adapter = new OpenCodeServeAdapter();
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			try {
				for await (const _event of adapter.streamEvents(handle)) {
					// consume; gate logic is inside streamEvents
				}

				// Bridge must have been called at least twice: once for the block, once for the approve.
				expect(bridgeCallCount, "bridge must be checked after each turn").toBeGreaterThanOrEqual(2);

				// Adapter must report the one forced follow-up turn.
				expect(
					adapter.getForceReturnCount(config.sessionId),
					"getForceReturnCount must return 1 after one forced turn",
				).toBe(1);

				await adapter.stopSession(handle);
			} finally {
				adapter.killServer();
			}
		} finally {
			await sandbox.cleanup();
			await new Promise<void>((resolve) => bridge.close(() => resolve()));
		}
	}, 180_000);
});
