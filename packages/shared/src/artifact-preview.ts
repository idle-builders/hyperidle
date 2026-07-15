/**
 * AE6 — Zod validation schema for ArtifactPreview.
 *
 * Composes the preview schema from all 6 registered Kind Definitions.
 * Each Kind Definition provides its own Zod schema for its preview data.
 *
 * @lore R6: Previously defined inline as a 12-member discriminated union.
 *   Extracted to separate file so routes and skill tool share the same schema.
 * @lore AE6: Now composed from Kind Definitions instead of hardcoded inline.
 *   This means adding a new kind only requires creating a Kind Definition module
 *   and adding it to the registry — not editing this file.
 * @lore AE6 F3: Zod's discriminatedUnion requires a tuple type argument, not a
 *   plain array. We use a type assertion here because the kinds are registered
 *   at module load time and correctness is verified by tests.
 *   The cast is safe: all 6 schemas are ZodObject instances with a `kind` discriminant.
 *   Documented per the "no any without @lore" rule.
 */

import z from "zod";
import { ARTIFACT_KINDS, getKindDefinition } from "./kinds/registry.js";
import type { ArtifactPreview } from "./types/artifact.js";

// Build the schemas array at module load time.
// All registered kinds must have a definition — throw if any is missing.
for (const kind of ARTIFACT_KINDS) {
	const def = getKindDefinition(kind);
	if (!def) {
		throw new Error(`[AE6] Missing KindDefinition for registered kind: ${kind}`);
	}
}

// @lore AU7: Avoid z.discriminatedUnion here. Server imports this schema during
// server boot, while kind definitions are supplied by shared package schemas;
// eager discriminated-union construction can reject mixed Zod internals before any
// request is handled. z.custom also breaks tool JSON-schema generation. A plain
// union keeps per-kind validation while remaining representable as tool JSON schema.
const previewSchemas = ARTIFACT_KINDS.map((kind) => getKindDefinition(kind)?.previewSchema).filter(
	(schema): schema is z.ZodTypeAny => Boolean(schema),
) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];

export const artifactPreviewSchema = z.union(previewSchemas) as z.ZodType<ArtifactPreview>;

/**
 * For unregistered kinds: accept any JSON object with a kind field.
 * Used when the artifact's kind is not in the registry (open vocabulary).
 */
export const fallbackPreviewSchema = z
	.object({
		kind: z.string(),
	})
	.passthrough();
