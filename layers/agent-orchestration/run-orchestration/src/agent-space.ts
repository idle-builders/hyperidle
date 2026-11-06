/**
 * Agent spaces — persistent per-agent directories on this computer.
 *
 * Each agent gets one root directory; runs put working folders inside it
 * rather than spinning up a fresh temp directory each time.
 */

import { createHash } from "node:crypto";
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

/** Six-character hex suffix derived deterministically from an agent id. */
function agentIdSuffix(agentId: string): string {
	return createHash("sha1").update(agentId).digest("hex").slice(0, 6);
}

/**
 * Find a directory name that does not collide with any existing path under
 * `root`. On collision appends a short id derived from the agent id
 * (e.g. `Eve-3f9a2c`) rather than a numeric counter.
 */
function collisionFreeDir(root: string, base: string, agentId: string): string {
	const candidate = path.join(root, base);
	if (!existsSync(candidate)) return candidate;
	const suffix = agentIdSuffix(agentId);
	const withSuffix = path.join(root, `${base}-${suffix}`);
	if (!existsSync(withSuffix)) return withSuffix;
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
	const newPath = collisionFreeDir(root, sanitizeName(agentName), agentId);
	mkdirSync(newPath, { recursive: true });

	await writeAgentRunConfig(db, agentId, { spacePath: newPath });
	return newPath;
}

/** Reject an id that would escape or misname a directory component. */
function validateDirId(id: string, label: string): void {
	if (!id) throw new Error(`deriveWorkingFolder: ${label} must not be empty`);
	if (id === "." || id === "..")
		throw new Error(`deriveWorkingFolder: ${label} must not be '.' or '..'`);
	if (id.includes("/") || id.includes("\\"))
		throw new Error(`deriveWorkingFolder: ${label} must not contain path separators`);
}

/**
 * Derive the working folder for a session inside an agent's space.
 *
 * Priority:
 *   1. `resume.sandboxPath` — resumed session reuses the original folder.
 *   2. `taskId`             — `<space>/tasks/<taskId>/`
 *   3. `subscriptionId`     — `<space>/subscriptions/<subscriptionId>/`
 *   4. `callingThreadId`    — `<space>/conversations/<callingThreadId>/`
 *
 * Every real run carries one of these; a session with none is a caller bug.
 * taskId, subscriptionId, and callingThreadId must be non-empty and must not
 * contain path separators or be '.' / '..'.
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
	if (params.taskId) {
		validateDirId(params.taskId, "taskId");
		return path.join(spacePath, "tasks", params.taskId);
	}
	if (params.subscriptionId) {
		validateDirId(params.subscriptionId, "subscriptionId");
		return path.join(spacePath, "subscriptions", params.subscriptionId);
	}
	if (params.callingThreadId) {
		validateDirId(params.callingThreadId, "callingThreadId");
		return path.join(spacePath, "conversations", params.callingThreadId);
	}
	throw new Error(
		"deriveWorkingFolder: session has no taskId, subscriptionId, callingThreadId, or resumeSandboxPath",
	);
}
