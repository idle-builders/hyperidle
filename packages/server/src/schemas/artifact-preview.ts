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

import { ARTIFACT_KINDS, getKindDefinition } from "@hyperidle/shared";
import z from "zod";

// Build the schemas array at module load time.
// All 6 registered kinds must have a definition — throw if any is missing.
const kindSchemaEntries = ARTIFACT_KINDS.map((kind) => {
	const def = getKindDefinition(kind);
	if (!def) {
		throw new Error(`[AE6] Missing KindDefinition for registered kind: ${kind}`);
	}
	// Each kind's previewSchema is a ZodObject with a `kind` discriminant.
	return def.previewSchema as z.ZodObject<{ kind: z.ZodLiteral<string> }>;
});

// @lore AE6 F3: z.discriminatedUnion takes its options as a TUPLE (typed [A, B, ...]),
// not a plain array — annotate the tuple so TS infers the union; each member carries
// its own literal discriminator prop. We assert the array as the required tuple type:
// 1. We know ARTIFACT_KINDS has exactly 6 members (verified by tests).
// 2. All schemas are ZodObject instances with a `kind` literal discriminant.
// 3. The type assertion is the narrowest possible form — no `any`, just tuple shape.
// The alternative (z.union) loses discriminated-union optimization but is type-safe.
// Given we have exactly 6 known schemas and need the discriminant for error messages,
// we choose the assertion with this documentation.
export const artifactPreviewSchema = z.discriminatedUnion(
	"kind",
	kindSchemaEntries as [
		z.ZodObject<{ kind: z.ZodLiteral<string> }>,
		z.ZodObject<{ kind: z.ZodLiteral<string> }>,
		...z.ZodObject<{ kind: z.ZodLiteral<string> }>[],
	],
);

/**
 * For unregistered kinds: accept any JSON object with a kind field.
 * Used when the artifact's kind is not in the registry (open vocabulary).
 */
export const fallbackPreviewSchema = z
	.object({
		kind: z.string(),
	})
	.passthrough();
