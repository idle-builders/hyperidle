/**
 * codex-app-server-deliver — real-binary test for mid-turn steer via app-server.
 *
 * Starts a codex session through CodexAppServerAdapter, waits a couple seconds,
 * then delivers a mid-turn message via adapter.deliver(). Verifies the delivered
 * text reaches the model's final response.
 *
 * LOCAL-ONLY LANE — needs real codex binary + ChatGPT subscription auth.
 */

import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";
import {
	createHarnessSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

describe("CodexAppServerAdapter deliver (real binary)", () => {
	requireHarness("codex");

	test("mid-run deliver reaches the model's response", async () => {
		await requireHarnessAuthed("codex");

		const sandbox = createHarnessSandbox("codex-appserver-deliver");
		const authFound = provisionCodexHome(sandbox.path);
		if (!authFound) {
			throw new Error("codex auth.json not found — requireHarnessAuthed should have caught this");
		}

		try {
			await ensureSandboxGitRepo(sandbox.path);

			const config: SessionConfig = {
				sessionId: `codex-steer-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: "You are a test assistant.",
				// Long bash sleep gives time to deliver a steer before turn completes
				instruction:
					"Run exactly this bash command: `sleep 10 && echo DONE`. " +
					"After it finishes, reply with a single sentence about what happened.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new CodexAppServerAdapter();
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			let steered = false;
			const events: HarnessEvent[] = [];

			const collectEvents = async () => {
				const startMs = Date.now();
				for await (const ev of adapter.streamEvents(handle)) {
					events.push(ev);
					if (!steered && Date.now() - startMs >= 3000) {
						steered = true;
						// Deliver mid-run while bash sleep is still running
						await adapter.deliver(handle, "STEER: include the word KANGAROO in your final reply.");
					}
				}
			};

			await collectEvents();
			const stopResult = await adapter.stopSession(handle);

			const text = events
				.filter((e) => e.type === "completion")
				.map((e) => (e as { type: "completion"; text: string }).text)
				.join(" ");

			expect(text, "delivered text must appear in the final response").toMatch(/KANGAROO/i);
			expect(stopResult.outcome).toBe("completed");
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
