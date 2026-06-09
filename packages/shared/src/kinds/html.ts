// AE6 — html kind definition.
// Kind: rich rendered content (dashboards, charts, visualizations) produced by an agent.
// Maps from old kinds: deck (label: deck), dashboard (label: dashboard)

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

export const htmlPreviewSchema = z.object({
	kind: z.literal("html"),
	html: z.string(),
	title: z.string().optional(),
});

export type HtmlPreview = z.infer<typeof htmlPreviewSchema>;

export const htmlKind: KindDefinition = {
	kind: "html",
	previewSchema: htmlPreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		const parsed = htmlPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		return parsed.data.title ?? null;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = htmlPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		if (parsed.data.title) return parsed.data.title;
		// Approximate character count as summary
		const len = parsed.data.html.length;
		return `HTML preview (${len} chars)`;
	},
};
