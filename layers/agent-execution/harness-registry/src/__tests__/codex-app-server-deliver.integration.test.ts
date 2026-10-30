/**
 * codex-app-server-deliver — real-binary test for mid-turn steer via app-server.
 *
 * Starts a codex session, waits 3 s on a timer, then delivers a mid-turn message.
 * Verifies the delivered text reaches the model's final response.
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
				// Long bash sleep gives the timer time to deliver a steer before turn completes
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

			const events: HarnessEvent[] = [];

			// Collect all events (completes when turn/completed arrives or process exits)
			const collectEvents = async (): Promise<void> => {
				for await (const ev of adapter.streamEvents(handle)) {
					events.push(ev);
				}
			};

			// Deliver steer 3 s after startSession — the bash sleep is 10 s so the
			// turn is still running and activeTurnId is already set by the time this fires.
			const deliverAfterDelay = async (): Promise<void> => {
				await new Promise<void>((resolve) => setTimeout(resolve, 3000));
				await adapter.deliver(handle, "STEER: include the word KANGAROO in your final reply.");
			};

			await Promise.all([collectEvents(), deliverAfterDelay()]);
			const stopResult = await adapter.stopSession(handle);

			const text = events
				.filter((e) => e.type === "completion")
				.map((e) => (e as { type: "completion"; text: string }).text)
				.join("");

			expect(text, "delivered text must appear in the final response").toMatch(/KANGAROO/i);
			expect(stopResult.outcome).toBe("completed");
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
