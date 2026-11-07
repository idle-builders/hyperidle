/**
 * CLI entry point for the standalone runner process.
 *
 * Required environment variables:
 *   HYPERIDLE_SERVER_URL  — the core-api server to connect to
 *   HYPERIDLE_API_KEY     — the person's API key
 *   HYPERIDLE_DATA_DIR    — directory for runner-db and logs
 *
 * Optional:
 *   HYPERIDLE_SPACES_DIR  — base directory for agent sandboxes
 *
 * IPC (Electron utilityProcess.fork):
 *   Receives  { type: "take", agentId: string }
 *   Receives  { type: "held" }     → replies { type: "held", ids: string[] }
 *   Receives  { type: "movedAway" } → replies { type: "movedAway", ids: string[] }
 *   Receives  { type: "state", agentId: string, reqId: string }
 *             → replies { type: "state", reqId: string, held: boolean, movedAway: boolean }
 */

import { createLogger } from "@hyperidle/diagnostics";
import { startRunner } from "./index.js";

const logger = createLogger({ pkg: "runner.entry" });

function require(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Runner: required env var ${name} is not set`);
	return v;
}

const serverUrl = require("HYPERIDLE_SERVER_URL");
const personKey = require("HYPERIDLE_API_KEY");
const dataDir = require("HYPERIDLE_DATA_DIR");
const spacesDir = process.env.HYPERIDLE_SPACES_DIR;

// IPC channel for Electron utilityProcess.fork — handle messages from main.ts.
// @lore: process.parentPort — injected by Electron utility process runtime; absent in CLI; not in @types/node.
interface ParentPort {
	on(event: "message", listener: (event: { data: unknown }) => void): void;
	postMessage(msg: unknown): void;
}

// Wrapped in an IIFE so CJS output (esbuild) can compile top-level await.
void (async () => {
	logger.info("runner starting", { serverUrl, dataDir });

	const runner = await startRunner({ serverUrl, personKey, dataDir, spacesDir });

	logger.info("runner started", {
		held: runner.heldAgentIds().length,
		movedAway: runner.movedAwayAgentIds().length,
	});

	const parentPort = (process as { parentPort?: ParentPort }).parentPort;
	if (parentPort) {
		parentPort.on("message", (event: { data: unknown }) => {
			const msg = event.data as { type?: string; agentId?: string; reqId?: string } | null;
			if (!msg || typeof msg.type !== "string") return;
			if (msg.type === "take" && typeof msg.agentId === "string") {
				runner.takeAgent(msg.agentId).catch((err: unknown) => {
					logger.error("runner.takeAgent failed", { agentId: msg.agentId, error: String(err) });
				});
			} else if (msg.type === "held") {
				parentPort.postMessage({ type: "held", ids: runner.heldAgentIds() });
			} else if (msg.type === "movedAway") {
				parentPort.postMessage({ type: "movedAway", ids: runner.movedAwayAgentIds() });
			} else if (msg.type === "state" && typeof msg.agentId === "string" && typeof msg.reqId === "string") {
				const agentId = msg.agentId;
				const reqId = msg.reqId;
				parentPort.postMessage({
					type: "state",
					reqId,
					held: runner.heldAgentIds().includes(agentId),
					movedAway: runner.movedAwayAgentIds().includes(agentId),
				});
			}
		});
	}

	// Graceful shutdown on SIGTERM/SIGINT.
	function shutdown(signal: string): void {
		logger.info("runner shutting down", { signal });
		runner
			.stop()
			.then(() => {
				logger.info("runner stopped");
				process.exit(0);
			})
			.catch((err: unknown) => {
				logger.error("runner stop error", {
					error: err instanceof Error ? err.message : String(err),
				});
				process.exit(1);
			});
	}

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
})();
