/**
 * cli-adapter-deliver — real-binary test for mid-run stdin delivery.
 *
 * Starts a claude session with a long-running bash command. While it is
 * running, delivers a mid-run steer message via adapter.deliver(). Verifies
 * the delivered text reaches the model's final response.
 *
 * LOCAL-ONLY LANE — needs real claude binary + auth.
 */

import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import {
	createHarnessSandbox,
	provisionClaudeSandbox,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

describe("CLI adapter deliver (real binary, claude only)", () => {
	requireHarness("claude");

	test("mid-run deliver reaches the model's response", async () => {
		await requireHarnessAuthed("claude");

		const sandbox = createHarnessSandbox("cli-adapter-deliver-claude");
		provisionClaudeSandbox(sandbox.path);
		try {
			const config: SessionConfig = {
				sessionId: `cli-deliver-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: "You are a test assistant.",
				instruction:
					"Run exactly this bash command: `sleep 8 && echo DONE`. " +
					"After it finishes, reply with a single sentence about what happened.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.claude.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new CliHarnessAdapter(productionCliConfig("claude"));
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			// Deliver a steer 2 seconds into the run, while claude is waiting for sleep
			let steered = false;
			const events: HarnessEvent[] = [];

			const collectEvents = async () => {
				const startMs = Date.now();
				for await (const ev of adapter.streamEvents(handle)) {
					events.push(ev);
					if (!steered && Date.now() - startMs >= 2000) {
						steered = true;
						// Deliver mid-run while the bash sleep is running (2s into 8s sleep)
						await adapter.deliver!(handle, "STEER: include the word KANGAROO in your final reply.");
					}
				}
			};

			await collectEvents();
			const stopResult = await adapter.stopSession(handle);

			// The final reply must include KANGAROO (delivered mid-run)
			const text = events
				.filter((e) => e.type === "completion")
				.map((e) => (e as { type: "completion"; text: string }).text)
				.join(" ");

			// The delivered steer was used in the same run
			expect(text, "delivered text must appear in the final response").toMatch(/KANGAROO/i);

			// The process ended cleanly (not stopped or crashed)
			expect(stopResult.outcome).toBe("completed");
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
