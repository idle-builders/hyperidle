// AE6 — data kind definition.
// Kind: structured metrics/tables produced by an agent.
// Maps from old kind: verification (label: test-results), dashboard metrics portion

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

const headlineSchema = z.object({
	label: z.string(),
	value: z.string(),
});

const sparklineSchema = z.object({
	label: z.string(),
	values: z.array(z.number()),
});

export const dataPreviewSchema = z.object({
	kind: z.literal("data"),
	headlines: z.array(headlineSchema),
	rows: z.array(z.record(z.string(), z.string())).optional(),
	charts: z.array(sparklineSchema).optional(),
});

export type DataPreview = z.infer<typeof dataPreviewSchema>;

export const dataKind: KindDefinition = {
	kind: "data",
	previewSchema: dataPreviewSchema,

	displayTitle(_preview: unknown): string | null {
		// Data preview doesn't have a title field.
		return null;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = dataPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { headlines } = parsed.data;
		if (headlines.length === 0) return null;
		return headlines.map((h) => `${h.label}: ${h.value}`).join(" · ");
	},
};
