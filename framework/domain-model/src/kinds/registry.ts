// AE6 — the Kind Definition contract, the six fundamental kinds, and the registry that binds them.
//
// framework/domain-model holds schema + display logic (no React dependency); the renderer components live
// in layers/core-ui/src/kinds/.
//
// @lore AU34: the contract and the six definitions used to be seven modules beside this one. Nothing
// outside this package ever reached any of them — the registry was their only reader — so they were
// folded in rather than carried across the split as modules with no consumer outside their package.
// Adding a kind is still one schema, one definition and one REGISTRY entry; it is now one file.

import z from "zod";

/**
 * @lore AE6: The KindDefinition interface is the extension point for new artifact content types. It
 * binds a kind string to its preview schema and display functions.
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

// ── text: prose/markdown content produced by an agent ────────────────────────
// Maps from old kinds: contract, drafted_email, decision, data_analysis, comm_draft

export const textPreviewSchema = z.object({
	kind: z.literal("text"),
	body: z.string(),
	format: z.enum(["markdown", "plain"]).optional(),
});

export type TextPreview = z.infer<typeof textPreviewSchema>;

export const textKind: KindDefinition = {
	kind: "text",
	previewSchema: textPreviewSchema,

	displayTitle(preview: unknown): string | null {
		if (!preview || typeof preview !== "object") return null;
		// No standard title field in text preview — caller falls back to task title.
		return null;
	},

	summarize(preview: unknown): string | null {
		if (!preview) return null;
		const parsed = textPreviewSchema.safeParse(preview);
		if (!parsed.success) return null;
		const { body } = parsed.data;
		// First 120 chars of the body as summary
		const trimmed = body.trim();
		if (trimmed.length === 0) return null;
		return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
	},
};

// ── code: the source text of one version of a file ───────────────────────────
//
// @lore AM5 K0: PURIFIED from {kind:"code", file, hunks} — a diff baked into a content shape. The
// diff belongs to the Review composition (built from two code instances); the pure code content is
// the source text of one version of a file, not a change-set. Pre-alpha purge (K4b): no migration,
// no back-compat. The diff delta (`DiffHunk`, `DiffLine`) lives in
// framework/design-system/src/diff/code-delta-renderer.tsx and
// layers/core-ui/src/pages/review/review-artifact.ts.

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

// ── image: visual assets (screenshots, designs, diagrams) ────────────────────
// Maps from old kinds: screenshot, design

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

// ── data: structured metrics/tables ──────────────────────────────────────────
// Maps from old kind: verification (label: test-results), dashboard metrics portion

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

// ── html: rich rendered content (dashboards, charts, visualizations) ─────────
// Maps from old kinds: deck (label: deck), dashboard (label: dashboard)

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

// ── url: references to external resources (deployed services, PRs) ───────────
// Maps from old kind: running_service (label: service)

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

// ── the registry ─────────────────────────────────────────────────────────────

/** Closed set of registered kind strings. Used for z.enum validation at the wire boundary. */
export const ARTIFACT_KINDS = ["text", "code", "image", "data", "html", "url"] as const;

/** Narrowed kind string type. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * @lore AE6: Registry is a Map rather than auto-discovered import.meta.glob
 * because import.meta.glob is Vite-specific and doesn't work in the Node server.
 * Adding a new kind = one preview schema, one definition, and one entry here.
 * This is "configuration" not "core logic" — same pattern as adding a Hono route.
 */
const REGISTRY: ReadonlyMap<string, KindDefinition> = new Map([
	[textKind.kind, textKind],
	[codeKind.kind, codeKind],
	[imageKind.kind, imageKind],
	[dataKind.kind, dataKind],
	[htmlKind.kind, htmlKind],
	[urlKind.kind, urlKind],
]);

/**
 * Look up a Kind Definition by kind string.
 * Returns undefined for unregistered kinds (caller renders fallback).
 */
export function getKindDefinition(kind: string): KindDefinition | undefined {
	return REGISTRY.get(kind);
}

/**
 * Check if a kind string is registered.
 * Type guard: narrows to ArtifactKind when true.
 */
export function isRegisteredKind(kind: string): kind is string {
	return REGISTRY.has(kind);
}
