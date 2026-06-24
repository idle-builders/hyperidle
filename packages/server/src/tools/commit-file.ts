/**
 * AL7 live-proof tool — `commit_file`
 *
 * Writes a file into the session sandbox. Declared `reversibility:"irreversible"` so
 * the AL7 workflow router routes it to review in session 1 and permits it in session 2
 * after the tailored grant is consumed.
 *
 * This tool is the proof vehicle for the trust-first loop: it provides a concrete,
 * HyperIdle-registered, MCP-exposed irreversible operation that can be exercised
 * deterministically without external credentials. The agent's own session emits
 * the call; HyperIdle classifies, routes, captures, and records — not executes of
 * its own accord (AC12).
 *
 * @lore AL7 Task4: wired BEFORE Tasks 5-11 so all downstream code can reference it.
 * `reversibility:"irreversible"` is the only explicit annotation; everything else in
 * `ALL_TOOL_DEFINITIONS` with no annotation is also classified irreversible (fail-closed).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const commitFileInputSchema = z.object({
	/** Absolute or sandbox-relative path of the file to write. */
	path: z.string().min(1),
	/** Full content to write (overwrites if file exists). */
	content: z.string(),
});

type CommitFileInput = z.infer<typeof commitFileInputSchema>;

async function handler(args: CommitFileInput, ctx: ToolContext): Promise<ToolResult> {
	const { path: filePath, content } = args;

	// Resolve relative paths against the session sandbox
	const resolved = path.isAbsolute(filePath) ? filePath : path.join(ctx.sandboxPath, filePath);

	const dir = path.dirname(resolved);
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(resolved, content, "utf-8");
	} catch (e) {
		return err("WRITE_FAILED", `commit_file: could not write to ${resolved}: ${String(e)}`);
	}

	return ok({ written: resolved, bytes: Buffer.byteLength(content, "utf-8") });
}

export const commitFileTool: ToolDefinition<CommitFileInput> & {
	readonly reversibility: "irreversible";
} = {
	name: "commit_file",
	description:
		"Write content to a file in the session sandbox. Overwrites the file if it already exists. Irreversible — routed to human review before execution.",
	inputSchema: commitFileInputSchema,
	handler,
	reversibility: "irreversible",
};
