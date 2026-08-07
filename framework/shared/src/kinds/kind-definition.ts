// AE6 — Kind Definition interface.
// The contract every Kind Definition module exports.
// framework/shared holds schema + display logic (no React dependency).
// layers/core-ui holds the renderer component.

import type { z } from "zod";

/**
 * @lore AE6: The KindDefinition interface is the extension point for new artifact
 * content types. It binds a kind string to its preview schema and display functions.
 * framework/shared holds this contract — no React imports here.
 * The renderer component lives in layers/core-ui/src/kinds/.
 */
export interface KindDefinition {
	/** The kind string this definition handles. Lowercase snake_case. */
	readonly kind: string;
	/** Zod schema for the kind's preview data. Must include a `kind` discriminant. */
	readonly previewSchema: z.ZodTypeAny;
	/** Extract a display title from preview data, or null to fall back to task title. */
	readonly displayTitle: (preview: unknown) => string | null;
	/** One-line summary of preview data, or null if no meaningful summary. */
	readonly summarize: (preview: unknown) => string | null;
}
