/**
 * Zod discriminated union for ArtifactPreview.
 *
 * Extracted from routes/artifacts.ts so both the HTTP route and the
 * create_artifact skill tool share the same validation schema without
 * circular imports.
 *
 * @lore R6: Previously defined inline in routes/artifacts.ts. Extracted here
 * so the create_artifact skill tool can import it without pulling in the
 * entire Hono router. The route now imports from here too — four references
 * in artifacts.ts (definition, createArtifactSchema, patchPreviewSchema,
 * rowToArtifact) are all satisfied via this re-export.
 */

import z from "zod";

export const artifactPreviewSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("code_diff"),
		file: z.string(),
		hunks: z.array(
			z.object({
				header: z.string(),
				lines: z.array(z.object({ kind: z.enum(["add", "del", "ctx"]), text: z.string() })),
			}),
		),
	}),
	z.object({
		kind: z.literal("deck"),
		slideCount: z.number(),
		firstSlideTitle: z.string(),
	}),
	z.object({
		kind: z.literal("contract"),
		parties: z.array(z.string()),
		title: z.string(),
	}),
	z.object({
		kind: z.literal("dashboard"),
		metrics: z.array(z.object({ label: z.string(), value: z.string() })),
	}),
	z.object({
		kind: z.literal("screenshot"),
		imageUrl: z.string(),
		width: z.number(),
		height: z.number(),
	}),
	z.object({
		kind: z.literal("drafted_email"),
		to: z.array(z.string()),
		subject: z.string(),
		bodyExcerpt: z.string(),
	}),
	z.object({
		kind: z.literal("design"),
		imageUrl: z.string(),
		width: z.number(),
		height: z.number(),
	}),
	z.object({
		kind: z.literal("data_analysis"),
		findings: z.array(z.string()),
	}),
	z.object({
		kind: z.literal("decision"),
		claim: z.string(),
		rationale: z.string(),
	}),
	z.object({
		kind: z.literal("running_service"),
		url: z.string(),
		status: z.enum(["ok", "degraded", "down"]),
		statusLabel: z.string(),
	}),
	z.object({
		kind: z.literal("comm_draft"),
		channel: z.string(),
		firstMessage: z.string(),
	}),
	z.object({
		kind: z.literal("verification"),
		suite: z.string(),
		passed: z.number(),
		failed: z.number(),
	}),
]);
