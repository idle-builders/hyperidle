/**
 * Proves the codex Stop hook fires when a session ends through
 * CodexAppServerAdapter (app-server path, not exec path).
 *
 * The Stop hook is the return-gate for codex sessions. If it does not fire,
 * the enforcement channel ("settings-codex") is silently broken.
 *
 * HARNESS LANE: real binary, real LLM, requireHarness("codex").
 */

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";
import { provisionHarnessEnvironment } from "../provision-harness-environment.js";
import { createHarnessSandbox, requireHarnessAuthed } from "./harness-sandbox.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

describe("CodexAppServerAdapter Stop hook (real binary)", () => {
	requireHarness("codex");

	test("Stop hook POSTs to the bridge when a session ends", async () => {
		await requireHarnessAuthed("codex");

		// Bridge stub — records any POST to /return-status.
		let bridgePostReceived = false;
		const bridge = http.createServer((req, res) => {
			if (req.method === "POST" && req.url === "/return-status") {
				bridgePostReceived = true;
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end("{}");
		});
		await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
		const bridgePort = (bridge.address() as AddressInfo).port;
		const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
		const bridgeToken = "test-hook-token";

		const sandbox = createHarnessSandbox("codex-appserver-hook");
		try {
			await ensureSandboxGitRepo(sandbox.path);

			// Production provisioning: copies auth.json, writes .codex-home/hooks.json.
			await provisionHarnessEnvironment({
				sandboxPath: sandbox.path,
				mcpUrl: bridgeUrl,
				token: bridgeToken,
				channel: "settings-codex",
			});

			const config: SessionConfig = {
				sessionId: `codex-hook-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: "You are a test assistant. Be brief.",
				instruction: "Reply with exactly: HOOK_TEST",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new CodexAppServerAdapter();
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			for await (const _event of adapter.streamEvents(handle)) {
			}

			// notify fires on "turn-ended"; give the script time to POST before stopSession kills the process group.
			await new Promise<void>((resolve) => setTimeout(resolve, 3000));
			expect(bridgePostReceived, "notify must POST to the bridge when a turn ends").toBe(true);

			await adapter.stopSession(handle);
		} finally {
			await sandbox.cleanup();
			await new Promise<void>((resolve) => bridge.close(() => resolve()));
		}
	}, 120_000);
});
