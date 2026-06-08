// AE6 — code kind definition.
// Kind: source code diffs or file content produced by an agent.
// Maps from old kind: code_diff

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

const diffLineSchema = z.object({
	kind: z.enum(["add", "del", "ctx"]),
	text: z.string(),
});

const diffHunkSchema = z.object({
	header: z.string(),
	lines: z.array(diffLineSchema),
});

export const codePreviewSchema = z.object({
	kind: z.literal("code"),
	file: z.string(),
	hunks: z.array(diffHunkSchema),
});

export type CodePreview = z.infer<typeof codePreviewSchema>;

export const codeKind: KindDefinition = {
	kind: "code",
	previewSchema: codePreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		const parsed = codePreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		// File path is the display title for code diffs
		return parsed.data.file;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = codePreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { file, hunks } = parsed.data;
		if (hunks.length === 0) return file;
		const adds = hunks.flatMap((h) => h.lines).filter((l) => l.kind === "add").length;
		const dels = hunks.flatMap((h) => h.lines).filter((l) => l.kind === "del").length;
		return `${file} (+${adds} -${dels})`;
	},
};
