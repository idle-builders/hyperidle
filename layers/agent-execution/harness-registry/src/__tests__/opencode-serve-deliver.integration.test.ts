/**
 * opencode-serve-deliver — real-binary test for mid-turn steer via HTTP serve API.
 *
 * Starts an opencode session, delivers a steer 3 s in, verifies the steer
 * was accepted (deliver() returns "delivered") and that the session produces
 * events. LLM-level assertion (code word in reply) requires valid credentials.
 *
 * LOCAL-ONLY LANE — needs real opencode binary + valid provider credentials.
 */

import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { OpenCodeServeAdapter } from "../opencode-serve-adapter.js";
import { createHarnessSandbox, requireHarnessAuthed } from "./harness-sandbox.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

describe("OpenCodeServeAdapter deliver (real binary)", () => {
	requireHarness("opencode");

	test("mid-run deliver is accepted by the serve API", async () => {
		await requireHarnessAuthed("opencode");

		const sandbox = createHarnessSandbox("opencode-serve-deliver");

		try {
			await ensureSandboxGitRepo(sandbox.path);

			const config: SessionConfig = {
				sessionId: `oc-steer-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: "You are a test assistant.",
				// Long bash sleep gives the idle timer time to accept a steer before turn completes
				instruction:
					"Run exactly this bash command: `sleep 10 && echo DONE`. " +
					"After it finishes, reply with a single sentence about what happened.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new OpenCodeServeAdapter();
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const events: HarnessEvent[] = [];
			let deliverResult: string | undefined;

			const collectEvents = async (): Promise<void> => {
				for await (const ev of adapter.streamEvents(handle)) {
					events.push(ev);
				}
			};

			// Deliver steer 3 s after startSession — turn still active (bash sleep is 10 s)
			const deliverAfterDelay = async (): Promise<void> => {
				await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
				deliverResult = await adapter.deliver(
					handle,
					"STEER: include the word KANGAROO in your final reply.",
				);
			};

			try {
				await Promise.all([collectEvents(), deliverAfterDelay()]);
				const stopResult = await adapter.stopSession(handle);

				// Primary assertion: steer was accepted mid-run (deliver did not return "unsupported")
				expect(deliverResult, "steer must be accepted while session is active").toBe("delivered");

				// Secondary assertion (requires valid LLM credentials): code word in reply
				const text = events
					.filter((e) => e.type === "completion")
					.map((e) => (e as { type: "completion"; text: string }).text)
					.join("");
				expect(text, "delivered steer must appear in the final response").toMatch(/KANGAROO/i);

				expect(stopResult.outcome).toBe("completed");
			} finally {
				adapter.killServer();
			}
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
