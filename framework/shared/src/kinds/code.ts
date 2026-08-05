// AM5 — code kind definition (PURIFIED, K0/K4/K4b).
//
// PURIFIED from {kind:"code", file, hunks} (a diff-shaped schema — K0 violation)
// to the pure content shape {kind:"code", path, lang, text}.
//
// @lore AM5 K0: `{file, hunks}` was a diff baked into a content shape — the diff
// belongs to the Review composition (built from two code instances). The pure
// code content is the source text of one version of a file, not a change-set.
// Pre-alpha purge (K4b): no migration, no back-compat. The old normalization
// branch in artifacts.ts is DELETED (not kept). OLD_KIND_MAP stays unchanged.
//
// The diff delta (`DiffHunk`, `DiffLine`) lives in:
//   framework/design-system/src/diff/code-delta-renderer.tsx (the DS diff core)
//   layers/web/src/pages/review/review-artifact.ts (the review chrome types)

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

export const codePreviewSchema = z.object({
	kind: z.literal("code"),
	path: z.string(),
	lang: z.string().nullable(),
	text: z.string(),
});

export type CodePreview = z.infer<typeof codePreviewSchema>;

export const codeKind: KindDefinition = {
	kind: "code",
	previewSchema: codePreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		const parsed = codePreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		// File path is the display title for code content
		return parsed.data.path;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = codePreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { path, text } = parsed.data;
		// First line of the code content as summary (or just the path)
		const firstLine = text.split("\n")[0]?.trim();
		if (firstLine) return `${path}: ${firstLine.slice(0, 60)}`;
		return path;
	},
};
