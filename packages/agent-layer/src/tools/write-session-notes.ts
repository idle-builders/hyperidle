import * as fs from "node:fs";
import * as path from "node:path";
import { sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const writeSessionNotesInputSchema = z.object({
	notes: z.string().min(1),
	append: z.boolean().optional(),
});

type WriteSessionNotesInput = z.infer<typeof writeSessionNotesInputSchema>;

async function handler(args: WriteSessionNotesInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = writeSessionNotesInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { notes, append } = parsed.data;

	const workDir = path.join(ctx.sandboxPath, "work");
	fs.mkdirSync(workDir, { recursive: true });
	const filePath = path.join(workDir, "session-notes.md");

	let bodyOnDisk = notes;
	if (append && fs.existsSync(filePath)) {
		const existing = fs.readFileSync(filePath, "utf-8");
		bodyOnDisk = `${existing}\n\n${notes}`;
	}
	fs.writeFileSync(filePath, bodyOnDisk, "utf-8");

	// Mirror to DB so the tool is observable in tests without spinning up
	// the file watcher (B4). The watcher's writeback handler is idempotent,
	// so a redundant write from a running watcher is harmless.
	await ctx.db.update(sessions).set({ notes: bodyOnDisk }).where(eq(sessions.id, ctx.sessionId));

	const bytesWritten = Buffer.byteLength(bodyOnDisk, "utf-8");
	return ok({ sessionId: ctx.sessionId, bytesWritten });
}

export const writeSessionNotesTool: ToolDefinition<WriteSessionNotesInput> & {
	readonly reversibility: "reversible";
} = {
	name: "write_session_notes",
	description:
		"Persist session reflections to work/session-notes.md in the agent's workspace. Set append=true to concatenate onto existing notes; default overwrites.",
	inputSchema: writeSessionNotesInputSchema,
	handler,
	/**
	 * AL7: write_session_notes is reversible — it is idempotent session metadata
	 * (sandbox-internal notes file + sessions.notes DB column). Marking it explicitly
	 * reversible prevents the fail-closed default from routing it to review when the
	 * workflow router is active (session 1/2). Session notes are not external state changes.
	 *
	 * @lore AL7 CRITICAL-2: without this annotation, the builtin harness planning turn's
	 * internal `registry.invoke("write_session_notes", ...)` call was incorrectly routed
	 * to review (irreversible default) in workflow sessions, capturing write_session_notes
	 * as a Proposed Call instead of commit_file. This annotation fixes the classification.
	 */
	reversibility: "reversible",
};
