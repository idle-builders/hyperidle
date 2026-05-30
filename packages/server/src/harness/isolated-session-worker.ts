/**
 * S2: isolated-session-worker — child process for IsolatedHarnessAdapter.
 *
 * Receives a { type: "start", config: SessionConfig } message via IPC,
 * runs the agent session using ClaudeAgentSdkAdapter, streams events back
 * via IPC as { type: "event", event } messages, and sends a final
 * { type: "session_result", result } message when done.
 *
 * Also handles { type: "stop" } to gracefully stop the session early.
 *
 * @lore S2: This file runs as a forked child process. It must NOT be imported
 * by the main server — only executed by fork(). The IsolatedHarnessAdapter
 * forks this file with a sandboxed env.
 */

import type { SessionConfig } from "@hyperidle/shared";

// Only run when invoked as a main module (not imported in tests)
if (process.env.NODE_ENV !== "test") {
	runWorker();
}

function runWorker(): void {
	let stop = false;

	process.on("message", (msg: unknown) => {
		if (typeof msg !== "object" || msg === null || !("type" in msg)) return;
		const typed = msg as { type: string };

		if (typed.type === "start") {
			const { config } = msg as { config: SessionConfig };
			void runSession(config).catch((err: unknown) => {
				process.send?.({
					type: "session_result",
					result: {
						outcome: "crashed",
						cost: { minor: 0, currency: "USD" },
						tokenUsage: { byTier: {} },
					},
				});
				// Exit after reporting failure
				void Promise.resolve().then(() => process.exit(1));
			});
		} else if (typed.type === "stop") {
			stop = true;
		}
	});

	async function runSession(config: SessionConfig): Promise<void> {
		// Dynamic import to avoid loading the SDK unless actually running
		const { ClaudeAgentSdkAdapter } = await import("./claude-agent-sdk-adapter.js");
		const adapter = new ClaudeAgentSdkAdapter();
		const handle = await adapter.startSession(config);

		let result = null;
		for await (const event of adapter.streamEvents(handle)) {
			process.send?.({ type: "event", event });
			if (stop) break;
		}

		result = await adapter.stopSession(handle);
		process.send?.({ type: "session_result", result });
		process.exit(0);
	}
}
