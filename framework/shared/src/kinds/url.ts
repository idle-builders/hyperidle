// AE6 — url kind definition.
// Kind: references to external resources (deployed services, PRs) produced by an agent.
// Maps from old kind: running_service (label: service)

import z from "zod";
import type { KindDefinition } from "./kind-definition.js";

export const urlPreviewSchema = z.object({
	kind: z.literal("url"),
	url: z.string().url(),
	status: z.enum(["ok", "degraded", "down"]).optional(),
	statusLabel: z.string().optional(),
});

export type UrlPreview = z.infer<typeof urlPreviewSchema>;

export const urlKind: KindDefinition = {
	kind: "url",
	previewSchema: urlPreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		const parsed = urlPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		// URL itself can serve as display title
		return parsed.data.url;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = urlPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { url, statusLabel, status } = parsed.data;
		if (statusLabel) return `${url} — ${statusLabel}`;
		if (status) return `${url} — ${status}`;
		return url;
	},
};
