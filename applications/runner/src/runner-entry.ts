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

logger.info("runner starting", { serverUrl, dataDir });

const runner = await startRunner({ serverUrl, personKey, dataDir, spacesDir });

logger.info("runner started", {
	held: runner.heldAgentIds().length,
	movedAway: runner.movedAwayAgentIds().length,
});

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
