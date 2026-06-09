/**
 * AD8b Task 6 — edit_block tool.
 *
 * Medium-risk tool. Edits the content of a block in a document.
 *
 * @lore AD8b: The blocks table does not exist in the schema yet (no Block
 * persistence primitive in this workpackage). This tool returns "not found"
 * for any blockId until the Block primitive is persisted. The test suite
 * only tests the error path for this tool.
 */

import z from "zod";
import type { AssistantToolResult, AssistantToolShape } from "./assistant-tool-result.js";
import type { ToolContext } from "./tool-registry.js";

const BLOCK_HOST_KINDS = ["bet", "task", "knowledge_item", "artifact", "agent"] as const;

const editBlockInputSchema = z.object({
	blockId: z.string().min(1),
	hostKind: z.enum(BLOCK_HOST_KINDS),
	hostId: z.string().min(1),
	content: z.string().min(1).max(65_536),
});

type EditBlockInput = z.infer<typeof editBlockInputSchema>;

async function handler(
	args: EditBlockInput,
	_ctx: ToolContext,
): Promise<AssistantToolResult<{ blockId: string }>> {
	const parsed = editBlockInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}

	// @lore AD8b: Block persistence is not yet implemented. The Block primitive
	// lives in-memory (derived from content at render time). A dedicated block
	// persistence story will add the DB table and update this tool. Until then,
	// edit_block always returns "not found" for any blockId.
	return {
		status: "error",
		message: `Block not found: ${args.blockId}. Block persistence is not yet implemented.`,
	};
}

export const editBlockTool: AssistantToolShape<EditBlockInput> = {
	name: "edit_block",
	description: "Edit the content of a block in a document by blockId, hostKind, and hostId.",
	inputSchema: editBlockInputSchema,
	handler,
};
