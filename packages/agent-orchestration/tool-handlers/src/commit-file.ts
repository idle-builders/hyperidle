import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";

const commitFileInputSchema = z.object({
	/** Absolute or sandbox-relative path of the file to write. */
	path: z.string().min(1),
	/** Full content to write (overwrites if file exists). */
	content: z.string(),
});

type CommitFileInput = z.infer<typeof commitFileInputSchema>;

async function handler<TDb>(args: CommitFileInput, ctx: ToolContext<TDb>): Promise<ToolResult> {
	const { path: filePath, content } = args;

	const resolved = path.resolve(
		path.isAbsolute(filePath) ? filePath : path.join(ctx.sandboxPath, filePath),
	);

	const sandboxResolved = path.resolve(ctx.sandboxPath);
	if (!resolved.startsWith(sandboxResolved + path.sep) && resolved !== sandboxResolved) {
		return err(
			"OUTSIDE_SANDBOX",
			`commit_file: resolved path ${resolved} falls outside sandbox ${sandboxResolved}. ` +
				"Use a relative path or a path inside the sandbox directory.",
		);
	}

	const dir = path.dirname(resolved);
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(resolved, content, "utf-8");
	} catch (e) {
		return err("WRITE_FAILED", `commit_file: could not write to ${resolved}: ${String(e)}`);
	}

	return ok({ written: resolved, bytes: Buffer.byteLength(content, "utf-8") });
}

export function createCommitFileTool<TDb>(): ToolDefinition<CommitFileInput, TDb> & {
	readonly reversibility: "irreversible";
} {
	return {
		name: "commit_file",
		description:
			"Write content to a file in the session sandbox. Overwrites the file if it already exists. Irreversible — routed to human review before execution.",
		inputSchema: commitFileInputSchema,
		handler,
		reversibility: "irreversible",
	};
}
