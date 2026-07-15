import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";

const writeSessionNotesInputSchema = z.object({
	notes: z.string().min(1),
	append: z.boolean().optional(),
});

type WriteSessionNotesInput = z.infer<typeof writeSessionNotesInputSchema>;

/**
 * @lore AU19 Increment 4: `sessions` is `UNOWNED_SHARED_TABLES` (genuinely
 * cross-cutting, no single domain owner — `scripts/table-ownership-guard.ts`)
 * — direct `@hyperidle/db` access is legal here, no port needed. Typed
 * concretely against `HyperIdleDb` (not the generic `TDb` the other tool
 * files in this package use) since it touches the table directly.
 */
async function handler(
	args: WriteSessionNotesInput,
	ctx: ToolContext<HyperIdleDb>,
): Promise<ToolResult> {
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

	await ctx.db.update(sessions).set({ notes: bodyOnDisk }).where(eq(sessions.id, ctx.sessionId));

	const bytesWritten = Buffer.byteLength(bodyOnDisk, "utf-8");
	return ok({ sessionId: ctx.sessionId, bytesWritten });
}

export function createWriteSessionNotesTool(): ToolDefinition<
	WriteSessionNotesInput,
	HyperIdleDb
> & {
	readonly reversibility: "reversible";
} {
	return {
		name: "write_session_notes",
		description:
			"Persist session reflections to work/session-notes.md in the agent's workspace. Set append=true to concatenate onto existing notes; default overwrites.",
		inputSchema: writeSessionNotesInputSchema,
		handler,
		reversibility: "reversible",
	};
}
