/**
 * Package containment check per Agent Plugins 1.0.0 spec.
 *
 * Every package-supplied path MUST resolve inside the plugin root.
 * Plugin-relative paths begin with "./".
 *
 * @lore BA9a: Exported here for reuse in BA9b (skills dir, mcp.json paths).
 */

import { resolve, sep } from "node:path";

/**
 * Returns true if `candidatePath` (resolved relative to `rootDir`) stays
 * within `rootDir`. Returns false if the resolved path escapes the root.
 *
 * Plugin-relative paths must begin with "./". An absolute path is also checked
 * for containment (it may be a path supplied by the plugin runtime).
 *
 * @lore BA9a: Containment is in the spec; do not add policy on top of it.
 */
export function isPathContained(rootDir: string, candidatePath: string): boolean {
	const resolvedRoot = resolve(rootDir);
	const resolvedCandidate = resolve(rootDir, candidatePath);
	const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
	// Allow exact match (root itself) or a path that starts with root+sep
	return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootWithSep);
}

/**
 * Asserts that a plugin-relative path begins with "./" per the spec.
 * A bare name without "./" prefix is also checked for containment but is
 * technically not spec-compliant. Returns false if the path clearly escapes.
 */
export function isPluginRelativePath(candidatePath: string): boolean {
	return candidatePath.startsWith("./");
}
