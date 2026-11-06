/**
 * Agent spaces — persistent per-agent directories on this computer.
 *
 * Each agent gets one root directory; runs put working folders inside it
 * rather than spinning up a fresh temp directory each time.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { readAgentRunConfig, writeAgentRunConfig } from "./agent-run-config-store.js";

/**
 * Root directory for all agent spaces on this computer.
 *
 * Override with `HYPERIDLE_SPACES_DIR` for tests or alternative installs;
 * defaults to `~/HyperIdle`.
 */
export function spacesRoot(): string {
	return process.env.HYPERIDLE_SPACES_DIR ?? path.join(os.homedir(), "HyperIdle");
}

/**
 * Sanitize a name for use as a directory component.
 * Strips leading/trailing whitespace, replaces slashes and control chars,
 * collapses runs of spaces to a single hyphen.
 */
function sanitizeName(name: string): string {
	return (
		name
			.trim()
			// Filesystem-forbidden characters and Unicode control characters (Cc category).
			.replace(/[/\\<>:"|?*]/g, "")
			.replace(/\p{Cc}/gu, "")
			.replace(/\s+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "agent"
	);
}

/**
 * Find a directory name that does not collide with any existing path under
 * `root`. Appends `-2`, `-3`, … until a free name is found.
 */
function collisionFreeDir(root: string, base: string): string {
	const candidate = path.join(root, base);
	if (!existsSync(candidate)) return candidate;
	for (let n = 2; n <= 999; n++) {
		const c = path.join(root, `${base}-${n}`);
		if (!existsSync(c)) return c;
	}
	throw new Error(`No free directory for '${base}' under '${root}'`);
}

/**
 * Ensure the agent's space directory exists and return its path.
 *
 * - If the agent's run-config already has a `spacePath`, return it (and ensure
 *   the directory exists on disk).
 * - Otherwise pick `<root>/<sanitizedName>` with collision avoidance, create
 *   it, persist the path, and return it.
 *
 * Uses `currentSpacePath` (already-read from the run config) to avoid a
 * second DB round-trip in callers that have read the config themselves.
 */
export async function ensureAgentSpace(
	db: HyperIdleDb,
	agentId: string,
	agentName: string,
	currentSpacePath?: string | null,
): Promise<string> {
	// Use the passed-in value if available; otherwise read from DB.
	const spacePath =
		currentSpacePath !== undefined
			? currentSpacePath
			: (await readAgentRunConfig(db, agentId)).spacePath;

	if (spacePath) {
		mkdirSync(spacePath, { recursive: true });
		return spacePath;
	}

	const root = spacesRoot();
	mkdirSync(root, { recursive: true });
	const newPath = collisionFreeDir(root, sanitizeName(agentName));
	mkdirSync(newPath, { recursive: true });

	await writeAgentRunConfig(db, agentId, { spacePath: newPath });
	return newPath;
}

/**
 * Derive the working folder for a session inside an agent's space.
 *
 * Priority:
 *   1. `resume.sandboxPath` — resumed session reuses the original folder.
 *   2. `taskId`             — `<space>/tasks/<taskId>/`
 *   3. `subscriptionId`     — `<space>/subscriptions/<subscriptionId>/`
 *   4. `callingThreadId`    — `<space>/conversations/<callingThreadId>/`
 *   5. fallback             — `<space>/misc/<randomId>/` (import randomUUID lazily)
 */
export function deriveWorkingFolder(
	spacePath: string,
	params: {
		taskId?: string | null;
		callingThreadId?: string;
		subscriptionId?: string | null;
		resumeSandboxPath?: string | null;
	},
): string {
	if (params.resumeSandboxPath) return params.resumeSandboxPath;
	if (params.taskId) return path.join(spacePath, "tasks", params.taskId);
	if (params.subscriptionId) return path.join(spacePath, "subscriptions", params.subscriptionId);
	if (params.callingThreadId) return path.join(spacePath, "conversations", params.callingThreadId);
	// Fallback: misc/<uuid>
	return path.join(spacePath, "misc", randomUUID());
}
