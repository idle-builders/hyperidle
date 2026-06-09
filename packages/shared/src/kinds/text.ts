// AE6 — text kind definition.
// Kind: prose/markdown content produced by an agent.
// Maps from old kinds: contract, drafted_email, decision, data_analysis, comm_draft

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

export const textPreviewSchema = z.object({
	kind: z.literal("text"),
	body: z.string(),
	format: z.enum(["markdown", "plain"]).optional(),
});

export type TextPreview = z.infer<typeof textPreviewSchema>;

export const textKind: KindDefinition = {
	kind: "text",
	previewSchema: textPreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		// No standard title field in text preview — caller falls back to task title.
		return null;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = textPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { body } = parsed.data;
		// First 120 chars of the body as summary
		const trimmed = body.trim();
		if (trimmed.length === 0) return null;
		return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
	},
};
