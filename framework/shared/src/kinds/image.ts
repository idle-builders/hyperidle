// AE6 — image kind definition.
// Kind: visual assets (screenshots, designs, diagrams) produced by an agent.
// Maps from old kinds: screenshot, design

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

export const imagePreviewSchema = z.object({
	kind: z.literal("image"),
	url: z.string().url(),
	width: z.number(),
	height: z.number(),
	alt: z.string().optional(),
});

export type ImagePreview = z.infer<typeof imagePreviewSchema>;

export const imageKind: KindDefinition = {
	kind: "image",
	previewSchema: imagePreviewSchema,

	displayTitle(_preview: unknown): string | null {
		// Images don't have a textual title — fall back to task title.
		return null;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = imagePreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { width, height } = parsed.data;
		return `${width}×${height}`;
	},
};
